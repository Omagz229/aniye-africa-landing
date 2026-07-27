/**
 * Deterministic validation for ADR-007 (canonical Money) and ADR-008
 * (Person `Inactive`) — schema v5.
 *
 * Run with:  npm run validate:money
 *
 * Two halves: the Money module itself, then the v4 → v5 migration and the
 * lifecycle behaviour that ships with it.
 */

import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_BACKUP_KEY_PREFIX,
  WORKSPACE_KEY,
  loadAndMigrateWorkspace,
  migrateWorkspace,
} from '../lib/migrations';
import {
  addMoney,
  compareMoney,
  currencyExponent,
  formatMoney,
  isValidMoney,
  money,
  moneyEquals,
  parseMoney,
  subtractMoney,
  sumMoney,
  toMajorNumber,
  toMajorString,
} from '../lib/money';
import { createWorkspace } from '../lib/workspace';
import type { Person, WorkspaceState } from '../lib/workspace';
import {
  activeMemberCount,
  createCsvSource,
  eligiblePeopleForClasses,
  importPreservesLifecycle,
  inactiveMemberCount,
  isEligibleForAutomaticPopulation,
  memberCountsByClass,
  mergePersonFromImport,
  peopleWithoutClass,
  planPeopleImport,
  applyPeopleImport,
  totalMemberCount,
} from '../lib/people';

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

/** Parse and assert success — most cases care about the value, not the wrapper. */
function parsed(input: string | number, currency: string): { amountMinor: number; currency: string } {
  const result = parseMoney(input, currency);
  assert(result.ok, `parseMoney(${String(input)}, ${currency}) failed: ${result.ok ? '' : result.reason}`);
  return result.value.money;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const T0 = '2026-07-01T00:00:00.000Z';
let idCounter = 0;
const newId = () => `generated-${++idCounter}`;

function legacyRule(momentType: string, amount: number, currency: string) {
  return { momentType, budgetPerPerson: { amount, currency }, isEnabled: true };
}

function v4Policy(id: string, name: string, status: string, rules: unknown[]) {
  return {
    id, workspaceId: 'org-v4', name, description: '',
    recognitionRules: rules,
    approvalWorkflow: 'Manager', preferredGiftCategories: [], excludedCategories: [],
    deliveryRequirement: 'Standard', preferredDeliveryWindow: '', signatureRequired: false,
    proofRequired: false, reportingCadence: 'None', status, version: 3,
    createdAt: T0, updatedAt: T0, ...(status === 'Published' ? { publishedAt: T0 } : {}),
  };
}

function rawPerson(id: string, status: string, classIds: string[] = ['class-exec']) {
  return {
    id, firstName: 'Ada', lastName: `Person-${id}`, email: `${id}@example.com`,
    relationshipClassIds: classIds, sourceId: 'source-1', sourceType: 'Manual',
    status, createdAt: T0, updatedAt: T0,
    ...(status === 'Archived' ? { archivedAt: T0 } : {}),
  };
}

/** A schema v4 workspace — legacy major-unit Money, two-state people. */
function makeV4Workspace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 4,
    organizationId: 'org-v4', companyName: 'Meridian Group',
    website: '', industry: 'Logistics', employeeCount: '501-1000',
    operatingCountries: ['Nigeria', 'Kenya'], baseCurrency: 'NGN', timezone: 'Africa/Lagos',
    contactName: 'Ada Obi', contactEmail: 'ada@meridian.example', contactRole: 'Head of People',
    phone: '', setupStage: 'people', createdAt: T0,
    relationshipClasses: [
      { id: 'class-exec', name: 'Executive Leadership', type: 'Employee', level: 0, description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0 },
      { id: 'class-staff', name: 'Staff', type: 'Employee', level: 3, description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0 },
    ],
    recognitionPolicies: [
      v4Policy('policy-exec', 'Executive Recognition', 'Published', [
        legacyRule('Birthday', 500000, 'NGN'),
        legacyRule('Work Anniversary', 250000.5, 'NGN'),
      ]),
      v4Policy('policy-jp', 'Tokyo Recognition', 'Published', [legacyRule('Birthday', 50000, 'JPY')]),
      v4Policy('policy-kw', 'Kuwait Recognition', 'Draft', [legacyRule('Birthday', 125.125, 'KWD')]),
    ],
    policyAssignments: [
      { id: 'assignment-1', relationshipClassId: 'class-exec', recognitionPolicyId: 'policy-exec', countryCode: 'KE', priority: 3, isActive: true, createdAt: T0, updatedAt: T0 },
    ],
    peopleSources: [
      { id: 'source-1', name: 'Manually added', type: 'Manual', status: 'Active', createdAt: T0, updatedAt: T0 },
    ],
    people: [rawPerson('p-active', 'Active'), rawPerson('p-archived', 'Archived')],
    ...overrides,
  };
}

function migrateV4(overrides: Record<string, unknown> = {}): WorkspaceState {
  const result = migrateWorkspace<WorkspaceState>(makeV4Workspace(overrides));
  assert(result.status === 'ok', `Migration failed: ${result.status === 'invalid' ? result.reason : ''}`);
  return result.workspace;
}

function ruleOf(ws: WorkspaceState, policyId: string, momentType: string) {
  const policy = ws.recognitionPolicies.find(p => p.id === policyId);
  assert(policy, `Policy ${policyId} is missing.`);
  const rule = policy.recognitionRules.find(r => r.momentType === momentType);
  assert(rule, `Rule ${momentType} is missing from ${policyId}.`);
  return rule;
}

function person(over: Partial<Person> & { id: string }): Person {
  return {
    firstName: 'Ada', lastName: 'Obi', relationshipClassIds: ['class-exec'],
    sourceId: 'source-1', sourceType: 'Manual', status: 'Active',
    createdAt: T0, updatedAt: T0, ...over,
  };
}

console.log('\nCanonical Money (ADR-007) + Person lifecycle (ADR-008) — validation\n');
console.log(`  schema v4 → v${CURRENT_WORKSPACE_SCHEMA_VERSION}\n`);

// ─── Part 1: the Money module ────────────────────────────────────────────────

check('1. NGN major units parse to minor units correctly', () => {
  assertEqual(parsed('500000', 'NGN').amountMinor, 50_000_000, 'NGN whole units are wrong.');
  assertEqual(parsed('500000.50', 'NGN').amountMinor, 50_000_050, 'NGN kobo are wrong.');
  assertEqual(parsed('0.01', 'NGN').amountMinor, 1, 'One kobo is wrong.');
  assertEqual(parsed('1,234,567.89', 'NGN').amountMinor, 123_456_789, 'Thousands separators were mishandled.');
  assertEqual(parsed(' 250 ', 'NGN').amountMinor, 25_000, 'Whitespace was mishandled.');
  assertEqual(parsed('-1500.25', 'NGN').amountMinor, -150_025, 'A negative amount was mishandled.');
  assertEqual(parsed('0', 'NGN').amountMinor, 0, 'Zero was mishandled.');
  assertEqual(parsed('.5', 'NGN').amountMinor, 50, 'A bare decimal was mishandled.');
});

check('2. USD parses correctly', () => {
  assertEqual(parsed('19.99', 'USD').amountMinor, 1999, 'USD cents are wrong.');
  assertEqual(parsed('1000', 'USD').amountMinor, 100_000, 'USD whole dollars are wrong.');
  // Currency is normalized to uppercase.
  const lower = parseMoney('19.99', 'usd');
  assert(lower.ok, 'A lowercase currency code was rejected.');
  assertEqual(lower.value.money.currency, 'USD', 'Currency was not uppercased.');
  // A classic float trap: 0.1 + 0.2 must be exactly 0.30.
  const a = parsed('0.10', 'USD');
  const b = parsed('0.20', 'USD');
  const total = addMoney(a, b);
  assert(total.ok, 'Addition failed.');
  assertEqual(total.value.amountMinor, 30, 'Float error leaked into minor units.');
  assertEqual(toMajorString(total.value), '0.30', 'Float error leaked into display.');
});

check('3. JPY uses zero decimals', () => {
  assertEqual(currencyExponent('JPY'), 0, 'JPY exponent is wrong.');
  assertEqual(currencyExponent('KRW'), 0, 'KRW exponent is wrong.');
  assertEqual(parsed('50000', 'JPY').amountMinor, 50_000, 'JPY must not be multiplied by 100.');
  assertEqual(toMajorString(parsed('50000', 'JPY')), '50,000', 'JPY gained false decimals in display.');
  assertEqual(formatMoney(parsed('1234', 'JPY')), 'JPY 1,234', 'JPY formatting is wrong.');

  // Decimals are meaningless for JPY and are refused.
  const withDecimals = parseMoney('50000.5', 'JPY');
  assertEqual(withDecimals.ok, false, 'JPY accepted a decimal amount.');
});

check('4. BHD, KWD and OMR use three decimals', () => {
  for (const currency of ['BHD', 'KWD', 'OMR', 'TND', 'JOD']) {
    assertEqual(currencyExponent(currency), 3, `${currency} exponent is wrong.`);
  }
  assertEqual(parsed('125.125', 'KWD').amountMinor, 125_125, 'KWD fils are wrong.');
  assertEqual(parsed('1', 'BHD').amountMinor, 1_000, 'One dinar should be 1000 fils.');
  assertEqual(parsed('0.001', 'OMR').amountMinor, 1, 'One baisa is wrong.');
  assertEqual(toMajorString(parsed('125.125', 'KWD')), '125.125', 'KWD lost precision in display.');

  // Four decimals exceed what the currency holds.
  assertEqual(parseMoney('1.2345', 'KWD').ok, false, 'KWD accepted four decimal places.');
});

check('5. Display formatting restores the intended major-unit value', () => {
  const cases: Array<[string, string, string]> = [
    ['500000',    'NGN', '500,000.00'],
    ['500000.50', 'NGN', '500,000.50'],
    ['19.99',     'USD', '19.99'],
    ['50000',     'JPY', '50,000'],
    ['125.125',   'KWD', '125.125'],
    ['0',         'NGN', '0.00'],
    ['-1500.25',  'NGN', '-1,500.25'],
  ];
  for (const [input, currency, expected] of cases) {
    assertEqual(toMajorString(parsed(input, currency)), expected, `${input} ${currency} formatted wrongly.`);
  }
  assertEqual(formatMoney(parsed('500000', 'NGN')), 'NGN 500,000.00', 'formatMoney output is wrong.');
  assertEqual(toMajorNumber(parsed('19.99', 'USD')), 19.99, 'toMajorNumber is wrong.');

  // Round-trip: parse → display → parse must be stable.
  for (const [input, currency] of cases) {
    const once = parsed(input, currency);
    const twice = parsed(toMajorString(once), currency);
    assert(moneyEquals(once, twice), `${input} ${currency} did not survive a round trip.`);
  }
});

check('6. Same-currency addition and subtraction work', () => {
  const a = parsed('1000.50', 'NGN');
  const b = parsed('499.50', 'NGN');

  const sum = addMoney(a, b);
  assert(sum.ok, 'Addition failed.');
  assertEqual(sum.value.amountMinor, 150_000, 'Addition is wrong.');
  assertEqual(toMajorString(sum.value), '1,500.00', 'Sum formatted wrongly.');

  const difference = subtractMoney(a, b);
  assert(difference.ok, 'Subtraction failed.');
  assertEqual(difference.value.amountMinor, 50_100, 'Subtraction is wrong.');

  const total = sumMoney([a, b, parsed('0.50', 'NGN')], 'NGN');
  assert(total.ok, 'sumMoney failed.');
  assertEqual(total.value.amountMinor, 150_050, 'sumMoney is wrong.');

  const cmp = compareMoney(a, b);
  assert(cmp.ok, 'Comparison failed.');
  assertEqual(cmp.value, 1, 'Comparison is wrong.');
  assert(moneyEquals(a, parsed('1000.50', 'NGN')), 'Equal amounts did not compare equal.');
});

check('7. Currency mismatch is rejected', () => {
  const ngn = parsed('1000', 'NGN');
  const usd = parsed('1000', 'USD');

  for (const [label, result] of [
    ['addition', addMoney(ngn, usd)],
    ['subtraction', subtractMoney(ngn, usd)],
    ['comparison', compareMoney(ngn, usd)],
  ] as const) {
    assertEqual(result.ok, false, `Cross-currency ${label} was allowed.`);
    if (!result.ok) {
      assert(result.reason.includes('NGN') && result.reason.includes('USD'), `The ${label} error does not name both currencies.`);
    }
  }
  assertEqual(moneyEquals(ngn, usd), false, 'Different currencies compared equal.');
  assertEqual(sumMoney([ngn, usd], 'NGN').ok, false, 'sumMoney allowed a mixed currency list.');
});

check('8. Unsafe and non-integer values are rejected', () => {
  assertEqual(money(1.5, 'NGN').ok, false, 'A fractional minor amount was accepted.');
  assertEqual(money(Number.MAX_SAFE_INTEGER + 2, 'NGN').ok, false, 'An unsafe integer was accepted.');
  assertEqual(money(Number.NaN, 'NGN').ok, false, 'NaN was accepted.');
  assertEqual(money(Number.POSITIVE_INFINITY, 'NGN').ok, false, 'Infinity was accepted.');

  assertEqual(isValidMoney({ amountMinor: 1.5, currency: 'NGN' }), false, 'A fractional Money validated.');
  assertEqual(isValidMoney({ amount: 500000, currency: 'NGN' }), false, 'A legacy Money validated.');
  assertEqual(isValidMoney({ amountMinor: 100, currency: 'ZZZ' }), false, 'An unknown currency validated.');
  assertEqual(isValidMoney({ amountMinor: 100, currency: 'NGN' }), true, 'A valid Money did not validate.');

  // A safe integer at the boundary is still accepted.
  assertEqual(money(Number.MAX_SAFE_INTEGER, 'NGN').ok, true, 'The safe boundary was rejected.');
});

check('9. Invalid currency is rejected', () => {
  for (const bad of ['ZZZ', 'NG', 'NGNN', '', '123', 'naira']) {
    assertEqual(money(100, bad).ok, false, `Currency "${bad}" was accepted.`);
    assertEqual(parseMoney('100', bad).ok, false, `parseMoney accepted currency "${bad}".`);
  }
  // The refusal names what is supported rather than just failing.
  const result = money(100, 'ZZZ');
  assert(!result.ok && result.reason.includes('NGN'), 'The error does not list supported currencies.');
});

check('10. Excess precision follows the documented rule', () => {
  // Default is to reject — a typo is likelier than a genuine sub-unit.
  const rejected = parseMoney('10.999', 'NGN');
  assertEqual(rejected.ok, false, 'Excess precision was accepted by default.');
  assert(!rejected.ok && rejected.reason.includes('2 decimal places'), 'The error does not say how many decimals are allowed.');

  // Opt-in rounding, half away from zero, with a warning.
  const rounded = parseMoney('10.999', 'NGN', { excessPrecision: 'round' });
  assert(rounded.ok, 'Rounding mode failed.');
  assertEqual(rounded.value.money.amountMinor, 1100, '10.999 should round to 11.00.');
  assert(rounded.value.warning !== undefined, 'Rounding produced no warning.');

  assertEqual(parseMoney('10.994', 'NGN', { excessPrecision: 'round' }).ok, true, 'Rounding down failed.');
  const down = parseMoney('10.994', 'NGN', { excessPrecision: 'round' });
  assert(down.ok, 'Rounding failed.');
  assertEqual(down.value.money.amountMinor, 1099, '10.994 should round to 10.99.');

  // Half away from zero, symmetrically.
  const halfUp = parseMoney('10.005', 'NGN', { excessPrecision: 'round' });
  assert(halfUp.ok, 'Half rounding failed.');
  assertEqual(halfUp.value.money.amountMinor, 1001, '10.005 should round to 10.01.');
  const halfDown = parseMoney('-10.005', 'NGN', { excessPrecision: 'round' });
  assert(halfDown.ok, 'Negative half rounding failed.');
  assertEqual(halfDown.value.money.amountMinor, -1001, '-10.005 should round to -10.01.');
});

// ─── Part 2: the v4 → v5 migration ───────────────────────────────────────────

check('11. A v4 workspace migrates to v5', () => {
  const result = migrateWorkspace<WorkspaceState>(makeV4Workspace());
  assert(result.status === 'ok', `Migration rejected the v4 fixture: ${result.status === 'invalid' ? result.reason : ''}`);
  assertEqual(result.fromVersion, 4, 'Payload was not detected as v4.');
  assertEqual(result.migrated, true, 'Migration did not report that it ran.');

  // v5 is no longer terminal — assert the ADR-007 rung ran, not that the walk
  // stopped there.
  assertEqual(result.applied[0], 'v4-to-v5-adr-007-money-minor-units-and-adr-008-person-inactive', 'ADR-007 was not the first rung from v4.');
  assertEqual(result.toVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migration did not reach the current version.');
  assertEqual(
    result.applied.length,
    CURRENT_WORKSPACE_SCHEMA_VERSION - 4,
    'Wrong number of migrations ran for the number of versions crossed.',
  );
  assertEqual(result.workspace.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'Migrated workspace has the wrong schemaVersion.');

  const ws = result.workspace;
  assertEqual(ruleOf(ws, 'policy-exec', 'Birthday').budgetPerPerson.amountMinor, 50_000_000, 'NGN 500,000 did not become 50,000,000 kobo.');
  assertEqual(ruleOf(ws, 'policy-jp', 'Birthday').budgetPerPerson.amountMinor, 50_000, 'JPY was wrongly multiplied.');
  assertEqual(ruleOf(ws, 'policy-kw', 'Birthday').budgetPerPerson.amountMinor, 125_125, 'KWD lost its three decimals.');
});

check('12. All policies survive, with ids, versions and currencies unchanged', () => {
  const before = makeV4Workspace().recognitionPolicies as Array<Record<string, unknown>>;
  const ws = migrateV4();

  assertEqual(ws.recognitionPolicies.length, before.length, 'A policy was lost.');
  for (const original of before) {
    const found = ws.recognitionPolicies.find(p => p.id === original.id);
    assert(found, `Policy ${String(original.id)} was lost.`);
    assertEqual(found.name, original.name as string, `Policy ${String(original.id)} name changed.`);
    assertEqual(found.version, 3, `Policy ${String(original.id)} version changed.`);
    assertEqual(found.status, original.status as never, `Policy ${String(original.id)} status changed.`);
    assertEqual(
      found.recognitionRules.length,
      (original.recognitionRules as unknown[]).length,
      `Policy ${String(original.id)} lost rules.`,
    );
  }

  // Currency is never rewritten by the amount transform.
  assertEqual(ruleOf(ws, 'policy-exec', 'Birthday').budgetPerPerson.currency, 'NGN', 'NGN currency changed.');
  assertEqual(ruleOf(ws, 'policy-jp', 'Birthday').budgetPerPerson.currency, 'JPY', 'JPY currency changed.');
  assertEqual(ruleOf(ws, 'policy-kw', 'Birthday').budgetPerPerson.currency, 'KWD', 'KWD currency changed.');
});

check('13. People, assignments and sources survive unchanged', () => {
  const before = makeV4Workspace();
  const ws = migrateV4();

  assertEqual(ws.people.length, 2, 'A person was lost.');
  assertEqual(ws.policyAssignments.length, 1, 'An assignment was lost.');
  assertEqual(ws.peopleSources.length, 1, 'A source was lost.');
  assertEqual(ws.relationshipClasses.length, 2, 'A relationship group was lost.');

  for (const field of ['relationshipClasses', 'policyAssignments', 'peopleSources', 'people'] as const) {
    assertEqual(
      JSON.stringify(ws[field]),
      JSON.stringify(before[field]),
      `Collection "${field}" was modified by a Money migration.`,
    );
  }
  assertEqual(ws.setupStage, 'people', 'setupStage changed.');
  assertEqual(ws.baseCurrency, 'NGN', 'baseCurrency changed.');
});

check('14. The legacy major-unit amount is removed', () => {
  const ws = migrateV4();
  for (const policy of ws.recognitionPolicies) {
    for (const rule of policy.recognitionRules) {
      const budget = rule.budgetPerPerson as unknown as Record<string, unknown>;
      assert(!('amount' in budget), `Policy ${policy.id} rule ${rule.momentType} kept the legacy amount.`);
      assert('amountMinor' in budget, `Policy ${policy.id} rule ${rule.momentType} has no amountMinor.`);
      assert(Number.isSafeInteger(budget.amountMinor), `Policy ${policy.id} amountMinor is not a safe integer.`);
    }
  }

  // A payload that still carries `amount` at v5 is refused outright.
  const stillLegacy = migrateWorkspace<WorkspaceState>(
    makeV4Workspace({ schemaVersion: 5, people: [] }),
  );
  assertEqual(stillLegacy.status, 'invalid', 'A v5 payload with legacy Money was accepted.');
});

check('15. Migration is idempotent', () => {
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: JSON.stringify(makeV4Workspace()) });

  const first = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(first.status === 'ok', 'First load failed.');
  assertEqual(first.migrated, true, 'First load should have migrated.');
  const afterFirst = storage.getItem(WORKSPACE_KEY);
  const keyCount = storage.keys().length;

  for (const pass of ['second', 'third']) {
    const again = loadAndMigrateWorkspace<WorkspaceState>(storage);
    assert(again.status === 'ok', `${pass} load failed.`);
    assertEqual(again.migrated, false, `${pass} load re-ran a completed migration.`);
    assertEqual(storage.getItem(WORKSPACE_KEY), afterFirst, `${pass} load rewrote the workspace.`);
    assertEqual(storage.keys().length, keyCount, `${pass} load added storage keys.`);
  }

  // The critical idempotence property: amounts are never multiplied twice.
  const ws = JSON.parse(afterFirst!) as WorkspaceState;
  assertEqual(ruleOf(ws, 'policy-exec', 'Birthday').budgetPerPerson.amountMinor, 50_000_000, 'The amount was scaled more than once.');
});

check('16. The destructive migration creates exactly one backup', () => {
  const original = JSON.stringify(makeV4Workspace());
  const storage = createMemoryStorage({ [WORKSPACE_KEY]: original });

  const result = loadAndMigrateWorkspace<WorkspaceState>(storage);
  assert(result.status === 'ok', 'Load failed.');
  assert(result.backupKey !== null, 'A destructive Money migration took no backup.');
  assert(result.backupKey.startsWith(`${WORKSPACE_BACKUP_KEY_PREFIX}_v4_`), `Backup key has an unexpected shape: ${result.backupKey}`);
  assertEqual(storage.getItem(result.backupKey), original, 'The backup is not the verbatim pre-migration payload.');

  // The backup holds the legacy shape, proving it was taken before the transform.
  const backup = JSON.parse(storage.getItem(result.backupKey)!);
  assertEqual(backup.recognitionPolicies[0].recognitionRules[0].budgetPerPerson.amount, 500000, 'The backup was taken after the transform.');

  // Ordinary reads never add another.
  loadAndMigrateWorkspace<WorkspaceState>(storage);
  loadAndMigrateWorkspace<WorkspaceState>(storage);
  assertEqual(
    storage.keys().filter(k => k.startsWith(WORKSPACE_BACKUP_KEY_PREFIX)).length,
    1,
    'An ordinary read created another backup.',
  );
});

check('17. A v1 workspace walks every migration to the current version', () => {
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
    recognitionPolicies: [v4Policy('policy-exec', 'Executive Recognition', 'Published', [legacyRule('Birthday', 500000, 'NGN')])],
  };

  const result = migrateWorkspace<WorkspaceState>(v1);
  assert(result.status === 'ok', `v1 → v5 failed: ${result.status === 'invalid' ? result.reason : ''}`);
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
  assert(result.applied[3].includes('money'), 'ADR-007 did not run fourth.');

  const ws = result.workspace;
  assertEqual(ws.relationshipClasses[0].type, 'Board', 'ADR-002 mapping did not survive.');
  assertEqual(ws.policyAssignments.length, 0, 'H2.4 collection is missing.');
  assertEqual(ws.people.length, 0, 'H2.5 collection is missing.');
  assertEqual(ruleOf(ws, 'policy-exec', 'Birthday').budgetPerPerson.amountMinor, 50_000_000, 'ADR-007 transform did not run.');
  assertEqual(ws.setupStage, 'assignments', 'The v2 → v3 stage remap did not survive.');
});

check('18. Existing Active people remain Active', () => {
  const ws = migrateV4();
  const active = ws.people.find(p => p.id === 'p-active');
  assert(active, 'The active person was lost.');
  assertEqual(active.status, 'Active', 'An Active person changed state during migration.');

  // Nothing is ever migrated *into* Inactive.
  assertEqual(ws.people.filter(p => p.status === 'Inactive').length, 0, 'Migration created an Inactive person.');
});

check('19. Existing Archived people remain Archived', () => {
  const ws = migrateV4();
  const archived = ws.people.find(p => p.id === 'p-archived');
  assert(archived, 'The archived person was lost.');
  assertEqual(archived.status, 'Archived', 'An Archived person changed state during migration.');
  assertEqual(archived.archivedAt, T0, 'archivedAt was lost.');
});

check('20. Inactive people are excluded from active member counts', () => {
  const people: Person[] = [
    person({ id: 'p1', status: 'Active' }),
    person({ id: 'p2', status: 'Inactive' }),
    person({ id: 'p3', status: 'Archived' }),
  ];

  assertEqual(activeMemberCount('class-exec', people), 1, 'An Inactive or Archived person counted as active.');
  assertEqual(inactiveMemberCount('class-exec', people), 1, 'The paused person was not counted.');

  assertEqual(isEligibleForAutomaticPopulation(people[0]), true, 'An Active person is not eligible.');
  assertEqual(isEligibleForAutomaticPopulation(people[1]), false, 'An Inactive person is eligible.');
  assertEqual(isEligibleForAutomaticPopulation(people[2]), false, 'An Archived person is eligible.');

  assertEqual(eligiblePeopleForClasses(people, ['class-exec']).length, 1, 'Program population included a paused person.');

  // An Inactive person with no class is not chased for one — they are out of scope.
  const noClass = [person({ id: 'p4', status: 'Inactive', relationshipClassIds: [] })];
  assertEqual(peopleWithoutClass(noClass).length, 0, 'A paused person was reported as needing a group.');
});

check('21. Inactive people are retained in total counts', () => {
  const people: Person[] = [
    person({ id: 'p1', status: 'Active' }),
    person({ id: 'p2', status: 'Inactive' }),
    person({ id: 'p3', status: 'Archived' }),
  ];

  assertEqual(totalMemberCount('class-exec', people), 3, 'Total count dropped a retained person.');

  const counts = memberCountsByClass(people, [
    { id: 'class-exec', name: 'Executive Leadership', type: 'Employee', level: 0, description: '', isDefault: true, isActive: true, createdAt: T0, updatedAt: T0 },
  ]);
  const membership = counts.get('class-exec');
  assert(membership, 'The class is missing from the counts.');
  assertEqual(membership.active, 1, 'Active count is wrong.');
  assertEqual(membership.inactive, 1, 'Inactive count is wrong.');
  assertEqual(membership.total, 3, 'Total count is wrong.');
});

check('22. CSV precedence does not silently reactivate Inactive or Archived people', () => {
  const source = createCsvSource('headcount.csv', T0, 'source-csv');

  for (const status of ['Inactive', 'Archived'] as const) {
    const existing = person({
      id: `p-${status}`, email: 'ada@example.com', sourceType: 'Manual', status,
      ...(status === 'Archived' ? { archivedAt: T0 } : {}),
    });

    // A CSV outranks Manual, so this row *does* update the record.
    const csvText = 'first_name,last_name,email,role\nAda,Obi,ada@example.com,Chief Executive\n';
    const plan = planPeopleImport(csvText, [], [existing], 'CSV');
    assert(plan.status === 'ok', 'Plan failed.');
    assertEqual(plan.plan.rows[0].state, 'will-update', `A ${status} person was not matched for update.`);

    const applied = applyPeopleImport(plan.plan, [existing], source, '2026-08-01T00:00:00.000Z', newId);
    assertEqual(applied.people.length, 1, 'The import created a duplicate record.');

    const after = applied.people[0];
    assertEqual(after.status, status, `A CSV import silently reactivated a ${status} person.`);
    assertEqual(after.role, 'Chief Executive', 'The supplied field was not applied.');
    assert(importPreservesLifecycle(existing, after), `Lifecycle was not preserved for a ${status} person.`);
  }

  // Direct merge check, independent of the import planner.
  const paused = person({ id: 'p-paused', status: 'Inactive' });
  const merged = mergePersonFromImport(
    paused,
    { firstName: 'Ada', lastName: 'Obi', relationshipClassIds: [], providedClass: false },
    source, '2026-08-01T00:00:00.000Z',
  );
  assertEqual(merged.status, 'Inactive', 'mergePersonFromImport changed a lifecycle state.');
});

check('23. A new workspace is created at v5 with canonical Money', () => {
  const ws = createWorkspace({
    companyName: 'New Co', website: '', industry: 'Technology', employeeCount: '11-50',
    operatingCountries: ['Nigeria'], contactName: 'Chidi Eze', contactEmail: 'c@new.example',
    contactRole: 'Founder', phone: '',
  });
  assertEqual(ws.schemaVersion, CURRENT_WORKSPACE_SCHEMA_VERSION, 'A new workspace is not at v5.');

  const roundTrip = migrateWorkspace<WorkspaceState>(JSON.parse(JSON.stringify(ws)));
  assert(roundTrip.status === 'ok', 'A new workspace failed validation.');
  assertEqual(roundTrip.migrated, false, 'A new workspace needed migrating.');
});

check('24. An unknown currency fails safely rather than guessing an exponent', () => {
  const result = migrateWorkspace<WorkspaceState>(
    makeV4Workspace({
      recognitionPolicies: [v4Policy('policy-odd', 'Odd', 'Draft', [legacyRule('Birthday', 100, 'XYZ')])],
    }),
  );
  // The amount is left unconverted, so post-migration validation refuses the
  // workspace rather than storing a value of unknown scale.
  assertEqual(result.status, 'invalid', 'An unknown currency was silently migrated.');
  if (result.status === 'invalid') {
    assert(result.reason.includes('XYZ'), 'The refusal does not name the offending currency.');
  }
});

check('25. Excess precision in stored data is reported, not concealed', () => {
  // The fixture holds 250,000.5 NGN — half a kobo, which NGN cannot represent.
  const result = migrateWorkspace<WorkspaceState>(makeV4Workspace());
  assert(result.status === 'ok', 'Migration failed.');
  assertEqual(
    ruleOf(result.workspace, 'policy-exec', 'Work Anniversary').budgetPerPerson.amountMinor,
    25_000_050,
    'NGN 250,000.50 should be exactly 25,000,050 kobo.',
  );
  // 125.125 KWD is exact at three decimals, so it must produce no warning.
  assertEqual(
    ruleOf(result.workspace, 'policy-kw', 'Birthday').budgetPerPerson.amountMinor,
    125_125,
    'An exact KWD amount was altered.',
  );

  // A genuinely over-precise amount does warn.
  const overPrecise = migrateWorkspace<WorkspaceState>(
    makeV4Workspace({
      recognitionPolicies: [v4Policy('policy-p', 'Precise', 'Draft', [legacyRule('Birthday', 10.999, 'NGN')])],
    }),
  );
  assert(overPrecise.status === 'ok', 'Migration failed.');
  assertEqual(ruleOf(overPrecise.workspace, 'policy-p', 'Birthday').budgetPerPerson.amountMinor, 1100, '10.999 NGN should round to 1100 kobo.');
  assert(overPrecise.warnings.length > 0, 'Rounding produced no migration warning.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Money and lifecycle validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Money and lifecycle validation passed.\n');
