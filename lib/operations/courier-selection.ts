/**
 * Manual courier selection — H3.5, checkpoint milestone 7.
 *
 * **The last cost in the picture.** The item is chosen, the vendor is chosen,
 * and this is who carries it the final leg and what that leg costs. The
 * operator picks from the couriers who actually serve the delivery country.
 *
 * Every function is **pure**. Nothing here reads or writes storage. Only
 * `OperationsRepository.commitCourierSelection` writes, and only on
 * confirmation.
 *
 * ─── Why this is shaped like H3.3, not H3.4 ──────────────────────────────────
 * A vendor comparison had to persist several **hand-entered** quotes, because
 * nothing in the system knows what a vendor will say. The courier alternatives,
 * by contrast, are *knowable*: they are exactly the active couriers serving the
 * delivery country. So the candidate set is **recomputed**, like H3.3's eligible
 * items, rather than typed in — and one cost is recorded, not several.
 *
 * ⚠️ **The delivery country comes from the live confirmed brief**, and the
 * vendor and item from their live Decisions. None of it is re-derived from
 * Workspace: a customer editing an address afterwards must not silently change
 * who was asked to carry what.
 */

import { formatMoney, isValidMoney } from '../money';
import type { Money } from '../money';
import type {
  Courier,
  CourierSnapshot,
  Decision,
  ExecutionBrief,
  Moment,
  OfferSource,
  OperationalEvent,
  VendorSnapshot,
} from './types';
import { OFFER_SOURCES, isPlainRecord } from './types';
import { couriersFor, exactCourierSnapshot, snapshotCourier } from './couriers';
import { isIsoInstant } from './vendors';
import type { IdFactory } from './generation';

// ─── Reading what came before ────────────────────────────────────────────────

export function findLiveCourierSelection(
  decisions: readonly Decision[],
  momentId: string,
): Decision | null {
  return (
    decisions.find(
      d => d.momentId === momentId && d.decisionType === 'CourierSelection' && d.status === 'Confirmed',
    ) ?? null
  );
}

function findLive(decisions: readonly Decision[], momentId: string, type: Decision['decisionType']): Decision | null {
  return (
    decisions.find(d => d.momentId === momentId && d.decisionType === type && d.status === 'Confirmed') ?? null
  );
}

/** What the vendor selection settled, read back as a canonical projection. */
export interface ChosenVendor {
  decisionId: string;
  vendorId: string;
  snapshot: VendorSnapshot;
  quotedVendorCost: Money;
}

function readChosenVendor(decision: Decision): ChosenVendor | null {
  const inputs = decision.inputs as {
    selectedVendorId?: unknown;
    selectedVendor?: VendorSnapshot;
    selectedQuotedVendorCost?: Money;
  };
  const snapshot = inputs.selectedVendor;
  const cost = inputs.selectedQuotedVendorCost;
  if (typeof inputs.selectedVendorId !== 'string' || !snapshot || typeof snapshot !== 'object') return null;
  if (snapshot.vendorId !== inputs.selectedVendorId || !isValidMoney(cost)) return null;
  return {
    decisionId: decision.id,
    vendorId: inputs.selectedVendorId,
    // Canonical projections, so nothing undeclared can be inherited from stored
    // history — H3.4-D2's rule, applied here from the start.
    snapshot: {
      vendorId: snapshot.vendorId,
      name: snapshot.name,
      countryCode: snapshot.countryCode,
      city: snapshot.city,
    },
    quotedVendorCost: { amountMinor: cost.amountMinor, currency: cost.currency },
  };
}

/** What the item selection settled — only what a courier selection needs of it. */
export interface ChosenItemRef {
  decisionId: string;
  itemId: string;
  name: string;
}

function readChosenItemRef(decision: Decision): ChosenItemRef | null {
  const inputs = decision.inputs as { selectedItemId?: unknown; selectedItem?: { name?: unknown } };
  if (typeof inputs.selectedItemId !== 'string') return null;
  const name = inputs.selectedItem?.name;
  if (typeof name !== 'string') return null;
  return { decisionId: decision.id, itemId: inputs.selectedItemId, name };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface CourierBlocker {
  code:
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'no-item-selection'
    | 'no-vendor-selection'
    | 'evidence-unreadable'
    | 'selection-exists'
    | 'no-courier-for-country';
  message: string;
  recovery: string;
  href?: string;
}

export interface ConfirmedCourierSelection {
  decisionId: string;
  courier: CourierSnapshot;
  quotedCourierCost: Money;
  consideredCount: number;
  reason: string;
  confirmedAt: string;
}

export interface CourierSelectionPreview {
  momentId: string;
  brief: ExecutionBrief | null;
  /** Where this is going. The reason the directory is scoped per country. */
  deliveryCountryCode: string | null;
  chosenItem: ChosenItemRef | null;
  chosenVendor: ChosenVendor | null;
  /** Active couriers serving the delivery country, alphabetical. Not a ranking. */
  couriers: Courier[];
  confirmed: ConfirmedCourierSelection | null;
  blockers: CourierBlocker[];
  selectable: boolean;
}

export interface CourierSelectionContext {
  moment: Moment;
  brief: ExecutionBrief | null;
  decisions: readonly Decision[];
  couriers: readonly Courier[];
}

/**
 * What the operator may choose from, and what stops them.
 *
 * **Writes nothing.**
 */
export function previewCourierSelection(context: CourierSelectionContext): CourierSelectionPreview {
  const { moment, brief } = context;
  const blockers: CourierBlocker[] = [];

  const liveCourierDecision = findLiveCourierSelection(context.decisions, moment.id);
  const confirmed = liveCourierDecision ? readConfirmedCourier(liveCourierDecision) : null;

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so nothing needs carrying.',
      recovery: 'Nothing to do here. The cancellation and its reason stay on the record.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review, so there is nothing to arrange carriage for.',
      recovery: 'Resolve the issues listed on the moment, then confirm its brief.',
    });
  }

  if (!brief || brief.status !== 'Confirmed') {
    blockers.push({
      code: 'no-confirmed-brief',
      message: 'No brief has been confirmed for this moment yet.',
      recovery: 'Confirm the brief first — it fixes where this is going.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }

  const itemDecision = findLive(context.decisions, moment.id, 'ItemSelection');
  const vendorDecision = findLive(context.decisions, moment.id, 'VendorSelection');

  let chosenItem: ChosenItemRef | null = null;
  let chosenVendor: ChosenVendor | null = null;

  if (!itemDecision) {
    blockers.push({
      code: 'no-item-selection',
      message: 'No item has been chosen for this moment yet.',
      recovery: 'Choose an item first — there is nothing to carry until there is.',
      href: `/operations/moments/${moment.id}/item`,
    });
  } else {
    chosenItem = readChosenItemRef(itemDecision);
  }

  if (itemDecision && !vendorDecision) {
    blockers.push({
      code: 'no-vendor-selection',
      message: 'No vendor has been chosen for this moment yet.',
      recovery: 'Choose a vendor first — the courier collects from them.',
      href: `/operations/moments/${moment.id}/vendor`,
    });
  } else if (vendorDecision) {
    chosenVendor = readChosenVendor(vendorDecision);
  }

  if ((itemDecision && !chosenItem) || (vendorDecision && !chosenVendor)) {
    // The Decisions exist but cannot be read. Refusing is the only honest
    // outcome — reconstructing them from live configuration would fabricate the
    // evidence a courier is being booked against.
    blockers.push({
      code: 'evidence-unreadable',
      message: 'The record of what was chosen for this moment cannot be read.',
      recovery: 'This moment needs a governed correction before it can go further. Nothing has been changed.',
    });
  }

  if (liveCourierDecision) {
    blockers.push({
      code: 'selection-exists',
      message: 'A courier has already been chosen for this moment.',
      recovery: 'It stands on the record. Changing it needs a governed correction, which this build does not do.',
    });
  }

  const deliveryCountryCode = brief?.deliveryAddressSnapshot.countryCode ?? null;
  const couriers = deliveryCountryCode ? couriersFor(context.couriers, deliveryCountryCode) : [];

  // The named gap. Checkpoint milestone 7's completion test is precisely this:
  // a courier is selectable for every country deliveries go to, *or the gap is
  // named* — with the country in it, so the operator knows what to fix.
  if (blockers.length === 0 && couriers.length === 0) {
    blockers.push({
      code: 'no-courier-for-country',
      message: `No active courier carries in ${deliveryCountryCode}.`,
      recovery: `Add a courier for ${deliveryCountryCode} to the directory, or reactivate one, then come back.`,
      href: '/operations/couriers',
    });
  }

  return {
    momentId: moment.id,
    brief: brief ?? null,
    deliveryCountryCode,
    chosenItem,
    chosenVendor,
    couriers,
    confirmed,
    blockers,
    selectable: blockers.length === 0,
  };
}

function readConfirmedCourier(decision: Decision): ConfirmedCourierSelection | null {
  const inputs = decision.inputs as {
    selectedCourier?: CourierSnapshot;
    quotedCourierCost?: Money;
    consideredCouriers?: unknown[];
  };
  if (!inputs.selectedCourier || !inputs.quotedCourierCost) return null;
  return {
    decisionId: decision.id,
    courier: inputs.selectedCourier,
    quotedCourierCost: inputs.quotedCourierCost,
    consideredCount: Array.isArray(inputs.consideredCouriers) ? inputs.consideredCouriers.length : 0,
    reason: decision.reason,
    confirmedAt: decision.confirmedAt,
  };
}

// ─── The draft ───────────────────────────────────────────────────────────────

export interface CourierQuoteDraft {
  courierId: string;
  /** Major units as typed. Never inferred from the vendor quote or the budget. */
  amount: string;
  source: OfferSource;
  quotedAt: string;
  leadTimeDays: string;
  terms: string;
}

export function emptyCourierQuoteDraft(): CourierQuoteDraft {
  return { courierId: '', amount: '', source: 'WhatsApp', quotedAt: '', leadTimeDays: '', terms: '' };
}

export interface CourierQuoteErrors {
  courier?: string;
  amount?: string;
  quotedAt?: string;
  leadTimeDays?: string;
}

export type CourierQuoteResult =
  | { ok: true; value: NormalizedCourierQuote }
  | { ok: false; errors: CourierQuoteErrors };

export interface NormalizedCourierQuote {
  courier: Courier;
  quotedCourierCost: Money;
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
 * Check one courier quote against the couriers serving this country.
 *
 * **The currency is fixed by the moment, not chosen here** (ADR-007): a courier
 * cost in another currency is not comparable to the vendor cost or the budget,
 * and converting it would invent a rate nobody approved.
 *
 * **Zero is allowed. Negative is not.** A courier absorbing a leg — or a vendor
 * delivering it themselves at no extra charge — is a real quote, and refusing it
 * would encode a commercial rule nobody decided. There is deliberately **no rule
 * relating the courier cost to the vendor cost or the approved budget**: the
 * budget governs what the *recipient* receives (ADR-004), and inventing a
 * carriage ceiling here would be a commercial decision U3 has not made.
 */
export function validateCourierQuote(
  draft: CourierQuoteDraft,
  couriers: readonly Courier[],
  currency: string,
): CourierQuoteResult {
  const errors: CourierQuoteErrors = {};

  const courier = couriers.find(c => c.id === draft.courierId);
  if (!courier) {
    errors.courier = 'Choose a courier.';
  } else if (!courier.isActive) {
    errors.courier = `${courier.name} is deactivated. Reactivate them in the directory, or choose someone else.`;
  }

  const money = parseMinorUnits(draft.amount, currency);
  if (money === null) {
    errors.amount = draft.amount.trim().length === 0
      ? 'What did they quote for carriage?'
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
      courier: courier!,
      quotedCourierCost: money!,
      source: draft.source,
      quotedAt: new Date(quotedAt).toISOString(),
      ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
      ...(terms.length > 0 ? { terms } : {}),
    },
  };
}

// ─── Confirmation ────────────────────────────────────────────────────────────

export interface CourierSelectionBundle {
  decision: Decision;
  event: OperationalEvent;
}

export interface ConfirmCourierSelectionInput extends CourierSelectionContext {
  quote: NormalizedCourierQuote;
  reason: string;
  now: string;
  ids: IdFactory;
  actorId?: string;
}

export type CourierSelectionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** One courier as it appears inside the Decision — the alternatives considered. */
export interface ConsideredCourier {
  courierId: string;
  name: string;
  countryCode: string;
}

/**
 * The one-line summary a `CourierSelection` shows.
 *
 * Shared with the trust boundary, which recomputes and compares it — H3.4-D2's
 * lesson: a headline that can contradict its own evidence is worse than none.
 */
export function courierFinalDecision(courier: CourierSnapshot, quoted: Money): string {
  return `${courier.name} — ${formatMoney(quoted)} quoted for carriage in ${courier.countryCode}`;
}

/**
 * Build everything a confirmed courier selection writes.
 *
 * **Refuses rather than repairs.** There is **no recommendation**: the couriers
 * serving a country appear alphabetically, and nothing suggests one.
 */
export function buildCourierSelection(
  input: ConfirmCourierSelectionInput,
): CourierSelectionResult<CourierSelectionBundle> {
  const { moment, now, ids, actorId } = input;

  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, reason: 'Say why you chose this courier — it becomes part of the record.' };
  }

  const preview = previewCourierSelection(input);
  if (!preview.selectable) {
    return {
      ok: false,
      reason: preview.blockers.map(b => b.message).join(' ') || 'A courier cannot be chosen for this moment.',
    };
  }

  const { brief, chosenItem, chosenVendor, deliveryCountryCode } = preview;
  if (!brief || !chosenItem || !chosenVendor || !deliveryCountryCode) {
    return { ok: false, reason: 'This moment has no confirmed brief, item and vendor to arrange carriage for.' };
  }

  const { courier, quotedCourierCost } = input.quote;

  // Membership by id is not enough: the caller supplies the whole record, so a
  // deactivated copy of an active courier would otherwise pass the id check.
  if (!courier.isActive) {
    return { ok: false, reason: `${courier.name} is deactivated and cannot be chosen.` };
  }
  if (!preview.couriers.some(c => c.id === courier.id)) {
    return {
      ok: false,
      reason: `${courier.name} does not carry in ${deliveryCountryCode}. Choose one of the couriers who do.`,
    };
  }
  if (!isValidMoney(quotedCourierCost) || quotedCourierCost.amountMinor < 0) {
    return { ok: false, reason: `${courier.name}'s quote is not a valid amount.` };
  }
  if (quotedCourierCost.currency !== chosenVendor.quotedVendorCost.currency) {
    return {
      ok: false,
      reason: `${courier.name} quoted in ${quotedCourierCost.currency}, but this moment is in ${chosenVendor.quotedVendorCost.currency}. Quotes are never converted.`,
    };
  }

  const selectedCourier = snapshotCourier(courier);
  const considered: ConsideredCourier[] = preview.couriers.map(c => ({
    courierId: c.id, name: c.name, countryCode: c.countryCode,
  }));

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'CourierSelection',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    /**
     * The alternatives here are **recomputed, not typed in**: they are exactly
     * the active couriers serving this country, which is knowable — unlike a
     * vendor's quote, which is not. Recording the whole set is what makes
     * "why this one" answerable later.
     */
    inputs: {
      briefId: brief.id,
      briefRevision: brief.revision,
      itemSelectionDecisionId: chosenItem.decisionId,
      vendorSelectionDecisionId: chosenVendor.decisionId,
      deliveryCountryCode,
      consideredCouriers: considered,
      selectedCourierId: courier.id,
      selectedCourier,
      quotedCourierCost: { ...quotedCourierCost },
      source: input.quote.source,
      quotedAt: input.quote.quotedAt,
      ...(input.quote.leadTimeDays !== undefined ? { leadTimeDays: input.quote.leadTimeDays } : {}),
      ...(input.quote.terms !== undefined ? { terms: input.quote.terms } : {}),
    },
    // Display only. An estimate of what carriage will cost Aniyé — not a paid
    // cost, not the customer's charge, and not a RecognitionOrder.
    finalDecision: courierFinalDecision(selectedCourier, quotedCourierCost),
    reason,
    createdAt: now,
    confirmedAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    eventType: 'CourierSelected',
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    // Identifiers only. The evidence lives on the Decision.
    payload: {
      briefId: brief.id,
      briefRevision: brief.revision,
      vendorSelectionDecisionId: chosenVendor.decisionId,
      selectedCourierId: courier.id,
      deliveryCountryCode,
    },
    occurredAt: now,
    recordedAt: now,
  };

  return { ok: true, value: { decision, event } };
}

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Prove a submitted courier selection against recomputed truth.
 *
 * Built with H3.4-D1 and H3.4-D2 already learned: exact keys at every level
 * including nested objects, canonical ISO instants with a round trip, and a
 * recomputed `finalDecision`. Nothing here trusts the submission.
 *
 * ⚠️ Same honest limit as vendors: the repository verifies everything Aniyé
 * holds, but **cannot prove what a courier said**. A quote is attributable
 * operator testimony, not an independently verified fact.
 */
const DECISION_INPUT_KEYS = [
  'briefId', 'briefRevision', 'itemSelectionDecisionId', 'vendorSelectionDecisionId',
  'deliveryCountryCode', 'consideredCouriers', 'selectedCourierId', 'selectedCourier',
  'quotedCourierCost', 'source', 'quotedAt', 'leadTimeDays', 'terms',
] as const;

const CONSIDERED_KEYS = ['courierId', 'name', 'countryCode'] as const;

const EVENT_PAYLOAD_KEYS = [
  'briefId', 'briefRevision', 'vendorSelectionDecisionId', 'selectedCourierId', 'deliveryCountryCode',
] as const;

const MONEY_KEYS = ['amountMinor', 'currency'] as const;

function extraKeys(value: unknown, allowed: readonly string[]): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const permitted = new Set(allowed);
  return Object.keys(value as Record<string, unknown>).filter(k => !permitted.has(k));
}

function exactMoney(value: unknown, expected: Money): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (extraKeys(value, MONEY_KEYS).length > 0) return false;
  const m = value as Partial<Money>;
  return m.amountMinor === expected.amountMinor && m.currency === expected.currency;
}

function optionalTextValid(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0);
}

export interface VerifyCourierSelectionInput {
  workspaceId: string;
  moment: Moment;
  briefs: readonly ExecutionBrief[];
  decisions: readonly Decision[];
  couriers: readonly Courier[];
  write: CourierSelectionBundle;
}

export type VerifyCourierSelectionResult = { ok: true } | { ok: false; reason: string };

const REVIEW_AGAIN = 'Review the moment and arrange carriage again — nothing was recorded.';

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} ${REVIEW_AGAIN}` };
}

export function verifyCourierSelection(
  input: VerifyCourierSelectionInput,
): VerifyCourierSelectionResult {
  const { workspaceId, moment } = input;

  // ── 0. The submission itself must be a record before anything is read ──
  //
  // Callable directly, so it cannot assume the repository already checked.
  if (!isPlainRecord(input.write)) {
    return refuse('That submission is not a record.');
  }
  const { decision, event } = input.write as Partial<CourierSelectionBundle>;
  if (!isPlainRecord(decision)) return refuse('That submission carries no readable decision.');
  if (!isPlainRecord(event)) return refuse('That submission carries no readable event.');

  // ── 1. The Decision must be the kind of record this operation writes ──
  if (decision.decisionType !== 'CourierSelection') {
    return refuse('That decision does not record a courier selection.');
  }
  if (decision.status !== 'Confirmed') {
    return refuse('A courier selection is only ever recorded as Confirmed.');
  }
  if (decision.provider !== 'HumanOperator') {
    return refuse('A courier selection must be recorded as an operator judgement.');
  }
  if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
    return refuse('A courier selection needs a reason.');
  }
  if (decision.recommendation !== undefined || decision.overrideReason !== undefined) {
    return refuse('A courier selection carries no recommendation to override.');
  }
  if (decision.workspaceId !== workspaceId || decision.momentId !== moment.id) {
    return refuse('That decision belongs to a different workspace or moment.');
  }

  /**
   * **The container before its contents.**
   *
   * `extraKeys` reports no extras for `null`, `undefined` or a primitive —
   * correctly, since they have no keys — so an exact-key check alone lets a
   * malformed container through to the property reads below, where it throws.
   * A thrown exception is not a refusal: it tells the operator nothing and
   * leaves them unable to say whether anything was written.
   */
  if (!isPlainRecord(decision.inputs)) {
    return refuse('That decision records nothing readable.');
  }
  const extraInputs = extraKeys(decision.inputs, DECISION_INPUT_KEYS);
  if (extraInputs.length > 0) {
    return refuse(`A courier selection cannot record ${extraInputs.join(', ')}.`);
  }

  // ── 2. The Moment must still be executable ──
  if (moment.status === 'Cancelled') return refuse('That moment has been cancelled.');
  if (moment.status !== 'ReadyForExecution') return refuse('That moment is no longer ready for execution.');
  if (moment.workspaceId !== workspaceId) return refuse('That moment belongs to a different workspace.');

  // ── 3. One live courier selection, ever ──
  if (findLiveCourierSelection(input.decisions, moment.id)) {
    return refuse('A courier has already been chosen for this moment.');
  }

  // ── 4. The brief, item and vendor must still be the live ones ──
  const live = input.briefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
  if (!live) return refuse('This moment has no confirmed brief.');

  const inputs = decision.inputs as Record<string, unknown>;
  if (inputs.briefId !== live.id || inputs.briefRevision !== live.revision) {
    return refuse('The brief was corrected while this was open.');
  }

  const itemDecision = findLive(input.decisions, moment.id, 'ItemSelection');
  if (!itemDecision) return refuse('No item has been chosen for this moment.');
  if (inputs.itemSelectionDecisionId !== itemDecision.id) {
    return refuse('The chosen item changed while this was open.');
  }

  const vendorDecision = findLive(input.decisions, moment.id, 'VendorSelection');
  if (!vendorDecision) return refuse('No vendor has been chosen for this moment.');
  if (inputs.vendorSelectionDecisionId !== vendorDecision.id) {
    return refuse('The chosen vendor changed while this was open.');
  }
  const chosenVendor = readChosenVendor(vendorDecision);
  if (!chosenVendor) return refuse('The record of the chosen vendor cannot be read.');

  // ── 5. The country comes from the live brief ──
  const country = live.deliveryAddressSnapshot.countryCode;
  if (inputs.deliveryCountryCode !== country) {
    return refuse('The recorded delivery country does not match the brief.');
  }

  // ── 6. Recompute the alternatives from the live directory ──
  const available = couriersFor(input.couriers, country);
  if (available.length === 0) return refuse(`No active courier carries in ${country}.`);

  const selected = input.couriers.find(c => c.id === inputs.selectedCourierId);
  if (!selected) return refuse('The chosen courier is no longer in the directory.');
  if (selected.workspaceId !== workspaceId) {
    return refuse('The chosen courier belongs to a different workspace.');
  }
  if (!selected.isActive) return refuse(`"${selected.name}" was deactivated while this was open.`);
  if (selected.countryCode !== country) {
    return refuse(`"${selected.name}" does not carry in ${country}.`);
  }
  if (!exactCourierSnapshot(inputs.selectedCourier, snapshotCourier(selected))) {
    return refuse(`"${selected.name}"'s directory entry changed, or the record carries undeclared details about them.`);
  }

  const expected = available.map(c => ({ courierId: c.id, name: c.name, countryCode: c.countryCode }));
  const considered = inputs.consideredCouriers;
  if (!Array.isArray(considered) || considered.length !== expected.length) {
    return refuse('The recorded list of available couriers does not match the directory.');
  }
  for (const [i, entry] of considered.entries()) {
    if (typeof entry !== 'object' || entry === null) return refuse('A recorded courier is unreadable.');
    const extra = extraKeys(entry, CONSIDERED_KEYS);
    if (extra.length > 0) return refuse(`A recorded courier cannot carry ${extra.join(', ')}.`);
    const got = entry as Partial<ConsideredCourier>;
    const want = expected[i];
    if (got.courierId !== want.courierId || got.name !== want.name || got.countryCode !== want.countryCode) {
      return refuse('The recorded couriers do not match the directory.');
    }
  }
  if (!considered.some(c => (c as ConsideredCourier).courierId === selected.id)) {
    return refuse('The chosen courier is not among the couriers recorded as available.');
  }

  // ── 7. The quote ──
  const cost = inputs.quotedCourierCost;
  if (!isValidMoney(cost) || cost.amountMinor < 0) return refuse('The quote is not a valid amount.');
  if (extraKeys(cost, MONEY_KEYS).length > 0) {
    return refuse('The quote records undeclared detail alongside its amount.');
  }
  if (!exactMoney(cost, { amountMinor: cost.amountMinor, currency: cost.currency })) {
    return refuse('The quote is not a well-formed amount.');
  }
  if (cost.currency !== chosenVendor.quotedVendorCost.currency) {
    return refuse(`The quote is not in ${chosenVendor.quotedVendorCost.currency}, and quotes are never converted.`);
  }
  if (typeof inputs.source !== 'string' || !(OFFER_SOURCES as readonly string[]).includes(inputs.source)) {
    return refuse('The quote records an unknown channel.');
  }
  if (!isIsoInstant(inputs.quotedAt)) return refuse('The quote has no readable quoted time.');
  if (!optionalTextValid(inputs.terms)) return refuse('The quote has unusable terms.');
  if (
    inputs.leadTimeDays !== undefined &&
    (typeof inputs.leadTimeDays !== 'number' || !Number.isInteger(inputs.leadTimeDays) || inputs.leadTimeDays < 0)
  ) {
    return refuse('The quote has an invalid lead time.');
  }

  if (decision.finalDecision !== courierFinalDecision(snapshotCourier(selected), cost)) {
    return refuse('The recorded summary does not describe the chosen courier and quote.');
  }

  // ── 8. The Event must describe the same occurrence ──
  if (event.eventType !== 'CourierSelected') return refuse('That event does not record a courier selection.');
  if (event.workspaceId !== workspaceId || event.momentId !== moment.id) {
    return refuse('That event belongs to a different workspace or moment.');
  }
  if (event.actorType !== 'Operator') return refuse('A courier selection is an operator action.');
  if (event.source !== 'Platform') return refuse('A courier selection recorded here came through the platform.');
  if (event.actorId !== decision.actorId) return refuse('The decision and event name different actors.');

  if (!isPlainRecord(event.payload)) {
    return refuse('That event carries nothing readable.');
  }
  const extraPayload = extraKeys(event.payload, EVENT_PAYLOAD_KEYS);
  if (extraPayload.length > 0) {
    return refuse(`A courier-selection event cannot carry ${extraPayload.join(', ')}.`);
  }
  const payload = event.payload;
  if (
    payload.briefId !== inputs.briefId ||
    payload.briefRevision !== inputs.briefRevision ||
    payload.vendorSelectionDecisionId !== inputs.vendorSelectionDecisionId ||
    payload.selectedCourierId !== inputs.selectedCourierId ||
    payload.deliveryCountryCode !== inputs.deliveryCountryCode
  ) {
    return refuse('The event and the decision disagree about what was chosen.');
  }

  // One transaction, therefore one readable instant.
  for (const [value, what] of [
    [decision.createdAt, 'the decision was created'],
    [decision.confirmedAt, 'the decision was confirmed'],
    [event.occurredAt, 'the event occurred'],
    [event.recordedAt, 'the event was recorded'],
  ] as const) {
    if (!isIsoInstant(value)) return refuse(`There is no readable record of when ${what}.`);
  }
  if (decision.createdAt !== decision.confirmedAt) {
    return refuse('The decision was created and confirmed at different times.');
  }
  if (event.occurredAt !== event.recordedAt || event.occurredAt !== decision.confirmedAt) {
    return refuse('The event and the decision disagree about when this happened.');
  }

  return { ok: true };
}
