/**
 * Workspace schema versioning and migrations.
 *
 * ─── Why this module exists ──────────────────────────────────────────────────
 * Through H2.3 the persisted workspace had no version field, and "migration"
 * was a set of presence checks in `getWorkspace()` ("if the field is missing,
 * seed it"). That pattern can add a field but cannot *transform* one, and with
 * no version marker it cannot tell an already-migrated workspace from a legacy
 * one. ADR-002 requires exactly such a transform (`category` + `tier` →
 * `type` + numeric `level`), so the version field and an ordered runner have to
 * exist first.
 *
 * ─── Dependency direction ────────────────────────────────────────────────────
 * This module imports nothing from `./workspace.ts`; `workspace.ts` imports from
 * here. The graph is one-directional by design — a migration must never depend
 * on the app's *current* domain model, because the app's model keeps moving and
 * historical migrations must not move with it.
 *
 * That is also why the canonical value sets below are named
 * `SCHEMA_V2_*` rather than re-used from the live app enums: a migration into
 * schema v2 validates against the value set as it stood at v2. If a later ADR
 * adds a tenth Relationship Type, the v1→v2 migration must keep behaving
 * exactly as it does today. `workspace.ts` re-exports these as the live app
 * enums for as long as v2 is current.
 */

import { CURRENCY_CODE_PATTERN, currencyExponent, roundHalfAwayFromZero } from './money';

// ─── Schema versions ─────────────────────────────────────────────────────────

/**
 * Schema v1 — the H2.3 shape. Persisted without a `schemaVersion` field, so a
 * payload that has no version is by definition v1.
 */
export const LEGACY_UNVERSIONED_SCHEMA_VERSION = 1;

/** Schema v6 — H2.6: Campaign Programs (ADR-004) + baseCurrency validation. */
export const CURRENT_WORKSPACE_SCHEMA_VERSION = 7;

export const WORKSPACE_KEY = 'aniye_workspace';
export const WORKSPACE_BACKUP_KEY_PREFIX = 'aniye_workspace_backup';

/**
 * A payload that cannot be read is moved here rather than left in place to be
 * overwritten by the next workspace creation. Fixed key, written only once, so
 * repeated failing reads cannot fill storage with quarantine copies.
 */
export const WORKSPACE_QUARANTINE_KEY = 'aniye_workspace_quarantine';

// ─── Schema v2 canonical values (pinned — see module header) ─────────────────

export const SCHEMA_V2_RELATIONSHIP_TYPES = [
  'Employee',
  'Client',
  'Partner',
  'Supplier',
  'Board',
  'Investor',
  'Government',
  'Community',
  'Other',
] as const;

export type SchemaV2RelationshipType = (typeof SCHEMA_V2_RELATIONSHIP_TYPES)[number];

/** Level 0 is the highest recognition priority within a type. */
export const RELATIONSHIP_LEVEL_MIN = 0;
export const RELATIONSHIP_LEVEL_MAX = 99;

const SCHEMA_V2_SETUP_STAGES = [
  'profile',
  'classes',
  'policies',
  'people',
  'programs',
  'active',
] as const;

// ─── Schema v3 canonical values (pinned — see module header) ─────────────────

/** H2.4 inserts `assignments` between `policies` and `people`. */
export const SCHEMA_V3_SETUP_STAGES = [
  'profile',
  'classes',
  'policies',
  'assignments',
  'people',
  'programs',
  'active',
] as const;

export type SchemaV3SetupStage = (typeof SCHEMA_V3_SETUP_STAGES)[number];

/** Only a Published policy may be assigned, and only Published resolves. */
export const EXECUTABLE_POLICY_STATUS = 'Published';

/** ISO 3166-1 alpha-2. Blank/absent means the assignment is Global. */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

// ─── Schema v4 canonical values (pinned — see module header) ─────────────────

/**
 * Where a Person record came from.
 *
 * `HRIS` exists as a canonical future source type only — H2.5 builds no
 * external integration. It is declared now so that source precedence has a
 * stable top rung and imported records can carry the right provenance the day
 * a connector ships, without another schema migration.
 */
export const SCHEMA_V4_PEOPLE_SOURCE_TYPES = ['Manual', 'CSV', 'HRIS'] as const;
export type SchemaV4PeopleSourceType = (typeof SCHEMA_V4_PEOPLE_SOURCE_TYPES)[number];

export const SCHEMA_V4_PEOPLE_SOURCE_STATUSES = ['Active', 'Archived', 'Disconnected'] as const;
export type SchemaV4PeopleSourceStatus = (typeof SCHEMA_V4_PEOPLE_SOURCE_STATUSES)[number];

export const SCHEMA_V4_PERSON_STATUSES = ['Active', 'Archived'] as const;
export type SchemaV4PersonStatus = (typeof SCHEMA_V4_PERSON_STATUSES)[number];

// ─── Schema v5 canonical values (pinned — see module header) ─────────────────

/**
 * ADR-008 — `Inactive` restored. A person who is retained and visible in the
 * directory but excluded from automatic Program populations.
 *
 * Widening only: no existing record changes state, and nothing is ever
 * migrated *into* `Inactive`.
 */
export const SCHEMA_V5_PERSON_STATUSES = ['Active', 'Inactive', 'Archived'] as const;
export type SchemaV5PersonStatus = (typeof SCHEMA_V5_PERSON_STATUSES)[number];

// ─── Schema v6 canonical values (pinned — see module header) ─────────────────

/**
 * ADR-004 — Program modes. `Campaign` is the only mode H2.6 can create; the
 * other two are declared now so that adding them later needs no migration of
 * meaning, exactly as `HRIS` was declared ahead of any connector.
 */
export const SCHEMA_V6_PROGRAM_MODES = ['Campaign', 'Recurring', 'Triggered'] as const;
export type SchemaV6ProgramMode = (typeof SCHEMA_V6_PROGRAM_MODES)[number];

export const SCHEMA_V6_PROGRAM_STATUSES = ['Draft', 'Active', 'Completed', 'Archived'] as const;
export type SchemaV6ProgramStatus = (typeof SCHEMA_V6_PROGRAM_STATUSES)[number];

// ─── ADR-002 legacy mapping (schema v1 → v2) ─────────────────────────────────

export type LegacyRelationshipCategoryV1 =
  | 'Internal'
  | 'Client'
  | 'Governance'
  | 'Partner'
  | 'Supplier'
  | 'Community'
  | 'Other';

export type LegacyRelationshipTierV1 = 'Strategic' | 'Priority' | 'Standard' | 'Custom';

/**
 * Fallback mapping: legacy `category` → Relationship Type.
 *
 * `Governance` collapses to `Board` because the v1 category conflated board
 * seats and shareholdings. Classes that were actually investor records are
 * recovered by the name rules below, which run first.
 */
export const LEGACY_CATEGORY_TO_TYPE: Record<LegacyRelationshipCategoryV1, SchemaV2RelationshipType> = {
  Internal: 'Employee',
  Client: 'Client',
  Governance: 'Board',
  Partner: 'Partner',
  Supplier: 'Supplier',
  Community: 'Community',
  Other: 'Other',
};

/**
 * Fallback mapping: legacy `tier` → Relationship Level.
 *
 * v1 tier was a fixed four-value scale applied across every category. v2 level
 * is a per-type integer ladder, so this mapping is order-preserving but not
 * gap-free: a migrated workspace can legitimately end up with (say) a single
 * Partner class at level 1 and nothing at level 0. That is valid — level is a
 * priority number, not a dense index — and the organization can renumber.
 */
export const LEGACY_TIER_TO_LEVEL: Record<LegacyRelationshipTierV1, number> = {
  Strategic: 0,
  Priority: 1,
  Standard: 2,
  Custom: 3,
};

/** Applied when `tier` is absent or unrecognized — the least-privileged rung. */
export const LEGACY_TIER_FALLBACK_LEVEL = LEGACY_TIER_TO_LEVEL.Custom;

/**
 * Name-based overrides, applied *before* the category fallback.
 *
 * These are word-boundary matches on an explicit, closed list — not fuzzy
 * inference. They exist solely to recover the two Relationship Types that v1
 * had no way to express (`Investor`, `Government`) and to confirm `Board`.
 * First match wins, so `Investor` is tested before `Board`.
 */
export const LEGACY_NAME_TO_TYPE_RULES: ReadonlyArray<{
  readonly match: RegExp;
  readonly type: SchemaV2RelationshipType;
}> = [
  { match: /\binvestors?\b/i, type: 'Investor' },
  { match: /\bgovernment\b|\bpublic sector\b/i, type: 'Government' },
  { match: /\bboards?\b|\bgovernance\b/i, type: 'Board' },
];

// ─── Result types ────────────────────────────────────────────────────────────

export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type MigrationResult<T> =
  | {
      status: 'ok';
      workspace: T;
      /** False when the payload was already at the current version. */
      migrated: boolean;
      fromVersion: number;
      toVersion: number;
      /** Ids of the migrations that ran, in order. */
      applied: string[];
      /** True if any applied migration drops or rewrites existing fields. */
      destructive: boolean;
      /** Non-fatal data problems that were recovered rather than thrown away. */
      warnings: string[];
    }
  | { status: 'invalid'; reason: string; fromVersion: number | null };

export type LoadResult<T> =
  | { status: 'empty' }
  | {
      status: 'ok';
      workspace: T;
      migrated: boolean;
      fromVersion: number;
      toVersion: number;
      applied: string[];
      warnings: string[];
      /** Key the pre-migration payload was copied to, or null if none was needed. */
      backupKey: string | null;
    }
  | { status: 'invalid'; reason: string; quarantineKey: string | null };

type RawWorkspace = Record<string, unknown>;

interface MigrationContext {
  warn: (message: string) => void;
}

interface Migration {
  id: string;
  from: number;
  to: number;
  description: string;
  /**
   * True when the migration removes or rewrites fields that existed before it
   * ran. A backup of the pre-migration payload is taken before any destructive
   * migration is persisted.
   */
  destructive: boolean;
  run: (workspace: RawWorkspace, ctx: MigrationContext) => RawWorkspace;
}

// ─── Small guards ────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is RawWorkspace {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isSchemaV2RelationshipType(value: unknown): value is SchemaV2RelationshipType {
  return (
    typeof value === 'string' &&
    (SCHEMA_V2_RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

export function isValidRelationshipLevel(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RELATIONSHIP_LEVEL_MIN &&
    value <= RELATIONSHIP_LEVEL_MAX
  );
}

// ─── ADR-002 class transform ─────────────────────────────────────────────────

/**
 * Resolve a v1 class to its v2 Relationship Type.
 *
 * Precedence: explicit name rule → category fallback → `Other`.
 * A class is never dropped for having an unrecognized category.
 */
export function resolveLegacyRelationshipType(
  name: unknown,
  category: unknown,
): SchemaV2RelationshipType {
  if (typeof name === 'string') {
    for (const rule of LEGACY_NAME_TO_TYPE_RULES) {
      if (rule.match.test(name)) return rule.type;
    }
  }
  if (typeof category === 'string' && category in LEGACY_CATEGORY_TO_TYPE) {
    return LEGACY_CATEGORY_TO_TYPE[category as LegacyRelationshipCategoryV1];
  }
  return 'Other';
}

/** Resolve a v1 class to its v2 Relationship Level. */
export function resolveLegacyRelationshipLevel(tier: unknown): number {
  if (typeof tier === 'string' && tier in LEGACY_TIER_TO_LEVEL) {
    return LEGACY_TIER_TO_LEVEL[tier as LegacyRelationshipTierV1];
  }
  return LEGACY_TIER_FALLBACK_LEVEL;
}

/**
 * Transform one Relationship Class from v1 to v2.
 *
 * Preserved verbatim: id, name, description, isDefault, isActive, createdAt,
 * updatedAt. Dropped: category, tier — superseded by type and level.
 *
 * The transform is itself idempotent: a class that already carries a valid
 * `type`/`level` keeps them, so re-running cannot corrupt migrated data.
 */
function migrateRelationshipClassV1toV2(raw: unknown, index: number, ctx: MigrationContext): RawWorkspace | null {
  if (!isPlainObject(raw)) {
    ctx.warn(`Relationship class at index ${index} was not an object and could not be migrated.`);
    return null;
  }

  const { category: _category, tier: _tier, ...preserved } = raw;

  const id = isNonEmptyString(raw.id) ? raw.id : `class-recovered-${index}`;
  if (!isNonEmptyString(raw.id)) {
    ctx.warn(`Relationship class at index ${index} had no id; assigned "${id}".`);
  }

  const type = isSchemaV2RelationshipType(raw.type)
    ? raw.type
    : resolveLegacyRelationshipType(raw.name, raw.category);

  const level = isValidRelationshipLevel(raw.level)
    ? raw.level
    : resolveLegacyRelationshipLevel(raw.tier);

  const timestamp = isNonEmptyString(raw.createdAt) ? raw.createdAt : new Date(0).toISOString();

  return {
    ...preserved,
    id,
    name: typeof raw.name === 'string' ? raw.name : '',
    type,
    level,
    description: typeof raw.description === 'string' ? raw.description : '',
    isDefault: raw.isDefault === true,
    isActive: raw.isActive !== false,
    createdAt: timestamp,
    updatedAt: isNonEmptyString(raw.updatedAt) ? raw.updatedAt : timestamp,
  };
}

// ─── Migration registry ──────────────────────────────────────────────────────

/**
 * Ordered migration chain. Each entry moves the payload from exactly one
 * version to the next; the runner walks the chain and never skips a rung.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 'v1-to-v2-adr-002-relationship-type-and-level',
    from: 1,
    to: 2,
    description:
      'ADR-002 — replace RelationshipCategory + RelationshipTier with Relationship Type + numeric Relationship Level.',
    destructive: true,
    run: (workspace, ctx) => {
      const rawClasses = Array.isArray(workspace.relationshipClasses)
        ? workspace.relationshipClasses
        : [];

      if (!Array.isArray(workspace.relationshipClasses) && workspace.relationshipClasses != null) {
        ctx.warn('relationshipClasses was not an array; replaced with an empty list.');
      }

      const relationshipClasses = rawClasses
        .map((cls, i) => migrateRelationshipClassV1toV2(cls, i, ctx))
        .filter((cls): cls is RawWorkspace => cls !== null);

      // Everything not named here is carried through untouched.
      return {
        ...workspace,
        relationshipClasses,
        recognitionPolicies: Array.isArray(workspace.recognitionPolicies)
          ? workspace.recognitionPolicies
          : [],
        schemaVersion: 2,
      };
    },
  },
  {
    id: 'v2-to-v3-h2-4-policy-assignments',
    from: 2,
    to: 3,
    description:
      'H2.4 — add the policyAssignments collection and insert the `assignments` setup stage between `policies` and `people`.',
    // Destructive: `setupStage` is rewritten for workspaces that had already
    // moved past policies, so the pre-migration payload is backed up first.
    destructive: true,
    run: (workspace, ctx) => {
      const policies = Array.isArray(workspace.recognitionPolicies)
        ? workspace.recognitionPolicies
        : [];

      const hasPublishedPolicy = policies.some(
        (policy) =>
          isPlainObject(policy) && policy.status === EXECUTABLE_POLICY_STATUS,
      );

      // Stage remap. A v2 workspace never saw an `assignments` step, so any
      // workspace already past `policies` skipped a step that now exists. It is
      // walked back rather than left ahead of a step it never completed.
      //
      //   profile / classes / policies → unchanged
      //   people / programs / active   → assignments, if a Published policy exists
      //                                → policies, if none does
      //
      // The second case matters: assignments cannot be made without a Published
      // policy, so sending the operator to an unusable step would dead-end them.
      const stage = workspace.setupStage;
      let setupStage = stage;
      if (stage === 'people' || stage === 'programs' || stage === 'active') {
        setupStage = hasPublishedPolicy ? 'assignments' : 'policies';
        ctx.warn(
          `Setup stage moved from "${String(stage)}" to "${setupStage}": the assignments step is new in schema v3 and had not been completed.`,
        );
      }

      return {
        ...workspace,
        setupStage,
        policyAssignments: Array.isArray(workspace.policyAssignments)
          ? workspace.policyAssignments
          : [],
        schemaVersion: 3,
      };
    },
  },
  {
    id: 'v3-to-v4-h2-5-people-and-sources',
    from: 3,
    to: 4,
    description: 'H2.5 — add the peopleSources and people collections.',
    // Purely additive: two new empty collections, nothing existing is touched
    // and `setupStage` is deliberately left alone. The `people` stage already
    // existed in v3's stage list (it was simply unavailable), so unlike the
    // v2 → v3 remap there is no stage a workspace could have skipped. Nothing
    // is rewritten, so no backup is required.
    destructive: false,
    run: (workspace) => ({
      ...workspace,
      peopleSources: Array.isArray(workspace.peopleSources) ? workspace.peopleSources : [],
      people: Array.isArray(workspace.people) ? workspace.people : [],
      schemaVersion: 4,
    }),
  },
  {
    id: 'v4-to-v5-adr-007-money-minor-units-and-adr-008-person-inactive',
    from: 4,
    to: 5,
    description:
      'ADR-007 — convert Money from major-unit face values to integer minor units. ADR-008 — widen Person status to include Inactive.',
    // Destructive: every Money value is rewritten. The pre-migration payload is
    // backed up verbatim before this runs.
    //
    // ADR-008 needs no transform at all — the status union simply widens, and
    // nothing is ever migrated *into* Inactive. Only post-migration validation
    // changes, which is why the two ship together rather than as separate rungs.
    destructive: true,
    run: (workspace, ctx) => {
      const policies = Array.isArray(workspace.recognitionPolicies)
        ? workspace.recognitionPolicies
        : [];

      const migratedPolicies = policies.map(policy => {
        if (!isPlainObject(policy)) return policy;
        const rules = Array.isArray(policy.recognitionRules) ? policy.recognitionRules : [];

        return {
          ...policy,
          recognitionRules: rules.map((rule, i) => {
            if (!isPlainObject(rule)) return rule;
            const label = `policy "${String(policy.id ?? '?')}" rule ${i + 1} (${String(rule.momentType ?? 'unknown occasion')})`;
            return {
              ...rule,
              budgetPerPerson: migrateMoneyV4toV5(rule.budgetPerPerson, label, ctx),
            };
          }),
        };
      });

      return {
        ...workspace,
        recognitionPolicies: migratedPolicies,
        schemaVersion: 5,
      };
    },
  },
  {
    id: 'v5-to-v6-adr-004-campaign-programs',
    from: 5,
    to: 6,
    description:
      'H2.6 — add the programs collection and normalize baseCurrency against the pinned currency table.',
    // Additive for the collection. `baseCurrency` is normalized in case only —
    // a lowercase but known code is uppercased. An *unknown* currency is never
    // replaced with a guess; it is left as-is and refused by validation, so the
    // operator's original payload survives in the backup.
    destructive: false,
    run: (workspace, ctx) => {
      const raw = workspace.baseCurrency;
      let baseCurrency = raw;

      if (typeof raw === 'string') {
        const normalized = raw.trim().toUpperCase();
        if (currencyExponent(normalized) !== null) {
          baseCurrency = normalized;
          if (normalized !== raw) {
            ctx.warn(`Workspace base currency "${raw}" was normalized to "${normalized}".`);
          }
        } else {
          ctx.warn(
            `Workspace base currency "${raw}" is not a supported ISO 4217 code. It was left unchanged; ` +
              'the workspace cannot be used until it is corrected.',
          );
        }
      }

      return {
        ...workspace,
        baseCurrency,
        programs: Array.isArray(workspace.programs) ? workspace.programs : [],
        schemaVersion: 6,
      };
    },
  },
  {
    id: 'v6-to-v7-adr-011-person-delivery-address',
    from: 6,
    to: 7,
    description: 'H3.2 — declare the optional Person.deliveryAddress field (ADR-011).',
    // **Purely additive, and deliberately a no-op on data.**
    //
    // ADR-011: "No existing record is transformed and no person is given an
    // address by migration." There is nothing to seed — an absent address is
    // the correct state for every existing Person, and inventing one would be
    // worse than leaving it blank. The version bump exists so that a workspace
    // written by this build is distinguishable from a v6 one, not because any
    // byte of person data needs to change.
    //
    // Every field is carried through untouched, including keys this build does
    // not recognize: the spread preserves unknown payload rather than
    // reconstructing a known subset. A forward-compatible field written by a
    // later build survives a round trip through this rung.
    destructive: false,
    run: workspace => ({
      ...workspace,
      schemaVersion: 7,
    }),
  },
];

// ─── ADR-007 Money transform (schema v4 → v5) ────────────────────────────────

/**
 * Convert one legacy Money value to canonical minor units.
 *
 * Legacy shape: `{ amount: number (major units), currency: string }`
 * Canonical:    `{ amountMinor: integer, currency: string }`
 *
 *   amountMinor = round(amount × 10^exponent(currency))
 *
 * **Idempotent.** A value already carrying a valid `amountMinor` is returned
 * untouched, so re-running the chain cannot multiply an amount twice.
 *
 * **Fails loudly, never silently.** An unknown or malformed currency is left
 * unconverted and reported as a warning; post-migration validation then refuses
 * the workspace rather than storing a value whose scale nobody can determine.
 * Guessing an exponent of 2 would misprice every JPY amount by a hundredfold.
 *
 * Note on why the *live* currency table is used here rather than a pinned copy:
 * a currency's minor-unit exponent is an external fact (ISO 4217), not a schema
 * decision. Adding NGN's neighbours to the table later cannot change how NGN
 * migrates today. That is the opposite of `SCHEMA_V2_RELATIONSHIP_TYPES`, where
 * the value set *was* the decision and had to be frozen.
 */
function migrateMoneyV4toV5(raw: unknown, label: string, ctx: MigrationContext): unknown {
  if (!isPlainObject(raw)) {
    ctx.warn(`${label} had no budget value; left as-is.`);
    return raw;
  }

  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';

  // Already canonical — return unchanged so the migration is idempotent.
  if (typeof raw.amountMinor === 'number') {
    if (!Number.isSafeInteger(raw.amountMinor)) {
      ctx.warn(`${label} already had amountMinor ${String(raw.amountMinor)}, which is not a safe integer.`);
      return raw;
    }
    const { amount: _legacyAmount, ...rest } = raw;
    return { ...rest, currency: currency || raw.currency };
  }

  if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) {
    ctx.warn(`${label} had a non-numeric amount (${String(raw.amount)}); left unconverted.`);
    return raw;
  }

  const exponent = currencyExponent(currency);
  if (exponent === null) {
    ctx.warn(
      `${label} uses currency "${String(raw.currency)}", which is not a known ISO 4217 code. ` +
        'Its amount was left unconverted rather than guessing a decimal scale.',
    );
    return raw;
  }

  const scaled = raw.amount * 10 ** exponent;
  const amountMinor = roundHalfAwayFromZero(scaled);

  // Report any precision the currency could not hold, rather than concealing it.
  if (Math.abs(scaled - amountMinor) > Number.EPSILON * Math.max(1, Math.abs(scaled))) {
    ctx.warn(
      `${label} held ${raw.amount} ${currency}, which is finer than ${currency} supports ` +
        `(${exponent} decimal place${exponent === 1 ? '' : 's'}). Rounded to ${amountMinor} minor units.`,
    );
  }

  if (!Number.isSafeInteger(amountMinor)) {
    ctx.warn(`${label} converted to ${amountMinor}, which exceeds the safe integer range; left unconverted.`);
    return raw;
  }

  const { amount: _legacyAmount, ...rest } = raw;
  return { ...rest, amountMinor, currency };
}

// ─── Version detection ───────────────────────────────────────────────────────

/**
 * A payload with no `schemaVersion` is the legacy H2.3 schema (v1).
 * A payload with a malformed `schemaVersion` is refused rather than guessed at.
 */
export function detectSchemaVersion(raw: RawWorkspace): number | null {
  if (raw.schemaVersion === undefined || raw.schemaVersion === null) {
    return LEGACY_UNVERSIONED_SCHEMA_VERSION;
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
    return null;
  }
  if (raw.schemaVersion < LEGACY_UNVERSIONED_SCHEMA_VERSION) return null;
  return raw.schemaVersion;
}

// ─── Post-migration structural validation ────────────────────────────────────

/**
 * Minimum structure a workspace must have to be handed to the app. This is a
 * gate, not a repair step — anything that fails here is refused so the caller
 * can preserve the payload instead of overwriting it.
 */
export function validateMigratedWorkspace(raw: unknown): { ok: true } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Workspace is not an object.' };

  if (raw.schemaVersion !== CURRENT_WORKSPACE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Expected schemaVersion ${CURRENT_WORKSPACE_SCHEMA_VERSION}, found ${String(raw.schemaVersion)}.`,
    };
  }
  if (!isNonEmptyString(raw.organizationId)) {
    return { ok: false, reason: 'Workspace has no organizationId.' };
  }
  if (
    typeof raw.setupStage !== 'string' ||
    !(SCHEMA_V3_SETUP_STAGES as readonly string[]).includes(raw.setupStage)
  ) {
    return { ok: false, reason: `Unrecognized setupStage: ${String(raw.setupStage)}.` };
  }
  if (!Array.isArray(raw.relationshipClasses)) {
    return { ok: false, reason: 'relationshipClasses is not an array.' };
  }
  if (!Array.isArray(raw.recognitionPolicies)) {
    return { ok: false, reason: 'recognitionPolicies is not an array.' };
  }
  if (!Array.isArray(raw.policyAssignments)) {
    return { ok: false, reason: 'policyAssignments is not an array.' };
  }
  if (!Array.isArray(raw.peopleSources)) {
    return { ok: false, reason: 'peopleSources is not an array.' };
  }
  if (!Array.isArray(raw.people)) {
    return { ok: false, reason: 'people is not an array.' };
  }
  if (!Array.isArray(raw.programs)) {
    return { ok: false, reason: 'programs is not an array.' };
  }

  // R4 risk 1, closed. Budget envelopes make an unvalidated base currency a
  // real hazard: a workspace whose default currency has no known exponent
  // cannot price anything. Refused rather than assumed to be two-decimal.
  if (
    typeof raw.baseCurrency !== 'string' ||
    !CURRENCY_CODE_PATTERN.test(raw.baseCurrency) ||
    currencyExponent(raw.baseCurrency) === null
  ) {
    return {
      ok: false,
      reason: `Workspace base currency "${String(raw.baseCurrency)}" is not a supported ISO 4217 code.`,
    };
  }

  for (const [i, cls] of raw.relationshipClasses.entries()) {
    if (!isPlainObject(cls)) {
      return { ok: false, reason: `Relationship class at index ${i} is not an object.` };
    }
    if (!isNonEmptyString(cls.id)) {
      return { ok: false, reason: `Relationship class at index ${i} has no id.` };
    }
    if (!isSchemaV2RelationshipType(cls.type)) {
      return {
        ok: false,
        reason: `Relationship class "${cls.id}" has an invalid type: ${String(cls.type)}.`,
      };
    }
    if (!isValidRelationshipLevel(cls.level)) {
      return {
        ok: false,
        reason: `Relationship class "${cls.id}" has an invalid level: ${String(cls.level)}. Expected an integer ${RELATIONSHIP_LEVEL_MIN}–${RELATIONSHIP_LEVEL_MAX}.`,
      };
    }
    if ('category' in cls || 'tier' in cls) {
      return {
        ok: false,
        reason: `Relationship class "${cls.id}" still carries superseded category/tier fields.`,
      };
    }
  }

  for (const [i, assignment] of raw.policyAssignments.entries()) {
    if (!isPlainObject(assignment)) {
      return { ok: false, reason: `Policy assignment at index ${i} is not an object.` };
    }
    if (!isNonEmptyString(assignment.id)) {
      return { ok: false, reason: `Policy assignment at index ${i} has no id.` };
    }
    if (!isNonEmptyString(assignment.relationshipClassId)) {
      return { ok: false, reason: `Policy assignment "${assignment.id}" has no relationshipClassId.` };
    }
    if (!isNonEmptyString(assignment.recognitionPolicyId)) {
      return { ok: false, reason: `Policy assignment "${assignment.id}" has no recognitionPolicyId.` };
    }
    if (!Number.isInteger(assignment.priority)) {
      return {
        ok: false,
        reason: `Policy assignment "${assignment.id}" has a non-integer priority: ${String(assignment.priority)}.`,
      };
    }
    if (typeof assignment.isActive !== 'boolean') {
      return { ok: false, reason: `Policy assignment "${assignment.id}" has a non-boolean isActive.` };
    }
    // Absent or blank means Global. Anything present must be a valid alpha-2 code.
    if (
      assignment.countryCode !== undefined &&
      assignment.countryCode !== null &&
      assignment.countryCode !== '' &&
      (typeof assignment.countryCode !== 'string' || !COUNTRY_CODE_PATTERN.test(assignment.countryCode))
    ) {
      return {
        ok: false,
        reason: `Policy assignment "${assignment.id}" has an invalid countryCode: ${String(assignment.countryCode)}. Expected a two-letter uppercase ISO 3166-1 alpha-2 code, or blank for Global.`,
      };
    }
  }

  // ADR-007 — every persisted Money must be canonical before the app sees it.
  // A legacy `amount` surviving here would be a value of unknown scale.
  for (const [i, policy] of raw.recognitionPolicies.entries()) {
    if (!isPlainObject(policy)) {
      return { ok: false, reason: `Recognition policy at index ${i} is not an object.` };
    }
    if (!Array.isArray(policy.recognitionRules)) continue;

    for (const rule of policy.recognitionRules) {
      if (!isPlainObject(rule)) continue;
      const label = `Policy "${String(policy.id)}" rule "${String(rule.momentType)}"`;
      const budget = rule.budgetPerPerson;

      if (!isPlainObject(budget)) {
        return { ok: false, reason: `${label} has no budget value.` };
      }
      // Currency is checked first: an unknown currency is the *cause* of a
      // failed conversion, and reporting the leftover `amount` instead would
      // name the symptom.
      if (
        typeof budget.currency !== 'string' ||
        !CURRENCY_CODE_PATTERN.test(budget.currency) ||
        currencyExponent(budget.currency) === null
      ) {
        return {
          ok: false,
          reason: `${label} uses currency "${String(budget.currency)}", which is not a supported ISO 4217 code. Its amount cannot be scaled safely.`,
        };
      }
      if ('amount' in budget) {
        return {
          ok: false,
          reason: `${label} still carries a legacy major-unit \`amount\`. Its scale is unknown, so it cannot be used.`,
        };
      }
      if (typeof budget.amountMinor !== 'number' || !Number.isSafeInteger(budget.amountMinor)) {
        return {
          ok: false,
          reason: `${label} has a budget that is not a safe integer of minor units: ${String(budget.amountMinor)}.`,
        };
      }
    }
  }

  for (const [i, program] of raw.programs.entries()) {
    if (!isPlainObject(program)) {
      return { ok: false, reason: `Program at index ${i} is not an object.` };
    }
    if (!isNonEmptyString(program.id)) {
      return { ok: false, reason: `Program at index ${i} has no id.` };
    }
    if (
      typeof program.mode !== 'string' ||
      !(SCHEMA_V6_PROGRAM_MODES as readonly string[]).includes(program.mode)
    ) {
      return { ok: false, reason: `Program "${program.id}" has an invalid mode: ${String(program.mode)}.` };
    }
    if (
      typeof program.status !== 'string' ||
      !(SCHEMA_V6_PROGRAM_STATUSES as readonly string[]).includes(program.status)
    ) {
      return { ok: false, reason: `Program "${program.id}" has an invalid status: ${String(program.status)}.` };
    }
    if (!isNonEmptyString(program.relationshipClassId)) {
      return { ok: false, reason: `Program "${program.id}" has no relationshipClassId.` };
    }
    // ADR-004 — a Program never pins a policy. These fields must not exist.
    if ('policyAssignmentId' in program || 'recognitionPolicyId' in program || 'policySnapshot' in program) {
      return {
        ok: false,
        reason: `Program "${program.id}" carries a pinned policy reference. Policy resolves per Moment (ADR-004).`,
      };
    }
    if (!Array.isArray(program.budgetEnvelopes)) {
      return { ok: false, reason: `Program "${program.id}" has no budgetEnvelopes array.` };
    }

    const seenCurrencies = new Set<string>();
    for (const envelope of program.budgetEnvelopes) {
      if (!isPlainObject(envelope)) {
        return { ok: false, reason: `Program "${program.id}" has a malformed budget envelope.` };
      }
      if (typeof envelope.amountMinor !== 'number' || !Number.isSafeInteger(envelope.amountMinor) || envelope.amountMinor < 0) {
        return {
          ok: false,
          reason: `Program "${program.id}" has a budget that is not a non-negative safe integer: ${String(envelope.amountMinor)}.`,
        };
      }
      if (
        typeof envelope.currency !== 'string' ||
        !CURRENCY_CODE_PATTERN.test(envelope.currency) ||
        currencyExponent(envelope.currency) === null
      ) {
        return {
          ok: false,
          reason: `Program "${program.id}" has a budget in an unsupported currency: ${String(envelope.currency)}.`,
        };
      }
      if (seenCurrencies.has(envelope.currency)) {
        return {
          ok: false,
          reason: `Program "${program.id}" has more than one ${envelope.currency} budget envelope.`,
        };
      }
      seenCurrencies.add(envelope.currency);
    }
  }

  for (const [i, source] of raw.peopleSources.entries()) {
    if (!isPlainObject(source)) {
      return { ok: false, reason: `People source at index ${i} is not an object.` };
    }
    if (!isNonEmptyString(source.id)) {
      return { ok: false, reason: `People source at index ${i} has no id.` };
    }
    if (
      typeof source.type !== 'string' ||
      !(SCHEMA_V4_PEOPLE_SOURCE_TYPES as readonly string[]).includes(source.type)
    ) {
      return { ok: false, reason: `People source "${source.id}" has an invalid type: ${String(source.type)}.` };
    }
    if (
      typeof source.status !== 'string' ||
      !(SCHEMA_V4_PEOPLE_SOURCE_STATUSES as readonly string[]).includes(source.status)
    ) {
      return { ok: false, reason: `People source "${source.id}" has an invalid status: ${String(source.status)}.` };
    }
  }

  for (const [i, person] of raw.people.entries()) {
    if (!isPlainObject(person)) {
      return { ok: false, reason: `Person at index ${i} is not an object.` };
    }
    if (!isNonEmptyString(person.id)) {
      return { ok: false, reason: `Person at index ${i} has no id.` };
    }
    if (!isNonEmptyString(person.firstName) || !isNonEmptyString(person.lastName)) {
      return { ok: false, reason: `Person "${person.id}" is missing a first or last name.` };
    }
    if (
      typeof person.status !== 'string' ||
      !(SCHEMA_V5_PERSON_STATUSES as readonly string[]).includes(person.status)
    ) {
      return { ok: false, reason: `Person "${person.id}" has an invalid status: ${String(person.status)}.` };
    }
    if (
      typeof person.sourceType !== 'string' ||
      !(SCHEMA_V4_PEOPLE_SOURCE_TYPES as readonly string[]).includes(person.sourceType)
    ) {
      return { ok: false, reason: `Person "${person.id}" has an invalid sourceType: ${String(person.sourceType)}.` };
    }
    if (
      !Array.isArray(person.relationshipClassIds) ||
      person.relationshipClassIds.some(id => typeof id !== 'string')
    ) {
      return { ok: false, reason: `Person "${person.id}" has a malformed relationshipClassIds list.` };
    }
    // ADR-011 — the address is optional, so absence is valid. What is refused is
    // a *structurally* wrong shape, which would crash a brief rather than merely
    // block one.
    //
    // An address present but **incomplete** is deliberately accepted here. It is
    // a normal customer state — half-entered data that the Execution Brief
    // refuses to confirm against and names for correction. Refusing the whole
    // workspace over it would lock an administrator out of the very screen that
    // fixes it.
    if (person.deliveryAddress !== undefined) {
      if (!isPlainObject(person.deliveryAddress)) {
        return { ok: false, reason: `Person "${person.id}" has a malformed deliveryAddress.` };
      }
      for (const [key, value] of Object.entries(person.deliveryAddress)) {
        if (value !== undefined && typeof value !== 'string') {
          return {
            ok: false,
            reason: `Person "${person.id}" has a non-text deliveryAddress.${key}.`,
          };
        }
      }
    }
  }

  return { ok: true };
}

// ─── Migration runner (pure) ─────────────────────────────────────────────────

/**
 * Bring a raw workspace payload up to the current schema version.
 *
 * Pure — reads and writes nothing. The caller decides what to persist, which is
 * what lets `loadAndMigrateWorkspace` back the original payload up while it is
 * still untouched in storage.
 *
 * Idempotent: a payload already at the current version returns unchanged with
 * `migrated: false`, and no migration is re-run.
 */
export function migrateWorkspace<T>(raw: unknown): MigrationResult<T> {
  if (!isPlainObject(raw)) {
    return { status: 'invalid', reason: 'Stored workspace is not an object.', fromVersion: null };
  }

  const fromVersion = detectSchemaVersion(raw);
  if (fromVersion === null) {
    return {
      status: 'invalid',
      reason: `Unreadable schemaVersion: ${String(raw.schemaVersion)}.`,
      fromVersion: null,
    };
  }
  if (fromVersion > CURRENT_WORKSPACE_SCHEMA_VERSION) {
    return {
      status: 'invalid',
      reason: `Workspace is at schema v${fromVersion}, newer than this build understands (v${CURRENT_WORKSPACE_SCHEMA_VERSION}). Refusing to downgrade.`,
      fromVersion,
    };
  }

  // Work on a copy so a failed run cannot leave the caller's object half-changed.
  let working: RawWorkspace;
  try {
    working = JSON.parse(JSON.stringify(raw)) as RawWorkspace;
  } catch {
    return { status: 'invalid', reason: 'Workspace could not be safely copied.', fromVersion };
  }

  const warnings: string[] = [];
  const ctx: MigrationContext = { warn: (m) => warnings.push(m) };
  const applied: string[] = [];
  let destructive = false;
  let version = fromVersion;

  while (version < CURRENT_WORKSPACE_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find((m) => m.from === version);
    if (!migration) {
      return {
        status: 'invalid',
        reason: `No migration path from schema v${version} to v${CURRENT_WORKSPACE_SCHEMA_VERSION}.`,
        fromVersion,
      };
    }
    try {
      working = migration.run(working, ctx);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        status: 'invalid',
        reason: `Migration "${migration.id}" failed: ${detail}`,
        fromVersion,
      };
    }
    applied.push(migration.id);
    destructive = destructive || migration.destructive;
    version = migration.to;
    working.schemaVersion = version;
  }

  const validation = validateMigratedWorkspace(working);
  if (!validation.ok) {
    return {
      status: 'invalid',
      reason: `Workspace failed validation after migration: ${validation.reason}`,
      fromVersion,
    };
  }

  return {
    status: 'ok',
    workspace: working as T,
    migrated: applied.length > 0,
    fromVersion,
    toVersion: version,
    applied,
    destructive,
    warnings,
  };
}

// ─── Migration runner (storage-facing) ───────────────────────────────────────

export function workspaceBackupKey(fromVersion: number, at: Date): string {
  return `${WORKSPACE_BACKUP_KEY_PREFIX}_v${fromVersion}_${at.toISOString()}`;
}

/**
 * Read the persisted workspace, migrate it if needed, persist the result.
 *
 * Storage is injected rather than reached for so the runner can be exercised
 * outside a browser.
 *
 * Writes happen only when there is something to write:
 *   - already current  → no backup, no write
 *   - migrated         → backup first (if destructive), then save
 *   - unreadable       → nothing overwritten; payload quarantined once
 */
export function loadAndMigrateWorkspace<T>(
  storage: WorkspaceStorage,
  now: () => Date = () => new Date(),
): LoadResult<T> {
  const rawText = storage.getItem(WORKSPACE_KEY);
  if (rawText === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      status: 'invalid',
      reason: 'Stored workspace is not valid JSON.',
      quarantineKey: quarantine(storage, rawText),
    };
  }

  const result = migrateWorkspace<T>(parsed);
  if (result.status === 'invalid') {
    return {
      status: 'invalid',
      reason: result.reason,
      quarantineKey: quarantine(storage, rawText),
    };
  }

  let backupKey: string | null = null;
  if (result.migrated) {
    // Back up the verbatim pre-migration payload while it is still the only
    // copy in storage — before anything is overwritten.
    if (result.destructive) {
      backupKey = workspaceBackupKey(result.fromVersion, now());
      storage.setItem(backupKey, rawText);
    }
    storage.setItem(WORKSPACE_KEY, JSON.stringify(result.workspace));
  }

  return {
    status: 'ok',
    workspace: result.workspace,
    migrated: result.migrated,
    fromVersion: result.fromVersion,
    toVersion: result.toVersion,
    applied: result.applied,
    warnings: result.warnings,
    backupKey,
  };
}

/**
 * Copy an unreadable payload aside so it is not lost to the next write.
 * Written at most once — a repeatedly failing read must not fill storage.
 */
function quarantine(storage: WorkspaceStorage, rawText: string): string | null {
  if (storage.getItem(WORKSPACE_QUARANTINE_KEY) !== null) return WORKSPACE_QUARANTINE_KEY;
  try {
    storage.setItem(WORKSPACE_QUARANTINE_KEY, rawText);
    return WORKSPACE_QUARANTINE_KEY;
  } catch {
    return null;
  }
}
