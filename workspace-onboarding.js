(function () {
  'use strict';
  const API = 'https://vinytnzzgryodyrftabg.supabase.co/functions/v1/home';
  const SESSION_KEY = 'lens_workspace_session';
  function token() { try { return localStorage.getItem(SESSION_KEY) || ''; } catch (_) { return ''; } }
  async function api(path, options) {
    const opts = Object.assign({}, options || {});
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token() };
    if (opts.body) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
    try { const response = await fetch(API + path, Object.assign(opts, { headers: headers })); return { status: response.status, data: await response.json() }; }
    catch (_) { return { status: 0, data: { ok: false, error: 'network_error' } }; }
  }
  document.addEventListener('DOMContentLoaded', async function () {
    if (!token()) { location.replace('/workspace/signin'); return; }
    const account = await api('/workspace/me');
    if (!account.data.ok) { try { localStorage.removeItem(SESSION_KEY); } catch (_) {} location.replace('/workspace/signin'); return; }
    const profile = account.data.workspace && account.data.workspace.profile;
    if (profile) {
      if (profile.business_name) document.getElementById('business-name').value = profile.business_name;
      if (profile.trade) document.getElementById('trade').value = profile.trade;
      if (profile.service_area) document.getElementById('service-area').value = profile.service_area;
      if (profile.website) document.getElementById('website').value = profile.website;
    }
    const form = document.getElementById('workspace-onboarding-form');
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const button = form.querySelector('button'); const status = document.getElementById('onboarding-status');
      button.disabled = true; status.className = 'auth-status'; status.textContent = 'Creating your workspace…';
      const result = await api('/workspace/profile', { method: 'POST', body: { business_name: form.business_name.value, trade: form.trade.value, service_area: form.service_area.value, website: form.website.value } });
      if (result.data.ok) { status.textContent = 'Workspace ready. Opening your Atlas…'; setTimeout(function () { location.replace('/workspace'); }, 450); }
      else { button.disabled = false; status.className = 'auth-status error'; status.textContent = result.data.error === 'invalid_website' ? 'Use a complete website address beginning with https://.' : 'We could not save the profile. Check the fields and try again.'; }
    });
  });
})();
