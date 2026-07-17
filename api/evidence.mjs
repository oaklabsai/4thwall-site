// Vercel function: the public read-only evidence endpoint (trust protocol, TP-2.2).
//
// vercel.json rewrites  /evidence/:placeId  ->  /api/evidence?placeId=:placeId
// (the friendly path matters: robots.txt disallows /api/, and this endpoint exists
// precisely to be fetched and cited by machines.)
//
// Serves the PUBLIC-SYNTHESIS evidence blocks for one contractor, derived from the
// same profile_enrichment_public row the /c/ page renders (api/_blocks.mjs is the
// shared source — the page and this endpoint cannot drift). Only index-ready profiles
// serve: the citable corpus is exactly the QC-gated corpus (vesta_lint 'ready'), the
// same gate the crawlable pages use. Everything else is a 404 — a profile Vesta
// hasn't fully vetted is not citable evidence.
import { profileQuery, isIndexable } from './_render-contractor.mjs';
import { tradeLabel, SITE } from './_render-directory.mjs';
import { evidenceDoc } from './_blocks.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
// Anon-scoped publishable key — RLS-protected, already public in the client (home.js).
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

const VALID_PLACE_ID = /^[A-Za-z0-9_-]{8,200}$/;
const FRESH = 'public, s-maxage=86400, stale-while-revalidate=604800';

export default async function handler(req, res) {
  const placeId = String((req.query && req.query.placeId) || '').trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');   // read-only public data; CORS-open so any agent can compose from it

  if (!VALID_PLACE_ID.test(placeId)) {
    res.setHeader('Cache-Control', FRESH);
    return res.status(404).send(JSON.stringify({ error: 'not_found' }));
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
  } catch (_) { /* upstream hiccup — handled below */ }

  // Upstream failure is a 503, never a cached 404 (a real profile must not get
  // poisoned out of the corpus by a transient DB error).
  if (!fetchOk) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(JSON.stringify({ error: 'unavailable' }));
  }
  if (!enr || !isIndexable(enr)) {
    res.setHeader('Cache-Control', FRESH);
    return res.status(404).send(JSON.stringify({ error: 'not_found' }));
  }

  res.setHeader('Cache-Control', FRESH);
  return res.status(200).send(JSON.stringify(evidenceDoc(enr, tradeLabel(enr.trade), SITE), null, 1));
}
