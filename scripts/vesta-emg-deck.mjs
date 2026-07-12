const URL='https://4thwall.solutions/api/triage';
async function turn(messages,op){
  const body=JSON.stringify(op?{op,messages}:{messages});
  const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body});
  if(op==='writeup'){const j=await r.json().catch(()=>({}));return{writeup:j};}
  const t=await r.text();let say='',fin=null,err=null;
  for(const line of t.split('\n')){const s=line.trim();if(!s.startsWith('data:'))continue;const p=s.slice(5).trim();
    try{const o=JSON.parse(p);if(o.t==='d')say+=o.c||'';else if(o.t==='f')fin=o;else if(o.t==='e')err=o.error;}catch(_){}}
  if(err)return{err};
  return fin?{say:fin.say,ask:fin.ask,chips:fin.chips,mode:fin.mode,resolved:fin.resolved,call:fin.call,deck:fin.deck&&{trade:fin.deck.trade,job:fin.deck.job,emergency:fin.deck.emergency}}:{say,note:'NO FINAL'};
}
const A=(say,resolved)=>({role:'assistant',content:JSON.stringify({say:(say||'').slice(0,220),resolved:resolved||null})});
const U=t=>({role:'user',content:t});
function show(tag,r){
  const rez=r.resolved?`${r.resolved.trade}/${r.resolved.job}[${r.resolved.urgency}]`:'—';
  const deck=r.deck?` deck:${r.deck.trade}/${r.deck.job}${r.deck.emergency?'(EMG)':''}`:'';
  console.log(`\n### ${tag}`);
  if(r.err){console.log('  ERROR '+r.err);return r;}
  console.log(`  mode=${r.mode||'?'} resolved=${rez}${deck} call=${r.call||'-'}${r.note?' ⚠'+r.note:''}`);
  if(r.ask)console.log(`  ask: ${r.ask}${r.chips?' chips='+JSON.stringify(r.chips):''}`);
  console.log(`  say: ${(r.say||'').replace(/\n/g,' ⏎ ')}`);
  return r;
}
async function main(){
  console.log('=== EMERGENCIES ===');
  show('A1 water pouring through ceiling', await turn([U("water is pouring through my kitchen ceiling right now")]));
  show('A2 gas smell',                     await turn([U("i smell gas in my basement")]));
  show('A3 sparking outlet + burning',     await turn([U("theres sparking from an outlet and a burning smell")]));
  show('A4 no heat, freezing',             await turn([U("furnace is dead and its 12 degrees out, house is freezing")]));
  console.log('\n=== DECKS ===');
  const g1=show('D1 deck rotting', await turn([U("my deck boards are soft and rotting in a few spots")]));
  show('D2 → find someone', await turn([U("my deck boards are soft and rotting in a few spots"),A(g1.say,g1.resolved),U("yes please find someone")]));
  show('D3 new deck build', await turn([U("i want to build a brand new deck off the back of my house")]));
  show('D4 stain my deck', await turn([U("my deck just needs to be re-stained and sealed")]));
}
main().catch(e=>{console.error('ERR',e);process.exit(1);});
