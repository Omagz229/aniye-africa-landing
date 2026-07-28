/**
 * Deterministic validation for H2.6 — Campaign Programs (ADR-004), schema v6.
 *
 * Run with:  npm run validate:programs
 *
 * Three halves: the v5 → v6 migration and baseCurrency validation, the Campaign
 * population and policy-resolution preview, and activation with population
 * freezing.
 */

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_BACKUP_KEY_PREFIX,
  WORKSPACE_KEY,
  loadAndMigrateWorkspace,
  migrateWorkspace,
} from '../lib/migrations';
import { createWorkspace } from '../lib/workspace';
import type {
  Money,
  PolicyAssignment,
  Person,
  Program,
  RecognitionPolicy,
  RelationshipClass,
  WorkspaceState,
} from '../lib/workspace';
import {
  IMPLEMENTED_PROGRAM_MODES,
  activateCampaign,
  checkActivation,
  createCampaignDraft,
  findEnvelope,
  hasActiveProgram,
  isImplementedMode,
  previewAllocations,
  programPopulationCount,
  summarizePopulation,
  validateEnvelopes,
} from '../lib/programs';

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const T0 = '2026-07-01T00:00:00.000Z';
const NOW = '2026-08-01T00:00:00.000Z';

function ngn(major: number): Money { return { amountMinor: major * 100, currency: 'NGN' }; }
function kes(major: number): Money { return { amountMinor: major * 100, currency: 'KES' }; }

function cls(id: string, name: string, isActive = true): RelationshipClass {
  return { id, name, type: 'Employee', level: 0, description: '', isDefault: false, isActive, createdAt: T0, updatedAt: T0 };
}

function policy(id: string, name: string, status: RecognitionPolicy['status'], budget: Money, occasion = 'Birthday'): RecognitionPolicy {
  return {
    id, workspaceId: 'org-v5', name, description: '',
    recognitionRules: [{ momentType: occasion, budgetPerPerson: budget, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status, version: 1,
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

/** The standard scenario: one group, a global rule and a Kenya override. */
const CLASSES = [cls('class-exec', 'Executive Leadership'), cls('class-other', 'Managers'), cls('class-off', 'Retired', false)];
const POLICIES = [
  policy('policy-global', 'Global Recognition', 'Published', ngn(50_000)),
  policy('policy-ke', 'Kenya Recognition', 'Published', kes(20_000)),
  policy('policy-draft', 'Draft Recognition', 'Draft', ngn(10_000)),
];
const ASSIGNMENTS = [
  assignment({ id: 'a-global', recognitionPolicyId: 'policy-global' }),
  assignment({ id: 'a-ke', recognitionPolicyId: 'policy-ke', countryCode: 'KE', priority: 1 }),
];
const PEOPLE = [
  person({ id: 'p-ng-1', country: 'NG' }),
  person({ id: 'p-ng-2', country: 'NG' }),
  person({ id: 'p-ke-1', country: 'KE' }),
  person({ id: 'p-paused', country: 'NG', status: 'Inactive' }),
  person({ id: 'p-archived', country: 'NG', status: 'Archived', archivedAt: T0 }),
  person({ id: 'p-other-group', country: 'NG', relationshipClassIds: ['class-other'] }),
];

function context(over: Partial<{ people: Person[]; classes: RelationshipClass[]; assignments: PolicyAssignment[]; policies: RecognitionPolicy[] }> = {}) {
  return {
    relationshipClassId: 'class-exec',
    occasionType: 'Birthday',
    people: over.people ?? PEOPLE,
    classes: over.classes ?? CLASSES,
    assignments: over.assignments ?? ASSIGNMENTS,
    policies: over.policies ?? POLICIES,
  };
}

/** Envelopes that satisfy the standard scenario: 2 × NGN 50k, 1 × KES 20k. */
const GOOD_ENVELOPES = [ngn(100_000), kes(20_000)];

function draftProgram(over: Partial<Program> = {}): Program {
  return {
    ...createCampaignDraft(
      {
        name: 'December appreciation',
        relationshipClassId: 'class-exec',
        occasionType: 'Birthday',
        campaignStartDate: '2026-12-01',
        campaignEndDate: '2026-12-20',
        budgetEnvelopes: GOOD_ENVELOPES,
      },
      T0,
      'program-1',
    ),
    ...over,
  };
}

/** A schema v5 workspace — no programs collection. */
function makeV5Workspace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 5,
    organizationId: 'org-v5', companyName: 'Meridian Group',
    website: '', industry: 'Logistics', employeeCount: '501-1000',
    operatingCountries: ['Nigeria', 'Kenya'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@meridian.example', contactRole: 'Head of People',
    phone: '', setupStage: 'people', createdAt: T0,
    relationshipClasses: CLASSES,
    recognitionPolicies: POLICIES,
    policyAssignments: ASSIGNMENTS,
    peopleSources: [{ id: 'source-1', name: 'Manual', type: 'Manual', status: 'Active', createdAt: T0, updatedAt: T0 }],
    people: PEOPLE,
    ...overrides,
  };
}

function migrateV5(overrides: Record<string, unknown> = {}): WorkspaceState {
  const result = migrateWorkspace<WorkspaceState>(makeV5Workspace(overrides));
  assert(result.status === 'ok', `Migration failed: ${result.status === 'invalid' ? result.reason : ''}`);
  return result.workspace;
}

console.log('\nCampaign Programs (H2.6) — validation\n');
console.log(`  schema v5 → v${CURRENT_WORKSPACE_SCHEMA_VERSION}\n`);

// ─── Part 1: migration ───────────────────────────────────────────────────────

check('1. A v5 workspace migrates through v6 to the current version', () => {
  const result = migrateWorkspace<WorkspaceState>(makeV5Workspace());
  assert(result.status === 'ok', `Migration rejected the v5 fixture: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, 5, 'Payload was not detected as v5.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(result.migrated, true, 'Migration did not report that it ran.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 5,
    'Wrong number of rungs walked from v5.',
  );
  assert(result.applied[0].includes('campaign-programs'), 'The H2.6 rung did not run first.');
  assertEqual(
    result.workspace.schemaVersion,
    CURRENT_WORKSPACE_SCHEMA_VERSION,
    'Migrated workspace has the wrong schemaVersion.',
  );
});

check('2. programs defaults to an empty array', () => {
  const ws = migrateV5();
  assert(Array.isArray(ws.programs), 'programs is not an array.');
  assertEqual(ws.programs.length, 0, 'Migration created Program records.');

  const fresh = createWorkspace({
    companyName: 'New Co', website: '', industry: 'Technology', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Chidi Eze', contactEmail: 'c@new.example',
    contactRole: 'Founder', phone: '',
  });
  assertEqual(fresh.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'A new workspace is not at v6.');
  assertEqual(fresh.programs.length, 0, 'A new workspace has no empty programs list.');
});

check('3. Every earlier collection survives', () => {
  const before = makeV5Workspace();
  const ws = migrateV5();
  for (const field of ['relationshipClasses', 'recognitionPolicies', 'policyAssignments', 'peopleSources', 'people'] as const) {
    assertEqual(JSON.stringify(ws[field]), JSON.stringify(before[field]), `Collection "${field}" changed.`);
  }
  assertEqual(ws.setupStage, 'people', 'setupStage changed.');
  assertEqual(ws.organizationId, 'org-v5', 'organizationId changed.');
});

check('4. Migration is idempotent', () => {
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(makeV5Workspace()) });
  const first = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(first.status === 'ok', 'First load failed.');
  assertEqual(first.migrated, true, 'First load should have migrated.');
  // v5 → v6 is additive, so no backup.
  assertEqual(first.backupKey, null, 'An additive migration created a backup.');
  const afterFirst = storage.getItem(WORKSPACE_KEY);

  for (const pass of ['second', 'third']) {
    const again = loadAndMigrateWorkspace<WorkspaceState>(storage);
    assert(again.status === 'ok', `${pass} load failed.`);
    assertEqual(again.migrated, false, `${pass} load re-ran a completed migration.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), afterFirst, `${pass} load rewrote the workspace.`);
  }
});

check('5. A v1 workspace walks every migration through v6', () => {
  const v1 = {
    organizationId: 'org-v1', companyName: 'Legacy Holdings',
    website: '', industry: 'Financial Services', employeeCount: '201-500',
    operatingCountries: ['Nigeria'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@legacy.example', contactRole: 'Head of People',
    phone: '', setupStage: 'people', createdAt: T0,
    relationshipClasses: [{
      id: 'class-board', name: 'Board Members', category: 'Governance', tier: 'Strategic',
      description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0,
    }],
    recognitionPolicies: [{
      id: 'policy-exec', workspaceId: 'org-v1', name: 'Executive', description: '',
      recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: { amount: 500000, currency: 'NGN' }, isEnabled: true }],
      approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
      deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
      proofRequired: false, reportingCadence: 'None', status: 'Published', version: 1,
      createdAt: T0, updatedAt: T0, publishedAt: T0,
    }],
  };

  const result = migrateWorkspace<WorkspaceState>(v1);
  assert(result.status === 'ok', `v1 → current failed: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 1,
    'Wrong number of rungs walked from v1.',
  );
  assert(result.applied[4].includes('campaign-programs'), 'The H2.6 rung did not run fifth.');

  const ws = result.workspace;
  assertEqual(ws.relationshipClasses[0].type, 'Board', 'ADR-002 mapping did not survive.');
  assertEqual(ws.recognitionPolicies[0].recognitionRules[0].budgetPerPerson.amountMinor, 50_000_000, 'ADR-007 transform did not survive.');
  assertEqual(ws.programs.length, 0, 'The programs collection is missing.');
});

check('6. baseCurrency is normalized when the code is known', () => {
  const ws = migrateV5({ baseCurrency: 'ngn' });
  assertEqual(ws.baseCurrency, 'NGN', 'A lowercase known currency was not uppercased.');

  const result = migrateWorkspace<WorkspaceState>(makeV5Workspace({ baseCurrency: ' kes ' }));
  assert(result.status === 'ok', 'A padded currency was rejected.');
  assertEqual(result.workspace.baseCurrency, 'KES', 'A padded currency was not normalized.');
  assert(result.warnings.some(w => w.includes('normalized')), 'Normalization produced no warning.');
});

check('7. An unknown baseCurrency is rejected safely', () => {
  for (const bad of ['XYZ', 'naira', '', 'NG']) {
    const result = migrateWorkspace<WorkspaceState>(makeV5Workspace({ baseCurrency: bad }));
    assertEqual(result.status, 'invalid', `Base currency "${bad}" was accepted.`);
    if (result.status === 'invalid') {
      assert(result.reason.toLowerCase().includes('currency'), `The refusal for "${bad}" does not mention currency.`);
    }
  }

  // The original payload survives — it is never replaced with a guess.
  const original = JSON.stringify(makeV5Workspace({ baseCurrency: 'XYZ' }));
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: original });
  const load = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assertEqual(load.status, 'invalid', 'An unknown base currency was loaded.');
  assertEqual(storage.getItem(WORKSPACE_KEY), original, 'The payload was overwritten.');
});

// ─── Part 2: the Program model ───────────────────────────────────────────────

check('8. Only Campaign mode is creatable in R5', () => {
  assertEqual(IMPLEMENTED_PROGRAM_MODES.length, 1, 'More than one mode is implemented.');
  assertEqual(IMPLEMENTED_PROGRAM_MODES[0], 'Campaign', 'Campaign is not the implemented mode.');
  assertEqual(isImplementedMode('Campaign'), true, 'Campaign is not implemented.');
  assertEqual(isImplementedMode('Recurring'), false, 'Recurring is reported as implemented.');
  assertEqual(isImplementedMode('Triggered'), false, 'Triggered is reported as implemented.');
  assertEqual(draftProgram().mode, 'Campaign', 'createCampaignDraft produced a non-Campaign mode.');
});

check('9. One Program references exactly one Relationship Group', () => {
  const program = draftProgram();
  assertEqual(typeof program.relationshipClassId, 'string', 'relationshipClassId is not a single id.');
  assert(!('relationshipClassIds' in program), 'The Program carries a plural group list.');
  assertEqual(program.relationshipClassId, 'class-exec', 'The wrong group was recorded.');
});

check('10. A Program does not contain policyAssignmentId', () => {
  const program = draftProgram();
  assert(!('policyAssignmentId' in program), 'The Program pins a policy assignment.');
  assert(!('recognitionPolicyId' in program), 'The Program pins a recognition policy.');

  // Validation refuses one even if hand-written into storage.
  const bad = migrateWorkspace<WorkspaceState>(makeV5Workspace({
    schemaVersion: 6,
    programs: [{ ...draftProgram(), policyAssignmentId: 'a-global' }],
  }));
  assertEqual(bad.status, 'invalid', 'A pinned assignment was accepted.');
});

check('11. A Program does not contain a universal policy snapshot', () => {
  const program = draftProgram();
  assert(!('policySnapshot' in program), 'The Program carries a policy snapshot.');

  const activated = activateCampaign(program, context(), NOW);
  assert(activated.ok, 'Activation failed.');
  assert(!('policySnapshot' in activated.program), 'Activation added a policy snapshot.');

  const bad = migrateWorkspace<WorkspaceState>(makeV5Workspace({
    schemaVersion: 6,
    programs: [{ ...draftProgram(), policySnapshot: { any: 'thing' } }],
  }));
  assertEqual(bad.status, 'invalid', 'A policy snapshot was accepted.');
});

// ─── Part 3: population ──────────────────────────────────────────────────────

check('12. Active people in the selected group are eligible', () => {
  const summary = summarizePopulation('class-exec', PEOPLE, CLASSES);
  assertEqual(summary.eligible.length, 3, 'Wrong eligible count.');
  const ids = summary.eligible.map(p => p.id).sort();
  assertEqual(ids.join(','), 'p-ke-1,p-ng-1,p-ng-2', 'The wrong people are eligible.');
  assertEqual(summary.countries.join(','), 'KE,NG', 'Countries were not summarized.');
});

check('13. Inactive people are excluded', () => {
  const summary = summarizePopulation('class-exec', PEOPLE, CLASSES);
  assert(!summary.eligible.some(p => p.id === 'p-paused'), 'A paused person is eligible.');
  assertEqual(summary.pausedCount, 1, 'The paused person was not counted separately.');
});

check('14. Archived people are excluded', () => {
  const summary = summarizePopulation('class-exec', PEOPLE, CLASSES);
  assert(!summary.eligible.some(p => p.id === 'p-archived'), 'An archived person is eligible.');
  assertEqual(summary.archivedCount, 1, 'The archived person was not counted separately.');
});

check('15. Unrelated active people are excluded', () => {
  const summary = summarizePopulation('class-exec', PEOPLE, CLASSES);
  assert(!summary.eligible.some(p => p.id === 'p-other-group'), 'A person from another group is eligible.');

  // An inactive group covers nobody at all.
  const offGroup = summarizePopulation('class-off', [person({ id: 'p-x', relationshipClassIds: ['class-off'] })], CLASSES);
  assertEqual(offGroup.eligible.length, 0, 'An inactive group returned eligible people.');
});

// ─── Part 4: policy resolution preview ───────────────────────────────────────

check('16. A country-specific assignment beats Global during preview', () => {
  const preview = previewAllocations(context());
  const kenyan = preview.perPerson.find(e => e.person.id === 'p-ke-1');
  assert(kenyan, 'The Kenyan person is missing from the preview.');
  assertEqual(kenyan.policyId, 'policy-ke', 'The Kenya override did not win.');
  assertEqual(kenyan.allocation?.currency, 'KES', 'The Kenyan allocation is in the wrong currency.');
});

check('17. Two countries may resolve to different policies', () => {
  const preview = previewAllocations(context());
  const nigerian = preview.perPerson.find(e => e.person.id === 'p-ng-1');
  const kenyan = preview.perPerson.find(e => e.person.id === 'p-ke-1');
  assert(nigerian && kenyan, 'Both people should appear in the preview.');
  assertEqual(nigerian.policyId, 'policy-global', 'The Nigerian person resolved wrongly.');
  assertEqual(kenyan.policyId, 'policy-ke', 'The Kenyan person resolved wrongly.');
  assert(nigerian.policyId !== kenyan.policyId, 'Both countries resolved to the same policy.');
  assertEqual(nigerian.allocation?.currency, 'NGN', 'The Nigerian currency is wrong.');
});

check('18. A missing executable assignment blocks activation', () => {
  const result = checkActivation({
    ...context({ assignments: [] }),
    campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
    budgetEnvelopes: GOOD_ENVELOPES,
  });
  assertEqual(result.ok, false, 'Activation was allowed with no assignments.');
  if (!result.ok) {
    assert(result.blockers.some(b => b.message.includes('no published rule')), 'The blocker does not name the missing rule.');
    assert(result.blockers.some(b => b.href === '/workspace/assignments'), 'No route to the fix was offered.');
  }
});

check('19. A missing occasion rule blocks activation', () => {
  // The policies only cover Birthday, so a Farewell campaign has no rule.
  const result = checkActivation({
    ...context(),
    occasionType: 'Farewell',
    campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
    budgetEnvelopes: [],
  });
  assertEqual(result.ok, false, 'Activation was allowed with no rule for the occasion.');
  if (!result.ok) {
    assert(result.blockers.some(b => b.message.includes('Farewell')), 'The blocker does not name the occasion.');
    assert(result.blockers.some(b => b.href === '/workspace/policies'), 'No route to the fix was offered.');
  }
});

// ─── Part 5: currency behaviour ──────────────────────────────────────────────

check('20. Policy allocation is grouped by currency', () => {
  const preview = previewAllocations(context());
  assertEqual(preview.byCurrency.length, 2, 'Expected two currency groups.');

  const ngnGroup = preview.byCurrency.find(c => c.currency === 'NGN');
  const kesGroup = preview.byCurrency.find(c => c.currency === 'KES');
  assert(ngnGroup && kesGroup, 'Both currency groups should be present.');

  assertEqual(ngnGroup.peopleCount, 2, 'Wrong NGN people count.');
  assertEqual(ngnGroup.total.amountMinor, 10_000_000, 'Wrong NGN total (2 × NGN 50,000).');
  assertEqual(kesGroup.peopleCount, 1, 'Wrong KES people count.');
  assertEqual(kesGroup.total.amountMinor, 2_000_000, 'Wrong KES total (1 × KES 20,000).');
});

check('21. Different currencies are never summed', () => {
  const preview = previewAllocations(context());
  // Each group totals only its own currency.
  for (const group of preview.byCurrency) {
    assertEqual(group.total.currency, group.currency, 'A currency group holds a foreign total.');
  }
  // There is deliberately no grand-total field on the preview.
  assert(!('total' in preview), 'The preview exposes a cross-currency grand total.');
  assert(!('grandTotal' in preview), 'The preview exposes a cross-currency grand total.');

  const ngnGroup = preview.byCurrency.find(c => c.currency === 'NGN')!;
  const kesGroup = preview.byCurrency.find(c => c.currency === 'KES')!;
  assert(
    ngnGroup.total.amountMinor !== ngnGroup.total.amountMinor + kesGroup.total.amountMinor,
    'A cross-currency sum would be meaningless and must not be produced.',
  );
});

check('22. One budget envelope per currency is enforced', () => {
  assertEqual(validateEnvelopes([ngn(1000), kes(1000)]).ok, true, 'Two distinct currencies were rejected.');
  assertEqual(validateEnvelopes([ngn(1000), ngn(2000)]).ok, false, 'Duplicate NGN envelopes were accepted.');
  assertEqual(validateEnvelopes([{ amountMinor: -1, currency: 'NGN' }]).ok, false, 'A negative envelope was accepted.');
  assertEqual(validateEnvelopes([{ amountMinor: 1.5, currency: 'NGN' }]).ok, false, 'A fractional envelope was accepted.');
  assertEqual(validateEnvelopes([{ amountMinor: 100, currency: 'XYZ' }]).ok, false, 'An unknown currency was accepted.');

  // Storage validation enforces it too.
  const bad = migrateWorkspace<WorkspaceState>(makeV5Workspace({
    schemaVersion: 6,
    programs: [draftProgram({ budgetEnvelopes: [ngn(1000), ngn(2000)] })],
  }));
  assertEqual(bad.status, 'invalid', 'Duplicate envelopes were persisted.');
});

check('23. An envelope below the current allocation blocks activation', () => {
  const result = checkActivation({
    ...context(),
    campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
    budgetEnvelopes: [ngn(50_000), kes(20_000)], // NGN needs 100,000
  });
  assertEqual(result.ok, false, 'An underfunded NGN envelope was accepted.');
  if (!result.ok) {
    assert(result.blockers.some(b => b.message.includes('NGN budget is below')), 'The blocker does not explain the shortfall.');
    assert(result.blockers.some(b => b.recovery.includes('NGN 100,000.00')), 'The recovery does not state the required amount.');
  }
});

check('24. A missing currency envelope blocks activation', () => {
  const result = checkActivation({
    ...context(),
    campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20',
    budgetEnvelopes: [ngn(100_000)], // KES entirely absent
  });
  assertEqual(result.ok, false, 'A missing KES envelope was accepted.');
  if (!result.ok) {
    assert(result.blockers.some(b => b.message.includes('no KES budget')), 'The blocker does not name the missing currency.');
  }
});

check('25. Invalid dates block activation', () => {
  const base = { ...context(), budgetEnvelopes: GOOD_ENVELOPES };

  for (const [start, end, label] of [
    ['not-a-date', '2026-12-20', 'malformed start'],
    ['2026-12-01', 'nope', 'malformed end'],
    ['2026-13-01', '2026-12-20', 'impossible month'],
    ['2026-12-20', '2026-12-01', 'end before start'],
  ] as const) {
    const result = checkActivation({ ...base, campaignStartDate: start, campaignEndDate: end });
    assertEqual(result.ok, false, `A ${label} was accepted.`);
  }

  const good = checkActivation({ ...base, campaignStartDate: '2026-12-01', campaignEndDate: '2026-12-20' });
  assertEqual(good.ok, true, 'Valid dates were rejected.');
});

// ─── Part 6: activation and freezing ─────────────────────────────────────────

check('26. Activation recomputes eligibility rather than trusting a preview', () => {
  const program = draftProgram();

  // A stale preview said three people. By activation time one has been archived.
  const changedPeople = PEOPLE.map(p =>
    p.id === 'p-ng-2' ? { ...p, status: 'Archived' as const, archivedAt: NOW } : p,
  );

  const result = activateCampaign(program, context({ people: changedPeople }), NOW);
  assert(result.ok, 'Activation failed.');
  assertEqual(result.program.frozenPopulation?.personIds.length, 2, 'Activation used a stale population.');
  assert(
    !result.program.frozenPopulation!.personIds.includes('p-ng-2'),
    'A person archived before activation was frozen in.',
  );

  // And a rule unpublished before activation blocks it outright.
  const unpublished = activateCampaign(
    draftProgram(),
    context({ policies: POLICIES.map(p => p.id === 'policy-ke' ? { ...p, status: 'Archived' as const } : p) }),
    NOW,
  );
  assertEqual(unpublished.ok, false, 'Activation succeeded against an archived rule.');
});

check('27. Activation freezes Person IDs and stamps the timestamp', () => {
  const result = activateCampaign(draftProgram(), context(), NOW);
  assert(result.ok, 'Activation failed.');

  const program = result.program;
  assertEqual(program.status, 'Active', 'Status did not become Active.');
  assertEqual(program.activatedAt, NOW, 'activatedAt was not stamped.');
  assert(program.frozenPopulation, 'No population was frozen.');
  assertEqual(program.frozenPopulation.frozenAt, NOW, 'frozenAt was not stamped.');
  assertEqual(program.frozenPopulation.personIds.length, 3, 'Wrong frozen count.');
  assertEqual(program.frozenPopulation.personIds.sort().join(','), 'p-ke-1,p-ng-1,p-ng-2', 'The wrong people were frozen.');

  // The selected group and occasion are preserved.
  assertEqual(program.relationshipClassId, 'class-exec', 'The group changed on activation.');
  assertEqual(program.occasionType, 'Birthday', 'The occasion changed on activation.');

  // Only a Draft may be activated.
  const twice = activateCampaign(program, context(), NOW);
  assertEqual(twice.ok, false, 'An already-active campaign was activated again.');
});

check('28. The frozen population is unchanged by later membership changes', () => {
  const result = activateCampaign(draftProgram(), context(), NOW);
  assert(result.ok, 'Activation failed.');
  const frozen = result.program.frozenPopulation!.personIds.slice().sort();

  // Someone joins the group afterwards.
  const laterPeople = [...PEOPLE, person({ id: 'p-new', country: 'NG' })];
  assertEqual(
    programPopulationCount(result.program, laterPeople, CLASSES),
    3,
    'A later addition entered the frozen campaign.',
  );

  // Someone is paused, someone archived, someone removed from the group.
  const churned = PEOPLE
    .map(p => p.id === 'p-ng-1' ? { ...p, status: 'Inactive' as const } : p)
    .map(p => p.id === 'p-ke-1' ? { ...p, relationshipClassIds: [] } : p)
    .filter(p => p.id !== 'p-ng-2');

  assertEqual(
    programPopulationCount(result.program, churned, CLASSES),
    3,
    'Later churn rewrote the frozen population.',
  );
  assertEqual(
    result.program.frozenPopulation!.personIds.slice().sort().join(','),
    frozen.join(','),
    'The frozen id list mutated.',
  );
});

check('29. The frozen population duplicates no Person or Policy data', () => {
  const result = activateCampaign(draftProgram(), context(), NOW);
  assert(result.ok, 'Activation failed.');
  const frozen = result.program.frozenPopulation!;

  assertEqual(Object.keys(frozen).sort().join(','), 'frozenAt,personIds', 'The snapshot carries unexpected fields.');
  for (const entry of frozen.personIds) {
    assertEqual(typeof entry, 'string', 'The snapshot holds an object rather than an id.');
  }
  const serialized = JSON.stringify(result.program);
  assert(!serialized.includes('firstName'), 'A copied Person record leaked into the Program.');
  assert(!serialized.includes('recognitionRules'), 'Policy data leaked into the Program.');
  assert(!serialized.includes('policy-global'), 'A policy id leaked into the Program.');
});

check('30. A draft preview re-evaluates the current population', () => {
  const program = draftProgram();
  assertEqual(program.frozenPopulation, undefined, 'A draft already has a frozen population.');
  assertEqual(programPopulationCount(program, PEOPLE, CLASSES), 3, 'Draft count is wrong.');

  // Add someone: a draft picks them up immediately.
  const more = [...PEOPLE, person({ id: 'p-new', country: 'NG' })];
  assertEqual(programPopulationCount(program, more, CLASSES), 4, 'A draft did not re-evaluate its population.');

  // Pause someone: the draft drops them.
  const fewer = PEOPLE.map(p => p.id === 'p-ng-1' ? { ...p, status: 'Inactive' as const } : p);
  assertEqual(programPopulationCount(program, fewer, CLASSES), 2, 'A draft did not drop a paused person.');
});

// ─── Part 7: draft continuity and setup ──────────────────────────────────────

check('31. A malformed wizard draft is discarded safely', () => {
  // Mirrors the guard in CampaignWizard.readDraft — a draft is only restored
  // when it matches the current shape.
  function isRestorable(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return false;
      const d = parsed as Record<string, unknown>;
      if (typeof d.name !== 'string' || typeof d.occasionType !== 'string') return false;
      if (d.budgets !== undefined && (typeof d.budgets !== 'object' || d.budgets === null)) return false;
      if (!d.name && !d.occasionType && !d.relationshipClassId) return false;
      return true;
    } catch {
      return false;
    }
  }

  for (const bad of ['{not json', 'null', '[]', '{}', '{"name":123}', '{"name":"x","occasionType":"Birthday","budgets":"nope"}']) {
    assertEqual(isRestorable(bad), false, `Malformed draft ${bad} was restorable.`);
  }
  assertEqual(
    isRestorable('{"name":"December","occasionType":"Birthday","budgets":{"NGN":"100000"},"step":2}'),
    true,
    'A well-formed draft was discarded.',
  );
});

check('32. No canonical Program exists before confirmation', () => {
  // A draft object is not a workspace record — nothing writes until activation.
  const ws = migrateV5();
  assertEqual(ws.programs.length, 0, 'A Program existed without activation.');

  const program = draftProgram();
  assertEqual(program.status, 'Draft', 'createCampaignDraft produced a non-Draft.');
  assertEqual(program.activatedAt, undefined, 'A draft carries an activation timestamp.');
  assertEqual(program.frozenPopulation, undefined, 'A draft carries a frozen population.');

  // Only a successful activation produces an Active record.
  const blocked = activateCampaign(draftProgram(), context({ assignments: [] }), NOW);
  assertEqual(blocked.ok, false, 'Activation succeeded despite blockers.');
});

check('33. The draft key is versioned so obsolete drafts cannot be restored', () => {
  // The key itself carries the shape version — a v2 wizard reads a different
  // key and simply finds nothing, rather than restoring an incompatible draft.
  const KEY: string = 'aniye_program_draft_v1';
  const PERSON_KEY: string = 'aniye_person_draft';
  assert(KEY.endsWith('_v1'), 'The draft key is not versioned.');
  assert(KEY !== PERSON_KEY, 'The program draft shares a key with the person draft.');
});

check('34. At least one Active Program completes the setup stage', () => {
  assertEqual(hasActiveProgram([]), false, 'An empty list reported an active program.');
  assertEqual(hasActiveProgram([draftProgram()]), false, 'A draft counted as active.');

  const activated = activateCampaign(draftProgram(), context(), NOW);
  assert(activated.ok, 'Activation failed.');
  assertEqual(hasActiveProgram([activated.program]), true, 'An active program was not detected.');

  assertEqual(
    hasActiveProgram([{ ...activated.program, status: 'Archived' }]),
    false,
    'An archived program counted as active.',
  );
});

check('35. An activated Program persists and validates in the workspace', () => {
  const activated = activateCampaign(draftProgram(), context(), NOW);
  assert(activated.ok, 'Activation failed.');

  const stored = migrateWorkspace<WorkspaceState>(
    makeV5Workspace({ schemaVersion: 6, programs: [activated.program] }),
  );
  assert(stored.status === 'ok', `A valid Program was refused: ${stored.status === 'invalid' ? stored.reason : ''}`);
  assertEqual(stored.workspace.programs.length, 1, 'The Program was lost.');

  const persisted = stored.workspace.programs[0];
  assertEqual(persisted.status, 'Active', 'Status changed on persistence.');
  assertEqual(persisted.frozenPopulation?.personIds.length, 3, 'The frozen population changed.');
  assertEqual(findEnvelope(persisted.budgetEnvelopes, 'NGN')?.amountMinor, 10_000_000, 'The NGN envelope changed.');
  assertEqual(findEnvelope(persisted.budgetEnvelopes, 'KES')?.amountMinor, 2_000_000, 'The KES envelope changed.');

  // A round trip through the runner is a no-op.
  const again = migrateWorkspace<WorkspaceState>(JSON.parse(JSON.stringify(stored.workspace)));
  assert(again.status === 'ok', 'A stored Program failed a second pass.');
  assertEqual(again.migrated, false, 'A current-version workspace was migrated again.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Campaign Program validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Campaign Program validation passed.\n');
