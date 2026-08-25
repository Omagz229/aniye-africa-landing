/**
 * Moment closure and Memory — H3.8, implementing
 * [ADR-014](../../docs/adr/ADR-014-moment-closure-memory-and-safe-timeline.md).
 *
 * **One atomic write, three things change together: the Moment becomes
 * `Closed`, a Memory is created, and one `MomentClosed` Event is appended.**
 * There is no draft, and closure records **no Decision** — by the time every
 * prerequisite below holds there is no alternative left to confirm between,
 * exactly the reasoning ADR-012 already applied to `Dispatched` and
 * `Delivered`.
 *
 * Every function here is **pure**. Nothing reads or writes storage. Only the
 * repository's `commitMomentClosure` writes, and only on confirmation.
 *
 * ─── The rule that shapes everything below ───────────────────────────────────
 *
 * **No caller may assert the Moment's terminal status.** It is recomputed by
 * this module from re-read state, exactly as a Fulfilment's status and a
 * RecognitionOrder's actuals already are — a submitted "trust me, it's ready"
 * is worth nothing at this boundary.
 */

import type {
  ActorType,
  Decision,
  ExecutionBrief,
  Fulfilment,
  Memory,
  Moment,
  MomentStatus,
  OperationalEvent,
  RecognitionOrder,
} from './types';
import {
  FORBIDDEN_MEMORY_FIELDS,
  MOMENT_CLOSED_PAYLOAD_KEYS,
  isPlainRecord,
  replayFulfilment,
} from './types';
import { isIsoInstant } from './vendors';
import { findFulfilmentForMoment, readDeliveryContext } from './fulfilment';
import { findOrderForMoment } from './recognition-order';

// ─── Reading what came before ────────────────────────────────────────────────

export function findMemoryForMoment(memories: readonly Memory[], momentId: string): Memory | null {
  return memories.find(m => m.momentId === momentId) ?? null;
}

export function findClosureEvent(
  events: readonly OperationalEvent[],
  momentId: string,
): OperationalEvent | null {
  return events.find(e => e.eventType === 'MomentClosed' && e.momentId === momentId) ?? null;
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

function findDeliveredEvent(
  events: readonly OperationalEvent[],
  fulfilmentId: string,
): OperationalEvent | null {
  return (
    events.find(
      e => e.eventType === 'Delivered' && isPlainRecord(e.payload) && e.payload.fulfilmentId === fulfilmentId,
    ) ?? null
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface ClosureBlocker {
  code:
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'no-item-selection'
    | 'no-vendor-selection'
    | 'no-courier-selection'
    | 'no-fulfilment'
    | 'not-delivered'
    | 'legacy-fulfilment'
    | 'order-not-reconciled'
    | 'authority-disagrees'
    | 'delivery-context-missing'
    | 'proof-required-missing';
  message: string;
  recovery: string;
  href?: string;
}

/** The one action the current state allows. Never more than one. */
export type ClosureAction = 'close' | 'none';

export interface ClosurePreview {
  momentId: string;
  fulfilment: Fulfilment | null;
  order: RecognitionOrder | null;
  /** Present once closed. */
  memory: Memory | null;
  closedEvent: OperationalEvent | null;
  blockers: ClosureBlocker[];
  action: ClosureAction;
}

export interface ClosureContext {
  moment: Moment;
  brief: ExecutionBrief | null;
  decisions: readonly Decision[];
  fulfilments: readonly Fulfilment[];
  events: readonly OperationalEvent[];
  orders: readonly RecognitionOrder[];
  memories: readonly Memory[];
}

/**
 * What may be done to this Moment's closure right now, and what stops it.
 *
 * **Writes nothing.** Recomputes every prerequisite in ADR-014 §4 from live
 * state — the confirmed brief, the three live selection Decisions, the
 * Fulfilment's own replayed history, the RecognitionOrder's reconciliation,
 * and the frozen delivery promises' proof requirement.
 */
export function previewClosure(context: ClosureContext): ClosurePreview {
  const { moment, brief } = context;
  const blockers: ClosureBlocker[] = [];

  const fulfilment = findFulfilmentForMoment(context.fulfilments, moment.id);
  const order = findOrderForMoment(context.orders, moment.id);
  const memory = findMemoryForMoment(context.memories, moment.id);
  const closedEvent = findClosureEvent(context.events, moment.id);

  // Already closed (or a closure record exists) — nothing further to decide.
  if (moment.status === 'Closed' || memory || closedEvent) {
    return { momentId: moment.id, fulfilment, order, memory, closedEvent, blockers: [], action: 'none' };
  }

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so it can never close.',
      recovery: 'Nothing to do here. The cancellation and its reason stay on the record.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review, so it cannot close.',
      recovery: 'Resolve the issues listed on the moment first.',
    });
  }

  if (!brief || brief.status !== 'Confirmed') {
    blockers.push({
      code: 'no-confirmed-brief',
      message: 'No confirmed brief exists for this moment.',
      recovery: 'A moment cannot close without the brief that governed it.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }

  const itemDecision = findLive(context.decisions, moment.id, 'ItemSelection');
  const vendorDecision = findLive(context.decisions, moment.id, 'VendorSelection');
  const courierDecision = findLive(context.decisions, moment.id, 'CourierSelection');
  if (!itemDecision) {
    blockers.push({
      code: 'no-item-selection',
      message: 'No item was ever chosen for this moment.',
      recovery: 'A moment cannot close without the choices that governed its execution.',
      href: `/operations/moments/${moment.id}/item`,
    });
  } else if (!vendorDecision) {
    blockers.push({
      code: 'no-vendor-selection',
      message: 'No vendor was ever chosen for this moment.',
      recovery: 'A moment cannot close without the choices that governed its execution.',
      href: `/operations/moments/${moment.id}/vendor`,
    });
  } else if (!courierDecision) {
    blockers.push({
      code: 'no-courier-selection',
      message: 'No courier was ever chosen for this moment.',
      recovery: 'A moment cannot close without the choices that governed its execution.',
      href: `/operations/moments/${moment.id}/courier`,
    });
  }

  if (!fulfilment) {
    blockers.push({
      code: 'no-fulfilment',
      message: 'Nothing has been dispatched for this moment yet.',
      recovery: 'It can close once it has been dispatched and delivered.',
      href: `/operations/moments/${moment.id}/fulfilment`,
    });
  } else {
    const replay = replayFulfilment(context.events, fulfilment.id);
    if (!replay.ok || replay.status !== 'Delivered') {
      blockers.push({
        code: 'not-delivered',
        message: 'This moment has not been delivered yet.',
        recovery: 'It can close once delivery is confirmed.',
        href: `/operations/moments/${moment.id}/fulfilment`,
      });
    }
  }

  /**
   * **A pre-H3.7 delivered Fulfilment without a RecognitionOrder can never
   * close** (ADR-014 §4). No order, commercial history or reconstruction path
   * is invented for it — this names the limitation rather than offering an
   * action that would fabricate evidence.
   */
  if (fulfilment && !order) {
    blockers.push({
      code: 'legacy-fulfilment',
      message: 'This moment was dispatched before commercial tracking existed, so it can never close here.',
      recovery:
        'Its delivery history is intact and unaffected. There is no order to reconcile and none can be invented, so this moment has no path to closure in this build.',
    });
  } else if (order && order.status !== 'Reconciled') {
    blockers.push({
      code: 'order-not-reconciled',
      message: 'The Recognition Order has not been reconciled yet.',
      recovery: 'Confirm the actual amounts first.',
      href: `/operations/moments/${moment.id}/order`,
    });
  }

  // The stored chain must agree with itself — the same rule dispatch already
  // requires, extended to the RecognitionOrder that also references it.
  if (brief && itemDecision && vendorDecision && courierDecision && fulfilment) {
    const agrees =
      fulfilment.briefId === brief.id &&
      fulfilment.briefRevision === brief.revision &&
      fulfilment.itemSelectionDecisionId === itemDecision.id &&
      fulfilment.vendorSelectionDecisionId === vendorDecision.id &&
      fulfilment.courierSelectionDecisionId === courierDecision.id &&
      (!order ||
        (order.executionBriefId === brief.id &&
          order.briefRevision === brief.revision &&
          order.itemSelectionDecisionId === itemDecision.id &&
          order.vendorSelectionDecisionId === vendorDecision.id &&
          order.courierSelectionDecisionId === courierDecision.id));
    if (!agrees) {
      blockers.push({
        code: 'authority-disagrees',
        message: 'What was chosen for this moment no longer matches its current brief.',
        recovery:
          'The brief was corrected after dispatch. A moment cannot close against a chain that disagrees with itself, and this build has no governed correction for it.',
        href: `/operations/moments/${moment.id}/brief`,
      });
    }
  }

  /**
   * `signatureRequired`, `deliveryRequirement` and `preferredDeliveryWindow`
   * create **no additional closure gate** (ADR-014 §4) — comparing what was
   * promised against what happened is QA adjudication, OPS-U4b, deferred.
   * Only `proofRequired` gates, and only when it is known to be `true`; a
   * missing frozen snapshot is never defaulted or re-resolved.
   */
  if (fulfilment) {
    const deliveryContext = brief ? readDeliveryContext(brief.policyResolutionSnapshot) : null;
    if (deliveryContext === null) {
      blockers.push({
        code: 'delivery-context-missing',
        message: 'What was promised for delivery on this moment was never recorded.',
        recovery: 'This moment cannot close here — the promises cannot be recovered after the fact.',
      });
    } else if (deliveryContext.proofRequired) {
      const hasProof = context.events.some(
        e => e.eventType === 'ProofReceived' && isPlainRecord(e.payload) && e.payload.fulfilmentId === fulfilment.id,
      );
      if (!hasProof) {
        blockers.push({
          code: 'proof-required-missing',
          message: 'Proof was required for this delivery and none has been recorded.',
          recovery: 'Record proof of delivery first.',
          href: `/operations/moments/${moment.id}/fulfilment`,
        });
      }
    }
  }

  return {
    momentId: moment.id,
    fulfilment,
    order,
    memory: null,
    closedEvent: null,
    blockers,
    action: blockers.length === 0 ? 'close' : 'none',
  };
}

// ─── Building what closure writes ────────────────────────────────────────────

export interface ClosureIdFactory {
  memory: () => string;
  event: () => string;
}

export type ClosureResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Closure: the Memory is created, and one Event is appended. No Decision. */
export interface ClosureBundle {
  memory: Memory;
  event: OperationalEvent;
}

export interface CommitClosureInput extends ClosureContext {
  now: string;
  ids: ClosureIdFactory;
  actorId?: string;
}

/**
 * Build everything a confirmed closure writes.
 *
 * **The Moment's new status is not part of this bundle.** It is recomputed by
 * the repository from re-read state, never submitted (ADR-014 §10).
 */
export function buildMomentClosure(input: CommitClosureInput): ClosureResult<ClosureBundle> {
  const { moment, now, ids, actorId } = input;

  const preview = previewClosure(input);
  if (preview.memory || preview.closedEvent || moment.status === 'Closed') {
    return { ok: false, reason: 'This moment has already closed.' };
  }
  if (preview.action !== 'close' || !preview.fulfilment || !preview.order) {
    return {
      ok: false,
      reason: preview.blockers.map(b => b.message).join(' ') || 'This moment cannot close yet.',
    };
  }

  const deliveredEvent = findDeliveredEvent(input.events, preview.fulfilment.id);
  if (!deliveredEvent) {
    return { ok: false, reason: 'No delivery event could be found for this moment.' };
  }

  const memory: Memory = {
    id: ids.memory(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    personId: moment.personId,
    fulfilmentId: preview.fulfilment.id,
    recognitionOrderId: preview.order.id,
    outcome: 'Delivered',
    outcomeDate: deliveredEvent.occurredAt,
    createdByActorType: 'Operator' as ActorType,
    ...(actorId !== undefined ? { createdByActorId: actorId } : {}),
    createdAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    eventType: 'MomentClosed',
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    payload: {
      memoryId: memory.id,
      fulfilmentId: memory.fulfilmentId,
      recognitionOrderId: memory.recognitionOrderId,
      outcome: memory.outcome,
      outcomeDate: memory.outcomeDate,
      previousStatus: moment.status,
    },
    occurredAt: now,
    recordedAt: now,
  };

  return { ok: true, value: { memory, event } };
}

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Prove a submitted closure against recomputed truth.
 *
 * Built with everything H3.3-D1 through H3.7 established: **the container
 * before its contents**, exact keys at every level, canonical ISO instants,
 * and no caller-supplied field reaching storage except by surviving both an
 * exact-key check and a field-by-field comparison — and then being
 * reconstructed from the checked values. On success this returns the
 * **rebuilt** Moment (with its recomputed terminal status), Memory and Event.
 *
 * Callable without the repository, and safe when it is.
 */
const MEMORY_KEYS = [
  'id', 'workspaceId', 'momentId', 'personId', 'fulfilmentId', 'recognitionOrderId',
  'outcome', 'outcomeDate', 'createdByActorType', 'createdByActorId', 'createdAt',
] as const;

const CLOSURE_BUNDLE_KEYS = ['memory', 'event'] as const;

const CLOSURE_EVENT_KEYS = [
  'id', 'workspaceId', 'momentId', 'eventType', 'actorType', 'actorId',
  'source', 'payload', 'occurredAt', 'recordedAt',
] as const;

function extraKeys(value: unknown, allowed: readonly string[]): string[] {
  if (!isPlainRecord(value)) return [];
  const permitted = new Set<string>(allowed);
  return Object.keys(value).filter(k => !permitted.has(k));
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export interface VerifyClosureInput {
  workspaceId: string;
  moment: Moment;
  briefs: readonly ExecutionBrief[];
  decisions: readonly Decision[];
  fulfilments: readonly Fulfilment[];
  events: readonly OperationalEvent[];
  orders: readonly RecognitionOrder[];
  memories: readonly Memory[];
  write: unknown;
}

export type VerifyClosureResult =
  | { ok: true; moment: Moment; memory: Memory; event: OperationalEvent }
  | { ok: false; reason: string };

const REVIEW_AGAIN = 'Review the moment and try again — nothing was recorded.';

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} ${REVIEW_AGAIN}` };
}

export function verifyClosureWrite(input: VerifyClosureInput): VerifyClosureResult {
  const { workspaceId, moment } = input;

  // ── 0. The submission itself, before anything is read from it ──
  if (!isPlainRecord(input.write)) return refuse('That submission is not a record.');
  const extraBundle = extraKeys(input.write, CLOSURE_BUNDLE_KEYS);
  if (extraBundle.length > 0) return refuse(`That submission cannot carry ${extraBundle.join(', ')}.`);

  const memory = input.write.memory;
  if (!isPlainRecord(memory)) return refuse('That submission carries no readable memory.');
  const extraMemory = extraKeys(memory, MEMORY_KEYS);
  if (extraMemory.length > 0) return refuse(`A memory cannot record ${extraMemory.join(', ')}.`);
  for (const forbidden of FORBIDDEN_MEMORY_FIELDS) {
    if (memory[forbidden] !== undefined) return refuse(`A memory cannot record ${forbidden}.`);
  }
  if (!isNonEmptyText(memory.id)) return refuse('That memory has no id.');
  if (input.memories.some(m => m.id === memory.id)) return refuse('That memory has already been recorded.');

  const event = input.write.event;
  if (!isPlainRecord(event)) return refuse('That submission carries no readable event.');
  const extraEvent = extraKeys(event, CLOSURE_EVENT_KEYS);
  if (extraEvent.length > 0) return refuse(`A closure event cannot carry ${extraEvent.join(', ')}.`);
  if (!isNonEmptyText(event.id)) return refuse('That event has no id.');
  if (input.events.some(e => e.id === event.id)) return refuse('That event has already been recorded.');

  if (moment.workspaceId !== workspaceId) return refuse('That moment belongs to a different workspace.');
  if (memory.workspaceId !== workspaceId || memory.momentId !== moment.id) {
    return refuse('That memory belongs to a different workspace or moment.');
  }
  if (event.workspaceId !== workspaceId || event.momentId !== moment.id) {
    return refuse('That event belongs to a different workspace or moment.');
  }
  if (event.eventType !== 'MomentClosed') return refuse('That event does not record a moment closure.');
  if (event.actorType !== 'Operator') return refuse('Closing a moment is an operator action.');
  if (event.source !== 'Platform') return refuse('This step is confirmed in the platform.');
  if (event.actorId !== memory.createdByActorId) return refuse('The memory and event name different actors.');
  if (memory.createdByActorType !== 'Operator') {
    return refuse('A memory is only ever recorded as created by an operator.');
  }

  // ── 1. Terminal-state and idempotency guards ──
  if (moment.status === 'Closed') return refuse('This moment has already closed.');
  if (moment.status === 'Cancelled') return refuse('A cancelled moment can never close.');
  if (moment.status !== 'ReadyForExecution') return refuse('That moment is not ready for execution.');
  if (input.memories.some(m => m.momentId === moment.id)) return refuse('This moment already has a memory.');
  if (input.events.some(e => e.momentId === moment.id && e.eventType === 'MomentClosed')) {
    return refuse('This moment has already been closed.');
  }

  // ── 2. Recompute authority from live state ──
  const brief = input.briefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
  if (!brief) return refuse('This moment has no confirmed brief.');

  const itemDecision = findLive(input.decisions, moment.id, 'ItemSelection');
  if (!itemDecision) return refuse('No item has been chosen for this moment.');
  const vendorDecision = findLive(input.decisions, moment.id, 'VendorSelection');
  if (!vendorDecision) return refuse('No vendor has been chosen for this moment.');
  const courierDecision = findLive(input.decisions, moment.id, 'CourierSelection');
  if (!courierDecision) return refuse('No courier has been chosen for this moment.');

  const fulfilment = findFulfilmentForMoment(input.fulfilments, moment.id);
  if (!fulfilment) return refuse('Nothing has been dispatched for this moment.');
  const replay = replayFulfilment(input.events, fulfilment.id);
  if (!replay.ok) return refuse(`That fulfilment's history cannot be read: ${replay.reason}`);
  if (replay.status !== fulfilment.status || replay.attempt !== fulfilment.attempt) {
    return refuse('That fulfilment disagrees with its own history.');
  }
  if (replay.status !== 'Delivered') return refuse('This moment has not been delivered yet.');

  const order = findOrderForMoment(input.orders, moment.id);
  if (!order) return refuse('This moment was dispatched before commercial tracking existed, and cannot close.');
  if (order.status !== 'Reconciled') return refuse('The recognition order has not been reconciled yet.');

  if (
    fulfilment.briefId !== brief.id ||
    fulfilment.briefRevision !== brief.revision ||
    fulfilment.itemSelectionDecisionId !== itemDecision.id ||
    fulfilment.vendorSelectionDecisionId !== vendorDecision.id ||
    fulfilment.courierSelectionDecisionId !== courierDecision.id ||
    order.executionBriefId !== brief.id ||
    order.briefRevision !== brief.revision ||
    order.itemSelectionDecisionId !== itemDecision.id ||
    order.vendorSelectionDecisionId !== vendorDecision.id ||
    order.courierSelectionDecisionId !== courierDecision.id
  ) {
    return refuse('What was chosen for this moment no longer matches its current brief.');
  }

  const deliveryContext = readDeliveryContext(brief.policyResolutionSnapshot);
  if (deliveryContext === null) {
    return refuse('This moment was prepared before delivery promises were recorded, so it cannot close here.');
  }
  if (deliveryContext.proofRequired) {
    const hasProof = input.events.some(
      e => e.eventType === 'ProofReceived' && isPlainRecord(e.payload) && e.payload.fulfilmentId === fulfilment.id,
    );
    if (!hasProof) return refuse('Proof was required for this delivery and none has been recorded.');
  }

  const deliveredEvent = findDeliveredEvent(input.events, fulfilment.id);
  if (!deliveredEvent || !isIsoInstant(deliveredEvent.occurredAt)) {
    return refuse('No readable delivery event exists for this moment.');
  }

  // ── 3. The submitted memory must match, field by field ──
  if (memory.personId !== moment.personId) return refuse('The memory names a different person.');
  if (memory.fulfilmentId !== fulfilment.id) return refuse('The memory names a different fulfilment.');
  if (memory.recognitionOrderId !== order.id) return refuse('The memory names a different recognition order.');
  if (memory.outcome !== 'Delivered') return refuse('A memory can only record a Delivered outcome.');
  if (memory.outcomeDate !== deliveredEvent.occurredAt) {
    return refuse('The memory’s outcome date disagrees with the delivery record.');
  }
  if (!isIsoInstant(memory.createdAt)) return refuse('That memory has no readable creation time.');
  if (memory.createdAt !== event.occurredAt) {
    return refuse('The memory and the event disagree about when this happened.');
  }

  // ── 4. The event must describe the same occurrence ──
  if (!isPlainRecord(event.payload)) return refuse('That event carries nothing readable.');
  const extraPayload = extraKeys(event.payload, MOMENT_CLOSED_PAYLOAD_KEYS);
  if (extraPayload.length > 0) return refuse(`A closure event cannot carry ${extraPayload.join(', ')}.`);
  if (
    event.payload.memoryId !== memory.id ||
    event.payload.fulfilmentId !== fulfilment.id ||
    event.payload.recognitionOrderId !== order.id ||
    event.payload.outcome !== 'Delivered' ||
    event.payload.outcomeDate !== memory.outcomeDate ||
    event.payload.previousStatus !== moment.status
  ) {
    return refuse('The event does not describe this closure.');
  }
  for (const [value, what] of [
    [event.occurredAt, 'the event occurred'],
    [event.recordedAt, 'the event was recorded'],
  ] as const) {
    if (!isIsoInstant(value)) return refuse(`There is no readable record of when ${what}.`);
  }
  if (event.occurredAt !== event.recordedAt || event.occurredAt !== memory.createdAt) {
    return refuse('The event and the memory disagree about when this happened.');
  }

  // Rebuilt, not spread. Nothing the caller sent reaches storage.
  const rebuiltMemory: Memory = {
    id: memory.id,
    workspaceId,
    momentId: moment.id,
    personId: moment.personId,
    fulfilmentId: fulfilment.id,
    recognitionOrderId: order.id,
    outcome: 'Delivered',
    outcomeDate: deliveredEvent.occurredAt,
    createdByActorType: 'Operator',
    ...(memory.createdByActorId !== undefined ? { createdByActorId: memory.createdByActorId as string } : {}),
    createdAt: memory.createdAt as string,
  };

  const rebuiltEvent: OperationalEvent = {
    id: event.id as string,
    workspaceId,
    momentId: moment.id,
    eventType: 'MomentClosed',
    actorType: 'Operator',
    ...(event.actorId !== undefined ? { actorId: event.actorId as string } : {}),
    source: 'Platform',
    payload: {
      memoryId: rebuiltMemory.id,
      fulfilmentId: fulfilment.id,
      recognitionOrderId: order.id,
      outcome: 'Delivered' as const,
      outcomeDate: rebuiltMemory.outcomeDate,
      previousStatus: moment.status as MomentStatus,
    },
    occurredAt: event.occurredAt as string,
    recordedAt: event.recordedAt as string,
  };

  const closedMoment: Moment = { ...moment, status: 'Closed', updatedAt: rebuiltEvent.occurredAt };

  return { ok: true, moment: closedMoment, memory: rebuiltMemory, event: rebuiltEvent };
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export function humanMomentStatus(status: MomentStatus): string {
  switch (status) {
    case 'NeedsReview': return 'Needs review';
    case 'ReadyForExecution': return 'Ready';
    case 'Cancelled': return 'Cancelled';
    case 'Closed': return 'Closed';
  }
}
