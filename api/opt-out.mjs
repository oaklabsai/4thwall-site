// Vercel function: captures Vesta directory removal/correction requests.
//
// Path: POST /api/opt-out  (called by /opt-out.html)
//
// Records the request in Supabase (removal_requests — anon INSERT under RLS, the
// SAME publishable key the site already uses; no new secret) and best-effort
// emails Drew so he's notified someone reached out. It NEVER sets the delist
// flag: Drew verifies ownership, then delists via pe-update (which sets
// profile_enrichment.removal_requested_at, and the public view suppresses it).
//
// Env:
//   SUPABASE_URL / SUPABASE_ANON_KEY  — defaults to the live project (public)
//   WORKER_SECRET                     — proxies the email notify to the worker's
//                                       Resend sender (already set for api/lead.js)
//   WORKER_URL                        — defaults to the production worker

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
const DB_KEY  = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';
// Email notify rides the worker's existing Resend sender — no Resend key in Vercel.
const DEFAULT_WORKER_URL = 'https://fourthwall-bot.4thwalldevelopment.workers.dev';
const WORKER_URL    = process.env.WORKER_URL || DEFAULT_WORKER_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

// Origin/Referer CSRF guard (same posture as api/lead.js) — not an auth boundary.
const ALLOWED_ORIGIN_REGEX = /^https:\/\/(4thwall\.solutions|4thwall-site(-[a-z0-9-]+)?\.vercel\.app)$/;
function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return false;
  let host;
  try { host = new URL(origin).origin; } catch { return false; }
  return ALLOWED_ORIGIN_REGEX.test(host);
}

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'forbidden' });

  const b = req.body || {};
  const place_id = clip(b.place_id, 200).replace(/[^A-Za-z0-9_-]/g, '');
  const business_name = clip(b.business_name, 200).trim();
  const request_type = b.request_type === 'correct' ? 'correct' : 'remove';
  const contact_email = clip(b.contact_email, 200).trim();
  const note = clip(b.note, 2000).trim();

  if (!business_name || !contact_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact_email)) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  // 1) Record in Supabase — the system of record.
  let stored = false;
  try {
    const r = await fetch(DB_BASE + '/rest/v1/removal_requests', {
      method: 'POST',
      headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ place_id: place_id || null, business_name, request_type, contact_email, note: note || null, source: 'opt-out-form' })
    });
    stored = r.ok;
    if (!r.ok) console.error('opt-out insert failed', r.status, await r.text().catch(() => ''));
  } catch (e) { console.error('opt-out insert error', e?.message || e); }

  // 2) Email notify via the worker's existing Resend sender — no key lives here.
  //    Best-effort: the Supabase row above is the durable record.
  if (WORKER_SECRET) {
    try {
      await fetch(WORKER_URL + '/vesta/opt-out-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-4THWALL-Secret': WORKER_SECRET },
        body: JSON.stringify({ place_id: place_id || '', business_name, request_type, contact_email, note })
      });
    } catch (e) { console.error('opt-out notify error', e?.message || e); }
  }

  // The Supabase row is the durable record. The email is a best-effort ping on
  // top; only fail the request if the row itself didn't land.
  if (!stored) return res.status(502).json({ error: 'not_recorded' });
  return res.status(200).json({ ok: true });
}
