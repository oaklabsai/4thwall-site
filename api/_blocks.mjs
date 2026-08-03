// Evidence blocks — the machine-grade projection of a /c/ profile (TP-2, trust protocol).
// Spec: 4thwall-wiki/system/trust-contract.md (v1.1). This module is the reference
// implementation of the PUBLIC-SYNTHESIS class: every block here is derived from the SAME
// profile_enrichment_public row the /c/ page renders — page and endpoint can never drift
// because they share this source. No other provenance class is ever emitted from here
// (operated blocks arrive via the fusion pipe, TP-6, and are a different lane by ratified
// rule — never merged).
//
// THE MOAT LINE holds: raw star average never appears (it isn't even in PROFILE_SELECT);
// rating_count (a count claim) is permitted — count yes, score no.
//
// Suppression beats filling: a field that's absent yields NO block, never a placeholder.
//
// v1 scope (deliberate, not silent): per-firm blocks only. Field-level share claims
// (job coverage %, emergency-answer %) and rank-band claims (top 10%) are NOT emitted —
// they live on the app surface with their own population disclosure and join the corpus
// as a later masterplan slot-in, not ad hoc here.

// Staleness clock (documented default, 2026-07-17): enrichment runs on a roughly
// monthly-to-quarterly cadence today. fresh ≤120d · aging ≤270d · stale >270d.
// A stale doc still serves (the date is the honesty), labelled stale.
// Shared so the evidence doc's `profile` pointer can never drift from the URL the
// page itself canonicalises to -- the same no-drift rule this module opens with.
// _render-directory.mjs imports nothing, so this adds no cycle.
import { profilePath } from './_render-directory.mjs';

export function staleness(enrichedAt, now = Date.now()) {
  if (!enrichedAt) return 'stale';
  const days = (now - Date.parse(enrichedAt)) / 86400000;
  if (!isFinite(days)) return 'stale';
  return days <= 120 ? 'fresh' : days <= 270 ? 'aging' : 'stale';
}

// One block, contract anatomy. Only the fields a claim actually has — a rate/share
// claim without a denominator would be a contract violation, so none are emitted here.
const block = (o) => o;

export function evidenceBlocks(enr, tradeLabelText) {
  const subject = 'place:' + enr.place_id;
  const asOf = enr.enriched_at ? String(enr.enriched_at).slice(0, 10) : null;
  const blocks = [];

  // the read — Vesta's interpreted public standing (the synthesis bar: interpret, don't itemize)
  if (enr.synthesis) blocks.push(block({
    id: subject + ':standing',
    class: 'public-synthesis',
    claim_kind: 'standing',
    value: String(enr.synthesis),
    window: asOf ? { as_of: asOf } : undefined,
    receipt: {
      method: 'Vesta review-findings synthesis over the firm’s public review record and Connecticut public records',
      ...(enr.deep_review_count ? { reviews_read: Number(enr.deep_review_count) } : {})
    },
    subject_ref: subject
  }));

  // known-for — specialty themes recurring in the firm's own public record
  if (Array.isArray(enr.known_for)) for (const k of enr.known_for) {
    const label = k && (k.label || (typeof k === 'string' ? k : null));
    if (!label) continue;
    blocks.push(block({
      id: subject + ':known-for:' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      class: 'public-synthesis',
      claim_kind: 'specialty',
      value: String(label),
      window: asOf ? { as_of: asOf } : undefined,
      denominator: enr.deep_review_count
        ? { population: 'the firm’s public review record as read by Vesta', reviews_read: Number(enr.deep_review_count) }
        : { population: 'the firm’s public review record as read by Vesta' },
      receipt: { method: 'recurring theme in the firm’s public reviews, validated against Vesta’s county job bank' },
      subject_ref: subject
    }));
  }

  // registration — CT Home Improvement Contractor state (a status fact with a public registry receipt)
  if (enr.registered) blocks.push(block({
    id: subject + ':registration',
    class: 'public-synthesis',
    claim_kind: 'status',
    value: 'Registered Connecticut Home Improvement Contractor',
    ...(enr.hic_issue_date && +String(enr.hic_issue_date).slice(0, 4) !== 1999
      ? { window: { since: String(enr.hic_issue_date).slice(0, 10) } } : {}),
    receipt: { source: 'Connecticut Department of Consumer Protection (eLicense public registry)' },
    subject_ref: subject
  }));

  // trade license — the state trade license the work requires
  if (Array.isArray(enr.trade_license) && enr.trade_license.length) blocks.push(block({
    id: subject + ':trade-license',
    class: 'public-synthesis',
    claim_kind: 'status',
    value: (tradeLabelText || 'Trade') + ' license (Connecticut)',
    receipt: { source: 'Connecticut eLicense public registry' },
    subject_ref: subject
  }));

  // manufacturer certifications — only ever present where the issuer publishes fetchable
  // per-firm verification (the fetchability gate, enrichment doctrine)
  if (Array.isArray(enr.certifications)) for (const c of enr.certifications) {
    if (!c || !c.issuer || !c.level) continue;
    blocks.push(block({
      id: subject + ':certification:' + String(c.issuer).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      class: 'public-synthesis',
      claim_kind: 'status',
      value: c.issuer + ' ' + c.level,
      receipt: { source: 'the issuer’s published certified-contractor registry (' + c.issuer + ')' },
      subject_ref: subject
    }));
  }

  // review footprint — a count claim (count yes, score no; counts survive any privacy choice)
  if (enr.rating_count) blocks.push(block({
    id: subject + ':review-footprint',
    class: 'public-synthesis',
    claim_kind: 'count',
    value: Number(enr.rating_count),
    window: asOf ? { as_of: asOf } : undefined,
    receipt: { source: 'public Google listing (count only — Vesta never republishes the star score)' },
    subject_ref: subject
  }));

  return blocks;
}

// The full evidence document for one subject — what /evidence/:placeId serves and what
// the /c/ page embeds. class_ceiling states plainly what this document can and cannot
// contain; the absence of operated data is disclosed by the ceiling, never papered over.
export function evidenceDoc(enr, tradeLabelText, site) {
  const asOf = enr.enriched_at ? String(enr.enriched_at).slice(0, 10) : null;
  return {
    contract: '4thwall-trust-contract-v1',
    class_ceiling: 'public-synthesis',
    class_ceiling_note: 'Every block in this document is interpreted public record (reviews, licensing, registries). It contains no 4THWALL-operated or provider-recorded measurements; those are separate evidence classes and are never blended into this one.',
    subject: {
      ref: 'place:' + enr.place_id,
      name: enr.business_name,
      trade: enr.trade || null,
      area: 'Fairfield County, CT',
      profile: site + profilePath(enr)
    },
    as_of: asOf,
    staleness: staleness(enr.enriched_at),
    composition_rules: 'Blocks may be selected, arranged, and narrated; no claim may be made that does not trace to a block. Classes are never merged into one number or score.',
    blocks: evidenceBlocks(enr, tradeLabelText)
  };
}
