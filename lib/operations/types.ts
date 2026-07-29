/**
 * Canonical operational records — H3.1, implementing ADR-006 and ADR-010.
 *
 * These are **not** workspace configuration. A Moment is something Aniyé is
 * doing; a Decision is a judgement it made; an Event is something that
 * happened. They accumulate rather than being edited, they are written by
 * operators rather than by the customer, and per ADR-010 they live in a
 * separate `OperationsState` that the customer's document never sees.
 */

import type { Money } from '../money';
import type { DeliveryAddress, RelationshipType } from '../workspace';

// ─── Moment ──────────────────────────────────────────────────────────────────

/**
 * H3.1 statuses only. Fulfilment stages — dispatched, delivered, closed — do
 * not exist yet and must not be added speculatively; each needs the object that
 * produces it.
 */
export const MOMENT_STATUSES = ['NeedsReview', 'ReadyForExecution', 'Cancelled'] as const;
export type MomentStatus = (typeof MOMENT_STATUSES)[number];

/**
 * What the next operational step needs to reach a person — deliberately not the
 * whole Person record. Copying everything would create a second source of truth
 * for data the customer keeps editing.
 */
export interface RecipientSnapshot {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  country?: string;
  role?: string;
}

/** Enough to explain which group this Moment came from, after the group changes. */
export interface RelationshipGroupSnapshot {
  relationshipClassId: string;
  name: string;
  type: RelationshipType;
  level: number;
}

/**
 * Why this Moment received this budget — the answer must survive the policy
 * being edited, republished or archived afterwards.
 *
 * Deliberately not the whole policy: the fields here are the ones that explain
 * the outcome, and nothing more.
 */
export interface PolicyResolutionSnapshot {
  policyAssignmentId: string;
  policyId: string;
  policyName: string;
  policyVersion: number;
  /** The country code the winning assignment was scoped to, or 'Global'. */
  resolvedCountryScope: string;
  occasionType: string;
  approvedRecognitionBudget: Money;
  /**
   * The gift categories the governing policy excluded, captured at generation —
   * **H3.3, and deliberately optional.**
   *
   * Optional because it is *absent* on every Moment generated before H3.3, and
   * absent has to keep meaning "nobody recorded this", not "nothing was
   * excluded". Defaulting it to `[]` would be the worst possible repair: it
   * reads as a fact, it is silent, and it would let an operator send a gift the
   * governing rule forbade.
   *
   * There is no way to recover it after the fact. `RecognitionPolicy` is edited
   * **in place at the same version** — `PolicyForm.save()` writes the same `id`
   * and the same `version` back, including when publishing — so matching
   * `policyId` and `policyVersion` against the live policy proves nothing about
   * whether `excludedCategories` still holds what it held at generation.
   *
   * So a Moment without this field blocks item selection with a named
   * explanation and a recovery, rather than being filtered against a guess.
   */
  excludedCategories?: string[];
  resolvedAt: string;
}

/** A named reason a Moment cannot proceed. Shown to the operator verbatim. */
export interface MomentIssue {
  code:
    | 'person-missing'
    | 'person-inactive'
    | 'person-archived'
    | 'group-missing'
    | 'group-inactive'
    | 'country-missing'
    | 'no-executable-assignment'
    | 'no-occasion-rule';
  message: string;
  /** Workspace page that fixes it. Operations links out; it never edits. */
  href?: string;
}

export interface Moment {
  id: string;
  workspaceId: string;
  programId: string;
  personId: string;
  relationshipClassId: string;
  occasionType: string;
  targetDate: string;
  status: MomentStatus;
  /**
   * Deterministic logical identity. Two generation runs for the same workspace,
   * program, person and occasion produce the same key — which is what makes
   * repeat preparation report "already prepared" instead of duplicating.
   */
  sourceKey: string;
  recipientSnapshot: RecipientSnapshot;
  relationshipGroupSnapshot: RelationshipGroupSnapshot;
  policyResolutionSnapshot?: PolicyResolutionSnapshot;
  issues: MomentIssue[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

// ─── Decision ────────────────────────────────────────────────────────────────

/** ADR-006 Council condition: two statuses only for the first operational version. */
export const DECISION_STATUSES = ['Confirmed', 'Superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_PROVIDERS = ['HumanOperator', 'RuleEngine'] as const;
export type DecisionProvider = (typeof DECISION_PROVIDERS)[number];

/** Only the types H3.1 – H3.3 actually produce. More arrive with the steps that need them. */
export const DECISION_TYPES = [
  'MomentQualification',
  'PolicyResolution',
  'MomentCancellation',
  // H3.2 — ADR-011. Confirming a brief is a judgement (the operator asserts the
  // brief is correct and executable); overriding its address is a second one.
  'BriefConfirmation',
  'AddressOverride',
  // H3.3 — the first Decision with real alternatives. Several items fit the
  // budget and the rule; the operator picks one and says why.
  //
  // `ItemSubstitution` is **not** added here. Substituting presupposes a
  // selection that already exists and something downstream that consumed it;
  // neither exists yet, and a type nothing can produce is not architecture.
  'ItemSelection',
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/**
 * A judgement between alternatives, with a required reason.
 *
 * Never mutated. A decision that no longer holds is superseded by a new one,
 * and the original keeps its original text — an audit trail that can be edited
 * is not evidence.
 */
export interface Decision {
  id: string;
  workspaceId: string;
  momentId: string;
  decisionType: DecisionType;
  status: DecisionStatus;
  provider: DecisionProvider;
  actorId?: string;
  /** What was considered — candidates, inputs, the query. */
  inputs: Record<string, unknown>;
  recommendation?: string;
  finalDecision: string;
  reason: string;
  /** Required when the final decision differs from the recommendation. */
  overrideReason?: string;
  createdAt: string;
  confirmedAt: string;
  supersededAt?: string;
  supersededByDecisionId?: string;
}

// ─── OperationalEvent ────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'MomentCreated',
  'MomentMarkedReady',
  'MomentNeedsReview',
  'MomentCancelled',
  // H3.2 — ADR-011.
  'BriefGenerated',
  // Named for what actually happens: a *brief* was overridden, not a customer
  // record updated. Supersedes the checkpoint's ambiguous `AddressUpdated`,
  // which implied a write across the ADR-005 boundary that never occurs.
  'ExecutionBriefAddressOverridden',
  // H3.3. The checkpoint proposed `ItemPrepared`, but nothing is prepared here:
  // no vendor has been asked, no order exists, nothing has been made or moved.
  // An item was **selected**, and that is the whole occurrence. Per
  // `RELATIONSHIP_OPERATIONS_ATLAS.md` §6 the checkpoint's downstream names are
  // proposals, and the milestone that builds each one fixes its final name.
  'ItemSelected',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ACTOR_TYPES = ['System', 'Operator', 'Customer', 'Vendor', 'Courier'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const EVENT_SOURCES = ['Platform', 'WhatsApp', 'Email', 'Phone', 'Manual'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/**
 * Something that happened. Append-only: never edited, never deleted.
 *
 * A future correction mechanism appends a referencing event rather than
 * rewriting one. Ordinary reads, renders and button clicks are **not** events —
 * the test is whether it changes the state of a Moment's execution.
 */
export interface OperationalEvent {
  id: string;
  workspaceId: string;
  momentId: string;
  eventType: EventType;
  actorType: ActorType;
  actorId?: string;
  source: EventSource;
  payload: Record<string, unknown>;
  /** When it happened in the world. */
  occurredAt: string;
  /** When Aniyé learned of it. The two differ once external parties report. */
  recordedAt: string;
}

// ─── ExecutionBrief ──────────────────────────────────────────────────────────

/**
 * H3.2 statuses only, and deliberately the same two ADR-006 gives a Decision.
 *
 * There is no `Draft`. A brief is only written on confirmation — an unconfirmed
 * brief is UI preview state, exactly as ADR-006 requires of every other draft
 * choice. Adding `Draft` would mean persisting something nobody asserted.
 */
export const BRIEF_STATUSES = ['Confirmed', 'Superseded'] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

/** Where the address on a brief came from. Provenance is required on override. */
export const ADDRESS_SOURCES = ['PersonDefault', 'OperatorOverride'] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

/**
 * An operator's correction to one brief's address.
 *
 * **Never writes back to `Person`** (ADR-005, ADR-011). The customer's record is
 * left for the customer to correct; this records only what Aniyé actually
 * shipped against, and why.
 */
export interface AddressOverrideRecord {
  /** Required. Becomes part of the permanent record. */
  reason: string;
  /** Who made the call. `Operator` in H3.2 — there is no role model (ADR-010). */
  actorType: ActorType;
  actorId?: string;
  /** How the correction reached Aniyé — the channel is a field, not a system. */
  source: EventSource;
  overriddenAt: string;
  /** What the brief said before. Kept so the correction is legible later. */
  previousAddress?: DeliveryAddress;
  previousAddressSource: AddressSource;
}

/**
 * The operator's unit of work for one Moment: who, where, how much, and what
 * constraints apply. Deliberately invisible to the customer.
 *
 * Immutable once confirmed. A correction supersedes it with a new revision
 * rather than editing it — an execution record that can be rewritten after the
 * fact is not evidence of what was executed.
 */
export interface ExecutionBrief {
  id: string;
  workspaceId: string;
  momentId: string;
  status: BriefStatus;
  /** 1 for the first confirmation, incrementing with each revision. */
  revision: number;
  /** Set on a revision, pointing at the brief it replaces. */
  revisionOfBriefId?: string;
  /** Set on the superseded brief, pointing forward. Never set twice. */
  supersededByBriefId?: string;
  supersededAt?: string;

  /** Copied from the Moment, not referenced — the Moment's snapshots may age. */
  recipientSnapshot: RecipientSnapshot;
  relationshipGroupSnapshot: RelationshipGroupSnapshot;
  /**
   * Required. A brief without a resolved budget has no constraints to render,
   * which is why only a `ReadyForExecution` Moment can produce one.
   */
  policyResolutionSnapshot: PolicyResolutionSnapshot;

  /**
   * **Copied from `Person.deliveryAddress` at confirmation** — the same reason
   * the policy snapshot is copied (Atlas §15e). The brief must still explain
   * where a gift was sent after the customer edits their record. A reference
   * would let history rewrite itself.
   */
  deliveryAddressSnapshot: DeliveryAddress;
  addressSource: AddressSource;
  /** Present only when an operator overrode the address for this brief. */
  addressOverride?: AddressOverrideRecord;

  occasionType: string;
  targetDate: string;
  approvedBudget: Money;
  /** Free-text constraints carried from the resolved policy. */
  constraints: string[];

  createdAt: string;
  confirmedAt: string;
}

// ─── OperationsState ─────────────────────────────────────────────────────────

/**
 * Independent of the workspace schema version — see ADR-010.
 *
 * **v2 (H3.2)** adds the `executionBriefs` collection. Additive.
 * **v3 (H3.3)** admits `policyResolutionSnapshot.excludedCategories` on newly
 * generated Moments. Additive, and it **adds nothing to existing records**.
 */
export const CURRENT_OPERATIONS_SCHEMA_VERSION = 3;

/**
 * The storage *location*, not a version assertion.
 *
 * Deliberately unchanged at v3. ADR-010 and Atlas §15d name this key, and
 * moving it would orphan every operational record already written — the exact
 * history this module exists to protect. The version lives inside the payload.
 */
export const OPERATIONS_KEY = 'aniye_operations_v1';

/**
 * Unreadable or foreign operational data is moved here rather than overwritten.
 * Fixed key, written at most once.
 */
export const OPERATIONS_QUARANTINE_KEY = 'aniye_operations_quarantine';

export interface OperationsState {
  schemaVersion: number;
  /** Exactly one workspace. A payload for another is refused, never adopted. */
  workspaceId: string;
  moments: Moment[];
  decisions: Decision[];
  events: OperationalEvent[];
  /** H3.2, additive at operations schema v2. */
  executionBriefs: ExecutionBrief[];
  createdAt: string;
  updatedAt: string;
}

export function emptyOperationsState(workspaceId: string, now: string): OperationsState {
  return {
    schemaVersion: CURRENT_OPERATIONS_SCHEMA_VERSION,
    workspaceId,
    moments: [],
    decisions: [],
    events: [],
    executionBriefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Operations migration ────────────────────────────────────────────────────

export type OperationsMigrationResult =
  | { status: 'current'; state: OperationsState }
  | { status: 'migrated'; state: OperationsState; from: number }
  | { status: 'invalid'; reason: string };

/**
 * Bring a stored operations payload up to the current version.
 *
 * Pure. One rung at a time, exactly as the workspace chain works — a v1 payload
 * must reach v2 without being discarded. Quarantining real operational history
 * because a collection was added would be a data-loss bug wearing a safety
 * feature's clothes.
 *
 * **Preserves unknown keys.** The spread carries through anything this build
 * does not recognize, so a payload written by a later build survives a round
 * trip rather than being silently reduced to the fields named here.
 */
export function migrateOperationsState(raw: unknown): OperationsMigrationResult {
  if (!isPlainObject(raw)) return { status: 'invalid', reason: 'Operations state is not an object.' };

  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { status: 'invalid', reason: `Unreadable operations schemaVersion: ${String(version)}.` };
  }
  if (version > CURRENT_OPERATIONS_SCHEMA_VERSION) {
    return {
      status: 'invalid',
      reason: `Operations state is at v${version}, newer than this build understands (v${CURRENT_OPERATIONS_SCHEMA_VERSION}). Refusing to downgrade.`,
    };
  }

  let working: Record<string, unknown>;
  try {
    working = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    return { status: 'invalid', reason: 'Operations state could not be safely copied.' };
  }

  const from = version;

  // v1 → v2: add the executionBriefs collection. Additive; nothing else moves.
  if ((working.schemaVersion as number) === 1) {
    working = {
      ...working,
      executionBriefs: Array.isArray(working.executionBriefs) ? working.executionBriefs : [],
      schemaVersion: 2,
    };
  }

  // v2 → v3: admit `policyResolutionSnapshot.excludedCategories` on Moments
  // generated from here on. **A pure version bump — no record is touched.**
  //
  // It is tempting to walk the Moments and give each an empty exclusion list,
  // and that would be a data-loss bug wearing a migration's clothes: a v2
  // Moment genuinely does not know what its policy excluded, and writing `[]`
  // would convert "unknown" into the false claim "nothing was excluded". The
  // absence is the evidence, and it is preserved exactly. `selection.ts` reads
  // it as *unknown* and blocks, which is the only honest outcome.
  //
  // Same shape as the workspace v6 → v7 rung, and for the same reason.
  if ((working.schemaVersion as number) === 2) {
    working = { ...working, schemaVersion: 3 };
  }

  return from === CURRENT_OPERATIONS_SCHEMA_VERSION
    ? { status: 'current', state: working as unknown as OperationsState }
    : { status: 'migrated', state: working as unknown as OperationsState, from };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ValidationResult = { ok: true } | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * A policy snapshot's exclusion list, if it has one.
 *
 * Absent is **valid** — that is every pre-H3.3 record, and refusing it would
 * quarantine real operational history. Present but malformed is not: a
 * half-written exclusion list is worse than none, because selection would treat
 * it as trustworthy.
 */
function excludedCategoriesValid(snapshot: unknown): boolean {
  if (!isPlainObject(snapshot)) return true;
  const excluded = snapshot.excludedCategories;
  if (excluded === undefined) return true;
  return Array.isArray(excluded) && excluded.every(c => typeof c === 'string');
}

/**
 * Structural gate for a whole operations payload.
 *
 * Applied both on read and — critically — to the *proposed* state before any
 * write, so a batch that would produce an invalid state commits nothing.
 */
export function validateOperationsState(raw: unknown, expectedWorkspaceId?: string): ValidationResult {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Operations state is not an object.' };

  if (raw.schemaVersion !== CURRENT_OPERATIONS_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Expected operations schemaVersion ${CURRENT_OPERATIONS_SCHEMA_VERSION}, found ${String(raw.schemaVersion)}.`,
    };
  }
  if (!isNonEmptyString(raw.workspaceId)) {
    return { ok: false, reason: 'Operations state has no workspaceId.' };
  }
  if (expectedWorkspaceId !== undefined && raw.workspaceId !== expectedWorkspaceId) {
    return {
      ok: false,
      reason: `Operations state belongs to workspace "${raw.workspaceId}", not "${expectedWorkspaceId}".`,
    };
  }
  for (const collection of ['moments', 'decisions', 'events', 'executionBriefs'] as const) {
    if (!Array.isArray(raw[collection])) {
      return { ok: false, reason: `${collection} is not an array.` };
    }
  }

  const momentIds = new Set<string>();
  const sourceKeys = new Set<string>();

  for (const [i, moment] of (raw.moments as unknown[]).entries()) {
    if (!isPlainObject(moment)) return { ok: false, reason: `Moment at index ${i} is not an object.` };
    if (!isNonEmptyString(moment.id)) return { ok: false, reason: `Moment at index ${i} has no id.` };
    if (momentIds.has(moment.id)) return { ok: false, reason: `Duplicate moment id "${moment.id}".` };
    momentIds.add(moment.id);

    if (!isNonEmptyString(moment.sourceKey)) {
      return { ok: false, reason: `Moment "${moment.id}" has no sourceKey.` };
    }
    if (sourceKeys.has(moment.sourceKey)) {
      return { ok: false, reason: `Duplicate moment sourceKey "${moment.sourceKey}".` };
    }
    sourceKeys.add(moment.sourceKey);

    if (moment.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Moment "${moment.id}" belongs to a different workspace.` };
    }
    if (typeof moment.status !== 'string' || !(MOMENT_STATUSES as readonly string[]).includes(moment.status)) {
      return { ok: false, reason: `Moment "${moment.id}" has an invalid status: ${String(moment.status)}.` };
    }
    if (!isNonEmptyString(moment.programId) || !isNonEmptyString(moment.personId)) {
      return { ok: false, reason: `Moment "${moment.id}" is missing a program or person reference.` };
    }
    if (!isPlainObject(moment.recipientSnapshot)) {
      return { ok: false, reason: `Moment "${moment.id}" has no recipient snapshot.` };
    }
    if (!Array.isArray(moment.issues)) {
      return { ok: false, reason: `Moment "${moment.id}" has a malformed issues list.` };
    }
    // A ready Moment must be able to explain its budget.
    if (moment.status === 'ReadyForExecution' && !isPlainObject(moment.policyResolutionSnapshot)) {
      return { ok: false, reason: `Moment "${moment.id}" is ready but has no policy resolution snapshot.` };
    }
    if (!excludedCategoriesValid(moment.policyResolutionSnapshot)) {
      return { ok: false, reason: `Moment "${moment.id}" has a malformed excluded-category snapshot.` };
    }
  }

  const decisionIds = new Set<string>();
  for (const [i, decision] of (raw.decisions as unknown[]).entries()) {
    if (!isPlainObject(decision)) return { ok: false, reason: `Decision at index ${i} is not an object.` };
    if (!isNonEmptyString(decision.id)) return { ok: false, reason: `Decision at index ${i} has no id.` };
    if (decisionIds.has(decision.id)) return { ok: false, reason: `Duplicate decision id "${decision.id}".` };
    decisionIds.add(decision.id);

    if (typeof decision.status !== 'string' || !(DECISION_STATUSES as readonly string[]).includes(decision.status)) {
      return { ok: false, reason: `Decision "${decision.id}" has an invalid status: ${String(decision.status)}.` };
    }
    if (typeof decision.provider !== 'string' || !(DECISION_PROVIDERS as readonly string[]).includes(decision.provider)) {
      return { ok: false, reason: `Decision "${decision.id}" has an invalid provider.` };
    }
    if (typeof decision.decisionType !== 'string' || !(DECISION_TYPES as readonly string[]).includes(decision.decisionType)) {
      return { ok: false, reason: `Decision "${decision.id}" has an invalid type.` };
    }
    // ADR-006: a reason is required, always.
    if (!isNonEmptyString(decision.reason)) {
      return { ok: false, reason: `Decision "${decision.id}" has no reason.` };
    }
    if (!momentIds.has(decision.momentId as string)) {
      return { ok: false, reason: `Decision "${decision.id}" references an unknown moment.` };
    }
    // Tenancy, enforced at the record and not only at the payload. Moments and
    // briefs were already checked; decisions and events were not, so a record
    // stamped with another organization's id could be filed under this one.
    if (decision.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Decision "${decision.id}" belongs to a different workspace.` };
    }
  }

  // ── One live item selection per Moment (H3.3) ──
  // Enforced here rather than only in the repository, so a batch that would
  // produce two live selections commits nothing — "the selected item" has to
  // stay unambiguous for every step downstream of it.
  const liveSelectionByMoment = new Set<string>();
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'ItemSelection' || decision.status !== 'Confirmed') continue;
    const momentId = decision.momentId as string;
    if (liveSelectionByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one live item selection.` };
    }
    liveSelectionByMoment.add(momentId);
  }

  const eventIds = new Set<string>();
  for (const [i, event] of (raw.events as unknown[]).entries()) {
    if (!isPlainObject(event)) return { ok: false, reason: `Event at index ${i} is not an object.` };
    if (!isNonEmptyString(event.id)) return { ok: false, reason: `Event at index ${i} has no id.` };
    if (eventIds.has(event.id)) return { ok: false, reason: `Duplicate event id "${event.id}".` };
    eventIds.add(event.id);

    if (typeof event.eventType !== 'string' || !(EVENT_TYPES as readonly string[]).includes(event.eventType)) {
      return { ok: false, reason: `Event "${event.id}" has an invalid type: ${String(event.eventType)}.` };
    }
    if (typeof event.actorType !== 'string' || !(ACTOR_TYPES as readonly string[]).includes(event.actorType)) {
      return { ok: false, reason: `Event "${event.id}" has an invalid actor type.` };
    }
    if (!isNonEmptyString(event.occurredAt) || !isNonEmptyString(event.recordedAt)) {
      return { ok: false, reason: `Event "${event.id}" is missing a timestamp.` };
    }
    if (!momentIds.has(event.momentId as string)) {
      return { ok: false, reason: `Event "${event.id}" references an unknown moment.` };
    }
    if (event.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Event "${event.id}" belongs to a different workspace.` };
    }
  }

  // ── Execution Briefs (H3.2) ──
  const briefIds = new Set<string>();
  const liveBriefByMoment = new Map<string, string>();

  for (const [i, brief] of (raw.executionBriefs as unknown[]).entries()) {
    if (!isPlainObject(brief)) return { ok: false, reason: `Brief at index ${i} is not an object.` };
    if (!isNonEmptyString(brief.id)) return { ok: false, reason: `Brief at index ${i} has no id.` };
    if (briefIds.has(brief.id)) return { ok: false, reason: `Duplicate brief id "${brief.id}".` };
    briefIds.add(brief.id);

    if (brief.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Brief "${brief.id}" belongs to a different workspace.` };
    }
    if (!momentIds.has(brief.momentId as string)) {
      return { ok: false, reason: `Brief "${brief.id}" references an unknown moment.` };
    }
    if (typeof brief.status !== 'string' || !(BRIEF_STATUSES as readonly string[]).includes(brief.status)) {
      return { ok: false, reason: `Brief "${brief.id}" has an invalid status: ${String(brief.status)}.` };
    }
    if (typeof brief.revision !== 'number' || !Number.isInteger(brief.revision) || brief.revision < 1) {
      return { ok: false, reason: `Brief "${brief.id}" has an invalid revision.` };
    }
    if (!isPlainObject(brief.policyResolutionSnapshot)) {
      return { ok: false, reason: `Brief "${brief.id}" has no policy resolution snapshot.` };
    }
    if (!excludedCategoriesValid(brief.policyResolutionSnapshot)) {
      return { ok: false, reason: `Brief "${brief.id}" has a malformed excluded-category snapshot.` };
    }

    // ADR-011 — the confirmation gate, enforced at the persistence layer and
    // not only in the UI. A stored brief whose address is incomplete would mean
    // the gate had been bypassed.
    const address = brief.deliveryAddressSnapshot;
    if (!isPlainObject(address)) {
      return { ok: false, reason: `Brief "${brief.id}" has no delivery address snapshot.` };
    }
    for (const field of ['line1', 'city', 'countryCode'] as const) {
      const value = address[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        return {
          ok: false,
          reason: `Brief "${brief.id}" was stored with an incomplete address — ${field} is missing.`,
        };
      }
    }

    if (
      typeof brief.addressSource !== 'string' ||
      !(ADDRESS_SOURCES as readonly string[]).includes(brief.addressSource)
    ) {
      return { ok: false, reason: `Brief "${brief.id}" has an invalid address source.` };
    }
    // An override without a reason is not a record of a judgement.
    if (brief.addressSource === 'OperatorOverride') {
      const override = brief.addressOverride;
      if (!isPlainObject(override) || !isNonEmptyString(override.reason)) {
        return { ok: false, reason: `Brief "${brief.id}" was overridden without a reason.` };
      }
      if (!isNonEmptyString(override.overriddenAt)) {
        return { ok: false, reason: `Brief "${brief.id}" has an override with no timestamp.` };
      }
    }

    // At most one live brief per Moment. Two would make "the brief" ambiguous
    // for every downstream step.
    if (brief.status === 'Confirmed') {
      const momentId = brief.momentId as string;
      if (liveBriefByMoment.has(momentId)) {
        return {
          ok: false,
          reason: `Moment "${momentId}" has more than one live brief.`,
        };
      }
      liveBriefByMoment.set(momentId, brief.id);
    }
  }

  // Supersession must point somewhere real, and only forward.
  for (const brief of raw.executionBriefs as Record<string, unknown>[]) {
    if (brief.status === 'Superseded') {
      if (!isNonEmptyString(brief.supersededByBriefId) || !briefIds.has(brief.supersededByBriefId)) {
        return { ok: false, reason: `Brief "${String(brief.id)}" is superseded by an unknown brief.` };
      }
    }
    if (brief.revisionOfBriefId !== undefined && !briefIds.has(brief.revisionOfBriefId as string)) {
      return { ok: false, reason: `Brief "${String(brief.id)}" revises an unknown brief.` };
    }
  }

  return { ok: true };
}

// ─── Source keys ─────────────────────────────────────────────────────────────

/**
 * Deterministic logical identity for a Campaign Moment.
 *
 * For Campaign v1 a person receives one Moment per program per occasion, so the
 * key needs no cycle component. When Recurring programs arrive — where the same
 * person legitimately receives a Moment every year — the generation cycle joins
 * the key. The `campaign` prefix marks which scheme produced it, so both can
 * coexist without ambiguity.
 */
export function campaignSourceKey(
  workspaceId: string,
  programId: string,
  personId: string,
  occasionType: string,
): string {
  return ['campaign', workspaceId, programId, personId, occasionType].join('::');
}
