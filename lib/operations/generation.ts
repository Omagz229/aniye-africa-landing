/**
 * Campaign Moment generation — H3.1.
 *
 * Turns an Active Campaign's frozen population into Moments, with a Decision
 * explaining every one and an Event recording that it happened.
 *
 * ─── Why frozen people are still re-evaluated ────────────────────────────────
 * A Campaign froze *who is covered* at activation. It did not freeze *whether
 * they can be executed*. Between activation and preparation someone may have
 * been paused, a group turned off, a policy unpublished. Those people are not
 * silently skipped — that would lose them. A Moment is created for every frozen
 * person, and one that cannot proceed is marked `NeedsReview` with a named
 * issue and a link to the Workspace page that fixes it.
 *
 * Pure and framework-free. It computes a batch; committing it is the
 * repository's job, and nothing here writes.
 */

import { resolvePolicyAssignment } from '../assignments';
import { formatMoney } from '../money';
import type {
  PolicyAssignment,
  Person,
  Program,
  RecognitionPolicy,
  RelationshipClass,
} from '../workspace';
import type { MomentBatch } from './store';
import type {
  Decision,
  Moment,
  MomentIssue,
  OperationalEvent,
  PolicyResolutionSnapshot,
  RecipientSnapshot,
  RelationshipGroupSnapshot,
} from './types';
import { campaignSourceKey } from './types';

// ─── Per-person assessment ───────────────────────────────────────────────────

export interface PersonAssessment {
  personId: string;
  person?: Person;
  displayName: string;
  status: 'ReadyForExecution' | 'NeedsReview';
  issues: MomentIssue[];
  resolution?: PolicyResolutionSnapshot;
  /** Set when a Moment for this identity already exists. */
  alreadyPreparedMomentId?: string;
  sourceKey: string;
}

export interface GenerationContext {
  /**
   * The owning workspace. Carried explicitly because `Program` deliberately has
   * no `workspaceId` — the client-side workspace is a single document, and
   * ADR-010 keeps operational records outside it.
   */
  workspaceId: string;
  program: Program;
  people: Person[];
  classes: RelationshipClass[];
  assignments: PolicyAssignment[];
  policies: RecognitionPolicy[];
  /** Source keys already present in the operations store. */
  existingSourceKeys: Map<string, string>;
  now: string;
}

/**
 * Assess one frozen person against current configuration.
 *
 * Every failure produces a named issue rather than an omission — the operator
 * must be able to see who cannot proceed and why.
 */
export function assessPerson(personId: string, context: GenerationContext): PersonAssessment {
  const { program, people, classes, assignments, policies } = context;
  const sourceKey = campaignSourceKey(context.workspaceId, program.id, personId, program.occasionType);
  const issues: MomentIssue[] = [];

  const person = people.find(p => p.id === personId);
  const alreadyPreparedMomentId = context.existingSourceKeys.get(sourceKey);

  if (!person) {
    return {
      personId, displayName: personId, status: 'NeedsReview', sourceKey, alreadyPreparedMomentId,
      issues: [{
        code: 'person-missing',
        message: 'This person is no longer in the directory.',
        href: '/workspace/people',
      }],
    };
  }

  const displayName = `${person.firstName} ${person.lastName}`.trim();

  if (person.status === 'Inactive') {
    issues.push({
      code: 'person-inactive',
      message: `${displayName} is paused, so they are excluded from recognition.`,
      href: '/workspace/people',
    });
  }
  if (person.status === 'Archived') {
    issues.push({
      code: 'person-archived',
      message: `${displayName} has been archived since this campaign was activated.`,
      href: '/workspace/people',
    });
  }

  const cls = classes.find(c => c.id === program.relationshipClassId);
  if (!cls) {
    issues.push({
      code: 'group-missing',
      message: 'The relationship group for this campaign no longer exists.',
      href: '/workspace/classes',
    });
  } else if (!cls.isActive) {
    issues.push({
      code: 'group-inactive',
      message: `"${cls.name}" has been turned off since this campaign was activated.`,
      href: '/workspace/classes',
    });
  }

  // Country is required whenever any country-scoped assignment exists for this
  // group — without it, resolution cannot tell which rule applies.
  const hasCountryScoped = assignments.some(
    a => a.isActive && a.relationshipClassId === program.relationshipClassId && a.countryCode,
  );
  if (hasCountryScoped && !person.country) {
    issues.push({
      code: 'country-missing',
      message: `${displayName} has no country recorded, and this group has country-specific rules.`,
      href: '/workspace/people',
    });
  }

  // ─ Policy resolution ─
  let resolution: PolicyResolutionSnapshot | undefined;

  const resolved = resolvePolicyAssignment({
    relationshipClassId: program.relationshipClassId,
    countryCode: person.country,
    classes,
    assignments,
    policies,
  });

  if (resolved.status === 'unresolved') {
    issues.push({
      code: 'no-executable-assignment',
      message:
        resolved.reason === 'no-active-assignments'
          ? 'No recognition rule is connected to this group.'
          : person.country
            ? `No published rule applies to ${displayName} in ${person.country}.`
            : `No published rule applies to ${displayName}.`,
      href: '/workspace/assignments',
    });
  } else {
    const rule = resolved.policy.recognitionRules.find(
      r => r.momentType === program.occasionType && r.isEnabled,
    );
    if (!rule) {
      issues.push({
        code: 'no-occasion-rule',
        message: `"${resolved.policy.name}" does not cover ${program.occasionType}.`,
        href: '/workspace/policies',
      });
    } else {
      resolution = {
        policyAssignmentId: resolved.assignment.id,
        policyId: resolved.policy.id,
        policyName: resolved.policy.name,
        policyVersion: resolved.policy.version,
        resolvedCountryScope: resolved.assignment.countryCode ?? 'Global',
        occasionType: program.occasionType,
        approvedRecognitionBudget: rule.budgetPerPerson,
        /**
         * H3.3 — captured here, at generation, for the same reason the budget
         * is: the exclusions that governed this Moment must survive the policy
         * being edited afterwards.
         *
         * A policy is editable **in place at the same version**, so there is no
         * way to recover this later. Copied rather than referenced, and copied
         * defensively so a subsequent edit to the live policy's array cannot
         * reach through into a written snapshot.
         */
        excludedCategories: [...(resolved.policy.excludedCategories ?? [])],
        resolvedAt: context.now,
      };
    }
  }

  return {
    personId,
    person,
    displayName,
    status: issues.length === 0 && resolution ? 'ReadyForExecution' : 'NeedsReview',
    issues,
    resolution,
    alreadyPreparedMomentId,
    sourceKey,
  };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface CurrencyTotal {
  currency: string;
  peopleCount: number;
  totalMinor: number;
}

export interface PreparationPreview {
  assessments: PersonAssessment[];
  /** Assessed and not already prepared. */
  pending: PersonAssessment[];
  ready: PersonAssessment[];
  needsReview: PersonAssessment[];
  alreadyPrepared: PersonAssessment[];
  countries: string[];
  /** Allocation grouped by currency. Never summed across currencies. */
  byCurrency: CurrencyTotal[];
}

/**
 * What preparation would produce, without writing anything.
 *
 * Browsing this creates no operational records — per ADR-006 the write happens
 * only on confirmation.
 */
export function previewPreparation(context: GenerationContext): PreparationPreview {
  const personIds = context.program.frozenPopulation?.personIds ?? [];
  const assessments = personIds.map(id => assessPerson(id, context));

  const alreadyPrepared = assessments.filter(a => a.alreadyPreparedMomentId !== undefined);
  const pending = assessments.filter(a => a.alreadyPreparedMomentId === undefined);

  const byCurrency: CurrencyTotal[] = [];
  for (const assessment of pending) {
    if (!assessment.resolution) continue;
    const budget = assessment.resolution.approvedRecognitionBudget;
    const existing = byCurrency.find(c => c.currency === budget.currency);
    if (existing) {
      existing.totalMinor += budget.amountMinor;
      existing.peopleCount++;
    } else {
      byCurrency.push({ currency: budget.currency, peopleCount: 1, totalMinor: budget.amountMinor });
    }
  }
  byCurrency.sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    assessments,
    pending,
    ready: pending.filter(a => a.status === 'ReadyForExecution'),
    needsReview: pending.filter(a => a.status === 'NeedsReview'),
    alreadyPrepared,
    countries: [...new Set(
      assessments.map(a => a.person?.country).filter((c): c is string => Boolean(c)),
    )].sort(),
    byCurrency,
  };
}

// ─── Batch construction ──────────────────────────────────────────────────────

export interface IdFactory {
  moment: () => string;
  decision: () => string;
  event: () => string;
}

function recipientSnapshotOf(person: Person): RecipientSnapshot {
  // Deliberately a subset — not the whole Person record.
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    country: person.country,
    role: person.role,
  };
}

function groupSnapshotOf(cls: RelationshipClass | undefined, fallbackId: string): RelationshipGroupSnapshot {
  return cls
    ? { relationshipClassId: cls.id, name: cls.name, type: cls.type, level: cls.level }
    : { relationshipClassId: fallbackId, name: 'Group no longer exists', type: 'Other', level: 0 };
}

/**
 * Build the complete batch a confirmation would write.
 *
 * Nothing is persisted here. Every Moment gets exactly one
 * `MomentQualification` Decision explaining its status, a successful resolution
 * additionally gets a `PolicyResolution` Decision, and each Moment gets a
 * `MomentCreated` Event plus a readiness Event matching its status.
 */
export function buildMomentBatch(
  context: GenerationContext,
  ids: IdFactory,
  actorId?: string,
): MomentBatch {
  const { program, classes, now, workspaceId } = context;
  const preview = previewPreparation(context);
  const cls = classes.find(c => c.id === program.relationshipClassId);

  const moments: Moment[] = [];
  const decisions: Decision[] = [];
  const events: OperationalEvent[] = [];

  for (const assessment of preview.pending) {
    const momentId = ids.moment();

    const moment: Moment = {
      id: momentId,
      workspaceId,
      programId: program.id,
      personId: assessment.personId,
      relationshipClassId: program.relationshipClassId,
      occasionType: program.occasionType,
      targetDate: program.campaignStartDate,
      status: assessment.status,
      sourceKey: assessment.sourceKey,
      recipientSnapshot: assessment.person
        ? recipientSnapshotOf(assessment.person)
        : { firstName: 'Unknown', lastName: 'person' },
      relationshipGroupSnapshot: groupSnapshotOf(cls, program.relationshipClassId),
      policyResolutionSnapshot: assessment.resolution,
      issues: assessment.issues,
      createdAt: now,
      updatedAt: now,
    };
    moments.push(moment);

    // ── MomentQualification — every Moment, always ──
    decisions.push({
      id: ids.decision(),
      workspaceId,
      momentId,
      decisionType: 'MomentQualification',
      status: 'Confirmed',
      provider: 'RuleEngine',
      inputs: {
        personId: assessment.personId,
        programId: program.id,
        occasionType: program.occasionType,
        relationshipClassId: program.relationshipClassId,
        personStatus: assessment.person?.status ?? 'missing',
        country: assessment.person?.country ?? null,
        issueCodes: assessment.issues.map(i => i.code),
      },
      finalDecision: assessment.status,
      reason:
        assessment.status === 'ReadyForExecution'
          ? `${assessment.displayName} is active in an active group, and a published rule covers ${program.occasionType}.`
          : assessment.issues.map(i => i.message).join(' '),
      createdAt: now,
      confirmedAt: now,
    });

    // ── PolicyResolution — only when resolution succeeded ──
    if (assessment.resolution) {
      const candidates = context.assignments.filter(
        a => a.isActive && a.relationshipClassId === program.relationshipClassId,
      );
      decisions.push({
        id: ids.decision(),
        workspaceId,
        momentId,
        decisionType: 'PolicyResolution',
        status: 'Confirmed',
        provider: 'RuleEngine',
        inputs: {
          relationshipClassId: program.relationshipClassId,
          country: assessment.person?.country ?? null,
          candidateAssignmentIds: candidates.map(a => a.id),
          candidateScopes: candidates.map(a => a.countryCode ?? 'Global'),
          occasionType: program.occasionType,
        },
        finalDecision: `${assessment.resolution.policyName} (v${assessment.resolution.policyVersion}) — ${formatMoney(assessment.resolution.approvedRecognitionBudget)}`,
        reason:
          assessment.resolution.resolvedCountryScope === 'Global'
            ? `No country-specific rule applied, so the global assignment governs. "${assessment.resolution.policyName}" allows ${formatMoney(assessment.resolution.approvedRecognitionBudget)} for ${program.occasionType}.`
            : `A ${assessment.resolution.resolvedCountryScope}-specific assignment outranks the global one for this person. "${assessment.resolution.policyName}" allows ${formatMoney(assessment.resolution.approvedRecognitionBudget)} for ${program.occasionType}.`,
        createdAt: now,
        confirmedAt: now,
      });
    }

    // ── Events ──
    events.push({
      id: ids.event(),
      workspaceId, momentId,
      eventType: 'MomentCreated',
      actorType: 'Operator',
      actorId,
      source: 'Platform',
      payload: { programId: program.id, personId: assessment.personId, occasionType: program.occasionType },
      occurredAt: now,
      recordedAt: now,
    });

    events.push({
      id: ids.event(),
      workspaceId, momentId,
      eventType: assessment.status === 'ReadyForExecution' ? 'MomentMarkedReady' : 'MomentNeedsReview',
      actorType: 'System',
      source: 'Platform',
      payload:
        assessment.status === 'ReadyForExecution'
          ? { budget: assessment.resolution?.approvedRecognitionBudget, policyId: assessment.resolution?.policyId }
          : { issueCodes: assessment.issues.map(i => i.code) },
      occurredAt: now,
      recordedAt: now,
    });
  }

  return { moments, decisions, events };
}

// ─── Cancellation ────────────────────────────────────────────────────────────

export interface CancellationRecords {
  decision: Decision;
  event: OperationalEvent;
}

/**
 * Cancelling a Moment is an operator judgement, so it produces a Decision with
 * a required reason — not merely a status change.
 */
export function buildCancellation(
  moment: Moment,
  reason: string,
  now: string,
  ids: IdFactory,
  actorId?: string,
): { ok: true; value: CancellationRecords } | { ok: false; reason: string } {
  if (reason.trim().length === 0) {
    return { ok: false, reason: 'Give a reason for cancelling — it becomes part of the record.' };
  }
  if (moment.status === 'Cancelled') {
    return { ok: false, reason: 'That moment is already cancelled.' };
  }

  return {
    ok: true,
    value: {
      decision: {
        id: ids.decision(),
        workspaceId: moment.workspaceId,
        momentId: moment.id,
        decisionType: 'MomentCancellation',
        status: 'Confirmed',
        provider: 'HumanOperator',
        actorId,
        inputs: {
          previousStatus: moment.status,
          personId: moment.personId,
          programId: moment.programId,
        },
        finalDecision: 'Cancelled',
        reason: reason.trim(),
        createdAt: now,
        confirmedAt: now,
      },
      event: {
        id: ids.event(),
        workspaceId: moment.workspaceId,
        momentId: moment.id,
        eventType: 'MomentCancelled',
        actorType: 'Operator',
        actorId,
        source: 'Platform',
        payload: { previousStatus: moment.status, reason: reason.trim() },
        occurredAt: now,
        recordedAt: now,
      },
    },
  };
}
