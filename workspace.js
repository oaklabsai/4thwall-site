(function () {
  'use strict';

  // Atlas Workspace — the free record-carried Home.
  //
  // One face for every firm. The density tier from the report steers which
  // section leads (a rich file opens on what homeowners say; a sparse one
  // opens on the record and what's missing) — same components either way,
  // never a different product. The tier itself is never rendered.
  //
  // The office rooms in the sidebar are the offer (Drew's ruling 8/06): a
  // click brings up what the room does and the door. No prices here — price
  // comes from the calls.

  const API = 'https://vinytnzzgryodyrftabg.supabase.co/functions/v1/home';
  const SESSION_KEY = 'lens_workspace_session';

  function esc(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function token() {
    try { return localStorage.getItem(SESSION_KEY) || ''; } catch (_) { return ''; }
  }

  async function api(path, options) {
    const opts = Object.assign({}, options || {});
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    try {
      const response = await fetch(API + path, Object.assign(opts, { headers: headers }));
      const result = await response.json().catch(function () { return { ok: false, error: 'bad_response' }; });
      return { ok: response.ok && result.ok !== false, status: response.status, data: result };
    } catch (_) {
      return { ok: false, status: 0, data: { ok: false, error: 'network_error' } };
    }
  }

  function toast(message) {
    const el = document.getElementById('workspace-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  // ── The office: rooms are the offer ────────────────────────────────────
  const ROOMS = [
    { key: 'inbox', label: 'Inbox', title: 'Inbox', body: 'Every text and missed call that reaches your business, answered in seconds instead of hours — booked, qualified, or politely turned away, with you in the loop.' },
    { key: 'booking', label: 'Booking', title: 'Booking', body: 'Jobs land on a calendar without phone tag. A homeowner texts, gets three real time slots, and picks one while they are still interested.' },
    { key: 'followup', label: 'Follow-up', title: 'Follow-up', body: 'Estimates that went quiet get a nudge at the right moment. The work you already quoted is the cheapest job you will ever win.' },
    { key: 'reviews', label: 'Reviews', title: 'Reviews', body: 'Every finished job becomes an ask, sent when the customer is happiest. Your review count is the record homeowners actually read — this grows it on schedule.' },
    { key: 'storm', label: 'Storm', title: 'Storm', body: 'When severe weather crosses your towns, your response is ready before the phones light up — the National Weather Service alert is the trigger, not the third missed call.' },
    { key: 'campaigns', label: 'Campaigns', title: 'Campaigns', body: 'Seasonal pushes to past customers — the spring tune-up, the fall cleanup — written and sent without you touching a keyboard.' },
    { key: 'found', label: 'Being found', title: 'Being found', body: 'Your public profile, kept accurate and working for you where homeowners and their tools actually look.' },
  ];

  function openOffer(room) {
    document.getElementById('offer-title').textContent = room.title;
    document.getElementById('offer-body').textContent = room.body;
    document.getElementById('offer-door').innerHTML = 'Want this running for your business? <a href="mailto:4thwalldevelopment@gmail.com?subject=' + encodeURIComponent('Atlas — ' + room.title) + '">Reply and it reaches a person.</a>';
    document.getElementById('veil').classList.add('show');
  }

  function buildNav() {
    const nav = document.getElementById('nav-office');
    let html = '<button class="on" type="button">Home</button>';
    ROOMS.forEach(function (room, i) {
      html += '<button class="quiet" type="button" data-room="' + i + '">' + esc(room.label) + '<i>quiet</i></button>';
    });
    nav.innerHTML = html;
    nav.addEventListener('click', function (e) {
      const b = e.target.closest('[data-room]');
      if (b) openOffer(ROOMS[Number(b.dataset.room)]);
    });
    document.getElementById('offer-close').addEventListener('click', function () {
      document.getElementById('veil').classList.remove('show');
    });
    document.getElementById('veil').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
    });
  }

  // ── Section renderers (each returns card HTML or '') ───────────────────

  function sYourRecord(r) {
    const rec = r.record || {};
    const ten = r.tenure || {};
    let stats = '';
    stats += '<div class="stat"><b>' + (rec.reviews == null ? '—' : esc(rec.reviews)) + '</b><span>reviews on your public listing</span></div>';
    if (ten.regime === 'hic' && ten.record_on_file) {
      stats += '<div class="stat"><b>' + esc(ten.years) + ' yrs</b><span>registered in CT (since ' + esc(String(ten.since).slice(0, 4)) + ')</span></div>';
    }
    const vel = r.velocity || {};
    if (vel.available) {
      stats += '<div class="stat"><b>+' + esc(vel.gained) + '</b><span>reviews since ' + esc(vel.from) + '</span></div>';
    }
    let body = '<div class="statrow">' + stats + '</div>';
    if (!vel.available && vel.reason === 'not enough history yet') {
      body += '<p class="quietnote">Your review count over time starts here — we began keeping that history on ' + esc(vel.since || '2026-08-06') + '. It needs a second reading before it can say anything true.</p>';
    }
    if (ten.regime === 'hic' && !ten.record_on_file) {
      body += '<p class="quietnote">' + esc(ten.coverage_note || '') + '</p>';
    }
    const spec = Array.isArray(rec.specialties) ? rec.specialties : [];
    if (spec.length) body += '<div class="chips">' + spec.map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</div>';
    if (rec.public_profile) body += '<p class="doorline">Your public profile: <a href="' + esc(rec.public_profile) + '" target="_blank" rel="noopener">see it as a homeowner does</a></p>';
    return '<section class="card wide"><h2>Your record</h2><p class="why">Your business as the public record shows it.</p>' + body + '</section>';
  }

  function sThemes(r) {
    const t = r.themes || {};
    if (!t.available) {
      return '<section class="card wide"><h2>What homeowners say</h2>' +
        '<p class="quietnote">' + esc(t.detail || '') + '</p></section>';
    }
    let body = '';
    if (t.synthesis) body += '<p class="synth">' + esc(t.synthesis) + '</p>';
    if (t.signature) body += '<p class="sigline">“' + esc(t.signature) + '”</p>';
    const kf = Array.isArray(t.known_for) ? t.known_for : [];
    const praise = Array.isArray(t.recurring_praise) ? t.recurring_praise : [];
    const chips = kf.concat(praise.filter(function (p) { return kf.indexOf(p) < 0; }));
    if (chips.length) body += '<div class="chips">' + chips.map(function (c) { return '<span class="chip tea">' + esc(String(c).replaceAll('-', ' ')) + '</span>'; }).join('') + '</div>';
    return '<section class="card wide"><h2>What homeowners say</h2><p class="why">Read from your reviews — the same read a homeowner sees on Vesta.</p>' + body + '</section>';
  }

  function sWatch(r) {
    const w = r.watch;
    if (w === null || w === undefined) {
      if ((r.gated || []).indexOf('watch') >= 0) {
        return '<section class="card locked"><h2>Only you would see this</h2><p>The private half of our read — what your reviews flag that we never publish. It unlocks when ownership is confirmed.</p></section>';
      }
      return '';
    }
    if (!w.available) {
      return '<section class="card"><h2>Only you see this</h2><p class="quietnote">' + esc(w.detail || '') + '</p></section>';
    }
    const items = (w.items || []).map(function (i) {
      return '<div class="wi">' + (i.topic ? '<b>' + esc(i.topic) + '</b>' : '') + '<p>' + esc(i.note) + '</p></div>';
    }).join('');
    return '<section class="card wide watchcard"><p class="lock">Private to you — never on your public profile</p><h2>Only you see this</h2><p class="why">What your reviews say when you’re not in the room. We publish none of it; you should know all of it.</p>' + items + '</section>';
  }

  function sPositioning(r) {
    const p = r.positioning || {};
    if (!p.available) return '';
    let body = '';
    if (p.value_tier) body += '<div class="chips"><span class="chip tea">' + esc(String(p.value_tier).replaceAll('-', ' ')) + '</span></div>';
    const ic = Array.isArray(p.ideal_customer) ? p.ideal_customer : [];
    if (ic.length) body += '<p class="quietnote">You win with homeowners who are:</p><div class="chips">' + ic.map(function (c) { return '<span class="chip">' + esc(String(c).replaceAll('-', ' ')) + '</span>'; }).join('') + '</div>';
    const ps = Array.isArray(p.project_scale) ? p.project_scale : [];
    if (ps.length) body += '<p class="quietnote">The work your reviews describe:</p><div class="chips">' + ps.map(function (c) { return '<span class="chip">' + esc(String(c).replaceAll('-', ' ')) + '</span>'; }).join('') + '</div>';
    return '<section class="card"><h2>Who you win with</h2><p class="why">Read from your own reviews, not a survey.</p>' + body + '</section>';
  }

  function sCrew(r) {
    const c = r.crew || {};
    if (!c.available) return '';
    const names = (c.named || []).map(function (n) { return '<span class="chip tea">' + esc(n) + '</span>'; }).join('');
    return '<section class="card"><h2>Your crew, in their words</h2><p class="why">' + esc(c.note || '') + '</p><div class="chips">' + names + '</div></section>';
  }

  function sCompleteness(r) {
    const c = r.completeness || {};
    const item = function (i) {
      return '<li class="' + (i.done ? 'done' : 'todo') + '"><span class="tick">' + (i.done ? '✓' : '○') + '</span>' + esc(i.label) + '</li>';
    };
    const yours = ((c.yours || {}).items || []).map(item).join('');
    const ours = ((c.ours || {}).items || []).map(item).join('');
    return '<section class="card wide"><h2>What’s missing</h2><p class="why">' + esc(c.note || '') + '</p>' +
      '<div class="split"><div><h3>Yours to add</h3><ul class="list">' + yours + '</ul></div>' +
      '<div><h3>Ours to deliver</h3><ul class="list">' + ours + '</ul></div></div></section>';
  }

  function sEntrants(r) {
    if (r.entrants === null || r.entrants === undefined) {
      if ((r.gated || []).indexOf('entrants') >= 0) {
        return '<section class="card locked"><h2>New in your trade</h2><p>Who has newly registered into your trade in Fairfield County. It unlocks when ownership is confirmed.</p></section>';
      }
      return '';
    }
    if (!r.entrants.length) {
      return '<section class="card"><h2>New in your trade</h2><p class="quietnote">No newly registered firms in your trade in the last two years — by our copy of the state register.</p></section>';
    }
    const rows = r.entrants.map(function (e) {
      return '<div class="entr"><div>' + esc(e.name) + (e.city ? ' · ' + esc(e.city) : '') + '</div><span>registered ' + esc(String(e.registered).slice(0, 7)) + '</span></div>';
    }).join('');
    return '<section class="card"><h2>New in your trade</h2><p class="why">Newly registered in Fairfield County — market news, not a ranking.</p>' + rows + '</section>';
  }

  // ── Assembly ───────────────────────────────────────────────────────────

  function render(workspace, report) {
    const app = document.getElementById('app');
    const firm = report.firm || {};
    const ownership = workspace.ownership || {};
    const verified = !!firm.verified;

    const missing = (((report.completeness || {}).yours || {}).items || []).filter(function (i) { return !i.done; });
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let head = '<div class="kicker">The office · ' + esc(day) + '</div>';
    head += '<h1>' + esc(firm.name || workspace.display_name || 'Your business') + '</h1>';
    head += '<p class="sub">' + esc([firm.trade ? String(firm.trade).replaceAll('_', ' ') : '', firm.city].filter(Boolean).join(' · ')) + ' &nbsp; ' +
      (verified ? '<span class="badge owner">✓ Verified owner</span>'
        : '<span class="badge pending">Claim pending — the full file unlocks when ownership is confirmed</span>') + '</p>';

    // One face; density steers which section leads. The tier is layout
    // steering only and is never shown.
    const tier = (report.density || {}).tier || 'sparse';
    const sections = tier === 'rich'
      ? [sThemes, sWatch, sYourRecord, sPositioning, sCrew, sEntrants, sCompleteness]
      : [sYourRecord, sCompleteness, sThemes, sWatch, sPositioning, sCrew, sEntrants];

    let body = '';
    if (missing.length) {
      body += '<section class="card wide"><h2>Needs you · ' + missing.length + '</h2><p class="why">Each of these is visible to homeowners the moment it’s filled in.</p><ul class="list">' +
        missing.map(function (i) { return '<li class="todo"><span class="tick">○</span>' + esc(i.label) + '</li>'; }).join('') + '</ul>' +
        '<p class="doorline"><a href="/workspace/onboarding">Fill these in</a> — takes about two minutes.</p></section>';
    }
    body += sections.map(function (fn) { return fn(report); }).join('');

    app.classList.remove('skeleton');
    app.innerHTML = head + '<div class="grid">' + body + '</div>';

    const who = document.getElementById('who');
    if (who && workspace.membership) who.textContent = 'Signed in as ' + (workspace.membership.role || 'owner');
  }

  function renderNoProfile(workspace) {
    const app = document.getElementById('app');
    app.classList.remove('skeleton');
    app.innerHTML = '<div class="kicker">The office</div><h1>Welcome to your <em>Atlas.</em></h1>' +
      '<p class="sub">This workspace isn’t attached to a business yet.</p>' +
      '<section class="card wide"><h2>Tell us who you are</h2><p class="quietnote">Once we know your business, this page fills itself in — your public record, what homeowners say about you, and the parts only you can see.</p>' +
      '<p class="doorline"><a href="/workspace/onboarding">Set up your business</a></p></section>';
  }

  async function boot() {
    buildNav();
    if (!token()) { window.location.replace('/workspace/signin'); return; }

    const me = await api('/workspace/me');
    if (!me.ok) {
      if (me.status === 401) { try { localStorage.removeItem(SESSION_KEY); } catch (_) {} window.location.replace('/workspace/signin'); return; }
      document.getElementById('app').textContent = 'Something went wrong opening your Atlas. Refresh to try again.';
      return;
    }
    if (me.data.rotated_session_token) {
      try { localStorage.setItem(SESSION_KEY, me.data.rotated_session_token); } catch (_) {}
    }
    const workspace = me.data.workspace || {};

    const rep = await api('/workspace/report');
    if (rep.ok && rep.data.report) render(workspace, rep.data.report);
    else renderNoProfile(workspace);

    document.getElementById('signout').addEventListener('click', async function () {
      await api('/workspace/signout', { method: 'POST' });
      try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
      window.location.replace('/workspace/signin');
    });
  }

  // Exposed for headless verification against a fixture payload — renders the
  // same code path the live boot uses. Not referenced by the page itself.
  window.__atlasRender = render;

  document.addEventListener('DOMContentLoaded', boot);
})();
