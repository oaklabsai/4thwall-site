// 4THWALL — site interactions
(function(){

  // ── Reveal on scroll ────────────────────────
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  },{threshold:0.12, rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.r').forEach(el=>io.observe(el));

  // ── Draw-on-scroll for SVGs marked .draw ─────
  const drawIO = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.querySelectorAll('path,line,polyline,circle,rect').forEach(p=>{
          try{
            const len = p.getTotalLength ? p.getTotalLength() : 400;
            p.style.setProperty('--len', len);
          }catch(_){}
        });
        e.target.classList.add('in');
        drawIO.unobserve(e.target);
      }
    });
  },{threshold:0.25});
  document.querySelectorAll('.draw').forEach(el=>drawIO.observe(el));

  // ── Inject line-art illustrations (single-line monoweight) ──
  const ILLOS = {
    phone: `<svg viewBox="0 0 100 100"><rect x="30" y="10" width="40" height="80" rx="6" ry="6"/><line x1="44" y1="82" x2="56" y2="82"/><circle cx="50" cy="22" r="1.2" fill="currentColor"/><path d="M 20 45 Q 12 50 20 55"/><path d="M 80 45 Q 88 50 80 55"/><path d="M 12 40 Q 0 50 12 60"/><path d="M 88 40 Q 100 50 88 60"/></svg>`,
    calendar: `<svg viewBox="0 0 100 100"><rect x="18" y="22" width="64" height="60" rx="4"/><line x1="18" y1="36" x2="82" y2="36"/><line x1="32" y1="14" x2="32" y2="28"/><line x1="68" y1="14" x2="68" y2="28"/><line x1="30" y1="48" x2="40" y2="48"/><line x1="48" y1="48" x2="58" y2="48"/><line x1="66" y1="48" x2="76" y2="48"/><line x1="30" y1="60" x2="40" y2="60"/><circle cx="53" cy="60" r="5"/><line x1="66" y1="60" x2="76" y2="60"/><line x1="30" y1="72" x2="40" y2="72"/></svg>`,
    star: `<svg viewBox="0 0 100 100"><polygon points="50,18 60,40 84,42 66,58 72,82 50,70 28,82 34,58 16,42 40,40"/></svg>`,
    search: `<svg viewBox="0 0 100 100"><circle cx="42" cy="42" r="22"/><line x1="58" y1="58" x2="78" y2="78"/><path d="M 32 42 Q 42 32 52 42" /><path d="M 32 42 Q 42 52 52 42" /></svg>`,
    storm: `<svg viewBox="0 0 100 100"><path d="M 22 48 Q 14 48 14 40 Q 14 30 26 30 Q 28 22 38 22 Q 50 22 52 32 Q 64 30 68 40 Q 80 40 80 50 Q 80 58 70 58 L 28 58 Q 22 58 22 48 Z"/><polyline points="40,62 34,78 44,76 38,90"/><line x1="56" y1="64" x2="52" y2="74"/><line x1="64" y1="62" x2="60" y2="72"/></svg>`,
    step1: `<svg viewBox="0 0 100 100"><circle cx="35" cy="40" r="12"/><circle cx="65" cy="40" r="12"/><path d="M 23 40 Q 16 56 26 70"/><path d="M 77 40 Q 84 56 74 70"/><path d="M 26 70 Q 50 78 74 70"/><line x1="42" y1="42" x2="58" y2="42"/></svg>`,
    step2: `<svg viewBox="0 0 100 100"><rect x="22" y="26" width="56" height="38" rx="3"/><line x1="22" y1="36" x2="78" y2="36"/><circle cx="28" cy="31" r="1.2" fill="currentColor"/><circle cx="33" cy="31" r="1.2" fill="currentColor"/><line x1="30" y1="46" x2="46" y2="46"/><line x1="30" y1="54" x2="58" y2="54"/><polyline points="42,72 50,80 58,72"/><line x1="50" y1="64" x2="50" y2="80"/></svg>`,
    step3: `<svg viewBox="0 0 100 100"><polygon points="50,16 84,38 84,76 50,90 16,76 16,38"/><polyline points="34,52 46,64 68,38"/></svg>`,
    step4: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="28"/><polyline points="50,30 50,50 64,58"/><circle cx="50" cy="50" r="2" fill="currentColor"/></svg>`
  };
  document.querySelectorAll('[data-illo]').forEach(el=>{
    const k = el.getAttribute('data-illo');
    if(ILLOS[k]) el.innerHTML = ILLOS[k];
  });

  // ── Hero vignettes: "while you ___ / we ___" line-art ──
  const VIGNETTE_ILLOS = {
    sleeping: `<svg viewBox="0 0 100 100"><path d="M 16 14 a 7 7 0 1 0 5 5 a 5 5 0 0 1 -5 -5z" fill="currentColor" stroke="none"/><path d="M 12 70 L 12 56 L 88 56 L 88 70"/><line x1="8" y1="70" x2="92" y2="70"/><line x1="14" y1="70" x2="14" y2="82"/><line x1="86" y1="70" x2="86" y2="82"/><rect x="20" y="50" width="22" height="6" rx="2"/><path d="M 20 56 Q 35 44 52 52 Q 70 60 86 56"/><text x="56" y="32" font-family="serif" font-style="italic" font-size="14" stroke="none" fill="currentColor">Z</text><text x="68" y="22" font-family="serif" font-style="italic" font-size="10" stroke="none" fill="currentColor">z</text><text x="76" y="14" font-family="serif" font-style="italic" font-size="7" stroke="none" fill="currentColor">z</text></svg>`,
    dinner: `<svg viewBox="0 0 100 100"><line x1="50" y1="4" x2="50" y2="20"/><path d="M 42 20 L 58 20 L 54 30 L 46 30 Z"/><circle cx="22" cy="50" r="5"/><path d="M 17 56 L 17 68 L 27 68 L 27 56 Z"/><circle cx="50" cy="44" r="6"/><path d="M 44 51 L 44 68 L 56 68 L 56 51 Z"/><circle cx="78" cy="50" r="5"/><path d="M 73 56 L 73 68 L 83 68 L 83 56 Z"/><rect x="8" y="68" width="84" height="5" rx="1"/><line x1="18" y1="73" x2="18" y2="92"/><line x1="82" y1="73" x2="82" y2="92"/><ellipse cx="22" cy="70" rx="4" ry="1"/><ellipse cx="50" cy="70" rx="5" ry="1.2"/><ellipse cx="78" cy="70" rx="4" ry="1"/></svg>`,
    coffee: `<svg viewBox="0 0 100 100"><path d="M 38 28 Q 35 18 41 10"/><path d="M 50 28 Q 47 16 53 6"/><path d="M 62 28 Q 59 18 65 10"/><path d="M 26 32 L 26 70 Q 26 84 40 84 L 60 84 Q 74 84 74 70 L 74 32 Z"/><path d="M 74 44 Q 88 44 88 56 Q 88 70 74 70"/><ellipse cx="50" cy="88" rx="34" ry="3"/><ellipse cx="50" cy="34" rx="22" ry="3"/></svg>`,
    roof: `<svg viewBox="0 0 100 100"><path d="M 8 52 L 50 18 L 92 52"/><path d="M 18 52 L 18 86 L 82 86 L 82 52"/><path d="M 44 86 L 44 70 L 56 70 L 56 86"/><rect x="22" y="60" width="10" height="10"/><line x1="27" y1="60" x2="27" y2="70"/><line x1="22" y1="65" x2="32" y2="65"/><line x1="6" y1="86" x2="94" y2="86"/><circle cx="62" cy="32" r="3"/><line x1="62" y1="35" x2="62" y2="44"/><line x1="62" y1="38" x2="58" y2="42"/><line x1="62" y1="44" x2="58" y2="48"/><line x1="62" y1="44" x2="65" y2="48"/><line x1="62" y1="38" x2="68" y2="32"/><rect x="68" y="28" width="6" height="3"/></svg>`,
    family: `<svg viewBox="0 0 100 100"><circle cx="80" cy="20" r="5"/><line x1="80" y1="9" x2="80" y2="6"/><line x1="80" y1="34" x2="80" y2="31"/><line x1="69" y1="20" x2="66" y2="20"/><line x1="91" y1="20" x2="94" y2="20"/><line x1="73" y1="13" x2="71" y2="11"/><line x1="87" y1="13" x2="89" y2="11"/><line x1="73" y1="27" x2="71" y2="29"/><line x1="87" y1="27" x2="89" y2="29"/><circle cx="32" cy="36" r="5"/><line x1="32" y1="41" x2="32" y2="64"/><line x1="32" y1="48" x2="22" y2="55"/><line x1="32" y1="48" x2="48" y2="58"/><line x1="32" y1="64" x2="26" y2="84"/><line x1="32" y1="64" x2="38" y2="84"/><circle cx="56" cy="54" r="3.5"/><line x1="56" y1="58" x2="56" y2="72"/><line x1="56" y1="62" x2="48" y2="58"/><line x1="56" y1="62" x2="62" y2="60"/><line x1="56" y1="72" x2="52" y2="84"/><line x1="56" y1="72" x2="60" y2="84"/></svg>`
  };

  // ── Hero phone demo: 5 scenarios on rotation ──
  const stream = document.getElementById('demo-stream');
  if(stream){
    const SCENARIOS = [
      {
        tag:'Scenario 01 · Storm leak · 11:47 PM',
        time:'11:47',
        avatar:'JD', avatarColor:'#CF5D36',
        name:'Jamie D.', channel:'SMS',
        islandTitle:'New lead · urgent',
        islandSub:'SMS · just now',
        vignette:{illo:'sleeping',you:'while you sleep,',we:'we catch the storm.'},
        script:[
          {who:'them', text:'Hey, my roof started leaking after the storm. Can someone come look?', ts:'11:47 PM'},
          {typing:650},
          {who:'us',   text:'Sorry to hear that — we can. Is the leak active right now, and roughly where on the house?', ts:'11:47 PM', delay:900},
          {who:'them', text:'Yeah it\'s dripping into the kitchen. Back of the house.', ts:'11:48 PM', delay:1100},
          {typing:600},
          {who:'us',   text:'Got it. I\'ve booked a free emergency assessment for tomorrow 9am with Mike. He\'ll text 30 min before. Cover the drip with a bucket if you can.', ts:'11:48 PM', delay:1000},
          {who:'them', text:'Wow that was fast. Thanks.', ts:'11:49 PM', delay:1200},
        ]
      },
      {
        tag:'Scenario 02 · After-hours estimate · 9:23 PM',
        time:'21:23',
        avatar:'MR', avatarColor:'#3a6a5a',
        name:'Maria R.', channel:'WEB CHAT',
        islandTitle:'Web chat opened',
        islandSub:'Estimate request',
        vignette:{illo:'dinner',you:"while you're at dinner,",we:'we close the lead.'},
        script:[
          {who:'them', text:'Hi, looking for a quote on a kitchen remodel. About 180 sqft, mid-range finishes.', ts:'9:23 PM'},
          {typing:600},
          {who:'us',   text:'Happy to help. Are you in the early planning stage, or do you have a timeline you\'re working toward?', ts:'9:23 PM', delay:900},
          {who:'them', text:'Hoping to start in 6-8 weeks if possible.', ts:'9:24 PM', delay:1050},
          {typing:700},
          {who:'us',   text:'Workable. I\'ll send our 4 most recent kitchen projects in your range, and a 45-min intro call with our PM Thursday at 10am — does that work?', ts:'9:24 PM', delay:1000},
          {who:'them', text:'Thursday 10 is perfect.', ts:'9:25 PM', delay:1150},
        ]
      },
      {
        tag:'Scenario 03 · Spanish-speaking lead · 7:14 AM',
        time:'7:14',
        avatar:'CS', avatarColor:'#8a5a2a',
        name:'Carlos S.', channel:'SMS · ES',
        islandTitle:'New lead · Español',
        islandSub:'Auto-translated',
        vignette:{illo:'coffee',you:'while you have coffee,',we:'we book the visit.'},
        script:[
          {who:'them', text:'Buenos días. Necesito reparar el techo de mi garaje. ¿Pueden venir a verlo?', ts:'7:14 AM'},
          {typing:600},
          {who:'us',   text:'Buenos días Carlos. Sí, claro. ¿Es una reparación pequeña o hay daño visible desde el interior?', ts:'7:14 AM', delay:900},
          {who:'them', text:'Hay manchas en el techo de adentro. Como un metro cuadrado.', ts:'7:15 AM', delay:1100},
          {typing:700},
          {who:'us',   text:'Entendido. Podemos pasar mañana entre 8 y 10 AM para inspección gratis. Te mando confirmación por texto. ¿Está bien?', ts:'7:15 AM', delay:1000},
          {who:'them', text:'Perfecto, gracias.', ts:'7:16 AM', delay:1150},
        ]
      },
      {
        tag:'Scenario 04 · Missed call recovery · 2:08 PM',
        time:'14:08',
        avatar:'TK', avatarColor:'#4a4a8a',
        name:'Tom K.', channel:'MISSED CALL',
        islandTitle:'Missed call · 2m ago',
        islandSub:'Auto-follow-up sent',
        vignette:{illo:'roof',you:"while you're on the roof,",we:'we return the call.'},
        script:[
          {who:'us',   text:'Hi Tom — sorry we missed your call. This is a text follow-up from the office. What can we help you with?', ts:'2:08 PM', delay:0},
          {typing:750},
          {who:'them', text:'Looking for siding replacement on a 2-story colonial. Got a referral from my neighbor.', ts:'2:09 PM', delay:1050},
          {typing:600},
          {who:'us',   text:'Appreciate the referral. Best way is a 20-min site visit so we can measure and walk you through options. Saturday 11am or Monday 4pm work?', ts:'2:09 PM', delay:1000},
          {who:'them', text:'Saturday 11.', ts:'2:10 PM', delay:1100},
          {typing:550},
          {who:'us',   text:'Booked. Calendar invite + reminder coming through. We\'ll see you then.', ts:'2:10 PM', delay:950},
        ]
      },
      {
        tag:'Scenario 05 · Repeat customer · 10:02 AM',
        time:'10:02',
        avatar:'PL', avatarColor:'#6a3a3a',
        name:'Priya L.', channel:'SMS',
        islandTitle:'Repeat customer',
        islandSub:'Last job · Apr 2024',
        vignette:{illo:'family',you:"while you're with the kids,",we:'we honor the warranty.'},
        script:[
          {who:'them', text:'Hi! You did our gutters last spring — we have a small issue with one of the downspouts.', ts:'10:02 AM'},
          {typing:600},
          {who:'us',   text:'Hi Priya — good to hear from you. I see your file. Is it pulling away from the house, or is something blocking the flow?', ts:'10:02 AM', delay:900},
          {who:'them', text:'It\'s pulling away near the garage corner.', ts:'10:03 AM', delay:1100},
          {typing:700},
          {who:'us',   text:'Covered under your 2-year workmanship warranty. We\'ll have a tech out Wed afternoon — no charge. Confirmation coming through.', ts:'10:03 AM', delay:1000},
          {who:'them', text:'You guys are the best.', ts:'10:04 AM', delay:1150},
        ]
      },
    ];

    const tagEl = document.getElementById('demo-scenario-tag');
    const timeEl = document.getElementById('demo-time');
    const avatarEl = document.getElementById('demo-avatar');
    const nameEl = document.getElementById('demo-name');
    const channelEl = document.getElementById('demo-channel');
    const islandEl = document.getElementById('demo-island');
    const islandIcon = document.getElementById('di-icon');
    const islandText = document.getElementById('di-text');
    const dotsEl = document.getElementById('demo-dots');
    const vigEl = document.getElementById('hero-vignette');
    const vigIllo = document.getElementById('vig-illo');
    const vigYou = document.getElementById('vig-you');
    const vigWe = document.getElementById('vig-we');

    // build dots
    SCENARIOS.forEach((_,i)=>{
      const s = document.createElement('span');
      s.addEventListener('click', ()=>{ activeIdx = i; resetCycle(); });
      dotsEl.appendChild(s);
    });
    const dots = [...dotsEl.children];

    function clearStream(){
      // keep the tag, remove bubbles
      [...stream.children].forEach(c=>{ if(!c.classList.contains('demo-scenario-tag')) c.remove(); });
    }
    function appendBubble(spec){
      const div = document.createElement('div');
      div.className = 'bub ' + spec.who;
      div.innerHTML = spec.text + '<span class="ts">'+spec.ts+'</span>';
      stream.appendChild(div);
    }
    function appendTyping(){
      const div = document.createElement('div');
      div.className = 'bub typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      stream.appendChild(div);
      return div;
    }
    function setScenario(s, idx){
      tagEl.textContent = s.tag;
      // Lock to iconic iPhone marketing time so both phones match (and never show military format)
      timeEl.textContent = '9:41';
      avatarEl.textContent = s.avatar;
      avatarEl.style.background = s.avatarColor;
      nameEl.textContent = s.name;
      channelEl.textContent = s.channel;
      islandIcon.textContent = s.avatar.charAt(0);
      islandIcon.style.background = s.avatarColor;
      islandText.querySelector('strong').textContent = s.islandTitle;
      islandText.querySelector('span').textContent = s.islandSub;
      dots.forEach((d,i)=>d.classList.toggle('on', i===idx));
      if(vigEl && s.vignette){
        vigEl.classList.add('swap');
        setTimeout(()=>{
          if(s.vignette.illo && VIGNETTE_ILLOS[s.vignette.illo]){
            vigIllo.innerHTML = VIGNETTE_ILLOS[s.vignette.illo];
          }
          vigYou.textContent = s.vignette.you;
          vigWe.textContent = s.vignette.we;
          vigEl.classList.remove('swap');
        }, 320);
      }
    }

    let activeIdx = 0;
    let cycleToken = 0;
    function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

    async function runScenario(s, idx, token){
      setScenario(s, idx);
      clearStream();
      // show island expanded for ~1.6s as a "new lead" notification
      islandEl.classList.add('expanded');
      await sleep(900);
      if(token!==cycleToken) return;
      islandEl.classList.remove('expanded');
      await sleep(200);
      if(token!==cycleToken) return;
      // play conversation
      for(const step of s.script){
        if(token!==cycleToken) return;
        if(step.typing){
          const t = appendTyping();
          await sleep(step.typing);
          if(token!==cycleToken){ t.remove(); return; }
          t.remove();
        } else {
          appendBubble(step);
          await sleep(step.delay || 1100);
        }
      }
      // dwell at end
      await sleep(2000);
    }

    async function loop(){
      const token = ++cycleToken;
      while(token===cycleToken){
        await runScenario(SCENARIOS[activeIdx], activeIdx, token);
        if(token!==cycleToken) return;
        activeIdx = (activeIdx+1) % SCENARIOS.length;
      }
    }
    function resetCycle(){ loop(); }
    loop();
  }

  // ── Flip cards ──
  document.querySelectorAll('[data-flip]').forEach(card=>{
    card.addEventListener('click', ()=> card.classList.toggle('flipped'));
  });

  // ── FAQ accordion (one open at a time) ──
  document.querySelectorAll('#faq-list .faq-item').forEach(item=>{
    const btn = item.querySelector('.faq-q');
    btn.addEventListener('click', ()=>{
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('#faq-list .faq-item').forEach(i=>i.classList.remove('open'));
      if(!wasOpen) item.classList.add('open');
    });
  });

  // ── Composer chips + send ──
  document.querySelectorAll('#cm-chips .chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('#cm-chips .chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      const tradeInput = document.getElementById('cm-trade');
      if(tradeInput) tradeInput.value = chip.dataset.chip || '';
    });
  });
  const form = document.getElementById('composer-form');
  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const send = document.getElementById('cm-send');
      const msg = document.getElementById('cm-msg');
      // ── SMS consent (optional — TCPA: cannot gate submission on consent) ──────
      const consentMarketing = form.querySelector('input[name="sms_marketing_consent"]');
      const consentTransactional = form.querySelector('input[name="sms_transactional_consent"]');
      const originalLabel = send.textContent;
      send.textContent = '…';
      send.disabled = true;
      try {
        const fd = new FormData(form);
        const body = {};
        fd.forEach((v, k) => { body[k] = v; });
        body.sms_marketing_consent = consentMarketing && consentMarketing.checked ? 'true' : 'false';
        body.sms_transactional_consent = consentTransactional && consentTransactional.checked ? 'true' : 'false';
        // Route via Vercel proxy /api/lead → worker /marketing-lead.
        // Direct worker calls would 401 (no WORKER_SECRET) and 400 (no location_id).
        const res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body)
        });
        if(!res.ok) throw new Error('submit failed: ' + res.status);
        send.classList.add('sent');
        send.textContent = '✓';
        form.reset();
        document.querySelectorAll('#cm-chips .chip').forEach(c=>c.classList.remove('active'));
        const block = form.querySelector('.consent-block');
        if(block) block.classList.remove('consent-error');
        msg.placeholder = 'Got it — Andrew will reply within an hour during business hours.';
        setTimeout(()=>{ send.classList.remove('sent'); send.textContent = originalLabel; send.disabled = false; }, 4500);
      } catch (err) {
        send.textContent = originalLabel;
        send.disabled = false;
        msg.placeholder = "Couldn't send — email andrew@4thwall.solutions or call (203) 670-9477.";
      }
    });
    // Clear error styling once either consent box is checked
    form.querySelectorAll('input[name="sms_marketing_consent"], input[name="sms_transactional_consent"]').forEach(box => {
      box.addEventListener('change', () => {
        const block = box.closest('.consent-block');
        if(block) block.classList.remove('consent-error');
      });
    });
  }

  // ── Nav dropdown ─────────────────────────────────
  const menuBtn   = document.getElementById('menuBtn');
  const navDrop   = document.getElementById('navDrop');
  const dropClose = document.getElementById('dropClose');
  const dropBd    = document.getElementById('dropBd');

  const topnav = document.querySelector('nav.topnav');
  function positionDrop(){
    if(topnav && navDrop) navDrop.style.top = (topnav.offsetHeight + 8) + 'px';
  }
  positionDrop();
  window.addEventListener('resize', positionDrop);

  // ── Fade nav links + logo on scroll, keep menu btn ─
  const navFadeEls = topnav ? [topnav.querySelector('.nav-logo'), ...topnav.querySelectorAll('.nav-a')].filter(Boolean) : [];
  window.addEventListener('scroll', () => {
    const fade = Math.max(0, 1 - window.scrollY / 100);
    navFadeEls.forEach(el => {
      el.style.opacity = fade;
      el.style.pointerEvents = fade < 0.05 ? 'none' : '';
    });
  }, {passive:true});

  function openDrop(){
    navDrop.classList.add('is-open');
    dropBd.classList.add('is-open');
    menuBtn.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded','true');
  }
  function closeDrop(){
    navDrop.classList.remove('is-open');
    dropBd.classList.remove('is-open');
    menuBtn.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded','false');
  }

  if(menuBtn) menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    navDrop.classList.contains('is-open') ? closeDrop() : openDrop();
  });

  if(dropClose) dropClose.addEventListener('click', closeDrop);
  if(dropBd)    dropBd.addEventListener('click', closeDrop);

  document.querySelectorAll('.drop-a').forEach(a => a.addEventListener('click', closeDrop));
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDrop(); });

  // ── Products nav dropdown ─────────────────────────────────
  const prodBtn  = document.getElementById('prodBtn');
  const prodWrap = document.getElementById('prodWrap');
  if(prodBtn && prodWrap){
    prodBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = prodWrap.classList.toggle('prod-open');
      prodBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => {
      prodWrap.classList.remove('prod-open');
      prodBtn.setAttribute('aria-expanded','false');
    });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ prodWrap.classList.remove('prod-open'); prodBtn.setAttribute('aria-expanded','false'); }
    });
  }

})();
