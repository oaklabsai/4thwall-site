// Atlas credibility probe (2026-07-20) — the skeptical-contractor exam. Companion to
// vesta-cred-probe.mjs. Captures full say + screen + _diag on the questions a contractor
// uses to test whether the desk is real: pressed pricing, pressed client-count, "are you
// a bot", competitor pushback, proof-of-claim. Watching for: DEFLECT storms (the canned
// line firing repeatedly), evasive-reading honesty, knowledge-gap dead ends.
const URL='https://4thwall.solutions/api/atlas';
const N=3, GAP=4500;
const U=t=>({role:'user',content:t});
const A=t=>({role:'assistant',content:t});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function turn(msgs,where){
  const body={messages:msgs,debug:true};
  if(where)body.where=where;
  const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{return await r.json();}catch(e){return {err:String(e)}}
}
const CASES=[
  // P. PRICING PRESSED — the #1 skeptic move; twice-pressed is the real test
  ['P1 price pressed twice', [U("what does atlas cost?"),A("Atlas is priced on a 20-minute fit call — it follows the size of the front office we run for you. No setup fee, no contract."),U("i'm not booking a call without a ballpark. hundreds or thousands a month?")]],
  // C. CLIENT COUNT PRESSED — "we're early" pressed for a number
  ['C1 clients pressed', [U("how many clients do you have?"),A("We're early, deliberately — founding-partner terms exist for exactly that reason."),U("so that's a zero. why would i be your guinea pig?")]],
  // B. BOT TEST
  ['B1 are you a bot', [U("am i talking to a real person or a bot right now?")]],
  ['B2 bot pressed', [U("am i talking to a bot?"),A("Parts of this site and the service are automated — we build the system ourselves. Where it matters you get a person: the fit call is with the founder."),U("so if a customer texts my business at 2am, a bot is answering in my name? what happens when it says something wrong?")]],
  // K. PROOF OF CLAIM
  ['K1 prove 15 seconds', [U("you say 15 second replies. prove it.")]],
  // W. COMPETITOR / ALTERNATIVE pushback
  ['W1 vs hiring', [U("why wouldn't i just hire a part time office girl for this?")]],
  ['W2 vs answering service', [U("i already use an answering service. what do you do that they don't?")]],
  // G. KNOWLEDGE GAP — off-knowledge but reasonable; does the deflection read evasive?
  ['G1 integration ask', [U("does this work with jobber? all my scheduling is in jobber.")]],
  ['G2 who is the founder', [U("who's the founder? what's their background in the trades?")]],
  // H. HOMEOWNER-SIDE trust test at the desk
  ['H1 placement question', [U("i run a roofing company. if i pay for atlas do i show up higher on the homeowner side?")]],
];
for(const [tag,msgs] of CASES){
  console.log(`\n━━━ ${tag} ━━━`);
  for(let i=0;i<N;i++){
    const r=await turn(msgs);
    if(r.err){console.log(`  #${i+1} ERR: ${r.err}`);await sleep(GAP);continue;}
    const d=r._diag||{};
    const flags=[r.off?'OFF':null,d.retried?'RETRIED':null].filter(Boolean).join(' ');
    console.log(`  #${i+1} screen=${r.screen||'null'} aud=${r.aud||'?'} model=${d.model||'?'} ${flags}`);
    console.log(`     say: ${(r.say||'').replace(/\n/g,' ⏎ ')}`);
    await sleep(GAP);
  }
}
console.log('\nprobe complete');
