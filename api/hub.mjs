// Vercel function: the /directory crawl hub — every index-ready contractor,
// grouped by trade then town.
//
// vercel.json rewrites  /directory  ->  /api/hub
//
// Purpose (Stage 3 B1): flatten crawl depth to all deep /c/ profiles. Reads the
// PUBLIC enrichment view (anon key, raw stars never leave the DB), index_status
// 'ready' ONLY — mirrors the sitemap so we never funnel crawl into noindex pages.
import { renderHubHTML } from './_render-directory.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
// Anon-scoped publishable key — RLS-protected, already public in the client.
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

const HUB_SELECT = 'place_id,business_name,trade,city,rank_score,slug';

export default async function handler(req, res) {
  let rows = [];
  let fetchOk = false;
  try {
    const r = await fetch(DB_BASE + '/rest/v1/profile_enrichment_public' +
      '?index_status=eq.ready&order=rank_score.desc.nullslast&limit=2000&select=' + HUB_SELECT, {
      headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) { rows = data; fetchOk = true; }
    }
  } catch (_) { /* fall through: render the compiling shell, don't cache it */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Good fetch: 1 day fresh at the edge, serve stale up to 7 days while
  // revalidating (the hub only changes on enrichment passes). Failed fetch: never
  // cache the empty shell — let the next request re-fetch.
  res.setHeader('Cache-Control', fetchOk
    ? 'public, s-maxage=86400, stale-while-revalidate=604800'
    : 'no-store');
  return res.status(200).send(renderHubHTML(rows));
}
