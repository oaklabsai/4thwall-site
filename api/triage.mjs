// Vesta Conversational Triage — the LLM front door to the match walk.
// Spec: 4thwall-wiki/business/vesta-conversational-triage.md (⭐ LOCKED INTERFACE is authoritative).
//
// THE ARCHITECTURE LINE: the model interprets, the bank stays the authority. The model
// returns {say, ask, chips, mode, resolved}; every `resolved` is re-validated against the
// LIVE job bank (vesta_match_options — the same table the app's triageEnter walk reads)
// before anything reaches the client. Hallucinated trades/jobs are structurally impossible:
// an unknown pair is nulled and the conversation continues, never a dead end.
//
// STREAMING (v1, per spec): the model is called with stream:true; the conversational `say`
// string is extracted incrementally from the JSON as it generates and forwarded as SSE
// deltas, so the wait reads as Vesta thinking. The resolve/deck decision rides only on the
// final event, after the full JSON is parsed and bank-validated.
//   data: {"t":"d","c":"text chunk"}                      — say delta
//   data: {"t":"f","say","ask","chips","mode","resolved","deck"} — final, validated
//   data: {"t":"e","error":"..."}                          — failure → client falls to the tap-tree
//
// KEYS: NVIDIA_TRIAGE_KEY_1..5 (Vercel env, Production+Preview). Never logged, never echoed.
// NVIDIA keys are account-level, not model-scoped — every key in the pool works with
// whichever MODEL is active, so all keys rotate together regardless of which model is primary.
// Rotation is FAILURE-based (401/429/5xx, no first token by the ceiling) — never latency-based;
// normal model slowness is absorbed by the stream, not punished (spec: the 2.5s rule is retired).
// Kill switch: set TRIAGE_OFF=1 → GET returns 503 and the client never offers the conversation.

// Nemotron-3-super promoted to DEFAULT 2026-07-07 — proven more responsive than GLM 5.2 across
// 3 separate congestion windows this week. GLM remains available via TRIAGE_MODEL override.
// SECOND-MODEL FALLBACK (activated 2026-07-07, was considered-and-deferred in the spec): a live
// Nemotron brownout (generations dying at 1 char, all keys, mid-testing) met the spec's own
// activation bar — "don't build it until a real outage shows the tap-tree handoff losing people."
// GLM 5.2 is the fully-design-loop-validated original primary; it runs the same prompt + bank
// gate. Chain: primary → fallback → tap-tree (the client's deterministic floor).
const MODEL = process.env.TRIAGE_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
const MODEL_FALLBACK = process.env.TRIAGE_MODEL_FALLBACK || 'z-ai/glm-5.2';
const MODELS = MODEL_FALLBACK && MODEL_FALLBACK !== MODEL ? [MODEL, MODEL_FALLBACK] : [MODEL];
const isNemotron = m => /nemotron/.test(m);
const IS_NEMOTRON = isNemotron(MODEL);
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const FIRST_TOKEN_CEILING_MS = 20000;  // no first byte by then → this key has failed, rotate
const TOTAL_CEILING_MS = 55000;        // hard stop under the function's 60s maxDuration

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

function loadKeys(){
  const keys = [];
  for (let i = 1; i <= 5; i++){
    // both naming schemes: NVIDIA_TRIAGE_KEY_N (the documented contract) and nvidiakeyN
    // (how the vars actually exist in Vercel — the operator's convention, honored)
    const v = process.env['NVIDIA_TRIAGE_KEY_' + i] || process.env['nvidiakey' + i];
    if (v && v.startsWith('nvapi-')) keys.push(v);
  }
  return keys;
}

// ── the LIVE bank (vesta_match_options → the same source the app's walk reads) ──
// DB trade key → app trade key, mirroring vesta-app.html's TRADE_APP.
const TRADE_APP = { roofing:'roofing', hvac:'hvac', plumbing:'plumbing', electrical:'electrical', paving:'paving', lawn_care:'lawn', painting:'painting', masonry:'masonry', tree_service:'tree', flooring:'flooring', windows_doors:'windows_doors', pool:'pool' };
const TRADE_LABEL = { roofing:'Roofing', hvac:'HVAC', plumbing:'Plumbing', electrical:'Electrical', paving:'Paving', lawn:'Lawn & landscaping', painting:'Painting', masonry:'Masonry', tree:'Tree service', flooring:'Flooring', windows_doors:'Windows & doors', pool:'Pool' };
const isEmergencyJob = v => /emergency/.test(v); // the app's own rule (vesta-app.html: emergency-tagged jobs auto-skip Q2)

let _bank = null, _bankAt = 0;
const BANK_TTL_MS = 10 * 60 * 1000;
async function getBank(){
  if (_bank && Date.now() - _bankAt < BANK_TTL_MS) return _bank;
  const r = await fetch(`${DB_BASE}/rest/v1/vesta_match_options?select=trade,value,is_priority,firms,trade_n&is_priority=eq.false`, {
    headers: { apikey: DB_KEY }, signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) { if (_bank) return _bank; throw new Error(`bank fetch ${r.status}`); } // stale beats dead
  const rows = await r.json();
  const bank = {};
  for (const row of rows){
    const app = TRADE_APP[row.trade] || row.trade;
    (bank[app] = bank[app] || []).push({
      job: row.value,
      emergency: isEmergencyJob(row.value),
      pct: row.trade_n ? Math.round(100 * (row.firms || 0) / row.trade_n) : 0,
    });
  }
  _bank = bank; _bankAt = Date.now();
  return bank;
}
// Trade synonyms models actually emit that the prefix match below can't catch — a reject
// must mean a WRONG answer, not the model's plain-English word for the right one. Only
// unambiguous mappings live here (concrete/driveway → paving is real: the paving bank
// carries the concrete jobs; "doors" alone can't prefix-match "windows_doors").
const TRADE_ALIAS = { landscaping:'lawn', landscape:'lawn', landscaper:'lawn', lawncare:'lawn',
  arborist:'tree', doors:'windows_doors', door:'windows_doors', concrete:'paving', driveway:'paving' };
export function bankValidate(bank, trade, job){
  // trade normalization — models emit near-ids under pressure ("plumber", "Plumbing ").
  // A reject must mean a WRONG answer, not a spelling of the right one.
  trade = String(trade || '').toLowerCase().trim();
  if (TRADE_ALIAS[trade]) trade = TRADE_ALIAS[trade];
  if (!bank[trade]){
    const t = Object.keys(bank).find(k => k.startsWith(trade.slice(0, 5)) || trade.startsWith(k.slice(0, 5)));
    if (t) trade = t;
  }
  const jobs = bank[trade]; if (!jobs) return null;
  // normalize before rejecting: models copy the prompt's "*" emergency marker into the id
  // (Nemotron does — caught 2026-07-07). A reject must mean a WRONG answer, not a format quirk.
  const clean = String(job || '').replace(/\*+$/,'').trim().toLowerCase().replace(/[\s_]+/g,'-');
  let row = jobs.find(j => j.job === clean);
  // Near-miss rescue: the model names the RIGHT job in its own words ("emergency leak repair"
  // for "emergency-leak-or-burst" — caught live 7/7). Two+ shared meaningful tokens with a
  // single best candidate is that intent; an exact-match-only gate was discarding it.
  if (!row){
    const toks = new Set(clean.split('-').filter(w => w.length > 2));
    let best = null, bestN = 0, tie = false;
    for (const j of jobs){
      const n = j.job.split('-').filter(w => w.length > 2).reduce((s, w) => s + (toks.has(w) ? 1 : 0), 0);
      if (n > bestN){ best = j; bestN = n; tie = false; } else if (n === bestN && n > 0) tie = true;
    }
    if (bestN >= 2 && !tie) row = best;
  }
  if (!row) return null;
  const label = row.job.replace(/-/g,' ');
  return { trade, job: row.job, label, emergency: row.emergency, pct: row.pct, tradeLabel: TRADE_LABEL[trade] || trade };
}

// ── the resolver: a single-task second opinion, structurally immune to interview drift ──
// The conversational model (Nemotron) keeps asking past its question budget no matter how
// the prompt is worded (proven 2026-07-07: TURN PRESSURE ignored ~half the time). Duty
// separation fixes what prompt pressure can't: when the talker fails to resolve past the
// budget, this tiny one-job prompt reads the same conversation and names the (trade, job).
function resolverPrompt(bank){
  const bankLines = Object.entries(bank)
    .map(([t, jobs]) => `${t}: ` + jobs.map(j => j.job + (j.emergency ? '*' : '')).join(', '))
    .join('\n');
  return `You are a triage resolver. Read the homeowner conversation and output ONLY one JSON object: {"trade": string, "job": string} — the single best match, both ids copied VERBATIM from this bank (a * marks an emergency job; the * is never part of the id):
${bankLines}
Rules: pick the closest job even if details are unconfirmed (best read beats no read; a pro confirms on site). A * emergency job ONLY for active danger or damage happening right now (water actively flowing, sparking, gas, no heat in freezing weather) — a stain, a noise, dampness, or anything being monitored takes the ROUTINE job, never the * one. If and ONLY if the conversation gives no usable signal about any trade, output {"trade": null, "job": null}. No prose, no markdown — the JSON object only.`;
}

// ── the intake writer: a second single-task duty (Rung 1 — conversational intake). Reads
// the same conversation and returns the homeowner's OWN description of the work — EXTRACTIVE,
// never composed. Same architecture line as the resolver: one job, no interview authority,
// no bank needed. Two outputs: {work} (their words, lightly cleaned) or {insufficient:true}
// (they never described the problem themselves — only tapped options / one-word answers).
// The garble bug (4thwall-wiki/business/vesta-project-briefs.md § garble-bug fix) was the old
// prompt COMPOSING a 40-80-word first-person narrative from a Q&A ramble — inventing the
// connective tissue → a request the homeowner never wrote. The fix is extraction, not
// synthesis: pull their sentences or return insufficient. On an outage the client keeps its
// own floor (raw words verbatim), so a failure here never blocks a send.
function writeupPrompt(){
  return `You are an intake writer for a home-services request. Read the conversation and return the homeowner's OWN description of what they need — EXTRACTIVE, not composed.

Output ONLY one JSON object, exactly one of:
{"work": string}       — the homeowner's request in THEIR OWN WORDS
{"insufficient": true} — the homeowner never described the problem themselves

Rules for "work":
- Use ONLY words and phrases the homeowner actually typed. You may drop filler, join their fragments into plain sentences, and fix obvious typos — nothing more.
- Do NOT add facts, diagnosis, causes, measurements, urgency, or any detail they did not say. Do NOT write in a first-person voice they didn't use, and do NOT pad to a word count. If they gave one real sentence about the problem, that sentence — lightly cleaned — IS the work. Short is correct.

Return {"insufficient": true} when the homeowner only tapped options, gave one-word or yes/no answers, greeted ("hey", "hi"), or otherwise never stated the problem in their own words. When torn between composing something and returning insufficient, return insufficient — a blank the homeowner fills beats a sentence they didn't write.

No prose, no markdown. The JSON object only.`;
}

// Extractive-fidelity gate — the garble backstop. The writeup must be the homeowner's OWN
// words, so most of its content words must actually appear in the user's turns. A composed
// narrative reuses a few nouns and invents the rest → high novelty → reject to insufficient
// (an empty card the homeowner fills beats a sentence they didn't write). Stem-tolerant
// (4-char prefix) so a legitimate plural/tense shift ("brick"→"bricks") isn't counted as
// invention. Short extractions (<6 content words) are trusted — the prompt already gated them.
export function extractiveOK(work, messages){
  const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stem = w => w.slice(0, 4);
  const userStems = new Set(words(messages.filter(m => m.role === 'user').map(m => m.content).join(' ')).map(stem));
  const content = words(work).filter(w => w.length > 3);
  if (content.length < 6) return true;
  const novel = content.filter(w => !userStems.has(stem(w))).length;
  return novel / content.length <= 0.5;
}

// ── the system prompt (mirrors the locked prototype; bank injected live) ──
function systemPrompt(bank, model, followUp, userTurns, focusMode){
  const bankLines = Object.entries(bank)
    .map(([t, jobs]) => `${t}: ` + jobs.map(j => j.job + (j.emergency ? '*' : '')).join(', '))
    .join('\n');
  return `You are Vesta — a calm, knowledgeable guide who helps a homeowner in Fairfield County figure out which kind of contractor they need. You are NOT a chatbot; you run a short, warm triage interview and hand off to Vesta's matched picks.

YOUR JOB: convert the homeowner's words into ONE (trade, job) from the bank below, in as few turns as possible.

THE BANK (trade: job-ids; a * means it is an emergency job — the * is a MARKER, never part of the id):
${bankLines}

RULES:
- Reply ONLY with a JSON object, no prose around it:
  {"say": string, "ask": string|null, "chips": string[]|null, "mode": "emergency"|"fix"|"plan"|"learn", "resolved": {"trade","job","urgency":"emergency"|"routine"}|null}
- "say": warm and genuinely helpful, UNDER 55 WORDS — teach, don't just acknowledge. Weave in what the symptom USUALLY indicates and how urgent it is. You may add ONE practical "in the meantime" note when it helps (especially safety: shut the water off at the valve, don't touch a sparking outlet, leave if you smell gas). THE BALANCE: as useful as a knowledgeable neighbor who's seen this before — but never REDLINING. Redlining = a definitive diagnosis, step-by-step repair instructions, or any price/timeline promise. Stay hedged ("usually", "often", "likely") and land on a pro assessing it.
- STRUCTURE inside "say" (use real \\n newlines in the JSON string): when you have 2+ distinct FACTS or safety steps, break them into "- " dash bullets (max 4, each under 12 words) after a one-line lead; you may bold ONE key phrase per message with **…**. BULLETS ARE NEVER QUESTIONS — your one question lives in "ask" (with chips), nowhere else. A single-thought reply stays one short paragraph. Structure is for teaching, not for interviewing.
- "mode": classify the conversation every turn.
  emergency = danger or active damage right now. Resolve in ONE turn.
  fix = something is wrong but not urgent. The core triage case.
  plan = a future project ("this spring", "thinking about", "getting quotes"). NEVER ask urgency questions. Once the job is known, RESOLVE — do not gather scope details (size, length, material, brand, budget, timing); those are the pro's questions, not yours. Your final "say" is patient and no-pressure — they're early, and that's fine.
  learn = they're asking a question, not hiring ("is this normal?", "what does this usually involve?"). Answer genuinely within the redlining rules, keep resolved null, and END your "say" with a soft offer to line up the right pros whenever they're ready. If they take you up on it, the mode becomes fix or plan.
- WHEN TO ASK vs RESOLVE — run this test before every "ask": would the answer change the trade, the job, or the urgency? If not, do NOT ask — resolve to your best read. When the homeowner has already NAMED the job ("replace my whole roof", "redo the driveway", "repaint the living room"), that IS the job — resolve it immediately; asking why they want it is friction, not triage. Size, length, square footage, material, brand, color, budget, and timing NEVER change the (trade, job) — never ask about them. If two jobs route to the same kind of pro anyway, pick the closer one and resolve. HARD CAP: 3 questions per conversation; at the cap, resolve to your best read or offer a final two-option chip choice.
- "ask": ONE short discriminating question if you are not yet sure which trade/job — else null. NEVER a diagnostic a pro would run on site (soft floors, flush tests, breaker flips, pressure checks) — once the trade and job are clear, those belong to the pro's visit, and your move is to RESOLVE.
- "chips": 2-4 short tappable answers to your "ask" (2-5 words each, PARALLEL in form — same grammatical shape, e.g. ["Under a bathroom","Under the roofline"]) — else null. When you offer chips, your "say" must make clear WHY these particular options are the ones that matter — the expert distinction they draw out (e.g. "where the stain sits is what separates a roof leak from a plumbing leak, so it points me to the right pro"). Tailored, expert reasoning is what Vesta is known for; never offer bare options without the thinking behind them.
- "resolved": fill ONLY when you are confident of a real (trade, job) from the bank. Use the EXACT job-id (no *). Set urgency "emergency" for * jobs or clear emergency language. When resolved, "say" is your final reassuring line and "ask"/"chips" must be null.
- Emergencies (active leak, burst pipe, sparking, no heat in winter): mode "emergency", resolve in ONE turn, do not ask extra questions.
- Ambiguous water-from-ceiling (a stain, dampness — NOT actively flowing): ask whether it's under a bathroom/plumbing or under the roofline BEFORE resolving. But if they already SAID where it is ("under the upstairs bathroom", "top-floor ceiling under the roof"), that ambiguity is ANSWERED — resolve NOW; which fixture it's under never changes the (trade, job).
- If the input is off-topic or not a home problem: gently redirect once in "say", resolved null.
- PRESENCE — how Vesta feels alive (applies every turn, every mode):
  - React to the PERSON before the problem: pick up their exact words (mirror one short phrase of theirs, naturally), and match their energy — terse gets crisp, stressed gets steady and warm, excited gets excited. Never open two consecutive turns with the same word or stock phrase.
  - CARRY THE THREAD: any detail they've given (a name, the cedar roof, the 1950s house, the toddler, "we just moved in") is yours to remember and reuse later without being re-told. Re-asking ANYTHING already answered is the single most robotic move — never do it.
  - Every turn ends with ownership, never a dead end: either your one question, or what happens next ("I'll line up the right pros for exactly this"). The homeowner should never wonder what to do with your answer.
- MULTI-TRADE PROJECTS: when the described work genuinely spans trades (a backyard remodel = masonry + landscaping; a basement finish = framing + electrical + flooring), do NOT cram it into one job. Name the phases in the order a good GC would sequence them (that ordering IS expert value), then resolve the FIRST phase's (trade, job) from the bank this turn and say you'll line up the next trade the moment they're ready for it. Each later phase is its own fresh resolve when they say go.
- Never mention firm names, ratings, or counts. You route to matches; you don't list them.
- YOU ARE THE MATCHING SERVICE. Filling "resolved" is literally how the homeowner gets their vetted local pros — one tap away. NEVER tell them to search Google, Angie's List, Yelp, or "local directories", never explain how to find a contractor elsewhere, and never quote dollar amounts. If they accept an offer of help ("yes", "sure", "please do") or ask you to find someone, that IS the moment: fill "resolved" with your best (trade, job) THIS TURN.`
  + (followUp ? `

FOLLOW-UP MODE — ACTIVE NOW: the homeowner has already been matched and is LOOKING AT the picks in the history's "picks" array. Each pick carries REAL reasoning material — use it:
- "slot_earned_because": the shortlist is a deliberate COMPOSITION, not a top-3 — one pick for the strongest proven record, one because this job is the core of their record (not one line of many), one because homeowners' own reviews of them describe exactly this work. When asked "why these three," EXPLAIN THAT COMPOSITION per firm — never a generic "they all do this job and review well."
- "vestas_read": an excerpt of Vesta's own read of the firm — its character, what its reputation actually answers. Quote or paraphrase it when explaining a pick; this is the depth a directory can't give.
- "record" + "known_for": the firm's verifiable facts and recurring themes. Ground every claim in these fields.
- "More options?" → the "See all your matches" button under the picks opens every match ("more_matches" = how many more).
- HARD RULE: you have NO pricing, availability, or schedule data on any firm — asked "which is cheapest/best value/fastest," the ONLY honest answer is that Vesta's record doesn't rank them on that, plus the smart move (ask each for an itemized quote and compare line by line). Claiming a firm is "competitive on price" or "quick to schedule" is fabrication and forbidden.
- Keep "resolved" null for anything about the already-matched problem. Fill it ONLY for a genuinely NEW problem (different system/job), which is a fresh triage. Never re-interview the matched problem; never echo history bookkeeping.
- MULTI-PHASE CONTINUATION: if this conversation laid out a multi-trade project, the next phase is EXPECTED business, not a new interview — when they're ready for it ("ok now the patio", "what about the wiring"), resolve that phase's (trade, job) directly, carrying everything already known. Sequence it like a GC; never make them re-describe the project.
- OWN THE HANDOFF: when they signal a pick or ask you to reach out, that's a YES — say you'll write the request up and it goes out the moment they tap Send. Never leave them holding the next step you could carry.
- LENGTH & SHAPE here: under 90 words. Explaining the picks = a one-line lead, then one "- " dash bullet PER FIRM (name + the reason its slot was earned), separated by \\n. Anything else = one tight paragraph.` : '')
  + (focusMode ? `

FIRM IN VIEW — the homeowner opened Ask Vesta while looking at ONE firm's profile; its details are in the history's "focus" object. This is AMBIENT CONTEXT, NOT a cage: you are FULL Vesta here. Answer whatever they actually ask — discuss this firm, compare it, weigh it against the field, run a normal triage, or handle something unrelated. NEVER force the conversation to stay about this one firm; follow the homeowner.
- "name": the firm in view. You MAY name and discuss THIS firm freely. When you speak about it, ground every claim in its fields below — never invent a capability, specialty, or outcome that isn't here. (You still don't recite OTHER firms by name in prose — when they want options, you RESOLVE and the matched picks appear as a deck.)
- "vestas_read" / "known_for" / "record": Vesta's own read + the firm's verifiable themes and facts. Quote or paraphrase the read — it's the depth a directory can't give. If the read doesn't cover what they asked, say so plainly rather than fabricate.
- HARD RULE: you have NO pricing, availability, or schedule data on any firm — asked "cheap / fast / available," the ONLY honest answer is that Vesta's record doesn't cover it (tell them to ask for an itemized quote). Claiming "competitive on price" or "quick to schedule" is fabrication and forbidden.
- If they ask you to find pros, compare options, or turn to a new need, RESOLVE normally — fill "resolved" with a real (trade, job) from THE BANK. The firm in view never restricts what you can match; a "top 5 masonry" or "find me pros" request is a normal resolve, not a reason to stay narrow.
- LENGTH & SHAPE: under 80 words. A tight paragraph, or a one-line lead + up to 3 "- " dash bullets for distinct facts.` : '')
  + (!followUp && !focusMode && userTurns >= 2 ? `

TURN PRESSURE — YOUR QUESTION BUDGET IS SPENT: the homeowner has already answered ${userTurns - 1} message(s). Unless you genuinely cannot name the TRADE, you MUST fill "resolved" THIS TURN — and "trade" and "job" MUST be ids copied VERBATIM from THE BANK above (never invented labels like "plumber" or "toilet repair"). Asking anything more — a fixture detail, a diagnostic, a confirmation — is a rule violation now. Your best read beats another question; the pro confirms specifics on site.` : '')
  + `

OUTPUT CONTRACT: your ENTIRE reply is exactly ONE JSON object matching the schema in the RULES. No prose before or after it, no markdown fences, no bullet lists outside JSON strings. Anything you want to tell the homeowner goes INSIDE "say"; any question goes INSIDE "ask". If you notice yourself writing plain prose, stop and emit the JSON instead.`
  + (isNemotron(model) ? `

EMERGENCY COMMITMENT — THIS RULE OUTRANKS EVERY OTHER RULE:
When the situation is an active emergency (water actively flowing/pouring, burst pipe, sewage backing up, sparking or burning smell, gas smell, no heat in freezing weather), you MUST fill "resolved" THIS TURN with your best (trade, job) from the bank, "ask" and "chips" null. Asking ANY question during an active emergency is a failure — the homeowner needs a pro dispatched, not an interview. You do not need certainty; you need the best read. Commit — in ONE JSON object, resolved filled. The pro confirms the rest on site.` : '');
}

// ── incremental "say" extractor — streams the string value of "say" out of JSON as it arrives ──
function sayExtractor(onText){
  let state = 0; // 0 seeking `"say"` · 1 seeking `:` · 2 seeking opening `"` · 3 in string · 4 done
  let esc = false, seekBuf = '';
  return chunk => {
    for (const ch of chunk){
      if (state === 0){ seekBuf = (seekBuf + ch).slice(-8); if (seekBuf.endsWith('"say"')) state = 1; }
      else if (state === 1){ if (ch === ':') state = 2; }
      else if (state === 2){ if (ch === '"') state = 3; }
      else if (state === 3){
        if (esc){ onText(ch === 'n' ? '\n' : ch === 't' ? '\t' : ch); esc = false; }
        else if (ch === '\\') esc = true;
        else if (ch === '"') state = 4;
        else onText(ch);
      }
    }
  };
}

export function extractJSON(text){
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1) return null;
  if (e > s){ try { return JSON.parse(t.slice(s, e + 1)); } catch { /* fall through to salvage */ } }
  // salvage a token-cap truncation (generation died mid-string/mid-object): progressively
  // close what's open. A salvaged object still passes the same bank validation downstream.
  const frag = t.slice(s);
  for (const tail of ['"}', '"]}', '"}}', ']}', '}}', '}']){
    try { return JSON.parse(frag + tail); } catch { /* next */ }
  }
  return null;
}

// Streamed model call with key rotation. onDelta receives say-text as it generates.
// Returns { raw } on success or { error } after every key has failed.
async function callModelStreaming(model, keys, system, messages, onDelta){
  const body = JSON.stringify({
    model: model, stream: true,
    messages: [{ role:'system', content: system }, ...messages],
    temperature: 0.35, max_tokens: 520,
    ...(isNemotron(model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  });
  let lastErr = 'no keys';
  for (const key of keys){
    const ctl = new AbortController();
    let firstTimer = setTimeout(() => ctl.abort(), FIRST_TOKEN_CEILING_MS);
    const totalTimer = setTimeout(() => ctl.abort(), TOTAL_CEILING_MS);
    let raw = '', gotBytes = false, degen = false;
    try {
      const r = await fetch(ENDPOINT, { method:'POST', signal: ctl.signal,
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' }, body });
      if (!r.ok){
        clearTimeout(firstTimer); clearTimeout(totalTimer);
        lastErr = `HTTP ${r.status}`;
        if (r.status === 401 || r.status === 429 || r.status >= 500) continue;
        return { error: lastErr };
      }
      const feed = sayExtractor(onDelta);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let sse = '';
      for (;;){
        const { done, value } = await reader.read();
        if (done) break;
        if (!gotBytes){ gotBytes = true; clearTimeout(firstTimer); firstTimer = null; }
        sse += dec.decode(value, { stream: true });
        let nl;
        while ((nl = sse.indexOf('\n')) !== -1){
          const line = sse.slice(0, nl).trim(); sse = sse.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (delta){
              raw += delta; feed(delta);
              // degenerate-output guard: Nemotron can collapse into an <unk> token loop
              // (seen live 2026-07-07 on a post-resolve follow-up — a full bubble of
              // "<unk><unk><unk>…"). Kill the stream early; the handler retries fresh.
              if (raw.length > 40 && (raw.match(/<unk>/g) || []).length >= 5){
                degen = true; break;
              }
            }
          } catch { /* partial SSE frame — ignore */ }
        }
        if (degen) break;
      }
      clearTimeout(totalTimer);
      try { if (degen) ctl.abort(); } catch {}
      if (degen) return { error: 'degenerate' };
      // brownout guard: a generation that dies after a character or two ("{" then silence —
      // seen live 2026-07-07) is a FAILED key attempt, not an answer. Rotate to the next key.
      if (raw.trim().length < 8){ lastErr = 'empty'; continue; }
      return { raw };
    } catch (e){
      clearTimeout(firstTimer); clearTimeout(totalTimer);
      lastErr = e.name === 'AbortError' ? 'timeout' : 'network';
      if (gotBytes) return { error: lastErr }; // mid-stream death: deltas already sent, don't restart on another key
      continue;
    }
  }
  return { error: lastErr };
}

export const config = { supportsResponseStreaming: true };

export default async function handler(req, res){
  const keys = loadKeys();
  const alive = keys.length > 0 && !process.env.TRIAGE_OFF;

  if (req.method === 'GET'){
    res.statusCode = alive ? 200 : 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ ok: alive }));
  }
  if (req.method !== 'POST'){ res.statusCode = 405; return res.end('method not allowed'); }
  if (!alive){ res.statusCode = 503; res.setHeader('Content-Type','application/json'); return res.end('{"error":"off"}'); }

  // validate input: short conversation of user/assistant turns, modest sizes
  let messages, op;
  try {
    const raw = await new Promise((resolve, reject) => {
      let b = ''; req.on('data', c => { b += c; if (b.length > 20000) reject(new Error('too big')); });
      req.on('end', () => resolve(b)); req.on('error', reject);
    });
    const body = JSON.parse(raw);
    messages = body.messages;
    op = body.op === 'writeup' ? 'writeup' : null;
  } catch { res.statusCode = 400; return res.end('{"error":"bad json"}'); }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12
      || !messages.every(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 3000)){
    res.statusCode = 400; return res.end('{"error":"bad messages"}');
  }

  // ── op:'writeup' — the intake writer (plain JSON, not SSE). GLM leads (the
  // instruction-follower, same reasoning as the resolver); no bank, no stream. Three
  // outcomes: {ok,work} extractive draft · {ok,insufficient} they never said the problem
  // → the card asks instead of drafting garble · {ok:false} model outage → the client
  // keeps its own floor (raw words verbatim), so an outage never blocks a send.
  if (op === 'writeup'){
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    let work = '', insufficient = false;
    try {
      const wOut = await callModelStreaming(MODELS[MODELS.length - 1], keys, writeupPrompt(), messages, ()=>{});
      const wj = wOut && !wOut.error ? extractJSON(wOut.raw) : null;
      if (wj && wj.insufficient === true) insufficient = true;
      else if (wj && typeof wj.work === 'string'){
        const w = wj.work.trim().slice(0, 1200);
        if (w && extractiveOK(w, messages)) work = w;
        else if (w) insufficient = true;   // composed despite instruction → ask, don't garble
      }
    } catch { /* fail-soft — client falls back to raw words */ }
    console.log(`triage: writeup ${work ? 'ok len=' + work.length : insufficient ? 'insufficient' : 'miss'}`);
    res.statusCode = 200;
    if (work) return res.end(JSON.stringify({ ok: true, work }));
    if (insufficient) return res.end(JSON.stringify({ ok: true, insufficient: true }));
    return res.end(JSON.stringify({ ok: false }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let bank;
  try { bank = await getBank(); }
  catch { send({ t:'e', error:'bank' }); return res.end(); }

  // Forwarded deltas are SCRUBBED: <unk> tokens are stripped before anything reaches the
  // client (a split "<un|k>" across two deltas is held back until it completes). The user
  // must never see tokenizer garbage, even for the beat before the degeneracy guard trips.
  let streamedAny = false, pend = '';
  const onDelta = text => {
    let t = pend + text; pend = '';
    const tail = t.match(/<u?n?k?>?$/);           // a suffix that could grow into "<unk>"
    if (tail && tail[0] !== '<unk>'){ pend = tail[0]; t = t.slice(0, t.length - tail[0].length); }
    t = t.replace(/<unk>/g, '');
    if (!t) return;
    streamedAny = true; send({ t:'d', c:t });
  };
  // One invisible retry: a model can burn its whole budget on a hidden reasoning preamble
  // (no JSON at all) or collapse into an <unk> loop (killed by the stream guard). If nothing
  // user-visible streamed, a fresh generation is indistinguishable from a slow one; if some
  // text DID land before a degenerate kill, send {t:'r'} so the client resets the bubble
  // before the retry streams — never a double-voice, never a garbage bubble.
  // follow-up mode is a structural fact, not a judgment call: the client's deck-landing
  // wrote a "picks" array into an assistant turn. Only then does the prompt carry the
  // follow-up section — the plain interview path never sees it (it was diluting resolves).
  const followUp = messages.some(m => m.role === 'assistant' && m.content.indexOf('"picks"') !== -1);
  // focus mode: the client opened Ask Vesta from a single firm's profile and seeded an
  // assistant turn carrying a "focus" object (name + read + known_for). Same structural
  // signal as follow-up — grounds Vesta on real firm facts, so GLM (the honesty-obeying
  // conversationalist) should lead here too, and the forced resolver stays out of it.
  const focusMode = !followUp && messages.some(m => m.role === 'assistant' && m.content.indexOf('"focus"') !== -1);
  let out = null, parsed = null;
  // Model order per mode: Nemotron leads the interview (speed is the UX there); GLM leads
  // follow-up mode (the design-loop-validated conversationalist — Nemotron fabricates
  // pick attributes ~1-in-3 under the honesty rule, GLM obeys it).
  const chainModels = (followUp || focusMode) && MODELS.length > 1 ? [...MODELS].reverse() : MODELS;
  let servedBy = '';
  chain:
  for (const model of chainModels){
    for (let attempt = 0; attempt < 2; attempt++){
      servedBy = model;
      out = await callModelStreaming(model, keys, systemPrompt(bank, model, followUp, messages.filter(m => m.role === 'user').length, focusMode), messages, onDelta);
      if (out.error === 'degenerate'){
        if (streamedAny){ send({ t:'r' }); streamedAny = false; pend = ''; }
        continue;                                   // fresh generation, same model
      }
      if (out.error) break;                         // keys exhausted on this model → next model
      parsed = extractJSON(out.raw);
      if (parsed && typeof parsed.say === 'string' && parsed.say) break chain;
      parsed = null;
      if (streamedAny) break chain;                 // words are on screen — never silently restart
    }
    if (streamedAny) break;
  }
  if (out.error){ send({ t:'e', error: out.error }); return res.end(); }
  // Prose salvage — the floor under the format contract: if the model answered in plain
  // prose (no JSON anywhere, so nothing streamed and both attempts missed the schema), the
  // words are usually still good triage talk. Wrap them as a plain conversational turn —
  // no resolve, conversation stays alive — instead of erroring the user to the tap-tree.
  if (!parsed){
    const prose = String(out.raw || '').replace(/<unk>/g, '').replace(/```[a-z]*|```/gi, '').trim();
    if (prose.length >= 40 && prose.indexOf('{') === -1 && !streamedAny){
      parsed = { say: prose.slice(0, 900), ask: null, chips: null, mode: 'fix', resolved: null, _salvaged: true };
      send({ t:'d', c: parsed.say });   // the say never streamed — deliver it now, then the final
    } else {
      send({ t:'e', error:'bad model json' }); return res.end();
    }
  }
  parsed.say = String(parsed.say).replace(/<unk>/g, '').trim();
  if (!parsed.say){ send({ t:'e', error:'bad model json' }); return res.end(); }

  // the final authority: validate resolved against the live bank (the triageEnter gate).
  // Normalize the shape FIRST — a resolved that isn't {trade, job} (the model has emitted
  // arrays under pressure) must never pass through unvalidated to the client.
  let deck = null;
  const rawResolved = parsed.resolved ? JSON.stringify(parsed.resolved).slice(0, 120) : 'null';
  if (parsed.resolved && (typeof parsed.resolved !== 'object' || Array.isArray(parsed.resolved) || !parsed.resolved.trade || !parsed.resolved.job)){
    parsed.resolved = null;
  }
  if (parsed.resolved){
    const v = bankValidate(bank, parsed.resolved.trade, parsed.resolved.job);
    if (v){ deck = v; if (v.emergency) parsed.resolved.urgency = 'emergency'; parsed.resolved.trade = v.trade; parsed.resolved.job = v.job; }
    else { parsed.resolved = null; parsed.ask = parsed.ask || "Tell me a bit more about what's going on?"; }
  }
  // Duty separation: past the question budget, an unresolved fix/plan turn gets a second
  // opinion from the single-task resolver (GLM-first — the instruction-follower). Its pick
  // still passes the same bank gate; a null keeps the conversation alive as before.
  let resolverUsed = 'no';
  const userTurns = messages.filter(m => m.role === 'user').length;
  if (!followUp && !focusMode && !parsed.resolved && (userTurns >= 2 || parsed.mode === 'emergency') && parsed.mode !== 'learn'){
    try {
      const rOut = await callModelStreaming(MODELS[MODELS.length - 1], keys, resolverPrompt(bank), messages, ()=>{});
      const rj = rOut && !rOut.error ? extractJSON(rOut.raw) : null;
      const v = rj && rj.trade && rj.job ? bankValidate(bank, rj.trade, rj.job) : null;
      if (v){
        deck = v; resolverUsed = 'hit';
        parsed.resolved = { trade: v.trade, job: v.job, urgency: v.emergency ? 'emergency' : 'routine' };
        parsed.ask = null; parsed.chips = null;
      } else {
        resolverUsed = rOut && rOut.error ? 'err:' + rOut.error : 'miss:' + JSON.stringify(rj).slice(0, 80);
      }
    } catch (e){ resolverUsed = 'err:' + (e && e.message || 'throw'); }
  }
  send({ t:'f',
    say: parsed.say,
    ask: parsed.ask || null,
    chips: Array.isArray(parsed.chips) ? parsed.chips.slice(0, 4).map(String) : null,
    mode: ['emergency','fix','plan','learn'].includes(parsed.mode) ? parsed.mode : 'fix',
    resolved: parsed.resolved || null,
    deck,
  });
  // one diagnostic line per turn (no user text): which model served, mode, and the outcome —
  // the only way to attribute a bad production turn to a specific model in the chain
  console.log(`triage: model=${servedBy} followUp=${followUp} turns=${userTurns} resolved=${parsed.resolved ? parsed.resolved.trade + '/' + parsed.resolved.job : 'null'} raw=${rawResolved} resolver=${resolverUsed} salvaged=${!!parsed._salvaged}`);
  res.end();
}
