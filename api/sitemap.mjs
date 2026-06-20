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
import { SITE, TRADES } from './_render-directory.mjs';
import { INDEXING_ENABLED } from './_render-contractor.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
const DB_KEY  = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

// Core indexable pages (noindex surfaces like /vesta/search, /myhome, /opt-out,
// /signin are deliberately excluded).
const STATIC_PATHS = ['/', '/vesta', '/find', '/address', '/atlas', '/contact.html', '/privacy.html', '/terms.html'];

export function sitemapXml(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((e) => '  <url><loc>' + e.loc + '</loc>' +
      (e.lastmod ? '<lastmod>' + e.lastmod + '</lastmod>' : '') + '</url>').join('\n') +
    '\n</urlset>\n';
}

export default async function handler(req, res) {
  const entries = [];
  for (const p of STATIC_PATHS) entries.push({ loc: SITE + p });
  for (const t of TRADES) entries.push({ loc: SITE + '/fairfield-county/' + t });

  // /c/ deep profiles — only the index-ready set (index_status='ready', earned via
  // vesta_lint), only once indexing is on.
  let fetchOk = !INDEXING_ENABLED; // nothing to fetch while the gate is off
  if (INDEXING_ENABLED) {
    try {
      const r = await fetch(DB_BASE + '/rest/v1/profile_enrichment_public' +
        '?index_status=eq.ready&select=place_id,enriched_at&order=rank_score.desc.nullslast&limit=2000', {
        headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' }
      });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows)) {
          fetchOk = true;
          for (const row of rows) {
            if (!row.place_id) continue;
            entries.push({
              loc: SITE + '/c/' + encodeURIComponent(row.place_id),
              lastmod: row.enriched_at ? String(row.enriched_at).slice(0, 10) : null
            });
          }
        }
      }
    } catch (_) { /* fall through: serve the static surface, don't cache a partial */ }
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', fetchOk
    ? 'public, s-maxage=3600, stale-while-revalidate=86400'
    : 'no-store');
  return res.status(200).send(sitemapXml(entries));
}
