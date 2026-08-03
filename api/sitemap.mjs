// Vercel function: the Vesta sitemap, generated from live data.
//
// vercel.json rewrites  /sitemap.xml  ->  /api/sitemap
//
// Lists the crawlable surface: core pages + the 8 directory pages, plus every
// index-worthy /c/ deep profile (substantive synthesis only) ONCE indexing is
// enabled (INDEXING_ENABLED in _render-contractor.mjs — the single go-live
// switch). A newly-enriched profile joins the sitemap automatically; that's the
// pipeline. Until the flip, this emits exactly the static surface (no /c/), so
// cutting over from the old static sitemap.xml is a no-op for Google.
import { SITE, TRADES, profileUrl } from './_render-directory.mjs';
import { INDEXING_ENABLED } from './_render-contractor.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
const DB_KEY  = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

// Core indexable pages (noindex surfaces like /vesta/search, /myhome, /opt-out,
// /signin are deliberately excluded).
// /find and /address were listed here while both serve `robots: noindex` and
// canonicalise to /vesta/search (itself noindex) -- the sitemap said "index this"
// while the page said "don't", about the same URL. Contradictory signals spend
// crawl budget and teach a crawler to trust the sitemap less. They are app entry
// points, not content; the crawlable Vesta surface is /vesta, /directory, the 12
// hubs and the profiles.
const STATIC_PATHS = ['/', '/vesta', '/directory', '/fairfield-county-contractor-report', '/atlas', '/contact.html', '/privacy.html', '/terms.html'];

export function sitemapXml(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((e) => '  <url><loc>' + e.loc + '</loc>' +
      (e.lastmod ? '<lastmod>' + e.lastmod + '</lastmod>' : '') + '</url>').join('\n') +
    '\n</urlset>\n';
}

export default async function handler(req, res) {
  const entries = [];
  // Static and hub entries are pushed AFTER the profile fetch now, because the
  // hubs borrow their lastmod from the profiles they list (see below).
  const staticEntries = [];
  for (const p of STATIC_PATHS) staticEntries.push({ loc: SITE + p });

  // /c/ deep profiles — only the index-ready set (index_status='ready', earned via
  // vesta_lint), only once indexing is on.
  let fetchOk = !INDEXING_ENABLED; // nothing to fetch while the gate is off
  const tradeLastmod = Object.create(null);   // trade -> newest enriched_at of its listed firms
  if (INDEXING_ENABLED) {
    try {
      const r = await fetch(DB_BASE + '/rest/v1/profile_enrichment_public' +
        '?index_status=eq.ready&select=place_id,slug,trade,enriched_at&order=rank_score.desc.nullslast&limit=2000', {
        headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
      });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows)) {
          fetchOk = true;
          for (const row of rows) {
            if (!row.place_id) continue;
            const lastmod = row.enriched_at ? String(row.enriched_at).slice(0, 10) : null;
            entries.push({ loc: profileUrl(row), lastmod });
            // A hub's freshness IS the freshness of the firms it lists, so take the
            // newest. Stating it beats omitting it: these 8 pages carry the large
            // majority of our impressions, and a hub with no lastmod is a hub a
            // crawler has no reason to revisit. Derived from real enrichment dates,
            // never stamped with "today" -- an inflated date is a lie engines
            // eventually price in.
            if (row.trade && lastmod && (!tradeLastmod[row.trade] || lastmod > tradeLastmod[row.trade])) {
              tradeLastmod[row.trade] = lastmod;
            }
          }
        }
      }
    } catch (_) { /* fall through: serve the static surface, don't cache a partial */ }
  }

  // Newest profile anywhere = the corpus's freshness, which is what /directory and
  // the Vesta landing actually represent.
  const newest = Object.values(tradeLastmod).sort().pop() || null;
  for (const e of staticEntries) {
    if (newest && (e.loc === SITE + '/directory' || e.loc === SITE + '/vesta')) e.lastmod = newest;
    entries.push(e);
  }
  for (const t of TRADES) {
    entries.push({ loc: SITE + '/fairfield-county/' + t, lastmod: tradeLastmod[t] || null });
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', fetchOk
    ? 'public, s-maxage=3600, stale-while-revalidate=86400'
    : 'no-store');
  return res.status(200).send(sitemapXml(entries));
}
