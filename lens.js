(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function sourceClass(label) {
    return label === 'Atlas front office' ? 'source-pill operated' : 'source-pill';
  }

  function renderAnswer(id) {
    const data = window.LENS_DEMO;
    const panel = document.getElementById('public-answer');
    if (!data || !panel) return;
    const answer = data.homeownerAnswers.find(function (item) { return item.id === id; }) || data.homeownerAnswers[0];
    panel.innerHTML =
      '<div class="answer-sources">' + answer.sources.map(function (label) {
        return '<span class="' + sourceClass(label) + '">' + escapeHtml(label) + '</span>';
      }).join('') + '</div>' +
      '<h3>' + escapeHtml(answer.question) + '</h3>' +
      '<p class="answer">' + escapeHtml(answer.answer) + '</p>' +
      '<p class="limit"><strong>What this does not prove:</strong> ' + escapeHtml(answer.limitation) + '</p>';
  }

  function wireWaitlist() {
    const form = document.getElementById('waitlist-form');
    const status = document.getElementById('wl-status');
    if (!form || !status) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = (document.getElementById('wl-email').value || '').trim();
      const company = (document.getElementById('wl-company').value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = 'Enter a valid email address.';
        status.classList.add('error');
        return;
      }
      const btn = form.querySelector('.wl-submit');
      btn.disabled = true;
      status.classList.remove('error');
      status.textContent = 'Saving your spot…';
      // Direct Supabase REST insert — anon key is public by design; the
      // insert-only RLS policy on lens_waitlist is the guard (no read path).
      // 201 = saved, 409 = already on the list (also a success to the signer-upper).
      var DB = 'https://vinytnzzgryodyrftabg.supabase.co';
      var KEY = 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';
      fetch(DB + '/rest/v1/lens_waitlist', {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: 'Bearer ' + KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ email: email.toLowerCase(), company: company.slice(0, 120) || null, source: 'lens' }),
      }).then(function (r) {
          if (r.ok || r.status === 409) {
            form.querySelectorAll('.wl-field,.wl-submit').forEach(function (el) { el.hidden = true; });
            status.textContent = "You're on the list. We'll email you when your workspace is ready.";
          } else {
            btn.disabled = false;
            status.classList.add('error');
            status.textContent = 'Could not save your spot. Try again in a minute.';
          }
        })
        .catch(function () {
          btn.disabled = false;
          status.classList.add('error');
          status.textContent = 'Could not save your spot. Try again in a minute.';
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderAnswer('experience');
    wireWaitlist();
    document.querySelectorAll('.question-tab').forEach(function (button) {
      button.addEventListener('click', function () {
        document.querySelectorAll('.question-tab').forEach(function (item) {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderAnswer(button.dataset.answer);
      });
    });
  });
})();
