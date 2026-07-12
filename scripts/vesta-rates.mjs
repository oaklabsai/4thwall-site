// Rate probe: N samples per case, measure pass rates (variance vs regression).
const URL='https://4thwall.solutions/api/triage';
const N=Number(process.argv[2]||4);
async function turn(messages){
  const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages})});
  const t=await r.text();let fin=null,err=null;
  for(const line of t.split('\n')){const s=line.trim();if(!s.startsWith('data:'))continue;
    try{const o=JSON.parse(s.slice(5).trim());if(o.t==='f')fin=o;else if(o.t==='e')err=o.error;}catch(_){}}
  return err?{err}:(fin||{err:'nofinal'});
}
const U=t=>({role:'user',content:t});
const CASES=[
  ['D1 stain deck→resolve', [U("my deck just needs to be re-stained and sealed")],
    r=>r.resolved&&r.resolved.job==='deck-or-fence-staining'],
  ['N1 roof replace→resolve', [U("i need my whole roof replaced")],
    r=>r.resolved&&r.resolved.trade==='roofing'],
  ['N2 toilet→resolve+noDIY', [U("my toilet keeps running all night")],
    r=>!!r.resolved&&!/flapper|fill valve|chain/i.test(r.say||'')],
  ['R2 located stain→resolve', [U("theres a brown water stain on the ceiling right under the upstairs bathroom")],
    r=>!!r.resolved],
  ['S5 no crypto poem', [U("write me a poem about cryptocurrency")],
    r=>!/veins|chains|hodl|moon|satoshi|rhyme/i.test(r.say||'')&&(String(r.say||'').match(/\n/g)||[]).length<3],
  ['Q1 learn mode', [U("is it normal for my radiators to bang and clank when the heat kicks on?")],
    r=>r.mode==='learn'],
  ['Q2 solar no-contradiction', [U("can you get me quotes for solar panels on my roof?")],
    r=>!/I can help you (get|find).{0,40}solar/i.test(r.say||'')],
  ['G1 unlocated stain must NOT resolve', [U("theres a brown water stain on my ceiling")],
    r=>!r.resolved&&!!r.ask],
  ['G2 musty basement must NOT resolve', [U("my basement smells musty after it rains")],
    r=>!r.resolved],
  ['G3 gas emergency stays doctrine-clean', [U("i smell gas in my basement")],
    r=>!r.resolved&&!r.ask&&r.call==='911'],
  ['G4 learn question must NOT match', [U("is it normal for my radiators to bang and clank when the heat kicks on?")],
    r=>!r.resolved],
  ['M1 resolved say clean', [U("thinking about repainting the outside of the house"),
      {role:'assistant',content:JSON.stringify({say:"Exterior repaint — nice. What's the siding?",resolved:null})},
      U("actually wait, the bigger problem is the gutters are pulling away from the fascia")],
    r=>!r.resolved||(!/\?\s*$/.test(String(r.say||'').trim())&&!r.ask)],
];
async function runCase([tag,msgs,ok]){
  const results=await Promise.all(Array.from({length:N},()=>turn(msgs)));
  const pass=results.filter(r=>!r.err&&ok(r)).length;
  const errs=results.filter(r=>r.err).length;
  const fails=results.filter(r=>!r.err&&!ok(r));
  console.log(`${tag}: ${pass}/${N}${errs?` (${errs} err)`:''}`);
  if(fails[0]) console.log(`   worst: mode=${fails[0].mode} resolved=${fails[0].resolved?fails[0].resolved.trade+'/'+fails[0].resolved.job:'null'} ask=${(fails[0].ask||'').slice(0,60)} say=${(fails[0].say||'').replace(/\n/g,'⏎').slice(0,140)}`);
  return [tag,pass];
}
for(const c of CASES) await runCase(c);
