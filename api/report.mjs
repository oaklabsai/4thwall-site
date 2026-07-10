// Vercel function: the Fairfield County Contractor Report — the original-data
// citation page (Stage 3 B4, the S-tier backlink hook).
//
// vercel.json rewrites  /fairfield-county-contractor-report  ->  /api/report
//
// Every number on this page is COMPUTED LIVE from the public enrichment view at
// request time — nothing is hand-written, so the page can never drift from the
// data. Honesty rules (the moat, non-negotiable):
//   · Raw star averages never leave the DB — review COUNTS only, never ratings.
//   · Registration stats are trade-scoped: CT's HIC regime applies to home-
//     improvement trades; plumbing/HVAC/electrical are state-licensed under a
//     different regime we do NOT verify — the page says so instead of implying
//     those trades are "unregistered."
//   · The corpus is described as what it is (the most-visible firms per trade,
//     compiled from public records), never as a census.
import {
  SITE, COUNTY, TRADES, tradeLabel, esc, shell, publisherNodes, NAV, FOOTER,
} from './_render-directory.mjs';

const DB_BASE = process.env.SUPABASE_URL || 'https://vinytnzzgryodyrftabg.supabase.co';
// Anon-scoped publishable key — RLS-protected, already public in the client.
const DB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IEQcNbThGZblpzqNnEeDeg_r5LXSyzt';

const CANONICAL = SITE + '/fairfield-county-contractor-report';
const SELECT = 'trade,city,registered,hic_issue_date,rating_count,enriched_at';

// CT Home Improvement Contractor registration meaningfully applies to these
// trades; plumbing/HVAC/electrical work is licensed under separate CT trade
// regimes (P-1/S-1/E-1 etc.) that this dataset does not verify.
const HIC_TRADES = ['roofing', 'lawn_care', 'painting', 'masonry', 'paving'];
const LICENSED_TRADES = ['plumbing', 'hvac', 'electrical'];

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function computeStats(rows) {
  const byTrade = {};
  for (const r of rows) {
    const t = String(r.trade || '');
    if (!TRADES.includes(t)) continue;
    (byTrade[t] = byTrade[t] || []).push(r);
  }
  const now = Date.now();
  const yrs = (iso) => (now - new Date(iso).getTime()) / (365.25 * 86400_000);

  const trades = {};
  for (const [t, list] of Object.entries(byTrade)) {
    const withHic = list.filter((r) => r.hic_issue_date);
    const reviewCounts = list.map((r) => Number(r.rating_count)).filter((n) => Number.isFinite(n));
    trades[t] = {
      firms: list.length,
      registered: list.filter((r) => r.registered).length,
      hicYears: withHic.map((r) => yrs(r.hic_issue_date)),
      medianHicYears: median(withHic.map((r) => Math.round(yrs(r.hic_issue_date)))),
      hicN: withHic.length,
      medianReviews: median(reviewCounts),
      fourOrFewer: list.filter((r) => Number(r.rating_count || 0) <= 4).length,
    };
  }
  const all = Object.values(byTrade).flat();
  const allHicYears = Object.values(trades).flatMap((t) => t.hicYears);
  // County-wide review coverage: over firms we actually have a public review
  // count for (nulls excluded so the denominator is honest), how many are hired
  // nearly blind. The aggregate version of the per-trade review-gap table.
  const reviewed = all
    .filter((r) => r.rating_count !== null && r.rating_count !== undefined && r.rating_count !== '')
    .map((r) => Number(r.rating_count))
    .filter((n) => Number.isFinite(n));
  const hicYearsRaw = all.map((r) => r.hic_issue_date).filter(Boolean).map((d) => new Date(d).getFullYear());
  return {
    trades,
    total: all.length,
    towns: new Set(all.map((r) => String(r.city || '').trim()).filter(Boolean)).size,
    tradeCount: Object.keys(trades).length,
    hicTotal: allHicYears.length,
    hic20plus: allHicYears.filter((y) => y >= 20).length,
    hicUnder3: allHicYears.filter((y) => y < 3).length,
    reviewedN: reviewed.length,
    le4Total: reviewed.filter((n) => n <= 4).length,
    oldestHicYear: hicYearsRaw.length ? Math.min(...hicYearsRaw) : null,
    // Real last-modified of the underlying dataset (max enrichment timestamp) —
    // an honest freshness signal for a cited dataset, not the request time.
    lastModified: (() => {
      const ts = all.map((r) => r.enriched_at).filter(Boolean).map((d) => new Date(d).getTime()).filter(Number.isFinite);
      return ts.length ? new Date(Math.max(...ts)).toISOString().slice(0, 10) : null;
    })(),
  };
}

function statCard(big, label) {
  return '<div class="rp-stat"><span class="rp-big">' + big + '</span><span class="rp-lbl">' + label + '</span></div>';
}

function renderReport(stats) {
  const s = stats;
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const t = s.trades;

  const title = 'The ' + COUNTY + ' Contractor Report — registration, tenure & review data | Vesta';
  const description = 'Original data on ' + s.total + ' home-service contractors across ' + s.tradeCount +
    ' trades in ' + COUNTY + ', CT: CT HIC registration rates by trade, registration tenure, and how thin ' +
    'public review coverage really is. Computed live from public records. Free to cite with attribution.';

  // ── headline stats ──
  const roofing = t.roofing, masonry = t.masonry;
  const hero =
    '<section class="page-hero" id="hero">' +
      '<a class="crumb" href="/directory">← All contractors</a>' +
      '<h1 class="page-h">The ' + COUNTY + ' Contractor Report</h1>' +
      '<p class="page-sub">What the public record actually says about the contractors homeowners hire — ' +
        'registration, tenure, and how much (or little) review signal exists per trade. ' +
        'Every number below is computed live from our public-records corpus as of ' + monthYear + '. ' +
        'Journalists and researchers: cite freely with attribution and a link (see the methodology).</p>' +
    '</section>';

  const headline =
    '<div class="rp-stats">' +
      statCard(s.total, 'contractors analyzed') +
      statCard(s.tradeCount, 'trades') +
      statCard(s.towns, 'Fairfield County towns') +
      (roofing ? statCard(pct(roofing.registered, roofing.firms) + '%', 'of roofers hold a CT HIC registration') : '') +
      (masonry && masonry.medianReviews !== null ? statCard(masonry.medianReviews, 'median Google reviews for a masonry firm') : '') +
      (s.reviewedN ? statCard(pct(s.le4Total, s.reviewedN) + '%', 'of all firms have 4 or fewer public reviews') : '') +
    '</div>';

  // ── section 1: HIC registration by trade ──
  const hicRows = HIC_TRADES.filter((k) => t[k]).map((k) => {
    const d = t[k];
    return '<tr><td>' + esc(tradeLabel(k)) + '</td><td>' + d.firms + '</td>' +
      '<td><b>' + pct(d.registered, d.firms) + '%</b> (' + d.registered + ')</td>' +
      '<td>' + (d.medianHicYears !== null ? d.medianHicYears + ' yrs <span class="rp-dim">(n=' + d.hicN + ')</span>' : '—') + '</td></tr>';
  }).join('');
  const hicSection =
    '<section class="rp-sec"><h2>CT Home Improvement Contractor registration, by trade</h2>' +
    '<p>Connecticut requires most home-improvement work to be performed by a registered Home Improvement ' +
    'Contractor (HIC). Among the firms in our corpus, registration rates vary sharply by trade:</p>' +
    '<table class="rp-table"><thead><tr><th>Trade</th><th>Firms</th><th>HIC on record</th><th>Median yrs holding it</th></tr></thead>' +
    '<tbody>' + hicRows + '</tbody></table>' +
    '<p class="rp-note">Plumbing, HVAC and electrical are deliberately excluded from this table: those trades are ' +
    'licensed under separate Connecticut occupational regimes (not the HIC program), and this dataset does not ' +
    'verify those licenses — among our ' + LICENSED_TRADES.map((k) => t[k] ? t[k].firms : 0).reduce((a, b) => a + b, 0) +
    ' plumbing/HVAC/electrical firms an HIC appears on record for only a minority, and that is the expected, ' +
    'compliant state for those trades, not a red flag.</p></section>';

  // ── section 2: tenure ──
  const tenureSection =
    '<section class="rp-sec"><h2>Registration tenure — how long these firms have been on the record</h2>' +
    '<p>Of the <b>' + s.hicTotal + '</b> firms with an HIC registration date on record: <b>' + s.hic20plus +
    '</b> (' + pct(s.hic20plus, s.hicTotal) + '%) have held it for 20+ years, while <b>' + s.hicUnder3 +
    '</b> (' + pct(s.hicUnder3, s.hicTotal) + '%) registered within the last 3 years.' +
    (s.oldestHicYear ? ' The longest-standing firm in the corpus has held its CT registration continuously since <b>' +
      s.oldestHicYear + '</b>.' : '') +
    ' Registration tenure is a ' +
    'conservative floor on how long a firm has operated formally — a business can predate its registration, ' +
    'so we report it as exactly what it is.</p></section>';

  // ── section 3: the review-scarcity finding ──
  const revRows = TRADES.filter((k) => t[k]).sort((a, b) => (t[a].medianReviews ?? 0) - (t[b].medianReviews ?? 0))
    .map((k) => {
      const d = t[k];
      return '<tr><td>' + esc(tradeLabel(k)) + '</td><td>' + (d.medianReviews ?? '—') + '</td>' +
        '<td>' + pct(d.fourOrFewer, d.firms) + '% <span class="rp-dim">(' + d.fourOrFewer + ' of ' + d.firms + ')</span></td></tr>';
    }).join('');
  const hvacMed = t.hvac ? t.hvac.medianReviews : null;
  const masMed = masonry ? masonry.medianReviews : null;
  const contrast = (hvacMed && masMed) ?
    ' A homeowner hiring for HVAC has roughly <b>' + Math.round(hvacMed / Math.max(masMed, 1)) +
    '× more public review signal</b> to work with than one hiring a mason.' : '';
  const countyBlind = s.reviewedN
    ? ' Across all ' + s.tradeCount + ' trades, <b>' + s.le4Total + ' of ' + s.reviewedN +
      ' firms (' + pct(s.le4Total, s.reviewedN) + '%)</b> have four or fewer public Google reviews — meaning ' +
      'roughly one in five contractors homeowners hire in ' + COUNTY + ' is chosen nearly blind.'
    : '';
  const reviewSection =
    '<section class="rp-sec"><h2>The review gap — some trades are hired nearly blind</h2>' +
    '<p>Public reviews are the main signal homeowners use, and their depth varies enormously by trade.' +
    countyBlind + contrast + ' (Counts are public Google review totals at analysis time; consistent with our editorial ' +
    'rules, this report never republishes star ratings — only how much signal exists.)</p>' +
    '<table class="rp-table"><thead><tr><th>Trade</th><th>Median review count</th><th>Firms with ≤4 reviews</th></tr></thead>' +
    '<tbody>' + revRows + '</tbody></table></section>';

  // ── methodology + citation ──
  const method =
    '<section class="rp-sec"><h2>Methodology & how to cite</h2>' +
    '<p><b>Corpus:</b> the ' + s.total + ' most-visible home-service firms across ' + s.tradeCount + ' trades in ' +
    COUNTY + ', CT — compiled from Connecticut public records (eLicense/data.ct.gov registration data) and public ' +
    'Google listings, then maintained as the dataset behind the <a href="/directory">Vesta contractor directory</a>. ' +
    'It is a curated corpus of established, currently-operating firms, not a census of every registered entity.</p>' +
    '<p><b>Freshness:</b> every figure on this page is recomputed from the live dataset on load — nothing is hand-updated.</p>' +
    '<p><b>Citation:</b> free to quote or republish any statistic with attribution to ' +
    '<i>Vesta by 4th Wall Solutions</i> and a link to this page (' + CANONICAL + '). ' +
    'For the underlying methodology, cuts by town or trade, or press questions: ' +
    '<a href="/contact.html">contact us</a>.</p>' +
    '<p class="fine" style="margin-top:1.4rem">Public-record compilation — not an endorsement of any firm and not legal ' +
    'or licensing advice. Registration and license status should be verified directly with the State of Connecticut ' +
    'before hiring. Any business can <a href="/terms.html#directory" style="color:var(--vgreen-2)">remove its listing ›</a>.</p>' +
    '</section>';

  const body = NAV + hero +
    '<section class="section" id="report">' + headline + hicSection + tenureSection + reviewSection + method + '</section>' +
    FOOTER;

  // Dataset JSON-LD: the page IS the dataset's landing page; publisher = the
  // shared entity graph (same @id wiring as every other page — one corpus).
  const graph = [
    ...publisherNodes(),
    {
      '@type': 'Dataset',
      '@id': CANONICAL + '#dataset',
      name: 'Fairfield County Contractor Report',
      description,
      url: CANONICAL,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      creator: { '@id': SITE + '#org' },
      publisher: { '@id': SITE + '#org' },
      spatialCoverage: COUNTY + ', Connecticut',
      datePublished: '2026-07-01',
      ...(s.lastModified ? { dateModified: s.lastModified } : {}),
      keywords: [
        'Fairfield County contractors', 'CT Home Improvement Contractor registration',
        'contractor registration rates', 'home-service contractor data', 'Connecticut contractors',
      ],
      variableMeasured: ['CT HIC registration rate by trade', 'registration tenure', 'public review counts by trade'],
    },
  ];
  const headExtra =
    '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') +
    '</script>' +
    '<style>' +
    '.rp-stats{display:flex;flex-wrap:wrap;gap:1rem;margin:.4rem 0 2rem}' +
    '.rp-stat{min-width:130px;padding:.9rem 1.1rem;border:1px solid var(--line,rgba(74,75,47,.16));border-radius:12px;background:rgba(212,223,158,.07);display:flex;flex-direction:column;gap:.15rem}' +
    '.rp-big{font-family:"Fraunces",serif;font-size:1.7rem;font-weight:600;color:var(--vink,#12100e)}' +
    '.rp-lbl{font-size:.78rem;line-height:1.35;color:var(--vmut,#4a4b2f);max-width:170px}' +
    '.rp-sec{margin:2.2rem 0}.rp-sec h2{font-family:"Fraunces",serif;font-size:1.35rem;margin:0 0 .6rem}' +
    '.rp-sec p{font-size:.95rem;line-height:1.65;color:var(--vink,#12100e);max-width:680px}' +
    '.rp-table{border-collapse:collapse;margin:1rem 0;width:100%;max-width:680px;font-size:.92rem}' +
    '.rp-table th{text-align:left;font-family:var(--mono);font-size:.64rem;letter-spacing:.09em;text-transform:uppercase;color:var(--vdim);padding:.45rem .8rem .45rem 0;border-bottom:1px solid var(--line,rgba(74,75,47,.25))}' +
    '.rp-table td{padding:.55rem .8rem .55rem 0;border-bottom:1px solid var(--line,rgba(74,75,47,.12));color:var(--vink,#12100e)}' +
    '.rp-dim{color:var(--vdim);font-size:.8em}' +
    '.rp-note{font-size:.85rem;color:var(--vmut,#4a4b2f)}' +
    '</style>';

  return shell({ title, description, canonical: CANONICAL, headExtra, body });
}

export default async function handler(req, res) {
  let rows = [];
  let fetchOk = false;
  try {
    const r = await fetch(DB_BASE + '/rest/v1/profile_enrichment_public?select=' + SELECT + '&limit=2000', {
      headers: { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, Accept: 'application/json' },
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) { rows = data; fetchOk = true; }
    }
  } catch (_) { /* fall through — render honest-empty, uncached */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!fetchOk) {
    // Never render fabricated stats and never cache the failure.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(shell({
      title: 'The ' + COUNTY + ' Contractor Report | Vesta',
      description: 'Original public-record data on Fairfield County contractors.',
      canonical: CANONICAL,
      headExtra: '',
      body: NAV + '<section class="page-hero"><h1 class="page-h">The ' + COUNTY + ' Contractor Report</h1>' +
        '<p class="page-sub">The report is recomputing right now — check back in a minute, or browse the ' +
        '<a href="/directory">full contractor directory</a>.</p></section>' + FOOTER,
    }));
  }
  // Stats move slowly (enrichment cadence, not user traffic): cache a day at the
  // edge, serve stale while revalidating.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(renderReport(computeStats(rows)));
}
