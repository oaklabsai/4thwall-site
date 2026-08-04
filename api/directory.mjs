// Vercel function: server-renders the Fairfield County directory pages.
//
// vercel.json rewrites  /fairfield-county/:trade  ->  /api/directory?trade=:trade
//
// Why this exists: directory.html rendered the contractor list from a BROWSER
// fetch, so Bing + AI answer-engine crawlers (which don't run JS) saw an empty
// "Loading…" shell. This renders the full HTML + JSON-LD server-side, then caches
// it at Vercel's edge. Data is the PUBLIC enrichment view (anon key, raw stars
// never leave the DB) — no secrets involved.
import {
  renderDirectoryHTML, renderIndexHTML, renderTownHTML,
  TRADES, directoryQuery, townQuery, townBySlug, isRanked, TOWN_MIN_RANKED,
} from './_render-directory.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
// Anon-scoped publishable key — RLS-protected, already public in the client (home.js).
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

export default async function handler(req, res) {
  const trade = String((req.query && req.query.trade) || '').toLowerCase();

  // Unknown/missing trade -> the pick-a-trade hub (still a real, crawlable page).
  if (!TRADES.includes(trade)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(renderIndexHTML());
  }

  // Town branch: /fairfield-county/:trade/:town. Renders only above the gate
  // (>= TOWN_MIN_RANKED vouched firms) — everything below it 302s to the county
  // trade page, so a thin or unknown-town URL never becomes a crawlable page.
  const townSlug = String((req.query && req.query.town) || '').toLowerCase();
  if (townSlug) {
    const town = townBySlug(townSlug);
    if (!town) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.redirect(302, '/fairfield-county/' + trade);
    }
    let tRows = null;
    try {
      const r = await fetch(DB_BASE + '/rest/v1' + townQuery(trade, town), {
        headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
      });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) tRows = data;
      }
    } catch (_) { /* treat as a failed fetch below */ }
    if (!tRows) {
      // Fetch failed: don't 302 (the town may be fine) and don't cache — send the
      // reader to the county page content-wise via a temporary redirect.
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, '/fairfield-county/' + trade);
    }
    if (tRows.filter(isRanked).length < TOWN_MIN_RANKED) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400');
      return res.redirect(302, '/fairfield-county/' + trade);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(renderTownHTML(trade, town, tRows));
  }

  let rows = [];
  let fetchOk = false;
  try {
    const r = await fetch(DB_BASE + '/rest/v1' + directoryQuery(trade), {
      headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) { rows = data; fetchOk = true; }
    }
  } catch (_) { /* fall through: render the shell with the "compiling" note */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // On a good fetch: 1 day fresh at the edge, serve stale up to 7 days while
  // revalidating (resilient to a later Supabase hiccup; the directory only changes
  // on enrichment passes). On a FAILED fetch: never cache the empty "compiling"
  // shell — let the next request re-fetch, and the edge keep serving the last good copy.
  res.setHeader('Cache-Control', fetchOk
    ? 'public, s-maxage=86400, stale-while-revalidate=604800'
    : 'no-store');
  return res.status(200).send(renderDirectoryHTML(trade, rows));
}
