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

  // Reject oversized payloads early.
  const payload = JSON.stringify(req.body || {});
  if (payload.length > 32 * 1024) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  try {
    const workerRes = await fetch(`${WORKER_URL}/marketing-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-4THWALL-Secret': WORKER_SECRET,
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
