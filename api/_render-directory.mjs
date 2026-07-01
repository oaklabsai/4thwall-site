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
  'place_id,name:business_name,city,registered,hic_issue_date,trade_license,certifications,specialties,synthesis';
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
  // M4 — structured highlights row: the top specialties, so depth shows on the
  // card BEFORE the homeowner opens the profile. Credential chips above carry the
  // trust proof; these carry the "what they're known for." Cap at 3 to stay scannable.
  const specs = Array.isArray(p.specialties)
    ? p.specialties.filter((s) => s && String(s).trim()).slice(0, 3)
    : [];
  const specHtml = specs.length
    ? '<div class="spec-row"><span class="spec-lbl">Known for</span>' +
        specs.map((s) => '<span class="spec">' + esc(s) + '</span>').join('') + '</div>'
    : '';
  const syn = p.synthesis
    ? '<p class="card-syn"><span class="syn-lbl">What homeowners say</span>' + esc(p.synthesis) + '</p>'
    : '';
  return '<div class="card lift">' +
    '<a class="cardlink" href="' + href + '"><h3>' + esc(p.name) + '</h3></a>' +
    '<div class="sub">' + esc(p.city || COUNTY) + '</div>' +
    chipsHtml + specHtml + syn +
    '<div class="spacer"></div>' +
    '<div><a class="pill pill-ghost pill-sm" href="' + href + '">View profile</a></div>' +
  '</div>';
}

// M6 — honest market-level trust bar. The credibility Angi's "617 reviews, 4.6 avg"
// builds, done WITHOUT raw stars: registered + licensed/certified COUNTS off the
// view, plus the no-pay-to-play tag. Counts, never ratings — the moat holds.
function marketBar(rows, trade) {
  const nReg = rows.filter((p) => p.registered).length;
  const nCred = rows.filter((p) =>
    (Array.isArray(p.trade_license) && p.trade_license.length) ||
    (Array.isArray(p.certifications) && p.certifications.length)).length;
  const stats = [];
  if (nReg) stats.push('<span class="mb-stat"><b>' + nReg + '</b> registered with the State of Connecticut</span>');
  if (nCred) stats.push('<span class="mb-stat"><b>' + nCred + '</b> with a verified trade license or certification</span>');
  const statsHtml = stats.length
    ? '<div class="mb-stats">' + stats.join('<span class="mb-sep" aria-hidden="true">·</span>') + '</div>'
    : '';
  return '<div class="market-bar">' + statsHtml +
    '<p class="mb-tag">Ranked by homeowner consensus, weighted by how many homeowners said it — ' +
    'no ads, no pay-to-play, no paid placement.</p></div>';
}

// M7 (standalone) — trust-criteria explainer. On the directory the cards show
// credential CHIPS with no room for inline copy (unlike the /c/ verified block,
// which states each criterion in place). This shared, exported helper makes the
// standard behind every chip legible — the governing principle is "every badge
// states its criterion." Progressive disclosure via <details> so it never clutters.
export function criteriaExplainer(trade) {
  const tl = tLower(trade);
  return '<details class="vx-criteria">' +
    '<summary>What these marks mean — and how Vesta verifies each</summary>' +
    '<div class="vx-body">' +
      '<dl>' +
        '<dt>Registered CT contractor</dt>' +
        '<dd>Holds an active Home Improvement Contractor registration, confirmed in the Connecticut ' +
          'Department of Consumer Protection public registry — not self-reported by the business.</dd>' +
        '<dt>Licensed ' + esc(tl) + '</dt>' +
        '<dd>Carries the state trade license the work requires, verified in the CT eLicense state registry.</dd>' +
        '<dt>Manufacturer certified</dt>' +
        '<dd>Named in a manufacturer’s own contractor directory (e.g. GAF, CertainTeed) — a credential the ' +
          'maker grants and can revoke, and which often unlocks longer workmanship warranties.</dd>' +
        '<dt>What homeowners say</dt>' +
        '<dd>A plain-English summary Vesta writes from public reviews and verified public records — Vesta’s ' +
          'own wording, never a copy of any single review, and always positive-or-silent. Vesta shows how many ' +
          'public reviews a business has, but never the raw star average — the summary is the read, not a score.</dd>' +
      '</dl>' +
      '<p class="vx-foot">Every mark states the standard it meets and the public record it’s checked against. ' +
        'That is the whole point — a badge means nothing unless you can see its criterion.</p>' +
    '</div></details>';
}

// M2 — cost guide (editorial, per-trade). The cost depth Angi has, without the
// per-review project costs Angi's reviewers type in and without inventing a
// number we can't defend. HomeAdvisor-sharpened: (a) ranges broken down BY JOB
// TYPE, not one aggregate; (b) lead with a typical range, NEVER a "from $X"
// minimum-job-size number (their "from $594" bait we oppose); (c) a "how we get
// this data" methodology line (basis · scope · last-updated). Lives as a
// deep-linkable #cost SECTION on the directory page (decision 4) — consolidates
// authority on the page that already targets "<trade> in Fairfield County"
// instead of spawning a thin standalone page. Moat-clean: editorial ranges, no
// raw stars, frames as planning estimates not quotes. Add trades for SP4 by
// appending keys — costSection() renders nothing for a trade with no entry.
export const COST_GUIDE = {
  roofing: {
    noun: 'roof',
    typical: 'Most Fairfield County homeowners spend roughly $9,000–$24,000 on a full asphalt-shingle ' +
      'roof replacement. Where you land depends on the roof’s size and pitch, how many old layers come ' +
      'off, and the shingle line you choose.',
    rows: [
      { job: 'Asphalt shingle roof replacement', range: '$9,000 – $24,000',
        note: 'The most common job — tear-off and replace on a typical 1,800–2,400 sq ft roof in mid-range architectural (dimensional) shingles.' },
      { job: 'Roof repair (leak, flashing, a few shingles)', range: '$400 – $1,800',
        note: 'Localized fixes — chimney flashing, a slipped course, or a small active leak.' },
      { job: 'Priced per “square” (100 sq ft), installed', range: '$450 – $800',
        note: 'How roofers actually quote a job. Multiply by your roof’s squares for a rough total.' },
      { job: 'Standing-seam metal roof', range: '$18,000 – $45,000+',
        note: 'A 40–50 year roof in premium material and labor — common on modern and barn-style homes.' },
      { job: 'Cedar shake or slate (historic homes)', range: '$25,000 – $60,000+',
        note: 'Specialty craftsmanship for period-correct restorations on older Fairfield County homes.' }
    ],
    factors: 'roof pitch and height (steeper and taller cost more), how many old layers are torn off, ' +
      'skylights and chimneys to flash around, and any gutter, fascia, or decking repair found once the old roof is off',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  hvac: {
    noun: 'system',
    typical: 'Most Fairfield County homeowners spend roughly $6,000–$14,000 to replace a central heating ' +
      'or cooling system. Where you land depends on the size your home needs, the efficiency rating you ' +
      'choose, and whether your existing ductwork can be reused.',
    rows: [
      { job: 'Central AC replacement (condenser + coil)', range: '$5,500 – $12,000',
        note: 'The most common cooling job — replacing an aging system on existing ductwork. Tonnage and SEER2 efficiency drive the spread.' },
      { job: 'Gas furnace replacement', range: '$4,500 – $9,500',
        note: 'Swapping a worn furnace. High-efficiency (96%+ AFUE) and variable-speed units sit at the top of the range.' },
      { job: 'Heat pump (air-source, whole-home)', range: '$8,000 – $20,000',
        note: 'Increasingly common for electrification. Cold-climate models and multi-zone setups cost more.' },
      { job: 'Ductless mini-split (per zone, installed)', range: '$3,500 – $7,500',
        note: 'Priced per indoor head — ideal for additions, sunrooms, and homes without ductwork.' },
      { job: 'Service call, tune-up, or minor repair', range: '$150 – $600',
        note: 'A tech visit, refrigerant top-off, capacitor, or thermostat — not a full replacement.' }
    ],
    factors: 'the size (tonnage / BTU) your home actually needs, the efficiency rating you choose (SEER2 / AFUE), ' +
      'whether existing ductwork can be reused, electrical upgrades for heat pumps, and how easy the equipment is to reach',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  plumbing: {
    noun: 'plumbing',
    typical: 'Plumbing spans tiny fixes to full repipes, so the range is wide. Most service jobs land between ' +
      '$200 and $1,200, while big-ticket replacements — water heater, repipe, or sewer line — run into the thousands.',
    rows: [
      { job: 'Service call / common repair (leak, faucet, running toilet)', range: '$150 – $600',
        note: 'The most common job — a visit plus a straightforward fix.' },
      { job: 'Water heater replacement (40–50 gal tank)', range: '$1,600 – $3,800',
        note: 'A standard gas or electric tank, installed and hauled away. Tankless costs more.' },
      { job: 'Tankless water heater (installed)', range: '$3,500 – $7,000',
        note: 'A gas tankless unit including venting and any gas-line work.' },
      { job: 'Sewer line repair or replacement', range: '$3,000 – $12,000+',
        note: 'Highly excavation-dependent. Trenchless lining sits at the top of the range.' },
      { job: 'Whole-home repipe', range: '$6,000 – $16,000',
        note: 'Replacing aging galvanized or polybutylene supply lines with PEX or copper.' }
    ],
    factors: 'whether the work is accessible or buried behind walls and underground, fixture and material grade ' +
      '(PEX vs copper), permit and inspection requirements, and whether it is an emergency or a scheduled job',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  electrical: {
    noun: 'home',
    typical: 'Most electrical work is smaller service jobs in the $200–$1,500 range, while panel upgrades, ' +
      'rewires, and generators are the big-ticket items that climb into the thousands.',
    rows: [
      { job: 'Service call / common repair (outlet, switch, fixture)', range: '$150 – $500',
        note: 'The most common job — a visit plus a defined fix or install.' },
      { job: 'Panel (service) upgrade to 200-amp', range: '$2,000 – $4,500',
        note: 'Upgrading an older or overloaded panel, including the meter swap and permit.' },
      { job: 'EV charger install (Level 2)', range: '$800 – $2,500',
        note: 'A 240V circuit for home charging. Distance from the panel — and any panel upgrade — moves the number.' },
      { job: 'Whole-home rewire', range: '$8,000 – $20,000+',
        note: 'Replacing knob-and-tube or aluminum wiring in an older Fairfield County home.' },
      { job: 'Standby generator (installed)', range: '$7,000 – $16,000',
        note: 'A permanently wired backup generator with transfer switch and gas hookup.' }
    ],
    factors: 'the age and condition of existing wiring, panel capacity and whether it needs upgrading, ' +
      'permit and inspection requirements, and how far new circuits have to run from the panel',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  paving: {
    noun: 'driveway',
    typical: 'Most Fairfield County homeowners spend roughly $4,000–$12,000 on a new asphalt driveway. ' +
      'The spread comes from size, how much old surface comes off, and whether you choose asphalt or pavers.',
    rows: [
      { job: 'Asphalt driveway (new or full replacement)', range: '$4,000 – $12,000',
        note: 'The most common job — a typical residential driveway, torn out and repaved.' },
      { job: 'Asphalt repair / resurfacing (overlay)', range: '$1,500 – $5,000',
        note: 'A fresh top layer over a sound base, or patching problem areas.' },
      { job: 'Sealcoating (existing asphalt)', range: '$250 – $700',
        note: 'A protective coat that extends a driveway’s life — recommended every few years.' },
      { job: 'Paver driveway or walkway', range: '$12,000 – $35,000+',
        note: 'Interlocking concrete or brick pavers — premium curb appeal and longevity.' },
      { job: 'Drainage or regrading work', range: '$1,500 – $8,000',
        note: 'Solving water and slope problems before or during the paving job.' }
    ],
    factors: 'square footage, removal of the old surface, base preparation and drainage, material choice ' +
      '(asphalt vs pavers), and how easily equipment can reach the site',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  lawn_care: {
    noun: 'property',
    typical: 'Lawn care is usually billed per visit or per season. Most Fairfield County homeowners spend ' +
      'roughly $150–$400 a month in season, while one-time projects like a new lawn run higher.',
    rows: [
      { job: 'Weekly mowing / maintenance (per visit)', range: '$40 – $90',
        note: 'The most common service — a typical residential lot, mowed and trimmed.' },
      { job: 'Full-season lawn program (fertilization + weed control)', range: '$400 – $1,000',
        note: 'A season of scheduled treatments, billed as a package.' },
      { job: 'Spring or fall cleanup', range: '$250 – $700',
        note: 'Leaf removal, bed cleanup, and seasonal cutbacks.' },
      { job: 'New lawn — seeding or sod', range: '$1,500 – $8,000',
        note: 'Grading and establishing a new lawn. Sod costs more than seed.' },
      { job: 'Landscape design / planting project', range: '$2,000 – $15,000+',
        note: 'Beds, plantings, and hardscape edging — varies widely with scope.' }
    ],
    factors: 'lot size, how often you want service, the condition of the existing lawn, and add-ons like ' +
      'irrigation, planting beds, or tree work',
    basis: 'prevailing Fairfield County service rates for residential lawn care',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  painting: {
    noun: 'home',
    typical: 'Most Fairfield County homeowners spend roughly $3,000–$8,000 to repaint an interior, while a ' +
      'full exterior repaint runs higher. Square footage, prep, and paint grade drive where you land.',
    rows: [
      { job: 'Interior — whole house (≈2,000–2,500 sq ft)', range: '$3,000 – $8,000',
        note: 'The most common job — walls, ceilings, and trim throughout, with prep and two coats.' },
      { job: 'Interior — single room', range: '$400 – $1,200',
        note: 'A bedroom or living room, including prep and two coats.' },
      { job: 'Exterior repaint (full house)', range: '$5,000 – $15,000',
        note: 'Prep, priming, and two coats. Siding type and house height drive the spread.' },
      { job: 'Cabinet refinishing (kitchen)', range: '$2,500 – $7,000',
        note: 'Sanding, priming, and spraying kitchen cabinets — a popular alternative to replacement.' },
      { job: 'Trim, doors, or accent work', range: '$500 – $2,500',
        note: 'Smaller defined scopes priced on their own.' }
    ],
    factors: 'square footage and ceiling height, how much prep and surface repair is needed, paint grade, ' +
      'the number of colors, and exterior access (ladders vs lifts)',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  },
  masonry: {
    noun: 'project',
    typical: 'Masonry is priced by the project and varies widely. Most Fairfield County homeowners spend ' +
      'roughly $2,000–$15,000 depending on whether it’s a repair or new stonework, and on the material.',
    rows: [
      { job: 'Brick / block repair or repointing', range: '$1,000 – $5,000',
        note: 'The most common job — tuckpointing mortar joints or replacing damaged brick.' },
      { job: 'Chimney repair or rebuild', range: '$1,500 – $9,000',
        note: 'From crown and flashing repair to a full above-the-roof rebuild.' },
      { job: 'Paver or natural-stone patio', range: '$5,000 – $20,000',
        note: 'A new patio in concrete pavers or natural stone, including base prep.' },
      { job: 'Retaining wall', range: '$4,000 – $18,000+',
        note: 'Engineered block or natural stone. Height and drainage drive the cost.' },
      { job: 'Stone veneer, steps, or walkway', range: '$2,500 – $12,000',
        note: 'Facing a foundation or wall, rebuilding front steps, or laying a stone walkway.' }
    ],
    factors: 'the material (brick, block, concrete paver, or natural stone), how much demolition and base ' +
      'prep is needed, wall height or structural requirements, and how easily the site can be reached',
    basis: 'industry installed-cost ranges adjusted for Fairfield County labor rates',
    scope: 'Fairfield County, CT',
    updated: 'June 2026'
  }
};

// Render the deep-linkable #cost section. Returns '' for any trade with no
// COST_GUIDE entry (so the pilot ships roofing only; SP4 lights up the rest).
export function costSection(trade) {
  const g = COST_GUIDE[trade];
  if (!g) return '';
  const tl = tLower(trade);
  const rows = g.rows.map((r) =>
    '<div class="cg-row">' +
      '<div class="cg-job">' + esc(r.job) + '</div>' +
      '<div class="cg-range">' + esc(r.range) + '</div>' +
      '<div class="cg-note">' + esc(r.note) + '</div>' +
    '</div>').join('');
  return '<section class="cost-guide" id="cost" aria-label="What ' + esc(tl) + ' costs in ' + COUNTY + '">' +
    '<h2 class="section-h">What does ' + esc(tl) + ' cost in ' + COUNTY + '?</h2>' +
    '<p class="cg-typical">' + esc(g.typical) + '</p>' +
    '<div class="cg-table">' + rows + '</div>' +
    '<p class="cg-factors"><span class="cg-flbl">What moves your number</span>' + esc(g.factors) + '.</p>' +
    '<p class="cg-method">These are planning estimates, not quotes — your real number comes from a ' +
      'contractor who has seen your ' + esc(g.noun || 'project') + '. ' +
      'Basis: ' + esc(g.basis) + ' · ' + esc(g.scope) + ' · updated ' + esc(g.updated) + '.</p>' +
  '</section>';
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

export function shell({ title, description, canonical, headExtra, body }) {
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
    '<style>' +
      '.dir-count{font-family:var(--mono);font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--vdim)}' +
      // M6 market trust bar
      '.market-bar{margin:.4rem 0 1.1rem;padding:.85rem 1rem;border:1px solid var(--line,rgba(74,75,47,.16));border-radius:12px;background:rgba(212,223,158,.07)}' +
      '.mb-stats{display:flex;flex-wrap:wrap;align-items:baseline;gap:.55rem;font-size:.95rem;color:var(--vink,#12100e)}' +
      '.mb-stat b{font-weight:600}.mb-sep{color:var(--vdim);opacity:.6}' +
      '.mb-tag{margin:.5rem 0 0;font-size:.82rem;line-height:1.5;color:var(--vmut,#4a4b2f)}' +
      // M7 criteria explainer
      '.vx-criteria{margin:0 0 1.4rem;border:1px solid var(--line,rgba(74,75,47,.16));border-radius:12px;background:rgba(255,255,255,.5);overflow:hidden}' +
      '.vx-criteria>summary{cursor:pointer;list-style:none;padding:.7rem 1rem;font-size:.88rem;font-weight:500;color:var(--vgreen-2,#4a4b2f);display:flex;align-items:center;gap:.5rem}' +
      '.vx-criteria>summary::-webkit-details-marker{display:none}' +
      '.vx-criteria>summary::before{content:"";width:.5rem;height:.5rem;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .18s ease}' +
      '.vx-criteria[open]>summary::before{transform:rotate(45deg)}' +
      '.vx-body{padding:.2rem 1rem 1rem}' +
      '.vx-body dl{margin:0;display:grid;gap:.65rem}' +
      '.vx-body dt{font-weight:600;font-size:.9rem;color:var(--vink,#12100e)}' +
      '.vx-body dd{margin:.12rem 0 0;font-size:.86rem;line-height:1.55;color:var(--vmut,#4a4b2f)}' +
      '.vx-foot{margin:1rem 0 0;padding-top:.8rem;border-top:1px solid var(--line,rgba(74,75,47,.12));font-size:.82rem;line-height:1.55;color:var(--vdim)}' +
      // M4 specialty highlights row (cards)
      '.spec-row{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin:.55rem 0 .2rem}' +
      '.spec-lbl{font-family:var(--mono);font-size:.6rem;letter-spacing:.09em;text-transform:uppercase;color:var(--vdim);margin-right:.15rem}' +
      '.spec{font-size:.74rem;padding:.16rem .5rem;border:1px solid var(--line,rgba(74,75,47,.2));border-radius:999px;color:var(--vmut,#4a4b2f);background:rgba(212,223,158,.1)}' +
      // M2 cost guide (#cost section)
      '.cost-guide{margin:2.6rem 0 .5rem;padding-top:1.9rem;border-top:1px solid var(--line,rgba(74,75,47,.16));scroll-margin-top:1.5rem}' +
      '.cg-typical{font-size:.98rem;line-height:1.7;color:var(--vink,#12100e);max-width:64ch;margin:.2rem 0 1.3rem}' +
      '.cg-table{display:grid;gap:0;border:1px solid var(--line,rgba(74,75,47,.16));border-radius:14px;overflow:hidden}' +
      '.cg-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);grid-template-areas:"job range" "note note";gap:.18rem .9rem;padding:.85rem 1.1rem;background:rgba(255,255,255,.5);border-top:1px solid var(--line,rgba(74,75,47,.1))}' +
      '.cg-row:first-child{border-top:0}' +
      '.cg-job{grid-area:job;font-weight:600;font-size:.92rem;color:var(--vink,#12100e);line-height:1.35}' +
      '.cg-range{grid-area:range;font-family:var(--mono);font-size:.88rem;font-weight:500;color:var(--vgreen-2,#4a4b2f);text-align:right;white-space:nowrap}' +
      '.cg-note{grid-area:note;font-size:.82rem;line-height:1.5;color:var(--vmut,#4a4b2f)}' +
      '.cg-factors{font-size:.88rem;line-height:1.6;color:var(--vmut,#4a4b2f);max-width:64ch;margin:1.2rem 0 .8rem}' +
      '.cg-flbl{display:block;font-family:var(--mono);font-size:.6rem;letter-spacing:.09em;text-transform:uppercase;color:var(--vdim);margin-bottom:.25rem}' +
      '.cg-method{font-size:.78rem;line-height:1.55;color:var(--vdim);max-width:64ch;margin:0}' +
    '</style>\n' +
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
  // "All contractors" -> the /directory hub. Present on every directory and /c/
  // profile page (both render this shared footer), so it flattens crawl depth:
  // every deep profile is one hop from the hub, and the hub inherits authority
  // from all of them. Keeps the homeowner inside Vesta rather than bouncing to a
  // competitor — the browse door that /c/ drops from its NAV is fine in the footer.
  '      <a href="/directory">All contractors</a>\n' +
  // The original-data report (Stage 3 B4): the citable stats page. In the shared
  // footer for the same crawl-mesh reason as the hub link above.
  '      <a href="/fairfield-county-contractor-report">Contractor Report</a>\n' +
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
    marketBar(rows, trade) +
    criteriaExplainer(trade) +
    '<div class="grid" style="margin-top:1rem">' + rows.map((p) => card(p, trade)).join('') + '</div>' +
    costSection(trade) +
    disclosure() +
  '</section>';

  return shell({ title, description, canonical, headExtra: jsonLd(trade, label, rows, canonical), body: hero + main });
}

// --- the /directory hub (Stage 3 B1) ----------------------------------------
// A single crawl hub: every index-ready /c/ profile, grouped by trade then town.
// Why it exists: the per-trade directory caps at limit=50, so a trade with more
// ready profiles has an orphaned tail linked from nowhere (painting: 70 ready →
// 20 orphaned). And every deep profile sat 2+ low-authority hops from anything
// crawlable, so Google barely reached them (avg position ~38). This page is
// footer-linked site-wide, so it's one hop from the homepage and inherits
// authority from all ~330 pages; from it, every profile is one more hop — a tight
// crawl mesh over the whole corpus. It mirrors the sitemap EXACTLY (index_status
// 'ready' only) so we never funnel crawl into thin/noindex profiles. Town is a
// GROUPING, not a link target (no town pages exist yet) — it still hands engines
// the town×trade association in anchor proximity, and structures the index for a
// human. Counts only, never ratings — the moat holds.

const HUB_CSS =
  '.hub-lead{margin:.2rem 0 1.4rem;font-family:var(--mono);font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;color:var(--vdim);display:flex;flex-wrap:wrap;gap:.5rem}' +
  '.hub-lead b{color:var(--vgreen-2,#4a4b2f);font-weight:600}' +
  '.hub-lead .sep{opacity:.5}' +
  '.hub-sections{display:grid;gap:2.6rem;margin-top:1.6rem}' +
  '.hub-trade{scroll-margin-top:1.5rem}' +
  '.hub-trade-head{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;padding-bottom:.7rem;margin-bottom:1.1rem;border-bottom:1px solid var(--line,rgba(74,75,47,.16))}' +
  '.hub-ico{width:1.35rem;height:1.35rem;flex:none;stroke:var(--vgreen-2,#4a4b2f);fill:none;stroke-width:1.6}' +
  '.hub-trade-h{margin:0;font-family:var(--serif,"Fraunces",serif);font-size:1.32rem;font-weight:600;color:var(--vink,#12100e)}' +
  '.hub-trade-n{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--vdim);padding:.16rem .5rem;border:1px solid var(--line,rgba(74,75,47,.2));border-radius:999px;white-space:nowrap}' +
  '.hub-trade-link{margin-left:auto;font-size:.82rem;color:var(--vgreen-2,#4a4b2f);white-space:nowrap}' +
  '.hub-trade-link:hover{text-decoration:underline}' +
  '.hub-towns{columns:3;column-gap:2.2rem}' +
  '@media(max-width:860px){.hub-towns{columns:2}}' +
  '@media(max-width:520px){.hub-towns{columns:1}}' +
  '.hub-town{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;display:inline-block;width:100%;margin:0 0 1.3rem}' +
  '.hub-town-h{display:flex;align-items:baseline;gap:.4rem;font-family:var(--mono);font-size:.63rem;letter-spacing:.11em;text-transform:uppercase;color:var(--vdim);margin-bottom:.25rem}' +
  '.hub-town-n{font-size:.58rem;opacity:.7}' +
  '.hub-firms{display:flex;flex-direction:column}' +
  // Firm links are the PRIMARY clickable content — full-strength deep olive
  // (#3a3b24 ≈ 10:1 on the cream bg, well past AA), NOT the 0.62-alpha --vmut used
  // for the directory's secondary prose. Hover DARKENS to ink (a stronger, not
  // weaker, affordance — the site link color --vgreen-2 is #6B654B, too light here).
  '.hub-firm{padding:.42rem 0;font-size:.9rem;line-height:1.35;color:#3a3b24;border-bottom:1px solid var(--line,rgba(74,75,47,.09));transition:color .12s ease}' +
  '.hub-firm:hover,.hub-firm:focus{color:#12100e}';

function hubJsonLd(canonical, orderedTrades) {
  // ItemList of the 8 trade directories (the hub's children) — NOT all 318
  // profiles, which already carry their own ListItem entries on the trade pages.
  // This positions the hub as the parent index without duplicating the corpus.
  const items = orderedTrades.map((t, i) => {
    const url = SITE + '/fairfield-county/' + t;
    return {
      '@type': 'ListItem', position: i + 1, url,
      name: tradeLabel(t) + ' contractors in ' + COUNTY + ', CT',
      item: { '@type': 'CollectionPage', '@id': url + '#webpage', url,
        name: tradeLabel(t) + ' Contractors in ' + COUNTY + ', CT' }
    };
  });
  const graph = [
    ...publisherNodes(),
    {
      '@type': 'CollectionPage', '@id': canonical + '#webpage', url: canonical,
      name: 'Contractor Directory — ' + COUNTY + ', CT',
      description: 'The full public-record index of contractors Vesta covers in ' + COUNTY +
        ', CT, across ' + items.length + ' trades. Compiled from public records. No ads, no pay-to-play.',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      breadcrumb: { '@id': canonical + '#breadcrumb' }
    },
    {
      '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vesta', item: SITE + '/vesta' },
        { '@type': 'ListItem', position: 2, name: 'Directory' }
      ]
    },
    {
      '@type': 'ItemList', '@id': canonical + '#list',
      name: 'Contractor trades in ' + COUNTY + ', CT',
      numberOfItems: items.length, itemListElement: items
    }
  ];
  return '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') +
    '</script>';
}

// Pure: rows in (index-ready public-view rows), full hub HTML out.
export function renderHubHTML(rows) {
  const canonical = SITE + '/directory';
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.place_id && TRADES.includes(r.trade));

  const byTrade = {};
  for (const r of list) (byTrade[r.trade] = byTrade[r.trade] || []).push(r);
  const orderedTrades = TRADES.filter((t) => (byTrade[t] || []).length);
  const total = list.length;
  const townCount = new Set(list.map((r) => String(r.city || '').trim()).filter(Boolean)).size;

  const title = 'Contractor Directory — ' + COUNTY + ', CT | Vesta';
  const description = 'Every contractor Vesta covers in ' + COUNTY + ', Connecticut — ' + total +
    ' vetted pros across ' + orderedTrades.length + ' trades, compiled from public records. ' +
    'Browse the full index by trade and town. No ads, no pay-to-play.';

  const hero =
    '<section class="page-hero" id="hero">' +
      '<a class="crumb" href="/vesta">← Vesta</a>' +
      '<h1 class="page-h">Every Contractor Vesta Covers in ' + COUNTY + ', CT</h1>' +
      '<p class="page-sub">The complete public-record index — browse the full roster by trade and town. ' +
        'Ranked by homeowner consensus, vouched by Connecticut registration and licensing. No ads, no pay-to-play.</p>' +
    '</section>';

  // Fetch failed / empty: minimal honest shell, never a fabricated list, never cached.
  if (!total) {
    const body = hero + '<section class="section" id="body">' + stripHtml('') +
      '<p class="note" style="margin-top:1.2rem">The directory is compiling right now — pick a trade above to browse.</p>' +
      disclosure() + '</section>';
    return shell({ title, description, canonical, body });
  }

  const lead = '<div class="hub-lead">' +
    '<span><b>' + total + '</b> contractors</span><span class="sep">·</span>' +
    '<span><b>' + orderedTrades.length + '</b> trades</span><span class="sep">·</span>' +
    '<span><b>' + townCount + '</b> towns</span></div>';

  const sections = orderedTrades.map((t) => {
    const label = tradeLabel(t);
    // group this trade by town; town order = its size within this trade, desc.
    const byTown = {};
    for (const r of byTrade[t]) {
      const town = String(r.city || '').trim() || COUNTY;
      (byTown[town] = byTown[town] || []).push(r);
    }
    const towns = Object.keys(byTown).sort((a, b) =>
      byTown[b].length - byTown[a].length || a.localeCompare(b));
    const townBlocks = towns.map((town) => {
      const firms = byTown[town].slice().sort((a, b) =>
        (+b.rank_score || 0) - (+a.rank_score || 0) ||
        String(a.business_name).localeCompare(String(b.business_name)));
      const links = firms.map((f) =>
        '<a class="hub-firm" href="/c/' + encodeURIComponent(f.place_id) + '">' +
          esc(f.business_name) + '</a>').join('');
      return '<div class="hub-town">' +
        '<span class="hub-town-h">' + esc(town) + '<span class="hub-town-n">' + firms.length + '</span></span>' +
        '<div class="hub-firms">' + links + '</div>' +
      '</div>';
    }).join('');

    return '<section class="hub-trade" id="' + t + '">' +
      '<div class="hub-trade-head">' +
        '<svg class="hub-ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[t] || ICON.all) + '</svg>' +
        '<h2 class="hub-trade-h">' + esc(label) + '</h2>' +
        '<span class="hub-trade-n">' + byTrade[t].length + ' in ' + COUNTY + '</span>' +
        '<a class="hub-trade-link" href="/fairfield-county/' + t + '">The ' + esc(tLower(t)) + ' page →</a>' +
      '</div>' +
      '<div class="hub-towns">' + townBlocks + '</div>' +
    '</section>';
  }).join('');

  const body = hero +
    '<section class="section" id="body">' +
      stripHtml('') +
      lead +
      '<div class="hub-sections">' + sections + '</div>' +
      disclosure() +
    '</section>';

  return shell({
    title, description, canonical,
    headExtra: '<style>' + HUB_CSS + '</style>' + hubJsonLd(canonical, orderedTrades),
    body
  });
}
