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
import { operatedBlocks, SYNTHETIC_CHAIN } from './_blocks-operated.mjs';

// ── Fusion (TP-6.1) ─────────────────────────────────────────────────────────
// The operated-record section: ledger-measured facts ("responds in ~4 min,
// measured across 212 real inbounds") rendering as their own evidence lane,
// never blended into Vesta's public-record read. FUSION_LIVE is the go-live
// switch — it stays false until a real Atlas client's chain-verified signals
// exist AND Drew flips it (wall W1). The synthetic preview path renders the
// template with loud not-this-business labeling and is never linked or cached.
export const FUSION_LIVE = false;

// --- the public-view read (mirror of the old contractor.html client fetch) ---
export const PROFILE_SELECT =
  'place_id,business_name,city,zip,trade,registered,hic_issue_date,trade_license,' +
  'certifications,synthesis,signature,known_for,specialties,' +
  'service_area,owner_name,volume_band,rating_band,tenure_band,trade_n,rating_count,' +
  'capabilities,value_tier,deep_review_count,best_for,project_scale,responsiveness,' +
  'pricing_profile,recurring_praise,crew_named,enriched_at,index_status';
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
const TRADE_FIRMS = { roofing: 'roofing companies', hvac: 'HVAC companies', plumbing: 'plumbing companies', electrical: 'electrical contractors', paving: 'paving companies', lawn_care: 'lawn & landscaping companies', painting: 'painting companies', masonry: 'masonry companies', tree_service: 'tree services', flooring: 'flooring companies', windows_doors: 'window & door companies', pool: 'pool companies' };
const TRADE_PROS  = { roofing: 'roofers', hvac: 'HVAC contractors', plumbing: 'plumbers', electrical: 'electricians', paving: 'paving contractors', lawn_care: 'lawn & landscaping pros', painting: 'painters', masonry: 'masons', tree_service: 'tree crews', flooring: 'flooring installers', windows_doors: 'window & door installers', pool: 'pool pros' };
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

// Trim prose to ~max words, cutting at the last sentence boundary that fits so
// an extracted passage never ends mid-thought. Falls back to a word cut + "…".
// Why this exists: AI answer engines lift a passage, not a page — a passage that
// ends mid-sentence reads as broken wherever it lands (route-map § THE WAR PLAN).
function trimWords(text, max) {
  const words = String(text || '').trim().split(/\s+/);
  if (!words.length || !words[0]) return '';
  if (words.length <= max) return words.join(' ');
  const cut = words.slice(0, max).join(' ');
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastStop > cut.length * 0.45 ? cut.slice(0, lastStop + 1) : cut.replace(/[,;:]$/, '') + '…';
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
  tree_service: [
    { t: 'Insurance first — this is the one trade where it decides everything', d: "Tree work is the riskiest job that happens on a home lot. Ask for current liability AND workers'-comp certificates from the insurer, not a photocopy — if an uninsured climber is hurt on your property, the claim can land on you." },
    { t: 'Ask about the CT arborist license for tree care', d: 'Connecticut licenses arborists through DEEP — pruning, cabling, and treating trees for hire is licensed work. Straight removals sit outside the license, but for anything meant to keep a tree healthy, ask whether a licensed arborist is on the job.' },
    { t: 'Get the full scope in writing', d: 'Removal vs. pruning, whether the stump is ground out, what happens to the wood and brush, lawn and driveway protection, and whether a crane is needed — each changes the price. A one-line "take the tree down" quote hides all of it.' },
    { t: 'Be wary of storm-chasers', d: 'Crews that knock on the door after a storm, quote cash-only, or push same-day decisions are the classic red flag in this trade. A reputable crew gives a written estimate — even in an emergency.' }
  ],
  masonry: [
    { t: 'Confirm CT registration & insurance', d: 'Masonry, hardscape, and chimney work is home-improvement work — the mason should hold an active Connecticut Home Improvement Contractor registration and carry liability coverage. Ask to see both before any demolition starts.' },
    { t: 'Get base prep and drainage in writing', d: 'Patios, walkways, and walls last or fail on what is underneath — excavation depth, a compacted gravel base, and how water is directed away. A quote that only describes the visible stone hides the part that decides longevity.' },
    { t: 'Match the material and the repair to the house', d: 'Ask which stone, brick, or paver and what pattern, and on older or historic homes, how new work and mortar will match the existing. For chimneys and foundations, confirm whether they are rebuilding or repairing — and why.' },
    { t: 'Pin down permits, timeline, and cleanup', d: 'Belgian-block aprons and structural walls can require local permits — confirm who pulls them. Spell out the schedule, site protection, daily cleanup, and how long the work is guaranteed.' }
  ],
  flooring: [
    { t: 'Confirm CT registration & insurance', d: 'Flooring installation and refinishing is home-improvement work — the installer should hold an active Connecticut Home Improvement Contractor registration and carry liability coverage. Ask to see both before work starts.' },
    { t: 'Get the prep underfoot in writing', d: 'A floor lasts or fails on what is beneath it — moisture testing, subfloor repair and leveling, acclimating the wood before install. A quote that only prices the visible boards hides the part that decides whether they cup, gap, or squeak later.' },
    { t: 'Refinish vs. replace is the real first question', d: 'Solid hardwood can usually be sanded and refinished for a fraction of replacement — but not always, and engineered floors only take so many sandings. Ask the installer to make the case for the path they quote, not just price one.' },
    { t: 'Pin down dust, finish, and the timeline', d: 'Sanding is disruptive — ask about dust containment, which finish (oil vs. water-based changes cure time and smell), how long before furniture goes back, and who moves it. Spell out cleanup and the warranty on both material and labor.' }
  ],
  windows_doors: [
    { t: 'Confirm CT registration & insurance', d: 'Window and door replacement is home-improvement work — the installer should hold an active Connecticut Home Improvement Contractor registration and carry liability coverage. Ask to see both before work starts.' },
    { t: 'Ask who actually installs it', d: 'Some window sellers subcontract installation to whoever is available that week. Ask whether the crew is in-house, and who is named to lead your specific job.' },
    { t: 'Pin down the product line and glass spec', d: 'Brand, series, glazing (double vs. triple pane), and low-E or gas-fill options change both price and performance. Get the exact spec in writing, not just "energy-efficient windows."' },
    { t: 'Nail down measurements before ordering', d: 'Custom windows and doors are made to the measurement taken — a mistake here means weeks of delay waiting on a remake. Ask who re-verifies measurements before the order is placed.' }
  ],
  pool: [
    { t: 'Confirm CT registration & insurance', d: 'Pool construction and major renovation is home-improvement work — the firm should hold an active Connecticut Home Improvement Contractor registration and carry liability coverage. Ask to see both before signing.' },
    { t: 'Get permits and the C-of-O in writing', d: 'Unpermitted or incomplete-permit pool builds surface at home sale, sometimes years later, and can block a closing. Ask who files the permit, get the certificate of occupancy in the contract, and confirm it before final payment.' },
    { t: 'Pin down the build type and scope', d: 'Gunite, fiberglass, and vinyl liner pools differ sharply in cost, timeline, and what a renovation later requires. Get the exact spec, decking and coping scope, and equipment brand in writing — not just "a new pool."' },
    { t: 'Ask what a season of service actually costs', d: 'A weekly-maintenance quote often excludes chemicals, opening, and closing. Ask what is included in the base price versus billed separately before the season starts.' }
  ]
};

// === content blocks (all from the public-view row `enr`) ====================

function signatureBlock(enr) {
  if (!enr || !enr.signature) return '';
  return '<div class="vturn" style="margin:.6rem 0 .2rem"><p>' + esc(enr.signature) + '</p></div>';
}

// Where it stands — tailored, strongest-first: scarce specialty → tenure →
// quantified review volume → rating BAND (never the score) → one standout
// capability if thin. POSITIVE-ONLY, no rank/score. Mirror of vesta-app.html
// profStandingHTML, emitted with the SSR's own card classes (.vwhy/.w/.k).
// Per-trade. An entry exists ONLY for a capability that is genuinely scarce in
// the live data (present in ≥1 firm AND ≤25% of a trade's synth firms hold it),
// so "one of the few" stays true — verified against profile_enrichment_public
// each review-intelligence pass. Scarcity language is tiered to measured rarity:
// ≤5% "one of the very few" · 6–15% "one of the few" · 16–25% relative ("many
// don't" / "more than most"), never a hard count. Common caps (e.g. EV chargers
// at ~half of electricians) are deliberately omitted — they don't differentiate.
const STANDING_SPECIALTY = {
  roofing: {
    metal_roofing:         ['Specialty', 'Metal-roof specialist', 'One of the very few %F we track in ' + COUNTY + ' equipped for standing-seam and metal roofs — an expertise homeowners say is hard to find.'],
    in_house_masonry:      ['Specialty', 'In-house masonry', 'One of the few %F that rebuild chimneys and masonry alongside the roof, in-house rather than subbed out.'],
    slate_cedar_specialty: ['Specialty', 'Slate &amp; cedar', 'Among the few %F we track who work slate and cedar roofs, not just asphalt shingle.'],
    flat_low_slope:        ['Specialty', 'Flat &amp; low-slope', 'Equipped for flat and low-slope roofs (EPDM / membrane) — a job many shingle-only roofers turn down.'],
    commercial_capable:    ['Specialty', 'Commercial-capable', 'Handles commercial roofs alongside residential — a wider remit than most %F we track.'],
  },
  hvac: {
    oil_to_gas:          ['Specialty', 'Oil-to-gas conversions', 'One of the very few %F we track that handle full oil-to-gas heating conversions — a switchover most installers refer out.'],
    commercial_capable:  ['Specialty', 'Commercial-capable', 'One of the very few %F we track equipped for commercial HVAC alongside residential work.'],
    ductless_mini_split: ['Specialty', 'Ductless mini-splits', 'One of the few %F we track who specialize in ductless mini-splits — the answer for additions and homes without ductwork.'],
    boiler_specialty:    ['Specialty', 'Boiler &amp; hydronic heat', 'Services boilers and hydronic heat, not just forced air — a job many %F we track don\'t take on.'],
  },
  plumbing: {
    hydro_jetting:   ['Specialty', 'Hydro-jetting', 'One of the very few %F we track equipped for hydro-jetting — high-pressure sewer-line clearing most plumbers sub out.'],
    septic_service:  ['Specialty', 'Septic service', 'One of the very few %F we track that service septic systems alongside standard plumbing.'],
    water_treatment: ['Specialty', 'Water treatment', 'One of the very few %F we track that install and service whole-home water-treatment and filtration.'],
    well_pump:       ['Specialty', 'Well-pump systems', 'One of the few %F we track who handle well-pump systems — essential for the county\'s many well-water homes.'],
  },
  electrical: {
    industrial_capable: ['Specialty', 'Industrial-capable', 'One of the very few %F we track equipped for industrial electrical work alongside residential.'],
    solar_install:      ['Specialty', 'Solar tie-ins', 'One of the very few %F we track that install and tie in solar systems.'],
    battery_backup:     ['Specialty', 'Battery backup', 'One of the very few %F we track who install whole-home battery-backup systems.'],
    knob_and_tube:      ['Specialty', 'Knob-and-tube replacement', 'One of the very few %F we track who take on knob-and-tube removal — older-home rewiring many electricians avoid.'],
    whole_home_rewire:  ['Specialty', 'Whole-home rewiring', 'One of the very few %F we track who handle full whole-home rewires, not just panel and circuit work.'],
    pool_spa_wiring:    ['Specialty', 'Pool &amp; spa wiring', 'One of the few %F we track equipped for pool and spa wiring — specialized, code-heavy work.'],
    smart_home:         ['Specialty', 'Smart-home &amp; automation', 'Installs smart-home and automation systems — a remit more than most %F we track offer.'],
    low_voltage_data:   ['Specialty', 'Low-voltage &amp; data', 'Wires low-voltage and structured data alongside standard electrical — more than most %F we track take on.'],
  },
  paving: {
    private_road:      ['Specialty', 'Private roads &amp; lanes', 'One of the very few %F we track equipped for private-road and shared-lane paving — bigger and more complex than a driveway.'],
    retaining_wall:    ['Specialty', 'Retaining walls', 'One of the very few %F we track that build retaining walls alongside paving.'],
    commercial_paving: ['Specialty', 'Commercial paving', 'Handles commercial lots and large-scale paving — a wider remit than most %F we track.'],
    masonry_capable:   ['Specialty', 'In-house masonry', 'Pairs masonry work with paving in-house — more than most %F we track offer.'],
  },
  lawn_care: {
    commercial_grounds: ['Specialty', 'Commercial grounds', 'One of the very few %F we track that maintain commercial and institutional grounds alongside residential.'],
    outdoor_lighting:   ['Specialty', 'Landscape lighting', 'One of the few %F we track who design and install landscape lighting.'],
    paver_installation: ['Specialty', 'Paver patios &amp; walkways', 'One of the few %F we track who install paver patios and walkways in-house.'],
    stump_grinding:     ['Specialty', 'Stump grinding', 'One of the few %F we track equipped for stump grinding and removal.'],
    irrigation_install: ['Specialty', 'Irrigation systems', 'One of the few %F we track that design and install irrigation systems.'],
    water_features:     ['Specialty', 'Water features', 'One of the few %F we track who build water features — ponds, falls, and fountains.'],
    retaining_wall:     ['Specialty', 'Retaining walls', 'Builds retaining walls alongside landscaping — a job many %F we track don\'t take on.'],
    drainage_solutions: ['Specialty', 'Drainage solutions', 'Solves yard drainage and grading, not just planting — more than most %F we track handle.'],
    grading_excavation: ['Specialty', 'Grading &amp; excavation', 'Equipped for grading and excavation — a heavier capability than most %F we track offer.'],
    masonry_capable:    ['Specialty', 'In-house masonry', 'Pairs masonry and hardscape with landscaping in-house — more than most %F we track.'],
  },
  painting: {
    faux_decorative_finishes: ['Specialty', 'Faux &amp; decorative finishes', 'One of the very few %F we track who do faux and decorative finishes — specialized, artisan work.'],
    venetian_plaster:         ['Specialty', 'Venetian plaster', 'One of the very few %F we track skilled in Venetian plaster and lime finishes.'],
    epoxy_floor_coating:      ['Specialty', 'Epoxy floor coatings', 'One of the very few %F we track that apply epoxy floor coatings — garages, basements, and shops.'],
    specialty_coatings:       ['Specialty', 'Specialty coatings', 'One of the very few %F we track equipped for specialty and high-performance coatings.'],
    masonry_brick_painting:   ['Specialty', 'Masonry &amp; brick painting', 'One of the very few %F we track who properly prep and paint masonry and brick.'],
    commercial_capable:       ['Specialty', 'Commercial-capable', 'One of the few %F we track that handle commercial painting alongside residential.'],
  },
  masonry: {
    foundation_repair:      ['Specialty', 'Foundation repair', 'One of the very few %F we track that take on foundation repair and structural masonry.'],
    stucco_eifs:            ['Specialty', 'Stucco &amp; EIFS', 'One of the very few %F we track skilled in stucco and EIFS systems.'],
    pool_deck:              ['Specialty', 'Pool decks &amp; coping', 'Builds pool decks and coping — a job many %F we track don\'t take on.'],
    fireplace_construction: ['Specialty', 'Fireplaces &amp; fire pits', 'Builds outdoor fireplaces and fire pits — more than most %F we track offer.'],
  },
  tree_service: {
    crane_capable:      ['Specialty', 'Crane removals', 'One of the very few %F we track equipped for crane-assisted removals — the answer for oversized trees or tight-access lots.'],
    land_clearing:      ['Specialty', 'Land &amp; lot clearing', 'One of the few %F we track that take on full land and lot clearing, not just single-tree removal.'],
    cabling_bracing:    ['Specialty', 'Cabling &amp; bracing', 'One of the few %F we track who cable and brace structurally weak trees to save them — specialized arborist work.'],
    commercial_capable: ['Specialty', 'Commercial-capable', 'Handles commercial and municipal tree work alongside residential — a wider remit than most %F we track.'],
  },
  flooring: {
    subfloor_leveling_repair: ['Specialty', 'Subfloor leveling &amp; repair', 'One of the few %F we track that fix the subfloor underneath — leveling and structural repair before a new floor ever goes down.'],
    water_damage_repair:      ['Specialty', 'Water-damage restoration', 'One of the few %F we track equipped to rescue a floor after water damage rather than just replace it.'],
    dustless_refinishing:     ['Specialty', 'Dustless refinishing', 'One of the few %F we track offering dust-contained refinishing — a cleaner process most crews don\'t provide.'],
    commercial_capable:       ['Specialty', 'Commercial-capable', 'Handles commercial flooring alongside residential — a wider remit than most %F we track.'],
    herringbone_parquet_inlay:['Specialty', 'Herringbone &amp; pattern work', 'One of the very few %F we track skilled in herringbone, parquet, and custom pattern floors.'],
    home_gym_flooring:        ['Specialty', 'Home-gym flooring', 'Specializes in home-gym flooring — a niche most %F we track don\'t offer.'],
  },
  windows_doors: {
    egress_windows:            ['Specialty', 'Egress window installs', 'One of the very few %F we track equipped for basement egress-window installs — foundation-cutting work most window companies don\'t take on.'],
    european_custom_windows:   ['Specialty', 'European &amp; custom windows', 'One of the very few %F we track skilled in European tilt-turn and architect-grade custom windows.'],
    shower_doors_custom_glass: ['Specialty', 'Shower doors &amp; custom glass', 'Fabricates custom glass and shower enclosures in-house — more than most %F we track offer.'],
    automatic_gates_openers:   ['Specialty', 'Gates &amp; automatic openers', 'One of the few %F we track that install and service automatic gates and openers alongside standard doors.'],
    storm_windows_doors:       ['Specialty', 'Storm windows &amp; doors', 'One of the few %F we track carrying storm windows and doors as a standing line, not a special order.'],
    commercial_capable:        ['Specialty', 'Commercial-capable', 'Handles commercial glazing and door work alongside residential — a wider remit than most %F we track.'],
  },
  pool: {
    pool_water_delivery:       ['Specialty', 'Pool water delivery', 'One of the very few %F we track that deliver bulk truckload water for a fill — not just chemicals and service.'],
    fiberglass_install:        ['Specialty', 'Fiberglass pools', 'One of the few %F we track specializing in fiberglass pool construction, crane-set in days rather than weeks.'],
    masonry_patio_integration: ['Specialty', 'Masonry &amp; patio integration', 'Builds the surrounding patio, coping, and hardscape in-house alongside the pool — more than most %F we track offer.'],
    custom_design_landscape:   ['Specialty', 'Custom design on difficult sites', 'Takes on sloped, tight, or "impossible" yards and designs a pool around them — a job many %F we track turn down.'],
    above_ground_pools:        ['Specialty', 'Above-ground pools', 'One of the few %F we track that install and service above-ground pools — a segment much of the county declines.'],
    hot_tub_spa_service:       ['Specialty', 'Hot tub &amp; spa service', 'Services hot tubs and spas alongside pools — more than most %F we track take on.'],
    leak_detection_repair:     ['Specialty', 'Leak detection &amp; repair', 'Diagnoses and fixes underground and equipment leaks other %F we track have left unresolved.'],
    green_pool_recovery:       ['Specialty', 'Green-pool recovery', 'One of the few %F we track known for rescuing a neglected or green pool rather than recommending a drain-and-restart.'],
  },
};
// Specialty capabilities only — NOT a standing/rank claim, so it can sit
// alongside "The Record" without repeating the dot-strip's percentile language.
// (The old version of this block also carried volume/rating/tenure-band
// "Where it stands" cards that restated standing in prose on every profile —
// cut per Drew's rule: standing appears in exactly ONE place, the dot strip.)
// The answer block — the extraction unit (route-map § THE WAR PLAN, Phase 0A).
// Sits in the hero, inside the first ~60 words of rendered text, and is written
// to be SELF-CONTAINED: it names the firm, the trade and the town before the
// verdict, so a passage lifted into an AI answer still says who it is about.
// Measured basis: relevance + in-page position are the primary citation
// determinants (252k-trial factorial study); answer belongs in the first 200
// words. The visible "verified <Mon YYYY>" rides here rather than only in the
// rail because `.cp-facts` is display:none under 760px — the freshness signal
// was invisible to every mobile reader and to anything reading mobile HTML.
// Honesty: every branch degrades to what we actually hold. No synthesis, no
// verdict — it says so.
function answerBlock(enr, trade) {
  const city = enr.city || COUNTY;
  const tl = tLowerOf(trade) || 'contractor';
  const verified = monthYear(enr.enriched_at);
  const art = /^[aeiouAEIOU]|^HVAC/.test(tl) ? 'an ' : 'a ';
  const lead = enr.business_name + ' is ' + art + tl + ' company in ' + city + ', Connecticut. ';
  let read;
  if (enr.synthesis) {
    read = trimWords(enr.synthesis, 46);
  } else if (Array.isArray(enr.known_for) && enr.known_for.length) {
    const topics = enr.known_for.map((k) => k && k.label).filter(Boolean).slice(0, 3);
    read = topics.length
      ? 'Vesta has not published a full written read yet; the public review record points to ' +
        topics.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.'
      : 'Vesta has not published a written read on this firm yet.';
  } else {
    read = 'Vesta lists this firm from the public record and has not published an analytical read yet.';
  }
  return '<div class="cp-why">' +
    '<span>' + (enr.synthesis ? 'Vesta’s read' : 'What Vesta knows') +
      (verified ? ' · verified ' + esc(verified) : '') + '</span>' +
    '<p>' + esc(lead + read) + '</p></div>';
}

function vestaReadBlock(enr, trade) {
  if (!enr) return '';
  const firms = TRADE_FIRMS[trade] || (tLowerOf(trade) ? tLowerOf(trade) + ' contractors' : 'pros');
  const caps = (enr.capabilities && typeof enr.capabilities === 'object') ? enr.capabilities : {};
  const items = [];   // [kicker, title, desc] — capped at 4
  const specMap = STANDING_SPECIALTY[trade] || {};
  for (const key in specMap) { if (caps[key]) { const s = specMap[key]; items.push([s[0], s[1], s[2].replace(/%F/g, firms)]); } }
  if (!items.length) return '';
  const cards = items.slice(0, 4).map((it) =>
    '<div class="w"><div class="k">' + esc(it[0]) + '</div><h3>' + it[1] + '</h3><p>' + esc(it[2]) + '</p></div>').join('');
  return '<h2 class="section-h">What sets them apart</h2>' +
    '<p class="note" style="margin-top:-.2rem">Specialty capability confirmed in the review record — not every ' + esc(tLowerOf(trade) || 'firm') + ' Vesta tracks takes this on.</p>' +
    '<div class="vwhy">' + cards + '</div>';
}

// === "The Record" — the locked dot-axis design standard =====================
// One reusable visual system (labeled dot-axis) for standing/pricing/
// responsiveness; a signal-picker for "how they operate" evidence; chip rows
// for praise/scope/hired-for. Every mark maps to a real field — when a field
// is absent, the block renders nothing (graceful per-firm/per-trade
// degradation), never an invented value. See ops/resume/vesta-ui-polish.md.

// snake_case / hyphenated DB tag -> readable label. A few acronyms get fixed
// casing; everything else is straightforward title-casing.
const HUMANIZE_FIX = { ev: 'EV', ac: 'AC', hvac: 'HVAC', lvp: 'LVP', eifs: 'EIFS', gaf: 'GAF', epa: 'EPA', ct: 'CT' };
function humanize(tag) {
  return String(tag).split(/[_-]/).map((w) => HUMANIZE_FIX[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ').replace(/\b24 7\b/, '24/7');
}

// Standing dot-strip — the ONLY place standing/percentile language appears on
// the page. Renders from rating_band alone (top10/top25); the dot pattern is
// illustrative (a stylized band position, not a literal exact rank) and the
// caption never states a field size or review depth.
function standingDotStrip(enr) {
  const band = enr.rating_band;
  if (band !== 'top10' && band !== 'top25') return '';
  const isTop10 = band === 'top10';
  const total = 20;
  const meIdx = isTop10 ? 1 : 4;
  const bandEnd = isTop10 ? 4 : 9;
  let dots = '';
  for (let i = 0; i < total; i++) {
    const cls = i === meIdx ? 'me' : (i < bandEnd ? 'a' : 'c');
    dots += '<span class="trec-dot ' + cls + '" aria-hidden="true"></span>';
  }
  return '<div class="trec-sec-lbl">Where it sits in the ' + esc(COUNTY) + ' field</div>' +
    '<div class="trec-dots">' + dots + '</div>' +
    '<p class="trec-poscap">In the <b>' + (isTop10 ? 'top 10%' : 'top 25%') + ' band</b> of the field Vesta tracks.</p>';
}

// Track record — verified public credentials (reuses the same items verifiedBlock
// used to render standalone) + the dot-axis meters (pricing tier, responsiveness).
function verifiedCredItems(enr, trade) {
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
  return items;
}
function verifiedCredCards(enr, trade) {
  const items = verifiedCredItems(enr, trade);
  if (!items.length) return '';
  return items.map((it) =>
    '<div class="vv-card">' +
      '<div class="vv-mark"><span class="vv-check" aria-hidden="true">✓</span><span>' + esc(it[0]) + '</span></div>' +
      '<p class="vv-what">' + esc(it[1]) + '</p>' +
      '<p class="vv-src">' + esc(it[2]) + ' · June 2026</p>' +
    '</div>').join('');
}

function meterHtml(label, valLabel, ticks, idx) {
  let axis = '';
  for (let i = 0; i < ticks.length; i++) {
    axis += '<span class="trec-axd' + (i === idx ? ' on' : '') + '"></span>';
    if (i < ticks.length - 1) axis += '<span class="trec-axl' + (i < idx ? ' pre' : '') + '"></span>';
  }
  const ticksHtml = ticks.map((t, i) => '<span' + (i === idx ? ' class="on"' : '') + '>' + esc(t) + '</span>').join('');
  return '<div class="trec-meter">' +
    '<div class="trec-meter-head"><span class="trec-meter-lbl">' + esc(label) + '</span><span class="trec-meter-val">' + esc(valLabel) + '</span></div>' +
    '<div class="trec-axis">' + axis + '</div>' +
    '<div class="trec-ticks">' + ticksHtml + '</div>' +
  '</div>';
}
const PRICING_POS = { value: 0, 'mid-market': 1, premium: 2 };
const PRICING_LABELS = ['Value', 'Mid-market', 'Premium'];
function pricingMeter(enr) {
  const idx = PRICING_POS[enr.value_tier];
  if (idx === undefined) return '';
  return meterHtml('Pricing tier', PRICING_LABELS[idx], PRICING_LABELS, idx);
}
const RESP_LABELS = ['Standard', 'Fast', 'Emergency-ready'];
function responsivenessMeter(enr) {
  const r = enr.responsiveness;
  if (!r || (r.tier !== 'fast' && r.tier !== 'standard')) return '';
  const idx = r.emergency ? 2 : (r.tier === 'fast' ? 1 : 0);
  return meterHtml('Responsiveness', RESP_LABELS[idx], RESP_LABELS, idx);
}
function trackRecordBlock(enr, trade) {
  const credCards = verifiedCredCards(enr, trade);
  const meters = [pricingMeter(enr), responsivenessMeter(enr)].filter(Boolean).join('');
  if (!credCards && !meters) return '';
  return '<section class="trec-track" aria-label="Track record">' +
    '<h2 class="section-h">Track record</h2>' +
    '<p class="note" style="margin-top:-.2rem">Public credentials and how they operate — checked against state registries and the review record, not self-reported.</p>' +
    (credCards ? '<div class="vverify" style="margin:1rem 0 1.3rem;padding:0;border:0;background:none"><div class="vv-grid">' + credCards + '</div></div>' : '') +
    (meters ? '<div class="trec-meters">' + meters + '</div>' : '') +
  '</section>';
}

// How they operate — the card-plate signal picker's profile-depth sibling:
// ranks candidate evidence (fast/emergency responsiveness, pricing behavior,
// capability-flag quotes) and keeps the 3 strongest, each a REAL quote from
// the review record. A signal only qualifies with a substantive (12+ char)
// quote — weak-but-true flags are suppressed rather than padded out.
function operateEvidence(enr, trade) {
  const items = [];
  const caps = (enr.capabilities && typeof enr.capabilities === 'object') ? enr.capabilities : {};
  const specMap = STANDING_SPECIALTY[trade] || {};
  const r = enr.responsiveness;
  if (r && r.ev && (r.emergency || r.tier === 'fast')) {
    items.push({ label: r.emergency ? 'Answers in an emergency' : 'Fast to respond', quote: r.ev, pri: r.emergency ? 3 : 2 });
  }
  if (enr.pricing_profile && enr.pricing_profile.theme) {
    items.push({ label: 'How they price the job', quote: enr.pricing_profile.theme, pri: 2 });
  }
  for (const key in caps) {
    const c = caps[key];
    if (!c || !c.ev || String(c.ev).length < 12) continue;
    const curated = specMap[key];
    const label = curated ? String(curated[1]).replace(/&amp;/g, '&') : humanize(key);
    items.push({ label, quote: c.ev, pri: curated ? 2 : (String(c.ev).length > 60 ? 1 : 0) });
  }
  items.sort((a, b) => b.pri - a.pri || String(b.quote).length - String(a.quote).length);
  return items.slice(0, 3);
}
function howTheyOperateBlock(enr, trade) {
  const items = operateEvidence(enr, trade);
  if (!items.length) return '';
  const rows = items.map((it) =>
    '<div class="trec-ev"><span class="trec-ev-h">' + esc(it.label) + '</span>' +
    '<span class="trec-ev-q">“' + esc(it.quote) + '”</span></div>').join('');
  return '<section class="trec-operate" aria-label="How they operate">' +
    '<h2 class="section-h sub">How they operate — from the review record</h2>' +
    '<div class="trec-ev-list">' + rows + '</div>' +
  '</section>';
}

function chipsBlock(heading, tags, altStyle) {
  const arr = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!arr.length) return '';
  const chips = arr.slice(0, 6).map((t) =>
    '<span class="trec-chip' + (altStyle ? ' alt' : '') + '">' + (altStyle ? '' : '✓ ') + esc(humanize(t)) + '</span>').join('');
  return '<section class="trec-chipsec" aria-label="' + esc(heading) + '">' +
    '<h2 class="section-h sub">' + esc(heading) + '</h2>' +
    '<div class="trec-chips">' + chips + '</div>' +
  '</section>';
}

function crewProvenanceLine(enr) {
  const crew = Array.isArray(enr.crew_named) ? enr.crew_named.filter(Boolean) : [];
  return (crew.length ? '<p class="trec-crew">Crew homeowners name: <b>' + crew.map(esc).join(', ') + '</b></p>' : '') +
    '<p class="method">Everything above is drawn from public reviews and Connecticut state records — nothing self-reported, nothing paid for.</p>';
}

function recordBlock(enr, trade) {
  if (!enr) return '';
  const dotStrip = standingDotStrip(enr);
  const track = trackRecordBlock(enr, trade);
  const operate = howTheyOperateBlock(enr, trade);
  const praise = chipsBlock('What keeps coming up', enr.recurring_praise, false);
  const scope = chipsBlock('Scope of work', enr.project_scale, true);
  const hiredFor = chipsBlock('What homeowners hire them for', enr.best_for, true);
  if (!dotStrip && !track && !operate && !praise && !scope && !hiredFor) return '';
  return '<section class="trec-wrap" aria-label="The record — what’s public and provable">' +
    '<p class="trec-kicker">✦ The record — what’s public &amp; provable</p>' +
    (dotStrip ? '<div class="trec-standing">' + dotStrip + '</div>' : '') +
    track + operate + praise + scope + hiredFor +
    crewProvenanceLine(enr) +
  '</section>';
}

// The operated record (TP-6.1) — the fused-profile section. Blocks are derived
// by _blocks-operated.mjs (the operated lane's single derivation point); this
// function only formats them for humans. Renders nothing without a verified
// chain — an empty lane is silent, never padded (suppression beats filling).
function fusedSection(signals, enr, preview) {
  const blocks = operatedBlocks(signals, enr.place_id);
  if (!blocks.length) return '';
  const by = {};
  for (const b of blocks) by[b.id.split(':').pop()] = b;

  const fmtResponse = (ms) => {
    const min = ms / 60000;
    return min < 1 ? Math.round(ms / 1000) + ' sec' : '~' + Math.round(min) + ' min';
  };
  const cards = [];
  if (by['op-response']) cards.push(['Responds in ' + fmtResponse(by['op-response'].value),
    'median across ' + by['op-response'].denominator.inbounds + ' real inbounds, last 90 days']);
  if (by['op-reliability']) cards.push([by['op-reliability'].value + '% carried through',
    'booked jobs completed, measured across ' + by['op-reliability'].denominator.bookings + ' bookings in 12 months']);
  if (by['op-jobs']) cards.push([by['op-jobs'].value + ' verified jobs',
    'completed and recorded' + (by['op-jobs'].window ? ' since ' + by['op-jobs'].window.since_year : '')]);
  if (by['op-storm']) cards.push(['Storm responder', 'answered during storm events in the past 18 months']);
  if (by['op-reviews']) cards.push([by['op-reviews'].value + ' reviews earned', 'each tied to a completed, recorded job']);

  const receipt = blocks[0].receipt;
  return '<section class="fused-wrap" aria-label="The operated record — measured by 4THWALL">' +
    (preview
      ? '<div class="fused-preview-banner">Synthetic demonstration — this is what a 4THWALL-operated contractor’s profile carries. ' +
        'Example data only: <b>none of it is this business’s record</b>; no operated record exists for this firm.</div>'
      : '') +
    '<p class="trec-kicker">✦ The operated record — measured, not claimed</p>' +
    '<p class="fused-lede">These facts aren’t testimonials. They’re measured inside the front office 4THWALL runs' +
      (preview ? ' for operated contractors' : ' for this business') +
      ' — every event recorded into a tamper-evident ledger as it happens, never edited after the fact. ' +
      'A separate evidence class from Vesta’s public-record read above.</p>' +
    '<div class="fused-grid">' +
      cards.map(([h, p]) => '<div class="fused-card"><h3>' + esc(h) + '</h3><p>' + esc(p) + '</p></div>').join('') +
    '</div>' +
    '<details class="fused-receipt"><summary>✓ Chain-verified · ' + Number(receipt.ledger_entries) + ' ledger entries · tamper-evident</summary>' +
      '<p>Every entry carries a cryptographic hash of the entry before it. Changing any past record breaks every hash after it, ' +
      'so the whole chain is re-verified before any of these numbers render — a broken chain shows nothing, not a best guess. ' +
      'Rates come with their sample and window or don’t appear at all.</p>' +
      (preview ? chainVerifierDemo() : '') +
    '</details>' +
  '</section>';
}

// TP-6.2 verifier demo (synthetic preview only): a 5-entry chain whose sha256
// links are recomputed LIVE in the browser — verify passes, tamper breaks it
// from the altered entry forward. This is the "verify this record" affordance
// proven at demo scale; the live version recomputes a real ledger segment.
function chainVerifierDemo() {
  const rows = SYNTHETIC_CHAIN.map((e) =>
    '<div class="fchain-row" data-seq="' + e.seq + '"><span class="fchain-st" aria-hidden="true">·</span>' +
    '<span class="fchain-seq">#' + e.seq + '</span><span class="fchain-type">' + esc(e.type) + '</span>' +
    '<span class="fchain-hash">' + e.hash.slice(0, 12) + '…</span></div>').join('');
  return '<div class="fchain" id="fchain">' +
    '<p class="fchain-lede">Try it — this synthetic 5-entry chain verifies for real, in your browser:</p>' +
    rows +
    '<div class="fchain-actions">' +
      '<button type="button" class="fchain-btn" id="fchain-verify">Verify the chain</button>' +
      '<button type="button" class="fchain-btn ghost" id="fchain-tamper">Tamper with entry #3, then verify</button>' +
    '</div><p class="fchain-verdict" id="fchain-verdict" role="status"></p></div>' +
    '<script>(function(){' +
    'var C=' + JSON.stringify(SYNTHETIC_CHAIN) + ';var tampered=false;' +
    'function hex(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0")}).join("")}' +
    'function sha(s){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)).then(hex)}' +
    'function run(){var prev="GENESIS";var chainOk=true;var p=Promise.resolve();' +
      'C.forEach(function(e){p=p.then(function(){' +
        'var detail=(tampered&&e.seq===3)?e.detail+" [altered]":e.detail;' +
        'return sha(prev+"|"+e.seq+"|"+e.type+"|"+e.at+"|"+detail).then(function(h){' +
          'var ok=(h===e.hash)&&chainOk;if(h!==e.hash)chainOk=false;prev=h;' +
          'var r=document.querySelector(".fchain-row[data-seq=\\""+e.seq+"\\"] .fchain-st");' +
          'r.textContent=ok?"\\u2713":"\\u2717";r.className="fchain-st "+(ok?"ok":"bad");});});});' +
      'p.then(function(){var v=document.getElementById("fchain-verdict");' +
        'v.textContent=chainOk?"\\u2713 Chain intact — every hash recomputed and matched.":' +
        '"\\u2717 Chain broken from the altered entry forward — this is what tampering looks like, and why past records can\\u2019t be quietly edited.";' +
        'v.className="fchain-verdict "+(chainOk?"ok":"bad");});}' +
    'document.getElementById("fchain-verify").addEventListener("click",function(){tampered=false;run()});' +
    'document.getElementById("fchain-tamper").addEventListener("click",function(){tampered=true;run()});' +
    '})();</script>';
}

// What homeowners say — the kept synthesis + structured highlights.
function homeownersBlock(enr) {
  const hasKnown = Array.isArray(enr && enr.known_for) && enr.known_for.length;
  if (!enr || (!enr.synthesis && !hasKnown)) return '';
  let html = '<h2 class="section-h">What homeowners say</h2>';
  // Review COUNT pulled (Drew, 7/10) — Vesta never frames a review tally as the firm's standing
  // (it dilutes credibility and hints at our sampling depth). The count now lives only in the live
  // Google block (client-injected via profile.js with the Powered-by-Google attribution), never in
  // this crawlable HTML.
  if (enr.synthesis) {
    const analyzed = monthYear(enr.enriched_at);
    // The read is the product — same voice as the app card: spark kicker + the serif.
    html += '<div class="card-block vread-block"><p class="vread-kicker"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0l1.4 5.1L14.5 6.5 9.4 7.9 8 13 6.6 7.9 1.5 6.5 6.6 5.1z"/></svg>Vesta’s read</p>' +
      '<p class="vread">' + esc(enr.synthesis) + '</p>' +
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

// Honest treatment for a firm Vesta hasn't published a read on yet (no synthesis, no known_for).
// Listed for the full field; says plainly why there's no read; shows only public-record facts —
// never a fabricated summary. Renders in the same slot as homeownersBlock (exactly one applies).
function notReviewedBlock(enr) {
  if (!enr || enr.synthesis || (Array.isArray(enr.known_for) && enr.known_for.length)) return '';
  const bits = [];
  if (enr.registered) {
    const yr = enr.hic_issue_date ? +String(enr.hic_issue_date).slice(0, 4) : 0;
    bits.push(['State registration', 'Registered as a home-improvement contractor with Connecticut' + (yr && yr !== 1999 ? ' since ' + yr : '') + '.']);
  }
  const total = Number(enr.rating_count) || 0;
  if (total > 0) bits.push(['Public reviews', total.toLocaleString('en-US') + ' review' + (total === 1 ? '' : 's') + ' on public record — worth a look yourself, not yet a base for a fair Vesta read.']);
  const cards = bits.map((b) => '<div class="w"><h3>' + esc(b[0]) + '</h3><p>' + esc(b[1]) + '</p></div>').join('');
  return '<h2 class="section-h">Vesta hasn’t published a read on this firm yet</h2>' +
    '<p class="note" style="margin-top:-.2rem">Vesta only publishes a read once we’ve done a deep, fair review of a firm’s public history — and we’d rather show you nothing than a shallow or unverified summary. We haven’t gotten to this one. Here’s what’s on public record, with how to vet them yourself below.</p>' +
    (cards ? '<div class="vwhy">' + cards + '</div>' : '');
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
  const uses = [
    ['01', 'Verified owner badge', 'Homeowners see you’re the real owner.'],
    ['02', 'Your own photos', 'Coming to verified owners — real job shots, owned and crawlable.'],
    ['03', 'Respond to your read', 'Coming to verified owners — your voice beside Vesta’s.'],
    ['04', 'Get notified', 'The moment a homeowner reaches out.'],
  ].map(([n, h, p]) =>
    '<div class="am-use"><div class="am-n">' + n + '</div><h3>' + h + '</h3><p>' + p + '</p></div>').join('');
  const form =
    '<form id="claim-form">' +
    '<div class="form-row"><label class="form-label" for="cn">Your name</label><input class="form-input" type="text" id="cn" name="name" required maxlength="80"></div>' +
    '<div class="form-row row-pair">' +
    '<div><label class="form-label" for="cp">Phone</label><input class="form-input" type="tel" id="cp" name="phone" required maxlength="20"></div>' +
    '<div><label class="form-label" for="ce">Email (optional)</label><input class="form-input" type="email" id="ce" name="email" maxlength="120"></div></div>' +
    '<button class="am-pill" type="submit">Claim this profile — free</button>' +
    '<span class="form-status" id="claim-status"></span></form>';
  return '<section class="atlas-moment" id="claim" aria-label="Is this your business?">' +
    '<div class="am-eyebrow">For the owner · from 4THWALL</div>' +
    '<h2 class="am-h">Is this your business?</h2>' +
    '<p class="am-lede2">It’s already in front of homeowners in ' + COUNTY + ' choosing who to hire. ' +
      'Vesta weighed your reviews, your public record, and the work you’re known for into the honest read above. ' +
      'Claim it free to make it yours.</p>' +
    '<div class="am-plabel">What claiming gives you</div>' +
    '<div class="am-uses">' + uses + '</div>' +
    form +
    '<p class="am-fine">Free · no obligation · we verify ownership before anything changes.</p>' +
    '<div class="am-rule"></div>' +
    '<div class="am-plabel">Then put it to work</div>' +
    '<p class="am-lede">Verified owners can start free with <b>Lens</b> — connect the tools you already run and ' +
      'turn your operating record into source-backed answers homeowners can trust — or switch on <b>Atlas</b>, ' +
      'the operated front office that answers your inbound, books the job, and follows up while you’re on the job.</p>' +
    '<div class="am-cta"><a class="pill-ghost" href="/lens">Start free with Lens →</a>' +
      '<a class="pill-ghost" href="/atlas">See what Atlas does →</a></div>' +
  '</section>';
}

// Mount points the client enhancer (/profile.js) fills — kept OUT of the
// crawlable content on purpose (live Google data + gated PII contact).
const GOOGLE_MOUNT = '<div id="cp-google" data-mount="google"></div>';
const CONTACT_MOUNT = '<div id="cp-contact" data-mount="contact"></div>';

// The desktop decision rail: only facts the public profile can substantiate.
// This deliberately avoids the marketplace theatre in the visual reference
// (invented availability, exact response windows, job counts, guarantees).
function profileFactsBlock(enr, trade) {
  const facts = [];
  const label = tradeLabel(trade) || 'Contractor';
  const analyzed = monthYear(enr.enriched_at);
  if (enr.city) facts.push([
    'Location',
    enr.city + ', Connecticut',
    'Profiled in Vesta’s ' + COUNTY + ' field'
  ]);
  if (enr.rating_band === 'top10' || enr.rating_band === 'top25') facts.push([
    'County standing',
    (enr.rating_band === 'top10' ? 'Top 10%' : 'Top 25%') + ' of ' + COUNTY + ' ' + tLowerOf(trade),
    'Vesta’s comparative field analysis'
  ]);
  if (Number(enr.rating_count) > 0) facts.push([
    'Review record',
    Number(enr.rating_count).toLocaleString('en-US') + ' public reviews',
    'Count from Google · star score not published'
  ]);
  if (enr.registered) facts.push([
    'Public record',
    'Active CT registration',
    'Checked against the state registry'
  ]);
  if (Array.isArray(enr.trade_license) && enr.trade_license.length) facts.push([
    'Trade credential',
    'Licensed ' + tLowerOf(trade),
    'Verified in Connecticut eLicense'
  ]);
  if (analyzed) facts.push([
    'Vesta review',
    'Read refreshed ' + analyzed,
    'Public reviews and records synthesized'
  ]);
  if (!facts.length) facts.push([
    'Profile',
    label + ' in ' + COUNTY,
    'Compiled from the public record'
  ]);
  const icons = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5 10.5 15 16 9"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'
  ];
  return '<section class="cp-facts neu-panel" aria-labelledby="cp-facts-title">' +
    '<p class="cp-card-kicker">Vesta’s evidence file</p>' +
    '<h2 class="cp-card-title" id="cp-facts-title">What is established</h2>' +
    '<div class="cp-fact-list">' + facts.slice(0, 5).map((f, i) =>
      '<div class="cp-fact"><span class="cp-fact-icon">' + icons[i % icons.length] + '</span>' +
      '<div><span class="cp-fact-label">' + esc(f[0]) + '</span>' +
      '<strong>' + esc(f[1]) + '</strong><small>' + esc(f[2]) + '</small></div></div>'
    ).join('') + '</div></section>';
}

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

// FAQPage — the fan-out lever (route-map § THE WAR PLAN, Phase 0B). AI answer
// engines decompose "should I hire X" into sub-questions; FAQ-marked pages are
// measurably likelier to be the passage that answers one. Every Q here is a real
// verification sub-question, and every A is built ONLY from a field that renders
// on this page — no invented answers, no question we can't answer from the
// record. A firm with no synthesis and no credential gets no FAQ node at all
// (returns [] below the 2-question floor), because a one-question FAQ is padding.
function faqNodes(enr, trade, label, canonical) {
  const city = enr.city || COUNTY;
  const tl = tLowerOf(trade) || 'contractor';
  const verified = monthYear(enr.enriched_at);
  const qa = [];

  if (enr.synthesis) qa.push([
    'What do homeowners say about ' + enr.business_name + '?',
    trimWords(enr.synthesis, 90) + ' This is Vesta’s read of the public review record for ' +
      enr.business_name + ' in ' + city + ', CT' + (verified ? ', last verified ' + verified : '') + '.'
  ]);

  const licensed = Array.isArray(enr.trade_license) && enr.trade_license.length;
  if (enr.registered || licensed) qa.push([
    'Is ' + enr.business_name + ' licensed or registered in Connecticut?',
    enr.business_name + ' ' +
      (enr.registered && licensed
        ? 'holds an active Connecticut Home Improvement Contractor registration and a ' + tl + ' trade licence'
        : enr.registered
          ? 'holds an active Connecticut Home Improvement Contractor registration'
          : 'holds a Connecticut ' + tl + ' trade licence') +
      ', checked by Vesta against the state registry' + (verified ? ' in ' + verified : '') +
      '. Always confirm current status and insurance directly with the contractor before work begins.'
  ]);

  const guide = HIRING_GUIDE[trade];
  if (guide && guide.length) qa.push([
    'What should you check before hiring ' + (TRADE_PROS[trade] || tl + ' contractors') + ' in ' + COUNTY + ', CT?',
    guide.slice(0, 3).map((g) => g.t).join('; ') + '. ' + trimWords(guide[0].d, 40) +
      ' This is general guidance for the trade, not a claim about ' + enr.business_name + '.'
  ]);

  if (qa.length < 2) return [];
  return [{
    '@type': 'FAQPage',
    '@id': canonical + '#faq',
    mainEntity: qa.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  }];
}

function profileJsonLd(enr, trade, label, canonical) {
  // knowsAbout = the head trade + the firm's OWN specialties/known-for topics
  // (flat roof, EV chargers, slate & cedar, …). Entity engines use these
  // sub-topics to decide who "owns" a topic (topic-ownership lever, seo/field-intel
  // § Backlinks). Sourced ONLY from fields that RENDER on this page — the visible
  // "known_for" cards + "Specialties" row — so schema never claims a topic the
  // reader can't see (the no-hidden-field honesty rule).
  const topics = [label];
  if (Array.isArray(enr.known_for)) for (const k of enr.known_for) if (k && k.label) topics.push(String(k.label));
  if (Array.isArray(enr.specialties)) for (const s of enr.specialties) if (s) topics.push(String(s));
  const knowsAbout = [...new Set(topics.map((t) => t.trim()).filter(Boolean))];
  const biz = {
    '@type': bizType(trade),
    '@id': canonical + '#business',
    name: enr.business_name,
    url: canonical,
    areaServed: COUNTY + ', CT',
    knowsAbout: knowsAbout.length > 1 ? knowsAbout : label,
    sameAs: ['https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(enr.place_id)]
  };
  if (enr.city) biz.address = { '@type': 'PostalAddress', addressLocality: enr.city, addressRegion: 'CT', addressCountry: 'US' };
  // The machine-grade twin: index-ready profiles carry a pointer to their structured
  // evidence document (/evidence/:id — provenance-classed blocks, trust contract v1).
  if (isIndexable(enr)) biz.subjectOf = {
    '@type': 'Dataset',
    name: 'Vesta evidence blocks — ' + enr.business_name,
    description: 'Provenance-classed evidence blocks (public-synthesis) for this contractor, machine-readable.',
    url: SITE + '/evidence/' + encodeURIComponent(enr.place_id),
    encodingFormat: 'application/json'
  };
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
    },
    ...faqNodes(enr, trade, label, canonical)
  ];

  // Escape "<" so the JSON can never break out of the <script> tag.
  return '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') +
    '</script>';
}

// === shell ==================================================================

const ATLAS_MOMENT_CSS =
  '<style>' +
  /* ── Vesta contractor dossier: desktop research desk / mobile decision flow ── */
  'body.cp-page{--pitch:#12100E;--khaki-deep:#30321C;--khaki:#4A4B2F;--ebony:#6B654B;--tea:#D4DF9E;--cp-bg:#EEF0E4;--cp-surface:#EEF0E4;--cp-hi:rgba(255,255,255,.82);--cp-lo:rgba(48,50,28,.20);background:radial-gradient(900px 520px at 12% 4%,rgba(212,223,158,.42),transparent 68%),var(--cp-bg);color:var(--pitch)}' +
  'body.cp-page nav.topnav{background:rgba(238,240,228,.88);border-bottom-color:rgba(74,75,47,.10);box-shadow:0 8px 22px -20px rgba(48,50,28,.58)}' +
  'body.cp-page footer{background:rgba(212,223,158,.18);border-top-color:rgba(74,75,47,.12)}' +
  '.cp-shell{width:min(1380px,calc(100% - 2*var(--pad)));margin:0 auto;padding:2.1rem 0 3rem}' +
  '.cp-titlebar{display:flex;align-items:flex-end;justify-content:space-between;gap:2rem;margin:0 0 1.25rem;padding:.2rem .5rem}' +
  '.cp-titlebar .crumb{margin:0 0 .45rem}' +
  '.cp-titlebar h1,.cp-titlebar .cp-titlebar-h{font-family:var(--display);font-size:clamp(2rem,3.2vw,3.05rem);font-weight:500;line-height:1;letter-spacing:-.035em;color:var(--pitch)}' +
  '.cp-titlebar p{font-size:.9rem;color:rgba(18,16,14,.58);margin-top:.55rem}' +
  '.cp-titlebar .cp-titlebar-h{margin-top:0;color:var(--pitch)}' +
  '.cp-no-pay{display:inline-flex;align-items:center;gap:.45rem;flex:none;font-family:var(--mono);font-size:.59rem;letter-spacing:.11em;text-transform:uppercase;color:var(--khaki-deep);padding:.62rem .9rem;border-radius:999px;background:var(--cp-surface);box-shadow:inset 2px 2px 4px rgba(48,50,28,.12),inset -2px -2px 4px rgba(255,255,255,.76)}' +
  '.cp-layout{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(300px,.82fr);grid-template-areas:"hero rail" "body rail";gap:1.35rem;align-items:start}' +
  '.neu-panel{border:1px solid rgba(255,255,255,.42);background:linear-gradient(145deg,rgba(255,255,255,.17),rgba(212,223,158,.07)),var(--cp-surface);border-radius:25px;box-shadow:12px 12px 28px -16px var(--cp-lo),-10px -10px 24px -16px var(--cp-hi)}' +
  '.cp-hero-card{grid-area:hero;padding:clamp(1.35rem,2.8vw,2.15rem)}' +
  '.cp-identity{display:flex;align-items:flex-start;justify-content:space-between;gap:1.2rem}' +
  '.cp-identity-main{min-width:0}' +
  '.cp-profile-type{font-family:var(--mono);font-size:.61rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ebony);margin-bottom:.55rem}' +
  '.cp-business-name{font-family:var(--display);font-size:clamp(1.8rem,3.4vw,3.15rem);font-weight:500;line-height:1.04;letter-spacing:-.035em;color:var(--pitch);text-wrap:balance}' +
  '.cp-location{font-size:.92rem;color:rgba(18,16,14,.6);margin-top:.55rem}' +
  '.cp-analysis-badge{display:inline-flex;align-items:center;gap:.38rem;margin-top:1rem;padding:.42rem .72rem;border-radius:999px;color:var(--khaki-deep);font-size:.72rem;font-weight:600;background:rgba(212,223,158,.48);box-shadow:inset 1px 1px 2px rgba(48,50,28,.10),inset -1px -1px 2px rgba(255,255,255,.6)}' +
  '.cp-analysis-badge svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7}' +
  '.cp-why{max-width:28rem;padding:1rem 1.1rem;border-radius:17px;background:var(--cp-surface);box-shadow:inset 3px 3px 7px rgba(48,50,28,.10),inset -3px -3px 7px rgba(255,255,255,.72)}' +
  '.cp-why span{display:block;font-family:var(--mono);font-size:.56rem;letter-spacing:.13em;text-transform:uppercase;color:var(--ebony);margin-bottom:.35rem}' +
  '.cp-why p{font-family:var(--display);font-size:.95rem;line-height:1.48;color:var(--khaki-deep)}' +
  '.cp-hero-card .cp-photos{margin:1.6rem 0 0;max-width:none}' +
  '.cp-hero-card .cp-ph{border-radius:18px;box-shadow:5px 5px 13px -8px rgba(48,50,28,.52),-4px -4px 11px -7px rgba(255,255,255,.76)}' +
  '.cp-rail{grid-area:rail;position:sticky;top:5.7rem;display:flex;flex-direction:column;gap:1rem}' +
  '.cp-facts,.cp-actions{padding:1.3rem 1.35rem}' +
  '.cp-card-kicker{font-family:var(--mono);font-size:.56rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ebony);margin-bottom:.35rem}' +
  '.cp-card-title{font-family:var(--display);font-size:1.38rem;font-weight:500;line-height:1.15;letter-spacing:-.025em;color:var(--pitch)}' +
  '.cp-fact-list{margin-top:1rem}' +
  '.cp-fact{display:grid;grid-template-columns:39px 1fr;gap:.75rem;padding:.8rem 0;border-top:1px solid rgba(74,75,47,.10)}' +
  '.cp-fact-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;color:var(--khaki-deep);background:var(--cp-surface);box-shadow:4px 4px 9px -5px rgba(48,50,28,.48),-4px -4px 9px -5px rgba(255,255,255,.9)}' +
  '.cp-fact-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}' +
  '.cp-fact-label{display:block;font-family:var(--mono);font-size:.54rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(18,16,14,.44);margin-bottom:.1rem}' +
  '.cp-fact strong{display:block;font-size:.85rem;font-weight:600;color:var(--pitch);line-height:1.3}' +
  '.cp-fact small{display:block;font-size:.72rem;color:rgba(18,16,14,.55);line-height:1.4;margin-top:.12rem}' +
  '.cp-actions .cp-action-lede{font-size:.82rem;line-height:1.5;color:rgba(18,16,14,.58);margin:.45rem 0 1rem}' +
  '.cp-primary-action,.cp-secondary-action{display:flex;align-items:center;justify-content:center;gap:.55rem;width:100%;min-height:48px;border-radius:14px;font-size:.88rem;font-weight:600;transition:transform .18s,box-shadow .18s,color .18s}' +
  '.cp-primary-action{background:var(--khaki-deep);color:#F5F6EC;box-shadow:7px 7px 15px -8px rgba(18,16,14,.72),-4px -4px 10px -6px rgba(255,255,255,.9)}' +
  '.cp-primary-action:hover{transform:translateY(-1px);background:var(--pitch)}' +
  '.cp-secondary-action{margin-top:.65rem;color:var(--khaki-deep);background:var(--cp-surface);box-shadow:4px 4px 10px -6px rgba(48,50,28,.52),-4px -4px 10px -6px rgba(255,255,255,.86)}' +
  '.cp-secondary-action:hover{color:var(--pitch);box-shadow:inset 2px 2px 5px rgba(48,50,28,.1),inset -2px -2px 5px rgba(255,255,255,.7)}' +
  '.cp-actions .fine{color:rgba(18,16,14,.47);margin:.75rem 0 0}' +
  '.cp-actions #cp-contact{margin-top:1.15rem;padding-top:1rem;border-top:1px solid rgba(74,75,47,.11)}' +
  '.cp-actions #cp-contact .section-h{font-size:1.05rem;margin:0 0 .45rem}' +
  '.cp-actions #cp-contact .card-block{padding:0;margin:0;background:none;border:0;box-shadow:none}' +
  '.cp-actions .contactrow{display:block;padding:.55rem 0;border-bottom-color:rgba(74,75,47,.10)}' +
  '.cp-actions .contactrow b{display:block;margin-bottom:.12rem}' +
  '.cp-actions .contactrow a{display:block;color:var(--khaki-deep);font-weight:600;word-break:break-word}' +
  '.cp-body{grid-area:body;padding:clamp(1.35rem,2.7vw,2.15rem)}' +
  '.cp-body>.trec-wrap{margin-top:0}' +
  '.cp-body .section-h{color:var(--pitch)}' +
  '.cp-body .vverify .vv-card,.cp-body .cost-line .cl-card,.cp-body .rel-card{background:var(--cp-surface);border-color:rgba(255,255,255,.44);box-shadow:5px 5px 12px -8px rgba(48,50,28,.38),-4px -4px 10px -7px rgba(255,255,255,.86)}' +
  '.cp-body .trec-chip{box-shadow:inset 1px 1px 2px rgba(48,50,28,.07),inset -1px -1px 2px rgba(255,255,255,.48)}' +
  '.cp-primary-action:focus-visible,.cp-secondary-action:focus-visible,.cp-page a:focus-visible,.cp-page button:focus-visible{outline:3px solid var(--tea);outline-offset:3px}' +
  '@media(max-width:980px){.cp-layout{grid-template-columns:minmax(0,1fr) minmax(275px,.72fr)}.cp-identity{display:block}.cp-why{margin-top:1.1rem;max-width:none}}' +
  '@media(max-width:760px){body.cp-page{--cp-bg:#EEF0E4}.cp-shell{width:100%;padding:1.1rem var(--pad) 2rem}.cp-titlebar{display:block;padding:0 .15rem;margin-bottom:1rem}.cp-titlebar h1,.cp-titlebar .cp-titlebar-h{font-size:2rem}.cp-no-pay{margin-top:.8rem}.cp-layout{display:flex;flex-direction:column;gap:.9rem}.cp-hero-card{order:1;width:100%;padding:1.15rem;border-radius:22px}.cp-rail{order:2;position:static;width:100%}.cp-body{order:3;width:100%;padding:1.2rem;border-radius:22px}.cp-facts{display:none}.cp-actions{padding:1.15rem;border-radius:22px}.cp-business-name{font-size:clamp(1.75rem,9vw,2.5rem)}.cp-why{font-size:.92rem}.cp-hero-card .cp-photos{margin-top:1.2rem}.cp-actions .cp-card-title{font-size:1.55rem}.atlas-moment{border-radius:20px}}' +
  '@media(max-width:430px){.cp-no-pay{font-size:.52rem}.cp-titlebar h1,.cp-titlebar .cp-titlebar-h{font-size:1.75rem}.cp-profile-type{font-size:.56rem}.cp-analysis-badge{font-size:.67rem}.cp-body{padding:1.05rem}.cp-body .vverify .vv-grid{grid-template-columns:1fr}}' +
  '.hw-count{font-family:var(--mono,inherit);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--vmut,#6b654b);margin:.1rem 0 1rem}' +
  '.hw-count strong{font-family:var(--display,inherit);font-size:1.15rem;font-weight:600;letter-spacing:-.01em;color:var(--vink,#5C5346)}' +
  /* Vesta's read — the same voice as the app card: spark kicker + the serif, slightly up-sized. */
  '.vread-kicker{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--mono,monospace);font-size:.62rem;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--vgreen-2,#4a4b2f);margin-bottom:.55rem}' +
  '.vread{font-family:var(--display,Georgia,serif);font-size:1.12rem;line-height:1.65;letter-spacing:-.005em;color:var(--vink,#393A22)}' +
  /* Scroll-reveal — content blocks rise in as they enter the viewport. CSS scroll-driven
     animation only: no JS, no effect on browsers without support or with reduced motion. */
  '@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) {' +
  ' .vwhy .w, .vread-block, .vverify, .cost-line, .rel-card, .atlas-moment { animation:crIn both; animation-timeline:view(); animation-range:entry 5% entry 38%; }' +
  ' @keyframes crIn { from { opacity:.001; transform:translateY(16px); } to { opacity:1; transform:none; } }' +
  '}}' +
  '.atlas-moment{--a-bg:#191712;--a-bg2:#211e16;--a-line:rgba(222,206,164,.18);--a-sand:#dcceaa;--a-sand-2:#ece2c8;--a-mut:rgba(236,226,200,.6);position:relative;margin:2.4rem 0 1rem;padding:clamp(1.6rem,3.6vw,2.5rem);background:radial-gradient(620px 320px at 86% -120px,rgba(222,206,164,.12),transparent 60%),linear-gradient(180deg,var(--a-bg2),var(--a-bg));border:1px solid var(--a-line);border-radius:24px;box-shadow:0 44px 96px -52px rgba(0,0,0,.92)}' +
  '.atlas-moment .am-eyebrow{font-family:var(--mono);font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:var(--a-sand);margin-bottom:.7rem}' +
  '.atlas-moment .am-h{font-family:var(--display);font-size:clamp(1.5rem,3vw,2.05rem);font-weight:500;letter-spacing:-.02em;color:var(--a-sand-2);line-height:1.14}' +
  '.atlas-moment .am-lede2{font-size:.92rem;color:var(--a-mut);line-height:1.65;margin:.7rem 0 1.1rem;max-width:60ch}' +
  '.atlas-moment form{max-width:520px}' +
  '.atlas-moment .am-rule{height:1px;background:var(--a-line);margin:1.9rem 0 1.6rem}' +
  '.atlas-moment .am-plabel{font-family:var(--mono);font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--a-sand);margin-bottom:.6rem}' +
  '.atlas-moment .am-lede{font-family:var(--display);font-size:clamp(1.08rem,2vw,1.3rem);font-weight:400;line-height:1.55;letter-spacing:-.01em;color:var(--a-sand-2);max-width:64ch;margin:0}' +
  '.atlas-moment .am-lede b{color:var(--a-sand-2);font-weight:600}' +
  '.atlas-moment .am-uses{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.9rem;margin:1.5rem 0 0}' +
  '.atlas-moment .am-use{background:rgba(222,206,164,.05);border:1px solid var(--a-line);border-radius:16px;padding:1.15rem 1.25rem}' +
  '.atlas-moment .am-use .am-n{font-family:var(--mono);font-size:.66rem;letter-spacing:.14em;color:var(--a-sand);margin-bottom:.5rem}' +
  '.atlas-moment .am-use h3{font-family:var(--display);font-size:1.04rem;font-weight:500;letter-spacing:-.015em;color:var(--a-sand-2);margin-bottom:.35rem}' +
  '.atlas-moment .am-use p{font-size:.82rem;color:var(--a-mut);line-height:1.6}' +
  '.atlas-moment .am-cta{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1.5rem}' +
  '.atlas-moment .am-pill{display:inline-flex;align-items:center;gap:.4rem;background:linear-gradient(180deg,var(--a-sand-2),var(--a-sand));color:#1a1813;font-family:var(--body);font-size:.9rem;font-weight:600;padding:.7rem 1.3rem;border-radius:999px;text-decoration:none;transition:transform .16s,box-shadow .16s}' +
  '.atlas-moment .am-pill:hover{transform:translateY(-1px);box-shadow:0 14px 30px -12px rgba(222,206,164,.45)}' +
  '.atlas-moment .am-fine{font-size:.76rem;color:var(--a-mut);max-width:34ch;line-height:1.5}' +
  '.atlas-moment .form-input{background:rgba(0,0,0,.22);border-color:var(--a-line);color:var(--a-sand-2)}' +
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
  /* ── The operated record (fusion, TP-6.1) — its own lane, visually distinct ── */
  '.fused-wrap{margin:0 0 1.8rem;padding:1.2rem 1.25rem;border:1px solid rgba(74,75,47,.22);border-radius:14px;background:rgba(74,75,47,.045)}' +
  '.fused-preview-banner{font-family:var(--mono);font-size:.72rem;line-height:1.6;letter-spacing:.04em;color:#7a3b12;background:rgba(212,138,42,.12);border:1px dashed rgba(122,59,18,.45);border-radius:9px;padding:.6rem .8rem;margin-bottom:1rem}' +
  '.fused-lede{font-size:.9rem;line-height:1.65;color:var(--vmut,rgba(18,16,14,.72));margin:0 0 1.05rem;max-width:66ch}' +
  '.fused-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.7rem;margin-bottom:1rem}' +
  '.fused-card{border:1px solid rgba(74,75,47,.16);border-radius:11px;background:var(--vbg,#fff);padding:.75rem .85rem}' +
  '.fused-card h3{font-family:var(--display);font-size:1.02rem;font-weight:600;letter-spacing:-.01em;color:var(--vgreen-2,#4a4b2f);margin:0 0 .3rem}' +
  '.fused-card p{font-size:.8rem;line-height:1.55;color:var(--vmut,rgba(18,16,14,.65));margin:0}' +
  '.fused-receipt summary{cursor:pointer;font-family:var(--mono);font-size:.7rem;letter-spacing:.06em;color:var(--vgreen-2,#4a4b2f);list-style:none}' +
  '.fused-receipt summary::-webkit-details-marker{display:none}' +
  '.fused-receipt p{font-size:.82rem;line-height:1.65;color:var(--vmut,rgba(18,16,14,.7));margin:.6rem 0 0;max-width:66ch}' +
  '.fchain{margin-top:.9rem;padding:.85rem .9rem;border:1px solid rgba(74,75,47,.14);border-radius:10px;background:var(--vbg,#fff)}' +
  '.fchain-lede{font-size:.8rem;color:var(--vmut,rgba(18,16,14,.65));margin:0 0 .6rem}' +
  '.fchain-row{display:flex;align-items:center;gap:.6rem;padding:.28rem 0;border-bottom:1px solid rgba(74,75,47,.08);font-family:var(--mono);font-size:.72rem}' +
  '.fchain-st{width:1em;color:rgba(18,16,14,.35)}.fchain-st.ok{color:var(--vgreen-2,#4a4b2f);font-weight:700}.fchain-st.bad{color:#a33b1c;font-weight:700}' +
  '.fchain-seq{color:var(--vmut,rgba(18,16,14,.55))}.fchain-type{color:var(--vink,#12100e);min-width:9.5em}' +
  '.fchain-hash{color:var(--vmut,rgba(18,16,14,.5));margin-left:auto}' +
  '.fchain-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.7rem}' +
  '.fchain-btn{font:500 .74rem/1 var(--mono);letter-spacing:.05em;padding:.55rem .8rem;border-radius:8px;border:1px solid var(--vgreen-2,#4a4b2f);background:var(--vgreen-2,#4a4b2f);color:#fff;cursor:pointer}' +
  '.fchain-btn.ghost{background:transparent;color:var(--vgreen-2,#4a4b2f)}' +
  '.fchain-verdict{font-size:.8rem;line-height:1.5;margin:.6rem 0 0;min-height:1.2em}.fchain-verdict.ok{color:var(--vgreen-2,#4a4b2f)}.fchain-verdict.bad{color:#a33b1c}' +
  /* ── "The Record" — the locked dot-axis design standard ── */
  '.trec-wrap{margin:0 0 1.6rem}' +
  '.trec-kicker{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--mono);font-size:.62rem;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--vgreen-2,#4a4b2f);margin-bottom:.9rem}' +
  '.trec-sec-lbl{font-family:var(--mono);font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--vmut,rgba(18,16,14,.6));margin-bottom:.6rem}' +
  '.trec-dots{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:.6rem}' +
  '.trec-dot{width:9px;height:9px;border-radius:50%;background:rgba(18,16,14,.12)}' +
  '.trec-dot.a{background:var(--vgreen-2,#4a4b2f)}' +
  '.trec-dot.me{width:15px;height:15px;background:var(--vgreen-2,#4a4b2f);box-shadow:0 0 0 3px var(--vbg,#fff),0 0 0 5px var(--vgreen-3,#d4df9e)}' +
  '.trec-poscap{font-size:.85rem;color:var(--vmut,rgba(18,16,14,.7));line-height:1.5}' +
  '.trec-poscap b{color:var(--vink,#12100e)}' +
  '.trec-standing{margin-bottom:1.6rem}' +
  '.trec-meters{display:flex;flex-direction:column;gap:1rem;margin-top:.2rem}' +
  '.trec-meter-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem}' +
  '.trec-meter-lbl{font-family:var(--mono);font-size:.66rem;letter-spacing:.09em;text-transform:uppercase;color:var(--vmut,rgba(18,16,14,.6))}' +
  '.trec-meter-val{font-family:var(--display);font-size:.95rem;font-weight:600;letter-spacing:-.01em;color:var(--vink,#12100e)}' +
  '.trec-axis{display:flex;align-items:center}' +
  '.trec-axd{width:9px;height:9px;border-radius:50%;background:rgba(18,16,14,.15);flex-shrink:0}' +
  '.trec-axd.on{width:15px;height:15px;background:var(--vgreen-2,#4a4b2f);box-shadow:0 0 0 3px var(--vbg,#fff),0 0 0 5px var(--vgreen-3,#d4df9e)}' +
  '.trec-axl{flex:1;height:2px;background:rgba(18,16,14,.1)}' +
  '.trec-axl.pre{background:linear-gradient(90deg,rgba(18,16,14,.1),rgba(18,16,14,.28))}' +
  '.trec-ticks{display:flex;justify-content:space-between;margin-top:.45rem}' +
  '.trec-ticks span{font-family:var(--mono);font-size:.62rem;letter-spacing:.03em;text-transform:uppercase;color:rgba(18,16,14,.38);flex:1;text-align:center}' +
  '.trec-ticks span:first-child{text-align:left}.trec-ticks span:last-child{text-align:right}' +
  '.trec-ticks span.on{color:var(--vgreen-2,#4a4b2f);font-weight:600}' +
  '.trec-operate{margin:1.6rem 0}' +
  '.trec-ev{margin-bottom:.85rem}.trec-ev:last-child{margin-bottom:0}' +
  '.trec-ev-h{display:block;font-size:.9rem;font-weight:600;color:var(--vink,#12100e);line-height:1.3}' +
  '.trec-ev-q{display:block;font-family:var(--display);font-style:italic;font-size:.87rem;color:var(--vmut,rgba(18,16,14,.7));line-height:1.5;margin-top:.2rem}' +
  '.trec-chipsec{margin:1.6rem 0}' +
  '.trec-chips{display:flex;flex-wrap:wrap;gap:.45rem}' +
  '.trec-chip{display:inline-flex;align-items:center;gap:.3rem;font-size:.8rem;font-weight:500;color:var(--vgreen-2,#4a4b2f);background:rgba(212,223,158,.28);border:1px solid rgba(18,16,14,.08);border-radius:999px;padding:.4rem .8rem}' +
  '.trec-chip.alt{color:var(--vink,#12100e);background:rgba(18,16,14,.045)}' +
  '.trec-crew{font-size:.85rem;color:var(--vmut,rgba(18,16,14,.7));margin-top:1.3rem}' +
  '.trec-crew b{color:var(--vink,#12100e);font-weight:600}' +
  '@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) {' +
  ' .trec-standing,.trec-track,.trec-operate,.trec-chipsec{ animation:crIn both; animation-timeline:view(); animation-range:entry 5% entry 38%; }' +
  '}}' +
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
    '<meta name="theme-color" content="#30321C">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link rel="preconnect" href="https://vinytnzzgryodyrftabg.supabase.co">\n' +
    '<link rel="preconnect" href="https://lh3.googleusercontent.com" crossorigin>\n' +
    '<link rel="dns-prefetch" href="https://places.googleusercontent.com">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=optional" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/home.css">\n' +
    ATLAS_MOMENT_CSS + '\n' +
    jsonld + '\n' +
    '<script src="/home.js" defer></script>\n' +
    '<script src="/profile.js" defer></script>\n' +
    '</head>\n<body class="cp-page">\n' +
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

export function renderContractorHTML(enr, siblings = [], opts = {}) {
  const trade = enr.trade || '';
  const label = tradeLabel(trade) || 'Contractor';
  const tl = tLowerOf(trade);
  const canonical = SITE + '/c/' + encodeURIComponent(enr.place_id);
  const indexable = isIndexable(enr);
  const hasRead = !!(enr.synthesis || (Array.isArray(enr.known_for) && enr.known_for.length));

  // Verification-intent title (route-map § THE WAR PLAN, Phase 0B). GSC 8/02:
  // we already sit page-one on "<firm> reviews / rating" queries and take ~zero
  // clicks — the old title read like every other directory result and promised
  // nothing the searcher was asking for. "Reviews analyzed" is the literal
  // product (the synthesis IS an analysis of the public review record) and is
  // claimed ONLY when a synthesis exists; without one we make no such promise.
  const title = enr.business_name + ' — ' + label + ' in ' + (enr.city || COUNTY) + ', CT' +
    (enr.synthesis ? ' | Reviews analyzed by Vesta' : ' | Vesta');
  const description = enr.synthesis
    ? String(enr.synthesis).slice(0, 154) + (String(enr.synthesis).length > 154 ? '…' : '')
    : (hasRead
        ? (label + ' in ' + (enr.city || COUNTY) + ', CT — a plain-English read from Vesta, from the public record.')
        : (label + ' in ' + (enr.city || COUNTY) + ', CT. Listed from public records — Vesta hasn’t published a read on this firm yet.'));

  // Request-through-Vesta CTA (a plain link — no JS needed).
  const reqHref = '/vesta/search?mode=request&place=' + encodeURIComponent(enr.place_id) +
    (enr.zip ? '&zip=' + encodeURIComponent(enr.zip) : '') + (trade ? '&trade=' + trade : '');
  const hero =
    '<section class="cp-hero-card neu-panel" id="hero">' +
      '<div class="cp-identity"><div class="cp-identity-main">' +
        '<p class="cp-profile-type">' + esc(label) + ' profile · ' + esc(COUNTY) + '</p>' +
        // H1 = the entity, not the page type. The firm's name is what every
        // verification query ("<firm> reviews") is about, and it was an h2 under
        // a generic "<Trade> profile" h1. Class-based styling — no visual change.
        '<h1 class="cp-business-name" style="view-transition-name:vt-name-' + String(enr.place_id || '').replace(/[^A-Za-z0-9]/g, '') + '">' + esc(enr.business_name) + '</h1>' +
        '<p class="cp-location">' + esc((enr.city || COUNTY) + ', Connecticut') + '</p>' +
        '<span class="cp-analysis-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/></svg>' +
          (hasRead ? 'Vesta-analyzed' : 'Public-record listing') + '</span>' +
      '</div>' + answerBlock(enr, trade) + '</div>' +
      // Live Google photos, show-don't-store. Empty mount collapses.
      '<div id="cp-photos" data-mount="photos" class="cp-photos"></div>' +
    '</section>';

  const rail = '<aside class="cp-rail" aria-label="Profile facts and next actions">' +
    profileFactsBlock(enr, trade) +
    '<section class="cp-actions neu-panel" aria-labelledby="cp-actions-title">' +
      '<p class="cp-card-kicker">Your next step</p>' +
      '<h2 class="cp-card-title" id="cp-actions-title">Move forward without the marketplace pressure.</h2>' +
      '<p class="cp-action-lede">Vesta carries one clear request to this contractor. Your information is not auctioned or resold.</p>' +
      '<a class="cp-primary-action" href="' + reqHref + '">Request through Vesta <span aria-hidden="true">→</span></a>' +
      (trade ? '<a class="cp-secondary-action" href="/fairfield-county/' + trade + '">Compare the county field</a>' : '') +
      '<p class="fine">One form. Replies come straight to you.</p>' +
      CONTACT_MOUNT +
    '</section>' +
  '</aside>';

  // The operated lane renders only when live signals exist AND the switch is on
  // (W1), or in the unlinked synthetic preview. Placement after the public-record
  // section keeps the lanes visibly separate; final placement is a fusion-live
  // taste call with Drew, cheap to move.
  const fused = (opts.fusionSignals && (FUSION_LIVE || opts.fusionPreview))
    ? fusedSection(opts.fusionSignals, enr, !!opts.fusionPreview) : '';

  const body = '<section class="cp-body neu-panel" id="body">' +
      recordBlock(enr, trade) +
      fused +
      signatureBlock(enr) +
      vestaReadBlock(enr, trade) +
      homeownersBlock(enr) +
      notReviewedBlock(enr) +
      hiringGuideBlock(trade) +
      costLineBlock(trade) +
      '<div class="cp-gref">' + GOOGLE_MOUNT + '</div>' +
      claimBlock(enr) +
      relatedBlock(siblings, trade) +
      disclosureRemoval(enr) +
    '</section>';

  const profile = '<section class="cp-shell">' +
    '<header class="cp-titlebar"><div>' +
      '<a class="crumb" href="' + (trade ? '/fairfield-county/' + trade : '/vesta') + '">← ' + esc(label ? label + ' in ' + COUNTY : 'Vesta') + '</a>' +
      // Demoted from <h1> so the firm's name can hold it (see hero). Same class
      // hook added to the CSS rule, so this renders pixel-identically.
      '<p class="cp-titlebar-h">' + esc(label) + ' profile</p><p>Fairfield County evidence file · ranked by Vesta.</p>' +
    '</div></header>' +   // "Ranked by the record, never by payment" pill removed (Drew 8/1; kept in step with the in-app profile)
    '<div class="cp-layout">' + hero + rail + body + '</div>' +
  '</section>';

  return shell({
    title, description, canonical, indexable,
    jsonld: profileJsonLd(enr, trade, label, canonical) +
      (indexable ? '\n<link rel="alternate" type="application/json" href="/evidence/' + encodeURIComponent(enr.place_id) + '" title="Evidence blocks (trust contract)">' : ''),
    body: profile
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
