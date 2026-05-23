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

// Origin/Referer check — a low-friction CSRF guard, NOT an authentication
// boundary (see api/lead.js for the full rationale). WORKER_SECRET is the
// real auth; this just filters casual bots from the registration endpoint.
const ALLOWED_ORIGIN_REGEX = /^https:\/\/(4thwall\.solutions|4thwall-site(-[a-z0-9-]+)?\.vercel\.app)$/;

function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return false;
  let host;
  try { host = new URL(origin).origin; } catch { return false; }
  return ALLOWED_ORIGIN_REGEX.test(host);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const WORKER_URL    = process.env.WORKER_URL || DEFAULT_WORKER_URL;
  const WORKER_SECRET = process.env.WORKER_SECRET;

  if (!WORKER_SECRET) {
    console.error('Missing WORKER_SECRET env var on Vercel');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // 32 KB outer body cap. Inner config payload is independently capped at
  // 16 KB by the worker's validateConfig (MAX_CONFIG_BYTES). The 32 KB
  // outer cap leaves room for token + envelope keys without touching config.
  const payload = JSON.stringify(req.body || {});
  if (payload.length > 32 * 1024) {
    return res.status(413).json({ error: 'Payload too large (max 32 KB outer body; inner config max 16 KB)' });
  }

  // Forward the original caller's IP for the worker rate-limit.
  const clientIp = req.headers['x-real-ip'] ||
                   (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                   req.socket?.remoteAddress || '';

  try {
    const workerRes = await fetch(`${WORKER_URL}/register-client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-4THWALL-Secret': WORKER_SECRET,
        ...(clientIp ? { 'X-Real-Client-IP': clientIp } : {}),
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
