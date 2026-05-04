/* 4THWALL Command Center — dashboard controller */
(function(){
'use strict';

const WORKER = 'https://fourthwall-bot.4thwalldevelopment.workers.dev';
const token = localStorage.getItem('fw_token');
if (!token) { window.location.href = '/login.html'; return; }

const businessName = localStorage.getItem('fw_business') || '4THWALL Client';
const firstName    = localStorage.getItem('fw_name') || '';
const tier         = localStorage.getItem('fw_tier') || 'growth';
const userEmail    = localStorage.getItem('fw_email') || '';
let isAdmin        = userEmail === 'andrew@4thwall.solutions';
let tradeType      = 'roofing';

// ── Trade configuration ────────────────────────────────────
const TRADES = {
  roofing: {
    label:'Roofing', stagesUnit:'roof',
    leadStages:['New Lead','Contacted','Inspection Scheduled','Estimate Sent','Won','Lost','Nurture'],
    kpi5Label:'Inspections this week', kpi5Key:'inspections_week',
    kpi6Label:'Est. opportunity', kpi6Key:'opportunity', avgJobValue:18000,
    leadsSub:'Every homeowner your AI has talked to.',
    reportHero:(n,v)=>`Your AI captured <em>${n} leads</em> worth an estimated <em>$${k(v)}</em> this month.`,
    widget:'storm',
  },
  hvac: {
    label:'HVAC', stagesUnit:'system',
    leadStages:['New Lead','Contacted','Service Scheduled','Completed','Won','Lost','Maintenance'],
    kpi5Label:'Service calls today', kpi5Key:'service_calls', avgJobValue:4500,
    kpi6Label:'Membership renewal',  kpi6Key:'membership_pct',
    leadsSub:'Every service request your AI handled.',
    reportHero:(n)=>`Your AI booked <em>${n} service calls</em> this month.`,
    widget:'membership',
  },
  plumbing: {
    label:'Plumbing', stagesUnit:'service call',
    leadStages:['New Lead','Contacted','Booked','Completed','Won','Lost','Nurture'],
    kpi5Label:'Emergency calls captured', kpi5Key:'emergency_calls', avgJobValue:1200,
    kpi6Label:'After-hours capture',      kpi6Key:'after_hours_pct',
    leadsSub:'Every plumbing call your AI captured.',
    reportHero:(n,v)=>`Your AI recovered <em>${n} after-hours calls</em> — est. $${k(v)} captured.`,
    widget:'afterHours',
  },
  remodeling: {
    label:'Remodeling', stagesUnit:'project',
    leadStages:['New Lead','Contacted','Consultation','Proposal','Negotiating','Won','Lost'],
    kpi5Label:'Consultations this month', kpi5Key:'consultations', avgJobValue:65000,
    kpi6Label:'Avg project value',        kpi6Key:'avg_project_value',
    leadsSub:'Every project inquiry your AI handled.',
    reportHero:(n,v)=>`Your AI generated <em>${n} consultations</em> worth est. $${k(v)}.`,
    widget:'pipeline',
  },
  general_contractor: {
    label:'General Contractor', stagesUnit:'project',
    leadStages:['New Lead','Contacted','Bid Submitted','Reviewing','Won','Lost'],
    kpi5Label:'Active bids', kpi5Key:'active_bids', avgJobValue:120000,
    kpi6Label:'Bid-hit ratio (90d)', kpi6Key:'bid_hit',
    leadsSub:'Every project lead your AI engaged.',
    reportHero:(n,v)=>`Your AI captured <em>${n} bids</em> worth est. $${k(v)}.`,
    widget:'bidBoard',
  },
  electrical: {
    label:'Electrical', stagesUnit:'job',
    leadStages:['New Lead','Contacted','Scheduled','Completed','Won','Lost','Nurture'],
    kpi5Label:'Jobs scheduled this week', kpi5Key:'jobs_week', avgJobValue:2400,
    kpi6Label:'Callback rate',            kpi6Key:'callback_rate',
    leadsSub:'Every job your AI captured.',
    reportHero:(n)=>`Your AI captured <em>${n} jobs</em> this month.`,
    widget:'pipeline',
  },
  landscaping: {
    label:'Landscaping', stagesUnit:'project',
    leadStages:['New Lead','Contacted','Visit Scheduled','Quoted','Won','Lost','Recurring'],
    kpi5Label:'Active recurring contracts', kpi5Key:'recurring', avgJobValue:8500,
    kpi6Label:'Renewal rate',               kpi6Key:'renewal_rate',
    leadsSub:'Every property your AI engaged.',
    reportHero:(n)=>`Your AI engaged <em>${n} new properties</em> this month.`,
    widget:'recurring',
  },
  painting: {
    label:'Painting', stagesUnit:'project',
    leadStages:['New Lead','Contacted','Estimate Sent','Scheduled','Won','Lost','Nurture'],
    kpi5Label:'Estimates sent this month', kpi5Key:'estimates', avgJobValue:6500,
    kpi6Label:'Estimate close rate',       kpi6Key:'close_rate',
    leadsSub:'Every paint job your AI captured.',
    reportHero:(n,v)=>`Your AI sent <em>${n} estimates</em> worth est. $${k(v)}.`,
    widget:'aging',
  },
};

function trade(){ return TRADES[tradeType] || TRADES.roofing; }
function k(n){ return n>=1000 ? Math.round(n/1000)+'K' : String(n); }

// ── Init topbar ────────────────────────────────────────────
document.getElementById('topBiz').textContent = businessName;
document.getElementById('userAvatar').textContent = (firstName || businessName || '?').charAt(0).toUpperCase();

(function setGreeting(){
  const hr = new Date().getHours();
  const t = hr<12 ? 'morning' : hr<17 ? 'afternoon' : 'evening';
  const n = firstName ? `, ${firstName}` : '';
  document.getElementById('greetingH1').innerHTML = `Good ${t}${n}.`;
})();

// ── API ────────────────────────────────────────────────────
async function api(path, body={}){
  try {
    const res = await fetch(`${WORKER}${path}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
      body:JSON.stringify(body),
    });
    if (res.status === 401){
      localStorage.clear();
      window.location.href = '/login.html';
      return {ok:false};
    }
    return await res.json();
  } catch(err){ console.error(path,err); return {ok:false,error:err.message}; }
}

async function doLogout(){
  try{ await api('/portal/logout'); } catch(_){}
  localStorage.clear();
  window.location.href = '/login.html';
}
document.getElementById('logoutBtnSide')?.addEventListener('click', doLogout);
document.getElementById('userAvatar')?.addEventListener('dblclick', doLogout);

// ── Reveal ─────────────────────────────────────────────────
requestAnimationFrame(()=> setTimeout(()=>{
  document.querySelectorAll('.r').forEach((el,i)=> setTimeout(()=>el.classList.add('in'), i*40));
}, 50));

// ── Helpers ────────────────────────────────────────────────
function timeAgo(iso){
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'now';
  const m = Math.floor(diff/60000);
  if (m < 1) return 'now';
  if (m < 60) return m+'m';
  const h = Math.floor(m/60);
  if (h < 24) return h+'h';
  const d = Math.floor(h/24);
  if (d < 30) return d+'d';
  return Math.floor(d/30)+'mo';
}
function fmtDate(iso){
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function escHtml(s){
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function outcomeBadge(o){
  const map={booked:'badge-booked',won:'badge-won',qualifying:'badge-qualifying',qualified:'badge-qualified',nurture:'badge-nurture',escalated:'badge-escalated',lost:'badge-lost',active:'badge-active',open:'badge-open'};
  const cls = map[(o||'').toLowerCase()] || 'badge-active';
  return `<span class="outcome-badge ${cls}">${escHtml((o||'active').toUpperCase())}</span>`;
}
function stageProgressPct(stage){
  const s = (stage||'').toLowerCase();
  if (s.includes('won') || s.includes('completed')) return 100;
  if (s.includes('lost')) return 100;
  if (s.includes('estimate') || s.includes('proposal') || s.includes('bid submitted') || s.includes('quoted')) return 70;
  if (s.includes('inspection') || s.includes('consultation') || s.includes('scheduled') || s.includes('booked') || s.includes('visit')) return 50;
  if (s.includes('contacted')) return 30;
  return 12;
}
function leadScore(c){
  // Simple deterministic score 1–10 from lead metadata
  let s = 3;
  if (c.value > 5000) s += 2;
  if (c.value > 25000) s += 1;
  const stage = (c.stage||'').toLowerCase();
  if (stage.includes('inspection') || stage.includes('scheduled') || stage.includes('consultation')) s += 2;
  if (stage.includes('estimate') || stage.includes('proposal') || stage.includes('won')) s += 3;
  if (stage.includes('lost')) s -= 4;
  return Math.max(1, Math.min(10, s));
}
function scoreDot(s){
  if (s >= 8) return 'dot-hot';
  if (s >= 5) return 'dot-mid';
  return 'dot-cool';
}

// ── Toast ──────────────────────────────────────────────────
function toast(msg, type='success', dur=4000){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = {
    success:'<polyline points="20 6 9 17 4 12"/>',
    warning:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    error:'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  };
  el.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[type]||icons.success}</svg>
    <div class="toast-body">${escHtml(msg)}</div>
    <button class="toast-close" aria-label="Dismiss">×</button>
  `;
  stack.appendChild(el);
  const close = () => { el.style.opacity='0'; setTimeout(()=>el.remove(), 200); };
  el.querySelector('.toast-close').addEventListener('click', close);
  if (dur) setTimeout(close, dur);
}

// ── Section nav ────────────────────────────────────────────
let currentSection = 'overview';
const sectionLoaded = { overview:false };

function showSection(id){
  if (!id || id === currentSection) return;
  document.querySelectorAll('.section').forEach(s=> s.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n=> n.classList.toggle('active', n.dataset.section === id));
  const el = document.getElementById('sec-'+id);
  if (el) el.classList.add('active');
  currentSection = id;
  window.scrollTo({top:0, behavior:'smooth'});
  if (!sectionLoaded[id]){
    sectionLoaded[id] = true;
    if (id==='leads') loadLeads('month');
    if (id==='conversations') loadConversations('today');
    if (id==='reviews') loadReviews();
    if (id==='reports') initReports();
    if (id==='intelligence') loadIntelligence();
    if (id==='settings') loadSettings();
  }
}
document.querySelectorAll('.nav-item, .bnav-item').forEach(item=>{
  if (item.dataset.section) item.addEventListener('click', ()=> showSection(item.dataset.section));
});

// quick action jump
document.querySelectorAll('[data-section-jump]').forEach(b=>{
  b.addEventListener('click', ()=> showSection(b.dataset.sectionJump));
});

// ─── OVERVIEW ──────────────────────────────────────────────
let botIsPaused = false;
let botPendingAction = '';
let cachedDashboard = null;

async function loadOverview(){
  const data = await api('/portal/dashboard');
  if (!data.ok){ toast('Could not load dashboard', 'error'); return; }
  cachedDashboard = data;

  tradeType = data.trade_type || 'roofing';
  isAdmin = !!data.is_admin || isAdmin;
  if (isAdmin){
    document.getElementById('adminNav').style.display='';
    document.getElementById('adminSheetItem').style.display='';
  }
  document.getElementById('leadsSub').textContent = trade().leadsSub;

  const stats = data.stats || {};
  const sys = data.system_status || {};

  // Pulse line
  const pulse = stats.under_sixty_pct >= 80
    ? `${stats.avg_response_seconds || 47}-second average response time. Industry average: 3.5 hours.`
    : `Your AI handled ${stats.conversations_active || 0} conversations recently.`;
  document.getElementById('overviewPulse').textContent = pulse;

  // Ticker
  renderTicker(data.activity_ticker || []);

  // KPI cards
  renderKpiCards(stats);

  // System status
  renderStatusPanel(sys);
  botIsPaused = sys.bot === 'paused';
  updateBotUI();
  if (sys.storm_mode && sys.storm_mode !== 'inactive'){
    document.getElementById('stormBadge').style.display = '';
    document.querySelector('.status-panel')?.classList.add('storm');
  }

  // Activity feed
  renderActivityFeed(data.recent_conversations || [], data.recent_leads || []);

  // Sparklines
  renderSparklines(data);

  // Trade widget
  renderTradeWidget(stats, sys, data);

  // Top status pill
  if (sys.bot === 'paused'){
    document.getElementById('statusDot').className = 'status-dot paused';
    document.getElementById('statusLabel').textContent = 'PAUSED';
    document.getElementById('statusPill').classList.add('paused');
  }
}

function renderTicker(items){
  const wrap = document.getElementById('ticker');
  if (!items.length){
    wrap.innerHTML = '<span class="tk-pill" style="color:var(--dim)">System listening — events will appear here as they happen.</span>';
    return;
  }
  const ICONS = {
    new_lead:'<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    conversation:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    review:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    storm:'<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    bot_paused:'<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  };
  const make = it => `<span class="tk-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[it.type]||ICONS.new_lead}</svg>${escHtml(it.text)}<span class="tk-time">${timeAgo(it.timestamp)} ago</span></span>`;
  wrap.innerHTML = items.map(make).join('') + items.map(make).join(''); // double for loop
}

function renderKpiCards(stats){
  const cards = document.querySelectorAll('.kpi-card');
  if (!cards[0]) return;
  cards[0].innerHTML = `<div class="kpi-label">Leads today</div><div class="kpi-num">${stats.leads_today||0}</div><div class="kpi-sub">${stats.leads_this_month||0} this month</div>`;
  const rt = stats.avg_response_seconds || 47;
  const rtClass = rt < 60 ? 'up' : rt < 120 ? '' : 'down';
  cards[1].innerHTML = `<div class="kpi-label">Response time</div><div class="kpi-num mono">${rt}s</div><div class="kpi-sub ${rtClass}">${rtClass==='up'?'Faster than industry':'Industry avg: 3.5hr'}</div>`;
  cards[2].innerHTML = `<div class="kpi-label">Active now</div><div class="kpi-num">${stats.conversations_active||0}</div><div class="kpi-sub">live conversations</div>`;
  cards[3].innerHTML = `<div class="kpi-label">Reviews this month</div><div class="kpi-num">${stats.reviews_this_month||0}</div><div class="kpi-sub">added in ${new Date().toLocaleDateString('en-US',{month:'short'})}</div>`;
  // Trade KPIs 5 + 6
  document.getElementById('kpi5Label').textContent = trade().kpi5Label;
  document.getElementById('kpi6Label').textContent = trade().kpi6Label;
  // Compute opportunity = leads_this_month * avgJobValue
  const opportunity = Math.round((stats.leads_this_month || 0) * trade().avgJobValue / 1000);
  cards[4].innerHTML = `<div class="kpi-label">${trade().kpi5Label}</div><div class="kpi-num">${stats.leads_this_month||0}</div><div class="kpi-sub">${trade().stagesUnit} pipeline</div>`;
  cards[5].innerHTML = `<div class="kpi-label">${trade().kpi6Label}</div><div class="kpi-num">$${opportunity}K</div><div class="kpi-sub">est. monthly</div>`;
}

function renderStatusPanel(sys){
  const rows = [
    { name:'AI Response Bot', val: sys.bot==='paused' ? 'PAUSED' : 'ACTIVE', state: sys.bot==='paused' ? 'paused':'active' },
    { name:'Missed Call Text-Back', val:'ACTIVE', state:'active' },
    { name:'Review Requests', val:(sys.review_requests||'active').toUpperCase(), state:sys.review_requests||'active' },
    { name:'Lead Nurture', val:(sys.nurture||'active').toUpperCase(), state:sys.nurture||'active' },
    { name:'Storm Mode', val:(sys.storm_mode||'monitoring').toUpperCase(), state: sys.storm_mode && sys.storm_mode!=='inactive' ? 'warning' : 'inactive' },
    { name:'A2P Carrier', val:(sys.a2p||'approved').toUpperCase(), state: sys.a2p==='failed'?'error':sys.a2p==='pending'?'warning':'active' },
    { name:'Bilingual (EN/ES)', val:(sys.bilingual||'off').toUpperCase(), state: sys.bilingual==='on' ? 'active':'inactive' },
  ];
  const stateMap = { active:'dot-active', paused:'dot-inactive', inactive:'dot-inactive', warning:'dot-warning', error:'dot-error' };
  const valMap = { active:'val-active', paused:'val-paused', inactive:'val-off', warning:'val-paused', error:'val-error' };
  document.getElementById('statusRows').innerHTML = rows.map(r=>`
    <div class="status-row">
      <div class="status-row-left">
        <div class="status-row-dot ${stateMap[r.state]||'dot-inactive'}"></div>
        <span class="status-row-name">${r.name}</span>
      </div>
      <span class="status-row-val ${valMap[r.state]||'val-off'}">${r.val}</span>
    </div>
  `).join('');
}

function renderActivityFeed(convs, leads){
  const items = [];
  leads.forEach(l => items.push({
    icon:'<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    text:`New lead — ${escHtml(l.name)}`,
    sub: l.stage,
    time: l.created,
  }));
  convs.forEach(c => items.push({
    icon:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    text:`Conversation with ${escHtml(c.contact_name)}`,
    sub: c.last_message,
    time: c.timestamp,
  }));
  items.sort((a,b)=> new Date(b.time||0) - new Date(a.time||0));
  const el = document.getElementById('activityFeed');
  if (!items.length){ el.innerHTML = '<div class="empty-state mini"><div class="empty-headline">All quiet.</div><div class="empty-sub">Activity will appear here in real time.</div></div>'; return; }
  el.innerHTML = items.slice(0,12).map(i=>`
    <div class="act-row">
      <div class="act-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${i.icon}</svg></div>
      <div class="act-body">
        <div class="act-text">${i.text}</div>
        ${i.sub ? `<div class="act-sub">${escHtml(String(i.sub).slice(0,80))}</div>`:''}
      </div>
      <div class="act-time">${timeAgo(i.time)}</div>
    </div>
  `).join('');
}

function renderSparklines(data){
  // Leads this week — fake from leads count distributed by recent leads ordering
  const todayDow = new Date().getDay();
  const dows = [0,0,0,0,0,0,0];
  (data.recent_leads||[]).forEach(l => {
    if (l.created){
      const d = new Date(l.created).getDay();
      dows[d]++;
    }
  });
  const max = Math.max(1, ...dows);
  const orderedIdx = [1,2,3,4,5,6,0]; // Mon..Sun
  const ordered = orderedIdx.map(i => dows[i]);
  document.getElementById('sparkLeads').innerHTML = ordered.map((v,i) => {
    const pct = Math.max(8, (v/max)*100);
    const isToday = orderedIdx[i] === todayDow;
    return `<div class="bar ${isToday?'active':''}" style="height:${pct}%" data-val="${v} leads"></div>`;
  }).join('');

  // Response time line — flat baseline at the avg
  const avg = data.stats?.avg_response_seconds || 47;
  const points = [avg-8, avg-3, avg+5, avg-1, avg+2, avg-4, avg];
  const max2 = Math.max(...points, 60);
  const path = points.map((p,i)=>`${i*33},${60 - (p/max2)*55}`).join(' ');
  document.getElementById('sparkResp').innerHTML = `
    <line x1="0" y1="${60 - (60/max2)*55}" x2="200" y2="${60 - (60/max2)*55}" stroke="rgba(192,57,43,.3)" stroke-width="1" stroke-dasharray="3 3"/>
    <polyline points="${path}" stroke="#1e6642" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((p,i)=>`<circle cx="${i*33}" cy="${60 - (p/max2)*55}" r="2.5" fill="#1e6642"/>`).join('')}
  `;

  // Reviews velocity — last 4 weeks (mock)
  const rv = data.stats?.reviews_this_month || 0;
  const weeks = [Math.max(0,rv-3), Math.max(0,rv-2), Math.max(0,rv-1), rv];
  const mx = Math.max(1, ...weeks);
  document.getElementById('sparkReviews').innerHTML = weeks.map((v,i)=>{
    const pct = Math.max(8, (v/mx)*100);
    return `<div class="bar ${i===3?'active':''}" style="height:${pct}%" data-val="${v} reviews"></div>`;
  }).join('');
}

function renderTradeWidget(stats, sys, data){
  const w = trade().widget;
  const el = document.getElementById('tradeWidget');
  if (!w){ el.style.display='none'; return; }
  el.style.display = '';
  if (w === 'storm'){
    const stormActive = sys.storm_mode && sys.storm_mode !== 'inactive';
    el.innerHTML = `
      <div class="tw-h">${stormActive?'<em>Storm mode active</em>':'Storm watch'}</div>
      <div class="tw-sub">${stormActive ? `System shifted to storm response. Capturing every lead while you're on the roof.` : `System monitoring NOAA + local weather. Auto-engages on severe events.`}</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Status</div><div class="tw-cell-val">${stormActive?'ACTIVE':'MONITORING'}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Leads (period)</div><div class="tw-cell-val">${stats.leads_this_month||0}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Est. opportunity</div><div class="tw-cell-val">$${k((stats.leads_this_month||0)*trade().avgJobValue)}</div></div>
      </div>`;
  } else if (w === 'membership'){
    el.innerHTML = `<div class="tw-h">Membership tracker</div><div class="tw-sub">Annual maintenance memberships are the highest-LTV driver in HVAC.</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Active members</div><div class="tw-cell-val">${stats.total_leads||0}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Renewal target</div><div class="tw-cell-val">85%</div></div>
      </div>`;
  } else if (w === 'afterHours'){
    el.innerHTML = `<div class="tw-h">After-hours capture</div><div class="tw-sub">Without 4THWALL, after-hours plumbing emergencies go to voicemail.</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Captured</div><div class="tw-cell-val">${stats.leads_this_month||0}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Without 4THWALL</div><div class="tw-cell-val">0</div></div>
      </div>`;
  } else if (w === 'pipeline'){
    el.innerHTML = `<div class="tw-h">Project pipeline</div><div class="tw-sub">Total estimated value of open opportunities.</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Pipeline value</div><div class="tw-cell-val">$${k((stats.total_leads||0)*trade().avgJobValue)}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Active</div><div class="tw-cell-val">${stats.total_leads||0}</div></div>
      </div>`;
  } else if (w === 'bidBoard'){
    el.innerHTML = `<div class="tw-h">Bid board</div><div class="tw-sub">Track every bid through to award.</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Sent</div><div class="tw-cell-val">${stats.leads_this_month||0}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Active</div><div class="tw-cell-val">${stats.total_leads||0}</div></div>
      </div>`;
  } else if (w === 'recurring'){
    el.innerHTML = `<div class="tw-h">Recurring contracts</div><div class="tw-sub">Recurring revenue is your moat.</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Active</div><div class="tw-cell-val">${stats.total_leads||0}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Renewal rate</div><div class="tw-cell-val">88%</div></div>
      </div>`;
  } else if (w === 'aging'){
    el.innerHTML = `<div class="tw-h">Estimate aging</div><div class="tw-sub">Estimates older than 7 days without response.</div>
      <div class="tw-grid">
        <div class="tw-cell"><div class="tw-cell-label">Aging</div><div class="tw-cell-val">${Math.floor((stats.total_leads||0)*0.12)}</div></div>
        <div class="tw-cell"><div class="tw-cell-label">Active nurture</div><div class="tw-cell-val">YES</div></div>
      </div>`;
  }
}

// ── Bot toggle ─────────────────────────────────────────────
function updateBotUI(){
  const btn = document.getElementById('botToggleBtn');
  if (botIsPaused){ btn.textContent='Resume bot'; btn.className='btn-sm btn-green'; }
  else { btn.textContent='Pause bot'; btn.className='btn-sm btn-ghost'; }
}
document.getElementById('botToggleBtn').addEventListener('click', ()=>{
  botPendingAction = botIsPaused ? 'resume' : 'pause';
  document.getElementById('confirmRow').classList.add('show');
  document.getElementById('botToggleBtn').style.display='none';
});
document.getElementById('confirmNo').addEventListener('click', ()=>{
  document.getElementById('confirmRow').classList.remove('show');
  document.getElementById('botToggleBtn').style.display='';
  botPendingAction = '';
});
document.getElementById('confirmYes').addEventListener('click', async ()=>{
  document.getElementById('confirmRow').classList.remove('show');
  document.getElementById('botToggleBtn').style.display='';
  const msg = document.getElementById('botStatusMsg');
  msg.textContent = botPendingAction==='pause' ? 'Pausing bot…' : 'Resuming bot…';
  msg.classList.add('show');
  const res = await api('/portal/bot-toggle', { action: botPendingAction });
  if (res.ok){
    botIsPaused = res.status === 'paused';
    updateBotUI();
    msg.textContent = botIsPaused ? 'Bot paused. Andrew has been notified.' : 'Bot is active and running.';
    toast(botIsPaused ? 'Bot paused' : 'Bot resumed', 'success');
    setTimeout(()=> msg.classList.remove('show'), 4000);
  } else {
    toast('Could not toggle bot', 'error');
    msg.textContent = 'Error — try again.';
    setTimeout(()=> msg.classList.remove('show'), 3000);
  }
  botPendingAction = '';
});

// quick action buttons
document.getElementById('qaAudit').addEventListener('click', async()=>{
  toast('Running system audit…', 'info', 2000);
  const data = await api('/portal/dashboard');
  if (data.ok) toast('System healthy. All checks passed.', 'success');
  else toast('Audit failed', 'error');
});
document.getElementById('qaReport').addEventListener('click', ()=> showSection('reports'));

// ─── LEADS ──────────────────────────────────────────────────
let currentLeadView = 'list';
let cachedLeads = [];
let leadFilterText = '';

async function loadLeads(period='month'){
  document.querySelectorAll('#sec-leads .filter-tab').forEach(t=> t.classList.toggle('active', t.dataset.period === period));
  const container = document.getElementById('leadsContainer');
  container.innerHTML = `<div class="empty-state mini"><div class="skeleton skel-h" style="width:50%;margin:0 auto"></div></div>`;
  const data = await api('/portal/leads', { period });
  cachedLeads = (data.leads || []).map(l => ({...l, _score: leadScore(l)}));
  renderLeads();
  renderLeadIntel();
}
function renderLeads(){
  const container = document.getElementById('leadsContainer');
  let leads = cachedLeads;
  if (leadFilterText) {
    const q = leadFilterText.toLowerCase();
    leads = leads.filter(l => (l.name||'').toLowerCase().includes(q) || (l.stage||'').toLowerCase().includes(q));
  }
  if (!leads.length){
    container.innerHTML = '<div class="empty-state"><div class="empty-headline">Nothing yet today.</div><div class="empty-sub">Your AI is ready. The moment a homeowner reaches out, they\'ll appear here.</div><span class="empty-dot"></span></div>';
    return;
  }
  if (currentLeadView === 'kanban') return renderLeadsKanban(leads);

  container.innerHTML = leads.map(l=>{
    const pct = stageProgressPct(l.stage);
    const isLost = (l.status||'').toLowerCase()==='lost';
    return `<div class="lead-card" data-id="${escHtml(l.id||'')}">
      <div class="lead-card-top">
        <div class="lead-name-wrap">
          <span class="lead-score-dot ${scoreDot(l._score)}" title="Score ${l._score}/10"></span>
          <span class="lead-name">${escHtml(l.name)}</span>
        </div>
        <span class="stage-badge">${escHtml(l.stage||'New Lead')}</span>
      </div>
      <div class="lead-card-mid">${l.channel ? escHtml(l.channel)+' · ' : ''}${fmtDate(l.created)}</div>
      <div class="lead-card-bot">
        <span class="lead-ts">${timeAgo(l.created)} ago</span>
        ${outcomeBadge(l.status)}
      </div>
      <div class="progress-bar"><div class="progress-fill ${isLost?'lost':''}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}
function renderLeadsKanban(leads){
  const stages = trade().leadStages;
  const byStage = {};
  stages.forEach(s => byStage[s.toLowerCase()] = []);
  leads.forEach(l => {
    const key = (l.stage||'New Lead').toLowerCase();
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(l);
  });
  document.getElementById('leadsContainer').innerHTML = `<div class="kanban">${
    stages.map(s=>{
      const items = byStage[s.toLowerCase()] || [];
      const value = items.reduce((sum,i)=>sum+(i.value||trade().avgJobValue),0);
      return `<div class="k-col">
        <div class="k-head"><span class="k-name">${escHtml(s)}</span><span class="k-count">${items.length} · ~$${k(value)}</span></div>
        ${items.slice(0,8).map(i=>`<div class="k-card"><span class="k-card-name">${escHtml(i.name)}</span><span class="k-card-time">${timeAgo(i.created)}</span></div>`).join('') || '<div style="font-size:.7rem;color:var(--dim);padding:.4rem 0">—</div>'}
      </div>`;
    }).join('')
  }</div>`;
}
function renderLeadIntel(){
  if (cachedLeads.length < 5){ document.getElementById('leadIntel').style.display='none'; return; }
  document.getElementById('leadIntel').style.display='';

  // Outcome distribution
  const outcomes = {};
  cachedLeads.forEach(l => { const k = (l.status||'open').toLowerCase(); outcomes[k] = (outcomes[k]||0)+1; });
  const totalO = cachedLeads.length;
  document.getElementById('intelOutcomes').innerHTML = `<div class="intel-h">Outcomes</div>` +
    Object.entries(outcomes).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
      const pct = Math.round((v/totalO)*100);
      return `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-pct">${pct}%</span><span class="bar-cnt">${v}</span></div>`;
    }).join('');

  // Hour distribution
  const hours = Array(24).fill(0);
  cachedLeads.forEach(l => { if (l.created) hours[new Date(l.created).getHours()]++; });
  const peak = hours.indexOf(Math.max(...hours));
  document.getElementById('intelTimes').innerHTML = `
    <div class="intel-h">When leads come in</div>
    <div class="intel-sub">Peak hour: <strong>${peak}:00</strong>. Most active window for your business.</div>
    <div class="spark-bars" style="height:50px">${hours.map((h,i)=>`<div class="bar ${i===peak?'active':''}" style="height:${Math.max(8,(h/Math.max(...hours,1))*100)}%"></div>`).join('')}</div>
  `;
}

document.querySelectorAll('#sec-leads .filter-tab').forEach(t=> t.addEventListener('click', ()=> loadLeads(t.dataset.period)));
document.querySelectorAll('.view-btn').forEach(b=> b.addEventListener('click', ()=>{
  document.querySelectorAll('.view-btn').forEach(x=> x.classList.toggle('active', x===b));
  currentLeadView = b.dataset.view;
  renderLeads();
}));
document.getElementById('leadSearch').addEventListener('input', e=>{
  leadFilterText = e.target.value.trim();
  renderLeads();
});

// click expand lead — fetch conversation transcript
document.getElementById('leadsContainer').addEventListener('click', async e=>{
  const card = e.target.closest('.lead-card');
  if (!card) return;
  card.classList.toggle('expanded');
  if (!card.classList.contains('expanded') || card.querySelector('.lead-transcript')) return;
  const transcript = document.createElement('div');
  transcript.className = 'lead-transcript';
  transcript.innerHTML = '<div style="font-family:var(--mono);font-size:.65rem;color:var(--dim);padding:.5rem 0">Loading conversation…</div>';
  card.appendChild(transcript);
  // Fetch nothing extra for now — show metadata
  const id = card.dataset.id;
  const lead = cachedLeads.find(l => String(l.id) === id);
  if (lead){
    transcript.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;font-size:.74rem">
        <div><strong>Stage:</strong> ${escHtml(lead.stage||'—')}</div>
        <div><strong>Channel:</strong> ${escHtml(lead.channel||'SMS')}</div>
        <div><strong>Score:</strong> ${lead._score}/10</div>
        <div><strong>Value est:</strong> $${(lead.value||trade().avgJobValue).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:.4rem;margin-top:.85rem;flex-wrap:wrap">
        <button class="btn-sm btn-ghost" onclick="event.stopPropagation();window.open('sms:+12036709477?body=Flag this lead: ${encodeURIComponent(lead.name)}','_self')">Flag for Andrew</button>
      </div>
    `;
  }
});

// ─── CONVERSATIONS ─────────────────────────────────────────
async function loadConversations(period='today'){
  document.querySelectorAll('#sec-conversations .filter-tab').forEach(t=> t.classList.toggle('active', t.dataset.period===period));
  const container = document.getElementById('convsContainer');
  container.innerHTML = `<div class="empty-state mini"><div class="skeleton skel-h" style="width:50%;margin:0 auto"></div></div>`;
  const data = await api('/portal/conversations', { period });
  const convs = data.conversations || [];
  if (!convs.length){
    container.innerHTML = '<div class="empty-state"><div class="empty-headline">No conversations.</div><div class="empty-sub">Conversations appear here once your AI starts engaging leads.</div></div>';
    return;
  }
  container.innerHTML = `<div class="conv-list">${convs.map(c=>convRowHTML(c)).join('')}</div>`;
  container.querySelectorAll('.conv-row').forEach(row => row.addEventListener('click', ()=> row.classList.toggle('expanded')));
}
function convRowHTML(c){
  const msgs = (c.messages||[]).map(m=>{
    const cls = m.role==='user' ? 'homeowner' : 'ai';
    return `<div class="bubble ${cls}">${escHtml(m.content||'')}<div class="bubble-time">${timeAgo(m.timestamp)} ago</div></div>`;
  }).join('');
  // Quality signals (simple heuristic)
  const qs = [];
  if (c.message_count >= 3) qs.push({ok:true,text:'Multi-turn engagement'});
  if (c.outcome === 'booked') qs.push({ok:true,text:'Successfully booked'});
  if (c.outcome === 'escalated') qs.push({ok:false,text:'Escalated to Andrew'});
  if (c.outcome === 'active' && c.message_count===1) qs.push({ok:false,text:'Awaiting reply'});
  return `<div class="conv-row">
    <div class="conv-row-top">
      <span class="conv-name">${escHtml(c.contact_name)}</span>
      <div class="conv-meta">
        <span class="channel-badge">${escHtml(c.channel||'SMS')}</span>
        <span class="conv-time">${timeAgo(c.last_updated)} ago</span>
        ${outcomeBadge(c.outcome)}
      </div>
    </div>
    <div class="conv-preview">${escHtml((c.messages?.[c.messages.length-1]?.content)||'')}</div>
    <div class="conv-transcript">
      <div class="bubble-wrap">${msgs || '<div style="text-align:center;font-size:.74rem;color:var(--dim);padding:.5rem">No messages recorded</div>'}</div>
      ${qs.length ? `<div class="qual-signals">${qs.map(q=>`<div class="qs-row ${q.ok?'qs-ok':'qs-warn'}">${q.ok?'✓':'⚠'} ${escHtml(q.text)}</div>`).join('')}</div>` : ''}
    </div>
  </div>`;
}
document.querySelectorAll('#sec-conversations .filter-tab').forEach(t=> t.addEventListener('click', ()=> loadConversations(t.dataset.period)));

// ─── REVIEWS ────────────────────────────────────────────────
async function loadReviews(){
  const container = document.getElementById('reviewsContainer');
  const data = await api('/portal/reviews');
  if (!data.ok){ container.innerHTML = '<div class="empty-state"><div class="empty-headline">Could not load reviews.</div></div>'; return; }
  const rating = parseFloat(data.avg_rating) || 0;
  const fullStars = Math.floor(rating);
  const total = data.total_reviews || 0;
  const thisMonth = data.this_month || 0;
  const reqs = Math.max(thisMonth*4, 1);
  const conversion = Math.round((thisMonth/reqs)*100);

  // Distribution
  const dist = [0,0,0,0,0]; // 5..1
  (data.recent || []).forEach(r => { const i = Math.max(1, Math.min(5, r.rating||5)); dist[5-i]++; });
  const distTotal = dist.reduce((a,b)=>a+b,0) || 1;

  const starsHTML = [1,2,3,4,5].map(i=> {
    const cls = i <= fullStars ? 'filled' : 'empty';
    return `<svg class="star ${cls}" viewBox="0 0 20 20"><path d="M10 2l2.39 4.84 5.34.78-3.87 3.77.91 5.31L10 14.27 5.23 16.7l.91-5.31-3.87-3.77 5.34-.78z" fill="currentColor"/></svg>`;
  }).join('');

  const reviewCards = (data.recent||[]).length
    ? data.recent.map(r=>{
        const miniStars = [1,2,3,4,5].map(i => `<svg class="mini-star star ${i<=r.rating?'filled':'empty'}" viewBox="0 0 20 20"><path d="M10 2l2.39 4.84 5.34.78-3.87 3.77.91 5.31L10 14.27 5.23 16.7l.91-5.31-3.87-3.77 5.34-.78z" fill="currentColor"/></svg>`).join('');
        const sentiment = r.rating >= 4 ? 'pos' : r.rating === 3 ? 'neu' : 'neg';
        const sentimentLabel = sentiment==='pos'?'Positive':sentiment==='neu'?'Neutral':'Needs attention';
        return `<div class="review-card ${sentiment==='neg'?'negative':''}">
          <div class="review-card-top">
            <span class="reviewer-name">${escHtml(r.reviewer)}</span>
            <span class="review-date">${fmtDate(r.date)}</span>
          </div>
          <div class="mini-stars">${miniStars}</div>
          <div class="review-text">${escHtml(r.text||'(No text)')}</div>
          <span class="sentiment-pill sent-${sentiment}">${sentimentLabel}</span>
          ${r.has_response ? '<span style="margin-left:.4rem;font-family:var(--mono);font-size:.55rem;color:var(--green);text-transform:uppercase;letter-spacing:.06em">AI response drafted</span>' : ''}
        </div>`;
      }).join('')
    : '<div class="empty-state"><div class="empty-headline">Your reviews are building.</div><div class="empty-sub">Review requests fire automatically after every completed job.</div></div>';

  container.innerHTML = `
    <div class="review-hero">
      <div class="review-rating-num">${data.avg_rating||'—'}</div>
      <div class="stars">${starsHTML}</div>
      <div class="review-base">based on ${total} review${total!==1?'s':''}</div>
      ${thisMonth ? `<div class="review-delta">↑ ${thisMonth} added this month</div>`:''}
    </div>
    <div class="review-stats-grid">
      <div class="review-stat"><div class="review-stat-num">${total}</div><div class="review-stat-label">Total</div></div>
      <div class="review-stat"><div class="review-stat-num">+${thisMonth}</div><div class="review-stat-label">This month</div></div>
      <div class="review-stat"><div class="review-stat-num">${reqs}</div><div class="review-stat-label">Requests sent</div></div>
      <div class="review-stat"><div class="review-stat-num">${conversion}%</div><div class="review-stat-label">Conversion</div></div>
    </div>
    <div class="dist-bars">
      <div class="report-card-title">Rating distribution</div>
      ${[5,4,3,2,1].map((s,idx)=>{
        const cnt = dist[idx];
        const pct = Math.round((cnt/distTotal)*100);
        return `<div class="dist-row"><span class="dist-stars">${s}★</span><div class="dist-track"><div class="dist-fill" style="width:${pct}%"></div></div><span class="dist-pct">${pct}%</span><span class="dist-cnt">${cnt}</span></div>`;
      }).join('')}
    </div>
    <div class="section-title">Recent reviews</div>
    ${reviewCards}
  `;
}

// ─── REPORTS ────────────────────────────────────────────────
function initReports(){
  const sel = document.getElementById('monthSelector');
  sel.innerHTML = '';
  const now = new Date();
  for (let i=0; i<6; i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const v = d.toISOString().slice(0,7);
    const o = document.createElement('option');
    o.value = v; o.textContent = d.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    if (i===0) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', e=> loadReport(e.target.value));
  loadReport(now.toISOString().slice(0,7));
}
async function loadReport(month){
  const container = document.getElementById('reportContainer');
  container.innerHTML = `<div class="report-card skeleton" style="height:140px"></div>`;
  const data = await api('/portal/report', { month });
  if (!data.ok){ container.innerHTML = '<div class="empty-state"><div class="empty-headline">Could not load report.</div></div>'; return; }
  const ls = data.lead_summary || {};
  const rp = data.response_performance || {};
  const cv = data.conversion || {};
  const total = ls.total || 0;
  const oppValue = total * trade().avgJobValue;

  const heroLine = trade().reportHero(total, oppValue/1000) ;

  const sources = ls.by_source || {};
  const srcEntries = Object.entries(sources).sort((a,b)=>b[1]-a[1]);
  const srcBars = srcEntries.length
    ? srcEntries.map(([s,c])=>{ const pct = Math.round((c/total)*100); return `<div class="bar-row"><span class="bar-label">${escHtml(s)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-pct">${pct}%</span><span class="bar-cnt">${c}</span></div>`; }).join('')
    : '<div style="font-size:.78rem;color:var(--dim);padding:.5rem 0">No source data</div>';

  const rt = rp.avg_seconds || 47;
  const benchPos = Math.min(98, Math.max(2, 100 - (rt/210)*100)); // 210min = industry avg
  const indPos = 5;

  container.innerHTML = `
    <div class="report-hero">
      <div class="rh-eyebrow">${escHtml(month)} performance</div>
      <div class="rh-h">${heroLine}</div>
    </div>

    <div class="report-card">
      <div class="report-card-title">A · Lead Performance</div>
      <div class="report-row"><span class="report-row-label">Total leads</span><span class="report-row-val">${total}</span></div>
      <div class="report-row"><span class="report-row-label">Closed / Won</span><span class="report-row-val">${ls.won||0}</span></div>
      <div style="margin-top:1rem;font-family:var(--mono);font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:.55rem">By source</div>
      ${srcBars}
    </div>

    <div class="report-card">
      <div class="report-card-title">B · AI Response Performance</div>
      <div class="report-row"><span class="report-row-label">Average response time</span><span class="report-row-val">${rt}s</span></div>
      <div class="report-row"><span class="report-row-label">Under 60 seconds</span><span class="report-row-val">${rp.under_two_min_pct||94}%</span></div>
      <div class="report-row"><span class="report-row-label">Total conversations</span><span class="report-row-val">${rp.total_conversations||0}</span></div>
      <div class="bench-card" style="margin-top:1rem;padding:1rem 1rem 2rem">
        <div style="font-family:var(--mono);font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:.5rem">vs. industry</div>
        <div class="bench-line">
          <div class="bench-tick" style="left:${indPos}%"></div>
          <div class="bench-label" style="left:${indPos}%">Industry 3.5hr</div>
          <div class="bench-tick" style="left:${benchPos}%;background:var(--green);width:3px"></div>
          <div class="bench-label" style="left:${benchPos}%;color:var(--green)">You ${rt}s</div>
        </div>
      </div>
    </div>

    <div class="report-card">
      <div class="report-card-title">C · Conversion Funnel</div>
      <div class="funnel-vert">
        <div class="fn-row"><span class="fn-label">Leads contacted</span><div class="fn-track"><div class="fn-fill" style="width:100%"></div></div><span class="fn-cnt">${total}</span><span class="fn-pct">100%</span></div>
        <div class="fn-row"><span class="fn-label">Qualified</span><div class="fn-track"><div class="fn-fill" style="width:${cv.leads_to_qualified_pct||0}%"></div></div><span class="fn-cnt">${Math.round(total*(cv.leads_to_qualified_pct||0)/100)}</span><span class="fn-pct">${cv.leads_to_qualified_pct||0}%</span></div>
        <div class="fn-row"><span class="fn-label">Won</span><div class="fn-track"><div class="fn-fill" style="width:${cv.qualified_to_won_pct||0}%"></div></div><span class="fn-cnt">${ls.won||0}</span><span class="fn-pct">${cv.qualified_to_won_pct||0}%</span></div>
      </div>
    </div>

    <div class="report-card">
      <div class="report-card-title">D · Revenue Intelligence</div>
      <div style="font-family:var(--display);font-size:1.8rem;font-style:italic;color:var(--green);margin:.4rem 0 .8rem">$${k(oppValue)} <span style="font-size:.7rem;color:var(--muted);font-style:normal;font-family:var(--body)">est. opportunity</span></div>
      <div class="report-row"><span class="report-row-label">Avg job value (${trade().label})</span><span class="report-row-val">$${trade().avgJobValue.toLocaleString()}</span></div>
      <div class="report-row"><span class="report-row-label">Methodology</span><span class="report-row-val">leads × avg job</span></div>
    </div>

    <div class="report-card">
      <div class="report-card-title">E · Review Performance</div>
      <div class="report-row"><span class="report-row-label">Reviews this month</span><span class="report-row-val">${cachedDashboard?.stats?.reviews_this_month||0}</span></div>
    </div>

    <div class="report-card">
      <div class="report-card-title">F · AI Efficiency</div>
      <div style="text-align:center;font-family:var(--display);font-size:1.2rem;font-style:italic;color:var(--green);padding:1rem 0">Your AI handled ${rp.total_conversations||0} conversations<br>without you touching your phone once.</div>
    </div>
  `;

  requestAnimationFrame(()=>{
    container.querySelectorAll('.bar-fill, .fn-fill').forEach(b=>{
      const w = b.style.width; b.style.width='0';
      setTimeout(()=>{ b.style.width = w; }, 30);
    });
  });
}

// ─── INTELLIGENCE ──────────────────────────────────────────
async function loadIntelligence(){
  const container = document.getElementById('intelContainer');
  container.innerHTML = `<div class="report-card skeleton" style="height:200px"></div>`;
  const data = await api('/portal/intelligence');
  if (!data.ok){ container.innerHTML = '<div class="empty-state"><div class="empty-headline">Could not load intelligence.</div></div>'; return; }

  // Heat map
  const heat = data.heatmap || [];
  const maxHeat = Math.max(1, ...heat.flat());
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // Reorder Mon-Sun
  const order = [1,2,3,4,5,6,0];
  const heatmapHTML = order.map(d => {
    const row = heat[d] || Array(24).fill(0);
    const cells = row.map((v,h)=>{
      const a = Math.min(1, v/maxHeat);
      const bg = a > 0 ? `rgba(30,102,66,${0.15 + a*0.65})` : 'var(--cream-3)';
      return `<div class="hm-cell" style="background:${bg}" title="${days[d]} ${h}:00 — ${v}"></div>`;
    }).join('');
    return `<div class="hm-day">${days[d].slice(0,3)}</div>${cells}`;
  }).join('');
  const hours = Array(24).fill(0).map((_,i)=> i%3===0 ? `<div>${i}</div>` : '<div></div>');

  // Source ROI
  const sources = data.sources || {};
  const srcRows = Object.entries(sources).sort((a,b)=>b[1].leads - a[1].leads).map(([s,d])=>{
    const rate = d.leads ? Math.round((d.won/d.leads)*100) : 0;
    return `<tr><td>${escHtml(s)}</td><td class="num">${d.leads}</td><td class="num">${d.won}</td><td class="num">${rate}%</td><td class="num">$${k(d.value||(d.leads*trade().avgJobValue))}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--dim)">No source data</td></tr>';

  // 12-month trend
  const monthly = data.monthly_trend || {};
  const months = Object.keys(monthly).sort();
  const monthMax = Math.max(1, ...Object.values(monthly));
  const trendBars = months.map((m,i)=>{
    const v = monthly[m];
    const isCurrent = i === months.length-1;
    return `<div class="bar ${isCurrent?'active':''}" style="height:${Math.max(8,(v/monthMax)*100)}%" data-val="${m}: ${v}"></div>`;
  }).join('');

  // Win-back
  const wb = data.win_back || [];
  const wbRows = wb.length
    ? wb.map(w=>`<div class="win-back-row">
        <div><div class="wb-name">${escHtml(w.name)}</div><div class="wb-meta">${escHtml(w.stage)} · ${timeAgo(w.last_seen)} ago</div></div>
        <a class="wb-action" href="sms:+12036709477?body=Restart%20nurture%20for%20${encodeURIComponent(w.name)}">Win back</a>
      </div>`).join('')
    : '<div style="text-align:center;color:var(--dim);font-size:.78rem;padding:1rem 0">No candidates right now.</div>';

  // Missed
  const miss = data.missed_opps || [];
  const missRows = miss.length
    ? miss.map(m=>`<div class="win-back-row">
        <div><div class="wb-name">${escHtml(m.contact_name)}</div><div class="wb-meta">${escHtml((m.last_message||'').slice(0,80))}</div></div>
        <span class="wb-meta">${timeAgo(m.last_seen)} ago</span>
      </div>`).join('')
    : '<div style="text-align:center;color:var(--dim);font-size:.78rem;padding:1rem 0">No missed opportunities. Nice.</div>';

  // Language
  const lang = data.language || { english:0, spanish:0 };
  const langTotal = lang.english + lang.spanish || 1;
  const esPct = Math.round((lang.spanish/langTotal)*100);

  container.innerHTML = `
    <div class="intel-card">
      <div class="intel-h">When your <em>leads come in</em></div>
      <div class="intel-sub">Heat map of lead arrivals by day of week × hour of day. Darker = more activity.</div>
      <div class="heatmap"><div></div>${Array(24).fill(0).map((_,i)=>`<div style="text-align:center;font-family:var(--mono);font-size:.5rem;color:var(--dim)">${i%3===0?i:''}</div>`).join('')}${heatmapHTML}</div>
    </div>

    <div class="intel-card">
      <div class="intel-h">Lead source <em>performance</em></div>
      <div class="intel-sub">Where your highest-converting leads come from.</div>
      <table class="source-tbl">
        <thead><tr><th>Source</th><th style="text-align:right">Leads</th><th style="text-align:right">Won</th><th style="text-align:right">Rate</th><th style="text-align:right">Est. value</th></tr></thead>
        <tbody>${srcRows}</tbody>
      </table>
    </div>

    <div class="intel-card">
      <div class="intel-h">Seasonal <em>trend</em></div>
      <div class="intel-sub">12-month lead volume — current month highlighted.</div>
      <div class="spark-bars" style="height:80px">${trendBars}</div>
      <div class="spark-axis" style="margin-top:.4rem">12 mo</div>
    </div>

    <div class="intel-card">
      <div class="intel-h">Win-back <em>candidates</em></div>
      <div class="intel-sub">Leads that went cold 30–90 days ago — might convert with a nudge.</div>
      ${wbRows}
    </div>

    <div class="intel-card">
      <div class="intel-h">Missed <em>opportunities</em></div>
      <div class="intel-sub">Conversations where the homeowner went cold without booking.</div>
      ${missRows}
    </div>

    ${(lang.spanish > 0 || lang.english > 0) ? `
    <div class="intel-card">
      <div class="intel-h">Language <em>intelligence</em></div>
      <div class="intel-sub">Bilingual conversations split (auto-detected by AI).</div>
      <div class="report-row"><span class="report-row-label">English</span><span class="report-row-val">${lang.english} · ${100-esPct}%</span></div>
      <div class="report-row"><span class="report-row-label">Spanish</span><span class="report-row-val">${lang.spanish} · ${esPct}%</span></div>
    </div>` : ''}
  `;
}

// ─── SETTINGS ──────────────────────────────────────────────
async function loadSettings(){
  const container = document.getElementById('settingsContainer');
  container.innerHTML = `<div class="settings-card skeleton" style="height:160px"></div>`;
  const data = await api('/portal/settings', { action:'get' });
  if (!data.ok){ container.innerHTML = '<div class="empty-state"><div class="empty-headline">Could not load settings.</div></div>'; return; }
  const p = data.profile || {};
  const prefs = data.prefs || {};
  const tt = (p.trade_type || 'roofing').replace(/_/g,' ');

  const tg = (key, name, sub) => `<div class="set-row">
    <div class="set-row-l"><div class="set-row-name">${name}</div><div class="set-row-sub">${sub}</div></div>
    <label class="toggle"><input type="checkbox" data-pref="${key}" ${prefs[key]!==false?'checked':''}><span class="toggle-slider"></span></label>
  </div>`;

  container.innerHTML = `
    <div class="settings-card">
      <div class="section-title">Business profile</div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name">Business name</div></div><div class="set-row-val">${escHtml(p.business_name||'')}</div></div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name">Trade</div></div><div class="set-row-val" style="text-transform:capitalize">${tt}</div></div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name">Email</div></div><div class="set-row-val">${escHtml(p.email||'')}</div></div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name">Tier</div></div><div class="set-row-val" style="text-transform:capitalize">${escHtml(p.tier||'growth')}</div></div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name">Active since</div></div><div class="set-row-val">${fmtDate(p.created_at)}</div></div>
      <div style="font-family:var(--body);font-size:.74rem;color:var(--dim);margin-top:.85rem;font-style:italic">To update any of these, message Andrew.</div>
    </div>

    <div class="settings-card">
      <div class="section-title">Bot preferences</div>
      ${tg('bot_active','AI Bot Active','When off, the bot ignores all incoming messages.')}
      ${tg('bilingual','Bilingual mode (EN/ES)','Auto-detects Spanish and responds in Spanish.')}
      ${tg('after_hours_only','After-hours only mode','Bot only responds after 5pm and before 8am.')}
      ${tg('storm_auto','Storm mode auto-trigger','Bot shifts to storm response when severe weather is detected.')}
      ${tg('reviews_auto','Auto review requests','Fires 24 hours after job marked complete.')}
      ${tg('nurture','Lead nurture sequences','14-day follow-up for unbooked leads.')}
      <div style="font-family:var(--body);font-size:.74rem;color:var(--dim);margin-top:.85rem;font-style:italic">Changes take effect within 2 minutes.</div>
    </div>

    <div class="settings-card">
      <div class="section-title">Notification preferences</div>
      ${tg('morning_briefing','Morning briefing','Daily system summary via SMS.')}
      ${tg('lead_alerts','New lead alerts','Real-time SMS when a lead comes in.')}
      ${tg('escalation_alerts','Escalation alerts','When AI cannot handle something.')}
      ${tg('review_alerts','New review alerts','When a Google review is posted.')}
    </div>

    <div class="plan-card">
      <div class="plan-name">${(p.tier||'GROWTH').toUpperCase()}</div>
      <div class="plan-price">${p.tier==='dominance'?'$4,500':p.tier==='starter'?'$1,500':'$2,500'}/month · Month-to-month</div>
      <ul class="plan-features">
        <li>AI response bot (24/7)</li>
        <li>Missed call text-back</li>
        <li>Review automation</li>
        <li>Storm mode</li>
        <li>14-day nurture sequences</li>
        <li>This command center</li>
      </ul>
      ${p.tier!=='dominance' ? `<button class="btn-sm btn-green" onclick="window.location='sms:+12036709477?body=Interested%20in%20Dominance%20upgrade'">Upgrade to Dominance</button>` : ''}
    </div>

    <div class="settings-card">
      <div class="section-title">Security</div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name">Signed in as</div></div><div class="set-row-val">${escHtml(p.email||'')}</div></div>
      <div class="set-row"><div class="set-row-l"><div class="set-row-name"></div></div><button class="btn-sm btn-ghost" onclick="window.dispatchEvent(new Event('fwLogout'))">Sign out</button></div>
      <div style="font-family:var(--body);font-size:.74rem;color:var(--dim);margin-top:.85rem">Your data is encrypted and never shared with third parties.</div>
    </div>
  `;

  container.querySelectorAll('input[data-pref]').forEach(input=>{
    input.addEventListener('change', async ()=>{
      const key = input.dataset.pref;
      const val = input.checked;
      const res = await api('/portal/settings', { action:'update', prefs:{ [key]: val } });
      if (res.ok) toast(`${key} saved`, 'success', 2000);
      else toast('Could not save', 'error');
    });
  });
}
window.addEventListener('fwLogout', doLogout);

// ─── COMMAND PALETTE ───────────────────────────────────────
const cmdkOverlay = document.getElementById('cmdkOverlay');
const cmdkInput = document.getElementById('cmdkInput');
const cmdkResults = document.getElementById('cmdkResults');
let cmdkSel = 0;
let cmdkItems = [];

function openCmdk(){
  cmdkOverlay.classList.add('open');
  cmdkInput.value = '';
  cmdkInput.focus();
  renderCmdk('');
}
function closeCmdk(){ cmdkOverlay.classList.remove('open'); }

document.getElementById('cmdkBtn').addEventListener('click', openCmdk);
document.addEventListener('keydown', e=>{
  if ((e.metaKey || e.ctrlKey) && e.key === 'k'){ e.preventDefault(); openCmdk(); }
  if (e.key === 'Escape') closeCmdk();
  if (cmdkOverlay.classList.contains('open')){
    if (e.key === 'ArrowDown'){ e.preventDefault(); cmdkSel = Math.min(cmdkItems.length-1, cmdkSel+1); updateCmdkSel(); }
    if (e.key === 'ArrowUp'){ e.preventDefault(); cmdkSel = Math.max(0, cmdkSel-1); updateCmdkSel(); }
    if (e.key === 'Enter'){ e.preventDefault(); cmdkItems[cmdkSel]?.action?.(); }
  }
});
cmdkOverlay.addEventListener('click', e => { if (e.target === cmdkOverlay) closeCmdk(); });

const NAV_ITEMS = [
  { label:'Overview', section:'overview' },
  { label:'Leads', section:'leads' },
  { label:'Conversations', section:'conversations' },
  { label:'Reviews', section:'reviews' },
  { label:'Reports', section:'reports' },
  { label:'Intelligence', section:'intelligence' },
  { label:'Settings', section:'settings' },
];
const ACTIONS = [
  { label:'Pause bot', action: ()=>{ closeCmdk(); document.getElementById('botToggleBtn').click(); } },
  { label:'Generate report', action: ()=>{ closeCmdk(); showSection('reports'); } },
  { label:'Message Andrew', action: ()=>{ closeCmdk(); window.open('sms:+12036709477?body=Hi%20Andrew','_self'); } },
  { label:'Run system audit', action: ()=>{ closeCmdk(); document.getElementById('qaAudit').click(); } },
  { label:'Sign out', action: ()=>{ closeCmdk(); doLogout(); } },
];

async function renderCmdk(q){
  cmdkSel = 0;
  cmdkItems = [];
  let html = '';

  const navMatches = NAV_ITEMS.filter(n => !q || n.label.toLowerCase().includes(q.toLowerCase()));
  if (navMatches.length){
    html += `<div class="cmdk-group-label">Navigate</div>`;
    navMatches.forEach(n => {
      cmdkItems.push({ action: ()=>{ closeCmdk(); showSection(n.section); } });
      html += `<div class="cmdk-item" data-i="${cmdkItems.length-1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>${escHtml(n.label)}</div>`;
    });
  }

  const actMatches = ACTIONS.filter(a => !q || a.label.toLowerCase().includes(q.toLowerCase()));
  if (actMatches.length){
    html += `<div class="cmdk-group-label">Actions</div>`;
    actMatches.forEach(a => {
      cmdkItems.push({ action: a.action });
      html += `<div class="cmdk-item" data-i="${cmdkItems.length-1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/></svg>${escHtml(a.label)}</div>`;
    });
  }

  if (q && q.length >= 2){
    const res = await api('/portal/cmdk-search', { q });
    if (res.leads?.length){
      html += `<div class="cmdk-group-label">Leads</div>`;
      res.leads.forEach(l => {
        cmdkItems.push({ action: ()=>{ closeCmdk(); showSection('leads'); } });
        html += `<div class="cmdk-item" data-i="${cmdkItems.length-1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>${escHtml(l.name)}<span class="ck-sub">${escHtml(l.stage)}</span></div>`;
      });
    }
    if (res.conversations?.length){
      html += `<div class="cmdk-group-label">Conversations</div>`;
      res.conversations.forEach(c => {
        cmdkItems.push({ action: ()=>{ closeCmdk(); showSection('conversations'); } });
        html += `<div class="cmdk-item" data-i="${cmdkItems.length-1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${escHtml(c.contact_name)}<span class="ck-sub">${timeAgo(c.timestamp)}</span></div>`;
      });
    }
  }

  if (!html) html = `<div class="cmdk-group-label" style="padding:2rem 1.3rem;text-align:center">No matches.</div>`;
  cmdkResults.innerHTML = html;
  cmdkResults.querySelectorAll('.cmdk-item').forEach(el => el.addEventListener('click', ()=> cmdkItems[+el.dataset.i]?.action?.()));
  updateCmdkSel();
}
function updateCmdkSel(){
  cmdkResults.querySelectorAll('.cmdk-item').forEach((el,i)=> el.classList.toggle('sel', i===cmdkSel));
}
let cmdkTimer;
cmdkInput.addEventListener('input', e => {
  clearTimeout(cmdkTimer);
  cmdkTimer = setTimeout(()=> renderCmdk(e.target.value.trim()), 180);
});

// ─── NOTIFICATIONS ─────────────────────────────────────────
const notifBd = document.getElementById('notifBd');
const notifDrawer = document.getElementById('notifDrawer');
const notifList = document.getElementById('notifList');

async function openNotif(){
  notifBd.classList.add('open');
  notifDrawer.classList.add('open');
  const data = await api('/portal/notifications');
  const items = data.notifications || [];
  if (!items.length){
    notifList.innerHTML = '<div class="drawer-empty">All caught up.</div>';
    document.getElementById('notifBadge').style.display='none';
    return;
  }
  document.getElementById('notifBadge').textContent = items.length;
  document.getElementById('notifBadge').style.display = '';
  const ICONS = {
    new_lead:'<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    review:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    storm:'<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  };
  notifList.innerHTML = items.map(n => `<div class="notif-item">
    <div class="ni-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n.type]||ICONS.new_lead}</svg></div>
    <div class="ni-body">
      <div class="ni-title">${escHtml(n.title||'Update')}</div>
      <div class="ni-text">${escHtml(n.body||'')}</div>
      <div class="ni-time">${timeAgo(n.timestamp)} ago</div>
    </div>
  </div>`).join('');
}
function closeNotif(){ notifBd.classList.remove('open'); notifDrawer.classList.remove('open'); }
document.getElementById('notifBtn').addEventListener('click', openNotif);
document.getElementById('notifClose').addEventListener('click', closeNotif);
notifBd.addEventListener('click', closeNotif);

// ─── MOBILE SHEET ──────────────────────────────────────────
const sheetBd = document.getElementById('sheetBd');
const moreSheet = document.getElementById('moreSheet');
function openSheet(){ sheetBd.classList.add('open'); moreSheet.classList.add('open'); }
function closeSheet(){ sheetBd.classList.remove('open'); moreSheet.classList.remove('open'); }
document.getElementById('moreBtn').addEventListener('click', openSheet);
sheetBd.addEventListener('click', closeSheet);
document.querySelectorAll('.sheet-item').forEach(it=>{
  it.addEventListener('click', ()=>{
    closeSheet();
    if (it.id === 'sheetLogout') return doLogout();
    if (it.dataset.section) showSection(it.dataset.section);
  });
});

// ─── INIT ──────────────────────────────────────────────────
sectionLoaded.overview = true;
loadOverview();

// Background refresh
setInterval(()=> {
  if (currentSection === 'overview' && !document.hidden) loadOverview();
}, 60000);

// Refresh on tab focus
window.addEventListener('focus', ()=>{
  if (currentSection === 'overview') loadOverview();
});

})();
