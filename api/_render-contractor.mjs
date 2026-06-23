// Shared, pure render module for the /c/:placeId deep-profile pages.
// SERVER-SIDE rendering: emits the full profile (hero, signature, Vesta's read,
// the synthesis, the hiring guide, the record, claim) + JSON-LD so Bing and AI
// answer-engine crawlers see the content WITHOUT executing JS. The old client
// path (vesta-app.html SPA / contractor.html) left non-JS crawlers an empty
// "Loading…" shell — this fixes that for the deep profiles, the highest-value
// GEO/AEO surface (a contractor's own page is the unit a homeowner-style query
// gets answered from).
//
// THE MOAT LINE (vouch-don't-expose): every field here comes from the PUBLIC
// view (profile_enrichment_public). The raw star average (rating) NEVER appears
// and there is NO aggregateRating markup; the total review COUNT (rating_count)
// IS shown as a credibility signal — count yes, score no. The live Google block (rating, category,
// Maps link) and the gated contact details are injected CLIENT-side by
// /profile.js — deliberately ABSENT from this crawlable HTML (the live-Google
// block needs the "Powered by Google" logo; contact is PII behind sign-in).
//
// Pure module (no Vercel/req/res) so it is Node-testable in isolation against
// the live public view. api/contractor.mjs fetches the row and calls
// renderContractorHTML.

import { SITE, COUNTY, esc, tradeLabel, BIZ_TYPE, FOOTER, navHtml, ORG_ID, WEBSITE_ID, publisherNodes, COST_GUIDE } from './_render-directory.mjs';

// --- the public-view read (mirror of the old contractor.html client fetch) ---
export const PROFILE_SELECT =
  'place_id,business_name,city,zip,trade,registered,hic_issue_date,trade_license,' +
  'certifications,synthesis,signature,known_for,specialties,' +
  'service_area,owner_name,volume_band,rating_band,tenure_band,trade_n,rating_count,enriched_at,index_status';
export const profileQuery = (placeId) =>
  '/profile_enrichment_public?place_id=eq.' + encodeURIComponent(placeId) +
  '&limit=1&select=' + PROFILE_SELECT;

// Sibling profiles for the lateral "Compare top [trade]" block: same trade,
// index-ready ONLY (never link the crawl into thin/noindex pages), excluding
// self, top-ranked first. Light select — just enough to link honestly.
export const siblingsQuery = (trade, placeId) =>
  '/profile_enrichment_public?trade=eq.' + encodeURIComponent(trade) +
  '&index_status=eq.ready&place_id=neq.' + encodeURIComponent(placeId) +
  '&order=rank_score.desc.nullslast&limit=3' +
  '&select=place_id,business_name,city';

// Index gate (two-tier SOP). A profile is index-eligible ONLY when it has earned
// index_status='ready' by passing the vesta_lint() QC gate in the DB (no rating/
// count baked into prose, substantive synthesis, required fields). Tier-1
// 'vesta_only' profiles stay browsable but noindex — clear of Google's
// scaled-content policy. INDEXING_ENABLED is the single go-live switch: it stays
// false until the full legal posture (opt-out spine + Powered-by-Google logo) is
// live, then flips to true in one bundled change.
export const INDEXING_ENABLED = true;
export function isIndexable(enr) {
  return INDEXING_ENABLED && !!(enr && enr.index_status === 'ready');
}

// Trade label maps — mirror contractor.html / home.js. Never a parallel set.
const TRADE_FIRMS = { roofing: 'roofing companies', hvac: 'HVAC companies', plumbing: 'plumbing companies', electrical: 'electrical contractors', paving: 'paving companies', lawn_care: 'lawn & landscaping companies', painting: 'painting companies', masonry: 'masonry companies' };
const TRADE_PROS  = { roofing: 'roofers', hvac: 'HVAC contractors', plumbing: 'plumbers', electrical: 'electricians', paving: 'paving contractors', lawn_care: 'lawn & landscaping pros', painting: 'painters', masonry: 'masons' };
const tLowerOf = (trade) => (trade === 'hvac' ? 'HVAC' : (tradeLabel(trade) ? tradeLabel(trade).toLowerCase() : ''));

// Freshness (M11) — turn an enriched_at ISO date into "June 2026". Vouch-don't-
// expose safe: it's a DATE (when Vesta last read this firm), never a rating. The
// honest answer to a homeowner's "is this current?" — the thing Angi/HomeAdvisor
// never show (their dormant profiles rank on years-old reviews with no signal).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthYear(iso) {
  if (!iso) return '';
  const s = String(iso); const y = s.slice(0, 4); const m = +s.slice(5, 7);
  if (!/^\d{4}$/.test(y) || !m || m < 1 || m > 12) return '';
  return MONTHS[m - 1] + ' ' + y;
}

// Trade hiring guides (Vesta editorial · trade-level · about no business).
// Ported verbatim from the old contractor.html so the page reads identically.
const HIRING_GUIDE = {
  roofing: [
    { t: 'Confirm CT registration & insurance', d: "Any roofer working on a Connecticut home needs an active Home Improvement Contractor registration plus their own liability and workers'-comp coverage. Ask to see both before work starts." },
    { t: 'Get the full scope in writing', d: 'Tear-off vs. going over the old layer, underlayment, flashing, ice-and-water shield, ventilation, and cleanup each change the price and the result. A one-line quote hides the parts that matter.' },
    { t: 'Ask about the manufacturer warranty', d: 'A factory warranty (GAF, CertainTeed, Owens Corning) only holds if the installer is certified and follows spec. Certified shops can often register a longer warranty in your name.' },
    { t: "Be wary of pressure and 'today-only' pricing", d: 'Storm-chasers and rush discounts are red flags. A reputable roofer gives you a written estimate and the time to decide.' }
  ],
  hvac: [
    { t: 'Ask for a load calculation, not a guess', d: "The right-sized system comes from a Manual-J load calc on your actual home — not 'same as the old one.' Oversized units short-cycle, run loud, and cost more to own." },
    { t: 'Confirm the CT license', d: 'Heating and cooling work is done under a Connecticut HVAC license. The licensed technician — not just the company name — is who is accountable for the install.' },
    { t: 'Get equipment, permit, and warranty in writing', d: 'Model and efficiency (SEER2 / AFUE), the permit, and warranty registration should all be itemized. A permit and post-install inspection protect you.' },
    { t: 'Check real emergency response', d: 'When heat or AC fails, a callback in hours beats a cheaper shop that goes quiet in a cold snap. Ask their honest after-hours window before you need it.' }
  ],
  plumbing: [
    { t: 'Verify the CT plumbing license', d: 'Plumbing is performed under a Connecticut P-class license held by the individual tradesperson. Confirm it is active before anyone touches a pipe.' },
    { t: 'Insist on an itemized estimate', d: "Parts, labor, and any wall or finish repair should be listed separately. Open-ended 'time and materials' can balloon on larger jobs." },
    { t: 'Know the emergency rate up front', d: 'Burst pipes and failed water heaters never wait for business hours. Ask the after-hours rate and callback window in advance.' },
    { t: 'Get the warranty terms', d: 'On a water heater, repipe, or fixture, ask how long parts and labor are covered — and whether the manufacturer warranty needs registering in your name.' }
  ],
  electrical: [
    { t: 'Confirm the CT license and the permit', d: 'Electrical work runs under a Connecticut E-class license, and most jobs need a permit and inspection. Both protect your home and your insurance.' },
    { t: "Don't shop on price alone", d: 'The cheapest panel swap or rewire can skip grounding, AFCI/GFCI protection, or proper load math. Ask exactly what is included to code.' },
    { t: 'Name the scope', d: 'Panel size in amps, circuits added, fixture vs. rough-in work, and who patches the walls should all be written down before work begins.' },
    { t: 'Match the pro to specialty work', d: 'EV chargers, generators, and solar tie-ins each have their own requirements. Confirm hands-on experience with your specific job.' }
  ],
  paving: [
    { t: 'Confirm registration and insurance', d: 'A driveway or walkway is home-improvement work — the contractor should hold an active CT registration and carry liability coverage.' },
    { t: 'Ask about the base, not just the surface', d: "Most paving failures start underneath. Ask about excavation depth, gravel base, and compaction — the part you can't inspect once it's done." },
    { t: 'Specify materials and thickness', d: 'Asphalt thickness, paver brand and type, edge restraint, and drainage slope decide whether it lasts five years or twenty-five. Get them in writing.' },
    { t: 'Mind the weather and the warranty', d: 'Temperature affects how asphalt and joints set, so avoid marginal-weather pours. Ask what is guaranteed and for how long.' }
  ],
  lawn_care: [
    { t: 'Match the service to your yard', d: 'Mowing, fertilization, design and installs, and tree work are different skills. Confirm the crew actually does the work you need — not just the easy parts.' },
    { t: 'Ask about pesticide credentials', d: 'In Connecticut, anyone applying pesticides commercially must be registered with DEEP. If chemical treatment is part of the plan, ask who is certified.' },
    { t: 'Put the schedule and scope in writing', d: "Visit frequency, what each visit covers, and seasonal cleanups should be spelled out so 'lawn care' isn't left open-ended." },
    { t: 'Confirm insurance for the heavy work', d: 'Tree removal, grading, and hardscape carry real risk. Liability coverage protects you if something goes wrong on your property.' }
  ],
  painting: [
    { t: 'Confirm CT registration & insurance', d: 'Interior and exterior painting is home-improvement work — the painter should hold an active Connecticut Home Improvement Contractor registration and carry liability coverage. Ask to see both before work starts.' },
    { t: 'Get the prep and number of coats in writing', d: "Most of a paint job's lifespan is decided before the color goes on — washing, scraping, sanding, patching, priming, and how many finish coats. A one-line quote hides the part that makes it last." },
    { t: 'Ask about surface repair and lead-safe work', d: 'Wood rot, failed caulk, and drywall cracks should be fixed first, not painted over. On homes built before 1978, ask whether the crew follows EPA lead-safe (RRP) practices when sanding or scraping.' },
    { t: 'Pin down products, color, and warranty', d: 'Paint line and finish, who supplies it, color approval, and daily cleanup should all be spelled out — along with how long the work is guaranteed and any touch-up window.' }
  ],
  masonry: [
    { t: 'Confirm CT registration & insurance', d: 'Masonry, hardscape, and chimney work is home-improvement work — the mason should hold an active Connecticut Home Improvement Contractor registration and carry liability coverage. Ask to see both before any demolition starts.' },
    { t: 'Get base prep and drainage in writing', d: 'Patios, walkways, and walls last or fail on what is underneath — excavation depth, a compacted gravel base, and how water is directed away. A quote that only describes the visible stone hides the part that decides longevity.' },
    { t: 'Match the material and the repair to the house', d: 'Ask which stone, brick, or paver and what pattern, and on older or historic homes, how new work and mortar will match the existing. For chimneys and foundations, confirm whether they are rebuilding or repairing — and why.' },
    { t: 'Pin down permits, timeline, and cleanup', d: 'Belgian-block aprons and structural walls can require local permits — confirm who pulls them. Spell out the schedule, site protection, daily cleanup, and how long the work is guaranteed.' }
  ]
};

// === content blocks (all from the public-view row `enr`) ====================

function signatureBlock(enr) {
  if (!enr || !enr.signature) return '';
  return '<div class="vturn" style="margin:.6rem 0 .2rem"><p>' + esc(enr.signature) + '</p></div>';
}

// Vesta's read — comparative standing, POSITIVE-ONLY, no rank/score.
function vestaReadBlock(enr, trade) {
  if (!enr) return '';
  const N = enr.trade_n;
  const firms = TRADE_FIRMS[trade] || (tLowerOf(trade) ? tLowerOf(trade) + ' contractors' : 'pros');
  const ofN = N ? ' of the ' + N + ' ' + firms + ' we track across ' + COUNTY : ' among the ' + firms + ' we track';
  const items = [];
  if (enr.rating_band === 'top10') items.push(['Homeowner rating', 'Among the highest-rated', 'Its aggregate homeowner rating sits in the top tier' + ofN + '.']);
  else if (enr.rating_band === 'top25') items.push(['Homeowner rating', 'Strongly rated', 'Carries one of the stronger homeowner ratings' + ofN + ', across a meaningful number of reviews.']);
  if (enr.volume_band === 'top10') items.push(['Review volume', 'Among the most-reviewed', 'More homeowners have left public reviews here than for nearly any other firm' + ofN + '.']);
  else if (enr.volume_band === 'top25') items.push(['Review volume', 'A deep track record', 'A deeper bank of homeowner reviews than most' + ofN + '.']);
  if (enr.tenure_band === 'top25') items.push(['Tenure', 'Long-established', 'Holds one of the older active CT contractor registrations' + ofN + ' — years on the books.']);
  if (!items.length) return '';
  const cards = items.map((it) => '<div class="w"><div class="k">' + esc(it[0]) + '</div><h3>' + esc(it[1]) + '</h3><p>' + esc(it[2]) + '</p></div>').join('');
  const tl = tLowerOf(trade);
  return '<h2 class="section-h">Vesta’s read</h2>' +
    '<p class="note" style="margin-top:-.2rem">What stands out about this ' + esc(tl || 'pro') + (tl ? ' pro' : '') +
    ' — Vesta’s own read of public records and review history, not a paid placement.</p>' +
    '<div class="vwhy">' + cards + '</div>';
}

// What homeowners say — the kept synthesis + structured highlights.
function homeownersBlock(enr) {
  const hasKnown = Array.isArray(enr && enr.known_for) && enr.known_for.length;
  if (!enr || (!enr.synthesis && !hasKnown)) return '';
  let html = '<h2 class="section-h">What homeowners say</h2>';
  const total = Number(enr.rating_count) || 0;
  if (total > 0) {
    html += '<p class="hw-count"><strong>' + esc(total.toLocaleString('en-US')) +
      '</strong> public reviews on record</p>';
  }
  if (enr.synthesis) {
    const analyzed = monthYear(enr.enriched_at);
    html += '<div class="card-block"><p style="font-size:.96rem;line-height:1.7">' + esc(enr.synthesis) + '</p>' +
      '<p class="fine" style="margin-top:.9rem">Summarized by Vesta from ' +
      'public reviews' + (analyzed ? ' · analyzed ' + esc(analyzed) : '') +
      ' — Vesta’s own wording, not the business’s, and never a copy of any single review.</p></div>';
  }
  if (hasKnown) {
    const cards = enr.known_for.filter((k) => k && (k.label || k.detail)).map((k) =>
      '<div class="w"><h3>' + esc(k.label || '') + '</h3><p>' + esc(k.detail || '') + '</p></div>').join('');
    if (cards) html += '<h3 class="section-h sub">What they’re known for</h3><div class="vwhy">' + cards + '</div>';
  }
  const rows = [];
  if (Array.isArray(enr.specialties) && enr.specialties.length)
    rows.push('<div class="kv"><span>Specialties</span><b style="text-align:right;max-width:64%">' + enr.specialties.map(esc).join(' · ') + '</b></div>');
  if (Array.isArray(enr.service_area) && enr.service_area.length)
    rows.push('<div class="kv"><span>Service area</span><b style="text-align:right;max-width:64%">' + enr.service_area.map(esc).join(', ') + '</b></div>');
  if (enr.owner_name)
    rows.push('<div class="kv"><span>Owner</span><b>' + esc(enr.owner_name) + '</b></div>');
  if (rows.length) html += '<div class="card-block" style="margin-top:.9rem">' + rows.join('') + '</div>';
  return html;
}

// Trade hiring guide — trade-level editorial, about no business.
function hiringGuideBlock(trade) {
  const g = HIRING_GUIDE[trade];
  if (!g) return '';
  const rows = g.map((it, i) =>
    '<div class="vangle"><div class="no">' + String(i + 1).padStart(2, '0') + '</div>' +
    '<div><h3>' + esc(it.t) + '</h3><p>' + esc(it.d) + '</p></div></div>').join('');
  return '<h2 class="section-h">What to check before you hire</h2>' +
    '<p class="note" style="margin-top:-.2rem">Vesta’s plain checklist for ' + esc(TRADE_PROS[trade] || 'this trade') +
    '. General guidance about the trade — not a claim about this business.</p>' +
    '<div class="vangles">' + rows + '</div>';
}

// M2 — compact cost line. Trade-level editorial (like the hiring guide, about NO
// business): the typical Fairfield County range + a deep-link to the full
// breakdown at /fairfield-county/<trade>#cost. Mirrors the directory's cost data
// from the single shared COST_GUIDE source. Frames as a planning range, never
// this firm's prices. Renders nothing for a trade with no cost entry.
function costLineBlock(trade) {
  const g = COST_GUIDE[trade];
  if (!g || !Array.isArray(g.rows) || !g.rows.length) return '';
  const tl = tLowerOf(trade);
  const top = g.rows[0];
  return '<section class="cost-line" aria-label="What ' + esc(tl) + ' costs in ' + COUNTY + '">' +
    '<h2 class="section-h">What ' + esc(tl) + ' costs in ' + COUNTY + '</h2>' +
    '<p class="note" style="margin-top:-.2rem">A planning range for the trade across ' + COUNTY +
      ' — general guidance, not a quote from this business.</p>' +
    '<div class="cl-card">' +
      '<div class="cl-row"><span class="cl-job">' + esc(top.job) + '</span><span class="cl-range">' + esc(top.range) + '</span></div>' +
      '<p class="cl-note">' + esc(g.typical) + '</p>' +
      '<a class="cl-link" href="/fairfield-county/' + trade + '#cost">See the full ' + esc(tl) + ' cost breakdown for ' + COUNTY + ' →</a>' +
    '</div>' +
  '</section>';
}

// Verified by Vesta (M3 centerpiece + inline M7) — promotes the actually-verified
// public-record credentials (HIC registration · state trade license · issuer-
// confirmed certs) from a buried chip row to a page centerpiece right under the
// hero. Each mark carries its CRITERION and the public SOURCE it is checked
// against — the M7 "every badge states its criterion" principle, inline. This is
// Vesta's sharpest contrast vs. Angi/HomeAdvisor's self-reported, unverified
// "Approved" badge. Vouch-don't-expose: every line is a public record, never a
// rating. Renders nothing when there is nothing verified (honest-light firms).
function verifiedBlock(enr, trade) {
  if (!enr) return '';
  const tl = tLowerOf(trade);
  const items = [];
  if (enr.registered) {
    const yr = enr.hic_issue_date ? +String(enr.hic_issue_date).slice(0, 4) : 0;
    items.push([
      'Registered CT contractor' + (yr && yr !== 1999 ? ' · since ' + yr : ''),
      'Holds an active Connecticut Home Improvement Contractor registration — the state credential every contractor doing home work in CT is required to carry.',
      'Confirmed in the CT Department of Consumer Protection registry'
    ]);
  }
  if (Array.isArray(enr.trade_license) && enr.trade_license.length) {
    items.push([
      'Licensed ' + (tl || 'trade'),
      'Carries an active Connecticut state trade license held by the individual tradesperson accountable for the work — a step beyond the basic registration.',
      'Verified in the CT eLicense state registry'
    ]);
  }
  if (Array.isArray(enr.certifications)) for (const c of enr.certifications) {
    if (c && c.issuer && c.level) items.push([
      c.issuer + ' ' + c.level,
      'A manufacturer certification — ' + c.issuer + ' authorizes only vetted contractors to carry it, which often unlocks longer workmanship warranties for you.',
      'Confirmed in ' + c.issuer + '’s own contractor directory'
    ]);
  }
  if (!items.length) return '';
  // Every item is a plain string (raw issuer names included) → escape uniformly
  // at emit. Never pre-escape, so issuer "&" can't double-encode.
  const cards = items.map((it) =>
    '<div class="vv-card">' +
      '<div class="vv-mark"><span class="vv-check" aria-hidden="true">✓</span><span>' + esc(it[0]) + '</span></div>' +
      '<p class="vv-what">' + esc(it[1]) + '</p>' +
      '<p class="vv-src">' + esc(it[2]) + ' · June 2026</p>' +
    '</div>').join('');
  return '<section class="vverify" id="verified" aria-label="Credentials Vesta verified">' +
    '<h2 class="section-h">Verified by Vesta</h2>' +
    '<p class="note" style="margin-top:-.2rem">Each mark below is checked against a public registry or the issuer’s own records — not self-reported by the business. Vesta vouches only what a public record confirms.</p>' +
    '<div class="vv-grid">' + cards + '</div>' +
  '</section>';
}

// Disclosure + the dedicated removal route (the on-page opt-out, /opt-out.html).
function disclosureRemoval(enr) {
  const q = '?place_id=' + encodeURIComponent(enr.place_id) +
    (enr.business_name ? '&name=' + encodeURIComponent(enr.business_name) : '');
  return '<p class="fine" style="margin-top:1.4rem;max-width:600px">' +
    'This is a public-record listing compiled by Vesta — not an endorsement, and not written by the business. ' +
    'The “What homeowners say” summary is written by Vesta’s AI from public reviews. ' +
    'Own this business? You can <a href="/opt-out' + q + '" style="color:var(--vgreen-2)">remove or correct this listing</a> ' +
    '(processed within 5 business days), or see <a href="/terms.html#directory" style="color:var(--vgreen-2)">how this works ›</a>.</p>';
}

// §11 Is this your business? — claim (free, consent) → the Atlas hook. Rendered
// server-side (crawlable copy); the form is wired by /profile.js.
function claimBlock(enr) {
  const ownerFirst = enr && enr.owner_name ? esc(String(enr.owner_name).trim().split(/\s+/)[0]) : '';
  const head = 'Is this your business' + (ownerFirst ? ', ' + ownerFirst : '') + '?';
  const claimInner =
    '<p class="am-lede2">Claim it free — it’s already in front of homeowners in ' + COUNTY +
      '. Claiming takes a minute, costs nothing, and puts your name on the read above.</p>' +
    '<form id="claim-form">' +
    '<div class="form-row"><label class="form-label" for="cn">Your name *</label><input class="form-input" type="text" id="cn" name="name" required maxlength="80"></div>' +
    '<div class="form-row row-pair">' +
    '<div><label class="form-label" for="cp">Phone *</label><input class="form-input" type="tel" id="cp" name="phone" required maxlength="20"></div>' +
    '<div><label class="form-label" for="ce">Email</label><input class="form-input" type="email" id="ce" name="email" maxlength="120"></div></div>' +
    '<button class="pill pill-ghost" type="submit">Claim this profile</button>' +
    '<span class="form-status" id="claim-status"></span></form>' +
    '<div class="am-rule"></div>';
  return '<details class="atlas-moment" id="claim">' +
    '<summary class="am-summary"><span class="am-sum-text">' +
      '<span class="am-eyebrow">For the owner · from 4THWALL</span>' +
      '<span class="am-h">' + head + '</span></span>' +
      '<span class="am-caret" aria-hidden="true"></span></summary>' +
    '<div class="am-body">' +
    claimInner +
    '<div class="am-plabel">Then put it to work — with Atlas</div>' +
    '<p class="am-lede">Vesta brings homeowners to your door. <b>Atlas makes sure not one of them slips away.</b> ' +
      'While you’re on the job, Atlas answers every call and text in your name — books the work, sends the reminder, asks for the review. ' +
      'The back office the best shops run, without hiring anyone.</p>' +
    '<div class="am-uses">' +
      '<div class="am-use"><div class="am-n">01</div><h3>Answers in your name, 24/7</h3><p>Every missed call and after-hours text gets a real reply — your services, your pricing, your voice. The lead never goes cold.</p></div>' +
      '<div class="am-use"><div class="am-n">02</div><h3>Books the job for you</h3><p>It checks availability, sets the appointment, and sends the reminder — so the estimate actually happens.</p></div>' +
      '<div class="am-use"><div class="am-n">03</div><h3>Earns the next review</h3><p>When the work’s done it follows up and asks the happy customer for the review that brings the next one.</p></div>' +
    '</div>' +
    '<div class="am-cta"><a class="am-pill" href="/atlas">See what Atlas does →</a>' +
    '<span class="am-fine">Vesta stays free. Atlas is the paid back office — for when the calls start coming.</span></div>' +
  '</div></details>';
}

// Mount points the client enhancer (/profile.js) fills — kept OUT of the
// crawlable content on purpose (live Google data + gated PII contact).
const GOOGLE_MOUNT = '<div id="cp-google" data-mount="google"></div>';
const CONTACT_MOUNT = '<div id="cp-contact" data-mount="contact"></div>';

// === JSON-LD (rich results + AI citation) ===================================
// Honest fields only: name, city/region, area served, our synthesis as the
// description, the credential layer via hasCredential, the Google Maps listing
// via sameAs. NO aggregateRating — Vesta never publishes raw stars.

const bizType = (trade) => BIZ_TYPE[trade] || 'HomeAndConstructionBusiness';

function credentials(enr, trade) {
  const out = [];
  if (enr.registered) {
    const cred = {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'Connecticut Home Improvement Contractor registration',
      recognizedBy: { '@type': 'GovernmentOrganization', name: 'Connecticut Department of Consumer Protection' }
    };
    out.push(cred);
  }
  if (Array.isArray(enr.trade_license) && enr.trade_license.length) {
    out.push({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: tradeLabel(trade) + ' license (Connecticut)',
      recognizedBy: { '@type': 'GovernmentOrganization', name: 'State of Connecticut' }
    });
  }
  if (Array.isArray(enr.certifications)) for (const c of enr.certifications) {
    if (c && c.issuer && c.level) out.push({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: c.issuer + ' ' + c.level,
      recognizedBy: { '@type': 'Organization', name: c.issuer }
    });
  }
  return out;
}

function profileJsonLd(enr, trade, label, canonical) {
  const biz = {
    '@type': bizType(trade),
    '@id': canonical + '#business',
    name: enr.business_name,
    url: canonical,
    areaServed: COUNTY + ', CT',
    knowsAbout: label,
    sameAs: ['https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(enr.place_id)]
  };
  if (enr.city) biz.address = { '@type': 'PostalAddress', addressLocality: enr.city, addressRegion: 'CT', addressCountry: 'US' };
  if (enr.synthesis) biz.description = enr.synthesis;
  else if (enr.signature) biz.description = enr.signature;
  // Tenure → foundingDate, but only when the registration year is real (the view
  // already nulls the 1999 sentinel out of tenure bands; mirror that guard here).
  if (enr.registered && enr.hic_issue_date) {
    const yr = +String(enr.hic_issue_date).slice(0, 4);
    if (yr && yr !== 1999) biz.foundingDate = String(enr.hic_issue_date).slice(0, 10);
  }
  const creds = credentials(enr, trade);
  if (creds.length) biz.hasCredential = creds;

  const graph = [
    ...publisherNodes(),
    {
      '@type': 'ProfilePage',
      '@id': canonical + '#webpage',
      url: canonical,
      name: enr.business_name + ' — ' + label + ' in ' + (enr.city || COUNTY) + ', CT',
      isPartOf: { '@id': WEBSITE_ID },
      publisher: { '@id': ORG_ID },
      about: { '@id': canonical + '#business' },
      mainEntity: { '@id': canonical + '#business' },
      breadcrumb: { '@id': canonical + '#breadcrumb' },
      ...(enr.enriched_at ? { dateModified: String(enr.enriched_at).slice(0, 10) } : {})
    },
    biz,
    {
      '@type': 'BreadcrumbList',
      '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vesta', item: SITE + '/vesta' },
        { '@type': 'ListItem', position: 2, name: label + ' in ' + COUNTY + ', CT', item: SITE + '/fairfield-county/' + trade },
        { '@type': 'ListItem', position: 3, name: enr.business_name }
      ]
    }
  ];

  // Escape "<" so the JSON can never break out of the <script> tag.
  return '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') +
    '</script>';
}

// === shell ==================================================================

const ATLAS_MOMENT_CSS =
  '<style>' +
  '.hw-count{font-family:var(--mono,inherit);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--vmut,#6b654b);margin:.1rem 0 1rem}' +
  '.hw-count strong{font-family:var(--display,inherit);font-size:1.15rem;font-weight:600;letter-spacing:-.01em;color:var(--vink,#5C5346)}' +
  '.atlas-moment{--a-bg:#191712;--a-bg2:#211e16;--a-line:rgba(222,206,164,.18);--a-sand:#dcceaa;--a-sand-2:#ece2c8;--a-mut:rgba(236,226,200,.6);position:relative;margin:2.4rem 0 1rem;padding:clamp(1.6rem,3.6vw,2.5rem);background:radial-gradient(620px 320px at 86% -120px,rgba(222,206,164,.12),transparent 60%),linear-gradient(180deg,var(--a-bg2),var(--a-bg));border:1px solid var(--a-line);border-radius:24px;box-shadow:0 44px 96px -52px rgba(0,0,0,.92)}' +
  '.atlas-moment .am-eyebrow{font-family:var(--mono);font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:var(--a-sand);margin-bottom:.7rem}' +
  '.atlas-moment .am-h{font-family:var(--display);font-size:clamp(1.5rem,3vw,2.05rem);font-weight:500;letter-spacing:-.02em;color:var(--vcream);line-height:1.14}' +
  '.atlas-moment .am-lede2{font-size:.92rem;color:var(--a-mut);line-height:1.65;margin:.7rem 0 1.1rem;max-width:60ch}' +
  '.atlas-moment form{max-width:520px}' +
  '.atlas-moment .am-rule{height:1px;background:var(--a-line);margin:1.9rem 0 1.6rem}' +
  '.atlas-moment .am-plabel{font-family:var(--mono);font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--a-sand);margin-bottom:.6rem}' +
  '.atlas-moment .am-lede{font-family:var(--display);font-size:clamp(1.08rem,2vw,1.3rem);font-weight:400;line-height:1.55;letter-spacing:-.01em;color:var(--vcream);max-width:64ch;margin:0}' +
  '.atlas-moment .am-lede b{color:var(--a-sand-2);font-weight:600}' +
  '.atlas-moment .am-uses{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.9rem;margin:1.5rem 0 0}' +
  '.atlas-moment .am-use{background:rgba(222,206,164,.05);border:1px solid var(--a-line);border-radius:16px;padding:1.15rem 1.25rem}' +
  '.atlas-moment .am-use .am-n{font-family:var(--mono);font-size:.66rem;letter-spacing:.14em;color:var(--a-sand);margin-bottom:.5rem}' +
  '.atlas-moment .am-use h3{font-family:var(--display);font-size:1.04rem;font-weight:500;letter-spacing:-.015em;color:var(--vcream);margin-bottom:.35rem}' +
  '.atlas-moment .am-use p{font-size:.82rem;color:var(--a-mut);line-height:1.6}' +
  '.atlas-moment .am-cta{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1.5rem}' +
  '.atlas-moment .am-pill{display:inline-flex;align-items:center;gap:.4rem;background:linear-gradient(180deg,var(--a-sand-2),var(--a-sand));color:#1a1813;font-family:var(--body);font-size:.9rem;font-weight:600;padding:.7rem 1.3rem;border-radius:999px;text-decoration:none;transition:transform .16s,box-shadow .16s}' +
  '.atlas-moment .am-pill:hover{transform:translateY(-1px);box-shadow:0 14px 30px -12px rgba(222,206,164,.45)}' +
  '.atlas-moment .am-fine{font-size:.76rem;color:var(--a-mut);max-width:34ch;line-height:1.5}' +
  '.atlas-moment .form-input{background:rgba(0,0,0,.22);border-color:var(--a-line);color:var(--vcream)}' +
  '.atlas-moment .form-label{color:var(--a-mut)}' +
  '.atlas-moment .pill-ghost{border-color:var(--a-sand);color:var(--a-sand-2)}' +
  '.atlas-moment .pill-ghost:hover{background:rgba(222,206,164,.1)}' +
  '.atlas-moment>summary.am-summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:1rem}' +
  '.atlas-moment>summary.am-summary::-webkit-details-marker{display:none}' +
  '.atlas-moment .am-sum-text{display:flex;flex-direction:column;gap:.5rem}' +
  '.atlas-moment .am-summary .am-eyebrow{margin:0}' +
  '.atlas-moment .am-summary .am-h{margin:0}' +
  '.atlas-moment .am-caret{flex:none;font-family:var(--mono);font-size:1.7rem;line-height:1;color:var(--a-sand)}' +
  '.atlas-moment .am-caret::before{content:"+"}' +
  '.atlas-moment[open] .am-caret::before{content:"\\2013"}' +
  '.atlas-moment .am-body{margin-top:1.4rem}' +
  '.cp-gref{margin-top:1.8rem;max-width:680px}' +
  '.rel-block{margin:2.8rem 0 .5rem;padding-top:1.9rem;border-top:1px solid var(--line,rgba(18,16,14,.12))}' +
  '.rel-h{font-family:var(--display);font-size:clamp(1.15rem,2.4vw,1.5rem);font-weight:500;letter-spacing:-.02em;margin:0 0 .5rem;color:var(--vink,#12100e)}' +
  '.rel-lede{font-size:.92rem;line-height:1.6;color:var(--vmut,rgba(18,16,14,.6));max-width:62ch;margin:0 0 1.2rem}' +
  '.rel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem;margin-bottom:1.2rem}' +
  '.rel-card{display:flex;flex-direction:column;gap:.25rem;padding:.85rem 1rem;border:1px solid var(--line,rgba(18,16,14,.12));border-radius:14px;text-decoration:none;background:var(--vcard,transparent);transition:border-color .16s,transform .16s}' +
  '.rel-card:hover{border-color:var(--vgreen-2,#4a4b2f);transform:translateY(-1px)}' +
  '.rel-name{font-weight:600;font-size:.95rem;color:var(--vink,#12100e);line-height:1.25}' +
  '.rel-sub{font-family:var(--mono);font-size:.7rem;letter-spacing:.04em;text-transform:uppercase;color:var(--vdim,rgba(18,16,14,.45))}' +
  '.vverify{margin:1.4rem 0 2.2rem;padding:clamp(1.3rem,3vw,1.9rem);border:1px solid var(--line,rgba(18,16,14,.12));border-radius:20px;background:var(--vcard,rgba(74,75,47,.035))}' +
  '.vverify .vv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.8rem;margin-top:1rem}' +
  '.vverify .vv-card{padding:1rem 1.1rem;border:1px solid var(--line,rgba(18,16,14,.1));border-radius:14px;background:rgba(255,255,255,.6)}' +
  '.vverify .vv-mark{display:flex;align-items:flex-start;gap:.45rem;font-family:var(--display);font-weight:600;font-size:1rem;letter-spacing:-.01em;color:var(--vink,#12100e);line-height:1.25}' +
  '.vverify .vv-check{flex:none;display:inline-flex;align-items:center;justify-content:center;width:1.15rem;height:1.15rem;margin-top:.04rem;border-radius:999px;background:var(--vgreen-2,#4a4b2f);color:#fff;font-size:.7rem;font-weight:700}' +
  '.vverify .vv-what{font-size:.85rem;line-height:1.55;color:var(--vmut,rgba(18,16,14,.7));margin:.5rem 0 .55rem}' +
  '.vverify .vv-src{font-family:var(--mono);font-size:.66rem;letter-spacing:.03em;color:var(--vdim,rgba(18,16,14,.5));line-height:1.45}' +
  '.cost-line{margin:1.6rem 0 .5rem}' +
  '.cost-line .cl-card{border:1px solid var(--line,rgba(18,16,14,.12));border-radius:16px;padding:1.1rem 1.2rem;background:var(--vcard,rgba(74,75,47,.035));margin-top:.7rem}' +
  '.cost-line .cl-row{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin-bottom:.5rem}' +
  '.cost-line .cl-job{font-weight:600;font-size:.95rem;color:var(--vink,#12100e);line-height:1.3}' +
  '.cost-line .cl-range{font-family:var(--mono);font-size:.92rem;font-weight:500;color:var(--vgreen-2,#4a4b2f);white-space:nowrap}' +
  '.cost-line .cl-note{font-size:.85rem;line-height:1.6;color:var(--vmut,rgba(18,16,14,.7));margin:0 0 .85rem;max-width:64ch}' +
  '.cost-line .cl-link{font-size:.82rem;font-weight:500;color:var(--vgreen-2,#4a4b2f);text-decoration:none}' +
  '.cost-line .cl-link:hover{text-decoration:underline}' +
  '</style>';

function shell({ title, description, canonical, indexable, jsonld, body }) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="description" content="' + esc(description) + '">\n' +
    (indexable ? '' : '<meta name="robots" content="noindex">\n') +
    '<link rel="canonical" href="' + esc(canonical) + '">\n' +
    '<meta property="og:type" content="profile">\n' +
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
    ATLAS_MOMENT_CSS + '\n' +
    jsonld + '\n' +
    '<script src="/home.js" defer></script>\n' +
    '<script src="/profile.js" defer></script>\n' +
    '</head>\n<body>\n' +
    // Profile = single-contractor landing page: logo returns to THIS profile,
    // no "Find a pro" escape to a competitor (the lead stays on the pro they found).
    navHtml({ logoHref: canonical, browse: false }) +
    '<main>\n' + body + '\n</main>\n' +
    FOOTER +
    '<script>document.addEventListener("DOMContentLoaded",function(){try{if(window.HOME&&HOME.navAccount)HOME.navAccount();}catch(e){}});</script>\n' +
    '</body>\n</html>\n';
}

// Lateral "Compare top [trade]" block — the honest-recommender close. Placed at
// the BOTTOM of the profile (after the contact CTA) so the page still LEADS with
// the contractor the visitor came for; this is the only exit and it's a footer.
// Links only index-ready siblings (the connected, crawlable corpus). Renders
// nothing when there are no siblings (e.g. a one-firm trade).
function relatedBlock(siblings, trade) {
  if (!trade || !Array.isArray(siblings) || !siblings.length) return '';
  const tl = tLowerOf(trade);
  const cards = siblings.slice(0, 3).map((s) => {
    if (!s || !s.place_id || !s.business_name) return '';
    return '<a class="rel-card" href="/c/' + encodeURIComponent(s.place_id) + '">' +
      '<span class="rel-name">' + esc(s.business_name) + '</span>' +
      '<span class="rel-sub">' + esc(s.city ? s.city + ', CT' : COUNTY + ', CT') + '</span>' +
    '</a>';
  }).join('');
  if (!cards) return '';
  return '<section class="rel-block" aria-label="Compare other top ' + esc(tl) + ' in ' + COUNTY + '">' +
    '<h2 class="rel-h">Compare top ' + esc(tl) + ' in ' + COUNTY + '</h2>' +
    '<p class="rel-lede">Vesta ranks ' + esc(tl) + ' across ' + COUNTY + ' by homeowner consensus and the public record — no ads, no pay-to-play. A few others worth a look:</p>' +
    '<div class="rel-grid">' + cards + '</div>' +
    '<a class="pill pill-ghost pill-sm" href="/fairfield-county/' + trade + '">See the full ranked list →</a>' +
  '</section>';
}

// === entry points ===========================================================

export function renderContractorHTML(enr, siblings = []) {
  const trade = enr.trade || '';
  const label = tradeLabel(trade) || 'Contractor';
  const tl = tLowerOf(trade);
  const canonical = SITE + '/c/' + encodeURIComponent(enr.place_id);
  const indexable = isIndexable(enr);

  const title = enr.business_name + ' — ' + label + ' in ' + (enr.city || COUNTY) + ', CT | Vesta';
  const description = enr.synthesis
    ? String(enr.synthesis).slice(0, 154) + (String(enr.synthesis).length > 154 ? '…' : '')
    : (label + ' contractor in ' + (enr.city || COUNTY) + ', CT — vouched by the public record. A plain-English read from Vesta.');

  // Request-through-Vesta CTA (a plain link — no JS needed).
  const reqHref = '/vesta/search?mode=request&place=' + encodeURIComponent(enr.place_id) +
    (enr.zip ? '&zip=' + encodeURIComponent(enr.zip) : '') + (trade ? '&trade=' + trade : '');

  const hero =
    '<section class="page-hero" id="hero">' +
      '<a class="crumb" href="' + (trade ? '/fairfield-county/' + trade : '/vesta') + '">← ' + esc(label ? label + ' in ' + COUNTY : 'Vesta') + '</a>' +
      '<h1 class="page-h">' + esc(enr.business_name) + '</h1>' +
      '<p class="page-sub">' + (label ? esc(label) + ' · ' : '') + esc((enr.city || COUNTY) + ', CT') + '</p>' +
      '<div class="badges"><span class="badge plain">◆ Vesta-analyzed from public records</span></div>' +
      '<div style="margin:1.1rem 0 .2rem"><a class="pill pill-orange" href="' + reqHref + '">Request through Vesta <span class="arr">→</span></a></div>' +
      '<p class="fine">One form — Vesta carries your request to them, replies come straight to you.</p>' +
      '<p class="note">Vesta built this profile from public records and homeowner reviews — an independent read, not a paid placement. ' +
        esc(enr.business_name) + ' hasn’t joined Vesta’s verified network yet, so there’s no documented job history to show here.</p>' +
    '</section>';

  const body = '<section class="section" id="body">' +
    verifiedBlock(enr, trade) +
    signatureBlock(enr) +
    vestaReadBlock(enr, trade) +
    homeownersBlock(enr) +
    hiringGuideBlock(trade) +
    costLineBlock(trade) +
    '<div class="cp-gref">' + GOOGLE_MOUNT + '</div>' +
    CONTACT_MOUNT +
    claimBlock(enr) +
    relatedBlock(siblings, trade) +
    disclosureRemoval(enr) +
  '</section>';

  return shell({
    title, description, canonical, indexable,
    jsonld: profileJsonLd(enr, trade, label, canonical),
    body: hero + body
  });
}

// 404 — a clean, noindex "profile not found" page.
export function renderNotFoundHTML() {
  const canonical = SITE + '/vesta';
  const body =
    '<section class="page-hero" id="hero">' +
      '<a class="crumb" href="/vesta">← Vesta</a>' +
      '<h1 class="page-h">Profile not found</h1>' +
      '<p class="page-sub">This listing may have moved or been removed. ' +
      '<a href="/vesta/search" style="color:var(--vgreen-2)">Search Vesta</a> for a pro near you.</p>' +
    '</section>';
  return shell({
    title: 'Profile not found | Vesta',
    description: 'This Vesta contractor profile could not be found.',
    canonical, indexable: false,
    jsonld: '', body
  });
}
