// Vercel function: proxies Drew's at-close trigger (close.html) to the worker's
// /admin/client-signed — the single-touch provisioning trigger.
//
// This is a HEAVIER endpoint than /register-client: it mints a real GHL
// sub-account + Stripe customer. So it carries TWO gates the browser can't
// see past:
//   1. WORKER_SECRET — injected server-side here (never reaches the browser),
//      same as api/register-client.js.
//   2. CLOSE_FORM_KEY — an operator key Drew enters in close.html once. Without
//      it, anyone who could load close.html from an allowed origin could fire
//      provisioning. We check it here, server-side, before forwarding.
//
// Env vars required:
//   WORKER_SECRET    — must match the worker's WORKER_SECRET secret
//   CLOSE_FORM_KEY   — the operator key gating close.html (Drew-only)
//   WORKER_URL       — defaults to production worker URL (override for staging)

import { timingSafeEqual } from 'node:crypto';

// WARNING — preview deploys without an overriding WORKER_URL write to
// production (real GHL sub-account + Stripe). Set WORKER_URL on previews.
const DEFAULT_WORKER_URL = 'https://fourthwall-bot.4thwalldevelopment.workers.dev';

// Origin/Referer check — a low-friction CSRF guard, NOT the auth boundary
// (CLOSE_FORM_KEY + WORKER_SECRET are). Matches api/register-client.js.
const ALLOWED_ORIGIN_REGEX = /^https:\/\/(4thwall\.solutions|4thwall-site(-[a-z0-9-]+)?\.vercel\.app)$/;

function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return false;
  let host;
  try { host = new URL(origin).origin; } catch { return false; }
  return ALLOWED_ORIGIN_REGEX.test(host);
}

// Constant-time compare that never throws on length mismatch or non-strings.
function keyMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const WORKER_URL     = process.env.WORKER_URL || DEFAULT_WORKER_URL;
  const WORKER_SECRET  = process.env.WORKER_SECRET;
  const CLOSE_FORM_KEY = process.env.CLOSE_FORM_KEY;

  if (!WORKER_SECRET || !CLOSE_FORM_KEY) {
    console.error('Missing WORKER_SECRET or CLOSE_FORM_KEY env var on Vercel');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Operator gate — the close-form key Drew enters once in close.html.
  const provided = req.headers['x-close-key'] || '';
  if (!keyMatches(Array.isArray(provided) ? provided[0] : provided, CLOSE_FORM_KEY)) {
    return res.status(401).json({ error: 'Invalid operator key' });
  }

  const payload = JSON.stringify(req.body || {});
  if (payload.length > 32 * 1024) {
    return res.status(413).json({ error: 'Payload too large (max 32 KB)' });
  }

  // Forward the original caller's IP for the worker's provisioning rate-limit.
  const clientIp = req.headers['x-real-ip'] ||
                   (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                   req.socket?.remoteAddress || '';

  try {
    const workerRes = await fetch(`${WORKER_URL}/admin/client-signed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-4THWALL-Secret': WORKER_SECRET,
        ...(clientIp ? { 'X-Real-Client-IP': clientIp } : {}),
      },
      body: payload,
    });

    let data;
    try { data = await workerRes.json(); } catch { data = {}; }

    // Defense in depth: /admin/client-signed never returns client_secret, but
    // strip it (and any secret-ish key) if a future change ever adds one.
    if (data && typeof data === 'object') {
      delete data.client_secret;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(workerRes.status).json(data);
  } catch (err) {
    console.error('client-signed proxy error:', err?.message || err);
    return res.status(502).json({ error: 'Upstream error' });
  }
}
