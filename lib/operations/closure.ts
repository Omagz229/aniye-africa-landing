/**
 * Moment closure and the safe relationship timeline — H3.8, ADR-014.
 *
 * Every function in this module is pure. Previewing, opening the route and
 * dismissing confirmation cannot write. Only
 * `OperationsRepository.commitMomentClosure` may persist the bundle built and
 * independently verified here.
 */

import type {
  Decision,
  ExecutionBrief,
  Fulfilment,
  Memory,
  Moment,
  OperationalEvent,
  OperationsState,
  RecognitionOrder,
} from './types';
import {
  MEMORY_OPTIONAL_KEYS,
  MEMORY_REQUIRED_KEYS,
  MOMENT_CLOSED_PAYLOAD_KEYS,
  isPlainRecord,
  replayFulfilment,
} from './types';
import { isIsoInstant } from './vendors';
import { readDeliveryContext } from './fulfilment';
import { findLiveSelectionDecision } from './selection';
import { findLiveVendorSelection } from './vendor-selection';
import { findLiveCourierSelection } from './courier-selection';

export interface ClosureBlocker {
  code:
    | 'moment-closed'
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'authority-disagrees'
    | 'no-fulfilment'
    | 'not-delivered'
    | 'legacy-fulfilment'
    | 'order-not-reconciled'
    | 'delivery-policy-unrecorded'
    | 'proof-required'
    | 'memory-exists'
    | 'closure-event-exists';
  message: string;
  recovery: string;
  href?: string;
}

export interface ClosureAuthority {
  brief: ExecutionBrief;
  fulfilment: Fulfilment;
  order: RecognitionOrder;
  deliveredEvent: OperationalEvent;
}

export type ClosureAction = 'close' | 'closed' | 'none';

export interface ClosurePreview {
  momentId: string;
  authority: ClosureAuthority | null;
  memory: Memory | null;
  blockers: ClosureBlocker[];
  action: ClosureAction;
}

export interface ClosureContext {
  moment: Moment;
  briefs: readonly ExecutionBrief[];
  decisions: readonly Decision[];
  fulfilments: readonly Fulfilment[];
  orders: readonly RecognitionOrder[];
  events: readonly OperationalEvent[];
  memories: readonly Memory[];
}

function eventFulfilmentId(event: OperationalEvent): string | null {
  return isPlainRecord(event.payload) && typeof event.payload.fulfilmentId === 'string'
    ? event.payload.fulfilmentId
    : null;
}

/** Resolve current authority and every named gate without writing. */
export function previewMomentClosure(context: ClosureContext): ClosurePreview {
  const { moment } = context;
  const blockers: ClosureBlocker[] = [];
  const memory = context.memories.find(value => value.momentId === moment.id) ?? null;
  const closureEvent = context.events.find(
    event => event.momentId === moment.id && event.eventType === 'MomentClosed',
  );

  if (moment.status === 'Closed') {
    return {
      momentId: moment.id,
      authority: null,
      memory,
      blockers: [],
      action: 'closed',
    };
  }

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled and cannot be closed.',
      recovery: 'Nothing to do here. Cancellation remains the terminal record for this moment.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment is not ready for execution, so it cannot be closed.',
      recovery: 'Resolve its review issues before continuing the operational chain.',
      href: `/operations/moments/${moment.id}`,
    });
  }

  const brief = context.briefs.find(
    value => value.momentId === moment.id && value.status === 'Confirmed',
  ) ?? null;
  if (!brief) {
    blockers.push({
      code: 'no-confirmed-brief',
      message: 'This moment has no current confirmed brief.',
      recovery: 'A confirmed brief is required because it holds the frozen delivery policy.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }

  const fulfilment = context.fulfilments.find(value => value.momentId === moment.id) ?? null;
  const order = context.orders.find(value => value.momentId === moment.id) ?? null;

  if (!fulfilment) {
    blockers.push({
      code: 'no-fulfilment',
      message: 'Nothing has been dispatched for this moment.',
      recovery: 'Complete fulfilment before closing the moment.',
      href: `/operations/moments/${moment.id}/fulfilment`,
    });
  } else {
    const replay = replayFulfilment(context.events, fulfilment.id);
    if (!replay.ok || replay.status !== 'Delivered' || fulfilment.status !== 'Delivered') {
      blockers.push({
        code: 'not-delivered',
        message: replay.ok
          ? 'This fulfilment has not been delivered.'
          : `This fulfilment's history cannot be closed: ${replay.reason}`,
        recovery: 'Return to fulfilment and record a valid delivery outcome first.',
        href: `/operations/moments/${moment.id}/fulfilment`,
      });
    }
  }

  if (!order) {
    blockers.push({
      code: fulfilment ? 'legacy-fulfilment' : 'order-not-reconciled',
      message: fulfilment
        ? 'This fulfilment began before commercial authority was recorded, so it cannot close.'
        : 'This moment has no Recognition Order.',
      recovery: fulfilment
        ? 'Its delivery history remains intact, but no order or commercial history may be invented for it.'
        : 'Commit and later reconcile the Recognition Order before closure.',
      href: fulfilment ? `/operations/moments/${moment.id}/fulfilment` : `/operations/moments/${moment.id}/order`,
    });
  } else if (order.status !== 'Reconciled') {
    blockers.push({
      code: 'order-not-reconciled',
      message: 'The Recognition Order has not been reconciled.',
      recovery: 'Confirm the actual vendor, courier and customer amounts first.',
      href: `/operations/moments/${moment.id}/order`,
    });
  }

  const itemDecision = findLiveSelectionDecision(context.decisions, moment.id);
  const vendorDecision = findLiveVendorSelection(context.decisions, moment.id);
  const courierDecision = findLiveCourierSelection(context.decisions, moment.id);
  let coherent = Boolean(brief && fulfilment && order && itemDecision && vendorDecision && courierDecision);

  if (coherent) {
    const vendorInputs = isPlainRecord(vendorDecision!.inputs) ? vendorDecision!.inputs : {};
    const courierInputs = isPlainRecord(courierDecision!.inputs) ? courierDecision!.inputs : {};
    coherent =
      fulfilment!.briefId === brief!.id &&
      fulfilment!.briefRevision === brief!.revision &&
      fulfilment!.itemSelectionDecisionId === itemDecision!.id &&
      fulfilment!.vendorSelectionDecisionId === vendorDecision!.id &&
      fulfilment!.courierSelectionDecisionId === courierDecision!.id &&
      order!.executionBriefId === brief!.id &&
      order!.briefRevision === brief!.revision &&
      order!.itemSelectionDecisionId === itemDecision!.id &&
      order!.vendorSelectionDecisionId === vendorDecision!.id &&
      order!.courierSelectionDecisionId === courierDecision!.id &&
      vendorInputs.briefId === brief!.id &&
      vendorInputs.briefRevision === brief!.revision &&
      vendorInputs.itemSelectionDecisionId === itemDecision!.id &&
      courierInputs.briefId === brief!.id &&
      courierInputs.briefRevision === brief!.revision &&
      courierInputs.itemSelectionDecisionId === itemDecision!.id &&
      courierInputs.vendorSelectionDecisionId === vendorDecision!.id;
  }

  if (brief && fulfilment && order && !coherent) {
    blockers.push({
      code: 'authority-disagrees',
      message: 'The brief, selections, fulfilment and Recognition Order do not name one coherent authority chain.',
      recovery: 'This moment needs a governed correction before it can close. Nothing has been changed.',
      href: `/operations/moments/${moment.id}`,
    });
  }

  const deliveryContext = brief ? readDeliveryContext(brief.policyResolutionSnapshot) : null;
  if (brief && !deliveryContext) {
    blockers.push({
      code: 'delivery-policy-unrecorded',
      message: 'The frozen delivery policy was not recorded for this moment.',
      recovery: 'Do not default it or consult the current Workspace policy. This legacy moment cannot close.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }

  if (deliveryContext?.proofRequired && fulfilment) {
    const proof = context.events.some(
      event => event.eventType === 'ProofReceived' && eventFulfilmentId(event) === fulfilment.id,
    );
    if (!proof) {
      blockers.push({
        code: 'proof-required',
        message: 'This moment’s frozen policy requires proof, but no ProofReceived event exists.',
        recovery: 'Record receipt of proof metadata on the fulfilment. Do not upload a proof file.',
        href: `/operations/moments/${moment.id}/fulfilment`,
      });
    }
  }

  if (memory) {
    blockers.push({
      code: 'memory-exists',
      message: 'A Memory already exists for this moment.',
      recovery: 'Closure is one-time and immutable. Review the existing timeline entry.',
      href: `/operations/timeline/${moment.personId}`,
    });
  }
  if (closureEvent) {
    blockers.push({
      code: 'closure-event-exists',
      message: 'A MomentClosed event already exists for this moment.',
      recovery: 'Closure is one-time. Nothing further should be recorded.',
      href: `/operations/moments/${moment.id}`,
    });
  }

  const deliveredEvent = fulfilment
    ? context.events.find(
        event => event.eventType === 'Delivered' && eventFulfilmentId(event) === fulfilment.id,
      ) ?? null
    : null;
  const authority =
    coherent &&
    brief &&
    fulfilment?.status === 'Delivered' &&
    order?.status === 'Reconciled' &&
    deliveredEvent
      ? { brief, fulfilment, order, deliveredEvent }
      : null;

  return {
    momentId: moment.id,
    authority,
    memory,
    blockers,
    action: blockers.length === 0 && authority ? 'close' : 'none',
  };
}

export interface ClosureIdFactory {
  memory(): string;
  event(): string;
}

/** The entire submitted closure bundle. The Moment status is never submitted. */
export interface ClosureBundle {
  memory: Memory;
  event: OperationalEvent;
}

export interface BuildClosureInput extends ClosureContext {
  now: string;
  ids: ClosureIdFactory;
  actorId?: string;
}

export type ClosureResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function closureRecords(
  context: ClosureContext,
  authority: ClosureAuthority,
  now: string,
  memoryId: string,
  eventId: string,
  actorId?: string,
): ClosureBundle {
  const outcomeDate = authority.deliveredEvent.occurredAt.slice(0, 10);
  const memory: Memory = {
    id: memoryId,
    workspaceId: context.moment.workspaceId,
    momentId: context.moment.id,
    personId: context.moment.personId,
    fulfilmentId: authority.fulfilment.id,
    recognitionOrderId: authority.order.id,
    outcome: 'Delivered',
    outcomeDate,
    createdByActorType: 'Operator',
    ...(actorId ? { createdByActorId: actorId } : {}),
    createdAt: now,
  };
  const event: OperationalEvent = {
    id: eventId,
    workspaceId: context.moment.workspaceId,
    momentId: context.moment.id,
    eventType: 'MomentClosed',
    actorType: 'Operator',
    ...(actorId ? { actorId } : {}),
    source: 'Platform',
    payload: {
      memoryId,
      fulfilmentId: authority.fulfilment.id,
      recognitionOrderId: authority.order.id,
      outcome: 'Delivered',
      outcomeDate,
      previousStatus: 'ReadyForExecution',
    },
    occurredAt: now,
    recordedAt: now,
  };
  return { memory, event };
}

export function buildMomentClosure(input: BuildClosureInput): ClosureResult<ClosureBundle> {
  if (!isIsoInstant(input.now)) {
    return { ok: false, reason: 'Closure needs a valid confirmation timestamp.' };
  }
  const preview = previewMomentClosure(input);
  if (preview.action !== 'close' || !preview.authority) {
    return {
      ok: false,
      reason: preview.blockers.map(blocker => blocker.message).join(' ') || 'This moment cannot be closed.',
    };
  }
  return {
    ok: true,
    value: closureRecords(
      input,
      preview.authority,
      input.now,
      input.ids.memory(),
      input.ids.event(),
      input.actorId,
    ),
  };
}

const BUNDLE_KEYS = ['memory', 'event'] as const;
const EVENT_REQUIRED_KEYS = [
  'id',
  'workspaceId',
  'momentId',
  'eventType',
  'actorType',
  'source',
  'payload',
  'occurredAt',
  'recordedAt',
] as const;
const EVENT_OPTIONAL_KEYS = ['actorId'] as const;

function exactKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every(key => key in record) && Object.keys(record).every(key => allowed.has(key));
}

function sameMemory(submitted: Record<string, unknown>, expected: Memory): boolean {
  return (
    submitted.id === expected.id &&
    submitted.workspaceId === expected.workspaceId &&
    submitted.momentId === expected.momentId &&
    submitted.personId === expected.personId &&
    submitted.fulfilmentId === expected.fulfilmentId &&
    submitted.recognitionOrderId === expected.recognitionOrderId &&
    submitted.outcome === expected.outcome &&
    submitted.outcomeDate === expected.outcomeDate &&
    submitted.createdByActorType === expected.createdByActorType &&
    submitted.createdByActorId === expected.createdByActorId &&
    submitted.createdAt === expected.createdAt
  );
}

function sameEvent(submitted: Record<string, unknown>, expected: OperationalEvent): boolean {
  if (!isPlainRecord(submitted.payload)) return false;
  const payload = submitted.payload;
  return (
    submitted.id === expected.id &&
    submitted.workspaceId === expected.workspaceId &&
    submitted.momentId === expected.momentId &&
    submitted.eventType === expected.eventType &&
    submitted.actorType === expected.actorType &&
    submitted.actorId === expected.actorId &&
    submitted.source === expected.source &&
    submitted.occurredAt === expected.occurredAt &&
    submitted.recordedAt === expected.recordedAt &&
    payload.memoryId === expected.payload.memoryId &&
    payload.fulfilmentId === expected.payload.fulfilmentId &&
    payload.recognitionOrderId === expected.payload.recognitionOrderId &&
    payload.outcome === expected.payload.outcome &&
    payload.outcomeDate === expected.payload.outcomeDate &&
    payload.previousStatus === expected.payload.previousStatus
  );
}

export interface VerifyClosureInput extends ClosureContext {
  workspaceId: string;
  write: unknown;
  now: string;
}

export type VerifyClosureResult =
  | { ok: true; moment: Moment; memory: Memory; event: OperationalEvent }
  | { ok: false; reason: string };

function refuse(message: string): { ok: false; reason: string } {
  return { ok: false, reason: `${message} Review the moment and try again — nothing was recorded.` };
}

/** Re-read, rebuild and compare the closure bundle at the repository boundary. */
export function verifyMomentClosure(input: VerifyClosureInput): VerifyClosureResult {
  if (!isPlainRecord(input.write) || !exactKeys(input.write, BUNDLE_KEYS)) {
    return refuse('That closure submission is not an exact bundle.');
  }
  const memory = input.write.memory;
  const event = input.write.event;
  if (!isPlainRecord(memory) || !isPlainRecord(event)) {
    return refuse('That closure submission carries no readable Memory and Event.');
  }
  if (!exactKeys(memory, MEMORY_REQUIRED_KEYS, MEMORY_OPTIONAL_KEYS)) {
    return refuse('That Memory does not have the canonical field set.');
  }
  if (!exactKeys(event, EVENT_REQUIRED_KEYS, EVENT_OPTIONAL_KEYS)) {
    return refuse('That MomentClosed event does not have the canonical field set.');
  }
  if (!isPlainRecord(event.payload) || !exactKeys(event.payload, MOMENT_CLOSED_PAYLOAD_KEYS)) {
    return refuse('That MomentClosed payload does not have the canonical field set.');
  }
  if (
    typeof memory.id !== 'string' ||
    memory.id.length === 0 ||
    typeof event.id !== 'string' ||
    event.id.length === 0 ||
    (memory.createdByActorId !== undefined &&
      (typeof memory.createdByActorId !== 'string' || memory.createdByActorId.trim().length === 0))
  ) {
    return refuse('That closure submission has an unusable identifier.');
  }
  if (input.workspaceId !== input.moment.workspaceId) {
    return refuse('That moment belongs to another workspace.');
  }
  if (!isIsoInstant(input.now)) return refuse('The confirmation time is unreadable.');

  const preview = previewMomentClosure(input);
  if (preview.action !== 'close' || !preview.authority) {
    return refuse(preview.blockers.map(blocker => blocker.message).join(' ') || 'This moment cannot be closed.');
  }

  const actorId = memory.createdByActorId as string | undefined;
  const expected = closureRecords(
    input,
    preview.authority,
    input.now,
    memory.id,
    event.id,
    actorId,
  );

  if (!sameMemory(memory, expected.memory)) {
    return refuse('The submitted Memory does not match current closure authority.');
  }
  if (!sameEvent(event, expected.event)) {
    return refuse('The submitted MomentClosed event does not match current closure authority.');
  }

  return {
    ok: true,
    moment: { ...input.moment, status: 'Closed', updatedAt: input.now },
    memory: expected.memory,
    event: expected.event,
  };
}

// ─── Customer-safe projection ────────────────────────────────────────────────

/** Exactly nine customer-safe fields. No internal identifier other than entryId. */
export interface RecipientTimelineEntry {
  entryId: string;
  recipientFirstName: string;
  recipientLastName: string;
  occasion: string;
  plannedDate: string;
  outcomeDate: string;
  outcome: 'Delivered';
  giftCategory: string;
  summary: string;
}

export function giftCategoryForOrder(
  decisions: readonly Decision[],
  order: RecognitionOrder,
): ClosureResult<string> {
  const selection = decisions.find(value => value.id === order.itemSelectionDecisionId);
  if (!selection || selection.decisionType !== 'ItemSelection' || !isPlainRecord(selection.inputs)) {
    return { ok: false, reason: 'This recognition has no readable item-selection authority.' };
  }
  const selectedItem = selection.inputs.selectedItem;
  if (!isPlainRecord(selectedItem) || typeof selectedItem.category !== 'string' || selectedItem.category.trim() === '') {
    return { ok: false, reason: 'This recognition has no customer-safe gift category.' };
  }
  return { ok: true, value: selectedItem.category };
}

function projectionSummary(entry: Omit<RecipientTimelineEntry, 'entryId' | 'summary'>): string {
  return `${entry.recipientFirstName} ${entry.recipientLastName} — ${entry.occasion}, planned ${entry.plannedDate}; ${entry.giftCategory} ${entry.outcome.toLowerCase()} ${entry.outcomeDate}.`;
}

export function projectRecipientTimelineEntry(
  state: OperationsState,
  memory: Memory,
): ClosureResult<RecipientTimelineEntry> {
  const moment = state.moments.find(value => value.id === memory.momentId);
  const order = state.recognitionOrders.find(value => value.id === memory.recognitionOrderId);
  if (!moment || moment.personId !== memory.personId || !order || order.momentId !== moment.id) {
    return { ok: false, reason: 'This Memory no longer resolves to one governed recognition.' };
  }

  // Resolve the exact immutable authority named by the order — never whichever
  // ItemSelection happens to be live today.
  const category = giftCategoryForOrder(state.decisions, order);
  if (!category.ok) return category;

  const safe = {
    recipientFirstName: moment.recipientSnapshot.firstName,
    recipientLastName: moment.recipientSnapshot.lastName,
    occasion: moment.occasionType,
    plannedDate: moment.targetDate,
    outcomeDate: memory.outcomeDate,
    outcome: memory.outcome,
    giftCategory: category.value,
  } as const;

  // Every key is named into a fresh object. No persisted record is spread into
  // the projection, so forbidden commercial and personal fields cannot hitch a
  // ride and merely be hidden by the UI.
  return {
    ok: true,
    value: {
      entryId: memory.id,
      recipientFirstName: safe.recipientFirstName,
      recipientLastName: safe.recipientLastName,
      occasion: safe.occasion,
      plannedDate: safe.plannedDate,
      outcomeDate: safe.outcomeDate,
      outcome: safe.outcome,
      giftCategory: safe.giftCategory,
      summary: projectionSummary(safe),
    },
  };
}

export function projectRecipientTimeline(
  state: OperationsState,
  personId: string,
): ClosureResult<RecipientTimelineEntry[]> {
  const entries: RecipientTimelineEntry[] = [];
  for (const memory of state.memories.filter(value => value.personId === personId)) {
    const projected = projectRecipientTimelineEntry(state, memory);
    if (!projected.ok) return projected;
    entries.push(projected.value);
  }
  entries.sort((a, b) =>
    a.outcomeDate !== b.outcomeDate
      ? b.outcomeDate.localeCompare(a.outcomeDate)
      : b.entryId.localeCompare(a.entryId),
  );
  return { ok: true, value: entries };
}
