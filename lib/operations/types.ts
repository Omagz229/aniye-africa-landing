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
import type { RelationshipType } from '../workspace';

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

/** Only the types H3.1 actually produces. More arrive with the steps that need them. */
export const DECISION_TYPES = ['MomentQualification', 'PolicyResolution', 'MomentCancellation'] as const;
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

// ─── OperationsState ─────────────────────────────────────────────────────────

/** Independent of the workspace schema version — see ADR-010. */
export const CURRENT_OPERATIONS_SCHEMA_VERSION = 1;

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
    createdAt: now,
    updatedAt: now,
  };
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
  for (const collection of ['moments', 'decisions', 'events'] as const) {
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
