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

// ─── Schema versions ─────────────────────────────────────────────────────────

/**
 * Schema v1 — the H2.3 shape. Persisted without a `schemaVersion` field, so a
 * payload that has no version is by definition v1.
 */
export const LEGACY_UNVERSIONED_SCHEMA_VERSION = 1;

/** Schema v3 — H2.4: Policy Assignments + the `assignments` setup stage. */
export const CURRENT_WORKSPACE_SCHEMA_VERSION = 3;

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
];

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
