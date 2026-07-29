/**
 * Deterministic validation for H3.3 — the minimum catalog and item selection.
 *
 * Run with:  npm run validate:selection
 *
 * Covers the eligibility rules (ADR-007: exact currency, no FX, integer minor
 * units), the recording rule (ADR-006: browsing writes nothing; one atomic
 * transaction on confirmation), the immutable-snapshot rule (a policy edited
 * after generation did not govern the Moment), and the additive OperationsState
 * v2 → v3 migration.
 *
 * Storage is injected, so "writes nothing" is proven by inspecting the write
 * log rather than asserted in prose.
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
  CATALOG_ITEMS,
  eligibleItems,
  findCatalogItem,
  itemEligibility,
  snapshotItem,
} from '../lib/catalog';
import {
  CURRENT_OPERATIONS_SCHEMA_VERSION,
  DECISION_TYPES,
  EVENT_TYPES,
  MOMENT_STATUSES,
  OPERATIONS_KEY,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type { Decision, ExecutionBrief, Moment } from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import type { GenerationContext } from '../lib/operations/generation';
import { buildMomentBatch } from '../lib/operations/generation';
import { buildBriefConfirmation } from '../lib/operations/briefs';
import { buildItemSelection, findLiveSelectionDecision, previewItemSelection } from '../lib/operations/selection';
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
const WS = 'org-1';

let n = 0;
const ids = {
  moment: () => `moment-${++n}`,
  decision: () => `decision-${++n}`,
  event: () => `event-${++n}`,
  brief: () => `brief-${++n}`,
};

function ngn(major: number): Money { return { amountMinor: major * 100, currency: 'NGN' }; }
function kes(major: number): Money { return { amountMinor: major * 100, currency: 'KES' }; }

const ADDRESS = { line1: '12 Adeola Odeku Street', city: 'Lagos', countryCode: 'NG' };

/**
 * A small fixed catalog, independent of the shipped seed.
 *
 * The eligibility rules are proven against items constructed to sit exactly on
 * each boundary — the seed can then change freely without weakening any of it.
 */
const BUDGET = ngn(50_000);
const FIXTURE_ITEMS: readonly CatalogItem[] = [
  { id: 'fx-exact', name: 'Exactly at budget', description: '', category: 'Food & Drink', isActive: true, price: ngn(50_000) },
  { id: 'fx-under', name: 'Under budget', description: '', category: 'Home & Living', isActive: true, price: ngn(30_000) },
  { id: 'fx-one-over', name: 'One minor unit over', description: '', category: 'Food & Drink', isActive: true, price: { amountMinor: 5_000_001, currency: 'NGN' } },
  { id: 'fx-wrong-currency', name: 'Priced in shillings', description: '', category: 'Food & Drink', isActive: true, price: kes(100) },
  { id: 'fx-excluded', name: 'In an excluded category', description: '', category: 'Wellness & Spa', isActive: true, price: ngn(20_000) },
  { id: 'fx-inactive', name: 'Withdrawn', description: '', category: 'Food & Drink', isActive: false, price: ngn(10_000) },
];
const EXCLUDED = ['Wellness & Spa'];

function cls(id: string, name: string): RelationshipClass {
  return { id, name, type: 'Employee', level: 0, description: '', isDefault: false, isActive: true, createdAt: T0, updatedAt: T0 };
}

function policy(over: Partial<RecognitionPolicy> = {}): RecognitionPolicy {
  return {
    id: 'policy-global', workspaceId: WS, name: 'Global Recognition', description: '',
    recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: BUDGET, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [...EXCLUDED],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status: 'Published', version: 4,
    createdAt: T0, updatedAt: T0, publishedAt: T0, ...over,
  };
}

function assignment(): PolicyAssignment {
  return {
    id: 'a-global', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global',
    priority: 0, isActive: true, createdAt: T0, updatedAt: T0,
  };
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
    {
      name: 'December appreciation', relationshipClassId: 'class-exec', occasionType: 'Birthday',
      campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
      budgetEnvelopes: [ngn(1_000_000)],
    },
    T0, 'program-1',
  );
  return { ...draft, status: 'Active', activatedAt: T0, frozenPopulation: { personIds, frozenAt: T0 } };
}

function context(people: Person[], p: RecognitionPolicy = policy()): GenerationContext {
  return {
    workspaceId: WS,
    program: activeCampaign(people.map(x => x.id)),
    people, classes: [cls('class-exec', 'Executive Leadership')],
    assignments: [assignment()], policies: [p],
    existingSourceKeys: new Map(), now: NOW,
  };
}

/**
 * A workspace with one prepared, ready Moment and one confirmed brief — the
 * only state from which an item may be chosen.
 */
function preparedWorkspace(over: { policy?: RecognitionPolicy } = {}) {
  const p = person({ id: 'p1' });
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(WS, NOW);

  const batch = buildMomentBatch(context([p], over.policy ?? policy()), ids, 'operator-1');
  const created = repo.createMoments(WS, batch, NOW);
  assert(created.ok, `Fixture failed to create moments: ${created.ok ? '' : created.reason}`);
  const moment = batch.moments[0];

  const built = buildBriefConfirmation({ moment, person: p, now: NOW, ids, actorId: 'operator-1' });
  assert(built.ok, `Fixture failed to build a brief: ${built.ok ? '' : built.reason}`);
  const written = repo.commitBrief(WS, built.value, NOW);
  assert(written.ok, `Fixture failed to commit a brief: ${written.ok ? '' : written.reason}`);

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Fixture state could not be read.');
  return {
    repo, storage, moment, person: p,
    brief: built.value.brief,
    decisions: state.value!.decisions.filter(d => d.momentId === moment.id),
  };
}

function selectionContext(fx: ReturnType<typeof preparedWorkspace>, over: Record<string, unknown> = {}) {
  return {
    moment: fx.moment, brief: fx.brief as ExecutionBrief | null,
    decisions: fx.decisions, items: FIXTURE_ITEMS, ...over,
  };
}

console.log('\nMinimum catalog and item selection (H3.3) — validation\n');

// ─── Part 1: the catalog and its eligibility rules ───────────────────────────

check('1. Every catalog item uses the existing GiftCategory vocabulary', () => {
  const known = new Set<string>([
    'Food & Drink', 'Wellness & Spa', 'Luxury Experiences', 'Home & Living',
    'Technology & Gadgets', 'Books & Learning', 'Fashion & Accessories', 'Art & Culture',
    'Sports & Fitness', 'Travel & Hospitality', 'Digital Vouchers', 'Custom & Personalized',
  ]);
  assert(CATALOG_ITEMS.length > 0, 'The catalog seed is empty.');
  for (const item of CATALOG_ITEMS) {
    assert(known.has(item.category), `"${item.id}" uses a category outside the policy vocabulary: ${item.category}.`);
  }
});

check('2. Every catalog item carries a valid canonical Money price and a unique id', () => {
  const seen = new Set<string>();
  for (const item of CATALOG_ITEMS) {
    assert(!seen.has(item.id), `Duplicate catalog item id "${item.id}".`);
    seen.add(item.id);
    assert(Number.isSafeInteger(item.price.amountMinor), `"${item.id}" has a non-integer price.`);
    assert(item.price.amountMinor > 0, `"${item.id}" is priced at or below zero.`);
    assert(/^[A-Z]{3}$/.test(item.price.currency), `"${item.id}" has a malformed currency.`);
    assert(item.name.trim().length > 0, `"${item.id}" has no name.`);
  }
});

check('3. An item priced exactly at the budget is eligible', () => {
  const item = FIXTURE_ITEMS.find(i => i.id === 'fx-exact')!;
  const result = itemEligibility(item, { approvedBudget: BUDGET, excludedCategories: [] });
  assert(result.eligible, 'An item priced exactly at the budget was excluded.');
});

check('4. An item one minor unit over budget is excluded', () => {
  const item = FIXTURE_ITEMS.find(i => i.id === 'fx-one-over')!;
  assertEqual(item.price.amountMinor - BUDGET.amountMinor, 1, 'The fixture is not one minor unit over.');
  const result = itemEligibility(item, { approvedBudget: BUDGET, excludedCategories: [] });
  assert(!result.eligible, 'An item one minor unit over budget was allowed.');
  if (!result.eligible) assertEqual(result.reason, 'over-budget', 'Wrong reason for an over-budget item.');
});

check('5. An item in another currency is excluded, never converted', () => {
  const item = FIXTURE_ITEMS.find(i => i.id === 'fx-wrong-currency')!;
  // KES 100 is numerically far under NGN 50,000 in minor units. Anything that
  // compared the numbers without the currency would let this through.
  assert(item.price.amountMinor < BUDGET.amountMinor, 'The fixture does not test the numeric trap.');
  const result = itemEligibility(item, { approvedBudget: BUDGET, excludedCategories: [] });
  assert(!result.eligible, 'A foreign-currency item was treated as comparable.');
  if (!result.eligible) assertEqual(result.reason, 'currency-mismatch', 'Wrong reason for a currency mismatch.');
});

check('6. An item in an excluded category is excluded', () => {
  const item = FIXTURE_ITEMS.find(i => i.id === 'fx-excluded')!;
  const allowed = itemEligibility(item, { approvedBudget: BUDGET, excludedCategories: [] });
  assert(allowed.eligible, 'The fixture is not otherwise eligible.');
  const result = itemEligibility(item, { approvedBudget: BUDGET, excludedCategories: EXCLUDED });
  assert(!result.eligible, 'An excluded category was allowed.');
  if (!result.eligible) assertEqual(result.reason, 'category-excluded', 'Wrong reason for an excluded category.');
});

check('7. An inactive item is excluded even when it fits everything else', () => {
  const item = FIXTURE_ITEMS.find(i => i.id === 'fx-inactive')!;
  const result = itemEligibility(item, { approvedBudget: BUDGET, excludedCategories: [] });
  assert(!result.eligible, 'A withdrawn item was offered.');
  if (!result.eligible) assertEqual(result.reason, 'inactive', 'Wrong reason for a withdrawn item.');
});

check('8. Eligibility is deterministic and ordering is stable regardless of input order', () => {
  const constraints = { approvedBudget: BUDGET, excludedCategories: EXCLUDED };
  const forward = eligibleItems(constraints, FIXTURE_ITEMS).map(i => i.id);
  const reversed = eligibleItems(constraints, [...FIXTURE_ITEMS].reverse()).map(i => i.id);
  assertEqual(forward.join(','), reversed.join(','), 'Ordering depends on the input order.');
  assertEqual(forward.join(','), 'fx-under,fx-exact', 'Wrong eligible set or order.');
  // Repeated calls agree.
  assertEqual(eligibleItems(constraints, FIXTURE_ITEMS).map(i => i.id).join(','), forward.join(','), 'Two calls disagreed.');
});

check('9. The shipped seed produces a stable order and never mixes currencies', () => {
  const constraints = { approvedBudget: ngn(200_000), excludedCategories: [] };
  const result = eligibleItems(constraints);
  assert(result.length > 1, 'The seed offers nothing at a generous naira budget.');
  for (const item of result) {
    assertEqual(item.price.currency, 'NGN', `${item.id} was offered against a naira budget.`);
    assert(item.isActive, `${item.id} is withdrawn but was offered.`);
  }
  for (let i = 1; i < result.length; i++) {
    assert(result[i - 1].price.amountMinor <= result[i].price.amountMinor, 'The seed came back unordered.');
  }
});

// ─── Part 2: the immutable constraint snapshot ───────────────────────────────

check('10. Generation snapshots the policy’s excluded categories onto the Moment', () => {
  const p = person({ id: 'p1' });
  const batch = buildMomentBatch(context([p]), ids, 'operator-1');
  const snapshot = batch.moments[0].policyResolutionSnapshot;
  assert(snapshot, 'No policy snapshot was written.');
  assertEqual(snapshot!.excludedCategories?.join(','), EXCLUDED.join(','), 'The exclusions were not snapshotted.');
});

check('11. The snapshot is a copy — editing the live policy afterwards does not reach it', () => {
  const live = policy();
  const batch = buildMomentBatch(context([person({ id: 'p1' })], live), ids, 'operator-1');
  live.excludedCategories.push('Technology & Gadgets');
  const snapshot = batch.moments[0].policyResolutionSnapshot!;
  assertEqual(snapshot.excludedCategories!.length, 1, 'A later policy edit reached a written snapshot.');
});

check('12. The confirmed brief carries the same immutable exclusions, and shows them', () => {
  const fx = preparedWorkspace();
  const carried = fx.brief.policyResolutionSnapshot.excludedCategories;
  assertEqual(carried?.join(','), EXCLUDED.join(','), 'The brief lost the exclusions.');
  assert(
    fx.brief.constraints.some(c => c.includes('Excluded categories') && c.includes('Wellness & Spa')),
    'The brief does not state its exclusions in words.',
  );
});

check('13. Selection filters against the snapshot, not a policy edited afterwards', () => {
  const fx = preparedWorkspace();
  // The customer removes the exclusion after the Moment was generated. The
  // Moment was not governed by that edit and must not benefit from it.
  const preview = previewItemSelection(selectionContext(fx));
  assert(preview.selectable, `Not selectable: ${preview.blockers.map(b => b.message).join(' ')}`);
  assert(!preview.eligible.some(i => i.category === 'Wellness & Spa'), 'An excluded category was offered.');
  assertEqual(preview.eligible.map(i => i.id).join(','), 'fx-under,fx-exact', 'Wrong candidate set.');
});

check('14. A record with no recorded exclusions blocks selection instead of assuming none', () => {
  const fx = preparedWorkspace();
  // Exactly the shape of every pre-H3.3 record: a snapshot with no exclusions field.
  const snapshot = { ...fx.brief.policyResolutionSnapshot };
  delete (snapshot as Record<string, unknown>).excludedCategories;
  const legacy: ExecutionBrief = { ...fx.brief, policyResolutionSnapshot: snapshot };

  const preview = previewItemSelection(selectionContext(fx, { brief: legacy }));
  assert(!preview.selectable, 'A record with unknown exclusions was treated as unconstrained.');
  assertEqual(preview.excludedCategories, null, 'Unknown exclusions were reported as a value.');
  assertEqual(preview.eligible.length, 0, 'Candidates were computed without trustworthy constraints.');
  const blocker = preview.blockers.find(b => b.code === 'constraints-unrecorded');
  assert(blocker, 'The block was not named.');
  assert(blocker!.recovery.length > 0 && blocker!.href, 'The block offers no recovery.');
});

check('15. Nothing can be built for a record with unknown exclusions', () => {
  const fx = preparedWorkspace();
  const snapshot = { ...fx.brief.policyResolutionSnapshot };
  delete (snapshot as Record<string, unknown>).excludedCategories;
  const built = buildItemSelection({
    ...selectionContext(fx, { brief: { ...fx.brief, policyResolutionSnapshot: snapshot } }),
    selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(!built.ok, 'A selection was built against unknown constraints.');
});

// ─── Part 3: the blocking conditions ─────────────────────────────────────────

check('16. A moment with no confirmed brief blocks selection', () => {
  const fx = preparedWorkspace();
  const preview = previewItemSelection(selectionContext(fx, { brief: null }));
  assert(!preview.selectable, 'Selection was allowed with no brief.');
  const blocker = preview.blockers.find(b => b.code === 'no-confirmed-brief');
  assert(blocker, 'The missing brief was not named.');
  assertEqual(blocker!.href, `/operations/moments/${fx.moment.id}/brief`, 'The recovery does not link to the brief.');
});

check('17. A superseded brief does not count as a confirmed one', () => {
  const fx = preparedWorkspace();
  const superseded: ExecutionBrief = { ...fx.brief, status: 'Superseded' };
  const preview = previewItemSelection(selectionContext(fx, { brief: superseded }));
  assert(!preview.selectable, 'A superseded brief was accepted.');
  assert(preview.blockers.some(b => b.code === 'no-confirmed-brief'), 'The superseded brief was not named.');
});

check('18. A cancelled moment blocks selection', () => {
  const fx = preparedWorkspace();
  const cancelled: Moment = { ...fx.moment, status: 'Cancelled', cancelledAt: NOW };
  const preview = previewItemSelection(selectionContext(fx, { moment: cancelled }));
  assert(!preview.selectable, 'A cancelled moment allowed a selection.');
  assert(preview.blockers.some(b => b.code === 'moment-cancelled'), 'The cancellation was not named.');
  const built = buildItemSelection({
    ...selectionContext(fx, { moment: cancelled }),
    selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids,
  });
  assert(!built.ok, 'A selection was built for a cancelled moment.');
});

check('19. A moment still under review blocks selection', () => {
  const fx = preparedWorkspace();
  const pending: Moment = { ...fx.moment, status: 'NeedsReview' };
  const preview = previewItemSelection(selectionContext(fx, { moment: pending }));
  assert(!preview.selectable, 'A moment needing review allowed a selection.');
  assert(preview.blockers.some(b => b.code === 'moment-not-ready'), 'The review state was not named.');
});

check('20. When nothing qualifies, the empty state is named and carries a recovery', () => {
  const fx = preparedWorkspace();
  // A catalog in which everything is either withdrawn, foreign or over budget.
  const barren = FIXTURE_ITEMS.filter(i => ['fx-one-over', 'fx-wrong-currency', 'fx-inactive'].includes(i.id));
  const preview = previewItemSelection(selectionContext(fx, { items: barren }));
  assert(!preview.selectable, 'An empty catalog was reported as selectable.');
  assertEqual(preview.eligible.length, 0, 'Ineligible items were offered.');
  const blocker = preview.blockers.find(b => b.code === 'no-eligible-items');
  assert(blocker, 'The empty state was not named.');
  assert(blocker!.recovery.length > 0, 'The empty state offers no way forward.');
  assert(blocker!.message.includes('50,000') || blocker!.message.includes('50000'), 'The empty state does not say what the budget was.');
});

check('21. A moment that already has a live selection refuses a second one', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'The first selection failed to build.');
  const withSelection = [...fx.decisions, built.value.decision];

  const preview = previewItemSelection(selectionContext(fx, { decisions: withSelection }));
  assert(!preview.selectable, 'A second selection was offered.');
  assert(preview.blockers.some(b => b.code === 'selection-exists'), 'The existing selection was not named.');
  assert(preview.confirmed, 'The confirmed selection was not surfaced for display.');
  assertEqual(preview.confirmed!.item.itemId, 'fx-under', 'The wrong item was reported as chosen.');
});

// ─── Part 4: browsing writes nothing ─────────────────────────────────────────

check('22. Loading, previewing and filtering write nothing to storage', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;

  fx.repo.findMoment(WS, fx.moment.id);
  fx.repo.findLiveBriefForMoment(WS, fx.moment.id);
  fx.repo.findLiveItemSelection(WS, fx.moment.id);
  fx.repo.load(WS);
  for (let i = 0; i < 5; i++) previewItemSelection(selectionContext(fx));
  eligibleItems({ approvedBudget: BUDGET, excludedCategories: EXCLUDED }, FIXTURE_ITEMS);
  findCatalogItem('fx-under', FIXTURE_ITEMS);

  assertEqual(fx.storage.writes.length, before, 'Browsing wrote to storage.');
});

check('23. Building a selection without committing writes nothing', () => {
  const fx = preparedWorkspace();
  const before = fx.storage.writes.length;
  for (const id of ['fx-under', 'fx-exact', 'fx-under']) {
    buildItemSelection({
      ...selectionContext(fx), selectedItemId: id, reason: 'Changing my mind.', now: NOW, ids, actorId: 'operator-1',
    });
  }
  assertEqual(fx.storage.writes.length, before, 'Building a selection wrote to storage.');
});

check('24. A read of a v1 payload migrates in memory without rewriting storage', () => {
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [], decisions: [], events: [],
    createdAt: T0, updatedAt: T0,
  };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v1) });
  const repo = createLocalOperationsRepository(storage);
  const loaded = repo.load(WS);
  assert(loaded.ok && loaded.value, 'A v1 payload was refused.');
  assertEqual(loaded.value!.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'The read did not migrate to current.');
  assertEqual(storage.writes.length, 0, 'Reading rewrote storage.');
});

// ─── Part 5: confirmation ────────────────────────────────────────────────────

check('25. Confirmation creates exactly one ItemSelection Decision', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'Recipient keeps a well-set table.',
    now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, `Build failed: ${built.ok ? '' : built.reason}`);
  const written = fx.repo.commitItemSelection(WS, built.value, NOW);
  assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State could not be re-read.');
  const selections = state.value!.decisions.filter(d => d.decisionType === 'ItemSelection');
  assertEqual(selections.length, 1, 'Confirmation did not create exactly one selection decision.');
  assertEqual(selections[0].status, 'Confirmed', 'The selection was not confirmed.');
  assertEqual(selections[0].provider, 'HumanOperator', 'The selection was not attributed to a human operator.');
  assertEqual(selections[0].reason, 'Recipient keeps a well-set table.', 'The operator reason was not recorded.');
});

check('26. The Decision captures the complete candidate set and the selected snapshot', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-exact', reason: 'Best fit.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  const inputs = built.value.decision.inputs as {
    candidateItemIds: string[];
    candidates: { itemId: string; name: string; category: string; price: Money }[];
    selectedItemId: string;
    selectedItem: { itemId: string; name: string; category: string; price: Money };
    approvedBudget: Money;
    excludedCategories: string[];
    briefId: string;
    briefRevision: number;
  };

  assertEqual(inputs.candidateItemIds.join(','), 'fx-under,fx-exact', 'The complete candidate set was not recorded.');
  assertEqual(inputs.candidates.length, 2, 'Candidate snapshots are missing.');
  assertEqual(inputs.candidates[0].name, 'Under budget', 'Candidate snapshots lost their names.');
  assertEqual(inputs.selectedItemId, 'fx-exact', 'The selected item was not recorded.');
  assertEqual(inputs.selectedItem.price.amountMinor, 5_000_000, 'The selected snapshot lost its price.');
  assertEqual(inputs.selectedItem.category, 'Food & Drink', 'The selected snapshot lost its category.');
  assertEqual(inputs.approvedBudget.amountMinor, BUDGET.amountMinor, 'The approved budget was not recorded.');
  assertEqual(inputs.excludedCategories.join(','), EXCLUDED.join(','), 'The applied exclusions were not recorded.');
  assertEqual(inputs.briefId, fx.brief.id, 'The brief was not referenced.');
  assertEqual(inputs.briefRevision, fx.brief.revision, 'The brief revision was not referenced.');

  // H3.3 makes no recommendation, so there is nothing to override.
  assertEqual(built.value.decision.recommendation, undefined, 'A recommendation was fabricated.');
  assertEqual(built.value.decision.overrideReason, undefined, 'An override reason was fabricated.');
});

check('27. Confirmation creates the corresponding Event atomically with the Decision', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  const writesBefore = fx.storage.writes.length;
  const written = fx.repo.commitItemSelection(WS, built.value, NOW);
  assert(written.ok, 'Commit failed.');

  // One transaction: exactly one write for both records.
  assertEqual(fx.storage.writes.length - writesBefore, 1, 'The decision and event were written separately.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State could not be re-read.');
  const events = state.value!.events.filter(e => e.eventType === 'ItemSelected');
  assertEqual(events.length, 1, 'The event was not recorded exactly once.');
  assertEqual(events[0].momentId, fx.moment.id, 'The event is attached to the wrong moment.');
  assertEqual(events[0].actorType, 'Operator', 'The event was not attributed to the operator.');
  assertEqual((events[0].payload as { itemId: string }).itemId, 'fx-under', 'The event does not identify the item.');
});

check('28. An invalid proposed state commits nothing at all', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  // A decision with no reason cannot pass ADR-006's structural gate.
  const broken = { ...built.value, decision: { ...built.value.decision, reason: '' } };
  const writesBefore = fx.storage.writes.length;
  const written = fx.repo.commitItemSelection(WS, broken, NOW);
  assert(!written.ok, 'An invalid decision was stored.');
  assertEqual(fx.storage.writes.length, writesBefore, 'A refused commit still wrote.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State could not be re-read.');
  assertEqual(state.value!.events.filter(e => e.eventType === 'ItemSelected').length, 0, 'The event landed without its decision.');
});

check('29. A confirmation with no reason is refused', () => {
  const fx = preparedWorkspace();
  for (const reason of ['', '   ']) {
    const built = buildItemSelection({
      ...selectionContext(fx), selectedItemId: 'fx-under', reason, now: NOW, ids, actorId: 'operator-1',
    });
    assert(!built.ok, `A selection was built with reason ${JSON.stringify(reason)}.`);
  }
});

check('30. An ineligible or unknown item cannot be confirmed', () => {
  const fx = preparedWorkspace();
  for (const [id, label] of [
    ['fx-excluded', 'an excluded category'],
    ['fx-one-over', 'an over-budget item'],
    ['fx-wrong-currency', 'a foreign-currency item'],
    ['fx-inactive', 'a withdrawn item'],
    ['fx-does-not-exist', 'an unknown item'],
  ] as const) {
    const built = buildItemSelection({
      ...selectionContext(fx), selectedItemId: id, reason: 'Trying it on.', now: NOW, ids, actorId: 'operator-1',
    });
    assert(!built.ok, `A selection was built for ${label}.`);
  }
});

// ─── Part 6: idempotency and staleness ───────────────────────────────────────

check('31. Repeated commits of the same confirmation are refused', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  const first = fx.repo.commitItemSelection(WS, built.value, NOW);
  assert(first.ok, 'The first commit failed.');
  const writesAfterFirst = fx.storage.writes.length;

  // The double click: the identical bundle, submitted again.
  const second = fx.repo.commitItemSelection(WS, built.value, NOW);
  assert(!second.ok, 'A double-click created a second record.');
  assertEqual(fx.storage.writes.length, writesAfterFirst, 'A refused duplicate still wrote.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State could not be re-read.');
  assertEqual(state.value!.decisions.filter(d => d.decisionType === 'ItemSelection').length, 1, 'A duplicate decision landed.');
  assertEqual(state.value!.events.filter(e => e.eventType === 'ItemSelected').length, 1, 'A duplicate event landed.');
});

check('32. A second, differently-identified selection for the same moment is refused', () => {
  const fx = preparedWorkspace();
  const first = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(first.ok, 'The first build failed.');
  assert(fx.repo.commitItemSelection(WS, first.value, NOW).ok, 'The first commit failed.');

  // A stale tab that never saw the first confirmation, with fresh ids.
  const stale = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-exact', reason: 'Changed my mind.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(stale.ok, 'The stale build failed unexpectedly.');
  const written = fx.repo.commitItemSelection(WS, stale.value, NOW);
  assert(!written.ok, 'A second live selection was accepted.');
});

check('33. A selection prepared against a superseded brief revision writes nothing', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');

  // The brief is corrected while the item screen sits open.
  const stale = {
    ...built.value,
    decision: {
      ...built.value.decision,
      inputs: { ...(built.value.decision.inputs as object), briefRevision: 99 },
    },
  };
  const writesBefore = fx.storage.writes.length;
  const written = fx.repo.commitItemSelection(WS, stale, NOW);
  assert(!written.ok, 'A stale brief revision was accepted.');
  assert(!written.ok && written.reason.toLowerCase().includes('corrected'), 'The refusal does not explain what changed.');
  assertEqual(fx.storage.writes.length, writesBefore, 'A refused stale commit still wrote.');
});

check('34. A selection referencing an unknown brief writes nothing', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  const stale = {
    ...built.value,
    decision: {
      ...built.value.decision,
      inputs: { ...(built.value.decision.inputs as object), briefId: 'brief-that-never-existed' },
    },
  };
  assert(!fx.repo.commitItemSelection(WS, stale, NOW).ok, 'An unknown brief was accepted.');
});

check('35. A selection for another workspace is refused', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  // Wrong workspace on the records themselves.
  const foreign = {
    decision: { ...built.value.decision, workspaceId: 'org-somebody-else' },
    event: { ...built.value.event, workspaceId: 'org-somebody-else' },
  };
  assert(!fx.repo.commitItemSelection(WS, foreign, NOW).ok, 'A foreign-workspace selection was stored.');
  // And the repository refuses to serve another workspace's state at all.
  assert(!fx.repo.commitItemSelection('org-somebody-else', built.value, NOW).ok, 'A foreign workspace id was served.');
});

check('36. A mismatched decision and event pair is refused', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  const wrongType = { ...built.value, decision: { ...built.value.decision, decisionType: 'BriefConfirmation' as const } };
  assert(!fx.repo.commitItemSelection(WS, wrongType, NOW).ok, 'A non-selection decision was accepted.');
  const wrongEvent = { ...built.value, event: { ...built.value.event, eventType: 'BriefGenerated' as const } };
  assert(!fx.repo.commitItemSelection(WS, wrongEvent, NOW).ok, 'A non-selection event was accepted.');
});

// ─── Part 7: history, schema and structure ───────────────────────────────────

check('37. Confirming preserves every existing decision and event untouched', () => {
  const fx = preparedWorkspace();
  const before = fx.repo.load(WS);
  assert(before.ok && before.value, 'State could not be read.');
  const priorDecisions = JSON.stringify(before.value!.decisions);
  const priorEvents = JSON.stringify(before.value!.events);
  const priorMoments = JSON.stringify(before.value!.moments);
  const priorBriefs = JSON.stringify(before.value!.executionBriefs);

  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  assert(fx.repo.commitItemSelection(WS, built.value, NOW).ok, 'Commit failed.');

  const after = fx.repo.load(WS);
  assert(after.ok && after.value, 'State could not be re-read.');
  const kept = after.value!;
  assertEqual(JSON.stringify(kept.decisions.slice(0, before.value!.decisions.length)), priorDecisions, 'Existing decisions were rewritten.');
  assertEqual(JSON.stringify(kept.events.slice(0, before.value!.events.length)), priorEvents, 'Existing events were rewritten.');
  assertEqual(JSON.stringify(kept.moments), priorMoments, 'Moments were rewritten by a selection.');
  assertEqual(JSON.stringify(kept.executionBriefs), priorBriefs, 'Briefs were rewritten by a selection.');
});

check('38. The operations schema is at v3, and v1 walks every rung to it', () => {
  assertEqual(CURRENT_OPERATIONS_SCHEMA_VERSION, 3, 'Operations schema is not at v3.');
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
  assertEqual(result.state.schemaVersion, 3, 'Migration did not reach v3.');
  assert(Array.isArray(result.state.executionBriefs), 'The v1 → v2 rung did not run.');
  // History survives the whole chain, and unknown keys with it.
  assertEqual(result.state.moments.length, 1, 'A moment was lost in migration.');
  assertEqual(result.state.decisions.length, 1, 'A decision was lost in migration.');
  assertEqual(result.state.events.length, 1, 'An event was lost in migration.');
  assert((result.state as unknown as Record<string, unknown>).aFutureKey !== undefined, 'An unknown key was dropped.');
});

check('39. The v2 → v3 rung invents no exclusions', () => {
  const v2 = {
    schemaVersion: 2, workspaceId: WS,
    moments: [{
      id: 'm-old', sourceKey: 'k', status: 'ReadyForExecution',
      policyResolutionSnapshot: { policyId: 'p', policyVersion: 1, approvedRecognitionBudget: BUDGET },
    }],
    decisions: [], events: [], executionBriefs: [],
    createdAt: T0, updatedAt: T0,
  };
  const result = migrateOperationsState(v2);
  assert(result.status === 'migrated', 'A v2 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 3, 'Migration did not reach v3.');
  const snapshot = result.state.moments[0].policyResolutionSnapshot as unknown as Record<string, unknown>;
  assertEqual(snapshot.excludedCategories, undefined, 'The migration invented an exclusion list.');
});

check('40. Validation admits an absent exclusion list and refuses a malformed one', () => {
  const fx = preparedWorkspace();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  const base = state.value!;

  const withoutField = JSON.parse(JSON.stringify(base)) as typeof base;
  delete (withoutField.moments[0].policyResolutionSnapshot as unknown as Record<string, unknown>).excludedCategories;
  delete (withoutField.executionBriefs[0].policyResolutionSnapshot as unknown as Record<string, unknown>).excludedCategories;
  assert(validateOperationsState(withoutField, WS).ok, 'A pre-H3.3 record was refused.');

  const malformed = JSON.parse(JSON.stringify(base)) as typeof base;
  (malformed.moments[0].policyResolutionSnapshot as unknown as Record<string, unknown>).excludedCategories = 'Wellness & Spa';
  assert(!validateOperationsState(malformed, WS).ok, 'A malformed exclusion list was accepted.');

  const wrongMembers = JSON.parse(JSON.stringify(base)) as typeof base;
  (wrongMembers.executionBriefs[0].policyResolutionSnapshot as unknown as Record<string, unknown>).excludedCategories = [1, 2];
  assert(!validateOperationsState(wrongMembers, WS).ok, 'A non-string exclusion list was accepted.');
});

check('41. Validation refuses two live selections for one moment', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  assert(fx.repo.commitItemSelection(WS, built.value, NOW).ok, 'Commit failed.');

  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  const doubled = {
    ...state.value!,
    decisions: [...state.value!.decisions, { ...built.value.decision, id: 'decision-clone' }],
  };
  assert(!validateOperationsState(doubled, WS).ok, 'Two live selections passed validation.');
});

check('42. H3.3 adds exactly one decision type and one event type, and no more', () => {
  assert((DECISION_TYPES as readonly string[]).includes('ItemSelection'), 'ItemSelection is not declared.');
  assert((EVENT_TYPES as readonly string[]).includes('ItemSelected'), 'ItemSelected is not declared.');
  // Substitution presupposes something downstream that consumed a selection.
  assert(!(DECISION_TYPES as readonly string[]).includes('ItemSubstitution'), 'ItemSubstitution belongs to a later milestone.');
  for (const t of ['VendorSelection', 'CourierSelection', 'QAException', 'BudgetException']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
  for (const t of ['ItemPrepared', 'VendorContacted', 'Dispatched', 'Delivered', 'MomentClosed']) {
    assert(!(EVENT_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
});

check('43. Moment statuses are unchanged — selection adds none', () => {
  assertEqual(MOMENT_STATUSES.length, 3, 'MOMENT_STATUSES changed length.');
  for (const s of ['NeedsReview', 'ReadyForExecution', 'Cancelled']) {
    assert((MOMENT_STATUSES as readonly string[]).includes(s), `${s} is missing.`);
  }
  for (const s of ['ItemSelected', 'Sourcing', 'Dispatched', 'Fulfilled']) {
    assert(!(MOMENT_STATUSES as readonly string[]).includes(s), `A speculative status ${s} was added.`);
  }
});

check('44. The item route resolves to its own title, not the moment’s', () => {
  assertEqual(titleFor('/operations/moments/m-1/item'), 'Choose an item', 'The item route has no title of its own.');
  assertEqual(titleFor('/operations/moments/m-1/brief'), 'Brief', 'The brief title regressed.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'The moment title regressed.');
  assertEqual(titleFor('/operations/moments'), 'Moments', 'The queue title regressed.');
});

check('45. No catalog master data reaches WorkspaceState', () => {
  const ws = createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
  const keys = Object.keys(ws);
  for (const forbidden of ['catalog', 'catalogItems', 'items', 'gifts']) {
    assert(!keys.includes(forbidden), `WorkspaceState gained a "${forbidden}" collection.`);
  }
  const serialized = JSON.stringify(ws);
  assert(!serialized.includes('item-ng-'), 'Catalog seed data leaked into the workspace document.');
});

check('46. A selection snapshot is a copy — later catalog edits cannot rewrite it', () => {
  const item = { ...FIXTURE_ITEMS[0], price: { ...FIXTURE_ITEMS[0].price } };
  const snapshot = snapshotItem(item);
  item.name = 'Renamed after the fact';
  item.price.amountMinor = 1;
  assertEqual(snapshot.name, 'Exactly at budget', 'A snapshot followed a later rename.');
  assertEqual(snapshot.price.amountMinor, 5_000_000, 'A snapshot followed a later repricing.');
});

check('47. The live selection lookup ignores superseded decisions', () => {
  const fx = preparedWorkspace();
  const built = buildItemSelection({
    ...selectionContext(fx), selectedItemId: 'fx-under', reason: 'It fits.', now: NOW, ids, actorId: 'operator-1',
  });
  assert(built.ok, 'Build failed.');
  const superseded: Decision = { ...built.value.decision, status: 'Superseded' };
  assertEqual(findLiveSelectionDecision([superseded], fx.moment.id), null, 'A superseded selection was reported as live.');
  assert(findLiveSelectionDecision([built.value.decision], fx.moment.id) !== null, 'A live selection was not found.');
  // And other moments' selections are not borrowed.
  assertEqual(findLiveSelectionDecision([built.value.decision], 'some-other-moment'), null, 'A selection leaked across moments.');
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
console.log('Item selection validation passed.\n');
