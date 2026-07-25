// 4THWALL homepage contract.
//
// The conversational contractor desk now lives on /atlas and is covered by
// atlas-battery.mjs. This gate owns the public homepage: one brand per
// audience, a claim-safe Atlas Workspace demonstration, valid inline code and
// no regression to Slack or Lens as a separate contractor product.
//
// Run:
//   node scripts/desk-battery.mjs          # local source (blocking)
//   node scripts/desk-battery.mjs --live   # deployed homepage

import { readFileSync } from 'node:fs';

const live = process.argv.includes('--live');
const html = live
  ? await (await fetch('https://4thwall.solutions/')).text()
  : readFileSync(new URL('../landing-next.html', import.meta.url), 'utf8');
const atlasHtml = live
  ? await (await fetch('https://4thwall.solutions/atlas')).text()
  : readFileSync(new URL('../atlas-next.html', import.meta.url), 'utf8');

let pass = 0;
let fail = 0;
function check(name, condition) {
  console.log(`${condition ? '✓' : '✗'} ${name}`);
  condition ? pass++ : fail++;
}

const withoutCode = html
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');

check('document title names Atlas Workspace', /<title>4THWALL — Atlas Workspace/.test(html));
check(
  'description states the accountable front office',
  /Atlas Workspace is the accountable front office/.test(html),
);
check(
  'hero carries the adopted contractor promise',
  /You do the work\.[\s\S]{0,80}Atlas keeps the job moving\./.test(withoutCode),
);
check(
  'hero explains crew, Atlas and the work in one private place',
  /every lead, job, teammate decision and follow-up in one private place/.test(withoutCode),
);

const audienceCards = [...withoutCode.matchAll(/class="fork-col\b/g)].length;
check('exactly two audience cards', audienceCards === 2);
check('Atlas is the contractor door', /For Contractors[\s\S]{0,500}Atlas Workspace/.test(withoutCode));
check('Vesta is the homeowner door', /Vesta[\s\S]{0,500}For Homeowners/.test(withoutCode));
check('Lens is not a navigation or product door', !/href="\/lens(?:["#?])/.test(withoutCode));
check('structured data exposes only Atlas and Vesta brands', !/"name": "Lens"/.test(html));

check('workspace demonstration exists', /class="aw-demo"/.test(withoutCode));
check(
  'demonstration is labeled in the component',
  /Labeled example/.test(withoutCode)
    && /Product demonstration · example company and records · no customer outcome claimed/.test(withoutCode),
);
check('workspace demonstration shows exact ownership', /Alex assigned Sam/.test(withoutCode));
check('workspace demonstration shows Atlas state', /Atlas succeeded/.test(withoutCode));
check('workspace demonstration shows named decision authority', /Only Sam can answer/.test(withoutCode));

check('no Slack asset remains on the active homepage', !/atlas-slack\.png/i.test(html));
check('no Slack explanation remains on the active homepage', !/What is Slack|private Slack|Slack channel/i.test(withoutCode));
check('founding-contractor action is present', /Apply as a founding contractor/.test(withoutCode));
check('reduced-motion handling remains present', /prefers-reduced-motion:\s*reduce/.test(html));
check('mobile workspace proof has a responsive rule', /@media\(max-width:760px\)\{\.aw-demo/.test(html));

const atlasWithoutStylesAndComments = atlasHtml
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');
check('contractor page is named Atlas Workspace', /<title>Atlas Workspace/.test(atlasHtml));
check('contractor page renders a first-party Workspace room', /Room ·[\s\S]{0,200}Atlas Workspace/.test(atlasWithoutStylesAndComments));
check(
  'contractor page labels simulated records without claiming customer outcomes',
  /Product demonstration · example company and records · no customer outcome claimed/.test(atlasWithoutStylesAndComments),
);
check(
  'contractor page has no active Slack explainer or logo',
  !/What is Slack|SLACK_LOGO|atlas-slack\.png/i.test(atlasWithoutStylesAndComments),
);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
check('HTML ids are unique', new Set(ids).size === ids.length);

const jsonScripts = [...html.matchAll(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
)].map((match) => match[1]);
let jsonValid = jsonScripts.length > 0;
for (const source of jsonScripts) {
  try {
    JSON.parse(source);
  } catch {
    jsonValid = false;
  }
}
check('structured data parses', jsonValid);

const inlineScripts = [...html.matchAll(
  /<script>([\s\S]*?)<\/script>/g,
)].map((match) => match[1]);
let scriptValid = inlineScripts.length > 0;
for (const source of inlineScripts) {
  try {
    Function(source);
  } catch {
    scriptValid = false;
  }
}
check('inline homepage code parses', scriptValid);

console.log(`\n${pass}/${pass + fail} passed${fail ? ' — FAILURES ABOVE' : ''}`);
process.exit(fail ? 1 : 0);
