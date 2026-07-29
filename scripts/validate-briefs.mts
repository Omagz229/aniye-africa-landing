/**
 * Deterministic validation for H3.2 — the Execution Brief.
 *
 * Run with:  npm run validate:briefs
 *
 * Covers ADR-011 (recipient address, override, revision), ADR-006 (nothing is
 * recorded until confirmation; supersession never mutation), ADR-005 (Operations
 * never writes customer configuration) and the additive Workspace v7 and
 * OperationsState v2 migrations.
 *
 * Storage is injected, so "preview writes nothing" is proven by inspecting the
 * storage log rather than asserted in prose.
 */

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  migrateWorkspace,
  validateMigratedWorkspace,
} from '../lib/migrations';
import { createWorkspace, isAddressComplete, normalizeAddress } from '../lib/workspace';
import type {
  DeliveryAddress,
  Money,
  Person,
  PolicyAssignment,
  Program,
  RecognitionPolicy,
  RelationshipClass,
  WorkspaceState,
} from '../lib/workspace';
import { createCampaignDraft } from '../lib/programs';
import {
  BRIEF_STATUSES,
  CURRENT_OPERATIONS_SCHEMA_VERSION,
  DECISION_TYPES,
  EVENT_TYPES,
  MOMENT_STATUSES,
  OPERATIONS_KEY,
  emptyOperationsState,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type { ExecutionBrief, Moment, OperationsState } from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import type { GenerationContext } from '../lib/operations/generation';
import { buildMomentBatch } from '../lib/operations/generation';
import { buildBriefConfirmation, buildBriefRevision, loadBriefQueue, previewBrief } from '../lib/operations/briefs';
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
const WS = 'org-1';

let n = 0;
const ids = {
  moment: () => `moment-${++n}`,
  decision: () => `decision-${++n}`,
  event: () => `event-${++n}`,
  brief: () => `brief-${++n}`,
};

function ngn(major: number): Money { return { amountMinor: major * 100, currency: 'NGN' }; }

const GOOD_ADDRESS: DeliveryAddress = {
  line1: '12 Adeola Odeku Street',
  line2: 'Flat 4B',
  city: 'Lagos',
  stateOrRegion: 'Lagos State',
  countryCode: 'NG',
  landmark: 'Opposite Eko Hotel',
  deliveryInstructions: 'Reception holds parcels',
};

function cls(id: string, name: string, isActive = true): RelationshipClass {
  return { id, name, type: 'Employee', level: 0, description: '', isDefault: false, isActive, createdAt: T0, updatedAt: T0 };
}

function policy(id: string, name: string, budget: Money, occasion = 'Birthday'): RecognitionPolicy {
  return {
    id, workspaceId: WS, name, description: '',
    recognitionRules: [{ momentType: occasion, budgetPerPerson: budget, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status: 'Published', version: 4,
    createdAt: T0, updatedAt: T0, publishedAt: T0,
  };
}

function assignment(over: Partial<PolicyAssignment> & { id: string }): PolicyAssignment {
  return {
    relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global',
    priority: 0, isActive: true, createdAt: T0, updatedAt: T0, ...over,
  };
}

function person(over: Partial<Person> & { id: string }): Person {
  return {
    firstName: 'Ada', lastName: 'Obi', relationshipClassIds: ['class-exec'],
    sourceId: 'source-1', sourceType: 'Manual', status: 'Active', country: 'NG',
    createdAt: T0, updatedAt: T0, ...over,
  };
}

const CLASSES = [cls('class-exec', 'Executive Leadership')];
const POLICIES = [policy('policy-global', 'Global Recognition', ngn(50_000))];
const ASSIGNMENTS = [assignment({ id: 'a-global' })];

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

function context(people: Person[]): GenerationContext {
  return {
    workspaceId: WS,
    program: activeCampaign(people.map(p => p.id)),
    people, classes: CLASSES, assignments: ASSIGNMENTS, policies: POLICIES,
    existingSourceKeys: new Map(), now: NOW,
  };
}

/** A repository holding one prepared Moment for `people[0]`. */
function repoWithMoment(people: Person[]) {
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(WS, NOW);
  const batch = buildMomentBatch(context(people), ids, 'operator-1');
  const created = repo.createMoments(WS, batch, NOW);
  assert(created.ok, `Fixture failed to create moments: ${created.ok ? '' : created.reason}`);
  const moment = batch.moments[0];
  return { repo, storage, moment, batch };
}

function confirm(moment: Moment, p: Person | undefined, over: Record<string, unknown> = {}) {
  return buildBriefConfirmation({ moment, person: p, now: NOW, ids, actorId: 'operator-1', ...over });
}

console.log('\nExecution Brief (H3.2) — validation\n');

// ─── Part 1: Workspace schema v7 ─────────────────────────────────────────────

check('1. The workspace schema is v7', () => {
  assertEqual(CURRENT_WORKSPACE_SCHEMA_VERSION, 7, 'Workspace schema is not at v7.');
  const ws = createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
  assertEqual(ws.schemaVersion, 7, 'A new workspace is not at v7.');
});

check('2. A v1 workspace still walks every rung to v7', () => {
  const v1 = {
    organizationId: WS, companyName: 'Legacy', website: '', industry: 'Retail',
    employeeCount: '11-50', operatingCountries: ['Nigeria'], baseCurrency: 'NGN',
    timezone: 'Africa/Lagos', contactName: 'A', contactEmail: 'a@x.example',
    contactRole: 'HR', phone: '', setupStage: 'classes', createdAt: T0,
    relationshipClasses: [{ id: 'c1', name: 'Staff', description: '', category: 'Internal', tier: 'Standard', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0 }],
    recognitionPolicies: [],
  };
  const result = migrateWorkspace<WorkspaceState>(v1);
  assert(result.status === 'ok', `v1 → v7 failed: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.toVersion, 7, 'Migration did not reach v7.');
  assertEqual(result.applied.length, 6, 'Expected six rungs from v1 to v7.');
  assert(result.applied[5].includes('delivery-address'), 'The H3.2 rung did not run last.');
});

check('3. The v6 → v7 migration gives nobody an address', () => {
  const v6 = {
    ...createWorkspace({
      companyName: 'M', website: '', industry: 'X', employeeCount: '1-10',
      operatingCountries: ['Nigeria'], contactName: 'A', contactEmail: 'a@x.example',
      contactRole: 'HR', phone: '',
    }),
    schemaVersion: 6,
    people: [person({ id: 'p1' }), person({ id: 'p2' })],
  };
  const result = migrateWorkspace<WorkspaceState>(v6);
  assert(result.status === 'ok', 'v6 → v7 failed.');
  assertEqual(result.applied.length, 1, 'Expected exactly one rung from v6.');
  for (const p of result.workspace.people) {
    assertEqual(p.deliveryAddress, undefined, `Migration invented an address for ${p.id}.`);
  }
});

check('4. The v6 → v7 migration preserves unknown payload', () => {
  const v6 = {
    ...createWorkspace({
      companyName: 'M', website: '', industry: 'X', employeeCount: '1-10',
      operatingCountries: ['Nigeria'], contactName: 'A', contactEmail: 'a@x.example',
      contactRole: 'HR', phone: '',
    }),
    schemaVersion: 6,
    people: [{ ...person({ id: 'p1' }), futureField: 'kept', nested: { a: 1 } }],
    someUnknownTopLevelKey: ['kept too'],
  };
  const result = migrateWorkspace<WorkspaceState>(v6);
  assert(result.status === 'ok', 'v6 → v7 failed.');
  const raw = result.workspace as unknown as Record<string, unknown>;
  assert(Array.isArray(raw.someUnknownTopLevelKey), 'An unknown top-level key was dropped.');
  const p = result.workspace.people[0] as unknown as Record<string, unknown>;
  assertEqual(p.futureField, 'kept', 'An unknown person field was dropped.');
  assert(p.nested !== undefined, 'A nested unknown value was dropped.');
});

check('5. A structurally malformed address is refused; an incomplete one is not', () => {
  const base = createWorkspace({
    companyName: 'M', website: '', industry: 'X', employeeCount: '1-10',
    operatingCountries: ['Nigeria'], contactName: 'A', contactEmail: 'a@x.example',
    contactRole: 'HR', phone: '',
  });

  // Incomplete is a normal customer state — it must not lock anyone out of the
  // screen that fixes it.
  const partial = { ...base, people: [{ ...person({ id: 'p1' }), deliveryAddress: { line1: '12 Adeola' } }] };
  assert(validateMigratedWorkspace(partial).ok, 'An incomplete address was wrongly refused.');

  const wrongType = { ...base, people: [{ ...person({ id: 'p1' }), deliveryAddress: { line1: 42 } }] };
  assert(!validateMigratedWorkspace(wrongType).ok, 'A non-text address field was accepted.');

  const notObject = { ...base, people: [{ ...person({ id: 'p1' }), deliveryAddress: '12 Adeola' }] };
  assert(!validateMigratedWorkspace(notObject).ok, 'A string address was accepted.');
});

// ─── Part 2: OperationsState v2 ──────────────────────────────────────────────

// H3.3 amended this check and checks 7, 9 and 35. They pinned the literal
// version `2` and the pre-H3.3 decision set, so a legitimate additive rung
// (v2 → v3, `excludedCategories`) failed them. What they were actually testing
// — that operations versions independently of the workspace, and that a v1
// payload still walks every rung — is unchanged and now version-agnostic.
check('6. OperationsState is at or beyond v2 and independent of the workspace', () => {
  assert(CURRENT_OPERATIONS_SCHEMA_VERSION >= 2, 'Operations schema regressed below v2.');
  const ops: number = CURRENT_OPERATIONS_SCHEMA_VERSION;
  const ws: number = CURRENT_WORKSPACE_SCHEMA_VERSION;
  assert(ops !== ws, 'The two schema versions are coupled; they must move independently.');
});

check('7. A v1 operations payload migrates rather than being quarantined', () => {
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [], decisions: [], events: [],
    createdAt: T0, updatedAt: T0,
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  assertEqual(result.from, 1, 'Wrong source version reported.');
  assertEqual(result.state.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assert(Array.isArray(result.state.executionBriefs), 'executionBriefs was not added.');
  assertEqual(result.state.executionBriefs.length, 0, 'Migration invented briefs.');
});

check('8. Migrating a v1 operations payload preserves unknown keys and history', () => {
  const v1 = {
    schemaVersion: 1, workspaceId: WS,
    moments: [], decisions: [], events: [],
    createdAt: T0, updatedAt: T0,
    futureCollection: [{ keep: true }],
  };
  const result = migrateOperationsState(v1);
  assert(result.status === 'migrated', 'A v1 payload was not migrated.');
  const raw = result.state as unknown as Record<string, unknown>;
  assert(Array.isArray(raw.futureCollection), 'An unknown operations key was dropped.');
  assertEqual(raw.createdAt, T0, 'createdAt was rewritten by the migration.');
});

check('9. A stored v1 payload is read through the repository, not set aside', () => {
  const v1: Record<string, unknown> = {
    schemaVersion: 1, workspaceId: WS,
    moments: [], decisions: [], events: [],
    createdAt: T0, updatedAt: T0,
  };
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: JSON.stringify(v1) });
  const repo = createLocalOperationsRepository(storage);
  const loaded = repo.load(WS);
  assert(loaded.ok, `A v1 payload was refused: ${loaded.ok ? '' : loaded.reason}`);
  assert(loaded.value !== null, 'A v1 payload read as empty.');
  assertEqual(loaded.value!.schemaVersion, CURRENT_OPERATIONS_SCHEMA_VERSION, 'The read did not migrate.');
  // Reads have no side effects — that is what lets preview claim to write nothing.
  assertEqual(storage.writes.length, 0, 'Reading wrote to storage.');
});

check('10. An operations payload from a newer build is refused, not downgraded', () => {
  const future = { schemaVersion: 99, workspaceId: WS, moments: [], decisions: [], events: [], executionBriefs: [], createdAt: T0, updatedAt: T0 };
  const result = migrateOperationsState(future);
  assert(result.status === 'invalid', 'A newer payload was accepted.');
  assert(result.reason.includes('99'), 'The refusal did not name the version.');
});

// ─── Part 3: the address gate ────────────────────────────────────────────────

check('11. A person with no address still produces a ReadyForExecution Moment', () => {
  const p = person({ id: 'p1' });
  assertEqual(p.deliveryAddress, undefined, 'Fixture person unexpectedly has an address.');
  const batch = buildMomentBatch(context([p]), ids, 'operator-1');
  assertEqual(batch.moments.length, 1, 'No moment was created.');
  assertEqual(batch.moments[0].status, 'ReadyForExecution', 'A missing address blocked moment creation.');
  assertEqual(batch.moments[0].issues.length, 0, 'A missing address was recorded as a moment issue.');
});

check('12. MOMENT_STATUSES was not expanded for address readiness', () => {
  assertEqual(MOMENT_STATUSES.length, 3, 'MOMENT_STATUSES changed length.');
  for (const expected of ['NeedsReview', 'ReadyForExecution', 'Cancelled']) {
    assert((MOMENT_STATUSES as readonly string[]).includes(expected), `${expected} is missing.`);
  }
  for (const forbidden of ['AwaitingAddress', 'AddressIncomplete', 'Briefed']) {
    assert(!(MOMENT_STATUSES as readonly string[]).includes(forbidden), `${forbidden} was added to MOMENT_STATUSES.`);
  }
});

check('13. A missing address blocks brief confirmation with a named recovery', () => {
  const p = person({ id: 'p1' });
  const { moment } = repoWithMoment([p]);
  const preview = previewBrief(moment, p);
  assertEqual(preview.confirmable, false, 'A brief with no address was confirmable.');
  const blocker = preview.blockers.find(b => b.code === 'address-incomplete');
  assert(blocker, 'No address blocker was raised.');
  assert(blocker!.message.includes('Ada'), 'The blocker does not name who is affected.');
  assert(blocker!.href === '/workspace/people', 'The blocker does not link to the Workspace page that fixes it.');
  assert((blocker!.recovery ?? '').length > 0, 'The blocker names no recovery.');
});

check('14. An incomplete address names the exact missing fields', () => {
  const p = person({ id: 'p1', deliveryAddress: { line1: '12 Adeola', city: '', countryCode: '' } });
  const { moment } = repoWithMoment([p]);
  const preview = previewBrief(moment, p);
  const blocker = preview.blockers.find(b => b.code === 'address-incomplete');
  assert(blocker, 'No address blocker was raised.');
  assert(blocker!.message.includes('city'), 'The missing city was not named.');
  assert(blocker!.message.includes('country'), 'The missing country was not named.');
});

check('15. A complete address makes the brief confirmable', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { moment } = repoWithMoment([p]);
  const preview = previewBrief(moment, p);
  assertEqual(preview.blockers.length, 0, `Unexpected blockers: ${preview.blockers.map(b => b.code).join(', ')}`);
  assertEqual(preview.confirmable, true, 'A complete address did not make the brief confirmable.');
});

check('16. isAddressComplete requires exactly line1, city and countryCode', () => {
  assert(isAddressComplete({ line1: 'a', city: 'b', countryCode: 'NG' }), 'The three required fields were rejected.');
  assert(!isAddressComplete({ line1: 'a', city: 'b', countryCode: '  ' }), 'Whitespace passed as a country.');
  assert(!isAddressComplete(undefined), 'An absent address passed.');
  // Optional fields are genuinely optional — postal codes are unreliable in
  // much of the operating footprint.
  assert(isAddressComplete(normalizeAddress({ line1: 'a', city: 'b', countryCode: 'ng' })), 'A lowercase country failed.');
  assertEqual(normalizeAddress({ line1: 'a', city: 'b', countryCode: 'ng' })!.countryCode, 'NG', 'Country was not uppercased.');
  assertEqual(normalizeAddress({ line1: '  ', city: '' }), undefined, 'An empty form produced an address.');
});

// ─── Part 4: preview writes nothing ──────────────────────────────────────────

check('17. Previewing a brief writes nothing at all', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { moment, storage } = repoWithMoment([p]);
  const before = storage.writes.length;

  for (let i = 0; i < 5; i++) previewBrief(moment, p);
  previewBrief(moment, p, { overrideAddress: { line1: 'elsewhere', city: 'Abuja', countryCode: 'NG' } });
  buildBriefConfirmation({ moment, person: p, now: NOW, ids, actorId: 'operator-1' });

  assertEqual(storage.writes.length, before, 'Previewing or building wrote to storage.');
});

check('18. Building a confirmation does not persist it', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment, storage } = repoWithMoment([p]);
  const before = storage.writes.length;
  const built = confirm(moment, p);
  assert(built.ok, 'Confirmation could not be built.');
  assertEqual(storage.writes.length, before, 'Building wrote to storage.');
  const live = repo.findLiveBriefForMoment(WS, moment.id);
  assert(live.ok && live.value === null, 'A brief existed before anyone confirmed.');
});

// ─── Part 5: confirmation ────────────────────────────────────────────────────

check('19. Confirming copies the person address into deliveryAddressSnapshot', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const built = confirm(moment, p);
  assert(built.ok, 'Confirmation could not be built.');
  const written = repo.commitBrief(WS, built.value, NOW);
  assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);

  const brief = written.value;
  assertEqual(brief.addressSource, 'PersonDefault', 'Wrong address source.');
  assertEqual(brief.deliveryAddressSnapshot.line1, GOOD_ADDRESS.line1, 'line1 was not copied.');
  assertEqual(brief.deliveryAddressSnapshot.landmark, GOOD_ADDRESS.landmark, 'The landmark was not copied.');
  assertEqual(brief.revision, 1, 'First confirmation is not revision 1.');
  assertEqual(brief.status, 'Confirmed', 'Brief is not Confirmed.');
  assertEqual(brief.approvedBudget.amountMinor, ngn(50_000).amountMinor, 'Wrong budget on the brief.');
  assert(brief.constraints.length > 0, 'No constraints were carried onto the brief.');
});

check('20. The snapshot survives the person address changing afterwards', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const built = confirm(moment, p);
  assert(built.ok, 'Confirmation could not be built.');
  repo.commitBrief(WS, built.value, NOW);

  // The customer edits their record in Workspace — history must not move.
  p.deliveryAddress = { line1: 'Somewhere else', city: 'Abuja', countryCode: 'NG' };

  const live = repo.findLiveBriefForMoment(WS, moment.id);
  assert(live.ok && live.value, 'The brief disappeared.');
  assertEqual(live.value!.deliveryAddressSnapshot.line1, GOOD_ADDRESS.line1, 'The snapshot followed the person record.');
});

check('21. Confirmation writes the brief, a Decision and an Event together', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const built = confirm(moment, p);
  assert(built.ok, 'Confirmation could not be built.');
  repo.commitBrief(WS, built.value, NOW);

  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  const decision = state.value!.decisions.find(d => d.decisionType === 'BriefConfirmation');
  assert(decision, 'No BriefConfirmation decision was recorded.');
  assertEqual(decision!.provider, 'HumanOperator', 'Confirming a brief is not recorded as a human judgement.');
  assert(decision!.reason.length > 0, 'The decision carries no reason.');
  const event = state.value!.events.find(e => e.eventType === 'BriefGenerated');
  assert(event, 'No BriefGenerated event was recorded.');
  assertEqual(event!.momentId, moment.id, 'The event is attached to the wrong moment.');
});

check('22. A brief cannot be confirmed against an incomplete address', () => {
  const p = person({ id: 'p1' });
  const { repo, moment } = repoWithMoment([p]);
  const built = confirm(moment, p);
  assert(!built.ok, 'A brief with no address was built.');

  // And the store refuses it even if a caller fabricates one.
  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  const forged: OperationsState = {
    ...state.value!,
    executionBriefs: [{
      id: 'brief-forged', workspaceId: WS, momentId: moment.id, status: 'Confirmed', revision: 1,
      recipientSnapshot: moment.recipientSnapshot,
      relationshipGroupSnapshot: moment.relationshipGroupSnapshot,
      policyResolutionSnapshot: moment.policyResolutionSnapshot!,
      deliveryAddressSnapshot: { line1: '', city: '', countryCode: '' },
      addressSource: 'PersonDefault', occasionType: 'Birthday', targetDate: '2026-12-01',
      approvedBudget: ngn(50_000), constraints: [], createdAt: NOW, confirmedAt: NOW,
    } as ExecutionBrief],
  };
  const validation = validateOperationsState(forged, WS);
  assert(!validation.ok, 'An incomplete address passed persistence validation.');
  assert(validation.reason.includes('incomplete'), 'The refusal does not explain itself.');
});

check('23. A moment that is not ready cannot produce a brief', () => {
  const p = person({ id: 'p1', status: 'Inactive', deliveryAddress: GOOD_ADDRESS });
  const { moment } = repoWithMoment([p]);
  assertEqual(moment.status, 'NeedsReview', 'Fixture moment is not NeedsReview.');
  const preview = previewBrief(moment, p);
  assert(preview.blockers.some(b => b.code === 'moment-not-ready'), 'A NeedsReview moment was briefable.');
  assertEqual(preview.confirmable, false, 'A NeedsReview moment was confirmable.');
});

check('24. A moment cannot hold two live briefs', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed to build.');
  assert(repo.commitBrief(WS, first.value, NOW).ok, 'First commit failed.');

  const live = repo.findLiveBriefForMoment(WS, moment.id);
  assert(live.ok && live.value, 'The first brief is not live.');

  // The builder is pure: told a brief exists, it refuses and explains.
  const informed = buildBriefConfirmation({
    moment, person: p, now: LATER, ids, actorId: 'operator-1', existingBrief: live.value,
  });
  assert(!informed.ok, 'The builder allowed a second brief over a live one.');
  assert(informed.reason.toLowerCase().includes('already'), 'The refusal does not explain itself.');

  // The store is the authority, and refuses even a caller that never asked.
  const uninformed = buildBriefConfirmation({ moment, person: p, now: LATER, ids, actorId: 'operator-1' });
  assert(uninformed.ok, 'Fixture could not build an uninformed second brief.');
  const written = repo.commitBrief(WS, uninformed.value, LATER);
  assert(!written.ok, 'The store accepted a second live brief.');
  assert(written.reason.includes('already been confirmed'), 'The store refusal does not explain itself.');

  // And nothing partial landed.
  const all = repo.listBriefsForMoment(WS, moment.id);
  assert(all.ok, 'Could not list briefs.');
  assertEqual(all.value.length, 1, 'A refused commit left records behind.');
});

// ─── Part 6: override and revision ───────────────────────────────────────────

check('25. An override records reason, provenance and timestamp', () => {
  const p = person({ id: 'p1' });
  const { repo, moment } = repoWithMoment([p]);
  const built = confirm(moment, p, {
    override: { address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' }, reason: 'Recipient moved; confirmed by phone', source: 'Phone' },
  });
  assert(built.ok, `Override confirmation failed: ${built.ok ? '' : built.reason}`);
  const written = repo.commitBrief(WS, built.value, NOW);
  assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);

  const brief = written.value;
  assertEqual(brief.addressSource, 'OperatorOverride', 'Override did not mark the address source.');
  assert(brief.addressOverride, 'No override record was written.');
  assertEqual(brief.addressOverride!.reason, 'Recipient moved; confirmed by phone', 'The reason was not recorded.');
  assertEqual(brief.addressOverride!.actorType, 'Operator', 'Provenance actor was not recorded.');
  assertEqual(brief.addressOverride!.source, 'Phone', 'Provenance channel was not recorded.');
  assertEqual(brief.addressOverride!.overriddenAt, NOW, 'The override timestamp was not recorded.');
  assertEqual(brief.deliveryAddressSnapshot.line1, '9 Bishop Aboyade', 'The override address was not used.');
});

check('26. An override with no reason is refused', () => {
  const p = person({ id: 'p1' });
  const { moment } = repoWithMoment([p]);
  const built = confirm(moment, p, {
    override: { address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' }, reason: '   ' },
  });
  assert(!built.ok, 'An override with no reason was accepted.');
  assert(built.reason.toLowerCase().includes('reason'), 'The refusal does not mention the missing reason.');
});

check('27. An override never writes to Person.deliveryAddress', () => {
  const p = person({ id: 'p1', deliveryAddress: { line1: 'Old address', city: 'Lagos', countryCode: 'NG' } });
  const before = JSON.stringify(p);
  const { repo, moment } = repoWithMoment([p]);

  const built = confirm(moment, p, {
    override: { address: { line1: 'New address', city: 'Abuja', countryCode: 'NG' }, reason: 'Moved' },
  });
  assert(built.ok, 'Override confirmation failed.');
  assert(repo.commitBrief(WS, built.value, NOW).ok, 'Commit failed.');

  assertEqual(JSON.stringify(p), before, 'The override mutated the Person record.');
  assertEqual(p.deliveryAddress!.line1, 'Old address', 'Person.deliveryAddress was rewritten.');
  // And the previous value is preserved on the brief so the change is legible.
  const live = repo.findLiveBriefForMoment(WS, moment.id);
  assert(live.ok && live.value?.addressOverride?.previousAddress?.line1 === 'Old address',
    'The prior address was not preserved on the override record.');
});

check('28. Correcting a confirmed brief preserves the original', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed.');
  assert(repo.commitBrief(WS, first.value, NOW).ok, 'First commit failed.');
  const originalId = first.value.brief.id;
  const originalJson = JSON.stringify(first.value.brief);

  const revised = buildBriefRevision({
    moment, current: first.value.brief,
    address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' },
    reason: 'Recipient relocated', now: LATER, ids, actorId: 'operator-1',
    supersedesDecisionId: first.value.decision.id,
  });
  assert(revised.ok, `Revision failed to build: ${revised.ok ? '' : revised.reason}`);
  assert(repo.commitBrief(WS, revised.value, LATER).ok, 'Revision commit failed.');

  const all = repo.listBriefsForMoment(WS, moment.id);
  assert(all.ok, 'Could not list briefs.');
  assertEqual(all.value.length, 2, 'The original was replaced rather than preserved.');

  const original = all.value.find(b => b.id === originalId)!;
  assertEqual(original.status, 'Superseded', 'The original was not marked superseded.');
  assertEqual(original.supersededByBriefId, revised.value.brief.id, 'The original does not point at its replacement.');
  assertEqual(original.supersededAt, LATER, 'The supersession timestamp is missing.');
  // Only supersession metadata changed — every other field is byte-identical.
  const supersessionKeys = new Set(['status', 'supersededByBriefId', 'supersededAt']);
  const contentOf = (brief: Record<string, unknown>) =>
    JSON.stringify(
      Object.fromEntries(Object.entries(brief).filter(([k]) => !supersessionKeys.has(k)).sort()),
    );
  assertEqual(
    contentOf(original as unknown as Record<string, unknown>),
    contentOf(JSON.parse(originalJson)),
    'The original brief content was rewritten.',
  );
});

check('29. A revision increments, links back, and becomes the live brief', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed.');
  repo.commitBrief(WS, first.value, NOW);

  const revised = buildBriefRevision({
    moment, current: first.value.brief,
    address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' },
    reason: 'Recipient relocated', now: LATER, ids,
  });
  assert(revised.ok, 'Revision failed to build.');
  repo.commitBrief(WS, revised.value, LATER);

  assertEqual(revised.value.brief.revision, 2, 'Revision number did not increment.');
  assertEqual(revised.value.brief.revisionOfBriefId, first.value.brief.id, 'The revision does not link back.');

  const live = repo.findLiveBriefForMoment(WS, moment.id);
  assert(live.ok && live.value, 'No live brief after revision.');
  assertEqual(live.value!.id, revised.value.brief.id, 'The superseded brief is still live.');
});

check('30. A correction records an AddressOverride Decision and supersedes the prior one', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed.');
  repo.commitBrief(WS, first.value, NOW);

  const revised = buildBriefRevision({
    moment, current: first.value.brief,
    address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' },
    reason: 'Recipient relocated', now: LATER, ids,
    supersedesDecisionId: first.value.decision.id,
  });
  assert(revised.ok, 'Revision failed to build.');
  repo.commitBrief(WS, revised.value, LATER);

  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');

  const prior = state.value!.decisions.find(d => d.id === first.value.decision.id)!;
  assertEqual(prior.status, 'Superseded', 'The prior decision was not superseded.');
  assertEqual(prior.reason, first.value.decision.reason, 'The superseded decision’s reason was rewritten.');

  const override = state.value!.decisions.find(d => d.decisionType === 'AddressOverride');
  assert(override, 'No AddressOverride decision was recorded.');
  assertEqual(override!.status, 'Confirmed', 'The override decision is not Confirmed.');
  assertEqual(override!.reason, 'Recipient relocated', 'The override reason was not carried.');
});

check('31. A correction appends an ExecutionBriefAddressOverridden event', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed.');
  repo.commitBrief(WS, first.value, NOW);
  const eventsBefore = repo.load(WS).ok ? (repo.load(WS) as { value: OperationsState }).value.events.length : 0;

  const revised = buildBriefRevision({
    moment, current: first.value.brief,
    address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' },
    reason: 'Recipient relocated', now: LATER, ids,
  });
  assert(revised.ok, 'Revision failed to build.');
  repo.commitBrief(WS, revised.value, LATER);

  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  const event = state.value!.events.find(e => e.eventType === 'ExecutionBriefAddressOverridden');
  assert(event, 'No ExecutionBriefAddressOverridden event was recorded.');
  assertEqual(event!.actorType, 'Operator', 'The override event has the wrong actor.');
  assert((event!.payload as { reason?: string }).reason === 'Recipient relocated', 'The event carries no reason.');
  // Append-only — nothing was removed.
  assert(state.value!.events.length > eventsBefore, 'Events were rewritten rather than appended.');
  assertEqual(
    state.value!.events.filter(e => e.eventType === 'BriefGenerated').length,
    1,
    'The original BriefGenerated event was removed.',
  );
});

check('32. A revision with an incomplete address is refused', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed.');
  repo.commitBrief(WS, first.value, NOW);

  const revised = buildBriefRevision({
    moment, current: first.value.brief,
    address: { line1: '9 Bishop Aboyade', city: '', countryCode: '' },
    reason: 'Recipient relocated', now: LATER, ids,
  });
  assert(!revised.ok, 'An incomplete revision was accepted.');
  assert(revised.reason.includes('city'), 'The refusal does not name the missing field.');
});

check('33. A superseded brief cannot be revised again', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const first = confirm(moment, p);
  assert(first.ok, 'First confirmation failed.');
  repo.commitBrief(WS, first.value, NOW);

  const revised = buildBriefRevision({
    moment, current: first.value.brief,
    address: { line1: '9 Bishop Aboyade', city: 'Lagos', countryCode: 'NG' },
    reason: 'Recipient relocated', now: LATER, ids,
  });
  assert(revised.ok, 'Revision failed to build.');
  repo.commitBrief(WS, revised.value, LATER);

  const again = buildBriefRevision({
    moment, current: { ...first.value.brief, status: 'Superseded' },
    address: { line1: 'Third address', city: 'Kano', countryCode: 'NG' },
    reason: 'Again', now: LATER, ids,
  });
  assert(!again.ok, 'A superseded brief was revised.');
});

// ─── Part 7: boundaries ──────────────────────────────────────────────────────

check('34. Briefs live only in OperationsState, never in the workspace', () => {
  const ws = createWorkspace({
    companyName: 'M', website: '', industry: 'X', employeeCount: '1-10',
    operatingCountries: ['Nigeria'], contactName: 'A', contactEmail: 'a@x.example',
    contactRole: 'HR', phone: '',
  });
  for (const forbidden of ['executionBriefs', 'briefs', 'moments', 'decisions', 'events']) {
    assert(!(forbidden in ws), `WorkspaceState gained an operational collection: ${forbidden}.`);
  }
  const state = emptyOperationsState(WS, NOW);
  assert(Array.isArray(state.executionBriefs), 'OperationsState has no executionBriefs collection.');
});

check('35. The new Decision and Event types are declared, and no more', () => {
  for (const t of ['BriefConfirmation', 'AddressOverride']) {
    assert((DECISION_TYPES as readonly string[]).includes(t), `${t} is not a declared decision type.`);
  }
  for (const t of ['BriefGenerated', 'ExecutionBriefAddressOverridden']) {
    assert((EVENT_TYPES as readonly string[]).includes(t), `${t} is not a declared event type.`);
  }
  // The ambiguous checkpoint name must not come back (ADR-011 supersedes it).
  assert(!(EVENT_TYPES as readonly string[]).includes('AddressUpdated'), 'AddressUpdated was reintroduced.');
  // Later milestones must not be pre-empted here. `ItemSelection` left this
  // list at H3.3, which is the milestone that produces it; the rest have not.
  for (const t of ['VendorSelection', 'CourierSelection', 'QAException']) {
    assert(!(DECISION_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
  for (const t of ['Dispatched', 'Delivered', 'ProofReceived', 'MomentClosed']) {
    assert(!(EVENT_TYPES as readonly string[]).includes(t), `${t} belongs to a later milestone.`);
  }
});

check('36. Brief statuses stay at Confirmed and Superseded', () => {
  assertEqual(BRIEF_STATUSES.length, 2, 'BRIEF_STATUSES changed length.');
  for (const s of ['Confirmed', 'Superseded']) {
    assert((BRIEF_STATUSES as readonly string[]).includes(s), `${s} is missing.`);
  }
  assert(!(BRIEF_STATUSES as readonly string[]).includes('Draft'), 'A Draft status was added; drafts are not persisted.');
});

check('37. A brief for another workspace is refused', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, moment } = repoWithMoment([p]);
  const built = confirm(moment, p);
  assert(built.ok, 'Confirmation failed to build.');
  const foreign = { ...built.value, brief: { ...built.value.brief, workspaceId: 'org-somebody-else' } };
  const written = repo.commitBrief(WS, foreign, NOW);
  assert(!written.ok, 'A brief belonging to another workspace was accepted.');
});

// ─── Part 8: the brief queue (H3.2-D1) ───────────────────────────────────────
//
// The defect: a storage read failure was rendered as an empty queue, so an
// operator could not tell "no work" from "cannot see the work". Every check
// below asserts the three outcomes stay distinct — and that nothing is written.

function queueWorkspace(people: Person[]) {
  return {
    ...createWorkspace({
      companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
      operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
      contactRole: 'Head of People', phone: '',
    }),
    organizationId: WS,
    people: [...people],
  };
}

check('38. A successful read with no briefs renders the calm empty state', () => {
  const { repo } = repoWithMoment([person({ id: 'p1', status: 'Inactive' })]);
  const result = loadBriefQueue({
    readWorkspace: () => queueWorkspace([person({ id: 'p1', status: 'Inactive' })]) as never,
    repository: repo,
  });
  assert(result.status === 'ok', 'A healthy read was reported as failed.');
  if (result.status === 'ok') {
    assertEqual(result.waiting.length, 0, 'An ineligible moment appeared in the queue.');
    assertEqual(result.confirmed.length, 0, 'Confirmed briefs appeared from nowhere.');
  }
});

check('39. A successful read with work renders a populated queue', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo } = repoWithMoment([p]);
  const result = loadBriefQueue({ readWorkspace: () => queueWorkspace([p]) as never, repository: repo });
  assert(result.status === 'ok', 'A healthy read was reported as failed.');
  if (result.status === 'ok') {
    assertEqual(result.waiting.length, 1, 'The waiting moment is missing.');
    assertEqual(result.waiting[0].hasAddress, true, 'A complete address was not detected.');
  }
});

check('40. A person with no address still appears, flagged', () => {
  const p = person({ id: 'p1' });
  const { repo } = repoWithMoment([p]);
  const result = loadBriefQueue({ readWorkspace: () => queueWorkspace([p]) as never, repository: repo });
  assert(result.status === 'ok', 'A healthy read was reported as failed.');
  if (result.status === 'ok') {
    assertEqual(result.waiting.length, 1, 'A person without an address was dropped from the queue.');
    assertEqual(result.waiting[0].hasAddress, false, 'A missing address was not flagged.');
  }
});

check('41. An operations read failure is an error, never an empty queue', () => {
  const badStorage = createMemoryStorage({ [OPERATIONS_KEY]: '{ not json' });
  const badRepo = createLocalOperationsRepository(badStorage);
  const result = loadBriefQueue({
    readWorkspace: () => queueWorkspace([person({ id: 'p1' })]) as never,
    repository: badRepo,
  });
  assert(result.status === 'failed', 'A broken store was rendered as an empty queue.');
  if (result.status === 'failed') {
    assert(result.message.length > 0, 'The failure names nothing.');
    assert(result.recovery.length > 0, 'The failure offers no recovery.');
    assert((result.detail ?? '').length > 0, 'The underlying reason was discarded.');
  }
});

check('42. A foreign-workspace payload is an error, not guessed empty state', () => {
  const foreign = JSON.stringify(emptyOperationsState('org-somebody-else', T0));
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: foreign });
  const repo = createLocalOperationsRepository(storage);
  const result = loadBriefQueue({
    readWorkspace: () => queueWorkspace([person({ id: 'p1' })]) as never,
    repository: repo,
  });
  assert(result.status === 'failed', 'Another organization’s payload was rendered as an empty queue.');
  if (result.status === 'failed') {
    assert((result.detail ?? '').length > 0, 'The refusal reason was discarded.');
  }
});

check('43. An unreadable workspace is an error, not an empty queue', () => {
  const { repo } = repoWithMoment([person({ id: 'p1' })]);
  const result = loadBriefQueue({ readWorkspace: () => null, repository: repo });
  assert(result.status === 'failed', 'An unreadable workspace was rendered as an empty queue.');
  if (result.status === 'failed') assert(result.recovery.length > 0, 'No recovery was offered.');
});

check('44. A retry after failure performs a fresh read and recovers', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, storage } = repoWithMoment([p]);
  const healthy = storage.getItem(OPERATIONS_KEY)!;

  // Break the store, read, then repair it and read again through the same path.
  storage.setItem(OPERATIONS_KEY, '{ not json');
  const brokenRepo = createLocalOperationsRepository(storage);
  const first = loadBriefQueue({ readWorkspace: () => queueWorkspace([p]) as never, repository: brokenRepo });
  assert(first.status === 'failed', 'The broken read did not fail.');

  storage.setItem(OPERATIONS_KEY, healthy);
  const second = loadBriefQueue({ readWorkspace: () => queueWorkspace([p]) as never, repository: repo });
  assert(second.status === 'ok', 'The retry did not re-read; it returned the stale failure.');
  if (second.status === 'ok') {
    assertEqual(second.waiting.length, 1, 'The recovered queue is empty.');
  }
});

check('45. Reading the queue writes no Brief, Decision or Event', () => {
  const p = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const { repo, storage } = repoWithMoment([p]);
  const before = storage.writes.length;

  for (let i = 0; i < 4; i++) {
    loadBriefQueue({ readWorkspace: () => queueWorkspace([p]) as never, repository: repo });
  }
  loadBriefQueue({ readWorkspace: () => null, repository: repo });

  assertEqual(storage.writes.length, before, 'Reading the queue wrote to storage.');
  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  assertEqual(state.value!.executionBriefs.length, 0, 'A brief was created by reading.');
  assertEqual(state.value!.decisions.length, 2, 'Decisions changed while reading.');
  assertEqual(state.value!.events.length, 2, 'Events changed while reading.');
});

// ─── Part 9: acceptance corrections (H3.2-D2, H3.2-D3) ───────────────────────

check('46. Every operations route resolves a correct header title (H3.2-D2)', () => {
  assertEqual(titleFor('/operations'), 'Command', 'Command title wrong.');
  assertEqual(titleFor('/operations/moments'), 'Moments', 'Moments title wrong.');
  assertEqual(titleFor('/operations/moments/m-1'), 'Moment', 'Moment title wrong.');
  // The brief lives under a moment, so it must be matched before the prefix.
  assertEqual(titleFor('/operations/moments/m-1/brief'), 'Brief', 'Brief route inherited the Moments title.');
  assertEqual(titleFor('/operations/briefs'), 'Briefs', 'Briefs route fell through to Command.');
  assertEqual(titleFor('/operations/programs/p-1/prepare'), 'Prepare moments', 'Prepare title wrong.');
});

check('47. Address completeness drives the directory badge (H3.2-D3)', () => {
  // The predicate the Workspace directory badge and the brief gate both use —
  // they must agree, or the recovery link sends people to the wrong person.
  assert(!isAddressComplete(undefined), 'No address counted as complete.');
  assert(!isAddressComplete({ line1: '9 Bishop Aboyade', city: '', countryCode: '' }), 'A partial address counted as complete.');
  assert(isAddressComplete(GOOD_ADDRESS), 'A complete address was marked incomplete.');

  // And the queue flag agrees with it for the same people.
  const withAddr = person({ id: 'p1', deliveryAddress: GOOD_ADDRESS });
  const without = person({ id: 'p2' });
  const partial = person({ id: 'p3', deliveryAddress: { line1: '9 Bishop', city: '', countryCode: '' } });
  for (const [p, expected] of [[withAddr, true], [without, false], [partial, false]] as const) {
    const { repo } = repoWithMoment([p]);
    const r = loadBriefQueue({ readWorkspace: () => queueWorkspace([p]) as never, repository: repo });
    assert(r.status === 'ok', 'Queue read failed.');
    if (r.status === 'ok') {
      assertEqual(r.waiting[0].hasAddress, expected, `Wrong address flag for ${p.id}.`);
    }
  }
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
console.log('Execution Brief validation passed.\n');
