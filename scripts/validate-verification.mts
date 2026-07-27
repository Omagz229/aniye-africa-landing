/**
 * Deterministic validation for EX-C1 — verification-gate safety.
 *
 * Run with:  npm run validate:verification
 *
 * This is a data-safety property, so it is proven here rather than left to a
 * React build: the decision layer takes injected storage, and an in-memory Map
 * stands in for localStorage.
 */

import { WORKSPACE_KEY } from '../lib/migrations';
import { createWorkspace } from '../lib/workspace';
import type { NewWorkspaceInput, WorkspaceState } from '../lib/workspace';
import {
  hasMeaningfulConfiguration,
  resolveVerification,
  runVerification,
  setupStageHref,
  workspaceFootprint,
} from '../lib/verification';

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

const ASSESSMENT: NewWorkspaceInput = {
  companyName: 'Meridian Group',
  website: 'https://meridian.example',
  industry: 'Logistics',
  employeeCount: '501-1000',
  operatingCountries: ['Nigeria', 'Kenya'],
  contactName: 'Ada Obi',
  contactEmail: 'ada@meridian.example',
  contactRole: 'Head of People',
  phone: '+2348000000000',
};

/** A workspace an operator has genuinely worked in — the thing at risk. */
function configuredWorkspace(): WorkspaceState {
  const base = createWorkspace(ASSESSMENT);
  return {
    ...base,
    organizationId: 'org-configured',
    setupStage: 'people',
    recognitionPolicies: [{
      id: 'policy-exec', workspaceId: 'org-configured', name: 'Executive Recognition Policy',
      description: '', recognitionRules: [
        { momentType: 'Birthday', budgetPerPerson: { amountMinor: 50_000_000, currency: 'NGN' }, isEnabled: true },
      ],
      approvalWorkflow: 'Executive', preferredGiftCategories: [], excludedCategories: [],
      deliveryRequirement: 'HandDelivered', preferredDeliveryWindow: '', signatureRequired: true,
      proofRequired: true, reportingCadence: 'Quarterly', status: 'Published', version: 1,
      createdAt: T0, updatedAt: T0, publishedAt: T0,
    }],
    policyAssignments: [{
      id: 'assignment-1', relationshipClassId: 'class-executive-leadership',
      recognitionPolicyId: 'policy-exec', countryCode: 'KE', priority: 3,
      isActive: true, createdAt: T0, updatedAt: T0,
    }],
    peopleSources: [{
      id: 'source-csv-1', name: 'Q3 headcount', type: 'CSV', status: 'Active',
      filename: 'Q3 headcount.csv', importedAt: T0, createdAt: T0, updatedAt: T0,
    }],
    people: [{
      id: 'person-1', firstName: 'Ada', lastName: 'Obi', email: 'ada@meridian.example',
      relationshipClassIds: ['class-executive-leadership'], sourceId: 'source-csv-1',
      sourceType: 'CSV', status: 'Active', createdAt: T0, updatedAt: T0,
    }],
  };
}

console.log('\nVerification-gate safety (EX-C1) — validation\n');

// ─── Required cases ──────────────────────────────────────────────────────────

check('1. No existing workspace → exactly one workspace is created', () => {
  const storage = createMemoryStorage();
  const outcome = runVerification(storage, ASSESSMENT);

  assertEqual(outcome.action, 'created', 'An empty device did not create a workspace.');
  assertEqual(storage.keys().length, 1, 'Expected exactly one storage key to be written.');
  assertEqual(storage.keys()[0], WORKSPACE_KEY, 'The wrong storage key was written.');

  const stored = JSON.parse(storage.getItem(WORKSPACE_KEY)!) as WorkspaceState;
  assertEqual(stored.companyName, 'Meridian Group', 'The assessment did not carry into the workspace.');
  assertEqual(stored.contactEmail, 'ada@meridian.example', 'The contact did not carry through.');
  assertEqual(stored.setupStage, 'profile', 'A new workspace should start at the profile stage.');
  assert(stored.relationshipClasses.length > 0, 'A new workspace was not seeded with groups.');
  assertEqual(outcome.href, '/workspace/profile', 'A new workspace was not sent to the profile step.');
});

check('2. Existing workspace → no collection is overwritten', () => {
  const existing = configuredWorkspace();
  const before = JSON.stringify(existing);
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: before });

  const outcome = runVerification(storage, {
    ...ASSESSMENT,
    companyName: 'A Completely Different Company',
    contactEmail: 'someone.else@example.com',
  });

  assertEqual(outcome.action, 'continued', 'An existing workspace was replaced.');
  assertEqual(storage.getItem(WORKSPACE_KEY), before, 'Stored workspace bytes changed.');
  assertEqual(storage.keys().length, 1, 'Verification wrote an extra storage key.');

  // The incoming assessment must not leak into the stored record.
  const stored = JSON.parse(storage.getItem(WORKSPACE_KEY)!) as WorkspaceState;
  assertEqual(stored.companyName, 'Meridian Group', 'The incoming assessment overwrote the company name.');
  assertEqual(stored.contactEmail, 'ada@meridian.example', 'The incoming assessment overwrote the contact.');
  assertEqual(stored.organizationId, 'org-configured', 'The organization id changed.');
});

check('3. Reopening the same verification link is idempotent', () => {
  const storage = createMemoryStorage();

  const first = runVerification(storage, ASSESSMENT);
  assertEqual(first.action, 'created', 'First open did not create a workspace.');
  const afterFirst = storage.getItem(WORKSPACE_KEY);

  // Simulate the operator working in the workspace before returning to the link.
  const worked = { ...JSON.parse(afterFirst!), setupStage: 'assignments' } as WorkspaceState;
  storage.setItem(WORKSPACE_KEY, JSON.stringify(worked));
  const afterWork = storage.getItem(WORKSPACE_KEY);

  for (const pass of ['second', 'third', 'fourth']) {
    const again = runVerification(storage, ASSESSMENT);
    assertEqual(again.action, 'continued', `${pass} open created a workspace.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), afterWork, `${pass} open modified stored data.`);
    assertEqual(storage.keys().length, 1, `${pass} open added a storage key.`);
  }
});

check('4. Existing groups, rules, assignments and people remain byte-equivalent', () => {
  const existing = configuredWorkspace();
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(existing) });

  runVerification(storage, ASSESSMENT);
  runVerification(storage, ASSESSMENT);

  const after = JSON.parse(storage.getItem(WORKSPACE_KEY)!) as WorkspaceState;

  for (const collection of ['relationshipClasses', 'recognitionPolicies', 'policyAssignments', 'peopleSources', 'people'] as const) {
    assertEqual(
      JSON.stringify(after[collection]),
      JSON.stringify(existing[collection]),
      `Collection "${collection}" was not byte-equivalent after verification.`,
    );
  }

  const footprint = workspaceFootprint(after);
  assertEqual(footprint.recognitionPolicies, 1, 'A recognition rule was lost.');
  assertEqual(footprint.policyAssignments, 1, 'An assignment was lost.');
  assertEqual(footprint.people, 1, 'A person was lost.');
  assertEqual(footprint.relationshipClasses, existing.relationshipClasses.length, 'A group was lost.');
  assertEqual(after.setupStage, 'people', 'Setup progress was reset.');
});

check('5. The operator is directed to the correct unfinished setup step', () => {
  const cases: Array<[WorkspaceState['setupStage'], string]> = [
    ['profile',     '/workspace/profile'],
    ['classes',     '/workspace/classes'],
    ['policies',    '/workspace/policies'],
    ['assignments', '/workspace/assignments'],
    ['people',      '/workspace/people'],
    // `programs` has no route. It must resolve to the overview, which states
    // honestly that the capability is not available — never to a 404.
    ['programs',    '/workspace'],
    ['active',      '/workspace'],
  ];

  for (const [stage, expected] of cases) {
    assertEqual(setupStageHref(stage), expected, `Stage "${stage}" resolved to the wrong route.`);

    const storage = createMemoryStorage({
      [WORKSPACE_KEY]: JSON.stringify({ ...configuredWorkspace(), setupStage: stage }),
    });
    const outcome = runVerification(storage, ASSESSMENT);
    assertEqual(outcome.href, expected, `A workspace at "${stage}" was sent to the wrong route.`);
  }
});

// ─── Supporting cases ────────────────────────────────────────────────────────

check('6. resolveVerification is pure — it never writes', () => {
  const existing = configuredWorkspace();
  const snapshot = JSON.stringify(existing);

  const outcome = resolveVerification(existing, ASSESSMENT);
  assertEqual(outcome.action, 'continued', 'An existing workspace was replaced.');
  assertEqual(JSON.stringify(existing), snapshot, 'The input workspace object was mutated.');
  assert(outcome.workspace === existing, 'The existing workspace was copied rather than returned.');

  const fresh = resolveVerification(null, ASSESSMENT);
  assertEqual(fresh.action, 'created', 'A null workspace did not produce a creation.');
});

check('7. Unreadable stored data is never overwritten by verification', () => {
  // The migration runner quarantines a bad payload. Verification must not then
  // undo that protection by treating "unreadable" as "absent".
  for (const payload of ['{not json', 'null', '{}', '[1,2,3]']) {
    const storage = createMemoryStorage({ [WORKSPACE_KEY]: payload });
    const outcome = runVerification(storage, ASSESSMENT);
    assertEqual(outcome.action, 'continued', `Payload ${payload} was treated as an empty device.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), payload, `Payload ${payload} was overwritten.`);
  }
});

check('8. A freshly created workspace is not reported as configured', () => {
  const fresh = createWorkspace(ASSESSMENT);
  assertEqual(hasMeaningfulConfiguration(fresh), false, 'A brand-new workspace was reported as configured.');

  assertEqual(hasMeaningfulConfiguration(configuredWorkspace()), true, 'A worked-in workspace was reported as empty.');
  assertEqual(
    hasMeaningfulConfiguration({ ...fresh, setupStage: 'classes' }),
    true,
    'Progress past the profile step should count as configuration.',
  );
  assertEqual(
    hasMeaningfulConfiguration({ ...fresh, people: configuredWorkspace().people }),
    true,
    'Having people should count as configuration.',
  );
});

check('9. A legacy stored workspace is migrated, not replaced', () => {
  // A schema v1 payload from H2.3 must survive a stale verification link.
  const legacy = {
    organizationId: 'org-legacy', companyName: 'Legacy Holdings',
    website: '', industry: 'Financial Services', employeeCount: '201-500',
    operatingCountries: ['Nigeria'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@legacy.example', contactRole: 'Head of People',
    phone: '', setupStage: 'classes', createdAt: T0,
    relationshipClasses: [{
      id: 'class-board-members', name: 'Board Members', category: 'Governance', tier: 'Strategic',
      description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0,
    }],
    recognitionPolicies: [],
  };
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(legacy) });

  const outcome = runVerification(storage, ASSESSMENT);
  assertEqual(outcome.action, 'continued', 'A legacy workspace was replaced instead of migrated.');
  assertEqual(outcome.workspace.companyName, 'Legacy Holdings', 'The legacy company name was lost.');
  assertEqual(outcome.workspace.relationshipClasses[0].type, 'Board', 'ADR-002 migration did not run.');
  assertEqual(outcome.href, '/workspace/classes', 'The migrated workspace resumed at the wrong step.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Verification-safety validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Verification-safety validation passed.\n');
