/**
 * The fulfilment lifecycle — H3.6, implementing ADR-012 and checkpoint
 * milestone 8.
 *
 * **Three states, one Fulfilment per Moment, one Decision.** Dispatching and
 * delivering are occurrences; only choosing to try again after a failure is a
 * judgement, so `Redelivery` is the only Decision the lifecycle records.
 *
 * Every function here is **pure**. Nothing reads or writes storage. Only the
 * repository's five named transition operations write, and only on confirmation.
 *
 * ─── The two rules that shape everything below ───────────────────────────────
 *
 * **1. Current state is a projection; the Events are the truth.** Each
 * transition appends an Event *and* updates the Fulfilment, and
 * `replayFulfilment` proves the two agree. Nothing is ever mutated to produce
 * the history — earlier Events are carried through untouched, in persisted
 * order, and a later attempt is a new Event with a higher attempt number.
 *
 * **2. Proof is metadata.** `ProofReceived` records that proof arrived, what
 * kind, through which channel, from whom and when. It stores **no file, no URL,
 * no data URI, no base64 and no bytes** — ADR-012 §7. The operator surface says
 * so in as many words, because an interface implying otherwise would be worse
 * than one that stores nothing.
 */

import type {
  Decision,
  ExecutionBrief,
  Fulfilment,
  FulfilmentStatus,
  Moment,
  OperationalEvent,
  ProofKind,
  RecognitionOrder,
} from './types';
import {
  EVENT_SOURCES,
  LIFECYCLE_PAYLOAD_KEYS,
  PROOF_KINDS,
  PROOF_PAYLOAD_KEYS,
  isPlainRecord,
  replayFulfilment,
} from './types';
import { isIsoInstant } from './vendors';
import type { DeliveryRequirement } from '../workspace';

// ─── Reading what came before ────────────────────────────────────────────────

export function findFulfilmentForMoment(
  fulfilments: readonly Fulfilment[],
  momentId: string,
): Fulfilment | null {
  return fulfilments.find(f => f.momentId === momentId) ?? null;
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

/** This Fulfilment's Events, in **persisted order**. Never re-sorted. */
export function lifecycleHistory(
  events: readonly OperationalEvent[],
  fulfilmentId: string,
): OperationalEvent[] {
  return events.filter(
    e => isPlainRecord(e.payload) && e.payload.fulfilmentId === fulfilmentId,
  );
}

// ─── The frozen delivery promises ────────────────────────────────────────────

/**
 * What the governing policy promised about delivery, captured when the Moment
 * was prepared and copied onto the brief.
 *
 * **Displayed as context, never acted on.** No scheduling, no SLA, no
 * adjudication and no QA rule is derived from these four fields — comparing what
 * arrived against what was promised is OPS-U4b, which is deferred.
 */
export interface DeliveryContext {
  deliveryRequirement: DeliveryRequirement;
  preferredDeliveryWindow: string;
  signatureRequired: boolean;
  proofRequired: boolean;
}

/**
 * Read all four promises, or **nothing at all**.
 *
 * A pre-v6 snapshot has none of them, and `null` here means *"not recorded"* —
 * never a default. Returning `Standard`, an empty window or `false` would
 * convert an unknown into a claim about what the customer was promised, and
 * `RecognitionPolicy` is edited in place at the same id and version, so
 * re-resolving the live policy could not recover the truth either.
 */
export function readDeliveryContext(snapshot: unknown): DeliveryContext | null {
  if (!isPlainRecord(snapshot)) return null;
  const requirement = snapshot.deliveryRequirement;
  const window = snapshot.preferredDeliveryWindow;
  const signature = snapshot.signatureRequired;
  const proof = snapshot.proofRequired;
  if (
    typeof requirement !== 'string' ||
    typeof window !== 'string' ||
    typeof signature !== 'boolean' ||
    typeof proof !== 'boolean'
  ) {
    return null;
  }
  return {
    deliveryRequirement: requirement as DeliveryRequirement,
    preferredDeliveryWindow: window,
    signatureRequired: signature,
    proofRequired: proof,
  };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface FulfilmentBlocker {
  code:
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'no-item-selection'
    | 'no-vendor-selection'
    | 'no-courier-selection'
    | 'no-recognition-order'
    | 'authority-disagrees'
    | 'delivery-context-missing';
  message: string;
  recovery: string;
  href?: string;
}

/** The one transition the current state allows. Never more than one. */
export type FulfilmentAction =
  | 'dispatch'
  | 'fail'
  | 'redeliver'
  | 'deliver'
  | 'proof'
  | 'none';

/** What the three live selection Decisions settle, read back for display. */
export interface DispatchAuthority {
  briefId: string;
  briefRevision: number;
  itemSelectionDecisionId: string;
  vendorSelectionDecisionId: string;
  courierSelectionDecisionId: string;
  itemName: string | null;
  vendorName: string | null;
  courierName: string | null;
}

export interface FulfilmentPreview {
  momentId: string;
  brief: ExecutionBrief | null;
  fulfilment: Fulfilment | null;
  /** `null` means the delivery promises were never recorded — see `readDeliveryContext`. */
  deliveryContext: DeliveryContext | null;
  authority: DispatchAuthority | null;
  /** Persisted order. Append-only, and displayed exactly as stored. */
  history: OperationalEvent[];
  blockers: FulfilmentBlocker[];
  action: FulfilmentAction;
  /** True once delivered and proof was promised but none has been recorded. */
  proofOutstanding: boolean;
}

export interface FulfilmentContext {
  moment: Moment;
  brief: ExecutionBrief | null;
  decisions: readonly Decision[];
  fulfilments: readonly Fulfilment[];
  events: readonly OperationalEvent[];
  /** H3.7 — required before a *new* dispatch; irrelevant to an existing one. */
  orders?: readonly RecognitionOrder[];
}

function readName(decision: Decision | null, key: string): string | null {
  if (!decision || !isPlainRecord(decision.inputs)) return null;
  const value = decision.inputs[key];
  if (!isPlainRecord(value)) return null;
  return typeof value.name === 'string' ? value.name : null;
}

/**
 * What may be done to this Moment's fulfilment right now, and what stops it.
 *
 * **Writes nothing.**
 */
export function previewFulfilment(context: FulfilmentContext): FulfilmentPreview {
  const { moment, brief } = context;
  const blockers: FulfilmentBlocker[] = [];

  const fulfilment = findFulfilmentForMoment(context.fulfilments, moment.id);
  const history = fulfilment ? lifecycleHistory(context.events, fulfilment.id) : [];

  const itemDecision = findLive(context.decisions, moment.id, 'ItemSelection');
  const vendorDecision = findLive(context.decisions, moment.id, 'VendorSelection');
  const courierDecision = findLive(context.decisions, moment.id, 'CourierSelection');
  const deliveryContext = readDeliveryContext(brief?.policyResolutionSnapshot);

  let authority: DispatchAuthority | null = null;
  if (brief && brief.status === 'Confirmed' && itemDecision && vendorDecision && courierDecision) {
    authority = {
      briefId: brief.id,
      briefRevision: brief.revision,
      itemSelectionDecisionId: itemDecision.id,
      vendorSelectionDecisionId: vendorDecision.id,
      courierSelectionDecisionId: courierDecision.id,
      itemName: readName(itemDecision, 'selectedItem'),
      vendorName: readName(vendorDecision, 'selectedVendor'),
      courierName: readName(courierDecision, 'selectedCourier'),
    };
  }

  // Once a Fulfilment exists the upstream gates have already been passed and
  // frozen onto it. Re-running them would block recording what happened to a
  // parcel that is genuinely out there — including on a Moment cancelled after
  // dispatch, where the delivery outcome is exactly the fact worth keeping.
  if (fulfilment) {
    const action: FulfilmentAction =
      fulfilment.status === 'Dispatched'
        ? 'deliver'
        : fulfilment.status === 'DeliveryFailed'
          ? 'redeliver'
          : 'proof';
    const proofRecorded = history.some(e => e.eventType === 'ProofReceived');
    return {
      momentId: moment.id,
      brief: brief ?? null,
      fulfilment,
      deliveryContext,
      authority,
      history,
      blockers,
      action,
      proofOutstanding:
        fulfilment.status === 'Delivered' && deliveryContext?.proofRequired === true && !proofRecorded,
    };
  }

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so nothing is being dispatched.',
      recovery: 'Nothing to do here. The cancellation and its reason stay on the record.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review, so there is nothing to dispatch.',
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
  if (!itemDecision) {
    blockers.push({
      code: 'no-item-selection',
      message: 'No item has been chosen for this moment yet.',
      recovery: 'Choose an item first — there is nothing to dispatch until there is.',
      href: `/operations/moments/${moment.id}/item`,
    });
  } else if (!vendorDecision) {
    blockers.push({
      code: 'no-vendor-selection',
      message: 'No vendor has been chosen for this moment yet.',
      recovery: 'Choose a vendor first — the courier collects from them.',
      href: `/operations/moments/${moment.id}/vendor`,
    });
  } else if (!courierDecision) {
    blockers.push({
      code: 'no-courier-selection',
      message: 'No courier has been chosen for this moment yet.',
      recovery: 'Arrange carriage first — dispatch is confirming that the courier has it.',
      href: `/operations/moments/${moment.id}/courier`,
    });
  } else if (!(context.orders ?? []).some(o => o.momentId === moment.id)) {
    // H3.7 — ADR-013. Commercial authority precedes dispatch, because a
    // quotation cannot be reconstructed after the parcel has gone.
    blockers.push({
      code: 'no-recognition-order',
      message: 'No Recognition Order has been committed for this moment yet.',
      recovery:
        'Commit the commercial authority first — the approved budget, the vendor and courier estimates and your customer quotation. It cannot be recorded after dispatch.',
      href: `/operations/moments/${moment.id}/order`,
    });
  }

  // The stored chain must agree with itself. A brief corrected after a courier
  // was chosen leaves a courier selection quoting a superseded revision, and
  // dispatching against it would record a parcel sent to an address nobody
  // confirmed.
  if (brief && courierDecision && vendorDecision && itemDecision) {
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
          'The brief was corrected after the item, vendor or courier was chosen. Nothing can be dispatched against a chain that disagrees with itself, and this build has no governed correction for it.',
        href: `/operations/moments/${moment.id}/brief`,
      });
    }
  }

  /**
   * **The legacy gate.** A Moment prepared before OperationsState v6 carries no
   * delivery promises, and its brief copied that absence.
   *
   * The recovery is deliberately blunt, because there is no honest repair: the
   * promises cannot be recovered from the live policy (it is edited in place at
   * the same id and version), and the Moment cannot be re-prepared — generation
   * refuses a `sourceKey` that already exists, and cancelling does not release
   * it. Offering a "prepare it again" action would be a promise the idempotency
   * rules cannot keep.
   */
  if (brief && brief.status === 'Confirmed' && deliveryContext === null) {
    blockers.push({
      code: 'delivery-context-missing',
      message: 'This moment was prepared before delivery promises were recorded, so what was promised is unknown.',
      recovery:
        'Nothing can be dispatched against it here. The promises cannot be recovered — the governing rule may have been edited since — and this moment cannot be prepared again, because one already exists for this person and occasion. Carry it out outside this build, or cancel it and say why.',
      href: `/operations/moments/${moment.id}`,
    });
  }

  return {
    momentId: moment.id,
    brief: brief ?? null,
    fulfilment: null,
    deliveryContext,
    authority,
    history,
    blockers,
    action: blockers.length === 0 && authority ? 'dispatch' : 'none',
    proofOutstanding: false,
  };
}

// ─── Building what each transition writes ────────────────────────────────────

export interface FulfilmentIdFactory {
  fulfilment: () => string;
  decision: () => string;
  event: () => string;
}

export type FulfilmentResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Initial dispatch: the Fulfilment is created, and one Event is appended. */
export interface DispatchBundle {
  fulfilment: Fulfilment;
  event: OperationalEvent;
}

/** A failure, a delivery or a proof receipt: one Event, nothing else. */
export interface LifecycleBundle {
  event: OperationalEvent;
}

/** Redelivery: the only transition that records a judgement. */
export interface RedeliveryBundle {
  decision: Decision;
  event: OperationalEvent;
}

export interface DispatchInput extends FulfilmentContext {
  now: string;
  ids: FulfilmentIdFactory;
  actorId?: string;
}

/**
 * Confirm that the courier has it.
 *
 * **No Decision.** There were no alternatives — this is an occurrence, and a
 * Decision here would inflate the audit trail with a reason field that could
 * only ever be filler (ADR-006, ADR-012 §4).
 */
export function buildInitialDispatch(input: DispatchInput): FulfilmentResult<DispatchBundle> {
  const { moment, now, ids, actorId } = input;

  const preview = previewFulfilment(input);
  if (preview.fulfilment) {
    return { ok: false, reason: 'This moment has already been dispatched.' };
  }
  if (preview.action !== 'dispatch' || !preview.authority) {
    return {
      ok: false,
      reason: preview.blockers.map(b => b.message).join(' ') || 'This moment cannot be dispatched.',
    };
  }

  const a = preview.authority;
  const fulfilment: Fulfilment = {
    id: ids.fulfilment(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    status: 'Dispatched',
    attempt: 1,
    briefId: a.briefId,
    briefRevision: a.briefRevision,
    itemSelectionDecisionId: a.itemSelectionDecisionId,
    vendorSelectionDecisionId: a.vendorSelectionDecisionId,
    courierSelectionDecisionId: a.courierSelectionDecisionId,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ok: true,
    value: {
      fulfilment,
      event: lifecycleEvent(ids.event(), moment, 'Dispatched', fulfilment.id, 1, now, actorId),
    },
  };
}

function lifecycleEvent(
  id: string,
  moment: Moment,
  eventType: 'Dispatched' | 'DeliveryFailed' | 'Delivered',
  fulfilmentId: string,
  attempt: number,
  now: string,
  actorId?: string,
): OperationalEvent {
  return {
    id,
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    eventType,
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    // Identifiers only. Everything else is already an Event field.
    payload: { fulfilmentId, attempt },
    occurredAt: now,
    recordedAt: now,
  };
}

export interface TransitionInput extends FulfilmentContext {
  now: string;
  ids: FulfilmentIdFactory;
  actorId?: string;
}

/** Record that an attempt failed. The state changes **and** an Event is appended. */
export function buildDeliveryFailure(input: TransitionInput): FulfilmentResult<LifecycleBundle> {
  const preview = previewFulfilment(input);
  const f = preview.fulfilment;
  if (!f) return { ok: false, reason: 'Nothing has been dispatched for this moment yet.' };
  if (f.status !== 'Dispatched') {
    return { ok: false, reason: 'Only a dispatched fulfilment can be recorded as failed.' };
  }
  return {
    ok: true,
    value: {
      event: lifecycleEvent(
        input.ids.event(), input.moment, 'DeliveryFailed', f.id, f.attempt, input.now, input.actorId,
      ),
    },
  };
}

/** Record that it reached the recipient. */
export function buildDelivery(input: TransitionInput): FulfilmentResult<LifecycleBundle> {
  const preview = previewFulfilment(input);
  const f = preview.fulfilment;
  if (!f) return { ok: false, reason: 'Nothing has been dispatched for this moment yet.' };
  if (f.status !== 'Dispatched') {
    return { ok: false, reason: 'Only a dispatched fulfilment can be recorded as delivered.' };
  }
  return {
    ok: true,
    value: {
      event: lifecycleEvent(
        input.ids.event(), input.moment, 'Delivered', f.id, f.attempt, input.now, input.actorId,
      ),
    },
  };
}

/** The one-line summary a `Redelivery` shows. Recomputed at the trust boundary. */
export function redeliveryFinalDecision(attempt: number): string {
  return `Redelivering — attempt ${attempt}`;
}

export interface RedeliveryInput extends TransitionInput {
  reason: string;
}

/**
 * Try again after a failure — **the only judgement in the lifecycle.**
 *
 * The operator could redeliver, cancel the moment, or escalate outside the
 * system. Choosing to try again is a real choice between real alternatives, so
 * it requires a human reason exactly as every other Decision does.
 */
export function buildRedelivery(input: RedeliveryInput): FulfilmentResult<RedeliveryBundle> {
  const { moment, now, ids, actorId } = input;

  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, reason: 'Say why this is being sent again — it becomes part of the record.' };
  }

  const preview = previewFulfilment(input);
  const f = preview.fulfilment;
  if (!f) return { ok: false, reason: 'Nothing has been dispatched for this moment yet.' };
  if (f.status !== 'DeliveryFailed') {
    return { ok: false, reason: 'Only a failed attempt can be redelivered.' };
  }

  const attempt = f.attempt + 1;

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'Redelivery',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    inputs: { fulfilmentId: f.id, attempt },
    finalDecision: redeliveryFinalDecision(attempt),
    reason,
    createdAt: now,
    confirmedAt: now,
  };

  return {
    ok: true,
    value: {
      decision,
      // The redelivery Event **is** a `Dispatched` — the parcel is in transit
      // again — carrying the next attempt number.
      event: lifecycleEvent(ids.event(), moment, 'Dispatched', f.id, attempt, now, actorId),
    },
  };
}

export interface ProofInput extends TransitionInput {
  kinds: readonly ProofKind[];
  source: OperationalEvent['source'];
  /** When the proof arrived in the world. Defaults to `now`. */
  occurredAt?: string;
}

/**
 * Record that proof was received.
 *
 * ⚠️ **No file, no URL, no bytes.** ADR-012 §7: this records the occurrence,
 * and the evidence file is not retained. Adding a photograph of a recipient's
 * home to browser storage would move the prototype from *"weak guarantees on
 * operational records"* to *"holding personal data with none"*.
 */
export function buildProofReceipt(input: ProofInput): FulfilmentResult<LifecycleBundle> {
  const { moment, now, ids, actorId } = input;

  const preview = previewFulfilment(input);
  const f = preview.fulfilment;
  if (!f) return { ok: false, reason: 'Nothing has been dispatched for this moment yet.' };
  if (f.status !== 'Delivered') {
    return { ok: false, reason: 'Proof can only be recorded once delivery is confirmed.' };
  }

  const kinds = Array.from(new Set(input.kinds));
  if (kinds.length === 0) return { ok: false, reason: 'Say what kind of proof arrived.' };
  for (const kind of kinds) {
    if (!(PROOF_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, reason: `"${String(kind)}" is not a kind of proof this build records.` };
    }
  }
  if (!(EVENT_SOURCES as readonly string[]).includes(input.source)) {
    return { ok: false, reason: 'That is not a channel this build records.' };
  }

  const occurredAt = input.occurredAt ?? now;
  if (!isIsoInstant(occurredAt)) return { ok: false, reason: 'That is not a readable time.' };
  if (occurredAt > now) return { ok: false, reason: 'Proof cannot have arrived in the future.' };

  return {
    ok: true,
    value: {
      event: {
        id: ids.event(),
        workspaceId: moment.workspaceId,
        momentId: moment.id,
        eventType: 'ProofReceived',
        actorType: 'Operator',
        actorId,
        // The channel it reached Aniyé through — a field, never an integration.
        source: input.source,
        payload: { fulfilmentId: f.id, attempt: f.attempt, proofKinds: kinds },
        // These two genuinely differ once an external party reports.
        occurredAt,
        recordedAt: now,
      },
    },
  };
}

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Prove a submitted transition against recomputed truth.
 *
 * Built with everything H3.3-D1 through H3.5-D1 established: **the container
 * before its contents**, exact keys at every level, canonical ISO instants, and
 * a recomputed summary. Nothing here trusts the submission — and on success it
 * returns **the Fulfilment record the repository must store**, recomputed from
 * live state, so no submitted field can reach storage at all.
 *
 * Callable without the repository, and safe when it is.
 */
export type FulfilmentWriteKind =
  | 'Dispatched'
  | 'DeliveryFailed'
  | 'Redelivery'
  | 'Delivered'
  | 'ProofReceived';

const FULFILMENT_KEYS = [
  'id', 'workspaceId', 'momentId', 'status', 'attempt',
  'briefId', 'briefRevision', 'itemSelectionDecisionId',
  'vendorSelectionDecisionId', 'courierSelectionDecisionId',
  'createdAt', 'updatedAt',
] as const;

const DISPATCH_BUNDLE_KEYS = ['fulfilment', 'event'] as const;
const LIFECYCLE_BUNDLE_KEYS = ['event'] as const;
const REDELIVERY_BUNDLE_KEYS = ['decision', 'event'] as const;

/**
 * The Event and Decision key sets, enforced at the **top level** and not only on
 * the payload.
 *
 * Checking `payload` alone would leave `event.proofUrl` or `event.trackingUrl`
 * free to reach storage beside a spotless payload — the exact shape ADR-012
 * refuses, one nesting level higher than where it was being looked for.
 */
const EVENT_KEYS = [
  'id', 'workspaceId', 'momentId', 'eventType', 'actorType', 'actorId',
  'source', 'payload', 'occurredAt', 'recordedAt',
] as const;

const REDELIVERY_DECISION_KEYS = [
  'id', 'workspaceId', 'momentId', 'decisionType', 'status', 'provider',
  'actorId', 'inputs', 'finalDecision', 'reason', 'createdAt', 'confirmedAt',
] as const;

function extraKeys(value: unknown, allowed: readonly string[]): string[] {
  if (!isPlainRecord(value)) return [];
  const permitted = new Set<string>(allowed);
  return Object.keys(value).filter(k => !permitted.has(k));
}

export interface VerifyFulfilmentInput {
  workspaceId: string;
  moment: Moment;
  briefs: readonly ExecutionBrief[];
  decisions: readonly Decision[];
  fulfilments: readonly Fulfilment[];
  events: readonly OperationalEvent[];
  /**
   * H3.7 — the Recognition Orders in this workspace.
   *
   * **Optional, and deliberately so.** An initial dispatch requires a committed
   * order (ADR-013); every *later* transition does not, because a Fulfilment
   * dispatched before H3.7 existed is valid history and its failures,
   * deliveries and proofs must still be recordable. Omitting it is read as
   * "no orders", which refuses new dispatches and permits nothing else new.
   */
  orders?: readonly RecognitionOrder[];
  write: unknown;
  kind: FulfilmentWriteKind;
}

/**
 * On success this carries **rebuilt** records, not the submitted ones.
 *
 * The repository stores these. Nothing a caller supplied reaches storage except
 * by surviving both an exact-key check and a field-by-field comparison — and
 * then being reconstructed from the checked values.
 */
export type VerifyFulfilmentResult =
  | { ok: true; fulfilment: Fulfilment; event: OperationalEvent; decision?: Decision }
  | { ok: false; reason: string };

const REVIEW_AGAIN = 'Review the moment and try again — nothing was recorded.';

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} ${REVIEW_AGAIN}` };
}

/** What Event type each transition appends. Redelivery appends a `Dispatched`. */
function eventTypeFor(kind: FulfilmentWriteKind): string {
  return kind === 'Redelivery' ? 'Dispatched' : kind;
}

/**
 * Rebuild the Event from the fields that were checked, and only those.
 *
 * The payload is reconstructed from its own exact key set — so a `proofKinds`
 * array is copied element by element rather than carried through by reference,
 * and nothing undeclared survives at either level.
 */
function canonicalEvent(e: Record<string, unknown>, isProof: boolean): OperationalEvent {
  const payload = e.payload as Record<string, unknown>;
  return {
    id: e.id as string,
    workspaceId: e.workspaceId as string,
    momentId: e.momentId as string,
    eventType: e.eventType as OperationalEvent['eventType'],
    actorType: 'Operator',
    ...(e.actorId !== undefined ? { actorId: e.actorId as string } : {}),
    source: e.source as OperationalEvent['source'],
    payload: {
      fulfilmentId: payload.fulfilmentId as string,
      attempt: payload.attempt as number,
      ...(isProof ? { proofKinds: (payload.proofKinds as ProofKind[]).map(k => k) } : {}),
    },
    occurredAt: e.occurredAt as string,
    recordedAt: e.recordedAt as string,
  };
}

function canonicalRedeliveryDecision(d: Record<string, unknown>): Decision {
  const inputs = d.inputs as Record<string, unknown>;
  return {
    id: d.id as string,
    workspaceId: d.workspaceId as string,
    momentId: d.momentId as string,
    decisionType: 'Redelivery',
    status: 'Confirmed',
    provider: 'HumanOperator',
    ...(d.actorId !== undefined ? { actorId: d.actorId as string } : {}),
    inputs: { fulfilmentId: inputs.fulfilmentId as string, attempt: inputs.attempt as number },
    finalDecision: d.finalDecision as string,
    reason: d.reason as string,
    createdAt: d.createdAt as string,
    confirmedAt: d.confirmedAt as string,
  };
}

export function verifyFulfilmentWrite(input: VerifyFulfilmentInput): VerifyFulfilmentResult {
  const { workspaceId, moment, kind } = input;

  // ── 0. The submission itself, before anything is read from it ──
  if (!isPlainRecord(input.write)) return refuse('That submission is not a record.');

  const bundleKeys =
    kind === 'Dispatched'
      ? DISPATCH_BUNDLE_KEYS
      : kind === 'Redelivery'
        ? REDELIVERY_BUNDLE_KEYS
        : LIFECYCLE_BUNDLE_KEYS;
  const extraBundle = extraKeys(input.write, bundleKeys);
  if (extraBundle.length > 0) {
    return refuse(`That submission cannot carry ${extraBundle.join(', ')}.`);
  }

  const event = input.write.event;
  if (!isPlainRecord(event)) return refuse('That submission carries no readable event.');
  const extraEvent = extraKeys(event, EVENT_KEYS);
  if (extraEvent.length > 0) return refuse(`A fulfilment event cannot carry ${extraEvent.join(', ')}.`);
  if (!isNonEmptyText(event.id)) return refuse('That event has no id.');

  if (moment.workspaceId !== workspaceId) return refuse('That moment belongs to a different workspace.');

  // ── 1. The Event must describe this transition, on this moment ──
  if (event.eventType !== eventTypeFor(kind)) {
    return refuse('That event does not record this step.');
  }
  if (event.workspaceId !== workspaceId || event.momentId !== moment.id) {
    return refuse('That event belongs to a different workspace or moment.');
  }
  if (event.actorType !== 'Operator') return refuse('A fulfilment step is an operator action.');
  if (!isPlainRecord(event.payload)) return refuse('That event carries nothing readable.');

  const isProof = kind === 'ProofReceived';
  if (isProof) {
    // The channel proof arrived through is real information — it may be any
    // recorded source. Everything else happens in the platform.
    if (typeof event.source !== 'string' || !(EVENT_SOURCES as readonly string[]).includes(event.source)) {
      return refuse('That event records an unknown channel.');
    }
  } else if (event.source !== 'Platform') {
    return refuse('This step is confirmed in the platform.');
  }

  const payload = event.payload;
  const extraPayload = extraKeys(payload, isProof ? PROOF_PAYLOAD_KEYS : LIFECYCLE_PAYLOAD_KEYS);
  if (extraPayload.length > 0) {
    // This is the line that refuses `url`, `proofUrl`, `fileName`, `dataUri`,
    // `base64`, `bytes` and `blob`. ADR-012 §7 is enforced here, not in prose.
    return refuse(`This step cannot record ${extraPayload.join(', ')}.`);
  }

  for (const [value, what] of [
    [event.occurredAt, 'the event occurred'],
    [event.recordedAt, 'the event was recorded'],
  ] as const) {
    if (!isIsoInstant(value)) return refuse(`There is no readable record of when ${what}.`);
  }

  // ── 2. Initial dispatch — the only branch that creates a Fulfilment ──
  if (kind === 'Dispatched') {
    return verifyInitialDispatch(input, event, payload);
  }

  // ── 3. Every other transition acts on an existing Fulfilment ──
  const existing = findFulfilmentForMoment(input.fulfilments, moment.id);
  if (!existing) return refuse('Nothing has been dispatched for this moment.');
  if (existing.workspaceId !== workspaceId) {
    return refuse('That fulfilment belongs to a different workspace.');
  }
  if (payload.fulfilmentId !== existing.id) {
    return refuse('That step names a different fulfilment.');
  }

  // The stored record must agree with its own history before it is advanced.
  const replay = replayFulfilment(input.events, existing.id);
  if (!replay.ok) return refuse(`That fulfilment's history cannot be read: ${replay.reason}`);
  if (replay.status !== existing.status || replay.attempt !== existing.attempt) {
    return refuse('That fulfilment disagrees with its own history.');
  }

  const now = event.recordedAt as string;

  if (kind === 'DeliveryFailed' || kind === 'Delivered') {
    if (existing.status !== 'Dispatched') {
      return refuse(
        kind === 'DeliveryFailed'
          ? 'Only a dispatched fulfilment can be recorded as failed.'
          : 'Only a dispatched fulfilment can be recorded as delivered.',
      );
    }
    if (payload.attempt !== existing.attempt) return refuse('That step names the wrong attempt.');
    if (event.occurredAt !== event.recordedAt) {
      return refuse('This step is recorded as it is confirmed.');
    }
    const status: FulfilmentStatus = kind === 'DeliveryFailed' ? 'DeliveryFailed' : 'Delivered';
    return {
      ok: true,
      fulfilment: { ...existing, status, updatedAt: now },
      event: canonicalEvent(event, false),
    };
  }

  if (kind === 'ProofReceived') {
    if (existing.status !== 'Delivered') {
      return refuse('Proof can only be recorded once delivery is confirmed.');
    }
    if (payload.attempt !== existing.attempt) return refuse('That step names the wrong attempt.');
    const kinds = payload.proofKinds;
    if (!Array.isArray(kinds) || kinds.length === 0) {
      return refuse('A proof receipt must say what kind of proof arrived.');
    }
    const seen = new Set<string>();
    for (const proofKind of kinds) {
      if (typeof proofKind !== 'string' || !(PROOF_KINDS as readonly string[]).includes(proofKind)) {
        return refuse('That is not a kind of proof this build records.');
      }
      if (seen.has(proofKind)) return refuse('A proof receipt lists each kind once.');
      seen.add(proofKind);
    }
    if ((event.occurredAt as string) > (event.recordedAt as string)) {
      return refuse('Proof cannot have arrived after it was recorded.');
    }
    // Proof changes nothing about the Fulfilment's state — it is an occurrence
    // after delivery, not a fourth status. `updatedAt` moves; nothing else does.
    return {
      ok: true,
      fulfilment: { ...existing, updatedAt: now },
      event: canonicalEvent(event, true),
    };
  }

  // ── 4. Redelivery — the only transition carrying a Decision ──
  if (existing.status !== 'DeliveryFailed') {
    return refuse('Only a failed attempt can be redelivered.');
  }
  const decision = (input.write as Record<string, unknown>).decision;
  if (!isPlainRecord(decision)) return refuse('That submission carries no readable decision.');
  if (decision.decisionType !== 'Redelivery') return refuse('That decision does not record a redelivery.');
  if (decision.status !== 'Confirmed') return refuse('A redelivery is only ever recorded as Confirmed.');
  if (decision.provider !== 'HumanOperator') {
    return refuse('A redelivery must be recorded as an operator judgement.');
  }
  if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
    return refuse('A redelivery needs a reason.');
  }
  if (decision.recommendation !== undefined || decision.overrideReason !== undefined) {
    return refuse('A redelivery carries no recommendation to override.');
  }
  if (decision.workspaceId !== workspaceId || decision.momentId !== moment.id) {
    return refuse('That decision belongs to a different workspace or moment.');
  }
  if (decision.actorId !== event.actorId) return refuse('The decision and event name different actors.');
  if (!isNonEmptyText(decision.id)) return refuse('That decision has no id.');
  const extraDecision = extraKeys(decision, REDELIVERY_DECISION_KEYS);
  if (extraDecision.length > 0) return refuse(`A redelivery decision cannot carry ${extraDecision.join(', ')}.`);
  if (!isPlainRecord(decision.inputs)) return refuse('That decision records nothing readable.');
  const extraInputs = extraKeys(decision.inputs, LIFECYCLE_PAYLOAD_KEYS);
  if (extraInputs.length > 0) return refuse(`A redelivery cannot record ${extraInputs.join(', ')}.`);

  const attempt = existing.attempt + 1;
  if (decision.inputs.fulfilmentId !== existing.id || decision.inputs.attempt !== attempt) {
    return refuse('That decision does not describe the next attempt.');
  }
  if (payload.attempt !== attempt) {
    return refuse('A redelivery must advance the attempt number by exactly one.');
  }
  if (decision.finalDecision !== redeliveryFinalDecision(attempt)) {
    return refuse('The recorded summary does not describe this redelivery.');
  }
  for (const [value, what] of [
    [decision.createdAt, 'the decision was created'],
    [decision.confirmedAt, 'the decision was confirmed'],
  ] as const) {
    if (!isIsoInstant(value)) return refuse(`There is no readable record of when ${what}.`);
  }
  if (decision.createdAt !== decision.confirmedAt) {
    return refuse('The decision was created and confirmed at different times.');
  }
  if (event.occurredAt !== event.recordedAt || event.occurredAt !== decision.confirmedAt) {
    return refuse('The event and the decision disagree about when this happened.');
  }

  return {
    ok: true,
    fulfilment: { ...existing, status: 'Dispatched', attempt, updatedAt: now },
    event: canonicalEvent(event, false),
    decision: canonicalRedeliveryDecision(decision),
  };
}

function verifyInitialDispatch(
  input: VerifyFulfilmentInput,
  event: Record<string, unknown>,
  payload: Record<string, unknown>,
): VerifyFulfilmentResult {
  const { workspaceId, moment } = input;

  if (findFulfilmentForMoment(input.fulfilments, moment.id)) {
    return refuse('This moment has already been dispatched.');
  }
  if (moment.status === 'Cancelled') return refuse('That moment has been cancelled.');
  if (moment.status !== 'ReadyForExecution') return refuse('That moment is no longer ready for execution.');

  const submitted = (input.write as Record<string, unknown>).fulfilment;
  if (!isPlainRecord(submitted)) return refuse('That submission carries no readable fulfilment.');
  const extra = extraKeys(submitted, FULFILMENT_KEYS);
  if (extra.length > 0) return refuse(`A fulfilment cannot record ${extra.join(', ')}.`);

  // Recompute the authority from live state rather than believing the bundle.
  const brief = input.briefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
  if (!brief) return refuse('This moment has no confirmed brief.');

  const itemDecision = findLive(input.decisions, moment.id, 'ItemSelection');
  if (!itemDecision) return refuse('No item has been chosen for this moment.');
  const vendorDecision = findLive(input.decisions, moment.id, 'VendorSelection');
  if (!vendorDecision) return refuse('No vendor has been chosen for this moment.');
  const courierDecision = findLive(input.decisions, moment.id, 'CourierSelection');
  if (!courierDecision) return refuse('No courier has been chosen for this moment.');

  // The chain must agree with itself: a brief corrected after carriage was
  // arranged leaves the courier quoting a revision nobody confirmed against.
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

  /**
   * The v6 delivery promises, required in full.
   *
   * Legacy absence means "not recorded", never a default — and it is refused
   * here rather than filled in, because a dispatch recorded against invented
   * promises would look exactly like one recorded against real ones.
   */
  if (readDeliveryContext(brief.policyResolutionSnapshot) === null) {
    return {
      ok: false,
      reason:
        'This moment was prepared before delivery promises were recorded, so what was promised is unknown. It cannot be dispatched here, and it cannot be prepared again — nothing was recorded.',
    };
  }

  /**
   * **H3.7 — commercial authority precedes dispatch (ADR-013).**
   *
   * A parcel that goes out with no committed order has no recorded budget,
   * estimate or customer quotation behind it, and none can be reconstructed
   * afterwards: the quotation is a human judgement that no formula may invent.
   * So the order is required *before* the dispatch rather than chased after it.
   *
   * ⚠️ This gates **creation only.** Fulfilments dispatched before H3.7 existed
   * remain valid, readable and fully advanceable — their failures, redeliveries,
   * deliveries and proof receipts all still record. Structural validation does
   * not require an order for them, and the migration invents none.
   */
  const order = (input.orders ?? []).find(o => o.momentId === moment.id) ?? null;
  if (!order) {
    return {
      ok: false,
      reason:
        'This moment has no committed Recognition Order, and commercial authority must be recorded before dispatch. Create the order first — nothing was recorded.',
    };
  }
  if (order.workspaceId !== workspaceId) {
    return refuse('That recognition order belongs to a different workspace.');
  }
  if (order.executionBriefId !== brief.id || order.briefRevision !== brief.revision) {
    return refuse('The recognition order was committed against a different brief revision.');
  }
  if (
    order.itemSelectionDecisionId !== itemDecision.id ||
    order.vendorSelectionDecisionId !== vendorDecision.id ||
    order.courierSelectionDecisionId !== courierDecision.id
  ) {
    return refuse('The recognition order was committed against a different item, vendor or courier.');
  }

  if (!isIsoInstant(submitted.createdAt) || submitted.createdAt !== submitted.updatedAt) {
    return refuse('That fulfilment has no readable creation time.');
  }
  if (submitted.createdAt !== event.recordedAt) {
    return refuse('The fulfilment and its event disagree about when this happened.');
  }
  if (event.occurredAt !== event.recordedAt) {
    return refuse('This step is recorded as it is confirmed.');
  }
  if (!isNonEmptyText(submitted.id)) return refuse('That fulfilment has no id.');
  if (input.fulfilments.some(f => f.id === submitted.id)) {
    return refuse('That fulfilment has already been recorded.');
  }
  if (payload.fulfilmentId !== submitted.id) return refuse('That event names a different fulfilment.');
  if (payload.attempt !== 1) return refuse('A fulfilment opens at attempt 1.');

  // Rebuilt, not spread — a caller cannot store a tracking number, a proof URL
  // or any other undeclared field by handing us an object the compiler accepts.
  const recomputed: Fulfilment = {
    id: submitted.id,
    // The workspace being written to, already proved equal to the Moment's.
    workspaceId,
    momentId: moment.id,
    status: 'Dispatched',
    attempt: 1,
    briefId: brief.id,
    briefRevision: brief.revision,
    itemSelectionDecisionId: itemDecision.id,
    vendorSelectionDecisionId: vendorDecision.id,
    courierSelectionDecisionId: courierDecision.id,
    createdAt: submitted.createdAt,
    updatedAt: submitted.createdAt,
  };

  for (const key of FULFILMENT_KEYS) {
    if (submitted[key] !== recomputed[key]) {
      return refuse(`The submitted fulfilment disagrees about ${key}.`);
    }
  }

  return { ok: true, fulfilment: recomputed, event: canonicalEvent(event, false) };
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/** Human language for the interface; canonical names stay in the types. */
export function humanFulfilmentStatus(status: FulfilmentStatus): string {
  switch (status) {
    case 'Dispatched': return 'In transit';
    case 'DeliveryFailed': return 'Needs redelivery';
    case 'Delivered': return 'Delivered';
  }
}

export function humanDeliveryRequirement(requirement: DeliveryRequirement): string {
  switch (requirement) {
    case 'Standard': return 'Standard delivery';
    case 'Courier': return 'Courier';
    case 'HandDelivered': return 'Hand-delivered';
    case 'Digital': return 'Digital';
  }
}
