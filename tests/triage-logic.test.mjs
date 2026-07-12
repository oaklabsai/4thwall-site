// Vesta triage logic suite — pure-function tests over the REAL exports (no drift).
// Run: node tests/triage-logic.test.mjs
import { bankValidate, extractJSON, extractiveOK } from '../api/triage.mjs';
let n=0, f=0; const T=(name,cond)=>{ n++; if(!cond){ f++; console.log('FAIL:',name); } };

const bank = {
  roofing:[{job:'full-roof-replacement',emergency:false,pct:85},{job:'emergency-leak-or-burst',emergency:true,pct:40},{job:'roof-plus-siding-gutters',emergency:false,pct:20}],
  hvac:[{job:'no-heat-emergency',emergency:true,pct:71},{job:'routine-maintenance-tuneup',emergency:false,pct:88},{job:'system-repair-not-cooling',emergency:false,pct:60}],
  plumbing:[{job:'fixture-or-small-repair',emergency:false,pct:70},{job:'emergency-leak-or-burst',emergency:true,pct:90}],
  lawn:[{job:'full-relandscape',emergency:false,pct:30},{job:'planting-and-garden-beds',emergency:false,pct:50}],
  tree:[{job:'tree-removal',emergency:false,pct:89}],
  windows_doors:[{job:'window-replacement',emergency:false,pct:60},{job:'door-installation',emergency:false,pct:40}],
  paving:[{job:'new-driveway',emergency:false,pct:55},{job:'concrete-patio-or-walkway',emergency:false,pct:35}],
  masonry:[{job:'patio-or-walkway',emergency:false,pct:45}],
  pool:[{job:'leak-detection-repair',emergency:false,pct:20}],
};

// ── trade normalization: exact / case / whitespace ──
T('exact trade', bankValidate(bank,'roofing','full-roof-replacement')?.trade==='roofing');
T('case-insensitive', bankValidate(bank,'Roofing','full-roof-replacement')?.trade==='roofing');
T('trailing space', bankValidate(bank,'plumbing ','fixture-or-small-repair')?.trade==='plumbing');
T('null trade', bankValidate(bank,null,'tree-removal')===null);
T('empty trade', bankValidate(bank,'','tree-removal')===null);
// ── prefix matching ──
T('plumber→plumbing', bankValidate(bank,'plumber','fixture-or-small-repair')?.trade==='plumbing');
T('windows→windows_doors', bankValidate(bank,'windows','window-replacement')?.trade==='windows_doors');
T('tree_service→tree', bankValidate(bank,'tree_service','tree-removal')?.trade==='tree');
T('lawn care→lawn', bankValidate(bank,'lawn care','full-relandscape')?.trade==='lawn');
T('electrician no bank → null', bankValidate(bank,'electrician','anything')===null);
// ── TRADE_ALIAS ──
T('landscaping→lawn', bankValidate(bank,'landscaping','full-relandscape')?.trade==='lawn');
T('landscape→lawn', bankValidate(bank,'landscape','planting-and-garden-beds')?.trade==='lawn');
T('landscaper→lawn', bankValidate(bank,'Landscaper','full-relandscape')?.trade==='lawn');
T('lawncare→lawn', bankValidate(bank,'lawncare','full-relandscape')?.trade==='lawn');
T('arborist→tree', bankValidate(bank,'arborist','tree-removal')?.trade==='tree');
T('doors→windows_doors', bankValidate(bank,'doors','door-installation')?.trade==='windows_doors');
T('door→windows_doors', bankValidate(bank,'door','door-installation')?.trade==='windows_doors');
T('concrete→paving', bankValidate(bank,'concrete','concrete-patio-or-walkway')?.trade==='paving');
T('driveway→paving', bankValidate(bank,'driveway','new-driveway')?.trade==='paving');
T('garbage trade null', bankValidate(bank,'garbage','x')===null);
// ── job normalization ──
T('star stripped', bankValidate(bank,'hvac','no-heat-emergency*')?.job==='no-heat-emergency');
T('double star', bankValidate(bank,'hvac','no-heat-emergency**')?.job==='no-heat-emergency');
T('spaces→dashes', bankValidate(bank,'roofing','full roof replacement')?.job==='full-roof-replacement');
T('underscores→dashes', bankValidate(bank,'roofing','full_roof_replacement')?.job==='full-roof-replacement');
T('job case', bankValidate(bank,'roofing','Full-Roof-Replacement')?.job==='full-roof-replacement');
T('emergency flag carried', bankValidate(bank,'plumbing','emergency-leak-or-burst')?.emergency===true);
T('pct carried', bankValidate(bank,'hvac','routine-maintenance-tuneup')?.pct===88);
T('label spaces', bankValidate(bank,'roofing','full-roof-replacement')?.label==='full roof replacement');
T('tradeLabel', bankValidate(bank,'hvac','no-heat-emergency')?.tradeLabel==='HVAC');
T('null job', bankValidate(bank,'roofing',null)===null);
// ── near-miss rescue (2+ shared tokens, unique best) ──
T('emergency leak repair→emergency-leak-or-burst', bankValidate(bank,'plumbing','emergency leak repair')?.job==='emergency-leak-or-burst');
T('roof replacement full→match', bankValidate(bank,'roofing','replacement roof full')?.job==='full-roof-replacement');
T('one shared token rejected', bankValidate(bank,'roofing','roof cleaning')===null);
T('ac not cooling repair→system-repair', bankValidate(bank,'hvac','repair not cooling')?.job==='system-repair-not-cooling');
T('short tokens ignored', bankValidate(bank,'tree','a of removal tree')?.job==='tree-removal');
T('no signal null', bankValidate(bank,'masonry','chimney sweep')===null);
// ── extractJSON: clean / fenced / salvage ──
T('clean json', extractJSON('{"say":"hi","resolved":null}')?.say==='hi');
T('prose-wrapped', extractJSON('Sure! {"say":"hi"} hope that helps')?.say==='hi');
T('fenced', extractJSON('```json\n{"say":"hi"}\n```')?.say==='hi');
T('fenced no lang', extractJSON('```\n{"say":"hi"}\n```')?.say==='hi');
T('truncated mid-string salvage', extractJSON('{"say":"the roof is leaking and')?.say?.startsWith('the roof')===true);
T('truncated mid-object salvage', extractJSON('{"say":"hi","ask":"where')!==null);
T('nested resolved', extractJSON('{"say":"x","resolved":{"trade":"hvac","job":"no-heat-emergency"}}')?.resolved?.trade==='hvac');
T('no json null', extractJSON('just prose, no object here')===null);
T('empty null', extractJSON('')===null);
T('null input', extractJSON(null)===null);
T('escaped quotes', extractJSON('{"say":"she said \\"hi\\" today"}')?.say?.includes('"hi"')===true);
T('newlines in say', extractJSON('{"say":"line1\\nline2"}')?.say?.includes('\n')===true);
// ── extractiveOK: garble backstop ──
const msgs = [{role:'user',content:'my brick chimney is crumbling near the top and dropping pieces on the roof'}];
T('verbatim passes', extractiveOK('my brick chimney is crumbling near the top', msgs)===true);
T('stem shift passes', extractiveOK('bricks crumbling from the chimney dropping pieces', msgs)===true);
T('composed narrative rejected', extractiveOK('homeowner requires professional masonry restoration services including mortar repointing structural assessment waterproofing treatment throughout', msgs)===false);
T('short extraction trusted', extractiveOK('chimney crumbling', msgs)===true);
T('empty work trusted-short', extractiveOK('', msgs)===true);
T('half-novel boundary rejected', extractiveOK('chimney brick crumbling roof pieces plus entirely fabricated invented manufactured imagined concocted details', msgs)===false);
// ── vmWindow (verbatim copy from vesta-app.html — client fn, kept in sync by review) ──
let vmMsgs=[];
function vmWindow(){
  const ctxTurn = m => m.role==='assistant' && (m.content.indexOf('"picks"')!==-1 || m.content.indexOf('"focus"')!==-1);
  const w = vmMsgs.slice(-12);
  if (w.some(ctxTurn)) return w;
  for (let i = vmMsgs.length - 13; i >= 0; i--){
    if (ctxTurn(vmMsgs[i])) return [vmMsgs[i], ...w.slice(1)];
  }
  return w;
}
const A=c=>({role:'assistant',content:c}), U=c=>({role:'user',content:c});
vmMsgs=[U('a')]; T('win: 1 msg', vmWindow().length===1);
vmMsgs=[U('a'),A('{"say":"x"}')]; T('win: no picks short', vmWindow().length===2);
vmMsgs=[U('1'),A('{"say":"x","picks":[1]}'),U('2'),A('{"say":"y"}')]; T('win: picks in window', vmWindow().some(m=>m.content.includes('"picks"')));
vmMsgs=[U('1'),A('{"say":"b","picks":[1]}')]; for(let i=0;i<8;i++){vmMsgs.push(U('q'+i));vmMsgs.push(A('{"say":"r'+i+'"}'));}
T('win: len stays 12', vmWindow().length===12);
T('win: picks pinned', vmWindow()[0].content.includes('"picks"'));
T('win: newest kept', vmWindow()[11]===vmMsgs[vmMsgs.length-1]);
vmMsgs=[A('{"say":"g","focus":{"name":"X"}}')]; for(let i=0;i<7;i++){vmMsgs.push(U('q'+i));vmMsgs.push(A('{"say":"r'+i+'"}'));}
T('win: focus pinned', vmWindow()[0].content.includes('"focus"'));
vmMsgs=[U('1'),A('{"say":"old","picks":[1]}'),U('2'),A('{"say":"new","picks":[2]}')]; for(let i=0;i<8;i++){vmMsgs.push(U('q'+i));vmMsgs.push(A('{"say":"r'+i+'"}'));}
T('win: NEWEST picks turn wins', vmWindow()[0].content.includes('"new"'));
vmMsgs=[]; for(let i=0;i<20;i++){vmMsgs.push(U('q'+i));vmMsgs.push(A('{"say":"r'+i+'"}'));}
T('win: no picks anywhere = plain slice', vmWindow().length===12 && !vmWindow().some(m=>m.content.includes('"picks"')));
T('win: user picks-text never pins', (vmMsgs=[U('tell me about "picks"'),...Array.from({length:14},(_,i)=>i%2?A('{"say":"r"}'):U('q'))], !vmWindow()[0].content.includes('tell me')));

console.log(`\n${n - f}/${n} PASS${f ? ' — ' + f + ' FAILED' : ''}`);
process.exit(f ? 1 : 0);
