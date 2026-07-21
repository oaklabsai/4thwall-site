// Vercel function: Lens waitlist signup (2026-07-21).
// The workspace is closed while it's built out — /lens collects signups instead.
// POST { email, company? } → insert into lens_waitlist (anon key, insert-only RLS).
// Duplicate email → still returns ok:true (signup is idempotent from the user's view).
import { rateOk } from './_ratelimit.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
// Anon-scoped publishable key — RLS-protected, already public in the client.
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  if (!rateOk(req)) { res.status(429).json({ ok: false, error: 'Too many requests' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const email = String(body?.email || '').trim().toLowerCase();
  const company = String(body?.company || '').trim().slice(0, 120) || null;
  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    return;
  }

  try {
    const r = await fetch(`${DB_BASE}/rest/v1/lens_waitlist`, {
      method: 'POST',
      headers: {
        apikey: DB_KEY,
        Authorization: `Bearer ${DB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email, company, source: 'lens' }),
    });
    // 409 = unique-index hit = already on the list — that's a success to the signer-upper.
    if (r.ok || r.status === 409) { res.status(200).json({ ok: true }); return; }
    res.status(502).json({ ok: false, error: 'Could not save your spot. Try again in a minute.' });
  } catch {
    res.status(502).json({ ok: false, error: 'Could not save your spot. Try again in a minute.' });
  }
}
