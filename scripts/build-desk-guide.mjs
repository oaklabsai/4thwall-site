// DESK GUIDE BUILDER (Front Desk P4) — emits /desk-guide.json, the static data the
// desk's cost-chart and hiring-guide screens assemble from. NO new data is authored
// here; both sources stay single-sourced and this script only compiles them:
//   · COST_GUIDE   ← imported from api/_render-directory.mjs (the directory's guide)
//   · PGUIDE + PTRADE_LABEL + PTRADE_PROS ← parsed out of vesta-app.html (the app's
//     own hiring checklist — vesta-app remains the owner; this is a compile, not a copy)
// Re-run whenever either source changes, then redeploy:
//   node scripts/build-desk-guide.mjs && vercel deploy --prod --yes

import { readFileSync, writeFileSync } from 'node:fs';
import { COST_GUIDE } from '../api/_render-directory.mjs';

const app = readFileSync(new URL('../vesta-app.html', import.meta.url), 'utf8');
function extract(name){
  const m = app.match(new RegExp('const ' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\n?\\});'));
  if (!m) throw new Error(name + ' not found in vesta-app.html');
  return new Function('return ' + m[1])();
}
const PGUIDE = extract('PGUIDE');
const LABEL = extract('PTRADE_LABEL');
const PROS = extract('PTRADE_PROS');

const trades = {};
for (const key of new Set([...Object.keys(COST_GUIDE), ...Object.keys(PGUIDE)])){
  trades[key] = {
    label: LABEL[key] || key,
    pros: PROS[key] || 'contractors',
    cost: COST_GUIDE[key] || null,
    guide: PGUIDE[key] || null,
  };
}
const out = { built: new Date().toISOString().slice(0, 10), trades };
writeFileSync(new URL('../desk-guide.json', import.meta.url), JSON.stringify(out));
const n = Object.keys(trades).length;
console.log(`desk-guide.json — ${n} trades · cost:${Object.values(trades).filter(t=>t.cost).length} · guide:${Object.values(trades).filter(t=>t.guide).length}`);
