// Credibility probe — maps the hard-case boundary for the chat-intelligence pass (2026-07-20).
// NOT a pass/fail battery: captures full say + machine state on the question shapes a
// skeptical homeowner uses as the credibility exam, so each failure classifies into a
// bucket: CONTRACT (no authorized teach content), ROUTING (multi-step rule fumbled),
// HATCH (vague "tell me more" void). Sequential + gapped (no self-inflicted 429s).
const URL='https://4thwall.solutions/api/triage';
const N=3, GAP=4500;
const U=t=>({role:'user',content:t});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function turn(msgs){
  const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs})});
  const t=await r.text();let fin=null,err=null;
  for(const l of t.split('\n')){const s=l.trim();if(!s.startsWith('data:'))continue;
    try{const o=JSON.parse(s.slice(5).trim());if(o.t==='f')fin=o;else if(o.t==='e')err=o.error;}catch(_){}}
  return err?{err}:(fin||{err:'nofinal'});
}
// The vague-hatch detector: an ask with no chips that adds no expert distinction.
const isHatch=r=>!r.resolved&&r.ask&&!r.chips&&/tell me (a bit )?more|what('s| is) going on|can you (describe|explain)/i.test(r.ask);
const CASES=[
  // A. PRICE — the known dead end (redline starves learn mode)
  ['A1 fair-price roof', [U("what does a fair price for a new roof look like in fairfield county?")]],
  ['A2 water-heater cost', [U("how much should it cost to replace a water heater?")]],
  ['A3 press for ballpark', [U("what does a fair price for a new roof look like?"),{role:'assistant',content:"I can't quote prices, but I can line up vetted roofers who'll bid it."},U("come on, just a ballpark. am I looking at 10k or 40k?")]],
  // B. MULTI-NEED — sequencing (the rule exists at triage.mjs:236, execution is the question)
  ['B1 1962 colonial order', [U("we just bought a 1962 colonial. old furnace, 100 amp panel, chimney needs repointing. what order do we tackle it?")]],
  ['B2 two-need smaller', [U("my gutters are pulling away and the fascia behind them looks rotten. who do I even call first?")]],
  // C. KNOWN HATCH TRIGGER
  ['C1 AC quit 90 out', [U("our AC just quit and it's 90 degrees out")]],
  // D. TRUST TEST — the skeptical homeowner's credibility exam (never probed before)
  ['D1 why trust you', [U("why should I trust your recommendations?")]],
  ['D2 pay to play', [U("are these just contractors who paid you to be listed?")]],
  ['D3 vs angi', [U("how is this different from Angi or Angie's List?")]],
  // E. JUDGMENT — comparative help, the highest-value teach moment
  ['E1 three quotes wild', [U("I got three roof quotes: 12k, 19k, and 31k. how do I pick?")]],
  ['E2 lowball smell', [U("one contractor wants half up front in cash. is that normal?")]],
  // F. LEARN MODE — is it actually alive
  ['F1 rumbling heater', [U("my water heater makes a rumbling noise. is that normal?")]],
];
for(const [tag,msgs] of CASES){
  console.log(`\n━━━ ${tag} ━━━`);
  for(let i=0;i<N;i++){
    const r=await turn(msgs);
    if(r.err){console.log(`  #${i+1} ERR: ${r.err}`);await sleep(GAP);continue;}
    const flags=[isHatch(r)?'⚠️HATCH':null,r.deck?'DECK':null].filter(Boolean).join(' ');
    console.log(`  #${i+1} mode=${r.mode} resolved=${r.resolved?r.resolved.trade+'/'+r.resolved.job:'null'} chips=${r.chips?r.chips.length:0} ${flags}`);
    console.log(`     say: ${(r.say||'').replace(/\n/g,' ⏎ ')}`);
    if(r.ask)console.log(`     ask: ${r.ask}`);
    if(r.chips)console.log(`     chips: ${JSON.stringify(r.chips)}`);
    await sleep(GAP);
  }
}
console.log('\nprobe complete');
