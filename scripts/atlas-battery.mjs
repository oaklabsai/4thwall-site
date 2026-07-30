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

import { claimSafe, SCREENS, DEFLECT, extractJSON, cleanArgs, CALC_ARGS, cleanAud, deflectScreenFor, WHERE_LABEL, extractCalculatorRoute, extractContractorContext, routeKillQuestion } from '../api/atlas.mjs';

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
const calcRoute = extractCalculatorRoute([{ role:'user', content:'Jobs run about $9,000, we get 20 leads a week, and take 4 hours to call back. What is that costing me?' }]);
check('calculator intent routes deterministically', calcRoute?.screen === 'numbers' && calcRoute?.aud === 'contractor');
check('calculator extracts only stated figures', calcRoute?.args?.job_value === 9000 && calcRoute?.args?.leads_per_week === 20 && calcRoute?.args?.response_minutes === 240);
check('calculator reads response-time phrasing in either order', extractCalculatorRoute([{ role:'user', content:'What am I losing when I call people back after 90 minutes?' }])?.args?.response_minutes === 90);
check('Atlas service pricing is not mistaken for lost-revenue math', extractCalculatorRoute([{ role:'user', content:'How much does Atlas cost?' }]) === null);
check('software-burden objection is answered on FAQ', routeKillQuestion([{ role:'user', content:'Is this just another app I have to learn?' }])?.k === 'burden');
check('private company internals deflect deterministically', routeKillQuestion([{ role:'user', content:'What is your profit margin?' }])?.k === 'internal');
check('plain Vesta-ranking question stays conversational', routeKillQuestion([{ role:'user', content:'How does Vesta rank contractors?' }])?.k !== 'internal');
const definitionRoute = routeKillQuestion([{ role:'user', content:'What is Atlas, exactly?' }]);
check('Atlas definition is deterministic and concrete', definitionRoute?.k === 'definition' && definitionRoute?.screen === 'office' && /\bcall is missed|missed call\b/i.test(definitionRoute?.say || ''));
check('Atlas definition remains claim-safe', claimSafe(definitionRoute?.say || '') === true);
const privacyRoute = routeKillQuestion([{ role:'user', content:'Can another contractor see my leads and conversations?' }]);
check('contractor data isolation is answered deterministically', privacyRoute?.k === 'privacy' && privacyRoute?.screen === 'faq' && /isolated/i.test(privacyRoute?.say || ''));
check('privacy answer remains claim-safe', claimSafe(privacyRoute?.say || '') === true);
const earlyRoute = routeKillQuestion([{ role:'user', content:'Do you have clients or case studies yet?' }]);
check('early-stage proof boundary is answered deterministically', earlyRoute?.k === 'early' && /do not (?:have )?client outcomes (?:to claim)?/i.test(earlyRoute?.say || ''));
check('early-stage answer remains claim-safe', claimSafe(earlyRoute?.say || '') === true);
const languageRoute = routeKillQuestion([{ role:'user', content:'Can Atlas handle customers who text in Spanish?' }]);
check('language capability is bounded deterministically', languageRoute?.k === 'language' && languageRoute?.screen === 'sim' && /English (?:and|or) Spanish/i.test(languageRoute?.say || '') && !/bilingual/i.test(languageRoute?.say || ''));
check('language answer remains claim-safe', claimSafe(languageRoute?.say || '') === true);
const missedProcessRoute = routeKillQuestion([{ role:'user', content:'What happens right after a missed call?' }]);
check('missed-call process stays concrete on a deeper follow-up', missedProcessRoute?.k === 'missed-process' && missedProcessRoute?.screen === 'sim' && /text back/i.test(missedProcessRoute?.say || ''));
check('missed-call process remains claim-safe', claimSafe(missedProcessRoute?.say || '') === true);
const contractorPivotRoute = routeKillQuestion([{ role:'user', content:'Actually, I own a roofing company.' }]);
check('homeowner-to-contractor pivot is deterministic', contractorPivotRoute?.k === 'contractor-pivot' && contractorPivotRoute?.aud === 'contractor' && contractorPivotRoute?.screen === 'office');
check('contractor pivot remains claim-safe', claimSafe(contractorPivotRoute?.say || '') === true);
const context = extractContractorContext([
  { role:'user', content:'I run a roofing company. My crews are on roofs all day and miss calls.' },
  { role:'assistant', content:'Tell me more.' },
  { role:'user', content:'What would you set up first?' },
]);
check('Atlas remembers trade and operating pain across turns', context.trade === 'roofing' && context.pain === 'missed');
const blueprintRoute = routeKillQuestion([
  { role:'user', content:'I run a roofing company. My crews are on roofs all day and miss calls.' },
  { role:'assistant', content:'Tell me more.' },
  { role:'user', content:'What would you set up first?' },
]);
check('business-specific blueprint uses retained context', blueprintRoute?.k === 'blueprint' && blueprintRoute?.screen === 'room:lead' && /roofing business/i.test(blueprintRoute?.say || '') && /service-area edges/i.test(blueprintRoute?.say || ''));
check('business-specific blueprint remains claim-safe', claimSafe(blueprintRoute?.say || '') === true);
const noContextBlueprint = routeKillQuestion([{ role:'user', content:'Give me a blueprint for my business.' }]);
check('blueprint asks for only the missing business facts', noContextBlueprint?.k === 'blueprint' && /what trade/i.test(noContextBlueprint?.say || '') && /where does a good lead/i.test(noContextBlueprint?.say || ''));
const fitRoute = routeKillQuestion([{ role:'user', content:'I am a solo contractor. Is Atlas a fit for a business this small?' }]);
check('fit answer can honestly disqualify a working desk', fitRoute?.k === 'fit' && /may only duplicate/i.test(fitRoute?.say || '') && fitRoute?.screen === 'fitcall');
check('fit answer remains claim-safe', claimSafe(fitRoute?.say || '') === true);
const accuracyRoute = routeKillQuestion([{ role:'user', content:'What happens when Atlas gets something wrong?' }]);
check('failure answer names stopping, handoff and recovery', accuracyRoute?.k === 'accuracy' && /stops short of guessing/i.test(accuracyRoute?.say || '') && /recovered/i.test(accuracyRoute?.say || '') && accuracyRoute?.screen === 'lens');
check('failure answer remains claim-safe', claimSafe(accuracyRoute?.say || '') === true);
const limitsRoute = routeKillQuestion([{ role:'user', content:'Does Atlas answer live phone calls? What will it not do?' }]);
check('limits answer states current non-promises', limitsRoute?.k === 'limits' && /does not promise live voice/i.test(limitsRoute?.say || '') && /quote chasing/i.test(limitsRoute?.say || ''));
check('limits answer remains claim-safe', claimSafe(limitsRoute?.say || '') === true);
const setupRoute = routeKillQuestion([{ role:'user', content:'What do you need from me to set Atlas up and go live?' }]);
check('setup answer includes carrier and watched-test gates', setupRoute?.k === 'setup' && /carrier approval/i.test(setupRoute?.say || '') && /watched inbound test/i.test(setupRoute?.say || ''));
check('setup answer remains claim-safe', claimSafe(setupRoute?.say || '') === true);
const comparisonRoute = routeKillQuestion([{ role:'user', content:'Does Atlas replace my office manager?' }]);
check('human comparison preserves consequential judgment', comparisonRoute?.k === 'comparison' && /people are unnecessary/i.test(comparisonRoute?.say || '') && /named person/i.test(comparisonRoute?.say || ''));
check('human comparison remains claim-safe', claimSafe(comparisonRoute?.say || '') === true);
const valueRoute = routeKillQuestion([{ role:'user', content:'Is it worth it for my company?' }]);
check('value question opens an evidence-based calculator path', valueRoute?.k === 'value' && valueRoute?.screen === 'numbers' && /your facts/i.test(valueRoute?.say || ''));
check('value answer remains claim-safe', claimSafe(valueRoute?.say || '') === true);
const realityRoutes = [
  ['capacity', 'We are booked three months out and do not want more work.', 'fitcall'],
  ['spam-noise', 'Half my calls are spam. Not every missed call is money.', 'numbers'],
  ['customer-robot-trust', 'My customers hate robots and I will not let one hurt our name.', 'sim'],
  ['existing-answering', 'I already pay a human answering service. Why do I need Atlas?', 'faq'],
  ['family-desk', 'My wife handles the phones and books the jobs.', 'room:lead'],
  ['complex-work', 'Our jobs are too complicated and custom for a bot.', 'room:lead'],
  ['operator-control', 'I do not want something texting my customers without me knowing.', 'lens'],
];
for (const [key, content, screen] of realityRoutes){
  const route = routeKillQuestion([{ role:'user', content }]);
  check(`contractor reality: ${key} routes deterministically`, route?.k === key && route?.screen === screen && route?.aud === 'contractor');
  check(`contractor reality: ${key} remains claim-safe`, claimSafe(route?.say || '') === true);
}
const homeownerRoute = routeKillQuestion([{ role:'user', content:"I'm a homeowner and my roof is leaking. Can you send someone?" }]);
check('explicit homeowner reaches Vesta without model routing', homeownerRoute?.k === 'homeowner-handoff' && homeownerRoute?.aud === 'homeowner' && homeownerRoute?.screen === 'vesta');
check('homeowner handoff does not claim dispatch', /\bcannot send or dispatch\b/i.test(homeownerRoute?.say || '') && claimSafe(homeownerRoute?.say || '') === true);
const homeownerEmergency = routeKillQuestion([{ role:'user', content:"I'm a homeowner and I smell gas in the basement." }]);
check('homeowner danger gets safety before Vesta', homeownerEmergency?.k === 'homeowner-emergency' && /^If anyone may be in immediate danger/i.test(homeownerEmergency?.say || '') && /911/.test(homeownerEmergency?.say || ''));
check('homeowner danger answer remains claim-safe', claimSafe(homeownerEmergency?.say || '') === true);

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
check('extractJSON: closed think block stripped', extractJSON('<think>{"say":"draft"}</think>{"say":"hi","screen":null}')?.say === 'hi');
check('extractJSON: UNCLOSED think (truncated) → null, never braces from a thought', extractJSON('<think>maybe {"say":"half-formedико') === null);
check('extractJSON: prose then think then JSON', extractJSON('ok <think>hmm</think> {"say":"x","screen":"faq"}')?.screen === 'faq');

// ── the homeowner module's own safety line must survive its guard ──
check('911 survives (the module instructs it)', claimSafe('If you smell gas, call 911 or your utility first — Vesta is for after everyone is safe.') === true);

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
