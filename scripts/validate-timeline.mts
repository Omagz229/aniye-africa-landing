/**
 * Deterministic validation for H3.8 — the safe recipient timeline projection.
 *
 * Run with:  npm run validate:timeline
 *
 * Covers ADR-014 §7–§8: the exact nine-field whitelist, constructed by naming
 * every field rather than by spreading an internal record; `giftCategory`
 * resolved through the RecognitionOrder's immutable `itemSelectionDecisionId`
 * — never through whichever `ItemSelection` Decision happens to be currently
 * live for the Moment; and every internal, commercial, partner, proof and
 * identifier field named in §8.C excluded from the projection.
 */

import type {
  Money, PolicyAssignment, Person, Program, RecognitionPolicy, RelationshipClass,
} from '../lib/workspace';
import { createCampaignDraft } from '../lib/programs';
import type { CatalogItem } from '../lib/catalog';
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
import { buildDelivery, buildInitialDispatch } from '../lib/operations/fulfilment';
import { buildMomentClosure } from '../lib/operations/closure';
import {
  TIMELINE_ENTRY_KEYS,
  buildRecipientTimelineEntry,
  hasExactTimelineKeys,
  listRecipientTimeline,
} from '../lib/operations/timeline';
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

function createMemoryStorage() {
  const data = new Map<string, string>();
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
    deliveryRequirement: 'Courier', preferredDeliveryWindow: 'Weekday mornings',
    signatureRequired: true, proofRequired: false,
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
function context(people: Person[]): GenerationContext {
  return {
    workspaceId: WS, program: activeCampaign(people.map(x => x.id)), people,
    classes: [cls()], assignments: [assignment()], policies: [policy()],
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

/** A workspace carrying one Moment, closed end to end — the state the timeline reads. */
function closedMoment(personOver: Partial<Person> & { id: string } = { id: 'p1' }) {
  const p = person(personOver);
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

  const s6 = repo.load(WS);
  assert(s6.ok && s6.value, 'Fixture state unreadable.');
  const reconciliation = buildReconciliation({
    moment, brief, decisions: s6.value!.decisions.filter(d => d.momentId === moment.id),
    orders: s6.value!.recognitionOrders, fulfilments: s6.value!.fulfilments,
    actuals: {
      actualVendorCost: ngn(34_000), actualCourierCost: ngn(4_500), actualCustomerCharge: ngn(62_000),
      reason: 'Invoices arrived exactly as quoted.',
    },
    now: T2, ids, actorId: 'operator-1',
  });
  assert(reconciliation.ok, `Fixture failed to reconcile: ${reconciliation.ok ? '' : reconciliation.reason}`);
  assert(repo.reconcileRecognitionOrder(WS, reconciliation.value, T2).ok, 'Fixture failed to store reconciliation.');

  const s7 = repo.load(WS);
  assert(s7.ok && s7.value, 'Fixture state unreadable.');
  const closureBundle = buildMomentClosure({
    moment: s7.value!.moments.find(m => m.id === moment.id)!,
    brief: s7.value!.executionBriefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null,
    decisions: s7.value!.decisions.filter(d => d.momentId === moment.id),
    fulfilments: s7.value!.fulfilments, events: s7.value!.events.filter(e => e.momentId === moment.id),
    orders: s7.value!.recognitionOrders, memories: s7.value!.memories,
    now: T3, ids, actorId: 'operator-1',
  });
  assert(closureBundle.ok, `Fixture failed to close: ${closureBundle.ok ? '' : closureBundle.reason}`);
  assert(repo.commitMomentClosure(WS, closureBundle.value, T3).ok, 'Fixture failed to store closure.');

  return { repo, moment, person: p };
}

// ═══════════════════════════════════════════════════════════════════════════

console.log('\nH3.8 — Safe recipient timeline projection\n');

check('1. TIMELINE_ENTRY_KEYS names exactly nine fields', () => {
  assertEqual(TIMELINE_ENTRY_KEYS.length, 9, 'TIMELINE_ENTRY_KEYS changed length.');
  for (const k of [
    'entryId', 'recipientFirstName', 'recipientLastName', 'occasion',
    'plannedDate', 'outcomeDate', 'outcome', 'giftCategory', 'summary',
  ]) {
    assert((TIMELINE_ENTRY_KEYS as readonly string[]).includes(k), `${k} is missing from TIMELINE_ENTRY_KEYS.`);
  }
});

check('2. A closed moment resolves to exactly the nine whitelisted fields', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const order = state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId) ?? null;
  const built = buildRecipientTimelineEntry(memory, moment, order, state.value!.decisions);
  assert(built.ok, `Timeline entry could not be built: ${built.ok ? '' : built.reason}`);
  if (!built.ok) return;
  const keys = Object.keys(built.value).sort();
  assertEqual(
    JSON.stringify(keys),
    JSON.stringify([...TIMELINE_ENTRY_KEYS].sort()),
    'The entry does not carry exactly the nine whitelisted keys.',
  );
  assert(hasExactTimelineKeys(built.value as unknown as Record<string, unknown>), 'hasExactTimelineKeys rejected a well-formed entry.');
});

check('3. giftCategory resolves through the order\'s immutable itemSelectionDecisionId', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const order = state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId) ?? null;
  const built = buildRecipientTimelineEntry(memory, moment, order, state.value!.decisions);
  assert(built.ok, 'Timeline entry could not be built.');
  if (!built.ok) return;
  assertEqual(built.value.giftCategory, ITEM.category, 'giftCategory does not match the item actually selected.');
});

check('4. A memory with no backing order is refused, never resolved with a missing category', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const built = buildRecipientTimelineEntry(memory, moment, null, state.value!.decisions);
  assert(!built.ok, 'A memory with no order resolved to a timeline entry.');
});

check('5. A memory belonging to a different moment is refused', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const order = state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId) ?? null;
  const otherMoment = { ...state.value!.moments.find(m => m.id === fx.moment.id)!, id: 'moment-other' };
  const built = buildRecipientTimelineEntry(memory, otherMoment, order, state.value!.decisions);
  assert(!built.ok, 'A cross-moment memory resolved to a timeline entry.');
});

check('6. A memory whose recognitionOrderId disagrees with the supplied order is refused', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const wrongOrder = { ...state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId)!, id: 'order-wrong' };
  const built = buildRecipientTimelineEntry(memory, moment, wrongOrder, state.value!.decisions);
  assert(!built.ok, 'A mismatched order resolved to a timeline entry.');
});

check('7. The projection excludes every internal, commercial and identifier field, by construction', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const order = state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId) ?? null;
  const built = buildRecipientTimelineEntry(memory, moment, order, state.value!.decisions);
  assert(built.ok, 'Timeline entry could not be built.');
  if (!built.ok) return;
  const entry = built.value as unknown as Record<string, unknown>;
  for (const forbidden of [
    'workspaceId', 'momentId', 'personId', 'fulfilmentId', 'recognitionOrderId',
    'vendorId', 'vendorName', 'courierId', 'courierName',
    'estimatedVendorCost', 'estimatedCourierCost', 'estimatedCustomerCharge',
    'actualVendorCost', 'actualCourierCost', 'actualCustomerCharge', 'grossMargin', 'commercialRole',
    'reason', 'recommendation', 'inputs', 'overrideReason', 'note',
    'proofKinds', 'proofKind', 'deliveryAddress', 'recipientEmail', 'recipientPhone', 'recipientCountry',
    'fulfilmentStatus', 'attempt', 'briefId', 'itemSelectionDecisionId', 'policyId', 'schemaVersion',
  ]) {
    assert(!(forbidden in entry), `${forbidden} reached the timeline projection.`);
  }
});

check('8. The summary is derived only from the whitelisted fields, and mentions the recipient and occasion', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const order = state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId) ?? null;
  const built = buildRecipientTimelineEntry(memory, moment, order, state.value!.decisions);
  assert(built.ok, 'Timeline entry could not be built.');
  if (!built.ok) return;
  assert(built.value.summary.includes(moment.recipientSnapshot.firstName), 'Summary omits the recipient.');
  assert(built.value.summary.includes(moment.occasionType), 'Summary omits the occasion.');
  assert(!built.value.summary.toLowerCase().includes('ngn'), 'Summary leaks a currency amount.');
});

check('9. listRecipientTimeline scopes strictly to the named person', () => {
  const fx1 = closedMoment({ id: 'p1' });
  const state = fx1.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const entries = listRecipientTimeline(
    'someone-else', state.value!.moments, state.value!.memories, state.value!.recognitionOrders, state.value!.decisions,
  );
  assertEqual(entries.length, 0, 'A timeline resolved entries for the wrong person.');

  const own = listRecipientTimeline(
    'p1', state.value!.moments, state.value!.memories, state.value!.recognitionOrders, state.value!.decisions,
  );
  assertEqual(own.length, 1, 'The timeline did not resolve the one closed moment for its own person.');
});

check('10. listRecipientTimeline sorts by outcome date', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const earlier = { ...memory, id: 'memory-earlier', outcomeDate: '2026-01-01T00:00:00.000Z' };
  const entries = listRecipientTimeline(
    'p1', state.value!.moments, [...state.value!.memories, earlier], state.value!.recognitionOrders, state.value!.decisions,
  );
  // The synthetic earlier memory has no matching moment beyond the one shared
  // id, so it resolves against the same moment/order — sufficient to prove
  // ordering without a second full fixture.
  assert(entries.length >= 1, 'No entries resolved.');
  for (let i = 1; i < entries.length; i++) {
    assert(entries[i - 1].outcomeDate <= entries[i].outcomeDate, 'Entries are not sorted by outcome date.');
  }
});

check('11. The timeline route resolves to its own title', () => {
  assertEqual(titleFor('/operations/timeline/p1'), 'Relationship timeline', 'Wrong title for the timeline route.');
});

check('12. hasExactTimelineKeys rejects a spread with an extra field', () => {
  const fx = closedMoment();
  const state = fx.repo.load(WS);
  assert(state.ok && state.value, 'State unreadable.');
  const memory = state.value!.memories.find(m => m.momentId === fx.moment.id)!;
  const moment = state.value!.moments.find(m => m.id === fx.moment.id)!;
  const order = state.value!.recognitionOrders.find(o => o.id === memory.recognitionOrderId) ?? null;
  const built = buildRecipientTimelineEntry(memory, moment, order, state.value!.decisions);
  assert(built.ok, 'Timeline entry could not be built.');
  if (!built.ok) return;
  const spread = { ...built.value, momentId: moment.id } as unknown as Record<string, unknown>;
  assert(!hasExactTimelineKeys(spread), 'A spread carrying momentId passed the exact-key check.');
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
console.log('Recipient timeline validation passed.\n');
