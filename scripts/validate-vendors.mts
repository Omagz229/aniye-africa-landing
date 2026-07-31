/**
 * Deterministic validation for H3.4 — the vendor directory, hand-entered offers
 * and manual vendor selection.
 *
 * Run with:  npm run validate:vendors
 *
 * Covers the recording rule (ADR-006: browsing and draft rows write nothing; one
 * atomic transaction on confirmation), Money (ADR-007: exact currency, no FX, no
 * negative amounts), the repository trust boundary, and the additive
 * OperationsState v3 → v4 migration.
 *
 * Storage is injected, so "writes nothing" is proven by inspecting the write log
 * rather than asserted in prose.
 */

import { createWorkspace } from '../lib/workspace';
import type {
  Money,
  PolicyAssignment,
  Person,
  Program,
  RecognitionPolicy,
  RelationshipClass,
} from '../lib/workspace';
import { createCampaignDraft } from '../lib/programs';
import type { CatalogItem } from '../lib/catalog';
import {
  CURRENT_OPERATIONS_SCHEMA_VERSION,
  DECISION_TYPES,
  EVENT_TYPES,
  OFFER_SOURCES,
  OPERATIONS_KEY,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type {
  Decision,
  OperationalEvent,
  OperationsState,
  Vendor,
  VendorOffer,
} from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import type { GenerationContext } from '../lib/operations/generation';
import { buildMomentBatch } from '../lib/operations/generation';
import { buildBriefConfirmation } from '../lib/operations/briefs';
import { buildItemSelection } from '../lib/operations/selection';
import {
  VENDOR_KEYS,
  applyVendorEdit,
  buildVendor,
  canonicalVendor,
  filterVendors,
  isIsoInstant,
  snapshotVendor,
  sortVendors,
  validateVendorDraft,
  vendorToDraft,
} from '../lib/operations/vendors';
import type { VendorDraft } from '../lib/operations/vendors';
import {
  buildVendorSelection,
  emptyOfferDraft,
  previewVendorSelection,
  validateOfferDraft,
  verifyVendorSelection,
  vendorFinalDecision,
} from '../lib/operations/vendor-selection';
import type { NormalizedOffer } from '../lib/operations/vendor-selection';
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

/** Records every write, so "writes nothing" is a checkable claim. */
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

function cls(id: string, name: string): RelationshipClass {
  return { id, name, type: 'Employee', level: 0, description: '', isDefault: false, isActive: true, createdAt: T0, updatedAt: T0 };
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
    classes: [cls('class-exec', 'Executive Leadership')], assignments: [assignment()], policies: [policy()],
    existingSourceKeys: new Map(), now: NOW,
  };
}

const GOOD_DRAFT: VendorDraft = {
  name: 'Lagos Gift Company', countryCode: 'ng', city: 'Lagos',
  whatsapp: '+234 801 234 5678', email: '', note: 'Same-day within Lagos',
};

function vendorRecord(id: string, over: Partial<Vendor> = {}): Vendor {
  const checked = validateVendorDraft({ ...GOOD_DRAFT, name: `Vendor ${id}` });
  assert(checked.ok, 'Fixture vendor draft is invalid.');
  return { ...buildVendor(checked.value, id, WS, T0), ...over };
}

/**
 * A workspace carrying one ready Moment, a confirmed brief, a confirmed item
 * selection and three active vendors — the only state a comparison may run from.
 */
function preparedWorkspace(over: { vendors?: Vendor[] } = {}) {
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

  const state0 = repo.load(WS);
  assert(state0.ok && state0.value, 'Fixture state unreadable.');
  const builtItem = buildItemSelection({
    moment, brief, decisions: state0.value!.decisions.filter(d => d.momentId === moment.id),
    items: FIXTURE_ITEMS, selectedItemId: ITEM.id, reason: 'It suits her.',
    now: NOW, ids, actorId: 'operator-1',
  });
  assert(builtItem.ok, `Fixture failed to choose an item: ${builtItem.ok ? '' : builtItem.reason}`);
  assert(repo.commitItemSelection(WS, builtItem.value, NOW).ok, 'Fixture failed to commit an item selection.');

  const vendors = over.vendors ?? [vendorRecord('v1'), vendorRecord('v2'), vendorRecord('v3')];
  for (const v of vendors) {
    assert(repo.createVendor(WS, v, NOW).ok, `Fixture failed to add ${v.id}.`);
  }

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Fixture state unreadable.');
  return {
    repo, storage, moment, person: p, brief, vendors,
    itemDecisionId: builtItem.value.decision.id,
    decisions: state.value!.decisions.filter(d => d.momentId === moment.id),
  };
}

type Fx = ReturnType<typeof preparedWorkspace>;

function ctx(fx: Fx, over: Record<string, unknown> = {}) {
  return { moment: fx.moment, brief: fx.brief, decisions: fx.decisions, vendors: fx.vendors, ...over };
}

function offer(fx: Fx, vendorIndex: number, amountMajor: number, over: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    vendor: fx.vendors[vendorIndex],
    quotedVendorCost: ngn(amountMajor),
    source: 'WhatsApp',
    quotedAt: QUOTED,
    leadTimeDays: 3,
    terms: 'Includes wrapping',
    ...over,
  };
}

function build(fx: Fx, offers: NormalizedOffer[], selectedIndex: number, over: Record<string, unknown> = {}) {
  return buildVendorSelection({
    ...ctx(fx), offers, selectedIndex, reason: 'Only one who could deliver before the target date.',
    now: NOW, ids, actorId: 'operator-1', ...over,
  });
}

/** Three quotes, the second chosen — the checkpoint's completion test. */
function threeOfferBundle(fx: Fx) {
  const offers = [offer(fx, 0, 34_000), offer(fx, 1, 31_500), offer(fx, 2, 39_000)];
  const built = build(fx, offers, 1);
  assert(built.ok, `Fixture bundle failed: ${built.ok ? '' : built.reason}`);
  return built.value;
}

console.log('\nVendor directory, offers and selection (H3.4) — validation\n');

// ─── Part 1: the vendor directory ────────────────────────────────────────────

check('1. A valid vendor draft normalizes and builds', () => {
  const checked = validateVendorDraft(GOOD_DRAFT);
  assert(checked.ok, 'A valid draft was refused.');
  if (!checked.ok) return;
  assertEqual(checked.value.countryCode, 'NG', 'The country code was not normalized to uppercase.');
  assertEqual(checked.value.name, 'Lagos Gift Company', 'The name was mangled.');
  assertEqual(checked.value.email, undefined, 'An empty email was stored as a value.');
  const v = buildVendor(checked.value, 'v-new', WS, NOW);
  assert(v.isActive, 'A new vendor is not active.');
  assertEqual(v.workspaceId, WS, 'The vendor was not scoped to the workspace.');
});

check('2. At least one contact method is required', () => {
  const none = validateVendorDraft({ ...GOOD_DRAFT, whatsapp: '', email: '' });
  assert(!none.ok, 'A vendor with no contact method was accepted.');
  if (!none.ok) assert(none.errors.contact, 'The missing contact was not named.');

  const emailOnly = validateVendorDraft({ ...GOOD_DRAFT, whatsapp: '', email: 'orders@vendor.example' });
  assert(emailOnly.ok, 'Email alone was refused.');
  const whatsappOnly = validateVendorDraft({ ...GOOD_DRAFT, email: '' });
  assert(whatsappOnly.ok, 'WhatsApp alone was refused.');
});

check('3. Missing or malformed name, country and city are refused', () => {
  for (const [patch, field] of [
    [{ name: '   ' }, 'name'],
    [{ city: '' }, 'city'],
    [{ countryCode: '' }, 'countryCode'],
    [{ countryCode: 'NGA' }, 'countryCode'],
    [{ countryCode: '1' }, 'countryCode'],
  ] as const) {
    const result = validateVendorDraft({ ...GOOD_DRAFT, ...patch });
    assert(!result.ok, `${JSON.stringify(patch)} was accepted.`);
    if (!result.ok) assert(result.errors[field as 'name'], `The ${field} error was not named.`);
  }
  const badEmail = validateVendorDraft({ ...GOOD_DRAFT, whatsapp: '', email: 'not-an-address' });
  assert(!badEmail.ok, 'A malformed email was accepted.');
});

check('4. Saving a vendor performs exactly one write', () => {
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(WS, NOW);
  const before = storage.writes.length;

  const checked = validateVendorDraft(GOOD_DRAFT);
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;
  const written = repo.createVendor(WS, buildVendor(checked.value, 'v1', WS, NOW), NOW);
  assert(written.ok, `Create failed: ${written.ok ? '' : written.reason}`);
  assertEqual(storage.writes.length - before, 1, 'Saving a vendor was not a single write.');

  const list = repo.listVendors(WS);
  assert(list.ok && list.value.length === 1, 'The vendor was not stored.');
});

check('5. Validating, filtering and sorting a directory write nothing', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;

  for (let i = 0; i < 5; i++) {
    validateVendorDraft(GOOD_DRAFT);
    validateVendorDraft({ ...GOOD_DRAFT, name: '' });
    filterVendors(fx.vendors, 'lagos');
    sortVendors(fx.vendors);
    vendorToDraft(fx.vendors[0]);
  }
  fx.repo.listVendors(WS);
  fx.repo.findVendor(WS, 'v1');

  assertEqual(fx.storage.writes.length, before, 'Browsing the directory wrote to storage.');
});

check('6. Editing a vendor cannot reassign, resurrect or backdate it', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.setVendorActive(WS, 'v1', false, NOW).ok, 'Deactivate failed.');

  const checked = validateVendorDraft({ ...GOOD_DRAFT, name: 'Renamed Co', city: 'Abuja' });
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;

  const stored = fx.repo.findVendor(WS, 'v1');
  assert(stored.ok && stored.value, 'Vendor missing.');
  const tampered = {
    ...applyVendorEdit(stored.value!, checked.value, LATER),
    isActive: true,
    createdAt: LATER,
  };
  const written = fx.repo.updateVendor(WS, tampered, LATER);
  assert(written.ok, `Update failed: ${written.ok ? '' : written.reason}`);
  if (!written.ok) return;
  assertEqual(written.value.name, 'Renamed Co', 'The edit did not apply.');
  assertEqual(written.value.isActive, false, 'An edit resurrected a deactivated vendor.');
  assertEqual(written.value.createdAt, T0, 'An edit rewrote when the vendor was added.');
  assertEqual(written.value.workspaceId, WS, 'An edit changed the workspace.');
});

check('7. Deactivation is reversible, and there is no hard delete', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.setVendorActive(WS, 'v1', false, NOW).ok, 'Deactivate failed.');
  const after = fx.repo.findVendor(WS, 'v1');
  assert(after.ok && after.value && !after.value.isActive, 'The vendor was not deactivated.');
  assert(fx.repo.listVendors(WS).ok, 'Directory unreadable.');
  const list = fx.repo.listVendors(WS);
  assert(list.ok && list.value.length === 3, 'Deactivation removed the record.');

  assert(fx.repo.setVendorActive(WS, 'v1', true, LATER).ok, 'Reactivate failed.');
  const back = fx.repo.findVendor(WS, 'v1');
  assert(back.ok && back.value && back.value.isActive, 'The vendor was not reactivated.');

  // The interface exposes no delete at all.
  assert(!('deleteVendor' in fx.repo), 'A vendor delete operation exists.');
  assert(!('removeVendor' in fx.repo), 'A vendor remove operation exists.');
});

check('8. A vendor for another workspace is refused', () => {
  const fx = preparedWorkspace();
  const foreign = { ...vendorRecord('v-foreign'), workspaceId: 'org-elsewhere' };
  assert(!fx.repo.createVendor(WS, foreign, NOW).ok, 'A foreign-workspace vendor was stored.');
  assert(!fx.repo.createVendor('org-elsewhere', vendorRecord('v9'), NOW).ok, 'A foreign workspace id was served.');
});

check('9. Structural validation refuses an unreachable or malformed vendor', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const base = state.value!;

  for (const [patch, label] of [
    [{ whatsapp: undefined, email: undefined }, 'a vendor with no contact method'],
    [{ countryCode: 'NGA' }, 'a three-letter country code'],
    [{ name: '' }, 'a nameless vendor'],
    [{ isActive: 'yes' as unknown as boolean }, 'a non-boolean active state'],
  ] as const) {
    const broken = JSON.parse(JSON.stringify(base)) as OperationsState;
    Object.assign(broken.vendors[0], patch);
    assert(!validateOperationsState(broken, WS).ok, `Validation accepted ${label}.`);
  }
});

// ─── Part 2: the gate ────────────────────────────────────────────────────────

check('10. No confirmed brief blocks vendor comparison', () => {
  const fx = preparedWorkspace();
  const preview = previewVendorSelection(ctx(fx, { brief: null }));
  assert(!preview.selectable, 'Comparison was allowed with no brief.');
  assert(preview.blockers.some(b => b.code === 'no-confirmed-brief'), 'The missing brief was not named.');
});

check('11. No live item selection blocks vendor comparison', () => {
  const fx = preparedWorkspace();
  const withoutItem = fx.decisions.filter(d => d.decisionType !== 'ItemSelection');
  const preview = previewVendorSelection(ctx(fx, { decisions: withoutItem }));
  assert(!preview.selectable, 'Comparison was allowed with no item.');
  const blocker = preview.blockers.find(b => b.code === 'no-item-selection');
  assert(blocker, 'The missing item was not named.');
  assertEqual(blocker!.href, `/operations/moments/${fx.moment.id}/item`, 'The recovery does not link to item selection.');
});

check('12. A superseded item selection does not count as live', () => {
  const fx = preparedWorkspace();
  const superseded = fx.decisions.map(d =>
    d.decisionType === 'ItemSelection' ? { ...d, status: 'Superseded' as const } : d,
  );
  const preview = previewVendorSelection(ctx(fx, { decisions: superseded }));
  assert(!preview.selectable, 'A superseded item selection was accepted.');
  assert(preview.blockers.some(b => b.code === 'no-item-selection'), 'The superseded selection was not named.');
});

check('13. Unreadable item evidence blocks rather than guessing from the catalog', () => {
  const fx = preparedWorkspace();
  const damaged = fx.decisions.map(d =>
    d.decisionType === 'ItemSelection'
      ? { ...d, inputs: { ...d.inputs, selectedItem: undefined } }
      : d,
  );
  const preview = previewVendorSelection(ctx(fx, { decisions: damaged }));
  assert(!preview.selectable, 'Unreadable item evidence was tolerated.');
  assert(preview.blockers.some(b => b.code === 'item-evidence-unreadable'), 'The unreadable evidence was not named.');
  assertEqual(preview.chosen, null, 'An item was reconstructed from somewhere.');
});

check('14. Cancelled and NeedsReview moments block vendor comparison', () => {
  const fx = preparedWorkspace();
  for (const [status, code] of [['Cancelled', 'moment-cancelled'], ['NeedsReview', 'moment-not-ready']] as const) {
    const preview = previewVendorSelection(ctx(fx, { moment: { ...fx.moment, status } }));
    assert(!preview.selectable, `A ${status} moment allowed comparison.`);
    assert(preview.blockers.some(b => b.code === code), `${status} was not named.`);
    const built = build(fx, [offer(fx, 0, 34_000)], 0, { moment: { ...fx.moment, status } });
    assert(!built.ok, `A bundle was built for a ${status} moment.`);
  }
});

check('15. An empty or fully deactivated directory names the recovery', () => {
  for (const vendors of [[], [vendorRecord('v1', { isActive: false })]]) {
    const fx = preparedWorkspace({ vendors: vendors as Vendor[] });
    const preview = previewVendorSelection(ctx(fx));
    assert(!preview.selectable, 'Comparison was allowed with no active vendors.');
    const blocker = preview.blockers.find(b => b.code === 'no-active-vendors');
    assert(blocker, 'The absent vendors were not named.');
    assertEqual(blocker!.href, '/operations/vendors', 'The recovery does not link to the directory.');
    assertEqual(preview.vendors.length, 0, 'A deactivated vendor was offered.');
  }
});

check('16. An existing vendor selection blocks a second one and shows the result', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  assert(fx.repo.commitVendorSelection(WS, bundle, NOW).ok, 'The first commit failed.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const preview = previewVendorSelection(ctx(fx, {
    decisions: state.value!.decisions.filter(d => d.momentId === fx.moment.id),
  }));
  assert(!preview.selectable, 'A second comparison was offered.');
  assert(preview.blockers.some(b => b.code === 'selection-exists'), 'The existing selection was not named.');
  assert(preview.confirmed, 'The confirmed selection was not surfaced.');
  assertEqual(preview.confirmed!.vendor.vendorId, 'v2', 'The wrong vendor was reported as chosen.');
  assertEqual(preview.confirmed!.consideredCount, 3, 'The considered count was lost.');
});

// ─── Part 3: offer validation ────────────────────────────────────────────────

check('17. A valid offer draft parses to exact minor units', () => {
  const fx = preparedWorkspace();
  const result = validateOfferDraft(
    { ...emptyOfferDraft(), vendorId: 'v1', amount: '31500.50', quotedAt: '2026-07-28', leadTimeDays: '3' },
    fx.vendors, 'NGN',
  );
  assert(result.ok, `A valid draft was refused: ${result.ok ? '' : JSON.stringify(result.errors)}`);
  if (!result.ok) return;
  assertEqual(result.value.quotedVendorCost.amountMinor, 3_150_050, 'Minor units were parsed wrongly.');
  assertEqual(result.value.quotedVendorCost.currency, 'NGN', 'The currency was not the one required.');
  assertEqual(result.value.leadTimeDays, 3, 'The lead time was lost.');
});

check('18. Invalid, negative and fractional amounts are refused', () => {
  const fx = preparedWorkspace();
  for (const amount of ['', 'abc', '-100', '100.005', '1,000', ' 12 34']) {
    const result = validateOfferDraft(
      { ...emptyOfferDraft(), vendorId: 'v1', amount, quotedAt: '2026-07-28' }, fx.vendors, 'NGN',
    );
    assert(!result.ok, `"${amount}" was accepted as an amount.`);
  }
});

check('19. Zero is an allowed quote; negative is not', () => {
  // A vendor absorbing a cost is a real quote. Refusing it would invent a
  // commercial rule nobody decided. A negative quote is a data error.
  const fx = preparedWorkspace();
  const zero = validateOfferDraft(
    { ...emptyOfferDraft(), vendorId: 'v1', amount: '0', quotedAt: '2026-07-28' }, fx.vendors, 'NGN',
  );
  assert(zero.ok, 'A zero quote was refused.');
  if (zero.ok) assertEqual(zero.value.quotedVendorCost.amountMinor, 0, 'Zero did not parse to zero.');

  const built = build(fx, [offer(fx, 0, 0)], 0);
  assert(built.ok, `A zero-cost comparison was refused: ${built.ok ? '' : built.reason}`);
  assert(fx.repo.commitVendorSelection(WS, built.value, NOW).ok, 'A zero-cost selection was refused at the boundary.');

  const negative = build(fx, [offer(fx, 0, 0, { quotedVendorCost: { amountMinor: -1, currency: 'NGN' } })], 0);
  assert(!negative.ok, 'A negative quote was built.');
});

check('20. A quote in another currency is refused, never converted', () => {
  const fx = preparedWorkspace();
  const built = build(fx, [offer(fx, 0, 0, { quotedVendorCost: { amountMinor: 100, currency: 'KES' } })], 0);
  assert(!built.ok, 'A foreign-currency quote was accepted.');
  if (!built.ok) assert(built.reason.includes('KES'), 'The refusal does not name the currency.');
  // And the draft validator fixes the currency rather than reading it from input.
  const draft = validateOfferDraft(
    { ...emptyOfferDraft(), vendorId: 'v1', amount: '100', quotedAt: '2026-07-28' }, fx.vendors, 'NGN',
  );
  assert(draft.ok && draft.value.quotedVendorCost.currency === 'NGN', 'The draft currency was not fixed by the item.');
});

check('21. The quoted cost is never derived from the catalog price', () => {
  const fx = preparedWorkspace();
  // Deliberately above the item price and above the budget: there is no rule
  // that a vendor must quote below either, and inventing one would make the
  // tool misreport what vendors actually said.
  const built = build(fx, [offer(fx, 0, 90_000)], 0);
  assert(built.ok, `A quote above the item price was refused: ${built.ok ? '' : built.reason}`);
  const inputs = built.ok ? (built.value.decision.inputs as Record<string, unknown>) : {};
  const selectedCost = inputs.selectedQuotedVendorCost as Money;
  assertEqual(selectedCost.amountMinor, 9_000_000, 'The quote was altered.');
  assert(selectedCost.amountMinor !== ITEM.price.amountMinor, 'The quote equals the catalog price.');
  assert(fx.repo.commitVendorSelection(WS, built.value!, NOW).ok, 'An above-price quote was refused at the boundary.');
});

check('22. A missing, inactive or unknown vendor is refused', () => {
  const fx = preparedWorkspace();
  const inactive = { ...fx.vendors[0], isActive: false };
  assert(!build(fx, [offer(fx, 0, 34_000, { vendor: inactive })], 0).ok, 'A deactivated vendor was accepted.');

  const unknown = { ...vendorRecord('v-unknown') };
  const built = build(fx, [offer(fx, 0, 34_000, { vendor: unknown })], 0);
  assert(built.ok, 'The builder refused an unknown vendor before the boundary could.');
  if (built.ok) {
    assert(!fx.repo.commitVendorSelection(WS, built.value, NOW).ok, 'A vendor outside the directory was stored.');
  }

  const draft = validateOfferDraft(
    { ...emptyOfferDraft(), vendorId: 'nope', amount: '100', quotedAt: '2026-07-28' }, fx.vendors, 'NGN',
  );
  assert(!draft.ok, 'A draft naming an unknown vendor was accepted.');
});

check('23. The same vendor twice in one comparison is refused', () => {
  const fx = preparedWorkspace();
  const built = build(fx, [offer(fx, 0, 34_000), offer(fx, 0, 31_000)], 0);
  assert(!built.ok, 'A duplicate vendor was accepted.');
  if (!built.ok) assert(built.reason.includes('twice'), 'The refusal does not explain the duplicate.');
});

check('24. An out-of-range or empty selection is refused', () => {
  const fx = preparedWorkspace();
  assert(!build(fx, [], 0).ok, 'An empty comparison was accepted.');
  assert(!build(fx, [offer(fx, 0, 34_000)], 5).ok, 'An out-of-range selection was accepted.');
  assert(!build(fx, [offer(fx, 0, 34_000)], -1).ok, 'A negative selection index was accepted.');
});

check('25. A blank reason is refused', () => {
  const fx = preparedWorkspace();
  for (const reason of ['', '   ']) {
    assert(!build(fx, [offer(fx, 0, 34_000)], 0, { reason }).ok, `A bundle was built with reason ${JSON.stringify(reason)}.`);
  }
});

// ─── Part 4: draft entry writes nothing ──────────────────────────────────────

check('26. Entering, validating, reordering and discarding draft rows write nothing', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;

  for (let i = 0; i < 5; i++) {
    previewVendorSelection(ctx(fx));
    validateOfferDraft({ ...emptyOfferDraft(), vendorId: 'v1', amount: '3', quotedAt: '2026-07-28' }, fx.vendors, 'NGN');
    validateOfferDraft({ ...emptyOfferDraft(), vendorId: '', amount: 'x', quotedAt: '' }, fx.vendors, 'NGN');
  }
  // Rows built, reordered and abandoned without confirming.
  const rows = [offer(fx, 0, 34_000), offer(fx, 1, 31_500), offer(fx, 2, 39_000)];
  build(fx, rows, 0);
  build(fx, [...rows].reverse(), 2);
  build(fx, rows.slice(0, 1), 0);

  fx.repo.listVendorOffers(WS, fx.moment.id);
  fx.repo.findLiveVendorSelection(WS, fx.moment.id);

  assertEqual(fx.storage.writes.length, before, 'Draft entry wrote to storage.');
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.vendorOffers.length, 0, 'A draft row was persisted.');
});

// ─── Part 5: the completion test ─────────────────────────────────────────────

check('27. Three offers compared, the second chosen — one Confirmed VendorSelection', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const before = fx.storage.writes.length;

  const written = fx.repo.commitVendorSelection(WS, bundle, NOW);
  assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);

  // One transaction: every offer, the Decision and the Event in one write.
  assertEqual(fx.storage.writes.length - before, 1, 'The bundle was written in more than one operation.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const selections = state.value!.decisions.filter(d => d.decisionType === 'VendorSelection');
  assertEqual(selections.length, 1, 'Not exactly one vendor selection was created.');
  assertEqual(selections[0].status, 'Confirmed', 'The selection is not Confirmed.');
  assertEqual(selections[0].provider, 'HumanOperator', 'The selection was not an operator judgement.');
  assertEqual(state.value!.vendorOffers.length, 3, 'Not every considered offer was stored.');
  assertEqual(state.value!.events.filter(e => e.eventType === 'VendorSelected').length, 1, 'Not exactly one event.');
});

check('28. The two rejected offers remain completely legible in inputs', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  assert(fx.repo.commitVendorSelection(WS, bundle, NOW).ok, 'Commit failed.');

  const inputs = bundle.decision.inputs as Record<string, unknown>;
  const considered = inputs.consideredOffers as {
    offerId: string; vendorId: string;
    vendor: { name: string; city: string; countryCode: string };
    quotedVendorCost: Money; source: string; quotedAt: string; leadTimeDays?: number; terms?: string;
  }[];

  assertEqual(considered.length, 3, 'The complete considered set was not recorded.');
  assertEqual(inputs.selectedVendorId, 'v2', 'The wrong vendor was recorded as chosen.');

  const rejected = considered.filter(o => o.offerId !== inputs.selectedOfferId);
  assertEqual(rejected.length, 2, 'The rejected offers were not both recorded.');
  for (const r of rejected) {
    // Not counts, not bare ids — everything needed to explain the choice later.
    assert(r.vendor.name.length > 0, 'A rejected offer lost its vendor name.');
    assert(r.vendor.city.length > 0, 'A rejected offer lost its vendor city.');
    assert(typeof r.quotedVendorCost.amountMinor === 'number', 'A rejected offer lost its quote.');
    assertEqual(r.quotedVendorCost.currency, 'NGN', 'A rejected offer lost its currency.');
    assertEqual(r.source, 'WhatsApp', 'A rejected offer lost its channel.');
    assertEqual(r.quotedAt, QUOTED, 'A rejected offer lost its quoted time.');
    assertEqual(r.leadTimeDays, 3, 'A rejected offer lost its lead time.');
    assertEqual(r.terms, 'Includes wrapping', 'A rejected offer lost its terms.');
  }
  assertEqual(rejected.map(r => r.vendorId).sort().join(','), 'v1,v3', 'The wrong offers were rejected.');
});

check('29. The Decision carries the brief, item and budget evidence, and no recommendation', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const inputs = bundle.decision.inputs as Record<string, unknown>;

  assertEqual(inputs.briefId, fx.brief.id, 'The brief was not referenced.');
  assertEqual(inputs.briefRevision, fx.brief.revision, 'The brief revision was not referenced.');
  assertEqual(inputs.itemSelectionDecisionId, fx.itemDecisionId, 'The item selection was not referenced.');
  assertEqual(inputs.selectedItemId, ITEM.id, 'The item was not referenced.');
  assertEqual((inputs.selectedItem as { name: string }).name, ITEM.name, 'The item snapshot was lost.');
  assertEqual((inputs.approvedBudget as Money).amountMinor, BUDGET.amountMinor, 'The budget was not recorded.');

  assertEqual(bundle.decision.recommendation, undefined, 'A recommendation was fabricated.');
  assertEqual(bundle.decision.overrideReason, undefined, 'An override reason was fabricated.');
  assert(bundle.decision.finalDecision.includes('quoted'), 'The final decision does not mark the amount as a quote.');
});

check('30. Every snapshot in the bundle is a defensive copy', () => {
  const fx = preparedWorkspace();
  const rows = [offer(fx, 0, 34_000)];
  const built = build(fx, rows, 0);
  assert(built.ok, 'Build failed.');
  if (!built.ok) return;

  const offerRecord = built.value.offers[0];
  const inputs = built.value.decision.inputs as Record<string, unknown>;

  // Mutating the source vendor and the offer's own money must not reach the
  // Decision's copies.
  fx.vendors[0].name = 'Renamed after the fact';
  offerRecord.quotedVendorCost.amountMinor = 1;
  offerRecord.vendorSnapshot.name = 'Also renamed';

  const considered = (inputs.consideredOffers as { vendor: { name: string }; quotedVendorCost: Money }[])[0];
  assert(considered.vendor.name !== 'Also renamed', 'The considered set aliased the offer snapshot.');
  assert(considered.quotedVendorCost.amountMinor !== 1, 'The considered set aliased the offer money.');
  assert((inputs.selectedVendor as { name: string }).name !== 'Also renamed', 'The selected vendor aliased the offer.');
  assert((inputs.selectedQuotedVendorCost as Money).amountMinor !== 1, 'The selected quote aliased the offer.');
});

check('31. Confirmed offers carry the brief, item and vendor references', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  assert(fx.repo.commitVendorSelection(WS, bundle, NOW).ok, 'Commit failed.');

  const stored = fx.repo.listVendorOffers(WS, fx.moment.id);
  assert(stored.ok, 'Offers unreadable.');
  if (!stored.ok) return;
  assertEqual(stored.value.length, 3, 'Not every offer was stored.');
  for (const o of stored.value) {
    assertEqual(o.momentId, fx.moment.id, 'An offer lost its moment.');
    assertEqual(o.briefId, fx.brief.id, 'An offer lost its brief.');
    assertEqual(o.briefRevision, fx.brief.revision, 'An offer lost its brief revision.');
    assertEqual(o.itemSelectionDecisionId, fx.itemDecisionId, 'An offer lost its item selection.');
    assertEqual(o.selectedItemId, ITEM.id, 'An offer lost its item.');
    assertEqual(o.itemSnapshot.name, ITEM.name, 'An offer lost its item snapshot.');
    assertEqual(o.recordedAt, NOW, 'An offer lost when it was recorded.');
    assertEqual(o.quotedAt, QUOTED, 'An offer lost when it was quoted.');
  }
});

check('32. A later vendor edit does not rewrite a confirmed offer', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  assert(fx.repo.commitVendorSelection(WS, bundle, NOW).ok, 'Commit failed.');

  const stored = fx.repo.findVendor(WS, 'v2');
  assert(stored.ok && stored.value, 'Vendor missing.');
  const checked = validateVendorDraft({ ...GOOD_DRAFT, name: 'Completely Different Ltd', city: 'Abuja' });
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;
  assert(fx.repo.updateVendor(WS, applyVendorEdit(stored.value!, checked.value, LATER), LATER).ok, 'Update failed.');
  assert(fx.repo.setVendorActive(WS, 'v2', false, LATER).ok, 'Deactivate failed.');

  const offers = fx.repo.listVendorOffers(WS, fx.moment.id);
  assert(offers.ok, 'Offers unreadable.');
  if (!offers.ok) return;
  const chosen = offers.value.find(o => o.vendorId === 'v2')!;
  assertEqual(chosen.vendorSnapshot.name, 'Vendor v2', 'A rename rewrote a confirmed offer.');
  assertEqual(chosen.vendorSnapshot.city, 'Lagos', 'A move rewrote a confirmed offer.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const decision = state.value!.decisions.find(d => d.decisionType === 'VendorSelection')!;
  assertEqual(
    (decision.inputs as { selectedVendor: { name: string } }).selectedVendor.name,
    'Vendor v2',
    'A rename rewrote the decision.',
  );
});

check('33. The Event is the smallest accurate record, and points at the evidence', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const event = bundle.event;
  const inputs = bundle.decision.inputs as Record<string, unknown>;

  assertEqual(event.eventType, 'VendorSelected', 'The event has the wrong name.');
  assertEqual(event.actorType, 'Operator', 'The event was not attributed to the operator.');
  assertEqual(event.source, 'Platform', 'The event claims another channel.');
  assertEqual(event.momentId, fx.moment.id, 'The event is on the wrong moment.');

  const payload = event.payload as Record<string, unknown>;
  assertEqual(payload.selectedOfferId, inputs.selectedOfferId, 'The event names a different offer.');
  assertEqual(payload.selectedVendorId, inputs.selectedVendorId, 'The event names a different vendor.');
  assertEqual(payload.itemSelectionDecisionId, inputs.itemSelectionDecisionId, 'The event lost the item reference.');
  // Identifiers only — the evidence lives on the Decision and the offers.
  assert(!('consideredOffers' in payload), 'The event duplicates the considered set.');
  assert(!('selectedVendor' in payload), 'The event duplicates the vendor snapshot.');
});

check('34. `VendorContacted` was not used, and no later milestone was pre-empted', () => {
  assert((DECISION_TYPES as readonly string[]).includes('VendorSelection'), 'VendorSelection is not declared.');
  assert((EVENT_TYPES as readonly string[]).includes('VendorSelected'), 'VendorSelected is not declared.');
  // Aniyé contacts nobody: an operator types up what they were already told.
  assert(!(EVENT_TYPES as readonly string[]).includes('VendorContacted'), 'VendorContacted was introduced.');
  assert(!(DECISION_TYPES as readonly string[]).includes('VendorSubstitution'), 'VendorSubstitution belongs to a later milestone.');
  // `CourierSelection` left this list at H3.5, the milestone that produces it.
  for (const t of ['QAException', 'BudgetException']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
  // The fulfilment Events left this list at H3.6 and `MomentClosed` at H3.8.
  assert((EVENT_TYPES as readonly string[]).includes('MomentClosed'), 'H3.8 MomentClosed is missing.');
  for (const t of ['Returned', 'Escalation']) {
    assert(!(EVENT_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
  assertEqual(OFFER_SOURCES.length, 4, 'OFFER_SOURCES changed length.');
  assert(!(OFFER_SOURCES as readonly string[]).includes('Platform'), 'A vendor cannot reach the platform.');
});

// ─── Part 6: the repository trust boundary ───────────────────────────────────

type Bundle = { offers: VendorOffer[]; decision: Decision; event: OperationalEvent };

function withInputs(bundle: Bundle, patch: Record<string, unknown>): Bundle {
  return { ...bundle, decision: { ...bundle.decision, inputs: { ...bundle.decision.inputs, ...patch } } };
}

/** Submit, expect refusal, and prove **nothing moved**. */
function expectRefused(fx: Fx, bundle: Bundle, what: string): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorOffers = JSON.stringify(before.value!.vendorOffers);
  const priorDecisions = JSON.stringify(before.value!.decisions);
  const priorEvents = JSON.stringify(before.value!.events);
  const priorWrites = fx.storage.writes.length;

  const written = fx.repo.commitVendorSelection(WS, bundle, NOW);
  assert(!written.ok, `${what} was accepted.`);
  if (!written.ok) {
    assert(
      written.reason.toLowerCase().includes('nothing was recorded'),
      `${what} was refused without saying nothing was recorded: "${written.reason}"`,
    );
  }

  assertEqual(fx.storage.writes.length, priorWrites, `${what} still wrote to storage.`);
  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(after.value!.vendorOffers), priorOffers, `${what} changed the offers.`);
  assertEqual(JSON.stringify(after.value!.decisions), priorDecisions, `${what} changed the decisions.`);
  assertEqual(JSON.stringify(after.value!.events), priorEvents, `${what} changed the events.`);
}

check('35. A stale brief revision writes nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  expectRefused(fx, withInputs(bundle, { briefRevision: 99 }), 'A stale brief revision');
  expectRefused(fx, withInputs(bundle, { briefId: 'brief-elsewhere' }), 'An unknown brief');
});

check('36. A changed or superseded item selection writes nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  expectRefused(fx, withInputs(bundle, { itemSelectionDecisionId: 'decision-elsewhere' }), 'A different item selection');

  // The item selection is superseded underneath, at the same reference.
  const raw = JSON.parse(fx.storage.getItem(OPERATIONS_KEY)!) as OperationsState;
  const target = raw.decisions.find(d => d.decisionType === 'ItemSelection')!;
  target.status = 'Superseded';
  fx.storage.setItem(OPERATIONS_KEY, JSON.stringify(raw));
  expectRefused(fx, bundle, 'A submission against a superseded item selection');
});

check('37. An altered selected-item snapshot writes nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const item = (bundle.decision.inputs as { selectedItem: Record<string, unknown> }).selectedItem;

  expectRefused(fx, withInputs(bundle, { selectedItem: { ...item, name: 'Something else' } }), 'A renamed item snapshot');
  expectRefused(fx, withInputs(bundle, { selectedItem: { ...item, price: ngn(1) } }), 'A repriced item snapshot');
  expectRefused(fx, withInputs(bundle, { selectedItemId: 'fx-other' }), 'A different item id');
  expectRefused(fx, withInputs(bundle, { approvedBudget: ngn(1) }), 'An altered budget');

  // And the same alteration on an offer rather than the Decision.
  const tampered = {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, itemSnapshot: { ...o.itemSnapshot, name: 'Other' } } : o)),
  };
  expectRefused(fx, tampered, 'An offer describing a different item');
});

check('38. A vendor renamed or deactivated while the screen is open writes nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);

  const stored = fx.repo.findVendor(WS, 'v2');
  assert(stored.ok && stored.value, 'Vendor missing.');
  const checked = validateVendorDraft({ ...GOOD_DRAFT, name: 'Renamed Mid-Comparison' });
  assert(checked.ok, 'Draft invalid.');
  if (!checked.ok) return;
  assert(fx.repo.updateVendor(WS, applyVendorEdit(stored.value!, checked.value, LATER), LATER).ok, 'Update failed.');
  expectRefused(fx, bundle, 'A submission naming a renamed vendor');

  const fx2 = preparedWorkspace();
  const bundle2 = threeOfferBundle(fx2);
  assert(fx2.repo.setVendorActive(WS, 'v3', false, LATER).ok, 'Deactivate failed.');
  expectRefused(fx2, bundle2, 'A submission naming a deactivated vendor');
});

check('39. An unknown or foreign-workspace vendor writes nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const gone = {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, vendorId: 'v-nowhere', vendorSnapshot: { ...o.vendorSnapshot, vendorId: 'v-nowhere' } } : o)),
  };
  expectRefused(fx, gone, 'An offer naming a vendor outside the directory');

  const foreign = { ...bundle, offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, workspaceId: 'org-elsewhere' } : o)) };
  expectRefused(fx, foreign, 'An offer belonging to another workspace');
});

check('40. Altered vendor, cost, source, timestamp, lead-time or note evidence writes nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const considered = (bundle.decision.inputs as { consideredOffers: Record<string, unknown>[] }).consideredOffers;

  for (const [patch, label] of [
    [{ quotedVendorCost: ngn(1) }, 'A repriced considered offer'],
    [{ source: 'Email' }, 'A rechanneled considered offer'],
    [{ quotedAt: LATER }, 'A retimed considered offer'],
    [{ leadTimeDays: 99 }, 'An altered lead time'],
    [{ terms: 'Different terms' }, 'Altered terms'],
    [{ vendor: { vendorId: 'v1', name: 'Wrong', countryCode: 'NG', city: 'Lagos' } }, 'An altered vendor snapshot'],
    [{ vendorId: 'v9' }, 'An altered vendor id'],
    [{ offerId: 'offer-elsewhere' }, 'An altered offer id'],
  ] as const) {
    const patched = [{ ...considered[0], ...patch }, considered[1], considered[2]];
    expectRefused(fx, withInputs(bundle, { consideredOffers: patched }), label);
  }

  // The same alterations on the offer records themselves.
  expectRefused(fx, {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, quotedVendorCost: ngn(1) } : o)),
  }, 'A repriced offer record');
  expectRefused(fx, {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, source: 'Email' as const } : o)),
  }, 'A rechanneled offer record');
  expectRefused(fx, {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, leadTimeDays: -1 } : o)),
  }, 'A negative lead time');
  expectRefused(fx, {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, quotedAt: 'not a date' } : o)),
  }, 'An unreadable quoted time');
});

check('41. Missing, reordered, incomplete or extra offer candidates are refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const considered = (bundle.decision.inputs as { consideredOffers: unknown[] }).consideredOffers;

  expectRefused(fx, withInputs(bundle, { consideredOffers: [] }), 'An emptied considered set');
  expectRefused(fx, withInputs(bundle, { consideredOffers: [...considered].reverse() }), 'A reordered considered set');
  expectRefused(fx, withInputs(bundle, { consideredOffers: considered.slice(0, 2) }), 'A truncated considered set');
  expectRefused(fx, withInputs(bundle, { consideredOffers: [...considered, considered[0]] }), 'An extended considered set');
  expectRefused(fx, withInputs(bundle, { consideredOffers: undefined }), 'A missing considered set');

  // Dropping an offer record while leaving the Decision intact.
  expectRefused(fx, { ...bundle, offers: bundle.offers.slice(0, 2) }, 'A dropped offer record');
  expectRefused(fx, { ...bundle, offers: [] }, 'No offer records at all');
});

check('42. A duplicated offer or vendor inside the bundle is refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const dupId = { ...bundle, offers: [bundle.offers[0], { ...bundle.offers[1], id: bundle.offers[0].id }, bundle.offers[2]] };
  expectRefused(fx, dupId, 'Two offers sharing an identifier');

  const dupVendor = {
    ...bundle,
    offers: [bundle.offers[0], { ...bundle.offers[1], vendorId: 'v1', vendorSnapshot: bundle.offers[0].vendorSnapshot }, bundle.offers[2]],
  };
  expectRefused(fx, dupVendor, 'The same vendor quoted twice');
});

check('43. A selection that does not resolve to one submitted offer is refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  expectRefused(fx, withInputs(bundle, { selectedOfferId: 'offer-elsewhere' }), 'A chosen offer outside the set');
  expectRefused(fx, withInputs(bundle, { selectedVendorId: 'v1' }), 'A chosen vendor disagreeing with the chosen offer');
  expectRefused(fx, withInputs(bundle, {
    selectedVendor: { vendorId: 'v1', name: 'Vendor v1', countryCode: 'NG', city: 'Lagos' },
  }), 'A chosen vendor snapshot disagreeing with the chosen offer');
  expectRefused(fx, withInputs(bundle, { selectedQuotedVendorCost: ngn(1) }), 'A chosen quote disagreeing with its offer');
});

check('44. A RuleEngine, non-Confirmed or blank-reason selection is refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, provider: 'RuleEngine' } }, 'A rule-engine selection');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, status: 'Superseded' } }, 'A superseded selection');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, decisionType: 'ItemSelection' } }, 'A non-vendor decision');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, reason: '  ' } }, 'A blank reason');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, recommendation: 'the cheapest' } }, 'A fabricated recommendation');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, overrideReason: 'because' } }, 'A fabricated override reason');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, workspaceId: 'org-elsewhere' } }, 'A foreign-workspace decision');
});

check('45. A non-Operator, wrong-source or disagreeing Event is refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const p = bundle.event.payload as Record<string, unknown>;

  expectRefused(fx, { ...bundle, event: { ...bundle.event, actorType: 'System' } }, 'A system-attributed event');
  expectRefused(fx, { ...bundle, event: { ...bundle.event, source: 'WhatsApp' } }, 'An event claiming another channel');
  expectRefused(fx, { ...bundle, event: { ...bundle.event, eventType: 'ItemSelected' } }, 'A non-vendor event');
  expectRefused(fx, { ...bundle, event: { ...bundle.event, actorId: 'someone-else' } }, 'An event naming a different actor');
  expectRefused(fx, { ...bundle, event: { ...bundle.event, workspaceId: 'org-elsewhere' } }, 'A foreign-workspace event');
  for (const patch of [{ selectedOfferId: 'nope' }, { selectedVendorId: 'v1' }, { briefRevision: 99 }, { itemSelectionDecisionId: 'x' }]) {
    expectRefused(fx, { ...bundle, event: { ...bundle.event, payload: { ...p, ...patch } } }, 'An event disagreeing with the decision');
  }
});

check('46. A bundle assembled at different instants is refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  expectRefused(fx, { ...bundle, event: { ...bundle.event, occurredAt: LATER } }, 'An event from another instant');
  expectRefused(fx, { ...bundle, decision: { ...bundle.decision, createdAt: LATER } }, 'A decision created before it was confirmed');
  expectRefused(fx, {
    ...bundle,
    offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, recordedAt: LATER } : o)),
  }, 'An offer recorded at another instant');
});

check('47. A cancelled or unready moment is refused at the boundary', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);

  const raw = JSON.parse(fx.storage.getItem(OPERATIONS_KEY)!) as OperationsState;
  raw.moments[0].status = 'NeedsReview';
  fx.storage.setItem(OPERATIONS_KEY, JSON.stringify(raw));
  expectRefused(fx, bundle, 'A submission for a moment sent back for review');

  const cancelled = JSON.parse(fx.storage.getItem(OPERATIONS_KEY)!) as OperationsState;
  cancelled.moments[0].status = 'Cancelled';
  cancelled.moments[0].cancelledAt = LATER;
  fx.storage.setItem(OPERATIONS_KEY, JSON.stringify(cancelled));
  expectRefused(fx, bundle, 'A submission for a cancelled moment');
});

check('48. Duplicate and double-click confirmation are refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  assert(fx.repo.commitVendorSelection(WS, bundle, NOW).ok, 'The first commit failed.');
  const afterFirst = fx.storage.writes.length;

  // The identical bundle, submitted again.
  const second = fx.repo.commitVendorSelection(WS, bundle, NOW);
  assert(!second.ok, 'A double-click created a second record.');
  assertEqual(fx.storage.writes.length, afterFirst, 'A refused duplicate still wrote.');

  // A stale tab that never saw the first confirmation, with fresh identifiers.
  const stale = build(fx, [offer(fx, 0, 20_000)], 0);
  assert(stale.ok, 'The stale build failed unexpectedly.');
  if (stale.ok) {
    const written = fx.repo.commitVendorSelection(WS, stale.value, NOW);
    assert(!written.ok, 'A second live vendor selection was accepted.');
  }

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.decisions.filter(d => d.decisionType === 'VendorSelection').length, 1, 'A duplicate decision landed.');
  assertEqual(state.value!.events.filter(e => e.eventType === 'VendorSelected').length, 1, 'A duplicate event landed.');
  assertEqual(state.value!.vendorOffers.length, 3, 'Duplicate offers landed.');
});

check('49. Confirming preserves every existing record untouched', () => {
  const fx = preparedWorkspace();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorDecisions = JSON.stringify(before.value!.decisions);
  const priorEvents = JSON.stringify(before.value!.events);
  const priorMoments = JSON.stringify(before.value!.moments);
  const priorBriefs = JSON.stringify(before.value!.executionBriefs);
  const priorVendors = JSON.stringify(before.value!.vendors);

  assert(fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW).ok, 'Commit failed.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  const kept = after.value!;
  assertEqual(JSON.stringify(kept.decisions.slice(0, before.value!.decisions.length)), priorDecisions, 'Existing decisions were rewritten.');
  assertEqual(JSON.stringify(kept.events.slice(0, before.value!.events.length)), priorEvents, 'Existing events were rewritten.');
  assertEqual(JSON.stringify(kept.moments), priorMoments, 'Moments were rewritten.');
  assertEqual(JSON.stringify(kept.executionBriefs), priorBriefs, 'Briefs were rewritten.');
  assertEqual(JSON.stringify(kept.vendors), priorVendors, 'Vendors were rewritten.');
});

check('50. Validation refuses two live vendor selections for one moment', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  assert(fx.repo.commitVendorSelection(WS, bundle, NOW).ok, 'Commit failed.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const doubled = { ...state.value!, decisions: [...state.value!.decisions, { ...bundle.decision, id: 'decision-clone' }] };
  assert(!validateOperationsState(doubled, WS).ok, 'Two live vendor selections passed validation.');
});

check('51. The honest bundle still commits, so the boundary is not refusing everything', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  const written = fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW);
  assert(written.ok, `An untampered bundle was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - before, 1, 'The honest commit was not a single write.');
});

check('52. A single-offer comparison is allowed and recorded as such', () => {
  const fx = preparedWorkspace();
  const built = build(fx, [offer(fx, 0, 34_000)], 0);
  assert(built.ok, `A one-quote comparison was refused: ${built.ok ? '' : built.reason}`);
  if (!built.ok) return;
  assert(fx.repo.commitVendorSelection(WS, built.value, NOW).ok, 'A one-quote comparison was refused at the boundary.');
  const considered = (built.value.decision.inputs as { consideredOffers: unknown[] }).consideredOffers;
  assertEqual(considered.length, 1, 'The considered set does not report one option.');
});

// ─── Part 7: schema and structure ────────────────────────────────────────────

// H3.5 amended checks 34, 53 and 54: they pinned the literal version `4` and the
// pre-H3.5 decision set, so a legitimate additive rung (v4 → v5, the courier
// collection) failed them. What they test is unchanged and now version-agnostic.
check('53. The operations schema is at or beyond v4, and v1 walks every rung to it', () => {
  assert(CURRENT_OPERATIONS_SCHEMA_VERSION >= 4, 'Operations schema regressed below v4.');
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k' }], decisions: [{ id: 'd-old' }], events: [{ id: 'e-old' }],
    createdAt: T0, updatedAt: T0,
    aFutureKey: { kept: true },
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.from, 1, 'Wrong source version reported.');
  assertEqual(result.state.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assert(Array.isArray(result.state.executionBriefs), 'The v1 → v2 rung did not run.');
  assert(Array.isArray(result.state.vendors), 'The v3 → v4 rung did not add vendors.');
  assert(Array.isArray(result.state.vendorOffers), 'The v3 → v4 rung did not add offers.');
  // H3.1 – H3.3 history survives the whole chain, and unknown keys with it.
  assertEqual(result.state.moments.length, 1, 'A moment was lost in migration.');
  assertEqual(result.state.decisions.length, 1, 'A decision was lost in migration.');
  assertEqual(result.state.events.length, 1, 'An event was lost in migration.');
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('54. The v3 → v4 rung invents no vendors and touches no existing record', () => {
  const v3 = {
    schemaVersion: 3, workspaceId: WS,
    moments: [{ id: 'm-old', sourceKey: 'k', status: 'ReadyForExecution',
      policyResolutionSnapshot: { policyId: 'p', policyVersion: 1, approvedRecognitionBudget: BUDGET, excludedCategories: ['Wellness & Spa'] } }],
    decisions: [{ id: 'd-old', decisionType: 'ItemSelection' }],
    events: [{ id: 'e-old' }],
    executionBriefs: [{ id: 'b-old' }],
    createdAt: T0, updatedAt: T0,
  };
  const before = JSON.stringify(v3);
  const result = migrateOperationsState(JSON.parse(before));
  assert(result.status === 'migrated', 'A v3 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(result.state.vendors.length, 0, 'The migration invented vendors.');
  assertEqual(result.state.vendorOffers.length, 0, 'The migration invented offers.');
  assertEqual(JSON.stringify(result.state.moments), JSON.stringify(JSON.parse(before).moments), 'Moments were altered.');
  assertEqual(JSON.stringify(result.state.decisions), JSON.stringify(JSON.parse(before).decisions), 'Decisions were altered.');
  assertEqual(JSON.stringify(result.state.events), JSON.stringify(JSON.parse(before).events), 'Events were altered.');
  assertEqual(JSON.stringify(result.state.executionBriefs), JSON.stringify(JSON.parse(before).executionBriefs), 'Briefs were altered.');
});

check('55. A future schema version is refused, and reads never rewrite storage', () => {
  const future = { schemaVersion: 99, workspaceId: WS, moments: [], decisions: [], events: [], executionBriefs: [], vendors: [], vendorOffers: [], createdAt: T0, updatedAt: T0 };
  const result = migrateOperationsState(future);
  assertEqual(result.status, 'invalid', 'A future version was adopted.');

  const v3 = { schemaVersion: 3, workspaceId: WS, moments: [], decisions: [], events: [], executionBriefs: [], createdAt: T0, updatedAt: T0 };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v3) });
  const repo = createLocalOperationsRepository(storage);
  const loaded = repo.load(WS);
  assert(loaded.ok && loaded.value, 'A v3 payload was refused.');
  assertEqual(loaded.value!.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'The read did not migrate in memory.');
  assertEqual(storage.writes.length, 0, 'Reading rewrote storage.');
});

check('56. Structural validation refuses malformed offers', () => {
  const fx = preparedWorkspace();
  assert(fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW).ok, 'Commit failed.');
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const base = state.value!;

  for (const [patch, label] of [
    [{ quotedVendorCost: { amountMinor: -1, currency: 'NGN' } }, 'a negative quote'],
    [{ quotedVendorCost: { amountMinor: 1.5, currency: 'NGN' } }, 'a fractional minor unit'],
    [{ quotedVendorCost: { amountMinor: 100, currency: 'ZZZ' } }, 'an unknown currency'],
    [{ source: 'Platform' }, 'a platform-sourced quote'],
    [{ vendorId: 'v-nowhere' }, 'an unknown vendor'],
    [{ leadTimeDays: -1 }, 'a negative lead time'],
    [{ leadTimeDays: 1.5 }, 'a fractional lead time'],
    [{ quotedAt: '' }, 'a missing quoted time'],
  ] as const) {
    const broken = JSON.parse(JSON.stringify(base)) as OperationsState;
    Object.assign(broken.vendorOffers[0], patch);
    assert(!validateOperationsState(broken, WS).ok, `Validation accepted ${label}.`);
  }
});

check('57. No vendor data reaches WorkspaceState, and no Workspace route exposes it', () => {
  const ws = createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
  for (const forbidden of ['vendors', 'vendorOffers', 'offers', 'suppliers']) {
    assert(!Object.keys(ws).includes(forbidden), `WorkspaceState gained a "${forbidden}" collection.`);
  }
  assert(!JSON.stringify(ws).includes('Lagos Gift Company'), 'Vendor data leaked into the workspace document.');
  // The vendor routes live under /operations, never under /workspace.
  assertEqual(titleFor('/operations/vendors'), 'Vendors', 'The directory has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/vendor'), 'Vendor offers', 'The comparison has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/item'), 'Choose an item', 'The item title regressed.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'The moment title regressed.');
});

check('58. A vendor snapshot is a copy — later edits cannot rewrite it', () => {
  const v = vendorRecord('v-copy');
  const snapshot = snapshotVendor(v);
  v.name = 'Renamed after the fact';
  v.city = 'Elsewhere';
  assertEqual(snapshot.name, 'Vendor v-copy', 'A snapshot followed a later rename.');
  assertEqual(snapshot.city, 'Lagos', 'A snapshot followed a later move.');
});

// ─── Part 8: runtime shape enforcement (H3.4-D1) ─────────────────────────────
//
// The builders produce the intended shapes; these prove the **repository**
// enforces them at runtime against callers that never used a builder.
// TypeScript checks no excess property on a widened value, and nothing at all
// once the code is running.

/** Assert a vendor write is refused and that storage did not move. */
function expectVendorRefused(fx: Fx, vendor: unknown, what: string, mode: 'create' | 'update' = 'create'): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const prior = JSON.stringify(before.value!.vendors);
  const priorWrites = fx.storage.writes.length;

  const written = mode === 'create'
    ? fx.repo.createVendor(WS, vendor as Vendor, NOW)
    : fx.repo.updateVendor(WS, vendor as Vendor, LATER);
  assert(!written.ok, `${what} was accepted.`);

  assertEqual(fx.storage.writes.length, priorWrites, `${what} still wrote to storage.`);
  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(after.value!.vendors), prior, `${what} changed the directory.`);
}

const INTELLIGENCE_FIELDS = {
  reliabilityScore: 0.97, rating: 5, capacity: 100, sla: '24h', onboardingStatus: 'Approved',
};

check('59. A vendor carrying intelligence fields is refused, and writes nothing', () => {
  const fx = preparedWorkspace();
  for (const [field, value] of Object.entries(INTELLIGENCE_FIELDS)) {
    expectVendorRefused(fx, { ...vendorRecord('v-new'), [field]: value }, `A vendor carrying ${field}`);
  }
  // All of them at once, for good measure.
  expectVendorRefused(fx, { ...vendorRecord('v-new'), ...INTELLIGENCE_FIELDS }, 'A vendor carrying a whole scorecard');
  // And a price list, which is the other thing H4.4 will eventually want.
  expectVendorRefused(fx, { ...vendorRecord('v-new'), priceList: [{ item: 'x', price: 1 }] }, 'A vendor carrying a price list');
});

check('60. A vendor edit cannot smuggle undeclared fields in', () => {
  const fx = preparedWorkspace();
  const stored = fx.repo.findVendor(WS, 'v1');
  assert(stored.ok && stored.value, 'Vendor missing.');
  expectVendorRefused(fx, { ...stored.value!, ...INTELLIGENCE_FIELDS }, 'An edit adding a scorecard', 'update');
  expectVendorRefused(fx, { ...stored.value!, preferred: true }, 'An edit adding preferred status', 'update');
});

check('61. A malformed email reaching createVendor directly is refused', () => {
  const fx = preparedWorkspace();
  for (const email of ['not-an-address', 'missing@tld', '@nobody.example', 'two@@at.example']) {
    expectVendorRefused(fx, { ...vendorRecord('v-new'), whatsapp: undefined, email }, `The email "${email}"`);
  }
  // The shape check is the same one the form applies — enforced at the boundary.
  const good = { ...vendorRecord('v-new'), whatsapp: undefined, email: 'orders@vendor.example' };
  assert(fx.repo.createVendor(WS, good as Vendor, NOW).ok, 'A well-formed email was refused.');
});

check('62. Non-string optional vendor fields are refused', () => {
  const fx = preparedWorkspace();
  for (const [field, value] of [
    ['note', 42], ['note', ''], ['note', {}],
    ['whatsapp', 12345], ['whatsapp', '   '],
    ['email', ['a@b.example']],
  ] as const) {
    expectVendorRefused(fx, { ...vendorRecord('v-new'), [field]: value }, `A ${field} of ${JSON.stringify(value)}`);
  }
});

check('63. Unreadable vendor timestamps are refused', () => {
  const fx = preparedWorkspace();
  for (const bad of ['banana', '2026', 'August 1 2026', '2026-08-01', 1_700_000_000, null, '']) {
    expectVendorRefused(fx, { ...vendorRecord('v-new'), createdAt: bad }, `A createdAt of ${JSON.stringify(bad)}`);
    expectVendorRefused(fx, { ...vendorRecord('v-new'), updatedAt: bad }, `An updatedAt of ${JSON.stringify(bad)}`);
  }
  // H3.4-D2 amended this assertion. D1 claimed `isIsoInstant` accepted "exactly
  // what toISOString() emits" while also accepting second precision — the two
  // cannot both be true, and the second one was wrong. Only the three-digit
  // millisecond form is canonical.
  assert(isIsoInstant('2026-08-01T00:00:00.000Z'), 'A canonical instant was rejected.');
  assert(!isIsoInstant('2026-08-01T00:00:00Z'), 'A second-precision instant was accepted.');
  assert(!isIsoInstant('2026-08-01T00:00:00+01:00'), 'A non-UTC offset was accepted.');
});

check('64. A vendor with no contact method is refused at the repository', () => {
  const fx = preparedWorkspace();
  expectVendorRefused(fx, { ...vendorRecord('v-new'), whatsapp: undefined, email: undefined }, 'An unreachable vendor');
});

check('65. Structural validation refuses malformed vendor fields on read', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const base = state.value!;
  for (const [patch, label] of [
    [{ note: 7 }, 'a numeric note'],
    [{ whatsapp: '' }, 'a blank whatsapp'],
    [{ createdAt: 'banana' }, 'an unreadable createdAt'],
    [{ updatedAt: '2026-08-01' }, 'a date-only updatedAt'],
  ] as const) {
    const broken = JSON.parse(JSON.stringify(base)) as OperationsState;
    Object.assign(broken.vendors[0], patch);
    assert(!validateOperationsState(broken, WS).ok, `Validation accepted ${label}.`);
  }
});

check('66. Shared timestamps must be readable, not merely equal', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  // The named defect: every shared instant is the same unusable string, so the
  // equality checks all agree and tell nobody anything.
  for (const bad of ['banana', '', '2026-08-01', 'later']) {
    const stamped = {
      offers: bundle.offers.map(o => ({ ...o, recordedAt: bad })),
      decision: { ...bundle.decision, createdAt: bad, confirmedAt: bad },
      event: { ...bundle.event, occurredAt: bad, recordedAt: bad },
    };
    expectRefused(fx, stamped as unknown as Bundle, `Shared timestamps of ${JSON.stringify(bad)}`);
  }
});

check('67. An unreadable quotedAt is refused, and a valid one may precede recordedAt', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const bad of ['banana', '2026-07-28', '', 42]) {
    expectRefused(fx, {
      ...bundle,
      offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, quotedAt: bad as string } : o)),
      decision: {
        ...bundle.decision,
        inputs: {
          ...bundle.decision.inputs,
          consideredOffers: (bundle.decision.inputs as { consideredOffers: Record<string, unknown>[] })
            .consideredOffers.map((c, i) => (i === 0 ? { ...c, quotedAt: bad } : c)),
        },
      },
    }, `A quotedAt of ${JSON.stringify(bad)}`);
  }
  // QUOTED precedes NOW, and the honest bundle commits — the quote came first.
  assert(QUOTED < NOW, 'The fixture does not exercise a quote preceding its recording.');
  assert(fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW).ok, 'A quote preceding recording was refused.');
});

check('68. Non-string or blank terms are refused in both the offer and the considered set', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const considered = (bundle.decision.inputs as { consideredOffers: Record<string, unknown>[] }).consideredOffers;

  // Consistently duplicated in both places, which is what made this pass before.
  for (const bad of [42, '', '   ', {}, null] as const) {
    expectRefused(fx, {
      ...bundle,
      offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, terms: bad as string } : o)),
      decision: {
        ...bundle.decision,
        inputs: {
          ...bundle.decision.inputs,
          consideredOffers: considered.map((c, i) => (i === 0 ? { ...c, terms: bad } : c)),
        },
      },
    }, `Terms of ${JSON.stringify(bad)}`);
  }
});

check('69. An altered, blank or contradictory finalDecision is refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [text, label] of [
    ['', 'A blank summary'],
    ['   ', 'A whitespace summary'],
    ['Vendor v1 — NGN 34,000.00 quoted', 'A summary naming the wrong vendor'],
    ['Vendor v2 — NGN 1.00 quoted', 'A summary stating the wrong amount'],
    ['Vendor v2 — NGN 31,500.50 paid', 'A summary claiming the amount was paid'],
    ['Vendor v2', 'A summary omitting the amount'],
  ] as const) {
    expectRefused(fx, { ...bundle, decision: { ...bundle.decision, finalDecision: text } }, label);
  }
  // The honest summary is exactly what the shared formatter produces.
  const selected = bundle.offers[1];
  assertEqual(
    bundle.decision.finalDecision,
    vendorFinalDecision(selected.vendorSnapshot, selected.quotedVendorCost),
    'The builder and the boundary disagree about the summary.',
  );
});

check('70. Extra Decision.inputs fields are refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const patch of [
    { customerCharge: { amountMinor: 6_000_000, currency: 'NGN' } },
    { margin: { amountMinor: 2_000_000, currency: 'NGN' } },
    { revenue: 1234 },
    { catalogDerivedCost: { amountMinor: 3_800_000, currency: 'NGN' } },
    { recommendedVendorId: 'v1' },
    { vendorScores: { v1: 0.9, v2: 0.7 } },
    { ranking: ['v2', 'v1', 'v3'] },
  ]) {
    expectRefused(fx, withInputs(bundle, patch), `Decision inputs carrying ${Object.keys(patch)[0]}`);
  }
});

check('71. Extra VendorOffer and considered-offer fields are refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const considered = (bundle.decision.inputs as { consideredOffers: Record<string, unknown>[] }).consideredOffers;

  for (const patch of [{ margin: 100 }, { customerCharge: 500 }, { score: 9 }, { rank: 1 }, { catalogPrice: 3_800_000 }]) {
    expectRefused(fx, {
      ...bundle,
      offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, ...patch } : o)),
    }, `A quote carrying ${Object.keys(patch)[0]}`);

    expectRefused(fx, withInputs(bundle, {
      consideredOffers: considered.map((c, i) => (i === 0 ? { ...c, ...patch } : c)),
    }), `A recorded quote carrying ${Object.keys(patch)[0]}`);
  }
});

check('72. Extra VendorSelected event payload fields are refused', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  const p = bundle.event.payload as Record<string, unknown>;
  for (const patch of [
    { consideredOffers: [1, 2, 3] },
    { quotedVendorCost: { amountMinor: 3_150_050, currency: 'NGN' } },
    { selectedVendor: { vendorId: 'v2', name: 'Vendor v2', countryCode: 'NG', city: 'Lagos' } },
    { margin: 1 },
    { reason: 'Cheapest' },
  ]) {
    expectRefused(fx, { ...bundle, event: { ...bundle.event, payload: { ...p, ...patch } } },
      `An event payload carrying ${Object.keys(patch)[0]}`);
  }
  // Exactly five identifiers, and no more.
  assertEqual(Object.keys(p).sort().join(','),
    'briefId,briefRevision,itemSelectionDecisionId,selectedOfferId,selectedVendorId',
    'The event payload is not the five identifiers.');
});

check('73. Honest vendor writes and an honest selection still commit', () => {
  // A validator that refuses everything would pass every check above.
  const fx = preparedWorkspace();

  const created = fx.repo.createVendor(WS, vendorRecord('v-honest'), NOW);
  assert(created.ok, `An honest vendor was refused: ${created.ok ? '' : created.reason}`);

  const stored = fx.repo.findVendor(WS, 'v-honest');
  assert(stored.ok && stored.value, 'Vendor missing.');
  const edit = validateVendorDraft({ ...GOOD_DRAFT, name: 'Renamed Honestly', city: 'Ibadan' });
  assert(edit.ok, 'Draft invalid.');
  if (!edit.ok) return;
  const updated = fx.repo.updateVendor(WS, applyVendorEdit(stored.value!, edit.value, LATER), LATER);
  assert(updated.ok, `An honest edit was refused: ${updated.ok ? '' : updated.reason}`);
  if (updated.ok) {
    assertEqual(updated.value.name, 'Renamed Honestly', 'The edit did not apply.');
    assertEqual(updated.value.createdAt, T0, 'The edit rewrote createdAt.');
  }

  assert(fx.repo.setVendorActive(WS, 'v-honest', false, LATER).ok, 'An honest deactivation was refused.');

  const before = fx.storage.writes.length;
  const written = fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW);
  assert(written.ok, `An honest selection was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - before, 1, 'The honest commit was not a single write.');
});

check('74. A canonical vendor is rebuilt, not spread', () => {
  const smuggled = { ...vendorRecord('v-x'), reliabilityScore: 0.9 };
  const result = canonicalVendor(smuggled, WS);
  assert(!result.ok, 'A smuggled field survived canonicalisation.');

  const clean = canonicalVendor(vendorRecord('v-y'), WS);
  assert(clean.ok, 'A clean vendor failed canonicalisation.');
  if (!clean.ok) return;
  assertEqual(
    Object.keys(clean.value).sort().join(','),
    'city,countryCode,createdAt,id,isActive,name,note,updatedAt,whatsapp,workspaceId',
    'The rebuilt vendor has an unexpected field list.',
  );
  // Every key it does have is one H3.4 declared.
  for (const k of Object.keys(clean.value)) {
    assert((VENDOR_KEYS as readonly string[]).includes(k), `Rebuilt vendor carries an undeclared "${k}".`);
  }
});

// ─── Part 9: recursive runtime shape (H3.4-D2) ───────────────────────────────
//
// D1 enforced exactness at the **outer** level only. Comparators inspect the
// fields they know about, so an extra key inside an otherwise-allowed object
// survived whenever it was copied consistently into every representation —
// which a caller assembling a bundle by hand does by construction.

check('75. Impossible and normalized calendar dates are refused', () => {
  const fx = preparedWorkspace();
  // `Date.parse` accepts all of these and silently moves them: 2026 is not a
  // leap year, April has 30 days, February never has 30.
  for (const bad of ['2026-02-29T00:00:00.000Z', '2026-02-30T00:00:00.000Z', '2026-04-31T00:00:00.000Z',
                     '2026-06-31T00:00:00.000Z', '2026-09-31T00:00:00.000Z']) {
    assert(!Number.isNaN(Date.parse(bad)), `The fixture ${bad} is not the trap it claims to be — Date.parse already rejects it.`);
    assert(!isIsoInstant(bad), `${bad} was accepted as a canonical instant.`);
    expectVendorRefused(fx, { ...vendorRecord('v-new'), createdAt: bad }, `A createdAt of ${bad}`);
    expectVendorRefused(fx, { ...vendorRecord('v-new'), updatedAt: bad }, `An updatedAt of ${bad}`);
  }
  // A real leap day in a real leap year round-trips, so the rule refuses
  // impossible dates rather than February.
  assert(isIsoInstant('2028-02-29T00:00:00.000Z'), 'A genuine leap day was rejected.');
});

check('76. Only exactly three millisecond digits are canonical', () => {
  for (const bad of ['2026-08-01T00:00:00Z', '2026-08-01T00:00:00.1Z', '2026-08-01T00:00:00.12Z',
                     '2026-08-01T00:00:00.1234Z', '2026-08-01T00:00:00.000+00:00', '2026-08-01 00:00:00.000Z']) {
    assert(!isIsoInstant(bad), `${bad} was accepted.`);
  }
  // Whatever the runtime actually emits must pass, or the rule is unusable.
  const emitted = new Date().toISOString();
  assert(isIsoInstant(emitted), `A genuine toISOString() value (${emitted}) was rejected.`);
  assert(isIsoInstant(new Date(0).toISOString()), 'The epoch was rejected.');
});

check('77. Non-canonical timestamps in a bundle write nothing', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const bad of ['2026-02-30T00:00:00.000Z', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00.12Z']) {
    expectRefused(fx, {
      offers: bundle.offers.map(o => ({ ...o, recordedAt: bad })),
      decision: { ...bundle.decision, createdAt: bad, confirmedAt: bad },
      event: { ...bundle.event, occurredAt: bad, recordedAt: bad },
    } as unknown as Bundle, `Shared timestamps of ${bad}`);

    expectRefused(fx, {
      ...bundle,
      offers: bundle.offers.map((o, i) => (i === 0 ? { ...o, quotedAt: bad } : o)),
      decision: {
        ...bundle.decision,
        inputs: {
          ...bundle.decision.inputs,
          consideredOffers: (bundle.decision.inputs as { consideredOffers: Record<string, unknown>[] })
            .consideredOffers.map((c, i) => (i === 0 ? { ...c, quotedAt: bad } : c)),
        },
      },
    }, `A quotedAt of ${bad}`);
  }
});

/**
 * Rebuild a bundle with a nested extra copied **consistently** into every
 * submitted representation — the offer, the considered entry and the selected
 * evidence. Consistency is what defeated the outer-level checks.
 */
function nested(fx: Fx, where: 'vendor' | 'item' | 'itemPrice' | 'quoted' | 'budget', patch: Record<string, unknown>): Bundle {
  const b = threeOfferBundle(fx);
  const inputs = b.decision.inputs as Record<string, unknown>;
  const considered = inputs.consideredOffers as Record<string, unknown>[];

  const offers = b.offers.map(o => {
    if (where === 'vendor') return { ...o, vendorSnapshot: { ...o.vendorSnapshot, ...patch } };
    if (where === 'item') return { ...o, itemSnapshot: { ...o.itemSnapshot, ...patch } };
    if (where === 'itemPrice') return { ...o, itemSnapshot: { ...o.itemSnapshot, price: { ...o.itemSnapshot.price, ...patch } } };
    if (where === 'quoted') return { ...o, quotedVendorCost: { ...o.quotedVendorCost, ...patch } };
    return o;
  });

  const newInputs: Record<string, unknown> = { ...inputs };
  if (where === 'vendor') {
    newInputs.selectedVendor = { ...(inputs.selectedVendor as object), ...patch };
    newInputs.consideredOffers = considered.map(c => ({ ...c, vendor: { ...(c.vendor as object), ...patch } }));
  }
  if (where === 'item') newInputs.selectedItem = { ...(inputs.selectedItem as object), ...patch };
  if (where === 'itemPrice') {
    const si = inputs.selectedItem as Record<string, unknown>;
    newInputs.selectedItem = { ...si, price: { ...(si.price as object), ...patch } };
  }
  if (where === 'quoted') {
    newInputs.selectedQuotedVendorCost = { ...(inputs.selectedQuotedVendorCost as object), ...patch };
    newInputs.consideredOffers = considered.map(c => ({ ...c, quotedVendorCost: { ...(c.quotedVendorCost as object), ...patch } }));
  }
  if (where === 'budget') newInputs.approvedBudget = { ...(inputs.approvedBudget as object), ...patch };

  return { offers, decision: { ...b.decision, inputs: newInputs }, event: b.event } as unknown as Bundle;
}

check('78. Extra fields inside a vendor snapshot are refused everywhere', () => {
  const fx = preparedWorkspace();
  for (const patch of [{ reliabilityScore: 0.97 }, { capacity: 100 }, { recommendation: 'yes' },
                       { sla: '24h' }, { rank: 1 }]) {
    expectRefused(fx, nested(fx, 'vendor', patch), `A vendor snapshot carrying ${Object.keys(patch)[0]}`);
  }
});

check('79. Extra fields inside an item snapshot and its price are refused', () => {
  const fx = preparedWorkspace();
  for (const patch of [{ catalogDerivedCost: 380 }, { vendorId: 'v1' }, { images: [] }]) {
    expectRefused(fx, nested(fx, 'item', patch), `An item snapshot carrying ${Object.keys(patch)[0]}`);
  }
  for (const patch of [{ margin: 12 }, { customerCharge: 6000 }, { revenue: 1 }]) {
    expectRefused(fx, nested(fx, 'itemPrice', patch), `An item price carrying ${Object.keys(patch)[0]}`);
  }
});

check('80. Extra fields inside quoted cost and approved budget are refused', () => {
  const fx = preparedWorkspace();
  for (const patch of [{ actualPaidCost: 31500 }, { revenue: 999 }, { margin: 12 }]) {
    expectRefused(fx, nested(fx, 'quoted', patch), `A quoted cost carrying ${Object.keys(patch)[0]}`);
  }
  for (const patch of [{ customerCharge: 6000 }, { margin: 2000 }]) {
    expectRefused(fx, nested(fx, 'budget', patch), `An approved budget carrying ${Object.keys(patch)[0]}`);
  }
});

check('81. Nested extras are refused even when duplicated consistently throughout', () => {
  const fx = preparedWorkspace();
  // Proof the fixture really is consistent: every representation carries it, so
  // every value-comparison agrees and only exact-shape checking can catch it.
  const b = nested(fx, 'vendor', { reliabilityScore: 0.97 });
  const inputs = b.decision.inputs as Record<string, unknown>;
  const considered = inputs.consideredOffers as { vendor: Record<string, unknown> }[];
  assertEqual((b.offers[0].vendorSnapshot as unknown as Record<string, unknown>).reliabilityScore, 0.97, 'The offer lost the extra.');
  assertEqual((inputs.selectedVendor as Record<string, unknown>).reliabilityScore, 0.97, 'The selected vendor lost the extra.');
  for (const c of considered) {
    assertEqual(c.vendor.reliabilityScore, 0.97, 'A considered entry lost the extra.');
  }
  expectRefused(fx, b, 'A consistently duplicated vendor score');

  const q = nested(fx, 'quoted', { margin: 12 });
  const qi = q.decision.inputs as Record<string, unknown>;
  assertEqual((q.offers[0].quotedVendorCost as unknown as Record<string, unknown>).margin, 12, 'The offer lost the extra.');
  assertEqual((qi.selectedQuotedVendorCost as Record<string, unknown>).margin, 12, 'The selected quote lost the extra.');
  expectRefused(fx, q, 'A consistently duplicated quote margin');
});

check('82. A malformed stored vendor email fails structural validation', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const base = state.value!;

  for (const email of ['not-an-address', 'missing@tld', '@nobody.example', 'a b@c.example']) {
    const broken = JSON.parse(JSON.stringify(base)) as OperationsState;
    // WhatsApp is present too — a second contact method does not make a
    // malformed address usable.
    broken.vendors[0].email = email;
    assert(broken.vendors[0].whatsapp !== undefined, 'The fixture has no WhatsApp, so it does not test the pairing.');
    assert(!validateOperationsState(broken, WS).ok, `A stored email of "${email}" read as valid.`);
  }
});

check('83. A valid stored vendor email still reads successfully', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const good = JSON.parse(JSON.stringify(state.value!)) as OperationsState;
  good.vendors[0].email = 'orders@vendor.example';
  assert(validateOperationsState(good, WS).ok, 'A well-formed stored email was refused.');
  // And absent stays fine.
  const none = JSON.parse(JSON.stringify(state.value!)) as OperationsState;
  delete none.vendors[0].email;
  assert(validateOperationsState(none, WS).ok, 'An absent email was refused.');
});

check('84. Honest writes still commit after the recursive tightening', () => {
  // The counterweight again: everything above would pass against a boundary
  // that refuses every submission.
  const fx = preparedWorkspace();
  assert(fx.repo.createVendor(WS, vendorRecord('v-honest-2'), NOW).ok, 'An honest vendor was refused.');

  const before = fx.storage.writes.length;
  const written = fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW);
  assert(written.ok, `An honest selection was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - before, 1, 'The honest commit was not a single write.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  assertEqual(state.value!.vendorOffers.length, 3, 'Not every offer was stored.');
  assertEqual(state.value!.decisions.filter(d => d.decisionType === 'VendorSelection').length, 1, 'Wrong decision count.');
});

// ─── Part 10: malformed runtime containers (H3.3/H3.4-D1) ───────────────────
//
// Runtime callers can violate the TypeScript interface. The repository and the
// pure verifier must refuse before destructuring, array iteration, exact-key
// checks or property access — and must leave the whole state byte-identical.

/** Submit through the repository, expect a named refusal, prove no byte moved. */
function expectMalformedVendorRefused(fx: Fx, write: unknown, what: string): void {
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State unreadable.');
  const priorState = JSON.stringify(before.value);
  const priorStorage = fx.storage.getItem(OPERATIONS_KEY);
  const priorWrites = fx.storage.writes.length;

  let result: { ok: boolean; reason?: string };
  try {
    result = fx.repo.commitVendorSelection(WS, write as never, NOW);
  } catch (error) {
    throw new Error(`${what} threw instead of refusing: ${error instanceof Error ? error.message : String(error)}`);
  }

  assert(!result.ok, `${what} was accepted.`);
  assert(
    (result.reason ?? '').toLowerCase().includes('nothing was recorded'),
    `${what} was refused without the review-again recovery: "${result.reason}"`,
  );
  assertEqual(fx.storage.writes.length, priorWrites, `${what} still wrote to storage.`);
  assertEqual(fx.storage.getItem(OPERATIONS_KEY), priorStorage, `${what} changed the stored bytes.`);

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  assertEqual(JSON.stringify(after.value), priorState, `${what} changed an operations collection.`);
}

/** Call the pure verifier directly, expect the same named refusal and no throw. */
function expectMalformedVendorVerifierRefused(fx: Fx, write: unknown, what: string): void {
  let result: { ok: boolean; reason?: string };
  try {
    result = verifyVendorSelection({
      workspaceId: WS,
      moment: fx.moment,
      briefs: [fx.brief],
      decisions: fx.decisions,
      vendors: fx.vendors,
      write: write as never,
    });
  } catch (error) {
    throw new Error(`${what} threw in the verifier: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!result.ok, `${what} was accepted by the verifier.`);
  assert(
    (result.reason ?? '').toLowerCase().includes('nothing was recorded'),
    `${what} was refused by the verifier without the review-again recovery: "${result.reason}"`,
  );
}

function expectMalformedVendorBoth(fx: Fx, write: unknown, what: string): void {
  expectMalformedVendorRefused(fx, write, what);
  expectMalformedVendorVerifierRefused(fx, write, what);
}

check('85. A malformed vendor-selection bundle is refused, not thrown', () => {
  const fx = preparedWorkspace();
  for (const [label, write] of [
    ['A null bundle', null],
    ['An undefined bundle', undefined],
    ['An array bundle', []],
    ['A string bundle', 'not a bundle'],
    ['A numeric bundle', 42],
    ['A boolean bundle', true],
  ] as const) {
    expectMalformedVendorBoth(fx, write, label);
  }
});

check('86. A malformed offers container is refused before array access', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [label, offers] of [
    ['Null offers', null],
    ['Undefined offers', undefined],
    ['Object-shaped offers', { 0: bundle.offers[0] }],
    ['String offers', 'offers'],
    ['Numeric offers', 3],
  ] as const) {
    expectMalformedVendorBoth(fx, { ...bundle, offers }, label);
  }
});

check('87. A missing or malformed vendor-selection Decision is refused, not thrown', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [label, decision] of [
    ['A missing decision', undefined],
    ['A null decision', null],
    ['An array decision', []],
    ['A string decision', 'decision'],
  ] as const) {
    expectMalformedVendorBoth(fx, { ...bundle, decision }, label);
  }
  expectMalformedVendorBoth(fx, {
    offers: bundle.offers,
    event: bundle.event,
  }, 'A bundle with no decision key');
});

check('88. A missing or malformed vendor-selection Event is refused, not thrown', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [label, event] of [
    ['A missing event', undefined],
    ['A null event', null],
    ['An array event', []],
    ['A numeric event', 7],
  ] as const) {
    expectMalformedVendorBoth(fx, { ...bundle, event }, label);
  }
  expectMalformedVendorBoth(fx, {
    offers: bundle.offers,
    decision: bundle.decision,
  }, 'A bundle with no event key');
});

check('89. Malformed vendor-selection Decision.inputs are refused, not thrown', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [label, inputs] of [
    ['Null decision inputs', null],
    ['Undefined decision inputs', undefined],
    ['Array decision inputs', []],
    ['String decision inputs', 'inputs'],
    ['Numeric decision inputs', 0],
  ] as const) {
    expectMalformedVendorBoth(fx, {
      ...bundle,
      decision: { ...bundle.decision, inputs },
    }, label);
  }
});

check('90. Malformed VendorSelected Event payloads are refused, not thrown', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [label, payload] of [
    ['A null event payload', null],
    ['An undefined event payload', undefined],
    ['An array event payload', []],
    ['A string event payload', 'payload'],
  ] as const) {
    expectMalformedVendorBoth(fx, {
      ...bundle,
      event: { ...bundle.event, payload },
    }, label);
  }
});

check('91. Every newly submitted offer must itself be a plain record', () => {
  const fx = preparedWorkspace();
  const bundle = threeOfferBundle(fx);
  for (const [label, offer] of [
    ['A null offer', null],
    ['An undefined offer', undefined],
    ['An array offer', []],
    ['A string offer', 'offer'],
    ['A numeric offer', 1],
  ] as const) {
    expectMalformedVendorBoth(fx, {
      ...bundle,
      offers: bundle.offers.map((candidate, index) => (index === 0 ? offer : candidate)),
    }, label);
  }
});

check('92. An honest vendor selection still commits in exactly one write', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  const written = fx.repo.commitVendorSelection(WS, threeOfferBundle(fx), NOW);
  assert(written.ok, `An honest selection was refused: ${written.ok ? '' : written.reason}`);
  assertEqual(fx.storage.writes.length - before, 1, 'The honest commit was not a single write.');
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
console.log('Vendor selection validation passed.\n');
