/**
 * Policy Assignment resolution — H2.4.
 *
 * Answers one question: *given a Relationship Class and a country, which
 * Recognition Policy governs recognition right now?*
 *
 * Pure and framework-free by design. It touches no storage and no React, takes
 * everything it needs as arguments, and returns a value for every outcome
 * including failure. The Decision Engine (ADR-003) is expected to build on this
 * rather than reimplement it.
 */

import { COUNTRY_CODE_PATTERN, EXECUTABLE_POLICY_STATUS, assignmentScope } from './workspace';
import type {
  AssignmentScope,
  PolicyAssignment,
  RecognitionPolicy,
  RelationshipClass,
} from './workspace';

// ─── Result ──────────────────────────────────────────────────────────────────

export type UnresolvedReason =
  | 'class-not-found'
  | 'class-inactive'
  | 'no-active-assignments'
  | 'no-executable-policy';

export interface ResolvedAssignment {
  status: 'resolved';
  assignment: PolicyAssignment;
  policy: RecognitionPolicy;
  scope: AssignmentScope;
  /**
   * Assignments that outranked the winner but could not be used — typically a
   * country-scoped assignment pointing at an archived or deleted policy. Surfaced
   * rather than hidden, because a silent fallback to a broader scope is exactly
   * the kind of thing an operator needs to be told about.
   */
  skipped: SkippedAssignment[];
}

export interface SkippedAssignment {
  assignment: PolicyAssignment;
  reason: 'policy-missing' | 'policy-not-executable' | 'invalid-country-code';
  detail: string;
}

export interface UnresolvedAssignment {
  status: 'unresolved';
  reason: UnresolvedReason;
  detail: string;
  skipped: SkippedAssignment[];
}

export type AssignmentResolution = ResolvedAssignment | UnresolvedAssignment;

export interface ResolveInput {
  relationshipClassId: string;
  /** ISO 3166-1 alpha-2. Omit for a Global-only lookup. */
  countryCode?: string;
  classes: RelationshipClass[];
  assignments: PolicyAssignment[];
  policies: RecognitionPolicy[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeCountryCode(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const normalized = raw.trim().toUpperCase();
  if (normalized === '') return undefined;
  return COUNTRY_CODE_PATTERN.test(normalized) ? normalized : undefined;
}

/**
 * Ordering among candidates of the same scope:
 *   1. higher `priority`
 *   2. later `updatedAt`
 *   3. `id`, so the result is total rather than merely stable
 */
export function compareAssignments(a: PolicyAssignment, b: PolicyAssignment): number {
  if (a.priority !== b.priority) return b.priority - a.priority;

  const aTime = Date.parse(a.updatedAt);
  const bTime = Date.parse(b.updatedAt);
  const aValid = !Number.isNaN(aTime);
  const bValid = !Number.isNaN(bTime);
  if (aValid && bValid && aTime !== bTime) return bTime - aTime;
  if (aValid !== bValid) return aValid ? -1 : 1;

  return a.id.localeCompare(b.id);
}

/**
 * Currently executable: the policy exists and is Published.
 *
 * Deliberately not a type predicate — narrowing on the false branch would imply
 * the policy is absent, when the common case is that it is present but Archived,
 * and callers need to read its name and status to explain themselves.
 */
export function isExecutablePolicy(policy: RecognitionPolicy | undefined): boolean {
  return policy !== undefined && policy.status === EXECUTABLE_POLICY_STATUS;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolve the Recognition Policy that currently governs a Relationship Class.
 *
 * Precedence, in order:
 *   1. The class must exist and be active. An inactive class resolves nothing —
 *      its assignments are retained for audit but are not operational.
 *   2. Only active assignments for *this* class are considered. There is no
 *      fallback to another class's assignment, ever.
 *   3. Only assignments whose policy exists and is Published are candidates.
 *      Archived and dangling references are dropped here, before scope is
 *      considered, so an archived country override cannot shadow a working
 *      Global assignment — the fallback is reported via `skipped`.
 *   4. A country-scoped match beats a Global one.
 *   5. Within a scope, higher priority wins.
 *   6. Then later `updatedAt`; then `id`, for a total order.
 *
 * Ordinary absence returns `unresolved` with a reason. Nothing throws.
 */
export function resolvePolicyAssignment(input: ResolveInput): AssignmentResolution {
  const { relationshipClassId, classes, assignments, policies } = input;
  const skipped: SkippedAssignment[] = [];

  const relationshipClass = classes.find(c => c.id === relationshipClassId);
  if (!relationshipClass) {
    return {
      status: 'unresolved',
      reason: 'class-not-found',
      detail: `No Relationship Class with id "${relationshipClassId}".`,
      skipped,
    };
  }
  if (!relationshipClass.isActive) {
    return {
      status: 'unresolved',
      reason: 'class-inactive',
      detail: `Relationship Class "${relationshipClass.name || relationshipClass.id}" is inactive. Its assignments are preserved for audit but do not resolve operationally.`,
      skipped,
    };
  }

  const queryCountry = normalizeCountryCode(input.countryCode);
  const policyById = new Map(policies.map(p => [p.id, p]));

  const forThisClass = assignments.filter(
    a => a.isActive && a.relationshipClassId === relationshipClassId,
  );

  if (forThisClass.length === 0) {
    return {
      status: 'unresolved',
      reason: 'no-active-assignments',
      detail: `Relationship Class "${relationshipClass.name || relationshipClass.id}" has no active Policy Assignment.`,
      skipped,
    };
  }

  // Split by scope, discarding anything that cannot apply to this lookup.
  const countryCandidates: PolicyAssignment[] = [];
  const globalCandidates: PolicyAssignment[] = [];

  for (const assignment of forThisClass) {
    if (assignmentScope(assignment) === 'Global') {
      globalCandidates.push(assignment);
      continue;
    }
    const code = normalizeCountryCode(assignment.countryCode);
    if (code === undefined) {
      // Stored a non-blank but malformed code. Never treated as Global —
      // widening its reach would be the opposite of what was intended.
      skipped.push({
        assignment,
        reason: 'invalid-country-code',
        detail: `Assignment "${assignment.id}" has an invalid country code (${String(assignment.countryCode)}) and was ignored.`,
      });
      continue;
    }
    if (queryCountry !== undefined && code === queryCountry) {
      countryCandidates.push(assignment);
    }
    // A country assignment for a different country simply does not apply, and
    // is not worth reporting as skipped.
  }

  // Country scope first, then Global.
  for (const tier of [countryCandidates, globalCandidates]) {
    const executable = tier.filter(assignment => {
      const policy = policyById.get(assignment.recognitionPolicyId);
      if (policy === undefined) {
        skipped.push({
          assignment,
          reason: 'policy-missing',
          detail: `Assignment "${assignment.id}" references policy "${assignment.recognitionPolicyId}", which no longer exists.`,
        });
        return false;
      }
      if (!isExecutablePolicy(policy)) {
        skipped.push({
          assignment,
          reason: 'policy-not-executable',
          detail: `Assignment "${assignment.id}" references policy "${policy.name || policy.id}", which is ${policy.status} and not currently executable.`,
        });
        return false;
      }
      return true;
    });

    if (executable.length === 0) continue;

    const winner = [...executable].sort(compareAssignments)[0];
    return {
      status: 'resolved',
      assignment: winner,
      policy: policyById.get(winner.recognitionPolicyId)!,
      scope: assignmentScope(winner),
      skipped,
    };
  }

  return {
    status: 'unresolved',
    reason: 'no-executable-policy',
    detail:
      queryCountry === undefined
        ? `No active Global assignment for "${relationshipClass.name || relationshipClass.id}" points at a Published policy.`
        : `No active assignment for "${relationshipClass.name || relationshipClass.id}" in ${queryCountry}, or Global, points at a Published policy.`,
    skipped,
  };
}

// ─── Creation guards ─────────────────────────────────────────────────────────

export interface NewAssignmentInput {
  relationshipClassId: string;
  recognitionPolicyId: string;
  /** Raw operator input; blank means Global. */
  countryCode?: string;
  priority: number;
}

export type AssignmentValidation =
  | { ok: true; countryCode: string | undefined }
  | { ok: false; reason: string };

/**
 * Gate for creating a new active assignment.
 *
 * Stricter than resolution on purpose: resolution has to cope with history it
 * did not create, while creation is the point at which bad references can still
 * be prevented.
 */
export function validateNewAssignment(
  input: NewAssignmentInput,
  classes: RelationshipClass[],
  policies: RecognitionPolicy[],
): AssignmentValidation {
  const relationshipClass = classes.find(c => c.id === input.relationshipClassId);
  if (!relationshipClass) {
    return { ok: false, reason: 'That Relationship Class no longer exists.' };
  }

  const policy = policies.find(p => p.id === input.recognitionPolicyId);
  if (!policy) {
    return { ok: false, reason: 'Select a Recognition Policy.' };
  }
  if (!isExecutablePolicy(policy)) {
    return {
      ok: false,
      reason: `"${policy.name || 'That policy'}" is ${policy.status}. Only a Published policy can be assigned.`,
    };
  }

  if (!Number.isInteger(input.priority)) {
    return { ok: false, reason: 'Priority must be a whole number.' };
  }

  const raw = input.countryCode;
  if (raw !== undefined && raw.trim() !== '') {
    const normalized = raw.trim().toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(normalized)) {
      return {
        ok: false,
        reason: `"${raw.trim()}" is not a valid country code. Use two letters such as NG, KE, or ZA — or choose Global.`,
      };
    }
    return { ok: true, countryCode: normalized };
  }

  return { ok: true, countryCode: undefined };
}

// ─── Workspace-level summaries (used by the setup step) ──────────────────────

/**
 * True when at least one active assignment on an active class points at a
 * Published policy — the minimum bar for confirming the assignments step.
 */
export function hasAnyResolvableAssignment(
  classes: RelationshipClass[],
  assignments: PolicyAssignment[],
  policies: RecognitionPolicy[],
): boolean {
  const policyById = new Map(policies.map(p => [p.id, p]));
  return assignments.some(assignment => {
    if (!assignment.isActive) return false;
    const cls = classes.find(c => c.id === assignment.relationshipClassId);
    if (!cls || !cls.isActive) return false;
    return isExecutablePolicy(policyById.get(assignment.recognitionPolicyId));
  });
}

/** Active classes with no active assignment pointing at a Published policy. */
export function activeClassesWithoutAssignment(
  classes: RelationshipClass[],
  assignments: PolicyAssignment[],
  policies: RecognitionPolicy[],
): RelationshipClass[] {
  const policyById = new Map(policies.map(p => [p.id, p]));
  return classes.filter(cls => {
    if (!cls.isActive) return false;
    return !assignments.some(
      a =>
        a.isActive &&
        a.relationshipClassId === cls.id &&
        isExecutablePolicy(policyById.get(a.recognitionPolicyId)),
    );
  });
}
