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
const MODEL = process.env.TRIAGE_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
const IS_NEMOTRON = /nemotron/.test(MODEL);
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const FIRST_TOKEN_CEILING_MS = 20000;  // no first byte by then → this key has failed, rotate
const TOTAL_CEILING_MS = 55000;        // hard stop under the function's 60s maxDuration

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

function loadKeys(){
  const keys = [];
  for (const name of ['NVIDIA_TRIAGE_KEY_1','NVIDIA_TRIAGE_KEY_2','NVIDIA_TRIAGE_KEY_3','NVIDIA_TRIAGE_KEY_4','NVIDIA_TRIAGE_KEY_5']){
    const v = process.env[name];
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
function bankValidate(bank, trade, job){
  const jobs = bank[trade]; if (!jobs) return null;
  // normalize before rejecting: models copy the prompt's "*" emergency marker into the id
  // (Nemotron does — caught 2026-07-07). A reject must mean a WRONG answer, not a format quirk.
  const clean = String(job || '').replace(/\*+$/,'').trim();
  const row = jobs.find(j => j.job === clean); if (!row) return null;
  const label = clean.replace(/-/g,' ');
  return { trade, job: clean, label, emergency: row.emergency, pct: row.pct, tradeLabel: TRADE_LABEL[trade] || trade };
}

// ── the system prompt (mirrors the locked prototype; bank injected live) ──
function systemPrompt(bank){
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
- "say": 2-4 warm, genuinely helpful sentences — teach, don't just acknowledge. When you can, weave in: what the symptom USUALLY indicates, what a good pro will likely check first, and how urgent it is. You may add ONE practical "in the meantime" note when it helps (especially safety: shut the water off at the valve, don't touch a sparking outlet, leave if you smell gas). THE BALANCE: as useful as a knowledgeable neighbor who's seen this before — but never REDLINING. Redlining = a definitive diagnosis, step-by-step repair instructions, or any price/timeline promise. Stay hedged ("usually", "often", "likely", "a pro will want to confirm") and always land on the idea that a pro should assess it.
- "mode": classify the conversation every turn.
  emergency = danger or active damage right now. Resolve in ONE turn.
  fix = something is wrong but not urgent. The core triage case.
  plan = a future project ("this spring", "thinking about", "getting quotes"). NEVER ask urgency questions. Once the job is known, RESOLVE — do not gather scope details (size, length, material, brand, budget, timing); those are the pro's questions, not yours. Your final "say" is patient and no-pressure — they're early, and that's fine.
  learn = they're asking a question, not hiring ("is this normal?", "what does this usually involve?"). Answer genuinely within the redlining rules, keep resolved null, and END your "say" with a soft offer to line up the right pros whenever they're ready. If they take you up on it, the mode becomes fix or plan.
- WHEN TO ASK vs RESOLVE — run this test before every "ask": would the answer change the trade, the job, or the urgency? If not, do NOT ask — resolve to your best read. Size, length, square footage, material, brand, color, budget, and timing NEVER change the (trade, job) — never ask about them. If two jobs route to the same kind of pro anyway, pick the closer one and resolve. HARD CAP: 3 questions per conversation; at the cap, resolve to your best read or offer a final two-option chip choice.
- "ask": ONE short discriminating question if you are not yet sure which trade/job — else null.
- "chips": 2-4 short tappable answers to your "ask" (e.g. ["Under a bathroom","Under the roofline"]) — else null. When you offer chips, your "say" must make clear WHY these particular options are the ones that matter — the expert distinction they draw out (e.g. "where the stain sits is what separates a roof leak from a plumbing leak, so it points me to the right pro"). Tailored, expert reasoning is what Vesta is known for; never offer bare options without the thinking behind them.
- "resolved": fill ONLY when you are confident of a real (trade, job) from the bank. Use the EXACT job-id (no *). Set urgency "emergency" for * jobs or clear emergency language. When resolved, "say" is your final reassuring line and "ask"/"chips" must be null.
- Emergencies (active leak, burst pipe, sparking, no heat in winter): mode "emergency", resolve in ONE turn, do not ask extra questions.
- Ambiguous water-from-ceiling (a stain, dampness — NOT actively flowing): ask whether it's under a bathroom/plumbing or under the roofline BEFORE resolving.
- If the input is off-topic or not a home problem: gently redirect once in "say", resolved null.
- Never mention firm names, ratings, or counts. You route to matches; you don't list them.`
  + (IS_NEMOTRON ? `

EMERGENCY COMMITMENT — THIS RULE OUTRANKS EVERY OTHER RULE:
When the situation is an active emergency (water actively flowing/pouring, burst pipe, sewage backing up, sparking or burning smell, gas smell, no heat in freezing weather), you MUST fill "resolved" THIS TURN with your best (trade, job) from the bank, "ask" and "chips" null. Asking ANY question during an active emergency is a failure — the homeowner needs a pro dispatched, not an interview. You do not need certainty; you need the best read. Commit. The pro confirms the rest on site.` : '');
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

function extractJSON(text){
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1 || e < s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

// Streamed model call with key rotation. onDelta receives say-text as it generates.
// Returns { raw } on success or { error } after every key has failed.
async function callModelStreaming(keys, system, messages, onDelta){
  const body = JSON.stringify({
    model: MODEL, stream: true,
    messages: [{ role:'system', content: system }, ...messages],
    temperature: 0.35, max_tokens: 360,
    ...(IS_NEMOTRON ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  });
  let lastErr = 'no keys';
  for (const key of keys){
    const ctl = new AbortController();
    let firstTimer = setTimeout(() => ctl.abort(), FIRST_TOKEN_CEILING_MS);
    const totalTimer = setTimeout(() => ctl.abort(), TOTAL_CEILING_MS);
    let raw = '', gotBytes = false;
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
            if (delta){ raw += delta; feed(delta); }
          } catch { /* partial SSE frame — ignore */ }
        }
      }
      clearTimeout(totalTimer);
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
  let messages;
  try {
    const raw = await new Promise((resolve, reject) => {
      let b = ''; req.on('data', c => { b += c; if (b.length > 20000) reject(new Error('too big')); });
      req.on('end', () => resolve(b)); req.on('error', reject);
    });
    messages = JSON.parse(raw).messages;
  } catch { res.statusCode = 400; return res.end('{"error":"bad json"}'); }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 8
      || !messages.every(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 1200)){
    res.statusCode = 400; return res.end('{"error":"bad messages"}');
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let bank;
  try { bank = await getBank(); }
  catch { send({ t:'e', error:'bank' }); return res.end(); }

  const out = await callModelStreaming(keys, systemPrompt(bank), messages, text => send({ t:'d', c:text }));
  if (out.error){ send({ t:'e', error: out.error }); return res.end(); }

  const parsed = extractJSON(out.raw);
  if (!parsed || typeof parsed.say !== 'string'){ send({ t:'e', error:'bad model json' }); return res.end(); }

  // the final authority: validate resolved against the live bank (the triageEnter gate)
  let deck = null;
  if (parsed.resolved && parsed.resolved.trade && parsed.resolved.job){
    const v = bankValidate(bank, parsed.resolved.trade, parsed.resolved.job);
    if (v){ deck = v; if (v.emergency) parsed.resolved.urgency = 'emergency'; parsed.resolved.job = v.job; }
    else { parsed.resolved = null; parsed.ask = parsed.ask || "Tell me a bit more about what's going on?"; }
  }
  send({ t:'f',
    say: parsed.say,
    ask: parsed.ask || null,
    chips: Array.isArray(parsed.chips) ? parsed.chips.slice(0, 4).map(String) : null,
    mode: ['emergency','fix','plan','learn'].includes(parsed.mode) ? parsed.mode : 'fix',
    resolved: parsed.resolved || null,
    deck,
  });
  res.end();
}
