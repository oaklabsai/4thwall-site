// 4THWALL — homeowner surface shared client.
// Pages are plain HTML on Vercel; data comes from the Supabase Edge Function
// (JSON only). Sessions are bearer tokens in localStorage — never cookies
// (cross-site cookies die in Safari, and the API lives on supabase.co).
(function(){
  const API = 'https://vinytnzzgryodyrftabg.supabase.co/functions/v1/home';
  const TOKEN_KEY = 'hw_session';
  const NEXT_KEY = 'hw_next';

  const HOME = {
    API,
    TRADES: ['roofing','hvac','plumbing','electrical','paving','lawn_care'],

    token(){ try { return localStorage.getItem(TOKEN_KEY) || null; } catch(_) { return null; } },
    setToken(t){ try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch(_){} },
    setNext(url){ try { sessionStorage.setItem(NEXT_KEY, url); } catch(_){} },
    takeNext(){
      try {
        const n = sessionStorage.getItem(NEXT_KEY);
        sessionStorage.removeItem(NEXT_KEY);
        // only ever bounce within this site
        return (n && n.startsWith('/') && !n.startsWith('//')) ? n : null;
      } catch(_) { return null; }
    },

    async api(path, opts){
      opts = opts || {};
      const headers = Object.assign({'Accept':'application/json'}, opts.headers || {});
      const t = HOME.token();
      if (t) headers['Authorization'] = 'Bearer ' + t;
      if (opts.body && typeof opts.body !== 'string'){
        headers['Content-Type'] = 'application/json';
        opts = Object.assign({}, opts, { body: JSON.stringify(opts.body) });
      }
      const res = await fetch(API + path, Object.assign({}, opts, { headers }));
      let data = null;
      try { data = await res.json(); } catch(_){}
      return { status: res.status, data: data || { ok:false, error:'bad_response' } };
    },

    esc(s){
      return String(s == null ? '' : s)
        .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
        .replaceAll('"','&quot;').replaceAll("'",'&#39;');
    },

    tradeLabel(t){
      const s = String(t || '').replace(/_/g,' ').trim();
      return s ? s.replace(/\b\w/g, c => c.toUpperCase()) : 'General';
    },

    fmtDate(iso){
      const d = new Date(String(iso || ''));
      if (isNaN(d)) return String(iso || '').slice(0,10);
      return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    },

    // Badge chips — renders ONLY what the ledger sent. Never computes a number.
    badgeChips(pro){
      const esc = HOME.esc;
      if (!pro || !pro.verified || !pro.badges){
        return '<div class="warn">Verification temporarily unavailable for this pro — badges hidden until the ledger verifies again.</div>';
      }
      const b = pro.badges, chips = [];
      chips.push('<span class="badge">✓ ' + (Number(b.verified_jobs) || 0) + ' verified jobs</span>');
      if (b.response_ms_median_90d != null){
        const ms = Number(b.response_ms_median_90d);
        chips.push('<span class="badge">Answers in ' + (ms < 1000 ? '&lt;1s' : Math.round(ms/1000) + 's') + ' (median, 90d)</span>');
      }
      if (b.booking_reliability_365d != null) chips.push('<span class="badge">' + esc(b.booking_reliability_365d) + '% booking follow-through</span>');
      if (b.storm_responder) chips.push('<span class="badge">Storm responder</span>');
      if (Number(b.reviews_earned) > 0) chips.push('<span class="badge plain">' + esc(b.reviews_earned) + ' reviews earned' + (b.rating_avg != null ? ' · ' + esc(b.rating_avg) + '★ avg' : '') + '</span>');
      if (b.since_year != null) chips.push('<span class="badge plain">On 4THWALL since ' + esc(b.since_year) + '</span>');
      return '<div class="badges">' + chips.join('') + '</div>';
    },

    verifiedCard(p){
      const esc = HOME.esc;
      return '<div class="card lift">' +
        '<a class="cardlink" href="/pro/' + encodeURIComponent(p.location_id) + '"><h3>' + esc(p.business_name) + '</h3></a>' +
        '<div class="sub">' + esc(HOME.tradeLabel(p.trade)) + '</div>' +
        HOME.badgeChips(p) +
        '<div class="spacer"></div>' +
        '<div><a class="pill pill-orange pill-sm" href="/pro/' + encodeURIComponent(p.location_id) + '">View record &amp; request <span class="arr">→</span></a></div>' +
      '</div>';
    },

    listedCard(p, zip){
      const esc = HOME.esc;
      const href = '/c/' + encodeURIComponent(p.place_id) + (zip ? '?zip=' + encodeURIComponent(zip) : '');
      return '<div class="card lift">' +
        '<a class="cardlink" href="' + href + '"><h3>' + esc(p.name) + '</h3></a>' +
        '<div class="sub">' + esc(p.address) + '</div>' +
        '<div class="badges"><span class="badge plain">Listed</span></div>' +
        '<div class="spacer"></div>' +
        '<div><a class="pill pill-ghost pill-sm" href="' + href + '">View profile</a></div>' +
      '</div>';
    },

    // Fill the nav account slot: Sign in ↔ email + sign out. Cheap and silent —
    // pages render fine before (and without) this resolving.
    async navAccount(){
      const slot = document.getElementById('nav-acct');
      if (!slot) return null;
      if (!HOME.token()){
        slot.innerHTML = '<a class="nav-a" href="/signin">Sign in</a>';
        return null;
      }
      const { data } = await HOME.api('/me');
      if (data && data.ok && data.account){
        slot.innerHTML = '<span class="nav-who">' + HOME.esc(data.account.email || 'signed in') + '</span>' +
          '<a class="nav-a" href="#" id="nav-signout">Sign out</a>';
        const out = document.getElementById('nav-signout');
        if (out) out.addEventListener('click', async (e) => {
          e.preventDefault();
          await HOME.api('/signout', { method:'POST' });
          HOME.setToken(null);
          location.reload();
        });
        return data.account;
      }
      HOME.setToken(null); // expired/revoked — drop it quietly
      slot.innerHTML = '<a class="nav-a" href="/signin">Sign in</a>';
      return null;
    },

    signinHref(next){
      return '/signin?next=' + encodeURIComponent(next || (location.pathname + location.search));
    }
  };

  window.HOME = HOME;
})();
