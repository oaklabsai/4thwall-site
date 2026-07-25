// Output-governor unit suite (2026-07-20 hemisphere-symmetry audit). Runs LOCAL (no
// network): sayGuard (triage — the homeowner say governor) + canonicalForTrip/claimSafe
// (atlas — lint→canonical). Run before any brain deploy alongside cred-battery.mjs:
//   node scripts/guard-units.mjs
import { sayGuard } from '../api/triage.mjs';
import { canonicalForTrip, claimSafe } from '../api/atlas.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { console.log((cond ? '✅' : '❌') + ' ' + name); cond ? pass++ : fail++; };
const U = x => ({ role: 'user', content: x });
const M = [U('my toilet keeps running')];

// ── sayGuard strips every redline breach ──
t('strips dollar quote', !/15,000/.test(sayGuard('A new roof typically runs $15,000 to $30,000 here. I can line up vetted roofers.', M, null)));
t('strips k-figure', !/20k/.test(sayGuard('Expect around 20k for a full replacement. The pitch matters a lot.', M, null)));
t('strips spelled quote-shape', !/thousand/.test(sayGuard('A fair price usually costs several thousand dollars for that job.', M, null)));
t('strips dispatch claim', !/on the way/.test(sayGuard("Don't worry — help is on the way. Shut the main valve for now.", M, null)));
t('strips we-send claim', !/sending someone/i.test(sayGuard("I'm sending someone out to you right away. Meanwhile shut off the water.", M, null)));
t('strips background check', !/background/.test(sayGuard('Every pro is background-checked before we list them. Want me to line them up?', M, null)));
t('strips insurance-verify', !/verif/.test(sayGuard('We verify their insurance and licensing annually. The picks are solid.', M, null)));
t('strips personhood', !/real person/.test(sayGuard("You're talking to a real person here. Tell me about the leak.", M, null)));
t('strips DIY on unresolved turn', !/flapper/.test(sayGuard('First lift the tank lid and check the flapper for wear. If that fails, a plumber can sort it quickly.', M, null)));
t('floor line when everything strips', sayGuard('Expect to pay $12,000.', M, null).length > 40);

// ── sayGuard keeps legitimate Vesta language ──
const k1 = 'Where the stain sits is what separates a roof leak from a plumbing leak.';
t('keeps normal teach', sayGuard(k1, M, null) === k1);
const k2 = 'Shut the water off at the main valve, then call a licensed plumber right away.';
t('keeps safety mitigation', sayGuard(k2, M, null) === k2);
const k3 = "I'll line up vetted roofing pros for exactly this — they review well on tear-offs.";
t('keeps the approved offer', sayGuard(k3, M, null) === k3);
const k4 = 'A 100-amp panel is common in homes of that era, and 2,000 square feet is a normal scope.';
t('keeps unit numbers', sayGuard(k4, [U('we have a 100-amp panel')], null) === k4);
const echoM = [U('I got quotes for 12k, 19k and 31k for my roof — how do I pick?')];
t('keeps homeowner-echoed figures', /12k/.test(sayGuard('Your 12k and 31k quotes are far apart, which usually means the scopes differ. Ask for itemized scope.', echoM, null)));
t('keeps deposit red-flag teach', /deposit/.test(sayGuard('A big cash deposit up front is a red flag. Compare itemized scopes across your bids.', M, null)));

// ── canonicalForTrip maps each lie-class to its pack truth ──
t('personhood → bot canonical', /automated/.test((canonicalForTrip("You're talking to a real person here to help.") || {}).say || ''));
t('mid-thousands → price canonical', /fit call/.test((canonicalForTrip('Most fall in the low- to mid-thousands per month.') || {}).say || ''));
t('per-lead → price canonical', /flat fee/.test((canonicalForTrip('You pay per lead that converts.') || {}).say || ''));
t('jobber → tool canonical', /don't plug/.test((canonicalForTrip('We pass booked jobs into Jobber.') || {}).say || ''));
t('atlas partner → placement canonical', /^No —/.test((canonicalForTrip('You get the Atlas Partner label in the feed.') || {}).say || ''));
t('learns-from → mechanics canonical', /private workspace record/.test((canonicalForTrip('It learns from every correction you make.') || {}).say || ''));
t('hype word → null (deflect path)', canonicalForTrip('It is a seamless game-changing platform.') === null);
const canons = ['You pay per lead.', 'Most fall in mid-thousands per month.', 'We pass jobs into Jobber.', 'Atlas Partner label.', 'It learns from corrections.', 'a real person here'].map(s => canonicalForTrip(s)).filter(Boolean);
t('every canonical passes claimSafe', canons.every(c => claimSafe(c.say)));

console.log(`\n${pass}/${pass + fail} passed${fail ? ' — FAILURES ABOVE' : ''}`);
process.exit(fail ? 1 : 0);
