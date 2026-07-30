/**
 * Deterministic validation for H3.5 — the courier directory, per-country
 * coverage and manual courier selection.
 *
 * Run with:  npm run validate:couriers
 *
 * Covers the recording rule (ADR-006), Money (ADR-007: exact currency, no FX, no
 * negative amounts), the repository trust boundary with the recursive exactness
 * H3.4-D2 established, and the additive OperationsState v4 → v5 migration.
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
  OPERATIONS_KEY,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type { Courier, Decision, OperationalEvent, OperationsState, Vendor } from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import type { GenerationContext } from '../lib/operations/generation';
import { buildMomentBatch } from '../lib/operations/generation';
import { buildBriefConfirmation } from '../lib/operations/briefs';
import { buildItemSelection } from '../lib/operations/selection';
import { buildVendor, validateVendorDraft } from '../lib/operations/vendors';
import { buildVendorSelection } from '../lib/operations/vendor-selection';
import type { NormalizedOffer } from '../lib/operations/vendor-selection';
import {
  COURIER_KEYS,
  applyCourierEdit,
  buildCourier,
  canonicalCourier,
  courierCoverage,
  couriersFor,
  coverageGaps,
  filterCouriers,
  snapshotCourier,
  validateCourierDraft,
} from '../lib/operations/couriers';
import type { CourierDraft } from '../lib/operations/couriers';
import {
  buildCourierSelection,
  courierFinalDecision,
  emptyCourierQuoteDraft,
  previewCourierSelection,
  validateCourierQuote,
} from '../lib/operations/courier-selection';
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
const LATER = '2026-08-02T00:00:00.000Z';
const QUOTED = '2026-07-28T00:00:00.000Z';
const WS = 'org-1';

let n = 0;
const ids = {
  moment: () => `moment-${++n}`,
  decision: () => `decision-${++n}`,
  event: () => `event-${++n}`,
  brief: () => `brief-${++n}`,
  offer: () => `offer-${++n}`,
};

function ngn(major: number): Money { return { amountMinor: major * 100, currency: 'NGN' }; }

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
function policy(): RecognitionPolicy {
  return {
    id: 'policy-global', workspaceId: WS, name: 'Global Recognition', description: '',
    recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: BUDGET, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status: 'Published', version: 4,
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
function context(people: Person[]): GenerationContext {
  return {
    workspaceId: WS, program: activeCampaign(people.map(p => p.id)), people,
    classes: [cls()], assignments: [assignment()], policies: [policy()],
    existingSourceKeys: new Map(), now: NOW,
  };
}

const GOOD_COURIER_DRAFT: CourierDraft = {
  name: 'Swift Dispatch', countryCode: 'ng', whatsapp: '+234 801 234 5678', email: '', note: 'Same-day within Lagos',
};

function courierRecord(id: string, over: Partial<Courier> = {}): Courier {
  const checked = validateCourierDraft({ ...GOOD_COURIER_DRAFT, name: `Courier ${id}` });
  assert(checked.ok, 'Fixture courier draft is invalid.');
  return { ...buildCourier(checked.value, id, WS, T0), ...over };
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
 * A workspace carrying a ready Moment with a confirmed brief, item selection
 * **and** vendor selection — the only state a courier may be chosen from — plus
 * a courier directory.
 */
function preparedWorkspace(over: { couriers?: Courier[] } = {}) {
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
    vendor, quotedVendorCost: ngn(34_000), source: 'WhatsApp', quotedAt: QUOTED, leadTimeDays: 3,
  }];
  const builtVendor = buildVendorSelection({
    moment, brief, decisions: s1.value!.decisions.filter(d => d.momentId === moment.id),
    vendors: [vendor], offers, selectedIndex: 0, reason: 'Only one asked.',
    now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtVendor.ok, `Fixture failed to choose a vendor: ${builtVendor.ok ? '' : builtVendor.reason}`);
  assert(repo.commitVendorSelection(WS, builtVendor.value, NOW).ok, 'Fixture failed to commit a vendor selection.');

  const couriers = over.couriers ?? [courierRecord('c1'), courierRecord('c2')];
  for (const c of couriers) {
    assert(repo.createCourier(WS, c, NOW).ok, `Fixture failed to add ${c.id}.`);
  }

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Fixture state unreadable.');
  return {
    repo, storage, moment, brief, couriers, vendor,
    itemDecisionId: builtItem.value.decision.id,
    vendorDecisionId: builtVendor.value.decision.id,
    decisions: state.value!.decisions.filter(d => d.momentId === moment.id),
  };
}

type Fx = ReturnType<typeof preparedWorkspace>;
type Bundle = { decision: Decision; event: OperationalEvent };

function ctx(fx: Fx, over: Record<string, unknown> = {}) {
  return { moment: fx.moment, brief: fx.brief, decisions: fx.decisions, couriers: fx.couriers, ...over };
}

function quote(fx: Fx, index = 0, amountMajor = 4_500) {
  return {
    courier: fx.couriers[index], quotedCourierCost: ngn(amountMajor),
    source: 'WhatsApp' as const, quotedAt: QUOTED, leadTimeDays: 2, terms: 'Collects before 3pm',
  };
}

function build(fx: Fx, over: Record<string, unknown> = {}) {
  return buildCourierSelection({
    ...ctx(fx), quote: quote(fx), reason: 'Only one collecting from the vendor same-day.',
    now: NOW, ids, actorId: 'operator-1', ...over,
  });
}

function goodBundle(fx: Fx): Bundle {
  const built = build(fx);
  assert(built.ok, `Fixture bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

function withInputs(b: Bundle, patch: Record<string, unknown>): Bundle {
  return { ...b, decision: { ...b.decision, inputs: { ...b.decision.inputs, ...patch } } };
}

/** Submit, expect refusal, and prove **nothing moved**. */
function expectRefused(fx: Fx, bundle: Bundle, what: string): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = JSON.stringify(before.value!.decisions);
  const priorEvents = JSON.stringify(before.value!.events);
  const priorCouriers = JSON.stringify(before.value!.couriers);
  const priorWrites = fx.storage.writes.length;

  const written = fx.repo.commitCourierSelection(WS, bundle, NOW);
  assert(!written.ok, `${what} was accepted.`);
  if (!written.ok) {
    assert(written.reason.toLowerCase().includes('nothing was recorded'),
      `${what} was refused without saying nothing was recorded: "${written.reason}"`);
  }

  assertEqual(fx.storage.writes.length, priorWrites, `${what} still wrote to storage.`);
  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(after.value!.decisions), priorDecisions, `${what} changed the decisions.`);
  assertEqual(JSON.stringify(after.value!.events), priorEvents, `${what} changed the events.`);
  assertEqual(JSON.stringify(after.value!.couriers), priorCouriers, `${what} changed the directory.`);
}

function expectCourierRefused(fx: Fx, courier: unknown, what: string, mode: 'create' | 'update' = 'create'): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const prior = JSON.stringify(before.value!.couriers);
  const priorWrites = fx.storage.writes.length;

  const written = mode === 'create'
    ? fx.repo.createCourier(WS, courier as Courier, NOW)
    : fx.repo.updateCourier(WS, courier as Courier, LATER);
  assert(!written.ok, `${what} was accepted.`);
  assertEqual(fx.storage.writes.length, priorWrites, `${what} still wrote to storage.`);
  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(after.value!.couriers), prior, `${what} changed the directory.`);
}

console.log('\nCourier directory and selection (H3.5) — validation\n');

// ─── Part 1: the directory ───────────────────────────────────────────────────

check('1. A valid courier draft normalizes and builds', () => {
  const checked = validateCourierDraft(GOOD_COURIER_DRAFT);
  assert(checked.ok, 'A valid draft was refused.');
  if (!checked.ok) return;
  assertEqual(checked.value.countryCode, 'NG', 'The country code was not normalized to uppercase.');
  assertEqual(checked.value.email, undefined, 'An empty email was stored as a value.');
  const c = buildCourier(checked.value, 'c-new', WS, NOW);
  assert(c.isActive, 'A new courier is not active.');
  assertEqual(c.workspaceId, WS, 'The courier was not scoped to the workspace.');
});

check('2. Country is required, and so is a contact method', () => {
  for (const [patch, field] of [
    [{ countryCode: '' }, 'countryCode'],
    [{ countryCode: 'NGA' }, 'countryCode'],
    [{ name: '  ' }, 'name'],
  ] as const) {
    const r = validateCourierDraft({ ...GOOD_COURIER_DRAFT, ...patch });
    assert(!r.ok, `${JSON.stringify(patch)} was accepted.`);
    if (!r.ok) assert(r.errors[field as 'name'], `The ${field} error was not named.`);
  }
  const none = validateCourierDraft({ ...GOOD_COURIER_DRAFT, whatsapp: '', email: '' });
  assert(!none.ok, 'A courier with no contact method was accepted.');
  const emailOnly = validateCourierDraft({ ...GOOD_COURIER_DRAFT, whatsapp: '', email: 'd@c.example' });
  assert(emailOnly.ok, 'Email alone was refused.');
  const badEmail = validateCourierDraft({ ...GOOD_COURIER_DRAFT, whatsapp: '', email: 'nope' });
  assert(!badEmail.ok, 'A malformed email was accepted.');
});

check('3. Saving a courier performs exactly one write', () => {
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(WS, NOW);
  const before = storage.writes.length;
  assert(repo.createCourier(WS, courierRecord('c1'), NOW).ok, 'Create failed.');
  assertEqual(storage.writes.length - before, 1, 'Saving a courier was not a single write.');
  const list = repo.listCouriers(WS);
  assert(list.ok && list.value.length === 1, 'The courier was not stored.');
});

check('4. Browsing, filtering and validating write nothing', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  for (let i = 0; i < 5; i++) {
    validateCourierDraft(GOOD_COURIER_DRAFT);
    validateCourierDraft({ ...GOOD_COURIER_DRAFT, name: '' });
    filterCouriers(fx.couriers, 'ng');
    couriersFor(fx.couriers, 'NG');
    previewCourierSelection(ctx(fx));
  }
  fx.repo.listCouriers(WS);
  fx.repo.findCourier(WS, 'c1');
  fx.repo.findLiveCourierSelection(WS, fx.moment.id);
  assertEqual(fx.storage.writes.length, before, 'Browsing wrote to storage.');
});

check('5. An edit cannot reassign, resurrect or backdate a courier', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.setCourierActive(WS, 'c1', false, NOW).ok, 'Deactivate failed.');
  const stored = fx.repo.findCourier(WS, 'c1');
  assert(stored.ok && stored.value, 'Courier missing.');
  const checked = validateCourierDraft({ ...GOOD_COURIER_DRAFT, name: 'Renamed', countryCode: 'KE' });
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;
  const tampered = { ...applyCourierEdit(stored.value!, checked.value, LATER), isActive: true, createdAt: LATER };
  const written = fx.repo.updateCourier(WS, tampered, LATER);
  assert(written.ok, 'Update failed.');
  if (!written.ok) return;
  assertEqual(written.value.name, 'Renamed', 'The edit did not apply.');
  assertEqual(written.value.countryCode, 'KE', 'The country edit did not apply.');
  assertEqual(written.value.isActive, false, 'An edit resurrected a deactivated courier.');
  assertEqual(written.value.createdAt, T0, 'An edit rewrote when the courier was added.');
});

check('6. Deactivation is reversible, and there is no hard delete', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.setCourierActive(WS, 'c1', false, NOW).ok, 'Deactivate failed.');
  const list = fx.repo.listCouriers(WS);
  assert(list.ok && list.value.length === 2, 'Deactivation removed the record.');
  assert(fx.repo.setCourierActive(WS, 'c1', true, LATER).ok, 'Reactivate failed.');
  assert(!('deleteCourier' in fx.repo), 'A courier delete operation exists.');
  assert(!('removeCourier' in fx.repo), 'A courier remove operation exists.');
});

check('7. Undeclared courier fields are refused, and the record is rebuilt', () => {
  const fx = preparedWorkspace();
  for (const patch of [
    { rateCard: [{ zone: 'A', price: 1 }] }, { trackingApiKey: 'secret' }, { serviceLevel: 'express' },
    { reliabilityScore: 0.9 }, { transitModel: {} }, { zones: ['A'] },
  ]) {
    expectCourierRefused(fx, { ...courierRecord('c-new'), ...patch }, `A courier carrying ${Object.keys(patch)[0]}`);
  }
  const stored = fx.repo.findCourier(WS, 'c1');
  assert(stored.ok && stored.value, 'Courier missing.');
  expectCourierRefused(fx, { ...stored.value!, rateCard: [] }, 'An edit adding a rate card', 'update');

  const clean = canonicalCourier(courierRecord('c-y'), WS);
  assert(clean.ok, 'A clean courier failed canonicalisation.');
  if (!clean.ok) return;
  for (const k of Object.keys(clean.value)) {
    assert((COURIER_KEYS as readonly string[]).includes(k), `Rebuilt courier carries an undeclared "${k}".`);
  }
});

check('8. Malformed contact, country, timestamps and workspace are refused', () => {
  const fx = preparedWorkspace();
  expectCourierRefused(fx, { ...courierRecord('c-new'), whatsapp: undefined, email: 'not-an-address' }, 'A malformed email');
  expectCourierRefused(fx, { ...courierRecord('c-new'), whatsapp: undefined, email: undefined }, 'An unreachable courier');
  expectCourierRefused(fx, { ...courierRecord('c-new'), note: 42 }, 'A numeric note');
  expectCourierRefused(fx, { ...courierRecord('c-new'), countryCode: 'NGA' }, 'A three-letter country code');
  for (const bad of ['banana', '2026-08-01', '2026-08-01T00:00:00Z', '2026-02-30T00:00:00.000Z']) {
    expectCourierRefused(fx, { ...courierRecord('c-new'), createdAt: bad }, `A createdAt of ${bad}`);
  }
  expectCourierRefused(fx, { ...courierRecord('c-new'), workspaceId: 'org-elsewhere' }, 'A foreign-workspace courier');
});

check('9. Structural validation refuses malformed stored couriers', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const base = state.value!;
  for (const [patch, label] of [
    [{ email: 'not-an-address' }, 'a malformed email'],
    [{ countryCode: 'NGA' }, 'a three-letter code'],
    [{ whatsapp: undefined, email: undefined }, 'no contact method'],
    [{ createdAt: 'banana' }, 'an unreadable createdAt'],
    [{ isActive: 'yes' as unknown as boolean }, 'a non-boolean active state'],
  ] as const) {
    const broken = JSON.parse(JSON.stringify(base)) as OperationsState;
    Object.assign(broken.couriers[0], patch);
    if ('whatsapp' in patch) { delete broken.couriers[0].whatsapp; delete broken.couriers[0].email; }
    assert(!validateOperationsState(broken, WS).ok, `Validation accepted ${label}.`);
  }
});

// ─── Part 2: coverage — the named gap ────────────────────────────────────────

check('10. Coverage names every delivery country and whether anyone carries there', () => {
  const couriers = [courierRecord('c-ng'), courierRecord('c-ke', { countryCode: 'KE' })];
  const coverage = courierCoverage(['NG', 'NG', 'KE', 'GH'], couriers);
  assertEqual(coverage.length, 3, 'Wrong number of countries.');
  assertEqual(coverage.map(c => c.countryCode).join(','), 'GH,KE,NG', 'Coverage is not deterministically ordered.');
  assertEqual(coverage.find(c => c.countryCode === 'NG')!.briefCount, 2, 'Brief counts are wrong.');
  assertEqual(coverage.find(c => c.countryCode === 'NG')!.activeCouriers, 1, 'NG coverage is wrong.');
  assertEqual(coverage.find(c => c.countryCode === 'GH')!.activeCouriers, 0, 'GH should have no courier.');

  const gaps = coverageGaps(coverage);
  assertEqual(gaps.length, 1, 'The gap was not named.');
  assertEqual(gaps[0].countryCode, 'GH', 'The wrong country was named as a gap.');
});

check('11. A deactivated courier does not count as coverage', () => {
  const couriers = [courierRecord('c-ng', { isActive: false })];
  const coverage = courierCoverage(['NG'], couriers);
  assertEqual(coverage[0].activeCouriers, 0, 'A deactivated courier counted as coverage.');
  assertEqual(coverageGaps(coverage).length, 1, 'The gap was not named.');
});

check('12. Couriers are offered per country, alphabetically, and never ranked', () => {
  const couriers = [
    courierRecord('c-z', { name: 'Zephyr' }), courierRecord('c-a', { name: 'Apex' }),
    courierRecord('c-ke', { name: 'Nairobi Run', countryCode: 'KE' }),
    courierRecord('c-off', { name: 'Dormant', isActive: false }),
  ];
  const ng = couriersFor(couriers, 'NG');
  assertEqual(ng.map(c => c.name).join(','), 'Apex,Zephyr', 'Wrong set or order for NG.');
  assertEqual(couriersFor(couriers, 'KE').map(c => c.name).join(','), 'Nairobi Run', 'Wrong set for KE.');
  assertEqual(couriersFor(couriers, 'GH').length, 0, 'A courier was offered for a country nobody serves.');
});

// ─── Part 3: the gate ────────────────────────────────────────────────────────

check('13. No confirmed brief, item or vendor blocks carriage', () => {
  const fx = preparedWorkspace();

  const noBrief = previewCourierSelection(ctx(fx, { brief: null }));
  assert(!noBrief.selectable, 'Carriage was allowed with no brief.');
  assert(noBrief.blockers.some(b => b.code === 'no-confirmed-brief'), 'The missing brief was not named.');

  const noItem = previewCourierSelection(ctx(fx, {
    decisions: fx.decisions.filter(d => d.decisionType !== 'ItemSelection'),
  }));
  assert(!noItem.selectable, 'Carriage was allowed with no item.');
  assert(noItem.blockers.some(b => b.code === 'no-item-selection'), 'The missing item was not named.');

  const noVendor = previewCourierSelection(ctx(fx, {
    decisions: fx.decisions.filter(d => d.decisionType !== 'VendorSelection'),
  }));
  assert(!noVendor.selectable, 'Carriage was allowed with no vendor.');
  const blocker = noVendor.blockers.find(b => b.code === 'no-vendor-selection');
  assert(blocker, 'The missing vendor was not named.');
  assertEqual(blocker!.href, `/operations/moments/${fx.moment.id}/vendor`, 'The recovery does not link to vendor selection.');
});

check('14. A superseded item or vendor selection does not count as live', () => {
  const fx = preparedWorkspace();
  for (const type of ['ItemSelection', 'VendorSelection'] as const) {
    const superseded = fx.decisions.map(d => (d.decisionType === type ? { ...d, status: 'Superseded' as const } : d));
    const preview = previewCourierSelection(ctx(fx, { decisions: superseded }));
    assert(!preview.selectable, `A superseded ${type} was accepted.`);
  }
});

check('15. Cancelled and NeedsReview moments block carriage', () => {
  const fx = preparedWorkspace();
  for (const [status, code] of [['Cancelled', 'moment-cancelled'], ['NeedsReview', 'moment-not-ready']] as const) {
    const preview = previewCourierSelection(ctx(fx, { moment: { ...fx.moment, status } }));
    assert(!preview.selectable, `A ${status} moment allowed carriage.`);
    assert(preview.blockers.some(b => b.code === code), `${status} was not named.`);
    assert(!build(fx, { moment: { ...fx.moment, status } }).ok, `A bundle was built for a ${status} moment.`);
  }
});

check('16. No courier for the delivery country names the gap, with the country in it', () => {
  // This is checkpoint milestone 7's completion test: selectable everywhere, or
  // the gap is named.
  for (const couriers of [[], [courierRecord('c-ke', { countryCode: 'KE' })], [courierRecord('c1', { isActive: false })]]) {
    const fx = preparedWorkspace({ couriers: couriers as Courier[] });
    const preview = previewCourierSelection(ctx(fx));
    assert(!preview.selectable, 'Carriage was allowed with nobody carrying there.');
    const blocker = preview.blockers.find(b => b.code === 'no-courier-for-country');
    assert(blocker, 'The absent courier was not named.');
    assert(blocker!.message.includes('NG'), `The gap does not name the country: "${blocker!.message}"`);
    assertEqual(blocker!.href, '/operations/couriers', 'The recovery does not link to the directory.');
    assertEqual(preview.couriers.length, 0, 'A courier was offered for the wrong country.');
  }
});

check('17. The delivery country comes from the live brief', () => {
  const fx = preparedWorkspace();
  const preview = previewCourierSelection(ctx(fx));
  assertEqual(preview.deliveryCountryCode, 'NG', 'The delivery country was not read from the brief.');
  assertEqual(preview.deliveryCountryCode, fx.brief.deliveryAddressSnapshot.countryCode, 'The country does not match the brief.');
});

check('18. An existing courier selection blocks a second and shows the result', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.commitCourierSelection(WS, goodBundle(fx), NOW).ok, 'The first commit failed.');
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const preview = previewCourierSelection(ctx(fx, {
    decisions: state.value!.decisions.filter(d => d.momentId === fx.moment.id),
  }));
  assert(!preview.selectable, 'A second carriage arrangement was offered.');
  assert(preview.blockers.some(b => b.code === 'selection-exists'), 'The existing selection was not named.');
  assert(preview.confirmed, 'The confirmed selection was not surfaced.');
  assertEqual(preview.confirmed!.courier.courierId, 'c1', 'The wrong courier was reported.');
  assertEqual(preview.confirmed!.consideredCount, 2, 'The considered count was lost.');
});

// ─── Part 4: the quote ───────────────────────────────────────────────────────

check('19. A valid quote parses to exact minor units', () => {
  const fx = preparedWorkspace();
  const r = validateCourierQuote(
    { ...emptyCourierQuoteDraft(), courierId: 'c1', amount: '4500.50', quotedAt: '2026-07-28', leadTimeDays: '2' },
    fx.couriers, 'NGN',
  );
  assert(r.ok, `A valid quote was refused: ${r.ok ? '' : JSON.stringify(r.errors)}`);
  if (!r.ok) return;
  assertEqual(r.value.quotedCourierCost.amountMinor, 450_050, 'Minor units were parsed wrongly.');
  assertEqual(r.value.leadTimeDays, 2, 'The transit time was lost.');
});

check('20. Invalid, negative and fractional amounts are refused', () => {
  const fx = preparedWorkspace();
  for (const amount of ['', 'abc', '-100', '100.005', '1,000']) {
    const r = validateCourierQuote({ ...emptyCourierQuoteDraft(), courierId: 'c1', amount, quotedAt: '2026-07-28' }, fx.couriers, 'NGN');
    assert(!r.ok, `"${amount}" was accepted.`);
  }
});

check('21. Zero carriage is allowed; negative is not', () => {
  // A courier absorbing a leg — or a vendor delivering it themselves — is a real
  // quote. Refusing it would invent a commercial rule nobody decided.
  const fx = preparedWorkspace();
  const zero = validateCourierQuote({ ...emptyCourierQuoteDraft(), courierId: 'c1', amount: '0', quotedAt: '2026-07-28' }, fx.couriers, 'NGN');
  assert(zero.ok, 'A zero quote was refused.');

  const built = build(fx, { quote: { ...quote(fx), quotedCourierCost: ngn(0) } });
  assert(built.ok, `A zero-cost selection was refused: ${built.ok ? '' : built.reason}`);
  assert(fx.repo.commitCourierSelection(WS, built.value, NOW).ok, 'A zero-cost selection was refused at the boundary.');

  const negative = build(fx, { quote: { ...quote(fx), quotedCourierCost: { amountMinor: -1, currency: 'NGN' } } });
  assert(!negative.ok, 'A negative quote was built.');
});

check('22. A quote in another currency is refused, never converted', () => {
  const fx = preparedWorkspace();
  const built = build(fx, { quote: { ...quote(fx), quotedCourierCost: { amountMinor: 100, currency: 'KES' } } });
  assert(!built.ok, 'A foreign-currency quote was accepted.');
  if (!built.ok) assert(built.reason.includes('KES'), 'The refusal does not name the currency.');
});

check('23. There is no invented ceiling relating carriage to the vendor cost or budget', () => {
  // Carriage above the vendor quote and above the approved budget is allowed:
  // the budget governs what the recipient receives (ADR-004), and a carriage
  // ceiling is a commercial decision U3 has not made.
  const fx = preparedWorkspace();
  const built = build(fx, { quote: { ...quote(fx), quotedCourierCost: ngn(90_000) } });
  assert(built.ok, `An above-budget carriage quote was refused: ${built.ok ? '' : built.reason}`);
  assert(fx.repo.commitCourierSelection(WS, built.value!, NOW).ok, 'An above-budget quote was refused at the boundary.');
});

check('24. A courier who does not carry in the delivery country cannot be chosen', () => {
  const fx = preparedWorkspace({ couriers: [courierRecord('c1'), courierRecord('c-ke', { countryCode: 'KE' })] });
  const wrongCountry = fx.couriers.find(c => c.countryCode === 'KE')!;
  const built = build(fx, { quote: { ...quote(fx), courier: wrongCountry } });
  assert(!built.ok, 'A courier from another country was accepted.');
  if (!built.ok) assert(built.reason.includes('NG'), 'The refusal does not name the delivery country.');
});

check('25. A deactivated courier cannot be chosen, and a blank reason is refused', () => {
  const fx = preparedWorkspace();
  const inactive = { ...fx.couriers[0], isActive: false };
  assert(!build(fx, { quote: { ...quote(fx), courier: inactive } }).ok, 'A deactivated courier was accepted.');
  for (const reason of ['', '   ']) {
    assert(!build(fx, { reason }).ok, `A bundle was built with reason ${JSON.stringify(reason)}.`);
  }
});

// ─── Part 5: confirmation ────────────────────────────────────────────────────

check('26. Confirmation creates exactly one Decision and one Event in one write', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  const written = fx.repo.commitCourierSelection(WS, goodBundle(fx), NOW);
  assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - before, 1, 'The bundle was written in more than one operation.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const selections = state.value!.decisions.filter(d => d.decisionType === 'CourierSelection');
  assertEqual(selections.length, 1, 'Not exactly one courier selection.');
  assertEqual(selections[0].status, 'Confirmed', 'The selection is not Confirmed.');
  assertEqual(selections[0].provider, 'HumanOperator', 'The selection was not an operator judgement.');
  assertEqual(state.value!.events.filter(e => e.eventType === 'CourierSelected').length, 1, 'Not exactly one event.');
});

check('27. The Decision records the complete considered set and every reference', () => {
  const fx = preparedWorkspace();
  const bundle = goodBundle(fx);
  const inputs = bundle.decision.inputs as Record<string, unknown>;

  assertEqual(inputs.briefId, fx.brief.id, 'The brief was not referenced.');
  assertEqual(inputs.briefRevision, fx.brief.revision, 'The brief revision was not referenced.');
  assertEqual(inputs.itemSelectionDecisionId, fx.itemDecisionId, 'The item selection was not referenced.');
  assertEqual(inputs.vendorSelectionDecisionId, fx.vendorDecisionId, 'The vendor selection was not referenced.');
  assertEqual(inputs.deliveryCountryCode, 'NG', 'The delivery country was not recorded.');
  assertEqual(inputs.selectedCourierId, 'c1', 'The chosen courier was not recorded.');

  const considered = inputs.consideredCouriers as { courierId: string; name: string; countryCode: string }[];
  assertEqual(considered.length, 2, 'The complete considered set was not recorded.');
  for (const c of considered) {
    assert(c.name.length > 0, 'A considered courier lost its name.');
    assertEqual(c.countryCode, 'NG', 'A considered courier is from the wrong country.');
  }
  assert(considered.some(c => c.courierId === 'c1'), 'The chosen courier is not in the considered set.');

  assertEqual(bundle.decision.recommendation, undefined, 'A recommendation was fabricated.');
  assertEqual(bundle.decision.overrideReason, undefined, 'An override reason was fabricated.');
  assert(bundle.decision.finalDecision.includes('quoted'), 'The summary does not mark the amount as a quote.');
  assertEqual(
    bundle.decision.finalDecision,
    courierFinalDecision(snapshotCourier(fx.couriers[0]), ngn(4_500)),
    'The builder and the shared formatter disagree.',
  );
});

check('28. The Event is the smallest accurate record', () => {
  const fx = preparedWorkspace();
  const bundle = goodBundle(fx);
  assertEqual(bundle.event.eventType, 'CourierSelected', 'The event has the wrong name.');
  assertEqual(bundle.event.actorType, 'Operator', 'The event was not attributed to the operator.');
  assertEqual(bundle.event.source, 'Platform', 'The event claims another channel.');
  const p = bundle.event.payload as Record<string, unknown>;
  assertEqual(
    Object.keys(p).sort().join(','),
    'briefId,briefRevision,deliveryCountryCode,selectedCourierId,vendorSelectionDecisionId',
    'The event payload is not the five identifiers.',
  );
  assert(!('consideredCouriers' in p), 'The event duplicates the considered set.');
});

check('29. A later courier edit does not rewrite a confirmed selection', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.commitCourierSelection(WS, goodBundle(fx), NOW).ok, 'Commit failed.');
  const stored = fx.repo.findCourier(WS, 'c1');
  assert(stored.ok && stored.value, 'Courier missing.');
  const checked = validateCourierDraft({ ...GOOD_COURIER_DRAFT, name: 'Completely Different' });
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;
  assert(fx.repo.updateCourier(WS, applyCourierEdit(stored.value!, checked.value, LATER), LATER).ok, 'Update failed.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const d = state.value!.decisions.find(x => x.decisionType === 'CourierSelection')!;
  assertEqual((d.inputs as { selectedCourier: { name: string } }).selectedCourier.name, 'Courier c1',
    'A rename rewrote the decision.');
});

check('30. `CourierSelection` and `CourierSelected` are declared; nothing later is', () => {
  assert((DECISION_TYPES as readonly string[]).includes('CourierSelection'), 'CourierSelection is not declared.');
  assert((EVENT_TYPES as readonly string[]).includes('CourierSelected'), 'CourierSelected is not declared.');
  assert(!(DECISION_TYPES as readonly string[]).includes('CourierSubstitution'), 'CourierSubstitution belongs to a later milestone.');
  for (const t of ['QAException', 'BudgetException']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
  for (const t of ['Dispatched', 'Delivered', 'ProofReceived', 'MomentClosed']) {
    assert(!(EVENT_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
});

// ─── Part 6: the trust boundary ──────────────────────────────────────────────

check('31. A stale brief, item or vendor reference writes nothing', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  expectRefused(fx, withInputs(b, { briefRevision: 99 }), 'A stale brief revision');
  expectRefused(fx, withInputs(b, { briefId: 'brief-elsewhere' }), 'An unknown brief');
  expectRefused(fx, withInputs(b, { itemSelectionDecisionId: 'decision-elsewhere' }), 'A different item selection');
  expectRefused(fx, withInputs(b, { vendorSelectionDecisionId: 'decision-elsewhere' }), 'A different vendor selection');
  expectRefused(fx, withInputs(b, { deliveryCountryCode: 'KE' }), 'A different delivery country');
});

check('32. A courier deactivated, renamed or removed mid-flow writes nothing', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  assert(fx.repo.setCourierActive(WS, 'c1', false, LATER).ok, 'Deactivate failed.');
  expectRefused(fx, b, 'A submission naming a deactivated courier');

  const fx2 = preparedWorkspace();
  const b2 = goodBundle(fx2);
  const stored = fx2.repo.findCourier(WS, 'c1');
  assert(stored.ok && stored.value, 'Courier missing.');
  const checked = validateCourierDraft({ ...GOOD_COURIER_DRAFT, name: 'Renamed Mid-Flow' });
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;
  assert(fx2.repo.updateCourier(WS, applyCourierEdit(stored.value!, checked.value, LATER), LATER).ok, 'Update failed.');
  expectRefused(fx2, b2, 'A submission naming a renamed courier');

  const fx3 = preparedWorkspace();
  const b3 = goodBundle(fx3);
  expectRefused(fx3, withInputs(b3, { selectedCourierId: 'c-nowhere' }), 'A courier outside the directory');
});

check('33. A considered set that does not match the directory writes nothing', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  const considered = (b.decision.inputs as { consideredCouriers: Record<string, unknown>[] }).consideredCouriers;

  expectRefused(fx, withInputs(b, { consideredCouriers: [] }), 'An emptied considered set');
  expectRefused(fx, withInputs(b, { consideredCouriers: [...considered].reverse() }), 'A reordered considered set');
  expectRefused(fx, withInputs(b, { consideredCouriers: considered.slice(0, 1) }), 'A truncated considered set');
  expectRefused(fx, withInputs(b, { consideredCouriers: [...considered, considered[0]] }), 'An extended considered set');
  expectRefused(fx, withInputs(b, { consideredCouriers: undefined }), 'A missing considered set');
  expectRefused(fx, withInputs(b, {
    consideredCouriers: considered.map((c, i) => (i === 0 ? { ...c, name: 'Wrong' } : c)),
  }), 'A renamed considered courier');
});

check('34. Nested and outer extras are refused, even duplicated consistently', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  const inputs = b.decision.inputs as Record<string, unknown>;
  const considered = inputs.consideredCouriers as Record<string, unknown>[];

  for (const patch of [{ customerCharge: 6000 }, { margin: 1200 }, { revenue: 1 }, { courierScore: 0.9 }, { ranking: [] }]) {
    expectRefused(fx, withInputs(b, patch), `Decision inputs carrying ${Object.keys(patch)[0]}`);
  }
  for (const patch of [{ reliabilityScore: 0.9 }, { rateCard: [] }]) {
    expectRefused(fx, withInputs(b, {
      selectedCourier: { ...(inputs.selectedCourier as object), ...patch },
    }), `A courier snapshot carrying ${Object.keys(patch)[0]}`);
    expectRefused(fx, withInputs(b, {
      consideredCouriers: considered.map(c => ({ ...c, ...patch })),
    }), `A considered courier carrying ${Object.keys(patch)[0]}`);
  }
  for (const patch of [{ margin: 12 }, { actualPaidCost: 4500 }]) {
    expectRefused(fx, withInputs(b, {
      quotedCourierCost: { ...(inputs.quotedCourierCost as object), ...patch },
    }), `A quote carrying ${Object.keys(patch)[0]}`);
  }
  for (const patch of [{ consideredCouriers: [] }, { margin: 1 }, { reason: 'x' }]) {
    expectRefused(fx, { ...b, event: { ...b.event, payload: { ...(b.event.payload as object), ...patch } } },
      `An event payload carrying ${Object.keys(patch)[0]}`);
  }
});

check('35. Altered quote evidence and summary write nothing', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  expectRefused(fx, withInputs(b, { quotedCourierCost: ngn(1) }), 'An altered quote');
  expectRefused(fx, withInputs(b, { quotedCourierCost: { amountMinor: 100, currency: 'KES' } }), 'A foreign-currency quote');
  expectRefused(fx, withInputs(b, { source: 'Platform' }), 'A platform-sourced quote');
  expectRefused(fx, withInputs(b, { quotedAt: 'banana' }), 'An unreadable quoted time');
  expectRefused(fx, withInputs(b, { quotedAt: '2026-08-01T00:00:00Z' }), 'A non-canonical quoted time');
  expectRefused(fx, withInputs(b, { terms: 42 }), 'Non-string terms');
  expectRefused(fx, withInputs(b, { terms: '  ' }), 'Blank terms');
  expectRefused(fx, withInputs(b, { leadTimeDays: -1 }), 'A negative transit time');
  for (const text of ['', 'Courier c2 — NGN 4,500.00 quoted for carriage in NG', 'Courier c1 — NGN 1.00 quoted for carriage in NG']) {
    expectRefused(fx, { ...b, decision: { ...b.decision, finalDecision: text } }, `A summary of "${text}"`);
  }
});

check('36. A non-operator, non-Confirmed or mismatched bundle writes nothing', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  expectRefused(fx, { ...b, decision: { ...b.decision, provider: 'RuleEngine' } }, 'A rule-engine selection');
  expectRefused(fx, { ...b, decision: { ...b.decision, status: 'Superseded' } }, 'A superseded selection');
  expectRefused(fx, { ...b, decision: { ...b.decision, reason: '  ' } }, 'A blank reason');
  expectRefused(fx, { ...b, decision: { ...b.decision, recommendation: 'the cheapest' } }, 'A fabricated recommendation');
  expectRefused(fx, { ...b, decision: { ...b.decision, workspaceId: 'org-elsewhere' } }, 'A foreign-workspace decision');
  expectRefused(fx, { ...b, event: { ...b.event, actorType: 'System' } }, 'A system-attributed event');
  expectRefused(fx, { ...b, event: { ...b.event, source: 'WhatsApp' } }, 'An event claiming another channel');
  expectRefused(fx, { ...b, event: { ...b.event, actorId: 'someone-else' } }, 'An event naming a different actor');
  for (const bad of ['banana', '2026-08-01T00:00:00Z', '2026-02-30T00:00:00.000Z']) {
    expectRefused(fx, {
      decision: { ...b.decision, createdAt: bad, confirmedAt: bad },
      event: { ...b.event, occurredAt: bad, recordedAt: bad },
    } as Bundle, `Shared timestamps of ${bad}`);
  }
});

check('37. A cancelled or unready moment is refused at the boundary', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  const raw = JSON.parse(fx.storage.getItem(OPERATIONS_KEY)!) as OperationsState;
  raw.moments[0].status = 'NeedsReview';
  fx.storage.setItem(OPERATIONS_KEY, JSON.stringify(raw));
  expectRefused(fx, b, 'A submission for a moment sent back for review');
});

check('38. Duplicate and double-click confirmation are refused', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  assert(fx.repo.commitCourierSelection(WS, b, NOW).ok, 'The first commit failed.');
  const afterFirst = fx.storage.writes.length;
  assert(!fx.repo.commitCourierSelection(WS, b, NOW).ok, 'A double-click created a second record.');
  assertEqual(fx.storage.writes.length, afterFirst, 'A refused duplicate still wrote.');

  const stale = build(fx, { quote: quote(fx, 1, 9_000) });
  assert(stale.ok, 'The stale build failed unexpectedly.');
  if (stale.ok) assert(!fx.repo.commitCourierSelection(WS, stale.value, NOW).ok, 'A second live selection was accepted.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.decisions.filter(d => d.decisionType === 'CourierSelection').length, 1, 'A duplicate decision landed.');
  assertEqual(state.value!.events.filter(e => e.eventType === 'CourierSelected').length, 1, 'A duplicate event landed.');
});

check('39. Confirming preserves every existing record untouched', () => {
  const fx = preparedWorkspace();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = JSON.stringify(before.value!.decisions);
  const priorEvents = JSON.stringify(before.value!.events);
  const priorMoments = JSON.stringify(before.value!.moments);
  const priorOffers = JSON.stringify(before.value!.vendorOffers);
  const priorCouriers = JSON.stringify(before.value!.couriers);

  assert(fx.repo.commitCourierSelection(WS, goodBundle(fx), NOW).ok, 'Commit failed.');
  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  const kept = after.value!;
  assertEqual(JSON.stringify(kept.decisions.slice(0, before.value!.decisions.length)), priorDecisions, 'Existing decisions were rewritten.');
  assertEqual(JSON.stringify(kept.events.slice(0, before.value!.events.length)), priorEvents, 'Existing events were rewritten.');
  assertEqual(JSON.stringify(kept.moments), priorMoments, 'Moments were rewritten.');
  assertEqual(JSON.stringify(kept.vendorOffers), priorOffers, 'Vendor offers were rewritten.');
  assertEqual(JSON.stringify(kept.couriers), priorCouriers, 'The directory was rewritten.');
});

check('40. Validation refuses two live courier selections for one moment', () => {
  const fx = preparedWorkspace();
  const b = goodBundle(fx);
  assert(fx.repo.commitCourierSelection(WS, b, NOW).ok, 'Commit failed.');
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const doubled = { ...state.value!, decisions: [...state.value!.decisions, { ...b.decision, id: 'decision-clone' }] };
  assert(!validateOperationsState(doubled, WS).ok, 'Two live courier selections passed validation.');
});

check('41. Honest directory writes and an honest selection still commit', () => {
  // The counterweight: everything above would pass against a boundary that
  // refuses every submission.
  const fx = preparedWorkspace();
  assert(fx.repo.createCourier(WS, courierRecord('c-honest'), NOW).ok, 'An honest courier was refused.');
  const stored = fx.repo.findCourier(WS, 'c-honest');
  assert(stored.ok && stored.value, 'Courier missing.');
  const edit = validateCourierDraft({ ...GOOD_COURIER_DRAFT, name: 'Renamed Honestly' });
  assert(edit.ok, 'Draft invalid.');
  if (!edit.ok) return;
  assert(fx.repo.updateCourier(WS, applyCourierEdit(stored.value!, edit.value, LATER), LATER).ok, 'An honest edit was refused.');
  assert(fx.repo.setCourierActive(WS, 'c-honest', false, LATER).ok, 'An honest deactivation was refused.');

  const fresh = preparedWorkspace();
  const before = fresh.storage.writes.length;
  const written = fresh.repo.commitCourierSelection(WS, goodBundle(fresh), NOW);
  assert(written.ok, `An honest selection was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fresh.storage.writes.length - before, 1, 'The honest commit was not a single write.');
});

// ─── Part 7: schema and structure ────────────────────────────────────────────

check('42. The operations schema is at v5, and v1 walks every rung to it', () => {
  assertEqual(CURRENT_OPERATIONS_SCHEMA_VERSION, 5, 'Operations schema is not at v5.');
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    createdAt: T0, updatedAt: T0, aFutureKey: { kept: true },
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 5, 'Migration did not reach v5.');
  assert(Array.isArray(result.state.executionBriefs), 'The v1 → v2 rung did not run.');
  assert(Array.isArray(result.state.vendors), 'The v3 → v4 rung did not run.');
  assert(Array.isArray(result.state.couriers), 'The v4 → v5 rung did not add couriers.');
  assertEqual(result.state.moments.length, 1, 'A moment was lost in migration.');
  assertEqual(result.state.decisions.length, 1, 'A decision was lost in migration.');
  assertEqual(result.state.events.length, 1, 'An event was lost in migration.');
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('43. The v4 → v5 rung invents nothing and touches no existing record', () => {
  const v4 = {
    schemaVersion: 4, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    executionBriefs: [{ id: 'b-old' }], vendors: [{ id: 'v-old' }], vendorOffers: [{ id: 'o-old' }],
    createdAt: T0, updatedAt: T0,
  };
  const before = JSON.stringify(v4);
  const result = migrateOperationsState(JSON.parse(before));
  assert(result.status === 'migrated', 'A v4 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 5, 'Migration did not reach v5.');
  assertEqual(result.state.couriers.length, 0, 'The migration invented couriers.');
  const original = JSON.parse(before) as Record<string, unknown>;
  for (const k of ['moments', 'decisions', 'events', 'executionBriefs', 'vendors', 'vendorOffers'] as const) {
    assertEqual(JSON.stringify((result.state as unknown as Record<string, unknown>)[k]), JSON.stringify(original[k]), `${k} were altered.`);
  }
});

check('44. Reads never rewrite storage, and a future version is refused', () => {
  const v4 = {
    schemaVersion: 4, workspaceId: WS, moments: [], decisions: [], events: [],
    executionBriefs: [], vendors: [], vendorOffers: [], createdAt: T0, updatedAt: T0,
  };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v4) });
  const repo = createLocalOperationsRepository(storage);
  const loaded = repo.load(WS);
  assert(loaded.ok && loaded.value, 'A v4 payload was refused.');
  assertEqual(loaded.value!.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'The read did not migrate in memory.');
  assertEqual(storage.writes.length, 0, 'Reading rewrote storage.');

  const future = { ...v4, schemaVersion: 99, couriers: [] };
  assertEqual(migrateOperationsState(future).status, 'invalid', 'A future version was adopted.');
});

check('45. No courier data reaches WorkspaceState, and the routes are Operations-only', () => {
  const ws = createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
  for (const forbidden of ['couriers', 'courierSelections', 'carriers']) {
    assert(!Object.keys(ws).includes(forbidden), `WorkspaceState gained a "${forbidden}" collection.`);
  }
  assert(!JSON.stringify(ws).includes('Swift Dispatch'), 'Courier data leaked into the workspace document.');
  assertEqual(titleFor('/operations/couriers'), 'Couriers', 'The directory has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/courier'), 'Arrange carriage', 'The carriage screen has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/vendor'), 'Vendor offers', 'The vendor title regressed.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'The moment title regressed.');
});

check('46. A courier snapshot is a copy — later edits cannot rewrite it', () => {
  const c = courierRecord('c-copy');
  const snapshot = snapshotCourier(c);
  c.name = 'Renamed after the fact';
  c.countryCode = 'KE';
  assertEqual(snapshot.name, 'Courier c-copy', 'A snapshot followed a later rename.');
  assertEqual(snapshot.countryCode, 'NG', 'A snapshot followed a later country change.');
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
console.log('Courier selection validation passed.\n');
