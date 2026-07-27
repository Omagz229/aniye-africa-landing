/**
 * Deterministic validation for H2.5 — People Sources and People.
 *
 * Run with:  npm run validate:people
 *
 * Three halves (the migration, precedence/duplicates, and CSV import), same
 * dependency-free approach as the other suites.
 */

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_KEY,
  loadAndMigrateWorkspace,
  migrateWorkspace,
} from '../lib/migrations';
import { createWorkspace } from '../lib/workspace';
import type { PeopleSource, Person, RelationshipClass, WorkspaceState } from '../lib/workspace';
import {
  activeMemberCount,
  applyPeopleImport,
  createCsvSource,
  ensureManualSource,
  memberCountsByClass,
  mergePersonFromImport,
  normalizeEmail,
  peopleWithInvalidClassReferences,
  peopleWithoutClass,
  planPeopleImport,
  resolveClassReference,
  resolveDuplicate,
  sourcePriority,
  totalMemberCount,
} from '../lib/people';
import { parseCsv } from '../lib/csv';

// ─── Tiny assertion harness ──────────────────────────────────────────────────

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
const NOW = '2026-07-27T12:00:00.000Z';

let idCounter = 0;
const newId = () => `generated-${++idCounter}`;

function rawClass(id: string, name: string, type: string, level: number, isActive = true): Record<string, unknown> {
  return { id, name, type, level, description: '', isDefault: false, isActive, createdAt: T0, updatedAt: T0 };
}

function rawPolicy(id: string, name: string, status: string): Record<string, unknown> {
  return {
    id, workspaceId: 'org-v3', name, description: '',
    recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: { amount: 100000, currency: 'NGN' }, isEnabled: true }],
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status, version: 1,
    createdAt: T0, updatedAt: T0, ...(status === 'Published' ? { publishedAt: T0 } : {}),
  };
}

const RAW_ASSIGNMENT = {
  id: 'assignment-1',
  relationshipClassId: 'class-exec',
  recognitionPolicyId: 'policy-exec',
  countryCode: 'KE',
  priority: 3,
  isActive: true,
  createdAt: T0,
  updatedAt: T0,
};

/** A schema v3 workspace — has assignments, no people or sources. */
function makeV3Workspace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 3,
    organizationId: 'org-v3',
    companyName: 'Meridian Group',
    website: '', industry: 'Logistics', employeeCount: '501-1000',
    operatingCountries: ['Nigeria', 'Kenya'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@meridian.example', contactRole: 'Head of People',
    phone: '', setupStage: 'assignments', createdAt: T0,
    relationshipClasses: [
      rawClass('class-exec', 'Executive Leadership', 'Employee', 0),
      rawClass('class-managers', 'Managers', 'Employee', 2),
      rawClass('class-vip', 'VIP Clients', 'Client', 0),
      rawClass('class-retired', 'Retired Class', 'Partner', 0, false),
    ],
    recognitionPolicies: [
      rawPolicy('policy-exec', 'Executive Recognition Policy', 'Published'),
      rawPolicy('policy-draft', 'Draft Policy', 'Draft'),
    ],
    policyAssignments: [RAW_ASSIGNMENT],
    ...overrides,
  };
}

function migrateV3(overrides: Record<string, unknown> = {}): WorkspaceState {
  const result = migrateWorkspace<WorkspaceState>(makeV3Workspace(overrides));
  assert(result.status === 'ok', `Migration failed: ${result.status === 'invalid' ? result.reason : ''}`);
  return result.workspace;
}

const CLASSES: RelationshipClass[] = [
  rawClass('class-exec', 'Executive Leadership', 'Employee', 0),
  rawClass('class-managers', 'Managers', 'Employee', 2),
  rawClass('class-vip', 'VIP Clients', 'Client', 0),
  rawClass('class-retired', 'Retired Class', 'Partner', 0, false),
] as unknown as RelationshipClass[];

/** Two classes deliberately share a display name, to exercise ambiguity. */
const AMBIGUOUS_CLASSES: RelationshipClass[] = [
  ...CLASSES,
  rawClass('class-dupe-name', 'Managers', 'Client', 1),
  rawClass('class-dupe-level', 'Regional Managers', 'Employee', 2),
] as unknown as RelationshipClass[];

function source(id: string, type: 'Manual' | 'CSV' | 'HRIS'): PeopleSource {
  return { id, name: `${type} source`, type, status: 'Active', createdAt: T0, updatedAt: T0 };
}

function person(over: Partial<Person> & { id: string }): Person {
  return {
    firstName: 'Ada', lastName: 'Obi',
    relationshipClassIds: [],
    sourceId: 'source-manual', sourceType: 'Manual',
    status: 'Active', createdAt: T0, updatedAt: T0,
    ...over,
  };
}

// ─── Part 1: schema v3 → v4 ──────────────────────────────────────────────────

console.log('\nPeople and People Sources (H2.5) — validation\n');
console.log(`  schema v3 → v${CURRENT_WORKSPACE_SCHEMA_VERSION}\n`);

check('1. A v3 workspace migrates to v4 and on to the current version', () => {
  const result = migrateWorkspace<WorkspaceState>(makeV3Workspace());
  assert(result.status === 'ok', `Migration rejected the v3 fixture: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, 3, 'Payload was not detected as v3.');
  assertEqual(result.migrated, true, 'Migration did not report that it ran.');

  // v4 is no longer the final version, so this suite asserts the H2.5 rung ran
  // and left the chain consistent — not that the walk stopped there.
  assertEqual(result.applied[0], 'v3-to-v4-h2-5-people-and-sources', 'H2.5 was not the first rung from v3.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 3,
    'Wrong number of migrations ran for the number of versions crossed.',
  );
  assertEqual(result.workspace.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migrated workspace has the wrong schemaVersion.');
  // The H2.5 rung is purely additive, so setupStage must be untouched.
  assertEqual(result.workspace.setupStage, 'assignments', 'setupStage changed during an additive migration.');
});

check('2. people and peopleSources default to empty arrays', () => {
  const ws = migrateV3();
  assert(Array.isArray(ws.people), 'people is not an array.');
  assert(Array.isArray(ws.peopleSources), 'peopleSources is not an array.');
  assertEqual(ws.people.length, 0, 'people should start empty.');
  assertEqual(ws.peopleSources.length, 0, 'peopleSources should start empty.');

  const fresh = createWorkspace({
    companyName: 'New Co', website: '', industry: 'Technology', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Chidi Eze', contactEmail: 'c@new.example',
    contactRole: 'Founder', phone: '',
  });
  assertEqual(fresh.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'New workspace is not at v4.');
  assertEqual(fresh.people.length, 0, 'New workspace has no empty people list.');
  assertEqual(fresh.peopleSources.length, 0, 'New workspace has no empty peopleSources list.');
});

check('3. All earlier workspace collections survive migration', () => {
  const before = makeV3Workspace();
  const ws = migrateV3();

  assertEqual(ws.relationshipClasses.length, 4, 'Class count changed.');
  assertEqual(ws.recognitionPolicies.length, 2, 'Policy count changed.');
  assertEqual(ws.policyAssignments.length, 1, 'Assignment count changed.');

  for (const field of ['organizationId', 'companyName', 'baseCurrency', 'timezone', 'contactEmail', 'createdAt'] as const) {
    assertEqual(
      JSON.stringify((ws as unknown as Record<string, unknown>)[field]),
      JSON.stringify(before[field]),
      `Field "${field}" changed during migration.`,
    );
  }
});

check('4. Migration is idempotent', () => {
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(makeV3Workspace()) });

  const first = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(first.status === 'ok', 'First load failed.');
  assertEqual(first.migrated, true, 'First load should have migrated.');
  // The v3 → v4 rung is additive, but the chain now continues through the
  // destructive v4 → v5 Money migration, so exactly one backup is expected.
  assert(first.backupKey !== null, 'A destructive migration in the chain took no backup.');
  assertEqual(
    storage.keys().filter(k => k.startsWith('aniye_workspace_backup')).length,
    1,
    'Expected exactly one backup for the whole chain.',
  );
  const afterFirst = storage.getItem(WORKSPACE_KEY);
  const keyCount = storage.keys().length;

  for (const pass of ['second', 'third']) {
    const again = loadAndMigrateWorkspace<WorkspaceState>(storage);
    assert(again.status === 'ok', `${pass} load failed.`);
    assertEqual(again.migrated, false, `${pass} load re-ran a completed migration.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), afterFirst, `${pass} load rewrote the workspace.`);
    assertEqual(storage.keys().length, keyCount, `${pass} load added storage keys.`);
  }
});

check('5. A v1 workspace migrates through v2, v3, v4 and v5 in order', () => {
  const v1 = {
    organizationId: 'org-v1', companyName: 'Legacy Holdings',
    website: '', industry: 'Financial Services', employeeCount: '201-500',
    operatingCountries: ['Nigeria'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@legacy.example', contactRole: 'Head of People',
    phone: '', setupStage: 'people', createdAt: T0,
    relationshipClasses: [{
      id: 'class-board-members', name: 'Board Members', category: 'Governance', tier: 'Strategic',
      description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0,
    }],
    recognitionPolicies: [rawPolicy('policy-exec', 'Executive Recognition Policy', 'Published')],
  };

  const result = migrateWorkspace<WorkspaceState>(v1);
  assert(result.status === 'ok', `v1 → v4 failed: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, 1, 'Payload was not detected as v1.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 1,
    'Wrong number of migrations ran for the number of versions crossed.',
  );
  assert(result.applied[0].includes('adr-002'), 'ADR-002 did not run first.');
  assert(result.applied[1].includes('policy-assignments'), 'H2.4 did not run second.');
  assert(result.applied[2].includes('people'), 'H2.5 did not run third.');
  assert(result.applied[3].includes('money'), 'ADR-007 Money did not run fourth.');

  assertEqual(result.workspace.relationshipClasses[0].type, 'Board', 'ADR-002 mapping did not run.');
  assertEqual(result.workspace.policyAssignments.length, 0, 'H2.4 collection missing.');
  assertEqual(result.workspace.people.length, 0, 'H2.5 people collection missing.');
  assertEqual(result.workspace.peopleSources.length, 0, 'H2.5 sources collection missing.');
  // The v2 → v3 stage remap still applies on the long path.
  assertEqual(result.workspace.setupStage, 'assignments', 'v2 → v3 stage remap did not run on the v1 path.');
});

// ─── Part 2: precedence and duplicates ───────────────────────────────────────

check('6. Email normalization trims and lowercases', () => {
  assertEqual(normalizeEmail('  Ada.Obi@Example.COM  '), 'ada.obi@example.com', 'Email was not normalized.');
  assertEqual(normalizeEmail(''), undefined, 'An empty email should be undefined.');
  assertEqual(normalizeEmail('   '), undefined, 'A whitespace-only email should be undefined.');
  assertEqual(normalizeEmail(undefined), undefined, 'An absent email should be undefined.');

  // Normalization is what makes duplicate matching work across casings.
  const people = [person({ id: 'p1', email: 'ada.obi@example.com' })];
  const match = resolveDuplicate(normalizeEmail('ADA.OBI@EXAMPLE.COM'), 'Manual', people);
  assertEqual(match.outcome, 'retain-existing', 'Case-different emails were not matched.');
});

check('7. HRIS priority is greater than CSV', () => {
  assert(sourcePriority('HRIS') > sourcePriority('CSV'), 'HRIS does not outrank CSV.');
});

check('8. CSV priority is greater than Manual', () => {
  assert(sourcePriority('CSV') > sourcePriority('Manual'), 'CSV does not outrank Manual.');
  assert(sourcePriority('HRIS') > sourcePriority('Manual'), 'HRIS does not outrank Manual.');
});

check('9. A lower-priority duplicate does not overwrite the existing record', () => {
  const existing = [person({ id: 'p1', email: 'ada@example.com', sourceType: 'CSV', role: 'Chief Executive' })];
  const decision = resolveDuplicate('ada@example.com', 'Manual', existing);
  assertEqual(decision.outcome, 'retain-existing', 'A Manual record overwrote a CSV record.');
  assertEqual(decision.existing?.id, 'p1', 'Wrong existing record identified.');
  assert(decision.reason.includes('CSV'), 'The reason does not explain the precedence.');
});

check('10. An equal-priority duplicate does not silently overwrite', () => {
  const existing = [person({ id: 'p1', email: 'ada@example.com', sourceType: 'CSV' })];
  const decision = resolveDuplicate('ada@example.com', 'CSV', existing);
  assertEqual(decision.outcome, 'retain-existing', 'An equal-priority record overwrote the existing one.');
  assert(decision.reason.toLowerCase().includes('review'), 'An equal-priority collision was not flagged for review.');
});

check('11. A higher-priority incoming record preserves the Person id', () => {
  const existing = person({ id: 'p1', email: 'ada@example.com', sourceType: 'Manual' });
  const decision = resolveDuplicate('ada@example.com', 'CSV', [existing]);
  assertEqual(decision.outcome, 'update', 'CSV did not take precedence over Manual.');

  const csv = source('source-csv', 'CSV');
  const merged = mergePersonFromImport(
    existing,
    { firstName: 'Ada', lastName: 'Obi-Nwosu', email: 'ada@example.com', relationshipClassIds: [], providedClass: false },
    csv, NOW,
  );
  assertEqual(merged.id, 'p1', 'The Person id changed on update.');
  assertEqual(merged.createdAt, T0, 'createdAt changed on update.');
  assertEqual(merged.lastName, 'Obi-Nwosu', 'The supplied field was not updated.');
  assertEqual(merged.sourceId, 'source-csv', 'Provenance was not moved to the new source.');
  assertEqual(merged.sourceType, 'CSV', 'sourceType was not updated.');
  assertEqual(merged.updatedAt, NOW, 'updatedAt was not refreshed.');
});

check('12. A higher-priority update preserves fields absent from the incoming record', () => {
  const existing = person({
    id: 'p1', email: 'ada@example.com', sourceType: 'Manual',
    phone: '+234 800 000 0000', role: 'Chief Executive', country: 'NG',
    birthday: '04-17', startDate: '2021-03-01', externalId: 'EMP-001',
    relationshipClassIds: ['class-exec'],
  });

  const merged = mergePersonFromImport(
    existing,
    { firstName: 'Ada', lastName: 'Obi', email: 'ada@example.com', relationshipClassIds: [], providedClass: false },
    source('source-csv', 'CSV'), NOW,
  );

  assertEqual(merged.phone, '+234 800 000 0000', 'phone was erased by an absent field.');
  assertEqual(merged.role, 'Chief Executive', 'role was erased by an absent field.');
  assertEqual(merged.country, 'NG', 'country was erased by an absent field.');
  assertEqual(merged.birthday, '04-17', 'birthday was erased by an absent field.');
  assertEqual(merged.startDate, '2021-03-01', 'startDate was erased by an absent field.');
  assertEqual(merged.externalId, 'EMP-001', 'externalId was erased by an absent field.');
  assertEqual(merged.relationshipClassIds.length, 1, 'Class assignments were erased without replacements.');
  assertEqual(merged.relationshipClassIds[0], 'class-exec', 'The preserved class changed.');

  // ...but an explicit replacement does replace.
  const replaced = mergePersonFromImport(
    existing,
    { firstName: 'Ada', lastName: 'Obi', relationshipClassIds: ['class-managers'], providedClass: true },
    source('source-csv', 'CSV'), NOW,
  );
  assertEqual(replaced.relationshipClassIds.join(','), 'class-managers', 'An explicit class replacement was ignored.');

  // Archiving survives an import — no silent resurrection.
  const archived = person({ id: 'p2', email: 'k@example.com', status: 'Archived', archivedAt: T0 });
  const stillArchived = mergePersonFromImport(
    archived,
    { firstName: 'Kwame', lastName: 'Mensah', relationshipClassIds: [], providedClass: false },
    source('source-csv', 'CSV'), NOW,
  );
  assertEqual(stillArchived.status, 'Archived', 'An import resurrected an archived person.');
});

check('13. A person without an email is not automatically merged', () => {
  const existing = [person({ id: 'p1', firstName: 'Ada', lastName: 'Obi', email: undefined })];
  const decision = resolveDuplicate(undefined, 'CSV', existing);
  assertEqual(decision.outcome, 'create', 'A record with no email was merged.');
  assert(decision.reason.toLowerCase().includes('no email'), 'The reason does not explain why.');

  // Two same-named people with no email stay two people.
  const csvText = 'first_name,last_name\nAda,Obi\n';
  const plan = planPeopleImport(csvText, CLASSES, existing, 'CSV');
  assert(plan.status === 'ok', 'Plan failed.');
  assertEqual(plan.plan.summary.created, 1, 'A nameless-key row was not created.');
  assertEqual(plan.plan.summary.updated, 0, 'A record with no email was merged.');
});

// ─── Part 3: class resolution ────────────────────────────────────────────────

check('14. An exact class id resolves', () => {
  const lookup = resolveClassReference({ kind: 'id', value: 'class-managers' }, CLASSES);
  assert(lookup.status === 'resolved', 'An exact id did not resolve.');
  assertEqual(lookup.classId, 'class-managers', 'The wrong class resolved.');

  const missing = resolveClassReference({ kind: 'id', value: 'class-nope' }, CLASSES);
  assertEqual(missing.status, 'not-found', 'An unknown id resolved.');

  // Id wins even when a name would be ambiguous.
  const csvText = 'first_name,last_name,email,relationship_class_id,relationship_class\nAda,Obi,a@x.com,class-managers,Managers\n';
  const plan = planPeopleImport(csvText, AMBIGUOUS_CLASSES, [], 'CSV');
  assert(plan.status === 'ok', 'Plan failed.');
  // The ambiguous name is still reported, but the id resolved.
  assertEqual(plan.plan.rows[0].state, 'ambiguous-class', 'An ambiguous name was not reported alongside the id.');
});

check('15. An exact normalized class name resolves', () => {
  for (const name of ['Executive Leadership', '  executive leadership  ', 'EXECUTIVE   LEADERSHIP']) {
    const lookup = resolveClassReference({ kind: 'name', value: name }, CLASSES);
    assert(lookup.status === 'resolved', `"${name}" did not resolve.`);
    assertEqual(lookup.classId, 'class-exec', `"${name}" resolved the wrong class.`);
  }

  // No fuzzy matching: a near miss must not resolve.
  for (const near of ['Executive Leader', 'Exec Leadership', 'Executives']) {
    assertEqual(
      resolveClassReference({ kind: 'name', value: near }, CLASSES).status,
      'not-found',
      `"${near}" resolved by fuzzy matching.`,
    );
  }
});

check('16. An exact Type + Level combination resolves', () => {
  const lookup = resolveClassReference({ kind: 'typeLevel', type: 'Employee', level: 0 }, CLASSES);
  assert(lookup.status === 'resolved', 'Type + Level did not resolve.');
  assertEqual(lookup.classId, 'class-exec', 'Type + Level resolved the wrong class.');

  assertEqual(
    resolveClassReference({ kind: 'typeLevel', type: 'Employee', level: 7 }, CLASSES).status,
    'not-found',
    'A non-existent level resolved.',
  );

  // Through the CSV path.
  const csvText = 'first_name,last_name,email,relationship_type,relationship_level\nAda,Obi,a@x.com,Client,0\n';
  const plan = planPeopleImport(csvText, CLASSES, [], 'CSV');
  assert(plan.status === 'ok', 'Plan failed.');
  assertEqual(plan.plan.rows[0].state, 'ready', 'A Type + Level row was not ready.');
  assertEqual(plan.plan.rows[0].draft?.relationshipClassIds.join(','), 'class-vip', 'Wrong class assigned.');
});

check('17. Ambiguous classes do not resolve silently', () => {
  // Two classes named "Managers".
  const byName = resolveClassReference({ kind: 'name', value: 'Managers' }, AMBIGUOUS_CLASSES);
  assertEqual(byName.status, 'ambiguous', 'A duplicated class name resolved.');

  // Two Employee classes at level 2.
  const byTypeLevel = resolveClassReference({ kind: 'typeLevel', type: 'Employee', level: 2 }, AMBIGUOUS_CLASSES);
  assertEqual(byTypeLevel.status, 'ambiguous', 'A duplicated Type + Level resolved.');

  const csvText = 'first_name,last_name,email,relationship_class\nAda,Obi,a@x.com,Managers\n';
  const plan = planPeopleImport(csvText, AMBIGUOUS_CLASSES, [], 'CSV');
  assert(plan.status === 'ok', 'Plan failed.');
  assertEqual(plan.plan.rows[0].state, 'ambiguous-class', 'An ambiguous row was not flagged.');
  assertEqual(plan.plan.summary.created, 0, 'An ambiguous row was counted as created.');
  assertEqual(plan.plan.summary.skipped, 1, 'An ambiguous row was not counted as skipped.');
});

check('18. Inactive classes cannot be newly assigned', () => {
  const lookup = resolveClassReference({ kind: 'id', value: 'class-retired' }, CLASSES);
  assert(lookup.status === 'resolved', 'An inactive class should still resolve as a reference.');
  assertEqual(lookup.isActive, false, 'The inactive class was reported active.');

  // Import must not assign it, but must still import the person.
  const csvText = 'first_name,last_name,email,relationship_class_id\nAda,Obi,a@x.com,class-retired\n';
  const plan = planPeopleImport(csvText, CLASSES, [], 'CSV');
  assert(plan.status === 'ok', 'Plan failed.');
  const row = plan.plan.rows[0];
  assertEqual(row.state, 'ready-unassigned', 'An inactive class was assigned, or the row was dropped.');
  assertEqual(row.draft?.relationshipClassIds.length, 0, 'An inactive class was assigned.');
  assert(row.warnings.some(w => w.toLowerCase().includes('inactive')), 'No warning about the inactive class.');
});

// ─── Part 4: derived member counts ───────────────────────────────────────────

check('19. Archived people are excluded from active member counts', () => {
  const people = [
    person({ id: 'p1', relationshipClassIds: ['class-exec'] }),
    person({ id: 'p2', relationshipClassIds: ['class-exec'], status: 'Archived', archivedAt: T0 }),
  ];
  assertEqual(activeMemberCount('class-exec', people), 1, 'An archived person counted as active.');
  assertEqual(totalMemberCount('class-exec', people), 2, 'An archived person was dropped from the total.');

  const counts = memberCountsByClass(people, CLASSES);
  assertEqual(counts.get('class-exec')?.active, 1, 'Active count is wrong.');
  assertEqual(counts.get('class-exec')?.total, 2, 'Total count is wrong.');

  // An archived person with no class is not reported as unassigned.
  const unassigned = peopleWithoutClass([...people, person({ id: 'p3', status: 'Archived' })]);
  assertEqual(unassigned.length, 0, 'An archived person was reported as unassigned.');
});

check('20. Multiple class assignments are counted correctly', () => {
  const people = [
    person({ id: 'p1', relationshipClassIds: ['class-exec', 'class-vip'] }),
    person({ id: 'p2', relationshipClassIds: ['class-vip'] }),
    // A repeated id on one record must not double-count.
    person({ id: 'p3', relationshipClassIds: ['class-vip', 'class-vip'] }),
    person({ id: 'p4', relationshipClassIds: [] }),
  ];

  const counts = memberCountsByClass(people, CLASSES);
  assertEqual(counts.get('class-exec')?.active, 1, 'class-exec active count is wrong.');
  assertEqual(counts.get('class-vip')?.active, 3, 'class-vip active count is wrong.');
  assertEqual(counts.get('class-managers')?.active, 0, 'An empty class should report zero, not be absent.');
  assertEqual(activeMemberCount('class-vip', people), 3, 'activeMemberCount disagrees with memberCountsByClass.');

  assertEqual(peopleWithoutClass(people).length, 1, 'Wrong unassigned count.');
  assertEqual(peopleWithoutClass(people)[0].id, 'p4', 'Wrong person reported as unassigned.');
});

check('21. Missing and inactive class references are reported', () => {
  const people = [
    person({ id: 'p1', relationshipClassIds: ['class-exec'] }),
    person({ id: 'p2', relationshipClassIds: ['class-gone'] }),
    person({ id: 'p3', relationshipClassIds: ['class-retired'] }),
    person({ id: 'p4', relationshipClassIds: ['class-gone'], status: 'Archived' }),
  ];

  const invalid = peopleWithInvalidClassReferences(people, CLASSES);
  assertEqual(invalid.length, 2, 'Wrong number of people with invalid class references.');

  const missing = invalid.find(i => i.person.id === 'p2');
  assert(missing, 'The missing-class person was not reported.');
  assertEqual(missing.missingClassIds.join(','), 'class-gone', 'The missing class id was not reported.');

  const inactive = invalid.find(i => i.person.id === 'p3');
  assert(inactive, 'The inactive-class person was not reported.');
  assertEqual(inactive.inactiveClassIds.join(','), 'class-retired', 'The inactive class id was not reported.');

  // The references are preserved on the record, not stripped.
  assertEqual(people[1].relationshipClassIds.join(','), 'class-gone', 'A dangling reference was removed.');

  // A dangling reference does not corrupt the counts.
  const counts = memberCountsByClass(people, CLASSES);
  assertEqual(counts.get('class-exec')?.active, 1, 'Counts were skewed by a dangling reference.');
});

check('22. All existing policies and assignments survive the migration', () => {
  const ws = migrateV3();

  assertEqual(ws.recognitionPolicies.length, 2, 'A policy was lost.');
  const published = ws.recognitionPolicies.find(p => p.id === 'policy-exec');
  assert(published, 'The published policy was lost.');
  assertEqual(published.status, 'Published', 'Policy status changed.');
  // The fixture is a legacy v3 payload holding 100,000 NGN in major units.
  // After the v4 → v5 Money migration that is 10,000,000 kobo.
  assertEqual(published.recognitionRules[0].budgetPerPerson.amountMinor, 10_000_000, 'Policy budget changed.');
  assertEqual(published.recognitionRules[0].budgetPerPerson.currency, 'NGN', 'Policy currency changed.');
  assert(
    !('amount' in published.recognitionRules[0].budgetPerPerson),
    'The legacy major-unit amount survived migration.',
  );

  assertEqual(ws.policyAssignments.length, 1, 'An assignment was lost.');
  const assignment = ws.policyAssignments[0];
  assertEqual(assignment.id, RAW_ASSIGNMENT.id, 'Assignment id changed.');
  assertEqual(assignment.countryCode, 'KE', 'Assignment scope changed.');
  assertEqual(assignment.priority, 3, 'Assignment priority changed.');
  assertEqual(assignment.isActive, true, 'Assignment isActive changed.');
});

// ─── Part 5: CSV ─────────────────────────────────────────────────────────────

check('23. Malformed CSV rows are rejected safely', () => {
  // Whole-file failures.
  assertEqual(planPeopleImport('', CLASSES, [], 'CSV').status, 'error', 'An empty file was accepted.');
  assertEqual(
    planPeopleImport('nickname,favourite_colour\nAda,Blue\n', CLASSES, [], 'CSV').status,
    'error',
    'A file with no name columns was accepted.',
  );
  assertEqual(
    planPeopleImport('first_name,last_name\n', CLASSES, [], 'CSV').status,
    'error',
    'A headers-only file was accepted.',
  );

  // Per-row failures, each isolated to its own row.
  const csvText = [
    'first_name,last_name,email,country,birthday,start_date',
    ',Obi,a@x.com,NG,04-17,2021-03-01',            // missing first name
    'Ada,,b@x.com,NG,04-17,2021-03-01',            // missing last name
    'Kwame,Mensah,not-an-email,GH,,',              // invalid email
    'Amina,Yusuf,c@x.com,KENYA,,',                 // invalid country
    'Tunde,Bello,d@x.com,NG,99-99,',               // invalid birthday
    'Zola,Ncube,e@x.com,ZA,,not-a-date',           // invalid start date
    'Femi,Ade,f@x.com,NG,04-17,2021-03-01',        // valid
  ].join('\n');

  const result = planPeopleImport(csvText, CLASSES, [], 'CSV');
  assert(result.status === 'ok', 'A file with some bad rows was rejected entirely.');
  const { rows, summary } = result.plan;

  assertEqual(rows.length, 7, 'Wrong row count.');
  assertEqual(rows[0].state, 'missing-required', 'A missing first name was not caught.');
  assertEqual(rows[1].state, 'missing-required', 'A missing last name was not caught.');
  assertEqual(rows[2].state, 'invalid', 'An invalid email was not caught.');
  assertEqual(rows[3].state, 'invalid', 'An invalid country was not caught.');
  assertEqual(rows[4].state, 'invalid', 'An invalid birthday was not caught.');
  assertEqual(rows[5].state, 'invalid', 'An invalid start date was not caught.');
  assertEqual(rows[6].state, 'ready-unassigned', 'The valid row was not marked ready.');
  assertEqual(summary.invalid, 6, 'Wrong invalid count.');
  assertEqual(summary.created, 1, 'Wrong created count.');

  // Applying the plan writes only the valid row.
  const applied = applyPeopleImport(result.plan, [], createCsvSource('staff.csv', NOW, 'src-1'), NOW, newId);
  assertEqual(applied.people.length, 1, 'An invalid row was written.');
  assertEqual(applied.people[0].firstName, 'Femi', 'The wrong row was written.');
});

check('24. A successful CSV import produces one source for the import, not one per row', () => {
  const csvText = [
    'first_name,last_name,email,role,country,relationship_class',
    'Ada,Obi,ada@example.com,Chief Executive,NG,Executive Leadership',
    'Kwame,Mensah,kwame@example.com,Regional Manager,GH,Managers',
    'Amina,Yusuf,amina@example.com,Buyer,KE,VIP Clients',
  ].join('\n');

  const result = planPeopleImport(csvText, CLASSES, [], 'CSV');
  assert(result.status === 'ok', 'Plan failed.');
  assertEqual(result.plan.summary.created, 3, 'Wrong created count.');

  const csvSource = createCsvSource('Q3 headcount.csv', NOW, 'src-import-1');
  const applied = applyPeopleImport(result.plan, [], csvSource, NOW, newId);

  assertEqual(applied.people.length, 3, 'Wrong number of people imported.');
  const sourceIds = new Set(applied.people.map(p => p.sourceId));
  assertEqual(sourceIds.size, 1, 'More than one source id was used for a single import.');
  assertEqual([...sourceIds][0], 'src-import-1', 'The wrong source id was recorded.');
  for (const p of applied.people) assertEqual(p.sourceType, 'CSV', 'A person got the wrong sourceType.');

  // The source itself carries the filename and import time.
  assertEqual(csvSource.name, 'Q3 headcount', 'The source name was not derived from the filename.');
  assertEqual(csvSource.filename, 'Q3 headcount.csv', 'The filename was not recorded.');
  assertEqual(csvSource.importedAt, NOW, 'importedAt was not recorded.');
  assertEqual(csvSource.type, 'CSV', 'The source type is wrong.');

  // Manual entry reuses one source rather than creating one per person.
  let sources: PeopleSource[] = [];
  const first = ensureManualSource(sources, NOW, 'src-manual-1');
  sources = first.sources;
  const second = ensureManualSource(sources, NOW, 'src-manual-2');
  assertEqual(second.sources.length, 1, 'A second Manual source was created.');
  assertEqual(second.source.id, 'src-manual-1', 'The existing Manual source was not reused.');
});

// ─── Supporting cases ────────────────────────────────────────────────────────

check('25. RFC 4180 quoting is parsed correctly', () => {
  const csvText = [
    'first_name,last_name,role',
    '"Obi, Jr.",Adeyemi,"Head of ""Special"" Projects"',
    'Kwame,Mensah,"Line one',
    'line two"',
  ].join('\r\n');

  const rows = parseCsv(csvText);
  assertEqual(rows.length, 3, 'Wrong row count with embedded newlines.');
  assertEqual(rows[1][0], 'Obi, Jr.', 'A quoted comma was mishandled.');
  assertEqual(rows[1][2], 'Head of "Special" Projects', 'An escaped quote was mishandled.');
  assertEqual(rows[2][2], 'Line one\r\nline two', 'An embedded newline was mishandled.');

  // A BOM must not corrupt the first header.
  const withBom = parseCsv('﻿first_name,last_name\nAda,Obi\n');
  assertEqual(withBom[0][0], 'first_name', 'A UTF-8 BOM corrupted the first header.');
  assertEqual(withBom.length, 2, 'A trailing newline produced a phantom row.');
});

check('26. Header matching is tolerant of separators and casing', () => {
  for (const header of ['first_name', 'First Name', 'FIRST-NAME', ' firstname ']) {
    const result = planPeopleImport(`${header},last_name\nAda,Obi\n`, CLASSES, [], 'CSV');
    assert(result.status === 'ok', `Header "${header}" was not recognized.`);
    assertEqual(result.plan.rows[0].draft?.firstName, 'Ada', `Header "${header}" mapped to the wrong column.`);
  }

  const withExtras = planPeopleImport(
    'first_name,last_name,favourite_colour\nAda,Obi,Blue\n', CLASSES, [], 'CSV',
  );
  assert(withExtras.status === 'ok', 'An unrecognized column broke the import.');
  assertEqual(withExtras.plan.unrecognizedHeaders.join(','), 'favourite_colour', 'The extra header was not reported.');
});

check('27. A duplicate inside one file is not imported twice', () => {
  const csvText = [
    'first_name,last_name,email',
    'Ada,Obi,ada@example.com',
    'Ada,Obi-Nwosu,ADA@EXAMPLE.COM',
  ].join('\n');

  const result = planPeopleImport(csvText, CLASSES, [], 'CSV');
  assert(result.status === 'ok', 'Plan failed.');
  assertEqual(result.plan.rows[0].state, 'ready-unassigned', 'The first occurrence was not accepted.');
  assertEqual(result.plan.rows[1].state, 'duplicate-retained', 'A repeated email in one file was imported twice.');
  assert(result.plan.rows[1].message.includes('Row 1'), 'The message does not point at the earlier row.');

  const applied = applyPeopleImport(result.plan, [], createCsvSource('x.csv', NOW, 'src-2'), NOW, newId);
  assertEqual(applied.people.length, 1, 'The duplicate was written.');
});

check('28. A CSV import updates a Manual record end to end', () => {
  const existing = [person({
    id: 'p-manual', email: 'ada@example.com', sourceType: 'Manual', sourceId: 'src-manual',
    role: 'Chief Executive', relationshipClassIds: ['class-exec'],
  })];

  const csvText = 'first_name,last_name,email,country\nAda,Obi,ada@example.com,NG\n';
  const result = planPeopleImport(csvText, CLASSES, existing, 'CSV');
  assert(result.status === 'ok', 'Plan failed.');
  assertEqual(result.plan.rows[0].state, 'will-update', 'The row was not marked as an update.');
  assertEqual(result.plan.summary.updated, 1, 'Wrong updated count.');
  assertEqual(result.plan.summary.created, 0, 'An update was counted as a creation.');

  const applied = applyPeopleImport(result.plan, existing, createCsvSource('x.csv', NOW, 'src-3'), NOW, newId);
  assertEqual(applied.people.length, 1, 'The update created a second record.');
  const updated = applied.people[0];
  assertEqual(updated.id, 'p-manual', 'The Person id changed.');
  assertEqual(updated.country, 'NG', 'The supplied field was not applied.');
  assertEqual(updated.role, 'Chief Executive', 'An unsupplied field was erased.');
  assertEqual(updated.relationshipClassIds.join(','), 'class-exec', 'Class assignments were erased.');
  assertEqual(updated.sourceType, 'CSV', 'Provenance did not move.');
});

check('29. A CSV import cannot overwrite an HRIS record', () => {
  const existing = [person({ id: 'p-hris', email: 'ada@example.com', sourceType: 'HRIS', role: 'Chief Executive' })];
  const csvText = 'first_name,last_name,email,role\nAda,Obi,ada@example.com,Intern\n';

  const result = planPeopleImport(csvText, CLASSES, existing, 'CSV');
  assert(result.status === 'ok', 'Plan failed.');
  assertEqual(result.plan.rows[0].state, 'duplicate-retained', 'CSV overwrote an HRIS record.');
  assertEqual(result.plan.summary.updated, 0, 'An HRIS record was counted as updated.');

  const applied = applyPeopleImport(result.plan, existing, createCsvSource('x.csv', NOW, 'src-4'), NOW, newId);
  assertEqual(applied.people.length, 1, 'A duplicate record was created.');
  assertEqual(applied.people[0].role, 'Chief Executive', 'The HRIS record was modified.');
  assertEqual(applied.people[0].sourceType, 'HRIS', 'The HRIS provenance was overwritten.');
});

check('30. Multiple classes in one cell are split and resolved', () => {
  const csvText = 'first_name,last_name,email,relationship_class\nAda,Obi,ada@example.com,Executive Leadership;VIP Clients\n';
  const result = planPeopleImport(csvText, CLASSES, [], 'CSV');
  assert(result.status === 'ok', 'Plan failed.');
  const ids = result.plan.rows[0].draft?.relationshipClassIds ?? [];
  assertEqual(ids.length, 2, 'Multiple classes were not split.');
  assert(ids.includes('class-exec') && ids.includes('class-vip'), 'The wrong classes resolved.');
  assertEqual(result.plan.rows[0].state, 'ready', 'The row was not ready.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`People validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('People validation passed.\n');
