// Shared, pure render module for the Fairfield County directory pages.
// SERVER-SIDE rendering: emits the full HTML (hero, contractor cards, synthesis,
// trade strip, JSON-LD) so Bing + AI answer-engine crawlers see the content
// WITHOUT executing JS. The client `directory.html` rendered everything from a
// browser fetch, leaving non-JS crawlers an empty "Loading…" shell — this fixes
// that (the highest-leverage GEO/AEO move per task #27).
//
// Pure module (no Vercel/req/res) so it is Node-testable in isolation against the
// live public view. `api/directory.js` fetches the rows and calls renderDirectoryHTML.

export const SITE = 'https://4thwall.solutions';
export const COUNTY = 'Fairfield County';

// Vesta's canonical trade order — MUST mirror home.js HOME.TRADES.
export const TRADES = ['roofing', 'hvac', 'plumbing', 'electrical', 'paving', 'lawn_care', 'painting', 'masonry'];

// === Publisher identity (entity authority) ==================================
// ONE Organization for the whole property, referenced by a shared @id as
// publisher / isPartOf on EVERY page (directory + /c/ + homepage). This collapses
// N orphan pages into one identifiable, citable corpus — the precondition for
// E-E-A-T and AI-engine citation. (seo/playbook.md DO #6.)
//
// sameAs stays EMPTY until the real external footprint exists (a Google Business
// Profile for "4th Wall Solutions" + a LinkedIn company page). When those land,
// add their URLs to PUBLISHER_SAMEAS below and every surface inherits the
// corroboration — schema *claims* the entity, the footprint is what makes engines
// *trust* it. We never point sameAs at a record we can't prove: an unverified
// link is a claim, not a vouch. (homepage index.html mirrors these values by hand
// — keep the two in sync.)
export const PUBLISHER_SAMEAS = [
  // Google Business Profile (verified entity, created 2026-06-20). Share-link
  // form; upgrade to the canonical /maps/place URL once the listing is publicly
  // searchable in Maps. LinkedIn company page to be appended (D2).
  'https://share.google/s9kflTZ1ZogZUeCE1'
];

export const ORG_ID = SITE + '#org';
export const WEBSITE_ID = SITE + '#website';

export const ORG = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: '4th Wall Solutions',
  alternateName: '4THWALL',
  url: SITE,
  logo: SITE + '/logo.png',
  email: 'andrew@4thwall.solutions',
  telephone: '+1-203-670-9477',
  address: { '@type': 'PostalAddress', addressLocality: 'Stamford', addressRegion: 'CT', addressCountry: 'US' },
  areaServed: COUNTY + ', CT',
  description: '4th Wall Solutions builds AI back-office infrastructure for trades and service businesses. ' +
    'It operates Vesta, a public-record contractor recommendation service for ' + COUNTY + ', CT, and Atlas, ' +
    'a managed AI back office for contractors.',
  brand: [
    { '@type': 'Brand', name: 'Vesta', url: SITE + '/vesta',
      description: 'A public-record recommendation service that ranks ' + COUNTY + ' contractors by homeowner consensus and verified credentials — no ads, no pay-to-play.' },
    { '@type': 'Brand', name: 'Atlas', url: SITE + '/atlas',
      description: 'A managed AI back office that answers every call and text, books the job, and earns the review for trades contractors.' }
  ],
  ...(PUBLISHER_SAMEAS.length ? { sameAs: PUBLISHER_SAMEAS } : {})
};

export const WEBSITE = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: SITE,
  name: '4th Wall Solutions',
  publisher: { '@id': ORG_ID }
};

// The two publisher nodes, ready to splice into any page @graph.
export const publisherNodes = () => [ORG, WEBSITE];

// The exact directory read (mirrors directory.html): established-first, raw stars
// never leave the DB (rank_score is the volume-weighted homeowner-consensus score).
export const DIRECTORY_SELECT =
  'place_id,name:business_name,city,registered,hic_issue_date,trade_license,certifications,synthesis';
export const directoryQuery = (trade) =>
  '/profile_enrichment_public?trade=eq.' + encodeURIComponent(trade) +
  '&order=rank_score.desc.nullslast&limit=50&select=' + DIRECTORY_SELECT;

// Trade icons — mirror of directory.html / vesta.html. Never invent a parallel set.
const ICON = {
  all:        '<path d="M3 12h18M3 6h18M3 18h18"/>',
  roofing:    '<path d="M2.5 11.5 12 3.5l9.5 8"/><path d="M5.5 9.4V20h13V9.4"/><path d="M15.5 6.6V4.5h2.5v4.1"/>',
  paving:     '<path d="M7.5 4 4.5 20"/><path d="M16.5 4l3 16"/><path d="M12 5.5v2.6"/><path d="M12 11.2v2.6"/><path d="M12 16.9v2.6"/>',
  hvac:       '<circle cx="12" cy="13" r="7.5"/><path d="M12 13l3.2-3.2"/><path d="M12 5.5V4"/><path d="M4.5 13H3"/><path d="M21 13h-1.5"/>',
  plumbing:   '<path d="M12 3.5s6 6.4 6 10.2a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z"/>',
  electrical: '<path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2Z"/>',
  lawn_care:  '<path d="M12 20.5V13"/><path d="M12 14.5C12 10.5 9 8.5 5 8.5c0 4 3 6 7 6Z"/><path d="M12 12.5c0-4 3-6 7-6 0 4-3 6-7 6Z"/>',
  painting:   '<rect x="3.5" y="4" width="11" height="6" rx="1.5"/><path d="M14.5 7h3.5a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5h-6a1.2 1.2 0 0 0-1.2 1.2V14"/><rect x="9.3" y="14" width="3.6" height="6" rx="1"/>',
  masonry:    '<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M14.5 5v4.7M6.2 9.7v4.6M11.8 9.7v4.6M17.3 9.7v4.6M9 14.3V19M14.5 14.3V19"/>'
};

export function tradeLabel(t) {
  if (t === 'hvac') return 'HVAC';
  const s = String(t || '').replace(/_/g, ' ').trim();
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : 'General';
}
const tLower = (t) => (t === 'hvac' ? 'HVAC' : tradeLabel(t).toLowerCase());

// HTML escaping — identical to home.js HOME.esc.
export function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// --- pieces -----------------------------------------------------------------

function stripHtml(active) {
  return '<nav class="va-strip" aria-label="Trades in Fairfield County">' + TRADES.map((t) =>
    '<a class="va-tile' + (t === active ? ' on' : '') + '" href="/fairfield-county/' + t + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[t] || ICON.all) + '</svg>' +
      '<span class="tn">' + esc(tradeLabel(t)) + '</span>' +
      '<span class="tc' + (t === active ? ' has' : '') + '">' + (t === active ? 'Showing' : 'View') + '</span>' +
    '</a>').join('') + '</nav>';
}

function card(p, trade) {
  const href = '/c/' + encodeURIComponent(p.place_id);
  const chips = [];
  if (p.registered) {
    const yr = p.hic_issue_date ? +String(p.hic_issue_date).slice(0, 4) : 0;
    chips.push('<span class="badge">Registered CT contractor' + (yr && yr !== 1999 ? ' · since ' + yr : '') + ' ✓</span>');
  }
  if (Array.isArray(p.trade_license) && p.trade_license.length) chips.push('<span class="badge">Licensed ' + esc(tLower(trade)) + ' ✓</span>');
  if (Array.isArray(p.certifications)) for (const c of p.certifications) { if (c && c.issuer && c.level) chips.push('<span class="badge">' + esc(c.issuer + ' ' + c.level) + ' ✓</span>'); }
  const chipsHtml = chips.length ? '<div class="badges">' + chips.join('') + '</div>' : '';
  const syn = p.synthesis
    ? '<p class="card-syn"><span class="syn-lbl">What homeowners say</span>' + esc(p.synthesis) + '</p>'
    : '';
  return '<div class="card lift">' +
    '<a class="cardlink" href="' + href + '"><h3>' + esc(p.name) + '</h3></a>' +
    '<div class="sub">' + esc(p.city || COUNTY) + '</div>' +
    chipsHtml + syn +
    '<div class="spacer"></div>' +
    '<div><a class="pill pill-ghost pill-sm" href="' + href + '">View profile</a></div>' +
  '</div>';
}

function disclosure() {
  return '<p class="fine" style="margin-top:2rem;max-width:640px">Public-record compilation — not an endorsement. ' +
    'Compiled by Vesta from public records and publicly posted reviews; the “What homeowners say” summaries are ' +
    'written by Vesta, not the businesses. Any business can ' +
    '<a href="/terms.html#directory" style="color:var(--vgreen-2)">remove its listing or see how this works ›</a> at any time.</p>';
}

// --- JSON-LD (rich results + AI citation) -----------------------------------
// Honest fields only: name, city/region, area served, our synthesis as description,
// the /c/ URL. NO aggregateRating — Vesta never publishes raw stars.

// Trade → most-specific schema.org LocalBusiness subtype. Google: "use the most
// specific type possible." Multi-typed with the HomeAndConstructionBusiness parent
// so naive (string-match) crawlers still classify it. Trades with no ACCURATE
// subtype stay the honest parent — we don't relabel paving/lawn/masonry as
// GeneralContractor just to be more specific (that would be a misrepresentation,
// and Vesta never states what it can't prove). All subtypes verified live on
// schema.org as direct children of HomeAndConstructionBusiness.
export const BIZ_TYPE = {
  roofing:    ['RoofingContractor', 'HomeAndConstructionBusiness'],
  hvac:       ['HVACBusiness', 'HomeAndConstructionBusiness'],
  plumbing:   ['Plumber', 'HomeAndConstructionBusiness'],
  electrical: ['Electrician', 'HomeAndConstructionBusiness'],
  painting:   ['HousePainter', 'HomeAndConstructionBusiness']
};
const bizType = (trade) => BIZ_TYPE[trade] || 'HomeAndConstructionBusiness';

function jsonLd(trade, label, rows, canonical) {
  const items = rows.map((p, i) => {
    const url = SITE + '/c/' + encodeURIComponent(p.place_id);
    const biz = {
      '@type': bizType(trade),
      '@id': url,
      name: p.name,
      url,
      areaServed: COUNTY + ', CT',
      knowsAbout: label,
      // Canonical Google Maps listing for this place_id — entity disambiguation
      // (helps engines tie our entity to its authoritative Google record).
      sameAs: ['https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(p.place_id)]
    };
    if (p.city) biz.address = { '@type': 'PostalAddress', addressLocality: p.city, addressRegion: 'CT', addressCountry: 'US' };
    if (p.synthesis) biz.description = p.synthesis;
    return { '@type': 'ListItem', position: i + 1, url, name: p.name, item: biz };
  });

  const graph = [
    ...publisherNodes(),
    {
      '@type': 'CollectionPage',
      '@id': canonical + '#webpage',
      url: canonical,
      name: label + ' Contractors in ' + COUNTY + ', CT',
      description: 'The most-established ' + tLower(trade) + ' contractors in ' + COUNTY +
        ', Connecticut — vouched by state registration and licensing, with a plain-English read of what homeowners actually say. Compiled by Vesta from public records. No ads, no pay-to-play.',
      isPartOf: { '@id': WEBSITE_ID },
      publisher: { '@id': ORG_ID },
      about: { '@type': 'Thing', name: label + ' contractors in ' + COUNTY + ', CT' },
      breadcrumb: { '@id': canonical + '#breadcrumb' }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vesta', item: SITE + '/vesta' },
        { '@type': 'ListItem', position: 2, name: COUNTY + ', CT', item: SITE + '/fairfield-county/' + trade },
        { '@type': 'ListItem', position: 3, name: label }
      ]
    },
    {
      '@type': 'ItemList',
      '@id': canonical + '#list',
      name: 'Top ' + tLower(trade) + ' contractors in ' + COUNTY + ', CT',
      numberOfItems: items.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: items
    }
  ];

  // Escape "<" so the JSON can never break out of the <script> tag.
  return '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') +
    '</script>';
}

// --- shell ------------------------------------------------------------------

function shell({ title, description, canonical, headExtra, body }) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + esc(description) + '">\n' +
    '<link rel="canonical" href="' + esc(canonical) + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(description) + '">\n' +
    '<meta property="og:url" content="' + esc(canonical) + '">\n' +
    '<meta property="og:site_name" content="Vesta by 4th Wall Solutions">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<link rel="icon" href="/logo.png" type="image/png">\n' +
    '<meta name="theme-color" content="#0f1310">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=optional" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/home.css">\n' +
    '<style>.dir-count{font-family:var(--mono);font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--vdim)}</style>\n' +
    (headExtra || '') + '\n' +
    '<script src="/home.js" defer></script>\n' +
    '</head>\n<body>\n' +
    NAV +
    '<main>\n' + body + '\n</main>\n' +
    FOOTER +
    // Progressive enhancement: swap the nav to the signed-in state if there's a
    // session. Content is already server-rendered; this only touches the nav chip.
    '<script>document.addEventListener("DOMContentLoaded",function(){try{if(window.HOME&&HOME.navAccount)HOME.navAccount();}catch(e){}});</script>\n' +
    '</body>\n</html>\n';
}

// Shared top-nav. navHtml() is the default — browse context (directory pages):
// keeps the "Find a pro" deck link. PROFILE pages call
// navHtml({ logoHref: <canonical>, browse: false }): a single-contractor landing
// page gives the lead NO door to escape to a competitor, so the browse link is
// dropped and the logo points back to this profile. ("Check an address" removed
// everywhere — it routed to the deprecated v1 /vesta/search app.)
export function navHtml({ logoHref = '/', browse = true } = {}) {
  return '<nav class="topnav">\n' +
    '  <a href="' + logoHref + '" class="nav-logo">\n' +
    '    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="square">\n' +
    '      <polyline points="94.5,5.5 5.5,5.5 5.5,94.5 70,94.5"/>\n' +
    '      <line x1="94.5" y1="5.5" x2="94.5" y2="70"/>\n' +
    '    </svg>\n' +
    '    4THWALL\n' +
    '  </a>\n' +
    '  <div class="nav-links">\n' +
    (browse ? '    <a href="/vesta" class="nav-a">Find a pro</a>\n' : '') +
    '    <span id="nav-acct"><a class="nav-a" href="/signin">Sign in</a></span>\n' +
    '  </div>\n' +
    '</nav>\n';
}
export const NAV = navHtml();

export const FOOTER =
  '<footer>\n' +
  '  <div class="foot-row">\n' +
  '    <span class="foot-brand">4th Wall Solutions · Stamford, CT</span>\n' +
  '    <div class="foot-links">\n' +
  '      <a href="/privacy.html">Privacy Policy</a>\n' +
  '      <a href="/terms.html">Terms of Service</a>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '</footer>\n';

// --- entry points -----------------------------------------------------------

// The trade index (no/unknown trade): pick-a-trade hub. Mirrors directory.html's !trade branch.
export function renderIndexHTML() {
  const canonical = SITE + '/fairfield-county/roofing';
  const body =
    '<section class="page-hero" id="hero">' +
      '<a class="crumb" href="/vesta">← Vesta</a>' +
      '<h1 class="page-h">Contractors in ' + COUNTY + ', CT</h1>' +
      '<p class="page-sub">Pick a trade to see the most-established pros across ' + COUNTY + ', vouched by the public record.</p>' +
    '</section>' +
    '<section class="section" id="body">' + stripHtml('') + '</section>';
  return shell({
    title: 'Contractors in Fairfield County, CT — by public record | Vesta',
    description: 'The most-established contractors in Fairfield County, Connecticut — vouched by state registration, with a plain read of what homeowners actually say. Compiled by Vesta from public records. No ads, no pay-to-play.',
    canonical, body
  });
}

// A real trade page with its rows (already fetched, established-first).
export function renderDirectoryHTML(trade, rows) {
  if (!TRADES.includes(trade)) return renderIndexHTML();
  const label = tradeLabel(trade);
  const canonical = SITE + '/fairfield-county/' + trade;
  const title = label + ' Contractors in ' + COUNTY + ', CT — by public record | Vesta';
  const description = 'The top ' + tLower(trade) + ' contractors in ' + COUNTY +
    ', CT — ranked by what homeowners actually say, weighted by how many said it, with a plain-English read of each. Compiled by Vesta from public records. No ads, no pay-to-play.';

  const hero =
    '<section class="page-hero" id="hero">' +
      '<a class="crumb" href="/vesta">← Vesta</a>' +
      '<h1 class="page-h">' + esc(label) + ' Contractors in ' + COUNTY + ', CT</h1>' +
      '<p class="page-sub">The top ' + esc(tLower(trade)) + ' contractors across ' + COUNTY +
      ' — ranked by what homeowners actually say, weighted by how many said it, with a plain-English read of each. ' +
      'Connecticut registration and licensing are shown where they apply. No ads, no pay-to-play.</p>' +
    '</section>';

  let main;
  if (!Array.isArray(rows) || !rows.length) {
    main = '<section class="section" id="body">' + stripHtml(trade) +
      '<div class="card-block"><p class="note">We’re compiling ' + esc(tLower(trade)) + ' contractors in ' + COUNTY +
      ' right now — the verified public-record list goes live shortly. In the meantime you can ' +
      '<a href="/vesta/search" style="color:var(--vgreen-2)">search Vesta</a> for a pro near you.</p></div>' + disclosure() + '</section>';
    return shell({ title, description, canonical, headExtra: jsonLd(trade, label, [], canonical), body: hero + main });
  }

  main = '<section class="section" id="body">' +
    stripHtml(trade) +
    '<h2 class="section-h">' + rows.length + ' ' + esc(tLower(trade)) + ' contractors</h2>' +
    '<p class="dir-count">Ranked by homeowner consensus · no ads, no pay-to-play</p>' +
    '<div class="grid" style="margin-top:1rem">' + rows.map((p) => card(p, trade)).join('') + '</div>' +
    disclosure() +
  '</section>';

  return shell({ title, description, canonical, headExtra: jsonLd(trade, label, rows, canonical), body: hero + main });
}
