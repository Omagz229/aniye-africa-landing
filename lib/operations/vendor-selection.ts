/**
 * Manual vendor comparison and selection — H3.4, checkpoint milestone 6.
 *
 * **The first Decision carrying a cost.** An operator who has already spoken to
 * vendors — usually on WhatsApp — types up what each quoted for the item
 * already chosen, picks one, and says why. Aniyé sends nothing and asks nothing
 * automatically; the channel each quote arrived through is a field on the
 * offer, not an integration.
 *
 * Every function is **pure**. Nothing here reads or writes storage, which is
 * what makes "entering, editing, reordering and removing draft offer rows
 * writes nothing" enforceable rather than merely claimed. Only
 * `OperationsRepository.commitVendorSelection` writes, and only on confirmation.
 *
 * ⚠️ **The chosen item comes from the live `ItemSelection` Decision, never from
 * the catalog.** That Decision is the immutable record of what was chosen and
 * at what price; re-reading the catalog here would let a later repricing
 * silently replace history. This is the opposite of H3.3's rule, and
 * deliberately so — there, the catalog *was* the live authority for what could
 * still be picked.
 */

import type { CatalogItemSnapshot } from '../catalog';
import { formatMoney, isValidMoney } from '../money';
import type { Money } from '../money';
import type {
  Decision,
  ExecutionBrief,
  Moment,
  OfferSource,
  OperationalEvent,
  Vendor,
  VendorOffer,
  VendorSnapshot,
} from './types';
import { OFFER_SOURCES } from './types';
import { activeVendors, sameVendorSnapshot, snapshotVendor } from './vendors';
import type { IdFactory } from './generation';

// ─── Reading the item selection ──────────────────────────────────────────────

/** The live `ItemSelection` Decision for a Moment, or null. */
export function findLiveVendorSelection(
  decisions: readonly Decision[],
  momentId: string,
): Decision | null {
  return (
    decisions.find(
      d => d.momentId === momentId && d.decisionType === 'VendorSelection' && d.status === 'Confirmed',
    ) ?? null
  );
}

function findLiveItemSelection(decisions: readonly Decision[], momentId: string): Decision | null {
  return (
    decisions.find(
      d => d.momentId === momentId && d.decisionType === 'ItemSelection' && d.status === 'Confirmed',
    ) ?? null
  );
}

/** What the item selection settled, read back out of its Decision. */
export interface ChosenItem {
  decisionId: string;
  itemId: string;
  snapshot: CatalogItemSnapshot;
}

function readChosenItem(decision: Decision): ChosenItem | null {
  const inputs = decision.inputs as { selectedItemId?: unknown; selectedItem?: CatalogItemSnapshot };
  const snapshot = inputs.selectedItem;
  if (typeof inputs.selectedItemId !== 'string' || !snapshot || typeof snapshot !== 'object') return null;
  if (snapshot.itemId !== inputs.selectedItemId || !isValidMoney(snapshot.price)) return null;
  return {
    decisionId: decision.id,
    itemId: inputs.selectedItemId,
    // Defensively copied on the way out, so a caller cannot reach back into a
    // stored Decision through the object it was handed.
    snapshot: { ...snapshot, price: { ...snapshot.price } },
  };
}

export function sameItemSnapshot(a: unknown, b: CatalogItemSnapshot): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const s = a as Partial<CatalogItemSnapshot>;
  const price = s.price as Partial<Money> | undefined;
  return (
    s.itemId === b.itemId &&
    s.name === b.name &&
    s.category === b.category &&
    price?.amountMinor === b.price.amountMinor &&
    price?.currency === b.price.currency
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

/** A named reason vendor comparison cannot proceed, with the way out of it. */
export interface VendorBlocker {
  code:
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'no-item-selection'
    | 'item-evidence-unreadable'
    | 'selection-exists'
    | 'no-active-vendors';
  message: string;
  recovery: string;
  href?: string;
}

/** A confirmed vendor selection, read back for display. */
export interface ConfirmedVendorSelection {
  decisionId: string;
  vendor: VendorSnapshot;
  quotedVendorCost: Money;
  offerId: string;
  consideredCount: number;
  reason: string;
  confirmedAt: string;
}

export interface VendorSelectionPreview {
  momentId: string;
  brief: ExecutionBrief | null;
  /** The approved recognition budget, for context. **Never** the quote ceiling. */
  approvedBudget: Money | null;
  chosen: ChosenItem | null;
  /** Active only, alphabetical. An ordering, not a ranking. */
  vendors: Vendor[];
  confirmed: ConfirmedVendorSelection | null;
  blockers: VendorBlocker[];
  /** True only when the operator may enter offers and confirm one. */
  selectable: boolean;
}

export interface VendorSelectionContext {
  moment: Moment;
  /** The Moment's current live brief, or null. */
  brief: ExecutionBrief | null;
  decisions: readonly Decision[];
  vendors: readonly Vendor[];
}

/**
 * What the operator may compare, and what stops them.
 *
 * **Writes nothing.** Call it on every render and every keystroke of a filter.
 *
 * The delivery context comes from the **current** brief; the item comes from the
 * **live `ItemSelection` Decision**. Those are different sources on purpose: a
 * brief may have taken a governed address-only revision after the item was
 * chosen, and that must not invalidate the item. The vendor selection records
 * both references so the pairing is legible later.
 */
export function previewVendorSelection(context: VendorSelectionContext): VendorSelectionPreview {
  const { moment, brief } = context;
  const blockers: VendorBlocker[] = [];

  const liveVendorDecision = findLiveVendorSelection(context.decisions, moment.id);
  const confirmed = liveVendorDecision ? readConfirmedVendor(liveVendorDecision) : null;

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so no vendor can be engaged for it.',
      recovery: 'Nothing to do here. The cancellation and its reason stay on the record.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review, so there is nothing to quote against yet.',
      recovery: 'Resolve the issues listed on the moment, then confirm its brief.',
    });
  }

  if (!brief || brief.status !== 'Confirmed') {
    blockers.push({
      code: 'no-confirmed-brief',
      message: 'No brief has been confirmed for this moment yet.',
      recovery: 'Confirm the brief first — it fixes where this is going and what was approved.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }

  const itemDecision = findLiveItemSelection(context.decisions, moment.id);
  let chosen: ChosenItem | null = null;

  if (!itemDecision) {
    blockers.push({
      code: 'no-item-selection',
      message: 'No item has been chosen for this moment yet.',
      recovery: 'Choose an item first — a vendor quotes for something specific.',
      href: `/operations/moments/${moment.id}/item`,
    });
  } else {
    chosen = readChosenItem(itemDecision);
    if (!chosen) {
      // The Decision exists but cannot be read as an item choice. Refusing is
      // the only honest outcome: guessing the item from the catalog would
      // fabricate the very evidence a vendor is being asked to quote against.
      blockers.push({
        code: 'item-evidence-unreadable',
        message: 'The record of the chosen item cannot be read, so there is nothing to quote against.',
        recovery: 'This moment needs a governed correction before it can go further. Nothing has been changed.',
      });
    }
  }

  if (liveVendorDecision) {
    blockers.push({
      code: 'selection-exists',
      message: 'A vendor has already been chosen for this moment.',
      recovery: 'It stands on the record. Changing it needs a governed correction, which this build does not do.',
    });
  }

  const available = activeVendors(context.vendors);
  if (blockers.length === 0 && available.length === 0) {
    blockers.push({
      code: 'no-active-vendors',
      message: 'There are no active vendors to ask.',
      recovery: 'Add a vendor to the directory, or reactivate one, then come back.',
      href: '/operations/vendors',
    });
  }

  return {
    momentId: moment.id,
    brief: brief ?? null,
    approvedBudget: brief?.policyResolutionSnapshot.approvedRecognitionBudget ?? null,
    chosen,
    vendors: available,
    confirmed,
    blockers,
    selectable: blockers.length === 0,
  };
}

function readConfirmedVendor(decision: Decision): ConfirmedVendorSelection | null {
  const inputs = decision.inputs as {
    selectedVendor?: VendorSnapshot;
    selectedOfferId?: string;
    consideredOffers?: unknown[];
    selectedQuotedVendorCost?: Money;
  };
  if (!inputs.selectedVendor || !inputs.selectedQuotedVendorCost) return null;
  return {
    decisionId: decision.id,
    vendor: inputs.selectedVendor,
    quotedVendorCost: inputs.selectedQuotedVendorCost,
    offerId: inputs.selectedOfferId ?? '',
    consideredCount: Array.isArray(inputs.consideredOffers) ? inputs.consideredOffers.length : 0,
    reason: decision.reason,
    confirmedAt: decision.confirmedAt,
  };
}

// ─── Draft offers ────────────────────────────────────────────────────────────

/** One row on the comparison screen. **Component state until confirmation.** */
export interface OfferDraft {
  vendorId: string;
  /** Major units as typed. Parsed, never inferred from the catalog price. */
  amount: string;
  source: OfferSource;
  quotedAt: string;
  leadTimeDays: string;
  terms: string;
}

export function emptyOfferDraft(): OfferDraft {
  return { vendorId: '', amount: '', source: 'WhatsApp', quotedAt: '', leadTimeDays: '', terms: '' };
}

export interface OfferFieldErrors {
  vendor?: string;
  amount?: string;
  quotedAt?: string;
  leadTimeDays?: string;
}

export type OfferDraftResult =
  | { ok: true; value: NormalizedOffer }
  | { ok: false; errors: OfferFieldErrors };

export interface NormalizedOffer {
  vendor: Vendor;
  quotedVendorCost: Money;
  source: OfferSource;
  quotedAt: string;
  leadTimeDays?: number;
  terms?: string;
}

function parseMinorUnits(amount: string, currency: string): Money | null {
  const trimmed = amount.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [major, fraction = ''] = trimmed.split('.');
  const padded = (fraction + '00').slice(0, 2);
  const amountMinor = Number(major) * 100 + Number(padded);
  if (!Number.isSafeInteger(amountMinor)) return null;
  return { amountMinor, currency };
}

/**
 * Check one draft row against the vendors and the currency it must be quoted in.
 *
 * **The currency is fixed by the item and the approved budget, not chosen here.**
 * ADR-007: currencies are never compared or converted implicitly, so a quote in
 * another currency is not "close enough" — it is incomparable, and accepting it
 * would silently invent an exchange rate.
 *
 * **Zero is allowed. Negative is not.** A vendor absorbing a cost is a real
 * quote an operator may need to record; refusing it would encode a commercial
 * rule nobody decided. A negative quote is not a discount, it is a data error.
 * There is deliberately no rule that a quote must sit below the catalog price:
 * the two answer different questions, and inventing that constraint would make
 * the tool lie about what vendors actually said.
 */
export function validateOfferDraft(
  draft: OfferDraft,
  vendors: readonly Vendor[],
  currency: string,
): OfferDraftResult {
  const errors: OfferFieldErrors = {};

  const vendor = vendors.find(v => v.id === draft.vendorId);
  if (!vendor) {
    errors.vendor = 'Choose a vendor.';
  } else if (!vendor.isActive) {
    errors.vendor = `${vendor.name} is deactivated. Reactivate them in the directory, or choose someone else.`;
  }

  const money = parseMinorUnits(draft.amount, currency);
  if (money === null) {
    errors.amount = draft.amount.trim().length === 0
      ? 'What did they quote?'
      : `Enter an amount in ${currency}, to at most two decimal places.`;
  } else if (!isValidMoney(money)) {
    errors.amount = `${currency} is not a currency this build can record.`;
  }

  const quotedAt = draft.quotedAt.trim();
  if (quotedAt.length === 0) {
    errors.quotedAt = 'When did they quote it?';
  } else if (Number.isNaN(Date.parse(quotedAt))) {
    errors.quotedAt = 'That date could not be read.';
  }

  let leadTimeDays: number | undefined;
  const lead = draft.leadTimeDays.trim();
  if (lead.length > 0) {
    if (!/^\d+$/.test(lead)) {
      errors.leadTimeDays = 'Lead time is a whole number of days.';
    } else {
      leadTimeDays = Number(lead);
      if (!Number.isSafeInteger(leadTimeDays)) errors.leadTimeDays = 'That lead time is too large.';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const terms = draft.terms.trim();
  return {
    ok: true,
    value: {
      vendor: vendor!,
      quotedVendorCost: money!,
      source: draft.source,
      quotedAt: new Date(quotedAt).toISOString(),
      ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
      ...(terms.length > 0 ? { terms } : {}),
    },
  };
}

// ─── Confirmation ────────────────────────────────────────────────────────────

/** What one confirmation writes: every offer, one Decision, one Event. */
export interface VendorSelectionBundle {
  offers: VendorOffer[];
  decision: Decision;
  event: OperationalEvent;
}

export interface ConfirmVendorSelectionInput extends VendorSelectionContext {
  /** Validated rows, in the order the operator entered them. */
  offers: readonly NormalizedOffer[];
  /** Index into `offers`. The operator picks; the system never suggests. */
  selectedIndex: number;
  reason: string;
  now: string;
  ids: IdFactory & { offer: () => string };
  actorId?: string;
}

export type VendorSelectionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Build everything a confirmed vendor selection writes.
 *
 * **Refuses rather than repairs.** If the preview is not selectable, if a
 * vendor appears twice, if a quote is in the wrong currency, or if the chosen
 * index is out of range, nothing is built.
 *
 * There is **no recommendation**. H3.4 ranks nothing and suggests nothing, so
 * there is nothing to override and `overrideReason` is deliberately absent
 * rather than empty.
 */
export function buildVendorSelection(
  input: ConfirmVendorSelectionInput,
): VendorSelectionResult<VendorSelectionBundle> {
  const { moment, now, ids, actorId } = input;

  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, reason: 'Say why you chose this vendor — it becomes part of the record.' };
  }

  const preview = previewVendorSelection(input);
  if (!preview.selectable) {
    return {
      ok: false,
      reason: preview.blockers.map(b => b.message).join(' ') || 'A vendor cannot be chosen for this moment.',
    };
  }

  const brief = preview.brief;
  const chosen = preview.chosen;
  if (!brief || !chosen) {
    return { ok: false, reason: 'This moment has no confirmed brief and item to quote against.' };
  }

  if (input.offers.length === 0) {
    return { ok: false, reason: 'Record at least one quote before choosing a vendor.' };
  }

  // One quote per vendor in a comparison. The same vendor twice is not two
  // alternatives, and the Decision would be unable to say which one was chosen.
  const seen = new Set<string>();
  for (const offer of input.offers) {
    if (seen.has(offer.vendor.id)) {
      return { ok: false, reason: `${offer.vendor.name} appears twice. Record one quote per vendor.` };
    }
    seen.add(offer.vendor.id);
    if (!offer.vendor.isActive) {
      return { ok: false, reason: `${offer.vendor.name} is deactivated and cannot be chosen.` };
    }
    if (offer.quotedVendorCost.currency !== chosen.snapshot.price.currency) {
      return {
        ok: false,
        reason: `${offer.vendor.name} quoted in ${offer.quotedVendorCost.currency}, but this moment is in ${chosen.snapshot.price.currency}. Quotes are never converted.`,
      };
    }
    if (!isValidMoney(offer.quotedVendorCost) || offer.quotedVendorCost.amountMinor < 0) {
      return { ok: false, reason: `${offer.vendor.name}'s quote is not a valid amount.` };
    }
  }

  if (input.selectedIndex < 0 || input.selectedIndex >= input.offers.length) {
    return { ok: false, reason: 'Choose one of the quotes you recorded.' };
  }

  const offers: VendorOffer[] = input.offers.map(entry => ({
    id: ids.offer(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    briefId: brief.id,
    briefRevision: brief.revision,
    itemSelectionDecisionId: chosen.decisionId,
    selectedItemId: chosen.itemId,
    // Copied, never aliased — a stored offer must not hold a live reference
    // into the Decision or the vendor record it was built from.
    itemSnapshot: { ...chosen.snapshot, price: { ...chosen.snapshot.price } },
    vendorId: entry.vendor.id,
    vendorSnapshot: snapshotVendor(entry.vendor),
    quotedVendorCost: { ...entry.quotedVendorCost },
    source: entry.source,
    quotedAt: entry.quotedAt,
    recordedAt: now,
    ...(entry.leadTimeDays !== undefined ? { leadTimeDays: entry.leadTimeDays } : {}),
    ...(entry.terms !== undefined ? { terms: entry.terms } : {}),
  }));

  const selected = offers[input.selectedIndex];

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'VendorSelection',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    /**
     * The **complete considered set**, in the order it was compared — not a
     * count, not a list of ids.
     *
     * The rejected offers are every considered offer other than the selected
     * one, and they have to stay legible years later. Storing ids alone would
     * make the meaning of this Decision depend on records that can be edited
     * afterwards, so every offer carries its own vendor and money snapshot.
     */
    inputs: {
      briefId: brief.id,
      briefRevision: brief.revision,
      itemSelectionDecisionId: chosen.decisionId,
      selectedItemId: chosen.itemId,
      selectedItem: { ...chosen.snapshot, price: { ...chosen.snapshot.price } },
      approvedBudget: { ...brief.policyResolutionSnapshot.approvedRecognitionBudget },
      consideredOffers: offers.map(summariseOffer),
      selectedOfferId: selected.id,
      selectedVendorId: selected.vendorId,
      selectedVendor: { ...selected.vendorSnapshot },
      selectedQuotedVendorCost: { ...selected.quotedVendorCost },
    },
    // Display only. This is an estimate of what the vendor will charge Aniyé —
    // not a paid cost, not the customer's charge, and not a RecognitionOrder.
    finalDecision: `${selected.vendorSnapshot.name} — ${formatMoney(selected.quotedVendorCost)} quoted`,
    reason,
    createdAt: now,
    confirmedAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    eventType: 'VendorSelected',
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    // Only enough to find the evidence. The evidence itself lives on the
    // Decision and the offers; duplicating it here would create two versions.
    payload: {
      briefId: brief.id,
      briefRevision: brief.revision,
      itemSelectionDecisionId: chosen.decisionId,
      selectedOfferId: selected.id,
      selectedVendorId: selected.vendorId,
    },
    occurredAt: now,
    recordedAt: now,
  };

  return { ok: true, value: { offers, decision, event } };
}

/** One offer as it appears inside the Decision — complete, and self-contained. */
export interface ConsideredOffer {
  offerId: string;
  vendorId: string;
  vendor: VendorSnapshot;
  quotedVendorCost: Money;
  source: OfferSource;
  quotedAt: string;
  leadTimeDays?: number;
  terms?: string;
}

function summariseOffer(offer: VendorOffer): ConsideredOffer {
  return {
    offerId: offer.id,
    vendorId: offer.vendorId,
    vendor: { ...offer.vendorSnapshot },
    quotedVendorCost: { ...offer.quotedVendorCost },
    source: offer.source,
    quotedAt: offer.quotedAt,
    ...(offer.leadTimeDays !== undefined ? { leadTimeDays: offer.leadTimeDays } : {}),
    ...(offer.terms !== undefined ? { terms: offer.terms } : {}),
  };
}

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Prove a submitted vendor selection against recomputed truth.
 *
 * The same rule H3.3's boundary follows: **recompute and compare, never believe
 * what was handed in.** A structurally valid bundle must not be able to keep the
 * right brief and item references while altering a vendor, a quote, a channel, a
 * timestamp or the considered set.
 *
 * ⚠️ **One honest limit.** The repository can verify everything Aniyé holds —
 * the Moment, the brief, the item Decision, the vendor records, the internal
 * consistency of the bundle. It **cannot prove what a vendor actually said**.
 * A quote is operator testimony, and no amount of re-reading local state turns
 * it into an independently verified fact. That is why every offer records its
 * channel, its quoted time and who recorded it: the evidence is attributable,
 * not proven.
 */
export interface VerifyVendorSelectionInput {
  workspaceId: string;
  moment: Moment;
  briefs: readonly ExecutionBrief[];
  decisions: readonly Decision[];
  vendors: readonly Vendor[];
  write: VendorSelectionBundle;
}

export type VerifyVendorSelectionResult = { ok: true } | { ok: false; reason: string };

const REVIEW_AGAIN = 'Review the moment and record the quotes again — nothing was recorded.';

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} ${REVIEW_AGAIN}` };
}

function sameMoney(a: unknown, b: Money): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const m = a as Partial<Money>;
  return m.amountMinor === b.amountMinor && m.currency === b.currency;
}

export function verifyVendorSelection(
  input: VerifyVendorSelectionInput,
): VerifyVendorSelectionResult {
  const { workspaceId, moment, write } = input;
  const { offers, decision, event } = write;

  // ── 1. The Decision must be the kind of record this operation writes ──
  if (decision.decisionType !== 'VendorSelection') {
    return refuse('That decision does not record a vendor selection.');
  }
  if (decision.status !== 'Confirmed') {
    return refuse('A vendor selection is only ever recorded as Confirmed.');
  }
  if (decision.provider !== 'HumanOperator') {
    return refuse('A vendor selection must be recorded as an operator judgement.');
  }
  if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
    return refuse('A vendor selection needs a reason.');
  }
  if (decision.recommendation !== undefined || decision.overrideReason !== undefined) {
    return refuse('A vendor selection carries no recommendation to override.');
  }
  if (decision.workspaceId !== workspaceId || decision.momentId !== moment.id) {
    return refuse('That decision belongs to a different workspace or moment.');
  }

  // ── 2. The Moment must still be executable ──
  if (moment.status === 'Cancelled') return refuse('That moment has been cancelled.');
  if (moment.status !== 'ReadyForExecution') return refuse('That moment is no longer ready for execution.');
  if (moment.workspaceId !== workspaceId) return refuse('That moment belongs to a different workspace.');

  // ── 3. One live vendor selection, ever ──
  if (findLiveVendorSelection(input.decisions, moment.id)) {
    return refuse('A vendor has already been chosen for this moment.');
  }

  // ── 4. The brief the operator quoted against must still be the live one ──
  const live = input.briefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
  if (!live) return refuse('This moment has no confirmed brief.');

  const inputs = decision.inputs as Record<string, unknown>;
  if (inputs.briefId !== live.id || inputs.briefRevision !== live.revision) {
    return refuse('The brief was corrected while this was open.');
  }

  // ── 5. The item comes from the live ItemSelection Decision, not the catalog ──
  const itemDecision = findLiveItemSelection(input.decisions, moment.id);
  if (!itemDecision) return refuse('No item has been chosen for this moment.');
  if (inputs.itemSelectionDecisionId !== itemDecision.id) {
    return refuse('The chosen item changed while this was open.');
  }
  const chosen = readChosenItem(itemDecision);
  if (!chosen) return refuse('The record of the chosen item cannot be read.');

  if (inputs.selectedItemId !== chosen.itemId) {
    return refuse('The recorded item does not match the one chosen for this moment.');
  }
  if (!sameItemSnapshot(inputs.selectedItem, chosen.snapshot)) {
    return refuse('The recorded details of the chosen item do not match the item selection.');
  }
  if (!sameMoney(inputs.approvedBudget, live.policyResolutionSnapshot.approvedRecognitionBudget)) {
    return refuse('The recorded budget does not match the brief.');
  }

  const currency = chosen.snapshot.price.currency;

  // ── 6. Every offer, recomputed against the live vendor records ──
  if (offers.length === 0) return refuse('No quotes were submitted.');

  const offerIds = new Set<string>();
  const vendorIds = new Set<string>();

  for (const offer of offers) {
    if (!offer.id || offerIds.has(offer.id)) return refuse('Two quotes share an identifier.');
    offerIds.add(offer.id);
    if (vendorIds.has(offer.vendorId)) return refuse('The same vendor was recorded twice.');
    vendorIds.add(offer.vendorId);

    if (offer.workspaceId !== workspaceId || offer.momentId !== moment.id) {
      return refuse('A quote belongs to a different workspace or moment.');
    }
    if (offer.briefId !== live.id || offer.briefRevision !== live.revision) {
      return refuse('A quote refers to a different brief.');
    }
    if (offer.itemSelectionDecisionId !== itemDecision.id || offer.selectedItemId !== chosen.itemId) {
      return refuse('A quote refers to a different item.');
    }
    if (!sameItemSnapshot(offer.itemSnapshot, chosen.snapshot)) {
      return refuse('A quote records different details of the chosen item.');
    }

    const vendor = input.vendors.find(v => v.id === offer.vendorId);
    if (!vendor) return refuse('A quoted vendor is no longer in the directory.');
    if (vendor.workspaceId !== workspaceId) return refuse('A quoted vendor belongs to a different workspace.');
    if (!vendor.isActive) return refuse(`"${vendor.name}" was deactivated while this was open.`);
    // The snapshot must match the record **as it stands now**, so a rename
    // between the screen opening and confirming stops the write rather than
    // silently recording a name nobody would recognize later.
    if (!sameVendorSnapshot(offer.vendorSnapshot, snapshotVendor(vendor))) {
      return refuse(`"${vendor.name}"'s directory entry changed while this was open.`);
    }

    if (!isValidMoney(offer.quotedVendorCost) || offer.quotedVendorCost.amountMinor < 0) {
      return refuse('A quote is not a valid amount.');
    }
    if (offer.quotedVendorCost.currency !== currency) {
      return refuse(`A quote is not in ${currency}, and quotes are never converted.`);
    }
    if (!(OFFER_SOURCES as readonly string[]).includes(offer.source)) {
      return refuse('A quote records an unknown channel.');
    }
    if (!offer.quotedAt || Number.isNaN(Date.parse(offer.quotedAt))) {
      return refuse('A quote has no readable quoted time.');
    }
    if (offer.recordedAt !== decision.confirmedAt) {
      return refuse('A quote was recorded at a different instant from the decision.');
    }
    if (
      offer.leadTimeDays !== undefined &&
      (!Number.isInteger(offer.leadTimeDays) || offer.leadTimeDays < 0)
    ) {
      return refuse('A quote has an invalid lead time.');
    }
  }

  // ── 7. The considered set in the Decision must be exactly these offers ──
  const expected = offers.map(summariseOffer);
  const considered = inputs.consideredOffers;
  if (!Array.isArray(considered) || considered.length !== expected.length) {
    return refuse('The recorded list of quotes does not match the quotes submitted.');
  }
  for (const [i, entry] of considered.entries()) {
    const want = expected[i];
    if (typeof entry !== 'object' || entry === null) return refuse('A recorded quote is unreadable.');
    const got = entry as Partial<ConsideredOffer>;
    if (
      got.offerId !== want.offerId ||
      got.vendorId !== want.vendorId ||
      got.source !== want.source ||
      got.quotedAt !== want.quotedAt ||
      got.leadTimeDays !== want.leadTimeDays ||
      got.terms !== want.terms ||
      !sameMoney(got.quotedVendorCost, want.quotedVendorCost) ||
      !sameVendorSnapshot(got.vendor, want.vendor)
    ) {
      return refuse('The recorded quotes do not match the quotes submitted.');
    }
  }

  // ── 8. The selection must resolve to exactly one of them ──
  const selected = offers.find(o => o.id === inputs.selectedOfferId);
  if (!selected) return refuse('The chosen quote is not among the quotes submitted.');
  if (inputs.selectedVendorId !== selected.vendorId) {
    return refuse('The chosen vendor does not match the chosen quote.');
  }
  if (!sameVendorSnapshot(inputs.selectedVendor, selected.vendorSnapshot)) {
    return refuse('The recorded details of the chosen vendor do not match the chosen quote.');
  }
  if (!sameMoney(inputs.selectedQuotedVendorCost, selected.quotedVendorCost)) {
    return refuse('The recorded chosen quote does not match its offer.');
  }

  // ── 9. The Event must describe the same occurrence ──
  if (event.eventType !== 'VendorSelected') return refuse('That event does not record a vendor selection.');
  if (event.workspaceId !== workspaceId || event.momentId !== moment.id) {
    return refuse('That event belongs to a different workspace or moment.');
  }
  if (event.actorType !== 'Operator') return refuse('A vendor selection is an operator action.');
  if (event.source !== 'Platform') return refuse('A vendor selection recorded here came through the platform.');
  if (event.actorId !== decision.actorId) return refuse('The decision and event name different actors.');

  const payload = event.payload as Record<string, unknown>;
  if (
    payload.briefId !== inputs.briefId ||
    payload.briefRevision !== inputs.briefRevision ||
    payload.itemSelectionDecisionId !== inputs.itemSelectionDecisionId ||
    payload.selectedOfferId !== inputs.selectedOfferId ||
    payload.selectedVendorId !== inputs.selectedVendorId
  ) {
    return refuse('The event and the decision disagree about what was chosen.');
  }

  // One transaction, therefore one instant.
  if (decision.createdAt !== decision.confirmedAt) {
    return refuse('The decision was created and confirmed at different times.');
  }
  if (event.occurredAt !== event.recordedAt || event.occurredAt !== decision.confirmedAt) {
    return refuse('The event and the decision disagree about when this happened.');
  }

  return { ok: true };
}
