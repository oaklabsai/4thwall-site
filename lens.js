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

  document.addEventListener('DOMContentLoaded', function () {
    renderAnswer('experience');
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
