// /profile.js — client enhancer for the SSR'd /c/:placeId deep profile.
//
// The page content is already server-rendered (api/_render-contractor.mjs) from
// the PUBLIC view. This script only ADDS the two things that must NOT live in
// the crawlable HTML:
//   1. the live Google reference block (rating/category/Maps — pulled live,
//      never stored; carries the "Powered by Google" attribution), and
//   2. the gated contact details (PII behind a free account).
// It also wires the claim form and the contact-unlock button. It never rebuilds
// the server-rendered content — pure progressive enhancement.
(function () {
  document.addEventListener('DOMContentLoaded', async function () {
    if (!window.HOME) return;
    const esc = HOME.esc;

    // The SAME page is served at two addresses: /c/<placeId> (the machine form)
    // and /vesta/<slug> (the canonical, human form -- what claim emails send and
    // what the app writes into the address bar). This used to match only /c/, so
    // on the slug URL the script returned here and the page silently lost its
    // photos, its live Google block, its contact details AND its wired claim
    // form -- on the exact URL we hand to contractors we are trying to sign.
    // The place id is not in the slug path, so read it from the DOM: the renderer
    // publishes it on <body data-place-id>.
    const fromPath = location.pathname.match(/^\/c\/([A-Za-z0-9_-]{8,200})\/?$/);
    const placeId = fromPath ? fromPath[1] : (document.body.dataset.placeId || '');
    if (!placeId) return;

    countStat();   // before the awaits — the stat is SSR'd and shouldn't wait on the API

    const account = await HOME.navAccount();

    // Live data from the worker (Places-backed). Never stored; absent on error.
    let data = {};
    try {
      const resp = await HOME.api('/c/' + encodeURIComponent(placeId));
      data = (resp && resp.data) || {};
    } catch (_) { /* graceful: the SSR content stands on its own */ }
    const p = data.place || {};
    let unlocked = data.unlocked || null;

    renderPhotos(p.photos);
    renderGoogle(p);
    renderContact();
    wireClaim();
    if (data.claimed) markClaimed();

    // 0. Work photos — the gallery directly under the name. Live Google photos
    // (show-don't-store: each <img> hits the /photo proxy, which resolves the ref
    // to a fresh Google CDN URL at display; bytes never touch us). Desktop = a
    // 1-big-+-4 grid; mobile = a scroll-snap swipe. Absent/empty → collapses.
    function photoUrl(ref, w) {
      return HOME.apiUrl('/photo?ref=' + encodeURIComponent(ref) + '&w=' + w);
    }
    function renderPhotos(photos) {
      const mount = document.getElementById('cp-photos');
      if (!mount) return;
      const list = (Array.isArray(photos) ? photos : []).filter((x) => x && x.ref);
      if (!list.length) { mount.innerHTML = ''; return; }
      const MAX = 5;
      const shown = list.slice(0, MAX);
      const extra = list.length - shown.length;
      const tiles = shown.map((p, i) => {
        const more = (extra > 0 && i === shown.length - 1)
          ? '<span class="cp-ph-more">+' + extra + ' more</span>' : '';
        // Per-tile sizing: the hero tile renders large, the secondary tiles
        // small — request only what each displays (retina-padded) instead of a
        // flat 800px, cutting bytes + first-paint on both viewports.
        const w = i === 0 ? 900 : 520;
        return '<button class="cp-ph" type="button" data-i="' + i + '" ' +
          'aria-label="View work photo ' + (i + 1) + ' of ' + list.length + '">' +
          // Eager: the gallery is max-5 tiles, all above the fold on desktop —
          // loading="lazy" never fires for in-viewport injected imgs here and
          // left the secondary tiles blank. Eager guarantees the full grid.
          '<img src="' + esc(photoUrl(p.ref, w)) + '" ' +
            'loading="eager" decoding="async" ' +
            'alt="Work photo' + (p.attribution ? ' by ' + esc(p.attribution) : '') + '" ' +
            'onload="this.parentElement.classList.add(\'cp-ph--loaded\')" ' +
            'onerror="this.closest(\'.cp-ph\').remove()">' + more + '</button>';
      }).join('');
      mount.innerHTML =
        '<div class="cp-ph-track">' + tiles + '</div>' +
        '<p class="cp-ph-src"><span class="cp-ph-count">' + list.length + ' photo' +
          (list.length > 1 ? 's' : '') + '</span> · ' +
          '<img src="/powered-by-google.png" alt="from Google" height="12" ' +
            'style="vertical-align:middle;opacity:.85" ' +
            'onerror="this.replaceWith(document.createTextNode(\'from Google\'))"></p>';
      const track = mount.querySelector('.cp-ph-track');
      if (track) track.addEventListener('click', (e) => {
        const btn = e.target.closest('.cp-ph');
        if (btn) openLightbox(list, Number(btn.getAttribute('data-i')) || 0);
      });
    }
    function openLightbox(list, start) {
      let idx = start;
      const ov = document.createElement('div');
      ov.className = 'cp-lb';
      ov.innerHTML =
        '<button class="cp-lb-x" type="button" aria-label="Close">✕</button>' +
        '<button class="cp-lb-nav cp-lb-prev" type="button" aria-label="Previous photo">‹</button>' +
        '<figure class="cp-lb-fig"><img alt=""><figcaption></figcaption></figure>' +
        '<button class="cp-lb-nav cp-lb-next" type="button" aria-label="Next photo">›</button>';
      document.body.appendChild(ov);
      const img = ov.querySelector('img');
      const cap = ov.querySelector('figcaption');
      const show = () => {
        const p = list[idx];
        img.src = photoUrl(p.ref, 1600);
        cap.textContent = 'Photo via Google' + (p.attribution ? ' · ' + p.attribution : '') +
          '  (' + (idx + 1) + '/' + list.length + ')';
      };
      const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
      const go = (d) => { idx = (idx + d + list.length) % list.length; show(); };
      ov.querySelector('.cp-lb-x').onclick = close;
      ov.querySelector('.cp-lb-prev').onclick = () => go(-1);
      ov.querySelector('.cp-lb-next').onclick = () => go(1);
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
      function onKey(e) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'ArrowRight') go(1);
      }
      document.addEventListener('keydown', onKey);
      show();
    }

    // 1. Google — a one-line reference footnote + required attribution. ------
    function renderGoogle(pl) {
      const mount = document.getElementById('cp-google');
      if (!mount) return;
      if (pl.rating == null || !pl.rating_count) {
        mount.innerHTML = pl.maps_uri
          ? '<p class="fine"><a href="' + esc(pl.maps_uri) + '" target="_blank" rel="noopener nofollow" style="color:var(--vgreen-2)">See this business on Google Maps ↗</a></p>'
          : '';
        return;
      }
      mount.innerHTML = '<div class="vpub">' +
        '<span class="gsrc">For reference · Google</span> ' +
        '<img src="/powered-by-google.png" alt="Powered by Google" height="14" ' +
          'style="vertical-align:middle;opacity:.9" onerror="this.remove()">' +
        '<br><b>' + esc(pl.rating) + '★</b> across ' + Number(pl.rating_count).toLocaleString('en-US') + ' Google reviews' +
        (pl.maps_uri ? ' · <a href="' + esc(pl.maps_uri) + '" target="_blank" rel="noopener nofollow" style="color:var(--vgreen-2)">on Maps ↗</a>' : '') +
        '<br><span style="font-size:.72rem;color:var(--vdim)">Ratings, reviews, and category are from Google, pulled live and unaltered — ' +
        'a marketing signal, not a Vesta rating. Vesta’s read above is our own analysis.</span></div>';
    }

    // 2. Contact — gated (sign-in → unlock → rows). PII, never server-rendered.
    function contactRows(u) {
      const rows = [];
      if (u.phone) rows.push('<div class="contactrow"><b>Phone</b><a href="tel:' + esc(String(u.phone).replace(/[^\d+]/g, '')) + '">' + esc(u.phone) + '</a></div>');
      if (u.website) rows.push('<div class="contactrow"><b>Website</b><a href="' + esc(u.website) + '" rel="nofollow noopener" target="_blank">' + esc(String(u.website).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) + '</a></div>');
      for (const k in (u.socials || {})) {
        rows.push('<div class="contactrow"><b>' + esc(HOME.tradeLabel(k)) + '</b><a href="' + esc(u.socials[k]) + '" rel="nofollow noopener" target="_blank">' + esc(String(u.socials[k]).replace(/^https?:\/\/(www\.)?/, '')) + '</a></div>');
      }
      return rows.length ? rows.join('') : '<p class="note">No public contact details surfaced for this pro — they may be phone-unlisted. Try the request flow instead.</p>';
    }

    function renderContact() {
      const mount = document.getElementById('cp-contact');
      if (!mount) return;
      // Contact is public — no sign-in gate (the Google Maps link already exposes it).
      // Show whatever public details surfaced; if none, point them at the request flow.
      const u = unlocked || {};
      const hasAny = u.phone || u.website || (u.socials && Object.keys(u.socials).length);
      mount.innerHTML = '<h2 class="section-h">Contact</h2><div class="card-block">' +
        (hasAny
          ? contactRows(u)
          : '<p class="note">No public phone or website surfaced for this pro yet — use “Request through Vesta” above and we’ll carry your message straight to them.</p>') +
        '</div>';
    }

    // 2.5 Review-count roll-up — the "N public reviews" stat counts up when it
    // scrolls into view. Pure flourish on an SSR'd number: crawlers and
    // reduced-motion users see the final value untouched.
    function countStat() {
      const el = document.querySelector('.hw-count strong');
      if (!el || !('IntersectionObserver' in window)) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const n = parseInt(String(el.textContent).replace(/[^0-9]/g, ''), 10);
      if (!n || n < 10) return;   // tiny counts don't earn an animation
      const fmt = (v) => v.toLocaleString('en-US');
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now(), DUR = 900;
        (function tick(now) {
          const p = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - p, 3);
          el.textContent = fmt(Math.round(e * n));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      }, { threshold: 0.6 });
      io.observe(el);
    }

    // 3. Claim form (server-rendered markup; wired here). ---------------------
    function wireClaim() {
      const form = document.getElementById('claim-form');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const st = document.getElementById('claim-status');
        const btn = form.querySelector('button');
        btn.disabled = true; st.className = 'form-status'; st.textContent = '…';
        const { data: r } = await HOME.api('/c/' + encodeURIComponent(placeId) + '/claim', {
          method: 'POST',
          body: { name: form.name.value, phone: form.phone.value, email: form.email.value, zip: data.zip || '' }
        });
        if (r && r.ok) {
          form.outerHTML = '<p class="note">✓ Thanks, ' + esc(r.first_name) + ' — we have your claim on ' + esc(r.business) + '. We’ll reach out to verify it’s you, then the profile is yours.</p>';
        } else {
          btn.disabled = false;
          st.className = 'form-status is-error';
          st.textContent = r && r.error === 'missing_fields' ? 'Name + valid phone needed.' : r && r.error === 'rate_limited' ? 'Too many attempts — try later.' : 'Couldn’t send — try again.';
        }
      });
    }

    function markClaimed() {
      const form = document.getElementById('claim-form');
      if (form) form.outerHTML = '<p class="am-lede2">✓ Claimed by the business — thank you.</p>';
    }
  });
})();
