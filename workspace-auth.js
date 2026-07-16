(function () {
  'use strict';

  const API = 'https://vinytnzzgryodyrftabg.supabase.co/functions/v1/home';
  const SESSION_KEY = 'lens_workspace_session';

  function callbackUrl() {
    return location.origin + '/auth/workspace';
  }

  function setSession(token) {
    try { token ? localStorage.setItem(SESSION_KEY, token) : localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  function getSession() {
    try { return localStorage.getItem(SESSION_KEY) || null; } catch (_) { return null; }
  }

  async function api(path, options) {
    const opts = Object.assign({}, options || {});
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.auth && getSession()) headers.Authorization = 'Bearer ' + getSession();
    delete opts.auth;
    if (opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    try {
      const response = await fetch(API + path, Object.assign(opts, { headers: headers }));
      const data = await response.json().catch(function () { return null; });
      return { status: response.status, data: data || { ok: false, error: 'bad_response' } };
    } catch (_) {
      return { status: 0, data: { ok: false, error: 'network_error' } };
    }
  }

  async function initializeSignin() {
    const google = document.getElementById('google-signin');
    const form = document.getElementById('workspace-signin-form');
    if (!google || !form) return;

    const divider = document.getElementById('auth-divider');
    const intro = document.getElementById('auth-provider-intro');
    const providers = await api('/workspace/auth/providers');
    const googleAvailable = providers.status === 200 && providers.data.providers && providers.data.providers.google === true;
    if (googleAvailable) {
      google.href = API + '/workspace/auth/google?redirect_to=' + encodeURIComponent(callbackUrl());
      google.hidden = false;
      if (divider) divider.hidden = false;
      if (intro) intro.textContent = 'Use Google or a secure email link. No password to remember.';
    } else {
      google.removeAttribute('href');
      google.hidden = true;
      if (divider) divider.hidden = true;
      if (intro) intro.textContent = 'Use a secure email link. No password to remember.';
    }

    if (getSession()) {
      const existing = await api('/workspace/me', { auth: true });
      if (existing.data.ok) {
        location.replace('/workspace');
        return;
      }
      setSession(null);
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const status = document.getElementById('workspace-auth-status');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.className = 'auth-status';
      status.textContent = 'Sending your secure link…';
      const result = await api('/workspace/signin', {
        method: 'POST',
        body: { email: form.email.value, redirect_to: callbackUrl() }
      });
      if (result.data.ok) {
        form.querySelector('label').textContent = 'Check your email';
        form.email.hidden = true;
        button.hidden = true;
        status.textContent = 'We sent a secure sign-in link. Open it on this device; it expires in one hour.';
      } else {
        button.disabled = false;
        status.className = 'auth-status error';
        status.textContent = result.data.error === 'invalid_email' ? 'That email address does not look right.'
          : result.data.error === 'rate_limited' || result.data.error === 'mail_rate_limited' ? 'Too many attempts. Try again in a few minutes.'
          : 'We could not send the link. Try again in a moment.';
      }
    });
  }

  function callbackFail(message) {
    const title = document.getElementById('callback-title');
    const detail = document.getElementById('callback-detail');
    const action = document.getElementById('callback-action');
    if (title) title.textContent = 'That sign-in did not complete.';
    if (detail) detail.textContent = message || 'The credential expired or was already used. Start again for a fresh link.';
    if (action) action.innerHTML = '<a class="btn btn-dark" href="/workspace/signin">Return to sign in</a>';
  }

  async function establishWorkspace(body) {
    const title = document.getElementById('callback-title');
    const detail = document.getElementById('callback-detail');
    const action = document.getElementById('callback-action');
    if (title) title.textContent = 'Opening your workspace…';
    if (detail) detail.textContent = 'Verifying identity and workspace membership.';
    if (action) action.innerHTML = '';
    const result = await api('/workspace/auth/session', { method: 'POST', body: body });
    if (!result.data.ok || !result.data.session_token) {
      callbackFail(result.data.error === 'rate_limited' ? 'Too many attempts. Wait a moment and start again.' : null);
      return;
    }
    setSession(result.data.session_token);
    history.replaceState(null, '', '/auth/workspace');
    if (title) title.textContent = result.data.workspace_created ? 'Your workspace is ready.' : 'Welcome back.';
    if (detail) detail.textContent = 'Taking you to Lens…';
    setTimeout(function () { location.replace(result.data.onboarding_required ? '/workspace/onboarding' : '/workspace'); }, 500);
  }

  function initializeCallback() {
    if (!document.querySelector('[data-auth-callback]')) return;
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const tokenHash = params.get('token_hash');
    const accessToken = fragment.get('access_token');
    const errorDescription = fragment.get('error_description') || params.get('error_description');

    if (errorDescription) {
      callbackFail(errorDescription.replace(/\+/g, ' '));
      return;
    }
    if (tokenHash) {
      // Email scanners often open links. A human click prevents the scanner
      // from consuming the one-time credential before the user reaches it.
      const title = document.getElementById('callback-title');
      const detail = document.getElementById('callback-detail');
      const action = document.getElementById('callback-action');
      title.textContent = 'Your secure link arrived.';
      detail.textContent = 'One click verifies your identity and opens Lens.';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-dark';
      button.textContent = 'Open my workspace';
      button.addEventListener('click', function () { button.disabled = true; establishWorkspace({ token_hash: tokenHash }); });
      action.appendChild(button);
      return;
    }
    if (accessToken) {
      establishWorkspace({ access_token: accessToken });
      return;
    }
    if (params.get('code')) {
      callbackFail('This browser received a code flow without its verifier. Return to sign in and restart the secure flow on this device.');
      return;
    }
    callbackFail('No valid sign-in credential was returned. Start again for a fresh sign-in.');
  }

  document.addEventListener('DOMContentLoaded', function () {
    initializeSignin();
    initializeCallback();
  });
})();
