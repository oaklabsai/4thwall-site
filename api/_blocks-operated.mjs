// Operated-lane evidence blocks (TP-6, trust protocol) — the OTHER lane.
// Spec: 4thwall-wiki/system/trust-contract.md (v1.1). This module derives the
// OPERATED class only, from the trust-signal shape the product worker computes
// (worker src/trust.js buildTrustSignals → POST /platform/trust-signals):
//   { location_id, verified, ledger_entries, badges: { verified_jobs,
//     response_ms_median_90d, response_sample_90d, booking_reliability_365d,
//     booking_sample_365d, storm_responder, reviews_earned, rating_avg, since_year } }
//
// The lane law, held structurally: _blocks.mjs emits public-synthesis and nothing
// else; this file emits operated and nothing else. No function in either file ever
// reads the other's inputs — merging the lanes requires editing code, loudly.
//
// The honesty rules live UPSTREAM in the worker, next to the ledger (chain verifies
// first, sample floors, time windows, named metrics — never a composite score).
// This module trusts those rules but re-checks the two cheap ones defensively:
// no blocks without a verified chain, no rate without its sample.
//
// Deliberate v1 omissions (documented, not silent): rating_avg is NOT emitted —
// Vesta's public surfaces render no raw star average from any lane (the moat line);
// reviews_earned (a count) is fine. since_year rides the jobs block, not its own.

const MIN_RESPONSE_SAMPLE = 25;  // mirror worker floors — a rate below floor arrives null anyway
const MIN_BOOKING_SAMPLE = 20;

export function operatedBlocks(signals, placeId) {
  if (!signals || signals.verified !== true || !signals.badges) return [];
  const b = signals.badges;
  const subject = 'place:' + placeId;
  const receipt = {
    method: 'Measured inside the 4THWALL-operated front office; every event hash-chained into a tamper-evident ledger as it happens',
    kind: 'chain',
    ledger_entries: Number(signals.ledger_entries) || 0,
    chain_verified: true
  };
  const blocks = [];

  if (Number.isFinite(b.verified_jobs) && b.verified_jobs > 0) blocks.push({
    id: subject + ':op-jobs',
    class: 'operated',
    claim_kind: 'count',
    value: b.verified_jobs,
    label: 'verified jobs completed',
    window: b.since_year ? { since_year: b.since_year } : undefined,
    receipt, subject_ref: subject
  });

  if (Number.isFinite(b.response_ms_median_90d) && (b.response_sample_90d || 0) >= MIN_RESPONSE_SAMPLE) blocks.push({
    id: subject + ':op-response',
    class: 'operated',
    claim_kind: 'rate',
    value: b.response_ms_median_90d,
    unit: 'ms_median',
    label: 'median response to inbound leads',
    denominator: { inbounds: b.response_sample_90d },
    window: { days: 90 },
    receipt, subject_ref: subject
  });

  if (Number.isFinite(b.booking_reliability_365d) && (b.booking_sample_365d || 0) >= MIN_BOOKING_SAMPLE) blocks.push({
    id: subject + ':op-reliability',
    class: 'operated',
    claim_kind: 'rate',
    value: b.booking_reliability_365d,
    unit: 'percent',
    label: 'booked jobs carried through to completion',
    denominator: { bookings: b.booking_sample_365d },
    window: { days: 365 },
    receipt, subject_ref: subject
  });

  if (b.storm_responder === true) blocks.push({
    id: subject + ':op-storm',
    class: 'operated',
    claim_kind: 'status',
    value: 'storm_responder',
    label: 'responded during storm events',
    window: { months: 18 },
    receipt, subject_ref: subject
  });

  if (Number.isFinite(b.reviews_earned) && b.reviews_earned > 0) blocks.push({
    id: subject + ':op-reviews',
    class: 'operated',
    claim_kind: 'count',
    value: b.reviews_earned,
    label: 'reviews earned through completed, recorded jobs',
    receipt, subject_ref: subject
  });

  return blocks;
}

// The synthetic fixture the flag-gated preview renders (TP-6.1's proof body).
// Shape mirrors buildTrustSignals EXACTLY, values sit safely above every floor,
// and nothing about it corresponds to any real firm.
// Synthetic 5-entry hash chain for the TP-6.2 verifier demo. The hashes are REAL
// sha256 values over `prev|seq|type|at|detail` (precomputed 2026-07-17), so the
// in-browser recompute genuinely passes — and genuinely breaks when the demo
// tampers with an entry. Same chaining idea as the production ledger; simplified
// canonical form, and says so on the surface.
export const SYNTHETIC_CHAIN = [
  { seq: 1, type: 'booking_created', at: '2026-03-02T14:11:08Z', detail: 'estimate booked from inbound SMS', prev: 'GENESIS', hash: '2b345d11b21bea7d057cfe06288c6ecf21d1b4d15d7f30a479cd35eec678dea8' },
  { seq: 2, type: 'lead_answered', at: '2026-03-09T08:02:41Z', detail: 'inbound answered in 190s', prev: '2b345d11b21bea7d057cfe06288c6ecf21d1b4d15d7f30a479cd35eec678dea8', hash: '451b7db631bd9ce55de98ae6343c6151b47fc2e9622f1552c69d628b35026825' },
  { seq: 3, type: 'job_completed', at: '2026-03-18T21:30:12Z', detail: 'roof repair completed, value band B', prev: '451b7db631bd9ce55de98ae6343c6151b47fc2e9622f1552c69d628b35026825', hash: '12bace8edbf258b6da794bf0be83f6261ffb0a414ecb0b0e5367b211e86e9b17' },
  { seq: 4, type: 'review_earned', at: '2026-03-21T16:45:33Z', detail: 'review request answered', prev: '12bace8edbf258b6da794bf0be83f6261ffb0a414ecb0b0e5367b211e86e9b17', hash: '7343a125a941d043102ab9ae1eada917f43084104139a14fa19decfca2bc7ac5' },
  { seq: 5, type: 'storm_response', at: '2026-04-02T06:12:57Z', detail: 'storm-window inbound handled', prev: '7343a125a941d043102ab9ae1eada917f43084104139a14fa19decfca2bc7ac5', hash: '8debfdd705f44fdd385ff9c0d0bc1fcec7c2e798d8f8cd4e77355765a5dec1b6' }
];

export const SYNTHETIC_SIGNALS = {
  location_id: 'SYNTHETIC-PREVIEW',
  verified: true,
  ledger_entries: 412,
  badges: {
    verified_jobs: 23,
    response_ms_median_90d: 238000,        // ~4 minutes
    response_sample_90d: 212,
    booking_reliability_365d: 88,
    booking_sample_365d: 47,
    storm_responder: true,
    reviews_earned: 19,
    rating_avg: null,                      // never rendered regardless
    since_year: 2024
  }
};
