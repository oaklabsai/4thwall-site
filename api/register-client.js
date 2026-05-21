// Vercel function: proxies onboarding-form submissions to the worker.
//
// The worker's /register-client is now WORKER_SECRET-gated (Phase 2). The
// browser cannot hold that secret, so we proxy through this Vercel function
// which injects the secret server-side.
//
// The worker returns a one-time client_secret on first registration. We
// forward the response verbatim so onboard.html can surface it to the
// operator.
//
// Env vars required:
//   WORKER_SECRET  — must match the worker's WORKER_SECRET secret
//   WORKER_URL     — defaults to production worker URL (override for staging)

const DEFAULT_WORKER_URL = 'https://fourthwall-bot.4thwalldevelopment.workers.dev';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const WORKER_URL    = process.env.WORKER_URL || DEFAULT_WORKER_URL;
  const WORKER_SECRET = process.env.WORKER_SECRET;

  if (!WORKER_SECRET) {
    console.error('Missing WORKER_SECRET env var on Vercel');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const payload = JSON.stringify(req.body || {});
  if (payload.length > 32 * 1024) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  try {
    const workerRes = await fetch(`${WORKER_URL}/register-client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-4THWALL-Secret': WORKER_SECRET,
      },
      body: payload,
    });

    // Strip client_secret from the response before returning to the browser.
    // The worker always returns it on first registration, and the system
    // Slack channel also receives it (that's Drew's authoritative copy).
    // The client filling the form must NOT see the secret.
    let data;
    try {
      data = await workerRes.json();
    } catch {
      data = {};
    }
    if (data && typeof data === 'object') {
      delete data.client_secret;
      delete data.client_secret_notice;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error('register-client proxy error:', err?.message || err);
    return res.status(502).json({ error: 'Upstream error' });
  }
}
