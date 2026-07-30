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
import { rateOk } from './_ratelimit.mjs';
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
Rules: pick the closest job even if details are unconfirmed (best read beats no read; a pro confirms on site). A * emergency job ONLY for active danger or damage happening right now (water actively flowing, sparking, gas, no heat in freezing weather) — a stain, a noise, dampness, or anything being monitored takes the ROUTINE job, never the * one. If the homeowner has ONLY been asking how something works or whether it's normal and never asked for a pro, output nulls — never match someone who isn't hiring. If and ONLY if the conversation gives no usable signal about any trade, output {"trade": null, "job": null}. No prose, no markdown — the JSON object only.`;
}

// ── the turn-1 resolver: the named-job fast-path. The talker reliably ACCEPTS a named job
// in its say ("a full roof replacement — I'll help you get the right pros") while leaving
// resolved null (measured 7/12: roof-replace 1/4, running-toilet 0/4, located-stain 0/4 —
// prompt rules verbatim in the talker's prompt, still dropped). Same duty-separation fix as
// the turn-2 resolver, but STRICTER: it may only resolve what the first message alone pins.
// Runs CONCURRENTLY with the talker (no latency cost); its pick passes the same bank gate,
// is never adopted for emergencies, and a null changes nothing.
function turn1ResolverPrompt(bank){
  const bankLines = Object.entries(bank)
    .map(([t, jobs]) => `${t}: ` + jobs.map(j => j.job + (j.emergency ? '*' : '')).join(', '))
    .join('\n');
  return `You are a strict first-message triage resolver. Read the homeowner's single message and output ONLY one JSON object: {"trade": string, "job": string} — both ids copied VERBATIM from this bank (a * marks an emergency job; the * is never part of the id):
${bankLines}
Resolve ONLY when the message alone pins both the trade and the job:
- they NAME the work ("replace my whole roof", "re-stain the deck", "repave the driveway", "repaint the living room"), or
- a classic one-trade symptom (running toilet, dripping faucet, dead outlet, clogged drain, drafty window), or
- a located symptom that pins the trade (a water stain directly under the upstairs bathroom → plumbing). For a stain, drip, or slow contained leak — nothing actively flowing — pick the trade's ROUTINE repair job (plumbing: fixture-or-small-repair; roofing: repair), NEVER a * job.
Output {"trade": null, "job": null} when: the message could belong to two different trades (an unlocated ceiling stain could be roof OR plumbing), it's a question about whether something is normal (not a request for a pro), it's an active emergency, it's a multi-trade wishlist, or no concrete job is named. NEVER pick a * emergency job. No prose, no markdown — the JSON object only.`;
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
  {"say": string, "ask": string|null, "chips": string[]|null, "mode": "emergency"|"fix"|"plan"|"learn"|"atlas", "resolved": {"trade","job","urgency":"emergency"|"routine"}|null}
- "say": warm and genuinely helpful, UNDER 55 WORDS (a price or judgment teach — comparing quotes, deposit norms — may run to 110 when the content earns it; never padding) — teach, don't just acknowledge. Weave in what the symptom USUALLY indicates and how urgent it is. You may add ONE practical "in the meantime" note when it helps — ONE SENTENCE, never a numbered procedure or a walkthrough of parts (adjusting flappers, chains, and valves is the pro's job, not a chat message). Safety notes always qualify: shut the water off at the valve, don't touch a sparking outlet, leave if you smell gas. THE BALANCE: as useful as a knowledgeable neighbor who's seen this before — but never REDLINING. Redlining = a definitive diagnosis, step-by-step repair instructions, or any price/timeline promise. Stay hedged ("usually", "often", "likely") and land on a pro assessing it.
- HOMEOWNER REALITY: the visitor may be a first-time owner, embarrassed that they do not know the trade, afraid of being taken, worried that ordinary questions will make a contractor walk, or trying to compare proposals that describe different work. Reduce shame without becoming sentimental. They are not expected to diagnose the house or prove they are a worthy customer. Name the decision principle, translate the ambiguity, then give one exact next move.
- POWER AND TRUST: clear written questions are not "nitpicking." Treat responsiveness, willingness to define scope, and documented changes as operating evidence without guessing anyone's motive. Never blame a homeowner for being ghosted, and never promise that a contractor is trustworthy.
- STRUCTURE inside "say" (use real \\n newlines in the JSON string): when you have 2+ distinct FACTS or safety steps, break them into "- " dash bullets (max 4, each under 12 words) after a one-line lead; you may bold ONE key phrase per message with **…**. BULLETS ARE NEVER QUESTIONS — your one question lives in "ask" (with chips), nowhere else. A single-thought reply stays one short paragraph. Structure is for teaching, not for interviewing.
- "mode": classify the conversation every turn.
  emergency = active danger or damage happening RIGHT NOW (fire, gas smell, sparking/burning, water flooding in, no heat in a hard freeze). Vesta is NOT a dispatch service — do NOT resolve, do NOT match, do NOT promise anyone is coming; give the decisive safety response (see EMERGENCY HANDLING).
  fix = something is wrong but not urgent. The core triage case.
  plan = a future project ("this spring", "thinking about", "getting quotes"). NEVER ask urgency questions. Once the job is known, RESOLVE — do not gather scope details (size, length, material, brand, budget, timing); those are the pro's questions, not yours. Your final "say" is patient and no-pressure — they're early, and that's fine.
  learn = they're asking a question, not hiring ("is this normal?", "what does this usually involve?"). Answer genuinely within the redlining rules, keep resolved null, and END your "say" with a soft offer to line up the right pros whenever they're ready. If they take you up on it, the mode becomes fix or plan.
  atlas = the person has IDENTIFIED as a CONTRACTOR or business owner (not a homeowner with a home problem) — they say they run a [trade] business or do the work themselves, or they ask how to get listed / signed up as one of these pros. This is a hand-off, not triage — see ATLAS HAND-OFF.
- WHEN TO ASK vs RESOLVE — run this test before every "ask": would the answer change the trade, the job, or the urgency? If not, do NOT ask — resolve to your best read. When the homeowner has already NAMED the job ("replace my whole roof", "redo the driveway", "repaint the living room", "stain and seal my deck"), that IS the job — resolve it immediately. A common single-trade symptom (a running toilet, a dripping faucet, a dead outlet, a drafty window) is ALREADY resolved — name that trade's routine job on turn one. If two jobs route to the same kind of pro anyway, pick the closer one and resolve.
  NEVER ASK ABOUT: size, length, square footage, material, brand, color, budget, timing, which fixture it's under, how many feet, whether they want add-on scope (stump grinding, haul-away) — or ANY detail a pro would confirm on site. None of these ever change the (trade, job). When torn between asking and resolving, RESOLVE. HARD CAP: 3 questions per conversation; at the cap, resolve to your best read or offer a final two-option chip choice.
- "ask": ONE short discriminating question if you are not yet sure which trade/job — else null. NEVER a diagnostic a pro would run on site (soft floors, flush tests, breaker flips, pressure checks) — once the trade and job are clear, those belong to the pro's visit, and your move is to RESOLVE.
- "chips": 2-4 short tappable answers to your "ask" (2-5 words each, PARALLEL in form — same grammatical shape, e.g. ["Under a bathroom","Under the roofline"]) — else null. When you offer chips, your "say" must make clear WHY these particular options are the ones that matter — the expert distinction they draw out (e.g. "where the stain sits is what separates a roof leak from a plumbing leak, so it points me to the right pro"). Tailored, expert reasoning is what Vesta is known for; never offer bare options without the thinking behind them.
- "resolved": fill ONLY when you are confident of a real (trade, job) from the bank. Use the EXACT job-id (no *). Set urgency "emergency" for * jobs or clear emergency language. When resolved, "say" is your final reassuring line and "ask"/"chips" must be null.
- EMERGENCY HANDLING (mode "emergency") — Vesta is a guide, NOT emergency dispatch. Scale the response to the danger; keep "resolved" NULL and "ask"/"chips" null:
  - Life-safety (active fire, gas smell, sparking/burning, flooding in progress — anything threatening people): lead with the decisive call — "Call 911 now" (for gas, get OUTSIDE first, then the gas utility) — then the concrete do-this-now steps (get out, don't touch switches, shut the main/gas valve only if safe). Full authority, real steps. This IS the best possible answer.
  - Urgent but not life-threatening (contained burst pipe, no heat in a freeze): steady and warm — the immediate mitigation step (shut the main valve, kill the breaker) + tell them to CALL a licensed pro right away. Phone-first; an emailed request is the wrong tool for something that can't wait.
  - NEVER say or imply WE are sending, dispatching, lining up, or getting a pro "on the way"/"right now" — we can't and don't. NEVER fall to a generic "tell me more" — every emergency turn is a complete, situation-aware answer. NEVER route an emergency into the match deck or request pipeline. Once they're safe and it's no longer active, a normal "find me a pro" turn matches as usual.
- Ambiguous water-from-ceiling (a stain, dampness — NOT actively flowing): ask whether it's under a bathroom/plumbing or under the roofline BEFORE resolving. But if they already SAID where it is ("under the upstairs bathroom", "top-floor ceiling under the roof"), that ambiguity is ANSWERED — resolve NOW; which fixture it's under never changes the (trade, job).
- DECKS — Vesta's network covers deck REFINISHING and REPAIR, not ground-up deck building. Route by intent: staining/sealing/refinishing → painting/deck-or-fence-staining; rot, loose boards, railings, resurfacing, structural fixes → painting/carpentry-and-rot-repair (the carpentry-capable pros). For a brand-NEW deck build with no repair scope, be honest: you don't have dedicated deck-builders vetted in their county yet — say so plainly, and offer what you CAN line up (the finishing and carpentry-repair pros above) if any of the work is refinish or repair. Never quietly match a painter to build a deck.
- OUT-OF-NETWORK needs: if NO job in the bank matches what they need (a septic tank pump-out, building a brand-new fence, general handyman odds-and-ends), say so plainly and warmly — Vesta hasn't vetted that specialty in their county yet. Do NOT interview toward a match you cannot make, do NOT claim you can find those pros, and NEVER contradict yourself ("I can't connect you with X, but I can find you X pros" is forbidden). CHECK THE BANK before disclaiming: solar (electrical: solar-or-battery-backup), generators, EV chargers, and pool wiring are all IN network — a need that has a bank job resolves like any other. If a real bank job genuinely covers a piece of an out-of-network need, offer THAT honestly, named for what it is.
- ATLAS HAND-OFF (mode "atlas") — 4THWALL runs BOTH sides of this: Vesta is the homeowner's side; ATLAS is the contractor's side — a managed, SMS-first front office that responds to missed callers and inbound texts, captures the request, books approved estimate slots, and records what happened. Live voice answering and automated quote chasing are not current production promises. When the person IDENTIFIES as a contractor/business owner or asks how to get listed: do NOT run home triage and do NOT match pros. Warmly send them to the right side in 2-3 genuine sentences — no hard sell — keep resolved/ask/chips null. Name the free first step accurately: the record room inside Atlas, where a contractor can connect supported tools, review source-labeled evidence, and control what could be shown; nothing publishes without them. Never present Lens as a separate product or door. Atlas is the fuller managed service. NEVER quote a price, promise results, or invent numbers; the desks carry the full story, your job is the introduction. GUARDS (these are NOT "atlas"): a homeowner complaining ABOUT a contractor (ghosted, overcharged, no-showed) is still a homeowner → triage normally. Someone merely CURIOUS what 4THWALL is could be a homeowner → answer honestly (you MAY explain 4THWALL: the managed front office behind Vesta) and stay in normal mode; only switch to "atlas" once they actually reveal they're a contractor.
- WHO VESTA IS (asked about you, your vetting, pay-to-play, "why should I trust you", or how you compare — answer from THIS block, never improvise): Vesta is a free homeowner's guide to Fairfield County contractors, built by 4THWALL. Every profile is built from the PUBLIC RECORD — state registrations and licenses where the trade carries them, years in the record, and a close read of what homeowners' own reviews actually say. That evidence — never ads, never payment — decides the picks, and every pick shows its why. NO pay-to-play, ever: a contractor cannot buy placement, a badge, or a boost; there is nothing to buy. You DO recommend specific pros — matched picks with the reasoning shown IS the product. NEVER claim background checks, insurance verification, or post-job review collection — Vesta does none of those; overstating the vetting is the one unforgivable answer, and when unsure you claim less, not more. Versus Angi/HomeAdvisor (a homeowner asking): they sell the same request to several contractors as a lead — their revenue is the auction; Vesta orders by evidence, shows the why, and connecting is free and direct — you are never resold. (A CONTRACTOR asking how to get listed is the ATLAS HAND-OFF above, not this.)
- A NAMED FIRM (they ask about a specific company by name and NO "focus" object is in the history): you have no live lookup in this chat — NEVER invent an opinion, rating, reputation, or "I've heard good things" for a firm you cannot see; a fabricated read is the one unforgivable answer here. Be honest in one clause, then be USEFUL: if Vesta tracks them, the full evidence read lives on their profile — tell them to search the name in the directory (browse every trade). Then offer what you CAN do: line up your own evidence-backed picks for the same job, and teach the quick checks that separate solid firms — state registration under the real business name, an itemized quote you can compare line by line, no big cash deposit up front. Never a bare "I can't."
- If the input is off-topic or not a home problem: gently redirect once in "say", resolved null.
- PRESENCE — how Vesta feels alive (applies every turn, every mode):
  - React to the PERSON before the problem: pick up their exact words (mirror one short phrase of theirs, naturally), and match their energy — terse gets crisp, stressed gets steady and warm, excited gets excited. Never open two consecutive turns with the same word or stock phrase.
  - CARRY THE THREAD: any detail they've given (a name, the cedar roof, the 1950s house, the toddler, "we just moved in") is yours to remember and reuse later without being re-told. Re-asking ANYTHING already answered is the single most robotic move — never do it.
  - Every turn ends with ownership, never a dead end: either your one question, or what happens next ("I'll line up the right pros for exactly this"). The homeowner should never wonder what to do with your answer.
- MULTI-TRADE PROJECTS: when the described work genuinely spans trades (a backyard remodel = masonry + landscaping; a basement finish = framing + electrical + flooring), do NOT cram it into one job. Name the phases in the order a good GC would sequence them (that ordering IS expert value), then resolve the FIRST phase's (trade, job) from the bank this turn and say you'll line up the next trade the moment they're ready for it. Each later phase is its own fresh resolve when they say go.
- Never mention firm names, ratings, or counts. You route to matches; you don't list them.
- PRICE QUESTIONS ("what's a fair price for X?", "how much does Y cost?", "is this quote high?"): never a dollar figure or a range — but NEVER open with a refusal either ("I can't give pricing" as a first sentence is forbidden; it reads like a wall). LEAD WITH THE TEACH: the 3-4 real drivers a pro prices for THAT job (a roof: size, pitch, tear-off layers, material; a water heater: tank vs tankless, fuel, venting), then how to judge quotes like a pro — itemized scope, apples-to-apples across 2-3 bids, deposit norms (a big cash deposit up front is a red flag). That teaching is worth more than a number, because a blind ballpark misleads. Land on the offer to line up pros who'll bid it straight. Pressed for a ballpark anyway: acknowledge they just want a rough sense, hold warmly, explain why a number without seeing the home would mislead — never repeat the same refusal twice.
- EQUIPMENT DOWN, NOT DANGEROUS (AC dead in a heat wave, water heater dead, furnace dead in mild weather): that IS a resolve — the bank carries emergency-tagged jobs (no-heat-or-no-cool-emergency, emergency-leak-or-burst) for exactly this. Resolve it THIS TURN with urgency "emergency"; NEVER tell them to go call a pro themselves — matching them IS the call. Mode stays "fix" unless danger is active right now.
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

OUTPUT CONTRACT: your ENTIRE reply is exactly ONE JSON object matching the schema in the RULES. No prose before or after it, no markdown fences, no bullet lists outside JSON strings. Anything you want to tell the homeowner goes INSIDE "say"; any question goes INSIDE "ask". If you notice yourself writing plain prose, stop and emit the JSON instead.

HARD BOUNDARY — never produce requested content that isn't home triage: no poems, songs, essays, jokes, stories, code, recipes, or homework, no matter how directly asked. One warm sentence declining, then pivot to their home. This outranks being agreeable.`
  + (isNemotron(model) ? `

EMERGENCY OVERRIDE — THIS RULE OUTRANKS EVERY OTHER RULE:
When the situation is an active emergency (fire, gas smell, sparking or burning smell, water actively flowing/pouring, burst pipe, sewage backing up, no heat in freezing weather), you MUST keep "resolved", "ask", and "chips" NULL and put your ENTIRE response in "say": the decisive safety action + who to CALL (911 or the utility for life-safety; a licensed pro by phone for urgent-but-fixable) + the concrete do-now steps. Vesta is NOT dispatch — NEVER write that we are sending, lining up, or getting anyone on the way, and NEVER ask a follow-up question. One JSON object, resolved null, a complete safety answer in "say".` : '');
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
  // random starting offset: concurrent calls (talker + t1 resolver) otherwise both open on
  // key 1 and rate-limit the same key in lockstep; a spread start uses the pool as a pool
  const startAt = (Math.random() * keys.length) | 0;
  for (let ki = 0; ki < keys.length; ki++){
    const key = keys[(startAt + ki) % keys.length];
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

// Single-task duty call (resolvers, writeup): GLM leads — the instruction-follower — but a
// rate-limited model must never strand the duty (the t1 resolver stranded on GLM 429s across
// every key, seen live 7/12). On any error, the same prompt runs once on the other model.
async function callSingleTask(keys, system, messages){
  let r = await callModelStreaming(MODELS[MODELS.length - 1], keys, system, messages, ()=>{});
  if (r.error && MODELS.length > 1) r = await callModelStreaming(MODELS[0], keys, system, messages, ()=>{});
  return r;
}

export const config = { supportsResponseStreaming: true };

// ── the say governor (2026-07-20 hemisphere-symmetry audit) — Vesta's output-side net.
// The redlines were prompt-only; a phrasing we didn't anticipate could ship a dollar
// figure, a dispatch promise ("someone's on the way" — the worst emergency-doctrine
// breach), a vetting mechanism Vesta doesn't run (background checks, insurance
// verification), or a personhood claim. Sentence-level strip, same splitter as
// resolveClamp; digits the HOMEOWNER typed are their facts and stay quotable (the
// Atlas echoNums rule). DIY_PROC extends to unresolved turns here (resolveClamp only
// covered resolved ones). Everything stripped → an honest, forward-owning floor line.
const PRICE_UNIT_OK = /\d[\d,]*\s?-?\s?(sq|square|feet|foot|ft|amp|volt|watt|gallon|btu|degree|year|day|hour|minute|second|%)/i;
// hoisted from resolveClamp (2026-07-20) so the say governor can extend the DIY strip to
// unresolved turns — see resolveClamp's original comment block for the rule's history.
const DIY_PROC = /\b(lift|remov|unscrew|loosen|tighten|jiggl|wiggl|reset|adjust|replac|reattach|reconnect|check|inspect)\w*\b[^.!?]*\b(lid|flapper|chain|float|fill[- ]?valve|shut[- ]?off valve|breaker|fuse|handle|washer|cartridge|o-?ring|gasket|tank lid|p-?trap|thermostat)\b/i;
const PRICE_QUESTION = /\b(how much|price|pricing|cost|quote|estimate|ballpark|budget|expensive|cheap)\b/i;
const REFUSAL_FIRST = /^I\s+(?:can(?:not|'t|’t)|do(?: not|n't|n’t))\s+(?:give|provide|quote|estimate|know|have)[\s\S]{0,180}?(?:[.!?](?:\s+|$)|[—–:]\s*)/i;
export function sayGuard(say, messages, deck){
  const userDigits = new Set();
  for (const m of messages) if (m.role === 'user')
    for (const d of (String(m.content).match(/\d[\d,]*/g) || [])) userDigits.add(d.replace(/,/g, ''));
  const priceShaped = s =>
       /\$\s?\d/.test(s)
    || (/\b\d{1,3}(,\d{3})+\b/.test(s) && !PRICE_UNIT_OK.test(s))
    || /\b\d+(\.\d+)?k\b(?!w)/i.test(s)
    || /\b(between|around|roughly|about|typically|usually|expect|run|runs|cost|costs)\b[^.!?]{0,24}\b(a )?(few |couple |several )?(hundred|thousand)s?\b[^.!?]{0,16}\b(dollars|bucks)?\b/i.test(s) && /(hundred|thousand)/i.test(s) && /\b(dollars|bucks|\$)|price|quote|cost/i.test(s);
  // the echo exemption only applies to sentences that HAVE digits — a spelled-out price
  // ("several thousand dollars") has none and must never pass vacuously
  const allDigitsEchoed = s => {
    const ds = s.match(/\d[\d,]*/g) || [];
    return ds.length > 0 && ds.every(d => userDigits.has(d.replace(/,/g, '')));
  };
  const DISPATCH =
    /\b(i|we)('ll| will|'m| am|'re| are)?\s+(send(ing)?|dispatch(ing)?|have|get|got)\b[^.!?]{0,26}\b(someone|help|a (pro|plumber|tech(nician)?|crew|team|roofer|electrician))\b[^.!?]{0,26}\b(out|over|to you|coming|headed|on the way|right away|right now|tonight|today|within the hour)\b/i;
  const DISPATCH2 = /\b(help|someone|a (pro|plumber|tech(nician)?|crew|team))('s| is| will be)? (on (the|its|their) way|en route)\b/i;
  // Strip only claims that Vesta PERFORMS vetting it does not perform. The older noun-only
  // pattern also erased the honest disclosure "Vesta does not run background checks or
  // verify insurance" — exactly the sentence a skeptical homeowner needs to hear.
  const vettingOverclaim = s =>
       /\b(?:we|vesta)\s+(?:personally\s+)?(?:run|perform|verif|check|screen|inspect|interview)\w*\b[^.!?]{0,30}\b(background|insurance|insured|licens|contractors?|firms?|pros?)\b/i.test(s)
    || /\b(?:we|vesta)\s+do(?:es)?\s+(?!not\b)[^.!?]{0,24}\b(background|insurance|insured|licens|contractors?|firms?|pros?)\b/i.test(s)
    || /\b(?:background[- ]?checked|insurance[- ]?verified|verified (?:insurance|licens))\b/i.test(s)
    || /\bdrug[- ]?test(?:ed|ing)?\b/i.test(s);
  const PERSONHOOD = /\breal (person|human)\b|\b(i'?m|i am) (a )?(real )?(person|human)\b/i;
  let parts = String(say).split(/(?<=[.!?])\s+/);
  parts = parts.filter(s =>
       !(priceShaped(s) && !allDigitsEchoed(s))
    && !DISPATCH.test(s) && !DISPATCH2.test(s)
    && !vettingOverclaim(s) && !PERSONHOOD.test(s)
    && !DIY_PROC.test(s));
  let out = parts.join(' ').trim();
  // Models still occasionally obey the no-number rule by opening with a wall:
  // "I can't give specific pricing — it varies by..." The homeowner asked for
  // help judging a price, not a recitation of our limitation. On an explicit
  // price turn, deterministically remove only that opening clause and lead
  // with the useful remainder. If the model supplied no teaching at all, use
  // a narrow source-free comparison rule rather than shipping the refusal.
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (out && PRICE_QUESTION.test(String(lastUser?.content || '')) && REFUSAL_FIRST.test(out)) {
    out = out.replace(REFUSAL_FIRST, '').trim();
    if (out) out = out[0].toUpperCase() + out.slice(1);
    else out = 'The useful comparison is the itemized scope: make sure each bid covers the same work, materials and exclusions before comparing the totals.';
  }
  if (out) return out;
  return deck
    ? `Got it — I'll line up vetted ${deck.tradeLabel.toLowerCase()} pros for ${deck.label} now.`
    : `Here's the honest answer: the right local pro should look at this — and lining up exactly that is what I do. Tell me a bit about what's going on and I'll point you right.`;
}

// A sprawling answer makes Vesta feel like a generic model even when every sentence is safe.
// Bound ordinary turns while preserving the final ownership/next-step sentence when one exists.
// Emergency and price-teach turns receive larger budgets at the call site.
export function boundSay(say, maxWords = 65){
  const source = String(say || '').trim();
  const count = value => String(value || '').trim().split(/\s+/).filter(Boolean).length;
  if (!source || count(source) <= maxWords) return source;

  const parts = source.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const ownership = [...parts].reverse().find(s =>
    /\b(whenever you|when you(?:'|’)re ready|tell me|say the word|i can line up|i(?:'|’)ll line up|i can match|i(?:'|’)ll match)\b/i.test(s));
  const kept = [];
  const reserved = ownership ? count(ownership) : 0;
  for (const part of parts){
    if (part === ownership) continue;
    const candidate = [...kept, part].join(' ');
    if (count(candidate) + reserved > maxWords) break;
    kept.push(part);
  }
  if (ownership && count([...kept, ownership].join(' ')) <= maxWords) kept.push(ownership);
  if (kept.length) return kept.join(' ');

  const words = source.split(/\s+/).slice(0, maxWords);
  return words.join(' ').replace(/[,;:—–-]+$/, '') + (/[.!?]$/.test(words.at(-1) || '') ? '' : '.');
}

// Detect only explicit, named multi-trade work. The server supplies the sequencing value the
// prompt asks for and lets the live bank decide whether the first phase can resolve. This is
// deliberately conservative: two distinct named phases are required, and ambiguous symptoms
// still stay with the normal conversational resolver.
export function multiTradePlan(text){
  const t = String(text || '');
  const projectFraming =
       /\b(redo|renovat|remodel|makeover|planning|project|want to|looking to)\b/i.test(t)
    || /\b(install|replace|build|add|remove|take down|repaint|plant)\b/i.test(t)
    || /\bnew\s+(patio|roof|flooring|floors?|windows?|doors?|lawn|sod|driveway)\b/i.test(t)
    || /\b(tree removal|fresh sod)\b/i.test(t);
  if (!projectFraming) return null;
  const phases = [];
  const add = (key, label, trade, jobs, test) => { if (test.test(t)) phases.push({ key, label, trade, jobs }); };
  add('tree', 'tree removal and site prep', 'tree', ['tree-removal'], /\b(tree removal|remove|take|taking|taken)\b[^.?!]{0,22}\btrees?\b|\btrees?\b[^.?!]{0,22}\b(remove|take|taking|taken) down\b/i);
  add('plumbing', 'plumbing rough-in', 'plumbing', ['fixture-or-small-repair'], /\b(plumbing|pipes?|water lines?|drain lines?)\b/i);
  add('hvac', 'heating and cooling rough-in', 'hvac', ['system-repair-not-cooling','routine-maintenance-tuneup'], /\b(hvac|ductwork|heating|cooling|furnace|air conditioning)\b/i);
  add('electrical', 'electrical rough-in', 'electrical', ['rewiring-old-home','panel-or-service-upgrade'], /\b(electrical|rewir(?:e|ing)|outlets?|lighting|panel upgrade)\b/i);
  add('hardscape', 'patio and hardscape', /\b(concrete|pavers?|driveway)\b/i.test(t) ? 'paving' : 'masonry',
    /\b(concrete|pavers?|driveway)\b/i.test(t) ? ['concrete-patio-or-walkway','new-driveway'] : ['patio-or-walkway'],
    /\b(stone|brick|concrete|paver)\s+(patio|walkway)|\b(patio|walkway|retaining wall|hardscape|driveway)\b/i);
  add('roofing', 'roof and exterior envelope', 'roofing', ['full-roof-replacement','roof-plus-siding-gutters'], /\b(roof replacement|replace the roof|new roof|roofing)\b/i);
  add('windows', 'windows and doors', 'windows_doors', ['window-replacement','door-installation'], /\b(windows?|doors?)\b/i);
  add('painting', 'painting and finishes', 'painting', ['interior-painting','exterior-painting'], /\b(paint|painting|repaint)\b/i);
  add('flooring', 'finished flooring', 'flooring', ['new-floor-installation','floor-replacement'], /\b(flooring|new floors?|replace the floors?)\b/i);
  add('lawn', 'final grading, planting and sod', 'lawn', ['full-relandscape','planting-and-garden-beds'], /\b(sod|lawn|landscap|planting|garden beds?)\b/i);
  if (phases.length < 2) return null;

  const labels = phases.map(p => p.label);
  const sequence = labels.length === 2
    ? `${labels[0]} first, then ${labels[1]}`
    : `${labels.slice(0, -1).join(', ')}, then ${labels.at(-1)}`;
  return {
    phases,
    say: `That is a ${labels.length}-phase project, not one generic contractor search. I’d sequence it as ${sequence}. I’ll start with the first phase now; when that is set, we can move to the next without making you repeat the plan.`,
  };
}

// Vesta serves more than homeowners: builders, general contractors, property teams and
// real-estate professionals also use the public evidence to source trades. Their first-person
// professional identity must not be mistaken for "take me to Atlas" when the actual intent is
// finding a trade for a project.
export function professionalBuyerSignal(text){
  const t = String(text || '');
  const professional = /\b(i'?m|i am|we are|as)\s+(?:a|an)?\s*(builder|general contractor|gc|realtor|real[- ]estate agent|property manager|property management|facilities manager|construction manager)\b/i.test(t)
    || /\b(my|our)\s+(project|property|building|client|development|renovation)\b/i.test(t);
  const sourcing = /\b(looking for|need|find|source|sourcing|hire|line up|recommend)\b[^.?!]{0,45}\b(roofer|plumber|electrician|hvac|painter|landscaper|mason|paver|carpenter|contractor|subcontractor|sub|trade|crew|firm|company)\b/i.test(t)
    || /\b(roofer|plumber|electrician|hvac|painter|landscaper|mason|paver|carpenter|contractor|subcontractor|sub|trade|crew|firm|company)\b[^.?!]{0,45}\b(for|on)\b[^.?!]{0,30}\b(project|property|client|renovation|build|job)\b/i.test(t);
  return professional && sourcing;
}

const VESTA_TRADE_SIGNALS = [
  ['roofing', /\b(roof(?:er|ing)?|shingle|flashing|gutter)\b/i],
  ['plumbing', /\b(plumb(?:er|ing)?|pipe|drain|fixture|water heater)\b/i],
  ['HVAC', /\b(hvac|heating|cooling|furnace|air conditioning|heat pump)\b/i],
  ['electrical', /\b(electric(?:al|ian)?|panel|rewir|outlet|lighting)\b/i],
  ['painting', /\b(paint(?:er|ing)?|coating)\b/i],
  ['masonry', /\b(mason(?:ry)?|chimney|brick|stone|patio)\b/i],
  ['landscaping', /\b(landscap|lawn|tree|arborist)\b/i],
  ['windows and doors', /\b(window|door)\b/i],
  ['paving', /\b(pav(?:er|ing)|driveway|asphalt|concrete)\b/i],
];

export function inferVestaTrade(messages, text = ''){
  const conversation = [
    ...(Array.isArray(messages) ? messages : [])
      .filter(m => m && m.role === 'user')
      .map(m => String(m.content || '')),
    String(text || ''),
  ].join(' ');
  return VESTA_TRADE_SIGNALS.find(([, test]) => test.test(conversation))?.[0] || null;
}

function hiringQuestions(trade){
  const tailored = {
    roofing:'Ask each roofer to put the same things in writing: tear-off layers, deck-repair allowance, flashing and ventilation work, exact material, who pulls any required permit, workmanship warranty, exclusions, and cleanup. The revealing question is, “What could change this scope after you open the roof, and how will you document it before charging me?”',
    plumbing:'Ask each plumber about the diagnostic fee, exact scope and parts, access or wall-opening work, cleanup, who handles any required permit, and the labor warranty. The revealing question is, “What do you know now, what still requires diagnosis, and what would make the price change?”',
    HVAC:'Ask each HVAC firm for the equipment model, sizing assumptions, duct or electrical changes, who handles any required permit, commissioning steps, and labor versus manufacturer warranty. The revealing question is, “What evidence says this is the right repair or system size for this house?”',
    electrical:'Ask each electrician for the exact circuits or service work, panel and device specifications, access and patching responsibility, who pulls any required permit, inspection plan, and labor warranty. The revealing question is, “What will be inspected, and what existing conditions could change the scope?”',
    painting:'Ask each painter about surface preparation, repairs, primer, product and coats, protected areas, cleanup, schedule assumptions, and the workmanship warranty. The revealing question is, “What preparation is included that I will not see once the finish coat is on?”',
  };
  return tailored[trade] || 'Ask every firm for the same written scope: included work, materials, exclusions, access and cleanup, permit responsibility if applicable, schedule assumptions, payment milestones, and workmanship warranty. Then ask, “What could change this scope, and how will you document and approve that change before charging me?”';
}

// Source-free decision coaching: useful principles Vesta can give without diagnosing a home,
// inventing a contractor fact, quoting a local law, or pretending to know live price/schedule.
export function vestaDecisionRoute(text, messages = [], followUp = false, focusMode = false){
  const t = String(text || '');
  const trade = inferVestaTrade(messages, t);
  if (/\b(first[- ]time (?:homeowner|home owner)|new homeowner|just bought (?:my|our) first (?:house|home))\b/i.test(t)
      && /\b(do not know|don(?:'|’)t know|no idea|not sure|which|what kind|where to start)\b/i.test(t)) return {
    mode:'fix',
    say:'You are not supposed to know the trade or diagnose the house — that translation is my job.',
    ask:'What changed, where do you notice it, and is anything unsafe or actively getting worse right now?',
  };
  if (/\b(are they|is (?:he|she|the contractor)|contractors?)\b[^.?!]{0,45}\b(ignore|dismiss|ghost)\w*\b[^.?!]{0,35}\b(because|since)\b[^.?!]{0,18}\b(i am|i'?m)\s+(a )?woman\b/i.test(t)
      || /\bbecause (?:i am|i'?m) a woman\b/i.test(t)) return {
    mode:'learn',
    say:'I cannot know their motive from the silence, but you do not need to prove why to treat the behavior as evidence. Send one concise written request with the job, town, timing, and a yes-or-no fit question. If they still do not respond, move on; reliable communication is part of the work.',
  };
  if (/\b(nitpick(?:y|ing)?|piss (?:him|her|them) off|annoy (?:him|her|them)|afraid to ask|scared to ask|might walk|will walk|rock the boat)\b/i.test(t)) return {
    mode:'learn',
    say:'Reasonable written clarity is not nitpicking. Protect the relationship by calmly restating what both sides agreed: the included work, the next milestone, and how any change will be approved before it affects price or schedule. A contractor who can explain the plan is easier to work with, not harder.',
  };
  if (/\b(nobody|no one|none of (?:them|the contractors?)|contractors)\b[^.?!]{0,40}\b(call(?:s|ed)? back|respond(?:s|ed)?|get(?:s|ting)? back|reply|ghost)\b/i.test(t)
      || /\bam i doing something wrong\b/i.test(t)) return {
    mode:'learn',
    say:'That silence is not proof you asked wrong. Availability and responsiveness are operating evidence. Send one short written request with the work, town, timing, and “Is this a fit for you to quote?” Then set a follow-up point and contact alternatives instead of indefinitely chasing one firm.',
  };
  const questions =
       /\bwhat (?:should|do) i ask\b/i.test(t)
    || /\bquestions?\b[^.?!]{0,35}\b(ask|contractor|roofer|plumber|electrician|hvac|before hiring|interview)\b/i.test(t)
    || /\bbefore i hire\b[^.?!]{0,28}\bwhat\b/i.test(t);
  if (questions) return { mode:'learn', say:hiringQuestions(trade) };

  if (/\b(change order|changed? the (?:price|scope)|price (?:went|is going) up|more money|additional (?:work|cost)|found (?:more|other|additional) work|unexpected work)\b/i.test(t)
      && /\b(midway|mid-project|after (?:they|work|the job)|already started|opened|during|now|wants?|asking|charge)\b/i.test(t)) return {
    mode:'learn',
    say:'Do not decide from “we found more” alone. Ask for the changed condition in writing, photos or other evidence, the revised scope, and the exact effect on price and schedule. Approve or reject a written change order before that added work continues, except when immediate safety protection cannot wait.',
  };
  if (/\b(what should|does|should)\b[^.?!]{0,28}\b(contract|proposal|written estimate|agreement)\b[^.?!]{0,20}\b(include|say|have|cover)\b/i.test(t)
      || /\bcontract checklist\b/i.test(t)) return {
    mode:'learn',
    say:'A usable contract makes the job legible: exact scope and materials, exclusions, payment milestones tied to work, change-order approval, permit responsibility, cleanup, schedule assumptions, and separate workmanship and manufacturer warranties. Make sure the legal business name matches the firm you researched, and do not rely on verbal additions.',
  };
  if (/\b(references?|past customers?)\b/i.test(t)
      && /\b(ask for|call|contact|trust|useful|matter|check|verify|what should i ask)\b/i.test(t)) return {
    mode:'learn',
    say:'References are selected by the contractor, so use them as one signal, not a guarantee. Ask permission before contacting anyone, request a project similar to yours, and ask what changed, how communication worked, and whether warranty follow-through was needed. Compare that with public records and broader review patterns.',
  };
  if (/\b(can (?:you|vesta)|does vesta|will (?:you|vesta))\b[^.?!]{0,35}\b(guarantee|promise|assure)\b[^.?!]{0,35}\b(contractor|firm|pro|good|trustworthy|safe|work)\b/i.test(t)
      || /\bguaranteed (?:contractor|pick|recommendation)\b/i.test(t)) return {
    mode:'learn',
    say:'No source can guarantee how a future job will go. Vesta can show why a firm fits from source-linked public evidence and relevant review patterns; you still confirm the live scope, insurance, permit responsibility, availability, and warranty directly. The value is a legible decision, not a promise about the future.',
  };
  if (/\b(red flags?|warning signs?|what should i avoid|deposit|money up front|upfront payment|pressure to pay|cash only|no contract|won(?:'t|’t) put .* in writing)\b/i.test(t)) return {
    mode:'learn',
    say:'Treat pressure as information. Pause if the scope is vague, exclusions are missing, changes stay verbal, payment runs far ahead of documented work, the name on the paperwork does not match the firm, or they resist permit and warranty questions. One concern may be explainable; several together are a reason to stop and compare another firm.',
  };
  if (/\b(how (?:should|do) i read|can i trust|what should i look for in|what matters in|review patterns?|fake reviews?)\b[^.?!]{0,24}\breviews?\b|\breview patterns?\b/i.test(t)) return {
    mode:'learn',
    say:'Read reviews for repeated operating patterns, not the average alone: jobs like yours, recent communication, scope changes, cleanup, warranty follow-through, and how the firm responds when something goes wrong. A glowing review about a different kind of job is weak evidence for yours. Check public registration or license records separately where the trade carries them.',
  };
  if (/\b(permit|who pulls|building department|inspection)\b/i.test(t)) return {
    mode:'learn',
    say:'Permit requirements depend on the town and exact scope, so I will not guess from a chat. Ask the contractor to state in writing whether a permit and inspection are required, who will pull it, and whose name appears on it; then confirm that answer with your town building department before work starts.',
  };
  if (/\b(warrant(?:y|ies)|workmanship guarantee|manufacturer warranty)\b/i.test(t)) return {
    mode:'learn',
    say:'Separate the workmanship warranty from the manufacturer warranty. Get the term, covered work, exclusions, transferability, claim process, and who pays labor or access costs in writing. A long material warranty does not answer who fixes bad installation, so ask for one example of how a workmanship claim is handled.',
  };
  if (/\b(ghosted|no[- ]?show|stopped responding|won(?:'t|’t) call back|disappeared)\b/i.test(t)) return {
    mode:'learn',
    say:'Preserve the paper trail first: contract, scope, payments, photos, and every contact attempt. Send one calm written message naming the unfinished issue and a reasonable response deadline. Do not send more money without a clear documented basis. If safety, an open permit, or a large loss is involved, contact the relevant town office or a qualified local professional.',
  };
  if (/\b(repair or replace|fix or replace|worth repairing|should i replace|can this be repaired)\b/i.test(t)) return {
    mode:'learn',
    say:`That decision needs an inspection, but you can make the comparison disciplined${trade ? ` for the ${trade} work` : ''}: ask what failed, whether the cause is known, what the repair leaves untouched, expected remaining life, warranty on each option, and what evidence would make replacement necessary. Get both scopes in writing before comparing totals.`,
  };
  if (/\bhow many\b[^.?!]{0,20}\b(quote|bid|estimate)s?\b/i.test(t)) return {
    mode:'learn',
    say:'Get enough independent written scopes to expose disagreement, not a ritual number for its own sake. If the first bids describe different work, another bid may help only after you normalize the scope, materials and exclusions. Stop when you understand the major choices and can explain why the selected scope fits the job.',
  };
  if ((followUp || focusMode) && /\b(which|who)\b[^.?!]{0,35}\b(best|better|right for me|should i choose)\b/i.test(t)) return {
    mode:'learn',
    say:'Choose against the job, not a generic winner. Use only the evidence shown for each firm: relevance to this scope, public-record continuity, and review patterns that match what you care about. Then confirm the live facts Vesta cannot know — scope, availability, insurance, permit responsibility and warranty — directly with the finalists.',
  };
  return null;
}

// Product-identity questions carry the trust contract, so the answer cannot vary by model.
// Pay-to-play truth wins even when the speaker also sounds like a contractor; ordinary
// contractor sign-up questions receive the clean Atlas handoff.
export function vestaIdentityRoute(text, contractorSignal = false, postMatch = false){
  const t = String(text || '');
  const promptInjection =
       /\b(ignore|disregard|forget|override)\b[^.?!]{0,35}\b(previous|prior|above|system|instructions?|rules?|prompt)\b/i.test(t)
    || /\b(show|reveal|repeat|print|give me)\b[^.?!]{0,35}\b(system prompt|hidden prompt|instructions?|developer message|secret key)\b/i.test(t);
  if (promptInjection) return {
    mode:'learn',
    say:'I cannot expose private instructions or change the evidence rules. I can still help with the public product: describe the home project, ask how Vesta evaluates a contractor, or ask what evidence a recommendation uses.',
  };
  const namedFirm =
       /\bwhat do you think (?:about|of)\b[^?]{2,70}/i.test(t)
    || /\btell me about\b[^?]{2,70}\b(?:roofing|plumbing|electric|hvac|heating|cooling|painting|masonry|paving|landscap|tree|flooring|windows?|doors?|contractor|company|firm)\b/i.test(t)
    || /\bis\b[^?]{2,55}\b(?:good|reputable|legit|trustworthy)\b/i.test(t);
  if (namedFirm) return {
    mode:'learn',
    say:'I will not invent an opinion about a named firm. If it has a Vesta profile, judge it from the source-linked public record and review patterns shown there; if I do not have that profile in this conversation, I cannot assess it. Confirm insurance and current job readiness directly with the contractor.',
  };
  const payToPlay =
       /\b(pay|paying|paid|payment|money)\b[^.?!]{0,60}\b(recommend|recommendation|rank|placement|listed|feature|pick|show up)\b/i.test(t)
    || /\b(recommend|recommendation|rank|placement|listed|feature|pick|show up)\b[^.?!]{0,60}\b(pay|paying|paid|payment|money)\b/i.test(t)
    || /\b(sponsored|pay[- ]to[- ]play|kickback)\b/i.test(t);
  if (payToPlay) return {
    mode:'learn',
    say:'No — contractors do not pay to be recommended on Vesta. Each profile is built from the public record, including registrations or licenses where the trade carries them, years in the record, and what homeowners’ own reviews actually say. Evidence — never ads or payment — decides the picks, and every pick shows its why.',
  };
  const vettingLimits =
       /\b(background[- ]?check|verify (?:their |the )?(?:insurance|licens)|insurance verified|insured|licensed|registered)\b/i.test(t)
    && /\b(do you|does vesta|are (?:they|the|these)|have (?:they|you)|how do you know|really)\b/i.test(t);
  if (vettingLimits) return {
    mode:'learn',
    say:'Vesta does not run background checks or verify insurance. It reads the public record — state registration or license where applicable, years in the record, and homeowner reviews — and shows the source and why. Insurance and current job readiness must be confirmed directly with the contractor.',
  };
  const definition =
       /\bwhat(?:'s| is)\s+vesta\b/i.test(t)
    || /\bwhat does vesta do\b/i.test(t)
    || /\bexplain vesta\b/i.test(t);
  if (definition) return {
    mode:'learn',
    say:'Vesta is a free Fairfield County homeowner guide built by 4THWALL. Describe the job and it narrows the public record to relevant contractor picks, each with a plain-English why. Contractors cannot buy placement; Vesta shows the evidence it used so you can judge the next step.',
  };
  const method =
       /\bhow (?:do|does) (?:you|vesta)\s+(?:choose|rank|pick|recommend|vet|score|select)\b/i.test(t)
    || /\bwhat (?:decides|determines)\b[^.?!]{0,30}\b(rank|ranking|recommend|pick|order)\b/i.test(t);
  if (method) return {
    mode:'learn',
    say:'Vesta narrows by the job, then reads public registration or license records where applicable, time in the public record, and patterns in homeowner reviews. It does not publish a magic score or let payment move a contractor up. Each recommendation shows the evidence and why it fits.',
  };
  const unevenQuotes =
       /\b(one|this)\s+(?:quote|bid|estimate)\b[^.?!]{0,55}\b(higher|expensive|more|detailed|itemized)\b/i.test(t)
    && /\b(other|cheaper|lower|one[- ]line|vague|less)\b/i.test(t)
    || /\b(cheaper|lower)\s+(?:quote|bid|estimate)s?\b[^.?!]{0,45}\b(one[- ]line|vague|less detail|not detailed)\b/i.test(t);
  if (unevenQuotes) return {
    mode:'learn',
    say:'Those totals are not comparable yet. A detailed proposal is evidence of a legible scope, not proof of better workmanship; a one-line bid may simply omit work. Ask every bidder to itemize the same materials, removal, permits, exclusions, cleanup, change rules, and warranty. If the preferred scope exceeds the budget, ask for a written alternate or safe phasing — not hidden deletions.',
  };
  const priceQuestion = !postMatch && /\b(how much|fair price|what should .* cost|cost to|price for|pricing|compare .* quotes?|is .* quote)\b/i.test(t);
  if (priceQuestion){
    const roof = /\broof|shingle/i.test(t);
    return {
      mode:'learn',
      say: roof
        ? 'A defensible roof comparison starts with size, pitch, tear-off layers, deck repair, material, flashing and warranty. Ask for itemized quotes against the same scope and exclusions before comparing totals; a low bid with missing work is not the cheaper roof.'
        : 'A defensible comparison starts with the exact scope, material, access, removal work, permits and warranty. Ask for itemized quotes against the same scope and exclusions before comparing totals; a low bid with missing work is not the cheaper job.',
    };
  }
  const contractorEntry = /\b(get|getting|be|being)\s+(?:my|our|the|a)?\s*(?:business|company|firm|contractor|pro)?\s*(?:listed|on vesta)\b/i.test(t)
    || /\b(sign|signing)\s+(?:my|our|the|a)?\s*(?:business|company|firm|contractor|pro)?\s*up\b/i.test(t)
    || /\b(join|joining)\s+(?:vesta|the network|as a (?:contractor|pro))\b/i.test(t);
  if (contractorSignal && contractorEntry) return {
    mode:'atlas',
    say:'You’re in the right company, but on the homeowner side. Atlas is the contractor side of 4THWALL: a managed front office and private workspace that keeps the customer, job, owner, action and handoff together. Open Atlas to see how it works and talk directly with the founder about whether your business fits.',
  };
  return null;
}

// Once real picks are on screen, the visitor is no longer asking for generic advice — they
// are testing whether Vesta will invent private facts about those firms. Price and schedule
// are not in the public profile record, so answer the decision method without pretending
// to know either. This also makes repeated follow-ups stable across model generations.
export function vestaFollowupRoute(text, followUp = false, focusMode = false){
  if (!followUp && !focusMode) return null;
  const t = String(text || '');
  if (/\b(cheapest|lowest price|best value|best deal|most affordable|which .* costs? less|compare .* pric|price)\b/i.test(t)) return {
    mode:'learn',
    say:'Vesta does not rank these firms by price because it does not have a live, comparable quote from each one. Ask for itemized quotes against the same scope, materials and exclusions; then compare the totals only after the work is truly equivalent.',
  };
  if (/\b(fastest|soonest|available|availability|schedule|come (?:out|over)|start first|earliest)\b/i.test(t)) return {
    mode:'learn',
    say:'Vesta does not have live access to these firms’ schedules. Contact each one and ask for the earliest site visit plus the earliest realistic start date after scope is confirmed. Availability can change quickly, so the contractor should confirm it directly.',
  };
  return null;
}

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
  // per-instance abuse floor — see api/_ratelimit.mjs (shared NIM pool; fail-open)
  if (!rateOk(req)){ res.statusCode = 429; res.setHeader('Content-Type','application/json'); res.setHeader('Retry-After','30'); return res.end('{"error":"rate"}'); }
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
      const wOut = await callSingleTask(keys, writeupPrompt(), messages);
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
  // Trust-critical public questions and explicit multi-trade projects do not need a model
  // generation before the server can answer them. Running these routes here keeps known
  // truths fast and available during model congestion; the live bank still authorizes any
  // multi-trade resolve. The model remains the flexible path for ordinary diagnosis/intake.
  const preLastUser = [...messages].reverse().find(m => m.role === 'user');
  const preText = String(preLastUser && preLastUser.content || '');
  const PRE_TRADE_ID = 'contractor|plumber|electrician|roofer|painter|landscaper|hvac|mason|carpenter|handyman|builder|paver';
  const preProfessionalBuyer = professionalBuyerSignal(preText);
  const preAtlasSignal = !preProfessionalBuyer && (
       /\b(i|we)\s+(own|run|operate|started)\b[^.?!]{0,26}\b(business|company|shop|crew|firm|contracting)\b/i.test(preText)
    || new RegExp(`\\bi'?m\\s+(a|an)\\s+(${PRE_TRADE_ID})\\b`, 'i').test(preText)
    || new RegExp(`\\b(get|getting|sign|signing)\\s+(my|our)\\s+(business|company|${PRE_TRADE_ID})\\b[^.?!]{0,26}\\b(listed|signed up|up|on)\\b`, 'i').test(preText)
    || /\bmy\s+(business|company|crew|firm)\b[^.?!]{0,26}\b(listed|sign(ed)? up|get on|join)\b/i.test(preText));
  const preEmergency =
       /\b(smell (?:of )?gas|gas smell|fire|sparking|burning outlet|active flood|flooding right now|water (?:is )?(?:pouring|gushing))\b/i.test(preText);
  const sendStatic = (route, deck = null, resolved = null) => {
    const budget = PRICE_QUESTION.test(preText) ? 110 : followUp ? 90 : 65;
    const say = boundSay(sayGuard(route.say, messages, deck), budget);
    const chips = Array.isArray(route.chips)
      ? route.chips.filter(c => typeof c === 'string' && c.trim()).slice(0, 4) : [];
    send({ t:'d', c:say });
    send({ t:'f', say, ask:route.ask || null, chips:chips.length ? chips : null, mode:route.mode, resolved, deck, call:null });
    return res.end();
  };
  if (!preEmergency){
    const preIdentity = vestaIdentityRoute(preText, preAtlasSignal, followUp || focusMode);
    if (preIdentity) return sendStatic(preIdentity);
    const preFollowup = vestaFollowupRoute(preText, followUp, focusMode);
    if (preFollowup) return sendStatic(preFollowup);
    const preDecision = vestaDecisionRoute(preText, messages, followUp, focusMode);
    if (preDecision) return sendStatic(preDecision);
    const preMulti = !followUp && !focusMode && !preAtlasSignal ? multiTradePlan(preText) : null;
    if (preMulti){
      let first = null;
      for (const phase of preMulti.phases){
        for (const job of phase.jobs){
          const candidate = bankValidate(bank, phase.trade, job);
          if (candidate){ first = candidate; break; }
        }
        if (first) break;
      }
      if (first) return sendStatic(
        { mode:'plan', say:preMulti.say },
        first,
        { trade:first.trade, job:first.job, urgency:'routine' },
      );
    }
  }
  // Turn-1 fast-path resolver launches CONCURRENTLY with the talker — by the time the
  // talker's stream finishes, this answer is already waiting (zero added latency). Only
  // consulted if the talker leaves a first-turn fix/plan message unresolved.
  const isTurn1 = !followUp && !focusMode && messages.filter(m => m.role === 'user').length === 1;
  const turn1Promise = isTurn1
    ? callSingleTask(keys, turn1ResolverPrompt(bank), messages).catch(() => null)
    : null;
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
  let bankRejected = false;   // talker resolved something the bank refused → rescue below, never a canned ask
  const rawResolved = parsed.resolved ? JSON.stringify(parsed.resolved).slice(0, 120) : 'null';
  if (parsed.resolved && (typeof parsed.resolved !== 'object' || Array.isArray(parsed.resolved) || !parsed.resolved.trade || !parsed.resolved.job)){
    parsed.resolved = null;
  }
  if (parsed.resolved){
    const v = bankValidate(bank, parsed.resolved.trade, parsed.resolved.job);
    if (v){ deck = v; if (v.emergency) parsed.resolved.urgency = 'emergency'; parsed.resolved.trade = v.trade; parsed.resolved.job = v.job; }
    // A rejected resolve used to inject "Tell me a bit more about what's going on?" right here —
    // measured 7/20 stapling that canned ask onto COMPLETE expert answers (1962-colonial 3/3,
    // AC-quit 3/3: the say even promised "I'll line up the pros" and the turn dead-ended anyway).
    // Now: flag it, let the single-task resolver below rescue the (trade, job); the gated
    // fallback ask after the resolver only fires when the say doesn't own its own next step.
    else { parsed.resolved = null; bankRejected = true; }
  }
  // EMERGENCY DOCTRINE — the structural guarantee (spec: 4thwall-wiki/ops/vesta-live-qa-findings.md).
  // Vesta is NOT dispatch. An emergency turn is safety + a call hand-off — never a resolve into the
  // deck/email pipeline, never a dangling interview question. Enforce it here so no prompt drift can
  // route an active emergency: null resolved/deck/ask/chips regardless of what the model emitted.
  // A "911" mention in an emergency say is the life-safety signal → surface a tap-to-call affordance.
  let emergencyCall = null;
  if (parsed.mode === 'emergency'){
    parsed.resolved = null; deck = null; parsed.ask = null; parsed.chips = null;
  }
  // ATLAS REFERRAL (Drew, 7/18) — the person is a CONTRACTOR or asking about the company itself,
  // not a homeowner with a home problem. Vesta advocates for 4THWALL and hands off to Atlas (the
  // contractor desk). This is never a home-triage turn: no resolve, no deck, and none of the
  // pro-matching resolvers / soft-offers below may fire on it (they'd inject "I'll line up pros").
  // Deterministic backstop: Nemotron (the interview leader) is inconsistent at labeling this novel
  // mode — it often writes a correct Lens/Atlas say but leaves mode "fix", which then skips the
  // handoff CTA AND lets the soft-offer append "I'll line up pros" to a CONTRACTOR. So detect clear
  // FIRST-PERSON contractor identity in the user's own words and force atlas (mirrors the
  // 911/learn/question deterministic guards). Conservative by design — a homeowner ("I have a
  // plumbing problem", "I need a plumber", "my contractor ghosted me") must NEVER match: the
  // own/run branch requires a business noun, and bare trade words only match "I'm a <trade>".
  const atlasLastUser = [...messages].reverse().find(m => m.role === 'user');
  const atlasText = String(atlasLastUser && atlasLastUser.content || '');
  const TRADE_ID = 'contractor|plumber|electrician|roofer|painter|landscaper|hvac|mason|carpenter|handyman|builder|paver';
  const professionalBuyer = professionalBuyerSignal(atlasText);
  const atlasSignal = !professionalBuyer && (
       /\b(i|we)\s+(own|run|operate|started)\b[^.?!]{0,26}\b(business|company|shop|crew|firm|contracting)\b/i.test(atlasText)
    || new RegExp(`\\bi'?m\\s+(a|an)\\s+(${TRADE_ID})\\b`, 'i').test(atlasText)
    || new RegExp(`\\b(get|getting|sign|signing)\\s+(my|our)\\s+(business|company|${TRADE_ID})\\b[^.?!]{0,26}\\b(listed|signed up|up|on)\\b`, 'i').test(atlasText)
    || /\bmy\s+(business|company|crew|firm)\b[^.?!]{0,26}\b(listed|sign(ed)? up|get on|join)\b/i.test(atlasText));
  if (professionalBuyer && parsed.mode === 'atlas'){
    parsed.mode = 'plan';
    parsed.say = 'You are sourcing a trade for a real project, so Vesta is the right side of 4THWALL. I’ll treat this as a scope-and-evidence search: define the work clearly, narrow to relevant public-record profiles, then compare the live scope, schedule, insurance, permit responsibility and warranty directly with the finalists.';
  }
  const isAtlas = !professionalBuyer && (parsed.mode === 'atlas' || atlasSignal) && parsed.mode !== 'emergency';
  if (isAtlas){ parsed.mode = 'atlas'; parsed.resolved = null; deck = null; parsed.ask = null; parsed.chips = null; }
  const identityRoute = parsed.mode !== 'emergency' ? vestaIdentityRoute(atlasText, isAtlas, followUp || focusMode) : null;
  if (identityRoute){
    parsed.mode = identityRoute.mode;
    parsed.say = identityRoute.say;
    parsed.resolved = null;
    deck = null;
    parsed.ask = null;
    parsed.chips = null;
  } else if (isAtlas && !/\bAtlas\b/i.test(String(parsed.say))){
    parsed.say = String(parsed.say).replace(/\s*$/, '') + ' Atlas is the contractor side of 4THWALL, and that is where your next step lives.';
  }
  const followupRoute = !identityRoute && !isAtlas && parsed.mode !== 'emergency'
    ? vestaFollowupRoute(atlasText, followUp, focusMode) : null;
  if (followupRoute){
    parsed.mode = followupRoute.mode;
    parsed.say = followupRoute.say;
    parsed.resolved = null;
    deck = null;
    parsed.ask = null;
    parsed.chips = null;
  }
  const decisionRoute = !identityRoute && !followupRoute && !isAtlas && parsed.mode !== 'emergency'
    ? vestaDecisionRoute(atlasText, messages, followUp, focusMode) : null;
  if (decisionRoute){
    parsed.mode = decisionRoute.mode;
    parsed.say = decisionRoute.say;
    parsed.resolved = null;
    deck = null;
    parsed.ask = decisionRoute.ask || null;
    parsed.chips = decisionRoute.chips || null;
  }
  // MULTI-TRADE COHERENCE — the model sometimes acknowledges three scopes, then collapses the
  // entire project into landscaping. For explicit named phases, sequence them deterministically
  // and resolve only the first phase against the same live bank. Later phases remain in context.
  const multiPlan = !followUp && !focusMode && !isAtlas && parsed.mode !== 'emergency'
    ? multiTradePlan(atlasText) : null;
  if (multiPlan){
    let first = null;
    for (const phase of multiPlan.phases){
      for (const job of phase.jobs){
        const candidate = bankValidate(bank, phase.trade, job);
        if (candidate){ first = candidate; break; }
      }
      if (first) break;
    }
    if (first){
      deck = first;
      parsed.mode = 'plan';
      parsed.resolved = { trade: first.trade, job: first.job, urgency: 'routine' };
      parsed.ask = null;
      parsed.chips = null;
      parsed.say = multiPlan.say;
    }
  }
  // RESOLVED-TURN COHERENCE (the M1 clamp): a resolved turn is a handoff, not an interview.
  // The contract says ask/chips are null and the say is a final reassuring line — but the
  // model leaks a trailing question into a resolved say (seen live 7/12: resolved gutters +
  // "could you tell me what material your fascia is…"), and this path never nulled ask.
  // Enforce both here; if stripping leaves nothing, a canned line from the deck.
  // DIY-procedure guard (M4): a resolved say that walks the homeowner through the repair
  // (lift the tank lid, check the flapper, adjust the chain) both redlines and undercuts the
  // handoff — why call a pro she just told you to fix it yourself? The prompt bans it; Nemotron
  // ignores the ban ~1/3 (measured 7/12). Strip those sentences here — a component-fiddle verb
  // aimed at a named part is the tell. Safety mitigations ("shut the water at the valve") don't
  // match (no fiddle verb) and stay; emergency turns never reach this path.
  // verbs are stem-matched (adjust→adjusting, replace→replacing) — a tense the model reaches
  // for constantly; a fixed word-list let "adjusting the chain" through (measured 7/12).
  const resolveClamp = () => {
    if (!parsed.resolved || !deck) return;
    parsed.ask = null; parsed.chips = null;
    let parts = String(parsed.say).split(/(?<=[.!?])\s+/);
    while (parts.length && /\?\s*$/.test(parts[parts.length - 1])) parts.pop();
    parts = parts.filter(s => !DIY_PROC.test(s));
    parsed.say = parts.join(' ').trim()
      || `Got it — I'll line up vetted ${deck.tradeLabel.toLowerCase()} pros for ${deck.label} now.`;
    // never surface the raw bank id to the homeowner ("covers under solar-or-battery-backup") —
    // swap any literal job-id for its human label
    if (deck.job) parsed.say = parsed.say.replace(new RegExp(deck.job, 'gi'), deck.label);
  };
  resolveClamp();
  // Duty separation: past the question budget, an unresolved fix/plan turn gets a second
  // opinion from the single-task resolver (GLM-first — the instruction-follower). Its pick
  // still passes the same bank gate; a null keeps the conversation alive as before.
  let resolverUsed = 'no';
  const userTurns = messages.filter(m => m.role === 'user').length;
  // Turn-1 fast-path adoption: talker left a fix/plan first message unresolved. Guards:
  // never on an emergency-labeled turn or a 911 say (doctrine), never an emergency-tagged
  // job (an active crisis is the talker's call, not a fast-path's), same bank gate as always.
  const rawMode = String(parsed.mode || 'none');
  if (turn1Promise && !isAtlas && !parsed.resolved && parsed.mode !== 'emergency' && parsed.mode !== 'learn' && !/\b911\b/.test(String(parsed.say))){
    try {
      const rOut = await turn1Promise;
      const rj = rOut && !rOut.error ? extractJSON(rOut.raw) : null;
      const v = rj && rj.trade && rj.job ? bankValidate(bank, rj.trade, rj.job) : null;
      // Emergency-tagged adoption (2026-07-20): the blanket skip left equipment-down turns
      // (AC dead in heat, no heat in mild weather — urgent, not dangerous) unresolved 1-2/3.
      // Real crises are already carved out by this block's own guards (mode=emergency never
      // enters; a 911 say never enters) — inside those rails an emergency-tagged job is the
      // bank's own answer for "this can't wait," so adopt it with the emergency urgency.
      if (v){
        deck = v; resolverUsed = v.emergency ? 't1hit:emergency' : 't1hit';
        parsed.resolved = { trade: v.trade, job: v.job, urgency: v.emergency ? 'emergency' : 'routine' };
        resolveClamp();
      }
      else resolverUsed = 't1miss:' + (rOut && rOut.error ? 'err=' + rOut.error
        : rj ? 'rj=' + JSON.stringify(rj).slice(0, 80)
        : 'raw=' + String(rOut && rOut.raw || '').slice(0, 80).replace(/\n/g, '⏎'));
    } catch { resolverUsed = 't1err'; }
  }
  // …and the same rescue fires on TURN 1 when the talker's own resolve was bank-rejected
  // (bankRejected): the intent to match is proven, only the id was wrong — a second opinion
  // beats a canned re-ask (measured 7/20). The 911-say guard mirrors the t1 fast-path.
  if (!followUp && !focusMode && !isAtlas && !parsed.resolved && (userTurns >= 2 || bankRejected)
      && parsed.mode !== 'learn' && parsed.mode !== 'emergency' && !/\b911\b/.test(String(parsed.say))){
    try {
      const rOut = await callSingleTask(keys, resolverPrompt(bank), messages);
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
    resolveClamp();  // the talker's say was mid-interview when the resolver overrode it — same coherence rule
  }
  // Gated fallback (replaces the old unconditional hatch): still unresolved after a rejected
  // resolve AND the say doesn't own its next step → only then ask for more. A say that already
  // offers/promises ("I'll line up…", "whenever you're ready") stands alone — the soft-offer
  // guarantee below owns question-shaped turns.
  if (bankRejected && !parsed.resolved && !parsed.ask
      && !/(line up|line them up|find (you|the right)|match you|get you connected|whenever you|when you'?re ready|say the word|i'?ll (get|handle|take|line))/i.test(String(parsed.say))){
    parsed.ask = "Tell me a bit more about what's going on?";
  }
  // TRUST-STORY GUARANTEE (2026-07-20, same pattern as the M5 soft-offer): "why should I
  // trust you / are these paid listings?" is a trust-deciding question, and the model
  // reaches for the WHO-VESTA-IS story only ~1/3 — the rest answer in humble-neighbor
  // voice with no evidence claim. When the question is trust-shaped and the say carries
  // none of the story, append the one canonical sentence. Output-aware: a say that
  // already tells the story is never touched; a missed detection = today's behavior.
  {
    const tLast = [...messages].reverse().find(m => m.role === 'user');
    const tText = String(tLast && tLast.content || '');
    const trustShaped = /\b(why (should|would) (i|we) trust|can (i|we) trust|how do (i|we) know (you|these|this)|are (you|these|they) legit|trust (you|your|these)|pay(ing)? (you )?to be (listed|recommended|on here)|paid (you )?to be (listed|here)|sponsored|kickback)\b/i.test(tText);
    const storyTold = /public record|evidence|nothing to buy|no ads|pay.?to.?play|cannot (buy|pay for) placement/i.test(String(parsed.say));
    if (trustShaped && !storyTold && parsed.mode !== 'emergency' && !isAtlas){
      parsed.say = String(parsed.say).replace(/\s*$/, '') + ' And for what it’s worth: every pick I make is built from the public record — real registrations and homeowners’ own reviews, never ads — and no contractor can pay to be recommended here.';
    }
  }
  // The 911 tap-to-call rides on the SAY, not the mode label — the model sometimes classifies
  // a gas/sparking turn "fix" while its say correctly commands 911 (seen live 7/12). If Vesta
  // told them to call 911 and no match is landing, put the button under her words.
  if (!deck && /\b911\b/.test(String(parsed.say))) emergencyCall = '911';
  // SOFT-OFFER GUARANTEE (M5): a "is this normal? / why does…?" question that stays unresolved
  // must end with the offer to line up pros — the learn-mode contract. Nemotron mislabels these
  // fix ~half the time, dropping the offer, so this rides on the user's QUESTION SHAPE, not the
  // mode label. Only when nothing else owns the next step (no resolve, no ask, no 911) and the
  // say doesn't already offer — append once. Never on emergencies.
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const lastText = String(lastUser && lastUser.content || '').trim();
  const questionShaped = /\?\s*$/.test(lastText) || /^(is|are|does|do|should|why|what|how|can|could|would|will|when)\b/i.test(lastText);
  // A normalcy/curiosity question ("is this normal?", "should I worry?") is LEARN, not an
  // interview — but the model sometimes attaches a triage ask anyway (mode mislabeled fix,
  // ~half the time). When it's clearly a normalcy question and nothing resolved, drop the ask
  // so the soft offer below lands: teach + offer, never interrogate a curiosity.
  const learnShaped = /\b(is|are|it'?s)\b[^?]*\bnormal\b/i.test(lastText) || /\bnormal (for|to|that|when|if)\b/i.test(lastText)
    || /\bis (it|this|that)\b[^?]*\b(bad|a problem|serious|dangerous|worth worrying)\b/i.test(lastText)
    || /\bshould i (be )?(worr|concern)/i.test(lastText) || /\bis (it|this|that) (supposed|meant) to\b/i.test(lastText);
  if (learnShaped && !parsed.resolved && !emergencyCall && parsed.mode !== 'emergency'){ parsed.ask = null; parsed.chips = null; }
  if (questionShaped && !isAtlas && !parsed.resolved && !parsed.ask && !emergencyCall && parsed.mode !== 'emergency'){
    if (!/(line up|line them up|find (you |the right)|get you connected|match you|whenever you|when you'?re ready|ready to go|say the word)/i.test(String(parsed.say))){
      parsed.say = String(parsed.say).replace(/\s*$/, '') + ' Whenever you’re ready, I can line up the right pros for exactly this.';
    }
  }
  // chips must be real tappable strings — a model-emitted object renders as "[object Object]"
  // and an empty array renders an empty chip row (both seen live); filter, and null when empty.
  // ── THE SAY GOVERNOR (hemisphere-symmetry audit, 2026-07-20) ─────────────────────────
  // Until now Vesta's redlines (no dollars, no dispatch claims, honest vetting) were
  // prompt-only — the homeowner hemisphere had governed STRUCTURE (bankValidate, clamps)
  // but ungoverned SPEECH, while Atlas had the reverse. This is the missing output-side
  // net: sentence-level strip (Vesta's established pattern — resolveClamp), applied to
  // EVERY say before the final frame. The client reconciles the bubble to the final say
  // (typer.finish(final.say)), so what survives here is what the homeowner sees.
  const guarded = sayGuard(String(parsed.say), messages, deck);
  const wordBudget = parsed.mode === 'emergency' ? 90
    : PRICE_QUESTION.test(lastText) ? 110
    : followUp ? 90
    : focusMode ? 80
    : 65;
  const bounded = boundSay(guarded, wordBudget);
  const guardTripped = bounded !== String(parsed.say);
  parsed.say = bounded;
  const chips = Array.isArray(parsed.chips)
    ? parsed.chips.filter(c => typeof c === 'string' && c.trim()).slice(0, 4) : [];
  send({ t:'f',
    say: parsed.say,
    ask: parsed.ask || null,
    chips: chips.length ? chips : null,
    mode: ['emergency','fix','plan','learn','atlas'].includes(parsed.mode) ? parsed.mode : 'fix',
    resolved: parsed.resolved || null,
    deck,
    call: emergencyCall,
  });
  // one diagnostic line per turn (no user text): which model served, mode, and the outcome —
  // the only way to attribute a bad production turn to a specific model in the chain
  console.log(`triage: model=${servedBy} followUp=${followUp} turns=${userTurns} rawMode=${rawMode} resolved=${parsed.resolved ? parsed.resolved.trade + '/' + parsed.resolved.job : 'null'} raw=${rawResolved} resolver=${resolverUsed} salvaged=${!!parsed._salvaged} guard=${guardTripped ? 'stripped' : 'clean'}`);
  res.end();
}
