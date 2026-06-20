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

    const m = location.pathname.match(/^\/c\/([A-Za-z0-9_-]{8,200})\/?$/);
    if (!m) return;
    const placeId = m[1];

    const account = await HOME.navAccount();

    // Live data from the worker (Places-backed). Never stored; absent on error.
    let data = {};
    try {
      const resp = await HOME.api('/c/' + encodeURIComponent(placeId));
      data = (resp && resp.data) || {};
    } catch (_) { /* graceful: the SSR content stands on its own */ }
    const p = data.place || {};
    let unlocked = data.unlocked || null;

    renderGoogle(p);
    renderContact();
    wireClaim();
    if (data.claimed) markClaimed();

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
