// atlas-battery — the claim-safety + routing gate for the Atlas desk brain (/api/atlas).
// Two layers:
//   DETERMINISTIC (always): the server-side guards that must NEVER regress — the §9 banned
//     list, the screen whitelist, the deflection fallback, JSON extraction. These are the
//     belt-and-suspenders guarantee that nothing the pack forbids ever reaches a contractor.
//   LIVE (opt-in --live): fires real contractor probes at the deployed endpoint and checks
//     each answer is claim-safe + routes to a valid screen. Non-deterministic (real model),
//     so it's a spot-check, not a gate — run before shipping a prompt change.
//
// Run: node scripts/atlas-battery.mjs         (deterministic gate)
//      node scripts/atlas-battery.mjs --live   (+ live model probes against prod)

import { claimSafe, SCREENS, DEFLECT, extractJSON, cleanArgs, CALC_ARGS, cleanAud, deflectScreenFor, WHERE_LABEL } from '../api/atlas.mjs';

let fails = 0;
const check = (tag, ok, note='') => {
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${tag}${!ok && note ? ' — ' + note : ''}`);
  if (!ok) fails++;
};

console.log('atlas battery — deterministic guards\n');

// ── the §9 banned list: every forbidden form must be caught ──
const MUST_TRIP = [
  ['self-label AI-powered', 'Atlas is an AI-powered front office'],
  ['self-label software',   'Atlas is software that runs your office'],
  ['self-label platform',   'our platform runs your business'],
  ['self-label receptionist','Atlas is your AI receptionist'],
  ['certified',             'our certified system handles it'],
  ['Connect product name',  'use Connect to manage your record'],
  ['voice.md word',         'we streamline your whole operation'],
  ['exclamation mark',      'It books the estimate for you!'],
  ['dollar figure',         'It runs about $1,500 a month'],
  ['bare price number',     'plans start at 1500 a month'],
  ['unreceipted number',    'we recover 87 percent of missed calls'],
];
for (const [label, text] of MUST_TRIP)
  check(`banned: ${label} → tripped`, claimSafe(text) === false);

// ── the approved forms must SURVIVE (no false positives that would gut real answers) ──
const MUST_PASS = [
  ['not-a-software-seat framing', 'Atlas is a managed service, not a software seat.'],
  ['the hedged 15-second line',   'Supported texts typically get a first reply in 15 seconds after go-live.'],
  ['the 20-min / 30-day terms',   'A 20-minute fit call, and a 30-day no-contract guarantee.'],
  ['the 463 Vesta profiles',      'Vesta matches against 463 evidence-backed profiles.'],
  ['Connect-the-tools verb',      'Connect the tools you already run and review the record.'],
  ['plain operator answer',       'When you miss a call, the customer gets a text back in your name.'],
];
for (const [label, text] of MUST_PASS)
  check(`approved: ${label} → survives`, claimSafe(text) === true);

// ── the measured false-positives (7/18) stay fixed without gutting the guard ──
check('24/7 idiom survives (own coverage copy)', claimSafe('Storm week runs 24/7 without the voicemail pile.') === true);
check('echoed contractor number survives WITH echo set', claimSafe('A crew of 3 stays on the roof; Atlas answers.', new Set(['3'])) === true);
check('same number still trips WITHOUT echo set', claimSafe('A crew of 3 stays on the roof; Atlas answers.') === false);
check('echo never launders a dollar figure', claimSafe('So about $9,000 a month recovered.', new Set(['9','000'])) === false);

// ── the deflection is itself claim-safe (the fallback can never trip its own guard) ──
check('the deflection passes its own guard', claimSafe(DEFLECT) === true);

// ── deflect lands on a screen that ANSWERS, by audience (Drew 7/18: no dead ends) ──
check('deflect: contractor → faq (the answers screen)', deflectScreenFor('contractor') === 'faq');
check('deflect: unknown audience → faq', deflectScreenFor(null) === 'faq');
check('deflect: homeowner → vesta (their side)', deflectScreenFor('homeowner') === 'vesta');
check('deflect screens are valid + never fitcall', SCREENS.has('faq') && SCREENS.has('vesta') && deflectScreenFor('contractor') !== 'fitcall');

// ── audience validation: exactly two values, junk → null ──
check('aud: contractor/homeowner pass', cleanAud('contractor') === 'contractor' && cleanAud('homeowner') === 'homeowner');
check('aud: junk → null', cleanAud('admin') === null && cleanAud(1) === null && cleanAud(undefined) === null);

// ── the standing-position map covers every screen the UI can stand in ──
check('WHERE_LABEL covers every whitelisted screen', [...SCREENS].every(s => typeof WHERE_LABEL[s] === 'string'));

// ── the calculator-seed clamp (Rung 2): every arg bounded, junk dropped, panel whitelisted ──
check('args: in-range value passes through', cleanArgs({ job_value: 9000 })?.job_value === 9000);
check('args: out-of-range clamps to the slider max', cleanArgs({ job_value: 999999 })?.job_value === 60000);
check('args: below-min clamps to the slider min', cleanArgs({ response_minutes: 1 })?.response_minutes === 5);
check('args: unknown keys dropped (all junk → null)', cleanArgs({ monthly_price: 1500, foo: 9 }) === null);
check('args: non-numeric value dropped', cleanArgs({ job_value: 'a lot' }) === null);
check('args: panel whitelisted', cleanArgs({ panel: 'storm' })?.panel === 'storm' && cleanArgs({ panel: 'pricing' }) === null);
check('args: array/garbage shape → null', cleanArgs([1,2]) === null && cleanArgs('x') === null);
check('args: unit strings coerce ("9000" → 9000)', cleanArgs({ job_value: '9000' })?.job_value === 9000);
check('args: every spec field maps to a real range', Object.entries(CALC_ARGS).every(([k,v]) => k === 'panel' ? Array.isArray(v) : v[0] < v[1]));

// ── screen whitelist: exactly the surfaces the UI knows how to assemble ──
check('office is a valid screen', SCREENS.has('office'));
check('every room key valid', ['lead','storm','camp','book','follow','reviews','local','briefs'].every(k => SCREENS.has('room:'+k)));
check('sim/offer/lens/fitcall valid', ['sim','offer','lens','fitcall'].every(s => SCREENS.has(s)));
check('numbers/faq/contact valid (Stage C surfaces)', ['numbers','faq','contact'].every(s => SCREENS.has(s)));
check('vesta valid (homeowner hand-off, 7/18)', SCREENS.has('vesta'));
check('a bogus screen is NOT whitelisted', !SCREENS.has('room:carpentry') && !SCREENS.has('pricing'));

// ── JSON extraction survives fenced / prose-wrapped / partial model output ──
check('extractJSON: clean', extractJSON('{"say":"hi","screen":null}')?.say === 'hi');
check('extractJSON: fenced', extractJSON('```json\n{"say":"hi","screen":"office"}\n```')?.screen === 'office');
check('extractJSON: prose-wrapped', extractJSON('Sure: {"say":"ok","screen":"sim"} done')?.screen === 'sim');
check('extractJSON: garbage → null', extractJSON('no json here at all') === null);

// ── LIVE probes (opt-in) ──
if (process.argv.includes('--live')){
  const BASE = process.env.ATLAS_BASE || 'https://4thwall.solutions';
  // The gate on a LIVE answer is the CONTRACT: claim-safe + a valid (or null) screen. Exact
  // routing is model-chosen and soft — a capability question opening the fit-call instead of
  // the room is a legitimate seller move, not a failure — so `prefer` is logged, never failed.
  const PROBES = [
    ['what does atlas do?', 'office'],
    ['i keep missing calls on the job', 'sim'],
    ['how much does it cost?', 'fitcall/offer'],
    ['tell me about storm season', 'room:storm'],
    ['do you have clients yet?', 'fitcall'],
    ['what am i losing to missed calls?', 'numbers'],      // Stage C: the cost of the problem → calculators
    ['is this just another app i have to learn?', 'faq'],  // Stage C: logistics / "what's the catch"
    ['how do i actually get in touch with you?', 'contact/fitcall'],  // Stage C: reach a person
    ['what is your profit margin?', 'deflect'],   // oversharing → safe regardless
    ["i'm a homeowner and my roof is leaking — can you send someone?", 'vesta'],  // wrong desk → the homeowner door
  ];
  console.log('\natlas battery — LIVE model probes (' + BASE + ')  [gate: safe + valid screen; routing logged]\n');
  for (const [q, prefer] of PROBES){
    try {
      const r = await fetch(BASE + '/api/atlas', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages:[{ role:'user', content:q }] }) });
      const d = await r.json();
      const safe = claimSafe(d.say || '');
      const screenValid = d.screen === null || SCREENS.has(d.screen);
      const hit = (d.screen === prefer) || prefer.split('/').includes(d.screen) ? '' : ` (prefer ${prefer})`;
      check(`live "${q}" → safe + valid screen · routed ${d.screen}${hit}`, safe && screenValid,
        `safe=${safe} screen=${d.screen}`);
    } catch (e){ check(`live "${q}"`, false, e.message); }
  }
  // ── the parameterized seed, live: stated figures should arrive as clamped args. Gate on the
  // CONTRACT (numbers screen → any args present are in-spec + in-range); the exact fields the
  // model extracts are soft (logged), the clamp guarantee is hard.
  try {
    const q = "jobs run me about $9,000 and I get 20 leads a week, but it takes me 4 hours to call people back — what is that costing me?";
    const r = await fetch(BASE + '/api/atlas', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages:[{ role:'user', content:q }] }) });
    const d = await r.json();
    const inSpec = !d.args || Object.entries(d.args).every(([k,v]) =>
      k === 'panel' ? CALC_ARGS.panel.includes(v)
      : CALC_ARGS[k] && v >= CALC_ARGS[k][0] && v <= CALC_ARGS[k][1]);
    check(`live seeded-calc → safe + args in-spec · screen=${d.screen} args=${JSON.stringify(d.args||null)}`,
      claimSafe(d.say||'', new Set(['9','000','20','4'])) && (d.screen === null || SCREENS.has(d.screen)) && inSpec,
      `screen=${d.screen} args=${JSON.stringify(d.args||null)}`);
  } catch (e){ check('live seeded-calc', false, e.message); }
}

console.log(fails ? `\nATLAS BATTERY: ${fails} FAIL(S)\n` : '\nATLAS BATTERY GREEN\n');
process.exit(fails ? 1 : 0);
