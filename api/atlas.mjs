// /api/atlas — THE ATLAS DESK BRAIN. A contractor-scoped conversational model, bounded by
// the Front Desk Knowledge Pack (4thwall-wiki/business/front-desk-knowledge.md §1–8). It
// mirrors /api/triage's architecture (NVIDIA Nemotron + key rotation, keys shared) but is
// SIMPLER: no firm-bank resolution. It returns ONE plain validated JSON object
//   { say: string, screen: string|null }
// The `say` is claim-safe by construction (the pack is the whole system prompt) AND by
// server-side post-validation (§9 banned list — belt + suspenders; a tripped answer is
// replaced by the honest deflection, never shipped). The Atlas desk UI animates the `say`
// client-side (letter reveal) and assembles the named `screen` deterministically — the
// model NEVER emits numbers, UI, or claims beyond the pack.
//
// screen ∈ office | room:lead|storm|camp|book|follow|reviews|local|briefs
//          | sim | offer | lens | fitcall | numbers | faq | contact | null
//
// KEYS: NVIDIA_TRIAGE_KEY_1..5 (shared account-level pool; never logged, never echoed).

const MODEL = process.env.TRIAGE_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
const MODEL_FALLBACK = process.env.TRIAGE_MODEL_FALLBACK || 'z-ai/glm-5.2';
const MODELS = MODEL_FALLBACK && MODEL_FALLBACK !== MODEL ? [MODEL, MODEL_FALLBACK] : [MODEL];
const isNemotron = m => /nemotron/.test(m);
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const FIRST_TOKEN_CEILING_MS = 20000;
const TOTAL_CEILING_MS = 55000;

function loadKeys(){
  const keys = [];
  for (let i = 1; i <= 5; i++){
    const v = process.env['NVIDIA_TRIAGE_KEY_' + i] || process.env['nvidiakey' + i];
    if (v && v.startsWith('nvapi-')) keys.push(v);
  }
  return keys;
}

// ── the valid appless surfaces the desk may open (the UI assembles these deterministically) ──
export const SCREENS = new Set([
  'office','sim','offer','lens','fitcall','numbers','faq','contact','vesta',
  'room:lead','room:storm','room:camp','room:book','room:follow','room:reviews','room:local','room:briefs',
]);

// ── the honest deflection (pack law 2): out-of-pack, oversharing probes, or a tripped answer ──
export const DEFLECT = 'That one deserves a person, not a guess — book the 20-minute fit call and ask the founder directly.';

// ── §9 banned list, server-side. A tripped `say` is replaced by DEFLECT, never shipped.
//    "not a software seat" is the pack's own approved framing; the negated form stays legal.
export function claimSafe(say, echoNums){
  const t = String(say);
  if (/AI[- ]powered/i.test(t)) return false;
  if (/\breceptionist\b/i.test(t)) return false;
  if (/\bplatform\b/i.test(t)) return false;
  if (/\bsoftware\b/i.test(t) && !/not a software/i.test(t)) return false;
  if (/\bcertified\b/i.test(t)) return false;
  if (/\bConnect\b(?! the tools)/.test(t)) return false;
  if (/\b(synergy|seamless|game-changing|revolutioni[sz]e|leverage|streamline)\b/i.test(t)) return false;
  if (/!/.test(t)) return false;                                // no exclamation marks (voice.md)
  if (/\$|\b1,?500\b/.test(t)) return false;                    // fit-call posture: never a price figure
  // any bare performance number that isn't the one hedged claim (15s) or the standing terms
  // (20-min call, 30-day guarantee, 463 Vesta profiles) is an unreceipted claim → deflect.
  // Two measured false-positives softened 7/18 (a storm-season follow-up deflected 3/4):
  //   - "24/7" is the desk's own deterministic coverage copy — strip the idiom before scanning
  //   - a number the CONTRACTOR typed themselves (crew size, lead counts) is THEIR fact, not
  //     our claim — echoing it back is conversation, not an unreceipted promise (echoNums =
  //     digits harvested from the user's own turns; absent → strict scan, so the battery's
  //     single-arg calls keep their teeth)
  const nums = t.replace(/\b24\/7\b/g, '').match(/\d+/g) || [];
  const allow = new Set(['4','15','20','30','463']);
  if (echoNums) for (const n of echoNums) allow.add(String(n));
  for (const n of nums) if (!allow.has(n)) return false;
  return true;
}

function systemPrompt(){
  return `You are the front desk of 4THWALL, speaking to a CONTRACTOR (a homeowner-facing trades business owner — roofing, HVAC, plumbing, electrical, paving, lawn, painting, masonry). You are an exceptional, warm, certain advocate for the company — an operator who has watched the trade bleed and knows exactly how to help. You sell by being genuinely useful and honest, never by hype.

You may ONLY say what is in the KNOWLEDGE below. If asked something not covered — internals, strategy, roadmap, algorithm details, margins, "how much do you make", anything you don't have a grounded answer for — do NOT guess. Give the honest deflection and point to the fit call.

═══ KNOWLEDGE (everything you may say) ═══

WHO WE ARE: 4THWALL is a Stamford, Connecticut company, founder-led, with one belief — good work should leave evidence. We build both sides of home-service trust: the front office that runs a contractor's business around the work (Atlas), the free workspace that lets a contractor own their record (Lens), and the guide homeowners use to choose with evidence instead of ads (Vesta). One system, three surfaces.

ATLAS (your main subject — the contractor's front office): A managed front office, SMS-first. When a call is missed, the customer gets a text back in YOUR name — your prices, your service area — within moments. It captures what they need, books the estimate if you want, sends reminders, follows up on quotes, asks for the review when the job closes, and runs seasonal and storm campaigns to your past customers. You keep your number; you see everything live in your own private channel. Supported inbound texts and missed-call follow-ups typically get a first reply in 15 seconds after go-live (keep those exact hedges: "supported", "typically", "after go-live"). Every month ends with a receipt: leads answered, response times, estimates booked — measured by the system, not claimed by us. If asked who runs it: it's managed — we operate it, you watch it work; a person answers for it, the founder.
The rooms of the office (each maps to a screen you can open): Lead Response, Storm Mode, Seasonal Campaigns, Booking, Follow-up, Review Generation, Local Discovery, Operator Briefs.

LENS (free, beta): 4THWALL's free, private trust workspace for contractors. Connect the tools you already run, review every fact your operating record supports — each source-labeled and correction-capable — and control exactly what a homeowner could see. Nothing publishes without you. Free to start at /lens.

VESTA (the homeowner side): a free guide to Fairfield County contractors, matching homeowners against 463 evidence-backed profiles built from the public record, with the why behind each pick. No ads, no pay-to-play. Contractors cannot pay for placement — Vesta orders by evidence, that's the whole point.

IF THE PERSON IS A HOMEOWNER (they have a home problem or need a contractor — a leaking roof, a dead furnace, "can you send someone" — rather than running a trades business): Atlas is not for them and you do not dispatch anyone. Warmly say Vesta is the side built for them and open the "vesta" screen — that IS the help. Never triage their home problem here, never guess at their repair, and never send a homeowner to the fit call.

THE FLYWHEEL (say ONLY as customer benefit, never as our strategy): Atlas runs your front office, so every response and close is real recorded work. That record becomes evidence — measured, source-labeled. Lens puts you in control of it. Vesta uses evidence, never ads, to point homeowners at the right firm. Better work wins more work; both sides stop guessing.

PRICING (the fit-call posture — NEVER state a dollar figure): Atlas is a managed service, not a software seat — the price follows the size of the front office we run for you, set on a 20-minute fit call in plain numbers. No setup fee, no contract, nothing metered, everything included. If we're not the right fit, we'll say so first. The guarantee: if the first month's receipt doesn't justify the fee, fire us — thirty days, no contract.

FAQ:
- Do you have clients? → We're early, deliberately. Founding-partner terms exist for exactly that reason: you get the founder's full attention and the longest record in the system. The demo is live right now; the fit call is where we show it working.
- Better than Angi / Thumbtack? → Structural, never disparaging: they sell the same lead to several contractors — their revenue is the auction. We run one contractor's front office and get paid when it runs well. Your customers are never resold, ever.
- Is this AI / a bot? → Honest: parts of this site and the service are automated — we build the system ourselves. Where it matters you get a person: the fit call is with the founder.
- Data? → Each client's data is isolated to their own account; no client's data is visible to another. Records belong to the people they're about; contractors control theirs through Lens.

═══ HARD RULES ═══
- NEVER use: "AI-powered", "software"/"platform"/"receptionist" as labels for us, "certified", "Connect" as a product name, or the words synergy/seamless/game-changing/revolutionize/leverage/streamline. Never use an exclamation mark.
- NEVER state a price or dollar figure, or any performance number other than the hedged "15 seconds" line. Pricing → the fit call.
- NEVER disparage a competitor by name. NEVER discuss margins, roadmap, strategy, or how the matching works.
- Keep replies SHORT — two or three sentences, an operator's economy. End by inviting the natural next step.

═══ OUTPUT (STRICT) ═══
Return ONLY one JSON object, no prose, no markdown:
{"say": string, "screen": string|null}
- say: your spoken reply, following every rule above.
- screen: open an appless surface when it fits, else null. Exactly one of:
  "office" (they want the whole system / what Atlas does) · "room:lead" "room:storm" "room:camp" "room:book" "room:follow" "room:reviews" "room:local" "room:briefs" (a specific capability) · "sim" (show the missed-call recovery happening) · "offer" (pricing / how it works commercially) · "lens" (the free workspace) · "vesta" (the person is a HOMEOWNER looking for a contractor — open the homeowner guide) · "fitcall" (they're ready to talk / book a call) · "numbers" (they're weighing the cost of the problem — what missed calls / slow replies / storm season are costing them, or whether to hire an office person; the calculators let them compute it from their OWN inputs) · "faq" (a logistics or "what's the catch" question — what's included, is it another tool to learn, does it answer calls, CRM fit, how fast it goes live, how to cancel) · "contact" (they want to send a message or reach a person another way, short of booking the call) · null (pure conversation).
- When you open "numbers", the calculator produces the figures from the contractor's own sliders — you still state NO number yourself; introduce it and let them move the sliders.
Choose the screen that best serves what they just asked; when unsure, null.`;
}

// buffered model call with key + model rotation (no client streaming — the say is fully
// validated before anything reaches the browser; the UI animates the reveal itself)
async function generate(keys, messages){
  const system = systemPrompt();
  const startAt = (Math.random() * keys.length) | 0;
  for (const model of MODELS){
    const body = JSON.stringify({
      model, stream: false,
      messages: [{ role:'system', content: system }, ...messages],
      temperature: 0.4, max_tokens: 480,
      ...(isNemotron(model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    });
    for (let ki = 0; ki < keys.length; ki++){
      const key = keys[(startAt + ki) % keys.length];
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TOTAL_CEILING_MS);
      try {
        const r = await fetch(ENDPOINT, { method:'POST', signal: ctl.signal,
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' }, body });
        clearTimeout(timer);
        if (!r.ok){
          if (r.status === 401 || r.status === 429 || r.status >= 500) continue;   // rotate
          break;                                                                    // next model
        }
        const j = await r.json();
        const raw = j.choices?.[0]?.message?.content || '';
        if (raw.trim().length >= 2) return raw;
      } catch { clearTimeout(timer); continue; }
    }
  }
  return null;
}

// tolerant JSON extraction (models wrap in prose / fences / partials)
export function extractJSON(text){
  if (!text) return null;
  const t = String(text).replace(/```[a-z]*|```/gi, '');
  const s = t.indexOf('{');
  if (s === -1) return null;
  // try progressively longer balanced slices from the first brace
  for (let e = t.length; e > s; e--){
    if (t[e-1] !== '}') continue;
    try { return JSON.parse(t.slice(s, e)); } catch { /* keep shrinking */ }
  }
  return null;
}

export const config = { supportsResponseStreaming: false };

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

  let messages;
  try {
    const raw = await new Promise((resolve, reject) => {
      let b = ''; req.on('data', c => { b += c; if (b.length > 20000) reject(new Error('too big')); });
      req.on('end', () => resolve(b)); req.on('error', reject);
    });
    messages = JSON.parse(raw).messages;
  } catch { res.statusCode = 400; res.setHeader('Content-Type','application/json'); return res.end('{"error":"bad json"}'); }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 14
      || !messages.every(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 3000)){
    res.statusCode = 400; res.setHeader('Content-Type','application/json'); return res.end('{"error":"bad messages"}');
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  // model outage → the honest deflection, never a dead end (the desk's deterministic floor
  // lives in the client; this keeps the API contract intact even when the pool is down)
  if (!alive){ res.statusCode = 200; return res.end(JSON.stringify({ say: DEFLECT, screen: 'fitcall', off: true })); }

  // numbers the contractor typed themselves are safe to echo back (see claimSafe)
  const echo = new Set();
  for (const m of messages) if (m.role === 'user')
    for (const n of (String(m.content).match(/\d+/g) || [])) echo.add(n);

  let raw = null;
  try { raw = await generate(keys, messages); } catch { /* fall through */ }
  let parsed = raw ? extractJSON(raw) : null;

  // one fresh regeneration before deflecting — a guard trip is usually a phrasing the model
  // doesn't repeat (measured 7/18: a natural storm-season follow-up deflected 3/4 without
  // this; the clean generations prove the answer is there). Never retries a safe answer.
  let retried = false;
  if (raw && (!parsed || typeof parsed.say !== 'string' || !claimSafe(parsed.say, echo))){
    retried = true;
    try { raw = await generate(keys, messages); } catch { /* fall through */ }
    const second = raw ? extractJSON(raw) : null;
    if (second && typeof second.say === 'string' && claimSafe(second.say, echo)) parsed = second;
  }

  let say = parsed && typeof parsed.say === 'string' ? parsed.say.replace(/<unk>/g, '').trim() : '';
  let screen = parsed && typeof parsed.screen === 'string' && SCREENS.has(parsed.screen) ? parsed.screen : null;

  // the final authority: anything the pack forbids never ships. A tripped or empty answer
  // becomes the honest deflection + the fit-call door — the desk never fabricates.
  if (!say || !claimSafe(say, echo)){ say = DEFLECT; screen = 'fitcall'; }

  console.log(`atlas: ${parsed ? (claimSafe(parsed.say||'', echo) ? 'ok' : 'unsafe→deflect') : 'nojson→deflect'} retried=${retried} screen=${screen||'null'}`);
  res.statusCode = 200;
  return res.end(JSON.stringify({ say, screen }));
}
