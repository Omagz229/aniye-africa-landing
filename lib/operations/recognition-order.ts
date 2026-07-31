/**
 * The Recognition Order — H3.7, implementing
 * [ADR-013](../../docs/adr/ADR-013-commercial-role-pilot-currency-and-recognition-order.md)
 * and checkpoint milestone 9.
 *
 * **One per Moment**, carrying immutable commercial authority, operator-confirmed
 * actuals, and a margin that is **derived on read and never stored**.
 *
 * Every function here is **pure**. Nothing reads or writes storage. Only the
 * repository's three named operations write, and only on confirmation.
 *
 * ─── The three rules that shape everything below ─────────────────────────────
 *
 * **1. The quotation is a judgement, not a calculation.** `estimatedCustomerCharge`
 * is typed by an operator and confirmed with a reason. Nothing here derives it
 * from the budget, the costs, a percentage or a margin target — ADR-013 §5 — and
 * nothing prefills it, because a prefilled number is a suggestion, and a
 * suggestion is a pricing model wearing a placeholder's clothes.
 *
 * **2. Every amount is NGN.** ADR-013 §3. A non-NGN amount is not converted; it
 * is refused. There is no FX anywhere in H3.7.
 *
 * **3. Margin is derived.** `grossMargin()` computes on read from the three
 * actuals. It is why correcting a cost needs no second write — there is nothing
 * stored to update.
 */

import { formatMoney, isValidMoney, parseMoney, subtractMoney } from '../money';
import type { Money } from '../money';
import type {
  CommercialRole,
  Decision,
  ExecutionBrief,
  Fulfilment,
  Moment,
  OperationalEvent,
  RecognitionOrder,
  RecognitionOrderStatus,
} from './types';
import {
  FORBIDDEN_ORDER_FIELDS,
  ORDER_CURRENCY,
  PILOT_COMMERCIAL_ROLE,
  isPlainRecord,
} from './types';
import { isIsoInstant } from './vendors';
import { findFulfilmentForMoment } from './fulfilment';

// ─── Reading what came before ────────────────────────────────────────────────

export function findOrderForMoment(
  orders: readonly RecognitionOrder[],
  momentId: string,
): RecognitionOrder | null {
  return orders.find(o => o.momentId === momentId) ?? null;
}

function findLive(
  decisions: readonly Decision[],
  momentId: string,
  type: Decision['decisionType'],
): Decision | null {
  return (
    decisions.find(d => d.momentId === momentId && d.decisionType === type && d.status === 'Confirmed') ?? null
  );
}

/** Every commercial Decision for a Moment, in **persisted order**. Never re-sorted. */
export function commercialHistory(
  decisions: readonly Decision[],
  momentId: string,
): Decision[] {
  return decisions.filter(
    d =>
      d.momentId === momentId &&
      (d.decisionType === 'RecognitionOrderCommitment' || d.decisionType === 'CostReconciliation'),
  );
}

// ─── Derived margin ──────────────────────────────────────────────────────────

/**
 * **Operational margin**, derived on read (ADR-007, ADR-013 §8).
 *
 * ```
 * grossMargin = actualCustomerCharge − actualVendorCost − actualCourierCost
 * ```
 *
 * Returns `null` until **all three** actuals exist — a partial figure would be
 * a number that looks like margin and is not.
 *
 * ⚠️ **This is not accounting revenue, accounting gross profit, taxable profit
 * or cash received, and it is not the company's complete profitability.** Taxes,
 * duties, service fees, refunds and payment costs are all deferred, so the
 * figure is deliberately partial. Interface copy must say so.
 */
export function grossMargin(order: RecognitionOrder | null): Money | null {
  if (!order) return null;
  const { actualCustomerCharge, actualVendorCost, actualCourierCost } = order;
  if (!actualCustomerCharge || !actualVendorCost || !actualCourierCost) return null;

  // Canonical integer arithmetic. `subtractMoney` refuses a currency mismatch
  // rather than converting, so a non-NGN amount can never be silently folded in.
  const afterVendor = subtractMoney(actualCustomerCharge, actualVendorCost);
  if (!afterVendor.ok) return null;
  const afterCourier = subtractMoney(afterVendor.value, actualCourierCost);
  if (!afterCourier.ok) return null;
  return afterCourier.value;
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface OrderBlocker {
  code:
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'no-item-selection'
    | 'no-vendor-selection'
    | 'no-courier-selection'
    | 'authority-disagrees'
    | 'non-ngn-authority'
    | 'legacy-fulfilment';
  message: string;
  recovery: string;
  href?: string;
}

/** The one action the current state allows. Never more than one. */
export type OrderAction =
  | 'create'
  | 'await-delivery'
  | 'reconcile'
  | 'correct'
  | 'none';

/** The immutable authority an order is built from, recomputed from live state. */
export interface OrderAuthority {
  executionBriefId: string;
  briefRevision: number;
  itemSelectionDecisionId: string;
  vendorSelectionDecisionId: string;
  courierSelectionDecisionId: string;
  approvedBudget: Money;
  estimatedVendorCost: Money;
  estimatedCourierCost: Money;
  itemName: string | null;
  vendorName: string | null;
  courierName: string | null;
}

export interface OrderPreview {
  momentId: string;
  order: RecognitionOrder | null;
  /** Recomputed from live state. `null` when the chain is incomplete. */
  authority: OrderAuthority | null;
  fulfilment: Fulfilment | null;
  /** Persisted order. Append-only; displayed exactly as stored. */
  history: Decision[];
  /** Derived on read. `null` until all three actuals exist. */
  margin: Money | null;
  blockers: OrderBlocker[];
  action: OrderAction;
}

export interface OrderContext {
  moment: Moment;
  brief: ExecutionBrief | null;
  decisions: readonly Decision[];
  orders: readonly RecognitionOrder[];
  fulfilments: readonly Fulfilment[];
}

function readName(decision: Decision | null, key: string): string | null {
  if (!decision || !isPlainRecord(decision.inputs)) return null;
  const value = decision.inputs[key];
  if (!isPlainRecord(value)) return null;
  return typeof value.name === 'string' ? value.name : null;
}

function readMoney(decision: Decision | null, key: string): Money | null {
  if (!decision || !isPlainRecord(decision.inputs)) return null;
  const value = decision.inputs[key];
  return isValidMoney(value) ? { amountMinor: value.amountMinor, currency: value.currency } : null;
}

/**
 * What may be done to this Moment's order right now, and what stops it.
 *
 * **Writes nothing.**
 */
export function previewRecognitionOrder(context: OrderContext): OrderPreview {
  const { moment, brief } = context;
  const blockers: OrderBlocker[] = [];

  const order = findOrderForMoment(context.orders, moment.id);
  const fulfilment = findFulfilmentForMoment(context.fulfilments, moment.id);
  const history = commercialHistory(context.decisions, moment.id);

  const itemDecision = findLive(context.decisions, moment.id, 'ItemSelection');
  const vendorDecision = findLive(context.decisions, moment.id, 'VendorSelection');
  const courierDecision = findLive(context.decisions, moment.id, 'CourierSelection');

  let authority: OrderAuthority | null = null;
  if (brief && brief.status === 'Confirmed' && itemDecision && vendorDecision && courierDecision) {
    const vendorCost = readMoney(vendorDecision, 'selectedQuotedVendorCost');
    const courierCost = readMoney(courierDecision, 'quotedCourierCost');
    const budget = brief.approvedBudget;
    if (vendorCost && courierCost && isValidMoney(budget)) {
      authority = {
        executionBriefId: brief.id,
        briefRevision: brief.revision,
        itemSelectionDecisionId: itemDecision.id,
        vendorSelectionDecisionId: vendorDecision.id,
        courierSelectionDecisionId: courierDecision.id,
        approvedBudget: { amountMinor: budget.amountMinor, currency: budget.currency },
        estimatedVendorCost: vendorCost,
        estimatedCourierCost: courierCost,
        itemName: readName(itemDecision, 'selectedItem'),
        vendorName: readName(vendorDecision, 'selectedVendor'),
        courierName: readName(courierDecision, 'selectedCourier'),
      };
    }
  }

  // ── An order already exists. Its own state decides what comes next. ──
  if (order) {
    const delivered = fulfilment?.status === 'Delivered';
    const action: OrderAction =
      order.status === 'Reconciled' ? 'correct' : delivered ? 'reconcile' : 'await-delivery';
    return {
      momentId: moment.id,
      order,
      authority,
      fulfilment,
      history,
      margin: grossMargin(order),
      blockers,
      action,
    };
  }

  /**
   * **Legacy prototype history.** A Fulfilment that began before H3.7 has no
   * commercial authority behind it, and one cannot be reconstructed: the
   * quotation was never recorded and no formula may invent it (ADR-013 §5), and
   * the estimates would have to be back-dated from quotes that may since have
   * been superseded. Naming the limitation is the only honest option — offering
   * a "create it now" action would fabricate the evidence.
   */
  if (fulfilment) {
    blockers.push({
      code: 'legacy-fulfilment',
      message:
        'Commercial authority was not recorded before this fulfilment began, so a Recognition Order cannot be reconstructed safely.',
      recovery:
        'This moment was dispatched before commercial tracking existed. Its delivery history is intact and unaffected; there is simply no order to create for it, and inventing one would record a price nobody quoted.',
      href: `/operations/moments/${moment.id}/fulfilment`,
    });
    return {
      momentId: moment.id,
      order: null,
      authority,
      fulfilment,
      history,
      margin: null,
      blockers,
      action: 'none',
    };
  }

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so there is nothing to commit commercially.',
      recovery: 'Nothing to do here. The cancellation and its reason stay on the record.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review, so there is nothing to commit commercially.',
      recovery: 'Resolve the issues listed on the moment, then confirm its brief.',
    });
  }

  if (!brief || brief.status !== 'Confirmed') {
    blockers.push({
      code: 'no-confirmed-brief',
      message: 'No brief has been confirmed for this moment yet.',
      recovery: 'Confirm the brief first — it fixes the approved budget this order is built on.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }
  if (!itemDecision) {
    blockers.push({
      code: 'no-item-selection',
      message: 'No item has been chosen for this moment yet.',
      recovery: 'Choose an item first.',
      href: `/operations/moments/${moment.id}/item`,
    });
  } else if (!vendorDecision) {
    blockers.push({
      code: 'no-vendor-selection',
      message: 'No vendor has been chosen for this moment yet.',
      recovery: 'Choose a vendor first — their quote is the estimated vendor cost.',
      href: `/operations/moments/${moment.id}/vendor`,
    });
  } else if (!courierDecision) {
    blockers.push({
      code: 'no-courier-selection',
      message: 'No courier has been chosen for this moment yet.',
      recovery: 'Arrange carriage first — their quote is the estimated courier cost.',
      href: `/operations/moments/${moment.id}/courier`,
    });
  }

  // The stored chain must agree with itself, exactly as the dispatch gate requires.
  if (brief && itemDecision && vendorDecision && courierDecision) {
    const courierInputs = isPlainRecord(courierDecision.inputs) ? courierDecision.inputs : {};
    const vendorInputs = isPlainRecord(vendorDecision.inputs) ? vendorDecision.inputs : {};
    const agrees =
      courierInputs.briefId === brief.id &&
      courierInputs.briefRevision === brief.revision &&
      courierInputs.itemSelectionDecisionId === itemDecision.id &&
      courierInputs.vendorSelectionDecisionId === vendorDecision.id &&
      vendorInputs.briefId === brief.id &&
      vendorInputs.briefRevision === brief.revision &&
      vendorInputs.itemSelectionDecisionId === itemDecision.id;
    if (!agrees) {
      blockers.push({
        code: 'authority-disagrees',
        message: 'What was chosen for this moment no longer matches its current brief.',
        recovery:
          'The brief was corrected after the item, vendor or courier was chosen. A commercial order cannot be built on a chain that disagrees with itself, and this build has no governed correction for it.',
        href: `/operations/moments/${moment.id}/brief`,
      });
    } else if (!authority) {
      blockers.push({
        code: 'authority-disagrees',
        message: 'The recorded budget or quotes for this moment cannot be read.',
        recovery: 'This moment needs a governed correction before it can be costed. Nothing has been changed.',
      });
    }
  }

  // ADR-013 §3 — a non-NGN authority amount is refused, never converted.
  if (authority) {
    const wrong = (
      [
        ['approved budget', authority.approvedBudget],
        ['vendor quote', authority.estimatedVendorCost],
        ['courier quote', authority.estimatedCourierCost],
      ] as const
    ).filter(([, amount]) => amount.currency !== ORDER_CURRENCY);
    if (wrong.length > 0) {
      blockers.push({
        code: 'non-ngn-authority',
        message: `This moment's ${wrong.map(([what]) => what).join(' and ')} ${wrong.length === 1 ? 'is' : 'are'} not in ${ORDER_CURRENCY}.`,
        recovery: `Recognition Orders are ${ORDER_CURRENCY} only in this build, and amounts are never converted. A multi-currency order needs an architecture decision that has not been made.`,
      });
    }
  }

  return {
    momentId: moment.id,
    order: null,
    authority,
    fulfilment: null,
    history,
    margin: null,
    blockers,
    action: blockers.length === 0 && authority ? 'create' : 'none',
  };
}

// ─── The manual quotation ────────────────────────────────────────────────────

export interface QuotationDraft {
  /** Major units, exactly as typed. **Never prefilled, never suggested.** */
  amount: string;
  reason: string;
}

export function emptyQuotationDraft(): QuotationDraft {
  return { amount: '', reason: '' };
}

export interface QuotationErrors {
  amount?: string;
  reason?: string;
}

export type QuotationResult =
  | { ok: true; value: { estimatedCustomerCharge: Money; reason: string } }
  | { ok: false; errors: QuotationErrors };

/**
 * Check one manually entered quotation.
 *
 * ⚠️ **There is deliberately no relationship to the budget or the costs.** A
 * quote below cost, above budget, or equal to either is accepted: no accepted
 * rule prohibits any of them, and inventing one here would be a commercial
 * decision nobody has made. Zero is valid — a complimentary order is real.
 * Negative is not.
 */
export function validateQuotation(draft: QuotationDraft): QuotationResult {
  const errors: QuotationErrors = {};

  const parsed = parseMoney(draft.amount, ORDER_CURRENCY);
  let charge: Money | null = null;
  if (!parsed.ok) {
    errors.amount = draft.amount.trim().length === 0
      ? `What is Aniyé charging for this? Enter an amount in ${ORDER_CURRENCY}.`
      : parsed.reason;
  } else if (parsed.value.money.amountMinor < 0) {
    errors.amount = 'A quotation cannot be negative.';
  } else {
    charge = parsed.value.money;
  }

  const reason = draft.reason.trim();
  if (reason.length === 0) {
    errors.reason = 'Say how you arrived at this quotation — it becomes part of the permanent record.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { estimatedCustomerCharge: charge!, reason } };
}

// ─── The actuals ─────────────────────────────────────────────────────────────

export interface ActualsDraft {
  vendor: string;
  courier: string;
  charge: string;
  reason: string;
}

export function emptyActualsDraft(): ActualsDraft {
  return { vendor: '', courier: '', charge: '', reason: '' };
}

/** Prefilled from the **estimates** only when an operator asks — never silently. */
export function actualsFromEstimates(order: RecognitionOrder): ActualsDraft {
  return {
    vendor: majorUnits(order.estimatedVendorCost),
    courier: majorUnits(order.estimatedCourierCost),
    charge: majorUnits(order.estimatedCustomerCharge),
    reason: '',
  };
}

/** Prefilled from the **current actuals** when correcting. */
export function actualsFromOrder(order: RecognitionOrder): ActualsDraft {
  return {
    vendor: order.actualVendorCost ? majorUnits(order.actualVendorCost) : '',
    courier: order.actualCourierCost ? majorUnits(order.actualCourierCost) : '',
    charge: order.actualCustomerCharge ? majorUnits(order.actualCustomerCharge) : '',
    reason: '',
  };
}

function majorUnits(value: Money): string {
  const factor = 100; // NGN, exponent 2 — the only currency H3.7 records.
  const whole = Math.trunc(value.amountMinor / factor);
  const fraction = Math.abs(value.amountMinor % factor);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export interface ActualsErrors {
  vendor?: string;
  courier?: string;
  charge?: string;
  reason?: string;
}

export interface NormalizedActuals {
  actualVendorCost: Money;
  actualCourierCost: Money;
  actualCustomerCharge: Money;
  reason: string;
}

export type ActualsResult =
  | { ok: true; value: NormalizedActuals }
  | { ok: false; errors: ActualsErrors };

/**
 * Check all three actuals together.
 *
 * They are confirmed as one set because a partial set would leave an order that
 * is neither committed nor reconciled, and margin would be computable from
 * numbers only some of which had been confirmed.
 */
export function validateActuals(draft: ActualsDraft): ActualsResult {
  const errors: ActualsErrors = {};
  const values: Partial<Record<'vendor' | 'courier' | 'charge', Money>> = {};

  for (const [field, label] of [
    ['vendor', 'the vendor'],
    ['courier', 'the courier'],
    ['charge', 'the customer'],
  ] as const) {
    const raw = draft[field];
    const parsed = parseMoney(raw, ORDER_CURRENCY);
    if (!parsed.ok) {
      errors[field] = raw.trim().length === 0
        ? `What was the final amount with ${label}?`
        : parsed.reason;
    } else if (parsed.value.money.amountMinor < 0) {
      errors[field] = 'An amount cannot be negative.';
    } else {
      values[field] = parsed.value.money;
    }
  }

  const reason = draft.reason.trim();
  if (reason.length === 0) {
    errors.reason = 'Say what these figures are based on — it becomes part of the permanent record.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      actualVendorCost: values.vendor!,
      actualCourierCost: values.courier!,
      actualCustomerCharge: values.charge!,
      reason,
    },
  };
}

// ─── Building what each confirmation writes ──────────────────────────────────

export interface OrderIdFactory {
  order: () => string;
  decision: () => string;
  event: () => string;
}

export type OrderResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Committing the order: the record, its Decision and one Event. */
export interface OrderCommitmentBundle {
  order: RecognitionOrder;
  decision: Decision;
  event: OperationalEvent;
}

/** Reconciling or correcting: **one Decision, and no Event.** */
export interface ReconciliationBundle {
  decision: Decision;
}

export interface CommitOrderInput extends OrderContext {
  quotation: { estimatedCustomerCharge: Money; reason: string };
  now: string;
  ids: OrderIdFactory;
  actorId?: string;
}

/** The one-line summary a commitment shows. Recomputed at the trust boundary. */
export function commitmentFinalDecision(charge: Money): string {
  return `Quoted ${formatMoney(charge)} for this recognition`;
}

/** The one-line summary a reconciliation shows. Recomputed at the trust boundary. */
export function reconciliationFinalDecision(margin: Money): string {
  return `Reconciled — operational margin ${formatMoney(margin)}`;
}

/**
 * Build everything a committed Recognition Order writes.
 *
 * **Refuses rather than repairs.** The estimates come from the confirmed
 * selection quotes and the budget from the confirmed brief; only the customer
 * quotation comes from the operator, and it arrives already validated.
 */
export function buildOrderCommitment(input: CommitOrderInput): OrderResult<OrderCommitmentBundle> {
  const { moment, now, ids, actorId } = input;

  const preview = previewRecognitionOrder(input);
  if (preview.order) return { ok: false, reason: 'This moment already has a recognition order.' };
  if (preview.action !== 'create' || !preview.authority) {
    return {
      ok: false,
      reason: preview.blockers.map(b => b.message).join(' ') || 'A recognition order cannot be created for this moment.',
    };
  }

  const charge = input.quotation.estimatedCustomerCharge;
  const reason = input.quotation.reason.trim();
  if (reason.length === 0) {
    return { ok: false, reason: 'Say how you arrived at this quotation — it becomes part of the record.' };
  }
  if (!isValidMoney(charge) || charge.amountMinor < 0) {
    return { ok: false, reason: 'That quotation is not a valid amount.' };
  }
  if (charge.currency !== ORDER_CURRENCY) {
    return { ok: false, reason: `Recognition orders are ${ORDER_CURRENCY} only, and amounts are never converted.` };
  }

  const a = preview.authority;
  const order: RecognitionOrder = {
    id: ids.order(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    executionBriefId: a.executionBriefId,
    briefRevision: a.briefRevision,
    itemSelectionDecisionId: a.itemSelectionDecisionId,
    vendorSelectionDecisionId: a.vendorSelectionDecisionId,
    courierSelectionDecisionId: a.courierSelectionDecisionId,
    commercialRole: PILOT_COMMERCIAL_ROLE as CommercialRole,
    approvedBudget: { ...a.approvedBudget },
    estimatedVendorCost: { ...a.estimatedVendorCost },
    estimatedCourierCost: { ...a.estimatedCourierCost },
    estimatedCustomerCharge: { ...charge },
    status: 'Committed',
    createdAt: now,
    updatedAt: now,
  };

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'RecognitionOrderCommitment',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    /**
     * The alternatives here are **what the operator could have quoted**, which
     * is unbounded — so what is recorded instead is the context they quoted
     * against, and their reason. That is what makes "why this price" answerable
     * later without pretending a formula existed.
     */
    inputs: {
      recognitionOrderId: order.id,
      approvedBudget: { ...a.approvedBudget },
      estimatedVendorCost: { ...a.estimatedVendorCost },
      estimatedCourierCost: { ...a.estimatedCourierCost },
      estimatedCustomerCharge: { ...charge },
    },
    finalDecision: commitmentFinalDecision(charge),
    reason,
    createdAt: now,
    confirmedAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    eventType: 'RecognitionOrderCommitted',
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    // Identifiers only. The evidence lives on the Decision and the order.
    payload: { recognitionOrderId: order.id, executionBriefId: a.executionBriefId },
    occurredAt: now,
    recordedAt: now,
  };

  return { ok: true, value: { order, decision, event } };
}

export interface ReconcileInput extends OrderContext {
  actuals: NormalizedActuals;
  now: string;
  ids: OrderIdFactory;
  actorId?: string;
}

/**
 * Build the first reconciliation, or a correction to it.
 *
 * The two share a Decision type and a shape; a correction additionally carries
 * the **previous values** and the id of the Decision it supersedes, so the
 * change is legible without reading two records side by side.
 */
export function buildReconciliation(input: ReconcileInput): OrderResult<ReconciliationBundle> {
  const { moment, now, ids, actorId } = input;

  const order = findOrderForMoment(input.orders, moment.id);
  if (!order) return { ok: false, reason: 'This moment has no recognition order to reconcile.' };

  const fulfilment = findFulfilmentForMoment(input.fulfilments, moment.id);
  const correcting = order.status === 'Reconciled';
  if (!correcting && fulfilment?.status !== 'Delivered') {
    return { ok: false, reason: 'Actual amounts can only be confirmed once delivery is confirmed.' };
  }

  const reason = input.actuals.reason.trim();
  if (reason.length === 0) {
    return { ok: false, reason: 'Say what these figures are based on — it becomes part of the record.' };
  }

  const amounts = [
    input.actuals.actualVendorCost,
    input.actuals.actualCourierCost,
    input.actuals.actualCustomerCharge,
  ];
  for (const amount of amounts) {
    if (!isValidMoney(amount) || amount.amountMinor < 0) {
      return { ok: false, reason: 'One of those amounts is not valid.' };
    }
    if (amount.currency !== ORDER_CURRENCY) {
      return { ok: false, reason: `Recognition orders are ${ORDER_CURRENCY} only, and amounts are never converted.` };
    }
  }

  const projected: RecognitionOrder = {
    ...order,
    actualVendorCost: { ...input.actuals.actualVendorCost },
    actualCourierCost: { ...input.actuals.actualCourierCost },
    actualCustomerCharge: { ...input.actuals.actualCustomerCharge },
    status: 'Reconciled',
    updatedAt: now,
  };
  const margin = grossMargin(projected);
  if (!margin) return { ok: false, reason: 'Those amounts do not produce a readable margin.' };

  const live = findLive(input.decisions, moment.id, 'CostReconciliation');
  if (correcting && !live) {
    return { ok: false, reason: 'There is no live reconciliation to correct.' };
  }

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'CostReconciliation',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    inputs: {
      recognitionOrderId: order.id,
      actualVendorCost: { ...input.actuals.actualVendorCost },
      actualCourierCost: { ...input.actuals.actualCourierCost },
      actualCustomerCharge: { ...input.actuals.actualCustomerCharge },
      ...(correcting
        ? {
            supersedesDecisionId: live!.id,
            previousActualVendorCost: { ...order.actualVendorCost! },
            previousActualCourierCost: { ...order.actualCourierCost! },
            previousActualCustomerCharge: { ...order.actualCustomerCharge! },
          }
        : {}),
    },
    finalDecision: reconciliationFinalDecision(margin),
    reason,
    createdAt: now,
    confirmedAt: now,
  };

  return { ok: true, value: { decision } };
}

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Prove a submitted commercial write against recomputed truth.
 *
 * Built with everything H3.3-D1 through H3.6 established: **the container before
 * its contents**, exact keys at every level **including nested Money**, canonical
 * ISO instants, and a recomputed summary. Nothing here trusts the submission —
 * and on success it returns **rebuilt** records for the repository to store, so
 * no caller-supplied object reaches persistence.
 *
 * Callable without the repository, and safe when it is.
 */
export type OrderWriteKind = 'Commitment' | 'Reconciliation';

const ORDER_KEYS = [
  'id', 'workspaceId', 'momentId', 'executionBriefId', 'briefRevision',
  'itemSelectionDecisionId', 'vendorSelectionDecisionId', 'courierSelectionDecisionId',
  'commercialRole', 'approvedBudget', 'estimatedVendorCost', 'estimatedCourierCost',
  'estimatedCustomerCharge', 'actualVendorCost', 'actualCourierCost', 'actualCustomerCharge',
  'status', 'createdAt', 'updatedAt',
] as const;

const COMMITMENT_BUNDLE_KEYS = ['order', 'decision', 'event'] as const;
const RECONCILIATION_BUNDLE_KEYS = ['decision'] as const;

const COMMITMENT_INPUT_KEYS = [
  'recognitionOrderId', 'approvedBudget', 'estimatedVendorCost',
  'estimatedCourierCost', 'estimatedCustomerCharge',
] as const;

const RECONCILIATION_INPUT_KEYS = [
  'recognitionOrderId', 'actualVendorCost', 'actualCourierCost', 'actualCustomerCharge',
] as const;

const CORRECTION_INPUT_KEYS = [
  ...RECONCILIATION_INPUT_KEYS,
  'supersedesDecisionId',
  'previousActualVendorCost', 'previousActualCourierCost', 'previousActualCustomerCharge',
] as const;

const DECISION_KEYS = [
  'id', 'workspaceId', 'momentId', 'decisionType', 'status', 'provider',
  'actorId', 'inputs', 'finalDecision', 'reason', 'createdAt', 'confirmedAt',
] as const;

const EVENT_KEYS = [
  'id', 'workspaceId', 'momentId', 'eventType', 'actorType', 'actorId',
  'source', 'payload', 'occurredAt', 'recordedAt',
] as const;

const EVENT_PAYLOAD_KEYS = ['recognitionOrderId', 'executionBriefId'] as const;

const MONEY_KEYS = ['amountMinor', 'currency'] as const;

function extraKeys(value: unknown, allowed: readonly string[]): string[] {
  if (!isPlainRecord(value)) return [];
  const permitted = new Set<string>(allowed);
  return Object.keys(value).filter(k => !permitted.has(k));
}

/**
 * An amount is **exactly** `{ amountMinor, currency }`, in NGN, non-negative,
 * and equal to the expected value.
 *
 * The exact-key check matters as much as the value check: a Money object
 * carrying `fxRate` alongside a correct amount would otherwise pass, and that is
 * precisely the shape ADR-013 excludes.
 */
function exactNgnMoney(value: unknown, expected: Money | null): boolean {
  if (!isValidMoney(value)) return false;
  if (extraKeys(value, MONEY_KEYS).length > 0) return false;
  if (value.currency !== ORDER_CURRENCY) return false;
  if (value.amountMinor < 0) return false;
  if (expected === null) return true;
  return value.amountMinor === expected.amountMinor && value.currency === expected.currency;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export interface VerifyOrderInput {
  workspaceId: string;
  moment: Moment;
  briefs: readonly ExecutionBrief[];
  decisions: readonly Decision[];
  orders: readonly RecognitionOrder[];
  fulfilments: readonly Fulfilment[];
  write: unknown;
  kind: OrderWriteKind;
}

export type VerifyOrderResult =
  | { ok: true; order: RecognitionOrder; decision: Decision; event?: OperationalEvent; supersedes?: string }
  | { ok: false; reason: string };

const REVIEW_AGAIN = 'Review the moment and try again — nothing was recorded.';

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} ${REVIEW_AGAIN}` };
}

export function verifyOrderWrite(input: VerifyOrderInput): VerifyOrderResult {
  const { workspaceId, moment, kind } = input;

  // ── 0. The submission itself, before anything is read from it ──
  if (!isPlainRecord(input.write)) return refuse('That submission is not a record.');
  const extraBundle = extraKeys(
    input.write,
    kind === 'Commitment' ? COMMITMENT_BUNDLE_KEYS : RECONCILIATION_BUNDLE_KEYS,
  );
  if (extraBundle.length > 0) return refuse(`That submission cannot carry ${extraBundle.join(', ')}.`);

  const decision = input.write.decision;
  if (!isPlainRecord(decision)) return refuse('That submission carries no readable decision.');
  const extraDecision = extraKeys(decision, DECISION_KEYS);
  if (extraDecision.length > 0) return refuse(`A commercial decision cannot carry ${extraDecision.join(', ')}.`);
  if (!isNonEmptyText(decision.id)) return refuse('That decision has no id.');

  if (moment.workspaceId !== workspaceId) return refuse('That moment belongs to a different workspace.');
  if (decision.workspaceId !== workspaceId || decision.momentId !== moment.id) {
    return refuse('That decision belongs to a different workspace or moment.');
  }
  if (decision.status !== 'Confirmed') return refuse('A commercial decision is only ever recorded as Confirmed.');
  if (decision.provider !== 'HumanOperator') {
    return refuse('A commercial decision must be recorded as an operator judgement.');
  }
  if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
    return refuse('A commercial decision needs a reason.');
  }
  if (!isPlainRecord(decision.inputs)) return refuse('That decision records nothing readable.');
  for (const [value, what] of [
    [decision.createdAt, 'the decision was created'],
    [decision.confirmedAt, 'the decision was confirmed'],
  ] as const) {
    if (!isIsoInstant(value)) return refuse(`There is no readable record of when ${what}.`);
  }
  if (decision.createdAt !== decision.confirmedAt) {
    return refuse('The decision was created and confirmed at different times.');
  }
  if (input.decisions.some(d => d.id === decision.id)) {
    return refuse('That decision has already been recorded.');
  }

  return kind === 'Commitment'
    ? verifyCommitment(input, decision)
    : verifyReconciliation(input, decision);
}

function verifyCommitment(input: VerifyOrderInput, decision: Record<string, unknown>): VerifyOrderResult {
  const { workspaceId, moment } = input;

  if (decision.decisionType !== 'RecognitionOrderCommitment') {
    return refuse('That decision does not record a recognition order commitment.');
  }
  if (findOrderForMoment(input.orders, moment.id)) {
    return refuse('This moment already has a recognition order.');
  }
  // ADR-013: the order is commercial authority *for* the dispatch, so it must
  // exist before one. A Moment already dispatched is legacy history.
  if (findFulfilmentForMoment(input.fulfilments, moment.id)) {
    return refuse('This moment was already dispatched, so its commercial authority cannot be reconstructed.');
  }
  if (moment.status === 'Cancelled') return refuse('That moment has been cancelled.');
  if (moment.status !== 'ReadyForExecution') return refuse('That moment is no longer ready for execution.');

  const submitted = (input.write as Record<string, unknown>).order;
  if (!isPlainRecord(submitted)) return refuse('That submission carries no readable order.');
  const extraOrder = extraKeys(submitted, ORDER_KEYS);
  if (extraOrder.length > 0) return refuse(`A recognition order cannot record ${extraOrder.join(', ')}.`);
  for (const forbidden of FORBIDDEN_ORDER_FIELDS) {
    if (submitted[forbidden] !== undefined) {
      return refuse(`A recognition order cannot record ${forbidden}.`);
    }
  }

  // ── Recompute the authority from live state ──
  const brief = input.briefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
  if (!brief) return refuse('This moment has no confirmed brief.');

  const itemDecision = findLive(input.decisions, moment.id, 'ItemSelection');
  if (!itemDecision) return refuse('No item has been chosen for this moment.');
  const vendorDecision = findLive(input.decisions, moment.id, 'VendorSelection');
  if (!vendorDecision) return refuse('No vendor has been chosen for this moment.');
  const courierDecision = findLive(input.decisions, moment.id, 'CourierSelection');
  if (!courierDecision) return refuse('No courier has been chosen for this moment.');

  const courierInputs = isPlainRecord(courierDecision.inputs) ? courierDecision.inputs : {};
  const vendorInputs = isPlainRecord(vendorDecision.inputs) ? vendorDecision.inputs : {};
  if (
    courierInputs.briefId !== brief.id ||
    courierInputs.briefRevision !== brief.revision ||
    courierInputs.itemSelectionDecisionId !== itemDecision.id ||
    courierInputs.vendorSelectionDecisionId !== vendorDecision.id ||
    vendorInputs.briefId !== brief.id ||
    vendorInputs.briefRevision !== brief.revision ||
    vendorInputs.itemSelectionDecisionId !== itemDecision.id
  ) {
    return refuse('What was chosen for this moment no longer matches its current brief.');
  }

  const vendorCost = readMoney(vendorDecision, 'selectedQuotedVendorCost');
  const courierCost = readMoney(courierDecision, 'quotedCourierCost');
  if (!vendorCost || !courierCost) return refuse('The recorded vendor or courier quote cannot be read.');
  const budget = brief.approvedBudget;
  if (!isValidMoney(budget)) return refuse('The brief records no readable approved budget.');

  // ADR-013 §3 — refuse, never convert.
  for (const [what, amount] of [
    ['approved budget', budget],
    ['vendor quote', vendorCost],
    ['courier quote', courierCost],
  ] as const) {
    if (amount.currency !== ORDER_CURRENCY) {
      return refuse(`This moment's ${what} is in ${amount.currency}; recognition orders are ${ORDER_CURRENCY} only.`);
    }
  }

  // ── The submitted order must match, field by field ──
  if (!isNonEmptyText(submitted.id)) return refuse('That order has no id.');
  if (input.orders.some(o => o.id === submitted.id)) return refuse('That order has already been recorded.');
  if (submitted.commercialRole !== PILOT_COMMERCIAL_ROLE) {
    return refuse(`A recognition order records ${PILOT_COMMERCIAL_ROLE} and no other commercial role.`);
  }
  if (submitted.status !== 'Committed') return refuse('A recognition order opens as Committed.');
  for (const field of ['actualVendorCost', 'actualCourierCost', 'actualCustomerCharge'] as const) {
    if (submitted[field] !== undefined) return refuse('A new recognition order carries no actual amounts.');
  }
  if (!isIsoInstant(submitted.createdAt) || submitted.createdAt !== submitted.updatedAt) {
    return refuse('That order has no readable creation time.');
  }
  if (submitted.createdAt !== decision.confirmedAt) {
    return refuse('The order and its decision disagree about when this happened.');
  }

  const charge = submitted.estimatedCustomerCharge;
  if (!exactNgnMoney(charge, null)) {
    return refuse(`The quotation is not a well-formed, non-negative ${ORDER_CURRENCY} amount.`);
  }
  if (
    submitted.workspaceId !== workspaceId ||
    submitted.momentId !== moment.id ||
    submitted.executionBriefId !== brief.id ||
    submitted.briefRevision !== brief.revision ||
    submitted.itemSelectionDecisionId !== itemDecision.id ||
    submitted.vendorSelectionDecisionId !== vendorDecision.id ||
    submitted.courierSelectionDecisionId !== courierDecision.id
  ) {
    return refuse('The submitted order does not describe this moment’s authority.');
  }
  if (
    !exactNgnMoney(submitted.approvedBudget, budget) ||
    !exactNgnMoney(submitted.estimatedVendorCost, vendorCost) ||
    !exactNgnMoney(submitted.estimatedCourierCost, courierCost)
  ) {
    return refuse('The submitted order disagrees with the confirmed budget or quotes.');
  }

  // ── The Decision must describe the same commitment ──
  const extraInputs = extraKeys(decision.inputs, COMMITMENT_INPUT_KEYS);
  if (extraInputs.length > 0) return refuse(`A commitment cannot record ${extraInputs.join(', ')}.`);
  const inputs = decision.inputs as Record<string, unknown>;
  if (inputs.recognitionOrderId !== submitted.id) return refuse('That decision names a different order.');
  if (
    !exactNgnMoney(inputs.approvedBudget, budget) ||
    !exactNgnMoney(inputs.estimatedVendorCost, vendorCost) ||
    !exactNgnMoney(inputs.estimatedCourierCost, courierCost) ||
    !exactNgnMoney(inputs.estimatedCustomerCharge, charge as Money)
  ) {
    return refuse('The decision and the order disagree about the amounts.');
  }
  if (decision.finalDecision !== commitmentFinalDecision(charge as Money)) {
    return refuse('The recorded summary does not describe the quotation.');
  }

  // ── The Event must describe the same occurrence ──
  const event = (input.write as Record<string, unknown>).event;
  if (!isPlainRecord(event)) return refuse('That submission carries no readable event.');
  const extraEvent = extraKeys(event, EVENT_KEYS);
  if (extraEvent.length > 0) return refuse(`A commercial event cannot carry ${extraEvent.join(', ')}.`);
  if (!isNonEmptyText(event.id)) return refuse('That event has no id.');
  if (event.eventType !== 'RecognitionOrderCommitted') {
    return refuse('That event does not record a recognition order commitment.');
  }
  if (event.workspaceId !== workspaceId || event.momentId !== moment.id) {
    return refuse('That event belongs to a different workspace or moment.');
  }
  if (event.actorType !== 'Operator') return refuse('Committing an order is an operator action.');
  if (event.source !== 'Platform') return refuse('This step is confirmed in the platform.');
  if (event.actorId !== decision.actorId) return refuse('The decision and event name different actors.');
  if (!isPlainRecord(event.payload)) return refuse('That event carries nothing readable.');
  const extraPayload = extraKeys(event.payload, EVENT_PAYLOAD_KEYS);
  if (extraPayload.length > 0) return refuse(`A commercial event cannot carry ${extraPayload.join(', ')}.`);
  if (
    event.payload.recognitionOrderId !== submitted.id ||
    event.payload.executionBriefId !== brief.id
  ) {
    return refuse('The event and the order disagree about what was committed.');
  }
  for (const [value, what] of [
    [event.occurredAt, 'the event occurred'],
    [event.recordedAt, 'the event was recorded'],
  ] as const) {
    if (!isIsoInstant(value)) return refuse(`There is no readable record of when ${what}.`);
  }
  if (event.occurredAt !== event.recordedAt || event.occurredAt !== decision.confirmedAt) {
    return refuse('The event and the decision disagree about when this happened.');
  }

  // Rebuilt, not spread. Nothing the caller sent reaches storage.
  const order: RecognitionOrder = {
    id: submitted.id,
    workspaceId,
    momentId: moment.id,
    executionBriefId: brief.id,
    briefRevision: brief.revision,
    itemSelectionDecisionId: itemDecision.id,
    vendorSelectionDecisionId: vendorDecision.id,
    courierSelectionDecisionId: courierDecision.id,
    commercialRole: PILOT_COMMERCIAL_ROLE as CommercialRole,
    approvedBudget: { amountMinor: budget.amountMinor, currency: budget.currency },
    estimatedVendorCost: { amountMinor: vendorCost.amountMinor, currency: vendorCost.currency },
    estimatedCourierCost: { amountMinor: courierCost.amountMinor, currency: courierCost.currency },
    estimatedCustomerCharge: {
      amountMinor: (charge as Money).amountMinor,
      currency: (charge as Money).currency,
    },
    status: 'Committed',
    createdAt: submitted.createdAt as string,
    updatedAt: submitted.createdAt as string,
  };

  return {
    ok: true,
    order,
    decision: canonicalCommitmentDecision(decision, order),
    event: canonicalEvent(event, order.id, brief.id),
  };
}

function verifyReconciliation(input: VerifyOrderInput, decision: Record<string, unknown>): VerifyOrderResult {
  const { moment } = input;

  if (decision.decisionType !== 'CostReconciliation') {
    return refuse('That decision does not record a cost reconciliation.');
  }

  const order = findOrderForMoment(input.orders, moment.id);
  if (!order) return refuse('This moment has no recognition order.');

  const correcting = order.status === 'Reconciled';
  if (!correcting) {
    const fulfilment = findFulfilmentForMoment(input.fulfilments, moment.id);
    if (fulfilment?.status !== 'Delivered') {
      return refuse('Actual amounts can only be confirmed once delivery is confirmed.');
    }
  }

  const inputs = decision.inputs as Record<string, unknown>;
  const extraInputs = extraKeys(inputs, correcting ? CORRECTION_INPUT_KEYS : RECONCILIATION_INPUT_KEYS);
  if (extraInputs.length > 0) return refuse(`A reconciliation cannot record ${extraInputs.join(', ')}.`);
  if (inputs.recognitionOrderId !== order.id) return refuse('That decision names a different order.');

  for (const field of ['actualVendorCost', 'actualCourierCost', 'actualCustomerCharge'] as const) {
    if (!exactNgnMoney(inputs[field], null)) {
      return refuse(`The ${field} is not a well-formed, non-negative ${ORDER_CURRENCY} amount.`);
    }
  }

  const live = findLive(input.decisions, moment.id, 'CostReconciliation');
  if (correcting) {
    if (!live) return refuse('There is no live reconciliation to correct.');
    if (inputs.supersedesDecisionId !== live.id) {
      return refuse('That correction does not supersede the current reconciliation.');
    }
    // The previous values must be the ones actually on the order — a correction
    // that misstates what it replaced is not a correction.
    for (const [field, current] of [
      ['previousActualVendorCost', order.actualVendorCost],
      ['previousActualCourierCost', order.actualCourierCost],
      ['previousActualCustomerCharge', order.actualCustomerCharge],
    ] as const) {
      if (!current || !exactNgnMoney(inputs[field], current)) {
        return refuse('That correction misstates the amounts it replaces.');
      }
    }
  } else if (live) {
    return refuse('This order has already been reconciled.');
  }

  const projected: RecognitionOrder = {
    ...order,
    actualVendorCost: canonicalMoney(inputs.actualVendorCost),
    actualCourierCost: canonicalMoney(inputs.actualCourierCost),
    actualCustomerCharge: canonicalMoney(inputs.actualCustomerCharge),
    status: 'Reconciled' as RecognitionOrderStatus,
    updatedAt: decision.confirmedAt as string,
  };
  const margin = grossMargin(projected);
  if (!margin) return refuse('Those amounts do not produce a readable margin.');
  if (decision.finalDecision !== reconciliationFinalDecision(margin)) {
    return refuse('The recorded summary does not describe these amounts.');
  }

  return {
    ok: true,
    order: projected,
    decision: canonicalReconciliationDecision(decision, order.id, correcting),
    ...(correcting ? { supersedes: live!.id } : {}),
  };
}

function canonicalMoney(value: unknown): Money {
  const m = value as Money;
  return { amountMinor: m.amountMinor, currency: m.currency };
}

function canonicalCommitmentDecision(d: Record<string, unknown>, order: RecognitionOrder): Decision {
  return {
    id: d.id as string,
    workspaceId: order.workspaceId,
    momentId: order.momentId,
    decisionType: 'RecognitionOrderCommitment',
    status: 'Confirmed',
    provider: 'HumanOperator',
    ...(d.actorId !== undefined ? { actorId: d.actorId as string } : {}),
    inputs: {
      recognitionOrderId: order.id,
      approvedBudget: { ...order.approvedBudget },
      estimatedVendorCost: { ...order.estimatedVendorCost },
      estimatedCourierCost: { ...order.estimatedCourierCost },
      estimatedCustomerCharge: { ...order.estimatedCustomerCharge },
    },
    finalDecision: d.finalDecision as string,
    reason: d.reason as string,
    createdAt: d.createdAt as string,
    confirmedAt: d.confirmedAt as string,
  };
}

function canonicalReconciliationDecision(
  d: Record<string, unknown>,
  orderId: string,
  correcting: boolean,
): Decision {
  const inputs = d.inputs as Record<string, unknown>;
  return {
    id: d.id as string,
    workspaceId: d.workspaceId as string,
    momentId: d.momentId as string,
    decisionType: 'CostReconciliation',
    status: 'Confirmed',
    provider: 'HumanOperator',
    ...(d.actorId !== undefined ? { actorId: d.actorId as string } : {}),
    inputs: {
      recognitionOrderId: orderId,
      actualVendorCost: canonicalMoney(inputs.actualVendorCost),
      actualCourierCost: canonicalMoney(inputs.actualCourierCost),
      actualCustomerCharge: canonicalMoney(inputs.actualCustomerCharge),
      ...(correcting
        ? {
            supersedesDecisionId: inputs.supersedesDecisionId as string,
            previousActualVendorCost: canonicalMoney(inputs.previousActualVendorCost),
            previousActualCourierCost: canonicalMoney(inputs.previousActualCourierCost),
            previousActualCustomerCharge: canonicalMoney(inputs.previousActualCustomerCharge),
          }
        : {}),
    },
    finalDecision: d.finalDecision as string,
    reason: d.reason as string,
    createdAt: d.createdAt as string,
    confirmedAt: d.confirmedAt as string,
  };
}

function canonicalEvent(e: Record<string, unknown>, orderId: string, briefId: string): OperationalEvent {
  return {
    id: e.id as string,
    workspaceId: e.workspaceId as string,
    momentId: e.momentId as string,
    eventType: 'RecognitionOrderCommitted',
    actorType: 'Operator',
    ...(e.actorId !== undefined ? { actorId: e.actorId as string } : {}),
    source: 'Platform',
    payload: { recognitionOrderId: orderId, executionBriefId: briefId },
    occurredAt: e.occurredAt as string,
    recordedAt: e.recordedAt as string,
  };
}
