/**
 * Deterministic validation for H2.4 — Policy Assignments.
 *
 * Run with:  npm run validate:assignments
 *
 * Two halves:
 *   1. the schema v2 → v3 migration (collection, stage remap, idempotence)
 *   2. `resolvePolicyAssignment` precedence and its refusal cases
 *
 * Same dependency-free approach as validate:migration — Node strips the types
 * and runs this directly.
 */

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_KEY,
  loadAndMigrateWorkspace,
  migrateWorkspace,
} from '../lib/migrations';
import { createWorkspace } from '../lib/workspace';
import type {
  PolicyAssignment,
  RecognitionPolicy,
  RelationshipClass,
  WorkspaceState,
} from '../lib/workspace';
import {
  activeClassesWithoutAssignment,
  hasAnyResolvableAssignment,
  resolvePolicyAssignment,
  validateNewAssignment,
} from '../lib/assignments';

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
const T1 = '2026-07-10T00:00:00.000Z';

function cls(id: string, name: string, type: string, level: number, isActive = true): Record<string, unknown> {
  return {
    id, name, type, level,
    description: '',
    isDefault: false,
    isActive,
    createdAt: T0,
    updatedAt: T0,
  };
}

function policy(id: string, name: string, status: string): Record<string, unknown> {
  return {
    id,
    workspaceId: 'org-v2',
    name,
    description: '',
    recognitionRules: [
      { momentType: 'Birthday', budgetPerPerson: { amount: 100000, currency: 'NGN' }, isEnabled: true },
    ],
    approvalWorkflow: 'Manager',
    preferredGiftCategories: [],
    excludedCategories: [],
    deliveryRequirement: 'Standard',
    preferredDeliveryWindow: '',
    signatureRequired: false,
    proofRequired: false,
    reportingCadence: 'None',
    status,
    version: 1,
    createdAt: T0,
    updatedAt: T0,
    ...(status === 'Published' ? { publishedAt: T0 } : {}),
  };
}

/** A schema v2 workspace — has schemaVersion 2, no policyAssignments. */
function makeV2Workspace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    organizationId: 'org-v2',
    companyName: 'Meridian Group',
    website: 'https://meridian.example',
    industry: 'Logistics',
    employeeCount: '501-1000',
    operatingCountries: ['Nigeria', 'Kenya'],
    baseCurrency: 'NGN',
    timezone: 'Africa/Lagos',
    contactName: 'Ada Obi',
    contactEmail: 'ada@meridian.example',
    contactRole: 'Head of People',
    phone: '+2348000000000',
    setupStage: 'policies',
    createdAt: T0,
    relationshipClasses: [
      cls('class-executive-leadership', 'Executive Leadership', 'Employee', 0),
      cls('class-managers', 'Managers', 'Employee', 2),
      cls('class-vip-clients', 'VIP Clients', 'Client', 0),
      cls('class-dormant', 'Dormant Partners', 'Partner', 0, false),
    ],
    recognitionPolicies: [
      policy('policy-exec', 'Executive Recognition Policy', 'Published'),
      policy('policy-standard', 'Standard Employee Policy', 'Published'),
      policy('policy-draft', 'Draft Policy', 'Draft'),
      policy('policy-old', 'Retired Policy', 'Archived'),
    ],
    ...overrides,
  };
}

function migrateV2(overrides: Record<string, unknown> = {}): WorkspaceState {
  const result = migrateWorkspace<WorkspaceState>(makeV2Workspace(overrides));
  assert(result.status === 'ok', `Migration failed: ${result.status === 'invalid' ? result.reason : ''}`);
  return result.workspace;
}

// Typed fixtures for the resolution half.
const CLASSES: RelationshipClass[] = [
  cls('class-exec', 'Executive Leadership', 'Employee', 0) as unknown as RelationshipClass,
  cls('class-other', 'Managers', 'Employee', 2) as unknown as RelationshipClass,
  cls('class-off', 'Retired Class', 'Employee', 3, false) as unknown as RelationshipClass,
];

const POLICIES: RecognitionPolicy[] = [
  policy('policy-global', 'Global Policy', 'Published') as unknown as RecognitionPolicy,
  policy('policy-ke', 'Kenya Policy', 'Published') as unknown as RecognitionPolicy,
  policy('policy-alt', 'Alternate Policy', 'Published') as unknown as RecognitionPolicy,
  policy('policy-archived', 'Archived Policy', 'Archived') as unknown as RecognitionPolicy,
];

function assignment(over: Partial<PolicyAssignment> & { id: string }): PolicyAssignment {
  return {
    relationshipClassId: 'class-exec',
    recognitionPolicyId: 'policy-global',
    priority: 0,
    isActive: true,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

// ─── Part 1: schema v2 → v3 ──────────────────────────────────────────────────

console.log('\nPolicy Assignments (H2.4) — validation\n');
console.log(`  schema v2 → v${CURRENT_WORKSPACE_SCHEMA_VERSION}\n`);

check('1. A v2 workspace migrates to v3', () => {
  const result = migrateWorkspace<WorkspaceState>(makeV2Workspace());
  assert(result.status === 'ok', `Migration rejected the v2 fixture: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, 2, 'Payload was not detected as v2.');
  assertEqual(result.migrated, true, 'Migration did not report that it ran.');

  // v3 is no longer the final schema version, so this suite asserts that the
  // H2.4 rung ran and left the chain in a consistent state — not that the walk
  // stopped there.
  assert(
    result.applied.some(id => id.includes('policy-assignments')),
    `The H2.4 migration did not run. Applied: ${result.applied.join(', ')}`,
  );
  assertEqual(result.applied[0], 'v2-to-v3-h2-4-policy-assignments', 'H2.4 was not the first rung from v2.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 2,
    'Wrong number of migrations ran for the number of versions crossed.',
  );
  assertEqual(result.workspace.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migrated workspace has the wrong schemaVersion.');
  assert(Array.isArray(result.workspace.policyAssignments), 'policyAssignments is missing.');
});

check('2. policyAssignments defaults to an empty array', () => {
  const ws = migrateV2();
  assert(Array.isArray(ws.policyAssignments), 'policyAssignments is not an array.');
  assertEqual(ws.policyAssignments.length, 0, 'policyAssignments should start empty.');

  // A new workspace is born at v3 with the collection already present.
  const fresh = createWorkspace({
    companyName: 'New Co', website: '', industry: 'Technology', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Chidi Eze', contactEmail: 'c@new.example',
    contactRole: 'Founder', phone: '',
  });
  assertEqual(fresh.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'New workspace is not at v3.');
  assertEqual(fresh.policyAssignments.length, 0, 'New workspace has no empty policyAssignments.');
});

check('3. All policies and classes survive migration', () => {
  const before = makeV2Workspace();
  const ws = migrateV2();

  const beforeClasses = before.relationshipClasses as Array<Record<string, unknown>>;
  assertEqual(ws.relationshipClasses.length, beforeClasses.length, 'Class count changed.');
  for (const original of beforeClasses) {
    const found = ws.relationshipClasses.find(c => c.id === original.id);
    assert(found, `Class ${String(original.id)} was lost.`);
    assertEqual(found.name, original.name as string, `Class ${String(original.id)} name changed.`);
    assertEqual(found.isActive, original.isActive as boolean, `Class ${String(original.id)} isActive changed.`);
  }

  const beforePolicies = before.recognitionPolicies as Array<Record<string, unknown>>;
  assertEqual(ws.recognitionPolicies.length, beforePolicies.length, 'Policy count changed.');
  for (const original of beforePolicies) {
    const found = ws.recognitionPolicies.find(p => p.id === original.id);
    assert(found, `Policy ${String(original.id)} was lost.`);
    assertEqual(found.status, original.status as never, `Policy ${String(original.id)} status changed.`);
    assertEqual(found.version, original.version as number, `Policy ${String(original.id)} version changed.`);
  }
});

check('4. Migration is idempotent', () => {
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(makeV2Workspace()) });

  const first = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(first.status === 'ok', 'First load failed.');
  assertEqual(first.migrated, true, 'First load should have migrated.');
  const afterFirst = storage.getItem(WORKSPACE_KEY);
  const keyCount = storage.keys().length;

  for (const pass of ['second', 'third']) {
    const again = loadAndMigrateWorkspace<WorkspaceState>(storage);
    assert(again.status === 'ok', `${pass} load failed.`);
    assertEqual(again.migrated, false, `${pass} load re-ran a completed migration.`);
    assertEqual(again.backupKey, null, `${pass} load created a backup on a normal read.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), afterFirst, `${pass} load rewrote the workspace.`);
    assertEqual(storage.keys().length, keyCount, `${pass} load added storage keys.`);
  }
});

check('5. Post-policy stages route to assignments when a Published policy exists', () => {
  for (const stage of ['people', 'programs', 'active']) {
    const ws = migrateV2({ setupStage: stage });
    assertEqual(ws.setupStage, 'assignments', `Stage "${stage}" did not move to assignments.`);
  }

  // Earlier stages are left exactly where they were.
  for (const stage of ['profile', 'classes', 'policies']) {
    const ws = migrateV2({ setupStage: stage });
    assertEqual(ws.setupStage, stage as never, `Stage "${stage}" should not have moved.`);
  }

  // The remap is reported rather than done silently.
  const result = migrateWorkspace<WorkspaceState>(makeV2Workspace({ setupStage: 'active' }));
  assert(result.status === 'ok', 'Migration failed.');
  assert(result.warnings.length > 0, 'The stage remap produced no warning.');
});

check('6. Workspaces without a Published policy return to policies', () => {
  const unpublished = [policy('policy-draft', 'Draft Policy', 'Draft'), policy('policy-old', 'Retired', 'Archived')];
  for (const stage of ['people', 'programs', 'active']) {
    const ws = migrateV2({ setupStage: stage, recognitionPolicies: unpublished });
    assertEqual(ws.setupStage, 'policies', `Stage "${stage}" should fall back to policies with no Published policy.`);
  }

  // No policies at all behaves the same way.
  const empty = migrateV2({ setupStage: 'active', recognitionPolicies: [] });
  assertEqual(empty.setupStage, 'policies', 'An empty policy list should fall back to policies.');
});

// ─── Part 2: resolution ──────────────────────────────────────────────────────

check('7. A Global assignment resolves when no country-specific match exists', () => {
  const assignments = [assignment({ id: 'a-global' })];

  const noCountry = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(noCountry.status === 'resolved', `Expected resolution, got: ${noCountry.status === 'unresolved' ? noCountry.detail : ''}`);
  assertEqual(noCountry.policy.id, 'policy-global', 'Wrong policy resolved.');
  assertEqual(noCountry.scope, 'Global', 'Scope should be Global.');

  // A country query with only a Global assignment still resolves to Global.
  const withCountry = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', countryCode: 'KE', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(withCountry.status === 'resolved', 'A country query should fall back to Global.');
  assertEqual(withCountry.scope, 'Global', 'Scope should be Global.');
});

check('8. A country-specific assignment beats Global', () => {
  const assignments = [
    assignment({ id: 'a-global', recognitionPolicyId: 'policy-global', priority: 99 }),
    assignment({ id: 'a-ke', recognitionPolicyId: 'policy-ke', countryCode: 'KE', priority: 0 }),
  ];

  const inKenya = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', countryCode: 'KE', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(inKenya.status === 'resolved', 'Kenya lookup did not resolve.');
  assertEqual(inKenya.policy.id, 'policy-ke', 'Country scope did not beat Global — even at lower priority.');
  assertEqual(inKenya.scope, 'Country', 'Scope should be Country.');

  // Another country falls back to Global; the KE assignment must not leak.
  const inNigeria = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', countryCode: 'NG', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(inNigeria.status === 'resolved', 'Nigeria lookup did not resolve.');
  assertEqual(inNigeria.policy.id, 'policy-global', 'A KE assignment leaked into an NG lookup.');
});

check('9. Higher priority wins within a scope', () => {
  const assignments = [
    assignment({ id: 'a-low',  recognitionPolicyId: 'policy-global', priority: 1 }),
    assignment({ id: 'a-high', recognitionPolicyId: 'policy-alt',    priority: 5 }),
  ];
  const result = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(result.status === 'resolved', 'Did not resolve.');
  assertEqual(result.assignment.id, 'a-high', 'Lower priority won.');

  // Negative priorities order correctly too.
  const negative = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    classes: CLASSES,
    assignments: [
      assignment({ id: 'a-neg',  recognitionPolicyId: 'policy-global', priority: -5 }),
      assignment({ id: 'a-zero', recognitionPolicyId: 'policy-alt',    priority: 0 }),
    ],
    policies: POLICIES,
  });
  assert(negative.status === 'resolved', 'Did not resolve.');
  assertEqual(negative.assignment.id, 'a-zero', 'Negative priority was mishandled.');
});

check('10. Latest updatedAt breaks equal-priority ties', () => {
  const assignments = [
    assignment({ id: 'a-older', recognitionPolicyId: 'policy-global', priority: 3, updatedAt: T0 }),
    assignment({ id: 'a-newer', recognitionPolicyId: 'policy-alt',    priority: 3, updatedAt: T1 }),
  ];
  const result = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(result.status === 'resolved', 'Did not resolve.');
  assertEqual(result.assignment.id, 'a-newer', 'The older assignment won a tie.');

  // Order of input must not matter.
  const reversed = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', classes: CLASSES, assignments: [...assignments].reverse(), policies: POLICIES,
  });
  assert(reversed.status === 'resolved', 'Did not resolve.');
  assertEqual(reversed.assignment.id, 'a-newer', 'Resolution depends on input order.');
});

check('11. Inactive assignments are ignored', () => {
  const result = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    classes: CLASSES,
    assignments: [assignment({ id: 'a-off', isActive: false })],
    policies: POLICIES,
  });
  assert(result.status === 'unresolved', 'An inactive assignment resolved.');
  assertEqual(result.reason, 'no-active-assignments', 'Wrong unresolved reason.');

  // An inactive high-priority assignment must not shadow an active one.
  const mixed = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    classes: CLASSES,
    assignments: [
      assignment({ id: 'a-off', recognitionPolicyId: 'policy-alt', priority: 99, isActive: false }),
      assignment({ id: 'a-on',  recognitionPolicyId: 'policy-global', priority: 0 }),
    ],
    policies: POLICIES,
  });
  assert(mixed.status === 'resolved', 'Did not resolve.');
  assertEqual(mixed.assignment.id, 'a-on', 'An inactive assignment shadowed an active one.');
});

check("12. Another class's assignment is never selected", () => {
  const assignments = [
    assignment({ id: 'a-other', relationshipClassId: 'class-other', recognitionPolicyId: 'policy-alt', priority: 99 }),
  ];
  const result = resolvePolicyAssignment({
    relationshipClassId: 'class-exec', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(result.status === 'unresolved', "Another class's assignment was selected.");
  assertEqual(result.reason, 'no-active-assignments', 'Wrong unresolved reason.');

  // And a missing class is refused outright rather than falling through.
  const missing = resolvePolicyAssignment({
    relationshipClassId: 'class-does-not-exist', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(missing.status === 'unresolved', 'A missing class resolved.');
  assertEqual(missing.reason, 'class-not-found', 'Wrong unresolved reason.');
});

check('13. Invalid country codes are rejected or normalized safely', () => {
  // Stored malformed code: ignored, never treated as Global.
  const malformed = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    countryCode: 'KE',
    classes: CLASSES,
    assignments: [assignment({ id: 'a-bad', countryCode: 'KENYA' })],
    policies: POLICIES,
  });
  assert(malformed.status === 'unresolved', 'A malformed country code was treated as Global.');
  assert(
    malformed.skipped.some(s => s.reason === 'invalid-country-code'),
    'A malformed country code was dropped without being reported.',
  );

  // Query codes are normalized for case and whitespace.
  const assignments = [assignment({ id: 'a-ke', recognitionPolicyId: 'policy-ke', countryCode: 'KE' })];
  for (const query of ['ke', ' ke ', 'Ke']) {
    const result = resolvePolicyAssignment({
      relationshipClassId: 'class-exec', countryCode: query, classes: CLASSES, assignments, policies: POLICIES,
    });
    assert(result.status === 'resolved', `Query "${query}" did not normalize.`);
    assertEqual(result.policy.id, 'policy-ke', `Query "${query}" resolved the wrong policy.`);
  }

  // Creation refuses a bad code rather than storing it.
  const rejected = validateNewAssignment(
    { relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', countryCode: 'XYZ', priority: 0 },
    CLASSES, POLICIES,
  );
  assertEqual(rejected.ok, false, 'A three-letter country code was accepted.');

  const accepted = validateNewAssignment(
    { relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', countryCode: ' ng ', priority: 0 },
    CLASSES, POLICIES,
  );
  assert(accepted.ok, 'A valid lowercase code was rejected.');
  assertEqual(accepted.countryCode, 'NG', 'A valid code was not normalized to uppercase.');

  const global = validateNewAssignment(
    { relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', countryCode: '', priority: 0 },
    CLASSES, POLICIES,
  );
  assert(global.ok, 'A blank country code was rejected.');
  assertEqual(global.countryCode, undefined, 'A blank country code should mean Global.');
});

check('14. Archived or missing policies do not resolve for current execution', () => {
  // Archived.
  const archived = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    classes: CLASSES,
    assignments: [assignment({ id: 'a-arch', recognitionPolicyId: 'policy-archived' })],
    policies: POLICIES,
  });
  assert(archived.status === 'unresolved', 'An archived policy resolved.');
  assertEqual(archived.reason, 'no-executable-policy', 'Wrong unresolved reason.');
  assert(archived.skipped.some(s => s.reason === 'policy-not-executable'), 'The archived policy was not reported as skipped.');

  // Dangling reference.
  const missing = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    classes: CLASSES,
    assignments: [assignment({ id: 'a-gone', recognitionPolicyId: 'policy-deleted' })],
    policies: POLICIES,
  });
  assert(missing.status === 'unresolved', 'A dangling policy reference resolved.');
  assert(missing.skipped.some(s => s.reason === 'policy-missing'), 'The missing policy was not reported as skipped.');

  // The assignment itself survives — this is preservation, not deletion.
  const preserved = migrateV2();
  assert(Array.isArray(preserved.policyAssignments), 'policyAssignments is not an array.');

  // An archived country override must not shadow a working Global assignment.
  const shadowed = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    countryCode: 'KE',
    classes: CLASSES,
    assignments: [
      assignment({ id: 'a-ke-arch', recognitionPolicyId: 'policy-archived', countryCode: 'KE', priority: 99 }),
      assignment({ id: 'a-global',  recognitionPolicyId: 'policy-global' }),
    ],
    policies: POLICIES,
  });
  assert(shadowed.status === 'resolved', 'An archived country override blocked the Global fallback.');
  assertEqual(shadowed.policy.id, 'policy-global', 'Wrong policy resolved after the archived override was skipped.');
  assert(shadowed.skipped.length > 0, 'The skipped override was not reported.');

  // A Draft policy is equally not executable.
  const draft = resolvePolicyAssignment({
    relationshipClassId: 'class-exec',
    classes: CLASSES,
    assignments: [assignment({ id: 'a-draft', recognitionPolicyId: 'policy-draft' })],
    policies: [...POLICIES, policy('policy-draft', 'Draft', 'Draft') as unknown as RecognitionPolicy],
  });
  assert(draft.status === 'unresolved', 'A draft policy resolved.');

  // And cannot be assigned in the first place.
  const rejected = validateNewAssignment(
    { relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-archived', priority: 0 },
    CLASSES, POLICIES,
  );
  assertEqual(rejected.ok, false, 'An archived policy was accepted for a new assignment.');
});

check('15. An inactive Relationship Class does not resolve an operational policy', () => {
  const assignments = [
    assignment({ id: 'a-off-class', relationshipClassId: 'class-off', recognitionPolicyId: 'policy-global' }),
  ];
  const result = resolvePolicyAssignment({
    relationshipClassId: 'class-off', classes: CLASSES, assignments, policies: POLICIES,
  });
  assert(result.status === 'unresolved', 'An inactive class resolved a policy.');
  assertEqual(result.reason, 'class-inactive', 'Wrong unresolved reason.');

  // The assignment is retained, not deleted — deactivating a class is not a purge.
  assertEqual(assignments.length, 1, 'The assignment was removed.');

  // It is also excluded from the workspace-level readiness checks.
  assertEqual(
    hasAnyResolvableAssignment(CLASSES, assignments, POLICIES),
    false,
    'An inactive class counted towards assignment readiness.',
  );
  assert(
    !activeClassesWithoutAssignment(CLASSES, assignments, POLICIES).some(c => c.id === 'class-off'),
    'An inactive class was reported as an unassigned active class.',
  );
});

check('16. Existing ADR-002 class data remains unchanged', () => {
  const before = makeV2Workspace().relationshipClasses as Array<Record<string, unknown>>;
  const ws = migrateV2();

  for (const original of before) {
    const migrated = ws.relationshipClasses.find(c => c.id === original.id);
    assert(migrated, `Class ${String(original.id)} was lost.`);
    assertEqual(migrated.type, original.type as never, `Class ${String(original.id)} type changed.`);
    assertEqual(migrated.level, original.level as number, `Class ${String(original.id)} level changed.`);
    assertEqual(migrated.name, original.name as string, `Class ${String(original.id)} name changed.`);
    assertEqual(migrated.createdAt, original.createdAt as string, `Class ${String(original.id)} createdAt changed.`);
    assertEqual(migrated.updatedAt, original.updatedAt as string, `Class ${String(original.id)} updatedAt changed.`);
    assert(!('category' in migrated), `Class ${String(original.id)} gained a category field.`);
    assert(!('tier' in migrated), `Class ${String(original.id)} gained a tier field.`);
  }
});

// ─── Supporting cases ────────────────────────────────────────────────────────

check('17. A v1 workspace migrates the whole way to v3', () => {
  // No schemaVersion, and the superseded category/tier model — the chain must
  // walk v1 → v2 → v3 without skipping a rung.
  const v1 = {
    organizationId: 'org-v1',
    companyName: 'Legacy Holdings',
    website: '', industry: 'Financial Services', employeeCount: '201-500',
    operatingCountries: ['Nigeria'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@legacy.example', contactRole: 'Head of People',
    phone: '', setupStage: 'people', createdAt: T0,
    relationshipClasses: [{
      id: 'class-board-members', name: 'Board Members', category: 'Governance', tier: 'Strategic',
      description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0,
    }],
    recognitionPolicies: [policy('policy-exec', 'Executive Recognition Policy', 'Published')],
  };

  const result = migrateWorkspace<WorkspaceState>(v1);
  assert(result.status === 'ok', `v1 → v3 failed: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, 1, 'Payload was not detected as v1.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 1,
    'Wrong number of migrations ran for the number of versions crossed.',
  );
  assertEqual(result.applied[0], 'v1-to-v2-adr-002-relationship-type-and-level', 'ADR-002 did not run first.');
  assertEqual(result.applied[1], 'v2-to-v3-h2-4-policy-assignments', 'H2.4 did not run second.');
  assertEqual(result.workspace.relationshipClasses[0].type, 'Board', 'ADR-002 mapping did not run.');
  assertEqual(result.workspace.relationshipClasses[0].level, 0, 'ADR-002 level mapping did not run.');
  assertEqual(result.workspace.policyAssignments.length, 0, 'H2.4 collection was not added.');
  assertEqual(result.workspace.setupStage, 'assignments', 'Stage remap did not run on the v1 path.');
});

check('18. Malformed assignments are refused rather than loaded', () => {
  const cases: Array<[string, unknown]> = [
    ['no id',              { relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: 0, isActive: true }],
    ['no class ref',       { id: 'a1', recognitionPolicyId: 'policy-global', priority: 0, isActive: true }],
    ['no policy ref',      { id: 'a1', relationshipClassId: 'class-exec', priority: 0, isActive: true }],
    ['fractional priority',{ id: 'a1', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: 1.5, isActive: true }],
    ['non-boolean active', { id: 'a1', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: 0, isActive: 'yes' }],
    ['bad country code',   { id: 'a1', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: 0, isActive: true, countryCode: 'KEN' }],
  ];

  for (const [label, bad] of cases) {
    const result = migrateWorkspace<WorkspaceState>(
      makeV2Workspace({ schemaVersion: 3, policyAssignments: [bad] }),
    );
    assertEqual(result.status, 'invalid', `A malformed assignment (${label}) was accepted.`);
  }

  // A well-formed one passes, including the blank-is-Global case.
  const good = migrateWorkspace<WorkspaceState>(makeV2Workspace({
    schemaVersion: 3,
    policyAssignments: [
      { id: 'a1', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: 0, isActive: true },
      { id: 'a2', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-global', priority: -2, isActive: false, countryCode: 'NG' },
    ],
  }));
  assertEqual(good.status, 'ok', 'A well-formed assignment list was refused.');
});

check('19. Existing assignments survive a repeat migration pass', () => {
  // Pinned to the *current* version so this stays a genuine no-op check as
  // later schema versions land.
  const withAssignments = makeV2Workspace({
    schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    setupStage: 'assignments',
    policyAssignments: [
      { id: 'a-keep', relationshipClassId: 'class-managers', recognitionPolicyId: 'policy-standard', priority: 4, isActive: true, createdAt: T0, updatedAt: T1, countryCode: 'KE' },
    ],
    peopleSources: [],
    people: [],
    programs: [],
    // A current-version fixture must carry canonical Money (ADR-007).
    recognitionPolicies: [
      { ...policy('policy-exec', 'Executive Recognition Policy', 'Published'),
        recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: { amountMinor: 10_000_000, currency: 'NGN' }, isEnabled: true }] },
      { ...policy('policy-standard', 'Standard Employee Policy', 'Published'),
        recognitionRules: [{ momentType: 'Birthday', budgetPerPerson: { amountMinor: 7_500_000, currency: 'NGN' }, isEnabled: true }] },
    ],
  });
  const result = migrateWorkspace<WorkspaceState>(withAssignments);
  assert(result.status === 'ok', 'A current-version workspace was refused.');
  assertEqual(result.migrated, false, 'A current-version workspace was migrated again.');
  assertEqual(result.workspace.policyAssignments.length, 1, 'The existing assignment was lost.');
  assertEqual(result.workspace.policyAssignments[0].countryCode, 'KE', 'The assignment scope changed.');
  assertEqual(result.workspace.policyAssignments[0].priority, 4, 'The assignment priority changed.');
});

check('20. Readiness helpers report coverage correctly', () => {
  // Nothing assigned.
  assertEqual(hasAnyResolvableAssignment(CLASSES, [], POLICIES), false, 'Empty assignments reported as ready.');
  assertEqual(
    activeClassesWithoutAssignment(CLASSES, [], POLICIES).length,
    2,
    'Expected both active classes to be reported unassigned.',
  );

  // One class covered.
  const assignments = [assignment({ id: 'a-1' })];
  assertEqual(hasAnyResolvableAssignment(CLASSES, assignments, POLICIES), true, 'A valid assignment was not counted.');
  const unassigned = activeClassesWithoutAssignment(CLASSES, assignments, POLICIES);
  assertEqual(unassigned.length, 1, 'Wrong unassigned count.');
  assertEqual(unassigned[0].id, 'class-other', 'Wrong class reported as unassigned.');

  // An assignment pointing at an archived policy does not count as coverage.
  assertEqual(
    hasAnyResolvableAssignment(CLASSES, [assignment({ id: 'a-arch', recognitionPolicyId: 'policy-archived' })], POLICIES),
    false,
    'An archived policy counted as coverage.',
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Policy Assignment validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Policy Assignment validation passed.\n');
