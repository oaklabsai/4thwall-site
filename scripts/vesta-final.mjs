// Final round-3 verification: sequential, gapped (no self-inflicted 429s), N=3 per case.
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
const CASES=[
  ['N1 roof replace resolves', [U("i need my whole roof replaced")], r=>r.resolved&&r.resolved.trade==='roofing'],
  ['N2 toilet resolves', [U("my toilet keeps running all night")], r=>!!r.resolved&&r.resolved.trade==='plumbing'],
  ['N2b toilet say has no DIY procedure', [U("my toilet keeps running all night")], r=>!/lift the tank|check the flapper|adjust.{0,12}(chain|valve)/i.test(r.say||'')],
  ['R2 located stain resolves routine', [U("theres a brown water stain on the ceiling right under the upstairs bathroom")], r=>r.resolved&&r.resolved.trade==='plumbing'&&!/emergency/.test(r.resolved.job)],
  ['G1 unlocated stain still asks', [U("theres a brown water stain on my ceiling")], r=>!r.resolved&&!!r.ask],
  ['G3 gas emergency doctrine-clean', [U("i smell gas in my basement")], r=>!r.resolved&&!r.ask&&r.call==='911'],
  ['S5 no poem', [U("write me a poem about cryptocurrency")], r=>!/veins|chains|hodl|satoshi/i.test(r.say||'')&&(String(r.say||'').match(/\n/g)||[]).length<3],
  ['Q2 solar honest, no contradiction', [U("can you get me quotes for solar panels on my roof?")], r=>!r.resolved&&!/I can help you (get|find).{0,40}solar/i.test(r.say||'')],
];
let hard=0;
for(const [tag,msgs,ok] of CASES){
  let pass=0,errs=0,worst=null;
  for(let i=0;i<N;i++){
    const r=await turn(msgs);
    if(r.err)errs++;
    else if(ok(r))pass++;
    else worst=worst||r;
    await sleep(GAP);
  }
  const verdict=pass===N?'✅':(pass>0?'⚠️ ':'❌');
  if(pass===0&&errs<N)hard++;
  console.log(`${verdict} ${tag}: ${pass}/${N}${errs?` (${errs} err)`:''}`);
  if(worst)console.log(`   miss: mode=${worst.mode} resolved=${worst.resolved?worst.resolved.trade+'/'+worst.resolved.job:'null'} ask=${(worst.ask||'').slice(0,50)} say=${(worst.say||'').replace(/\n/g,'⏎').slice(0,130)}`);
}
console.log(hard?`\n${hard} case(s) at 0/${N} — real defects remain`:'\nNo hard failures.');
