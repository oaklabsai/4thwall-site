(function () {
  'use strict';

  const API = 'https://vinytnzzgryodyrftabg.supabase.co/functions/v1/home';
  const SESSION_KEY = 'lens_workspace_session';
  const NOTICE_VERSION = 'connect-provider-data-notice-v1';
  const data = window.LENS_DEMO;
  let records = data ? data.records.map(function (record) { return Object.assign({}, record); }) : [];
  let homeownerAnswers = data ? data.homeownerAnswers.slice() : [];
  let activeAnswer = homeownerAnswers[0] ? homeownerAnswers[0].id : '';
  let accountWorkspace = null;
  let connectionState = null;
  let liveReceipt = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function icon(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + path + '</svg>';
  }

  function showToast(message) {
    const toast = document.getElementById('workspace-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function workspaceToken() {
    try { return localStorage.getItem(SESSION_KEY) || ''; } catch (_) { return ''; }
  }

  async function api(path, options) {
    const opts = Object.assign({}, options || {});
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    const token = workspaceToken();
    if (token) headers.Authorization = 'Bearer ' + token;
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

  function canManage() {
    const role = accountWorkspace && accountWorkspace.membership && accountWorkspace.membership.role;
    return role === 'owner' || role === 'admin';
  }

  function canReview() {
    const role = accountWorkspace && accountWorkspace.membership && accountWorkspace.membership.role;
    return canManage() || role === 'reviewer';
  }

  function humanDate(value, includeTime) {
    if (!value) return 'Not yet';
    try {
      return new Intl.DateTimeFormat('en-US', includeTime ? {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      } : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
    } catch (_) { return 'Unavailable'; }
  }

  function setPill(id, label, className) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = label;
    node.className = 'status-pill ' + className;
  }

  function navigate(view, updateHash) {
    const target = document.querySelector('[data-view-panel="' + view + '"]') ? view : 'overview';
    document.querySelectorAll('[data-view-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.viewPanel === target);
    });
    document.querySelectorAll('.workspace-nav-btn[data-view]').forEach(function (button) {
      const active = button.dataset.view === target;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    if (updateHash !== false) history.replaceState(null, '', target === 'overview' ? location.pathname + location.search : '#' + target);
    const main = document.querySelector('.workspace-main');
    if (main) main.scrollTop = 0;
  }

  function counts() {
    return records.reduce(function (result, record) {
      result[record.status] = (result[record.status] || 0) + 1;
      return result;
    }, { visible: 0, private: 0, questioned: 0, pending: 0 });
  }

  function syncCounts() {
    const value = counts();
    const held = value.private + value.questioned + value.pending;
    setText('included-count', value.visible);
    setText('held-count', held);
    setText('attention-count', held);
    setText('privacy-included-count', value.visible);
    setText('privacy-included-copy', value.visible === 1
      ? 'translated record currently feeds the private homeowner preview.'
      : 'translated records currently feed the private homeowner preview.');
    setText('privacy-private-count', value.private);
    setText('privacy-private-copy', value.private === 1
      ? 'record is stored for your workspace but excluded from the preview.'
      : 'records are stored for your workspace but excluded from the preview.');
    const questionedHeld = value.questioned + value.pending;
    setText('privacy-questioned-count', questionedHeld);
    setText('privacy-questioned-copy', questionedHeld === 1
      ? 'record is held while its source date or state is reviewed.'
      : 'records are held while their source dates or states are reviewed.');
    setText('translated-count', records.length);
    setText('record-count-badge', records.length);
    setText('attention-detail', value.private + ' private · ' + value.questioned + ' source-questioned · ' + value.pending + ' awaiting review');
  }

  function renderAccountReadiness() {
    if (!accountWorkspace) return;
    const connected = connectionState && connectionState.connected;
    const sync = connected && connectionState.sync || { status: 'not_started' };
    const value = counts();
    const reviewed = liveReceipt ? value.visible + value.private + value.questioned : 0;
    setText('readiness-title', connected ? 'Your private Jobber record is taking shape.' : 'Your workspace is ready for its first source.');
    setText('readiness-detail', connected
      ? sync.status === 'complete'
        ? reviewed + ' of ' + records.length + ' translated records have a decision. Nothing is public.'
        : 'Jobber is authorized and the first private translation is still processing.'
      : 'Connect a provider when you are ready. Account creation did not authorize Jobber or publish any evidence.');
    const synced = connected && sync.status === 'complete';
    const fraction = synced && records.length ? Math.round((reviewed / records.length) * 100) : connected ? 50 : 20;
    setText('readiness-percent', synced ? reviewed + '/' + records.length : connected ? 'Syncing' : 'Setup');
    const meterLabel = document.querySelector('#readiness-meter small');
    if (meterLabel) meterLabel.textContent = synced ? 'reviewed' : '';
    const meter = document.getElementById('readiness-meter');
    if (meter) meter.style.setProperty('--p', fraction);
  }

  function renderAccountActivity() {
    if (!accountWorkspace) return;
    const list = document.getElementById('workspace-activity');
    if (!list) return;
    const state = connectionState;
    if (!state || !state.connected) {
      list.innerHTML = '<li class="activity-item"><span class="activity-icon">' + icon('<path d="m5 12 4 4L19 6"/>') + '</span><span><strong>Workspace identity established</strong><p>No provider has been authorized and Atlas is not operating this workspace.</p></span><span class="activity-time">Private</span></li>';
      return;
    }
    const sync = state.sync || {};
    const title = sync.status === 'complete' ? 'Jobber sync completed' : sync.status === 'failed' ? 'Jobber sync needs attention' : 'Jobber sync in progress';
    const detail = Number(sync.source_records_retrieved || 0) + ' records read · ' + Number(sync.evidence_items_written || 0) + ' translated';
    list.innerHTML = '<li class="activity-item"><span class="activity-icon">' + icon('<path d="m5 12 4 4L19 6"/>') + '</span><span><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(detail) + '</p></span><span class="activity-time">' + escapeHtml(humanDate(sync.completed_at || sync.updated_at, true)) + '</span></li>' +
      '<li class="activity-item"><span class="activity-icon">' + icon('<path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10"/>') + '</span><span><strong>Private by default</strong><p>Provider history is not public and cannot affect Vesta ranking.</p></span><span class="activity-time">Controlled</span></li>';
  }

  function actionButton(record, action, label, path) {
    const disabled = record.status === action || (liveReceipt && !canReview());
    return '<button class="record-action" type="button" data-record="' + escapeHtml(record.id) + '" data-decision="' + action + '" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"' + (disabled ? ' disabled' : '') + '>' + icon(path) + '</button>';
  }

  async function saveDecision(record, decision) {
    const mapping = {
      visible: ['accepted', 'confirmed_accurate', 'Included in the private homeowner preview. Nothing here is public.'],
      private: ['kept_private', 'prefer_private', 'Record kept private.'],
      questioned: ['disputed', 'not_my_record', 'Source question recorded.']
    };
    const selected = mapping[decision];
    if (!selected) return;
    if (!liveReceipt) {
      record.status = decision;
      record.statusLabel = decision === 'visible' ? 'Included' : decision === 'private' ? 'Private' : 'Source question';
      renderRecords();
      syncCounts();
      showToast(selected[2]);
      return;
    }
    const result = await api('/workspace/decisions', {
      method: 'POST',
      body: { evidence_id: record.id, decision: selected[0], reason_code: selected[1] }
    });
    if (!result.ok) {
      showToast(result.data.error === 'forbidden' ? 'Your workspace role cannot change record decisions.' : 'That decision was not saved. Try again.');
      renderRecords();
      return;
    }
    showToast(selected[2]);
    await loadLiveReceipt(String((document.getElementById('project-type') || {}).value || 'roof_replacement'));
  }

  function renderRecords() {
    const body = document.getElementById('record-table-body');
    if (!body) return;
    const query = String((document.getElementById('record-search') || {}).value || '').trim().toLowerCase();
    const filter = String((document.getElementById('record-filter') || {}).value || 'all');
    const visible = records.filter(function (record) {
      const matchesFilter = filter === 'all' || record.status === filter;
      const haystack = [record.type, record.source, record.objectType, record.completed, record.statement].join(' ').toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
    if (!visible.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:2rem">No translated records match this view.</td></tr>';
      return;
    }
    body.innerHTML = visible.map(function (record) {
      return '<tr>' +
        '<td><div class="record-main"><strong>' + escapeHtml(record.type) + '</strong><span>' + escapeHtml(record.objectType) + ' · privacy-trimmed</span></div></td>' +
        '<td>' + escapeHtml(record.source) + '</td>' +
        '<td class="mono" style="font-size:.65rem">' + escapeHtml(record.completed) + '</td>' +
        '<td><span class="record-state ' + record.status + '">' + escapeHtml(record.statusLabel) + '</span></td>' +
        '<td><div class="record-actions">' +
          actionButton(record, 'visible', 'Include in private preview', '<path d="m4 12 5 5L20 6"/>') +
          actionButton(record, 'private', 'Keep private', '<path d="M4 4h16v16H4zM7 17 17 7"/>') +
          actionButton(record, 'questioned', 'Question source record', '<path d="M12 17h.01M9.1 9a3 3 0 1 1 4.8 2.4c-1.2.9-1.9 1.4-1.9 2.6"/><circle cx="12" cy="12" r="9"/>') +
        '</div></td></tr>';
    }).join('');
    body.querySelectorAll('[data-decision]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const record = records.find(function (item) { return item.id === button.dataset.record; });
        if (!record) return;
        body.querySelectorAll('button').forEach(function (item) { item.disabled = true; });
        await saveDecision(record, button.dataset.decision);
      });
    });
  }

  function sourcePills(sources) {
    return sources.map(function (source) {
      const className = source === 'Atlas front office' ? 'source-pill operated' : 'source-pill';
      return '<span class="' + className + '">' + escapeHtml(source) + '</span>';
    }).join('');
  }

  function answerForProject(answer) {
    if (liveReceipt) return answer;
    const project = String((document.getElementById('project-type') || {}).value || 'roof_replacement');
    if (answer.id !== 'experience' || project === 'roof_replacement') return answer;
    const label = project === 'roof_repair' ? 'roof repair' : 'emergency roof repair';
    return {
      id: answer.id,
      question: answer.question,
      shortQuestion: answer.shortQuestion,
      sources: ['Provider recorded'],
      answer: 'The accepted provider record does not contain enough classified ' + label + ' history for a project-specific statement.',
      limitation: 'Insufficient evidence stays visible as insufficient; Lens does not borrow proof from a different project category.'
    };
  }

  function renderWorkspaceAnswer() {
    const panel = document.getElementById('workspace-answer');
    if (!panel || !homeownerAnswers.length) return;
    const raw = homeownerAnswers.find(function (item) { return item.id === activeAnswer; }) || homeownerAnswers[0];
    const answer = answerForProject(raw);
    panel.innerHTML = '<div class="answer-sources">' + sourcePills(answer.sources) + '</div><h3>' + escapeHtml(answer.question) + '</h3><p class="answer">' + escapeHtml(answer.answer) + '</p><p class="limit"><strong>Limit:</strong> ' + escapeHtml(answer.limitation) + '</p>';
    const tabWrap = document.getElementById('workspace-answer-tabs');
    if (tabWrap) {
      tabWrap.innerHTML = homeownerAnswers.map(function (item, index) {
        return '<button class="btn ' + (item.id === activeAnswer ? 'btn-dark' : 'btn-ghost') + ' btn-sm" type="button" data-answer-tab="' + escapeHtml(item.id) + '" aria-label="Show ' + escapeHtml(item.shortQuestion || item.question) + '">' + (index + 1) + '</button>';
      }).join('');
      tabWrap.querySelectorAll('[data-answer-tab]').forEach(function (button) {
        button.addEventListener('click', function () { activeAnswer = button.dataset.answerTab; renderWorkspaceAnswer(); });
      });
    }
  }

  function mapReceiptRecord(item) {
    const states = {
      accepted: ['visible', 'Included'],
      kept_private: ['private', 'Private'],
      disputed: ['questioned', 'Source question'],
      pending: ['pending', 'Needs review']
    };
    const state = states[item.review_decision] || states.pending;
    return {
      id: item.id,
      type: String(item.service_category || 'uncategorized').replaceAll('_', ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }),
      source: 'Jobber',
      objectType: String(item.source_object_type || item.job_type || 'provider record').replaceAll('_', ' ').toLowerCase(),
      completed: item.completed_at ? humanDate(item.completed_at, false) : 'No completion date',
      statement: 'Provider-recorded ' + String(item.source_status || 'state').toLowerCase(),
      status: state[0],
      statusLabel: state[1]
    };
  }

  function liveNarrative(receipt) {
    const metrics = receipt.insights && receipt.insights.metrics || {};
    const accepted = Number(metrics.completed_items || 0);
    if (!accepted) return 'No provider-recorded item is currently accepted for this private preview. Review the translated record before Lens states a work-history pattern.';
    return 'The accepted Jobber record contains ' + accepted + ' completed item' + (accepted === 1 ? '' : 's') + '. Lens keeps the source and limitations attached instead of turning the history into a quality score.';
  }

  function applyLiveReceipt(receipt) {
    liveReceipt = receipt;
    records = (receipt.evidence || []).map(mapReceiptRecord);
    homeownerAnswers = ((receipt.insights && receipt.insights.risk_answers) || []).map(function (answer) {
      return {
        id: answer.id,
        question: answer.question,
        shortQuestion: answer.question,
        sources: [receipt.source || 'Jobber-recorded history'],
        answer: answer.answer,
        limitation: answer.limitation
      };
    });
    activeAnswer = homeownerAnswers[0] ? homeownerAnswers[0].id : '';
    const narrative = liveNarrative(receipt);
    setText('overview-narrative', narrative);
    setText('workspace-narrative', narrative);
    const sync = receipt.sync || {};
    const skippedCount = Number(sync.skipped || 0);
    setText('translation-detail', skippedCount + ' unsupported source record' + (skippedCount === 1 ? '' : 's') + ' skipped, never stored');
    const flag = document.getElementById('demo-flag');
    if (flag) flag.innerHTML = '<strong>Private beta workspace</strong><span>This Jobber record came through your authorized connection and remains non-publishable. Atlas figures remain simulated until 4THWALL operates this workspace.</span>';
    renderRecords();
    syncCounts();
    renderWorkspaceAnswer();
    renderAccountReadiness();
    renderAccountActivity();
  }

  async function loadLiveReceipt(target) {
    const result = await api('/workspace/receipt?target=' + encodeURIComponent(target || 'roof_replacement'));
    if (!result.ok) {
      if (result.status !== 404) showToast(result.data.error === 'connect_unavailable' ? 'Connect is temporarily unavailable. Your existing private record is unchanged.' : 'The private record is not ready yet.');
      return false;
    }
    applyLiveReceipt(result.data);
    return true;
  }

  function updateConnectionUI(state) {
    connectionState = state;
    const card = document.getElementById('jobber-connection-card');
    const action = document.getElementById('jobber-connect-action');
    const connected = state && state.connected;
    const sync = state && state.sync || { status: 'not_started' };
    const hasConnection = Boolean(state && state.connection_status);
    if (accountWorkspace) {
      const exportButtons = [document.getElementById('record-export-action'), document.getElementById('settings-export-action')];
      exportButtons.forEach(function (button) { if (button) button.disabled = !canManage() || !hasConnection; });
      const disconnectButton = document.getElementById('settings-disconnect-action');
      const eraseButton = document.getElementById('settings-erase-action');
      if (disconnectButton) disconnectButton.disabled = !canManage() || !connected;
      if (eraseButton) eraseButton.disabled = !canManage() || !hasConnection;
    }
    if (card) card.dataset.state = state && state.error ? 'error' : connected ? 'connected' : 'idle';
    if (!accountWorkspace) return;
    if (!connected) {
      setPill('jobber-status', state && state.error ? 'Unavailable' : 'Not connected', state && state.error ? 'status-preview' : 'status-private');
      setText('jobber-description', state && state.error ? 'The private connection service could not be reached. No provider authorization changed.' : 'Authorize Jobber when you are ready to create a private provider-recorded history.');
      setText('jobber-coverage', 'Not available');
      setText('jobber-translated', '0 records');
      setText('jobber-last-sync', 'Not yet');
      setPill('record-source-status', 'Sample only', 'status-preview');
      setText('evidence-source-count', '0');
      setText('evidence-source-detail', 'No real evidence source connected');
      setPill('evidence-status', 'Not connected', 'status-private');
      if (action) { action.textContent = 'Connect Jobber'; action.disabled = !canManage() || Boolean(state && state.error); }
      renderAccountReadiness();
      renderAccountActivity();
      return;
    }
    const syncLabel = sync.status === 'complete' ? 'Connected' : sync.status === 'failed' ? 'Needs attention' : 'Syncing';
    setPill('jobber-status', syncLabel, sync.status === 'failed' ? 'status-preview' : sync.status === 'complete' ? 'status-live' : 'status-beta');
    setText('jobber-description', 'A private, read-only Jobber connection is authorized for this workspace.');
    setText('jobber-coverage', sync.status === 'complete' ? 'Complete response' : sync.status === 'failed' ? 'Sync failed' : 'In progress');
    setText('jobber-translated', Number(sync.evidence_items_written || 0) + ' records');
    setText('jobber-last-sync', humanDate(sync.completed_at || sync.updated_at, true));
    setPill('record-source-status', sync.status === 'complete' ? 'Source current' : 'Sync ' + sync.status, sync.status === 'complete' ? 'status-live' : 'status-beta');
    setText('evidence-source-count', '1');
    setText('evidence-source-detail', 'Jobber history · Atlas not connected');
    setPill('evidence-status', 'Private', 'status-beta');
    if (action) { action.textContent = sync.status === 'failed' ? 'Retry sync' : 'Refresh record'; action.disabled = !canManage() || ['queued', 'running', 'paused'].includes(sync.status); }
    renderAccountReadiness();
    renderAccountActivity();
  }

  async function loadConnection() {
    const result = await api('/workspace/connections');
    if (!result.ok) {
      updateConnectionUI({ connected: false, error: result.data.error || 'unavailable' });
      return;
    }
    updateConnectionUI(result.data);
    if (result.data.connected) await loadLiveReceipt(String((document.getElementById('project-type') || {}).value || 'roof_replacement'));
  }

  async function consumeHandoff() {
    const fragment = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const handoff = fragment.get('connect_handoff');
    if (!handoff) return;
    history.replaceState(null, '', location.pathname + location.search);
    showToast('Finishing your private Jobber connection…');
    const result = await api('/workspace/connections/handoff', { method: 'POST', body: { handoff_token: handoff } });
    if (!result.ok) {
      if (result.data.error === 'connect_unavailable') {
        showToast('Connection confirmation is temporarily unavailable. Your Jobber authorization may still be safe.');
        return;
      }
      // OAuth returns can be replayed by navigation, restoration or link
      // handling after the one-use handoff has already succeeded. Reconcile
      // against the authenticated workspace before showing a false failure.
      const current = await api('/workspace/connections');
      if (current.ok && current.data.connected) {
        updateConnectionUI(current.data);
        showToast('Jobber is connected. This return was already completed.');
        return;
      }
      showToast('That connection return expired. Check connection status or start again.');
      return;
    }
    updateConnectionUI(result.data);
    showToast('Jobber connected. Your private record is syncing.');
  }

  async function hydrateWorkspaceAccount() {
    const token = workspaceToken();
    if (!token) return false;
    const result = await api('/workspace/me');
    if (!result.ok || !result.data.workspace) {
      try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
      return false;
    }
    accountWorkspace = result.data.workspace;
    if (result.data.rotated_session_token) {
      try { localStorage.setItem(SESSION_KEY, result.data.rotated_session_token); } catch (_) {}
    }
    const profile = accountWorkspace.profile || {};
    if (!profile.business_name) { location.replace('/workspace/onboarding'); return false; }
    setPill('workspace-mode', 'Workspace beta', 'status-beta');
    const flag = document.getElementById('demo-flag');
    if (flag) flag.innerHTML = '<strong>Private beta workspace</strong><span>Provider evidence becomes real only after consent. Atlas figures remain simulated until 4THWALL operates this workspace.</span>';
    document.querySelectorAll('.workspace-switcher strong').forEach(function (node) { node.textContent = profile.business_name; });
    document.querySelectorAll('.workspace-switcher small').forEach(function (node) { node.textContent = profile.service_area || 'Service area not set'; });
    document.querySelectorAll('.ws-avatar').forEach(function (node) {
      node.textContent = String(profile.business_name).split(/\s+/).slice(0, 2).map(function (word) { return word[0]; }).join('').toUpperCase();
    });
    setText('settings-business-profile', [profile.business_name, profile.trade, profile.service_area].filter(Boolean).join(' · '));
    setText('settings-membership', 'Signed in as ' + (accountWorkspace.membership && accountWorkspace.membership.role || 'member'));
    if (accountWorkspace.slug) setText('settings-workspace-ref', accountWorkspace.slug);
    setText('workspace-greeting', 'Good morning.');
    setText('preview-candidate-name', profile.business_name);
    setText('preview-candidate-profile', [profile.trade, profile.service_area].filter(Boolean).join(' · '));
    setText('preview-candidate-avatar', String(profile.business_name).split(/\s+/).slice(0, 2).map(function (word) { return word[0]; }).join('').toUpperCase());
    setPill('atlas-source-status', 'Sample · not connected', 'status-preview');
    const atlasNote = document.getElementById('atlas-sample-note');
    if (atlasNote) atlasNote.hidden = false;
    const boundary = document.getElementById('workspace-boundary');
    if (boundary) boundary.innerHTML = '<strong>Your workspace identity is live.</strong><br>Provider history remains private and non-publishable. Atlas figures on this beta surface remain simulated until Atlas actually operates this workspace.';
    const action = document.getElementById('workspace-auth-action');
    if (action) {
      action.textContent = 'Sign out';
      action.href = '#';
      action.addEventListener('click', async function (event) {
        event.preventDefault();
        try { await api('/workspace/signout', { method: 'POST' }); } catch (_) {}
        try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
        location.replace('/lens');
      });
    }
    await consumeHandoff();
    await loadConnection();
    return true;
  }

  function openJobberConsent() {
    if (!accountWorkspace) { location.href = '/workspace/signin'; return; }
    if (!canManage()) { showToast('Only a workspace owner or admin can connect a provider.'); return; }
    const dialog = document.getElementById('jobber-consent-dialog');
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
  }

  async function startJobber() {
    const status = document.getElementById('jobber-consent-status');
    const button = document.getElementById('jobber-consent-continue');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Creating a secure Jobber authorization…';
    const result = await api('/workspace/connections/jobber/start', {
      method: 'POST', body: { notice_accepted: true, notice_version: NOTICE_VERSION }
    });
    if (!result.ok || !result.data.authorization_url) {
      if (button) button.disabled = false;
      if (status) { status.className = 'auth-status error'; status.textContent = result.data.error === 'connect_unavailable' ? 'The connection service is temporarily unavailable. Nothing was authorized.' : 'We could not start the Jobber connection. Try again.'; }
      return;
    }
    location.assign(result.data.authorization_url);
  }

  async function requestSync() {
    const action = document.getElementById('jobber-connect-action');
    if (!connectionState || !connectionState.connected) { openJobberConsent(); return; }
    if (action) action.disabled = true;
    const result = await api('/workspace/connections/sync', { method: 'POST', body: {} });
    if (!result.ok) {
      showToast('The refresh could not be queued. Your existing record is unchanged.');
      if (action) action.disabled = false;
      return;
    }
    showToast(result.data.reused ? 'A private sync is already in progress.' : 'Private Jobber refresh queued.');
    setTimeout(loadConnection, 1800);
  }

  async function exportWorkspace() {
    if (!accountWorkspace) { showToast('Create a workspace before exporting data.'); return; }
    if (!canManage()) { showToast('Only a workspace owner or admin can export provider data.'); return; }
    const result = await api('/workspace/export');
    if (!result.ok) { showToast('No portable provider record is available yet.'); return; }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '4thwall-lens-jobber-export.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Portable Lens export prepared.');
  }

  async function disconnectWorkspace() {
    if (!connectionState || !connectionState.connected) { showToast('No active Jobber connection to disconnect.'); return; }
    if (!canManage()) { showToast('Only a workspace owner or admin can disconnect a provider.'); return; }
    if (!window.confirm('Disconnect Jobber? Future syncs will stop and private receipt access will be revoked.')) return;
    const result = await api('/workspace/disconnect', { method: 'POST', body: { confirm: true } });
    if (!result.ok) { showToast('Jobber was not disconnected. Try again or contact support.'); return; }
    liveReceipt = null;
    showToast('Jobber disconnected.');
    location.reload();
  }

  async function eraseWorkspaceEvidence() {
    if (!accountWorkspace || !canManage()) { showToast('Only a workspace owner or admin can erase provider evidence.'); return; }
    if (!connectionState || !connectionState.connection_status) { showToast('No provider evidence exists to erase.'); return; }
    const confirmation = window.prompt('This permanently erases imported provider evidence and decisions. Type ERASE to continue.');
    if (confirmation !== 'ERASE') return;
    const result = await api('/workspace/erase', { method: 'POST', body: { confirm: 'ERASE' } });
    if (!result.ok) { showToast('Evidence was not erased. Nothing changed.'); return; }
    showToast('Provider evidence erased.');
    location.reload();
  }

  function bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(function (button) { button.addEventListener('click', function () { navigate(button.dataset.view); }); });
    document.querySelectorAll('[data-go]').forEach(function (button) { button.addEventListener('click', function () { navigate(button.dataset.go); }); });
    document.querySelectorAll('[data-filter-go]').forEach(function (button) {
      button.addEventListener('click', function () {
        navigate('record');
        const select = document.getElementById('record-filter');
        if (select) select.value = button.dataset.filterGo;
        renderRecords();
      });
    });
  }

  function bindControls() {
    const connect = document.getElementById('jobber-connect-action');
    const accepted = document.getElementById('jobber-notice-accepted');
    const consent = document.getElementById('jobber-consent-continue');
    if (connect) connect.addEventListener('click', requestSync);
    if (accepted && consent) accepted.addEventListener('change', function () { consent.disabled = !accepted.checked; });
    if (consent) consent.addEventListener('click', startJobber);
    ['record-export-action', 'settings-export-action'].forEach(function (id) {
      const button = document.getElementById(id); if (button) button.addEventListener('click', exportWorkspace);
    });
    const disconnect = document.getElementById('settings-disconnect-action');
    const erase = document.getElementById('settings-erase-action');
    if (disconnect) disconnect.addEventListener('click', disconnectWorkspace);
    if (erase) erase.addEventListener('click', eraseWorkspaceEvidence);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!data) return;
    setText('overview-narrative', data.narrative);
    setText('workspace-narrative', data.narrative);
    bindNavigation();
    bindControls();
    renderRecords();
    syncCounts();
    renderWorkspaceAnswer();
    const search = document.getElementById('record-search');
    const filter = document.getElementById('record-filter');
    const project = document.getElementById('project-type');
    if (search) search.addEventListener('input', renderRecords);
    if (filter) filter.addEventListener('change', renderRecords);
    if (project) project.addEventListener('change', async function () {
      if (liveReceipt) await loadLiveReceipt(project.value);
      else { activeAnswer = 'experience'; renderWorkspaceAnswer(); }
    });
    document.querySelectorAll('.demo-action').forEach(function (button) {
      button.addEventListener('click', function () { showToast(button.dataset.demoMessage || 'This action is not available in the product preview.'); });
    });
    const initialHash = (location.hash || '').slice(1);
    navigate(initialHash.includes('=') ? 'overview' : initialHash || 'overview', false);
    hydrateWorkspaceAccount();
  });
})();
