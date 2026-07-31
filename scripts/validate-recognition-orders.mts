/**
 * Deterministic validation for H3.7 — the Recognition Order and commercial
 * tracking.
 *
 * Run with:  npm run validate:orders
 *
 * Covers ADR-013 (MerchantOfRecord, NGN-only, manual quotation, no FX, derived
 * margin), ADR-007 (integer minor units, one order per Moment, gross margin
 * derived and never stored), ADR-006 (nothing recorded until confirmation, one
 * atomic write per confirmation, corrections supersede rather than mutate), and
 * the additive OperationsState v7 → v8 migration.
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
  COMMERCIAL_ROLES,
  DECISION_TYPES,
  EVENT_TYPES,
  FORBIDDEN_ORDER_FIELDS,
  OPERATIONS_KEY,
  ORDER_CURRENCY,
  PILOT_COMMERCIAL_ROLE,
  RECOGNITION_ORDER_STATUSES,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type { Courier, Decision, Vendor } from '../lib/operations/types';
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
import { buildDelivery, buildInitialDispatch } from '../lib/operations/fulfilment';
import {
  buildOrderCommitment,
  buildReconciliation,
  commitmentFinalDecision,
  findOrderForMoment,
  grossMargin,
  previewRecognitionOrder,
  reconciliationFinalDecision,
  validateActuals,
  validateQuotation,
  verifyOrderWrite,
} from '../lib/operations/recognition-order';
import type { OrderWriteKind } from '../lib/operations/recognition-order';
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
function kes(major: number): Money { return { amountMinor: major * 100, currency: 'KES' }; }

const BUDGET = ngn(50_000);
const VENDOR_QUOTE = ngn(34_000);
const COURIER_QUOTE = ngn(4_500);
const QUOTATION = ngn(62_000);

const ITEM: CatalogItem = {
  id: 'fx-item', name: 'Hand-thrown ceramic set', description: '',
  category: 'Home & Living', isActive: true, price: ngn(38_000),
};
const FIXTURE_ITEMS: readonly CatalogItem[] = [ITEM];
const ADDRESS = { line1: '12 Adeola Odeku Street', city: 'Lagos', countryCode: 'NG' };

function freshWorkspace() {
  return createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
}

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

/**
 * A ready Moment with a confirmed brief and all three selections — the state an
 * order may be committed from. **No order is created here**; the tests do that.
 */
function preparedWorkspace() {
  const p = person({ id: 'p1' });
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage, { catalog: FIXTURE_ITEMS });
  repo.initialise(WS, NOW);

  const batch = buildMomentBatch(context([p]), ids, 'operator-1');
  assert(repo.createMoments(WS, batch, NOW).ok, 'Fixture failed to create moments.');
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
    vendor, quotedVendorCost: VENDOR_QUOTE, source: 'WhatsApp', quotedAt: QUOTED, leadTimeDays: 3,
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
    quote: { courier, quotedCourierCost: COURIER_QUOTE, source: 'WhatsApp', quotedAt: QUOTED, leadTimeDays: 2 },
    reason: 'Same-day from the vendor.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtCourier.ok, 'Fixture failed to choose a courier.');
  assert(repo.commitCourierSelection(WS, builtCourier.value, NOW).ok, 'Fixture failed to commit a courier selection.');

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
    orders: s.recognitionOrders,
    fulfilments: s.fulfilments,
    events: s.events.filter(e => e.momentId === fx.moment.id),
  };
}

function commitmentBundle(fx: Fx, charge = QUOTATION, now = NOW) {
  const built = buildOrderCommitment({
    ...ctx(fx),
    quotation: { estimatedCustomerCharge: charge, reason: 'Agreed rate for this programme.' },
    now, ids, actorId: 'operator-1',
  });
  assert(built.ok, `Commitment bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function commitOrder(fx: Fx, charge = QUOTATION, now = NOW) {
  const bundle = commitmentBundle(fx, charge, now);
  const written = fx.repo.commitRecognitionOrder(WS, bundle, now);
  assert(written.ok, `Commitment was refused: ${written.ok ? '' : written.reason}`);
  return { bundle, order: written.value };
}

/** Dispatch and deliver, so actuals may be confirmed. */
function deliverIt(fx: Fx) {
  const dispatched = buildInitialDispatch({ ...ctx(fx), now: T1, ids, actorId: 'operator-1' });
  assert(dispatched.ok, `Fixture dispatch failed: ${dispatched.ok ? '' : dispatched.reason}`);
  assert(fx.repo.commitInitialDispatch(WS, dispatched.value, T1).ok, 'Fixture dispatch was refused.');
  const delivered = buildDelivery({ ...ctx(fx), now: T2, ids, actorId: 'operator-1' });
  assert(delivered.ok, 'Fixture delivery failed.');
  assert(fx.repo.commitDelivery(WS, delivered.value, T2).ok, 'Fixture delivery was refused.');
}

function reconciliationBundle(
  fx: Fx,
  amounts = { vendor: ngn(33_000), courier: ngn(4_500), charge: ngn(62_000) },
  now = T3,
) {
  const built = buildReconciliation({
    ...ctx(fx),
    actuals: {
      actualVendorCost: amounts.vendor,
      actualCourierCost: amounts.courier,
      actualCustomerCharge: amounts.charge,
      reason: 'Invoices received.',
    },
    now, ids, actorId: 'operator-1',
  });
  assert(built.ok, `Reconciliation bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

type Commit = (write: unknown, now: string) => { ok: boolean; reason?: string };

function committer(fx: Fx, kind: 'Commitment' | 'Reconcile' | 'Correct'): Commit {
  const repo = fx.repo;
  if (kind === 'Commitment') return (w, now) => repo.commitRecognitionOrder(WS, w as never, now);
  if (kind === 'Reconcile') return (w, now) => repo.reconcileRecognitionOrder(WS, w as never, now);
  return (w, now) => repo.correctRecognitionOrderActuals(WS, w as never, now);
}

/** Submit, expect refusal, and prove **nothing moved**. */
function expectRefused(
  fx: Fx, kind: 'Commitment' | 'Reconcile' | 'Correct', write: unknown, what: string,
  opts: { recovery?: boolean; now?: string } = {},
): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const prior = {
    decisions: JSON.stringify(before.value!.decisions),
    events: JSON.stringify(before.value!.events),
    orders: JSON.stringify(before.value!.recognitionOrders),
    fulfilments: JSON.stringify(before.value!.fulfilments),
    briefs: JSON.stringify(before.value!.executionBriefs),
  };
  const priorWrites = fx.storage.writes.length;

  let written: { ok: boolean; reason?: string };
  try {
    written = committer(fx, kind)(write, opts.now ?? T3);
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
  assertEqual(JSON.stringify(after.value!.recognitionOrders), prior.orders, `${what} changed the orders.`);
  assertEqual(JSON.stringify(after.value!.fulfilments), prior.fulfilments, `${what} changed the fulfilments.`);
  assertEqual(JSON.stringify(after.value!.executionBriefs), prior.briefs, `${what} changed the briefs.`);
}

/** The direct verifier path — independently safe without a repository. */
function verifyDirect(fx: Fx, kind: OrderWriteKind, write: unknown) {
  const c = ctx(fx);
  return verifyOrderWrite({
    workspaceId: WS, moment: c.moment,
    briefs: c.brief ? [c.brief] : [],
    decisions: c.decisions, orders: c.orders, fulfilments: c.fulfilments,
    write, kind,
  });
}

function withInputs(bundle: { decision: Decision }, patch: Record<string, unknown>) {
  return { ...bundle, decision: { ...bundle.decision, inputs: { ...bundle.decision.inputs, ...patch } } };
}

console.log('\nH3.7 — Recognition Order and commercial tracking\n');

// ─── Part 1: persistence and migration ───────────────────────────────────────

check('1. The operations schema is at v8, and Workspace is untouched by it', () => {
  assertEqual(CURRENT_OPERATIONS_SCHEMA_VERSION, 8, 'Operations schema is not at v8.');
  const fresh = freshWorkspace() as unknown as Record<string, unknown>;
  for (const key of ['recognitionOrders', 'orders', 'commercialRole', 'grossMargin']) {
    assert(!(key in fresh), `${key} reached WorkspaceState.`);
  }
});

check('2. The v7 → v8 rung adds only an empty order collection', () => {
  const v7 = {
    schemaVersion: 7, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    executionBriefs: [{ id: 'b-old' }], vendors: [{ id: 'v-old' }], vendorOffers: [{ id: 'o-old' }],
    couriers: [{ id: 'c-old' }], fulfilments: [{ id: 'f-old' }],
    createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const before = JSON.stringify(v7);
  const result = migrateOperationsState(JSON.parse(before));
  assert(result.status === 'migrated', 'A v7 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 8, 'The migration did not reach v8.');
  assert(Array.isArray(result.state.recognitionOrders), 'The v7 → v8 rung did not add recognitionOrders.');
  assertEqual(result.state.recognitionOrders.length, 0, 'The migration invented an order.');

  const original = JSON.parse(before) as Record<string, unknown>;
  for (const k of [
    'moments', 'decisions', 'events', 'executionBriefs', 'vendors', 'vendorOffers', 'couriers', 'fulfilments',
  ] as const) {
    assertEqual(
      JSON.stringify((result.state as unknown as Record<string, unknown>)[k]),
      JSON.stringify(original[k]),
      `${k} were altered by the v7 → v8 rung.`,
    );
  }
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('3. A v1 payload walks every rung to v8 without losing history', () => {
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 8, 'Migration did not reach v8.');
  for (const k of ['executionBriefs', 'vendors', 'vendorOffers', 'couriers', 'fulfilments', 'recognitionOrders'] as const) {
    assert(Array.isArray((result.state as unknown as Record<string, unknown>)[k]), `The rung adding ${k} did not run.`);
  }
  assertEqual(result.state.moments.length, 1, 'A moment was lost in migration.');
  assertEqual(result.state.recognitionOrders.length, 0, 'The migration invented an order.');
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('4. Migration never backfills an order for a dispatched moment', () => {
  // The dangerous case: a v7 payload that already has a Fulfilment. A synthesised
  // order would assert a price nobody quoted.
  const v7 = {
    schemaVersion: 7, workspaceId: WS,
    moments: [{ id: 'm-1', sourceKey: 'k' }], decisions: [], events: [],
    executionBriefs: [], vendors: [], vendorOffers: [], couriers: [],
    fulfilments: [{ id: 'f-1', momentId: 'm-1', status: 'Delivered', attempt: 1 }],
    createdAt: T0, updatedAt: T0,
  };
  const result = migrateOperationsState(v7);
  assert(result.status === 'migrated', 'A v7 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.recognitionOrders.length, 0, 'The migration invented an order for a delivered moment.');
  assertEqual(result.state.fulfilments.length, 1, 'The migration altered the fulfilment.');
});

check('5. A v9 payload is refused rather than downgraded', () => {
  const v9 = { schemaVersion: 9, workspaceId: WS, moments: [], decisions: [], events: [] };
  assertEqual(migrateOperationsState(v9).status, 'invalid', 'A future version was adopted.');
});

check('6. Reads never rewrite storage', () => {
  const v7 = {
    schemaVersion: 7, workspaceId: WS, moments: [], decisions: [], events: [],
    executionBriefs: [], vendors: [], vendorOffers: [], couriers: [], fulfilments: [],
    createdAt: T0, updatedAt: T0,
  };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v7) });
  const repo = createLocalOperationsRepository(storage);
  assert(repo.load(WS).ok, 'A v7 payload could not be read.');
  assert(repo.listRecognitionOrders(WS).ok, 'Orders could not be listed.');
  assert(repo.findRecognitionOrderForMoment(WS, 'm-1').ok, 'An order lookup failed.');
  assertEqual(storage.writes.length, 0, 'A read rewrote storage.');
});

// ─── Part 2: nothing before confirmation ─────────────────────────────────────

check('7. A moment with a courier chosen but no confirmation has no order', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.recognitionOrders.length, 0, 'An order was persisted before confirmation.');
  const found = fx.repo.findRecognitionOrderForMoment(WS, fx.moment.id);
  assert(found.ok && found.value === null, 'A draft order exists.');
});

check('8. Previewing, validating and building write nothing', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  previewRecognitionOrder(ctx(fx));
  validateQuotation({ amount: '62000', reason: 'Because.' });
  validateActuals({ vendor: '1', courier: '2', charge: '3', reason: 'Because.' });
  buildOrderCommitment({
    ...ctx(fx), quotation: { estimatedCustomerCharge: QUOTATION, reason: 'x' },
    now: NOW, ids, actorId: 'operator-1',
  });
  assertEqual(fx.storage.writes.length, before, 'Previewing or building wrote to storage.');
});

check('9. Before commitment the one allowed action is create', () => {
  const fx = preparedWorkspace();
  const preview = previewRecognitionOrder(ctx(fx));
  assertEqual(preview.action, 'create', 'Creation was not offered.');
  assertEqual(preview.blockers.length, 0, 'A ready moment reported blockers.');
  assert(preview.order === null, 'An order appeared before confirmation.');
  assert(preview.authority !== null, 'The commercial authority was not read.');
  // The estimates come from the confirmed quotes, not the catalog.
  assertEqual(preview.authority!.estimatedVendorCost.amountMinor, VENDOR_QUOTE.amountMinor, 'Wrong vendor estimate.');
  assertEqual(preview.authority!.estimatedCourierCost.amountMinor, COURIER_QUOTE.amountMinor, 'Wrong courier estimate.');
  assertEqual(preview.authority!.approvedBudget.amountMinor, BUDGET.amountMinor, 'Wrong approved budget.');
  assert(
    preview.authority!.estimatedVendorCost.amountMinor !== ITEM.price.amountMinor,
    'The vendor estimate equals the catalog price — the fixture cannot prove they differ.',
  );
});

// ─── Part 3: the manual quotation ────────────────────────────────────────────

check('10. The quotation is never derived from the budget, costs or a percentage', () => {
  const fx = preparedWorkspace();
  const preview = previewRecognitionOrder(ctx(fx));
  const a = preview.authority!;

  // An empty draft yields no amount: nothing prefills it.
  const empty = validateQuotation({ amount: '', reason: 'x' });
  assert(!empty.ok, 'An empty quotation was accepted.');

  // Quotations unrelated to every candidate formula are all accepted.
  const derived = [
    a.approvedBudget.amountMinor,
    a.estimatedVendorCost.amountMinor + a.estimatedCourierCost.amountMinor,
    Math.round((a.estimatedVendorCost.amountMinor + a.estimatedCourierCost.amountMinor) * 1.25),
  ];
  for (const major of [1, 999, 62_000, 1_000_000]) {
    const checked = validateQuotation({ amount: String(major), reason: 'Because.' });
    assert(checked.ok, `A quotation of ${major} was refused.`);
    if (!checked.ok) continue;
    assertEqual(checked.value.estimatedCustomerCharge.amountMinor, major * 100, 'Major units were mis-parsed.');
  }
  // And a committed order stores exactly what was typed, never a formula result.
  const { order } = commitOrder(fx, ngn(7));
  assertEqual(order.estimatedCustomerCharge.amountMinor, 700, 'The stored quotation was not what was entered.');
  assert(
    !derived.includes(order.estimatedCustomerCharge.amountMinor),
    'The stored quotation coincides with a derived value.',
  );
});

check('11. A quotation below cost, above budget, and zero are all accepted', () => {
  for (const major of [0, 1, 500_000] as const) {
    const fx = preparedWorkspace();
    const { order } = commitOrder(fx, ngn(major));
    assertEqual(order.estimatedCustomerCharge.amountMinor, major * 100, `A quotation of ${major} was altered.`);
  }
});

check('12. A negative quotation and a blank reason are refused', () => {
  const negative = validateQuotation({ amount: '-1', reason: 'x' });
  assert(!negative.ok, 'A negative quotation was accepted.');
  const blank = validateQuotation({ amount: '100', reason: '   ' });
  assert(!blank.ok, 'A blank reason was accepted.');
});

// ─── Part 4: commitment, and its exact write ─────────────────────────────────

check('13. Commitment writes one order, one decision and one event, in one write', () => {
  const fx = preparedWorkspace();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = before.value!.decisions.length;
  const priorEvents = before.value!.events.length;
  const priorWrites = fx.storage.writes.length;

  const { order } = commitOrder(fx);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'Commitment was not a single write.');
  assertEqual(order.status, 'Committed', 'An order did not open as Committed.');
  assertEqual(order.commercialRole, PILOT_COMMERCIAL_ROLE, 'Wrong commercial role.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.recognitionOrders.length, 1, 'Wrong order count.');
  assertEqual(after.value!.decisions.length, priorDecisions + 1, 'Commitment did not record exactly one decision.');
  assertEqual(after.value!.events.length, priorEvents + 1, 'Commitment did not record exactly one event.');
  assertEqual(
    after.value!.decisions.filter(d => d.decisionType === 'RecognitionOrderCommitment').length, 1,
    'Wrong commitment decision count.',
  );
  const decision = after.value!.decisions.find(d => d.decisionType === 'RecognitionOrderCommitment')!;
  assertEqual(decision.status, 'Confirmed', 'The commitment decision is not Confirmed.');
  assertEqual(decision.provider, 'HumanOperator', 'The commitment is not an operator judgement.');
  assert(decision.reason.length > 0, 'The commitment has no reason.');
  assertEqual(decision.finalDecision, commitmentFinalDecision(QUOTATION), 'Wrong commitment summary.');
});

check('14. One order per moment — a duplicate is refused without a write', () => {
  const fx = preparedWorkspace();
  const { bundle } = commitOrder(fx);
  expectRefused(fx, 'Commitment', bundle, 'A replayed commitment', { now: NOW });
  const fresh = { ...bundle, order: { ...bundle.order, id: 'order-other' } };
  expectRefused(fx, 'Commitment', fresh, 'A second, differently-identified commitment', { now: NOW });

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.recognitionOrders.length, 1, 'More than one order exists for a moment.');
});

check('15. Structural validation refuses two orders for one moment', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const twin = { ...state.value!.recognitionOrders[0], id: 'order-twin' };
  const result = validateOperationsState(
    { ...state.value!, recognitionOrders: [...state.value!.recognitionOrders, twin] }, WS,
  );
  assert(!result.ok, 'Two orders for one moment were accepted.');
});

check('16. Commitment requires the current brief and live selection chain', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  for (const key of [
    'executionBriefId', 'itemSelectionDecisionId', 'vendorSelectionDecisionId', 'courierSelectionDecisionId',
  ] as const) {
    expectRefused(
      fx, 'Commitment', { ...bundle, order: { ...bundle.order, [key]: 'something-else' } },
      `A commitment with a wrong ${key}`, { now: NOW },
    );
  }
  expectRefused(
    fx, 'Commitment', { ...bundle, order: { ...bundle.order, briefRevision: 99 } },
    'A commitment with a wrong brief revision', { now: NOW },
  );
});

check('17. A commitment stamped with another workspace or moment is refused', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  expectRefused(
    fx, 'Commitment', { ...bundle, order: { ...bundle.order, workspaceId: OTHER_WS } },
    'A commitment for another workspace', { now: NOW },
  );
  expectRefused(
    fx, 'Commitment', { ...bundle, decision: { ...bundle.decision, workspaceId: OTHER_WS } },
    'A commitment whose decision names another workspace', { now: NOW },
  );
  const direct = verifyDirect(fx, 'Commitment', {
    ...bundle, order: { ...bundle.order, momentId: 'moment-elsewhere' },
  });
  assert(!direct.ok, 'The verifier accepted an order for another moment.');
});

check('18. A cancelled or unready moment cannot be committed', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  assert(fx.repo.updateMomentStatus(WS, fx.moment.id, 'Cancelled', T1, { cancelledAt: T1 }).ok, 'Fixture cancellation failed.');
  expectRefused(fx, 'Commitment', bundle, 'Committing a cancelled moment', { now: NOW });
});

check('19. Estimates that disagree with the confirmed budget or quotes are refused', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  for (const key of ['approvedBudget', 'estimatedVendorCost', 'estimatedCourierCost'] as const) {
    expectRefused(
      fx, 'Commitment', { ...bundle, order: { ...bundle.order, [key]: ngn(1) } },
      `A commitment with an altered ${key}`, { now: NOW },
    );
  }
  // And the Decision must agree with the order.
  expectRefused(
    fx, 'Commitment', withInputs(bundle, { estimatedCustomerCharge: ngn(1) }),
    'A commitment whose decision disagrees about the quotation', { now: NOW },
  );
  expectRefused(
    fx, 'Commitment', { ...bundle, decision: { ...bundle.decision, finalDecision: 'Quoted something else' } },
    'A commitment with a summary that does not describe the quotation', { now: NOW },
  );
});

// ─── Part 5: NGN only ────────────────────────────────────────────────────────

check('20. A non-NGN amount is refused everywhere, and never converted', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  for (const key of [
    'approvedBudget', 'estimatedVendorCost', 'estimatedCourierCost', 'estimatedCustomerCharge',
  ] as const) {
    expectRefused(
      fx, 'Commitment', { ...bundle, order: { ...bundle.order, [key]: kes(1_000) } },
      `A commitment with ${key} in KES`, { now: NOW },
    );
  }
  assertEqual(ORDER_CURRENCY, 'NGN', 'The pilot order currency changed.');
});

check('21. A non-NGN vendor or courier quote blocks creation with a named recovery', () => {
  // A courier quote in another currency cannot reach a confirmed selection —
  // H3.5 refuses it — so the honest test is that the preview refuses to build
  // authority from a non-NGN budget, and names it.
  const fx = preparedWorkspace();
  const c = ctx(fx);
  const foreignBrief = { ...c.brief!, approvedBudget: kes(50_000) };
  const preview = previewRecognitionOrder({ ...c, brief: foreignBrief });
  const blocker = preview.blockers.find(b => b.code === 'non-ngn-authority');
  assert(blocker, 'A non-NGN budget was not named as a blocker.');
  assert(/NGN/.test(blocker!.recovery), 'The recovery does not name the pilot currency.');
  assert(!/convert/i.test(blocker!.message), 'The message offers conversion.');
  assertEqual(preview.action, 'none', 'A non-NGN authority still offered creation.');
});

check('22. Structural validation refuses a stored non-NGN order', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const order = state.value!.recognitionOrders[0];
  for (const key of ['approvedBudget', 'estimatedVendorCost', 'estimatedCourierCost', 'estimatedCustomerCharge'] as const) {
    const result = validateOperationsState(
      { ...state.value!, recognitionOrders: [{ ...order, [key]: kes(1) }] }, WS,
    );
    assert(!result.ok, `A stored order with ${key} in KES was accepted.`);
  }
});

// ─── Part 6: the dispatch gate ───────────────────────────────────────────────

check('23. A new dispatch requires a committed order', () => {
  const fx = preparedWorkspace();
  const attempted = buildInitialDispatch({ ...ctx(fx), now: T1, ids, actorId: 'operator-1' });
  assert(!attempted.ok, 'A dispatch was built with no recognition order.');
  if (attempted.ok) return;
  assert(/Recognition Order/i.test(attempted.reason), `The refusal does not name the order: "${attempted.reason}"`);

  commitOrder(fx);
  const allowed = buildInitialDispatch({ ...ctx(fx), now: T1, ids, actorId: 'operator-1' });
  assert(allowed.ok, `A dispatch was refused after the order was committed: ${allowed.ok ? '' : allowed.reason}`);
});

check('24. A legacy fulfilment stays valid and readable, and cannot receive an invented order', () => {
  // A v7 world: delivered, with no order. This is prototype history.
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  /**
   * Strip the order **and its commercial Decisions and Event**, exactly as a v7
   * payload would have been — a world where commercial tracking never existed.
   * The Fulfilment, its lifecycle Events and every H3.1–H3.5 record survive.
   */
  const legacyDecisions = state.value!.decisions.filter(
    d => d.decisionType !== 'RecognitionOrderCommitment' && d.decisionType !== 'CostReconciliation',
  );
  const legacy = {
    ...state.value!,
    recognitionOrders: [],
    decisions: legacyDecisions,
    events: state.value!.events.filter(e => e.eventType !== 'RecognitionOrderCommitted'),
  };
  const structural = validateOperationsState(legacy, WS);
  assert(structural.ok, `A fulfilment without an order failed structural validation: ${structural.ok ? '' : structural.reason}`);
  assertEqual(legacy.fulfilments.length, 1, 'The legacy fulfilment was lost.');
  assertEqual(legacy.fulfilments[0].status, 'Delivered', 'The legacy fulfilment history changed.');

  const preview = previewRecognitionOrder({
    moment: state.value!.moments[0],
    brief: state.value!.executionBriefs[0],
    decisions: legacyDecisions,
    orders: [],
    fulfilments: state.value!.fulfilments,
  });
  assertEqual(preview.action, 'none', 'A legacy fulfilment was offered an order.');
  const blocker = preview.blockers.find(b => b.code === 'legacy-fulfilment');
  assert(blocker, 'The legacy limitation was not named.');
  assertEqual(
    blocker!.message,
    'Commercial authority was not recorded before this fulfilment began, so a Recognition Order cannot be reconstructed safely.',
    'The legacy message does not match the accepted wording.',
  );
});

check('25. The boundary refuses a commitment for an already-dispatched moment', () => {
  const donor = preparedWorkspace();
  const bundle = commitmentBundle(donor);
  commitOrder(donor);
  deliverIt(donor);
  const state = donor.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const direct = verifyOrderWrite({
    workspaceId: WS, moment: state.value!.moments[0],
    briefs: state.value!.executionBriefs,
    decisions: state.value!.decisions,
    orders: [], // as if none existed
    fulfilments: state.value!.fulfilments,
    write: bundle, kind: 'Commitment',
  });
  assert(!direct.ok, 'An order was accepted for an already-dispatched moment.');
});

// ─── Part 7: reconciliation ──────────────────────────────────────────────────

check('26. Actuals are refused before delivery', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  const attempted = buildReconciliation({
    ...ctx(fx),
    actuals: {
      actualVendorCost: ngn(1), actualCourierCost: ngn(1), actualCustomerCharge: ngn(1), reason: 'x',
    },
    now: T3, ids, actorId: 'operator-1',
  });
  assert(!attempted.ok, 'Actuals were built before delivery.');
});

check('27. Reconciliation writes one decision and one projection, in one write', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);

  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorEvents = before.value!.events.length;
  const priorWrites = fx.storage.writes.length;

  const written = fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3);
  assert(written.ok, `Reconciliation was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'Reconciliation was not a single write.');
  assertEqual(written.value.status, 'Reconciled', 'The order did not move to Reconciled.');
  assertEqual(written.value.actualVendorCost!.amountMinor, ngn(33_000).amountMinor, 'Wrong actual vendor cost.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  assertEqual(after.value!.events.length, priorEvents, 'Reconciliation appended an event.');
  assertEqual(
    after.value!.decisions.filter(d => d.decisionType === 'CostReconciliation').length, 1,
    'Wrong reconciliation decision count.',
  );
});

check('28. A double-submitted reconciliation is refused', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  const bundle = reconciliationBundle(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, bundle, T3).ok, 'The first reconciliation was refused.');
  expectRefused(fx, 'Reconcile', bundle, 'A double-submitted reconciliation', { recovery: false });
});

check('29. Immutable fields cannot change through reconciliation', () => {
  const fx = preparedWorkspace();
  const { order } = commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const after = state.value!.recognitionOrders[0];
  for (const key of [
    'id', 'workspaceId', 'momentId', 'executionBriefId', 'briefRevision',
    'itemSelectionDecisionId', 'vendorSelectionDecisionId', 'courierSelectionDecisionId',
    'commercialRole', 'createdAt',
  ] as const) {
    assertEqual(JSON.stringify(after[key]), JSON.stringify(order[key]), `${key} changed through reconciliation.`);
  }
  for (const key of ['approvedBudget', 'estimatedVendorCost', 'estimatedCourierCost', 'estimatedCustomerCharge'] as const) {
    assertEqual(JSON.stringify(after[key]), JSON.stringify(order[key]), `${key} changed through reconciliation.`);
  }
});

// ─── Part 8: corrections ─────────────────────────────────────────────────────

check('30. A correction writes one decision, supersedes the previous, and preserves it', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');

  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const first = before.value!.decisions.find(d => d.decisionType === 'CostReconciliation')!;
  const frozenFirst = JSON.stringify({ inputs: first.inputs, reason: first.reason, finalDecision: first.finalDecision });
  const priorWrites = fx.storage.writes.length;

  const correction = reconciliationBundle(fx, { vendor: ngn(30_000), courier: ngn(4_500), charge: ngn(62_000) });
  const written = fx.repo.correctRecognitionOrderActuals(WS, correction, T3);
  assert(written.ok, `The correction was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - priorWrites, 1, 'The correction was not a single write.');
  assertEqual(written.value.actualVendorCost!.amountMinor, ngn(30_000).amountMinor, 'The correction did not project.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  const superseded = after.value!.decisions.find(d => d.id === first.id)!;
  assertEqual(superseded.status, 'Superseded', 'The previous reconciliation was not superseded.');
  assertEqual(
    JSON.stringify({ inputs: superseded.inputs, reason: superseded.reason, finalDecision: superseded.finalDecision }),
    frozenFirst,
    'The superseded reconciliation was rewritten.',
  );
  assertEqual(superseded.supersededByDecisionId, correction.decision.id, 'Supersession does not point forward.');

  const live = after.value!.decisions.filter(d => d.decisionType === 'CostReconciliation' && d.status === 'Confirmed');
  assertEqual(live.length, 1, 'More than one live reconciliation exists.');
  assertEqual(
    JSON.stringify((live[0].inputs as Record<string, unknown>).previousActualVendorCost),
    JSON.stringify(ngn(33_000)),
    'The correction does not preserve the previous value.',
  );
});

check('31. A second correction preserves both earlier records in order', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');
  assert(
    fx.repo.correctRecognitionOrderActuals(
      WS, reconciliationBundle(fx, { vendor: ngn(30_000), courier: ngn(4_500), charge: ngn(62_000) }), T3,
    ).ok,
    'The first correction was refused.',
  );
  assert(
    fx.repo.correctRecognitionOrderActuals(
      WS, reconciliationBundle(fx, { vendor: ngn(31_000), courier: ngn(5_000), charge: ngn(62_000) }), T3,
    ).ok,
    'The second correction was refused.',
  );

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const all = state.value!.decisions.filter(d => d.decisionType === 'CostReconciliation');
  assertEqual(all.length, 3, 'Wrong reconciliation count after two corrections.');
  assertEqual(all.filter(d => d.status === 'Superseded').length, 2, 'Earlier records were not preserved as superseded.');
  assertEqual(all.filter(d => d.status === 'Confirmed').length, 1, 'More than one live reconciliation.');
  // Persisted order preserved: first, second, third.
  assertEqual(all[0].status, 'Superseded', 'The first record moved.');
  assertEqual(all[2].status, 'Confirmed', 'The newest record is not last.');

  const order = state.value!.recognitionOrders[0];
  assertEqual(order.actualVendorCost!.amountMinor, ngn(31_000).amountMinor, 'The order does not show the latest actuals.');
});

check('32. A correction that misstates what it replaces is refused', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');
  const correction = reconciliationBundle(fx, { vendor: ngn(30_000), courier: ngn(4_500), charge: ngn(62_000) });
  expectRefused(
    fx, 'Correct', withInputs(correction, { previousActualVendorCost: ngn(1) }),
    'A correction misstating the previous value',
  );
  expectRefused(
    fx, 'Correct', withInputs(correction, { supersedesDecisionId: 'decision-elsewhere' }),
    'A correction superseding the wrong decision',
  );
});

// ─── Part 9: derived margin ──────────────────────────────────────────────────

check('33. Margin is absent until all three actuals exist', () => {
  const fx = preparedWorkspace();
  const { order } = commitOrder(fx);
  assert(grossMargin(order) === null, 'A committed order produced a margin.');
  assert(grossMargin(null) === null, 'A missing order produced a margin.');
  assert(
    grossMargin({ ...order, actualVendorCost: ngn(1), actualCourierCost: ngn(1) }) === null,
    'A partial set of actuals produced a margin.',
  );
});

check('34. Margin arithmetic is exact, in integer minor units', () => {
  const fx = preparedWorkspace();
  const { order } = commitOrder(fx);
  const reconciled = {
    ...order,
    actualVendorCost: ngn(33_000),
    actualCourierCost: ngn(4_500),
    actualCustomerCharge: ngn(62_000),
    status: 'Reconciled' as const,
  };
  const margin = grossMargin(reconciled)!;
  assert(margin, 'No margin was produced.');
  assertEqual(margin.amountMinor, (62_000 - 33_000 - 4_500) * 100, 'Wrong margin.');
  assertEqual(margin.currency, 'NGN', 'Wrong margin currency.');

  // Sub-unit precision survives, because everything is integer kobo.
  const kobo = grossMargin({
    ...reconciled,
    actualCustomerCharge: { amountMinor: 6_200_001, currency: 'NGN' },
  })!;
  assertEqual(kobo.amountMinor, 6_200_001 - 3_300_000 - 450_000, 'Kobo precision was lost.');

  // A negative margin is a real outcome and is returned, not suppressed.
  const negative = grossMargin({ ...reconciled, actualCustomerCharge: ngn(1_000) })!;
  assert(negative.amountMinor < 0, 'A loss was not reported.');

  // A currency mismatch yields nothing rather than converting.
  assert(
    grossMargin({ ...reconciled, actualCourierCost: kes(1) }) === null,
    'A cross-currency margin was computed.',
  );
});

check('35. Correcting a cost changes the derived margin, with no second write', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');

  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const originalMargin = grossMargin(before.value!.recognitionOrders[0])!;
  assertEqual(originalMargin.amountMinor, (62_000 - 33_000 - 4_500) * 100, 'Wrong original margin.');
  const writesBefore = fx.storage.writes.length;

  assert(
    fx.repo.correctRecognitionOrderActuals(
      WS, reconciliationBundle(fx, { vendor: ngn(30_000), courier: ngn(4_500), charge: ngn(62_000) }), T3,
    ).ok,
    'The correction was refused.',
  );
  // **One** write for the whole correction — no separate margin update.
  assertEqual(fx.storage.writes.length - writesBefore, 1, 'The correction took more than one write.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State unreadable.');
  const newMargin = grossMargin(after.value!.recognitionOrders[0])!;
  assertEqual(newMargin.amountMinor, (62_000 - 30_000 - 4_500) * 100, 'The margin did not follow the correction.');
  assert(newMargin.amountMinor !== originalMargin.amountMinor, 'The margin did not change.');
});

check('36. Margin is never stored, under any name, anywhere', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const serialized = JSON.stringify(state.value);
  for (const banned of ['grossMargin', '"margin"', 'profit', 'amountPaid', 'paymentStatus', 'invoiceId', 'fxRate', 'exchangeRate', 'settlementCurrency']) {
    assert(!serialized.includes(banned), `The persisted state contains ${banned}.`);
  }

  const order = state.value!.recognitionOrders[0];
  assertEqual(
    Object.keys(order).sort().join(','),
    'actualCourierCost,actualCustomerCharge,actualVendorCost,approvedBudget,briefRevision,commercialRole,courierSelectionDecisionId,createdAt,estimatedCourierCost,estimatedCustomerCharge,estimatedVendorCost,executionBriefId,id,itemSelectionDecisionId,momentId,status,updatedAt,vendorSelectionDecisionId,workspaceId',
    'The persisted order shape changed.',
  );
});

// ─── Part 10: runtime containers and forbidden fields ────────────────────────

const MALFORMED: readonly [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['an array', []],
  ['a string', 'commit'],
  ['a number', 7],
  ['a boolean', true],
];

check('37. A malformed bundle is refused, not thrown — every operation', () => {
  for (const kind of ['Commitment', 'Reconcile', 'Correct'] as const) {
    const fx = preparedWorkspace();
    if (kind !== 'Commitment') { commitOrder(fx); deliverIt(fx); }
    if (kind === 'Correct') {
      assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Fixture reconciliation failed.');
    }
    for (const [what, value] of MALFORMED) {
      expectRefused(fx, kind, value, `${kind} with a bundle that is ${what}`);
    }
  }
});

check('38. A malformed order, decision, inputs or nested Money is refused, not thrown', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  for (const [what, value] of MALFORMED) {
    expectRefused(fx, 'Commitment', { ...bundle, order: value }, `A commitment whose order is ${what}`, { now: NOW });
    expectRefused(fx, 'Commitment', { ...bundle, decision: value }, `A commitment whose decision is ${what}`, { now: NOW });
    expectRefused(
      fx, 'Commitment', { ...bundle, decision: { ...bundle.decision, inputs: value } },
      `A commitment whose inputs are ${what}`, { now: NOW },
    );
    expectRefused(
      fx, 'Commitment', { ...bundle, order: { ...bundle.order, approvedBudget: value } },
      `A commitment whose budget is ${what}`, { now: NOW },
    );
    expectRefused(
      fx, 'Commitment', { ...bundle, event: value },
      `A commitment whose event is ${what}`, { now: NOW },
    );
  }
});

check('39. The direct verifier is independently safe, with no repository at all', () => {
  const fx = preparedWorkspace();
  for (const kind of ['Commitment', 'Reconciliation'] as const) {
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

check('40. Every forbidden commercial field is refused at the write boundary', () => {
  for (const forbidden of FORBIDDEN_ORDER_FIELDS) {
    const fx = preparedWorkspace();
    const bundle = commitmentBundle(fx);
    expectRefused(
      fx, 'Commitment', { ...bundle, order: { ...bundle.order, [forbidden]: 1 } },
      `A commitment carrying ${forbidden}`, { now: NOW },
    );
    const state = fx.repo.load(WS);
    assert(state.ok && state.value, 'State unreadable.');
    assert(!JSON.stringify(state.value).includes(forbidden), `${forbidden} reached storage.`);
  }
});

check('41. Extra keys on nested Money, inputs and the event payload are refused', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  expectRefused(
    fx, 'Commitment',
    { ...bundle, order: { ...bundle.order, approvedBudget: { ...BUDGET, fxRate: 1 } } },
    'A commitment whose Money carries fxRate', { now: NOW },
  );
  expectRefused(
    fx, 'Commitment', withInputs(bundle, { serviceFee: ngn(1) }),
    'A commitment whose inputs carry a service fee', { now: NOW },
  );
  expectRefused(
    fx, 'Commitment',
    { ...bundle, event: { ...bundle.event, payload: { ...bundle.event.payload, invoiceId: 'x' } } },
    'A commitment whose event payload carries an invoice id', { now: NOW },
  );
  expectRefused(
    fx, 'Commitment', { ...bundle, unexpected: true },
    'A commitment bundle carrying an unexpected key', { now: NOW },
  );
});

check('42. Only MerchantOfRecord may be written', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx);
  for (const role of COMMERCIAL_ROLES.filter(r => r !== PILOT_COMMERCIAL_ROLE)) {
    expectRefused(
      fx, 'Commitment', { ...bundle, order: { ...bundle.order, commercialRole: role } },
      `A commitment recording ${role}`, { now: NOW },
    );
  }
  // And a stored order with another role is structurally invalid.
  commitOrder(fx);
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  for (const role of ['Agent', 'Unspecified']) {
    const result = validateOperationsState(
      { ...state.value!, recognitionOrders: [{ ...state.value!.recognitionOrders[0], commercialRole: role }] }, WS,
    );
    assert(!result.ok, `A stored order recording ${role} was accepted.`);
  }
});

check('43. Stale-form revalidation: a brief corrected after the form opened refuses the write', () => {
  const fx = preparedWorkspace();
  const bundle = commitmentBundle(fx); // built against the current chain
  // The item selection is superseded while the screen sits open.
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const item = state.value!.decisions.find(d => d.decisionType === 'ItemSelection')!;
  const qualification = state.value!.decisions.find(d => d.decisionType === 'MomentQualification')!;
  const superseded = fx.repo.supersedeDecision(WS, item.id, qualification.id, T1);
  assert(superseded.ok, `Fixture supersession failed: ${superseded.ok ? '' : superseded.reason}`);
  expectRefused(fx, 'Commitment', bundle, 'A commitment built against a superseded item selection', { now: NOW });
});

// ─── Part 11: declared surface ───────────────────────────────────────────────

check('44. H3.7 declares two decision types, one event and two statuses', () => {
  for (const t of ['RecognitionOrderCommitment', 'CostReconciliation']) {
    assert((DECISION_TYPES as readonly string[]).includes(t), `${t} is not a declared decision type.`);
  }
  assert((EVENT_TYPES as readonly string[]).includes('RecognitionOrderCommitted'), 'RecognitionOrderCommitted is not declared.');
  // H3.8 and the excluded commercial mechanisms must not be pre-empted.
  for (const t of ['MomentClosure', 'MemoryWritten', 'PaymentReceived', 'InvoiceIssued', 'RefundIssued']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone or is excluded.`);
  }
  for (const e of ['MomentClosed', 'PaymentReceived', 'InvoiceIssued', 'OrderCancelled']) {
    assert(!(EVENT_TYPES as readonly string[]).includes(e), `${e} belongs to a later milestone or is excluded.`);
  }

  assertEqual(RECOGNITION_ORDER_STATUSES.length, 2, 'RECOGNITION_ORDER_STATUSES changed length.');
  for (const s of ['Committed', 'Reconciled']) {
    assert((RECOGNITION_ORDER_STATUSES as readonly string[]).includes(s), `${s} is not a declared status.`);
  }
  for (const s of ['Draft', 'Cancelled', 'Invoiced', 'Paid', 'Settled']) {
    assert(!(RECOGNITION_ORDER_STATUSES as readonly string[]).includes(s), `${s} must not exist.`);
  }
});

check('45. The order routes resolve to their own titles', () => {
  assertEqual(titleFor('/operations/orders'), 'Orders', 'The queue has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/order'), 'Recognition Order', 'The order screen has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/fulfilment'), 'Fulfilment', 'The fulfilment title regressed.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'The moment title regressed.');
});

check('46. No commercial data reaches WorkspaceState', () => {
  const fx = preparedWorkspace();
  commitOrder(fx);
  deliverIt(fx);
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');
  const fresh = JSON.stringify(freshWorkspace());
  for (const banned of ['recognitionOrders', 'commercialRole', 'grossMargin', 'actualVendorCost', 'MerchantOfRecord']) {
    assert(!fresh.includes(banned), `${banned} reached WorkspaceState.`);
  }
  assert(fx.storage.writes.every(k => k === OPERATIONS_KEY), 'A commercial write touched another storage key.');
});

// ─── Part 12: the counterweight ──────────────────────────────────────────────

check('47. An honest end-to-end commercial lifecycle still commits', () => {
  // Every check above would pass against a boundary that refuses everything.
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;

  commitOrder(fx);
  deliverIt(fx); // two writes: dispatch, delivery
  assert(fx.repo.reconcileRecognitionOrder(WS, reconciliationBundle(fx), T3).ok, 'Reconciliation was refused.');
  assert(
    fx.repo.correctRecognitionOrderActuals(
      WS, reconciliationBundle(fx, { vendor: ngn(30_000), courier: ngn(4_500), charge: ngn(62_000) }), T3,
    ).ok,
    'The correction was refused.',
  );
  assertEqual(fx.storage.writes.length - before, 5, 'The honest lifecycle was not five single writes.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assert(validateOperationsState(state.value, WS).ok, 'The resulting state does not validate.');

  const order = findOrderForMoment(state.value!.recognitionOrders, fx.moment.id)!;
  assert(order, 'The order could not be found for its moment.');
  assertEqual(order.status, 'Reconciled', 'Wrong final status.');
  const margin = grossMargin(order)!;
  assertEqual(margin.amountMinor, (62_000 - 30_000 - 4_500) * 100, 'Wrong final margin.');

  const live = state.value!.decisions.find(d => d.decisionType === 'CostReconciliation' && d.status === 'Confirmed')!;
  assertEqual(live.finalDecision, reconciliationFinalDecision(margin), 'The live summary does not match the margin.');

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
console.log('Recognition Order validation passed.\n');
