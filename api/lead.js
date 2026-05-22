// Vercel function: proxies marketing leads from the public site to the worker.
//
// The worker route /marketing-lead is authenticated by WORKER_SECRET (server-
// side header). We keep that secret in Vercel's env vars so the browser never
// sees it. Forms on the site call this endpoint; this endpoint forwards to
// the worker which posts a rich brief to Slack #leads and logs to D1.
//
// Env vars required:
//   WORKER_SECRET  — must match the worker's WORKER_SECRET secret
//   WORKER_URL     — defaults to production worker URL (override for staging)

const DEFAULT_WORKER_URL = 'https://fourthwall-bot.4thwalldevelopment.workers.dev';

// Allow-list of origins permitted to call this proxy. Blocks curl/Postman/
// attacker bots from spending Anthropic credits via the marketing-lead chain.
// Vercel preview branches match the regex.
const ALLOWED_ORIGIN_REGEX = /^https:\/\/(4thwall\.solutions|4thwall-site(-[a-z0-9-]+)?\.vercel\.app)$/;

function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return false;
  // Referer is a full URL; extract scheme+host.
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

  // Reject oversized payloads early.
  const payload = JSON.stringify(req.body || {});
  if (payload.length > 32 * 1024) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  // Forward the original caller's IP so the worker's per-IP rate-limit operates
  // on real clients (not Vercel's edge IP). Worker reads X-Real-Client-IP first,
  // falls back to cf-connecting-ip. Vercel headers vary by deploy target;
  // x-real-ip is set by Vercel's edge, x-forwarded-for chains hops.
  const clientIp = req.headers['x-real-ip'] ||
                   (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                   req.socket?.remoteAddress || '';

  try {
    const workerRes = await fetch(`${WORKER_URL}/marketing-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-4THWALL-Secret': WORKER_SECRET,
        ...(clientIp ? { 'X-Real-Client-IP': clientIp } : {}),
      },
      body: payload,
    });

    const text = await workerRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(workerRes.status).send(text);
  } catch (err) {
    console.error('Lead proxy error:', err?.message || err);
    return res.status(502).json({ error: 'Upstream error' });
  }
}
