/**
 * Deterministic validation for H3.8 — Moment closure and Memory.
 *
 * Run with:  npm run validate:closure
 *
 * Covers ADR-014: `Closed` as the exact fourth Moment status entered only from
 * `ReadyForExecution` and irreversible; the eleven-field `Memory`; the single
 * `MomentClosed` Event and the exact six-key payload it carries; closure
 * writing **no Decision** (ADR-006's judgement test, as ADR-012 already
 * applied it); the additive OperationsState v8 → v9 migration; the closure
 * prerequisites (confirmed brief, three live selections, a Fulfilment that
 * replays to `Delivered`, a `Reconciled` RecognitionOrder, and — only when
 * promised — recorded proof); and the repository trust boundary with the
 * runtime-container discipline H3.3-D1 through H3.7 established.
 *
 * Storage is injected, so "writes nothing" is proven by inspecting the write
 * log rather than asserted in prose.
 */

import { createWorkspace } from '../lib/workspace';
import type {
  Money, PolicyAssignment, Person, Program, RecognitionPolicy, RelationshipClass,
} from '../lib/workspace';
import { createCampaignDraft } from '../lib/programs';
import type { CatalogItem } from '../lib/catalog';
import {
  CURRENT_OPERATIONS_SCHEMA_VERSION,
  DECISION_TYPES,
  EVENT_TYPES,
  FORBIDDEN_MEMORY_FIELDS,
  MEMORY_OUTCOMES,
  MOMENT_CLOSED_PAYLOAD_KEYS,
  MOMENT_STATUSES,
  OPERATIONS_KEY,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type { Memory, Moment, OperationalEvent } from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import type { GenerationContext } from '../lib/operations/generation';
import { buildMomentBatch } from '../lib/operations/generation';
import { buildBriefConfirmation } from '../lib/operations/briefs';
import { buildItemSelection } from '../lib/operations/selection';
import { buildVendor, validateVendorDraft } from '../lib/operations/vendors';
import { buildVendorSelection } from '../lib/operations/vendor-selection';
import type { NormalizedOffer } from '../lib/operations/vendor-selection';
import { buildCourier, validateCourierDraft } from '../lib/operations/couriers';
import type { CourierDraft } from '../lib/operations/couriers';
import { buildCourierSelection } from '../lib/operations/courier-selection';
import { buildOrderCommitment, buildReconciliation } from '../lib/operations/recognition-order';
import {
  buildDelivery,
  buildInitialDispatch,
  buildProofReceipt,
} from '../lib/operations/fulfilment';
import {
  buildMomentClosure,
  previewClosure,
  verifyClosureWrite,
} from '../lib/operations/closure';
import { titleFor } from '../lib/operations/routes';

// ─── Harness ─────────────────────────────────────────────────────────────────

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

function createMemoryStorage(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  const writes: string[] = [];
  return {
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => { writes.push(key); data.set(key, value); },
    writes,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const T0 = '2026-07-01T00:00:00.000Z';
const NOW = '2026-08-01T00:00:00.000Z';
const T1 = '2026-08-02T00:00:00.000Z';
const T2 = '2026-08-03T00:00:00.000Z';
const T3 = '2026-08-04T00:00:00.000Z';
const QUOTED = '2026-07-28T00:00:00.000Z';
const WS = 'org-1';

let n = 0;
const ids = {
  moment: () => `moment-${++n}`,
  decision: () => `decision-${++n}`,
  event: () => `event-${++n}`,
  brief: () => `brief-${++n}`,
  offer: () => `offer-${++n}`,
  fulfilment: () => `fulfilment-${++n}`,
  order: () => `order-${++n}`,
  memory: () => `memory-${++n}`,
};

function ngn(major: number): Money { return { amountMinor: major * 100, currency: 'NGN' }; }

function freshWorkspace() {
  return createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
}

const BUDGET = ngn(50_000);
const ITEM: CatalogItem = {
  id: 'fx-item', name: 'Hand-thrown ceramic set', description: '',
  category: 'Home & Living', isActive: true, price: ngn(38_000),
};
const FIXTURE_ITEMS: readonly CatalogItem[] = [ITEM];
const ADDRESS = { line1: '12 Adeola Odeku Street', city: 'Lagos', countryCode: 'NG' };

function cls(): RelationshipClass {
  return { id: 'class-exec', name: 'Executive Leadership', type: 'Employee', level: 0, description: '', isDefault: false, isActive: true, createdAt: T0, updatedAt: T0 };
}
function policy(proofRequired = true): RecognitionPolicy {
  return {
    id: 'policy-global', workspaceId: WS, name: 'Global Recognition', description: '',
    recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: BUDGET, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Courier', preferredDeliveryWindow: 'Weekday mornings',
    signatureRequired: true, proofRequired,
    reportingCadence: 'None', status: 'Published', version: 4,
    createdAt: T0, updatedAt: T0, publishedAt: T0,
  };
}
function assignment(): PolicyAssignment {
  return { id: 'a-global', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: 0, isActive: true, createdAt: T0, updatedAt: T0 };
}
function person(over: Partial<Person> & { id: string }): Person {
  return {
    firstName: 'Ada', lastName: 'Obi', relationshipClassIds: ['class-exec'],
    sourceId: 'source-1', sourceType: 'Manual', status: 'Active', country: 'NG',
    deliveryAddress: ADDRESS, createdAt: T0, updatedAt: T0, ...over,
  };
}
function activeCampaign(personIds: string[]): Program {
  const draft = createCampaignDraft(
    { name: 'December appreciation', relationshipClassId: 'class-exec', occasionType: 'Birthday',
      campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20', budgetEnvelopes: [ngn(1_000_000)] },
    T0, 'program-1',
  );
  return { ...draft, status: 'Active', activatedAt: T0, frozenPopulation: { personIds, frozenAt: T0 } };
}
function context(people: Person[], p: RecognitionPolicy): GenerationContext {
  return {
    workspaceId: WS, program: activeCampaign(people.map(x => x.id)), people,
    classes: [cls()], assignments: [assignment()], policies: [p],
    existingSourceKeys: new Map(), now: NOW,
  };
}

function courierRecord(id: string) {
  const checked = validateCourierDraft({
    name: `Courier ${id}`, countryCode: 'ng', whatsapp: '+234 801 234 5678', email: '', note: '',
  } as CourierDraft);
  assert(checked.ok, 'Fixture courier draft is invalid.');
  return buildCourier(checked.value, id, WS, T0);
}
function vendorRecord(id: string) {
  const checked = validateVendorDraft({
    name: `Vendor ${id}`, countryCode: 'NG', city: 'Lagos',
    whatsapp: '+234 802 000 0000', email: '', note: '',
  });
  assert(checked.ok, 'Fixture vendor draft is invalid.');
  return buildVendor(checked.value, id, WS, T0);
}

/**
 * A workspace carrying one Moment, walked all the way to a `Reconciled`
 * RecognitionOrder over a `Delivered` Fulfilment — the only state closure may
 * ever be confirmed from. `proofRequired` controls whether the fixture also
 * records proof, so both the gated and ungated paths are exercisable.
 */
function deliveredAndReconciled(opts: { proofRequired?: boolean; recordProof?: boolean } = {}) {
  const proofRequired = opts.proofRequired ?? true;
  const recordProof = opts.recordProof ?? proofRequired;

  const p = person({ id: 'p1' });
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage, { catalog: FIXTURE_ITEMS });
  repo.initialise(WS, NOW);

  const batch = buildMomentBatch(context([p], policy(proofRequired)), ids, 'operator-1');
  const created = repo.createMoments(WS, batch, NOW);
  assert(created.ok, `Fixture failed to create moments: ${created.ok ? '' : created.reason}`);
  const moment = batch.moments[0];

  const builtBrief = buildBriefConfirmation({ moment, person: p, now: NOW, ids, actorId: 'operator-1' });
  assert(builtBrief.ok, 'Fixture failed to build a brief.');
  assert(repo.commitBrief(WS, builtBrief.value, NOW).ok, 'Fixture failed to commit a brief.');
  const brief = builtBrief.value.brief;

  const s0 = repo.load(WS);
  assert(s0.ok && s0.value, 'Fixture state unreadable.');
  const builtItem = buildItemSelection({
    moment, brief, decisions: s0.value!.decisions.filter(d => d.momentId === moment.id),
    items: FIXTURE_ITEMS, selectedItemId: ITEM.id, reason: 'It suits her.',
    now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtItem.ok, 'Fixture failed to choose an item.');
  assert(repo.commitItemSelection(WS, builtItem.value, NOW).ok, 'Fixture failed to commit an item selection.');

  const vendor = vendorRecord('v1');
  assert(repo.createVendor(WS, vendor, NOW).ok, 'Fixture failed to add a vendor.');

  const s1 = repo.load(WS);
  assert(s1.ok && s1.value, 'Fixture state unreadable.');
  const offers: NormalizedOffer[] = [{
    vendor, quotedVendorCost: ngn(34_000), source: 'WhatsApp', quotedAt: QUOTED, leadTimeDays: 3,
  }];
  const builtVendor = buildVendorSelection({
    moment, brief, decisions: s1.value!.decisions.filter(d => d.momentId === moment.id),
    vendors: [vendor], offers, selectedIndex: 0, reason: 'Only one asked.',
    now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtVendor.ok, 'Fixture failed to choose a vendor.');
  assert(repo.commitVendorSelection(WS, builtVendor.value, NOW).ok, 'Fixture failed to commit a vendor selection.');

  const courier = courierRecord('c1');
  assert(repo.createCourier(WS, courier, NOW).ok, 'Fixture failed to add a courier.');

  const s2 = repo.load(WS);
  assert(s2.ok && s2.value, 'Fixture state unreadable.');
  const builtCourier = buildCourierSelection({
    moment, brief, decisions: s2.value!.decisions.filter(d => d.momentId === moment.id),
    couriers: [courier],
    quote: { courier, quotedCourierCost: ngn(4_500), source: 'WhatsApp', quotedAt: QUOTED, leadTimeDays: 2 },
    reason: 'Same-day from the vendor.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtCourier.ok, `Fixture failed to choose a courier: ${builtCourier.ok ? '' : builtCourier.reason}`);
  assert(repo.commitCourierSelection(WS, builtCourier.value, NOW).ok, 'Fixture failed to commit a courier selection.');

  const s3 = repo.load(WS);
  assert(s3.ok && s3.value, 'Fixture state unreadable.');
  const builtOrder = buildOrderCommitment({
    moment, brief,
    decisions: s3.value!.decisions.filter(d => d.momentId === moment.id),
    orders: [], fulfilments: [],
    quotation: { estimatedCustomerCharge: ngn(62_000), reason: 'Agreed rate for this programme.' },
    now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtOrder.ok, `Fixture failed to commit an order: ${builtOrder.ok ? '' : builtOrder.reason}`);
  assert(repo.commitRecognitionOrder(WS, builtOrder.value, NOW).ok, 'Fixture failed to store the order.');

  const s4 = repo.load(WS);
  assert(s4.ok && s4.value, 'Fixture state unreadable.');
  const dispatchBundle = buildInitialDispatch({
    moment, brief, decisions: s4.value!.decisions.filter(d => d.momentId === moment.id),
    fulfilments: [], events: [], orders: s4.value!.recognitionOrders,
    now: T1, ids, actorId: 'operator-1',
  });
  assert(dispatchBundle.ok, `Fixture failed to dispatch: ${dispatchBundle.ok ? '' : dispatchBundle.reason}`);
  assert(repo.commitInitialDispatch(WS, dispatchBundle.value, T1).ok, 'Fixture failed to store dispatch.');

  const s5 = repo.load(WS);
  assert(s5.ok && s5.value, 'Fixture state unreadable.');
  const deliverBundle = buildDelivery({
    moment, brief, decisions: s5.value!.decisions.filter(d => d.momentId === moment.id),
    fulfilments: s5.value!.fulfilments, events: s5.value!.events, orders: s5.value!.recognitionOrders,
    now: T2, ids, actorId: 'operator-1',
  });
  assert(deliverBundle.ok, `Fixture failed to deliver: ${deliverBundle.ok ? '' : deliverBundle.reason}`);
  assert(repo.commitDelivery(WS, deliverBundle.value, T2).ok, 'Fixture failed to store delivery.');

  if (recordProof) {
    const s6 = repo.load(WS);
    assert(s6.ok && s6.value, 'Fixture state unreadable.');
    const proofBundle = buildProofReceipt({
      moment, brief, decisions: s6.value!.decisions.filter(d => d.momentId === moment.id),
      fulfilments: s6.value!.fulfilments, events: s6.value!.events, orders: s6.value!.recognitionOrders,
      kinds: ['Photo', 'Signature'], source: 'WhatsApp', now: T2, ids, actorId: 'operator-1',
    });
    assert(proofBundle.ok, `Fixture failed to record proof: ${proofBundle.ok ? '' : proofBundle.reason}`);
    assert(repo.commitProofReceipt(WS, proofBundle.value, T2).ok, 'Fixture failed to store proof.');
  }

  const s7 = repo.load(WS);
  assert(s7.ok && s7.value, 'Fixture state unreadable.');
  const reconciliation = buildReconciliation({
    moment, brief, decisions: s7.value!.decisions.filter(d => d.momentId === moment.id),
    orders: s7.value!.recognitionOrders, fulfilments: s7.value!.fulfilments,
    actuals: {
      actualVendorCost: ngn(34_000), actualCourierCost: ngn(4_500), actualCustomerCharge: ngn(62_000),
      reason: 'Invoices arrived exactly as quoted.',
    },
    now: T2, ids, actorId: 'operator-1',
  });
  assert(reconciliation.ok, `Fixture failed to reconcile: ${reconciliation.ok ? '' : reconciliation.reason}`);
  assert(repo.reconcileRecognitionOrder(WS, reconciliation.value, T2).ok, 'Fixture failed to store reconciliation.');

  return { repo, storage, moment, brief, vendor, courier };
}

type Fx = ReturnType<typeof deliveredAndReconciled>;

/** The live context, re-read, exactly as a screen would. */
function ctx(fx: Fx) {
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const s = state.value!;
  return {
    moment: s.moments.find(m => m.id === fx.moment.id)!,
    brief: s.executionBriefs.find(b => b.momentId === fx.moment.id && b.status === 'Confirmed') ?? null,
    decisions: s.decisions.filter(d => d.momentId === fx.moment.id),
    fulfilments: s.fulfilments,
    events: s.events.filter(e => e.momentId === fx.moment.id),
    orders: s.recognitionOrders,
    memories: s.memories,
  };
}

function closeBundle(fx: Fx, now = T3) {
  const built = buildMomentClosure({ ...ctx(fx), now, ids, actorId: 'operator-1' });
  assert(built.ok, `Closure bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function commitClosure(fx: Fx, now = T3) {
  const bundle = closeBundle(fx, now);
  const written = fx.repo.commitMomentClosure(WS, bundle, now);
  assert(written.ok, `Closure was refused: ${written.ok ? '' : written.reason}`);
  return { bundle, moment: written.value };
}

/** Submit, expect refusal, and prove **nothing moved**. */
function expectRefused(fx: Fx, write: unknown, what: string, now = T3): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const prior = {
    moments: JSON.stringify(before.value!.moments),
    memories: JSON.stringify(before.value!.memories),
    events: JSON.stringify(before.value!.events),
  };
  const priorWrites = fx.storage.writes.length;

  let written: { ok: boolean; reason?: string };
  try {
    written = fx.repo.commitMomentClosure(WS, write as never, now);
  } catch (error) {
    throw new Error(`${what} threw instead of refusing: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!written.ok, `${what} was accepted.`);
  assert(typeof written.reason === 'string' && written.reason.length > 0, `${what} was refused with no reason.`);

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable after refusal.');
  assertEqual(JSON.stringify(after.value!.moments), prior.moments, `${what}: moments changed.`);
  assertEqual(JSON.stringify(after.value!.memories), prior.memories, `${what}: memories changed.`);
  assertEqual(JSON.stringify(after.value!.events), prior.events, `${what}: events changed.`);
  assertEqual(fx.storage.writes.length, priorWrites, `${what}: storage was written to.`);
}

// ═══════════════════════════════════════════════════════════════════════════

console.log('\nH3.8 — Moment closure and Memory\n');

// ─── Part 1: persistence and migration ───────────────────────────────────────

check('1. The operations schema is at v9, and Workspace is untouched by it', () => {
  assertEqual(CURRENT_OPERATIONS_SCHEMA_VERSION, 9, 'Operations schema is not at v9.');
  const fresh = freshWorkspace() as unknown as Record<string, unknown>;
  for (const key of ['memories', 'memory', 'MomentClosed']) {
    assert(!(key in fresh), `${key} reached WorkspaceState.`);
  }
});

check('2. The v8 → v9 rung adds only an empty memory collection', () => {
  const v8 = {
    schemaVersion: 8, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    executionBriefs: [{ id: 'b-old' }], vendors: [{ id: 'v-old' }], vendorOffers: [{ id: 'o-old' }],
    couriers: [{ id: 'c-old' }], fulfilments: [{ id: 'f-old' }], recognitionOrders: [{ id: 'r-old' }],
    createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const before = JSON.stringify(v8);
  const result = migrateOperationsState(JSON.parse(before));
  assert(result.status === 'migrated', 'A v8 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 9, 'The migration did not reach v9.');
  assert(Array.isArray(result.state.memories), 'The v8 → v9 rung did not add memories.');
  assertEqual(result.state.memories.length, 0, 'The migration invented a memory.');

  const original = JSON.parse(before) as Record<string, unknown>;
  for (const k of [
    'moments', 'decisions', 'events', 'executionBriefs', 'vendors', 'vendorOffers',
    'couriers', 'fulfilments', 'recognitionOrders',
  ] as const) {
    assertEqual(
      JSON.stringify((result.state as unknown as Record<string, unknown>)[k]),
      JSON.stringify(original[k]),
      `${k} were altered by the v8 → v9 rung.`,
    );
  }
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('3. A v1 payload walks every rung to current without losing history', () => {
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'Migration did not reach current.');
  assert(Array.isArray(result.state.memories), 'The rung adding memories did not run.');
  assertEqual(result.state.moments.length, 1, 'A moment was lost in migration.');
  assertEqual(result.state.memories.length, 0, 'The migration invented a memory.');
  assertEqual(
    (result.state.moments[0] as unknown as Moment).status,
    (v1.moments[0] as unknown as { status?: string }).status,
    'A legacy moment was rewritten to Closed.',
  );
});

check('4. Migration never closes a delivered-and-reconciled moment', () => {
  // The dangerous case: a legacy payload whose Moment reads ReadyForExecution
  // with a Fulfilment already Delivered and an order already Reconciled — the
  // exact state closure would accept. Migration must still invent nothing.
  const legacy = {
    schemaVersion: 8, workspaceId: WS,
    moments: [{ id: 'm-1', sourceKey: 'k', status: 'ReadyForExecution' }],
    decisions: [], events: [],
    executionBriefs: [], vendors: [], vendorOffers: [], couriers: [],
    fulfilments: [{ id: 'f-1', momentId: 'm-1', status: 'Delivered', attempt: 1 }],
    recognitionOrders: [{ id: 'r-1', momentId: 'm-1', status: 'Reconciled' }],
    createdAt: T0, updatedAt: T0,
  };
  const result = migrateOperationsState(legacy);
  assert(result.status === 'migrated', 'A legacy payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.memories.length, 0, 'The migration invented a memory.');
  assertEqual(result.state.moments[0].status, 'ReadyForExecution', 'The migration closed a moment.');
});

check('5. A payload newer than this build understands is refused rather than downgraded', () => {
  const future = {
    schemaVersion: CURRENT_OPERATIONS_SCHEMA_VERSION + 1, workspaceId: WS, moments: [], decisions: [], events: [],
  };
  assertEqual(migrateOperationsState(future).status, 'invalid', 'A future version was adopted.');
});

check('6. Reads never rewrite storage', () => {
  const v8 = {
    schemaVersion: 8, workspaceId: WS, moments: [], decisions: [], events: [],
    executionBriefs: [], vendors: [], vendorOffers: [], couriers: [], fulfilments: [], recognitionOrders: [],
    createdAt: T0, updatedAt: T0,
  };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v8) });
  const repo = createLocalOperationsRepository(storage);
  assert(repo.load(WS).ok, 'A v8 payload could not be read.');
  assert(repo.listMemories(WS).ok, 'Memories could not be listed.');
  assert(repo.findMemoryForMoment(WS, 'm-1').ok, 'A memory lookup failed.');
  assertEqual(storage.writes.length, 0, 'A read rewrote storage.');
});

// ─── Part 2: declared surface ─────────────────────────────────────────────────

check('7. MOMENT_STATUSES gains exactly Closed, entered only from ReadyForExecution', () => {
  assertEqual(MOMENT_STATUSES.length, 4, 'MOMENT_STATUSES changed length.');
  for (const s of ['NeedsReview', 'ReadyForExecution', 'Cancelled', 'Closed']) {
    assert((MOMENT_STATUSES as readonly string[]).includes(s), `${s} is missing.`);
  }
  for (const s of ['Fulfilled', 'Missed', 'Archived']) {
    assert(!(MOMENT_STATUSES as readonly string[]).includes(s), `${s} was added to MOMENT_STATUSES.`);
  }
});

check('8. `MomentClosed` is declared; closure introduces no Decision type', () => {
  assert((EVENT_TYPES as readonly string[]).includes('MomentClosed'), 'MomentClosed is not declared.');
  for (const t of ['MomentClosure', 'MemoryWritten', 'RecipientConfirmation']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} was added — closure records no Decision.`);
  }
});

check('9. MEMORY_OUTCOMES contains exactly Delivered', () => {
  assertEqual(MEMORY_OUTCOMES.length, 1, 'MEMORY_OUTCOMES changed length.');
  assertEqual(MEMORY_OUTCOMES[0], 'Delivered', 'Delivered is missing.');
});

// ─── Part 3: closure prerequisites (ADR-014 §4) ──────────────────────────────

check('10. No fulfilment: blocked, and the action is none', () => {
  const p = person({ id: 'p1' });
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage, { catalog: FIXTURE_ITEMS });
  repo.initialise(WS, NOW);
  const batch = buildMomentBatch(context([p], policy()), ids, 'operator-1');
  assert(repo.createMoments(WS, batch, NOW).ok, 'Fixture failed.');
  const moment = batch.moments[0];
  const preview = previewClosure({
    moment, brief: null, decisions: [], fulfilments: [], events: [], orders: [], memories: [],
  });
  assertEqual(preview.action, 'none', 'An unstarted moment can close.');
  assert(preview.blockers.some(b => b.code === 'no-confirmed-brief'), 'Missing-brief blocker absent.');
});

check('11. Dispatched but not delivered: blocked not-delivered', () => {
  const fx = deliveredAndReconciled();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const s = state.value!;
  // Roll the fixture's view back to just after dispatch by dropping the
  // Delivered event and re-projecting the fulfilment as still Dispatched.
  const dispatchedFulfilment = { ...s.fulfilments[0], status: 'Dispatched' as const };
  const eventsBeforeDelivery = s.events.filter(e => e.eventType !== 'Delivered' && e.eventType !== 'ProofReceived');
  const preview = previewClosure({
    moment: s.moments[0], brief: s.executionBriefs[0], decisions: s.decisions,
    fulfilments: [dispatchedFulfilment], events: eventsBeforeDelivery, orders: [], memories: [],
  });
  assertEqual(preview.action, 'none', 'A dispatched-only moment can close.');
  assert(preview.blockers.some(b => b.code === 'not-delivered'), 'Not-delivered blocker absent.');
});

check('12. Delivered with no recognition order: blocked legacy-fulfilment, permanently', () => {
  const fx = deliveredAndReconciled();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const s = state.value!;
  const preview = previewClosure({
    moment: s.moments[0], brief: s.executionBriefs[0], decisions: s.decisions,
    fulfilments: s.fulfilments, events: s.events, orders: [], memories: [],
  });
  assertEqual(preview.action, 'none', 'A legacy-fulfilment moment can close.');
  assert(preview.blockers.some(b => b.code === 'legacy-fulfilment'), 'Legacy-fulfilment blocker absent.');
});

check('13. Order committed but not reconciled: blocked order-not-reconciled', () => {
  const fx = deliveredAndReconciled();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const s = state.value!;
  const committedOnly = { ...s.recognitionOrders[0], status: 'Committed' as const,
    actualVendorCost: undefined, actualCourierCost: undefined, actualCustomerCharge: undefined };
  const preview = previewClosure({
    moment: s.moments[0], brief: s.executionBriefs[0], decisions: s.decisions,
    fulfilments: s.fulfilments, events: s.events, orders: [committedOnly], memories: [],
  });
  assertEqual(preview.action, 'none', 'An unreconciled order allows closure.');
  assert(preview.blockers.some(b => b.code === 'order-not-reconciled'), 'Order-not-reconciled blocker absent.');
});

check('14. Proof required and missing: blocked proof-required-missing', () => {
  const fx = deliveredAndReconciled({ proofRequired: true, recordProof: false });
  const preview = previewClosure(ctx(fx));
  assertEqual(preview.action, 'none', 'A moment missing required proof allows closure.');
  assert(preview.blockers.some(b => b.code === 'proof-required-missing'), 'Proof-required blocker absent.');
});

check('15. Proof not required: no proof gate, and closure is available', () => {
  const fx = deliveredAndReconciled({ proofRequired: false, recordProof: false });
  const preview = previewClosure(ctx(fx));
  assertEqual(preview.action, 'close', 'Closure blocked despite proof not being required.');
  assertEqual(preview.blockers.length, 0, 'Unexpected blockers when proof is not required.');
});

check('16. Every prerequisite satisfied: action is close, with no blockers', () => {
  const fx = deliveredAndReconciled();
  const preview = previewClosure(ctx(fx));
  assertEqual(preview.action, 'close', `Unexpected blockers: ${preview.blockers.map(b => b.message).join(' | ')}`);
  assertEqual(preview.blockers.length, 0, 'Blockers present despite every prerequisite holding.');
});

check('17. A cancelled moment can never close', () => {
  const fx = deliveredAndReconciled();
  const c = ctx(fx);
  const preview = previewClosure({ ...c, moment: { ...c.moment, status: 'Cancelled' } });
  assertEqual(preview.action, 'none', 'A cancelled moment can close.');
  assert(preview.blockers.some(b => b.code === 'moment-cancelled'), 'Cancelled blocker absent.');
});

check('18. A needs-review moment can never close', () => {
  const fx = deliveredAndReconciled();
  const c = ctx(fx);
  const preview = previewClosure({ ...c, moment: { ...c.moment, status: 'NeedsReview' } });
  assertEqual(preview.action, 'none', 'A needs-review moment can close.');
  assert(preview.blockers.some(b => b.code === 'moment-not-ready'), 'Not-ready blocker absent.');
});

check('19. Already closed: preview is idempotent, with no blockers and action none', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const preview = previewClosure(ctx(fx));
  assertEqual(preview.action, 'none', 'An already-closed moment offers to close again.');
  assertEqual(preview.blockers.length, 0, 'A closed moment reports blockers.');
  assert(preview.memory !== null, 'A closed moment reports no memory.');
  assert(preview.closedEvent !== null, 'A closed moment reports no closure event.');
});

// ─── Part 4: buildMomentClosure ───────────────────────────────────────────────

check('20. buildMomentClosure produces a Memory whose outcomeDate is the Delivered event\'s time, not the closure instant', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx, T3);
  assertEqual(bundle.memory.outcomeDate, T2, 'outcomeDate is not the delivery instant.');
  assertEqual(bundle.memory.createdAt, T3, 'createdAt is not the closure instant.');
  assertEqual(bundle.memory.outcome, 'Delivered', 'outcome is not Delivered.');
  assertEqual(bundle.memory.createdByActorType, 'Operator', 'createdByActorType is not Operator.');
  assertEqual(bundle.memory.createdByActorId, 'operator-1', 'createdByActorId was dropped.');
});

check('21. The MomentClosed event carries exactly the six payload keys, and no more', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  const keys = Object.keys(bundle.event.payload).sort();
  assertEqual(
    JSON.stringify(keys),
    JSON.stringify([...MOMENT_CLOSED_PAYLOAD_KEYS].sort()),
    'MomentClosed payload does not carry exactly the six declared keys.',
  );
  assertEqual(bundle.event.payload.previousStatus, 'ReadyForExecution', 'previousStatus is wrong.');
});

check('22. buildMomentClosure refuses when the moment is already closed', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const built = buildMomentClosure({ ...ctx(fx), now: T3, ids, actorId: 'operator-1' });
  assert(!built.ok, 'A second closure bundle was built.');
});

// ─── Part 5: the repository trust boundary ────────────────────────────────────

check('23. An honest closure commits atomically: Moment, Memory and Event land together', () => {
  const fx = deliveredAndReconciled();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const writesBefore = fx.storage.writes.length;

  const { moment } = commitClosure(fx);
  assertEqual(moment.status, 'Closed', 'The moment did not close.');
  assertEqual(fx.storage.writes.length, writesBefore + 1, 'Closure was not a single atomic write.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.memories.length, 1, 'Exactly one memory was not created.');
  assertEqual(
    after.value!.events.filter(e => e.eventType === 'MomentClosed').length,
    1,
    'Exactly one MomentClosed event was not appended.',
  );
});

check('24. A second closure attempt is refused, and nothing moves', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const bundle = closeBundle_forceRebuild(fx);
  expectRefused(fx, bundle, 'A second closure');
});

/** Rebuild a syntactically fresh bundle even though the moment already closed. */
function closeBundle_forceRebuild(fx: Fx) {
  const c = ctx(fx);
  return {
    memory: {
      id: 'memory-forced', workspaceId: WS, momentId: c.moment.id, personId: c.moment.personId,
      fulfilmentId: c.fulfilments[0].id, recognitionOrderId: c.orders[0].id,
      outcome: 'Delivered' as const, outcomeDate: T2, createdByActorType: 'Operator' as const,
      createdByActorId: 'operator-1', createdAt: T3,
    },
    event: {
      id: 'event-forced', workspaceId: WS, momentId: c.moment.id, eventType: 'MomentClosed' as const,
      actorType: 'Operator' as const, actorId: 'operator-1', source: 'Platform' as const,
      payload: {
        memoryId: 'memory-forced', fulfilmentId: c.fulfilments[0].id, recognitionOrderId: c.orders[0].id,
        outcome: 'Delivered', outcomeDate: T2, previousStatus: c.moment.status,
      },
      occurredAt: T3, recordedAt: T3,
    },
  };
}

check('25. Extra key on the bundle is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(fx, { ...bundle, extra: true }, 'A bundle with an extra key');
});

check('26. Extra key on the memory is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(fx, { ...bundle, memory: { ...bundle.memory, note: 'not allowed' } }, 'A memory with an extra key');
});

for (const forbidden of ['summary', 'giftCategory', 'occasion', 'money', 'type']) {
  check(`27. A memory naming forbidden field "${forbidden}" is refused`, () => {
    const fx = deliveredAndReconciled();
    const bundle = closeBundle(fx);
    assert((FORBIDDEN_MEMORY_FIELDS as readonly string[]).includes(forbidden), `${forbidden} is not in the forbidden list.`);
    expectRefused(
      fx,
      { ...bundle, memory: { ...bundle.memory, [forbidden]: 'x' } },
      `A memory carrying ${forbidden}`,
    );
  });
}

check('28. Extra key on the event is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(fx, { ...bundle, event: { ...bundle.event, note: 'x' } }, 'An event with an extra key');
});

check('29. Extra key on the event payload is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(
    fx,
    { ...bundle, event: { ...bundle.event, payload: { ...bundle.event.payload, note: 'x' } } },
    'An event payload with an extra key',
  );
});

check('30. A memory belonging to a different workspace is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(fx, { ...bundle, memory: { ...bundle.memory, workspaceId: 'org-2' } }, 'A cross-workspace memory');
});

check('31. A tampered outcome is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(
    fx,
    { ...bundle, memory: { ...bundle.memory, outcome: 'Cancelled' } },
    'A memory recording a non-Delivered outcome',
  );
});

check('32. A tampered outcomeDate is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(
    fx,
    { ...bundle, memory: { ...bundle.memory, outcomeDate: T3 } },
    'A memory whose outcome date disagrees with delivery',
  );
});

check('33. A tampered previousStatus in the event payload is refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(
    fx,
    { ...bundle, event: { ...bundle.event, payload: { ...bundle.event.payload, previousStatus: 'NeedsReview' } } },
    'An event misreporting the previous status',
  );
});

check('34. Mismatched actors between memory and event are refused', () => {
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(
    fx,
    { ...bundle, event: { ...bundle.event, actorId: 'operator-2' } },
    'An event naming a different actor than the memory',
  );
});

check('35. A dispatched-but-undelivered moment is refused at the trust boundary', () => {
  const fx = deliveredAndReconciled();
  const s = fx.repo.load(WS);
  assert(s.ok && s.value, 'State unreadable.');
  const bundle = closeBundle(fx);
  // Roll the stored fulfilment back to Dispatched without the Delivered event —
  // the verifier must recompute from the (now inconsistent) replay and refuse.
  const rolledBack = {
    ...s.value!,
    fulfilments: s.value!.fulfilments.map(f => (f.id === bundle.memory.fulfilmentId ? { ...f, status: 'Dispatched' as const } : f)),
    events: s.value!.events.filter(e => e.eventType !== 'Delivered' && e.eventType !== 'ProofReceived'),
  };
  const verified = verifyClosureWrite({
    workspaceId: WS, moment: rolledBack.moments[0], briefs: rolledBack.executionBriefs,
    decisions: rolledBack.decisions, fulfilments: rolledBack.fulfilments, events: rolledBack.events,
    orders: rolledBack.recognitionOrders, memories: rolledBack.memories, write: bundle,
  });
  assert(!verified.ok, 'A non-delivered fulfilment was accepted at closure.');
});

check('36. An order that regressed to Committed is refused at the trust boundary', () => {
  const fx = deliveredAndReconciled();
  const s = fx.repo.load(WS);
  assert(s.ok && s.value, 'State unreadable.');
  const bundle = closeBundle(fx);
  const regressed = {
    ...s.value!,
    recognitionOrders: s.value!.recognitionOrders.map(o => ({ ...o, status: 'Committed' as const })),
  };
  const verified = verifyClosureWrite({
    workspaceId: WS, moment: regressed.moments[0], briefs: regressed.executionBriefs,
    decisions: regressed.decisions, fulfilments: regressed.fulfilments, events: regressed.events,
    orders: regressed.recognitionOrders, memories: regressed.memories, write: bundle,
  });
  assert(!verified.ok, 'An unreconciled order was accepted at closure.');
});

check('37. No caller may assert the moment\'s terminal status directly', () => {
  // The write bundle type itself carries no `moment` field — proven at the
  // type level by construction, and confirmed here at the value level: an
  // extra `moment` key in the submission is refused as an unknown bundle key.
  const fx = deliveredAndReconciled();
  const bundle = closeBundle(fx);
  expectRefused(
    fx,
    { ...bundle, moment: { ...ctx(fx).moment, status: 'Closed' } },
    'A submission asserting the moment is already Closed',
  );
});

check('38. Nothing is written while merely previewing', () => {
  const fx = deliveredAndReconciled();
  const writesBefore = fx.storage.writes.length;
  previewClosure(ctx(fx));
  previewClosure(ctx(fx));
  assertEqual(fx.storage.writes.length, writesBefore, 'Previewing wrote to storage.');
});

// ─── Part 6: structural validation (ADR-014, defense in depth) ───────────────

check('39. A Moment reading Closed without a Memory fails structural validation', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const tampered = { ...state.value!, memories: [] };
  assert(!validateOperationsState(tampered, WS).ok, 'A closed moment with no memory passed validation.');
});

check('40. A Memory without a matching Moment fails structural validation', () => {
  const fx = deliveredAndReconciled();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const orphan: Memory = {
    id: 'memory-orphan', workspaceId: WS, momentId: 'moment-missing', personId: 'p1',
    fulfilmentId: 'f-x', recognitionOrderId: 'r-x', outcome: 'Delivered',
    outcomeDate: T2, createdByActorType: 'Operator', createdAt: T3,
  };
  const tampered = { ...state.value!, memories: [...state.value!.memories, orphan] };
  assert(!validateOperationsState(tampered, WS).ok, 'An orphaned memory passed validation.');
});

check('41. Two memories for one moment fail structural validation', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const duplicate: Memory = { ...state.value!.memories[0], id: 'memory-dup' };
  const tampered = { ...state.value!, memories: [...state.value!.memories, duplicate] };
  assert(!validateOperationsState(tampered, WS).ok, 'Two memories for one moment passed validation.');
});

check('42. A duplicate MomentClosed event for one moment fails structural validation', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const closedEvent = state.value!.events.find(e => e.eventType === 'MomentClosed')!;
  const duplicate: OperationalEvent = { ...closedEvent, id: 'event-dup' };
  const tampered = { ...state.value!, events: [...state.value!.events, duplicate] };
  assert(!validateOperationsState(tampered, WS).ok, 'Two closure events for one moment passed validation.');
});

check('43. A forbidden field on a persisted Memory fails structural validation', () => {
  const fx = deliveredAndReconciled();
  commitClosure(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const tampered = {
    ...state.value!,
    memories: state.value!.memories.map(m => ({ ...m, summary: 'invented' })),
  };
  assert(!validateOperationsState(tampered as never, WS).ok, 'A memory carrying summary passed validation.');
});

check('44. Freshly migrated state with no memories validates cleanly', () => {
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  const init = repo.initialise(WS, NOW);
  assert(init.ok, 'Fixture initialise failed.');
  assert(validateOperationsState(init.value, WS).ok, 'A brand-new operations state failed validation.');
});

// ─── Part 7: interface boundary ──────────────────────────────────────────────

check('45. The close and timeline routes resolve to their own titles', () => {
  assertEqual(titleFor('/operations/moments/m1/close'), 'Close the moment', 'Wrong title for the close route.');
  assertEqual(titleFor('/operations/timeline/p1'), 'Relationship timeline', 'Wrong title for the timeline route.');
  // Longest match first — the close route lives under a moment.
  assertEqual(titleFor('/operations/moments/m1'), 'Moment', 'The close route leaked into the moment title.');
});

check('46. No commercial or partner data reaches the Memory', () => {
  const fx = deliveredAndReconciled();
  const { moment } = commitClosure(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === moment.id)!;
  for (const forbidden of [
    'vendorId', 'courierId', 'estimatedCustomerCharge', 'actualVendorCost', 'grossMargin',
    'commercialRole', 'approvedBudget', 'note', 'proofKinds',
  ]) {
    assert(!(forbidden in (memory as unknown as Record<string, unknown>)), `${forbidden} reached the Memory.`);
  }
});

check('47. An honest end-to-end closure still commits', () => {
  const fx = deliveredAndReconciled();
  const { moment } = commitClosure(fx);
  assertEqual(moment.status, 'Closed', 'The full lifecycle did not close.');
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assert(validateOperationsState(state.value, WS).ok, 'The final state failed structural validation.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('');
if (failures.length > 0) {
  console.error(`  ${failures.length} check(s) failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  console.error(`  ${passed}/${passed + failures.length} checks passed\n`);
  process.exit(1);
}
console.log(`  ${passed}/${passed} checks passed`);
console.log('Moment closure validation passed.\n');
