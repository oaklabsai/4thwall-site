// THE FRONT DESK BATTERY (front-desk.md law 6) — the gate before any pack/line change
// and before the index.html swap. Two parts:
//   A · ROUTING — evals the LIVE page's real desk script in a DOM shim and drives the
//       real input path: lane entry, house lines, triage entry, the deflection floor,
//       the outage fallback. No re-implementation — the deployed code is what runs.
//   B · CLAIM SAFETY — lints every deterministic L line against the knowledge pack's
//       banned list (front-desk-knowledge.md §9): self-labels, "certified", voice bans,
//       exclamation marks, numbers outside the receipted allowlist, price figures.
// The triage MODEL's behavior is owned by scripts/vesta-*.mjs — this battery only
// asserts the desk ENTERS triage; it never grades the model.
// Run: node scripts/desk-battery.mjs [--local]   (default tests the LIVE /next)

import { readFileSync } from 'node:fs';

const LIVE = 'https://4thwall.solutions/next';
const local = process.argv.includes('--local');

// ── fetch the page, extract the desk script (the block that carries THE FRONT DESK) ──
async function getSource(){
  const html = local
    ? readFileSync(new URL('../landing-next.html', import.meta.url), 'utf8')
    : await (await fetch(LIVE)).text();
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const src = blocks.find(b => b.includes('THE FRONT DESK'));
  if (!src) throw new Error('desk script block not found');
  return src;
}

// ── minimal DOM shim — only what the desk engine touches ──
function el(id){
  const handlers = {};
  const e = {
    id, _html:'', textContent:'', className:'', value:'', placeholder:'', hidden:false,
    style:{}, dataset:{}, disabled:false,
    classList:{ _s:new Set(),
      add(...c){c.forEach(x=>this._s.add(x))}, remove(...c){c.forEach(x=>this._s.delete(x))},
      toggle(c,f){ (f===undefined? !this._s.has(c):f) ? this._s.add(c):this._s.delete(c); },
      contains(c){return this._s.has(c)} },
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = v; },
    get childNodes(){ return []; },
    get children(){ return []; },
    get offsetWidth(){ return 0; },
    setAttribute(){}, appendChild(){}, replaceChild(){}, scrollIntoView(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(t,fn){ (handlers[t]=handlers[t]||[]).push(fn); },
    dispatchEvent(ev){ (handlers[ev.type]||[]).forEach(fn=>fn(ev)); },
    _handlers: handlers,
  };
  return e;
}

// a tiny in-memory Storage so F5's localStorage reads/writes work in the shim
function makeStore(seed){
  const d = seed ? { fd_memory: JSON.stringify(seed) } : {};
  return { getItem: k => (k in d ? d[k] : null), setItem: (k,v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}

// One fresh desk instance per case. probeOK controls the GET /api/triage health probe;
// seedMem pre-seeds localStorage to simulate a returning visitor (F5).
function boot(src, { probeOK = true, seedMem = null } = {}){
  const ids = ['fdMat','fdYou','fdLine','fdSay','fdWell','fdPh','fdMic','fdThink','fdThinkW','fdScreen'];
  const els = Object.fromEntries(ids.map(i => [i, el(i)]));
  const posts = [];                       // recorded triage POSTs
  const location = { href:'' };           // handoff fallback lands here
  const env = {
    document: {
      getElementById: id => els[id] || el(id),
      createElement: () => el('x'), createTextNode: t => ({ textContent:t }),
      createDocumentFragment: () => el('frag'),
      querySelector: () => null, querySelectorAll: () => [],
      activeElement: null,
    },
    window: {},                            // no HOME in the shim → logEvent no-ops
    location,
    fetch: (url, opts) => {
      if (opts && opts.method === 'POST'){ posts.push(JSON.parse(opts.body)); return new Promise(()=>{}); }
      if (String(url).includes('desk-guide.json')) return Promise.resolve({ ok:true, json: () => Promise.resolve(GUIDE_JSON) });
      return Promise.resolve({ ok: probeOK });
    },
    setTimeout: (fn) => { fn(); return 0; },  // transitions collapse — state lands synchronously
    clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    sessionStorage: { getItem:()=>null, setItem:()=>{}, },
    localStorage: makeStore(seedMem),
    Date, JSON, Object, Array, String, Math, Promise, encodeURIComponent, TextDecoder,
    Event: class { constructor(type){ this.type = type; } preventDefault(){} },
    SpeechRecognition: undefined, webkitSpeechRecognition: undefined,
  };
  env.window = env;                        // window.HOME lookups resolve against env (undefined)
  new Function(...Object.keys(env), src)(...Object.values(env));
  const say = (q) => { els.fdSay.value = q; els.fdWell.dispatchEvent({ type:'submit', preventDefault(){} }); };
  const spoken = () => els.fdLine.innerHTML.replace(/<[^>]+>/g,'');
  return { els, posts, location, say, spoken };
}

// ── the extracted L table for the claim lint (same source, isolated eval) ──
function extractL(src){
  const m = src.match(/var L=\{([\s\S]*?)\};/);
  if (!m) throw new Error('L table not found');
  return new Function('CAL', 'return {' + m[1] + '};')('CAL_URL');
}

const strip = s => String(s).replace(/<[^>]+>/g,'');

// front-desk-knowledge.md §9, encoded. "not a software seat" is the pack's own approved
// framing; "Connect the tools" is the pack's approved Lens verb — both stay legal.
function lintLine(key, text){
  const bad = [];
  const t = strip(text);
  if (/AI[- ]powered/i.test(t)) bad.push('self-label "AI-powered"');
  if (/\breceptionist\b/i.test(t)) bad.push('self-label "receptionist"');
  if (/\bplatform\b/i.test(t)) bad.push('self-label "platform"');
  if (/\bsoftware\b/i.test(t) && !/not a software/i.test(t)) bad.push('self-label "software"');
  if (/\bcertified\b/i.test(t)) bad.push('"certified"');
  if (/\bConnect\b(?! the tools)/.test(t)) bad.push('product name "Connect"');
  if (/\b(synergy|seamless|game-changing|revolutioni[sz]e|leverage|streamline)\b/i.test(t)) bad.push('voice.md banned word');
  if (/!/.test(t)) bad.push('exclamation mark');
  if (/\$|\b1,?500\b/.test(t)) bad.push('price figure (fit-call posture: the desk never states the number)');
  const nums = t.match(/\d+/g) || [];
  const allow = new Set(['4','15','20','60']);   // 4THWALL · 15-second guarantee (hedged) · 20-min call · 60-second demo
  for (const n of nums) if (!allow.has(n)) bad.push(`unreceipted number "${n}"`);
  return bad;
}

// ═══ run ═══
const src = await getSource();
// the P4 screens assemble from /desk-guide.json — same source discipline as the page
const GUIDE_JSON = local
  ? JSON.parse(readFileSync(new URL('../desk-guide.json', import.meta.url), 'utf8'))
  : await (await fetch('https://4thwall.solutions/desk-guide.json')).json();
const flush = () => new Promise(r => setImmediate(r));
console.log(`desk battery — source: ${local ? 'local file' : LIVE} (${src.length} chars · guide: ${Object.keys(GUIDE_JSON.trades).length} trades)\n`);

let fails = 0;
const check = (tag, ok, note='') => {
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${tag}${!ok && note ? ' — ' + note : ''}`);
  if (!ok) fails++;
};

// A · ROUTING — each case boots a fresh desk (real code, clean state)
{ const d = boot(src);
  check('A1 greet voices both doors', /contractor/.test(d.spoken()) && /homeowner/.test(d.spoken())); }
{ const d = boot(src); d.say('contractor');
  check('A2 "contractor" → concierge line (Atlas + Lens voiced)', /Atlas/.test(d.spoken()) && /Lens/.test(d.spoken())); }
{ const d = boot(src); d.say('homeowner');
  check('A3 "homeowner" → job-examples line', /like you.d tell a neighbor/.test(d.spoken())); }
{ const d = boot(src); d.say('homeowner'); d.say('the AC died upstairs');
  check('A4 ho lane free text → REAL triage entered', d.posts.length === 1 && d.posts[0].messages?.[0]?.content === 'the AC died upstairs', JSON.stringify(d.posts)); }
{ const d = boot(src); d.say('my roof is leaking near the chimney');
  check('A5 cold job words → triage entered (no lane needed)', d.posts.length === 1); }
{ const d = boot(src); d.say('my roof is leaking'); d.say('and my sink too');
  check('A6 second input while desk is thinking → held (one thought at a time)', d.posts.length === 1); }
{ const d = boot(src, { probeOK:false });
  await new Promise(r => setImmediate(r));   // let the health probe's microtask settle (TRI_OK=false)
  d.say('homeowner'); d.say('my roof is leaking');
  check('A7 triage DOWN → /vesta handoff floor (never a dead end)', d.location.href.startsWith('/vesta?q='), 'href=' + d.location.href); }
{ const d = boot(src); d.say('how much does atlas cost');
  check('A8 pricing ask → fit-call posture, zero price figures', /fit call/i.test(d.spoken()) && !/\$|\d,?\d{3}/.test(d.spoken())); }
{ const d = boot(src); d.say('are you better than Angi?');
  check('A9 competitor bait → honest deflection to a person', /deserves a person/.test(d.spoken())); }
{ const d = boot(src); d.say('what are your profit margins?');
  check('A10 oversharing probe → deflection (never strategy internals)', /deserves a person/.test(d.spoken())); }
{ const d = boot(src); d.say('tell me about atlas');
  check('A11 atlas ask → Atlas line', /managed front office/.test(d.spoken())); }
{ const d = boot(src); d.say('what is lens?');
  check('A12 lens ask → Lens line (free, nothing publishes without you)', /free/.test(d.spoken()) && /Nothing publishes without you/.test(d.spoken())); }
{ const d = boot(src); d.say('do you handle seo?');
  check('A13 seo ask → SEO line', /local discovery/.test(d.spoken())); }
{ const d = boot(src); d.say('i keep missing calls on jobs');
  // shim timers run sync: the whole performance plays through to the closing lead
  check('A14 missed-calls ask → the desk PERFORMS the missed call (sim assembled, labeled, hedged; closing lead voiced)',
    /Incoming call/.test(d.els.fdScreen.innerHTML) && /A simulation, labeled as one/.test(d.els.fdScreen.innerHTML)
    && /typically get a first reply in 15 seconds after go-live/.test(d.els.fdScreen.innerHTML)
    && /That.s Atlas/.test(d.spoken()) && /live demo/.test(d.spoken())); }
{ const d = boot(src); d.say('how does it all compound?');
  check('A22 flywheel ask → spoken line + the flywheel drawn (4 nodes, proof-never-ads)',
    /evidence makes the work/.test(d.spoken()) && /fdfw-n/.test(d.els.fdScreen.innerHTML)
    && /never ads/.test(d.els.fdScreen.innerHTML)); }
{ const d = boot(src); d.say('who are you guys?');
  check('A15 house ask → the belief line', /good work should leave evidence/i.test(d.spoken())); }
{ const d = boot(src); d.say('qwerty asdf zxcv');
  check('A16 nonsense → deflection, never a guess', /deserves a person/.test(d.spoken())); }

// P4 — the rich components (deterministic screens; zero model calls)
{ const d = boot(src); d.say('how much does a new roof cost?'); await flush(); await flush();
  const s = d.els.fdScreen.innerHTML;
  check('A17 homeowner cost ask → cost chart, NOT the Atlas offer line',
    /What roofing costs in Fairfield County/.test(s) && /planning estimates, not quotes/.test(s) && /updated/.test(s) && !/fit call/i.test(d.spoken())); }
{ const d = boot(src); d.say('how much does Atlas cost?'); await flush(); await flush();
  check('A18 Atlas cost ask still → fit-call posture (no cost chart)',
    /fit call/i.test(d.spoken()) && !/planning estimates/.test(d.els.fdScreen.innerHTML)); }
{ const d = boot(src); d.say('what should I ask a plumber before I hire?'); await flush(); await flush();
  const s = d.els.fdScreen.innerHTML;
  check('A19 hiring ask → the per-trade checklist screen', /What to ask plumbers before you hire/.test(s) && /P-class license/.test(s)); }
{ const d = boot(src); d.say('homeowner'); d.say('what does paving cost?'); await flush(); await flush();
  check('A20 ho-lane cost ask → chart (never sent to the model)',
    d.posts.length === 0 && /What paving costs/.test(d.els.fdScreen.innerHTML)); }
{ const d = boot(src); d.say('what does a pool cost?'); await flush(); await flush();
  check('A21 no cost data for trade → honest line, no invented numbers',
    /don.t carry planning numbers/.test(d.spoken()) && !/\$/.test(d.els.fdScreen.innerHTML)); }

// F5 — return-visit memory (localStorage only; seeded into the shim)
{ const d = boot(src, { seedMem: { v:1, ts: Date.now(), deck:{ trade:'roofing', job:'roof-replacement', label:'roof replacement', tradeLabel:'Roofing' }, job:'roof-replacement', trade:'roofing', firm:'Summit Ridge Roofing', sent:true } });
  check('A23 return visit (request sent) → welcome-back, names the firm, resume+fresh offered',
    /Welcome back/.test(d.spoken()) && /Summit Ridge Roofing/.test(d.spoken()) && /how did it go/i.test(d.spoken())
    && /data-act="resume"/.test(d.els.fdLine.innerHTML) && /data-act="fresh"/.test(d.els.fdLine.innerHTML)); }
{ const d = boot(src, { seedMem: { v:1, ts: Date.now()-3*864e5, deck:{ trade:'paving', job:'new-driveway-installation', label:'new driveway installation', tradeLabel:'Paving' }, job:'new-driveway-installation', trade:'paving' } });
  check('A24 return visit (matched, not sent) → welcome-back + resume, NOT "how did it go"',
    /Welcome back/.test(d.spoken()) && /data-act="resume"/.test(d.els.fdLine.innerHTML) && !/how did it go/i.test(d.spoken())); }
{ const d = boot(src);
  check('A25 first-time visitor (no memory) → the cold greeting, not welcome-back',
    !/Welcome back/.test(d.spoken()) && /contractor/.test(d.spoken()) && /homeowner/.test(d.spoken())); }

// B · CLAIM SAFETY — every deterministic line, linted against the pack's banned list
const L = extractL(src);
let lintBad = 0;
for (const [key, text] of Object.entries(L)){
  const bad = lintLine(key, text);
  if (bad.length){ lintBad++; console.log(`  ✗ FAIL B·L.${key} — ${bad.join(' · ')}`); }
}
check(`B1 all ${Object.keys(L).length} L lines pack-clean (banned list §9)`, lintBad === 0);

console.log(`\n${fails === 0 ? 'DESK BATTERY GREEN' : 'DESK BATTERY RED — ' + fails + ' failure(s)'}`);
process.exit(fails === 0 ? 0 : 1);
