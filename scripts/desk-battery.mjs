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

check('document title states the 4THWALL category', /<title>4THWALL — The operating layer around the work<\/title>/.test(html));
check(
  'description states the Atlas lifecycle and Vesta relationship',
  /Atlas connects the customer lifecycle around the job/.test(html) && /Vesta makes the public record easier to understand/.test(html),
);
check(
  'hero carries the adopted lifecycle promise',
  /Every customer interaction should[\s\S]{0,120}move the business forward\./.test(withoutCode),
);
check(
  'hero states the currently operated response lane',
  /starting with supported inbound texts and missed-call recovery/.test(withoutCode),
);

const audienceCards = [...withoutCode.matchAll(/class="fork-col\b/g)].length;
check('exactly two audience cards', audienceCards === 2);
check('Atlas is the contractor door', /For Contractors[\s\S]{0,500}<h2 class="pcard-title">Atlas/.test(withoutCode));
check('Vesta is the homeowner door', /Vesta[\s\S]{0,500}For Homeowners/.test(withoutCode));
check('Lens is not a navigation or product door', !/href="\/lens(?:["#?])/.test(withoutCode));
check('structured data exposes only Atlas and Vesta brands', !/"name": "Lens"/.test(html));

check('workspace product capture exists', /class="fd-shot"/.test(withoutCode) && /atlas-workspace\.png/.test(withoutCode));
check(
  'workspace capture names the actual governed rooms',
  /Needs you/.test(withoutCode) && /Dispatcher wrote and has not sent/.test(withoutCode),
);
check('homepage does not promise live voice answering', !/answers every call|answers the phone|live voice answering/i.test(withoutCode));
check('homepage does not promise automated quote chasing', !/follows up on the quote|chases? (?:the )?quote/i.test(withoutCode));
check('homepage campaign copy preserves owner approval', /Campaigns are prepared for your approval before anything is sent/.test(withoutCode));

check('no Slack asset remains on the active homepage', !/atlas-slack\.png/i.test(html));
check('no Slack explanation remains on the active homepage', !/What is Slack|private Slack|Slack channel/i.test(withoutCode));
check('founding-contractor action is present', /Apply as a founding contractor/.test(withoutCode));
check('reduced-motion handling remains present', /prefers-reduced-motion:\s*reduce/.test(html));
check('mobile workspace proof has a responsive rule', /@media\(max-width:760px\)\{\.aw-demo/.test(html));
check('Atlas evidence remains private before any public use', /operated evidence remains private first/.test(withoutCode));
check('homepage states that nothing becomes public automatically', /Nothing becomes public automatically/.test(withoutCode));
check('Vesta does not claim to certify workmanship', /without pretending that a profile certifies workmanship/.test(withoutCode));

const atlasWithoutStylesAndComments = atlasHtml
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');
check('contractor page is named Atlas', /<title>Atlas —/.test(atlasHtml));
check('contractor page renders a first-party Atlas room', /Room ·/.test(atlasHtml) && /<span class="slk-tag">Atlas/.test(atlasHtml));
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
