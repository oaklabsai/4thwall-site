// Vercel function: server-renders the /c/:placeId deep-profile pages.
//
// vercel.json rewrites  /c/:placeId  ->  /api/contractor?placeId=:placeId
//
// Why this exists: /c/ served the Vesta SPA shell, so Bing + AI answer-engine
// crawlers (which don't run JS) saw an empty "Loading…" shell. This renders the
// full honest profile + JSON-LD server-side, then caches it at Vercel's edge.
// Data is the PUBLIC enrichment view (publishable key, raw stars never leave the
// DB) — no secrets involved. The live Google block + gated contact are layered
// in CLIENT-side by /profile.js, so they never enter the crawlable HTML.
import { renderContractorHTML, renderNotFoundHTML, profileQuery, siblingsQuery } from './_render-contractor.mjs';
import { SYNTHETIC_SIGNALS } from './_blocks-operated.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
// Anon-scoped publishable key — RLS-protected, already public in the client (home.js).
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

const VALID_PLACE_ID = /^[A-Za-z0-9_-]{8,200}$/;
const FRESH = 'public, s-maxage=86400, stale-while-revalidate=604800';

export default async function handler(req, res) {
  const placeId = String((req.query && req.query.placeId) || '').trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Malformed id -> a genuine 404 (not a profile URL). Safe to cache.
  if (!VALID_PLACE_ID.test(placeId)) {
    res.setHeader('Cache-Control', FRESH);
    return res.status(404).send(renderNotFoundHTML());
  }

  let enr = null;
  let fetchOk = false;
  try {
    const r = await fetch(DB_BASE + '/rest/v1' + profileQuery(placeId), {
      headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) { enr = data[0] || null; fetchOk = true; }
    }
  } catch (_) { /* fall through: handled as an upstream hiccup below */ }

  // Upstream hiccup (fetch failed / non-200 / non-array): 503 + no-store so a
  // crawler RETRIES later and never reads a transient error as "gone". The edge
  // keeps serving the last good cached copy in the meantime.
  if (!fetchOk) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(renderNotFoundHTML());
  }

  // Clean fetch, no row: the profile doesn't exist OR was delisted (the view
  // suppresses removal_requested_at rows). A real 404 — correct to cache.
  if (!enr) {
    res.setHeader('Cache-Control', FRESH);
    return res.status(404).send(renderNotFoundHTML());
  }

  // Lateral "Compare top [trade]" siblings — best-effort, never fatal. If this
  // fails or the trade is unknown, the related block just renders nothing.
  let siblings = [];
  if (enr.trade) {
    try {
      const sr = await fetch(DB_BASE + '/rest/v1' + siblingsQuery(enr.trade, placeId), {
        headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
      });
      if (sr.ok) {
        const sd = await sr.json();
        if (Array.isArray(sd)) siblings = sd;
      }
    } catch (_) { /* non-fatal: render the profile without the compare block */ }
  }

  // Fusion synthetic preview (TP-6.1): ?fusion=preview renders the operated-record
  // template on SYNTHETIC data with loud not-this-business labeling. Unlinked,
  // never cached, never indexed — the public page is untouched (its cache key has
  // no query string). The LIVE render stays off until FUSION_LIVE + real signals (W1).
  if (String((req.query && req.query.fusion) || '') === 'preview') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(renderContractorHTML(enr, siblings, {
      fusionSignals: SYNTHETIC_SIGNALS, fusionPreview: true
    }));
  }

  res.setHeader('Cache-Control', FRESH);
  return res.status(200).send(renderContractorHTML(enr, siblings));
}
