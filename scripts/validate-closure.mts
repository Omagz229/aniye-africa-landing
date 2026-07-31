/** Deterministic validation for H3.8 — Moment closure, Memory and safe timeline. */

import { CURRENT_WORKSPACE_SCHEMA_VERSION } from '../lib/migrations';
import type { Money } from '../lib/money';
import type {
  Decision,
  Moment,
  OperationalEvent,
  OperationsState,
} from '../lib/operations/types';
import {
  CURRENT_OPERATIONS_SCHEMA_VERSION,
  DECISION_TYPES,
  EVENT_TYPES,
  MEMORY_OPTIONAL_KEYS,
  MEMORY_OUTCOMES,
  MEMORY_REQUIRED_KEYS,
  MOMENT_CLOSED_PAYLOAD_KEYS,
  MOMENT_STATUSES,
  OPERATIONS_KEY,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import {
  buildMomentClosure,
  previewMomentClosure,
  projectRecipientTimeline,
  projectRecipientTimelineEntry,
  verifyMomentClosure,
} from '../lib/operations/closure';
import type { ClosureBundle, ClosureContext } from '../lib/operations/closure';
import { titleFor } from '../lib/operations/routes';

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push(`${name}\n      ${detail}`);
    console.log(`  ✗ ${name}\n      ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMemoryStorage(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  const writes: string[] = [];
  return {
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => { writes.push(key); data.set(key, value); },
    writes,
    raw: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
  };
}

const WS = 'org-1';
const OTHER_WS = 'org-2';
const MOMENT = 'moment-1';
const PERSON = 'person-1';
const BRIEF = 'brief-1';
const ITEM = 'decision-item';
const VENDOR = 'decision-vendor';
const COURIER = 'decision-courier';
const FULFILMENT = 'fulfilment-1';
const ORDER = 'order-1';
const T0 = '2026-07-01T00:00:00.000Z';
const T1 = '2026-07-02T09:00:00.000Z';
const T2 = '2026-07-03T15:30:00.000Z';
const T3 = '2026-07-04T10:00:00.000Z';

function ngn(major: number): Money {
  return { amountMinor: major * 100, currency: 'NGN' };
}

function decision(id: string, decisionType: Decision['decisionType'], inputs: Record<string, unknown>): Decision {
  return {
    id,
    workspaceId: WS,
    momentId: MOMENT,
    decisionType,
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId: 'operator-1',
    inputs,
    finalDecision: id,
    reason: 'Fixture authority.',
    createdAt: T0,
    confirmedAt: T0,
  };
}

function event(
  id: string,
  eventType: OperationalEvent['eventType'],
  payload: Record<string, unknown>,
  at: string,
): OperationalEvent {
  return {
    id,
    workspaceId: WS,
    momentId: MOMENT,
    eventType,
    actorType: 'Operator',
    actorId: 'operator-1',
    source: 'Platform',
    payload,
    occurredAt: at,
    recordedAt: at,
  };
}

function readyState(proofRequired = true, includeProof = true): OperationsState {
  const budget = ngn(50_000);
  const policyResolutionSnapshot = {
    policyAssignmentId: 'assignment-1',
    policyId: 'policy-1',
    policyName: 'Executive recognition',
    policyVersion: 1,
    resolvedCountryScope: 'NG',
    occasionType: 'Birthday',
    approvedRecognitionBudget: budget,
    excludedCategories: [],
    deliveryRequirement: 'Courier' as const,
    preferredDeliveryWindow: 'Weekday mornings',
    signatureRequired: true,
    proofRequired,
    resolvedAt: T0,
  };
  const recipientSnapshot = { firstName: 'Ada', lastName: 'Obi', email: 'ada@example.test' };
  const relationshipGroupSnapshot = {
    relationshipClassId: 'class-1', name: 'Executive Leadership', type: 'Employee' as const, level: 0,
  };
  const moment: Moment = {
    id: MOMENT,
    workspaceId: WS,
    programId: 'program-1',
    personId: PERSON,
    relationshipClassId: 'class-1',
    occasionType: 'Birthday',
    targetDate: '2026-07-03',
    status: 'ReadyForExecution',
    sourceKey: 'campaign::org-1::program-1::person-1::Birthday',
    recipientSnapshot,
    relationshipGroupSnapshot,
    policyResolutionSnapshot,
    issues: [],
    createdAt: T0,
    updatedAt: T0,
  };
  const decisions = [
    decision(ITEM, 'ItemSelection', {
      briefId: BRIEF,
      briefRevision: 1,
      selectedItemId: 'catalog-1',
      selectedItem: {
        itemId: 'catalog-1',
        name: 'Hand-thrown ceramic set',
        category: 'Home & Living',
        price: ngn(38_000),
      },
    }),
    decision(VENDOR, 'VendorSelection', {
      briefId: BRIEF,
      briefRevision: 1,
      itemSelectionDecisionId: ITEM,
    }),
    decision(COURIER, 'CourierSelection', {
      briefId: BRIEF,
      briefRevision: 1,
      itemSelectionDecisionId: ITEM,
      vendorSelectionDecisionId: VENDOR,
    }),
  ];
  const events = [
    event('event-dispatch', 'Dispatched', { fulfilmentId: FULFILMENT, attempt: 1 }, T1),
    event('event-delivered', 'Delivered', { fulfilmentId: FULFILMENT, attempt: 1 }, T2),
    ...(includeProof
      ? [event('event-proof', 'ProofReceived', { fulfilmentId: FULFILMENT, attempt: 1, proofKinds: ['Photo'] }, T2)]
      : []),
  ];
  return {
    schemaVersion: 9,
    workspaceId: WS,
    moments: [moment],
    decisions,
    events,
    executionBriefs: [{
      id: BRIEF,
      workspaceId: WS,
      momentId: MOMENT,
      status: 'Confirmed',
      revision: 1,
      recipientSnapshot,
      relationshipGroupSnapshot,
      policyResolutionSnapshot,
      deliveryAddressSnapshot: { line1: '12 Adeola Odeku Street', city: 'Lagos', countryCode: 'NG' },
      addressSource: 'PersonDefault',
      occasionType: 'Birthday',
      targetDate: '2026-07-03',
      approvedBudget: budget,
      constraints: [],
      createdAt: T0,
      confirmedAt: T0,
    }],
    vendors: [],
    vendorOffers: [],
    couriers: [],
    fulfilments: [{
      id: FULFILMENT,
      workspaceId: WS,
      momentId: MOMENT,
      status: 'Delivered',
      attempt: 1,
      briefId: BRIEF,
      briefRevision: 1,
      itemSelectionDecisionId: ITEM,
      vendorSelectionDecisionId: VENDOR,
      courierSelectionDecisionId: COURIER,
      createdAt: T1,
      updatedAt: T2,
    }],
    recognitionOrders: [{
      id: ORDER,
      workspaceId: WS,
      momentId: MOMENT,
      executionBriefId: BRIEF,
      briefRevision: 1,
      itemSelectionDecisionId: ITEM,
      vendorSelectionDecisionId: VENDOR,
      courierSelectionDecisionId: COURIER,
      commercialRole: 'MerchantOfRecord',
      approvedBudget: budget,
      estimatedVendorCost: ngn(34_000),
      estimatedCourierCost: ngn(4_500),
      estimatedCustomerCharge: ngn(62_000),
      actualVendorCost: ngn(33_000),
      actualCourierCost: ngn(4_500),
      actualCustomerCharge: ngn(62_000),
      status: 'Reconciled',
      createdAt: T0,
      updatedAt: T3,
    }],
    memories: [],
    createdAt: T0,
    updatedAt: T3,
  };
}

function closureContext(state: OperationsState): ClosureContext {
  return {
    moment: state.moments[0],
    briefs: state.executionBriefs,
    decisions: state.decisions,
    fulfilments: state.fulfilments,
    orders: state.recognitionOrders,
    events: state.events,
    memories: state.memories,
  };
}

function build(state: OperationsState, now = T3, actorId?: string): ClosureBundle {
  const result = buildMomentClosure({
    ...closureContext(state),
    now,
    ids: { memory: () => 'memory-1', event: () => 'event-closed' },
    ...(actorId ? { actorId } : {}),
  });
  assert(result.ok, `Fixture closure did not build: ${result.ok ? '' : result.reason}`);
  return result.value;
}

function fixture(state = readyState()) {
  const validity = validateOperationsState(state, WS);
  assert(validity.ok, `Fixture state is invalid: ${validity.ok ? '' : validity.reason}`);
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(state) });
  const repo = createLocalOperationsRepository(storage);
  const loaded = repo.load(WS);
  assert(loaded.ok && loaded.value, 'Fixture state could not be read.');
  return { storage, repo, state: loaded.value! };
}

function expectRefused(fx: ReturnType<typeof fixture>, write: unknown, now = T3): string {
  const before = fx.storage.raw(OPERATIONS_KEY);
  const writes = fx.storage.writes.length;
  let result: { ok: boolean; reason?: string };
  try {
    result = fx.repo.commitMomentClosure(WS, write as ClosureBundle, now);
  } catch (error) {
    throw new Error(`Refusal threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!result.ok, 'An invalid closure was accepted.');
  assert(typeof result.reason === 'string' && result.reason.includes('nothing was recorded'), 'Refusal gave no zero-write recovery.');
  assertEqual(fx.storage.writes.length, writes, 'A refused closure still wrote.');
  assertEqual(fx.storage.raw(OPERATIONS_KEY), before, 'Stored bytes changed after refusal.');
  return result.reason!;
}

console.log('\nH3.8 — Confirmation + Memory\n');

check('1. OperationsState is v9 while Workspace remains v7', () => {
  assertEqual(CURRENT_OPERATIONS_SCHEMA_VERSION, 9, 'OperationsState is not v9.');
  assertEqual(CURRENT_WORKSPACE_SCHEMA_VERSION, 7, 'Workspace changed from v7.');
});

check('2. The v8 → v9 rung adds only an empty Memory collection', () => {
  const v8 = { ...readyState(), schemaVersion: 8 } as unknown as Record<string, unknown>;
  delete v8.memories;
  const beforeMoments = JSON.stringify(v8.moments);
  const result = migrateOperationsState(v8);
  assert(result.status === 'migrated', 'A v8 payload did not migrate.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 9, 'Migration did not reach v9.');
  assertEqual(result.state.memories.length, 0, 'Migration invented a Memory.');
  assertEqual(JSON.stringify(result.state.moments), beforeMoments, 'Migration rewrote Moments.');
});

check('3. The v9 rung preserves unknown keys', () => {
  const v8 = { ...readyState(), schemaVersion: 8, futureBoundary: { kept: true } } as unknown as Record<string, unknown>;
  delete v8.memories;
  const result = migrateOperationsState(v8);
  assert(result.status === 'migrated', 'A v8 payload did not migrate.');
  if (result.status !== 'migrated') return;
  assert((result.state as unknown as Record<string, unknown>).futureBoundary !== undefined, 'Unknown keys were dropped.');
});

check('4. A v1 payload walks every rung through v9', () => {
  const result = migrateOperationsState({
    schemaVersion: 1, workspaceId: WS, moments: [], decisions: [], events: [], createdAt: T0, updatedAt: T0,
  });
  assert(result.status === 'migrated', 'A v1 payload did not migrate.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 9, 'The ladder did not reach v9.');
  for (const key of ['executionBriefs', 'vendors', 'vendorOffers', 'couriers', 'fulfilments', 'recognitionOrders', 'memories'] as const) {
    assert(Array.isArray(result.state[key]), `${key} was not added by its rung.`);
  }
});

check('5. A v10 payload is refused', () => {
  assertEqual(migrateOperationsState({ schemaVersion: 10 }).status, 'invalid', 'A future payload was adopted.');
});

check('6. Reading a migrated v8 payload performs no write', () => {
  const v8 = { ...readyState(), schemaVersion: 8 } as unknown as Record<string, unknown>;
  delete v8.memories;
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v8) });
  const repo = createLocalOperationsRepository(storage);
  assert(repo.load(WS).ok, 'The v8 payload could not be read.');
  assert(repo.listMemories(WS).ok, 'Memories could not be listed.');
  assertEqual(storage.writes.length, 0, 'A read persisted the migration.');
});

check('7. A complete ready Moment previews as closable without writing', () => {
  const fx = fixture();
  const writes = fx.storage.writes.length;
  const preview = previewMomentClosure(closureContext(fx.state));
  assertEqual(preview.action, 'close', 'Closure was not offered.');
  assertEqual(preview.blockers.length, 0, 'A valid closure reported blockers.');
  assert(preview.authority !== null, 'Closure authority did not resolve.');
  assertEqual(fx.storage.writes.length, writes, 'Previewing wrote to storage.');
});

check('8. Building a closure writes nothing', () => {
  const fx = fixture();
  const writes = fx.storage.writes.length;
  build(fx.state);
  assertEqual(fx.storage.writes.length, writes, 'Building wrote to storage.');
});

check('9. Proof is required only by the frozen snapshot', () => {
  const required = previewMomentClosure(closureContext(readyState(true, false)));
  assert(required.blockers.some(value => value.code === 'proof-required'), 'Missing required proof did not block.');
  const optional = previewMomentClosure(closureContext(readyState(false, false)));
  assertEqual(optional.action, 'close', 'Proof was required when the frozen snapshot says false.');
});

check('10. A legacy delivered Fulfilment without an order cannot close', () => {
  const state = readyState();
  state.recognitionOrders = [];
  const preview = previewMomentClosure(closureContext(state));
  assert(preview.blockers.some(value => value.code === 'legacy-fulfilment'), 'Legacy limitation was hidden.');
});

check('11. Cancelled and NeedsReview Moments cannot close', () => {
  for (const status of ['Cancelled', 'NeedsReview'] as const) {
    const state = readyState();
    state.moments[0].status = status;
    assertEqual(previewMomentClosure(closureContext(state)).action, 'none', `${status} was closable.`);
  }
});

check('12. A non-delivered Fulfilment cannot close', () => {
  const state = readyState();
  state.fulfilments[0].status = 'Dispatched';
  state.events = state.events.filter(value => value.eventType !== 'Delivered' && value.eventType !== 'ProofReceived');
  assert(previewMomentClosure(closureContext(state)).blockers.some(value => value.code === 'not-delivered'), 'Undelivered state was closable.');
});

check('13. A committed but unreconciled order cannot close', () => {
  const state = readyState();
  const order = state.recognitionOrders[0];
  order.status = 'Committed';
  delete order.actualVendorCost;
  delete order.actualCourierCost;
  delete order.actualCustomerCharge;
  assert(previewMomentClosure(closureContext(state)).blockers.some(value => value.code === 'order-not-reconciled'), 'Unreconciled order was closable.');
});

check('14. A missing frozen delivery snapshot is never defaulted', () => {
  const state = readyState();
  delete state.executionBriefs[0].policyResolutionSnapshot.proofRequired;
  assert(previewMomentClosure(closureContext(state)).blockers.some(value => value.code === 'delivery-policy-unrecorded'), 'Missing policy was defaulted.');
});

check('15. Authority disagreement blocks closure', () => {
  const state = readyState();
  state.recognitionOrders[0].itemSelectionDecisionId = 'another-selection';
  assert(previewMomentClosure(closureContext(state)).blockers.some(value => value.code === 'authority-disagrees'), 'Broken authority was accepted.');
});

check('16. Failed-delivery history does not block a later delivered state', () => {
  const state = readyState();
  state.fulfilments[0].attempt = 2;
  state.events = [
    event('d1', 'Dispatched', { fulfilmentId: FULFILMENT, attempt: 1 }, T0),
    event('f1', 'DeliveryFailed', { fulfilmentId: FULFILMENT, attempt: 1 }, T1),
    event('d2', 'Dispatched', { fulfilmentId: FULFILMENT, attempt: 2 }, T1),
    event('ok', 'Delivered', { fulfilmentId: FULFILMENT, attempt: 2 }, T2),
    event('proof2', 'ProofReceived', { fulfilmentId: FULFILMENT, attempt: 2, proofKinds: ['Photo'] }, T2),
  ];
  assertEqual(previewMomentClosure(closureContext(state)).action, 'close', 'A recovered delivery could not close.');
});

check('17. Memory has exactly eleven canonical fields when actor id is present', () => {
  const memory = build(readyState(), T3, 'operator-1').memory as unknown as Record<string, unknown>;
  assertEqual(Object.keys(memory).length, 11, 'Memory does not have eleven fields.');
  assert(MEMORY_REQUIRED_KEYS.every(key => key in memory), 'A required Memory key is absent.');
  assert(MEMORY_OPTIONAL_KEYS.every(key => key in memory), 'The supplied actor id was dropped.');
});

check('18. Memory outcome and date come from the Delivered event', () => {
  const memory = build(readyState()).memory;
  assertEqual(memory.outcome, 'Delivered', 'Outcome changed.');
  assertEqual(memory.outcomeDate, T2.slice(0, 10), 'Outcome date did not come from delivery.');
  assertEqual(MEMORY_OUTCOMES.join(','), 'Delivered', 'A speculative Memory outcome was added.');
});

check('19. MomentClosed has the exact six-key payload and one timestamp', () => {
  const bundle = build(readyState());
  assertEqual(Object.keys(bundle.event.payload).length, 6, 'Closure payload is not six keys.');
  assert(MOMENT_CLOSED_PAYLOAD_KEYS.every(key => key in bundle.event.payload), 'A closure payload key is absent.');
  assertEqual(bundle.event.occurredAt, bundle.event.recordedAt, 'Event timestamps differ.');
  assertEqual(bundle.event.occurredAt, bundle.memory.createdAt, 'Memory and Event timestamps differ.');
});

check('20. Closure creates no Decision and adds no Decision type', () => {
  const bundle = build(readyState()) as unknown as Record<string, unknown>;
  assert(!('decision' in bundle), 'Closure submitted a Decision.');
  for (const type of ['MomentClosure', 'MemoryWritten', 'RecipientConfirmation']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(type), `${type} was added.`);
  }
});

check('21. One confirmation performs one storage write', () => {
  const fx = fixture();
  const result = fx.repo.commitMomentClosure(WS, build(fx.state), T3);
  assert(result.ok, `Closure was refused: ${result.ok ? '' : result.reason}`);
  assertEqual(fx.storage.writes.length, 1, 'Closure was not one write.');
});

check('22. One confirmation closes the Moment, creates one Memory and appends one Event', () => {
  const fx = fixture();
  const beforeDecisions = JSON.stringify(fx.state.decisions);
  assert(fx.repo.commitMomentClosure(WS, build(fx.state), T3).ok, 'Closure failed.');
  const loaded = fx.repo.load(WS);
  assert(loaded.ok && loaded.value, 'Closed state unreadable.');
  assertEqual(loaded.value!.moments[0].status, 'Closed', 'Moment did not close.');
  assertEqual(loaded.value!.memories.length, 1, 'Memory count is not one.');
  assertEqual(loaded.value!.events.filter(value => value.eventType === 'MomentClosed').length, 1, 'Closure Event count is not one.');
  assertEqual(JSON.stringify(loaded.value!.decisions), beforeDecisions, 'Closure changed Decisions.');
});

check('23. Directly setting Closed is refused with zero writes', () => {
  const fx = fixture();
  const result = fx.repo.updateMomentStatus(WS, MOMENT, 'Closed', T3);
  assert(!result.ok, 'A generic setter closed the Moment.');
  assertEqual(fx.storage.writes.length, 0, 'The generic setter wrote.');
});

check('24. A Closed Moment cannot be cancelled or reopened', () => {
  const fx = fixture();
  assert(fx.repo.commitMomentClosure(WS, build(fx.state), T3).ok, 'Closure failed.');
  const writes = fx.storage.writes.length;
  for (const status of ['Cancelled', 'ReadyForExecution', 'NeedsReview'] as const) {
    assert(!fx.repo.updateMomentStatus(WS, MOMENT, status, T3).ok, `Closed → ${status} was accepted.`);
  }
  assertEqual(fx.storage.writes.length, writes, 'A forbidden transition wrote.');
});

check('25. A duplicate closure is refused byte-identically', () => {
  const fx = fixture();
  const bundle = build(fx.state);
  assert(fx.repo.commitMomentClosure(WS, bundle, T3).ok, 'First closure failed.');
  expectRefused(fx, bundle);
});

check('26. Null, arrays and primitives refuse without throwing or writing', () => {
  for (const value of [null, [], 'closure', 1, true]) expectRefused(fixture(), value);
});

check('27. Extra top-level, Memory, Event and payload keys are refused', () => {
  const mutations = [
    (bundle: ClosureBundle) => ({ ...bundle, decision: {} }),
    (bundle: ClosureBundle) => ({ ...bundle, memory: { ...bundle.memory, summary: 'unsafe' } }),
    (bundle: ClosureBundle) => ({ ...bundle, event: { ...bundle.event, note: 'unsafe' } }),
    (bundle: ClosureBundle) => ({ ...bundle, event: { ...bundle.event, payload: { ...bundle.event.payload, margin: 1 } } }),
  ];
  for (const mutate of mutations) {
    const fx = fixture();
    expectRefused(fx, mutate(build(fx.state)));
  }
});

check('28. Missing canonical keys are refused', () => {
  const fx = fixture();
  const bundle = build(fx.state);
  const memory = clone(bundle.memory) as unknown as Record<string, unknown>;
  delete memory.outcomeDate;
  expectRefused(fx, { ...bundle, memory });
});

check('29. Stale status is refused byte-identically at confirmation', () => {
  const fx = fixture();
  const bundle = build(fx.state);
  assert(fx.repo.updateMomentStatus(WS, MOMENT, 'Cancelled', T3, { cancelledAt: T3 }).ok, 'Fixture could not become stale.');
  expectRefused(fx, bundle);
});

check('30. Cross-workspace submissions are refused', () => {
  const fx = fixture();
  const bundle = build(fx.state);
  const foreign = { ...bundle, memory: { ...bundle.memory, workspaceId: OTHER_WS } };
  expectRefused(fx, foreign);
});

check('31. A missing required ProofReceived event refuses at commit', () => {
  const fx = fixture(readyState(true, false));
  const fake = build(readyState(true, true));
  expectRefused(fx, fake);
});

check('32. Submitted outcome, date, actor and timestamps are recomputed', () => {
  const mutations = [
    (bundle: ClosureBundle) => ({ ...bundle, memory: { ...bundle.memory, outcomeDate: '2026-01-01' } }),
    (bundle: ClosureBundle) => ({ ...bundle, memory: { ...bundle.memory, createdByActorType: 'Customer' } }),
    (bundle: ClosureBundle) => ({ ...bundle, event: { ...bundle.event, occurredAt: T2 } }),
    (bundle: ClosureBundle) => ({ ...bundle, event: { ...bundle.event, payload: { ...bundle.event.payload, outcome: 'Failed' } } }),
  ];
  for (const mutate of mutations) {
    const fx = fixture();
    expectRefused(fx, mutate(build(fx.state)));
  }
});

check('33. The direct verifier is independently shape-safe', () => {
  const state = readyState();
  const result = verifyMomentClosure({ ...closureContext(state), workspaceId: WS, write: null, now: T3 });
  assert(!result.ok, 'Direct verifier accepted null.');
});

function closedState(): OperationsState {
  const fx = fixture();
  assert(fx.repo.commitMomentClosure(WS, build(fx.state), T3).ok, 'Closure fixture failed.');
  const loaded = fx.repo.load(WS);
  assert(loaded.ok && loaded.value, 'Closed fixture unreadable.');
  return loaded.value!;
}

check('34. The safe projection has exactly nine required keys', () => {
  const state = closedState();
  const projected = projectRecipientTimelineEntry(state, state.memories[0]);
  assert(projected.ok, `Projection failed: ${projected.ok ? '' : projected.reason}`);
  assertEqual(Object.keys(projected.value).length, 9, 'Projection is not nine keys.');
  for (const key of ['entryId', 'recipientFirstName', 'recipientLastName', 'occasion', 'plannedDate', 'outcomeDate', 'outcome', 'giftCategory', 'summary']) {
    assert(key in projected.value, `${key} is absent from the projection.`);
  }
});

check('35. The projection excludes every named internal and commercial field', () => {
  const state = closedState();
  const projected = projectRecipientTimelineEntry(state, state.memories[0]);
  assert(projected.ok, 'Projection failed.');
  const record = projected.value as unknown as Record<string, unknown>;
  for (const key of [
    'workspaceId', 'momentId', 'personId', 'fulfilmentId', 'recognitionOrderId',
    'vendor', 'courier', 'cost', 'margin', 'commercialRole', 'address', 'phone',
    'email', 'proofKinds', 'notes', 'decisionReason', 'status',
  ]) {
    assert(!(key in record), `${key} leaked into the projection.`);
  }
});

check('36. Gift category resolves through the order’s immutable selection id', () => {
  const state = closedState();
  state.decisions.find(value => value.id === ITEM)!.status = 'Superseded';
  state.decisions.push(decision('decision-new-live', 'ItemSelection', {
    selectedItem: { category: 'Wrong live category' },
  }));
  const projected = projectRecipientTimelineEntry(state, state.memories[0]);
  assert(projected.ok, 'Projection failed.');
  assertEqual(projected.value.giftCategory, 'Home & Living', 'Projection followed the live selection instead of the order reference.');
});

check('37. Summary is derived and never persisted on Memory', () => {
  const state = closedState();
  const projected = projectRecipientTimelineEntry(state, state.memories[0]);
  assert(projected.ok, 'Projection failed.');
  assert(projected.value.summary.includes('Ada Obi'), 'Summary omitted the safe recipient name.');
  assert(projected.value.summary.includes('Home & Living'), 'Summary omitted the safe category.');
  assert(!('summary' in (state.memories[0] as unknown as Record<string, unknown>)), 'Summary was persisted.');
});

check('38. Timeline reads only Memories for the requested person', () => {
  const state = closedState();
  assertEqual(projectRecipientTimeline(state, PERSON).ok, true, 'The recipient timeline failed.');
  const other = projectRecipientTimeline(state, 'another-person');
  assert(other.ok && other.value.length === 0, 'Another person received this Memory.');
});

check('39. Structural validation rejects a Memory without its complete closure bundle', () => {
  const state = readyState();
  state.memories.push(build(state).memory);
  assert(!validateOperationsState(state, WS).ok, 'An orphan Memory was accepted.');
});

check('40. Structural validation rejects duplicate Memories', () => {
  const state = closedState();
  state.memories.push({ ...clone(state.memories[0]), id: 'memory-2' });
  assert(!validateOperationsState(state, WS).ok, 'Two Memories for one Moment were accepted.');
});

check('41. Structural validation rejects a silent Memory correction', () => {
  const state = closedState();
  state.memories[0].outcomeDate = '2026-01-01';
  assert(!validateOperationsState(state, WS).ok, 'A rewritten Memory date was accepted.');
});

check('42. Structural validation rejects a Closed Moment with no Memory', () => {
  const state = closedState();
  state.memories = [];
  assert(!validateOperationsState(state, WS).ok, 'A partial closure bundle was accepted.');
});

check('43. Closed and MomentClosed are canonical; Fulfilled is absent', () => {
  assertEqual(MOMENT_STATUSES.length, 4, 'Moment status count is wrong.');
  assert((MOMENT_STATUSES as readonly string[]).includes('Closed'), 'Closed is absent.');
  assert(!(MOMENT_STATUSES as readonly string[]).includes('Fulfilled'), 'Fulfilled was added.');
  assert((EVENT_TYPES as readonly string[]).includes('MomentClosed'), 'MomentClosed is absent.');
});

check('44. The two H3.8 routes have exact Operations titles', () => {
  assertEqual(titleFor('/operations/moments/m-1/close'), 'Close the moment', 'Close route title is wrong.');
  assertEqual(titleFor('/operations/timeline/p-1'), 'Relationship timeline', 'Timeline route title is wrong.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'Moment title regressed.');
});

check('45. The repository exposes no Memory mutation or delete operation', () => {
  const repo = createLocalOperationsRepository(createMemoryStorage());
  const methods = repo as unknown as Record<string, unknown>;
  for (const key of ['updateMemory', 'correctMemory', 'deleteMemory', 'reopenMoment']) {
    assert(!(key in methods), `${key} was introduced.`);
  }
});

check('46. A closed preview offers no second action', () => {
  const state = closedState();
  const preview = previewMomentClosure(closureContext(state));
  assertEqual(preview.action, 'closed', 'Closed Moment did not remain terminal.');
  assertEqual(preview.blockers.length, 0, 'Closed state reported a new write action.');
});

check('47. Stored closed state passes the full structural gate', () => {
  const state = closedState();
  const valid = validateOperationsState(state, WS);
  assert(valid.ok, `Closed state is invalid: ${valid.ok ? '' : valid.reason}`);
});

check('48. Memory references are internal; personal and commercial copies are absent', () => {
  const memory = build(readyState()).memory as unknown as Record<string, unknown>;
  for (const key of ['occasion', 'targetDate', 'recipientFirstName', 'recipientLastName', 'giftCategory', 'summary', 'cost', 'margin', 'commercialRole']) {
    assert(!(key in memory), `${key} was copied into Memory.`);
  }
  for (const key of ['momentId', 'personId', 'fulfilmentId', 'recognitionOrderId']) {
    assert(key in memory, `${key} reference is absent.`);
  }
});

if (failures.length > 0) {
  console.log(`\n${passed} passed, ${failures.length} failed.\n`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} checks passed.\n`);
}
