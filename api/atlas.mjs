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
import { rateOk } from './_ratelimit.mjs';
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

// ── deflect must land on a screen that ANSWERS, never a dead end (Drew 7/18: "fix the
// deflect dead end"). The say still offers the human path; the screen keeps them served:
// contractors get the FAQ (the self-serve answers), homeowners get Vesta (their side).
export const cleanAud = v => (v === 'contractor' || v === 'homeowner') ? v : null;
export const deflectScreenFor = aud => aud === 'homeowner' ? 'vesta' : 'faq';

// ── the visitor's standing position — screen key → the label the prompt speaks ──
export const WHERE_LABEL = {
  'office':'the office overview', 'sim':'the missed-call demo', 'offer':'the offer (pricing) screen',
  'lens':'the Your Record screen', 'fitcall':'the fit-call screen', 'numbers':'the calculators',
  'faq':'the common-questions screen', 'contact':'the contact screen', 'vesta':'the Vesta (homeowner) screen',
  'room:lead':'the Lead Response room', 'room:storm':'the Storm Mode room',
  'room:camp':'the Seasonal Campaigns room', 'room:book':'the Booking room',
  'room:follow':'the Follow-up room', 'room:reviews':'the Review Generation room',
  'room:local':'the Local Discovery room', 'room:briefs':'the Operator Briefs room',
};

// ── the parameterized calculator (Rung 2, Drew 7/18): when the model opens "numbers" it may
// seed the sliders with figures the CONTRACTOR STATED — extractive, never invented (prompt
// law), and structurally bounded here: every arg is clamped to its slider's real [min,max],
// unknown keys are dropped, panel is whitelisted. Worst case is a visibly draggable preset.
// Ranges mirror the sliders in atlas-next.html's revenueHTML() exactly.
export const CALC_ARGS = {
  panel: ['missed', 'storm', 'office'],
  job_value: [1000, 60000],  leads_per_week: [2, 60],   response_minutes: [5, 480],
  close_rate_pct: [5, 70],   after_hours_pct: [10, 70],
  storm_events: [1, 20],     leads_per_storm: [5, 100], storm_job_value: [500, 30000],
  storm_close_pct: [5, 60],  dropped_pct: [10, 80],
  office_leads_per_week: [2, 80], wage_per_hour: [18, 55], office_hours_week: [10, 45],
};
export function cleanArgs(a){
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {};
  for (const [k, v] of Object.entries(a)){
    const spec = CALC_ARGS[k];
    if (!spec) continue;
    if (k === 'panel'){ if (spec.includes(v)) out.panel = v; continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = Math.min(spec[1], Math.max(spec[0], Math.round(n)));
  }
  return Object.keys(out).length ? out : null;
}

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
  // ── fabrication classes, measured live 2026-07-20 (cred probe): under adversarial pressure
  //    the model invented personhood ("a real person here to help you", 3/3), spelled-out
  //    price magnitudes ("low- to mid-thousands per month" — no digits, so the scan below
  //    missed it), a pay-per-lead pricing model, client approval/learning workflows, Jobber
  //    integration mechanics, and an "Atlas Partner" label on Vesta. None exist. The router
  //    owns the questions; this lint catches the same lies drifting into ANY answer.
  if (/\breal (person|human)\b/i.test(t)) return false;                     // personhood claim
  if (/\b(i'?m|i am) (a )?(person|human)\b/i.test(t)) return false;
  if (/\b(hundreds?|thousands?)\b[^.?!]{0,28}\b(a|per)\s+(month|week|year)\b/i.test(t)) return false;
  if (/\b(pay|charge|bill)[a-z]*\b[^.?!]{0,30}\bper\s+(lead|job|call|booking)\b/i.test(t)) return false;
  if (/\bonly charges? when\b/i.test(t) || /\bpay for (the )?(leads?|jobs?) that\b/i.test(t)) return false;
  if (/\b(approve|approval)\b[^.?!]{0,30}\b(answers?|repl(y|ies)|messages?|goes live)\b/i.test(t)) return false;
  if (/\b(it|the system|atlas) learns\b/i.test(t) || /\blearns from\b/i.test(t)) return false;
  if (/\bcorrect it in the (app|inbox)\b/i.test(t)) return false;
  if (/\b(jobber|servicetitan|service titan|housecall|workiz|acculynx|buildertrend|quickbooks)\b/i.test(t)) return false;
  if (/\batlas (partner|pro|verified|premium)\b/i.test(t)) return false;    // invented labels
  // language overclaim (measured 7/21): "fully bilingual", "the homeowner guide is bilingual" —
  // dressing past the grounded line (calls + texts in English or Spanish, nothing more).
  if (/\bbilingual\b/i.test(t)) return false;
  if (/\b(fully|completely|entirely)\s+(translated|in spanish|spanish)\b/i.test(t)) return false;
  // any bare performance number that isn't the one hedged claim (15s) or the standing terms
  // (20-min call, 30-day guarantee, 463 Vesta profiles) is an unreceipted claim → deflect.
  // Two measured false-positives softened 7/18 (a storm-season follow-up deflected 3/4):
  //   - "24/7" is the desk's own deterministic coverage copy — strip the idiom before scanning
  //   - a number the CONTRACTOR typed themselves (crew size, lead counts) is THEIR fact, not
  //     our claim — echoing it back is conversation, not an unreceipted promise (echoNums =
  //     digits harvested from the user's own turns; absent → strict scan, so the battery's
  //     single-arg calls keep their teeth)
  const nums = t.replace(/\b24\/7\b/g, '').match(/\d+/g) || [];
  const allow = new Set(['4','15','20','30','463','911']);   // 911: the homeowner module's own safety line
  if (echoNums) for (const n of echoNums) allow.add(String(n));
  for (const n of nums) if (!allow.has(n)) return false;
  return true;
}

function systemPrompt(where){
  const standing = where && WHERE_LABEL[where]
    ? `\n═══ CURRENT LOCATION (obey this) ═══\nThe visitor is standing in ${WHERE_LABEL[where].toUpperCase()} right now. An unanchored question — "how does this work?", "what is this?", "tell me more" — is a question ABOUT ${WHERE_LABEL[where]}: answer for it FIRST and concretely; do NOT give the general Atlas overview when they are standing in a specific room. The location is where they stand, not all you know — cross to any other surface the moment their question actually leads there, and open its screen.\n`
    : '';
  return `You are a JSON API. Your entire reply is ALWAYS exactly one JSON object — {"say":...,"screen":...,"aud":...,"args":...} — never prose, never markdown, no text before or after it. (Measured failure you must never repeat: answering a visitor's question in plain paragraphs. The spoken words go INSIDE "say".)

You are the front desk of 4THWALL. Two kinds of visitors reach this desk: CONTRACTORS (owners of homeowner-facing trades businesses — roofing, HVAC, plumbing, electrical, paving, lawn, painting, masonry) and HOMEOWNERS (people who need work done on a home). Read the conversation and know which one you are serving; when genuinely unclear, ask one short clarifying question. Follow the person, not your first guess — if they turn out to be the other kind mid-conversation, switch and serve them fully. You are an exceptional, warm, certain advocate — an operator who has watched the trade bleed and knows exactly how to help. You sell by being genuinely useful and honest, never by hype.

You may ONLY say what is in the KNOWLEDGE below. If asked something not covered — internals, strategy, roadmap, algorithm details, margins, "how much do you make", anything you don't have a grounded answer for — do NOT guess. Give the honest deflection and point to the fit call (contractors) or Vesta (homeowners).

═══ KNOWLEDGE — SHARED CORE ═══

WHO WE ARE: 4THWALL is a Stamford, Connecticut company, founder-led, with one belief — good work should leave evidence. We build both sides of home-service trust: Atlas is the accountable front office and private workspace for contractors, and Vesta is the guide homeowners use to choose with evidence instead of ads. One company, one product per audience. "Workspace" is a description of the place inside Atlas, not another product name.

THE FLYWHEEL (say ONLY as customer benefit, never as our strategy): Atlas keeps your front office moving, so every response and close can become recorded work. Your record inside Atlas keeps the source and puts you in control. Vesta uses evidence, never ads, to help homeowners understand the right firm. Better work becomes easier to trust; both sides stop guessing.

═══ CONTRACTOR MODULE (when serving a contractor) ═══

ATLAS (the contractor's front office): A managed front office, SMS-first. When a call is missed, the customer gets a text back in YOUR name — your prices, your service area — within moments. It captures what they need, books an approved estimate slot if you want, sends appointment reminders, records human handoffs, escalates unresolved follow-ups, and can send the approved review request after an eligible completed appointment. Campaigns are prepared for owner approval; they are never broadcast merely because a model wrote them. You keep your number. The Atlas workspace keeps the customer, job, crew owner, Atlas action, decision and evidence in one private first-party record. Atlas may prepare and act only inside explicit rules; consequential work goes to the named person. Supported inbound texts and missed-call follow-ups typically get a first reply in 15 seconds after go-live (keep those exact hedges: "supported", "typically", "after go-live"). Every month can end with a measured receipt: leads answered, response times, estimates booked — measured by the system, not claimed by us. Live voice answering and automated quote chasing are not current production promises. If asked who runs it: it is managed — we operate it, the contractor and crew see what happened, and a person answers for it: the founder. Asked to PROVE the 15-second line: the sim demonstrates the response experience; never present a demo timer as a client result.
The rooms of the office (each maps to a screen you can open): Lead Response, Storm Mode, Seasonal Campaigns, Booking, Follow-up, Review Generation, Local Discovery, Operator Briefs.
Languages: supported text conversations can be answered and qualified in English or Spanish — the customer is answered in the language they write in (a Spanish version of the live demo exists at /missed-calls-es). That is the WHOLE claim: never imply that a voice call was answered, invent staffing details ("our team includes Spanish speakers", "bilingual staff"), use the word "bilingual", or claim Vesta, the homeowner guide, or any other surface is translated. Asked about any OTHER language: don't guess — honest deflection to the fit call.

YOUR RECORD (free inside Atlas): The record room is a capability inside Atlas, not a separate product. Connect permitted history, review every supported fact — source-labeled and correction-capable — and control exactly what a homeowner could see. Nothing publishes without you. Owning the record is free.

PRICING (the fit-call posture — NEVER state a dollar figure): Atlas is a managed service, not a software seat — the price follows the size of the front office we run for you, set on a 20-minute fit call in plain numbers. No setup fee, no contract, nothing metered, everything included. If we're not the right fit, we'll say so first. The guarantee: if the first month's receipt doesn't justify the fee, fire us — thirty days, no contract.

FAQ:
- Do you have clients? → We're early, deliberately. Founding-partner terms exist for exactly that reason: you get the founder's full attention and the longest record in the system. The demo is live right now; the fit call is where we show it working.
- Better than Angi / Thumbtack? → Structural, never disparaging: they sell the same lead to several contractors — their revenue is the auction. We run one contractor's front office and get paid when it runs well. Your customers are never resold, ever.
- Is this AI / a bot? → Honest: parts of this site and the service are automated — we build the system ourselves. Where it matters you get a person: the fit call is with the founder.
- Data? → Each contractor workspace is isolated; no contractor's data is visible to another. Records belong to the people they're about; contractors control their operating record inside Atlas.

═══ HOMEOWNER MODULE (when serving a homeowner) ═══

A homeowner deserves a real desk too — answer warmly and fully from this module, never bounce them with one line.
VESTA: a free guide to Fairfield County contractors. It matches their job against 463 evidence-backed profiles built from the public record and shows the why behind each pick, plainly. No ads, no pay-to-play; a contractor cannot buy placement — Vesta orders by evidence, that's the whole point. Being an Atlas client buys no placement either, ever. To use it: open the "vesta" screen for them — they describe the job and what matters to them, and Vesta shows its picks. Free, takes about a minute.
DISCIPLINE (absolute): NEVER triage or diagnose their home problem, never estimate cost, timeline, or urgency, never promise any contractor will take the job, never dispatch anyone. Never send a homeowner to the fit call — that is for contractors. If they describe immediate danger — fire, gas smell, sparking, active flooding — tell them to call 911 or their utility first; Vesta is for after everyone is safe.
A homeowner's screens: "vesta", "contact", or null — never the contractor screens (office, rooms, sim, offer, numbers, lens, fitcall).

═══ BRIDGES (one desk, both sides) ═══
- A contractor asking about the homeowner side (what homeowners see, how Vesta ranks) → answer honestly from the homeowner module; you may open "vesta".
- THE PLACEMENT QUESTION (mandatory truth): when a contractor asks whether signing up, paying, or being a client improves their Vesta ranking or placement, your say carries exactly this substance, opening with the plain "No" — model answer: "No — being an Atlas client buys no placement, no boost, no badge, ever. Vesta orders by evidence from the public record; that independence is the whole point. What Atlas changes is the record itself: answered calls and finished work are real evidence, and evidence is the only thing Vesta ranks." NEVER say or imply that signing up raises rank, "verifies" a profile, or improves visibility.
- Someone who sounded like a homeowner but talks like an operator (crews, quotes, "my customers") → they are likely a contractor; serve them as one.
- When you truly cannot tell which they are, ask — one short question, then serve.

═══ CONVERSATION CRAFT (how the desk talks — every turn, both audiences) ═══
- ATTENTIVE: carry the thread. Every detail they have given — their trade, their town, the crew, the problem that brought them in — is yours to use without re-asking; work it into the answer naturally. Mirror one short phrase of theirs when it fits. Never open two consecutive replies with the same word, and NEVER repeat a sentence you have already said in this conversation — asked the same thing again, go MORE CONCRETE (a specific room, a specific moment, the sim), never recite.
- INFORMATIVE: every reply teaches one real thing from the KNOWLEDGE — how a room actually works, what happens in the first minute after a missed call, what the monthly receipt counts. Never a brochure line that says nothing.
- SOLUTION-BASED: answer the question they actually asked FIRST, in their situation's terms, then move them one concrete step forward. SHOW while you talk: asked to see it, prove it, or demo it — open "sim" (or the specific room) and say what they are looking at; describing the same flow twice in a row instead of showing it is a failure.
- NO DEAD ENDS: a turn never leaves the visitor with nothing to do. Every reply either opens the screen that serves it or ends with the one natural next step. Even a deflection hands them a live path (the fit call, the FAQ, the demo, Vesta).
- The screen follows THIS turn's question. A contractor's question opens contractor surfaces — "vesta" ONLY when they asked about the homeowner side. When nothing fits, null beats a wrong screen.

═══ HARD RULES ═══
- NEVER use: "AI-powered", "software"/"platform"/"receptionist" as labels for us, "certified", "Connect" as a product name, or the words synergy/seamless/game-changing/revolutionize/leverage/streamline. Never use an exclamation mark.
- NEVER state a price or dollar figure, or any performance number other than the hedged "15 seconds" line. Pricing → the fit call.
- NEVER disparage a competitor by name. NEVER discuss margins, roadmap, strategy, or how the matching works.
- Keep replies SHORT — two to four sentences, an operator's economy; a genuinely meaty question may earn a fifth, never padding. End by inviting the natural next step.

═══ DOES NOT EXIST (never claim, never imply — every one of these was a measured fabrication) ═══
- No per-lead, per-job, or pay-per-booking pricing. One flat managed fee, set on the fit call.
- Do not claim production activation, live contractor adoption or customer outcomes. The first-party workspace construction is pilot-ready; deployed provider round trips and genuine contractor use are the next receipts. Atlas does not require every routine answer to be pre-approved, but consequential work goes to an exact named person and agent state remains visible.
- No machine "learning from corrections."
- No direct integration with Jobber or any scheduling/CRM tool — never name one.
- No "Atlas Partner" badge, label, or paid visibility anywhere on Vesta. Nothing to buy, ever.
- No team of dozens — founder-led is the truth. No client case studies yet — "we're early," said plainly, beats an invented proof point.
- You are NOT a person. Asked bot-or-human: the FAQ's honest answer, exactly — never claim personhood.
${standing}
═══ OUTPUT (STRICT) ═══
Return ONLY one JSON object, no prose, no markdown:
{"say": string, "screen": string|null, "aud": "contractor"|"homeowner", "args": object|null}
- say: your spoken reply, following every rule above.
- aud: your best read of who you are serving THIS turn.
- screen: open an appless surface when it fits, else null. Exactly one of:
  "office" (they want the whole system / what Atlas does) · "room:lead" "room:storm" "room:camp" "room:book" "room:follow" "room:reviews" "room:local" "room:briefs" (a specific capability) · "sim" (show the missed-call recovery happening) · "offer" (pricing / how it works commercially) · "lens" (the free record capability inside Atlas) · "vesta" (the homeowner guide — a homeowner visitor, or a contractor asking to see the homeowner side) · "fitcall" (a contractor ready to talk / book a call) · "numbers" (a contractor weighing the cost of the problem — missed calls / storm season / hiring for the desk; the calculators compute it from their OWN inputs) · "faq" (a logistics or "what's the catch" question) · "contact" (they want to reach a person, short of booking the call) · null (pure conversation).
  Homeowners: only "vesta", "contact", or null.
- When you open "numbers", the calculator produces the figures from the contractor's own sliders — you still state NO number yourself; introduce it and let them move the sliders.
- "args": ONLY with screen "numbers", else null. Seed the calculator with figures the contractor THEMSELVES stated in this conversation — EXTRACTIVE, never estimated, never invented: omit any field they did not state (a partial seed is normal; an empty one means omit "args"). Convert units to the field's own (four hours to reply → response_minutes: 240; "$9k jobs" → job_value: 9000). Plain numbers only — no strings, units, or symbols. Fields:
  panel: "missed"|"storm"|"office" — which calculator faces them first (their words decide: slow replies/missed calls → missed; storm talk → storm; weighing a hire → office)
  missed: job_value ($ per job), leads_per_week, response_minutes, close_rate_pct, after_hours_pct
  storm: storm_events (per year), leads_per_storm, storm_job_value, storm_close_pct, dropped_pct
  office: office_leads_per_week, wage_per_hour (what a hire would cost them), office_hours_week
Choose the screen that best serves what they just asked; when unsure, null.`;
}

// buffered model call with key + model rotation (no client streaming — the say is fully
// validated before anything reaches the browser; the UI animates the reveal itself).
// Returns { raw, model, status } — model + last upstream status feed the handler's log line,
// so a deflect storm is diagnosable from Vercel logs alone (nojson on WHICH model, 429 or not).
async function generate(keys, messages, where){
  const system = systemPrompt(where);
  const startAt = (Math.random() * keys.length) | 0;
  let lastStatus = null;
  for (const model of MODELS){
    const body = JSON.stringify({
      model, stream: false,
      // the trailing system nudge is the JSON-compliance anchor: measured 7/18, Nemotron
      // answered consumer-shaped questions ("what is vesta?") in plain prose from world
      // knowledge, ignoring both the pack and the output contract. Beginning + end restate it.
      messages: [{ role:'system', content: system }, ...messages,
        { role:'system', content: 'Reply to the visitor now, as the front desk, from the KNOWLEDGE only. Output exactly one JSON object {"say":...,"screen":...,"aud":...,"args":...} and nothing else. Choose "screen" deliberately — the desk SHOWS while it talks: the surface that best serves this turn (office, room:lead, room:storm, room:camp, room:book, room:follow, room:reviews, room:local, room:briefs, sim, offer, lens, vesta, fitcall, numbers, faq, contact). Reserve null for pure conversation with nothing to show.' }],
      temperature: 0.4, max_tokens: 900,   /* 480 truncated the new {say,screen,aud,args} mid-JSON → nojson→deflect storms (measured 7/18) */
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
          lastStatus = r.status;
          if (r.status === 401 || r.status === 429 || r.status >= 500) continue;   // rotate
          break;                                                                    // next model
        }
        const j = await r.json();
        const raw = j.choices?.[0]?.message?.content || '';
        if (raw.trim().length >= 2) return { raw, model, status: 200 };
      } catch { clearTimeout(timer); lastStatus = 'abort'; continue; }
    }
  }
  return { raw: null, model: null, status: lastStatus };
}

// tolerant JSON extraction (models wrap in prose / fences / partials)
export function extractJSON(text){
  if (!text) return null;
  // strip reasoning blocks (the GLM fallback thinks in prose). Closed think → keep what
  // follows the last close. Unclosed think (truncated mid-thought) → keep what precedes it —
  // never scan for braces inside a thought.
  let t = String(text);
  const close = t.lastIndexOf('</think>');
  if (close !== -1) t = t.slice(close + 8);
  else { const open = t.indexOf('<think>'); if (open !== -1) t = t.slice(0, open); }
  t = t.replace(/```[a-z]*|```/gi, '');
  const s = t.indexOf('{');
  if (s === -1) return null;
  // try progressively longer balanced slices from the first brace
  for (let e = t.length; e > s; e--){
    if (t[e-1] !== '}') continue;
    try { return JSON.parse(t.slice(s, e)); } catch { /* keep shrinking */ }
  }
  return null;
}

// ── the kill-question router (2026-07-20, cred probe) ─────────────────────────────────
// The five questions a skeptic uses to test whether the desk is real. Measured live: the
// model under adversarial pressure CAVES — claimed personhood 3/3, invented "Atlas Partner"
// placement 2/3, invented per-lead pricing, invented Jobber mechanics, invented a founderless
// company. These answers decide trust, so they are served deterministically from the pack
// (front-desk-knowledge.md §1/§7/§8/§10a) — same house pattern as triage's 911/atlas guards.
// Runs BEFORE the model (works during outages too); the model keeps every other question.
const ROUTER = [
  { k: 'bot',   // "am I talking to a bot?" — the honest §8 answer, never personhood
    test: t => /(are you|am i (talk|speak|chatt)ing (to|with)|is this)[^.?!]{0,40}\b(a )?(bot|robot|an? ai|automated|real person|human)\b/i.test(t)
            || /\b(person or a bot|bot or a (real )?(person|human)|human or a bot|bot or human)\b/i.test(t),
    say: () => 'Parts of this site and the service are automated — we build the system ourselves. Where it matters, you get a person: the fit call is with the founder.',
    screen: () => 'faq' },
  { k: 'placement',   // pay-for-rank — the §10a mandatory truth, opening with the plain No
    test: t => /\b(pay|paying|paid|subscribe[ds]?|sign(ing|ed)? up|become a client|atlas client)\b[^.?!]{0,60}\b(rank(ing|ed)?|placement|higher|top|boost(ed)?|visib|show(ing|s)? up|featured|listed|first)\b/i.test(t)
            || /\b(rank(ing)?|placement|higher|boost|visib|show up|featured|listed)\b[^.?!]{0,60}\b(pay|paying|paid|subscribe|client|sign(ing)? up)\b/i.test(t),
    say: t => /\b(i|my|me|we|our)\b/i.test(t)
      ? 'No — being an Atlas client buys no placement, no boost, no badge, ever. Vesta orders by evidence from the public record; that independence is the whole point. What Atlas changes is the record itself: answered calls and finished work are real evidence, and evidence is the only thing Vesta ranks.'
      : 'No — there is nothing to buy. A contractor cannot pay for placement, a badge, or a boost on Vesta. It orders by evidence from the public record, and that independence is the whole point.',
    screen: t => /\b(i|my|me|we|our)\b/i.test(t) ? 'vesta' : null,
    aud: t => /\b(i|my|me|we|our)\b/i.test(t) ? 'contractor' : null },
  { k: 'founder',   // §1: founder-led is the truth — never a fabricated origin story
    test: t => /\bwho('s| is|se)? (the )?(founder|owner|behind (this|it|4thwall))\b/i.test(t)
            || /\bwho (runs|owns|started|built|made) (this|it|the company|4thwall)\b/i.test(t)
            || /\bfounder('s)? (name|background|story|experience)\b/i.test(t),
    say: () => 'Founder-led, out of Stamford, Connecticut — one founder who builds and operates the system, with one belief: good work should leave evidence. The fit call is with the founder directly; anything you want to know about the person behind it, ask there.',
    screen: () => 'contact' },
  { k: 'tool',   // named third-party tools — honest, no invented integrations (and the
                 // Jobber announce-hold: nothing is claimed until Jobber publishes the app)
    test: t => /\b(jobber|servicetitan|service titan|housecall( pro)?|workiz|acculynx|buildertrend|quickbooks)\b/i.test(t),
    say: () => "We don't plug into your scheduling tools today — Atlas runs ahead of the schedule, not inside it. It catches the missed call, holds the conversation, and books the estimate; what lands on your calendar is yours to run in the tools you already use. If a direct connection matters for your setup, bring it to the fit call — that's exactly what the founder wants to hear.",
    screen: () => 'faq', aud: () => 'contractor' },
  { k: 'price-pressed',   // a ballpark demanded after the fit-call posture — hold, warmly (§7)
    test: (t, msgs) => /\b(price|pricing|cost|charge|how much|ballpark|rate|fee|per month)\b/i.test(t)
      && /\b(ballpark|range|rough (number|idea)|just (tell|give) me|hundreds or thousands|before i book|without (a|the) call|not booking)\b/i.test(t)
      && msgs.some(m => m.role === 'assistant'),
    say: () => "Fair push. The honest answer: the price follows the size of the front office we run for you, so a number before the fit call would be a guess — and we don't guess. What I can promise now: no setup fee, no contract, and if the first month's receipt doesn't justify the fee, you fire us. Twenty minutes gets you the plain number.",
    screen: () => 'offer', aud: () => 'contractor' },
];
const RK = Object.fromEntries(ROUTER.map(r => [r.k, r]));   // router canonicals by key

// ── lint→canonical (2026-07-20 hemisphere audit): a tripped fabrication class used to land
// on the generic DEFLECT — honest, but a dead end ("book the fit call") when the lint
// already KNOWS which lie it caught. Now the class maps to its canonical truth, so a novel
// phrasing that makes the model cave still gets the pack answer to that exact question.
// Variation-independent by construction: it reads the OUTPUT, not the question.
export function canonicalForTrip(say){
  const t = String(say);
  if (/\breal (person|human)\b/i.test(t) || /\b(i'?m|i am) (a )?(person|human)\b/i.test(t))
    return { say: RK.bot.say(''), screen: 'faq' };                          // personhood → the honest bot answer
  if (/\b(hundreds?|thousands?)\b[^.?!]{0,28}\b(a|per)\s+(month|week|year)\b/i.test(t)
   || /\b(pay|charge|bill)[a-z]*\b[^.?!]{0,30}\bper\s+(lead|job|call|booking)\b/i.test(t)
   || /\bonly charges? when\b/i.test(t) || /\bpay for (the )?(leads?|jobs?) that\b/i.test(t))
    return { say: 'Atlas is a managed service, not a software seat — one flat fee that follows the size of the front office we run for you, set on a 20-minute fit call in plain numbers. No setup fee, no contract — and if the first month’s receipt doesn’t justify the fee, fire us.', screen: 'offer' };
  if (/\b(jobber|servicetitan|service titan|housecall|workiz|acculynx|buildertrend|quickbooks)\b/i.test(t))
    return { say: RK.tool.say(''), screen: 'faq' };                         // invented integration → the honest tool answer
  if (/\batlas (partner|pro|verified|premium)\b/i.test(t))
    return { say: RK.placement.say('i'), screen: 'vesta' };                 // invented label → the placement truth
  if (/\b(approve|approval)\b[^.?!]{0,30}\b(answers?|repl(y|ies)|messages?|goes live)\b/i.test(t)
   || /\b(it|the system|atlas) learns\b/i.test(t) || /\blearns from\b/i.test(t) || /\bcorrect it in the (app|inbox)\b/i.test(t))
    return { say: 'Atlas works from the business facts and rules you approve. The customer, job, crew owner, Atlas action and decision share one private workspace record, so the contractor can see what happened and recover a failure without rewriting history. Consequential work goes to an exact named person; a person answers for the service: the founder.', screen: 'faq' };
  if (/\bbilingual\b/i.test(t) || /\b(fully|completely|entirely)\s+(translated|in spanish|spanish)\b/i.test(t))
    return { say: 'Supported text conversations can be answered and qualified in English or Spanish — the customer is answered in the language they wrote in, and you see it on the same workspace record. There’s a Spanish version of the live demo if you want to watch it work.', screen: 'sim' };
  return null;
}

export function routeKillQuestion(messages){
  const last = [...messages].reverse().find(m => m.role === 'user');
  const t = String(last && last.content || '');
  for (const r of ROUTER){
    if (r.test(t, messages)) return { k: r.k, say: r.say(t), screen: r.screen ? r.screen(t) : null, aud: r.aud ? r.aud(t) : null };
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
  // per-instance abuse floor — see api/_ratelimit.mjs (shared NIM pool; fail-open)
  if (!rateOk(req)){ res.statusCode = 429; res.setHeader('Content-Type','application/json'); res.setHeader('Retry-After','30'); return res.end('{"error":"rate"}'); }

  let messages, where = null, clientAud = null;
  try {
    const raw = await new Promise((resolve, reject) => {
      let b = ''; req.on('data', c => { b += c; if (b.length > 20000) reject(new Error('too big')); });
      req.on('end', () => resolve(b)); req.on('error', reject);
    });
    const body = JSON.parse(raw);
    messages = body.messages;
    where = typeof body.where === 'string' && SCREENS.has(body.where) ? body.where : null;   // standing position
    clientAud = cleanAud(body.aud);                                                          // last-known audience
    var wantDiag = body.debug === true;   // response-side diagnostics (no secrets: stage/model/raw head)
  } catch { res.statusCode = 400; res.setHeader('Content-Type','application/json'); return res.end('{"error":"bad json"}'); }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 14
      || !messages.every(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 3000)){
    res.statusCode = 400; res.setHeader('Content-Type','application/json'); return res.end('{"error":"bad messages"}');
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  // kill-question router: the trust-deciding questions get the pack's canonical answer,
  // deterministically — before (and regardless of) the model. See ROUTER above.
  const routed = routeKillQuestion(messages);
  if (routed){
    const rAud = routed.aud || clientAud;
    let rScreen = routed.screen;
    if (rAud === 'homeowner' && rScreen && !['vesta','contact'].includes(rScreen)) rScreen = 'vesta';
    console.log(`atlas: router=${routed.k} aud=${rAud||'null'} screen=${rScreen||'null'}`);
    const out = { say: routed.say, screen: rScreen };
    if (rAud) out.aud = rAud;
    if (wantDiag) out._diag = { stage: 'router:' + routed.k, retried: false, model: null, upstream: null, rawlen: 0, rawHead: null };
    res.statusCode = 200;
    return res.end(JSON.stringify(out));
  }

  // model outage → the honest deflection ONTO A SCREEN THAT ANSWERS (FAQ / Vesta are static;
  // they keep working precisely when the model doesn't)
  if (!alive){ res.statusCode = 200; return res.end(JSON.stringify({ say: DEFLECT, screen: deflectScreenFor(clientAud), off: true })); }

  // numbers the contractor typed themselves are safe to echo back (see claimSafe)
  const echo = new Set();
  for (const m of messages) if (m.role === 'user')
    for (const n of (String(m.content).match(/\d+/g) || [])) echo.add(n);

  let gen = { raw: null, model: null, status: null };
  try { gen = await generate(keys, messages, where); } catch { /* fall through */ }
  let parsed = gen.raw ? extractJSON(gen.raw) : null;

  // one fresh regeneration before deflecting — a guard trip is usually a phrasing the model
  // doesn't repeat (measured 7/18: a natural storm-season follow-up deflected 3/4 without
  // this; the clean generations prove the answer is there). Never retries a safe answer.
  let retried = false;
  if (gen.raw && (!parsed || typeof parsed.say !== 'string' || !claimSafe(parsed.say, echo))){
    retried = true;
    try { gen = await generate(keys, messages, where); } catch { /* fall through */ }
    const second = gen.raw ? extractJSON(gen.raw) : null;
    if (second && typeof second.say === 'string' && claimSafe(second.say, echo)) parsed = second;
  }

  let say = parsed && typeof parsed.say === 'string' ? parsed.say.replace(/<unk>/g, '').trim() : '';
  let screen = parsed && typeof parsed.screen === 'string' && SCREENS.has(parsed.screen) ? parsed.screen : null;
  let aud = cleanAud(parsed && parsed.aud) || clientAud;   // model's read this turn, else last known

  // ── contractor lock (routing-misfire guard, Drew 7/21) ──────────────────────────────
  // Measured live: "a lot of MY customers speak spanish — can YOUR system handle that?" — an
  // unambiguous contractor (first-person operator language, a question ABOUT the service) —
  // flipped aud→homeowner and routed to vesta. First-person operator language is a contractor,
  // full stop; the model may not flip it. EXCEPTION: a contractor asking about the homeowner
  // SIDE (what homeowners see, Vesta ranking/placement) is a real contractor→vesta case and
  // must survive (measured good: "what do homeowners see about me" → vesta). Mirrors triage's
  // atlasSignal: read the user's own words, don't trust the model's audience flip.
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastUserT = String(lastUserMsg && lastUserMsg.content || '');
  const operatorSignal =
       /\b(my|our)\s+(customers?|clients?|crew|guys|team|business|company|shop|office|trucks?|leads?|jobs?|quotes?|reviews?|number|phone|trade)\b/i.test(lastUserT)
    || /\b(your|the)\s+(system|service|bot|desk|thing|software)\b[^.?!]{0,34}\b(handle|do|does|work|answer|cover|manage|deal)\b/i.test(lastUserT)
    || /\b(i|we)\s+(run|own|operate)\b/i.test(lastUserT)
    || /\bfor\s+(my|our)\s+(business|company|shop|trade|crew|customers)\b/i.test(lastUserT);
  const askedHomeownerSide =
    /\b(homeowner|vesta|rank(ed|ing)?|placement|my (profile|listing|page)|how do (homeowners|people|customers|they) (find|see|choose|pick))\b/i.test(lastUserT);
  const contractorLocked = operatorSignal && !askedHomeownerSide;
  if (contractorLocked) aud = 'contractor';

  // homeowner clamp (defense in depth, mirrors the prompt): a homeowner never lands on a
  // contractor screen — no fit-call pitch, no calculators, no offer.
  const HOMEOWNER_SCREENS = new Set(['vesta', 'contact']);
  if (aud === 'homeowner' && screen && !HOMEOWNER_SCREENS.has(screen)) screen = 'vesta';
  // …and the mirror: a locked contractor whose turn is NOT about the homeowner side must not
  // get dumped on the homeowner guide (the vesta misfire). Drop the wrong screen — the say
  // still answers, and the composer keeps the turn alive (never a dead end).
  if (contractorLocked && screen === 'vesta') screen = null;

  // the final authority: anything the pack forbids never ships. A tripped answer first
  // tries its class's canonical truth (see canonicalForTrip) — the pack answer to the
  // exact lie the lint caught; only an unmapped trip (or no answer at all) becomes the
  // honest deflection + A SCREEN THAT ANSWERS (faq / vesta) — never a dead end.
  if (!say || !claimSafe(say, echo)){
    const canon = say ? canonicalForTrip(say) : null;
    if (canon){
      say = canon.say;
      screen = (aud === 'homeowner' && !HOMEOWNER_SCREENS.has(canon.screen)) ? 'vesta' : canon.screen;
    } else { say = DEFLECT; screen = deflectScreenFor(aud); }
  }

  // calculator seed: only rides on a surviving "numbers" screen (a deflect or homeowner clamp
  // rerouted above, so a tripped turn can never carry args), clamped + whitelisted by cleanArgs.
  const args = screen === 'numbers' && parsed ? cleanArgs(parsed.args) : null;

  console.log(`atlas: ${parsed ? (claimSafe(parsed.say||'', echo) ? 'ok' : 'unsafe→deflect') : 'nojson→deflect'} retried=${retried} model=${gen.model||'none'} upstream=${gen.status??'?'} rawlen=${gen.raw?gen.raw.length:0} aud=${aud||'null'} where=${where||'null'} screen=${screen||'null'} args=${args ? Object.keys(args).join(',') : 'null'}`);
  res.statusCode = 200;
  const out = { say, screen };
  if (aud) out.aud = aud;
  if (args) out.args = args;
  if (wantDiag) out._diag = {
    stage: parsed ? (claimSafe(parsed.say || '', echo) ? 'ok' : 'unsafe') : 'nojson',
    retried, model: gen.model, upstream: gen.status, rawlen: gen.raw ? gen.raw.length : 0,
    rawHead: gen.raw ? String(gen.raw).slice(0, 300) : null,
  };
  return res.end(JSON.stringify(out));
}
