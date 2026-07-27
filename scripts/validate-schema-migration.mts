/**
 * Deterministic validation for the workspace schema migration foundation and
 * ADR-002 (Relationship Type + numeric Relationship Level).
 *
 * Run with:  npm run validate:migration
 *
 * Deliberately dependency-free. Node strips the types and runs this directly,
 * so verifying the migration needs no test framework and no build step. The
 * migration runner takes its storage as an argument, so an in-memory Map stands
 * in for localStorage and the real code path is exercised end to end.
 */

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  LEGACY_UNVERSIONED_SCHEMA_VERSION,
  WORKSPACE_BACKUP_KEY_PREFIX,
  WORKSPACE_KEY,
  WORKSPACE_QUARANTINE_KEY,
  loadAndMigrateWorkspace,
  migrateWorkspace,
} from '../lib/migrations';
import { createWorkspace, sortRelationshipClasses } from '../lib/workspace';
import type { RelationshipClass, WorkspaceState } from '../lib/workspace';

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

// ─── In-memory localStorage ──────────────────────────────────────────────────

function createMemoryStorage(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
    keys: (): string[] => [...data.keys()],
    size: (): number => data.size,
  };
}

// ─── Fixture: a schema v1 (H2.3) workspace, exactly as it was persisted ──────

function legacyClass(
  id: string,
  name: string,
  category: string,
  tier: string,
): Record<string, unknown> {
  return {
    id,
    name,
    category,
    description: '',
    tier,
    isDefault: true,
    isActive: true,
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  };
}

const LEGACY_DEFAULT_CLASSES = [
  legacyClass('class-executive-leadership', 'Executive Leadership', 'Internal', 'Strategic'),
  legacyClass('class-senior-leadership', 'Senior Leadership', 'Internal', 'Priority'),
  legacyClass('class-managers', 'Managers', 'Internal', 'Standard'),
  legacyClass('class-staff', 'Staff', 'Internal', 'Standard'),
  legacyClass('class-vip-clients', 'VIP Clients', 'Client', 'Strategic'),
  legacyClass('class-strategic-clients', 'Strategic Clients', 'Client', 'Priority'),
  legacyClass('class-standard-clients', 'Standard Clients', 'Client', 'Standard'),
  legacyClass('class-board-members', 'Board Members', 'Governance', 'Strategic'),
  legacyClass('class-investors', 'Investors', 'Governance', 'Strategic'),
  legacyClass('class-partners', 'Partners', 'Partner', 'Priority'),
  legacyClass('class-suppliers', 'Suppliers', 'Supplier', 'Standard'),
];

const LEGACY_CUSTOM_CLASS_ID = 'class-custom-1750000000000';
const LEGACY_CUSTOM_CLASS_DESCRIPTION = 'Sector regulators we brief quarterly';

const LEGACY_CUSTOM_CLASS: Record<string, unknown> = {
  ...legacyClass(LEGACY_CUSTOM_CLASS_ID, 'Regulators', 'Other', 'Custom'),
  description: LEGACY_CUSTOM_CLASS_DESCRIPTION,
  isDefault: false,
};

const LEGACY_POLICY = {
  id: 'policy-executive',
  workspaceId: 'org-legacy-1',
  name: 'Executive Recognition Policy',
  description: 'Highest-touch recognition',
  recognitionRules: [
    { momentType: 'Birthday', budgetPerPerson: { amount: 500000, currency: 'NGN' }, isEnabled: true },
  ],
  approvalWorkflow: 'Executive',
  preferredGiftCategories: ['Luxury Experiences'],
  excludedCategories: [],
  deliveryRequirement: 'HandDelivered',
  preferredDeliveryWindow: '3 business days before date',
  signatureRequired: true,
  proofRequired: true,
  reportingCadence: 'Quarterly',
  status: 'Published',
  version: 1,
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z',
  publishedAt: '2026-06-25T00:00:00.000Z',
};

/** A schema v1 payload — note the absence of `schemaVersion`. */
function makeLegacyWorkspace(): Record<string, unknown> {
  return {
    organizationId: 'org-legacy-1',
    companyName: 'Legacy Holdings',
    website: 'https://legacy.example',
    industry: 'Financial Services',
    employeeCount: '201-500',
    operatingCountries: ['Nigeria', 'Kenya'],
    baseCurrency: 'NGN',
    timezone: 'Africa/Lagos',
    contactName: 'Ada Obi',
    contactEmail: 'ada@legacy.example',
    contactRole: 'Head of People',
    phone: '+2348000000000',
    setupStage: 'policies',
    createdAt: '2026-06-25T00:00:00.000Z',
    relationshipClasses: [...LEGACY_DEFAULT_CLASSES, LEGACY_CUSTOM_CLASS],
    recognitionPolicies: [LEGACY_POLICY],
  };
}

function findClass(workspace: WorkspaceState, id: string): RelationshipClass {
  const found = workspace.relationshipClasses.find(c => c.id === id);
  assert(found, `Relationship class "${id}" is missing from the migrated workspace.`);
  return found;
}

/** Migrate a fresh legacy fixture and return the result, asserting success. */
function migrateLegacyFixture(): WorkspaceState {
  const result = migrateWorkspace<WorkspaceState>(makeLegacyWorkspace());
  assert(result.status === 'ok', `Migration failed: ${result.status === 'invalid' ? result.reason : ''}`);
  return result.workspace;
}

// ─── Cases ───────────────────────────────────────────────────────────────────

console.log('\nWorkspace schema migration — validation\n');
console.log(`  schema v${LEGACY_UNVERSIONED_SCHEMA_VERSION} (H2.3, unversioned) → v${CURRENT_WORKSPACE_SCHEMA_VERSION} (current)\n`);
console.log('  Focus: the versioning foundation and the ADR-002 v1 → v2 mapping.');
console.log('  Later schema steps are covered by their own suites (validate:assignments).\n');

check('1. A new workspace is created at the current schema version', () => {
  const ws = createWorkspace({
    companyName: 'New Co',
    website: '',
    industry: 'Technology',
    employeeCount: '11-50',
    operatingCountries: ['Nigeria'],
    contactName: 'Chidi Eze',
    contactEmail: 'chidi@new.example',
    contactRole: 'Founder',
    phone: '',
  });
  assertEqual(ws.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'New workspace has the wrong schemaVersion.');
  assert(ws.relationshipClasses.length > 0, 'New workspace has no seeded relationship classes.');
  for (const cls of ws.relationshipClasses) {
    assert(typeof cls.type === 'string', `Seed class ${cls.id} has no type.`);
    assert(Number.isInteger(cls.level), `Seed class ${cls.id} has a non-integer level.`);
    assert(!('category' in cls), `Seed class ${cls.id} still carries a category field.`);
    assert(!('tier' in cls), `Seed class ${cls.id} still carries a tier field.`);
  }

  // A brand-new workspace must survive a round trip through the migration
  // runner untouched — otherwise "already current" is not truly a no-op.
  const roundTrip = migrateWorkspace<WorkspaceState>(JSON.parse(JSON.stringify(ws)));
  assert(roundTrip.status === 'ok', 'A new workspace failed to validate.');
  assertEqual(roundTrip.migrated, false, 'A new workspace should not need migrating.');
});

check('2. An unversioned H2.3 workspace migrates successfully', () => {
  const result = migrateWorkspace<WorkspaceState>(makeLegacyWorkspace());
  assert(result.status === 'ok', `Migration rejected the legacy fixture: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, LEGACY_UNVERSIONED_SCHEMA_VERSION, 'Legacy payload was not detected as v1.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(result.migrated, true, 'Migration did not report that it ran.');
  assertEqual(result.workspace.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migrated workspace has the wrong schemaVersion.');

  // The chain walks one rung at a time — one migration per version crossed —
  // and the ADR-002 step is always the first of them.
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - LEGACY_UNVERSIONED_SCHEMA_VERSION,
    'Wrong number of migrations ran for the number of versions crossed.',
  );
  assert(
    result.applied[0].includes('adr-002'),
    `Expected the ADR-002 migration to run first, got: ${result.applied[0]}`,
  );
  assertEqual(result.warnings.length, 0, `Clean legacy data produced warnings: ${result.warnings.join('; ')}`);
});

check('3. Default legacy classes preserve their ids and names', () => {
  const ws = migrateLegacyFixture();
  assertEqual(
    ws.relationshipClasses.length,
    LEGACY_DEFAULT_CLASSES.length + 1,
    'Class count changed during migration.',
  );
  for (const legacy of LEGACY_DEFAULT_CLASSES) {
    const migrated = findClass(ws, legacy.id as string);
    assertEqual(migrated.name, legacy.name as string, `Name changed for ${legacy.id}.`);
    assertEqual(migrated.isDefault, true, `isDefault changed for ${legacy.id}.`);
    assertEqual(migrated.isActive, true, `isActive changed for ${legacy.id}.`);
    assertEqual(migrated.createdAt, legacy.createdAt as string, `createdAt changed for ${legacy.id}.`);
    assertEqual(migrated.updatedAt, legacy.updatedAt as string, `updatedAt changed for ${legacy.id}.`);
  }
});

check('4. A custom legacy class is not lost', () => {
  const ws = migrateLegacyFixture();
  const custom = findClass(ws, LEGACY_CUSTOM_CLASS_ID);
  assertEqual(custom.name, 'Regulators', 'Custom class name was not preserved.');
  assertEqual(custom.description, LEGACY_CUSTOM_CLASS_DESCRIPTION, 'Custom class description was not preserved.');
  assertEqual(custom.isDefault, false, 'Custom class lost its isDefault=false marker.');
  assertEqual(custom.type, 'Other', 'Custom class with category Other should map to type Other.');
  assertEqual(custom.level, 3, 'Custom class with tier Custom should map to level 3.');
});

check('5. Category Internal maps to type Employee', () => {
  const ws = migrateLegacyFixture();
  for (const id of ['class-executive-leadership', 'class-senior-leadership', 'class-managers', 'class-staff']) {
    assertEqual(findClass(ws, id).type, 'Employee', `${id} did not map to Employee.`);
  }
});

check('6. Category Governance maps to type Board', () => {
  const ws = migrateLegacyFixture();
  assertEqual(findClass(ws, 'class-board-members').type, 'Board', 'Board Members did not map to Board.');

  // The Investors class also carried category Governance. The explicit
  // name rule takes precedence, recovering a type v1 could not express.
  assertEqual(
    findClass(ws, 'class-investors').type,
    'Investor',
    'Name rule did not take precedence over the Governance category fallback.',
  );
});

check('7. Tier Strategic maps to level 0', () => {
  const ws = migrateLegacyFixture();
  for (const id of ['class-executive-leadership', 'class-vip-clients', 'class-board-members', 'class-investors']) {
    assertEqual(findClass(ws, id).level, 0, `${id} did not map to level 0.`);
  }
});

check('8. Tier Standard maps to level 2', () => {
  const ws = migrateLegacyFixture();
  for (const id of ['class-managers', 'class-staff', 'class-standard-clients', 'class-suppliers']) {
    assertEqual(findClass(ws, id).level, 2, `${id} did not map to level 2.`);
  }
  // And the remaining rung, for completeness.
  for (const id of ['class-senior-leadership', 'class-strategic-clients', 'class-partners']) {
    assertEqual(findClass(ws, id).level, 1, `${id} (tier Priority) did not map to level 1.`);
  }
});

check('9. A migrated workspace is not migrated twice', () => {
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(makeLegacyWorkspace()) });

  const first = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(first.status === 'ok', 'First load failed.');
  assertEqual(first.migrated, true, 'First load should have migrated.');
  const afterFirst = storage.getItem(WORKSPACE_KEY);
  const keysAfterFirst = storage.keys().length;

  const second = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(second.status === 'ok', 'Second load failed.');
  assertEqual(second.migrated, false, 'Second load re-ran a completed migration.');
  assertEqual(second.applied.length, 0, 'Second load applied migrations.');
  assertEqual(second.backupKey, null, 'Second load created a backup on a normal read.');
  assertEqual(storage.getItem(WORKSPACE_KEY), afterFirst, 'Second load rewrote the workspace.');
  assertEqual(storage.keys().length, keysAfterFirst, 'Second load added keys to storage.');

  // Third pass, to be sure the no-op is stable rather than merely first-time.
  const third = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(third.status === 'ok', 'Third load failed.');
  assertEqual(third.migrated, false, 'Third load re-ran a completed migration.');
  assertEqual(storage.keys().length, keysAfterFirst, 'Third load added keys to storage.');
});

check('10. A backup is created before destructive transformation', () => {
  const original = JSON.stringify(makeLegacyWorkspace());
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: original });
  const at = new Date('2026-07-27T12:00:00.000Z');

  const result = loadAndMigrateWorkspace<WorkspaceState>(storage, () => at);
  assert(result.status === 'ok', 'Load failed.');
  assert(result.backupKey !== null, 'No backup key was returned for a destructive migration.');
  assert(
    result.backupKey.startsWith(`${WORKSPACE_BACKUP_KEY_PREFIX}_v${LEGACY_UNVERSIONED_SCHEMA_VERSION}_`),
    `Backup key has an unexpected shape: ${result.backupKey}`,
  );
  assertEqual(
    storage.getItem(result.backupKey),
    original,
    'Backup does not hold the verbatim pre-migration payload.',
  );

  // The backup must be the pre-migration data, not a copy of the new state.
  const backup = JSON.parse(storage.getItem(result.backupKey)!);
  assertEqual(backup.schemaVersion, undefined, 'Backup was taken after the migration ran.');
  assert('category' in backup.relationshipClasses[0], 'Backup lost the legacy category field.');
  assert('tier' in backup.relationshipClasses[0], 'Backup lost the legacy tier field.');
});

check('11. Invalid stored data fails safely', () => {
  // (a) Not valid JSON.
  const broken = createMemoryStorage({ [WORKSPACE_KEY]: '{not json' });
  const a = loadAndMigrateWorkspace<WorkspaceState>(broken);
  assertEqual(a.status, 'invalid', 'Malformed JSON was not rejected.');
  assertEqual(broken.getItem(WORKSPACE_KEY), '{not json', 'Malformed payload was overwritten.');
  assertEqual(broken.getItem(WORKSPACE_QUARANTINE_KEY), '{not json', 'Malformed payload was not quarantined.');

  // Quarantine is written once, not on every failing read.
  const keysAfterFirst = broken.keys().length;
  loadAndMigrateWorkspace<WorkspaceState>(broken);
  loadAndMigrateWorkspace<WorkspaceState>(broken);
  assertEqual(broken.keys().length, keysAfterFirst, 'Repeated failing reads created extra quarantine copies.');

  // (b) Valid JSON, wrong shape.
  for (const payload of ['null', '"a string"', '[1,2,3]', '{}']) {
    const storage = createMemoryStorage({ [WORKSPACE_KEY]: payload });
    const result = loadAndMigrateWorkspace<WorkspaceState>(storage);
    assertEqual(result.status, 'invalid', `Payload ${payload} was not rejected.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), payload, `Payload ${payload} was overwritten.`);
  }

  // (c) A schemaVersion this build does not understand must not be downgraded.
  const future = { ...makeLegacyWorkspace(), schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION + 1 };
  const futureText = JSON.stringify(future);
  const futureStorage = createMemoryStorage({ [WORKSPACE_KEY]: futureText });
  const c = loadAndMigrateWorkspace<WorkspaceState>(futureStorage);
  assertEqual(c.status, 'invalid', 'A future schema version was accepted.');
  assertEqual(futureStorage.getItem(WORKSPACE_KEY), futureText, 'A future schema version was overwritten.');

  // (d) A non-integer schemaVersion is refused rather than guessed at.
  const garbled = migrateWorkspace<WorkspaceState>({ ...makeLegacyWorkspace(), schemaVersion: 'two' });
  assertEqual(garbled.status, 'invalid', 'A garbled schemaVersion was accepted.');

  // (e) Nothing stored is "empty", not "invalid".
  assertEqual(loadAndMigrateWorkspace<WorkspaceState>(createMemoryStorage()).status, 'empty', 'An absent workspace was not reported as empty.');
});

check('12. Existing policies remain present after migration', () => {
  const ws = migrateLegacyFixture();
  assertEqual(ws.recognitionPolicies.length, 1, 'Recognition policies were lost during migration.');
  const policy = ws.recognitionPolicies[0];
  assertEqual(policy.id, LEGACY_POLICY.id, 'Policy id changed.');
  assertEqual(policy.name, LEGACY_POLICY.name, 'Policy name changed.');
  assertEqual(policy.status, 'Published', 'Policy status changed.');
  assertEqual(policy.version, 1, 'Policy version changed.');
  assertEqual(policy.recognitionRules.length, 1, 'Policy recognition rules were lost.');
  // 500,000 NGN in the v1 fixture becomes 50,000,000 kobo after v4 → v5.
  assertEqual(policy.recognitionRules[0].budgetPerPerson.amountMinor, 50_000_000, 'Policy budget changed.');
  assertEqual(policy.recognitionRules[0].budgetPerPerson.currency, 'NGN', 'Policy currency changed.');
  assertEqual(policy.publishedAt, LEGACY_POLICY.publishedAt, 'Policy publishedAt changed.');
});

// ─── Supporting cases ────────────────────────────────────────────────────────

check('13. Superseded category and tier fields are removed', () => {
  const ws = migrateLegacyFixture();
  for (const cls of ws.relationshipClasses) {
    assert(!('category' in cls), `Class ${cls.id} still carries a category field.`);
    assert(!('tier' in cls), `Class ${cls.id} still carries a tier field.`);
  }
});

check('14. Unrelated workspace data is preserved', () => {
  const legacy = makeLegacyWorkspace();
  const ws = migrateLegacyFixture();
  for (const field of [
    'organizationId', 'companyName', 'website', 'industry', 'employeeCount',
    'baseCurrency', 'timezone', 'contactName', 'contactEmail', 'contactRole',
    'phone', 'setupStage', 'createdAt',
  ] as const) {
    assertEqual(
      JSON.stringify((ws as unknown as Record<string, unknown>)[field]),
      JSON.stringify(legacy[field]),
      `Field "${field}" changed during migration.`,
    );
  }
  assertEqual(
    JSON.stringify(ws.operatingCountries),
    JSON.stringify(legacy.operatingCountries),
    'operatingCountries changed during migration.',
  );
});

check('15. Every migrated level is a valid integer 0-99', () => {
  const ws = migrateLegacyFixture();
  for (const cls of ws.relationshipClasses) {
    assert(
      Number.isInteger(cls.level) && cls.level >= 0 && cls.level <= 99,
      `Class ${cls.id} has an out-of-range level: ${cls.level}.`,
    );
  }
});

check('16. Malformed classes are recovered with a warning, not dropped silently', () => {
  const legacy = makeLegacyWorkspace();
  legacy.relationshipClasses = [
    legacyClass('class-ok', 'Fine', 'Internal', 'Priority'),
    { name: 'No id here', category: 'Client', tier: 'Standard' },
    { id: 'class-unknown-bits', name: 'Odd', category: 'Nonsense', tier: 'Nonsense' },
  ];
  const result = migrateWorkspace<WorkspaceState>(legacy);
  assert(result.status === 'ok', `Migration rejected recoverable data: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.workspace.relationshipClasses.length, 3, 'A recoverable class was dropped.');
  assert(result.warnings.length > 0, 'A recovered class produced no warning.');

  const unknown = findClass(result.workspace, 'class-unknown-bits');
  assertEqual(unknown.type, 'Other', 'An unrecognized category should fall back to Other.');
  assertEqual(unknown.level, 3, 'An unrecognized tier should fall back to level 3.');
});

check('17. Display order is by type, then ascending level', () => {
  const ws = migrateLegacyFixture();
  const ordered = sortRelationshipClasses(ws.relationshipClasses);
  const typeOrder = ordered.map(c => c.type);

  // Each type appears in one contiguous run.
  const seen = new Set<string>();
  let previous = '';
  for (const type of typeOrder) {
    if (type !== previous) {
      assert(!seen.has(type), `Type "${type}" appears in more than one run after sorting.`);
      seen.add(type);
      previous = type;
    }
  }

  // Within a run, level ascends.
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].type === ordered[i - 1].type) {
      assert(
        ordered[i].level >= ordered[i - 1].level,
        `Levels are not ascending within type ${ordered[i].type}.`,
      );
    }
  }

  assertEqual(ordered[0].type, 'Employee', 'Employee should sort first.');
  assertEqual(ordered[0].level, 0, 'The first row should be the highest Employee level.');
});

check('18. Name rules only fire on whole words', () => {
  const legacy = makeLegacyWorkspace();
  legacy.relationshipClasses = [
    legacyClass('class-a', 'Onboarding', 'Internal', 'Standard'),
    legacyClass('class-b', 'Government Relations', 'Other', 'Priority'),
    legacyClass('class-c', 'Public Sector Clients', 'Client', 'Priority'),
  ];
  const result = migrateWorkspace<WorkspaceState>(legacy);
  assert(result.status === 'ok', 'Migration failed.');

  // "Onboarding" contains the substring "board" — a substring match would
  // wrongly classify it as Board.
  assertEqual(findClass(result.workspace, 'class-a').type, 'Employee', 'A substring match leaked into the name rules.');
  assertEqual(findClass(result.workspace, 'class-b').type, 'Government', 'Government name rule did not fire.');
  assertEqual(findClass(result.workspace, 'class-c').type, 'Government', 'Public Sector name rule did not fire.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Migration validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Migration validation passed.\n');
