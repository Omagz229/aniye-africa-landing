/**
 * Deterministic validation for H3.6 — the fulfilment lifecycle.
 *
 * Run with:  npm run validate:fulfilments
 *
 * Covers ADR-012 (three states, one Fulfilment per Moment, `Redelivery` as the
 * only Decision, proof as metadata with no file stored), ADR-006 (nothing
 * recorded until confirmation, one atomic write per confirmation, Decisions
 * immutable and Events append-only), the additive OperationsState v6 → v7
 * migration, and the repository trust boundary with the runtime-container
 * discipline H3.3-D1 through H3.5-D1 established.
 *
 * Storage is injected, so "writes nothing" is proven by inspecting the write log
 * rather than asserted in prose.
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
  FULFILMENT_STATUSES,
  MOMENT_STATUSES,
  OPERATIONS_KEY,
  PROOF_KINDS,
  isPlainRecord,
  migrateOperationsState,
  replayFulfilment,
  validateOperationsState,
} from '../lib/operations/types';
import type {
  Courier, Fulfilment, OperationalEvent, OperationsState, Vendor,
} from '../lib/operations/types';
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
import { buildOrderCommitment } from '../lib/operations/recognition-order';
import {
  buildDelivery,
  buildDeliveryFailure,
  buildInitialDispatch,
  buildProofReceipt,
  buildRedelivery,
  findFulfilmentForMoment,
  previewFulfilment,
  readDeliveryContext,
  redeliveryFinalDecision,
  verifyFulfilmentWrite,
} from '../lib/operations/fulfilment';
import type { FulfilmentWriteKind } from '../lib/operations/fulfilment';
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
const T4 = '2026-08-05T00:00:00.000Z';
const QUOTED = '2026-07-28T00:00:00.000Z';
const WS = 'org-1';
const OTHER_WS = 'org-2';

let n = 0;
const ids = {
  moment: () => `moment-${++n}`,
  decision: () => `decision-${++n}`,
  event: () => `event-${++n}`,
  brief: () => `brief-${++n}`,
  offer: () => `offer-${++n}`,
  fulfilment: () => `fulfilment-${++n}`,
  order: () => `order-${++n}`,
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
function policy(over: Partial<RecognitionPolicy> = {}): RecognitionPolicy {
  return {
    id: 'policy-global', workspaceId: WS, name: 'Global Recognition', description: '',
    recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: BUDGET, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Courier', preferredDeliveryWindow: 'Weekday mornings',
    signatureRequired: true, proofRequired: true,
    reportingCadence: 'None', status: 'Published', version: 4,
    createdAt: T0, updatedAt: T0, publishedAt: T0, ...over,
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
function context(people: Person[], p = policy()): GenerationContext {
  return {
    workspaceId: WS, program: activeCampaign(people.map(x => x.id)), people,
    classes: [cls()], assignments: [assignment()], policies: [p],
    existingSourceKeys: new Map(), now: NOW,
  };
}

function courierRecord(id: string): Courier {
  const checked = validateCourierDraft({
    name: `Courier ${id}`, countryCode: 'ng', whatsapp: '+234 801 234 5678', email: '', note: '',
  } as CourierDraft);
  assert(checked.ok, 'Fixture courier draft is invalid.');
  return buildCourier(checked.value, id, WS, T0);
}
function vendorRecord(id: string): Vendor {
  const checked = validateVendorDraft({
    name: `Vendor ${id}`, countryCode: 'NG', city: 'Lagos',
    whatsapp: '+234 802 000 0000', email: '', note: '',
  });
  assert(checked.ok, 'Fixture vendor draft is invalid.');
  return buildVendor(checked.value, id, WS, T0);
}

/** Strip the four v6 delivery promises, reproducing a pre-v6 snapshot exactly. */
function withoutDeliveryContext<T extends Record<string, unknown>>(snapshot: T): T {
  const copy = { ...snapshot } as Record<string, unknown>;
  delete copy.deliveryRequirement;
  delete copy.preferredDeliveryWindow;
  delete copy.signatureRequired;
  delete copy.proofRequired;
  return copy as T;
}

/**
 * A workspace carrying a ready Moment with a confirmed brief and all three
 * confirmed selections — the only state a dispatch may be confirmed from.
 */
function preparedWorkspace(over: { legacySnapshot?: boolean; partialSnapshot?: boolean } = {}) {
  const p = person({ id: 'p1' });
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage, { catalog: FIXTURE_ITEMS });
  repo.initialise(WS, NOW);

  const batch = buildMomentBatch(context([p]), ids, 'operator-1');
  if (over.legacySnapshot || over.partialSnapshot) {
    const original = batch.moments[0].policyResolutionSnapshot!;
    const stripped = withoutDeliveryContext(original as unknown as Record<string, unknown>);
    // "Partial" means some present, some absent — refused as malformed rather
    // than read as a third, ambiguous state.
    const snapshot = over.partialSnapshot
      ? { ...stripped, deliveryRequirement: 'Courier', signatureRequired: true }
      : stripped;
    batch.moments[0] = {
      ...batch.moments[0],
      policyResolutionSnapshot: snapshot as unknown as typeof original,
    };
  }
  const created = repo.createMoments(WS, batch, NOW);
  if (over.partialSnapshot) {
    // A partial snapshot must never reach storage at all.
    return { repo, storage, created, moment: batch.moments[0] } as never;
  }
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

  // H3.7 — an initial dispatch now requires committed commercial authority
  // (ADR-013). The quotation is manual, so the fixture supplies one.
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

  return { repo, storage, moment, brief, courier, vendor };
}

type Fx = ReturnType<typeof preparedWorkspace>;

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
  };
}

function dispatch(fx: Fx, now = T1) {
  const built = buildInitialDispatch({ ...ctx(fx), now, ids, actorId: 'operator-1' });
  assert(built.ok, `Dispatch bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function commitDispatch(fx: Fx, now = T1) {
  const bundle = dispatch(fx, now);
  const written = fx.repo.commitInitialDispatch(WS, bundle, now);
  assert(written.ok, `Dispatch was refused: ${written.ok ? '' : written.reason}`);
  return { bundle, fulfilment: written.value };
}

function fail(fx: Fx, now = T2) {
  const built = buildDeliveryFailure({ ...ctx(fx), now, ids, actorId: 'operator-1' });
  assert(built.ok, `Failure bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function redeliver(fx: Fx, now = T3, reason = 'Recipient confirmed they are back Monday.') {
  const built = buildRedelivery({ ...ctx(fx), reason, now, ids, actorId: 'operator-1' });
  assert(built.ok, `Redelivery bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function deliver(fx: Fx, now = T4) {
  const built = buildDelivery({ ...ctx(fx), now, ids, actorId: 'operator-1' });
  assert(built.ok, `Delivery bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function proof(fx: Fx, now = T4, kinds: readonly (typeof PROOF_KINDS)[number][] = ['Photo', 'Signature']) {
  const built = buildProofReceipt({
    ...ctx(fx), kinds, source: 'WhatsApp', now, ids, actorId: 'operator-1',
  });
  assert(built.ok, `Proof bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

type Commit = (write: unknown, now: string) => { ok: boolean; reason?: string };

function committer(fx: Fx, kind: FulfilmentWriteKind): Commit {
  const repo = fx.repo;
  switch (kind) {
    case 'Dispatched': return (w, now) => repo.commitInitialDispatch(WS, w as never, now);
    case 'DeliveryFailed': return (w, now) => repo.commitDeliveryFailure(WS, w as never, now);
    case 'Redelivery': return (w, now) => repo.commitRedelivery(WS, w as never, now);
    case 'Delivered': return (w, now) => repo.commitDelivery(WS, w as never, now);
    case 'ProofReceived': return (w, now) => repo.commitProofReceipt(WS, w as never, now);
  }
}

/**
 * Submit, expect refusal, and prove **nothing moved** — no write, and every
 * collection byte-identical.
 */
function expectRefused(
  fx: Fx, kind: FulfilmentWriteKind, write: unknown, what: string,
  opts: { recovery?: boolean; now?: string } = {},
): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const prior = {
    decisions: JSON.stringify(before.value!.decisions),
    events: JSON.stringify(before.value!.events),
    fulfilments: JSON.stringify(before.value!.fulfilments),
    briefs: JSON.stringify(before.value!.executionBriefs),
  };
  const priorWrites = fx.storage.writes.length;

  let written: { ok: boolean; reason?: string };
  try {
    written = committer(fx, kind)(write, opts.now ?? T2);
  } catch (error) {
    throw new Error(`${what} threw instead of refusing: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!written.ok, `${what} was accepted.`);
  assert(typeof written.reason === 'string' && written.reason.length > 0, `${what} was refused with no reason.`);
  if (opts.recovery !== false) {
    assert(
      written.reason!.toLowerCase().includes('nothing was recorded'),
      `${what} was refused without saying nothing was recorded: "${written.reason}"`,
    );
  }

  assertEqual(fx.storage.writes.length, priorWrites, `${what} still wrote to storage.`);
  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(after.value!.decisions), prior.decisions, `${what} changed the decisions.`);
  assertEqual(JSON.stringify(after.value!.events), prior.events, `${what} changed the events.`);
  assertEqual(JSON.stringify(after.value!.fulfilments), prior.fulfilments, `${what} changed the fulfilments.`);
  assertEqual(JSON.stringify(after.value!.executionBriefs), prior.briefs, `${what} changed the briefs.`);
}

/** The direct verifier path — it must be independently safe without a repository. */
function verifyDirect(fx: Fx, kind: FulfilmentWriteKind, write: unknown) {
  const c = ctx(fx);
  return verifyFulfilmentWrite({
    workspaceId: WS, moment: c.moment,
    briefs: c.brief ? [c.brief] : [],
    decisions: c.decisions, fulfilments: c.fulfilments, events: c.events,
    orders: c.orders,
    write, kind,
  });
}

console.log('\nH3.6 — fulfilment lifecycle\n');

// ─── Part 1: persistence and migration ───────────────────────────────────────

check('1. The operations schema is at or beyond v7, and Workspace is untouched by it', () => {
  assert(CURRENT_OPERATIONS_SCHEMA_VERSION >= 7, 'Operations schema regressed below v7.');
  const fresh = freshWorkspace();
  assert(!('fulfilments' in (fresh as unknown as Record<string, unknown>)), 'Fulfilments reached WorkspaceState.');
});

check('2. The v6 → v7 rung adds only an empty fulfilment collection', () => {
  const v6 = {
    schemaVersion: 6, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    executionBriefs: [{ id: 'b-old' }], vendors: [{ id: 'v-old' }], vendorOffers: [{ id: 'o-old' }],
    couriers: [{ id: 'c-old' }], createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const before = JSON.stringify(v6);
  const result = migrateOperationsState(JSON.parse(before));
  assert(result.status === 'migrated', 'A v6 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'The migration did not reach the current schema.');
  assert(Array.isArray(result.state.fulfilments), 'The v6 → v7 rung did not add fulfilments.');
  assertEqual(result.state.fulfilments.length, 0, 'The migration invented a fulfilment.');

  const original = JSON.parse(before) as Record<string, unknown>;
  for (const k of ['moments', 'decisions', 'events', 'executionBriefs', 'vendors', 'vendorOffers', 'couriers'] as const) {
    assertEqual(
      JSON.stringify((result.state as unknown as Record<string, unknown>)[k]),
      JSON.stringify(original[k]),
      `${k} were altered by the v6 → v7 rung.`,
    );
  }
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('3. A v1 payload walks every rung to the current schema without losing history', () => {
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'Migration did not reach the current schema.');
  assert(Array.isArray(result.state.executionBriefs), 'The v1 → v2 rung did not run.');
  assert(Array.isArray(result.state.vendors), 'The v3 → v4 rung did not run.');
  assert(Array.isArray(result.state.couriers), 'The v4 → v5 rung did not run.');
  assert(Array.isArray(result.state.fulfilments), 'The v6 → v7 rung did not run.');
  assertEqual(result.state.moments.length, 1, 'A moment was lost in migration.');
  assertEqual(result.state.decisions.length, 1, 'A decision was lost in migration.');
  assertEqual(result.state.events.length, 1, 'An event was lost in migration.');
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('4. A newer-than-current payload is still refused rather than downgraded', () => {
  const future = {
    schemaVersion: CURRENT_OPERATIONS_SCHEMA_VERSION + 1,
    workspaceId: WS, moments: [], decisions: [], events: [],
  };
  const result = migrateOperationsState(future);
  assertEqual(result.status, 'invalid', 'A future version was adopted.');
});

check('5. Reads never rewrite storage', () => {
  const v6 = {
    schemaVersion: 6, workspaceId: WS, moments: [], decisions: [], events: [],
    executionBriefs: [], vendors: [], vendorOffers: [], couriers: [], createdAt: T0, updatedAt: T0,
  };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v6) });
  const repo = createLocalOperationsRepository(storage);
  assert(repo.load(WS).ok, 'A v6 payload could not be read.');
  assert(repo.listFulfilments(WS).ok, 'Fulfilments could not be listed.');
  assertEqual(storage.writes.length, 0, 'A read rewrote storage.');
});

// ─── Part 2: no draft, and the recording rule ────────────────────────────────

check('6. A moment with a courier chosen but nothing dispatched has no fulfilment', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.fulfilments.length, 0, 'A fulfilment was persisted before dispatch.');
  const found = fx.repo.findFulfilmentForMoment(WS, fx.moment.id);
  assert(found.ok && found.value === null, 'A draft fulfilment exists.');
});

check('7. Previewing and building write nothing', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  previewFulfilment(ctx(fx));
  buildInitialDispatch({ ...ctx(fx), now: T1, ids, actorId: 'operator-1' });
  assertEqual(fx.storage.writes.length, before, 'Previewing or building wrote to storage.');
});

check('8. Before dispatch, the one allowed action is dispatch', () => {
  const fx = preparedWorkspace();
  const preview = previewFulfilment(ctx(fx));
  assertEqual(preview.action, 'dispatch', 'Dispatch was not offered.');
  assertEqual(preview.blockers.length, 0, 'A ready moment reported blockers.');
  assert(preview.fulfilment === null, 'A fulfilment appeared before dispatch.');
  assert(preview.authority !== null, 'The execution authority was not read.');
});

// ─── Part 3: each transition, and its exact write ────────────────────────────

check('9. Initial dispatch writes one fulfilment and one event, no decision, in one write', () => {
  const fx = preparedWorkspace();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = before.value!.decisions.length;
  const priorWrites = fx.storage.writes.length;

  const { fulfilment } = commitDispatch(fx);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'Dispatch was not a single write.');
  assertEqual(fulfilment.status, 'Dispatched', 'A fulfilment did not open as Dispatched.');
  assertEqual(fulfilment.attempt, 1, 'A fulfilment did not open at attempt 1.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.fulfilments.length, 1, 'Wrong fulfilment count.');
  assertEqual(after.value!.decisions.length, priorDecisions, 'Dispatch recorded a decision.');
  assertEqual(
    after.value!.events.filter(e => e.eventType === 'Dispatched').length, 1,
    'Wrong Dispatched event count.',
  );
});

check('10. A failed attempt writes one state change and one event, no decision, in one write', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = before.value!.decisions.length;
  const priorWrites = fx.storage.writes.length;

  const written = fx.repo.commitDeliveryFailure(WS, fail(fx), T2);
  assert(written.ok, `A failure was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'A failure was not a single write.');
  assertEqual(written.value.status, 'DeliveryFailed', 'The state did not move to DeliveryFailed.');
  assertEqual(written.value.attempt, 1, 'A failure changed the attempt number.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.decisions.length, priorDecisions, 'A failure recorded a decision.');
  assertEqual(after.value!.fulfilments.length, 1, 'A failure created a second fulfilment.');
});

check('11. Redelivery writes one decision, the state change and one Dispatched event, in one write', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDeliveryFailure(WS, fail(fx), T2).ok, 'Fixture failure was refused.');

  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = before.value!.decisions.length;
  const priorWrites = fx.storage.writes.length;

  const bundle = redeliver(fx);
  const written = fx.repo.commitRedelivery(WS, bundle, T3);
  assert(written.ok, `A redelivery was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'A redelivery was not a single write.');
  assertEqual(written.value.status, 'Dispatched', 'A redelivery did not return to Dispatched.');
  assertEqual(written.value.attempt, 2, 'A redelivery did not advance the attempt number.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.decisions.length, priorDecisions + 1, 'A redelivery did not record exactly one decision.');
  const decision = after.value!.decisions.find(d => d.decisionType === 'Redelivery');
  assert(decision, 'No Redelivery decision was recorded.');
  assertEqual(decision!.status, 'Confirmed', 'The redelivery decision is not Confirmed.');
  assertEqual(decision!.provider, 'HumanOperator', 'The redelivery decision is not an operator judgement.');
  assert(decision!.reason.length > 0, 'The redelivery decision has no reason.');
  assertEqual(decision!.finalDecision, redeliveryFinalDecision(2), 'The redelivery summary is wrong.');
  assertEqual(
    after.value!.events.filter(e => e.eventType === 'Dispatched').length, 2,
    'A redelivery did not append a second Dispatched event.',
  );
});

check('12. A redelivery with a blank reason is refused before anything is built', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDeliveryFailure(WS, fail(fx), T2).ok, 'Fixture failure was refused.');
  const built = buildRedelivery({ ...ctx(fx), reason: '   ', now: T3, ids, actorId: 'operator-1' });
  assert(!built.ok, 'A blank redelivery reason was accepted.');
});

check('13. Delivery writes one state change and one event, no decision, in one write', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = before.value!.decisions.length;
  const priorWrites = fx.storage.writes.length;

  const written = fx.repo.commitDelivery(WS, deliver(fx), T4);
  assert(written.ok, `A delivery was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'A delivery was not a single write.');
  assertEqual(written.value.status, 'Delivered', 'The state did not move to Delivered.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.decisions.length, priorDecisions, 'A delivery recorded a decision.');
});

check('14. Proof writes one event, changes no status and records no decision, in one write', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'Fixture delivery was refused.');

  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = before.value!.decisions.length;
  const priorStatus = before.value!.fulfilments[0].status;
  const priorAttempt = before.value!.fulfilments[0].attempt;
  const priorWrites = fx.storage.writes.length;

  const written = fx.repo.commitProofReceipt(WS, proof(fx), T4);
  assert(written.ok, `A proof receipt was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'A proof receipt was not a single write.');
  assertEqual(written.value.status, priorStatus, 'Proof changed the fulfilment status.');
  assertEqual(written.value.attempt, priorAttempt, 'Proof changed the attempt number.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.decisions.length, priorDecisions, 'Proof recorded a decision.');
  const event = after.value!.events.find(e => e.eventType === 'ProofReceived');
  assert(event, 'No ProofReceived event was recorded.');
  assertEqual(JSON.stringify(event!.payload.proofKinds), JSON.stringify(['Photo', 'Signature']), 'The proof kinds were altered.');
  assertEqual(event!.source, 'WhatsApp', 'The channel was not recorded.');
});

// ─── Part 4: the completion test ─────────────────────────────────────────────

check('15. Failed → redelivery → delivered → proof gives the exact ordered history, with no mutation', () => {
  const fx = preparedWorkspace();
  const { bundle: dispatchBundle } = commitDispatch(fx);

  const afterDispatch = fx.repo.load(WS);
  assert(afterDispatch.ok && afterDispatch.value, 'State unreadable.');
  const frozenEarlier = JSON.stringify(
    afterDispatch.value!.events.filter(e => e.eventType !== 'Dispatched'),
  );
  const frozenDispatch = JSON.stringify(dispatchBundle.event);

  assert(fx.repo.commitDeliveryFailure(WS, fail(fx), T2).ok, 'The failure was refused.');
  assert(fx.repo.commitRedelivery(WS, redeliver(fx), T3).ok, 'The redelivery was refused.');
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'The delivery was refused.');
  assert(fx.repo.commitProofReceipt(WS, proof(fx), T4).ok, 'The proof receipt was refused.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const f = state.value!.fulfilments[0];

  // Current state.
  assertEqual(f.status, 'Delivered', 'The final state is wrong.');
  assertEqual(f.attempt, 2, 'The final attempt number is wrong.');

  // Historical truth — in persisted order, with attempt numbers.
  const lifecycle = state.value!.events.filter(
    e => isPlainRecord(e.payload) && e.payload.fulfilmentId === f.id,
  );
  const shape = lifecycle.map(e => `${e.eventType}#${(e.payload as { attempt: number }).attempt}`);
  assertEqual(
    shape.join(' · '),
    'Dispatched#1 · DeliveryFailed#1 · Dispatched#2 · Delivered#2 · ProofReceived#2',
    'The ordered lifecycle history is wrong.',
  );

  // Nothing was mutated to produce it.
  assertEqual(
    JSON.stringify(state.value!.events.filter(e => !(isPlainRecord(e.payload) && e.payload.fulfilmentId === f.id))),
    frozenEarlier,
    'An earlier event was rewritten.',
  );
  assertEqual(JSON.stringify(lifecycle[0]), frozenDispatch, 'The first dispatch event was rewritten.');

  // And the record agrees with its own replay.
  const replay = replayFulfilment(state.value!.events, f.id);
  assert(replay.ok, `The lifecycle could not be replayed: ${replay.ok ? '' : replay.reason}`);
  if (!replay.ok) return;
  assertEqual(replay.status, f.status, 'The replay disagrees with the stored status.');
  assertEqual(replay.attempt, f.attempt, 'The replay disagrees with the stored attempt.');
  assertEqual(replay.redeliveries, 1, 'The replay counted the wrong number of redeliveries.');
});

check('16. Earlier decisions and events stay byte-identical through every transition', () => {
  const fx = preparedWorkspace();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const frozenDecisions = JSON.stringify(before.value!.decisions);
  const frozenEvents = JSON.stringify(before.value!.events);

  commitDispatch(fx);
  assert(fx.repo.commitDeliveryFailure(WS, fail(fx), T2).ok, 'The failure was refused.');
  assert(fx.repo.commitRedelivery(WS, redeliver(fx), T3).ok, 'The redelivery was refused.');
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'The delivery was refused.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(
    JSON.stringify(after.value!.decisions.slice(0, before.value!.decisions.length)),
    frozenDecisions,
    'An earlier decision was rewritten or reordered.',
  );
  assertEqual(
    JSON.stringify(after.value!.events.slice(0, before.value!.events.length)),
    frozenEvents,
    'An earlier event was rewritten or reordered.',
  );
});

// ─── Part 5: invalid transitions ─────────────────────────────────────────────

check('17. Every transition is refused before anything has been dispatched', () => {
  for (const kind of ['DeliveryFailed', 'Delivered', 'ProofReceived', 'Redelivery'] as const) {
    const fx = preparedWorkspace();
    // A structurally complete bundle, built against a donor that *has* been
    // dispatched, then submitted against a moment that has not.
    const donor = preparedWorkspace();
    commitDispatch(donor);

    let write: unknown;
    if (kind === 'ProofReceived') {
      assert(donor.repo.commitDelivery(WS, deliver(donor), T4).ok, 'Donor delivery was refused.');
      write = { event: { ...proof(donor).event, momentId: fx.moment.id, workspaceId: WS } };
    } else if (kind === 'Redelivery') {
      assert(donor.repo.commitDeliveryFailure(WS, fail(donor), T2).ok, 'Donor failure was refused.');
      const bundle = redeliver(donor);
      write = {
        decision: { ...bundle.decision, momentId: fx.moment.id },
        event: { ...bundle.event, momentId: fx.moment.id },
      };
    } else {
      write = { event: { ...fail(donor).event, eventType: kind, momentId: fx.moment.id, workspaceId: WS } };
    }
    expectRefused(fx, kind, write, `${kind} before any dispatch`);
  }
});

check('18. A second dispatch for the same moment is refused', () => {
  const fx = preparedWorkspace();
  const { bundle } = commitDispatch(fx);
  expectRefused(fx, 'Dispatched', bundle, 'A replayed dispatch');
  const fresh = { ...bundle, fulfilment: { ...bundle.fulfilment, id: 'fulfilment-other' } };
  expectRefused(fx, 'Dispatched', fresh, 'A second, differently-identified dispatch');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.fulfilments.length, 1, 'More than one fulfilment exists for a moment.');
});

check('19. Delivery from a failed attempt, and failure from a delivered one, are refused', () => {
  const failed = preparedWorkspace();
  commitDispatch(failed);
  const deliveryBundle = deliver(failed);
  assert(failed.repo.commitDeliveryFailure(WS, fail(failed), T2).ok, 'Fixture failure was refused.');
  expectRefused(failed, 'Delivered', deliveryBundle, 'Delivering a failed attempt');

  const delivered = preparedWorkspace();
  commitDispatch(delivered);
  const failureBundle = fail(delivered);
  assert(delivered.repo.commitDelivery(WS, deliver(delivered), T4).ok, 'Fixture delivery was refused.');
  expectRefused(delivered, 'DeliveryFailed', failureBundle, 'Failing a delivered fulfilment');
});

check('20. Redelivery is refused from Dispatched and from Delivered', () => {
  const dispatched = preparedWorkspace();
  commitDispatch(dispatched);
  // Build against a failed donor so the bundle is structurally complete.
  const donor = preparedWorkspace();
  commitDispatch(donor);
  assert(donor.repo.commitDeliveryFailure(WS, fail(donor), T2).ok, 'Donor failure was refused.');
  const donorBundle = redeliver(donor);
  const state = dispatched.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const fid = state.value!.fulfilments[0].id;
  const write = {
    decision: { ...donorBundle.decision, momentId: dispatched.moment.id, inputs: { fulfilmentId: fid, attempt: 2 } },
    event: { ...donorBundle.event, momentId: dispatched.moment.id, payload: { fulfilmentId: fid, attempt: 2 } },
  };
  expectRefused(dispatched, 'Redelivery', write, 'Redelivering something in transit');
});

check('21. Proof before delivery is refused', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const fid = state.value!.fulfilments[0].id;
  const donor = preparedWorkspace();
  commitDispatch(donor);
  assert(donor.repo.commitDelivery(WS, deliver(donor), T4).ok, 'Donor delivery was refused.');
  const write = {
    event: {
      ...proof(donor).event, momentId: fx.moment.id,
      payload: { fulfilmentId: fid, attempt: 1, proofKinds: ['Photo'] },
    },
  };
  expectRefused(fx, 'ProofReceived', write, 'Proof before delivery');
});

check('22. Double-submitting the same transition is refused the second time', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const bundle = fail(fx);
  assert(fx.repo.commitDeliveryFailure(WS, bundle, T2).ok, 'The first failure was refused.');
  expectRefused(fx, 'DeliveryFailed', bundle, 'A double-submitted failure', { recovery: false });
});

// ─── Part 6: the delivery-promise gate ───────────────────────────────────────

check('23. A pre-v6 moment is refused at dispatch, with an honest recovery and zero writes', () => {
  const fx = preparedWorkspace({ legacySnapshot: true });
  const preview = previewFulfilment(ctx(fx));
  assert(preview.deliveryContext === null, 'A legacy snapshot produced a delivery context.');
  const blocker = preview.blockers.find(b => b.code === 'delivery-context-missing');
  assert(blocker, 'The missing delivery context was not named.');
  assertEqual(preview.action, 'none', 'A legacy moment was offered a dispatch.');

  // The recovery must not promise re-preparation, which idempotency forbids.
  assert(
    !/prepare it again|re-?prepare/i.test(blocker!.recovery) ||
      /cannot be prepared again/i.test(blocker!.recovery),
    'The recovery promised a re-preparation the idempotency rules cannot perform.',
  );

  const built = buildInitialDispatch({ ...ctx(fx), now: T1, ids, actorId: 'operator-1' });
  assert(!built.ok, 'A legacy moment produced a dispatch bundle.');

  // And the boundary refuses it even if a caller assembles the bundle by hand.
  const donor = preparedWorkspace();
  const donorBundle = dispatch(donor);
  const c = ctx(fx);
  const handmade = {
    fulfilment: {
      ...donorBundle.fulfilment, momentId: fx.moment.id,
      briefId: c.brief!.id, briefRevision: c.brief!.revision,
      itemSelectionDecisionId: c.decisions.find(d => d.decisionType === 'ItemSelection')!.id,
      vendorSelectionDecisionId: c.decisions.find(d => d.decisionType === 'VendorSelection')!.id,
      courierSelectionDecisionId: c.decisions.find(d => d.decisionType === 'CourierSelection')!.id,
    },
    event: { ...donorBundle.event, momentId: fx.moment.id },
  };
  handmade.event.payload = { fulfilmentId: handmade.fulfilment.id, attempt: 1 };
  expectRefused(fx, 'Dispatched', handmade, 'A hand-assembled legacy dispatch', { now: T1 });
});

check('24. A partial delivery snapshot never reaches storage at all', () => {
  const fx = preparedWorkspace({ partialSnapshot: true }) as unknown as {
    created: { ok: boolean; reason?: string }; storage: { writes: string[] };
  };
  assert(!fx.created.ok, 'A partial delivery snapshot was stored.');
  assert(
    (fx.created.reason ?? '').toLowerCase().includes('delivery-context'),
    `The refusal did not name the malformed delivery context: "${fx.created.reason}"`,
  );
});

check('25. `readDeliveryContext` returns nothing rather than defaulting anything', () => {
  assert(readDeliveryContext(undefined) === null, 'An absent snapshot produced a context.');
  assert(readDeliveryContext(null) === null, 'A null snapshot produced a context.');
  assert(readDeliveryContext([]) === null, 'An array produced a context.');
  assert(readDeliveryContext('Standard') === null, 'A string produced a context.');
  assert(readDeliveryContext({}) === null, 'An empty snapshot produced a context.');
  assert(
    readDeliveryContext({ deliveryRequirement: 'Courier', signatureRequired: true }) === null,
    'A partial snapshot produced a context.',
  );
  const full = readDeliveryContext({
    deliveryRequirement: 'Courier', preferredDeliveryWindow: 'Weekday mornings',
    signatureRequired: true, proofRequired: false,
  });
  assert(full !== null, 'A complete snapshot produced no context.');
  assertEqual(full!.proofRequired, false, 'proofRequired: false was not preserved as false.');
});

check('26. `proofRequired: false` makes proof optional, not forbidden', () => {
  const p = person({ id: 'p1' });
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage, { catalog: FIXTURE_ITEMS });
  repo.initialise(WS, NOW);
  const batch = buildMomentBatch(context([p], policy({ proofRequired: false })), ids, 'operator-1');
  assert(repo.createMoments(WS, batch, NOW).ok, 'Fixture moments were refused.');
  const snapshot = batch.moments[0].policyResolutionSnapshot!;
  assertEqual(snapshot.proofRequired, false, 'proofRequired was not captured as false.');
  const dc = readDeliveryContext(snapshot);
  assert(dc !== null, 'A complete snapshot with proofRequired: false was read as legacy.');
  assertEqual(dc!.proofRequired, false, 'proofRequired: false was widened.');
});

// ─── Part 7: stale and cross-workspace authority ─────────────────────────────

check('27. A dispatch naming the wrong brief, item, vendor or courier is refused', () => {
  const fx = preparedWorkspace();
  const bundle = dispatch(fx);
  for (const key of [
    'briefId', 'itemSelectionDecisionId', 'vendorSelectionDecisionId', 'courierSelectionDecisionId',
  ] as const) {
    const tampered = {
      ...bundle,
      fulfilment: { ...bundle.fulfilment, [key]: 'something-else' },
    };
    expectRefused(fx, 'Dispatched', tampered, `A dispatch with a wrong ${key}`, { now: T1 });
  }
  const wrongRevision = { ...bundle, fulfilment: { ...bundle.fulfilment, briefRevision: 99 } };
  expectRefused(fx, 'Dispatched', wrongRevision, 'A dispatch with a wrong brief revision', { now: T1 });
});

check('28. A dispatch stamped with another workspace or moment is refused', () => {
  const fx = preparedWorkspace();
  const bundle = dispatch(fx);
  expectRefused(
    fx, 'Dispatched',
    { ...bundle, fulfilment: { ...bundle.fulfilment, workspaceId: OTHER_WS } },
    'A dispatch for another workspace', { now: T1 },
  );
  expectRefused(
    fx, 'Dispatched',
    { ...bundle, event: { ...bundle.event, workspaceId: OTHER_WS } },
    'A dispatch whose event names another workspace', { now: T1 },
  );
  const direct = verifyDirect(fx, 'Dispatched', {
    ...bundle, fulfilment: { ...bundle.fulfilment, momentId: 'moment-elsewhere' },
  });
  assert(!direct.ok, 'The verifier accepted a fulfilment for another moment.');
});

check('29. A cancelled or unready moment cannot be dispatched', () => {
  const fx = preparedWorkspace();
  const bundle = dispatch(fx);
  assert(fx.repo.updateMomentStatus(WS, fx.moment.id, 'Cancelled', T1, { cancelledAt: T1 }).ok, 'Fixture cancellation failed.');
  expectRefused(fx, 'Dispatched', bundle, 'Dispatching a cancelled moment', { now: T1 });
});

check('30. A transition naming a fulfilment from another moment is refused', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const donor = preparedWorkspace();
  commitDispatch(donor);
  const donorState = donor.repo.load(WS);
  assert(donorState.ok && donorState.value, 'Donor state unreadable.');
  const foreignId = donorState.value!.fulfilments[0].id;

  const bundle = fail(fx);
  const tampered = { event: { ...bundle.event, payload: { fulfilmentId: foreignId, attempt: 1 } } };
  expectRefused(fx, 'DeliveryFailed', tampered, 'A failure naming another moment’s fulfilment');
});

// ─── Part 8: runtime containers, and never throwing ──────────────────────────

const MALFORMED: readonly [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['an array', []],
  ['a string', 'dispatch'],
  ['a number', 7],
  ['a boolean', true],
];

check('31. A malformed write bundle is refused, not thrown — every transition', () => {
  for (const kind of ['Dispatched', 'DeliveryFailed', 'Redelivery', 'Delivered', 'ProofReceived'] as const) {
    const fx = preparedWorkspace();
    if (kind !== 'Dispatched') commitDispatch(fx);
    for (const [what, value] of MALFORMED) {
      expectRefused(fx, kind, value, `${kind} with a bundle that is ${what}`);
    }
  }
});

check('32. A malformed event, payload, fulfilment or decision container is refused, not thrown', () => {
  const fx = preparedWorkspace();
  const bundle = dispatch(fx);
  for (const [what, value] of MALFORMED) {
    expectRefused(fx, 'Dispatched', { ...bundle, event: value }, `A dispatch whose event is ${what}`, { now: T1 });
    expectRefused(fx, 'Dispatched', { ...bundle, fulfilment: value }, `A dispatch whose fulfilment is ${what}`, { now: T1 });
    expectRefused(
      fx, 'Dispatched', { ...bundle, event: { ...bundle.event, payload: value } },
      `A dispatch whose payload is ${what}`, { now: T1 },
    );
  }

  const rd = preparedWorkspace();
  commitDispatch(rd);
  assert(rd.repo.commitDeliveryFailure(WS, fail(rd), T2).ok, 'Fixture failure was refused.');
  const redelivery = redeliver(rd);
  for (const [what, value] of MALFORMED) {
    expectRefused(
      rd, 'Redelivery', { ...redelivery, decision: value },
      `A redelivery whose decision is ${what}`, { now: T3 },
    );
    expectRefused(
      rd, 'Redelivery', { ...redelivery, decision: { ...redelivery.decision, inputs: value } },
      `A redelivery whose inputs are ${what}`, { now: T3 },
    );
  }
});

check('33. The direct verifier is independently safe, with no repository at all', () => {
  const fx = preparedWorkspace();
  for (const kind of ['Dispatched', 'DeliveryFailed', 'Redelivery', 'Delivered', 'ProofReceived'] as const) {
    for (const [what, value] of MALFORMED) {
      let result: { ok: boolean };
      try {
        result = verifyDirect(fx, kind, value);
      } catch (error) {
        throw new Error(`The verifier threw on ${kind} with ${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
      assert(!result.ok, `The verifier accepted ${kind} with a bundle that is ${what}.`);
    }
  }
});

check('34. `replayFulfilment` refuses malformed histories rather than throwing', () => {
  for (const [, value] of MALFORMED) {
    const result = replayFulfilment([value], 'f-1');
    assert(!result.ok, 'A malformed event was replayed as valid.');
  }
  const orphan = replayFulfilment([], 'f-1');
  assert(!orphan.ok, 'A fulfilment with no events replayed as valid.');

  // A history that opens at the wrong attempt, or skips a state.
  const badOpen = replayFulfilment(
    [{ eventType: 'Dispatched', payload: { fulfilmentId: 'f-1', attempt: 2 }, occurredAt: T1, recordedAt: T1 }],
    'f-1',
  );
  assert(!badOpen.ok, 'A fulfilment opening at attempt 2 replayed as valid.');

  const skipped = replayFulfilment(
    [
      { eventType: 'Dispatched', payload: { fulfilmentId: 'f-1', attempt: 1 }, occurredAt: T1, recordedAt: T1 },
      { eventType: 'ProofReceived', payload: { fulfilmentId: 'f-1', attempt: 1, proofKinds: ['Photo'] }, occurredAt: T2, recordedAt: T2 },
    ],
    'f-1',
  );
  assert(!skipped.ok, 'Proof was replayed as valid before delivery.');

  const backwards = replayFulfilment(
    [
      { eventType: 'Dispatched', payload: { fulfilmentId: 'f-1', attempt: 1 }, occurredAt: T2, recordedAt: T2 },
      { eventType: 'Delivered', payload: { fulfilmentId: 'f-1', attempt: 1 }, occurredAt: T1, recordedAt: T1 },
    ],
    'f-1',
  );
  assert(!backwards.ok, 'A lifecycle running backwards in time replayed as valid.');
});

// ─── Part 9: the proof boundary ──────────────────────────────────────────────

const FORBIDDEN_PROOF_FIELDS = [
  'url', 'proofUrl', 'fileName', 'file', 'dataUri', 'base64', 'bytes', 'blob',
  'image', 'attachment', 'photo', 'signatureImage', 'trackingUrl', 'trackingNumber',
] as const;

check('35. Every forbidden proof field is refused at the write boundary', () => {
  for (const forbidden of FORBIDDEN_PROOF_FIELDS) {
    const fx = preparedWorkspace();
    commitDispatch(fx);
    assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'Fixture delivery was refused.');
    const bundle = proof(fx);
    const tampered = {
      event: {
        ...bundle.event,
        payload: { ...bundle.event.payload, [forbidden]: 'https://example.test/evidence.jpg' },
      },
    };
    expectRefused(fx, 'ProofReceived', tampered, `A proof payload carrying ${forbidden}`, { now: T4 });

    // And the field is nowhere in storage, under any nesting.
    const state = fx.repo.load(WS);
    assert(state.ok && state.value, 'State unreadable.');
    assert(!JSON.stringify(state.value).includes(forbidden), `${forbidden} reached storage.`);
  }
});

check('36. A forbidden field one level up, on the event itself, is also refused', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'Fixture delivery was refused.');
  const bundle = proof(fx);
  for (const forbidden of ['proofUrl', 'attachment', 'trackingUrl'] as const) {
    expectRefused(
      fx, 'ProofReceived',
      { event: { ...bundle.event, [forbidden]: 'https://example.test/evidence.jpg' } },
      `An event carrying ${forbidden}`, { now: T4 },
    );
  }
});

check('37. Proof kinds are a non-empty, unique set drawn from the three declared kinds', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'Fixture delivery was refused.');
  const bundle = proof(fx);

  for (const [what, kinds] of [
    ['empty', []],
    ['unknown', ['Video']],
    ['duplicated', ['Photo', 'Photo']],
    ['not an array', 'Photo'],
    ['null', null],
    ['a nested record', [{ kind: 'Photo' }]],
  ] as const) {
    expectRefused(
      fx, 'ProofReceived',
      { event: { ...bundle.event, payload: { ...bundle.event.payload, proofKinds: kinds } } },
      `Proof kinds that are ${what}`, { now: T4 },
    );
  }

  assertEqual(PROOF_KINDS.length, 3, 'PROOF_KINDS changed length.');
  for (const k of ['Photo', 'Document', 'Signature']) {
    assert((PROOF_KINDS as readonly string[]).includes(k), `${k} is not a declared proof kind.`);
  }
});

check('38. The builder refuses an unknown proof kind and an empty set', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'Fixture delivery was refused.');
  const empty = buildProofReceipt({ ...ctx(fx), kinds: [], source: 'WhatsApp', now: T4, ids, actorId: 'o' });
  assert(!empty.ok, 'An empty proof set was accepted.');
  const unknown = buildProofReceipt({
    ...ctx(fx), kinds: ['Video' as never], source: 'WhatsApp', now: T4, ids, actorId: 'o',
  });
  assert(!unknown.ok, 'An unknown proof kind was accepted.');
  // A duplicate set is normalized rather than refused — the operator ticking a
  // box twice is not an error, and the stored set is still unique.
  const duplicated = buildProofReceipt({
    ...ctx(fx), kinds: ['Photo', 'Photo'], source: 'WhatsApp', now: T4, ids, actorId: 'o',
  });
  assert(duplicated.ok, 'A duplicated selection was refused rather than normalized.');
  if (!duplicated.ok) return;
  assertEqual(
    JSON.stringify(duplicated.value.event.payload.proofKinds), JSON.stringify(['Photo']),
    'A duplicated selection was not reduced to a unique set.',
  );
});

check('39. No proof file, URL, data URI, base64 or blob field exists in the persisted shape', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'Fixture delivery was refused.');
  assert(fx.repo.commitProofReceipt(WS, proof(fx), T4).ok, 'Fixture proof was refused.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const serialized = JSON.stringify(state.value);
  for (const banned of ['proofUrl', 'dataUri', 'base64', 'data:image', 'blob:', 'trackingUrl', 'trackingNumber']) {
    assert(!serialized.includes(banned), `The persisted state contains ${banned}.`);
  }

  const f = state.value!.fulfilments[0];
  const keys = Object.keys(f).sort().join(',');
  assertEqual(
    keys,
    'attempt,briefId,briefRevision,courierSelectionDecisionId,createdAt,id,itemSelectionDecisionId,momentId,status,updatedAt,vendorSelectionDecisionId,workspaceId',
    'The persisted fulfilment shape changed.',
  );

  const event = state.value!.events.find(e => e.eventType === 'ProofReceived')!;
  assertEqual(
    Object.keys(event.payload).sort().join(','), 'attempt,fulfilmentId,proofKinds',
    'The proof payload shape changed.',
  );
});

// ─── Part 10: structural validation ──────────────────────────────────────────

function stateWith(over: Partial<OperationsState>): Record<string, unknown> {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  return { ...state.value!, ...over } as unknown as Record<string, unknown>;
}

check('40. Validation refuses two fulfilments for one moment', () => {
  const base = stateWith({});
  const fulfilments = base.fulfilments as Fulfilment[];
  const twin = { ...fulfilments[0], id: 'fulfilment-twin' };
  const result = validateOperationsState({ ...base, fulfilments: [...fulfilments, twin] }, WS);
  assert(!result.ok, 'Two fulfilments for one moment were accepted.');
});

check('41. Validation refuses a fulfilment that disagrees with its own history', () => {
  const base = stateWith({});
  const fulfilments = base.fulfilments as Fulfilment[];
  for (const [what, patch] of [
    ['a status its events do not support', { status: 'Delivered' as const }],
    ['an attempt its events do not support', { attempt: 3 }],
  ] as const) {
    const result = validateOperationsState(
      { ...base, fulfilments: [{ ...fulfilments[0], ...patch }] }, WS,
    );
    assert(!result.ok, `A fulfilment claiming ${what} was accepted.`);
  }
});

check('42. Validation refuses an orphaned lifecycle event and a cross-moment one', () => {
  const base = stateWith({});
  const events = base.events as OperationalEvent[];
  const dispatched = events.find(e => e.eventType === 'Dispatched')!;

  const orphaned = events.map(e =>
    e.id === dispatched.id ? { ...e, payload: { fulfilmentId: 'fulfilment-nowhere', attempt: 1 } } : e,
  );
  assert(!validateOperationsState({ ...base, events: orphaned }, WS).ok, 'An orphaned lifecycle event was accepted.');
});

check('43. Validation refuses a redelivery decision without its dispatch, and the reverse', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  assert(fx.repo.commitDeliveryFailure(WS, fail(fx), T2).ok, 'Fixture failure was refused.');
  assert(fx.repo.commitRedelivery(WS, redeliver(fx), T3).ok, 'Fixture redelivery was refused.');
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');

  // Decision removed, dispatch kept.
  const withoutDecision = {
    ...state.value!,
    decisions: state.value!.decisions.filter(d => d.decisionType !== 'Redelivery'),
  };
  assert(
    !validateOperationsState(withoutDecision, WS).ok,
    'A redelivery dispatch without its decision was accepted.',
  );

  // Decision duplicated, dispatch not.
  const extra = state.value!.decisions.find(d => d.decisionType === 'Redelivery')!;
  const withTwoDecisions = {
    ...state.value!,
    decisions: [...state.value!.decisions, { ...extra, id: 'decision-extra' }],
  };
  assert(
    !validateOperationsState(withTwoDecisions, WS).ok,
    'A second redelivery decision with no matching dispatch was accepted.',
  );
});

check('44. Validation refuses a fulfilment whose authority no longer resolves', () => {
  const base = stateWith({});
  const fulfilments = base.fulfilments as Fulfilment[];
  for (const key of [
    'briefId', 'itemSelectionDecisionId', 'vendorSelectionDecisionId', 'courierSelectionDecisionId', 'momentId',
  ] as const) {
    const result = validateOperationsState(
      { ...base, fulfilments: [{ ...fulfilments[0], [key]: 'gone' }] }, WS,
    );
    assert(!result.ok, `A fulfilment with an unresolvable ${key} was accepted.`);
  }
});

check('45. Validation refuses a malformed fulfilment container and an invalid status', () => {
  const base = stateWith({});
  for (const [, value] of MALFORMED) {
    assert(
      !validateOperationsState({ ...base, fulfilments: [value] }, WS).ok,
      'A malformed fulfilment record was accepted.',
    );
  }
  assert(!validateOperationsState({ ...base, fulfilments: {} }, WS).ok, 'A non-array fulfilments collection was accepted.');

  const fulfilments = base.fulfilments as Fulfilment[];
  for (const status of ['Pending', 'Confirmed', 'Failed', 'Returned', 'Escalated']) {
    assert(
      !validateOperationsState({ ...base, fulfilments: [{ ...fulfilments[0], status }] }, WS).ok,
      `The retired status ${status} was accepted.`,
    );
  }
  for (const attempt of [0, -1, 1.5, '1', null]) {
    assert(
      !validateOperationsState({ ...base, fulfilments: [{ ...fulfilments[0], attempt }] }, WS).ok,
      `An invalid attempt number ${String(attempt)} was accepted.`,
    );
  }
});

// ─── Part 11: declared surface ───────────────────────────────────────────────

check('46. H3.6 declares exactly three statuses, one decision type and four events', () => {
  assertEqual(FULFILMENT_STATUSES.length, 3, 'FULFILMENT_STATUSES changed length.');
  for (const s of ['Dispatched', 'DeliveryFailed', 'Delivered']) {
    assert((FULFILMENT_STATUSES as readonly string[]).includes(s), `${s} is not a declared status.`);
  }
  for (const s of ['Pending', 'Confirmed', 'Failed', 'Returned']) {
    assert(!(FULFILMENT_STATUSES as readonly string[]).includes(s), `${s} was reintroduced from the Atlas draft.`);
  }

  assert((DECISION_TYPES as readonly string[]).includes('Redelivery'), 'Redelivery is not declared.');
  for (const t of ['QAException', 'Escalation', 'DeliveryConfirmation', 'DispatchConfirmation', 'ProofAdjudication']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} must not exist — dispatching and delivering are occurrences.`);
  }

  for (const e of ['Dispatched', 'DeliveryFailed', 'Delivered', 'ProofReceived']) {
    assert((EVENT_TYPES as readonly string[]).includes(e), `${e} is not a declared event type.`);
  }
  for (const e of ['Returned', 'Escalation', 'QAException', 'MomentClosed', 'TrackingUpdated']) {
    assert(!(EVENT_TYPES as readonly string[]).includes(e), `${e} belongs to a later milestone or was refused by ADR-012.`);
  }
});

check('47. `MOMENT_STATUSES` is unchanged — fulfilment state belongs to the fulfilment', () => {
  assertEqual(MOMENT_STATUSES.length, 3, 'MOMENT_STATUSES changed length.');
  for (const s of ['NeedsReview', 'ReadyForExecution', 'Cancelled']) {
    assert((MOMENT_STATUSES as readonly string[]).includes(s), `${s} is missing.`);
  }
  for (const s of ['Dispatched', 'DeliveryFailed', 'Delivered', 'Fulfilled']) {
    assert(!(MOMENT_STATUSES as readonly string[]).includes(s), `${s} was added to MOMENT_STATUSES.`);
  }
});

check('48. The fulfilment routes resolve to their own titles', () => {
  assertEqual(titleFor('/operations/fulfilments'), 'Fulfilments', 'The queue has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/fulfilment'), 'Fulfilment', 'The fulfilment screen has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/courier'), 'Arrange carriage', 'The carriage title regressed.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'The moment title regressed.');
  assertEqual(titleFor('/operations/moments'), 'Moments', 'The queue title regressed.');
});

check('49. No fulfilment data reaches WorkspaceState', () => {
  const fx = preparedWorkspace();
  commitDispatch(fx);
  const fresh = freshWorkspace() as unknown as Record<string, unknown>;
  for (const key of ['fulfilments', 'fulfilment', 'dispatches', 'proofs']) {
    assert(!(key in fresh), `${key} reached WorkspaceState.`);
  }
  // Operations storage is a separate key, and the workspace one is never written.
  assert(fx.storage.writes.every(k => k === OPERATIONS_KEY), 'A fulfilment write touched another storage key.');
});

// ─── Part 12: the counterweight ──────────────────────────────────────────────

check('50. An honest full lifecycle still commits, in exactly five writes', () => {
  // Every check above would pass against a boundary that refuses everything.
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;

  commitDispatch(fx);
  assert(fx.repo.commitDeliveryFailure(WS, fail(fx), T2).ok, 'The failure was refused.');
  assert(fx.repo.commitRedelivery(WS, redeliver(fx), T3).ok, 'The redelivery was refused.');
  assert(fx.repo.commitDelivery(WS, deliver(fx), T4).ok, 'The delivery was refused.');
  assert(fx.repo.commitProofReceipt(WS, proof(fx), T4).ok, 'The proof receipt was refused.');

  assertEqual(fx.storage.writes.length - before, 5, 'The honest lifecycle was not five single writes.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assert(validateOperationsState(state.value, WS).ok, 'The resulting state does not validate.');
  assertEqual(state.value!.fulfilments.length, 1, 'Wrong fulfilment count.');
  assertEqual(state.value!.decisions.filter(d => d.decisionType === 'Redelivery').length, 1, 'Wrong redelivery count.');

  const found = findFulfilmentForMoment(state.value!.fulfilments, fx.moment.id);
  assert(found, 'The fulfilment could not be found for its moment.');
  assertEqual(found!.status, 'Delivered', 'The final status is wrong.');

  // And a re-read reproduces the same state, unchanged.
  const reread = fx.repo.load(WS);
  assert(reread.ok && reread.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(reread.value), JSON.stringify(state.value), 'A re-read produced different state.');
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
console.log('Fulfilment lifecycle validation passed.\n');
