/**
 * Deterministic validation for H3.1 — the operational foundation.
 *
 * Run with:  npm run validate:operations
 *
 * Covers ADR-010 (persistence boundary), ADR-006 (Decisions and Operational
 * Events), and Campaign Moment generation. Storage is injected, so the
 * atomicity and idempotency guarantees are proven rather than assumed.
 */

import { CURRENT_WORKSPACE_SCHEMA_VERSION, WORKSPACE_KEY } from '../lib/migrations';
import { createWorkspace } from '../lib/workspace';
import type {
  Money,
  PolicyAssignment,
  Person,
  Program,
  RecognitionPolicy,
  RelationshipClass,
} from '../lib/workspace';
import { createCampaignDraft, activateCampaign } from '../lib/programs';
import {
  CURRENT_OPERATIONS_SCHEMA_VERSION,
  OPERATIONS_KEY,
  OPERATIONS_QUARANTINE_KEY,
  campaignSourceKey,
  emptyOperationsState,
  migrateOperationsState,
  validateOperationsState,
} from '../lib/operations/types';
import type { OperationsState, PolicyResolutionSnapshot } from '../lib/operations/types';
import { createLocalOperationsRepository } from '../lib/operations/local-store';
import type { GenerationContext } from '../lib/operations/generation';
import { assessPerson, buildCancellation, buildMomentBatch, previewPreparation } from '../lib/operations/generation';
import type { ConfirmationDeps } from '../lib/operations/confirmation';
import { fingerprintPreview, loadLiveContext, revalidateForConfirmation } from '../lib/operations/confirmation';

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
  return {
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => { data.set(key, value); },
    keys: (): string[] => [...data.keys()],
  };
}

function withoutDeliveryContext(snapshot: PolicyResolutionSnapshot): PolicyResolutionSnapshot {
  const legacy = { ...snapshot };
  delete legacy.deliveryRequirement;
  delete legacy.preferredDeliveryWindow;
  delete legacy.signatureRequired;
  delete legacy.proofRequired;
  return legacy;
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
};

function ngn(major: number): Money { return { amountMinor: major * 100, currency: 'NGN' }; }
function kes(major: number): Money { return { amountMinor: major * 100, currency: 'KES' }; }

function cls(id: string, name: string, isActive = true): RelationshipClass {
  return { id, name, type: 'Employee', level: 0, description: '', isDefault: false, isActive, createdAt: T0, updatedAt: T0 };
}

function policy(id: string, name: string, status: RecognitionPolicy['status'], budget: Money, occasion = 'Birthday'): RecognitionPolicy {
  return {
    id, workspaceId: WS, name, description: '',
    recognitionRules: [{ momentType: occasion, budgetPerPerson: budget, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status, version: 4,
    createdAt: T0, updatedAt: T0, ...(status === 'Published' ? { publishedAt: T0 } : {}),
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
    firstName: 'Ada', lastName: over.id, relationshipClassIds: ['class-exec'],
    sourceId: 'source-1', sourceType: 'Manual', status: 'Active',
    createdAt: T0, updatedAt: T0, ...over,
  };
}

const CLASSES = [cls('class-exec', 'Executive Leadership'), cls('class-off', 'Retired', false)];
const POLICIES = [
  policy('policy-global', 'Global Recognition', 'Published', ngn(50_000)),
  policy('policy-ke', 'Kenya Recognition', 'Published', kes(20_000)),
];
const ASSIGNMENTS = [
  assignment({ id: 'a-global', recognitionPolicyId: 'policy-global' }),
  assignment({ id: 'a-ke', recognitionPolicyId: 'policy-ke', countryCode: 'KE', priority: 1 }),
];

function activeCampaign(personIds: string[], over: Partial<Program> = {}): Program {
  const draft = createCampaignDraft(
    {
      name: 'December appreciation', relationshipClassId: 'class-exec', occasionType: 'Birthday',
      campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
      budgetEnvelopes: [ngn(1_000_000), kes(1_000_000)],
    },
    T0, 'program-1',
  );
  return {
    ...draft, status: 'Active', activatedAt: T0,
    frozenPopulation: { personIds, frozenAt: T0 },
    ...over,
  };
}

function context(people: Person[], over: Partial<GenerationContext> = {}): GenerationContext {
  return {
    workspaceId: WS,
    program: activeCampaign(people.map(p => p.id)),
    people,
    classes: CLASSES,
    assignments: ASSIGNMENTS,
    policies: POLICIES,
    existingSourceKeys: new Map(),
    now: NOW,
    ...over,
  };
}

/** A repository with initialised, empty state. */
function freshRepo(workspaceId = WS) {
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(workspaceId, NOW);
  return { repo, storage };
}

console.log('\nOperational foundation (H3.1) — validation\n');

// ─── Part 1: persistence boundary ────────────────────────────────────────────

check('1. OperationsState initialises separately from WorkspaceState', () => {
  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);

  const init = repo.initialise(WS, NOW);
  assert(init.ok, `Initialise failed: ${init.ok ? '' : init.reason}`);
  assertEqual(storage.keys().length, 1, 'Expected exactly one storage key.');
  assertEqual(storage.keys()[0], OPERATIONS_KEY, 'Operations wrote to the wrong key.');
  const opsKey: string = OPERATIONS_KEY;
  const wsKey: string = WORKSPACE_KEY;
  assert(opsKey !== wsKey, 'Operations shares a key with the workspace.');

  // The workspace document is untouched by anything Operations does.
  assertEqual(storage.getItem(WORKSPACE_KEY), null, 'Operations wrote into the workspace key.');
});

check('2. The workspace document holds no operational collection', () => {
  const ws = createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
  assertEqual(
    ws.schemaVersion,
    CURRENT_WORKSPACE_SCHEMA_VERSION,
    'A new workspace is not at the current schema version.',
  );
  // ADR-010 — no operational collection may ever leak into the customer document.
  for (const forbidden of ['moments', 'decisions', 'events', 'executionBriefs']) {
    assert(!(forbidden in ws), `WorkspaceState gained an operational collection: ${forbidden}.`);
  }
});

check('3. OperationsState versions independently of the workspace', () => {
  const state = emptyOperationsState(WS, NOW);
  assertEqual(
    state.schemaVersion,
    CURRENT_OPERATIONS_SCHEMA_VERSION,
    'Empty state has the wrong schema version.',
  );
  const opsVersion: number = CURRENT_OPERATIONS_SCHEMA_VERSION;
  const wsVersion: number = CURRENT_WORKSPACE_SCHEMA_VERSION;
  assert(opsVersion !== wsVersion, 'The two schema versions are coupled; they must move independently.');
});

check('4. OperationsState cannot silently attach to another workspace', () => {
  const foreign = JSON.stringify(emptyOperationsState('org-somebody-else', T0));
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: foreign });
  const repo = createLocalOperationsRepository(storage);

  const loaded = repo.load(WS);
  assertEqual(loaded.ok, false, 'A foreign workspace payload was adopted.');
  if (!loaded.ok) assert(loaded.reason.includes('org-somebody-else'), 'The refusal does not name the foreign workspace.');

  // It is preserved, never overwritten — it is another organization's history.
  assertEqual(storage.getItem(OPERATIONS_KEY), foreign, 'The foreign payload was overwritten.');
  assertEqual(storage.getItem(OPERATIONS_QUARANTINE_KEY), foreign, 'The foreign payload was not set aside.');

  const init = repo.initialise(WS, NOW);
  assertEqual(init.ok, false, 'Initialise replaced a foreign payload.');
  assertEqual(storage.getItem(OPERATIONS_KEY), foreign, 'Initialise overwrote the foreign payload.');
});

check('5. Invalid stored operations data is preserved and refused safely', () => {
  for (const bad of ['{not json', 'null', '[]', '{}', '{"schemaVersion":99,"workspaceId":"org-1"}']) {
    const storage = createMemoryStorage({ [OPERATIONS_KEY]: bad });
    const repo = createLocalOperationsRepository(storage);
    const loaded = repo.load(WS);
    assertEqual(loaded.ok, false, `Payload ${bad} was accepted.`);
    assertEqual(storage.getItem(OPERATIONS_KEY), bad, `Payload ${bad} was overwritten.`);
  }

  // Quarantine is written once, not on every failing read.
  const storage = createMemoryStorage({ [OPERATIONS_KEY]: '{not json' });
  const repo = createLocalOperationsRepository(storage);
  repo.load(WS); repo.load(WS); repo.load(WS);
  assertEqual(storage.keys().length, 2, 'Repeated failing reads created extra quarantine copies.');
});

// ─── Part 2: eligibility ─────────────────────────────────────────────────────

check('6. An active frozen person with valid resolution creates ReadyForExecution', () => {
  const people = [person({ id: 'p1', country: 'NG' })];
  const assessment = assessPerson('p1', context(people));
  assertEqual(assessment.status, 'ReadyForExecution', 'A valid person is not ready.');
  assertEqual(assessment.issues.length, 0, 'A valid person has issues.');
  assert(assessment.resolution, 'A valid person has no resolution snapshot.');
});

check('7. An Inactive frozen person creates NeedsReview', () => {
  const people = [person({ id: 'p1', country: 'NG', status: 'Inactive' })];
  const assessment = assessPerson('p1', context(people));
  assertEqual(assessment.status, 'NeedsReview', 'A paused person was marked ready.');
  assert(assessment.issues.some(i => i.code === 'person-inactive'), 'The paused issue was not recorded.');
  // Not silently skipped — the assessment exists.
  assertEqual(previewPreparation(context(people)).pending.length, 1, 'A paused person was dropped.');
});

check('8. An Archived frozen person creates NeedsReview', () => {
  const people = [person({ id: 'p1', country: 'NG', status: 'Archived', archivedAt: T0 })];
  const assessment = assessPerson('p1', context(people));
  assertEqual(assessment.status, 'NeedsReview', 'An archived person was marked ready.');
  assert(assessment.issues.some(i => i.code === 'person-archived'), 'The archived issue was not recorded.');
});

check('9. A missing frozen person creates NeedsReview', () => {
  const ctx = context([], { program: activeCampaign(['p-gone']) });
  const assessment = assessPerson('p-gone', ctx);
  assertEqual(assessment.status, 'NeedsReview', 'A missing person was marked ready.');
  assert(assessment.issues.some(i => i.code === 'person-missing'), 'The missing-person issue was not recorded.');
  assertEqual(previewPreparation(ctx).pending.length, 1, 'A missing person was silently skipped.');
});

check('10. An inactive group creates NeedsReview', () => {
  const people = [person({ id: 'p1', country: 'NG' })];
  const ctx = context(people, { classes: [cls('class-exec', 'Executive Leadership', false)] });
  const assessment = assessPerson('p1', ctx);
  assertEqual(assessment.status, 'NeedsReview', 'An inactive group produced a ready moment.');
  assert(assessment.issues.some(i => i.code === 'group-inactive'), 'The inactive-group issue was not recorded.');

  // A missing group too.
  const missing = assessPerson('p1', context(people, { classes: [] }));
  assert(missing.issues.some(i => i.code === 'group-missing'), 'The missing-group issue was not recorded.');
});

check('11. A missing country creates NeedsReview when the group has country rules', () => {
  const people = [person({ id: 'p1', country: undefined })];
  const assessment = assessPerson('p1', context(people));
  assertEqual(assessment.status, 'NeedsReview', 'A person with no country was marked ready.');
  assert(assessment.issues.some(i => i.code === 'country-missing'), 'The missing-country issue was not recorded.');

  // With no country-scoped assignment, a missing country is not a problem.
  const globalOnly = assessPerson('p1', context(people, {
    assignments: [assignment({ id: 'a-global', recognitionPolicyId: 'policy-global' })],
  }));
  assertEqual(globalOnly.status, 'ReadyForExecution', 'A missing country blocked a global-only group.');
});

check('12. No executable assignment creates NeedsReview', () => {
  const people = [person({ id: 'p1', country: 'NG' })];
  const assessment = assessPerson('p1', context(people, { assignments: [] }));
  assertEqual(assessment.status, 'NeedsReview', 'A person with no assignment was marked ready.');
  assert(assessment.issues.some(i => i.code === 'no-executable-assignment'), 'The missing-assignment issue was not recorded.');
  assertEqual(assessment.resolution, undefined, 'A resolution was produced with no assignment.');

  // An archived policy is equally not executable.
  const archived = assessPerson('p1', context(people, {
    policies: POLICIES.map(p => ({ ...p, status: 'Archived' as const })),
  }));
  assert(archived.issues.some(i => i.code === 'no-executable-assignment'), 'An archived policy resolved.');
});

check('13. A missing occasion rule creates NeedsReview', () => {
  const people = [person({ id: 'p1', country: 'NG' })];
  const ctx = context(people, {
    program: activeCampaign(['p1'], { occasionType: 'Farewell' }),
  });
  const assessment = assessPerson('p1', ctx);
  assertEqual(assessment.status, 'NeedsReview', 'A missing occasion rule produced a ready moment.');
  assert(assessment.issues.some(i => i.code === 'no-occasion-rule'), 'The missing-rule issue was not recorded.');
  assert(assessment.issues.some(i => i.href === '/workspace/policies'), 'No route to the fix was offered.');
});

// ─── Part 3: snapshots ───────────────────────────────────────────────────────

check('14. Successful resolution snapshots assignment, policy version, rule, Money and delivery promises', () => {
  const people = [person({ id: 'p1', country: 'KE' })];
  const kenyaPolicy: RecognitionPolicy = {
    ...POLICIES[1],
    deliveryRequirement: 'HandDelivered',
    preferredDeliveryWindow: 'Two business days before the occasion',
    signatureRequired: true,
    proofRequired: true,
  };
  const assessment = assessPerson('p1', context(people, {
    policies: [POLICIES[0], kenyaPolicy],
  }));
  const snapshot = assessment.resolution;
  assert(snapshot, 'No resolution snapshot.');

  assertEqual(snapshot.policyAssignmentId, 'a-ke', 'The wrong assignment was snapshotted.');
  assertEqual(snapshot.policyId, 'policy-ke', 'The wrong policy was snapshotted.');
  assertEqual(snapshot.policyName, 'Kenya Recognition', 'The policy name was not captured.');
  assertEqual(snapshot.policyVersion, 4, 'The policy version was not captured.');
  assertEqual(snapshot.resolvedCountryScope, 'KE', 'The country scope was not captured.');
  assertEqual(snapshot.occasionType, 'Birthday', 'The occasion was not captured.');
  assertEqual(snapshot.approvedRecognitionBudget.amountMinor, 2_000_000, 'The budget is wrong.');
  assertEqual(snapshot.approvedRecognitionBudget.currency, 'KES', 'The currency is wrong.');
  assertEqual(snapshot.deliveryRequirement, 'HandDelivered', 'The delivery requirement was not captured.');
  assertEqual(
    snapshot.preferredDeliveryWindow,
    'Two business days before the occasion',
    'The delivery window was not captured.',
  );
  assertEqual(snapshot.signatureRequired, true, 'The signature promise was not captured.');
  assertEqual(snapshot.proofRequired, true, 'The proof promise was not captured.');
  assertEqual(snapshot.resolvedAt, NOW, 'The resolution timestamp was not captured.');
});

check('15. A Moment snapshot does not duplicate full Person or Policy records', () => {
  const people = [person({ id: 'p1', country: 'NG', email: 'a@x.example', role: 'CEO' })];
  const batch = buildMomentBatch(context(people), ids);
  const moment = batch.moments[0];

  // Recipient: only the operational subset.
  assertEqual(
    Object.keys(moment.recipientSnapshot).sort().join(','),
    'country,email,firstName,lastName,phone,role',
    'The recipient snapshot has the wrong shape.',
  );
  const serialized = JSON.stringify(moment);
  assert(!serialized.includes('relationshipClassIds'), 'The whole Person record was copied.');
  assert(!serialized.includes('sourceType'), 'Person provenance was copied.');
  assert(!serialized.includes('recognitionRules'), 'The whole Policy was copied.');
  assert(!serialized.includes('approvalWorkflow'), 'Policy configuration was copied.');

  // Group snapshot: identity and display only.
  assertEqual(
    Object.keys(moment.relationshipGroupSnapshot).sort().join(','),
    'level,name,relationshipClassId,type',
    'The group snapshot has the wrong shape.',
  );
});

// ─── Part 4: Decisions and Events ────────────────────────────────────────────

check('16. Every Moment receives a MomentQualification Decision', () => {
  const people = [
    person({ id: 'p1', country: 'NG' }),
    person({ id: 'p2', country: 'NG', status: 'Inactive' }),
  ];
  const batch = buildMomentBatch(context(people), ids);
  assertEqual(batch.moments.length, 2, 'Wrong moment count.');

  for (const moment of batch.moments) {
    const qualifications = batch.decisions.filter(
      d => d.momentId === moment.id && d.decisionType === 'MomentQualification',
    );
    assertEqual(qualifications.length, 1, `Moment ${moment.id} has ${qualifications.length} qualification decisions.`);
    assertEqual(qualifications[0].status, 'Confirmed', 'The qualification is not Confirmed.');
    assertEqual(qualifications[0].provider, 'RuleEngine', 'The qualification has the wrong provider.');
  }
});

check('17. Successful resolution receives a PolicyResolution Decision', () => {
  const people = [
    person({ id: 'p1', country: 'NG' }),
    person({ id: 'p2', country: 'NG', status: 'Inactive' }),
  ];
  const batch = buildMomentBatch(context(people), ids);

  const ready = batch.moments.find(m => m.status === 'ReadyForExecution')!;
  const blocked = batch.moments.find(m => m.status === 'NeedsReview')!;

  const readyResolutions = batch.decisions.filter(d => d.momentId === ready.id && d.decisionType === 'PolicyResolution');
  assertEqual(readyResolutions.length, 1, 'A ready moment has no policy-resolution decision.');
  assertEqual(readyResolutions[0].provider, 'RuleEngine', 'Policy resolution is not attributed to the rule engine.');
  assert(readyResolutions[0].inputs.candidateAssignmentIds, 'The candidates considered were not recorded.');
  assert(readyResolutions[0].reason.length > 0, 'The precedence reason is empty.');

  // A paused person still resolves a policy, so this one is present too —
  // the qualification decision is what marks them NeedsReview.
  const blockedQual = batch.decisions.filter(d => d.momentId === blocked.id && d.decisionType === 'MomentQualification');
  assertEqual(blockedQual.length, 1, 'The blocked moment has no qualification decision.');
});

check('18. The qualification Decision explains Ready versus NeedsReview', () => {
  const ready = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  const readyDecision = ready.decisions.find(d => d.decisionType === 'MomentQualification')!;
  assertEqual(readyDecision.finalDecision, 'ReadyForExecution', 'The outcome was not recorded.');
  assert(readyDecision.reason.includes('Birthday'), 'The reason does not mention the occasion.');

  const blocked = buildMomentBatch(context([person({ id: 'p2', country: 'NG', status: 'Archived', archivedAt: T0 })]), ids);
  const blockedDecision = blocked.decisions.find(d => d.decisionType === 'MomentQualification')!;
  assertEqual(blockedDecision.finalDecision, 'NeedsReview', 'The outcome was not recorded.');
  assert(blockedDecision.reason.includes('archived'), 'The reason does not explain the block.');
  assert(Array.isArray(blockedDecision.inputs.issueCodes), 'The issue codes were not recorded as inputs.');
});

check('19. A MomentCreated Event is appended for every Moment', () => {
  const people = [person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'KE' })];
  const batch = buildMomentBatch(context(people), ids);

  for (const moment of batch.moments) {
    const created = batch.events.filter(e => e.momentId === moment.id && e.eventType === 'MomentCreated');
    assertEqual(created.length, 1, `Moment ${moment.id} has ${created.length} creation events.`);
    assertEqual(created[0].actorType, 'Operator', 'Creation was not attributed to the operator.');
    assert(created[0].occurredAt && created[0].recordedAt, 'Timestamps are missing.');
  }
});

check('20. The readiness Event matches the Moment status', () => {
  const people = [
    person({ id: 'p1', country: 'NG' }),
    person({ id: 'p2', country: 'NG', status: 'Inactive' }),
  ];
  const batch = buildMomentBatch(context(people), ids);

  for (const moment of batch.moments) {
    const expected = moment.status === 'ReadyForExecution' ? 'MomentMarkedReady' : 'MomentNeedsReview';
    const events = batch.events.filter(e => e.momentId === moment.id && e.eventType === expected);
    assertEqual(events.length, 1, `Moment ${moment.id} is missing its ${expected} event.`);
    assertEqual(events[0].actorType, 'System', 'The readiness event is not attributed to the system.');
  }
});

check('21. Events are append-only', () => {
  const { repo } = freshRepo();
  const batch = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  repo.createMoments(WS, batch, NOW);

  const before = repo.load(WS);
  assert(before.ok && before.value, 'Load failed.');
  const originalEvents = JSON.stringify(before.value.events);

  // Appending never rewrites what is there.
  const extra = { ...batch.events[0], id: 'event-extra', eventType: 'MomentNeedsReview' as const };
  const appended = repo.appendEvent(WS, extra);
  assert(appended.ok, 'Append failed.');

  const after = repo.load(WS);
  assert(after.ok && after.value, 'Load failed.');
  assertEqual(after.value.events.length, before.value.events.length + 1, 'The append did not add exactly one event.');
  assertEqual(
    JSON.stringify(after.value.events.slice(0, before.value.events.length)),
    originalEvents,
    'Existing events were modified by an append.',
  );

  // The same event id cannot be recorded twice.
  assertEqual(repo.appendEvent(WS, extra).ok, false, 'A duplicate event id was accepted.');
});

check('22. Decisions are immutable except for supersession metadata', () => {
  const { repo } = freshRepo();
  const batch = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  repo.createMoments(WS, batch, NOW);

  const original = batch.decisions[0];
  const superseded = repo.supersedeDecision(WS, original.id, 'decision-replacement', NOW);
  assert(superseded.ok, `Supersede failed: ${superseded.ok ? '' : superseded.reason}`);

  // Everything except the supersession fields is byte-identical.
  const { status: _s, supersededAt: _a, supersededByDecisionId: _b, ...restAfter } = superseded.value;
  const { status: _s2, supersededAt: _a2, supersededByDecisionId: _b2, ...restBefore } = original;
  assertEqual(JSON.stringify(restAfter), JSON.stringify(restBefore), 'Decision content was rewritten.');
  assertEqual(superseded.value.status, 'Superseded', 'The status did not change.');
  assertEqual(superseded.value.supersededByDecisionId, 'decision-replacement', 'The replacement was not recorded.');

  // A decision cannot be superseded twice.
  assertEqual(repo.supersedeDecision(WS, original.id, 'decision-other', NOW).ok, false, 'A decision was superseded twice.');
});

// ─── Part 5: atomic confirmation and idempotency ─────────────────────────────

check('23. Browsing a preview creates no operational records', () => {
  const { repo, storage } = freshRepo();
  const before = storage.getItem(OPERATIONS_KEY);

  const ctx = context([person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'KE' })]);
  previewPreparation(ctx);
  previewPreparation(ctx);
  buildMomentBatch(ctx, ids); // building is not committing

  assertEqual(storage.getItem(OPERATIONS_KEY), before, 'Previewing wrote operational records.');
  const state = repo.load(WS);
  assert(state.ok && state.value, 'Load failed.');
  assertEqual(state.value.moments.length, 0, 'A preview created moments.');
  assertEqual(state.value.decisions.length, 0, 'A preview created decisions.');
  assertEqual(state.value.events.length, 0, 'A preview created events.');
});

check('24. Confirmation writes Moments, Decisions and Events together', () => {
  const { repo } = freshRepo();
  const ctx = context([person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'KE' })]);
  const batch = buildMomentBatch(ctx, ids);

  const written = repo.createMoments(WS, batch, NOW);
  assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Load failed.');
  assertEqual(state.value.moments.length, 2, 'Wrong moment count.');
  assertEqual(state.value.decisions.length, batch.decisions.length, 'Decisions were not committed with the moments.');
  assertEqual(state.value.events.length, batch.events.length, 'Events were not committed with the moments.');

  // Every decision and event points at a committed moment.
  const momentIds = new Set(state.value.moments.map(m => m.id));
  for (const d of state.value.decisions) assert(momentIds.has(d.momentId), 'An orphan decision was committed.');
  for (const e of state.value.events) assert(momentIds.has(e.momentId), 'An orphan event was committed.');
});

check('25. A batch that fails validation commits nothing', () => {
  const { repo, storage } = freshRepo();
  const good = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  repo.createMoments(WS, good, NOW);
  const afterGood = storage.getItem(OPERATIONS_KEY);

  // A batch whose decision references a moment that is not in the batch.
  const bad = buildMomentBatch(context([person({ id: 'p2', country: 'NG' })]), ids);
  const broken = {
    ...bad,
    decisions: bad.decisions.map(d => ({ ...d, momentId: 'moment-does-not-exist' })),
  };
  const result = repo.createMoments(WS, broken, NOW);
  assertEqual(result.ok, false, 'An invalid batch was committed.');
  assertEqual(storage.getItem(OPERATIONS_KEY), afterGood, 'A failed batch left partial state.');

  // A batch with a decision that has no reason (ADR-006 requires one).
  const noReason = { ...bad, decisions: bad.decisions.map(d => ({ ...d, reason: '' })) };
  assertEqual(repo.createMoments(WS, noReason, NOW).ok, false, 'A reasonless decision was committed.');
  assertEqual(storage.getItem(OPERATIONS_KEY), afterGood, 'A failed batch left partial state.');
});

check('26. Repeated generation does not duplicate Moments', () => {
  const { repo } = freshRepo();
  const people = [person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'KE' })];

  const first = buildMomentBatch(context(people), ids);
  assert(repo.createMoments(WS, first, NOW).ok, 'First commit failed.');

  // A second run, unaware of the first, is refused whole.
  const naive = buildMomentBatch(context(people), ids);
  assertEqual(repo.createMoments(WS, naive, NOW).ok, false, 'A duplicate batch was committed.');

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Load failed.');
  assertEqual(state.value.moments.length, 2, 'Duplicate moments were created.');
});

check('27. Refresh and retry report already-prepared records', () => {
  const { repo } = freshRepo();
  const people = [person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'KE' })];

  repo.createMoments(WS, buildMomentBatch(context(people), ids), NOW);

  // The UI rebuilds its context from the store — the correct retry path.
  const listed = repo.listMoments(WS);
  assert(listed.ok, 'List failed.');
  const existingSourceKeys = new Map(listed.value.map(m => [m.sourceKey, m.id]));

  const retry = previewPreparation(context(people, { existingSourceKeys }));
  assertEqual(retry.alreadyPrepared.length, 2, 'Already-prepared records were not reported.');
  assertEqual(retry.pending.length, 0, 'Already-prepared records were queued again.');

  const emptyBatch = buildMomentBatch(context(people, { existingSourceKeys }), ids);
  assertEqual(emptyBatch.moments.length, 0, 'A retry produced duplicate moments.');

  // Source keys are deterministic — the property the whole guarantee rests on.
  assertEqual(
    campaignSourceKey(WS, 'program-1', 'p1', 'Birthday'),
    campaignSourceKey(WS, 'program-1', 'p1', 'Birthday'),
    'Source keys are not deterministic.',
  );
  assert(
    campaignSourceKey(WS, 'program-1', 'p1', 'Birthday') !== campaignSourceKey(WS, 'program-1', 'p2', 'Birthday'),
    'Different people share a source key.',
  );
});

// ─── Part 6: currency and cancellation ───────────────────────────────────────

check('28. Two countries may snapshot different policies and currencies', () => {
  const people = [person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'KE' })];
  const batch = buildMomentBatch(context(people), ids);

  const ng = batch.moments.find(m => m.recipientSnapshot.country === 'NG')!;
  const ke = batch.moments.find(m => m.recipientSnapshot.country === 'KE')!;

  assertEqual(ng.policyResolutionSnapshot?.policyId, 'policy-global', 'The Nigerian moment resolved wrongly.');
  assertEqual(ke.policyResolutionSnapshot?.policyId, 'policy-ke', 'The Kenyan moment resolved wrongly.');
  assertEqual(ng.policyResolutionSnapshot?.approvedRecognitionBudget.currency, 'NGN', 'Wrong NGN currency.');
  assertEqual(ke.policyResolutionSnapshot?.approvedRecognitionBudget.currency, 'KES', 'Wrong KES currency.');
  assertEqual(ng.policyResolutionSnapshot?.resolvedCountryScope, 'Global', 'Wrong NG scope.');
  assertEqual(ke.policyResolutionSnapshot?.resolvedCountryScope, 'KE', 'Wrong KE scope.');
});

check('29. Currencies are not added together', () => {
  const people = [
    person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'NG' }),
    person({ id: 'p3', country: 'KE' }),
  ];
  const preview = previewPreparation(context(people));

  assertEqual(preview.byCurrency.length, 2, 'Expected two currency groups.');
  const ngn = preview.byCurrency.find(c => c.currency === 'NGN')!;
  const kesTotal = preview.byCurrency.find(c => c.currency === 'KES')!;
  assertEqual(ngn.totalMinor, 10_000_000, 'Wrong NGN total.');
  assertEqual(ngn.peopleCount, 2, 'Wrong NGN people count.');
  assertEqual(kesTotal.totalMinor, 2_000_000, 'Wrong KES total.');

  // No grand total exists on the preview.
  assert(!('total' in preview), 'The preview exposes a cross-currency grand total.');
  assert(!('totalMinor' in preview), 'The preview exposes a cross-currency grand total.');
});

check('30. Cancellation requires a reason', () => {
  const batch = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  const moment = batch.moments[0];

  for (const empty of ['', '   ', '\n']) {
    const result = buildCancellation(moment, empty, NOW, ids);
    assertEqual(result.ok, false, `Cancellation was allowed with reason "${empty}".`);
  }

  const good = buildCancellation(moment, '  Recipient left the organization  ', NOW, ids);
  assert(good.ok, 'A valid cancellation was refused.');
  assertEqual(good.value.decision.reason, 'Recipient left the organization', 'The reason was not trimmed and stored.');

  assertEqual(
    buildCancellation({ ...moment, status: 'Cancelled' }, 'again', NOW, ids).ok,
    false,
    'An already-cancelled moment was cancelled again.',
  );
});

check('31. Cancellation appends the correct Decision and Event', () => {
  const { repo } = freshRepo();
  const batch = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  repo.createMoments(WS, batch, NOW);
  const moment = batch.moments[0];

  const built = buildCancellation(moment, 'Recipient left', NOW, ids, 'operator-1');
  assert(built.ok, 'Cancellation build failed.');

  assertEqual(built.value.decision.decisionType, 'MomentCancellation', 'Wrong decision type.');
  assertEqual(built.value.decision.provider, 'HumanOperator', 'Cancellation is not attributed to a human.');
  assertEqual(built.value.decision.status, 'Confirmed', 'The cancellation decision is not Confirmed.');
  assertEqual(built.value.event.eventType, 'MomentCancelled', 'Wrong event type.');
  assertEqual(built.value.event.actorType, 'Operator', 'The cancellation event is not attributed to the operator.');

  assert(repo.updateMomentStatus(WS, moment.id, 'Cancelled', NOW, { cancelledAt: NOW }).ok, 'Status update failed.');
  assert(repo.appendDecision(WS, built.value.decision).ok, 'Decision append failed.');
  assert(repo.appendEvent(WS, built.value.event).ok, 'Event append failed.');

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Load failed.');
  assertEqual(state.value.moments[0].status, 'Cancelled', 'The moment was not cancelled.');
  assertEqual(state.value.moments[0].cancelledAt, NOW, 'The cancellation timestamp was not stamped.');
  assert(state.value.decisions.some(d => d.decisionType === 'MomentCancellation'), 'The decision was not stored.');
  assert(state.value.events.some(e => e.eventType === 'MomentCancelled'), 'The event was not stored.');

  // A cancelled moment cannot change status again.
  assertEqual(repo.updateMomentStatus(WS, moment.id, 'ReadyForExecution', NOW).ok, false, 'A cancelled moment was revived.');
});

check('32. Workspace configuration is never modified by Operations', () => {
  const workspace = createWorkspace({
    companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
    contactRole: 'Head of People', phone: '',
  });
  const before = JSON.stringify(workspace);

  const storage = createMemoryStorage({ [WORKSPACE_KEY]: before });
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(WS, NOW);

  const people = [person({ id: 'p1', country: 'NG' })];
  const ctx = context(people);
  const batch = buildMomentBatch(ctx, ids);
  repo.createMoments(WS, batch, NOW);
  repo.appendEvent(WS, { ...batch.events[0], id: 'event-extra' });

  assertEqual(storage.getItem(WORKSPACE_KEY), before, 'Operations modified the workspace document.');

  // Generation is pure — it does not mutate its inputs either.
  assertEqual(JSON.stringify(ctx.people), JSON.stringify(people), 'Generation mutated the people it was given.');
  assertEqual(ctx.policies[0].version, 4, 'Generation mutated a policy.');
});

// ─── Supporting cases ────────────────────────────────────────────────────────

check('33. A ready Moment must carry a resolution snapshot', () => {
  const state: OperationsState = {
    ...emptyOperationsState(WS, NOW),
    moments: [{
      id: 'm1', workspaceId: WS, programId: 'program-1', personId: 'p1',
      relationshipClassId: 'class-exec', occasionType: 'Birthday', targetDate: '2026-12-01',
      status: 'ReadyForExecution', sourceKey: 'k1',
      recipientSnapshot: { firstName: 'Ada', lastName: 'Obi' },
      relationshipGroupSnapshot: { relationshipClassId: 'class-exec', name: 'Exec', type: 'Employee', level: 0 },
      issues: [], createdAt: NOW, updatedAt: NOW,
      // policyResolutionSnapshot deliberately absent
    }],
  };
  const result = validateOperationsState(state, WS);
  assertEqual(result.ok, false, 'A ready moment with no budget explanation was accepted.');
});

check('34. Duplicate source keys are refused at the state level', () => {
  const base = buildMomentBatch(context([person({ id: 'p1', country: 'NG' })]), ids);
  const state: OperationsState = {
    ...emptyOperationsState(WS, NOW),
    moments: [base.moments[0], { ...base.moments[0], id: 'moment-clone' }],
  };
  const result = validateOperationsState(state, WS);
  assertEqual(result.ok, false, 'Two moments with the same source key were accepted.');
});

check('35. An activated Campaign flows end to end into Moments', () => {
  // The full path: activate a campaign, then prepare it.
  const people = [
    person({ id: 'p1', country: 'NG' }),
    person({ id: 'p2', country: 'KE' }),
    person({ id: 'p3', country: 'NG', status: 'Inactive' }),
  ];
  const draft = createCampaignDraft(
    {
      name: 'December', relationshipClassId: 'class-exec', occasionType: 'Birthday',
      campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
      budgetEnvelopes: [ngn(1_000_000), kes(1_000_000)],
    },
    T0, 'program-flow',
  );
  const activated = activateCampaign(draft, {
    relationshipClassId: 'class-exec', occasionType: 'Birthday',
    people, classes: CLASSES, assignments: ASSIGNMENTS, policies: POLICIES,
  }, T0);
  assert(activated.ok, 'Campaign activation failed.');
  // The paused person was never frozen in.
  assertEqual(activated.program.frozenPopulation?.personIds.length, 2, 'Wrong frozen count.');

  const { repo } = freshRepo();
  const ctx = context(people, { program: activated.program });
  const batch = buildMomentBatch(ctx, ids);
  assert(repo.createMoments(WS, batch, NOW).ok, 'Commit failed.');

  const state = repo.load(WS);
  assert(state.ok && state.value, 'Load failed.');
  assertEqual(state.value.moments.length, 2, 'Wrong moment count.');
  assertEqual(state.value.moments.filter(m => m.status === 'ReadyForExecution').length, 2, 'Not every moment is ready.');
  assertEqual(validateOperationsState(state.value, WS).ok, true, 'The resulting state is invalid.');
});

// ─── Part 8: confirmation-time revalidation (H3.1-D1) ────────────────────────
//
// The defect: confirmation rebuilt the batch from the context captured at page
// load, so configuration edited in between was invisible. Every check below
// mutates live state *after* the preview and asserts that nothing stale is
// written.

/** A live workspace plus an operations repo, wired the way the browser wires them. */
function liveHarness(people: Person[], programOver: Partial<Program> = {}) {
  const workspace = {
    ...createWorkspace({
      companyName: 'Meridian', website: '', industry: 'Logistics', employeeCount: '11-50',
      operatingCountries: ['Nigeria'], contactName: 'Ada', contactEmail: 'a@x.example',
      contactRole: 'Head of People', phone: '',
    }),
    organizationId: WS,
    relationshipClasses: [...CLASSES],
    recognitionPolicies: [...POLICIES],
    policyAssignments: [...ASSIGNMENTS],
    people: [...people],
    programs: [{ ...activeCampaign(people.map(p => p.id)), ...programOver }],
  };

  const storage = createMemoryStorage();
  const repo = createLocalOperationsRepository(storage);
  repo.initialise(WS, NOW);

  const deps: ConfirmationDeps = {
    readWorkspace: () => workspace as never,
    repository: repo,
    now: () => NOW,
  };
  return { workspace, repo, storage, deps };
}

function previewNow(deps: ConfirmationDeps) {
  const live = loadLiveContext('program-1', deps);
  assert(live.ok, 'Fixture could not build a live context.');
  const preview = previewPreparation(live.context);
  return { preview, fingerprint: fingerprintPreview(preview) };
}

function confirmNow(deps: ConfirmationDeps, fingerprint: string) {
  return revalidateForConfirmation('program-1', fingerprint, deps, ids, 'operator-1');
}

/** Nothing at all was written to the operations store. */
function assertNothingWritten(repo: ReturnType<typeof createLocalOperationsRepository>) {
  const state = repo.load(WS);
  assert(state.ok && state.value, 'Operations state could not be read.');
  assertEqual(state.value!.moments.length, 0, 'Moments were written.');
  assertEqual(state.value!.decisions.length, 0, 'Decisions were written.');
  assertEqual(state.value!.events.length, 0, 'Events were written.');
}

check('36. A person turned Inactive after preview blocks the write and refreshes', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  workspace.people[0] = { ...workspace.people[0], status: 'Inactive' };

  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'changed', 'A stale confirmation was allowed.');
  assertNothingWritten(repo);
  if (result.status === 'changed') {
    assertEqual(result.preview.ready.length, 0, 'The refreshed preview still shows them ready.');
    assertEqual(result.preview.needsReview.length, 1, 'The refreshed preview does not flag them.');
  }
});

check('37. A person Archived after preview blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  workspace.people[0] = { ...workspace.people[0], status: 'Archived' };
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'changed', 'A stale confirmation was allowed.');
  assertNothingWritten(repo);
});

check('38. A group disabled after preview blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  workspace.relationshipClasses = [cls('class-exec', 'Executive Leadership', false)];
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'changed', 'A disabled group did not block confirmation.');
  assertNothingWritten(repo);
});

check('39. An assignment removed after preview blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  workspace.policyAssignments = [];
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'changed', 'A removed assignment did not block confirmation.');
  assertNothingWritten(repo);
});

check('40. A policy archived after preview blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  workspace.recognitionPolicies = [policy('policy-global', 'Global Recognition', 'Archived', ngn(50_000))];
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'changed', 'An archived policy did not block confirmation.');
  assertNothingWritten(repo);
});

check('41. A changed budget on the same policy blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  // Same policy, same version, one minor unit different. Material.
  workspace.recognitionPolicies = [policy('policy-global', 'Global Recognition', 'Published', { amountMinor: 5_000_001, currency: 'NGN' })];
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'changed', 'A budget change slipped through.');
  assertNothingWritten(repo);
});

check('42. A campaign made inactive after preview blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  workspace.programs[0] = { ...workspace.programs[0], status: 'Completed' };
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'failed', 'An inactive campaign was prepared.');
  if (result.status === 'failed') {
    assertEqual(result.code, 'program-inactive', 'Wrong failure code.');
    assert(result.recovery.length > 0, 'The refusal names no recovery.');
  }
  assertNothingWritten(repo);
});

check('43. A campaign removed after preview blocks the write', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);
  workspace.programs = [];
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'failed', 'A missing campaign was prepared.');
  if (result.status === 'failed') assertEqual(result.code, 'program-missing', 'Wrong failure code.');
  assertNothingWritten(repo);
});

check('44. A Moment appearing after preview is caught before the write', () => {
  const { repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  // Another surface prepares the same identity in between.
  const first = confirmNow(deps, fingerprint);
  assert(first.status === 'ready', 'The first confirmation was not ready.');
  if (first.status === 'ready') {
    assert(repo.createMoments(WS, first.batch, NOW).ok, 'The first commit failed.');
  }

  // The operator's stale second confirmation must not duplicate.
  const second = confirmNow(deps, fingerprint);
  assertEqual(second.status, 'changed', 'A duplicate confirmation was allowed through.');

  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  assertEqual(state.value!.moments.length, 1, 'A duplicate Moment was written.');
});

check('45. A workspace read failure at confirmation writes nothing and names the problem', () => {
  const { repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  const broken: ConfirmationDeps = { ...deps, readWorkspace: () => null };
  const result = revalidateForConfirmation('program-1', fingerprint, broken, ids, 'operator-1');

  assertEqual(result.status, 'failed', 'An unreadable workspace was not refused.');
  if (result.status === 'failed') {
    assertEqual(result.code, 'workspace-unreadable', 'Wrong failure code.');
    assert(result.message.length > 0 && result.recovery.length > 0, 'The failure explains nothing.');
  }
  assertNothingWritten(repo);
});

check('46. An operations read failure at confirmation writes nothing and names the problem', () => {
  const { deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  // Corrupt the stored payload the way a damaged browser store would.
  const badStorage = createMemoryStorage({ [OPERATIONS_KEY]: '{ not json' });
  const badRepo = createLocalOperationsRepository(badStorage);
  const broken: ConfirmationDeps = { ...deps, repository: badRepo };

  const result = revalidateForConfirmation('program-1', fingerprint, broken, ids, 'operator-1');
  assertEqual(result.status, 'failed', 'An unreadable operations store was not refused.');
  if (result.status === 'failed') {
    assertEqual(result.code, 'operations-unreadable', 'Wrong failure code.');
    assert(result.recovery.length > 0, 'The refusal names no recovery.');
  }
});

check('47. A refreshed preview can be confirmed on the second attempt', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  workspace.people[1] = { ...workspace.people[1], status: 'Inactive' };

  const blockedAttempt = confirmNow(deps, fingerprint);
  assertEqual(blockedAttempt.status, 'changed', 'The stale confirmation was not blocked.');
  assertNothingWritten(repo);

  // The operator reviews the refreshed figures and confirms again.
  assert(blockedAttempt.status === 'changed', 'Unreachable.');
  const second = confirmNow(deps, blockedAttempt.fingerprint);
  assert(second.status === 'ready', 'The reviewed confirmation was refused.');
  if (second.status === 'ready') {
    const written = repo.createMoments(WS, second.batch, NOW);
    assert(written.ok, `Commit failed: ${written.ok ? '' : written.reason}`);
    const state = repo.load(WS);
    assert(state.ok && state.value, 'State could not be read.');
    assertEqual(state.value!.moments.length, 2, 'Wrong number of Moments written.');
    // The person paused after preview must be recorded as NeedsReview, not Ready.
    const paused = state.value!.moments.find(m => m.personId === 'p2');
    assert(paused, 'The paused person got no Moment — nobody may be silently dropped.');
    assertEqual(paused!.status, 'NeedsReview', 'A stale ReadyForExecution Moment was written.');
  }
});

check('48. Unchanged live state commits the complete atomic batch', () => {
  const { repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  const result = confirmNow(deps, fingerprint);
  assert(result.status === 'ready', 'An unchanged confirmation was refused.');
  if (result.status === 'ready') {
    assertEqual(result.batch.moments.length, 2, 'Wrong Moment count.');
    const written = repo.createMoments(WS, result.batch, NOW);
    assert(written.ok, 'Commit failed.');
    const state = repo.load(WS);
    assert(state.ok && state.value, 'State could not be read.');
    assertEqual(state.value!.moments.length, 2, 'Moments missing.');
    assert(state.value!.decisions.length >= 4, 'Decisions missing.');
    assertEqual(state.value!.events.length, 4, 'Events missing.');
    for (const m of state.value!.moments) {
      assertEqual(m.status, 'ReadyForExecution', 'A ready person was not written as ready.');
    }
  }
});

check('49. The fingerprint ignores timestamps and record ids', () => {
  const { deps } = liveHarness([person({ id: 'p1', country: 'NG' })]);
  const a = previewNow(deps);

  // Same configuration, different instant.
  const later: ConfirmationDeps = { ...deps, now: () => '2027-01-01T00:00:00.000Z' };
  const b = previewNow(later);

  assertEqual(a.fingerprint, b.fingerprint, 'A later timestamp was reported as a material change.');
  // And confirming across that gap is allowed.
  assertEqual(confirmNow(later, a.fingerprint).status, 'ready', 'A pure time difference blocked confirmation.');
});

check('50. No partial records survive a refused confirmation', () => {
  const { workspace, repo, deps } = liveHarness([person({ id: 'p1', country: 'NG' }), person({ id: 'p2', country: 'NG' })]);
  const { fingerprint } = previewNow(deps);

  workspace.programs[0] = { ...workspace.programs[0], status: 'Archived' };
  const result = confirmNow(deps, fingerprint);
  assertEqual(result.status, 'failed', 'An archived campaign was prepared.');

  const state = repo.load(WS);
  assert(state.ok && state.value, 'State could not be read.');
  assertEqual(state.value!.moments.length, 0, 'Partial Moments survived.');
  assertEqual(state.value!.decisions.length, 0, 'Partial Decisions survived.');
  assertEqual(state.value!.events.length, 0, 'Partial Events survived.');
});

// ─── Part 9: policy delivery snapshot (OperationsState v6) ──────────────────

check('51. The v5 → v6 migration is a pure bump and does not backfill delivery promises', () => {
  const batch = buildMomentBatch(context([person({ id: 'p-legacy', country: 'NG' })]), ids);
  const current = batch.moments[0];
  const legacySnapshot = withoutDeliveryContext(current.policyResolutionSnapshot!);
  const legacyMoment = { ...current, policyResolutionSnapshot: legacySnapshot };
  const v5 = {
    ...emptyOperationsState(WS, NOW),
    schemaVersion: 5,
    moments: [legacyMoment],
    decisions: batch.decisions,
    events: batch.events,
    aFutureKey: { kept: true },
  };
  const beforeMoments = JSON.stringify(v5.moments);
  const beforeDecisions = JSON.stringify(v5.decisions);
  const beforeEvents = JSON.stringify(v5.events);

  const result = migrateOperationsState(JSON.parse(JSON.stringify(v5)));
  assert(result.status === 'migrated', 'A v5 payload was not migrated.');
  if (result.status !== 'migrated') return;
  assertEqual(result.state.schemaVersion, 6, 'The migration did not reach v6.');
  assertEqual(JSON.stringify(result.state.moments), beforeMoments, 'The migration rewrote a legacy Moment.');
  assertEqual(JSON.stringify(result.state.decisions), beforeDecisions, 'The migration rewrote Decisions.');
  assertEqual(JSON.stringify(result.state.events), beforeEvents, 'The migration rewrote Events.');
  assert(
    !('deliveryRequirement' in result.state.moments[0].policyResolutionSnapshot!),
    'The migration invented a delivery requirement.',
  );
  assert(
    !('preferredDeliveryWindow' in result.state.moments[0].policyResolutionSnapshot!),
    'The migration invented a delivery window.',
  );
  assert(
    !('signatureRequired' in result.state.moments[0].policyResolutionSnapshot!),
    'The migration invented a signature promise.',
  );
  assert(
    !('proofRequired' in result.state.moments[0].policyResolutionSnapshot!),
    'The migration invented a proof promise.',
  );
  assert(
    (result.state as unknown as Record<string, unknown>).aFutureKey !== undefined,
    'The migration dropped an unknown key.',
  );
  assertEqual(validateOperationsState(result.state, WS).ok, true, 'A migrated legacy Moment was rejected.');
});

check('52. A newly generated Moment captures all four delivery promises exactly', () => {
  const governed: RecognitionPolicy = {
    ...POLICIES[0],
    deliveryRequirement: 'Courier',
    preferredDeliveryWindow: '',
    signatureRequired: false,
    proofRequired: true,
  };
  const batch = buildMomentBatch(context([person({ id: 'p-new', country: 'NG' })], {
    policies: [governed, POLICIES[1]],
  }), ids);
  const snapshot = batch.moments[0].policyResolutionSnapshot;
  assert(snapshot, 'The new Moment has no policy snapshot.');
  assertEqual(snapshot.deliveryRequirement, 'Courier', 'The generated Moment has the wrong delivery requirement.');
  assertEqual(snapshot.preferredDeliveryWindow, '', 'An intentionally empty delivery window was not preserved.');
  assertEqual(snapshot.signatureRequired, false, 'A false signature promise was not preserved.');
  assertEqual(snapshot.proofRequired, true, 'A true proof promise was not preserved.');
});

check('53. Legacy absence is valid, but partial or malformed delivery context is refused', () => {
  const batch = buildMomentBatch(context([person({ id: 'p-shape', country: 'NG' })]), ids);
  const moment = batch.moments[0];
  const legacySnapshot = withoutDeliveryContext(moment.policyResolutionSnapshot!);
  const legacyState: OperationsState = {
    ...emptyOperationsState(WS, NOW),
    moments: [{ ...moment, policyResolutionSnapshot: legacySnapshot }],
  };
  assertEqual(validateOperationsState(legacyState, WS).ok, true, 'A legitimate pre-v6 snapshot was quarantined.');

  const partial: OperationsState = {
    ...emptyOperationsState(WS, NOW),
    moments: [{
      ...moment,
      policyResolutionSnapshot: { ...legacySnapshot, proofRequired: false },
    }],
  };
  assertEqual(validateOperationsState(partial, WS).ok, false, 'A partial delivery snapshot was accepted.');

  const malformed: OperationsState = {
    ...emptyOperationsState(WS, NOW),
    moments: [{
      ...moment,
      policyResolutionSnapshot: {
        ...moment.policyResolutionSnapshot!,
        deliveryRequirement: 'Teleport',
      } as never,
    }],
  };
  assertEqual(validateOperationsState(malformed, WS).ok, false, 'An invalid delivery requirement was accepted.');
});

check('54. Every delivery promise is material at confirmation time', () => {
  const changes: Array<[keyof RecognitionPolicy, unknown]> = [
    ['deliveryRequirement', 'Courier'],
    ['preferredDeliveryWindow', 'One day before the occasion'],
    ['signatureRequired', true],
    ['proofRequired', true],
  ];

  for (const [field, value] of changes) {
    const { workspace, repo, deps } = liveHarness([person({ id: `p-${field}`, country: 'NG' })]);
    const { fingerprint } = previewNow(deps);
    workspace.recognitionPolicies = workspace.recognitionPolicies.map(candidate =>
      candidate.id === 'policy-global' ? { ...candidate, [field]: value } : candidate
    );
    const result = confirmNow(deps, fingerprint);
    assertEqual(result.status, 'changed', `A ${String(field)} change slipped through confirmation.`);
    assertNothingWritten(repo);
  }
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Operations validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Operations validation passed.\n');
