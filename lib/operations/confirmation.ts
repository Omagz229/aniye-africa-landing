/**
 * Confirmation-time revalidation — H3.1-D1.
 *
 * The defect this closes: `PrepareMoments.handleConfirm` used to rebuild the
 * batch from the `GenerationContext` captured at page load, refreshing only the
 * timestamp. Configuration edited between preview and confirmation was
 * therefore invisible, and a Moment could be written as `ReadyForExecution`
 * against a person who had since been archived, a group that had been switched
 * off, or a policy that had been unpublished.
 *
 * The rule is now: **the preview shows, the confirmation re-reads.** Nothing is
 * written from state captured earlier.
 *
 * Deliberately React-free and dependency-injected, so every branch — including
 * the read failures — is exercisable in validation rather than only in a
 * browser. There is no new abstraction here beyond one service and one
 * fingerprint; the generation engine, the repository and the atomic commit are
 * unchanged and still do the work.
 */

import type {
  PolicyAssignment,
  Person,
  Program,
  RecognitionPolicy,
  RelationshipClass,
  WorkspaceState,
} from '../workspace';
import type { GenerationContext, PersonAssessment, PreparationPreview } from './generation';
import { buildMomentBatch, previewPreparation } from './generation';
import type { MomentBatch, OperationsRepository } from './store';

// ─── Injected readers ────────────────────────────────────────────────────────

export interface ConfirmationDeps {
  /** The canonical Workspace read path. Returns null when unreadable or absent. */
  readWorkspace: () => WorkspaceState | null;
  repository: OperationsRepository;
  now: () => string;
}

// ─── Failure taxonomy ────────────────────────────────────────────────────────

/**
 * Every way confirmation can refuse. Each carries operator-facing language and
 * a recovery — a refusal that does not say what to do next is an unfinished
 * screen (Doctrine §1.8).
 */
export type RevalidationFailureCode =
  | 'workspace-unreadable'
  | 'program-missing'
  | 'program-inactive'
  | 'operations-unreadable'
  | 'nothing-to-prepare';

export interface RevalidationFailure {
  status: 'failed';
  code: RevalidationFailureCode;
  message: string;
  recovery: string;
  href?: string;
}

/** Live state moved since the operator looked. Nothing was written. */
export interface RevalidationChanged {
  status: 'changed';
  message: string;
  recovery: string;
  preview: PreparationPreview;
  context: GenerationContext;
  fingerprint: string;
}

/** Live state matches the confirmed preview. Safe to commit this batch. */
export interface RevalidationReady {
  status: 'ready';
  batch: MomentBatch;
  preview: PreparationPreview;
  context: GenerationContext;
  fingerprint: string;
}

export type RevalidationResult = RevalidationFailure | RevalidationChanged | RevalidationReady;

// ─── Live context ────────────────────────────────────────────────────────────

export type LiveContextResult =
  | { ok: true; context: GenerationContext; program: Program; workspace: WorkspaceState }
  | { ok: false; failure: RevalidationFailure };

/**
 * Build a `GenerationContext` from **current** storage. Nothing is reused from
 * an earlier render.
 *
 * Reads, in order: the Workspace; the Program by id; its status; its frozen
 * population; current People, Relationship Groups, assignments and Recognition
 * Policies; and the source keys already in the operations store.
 */
export function loadLiveContext(programId: string, deps: ConfirmationDeps): LiveContextResult {
  const workspace = deps.readWorkspace();
  if (!workspace) {
    return {
      ok: false,
      failure: {
        status: 'failed',
        code: 'workspace-unreadable',
        message: 'The organization’s configuration could not be read.',
        recovery: 'Reload the page. If this persists, the stored workspace may be damaged and nothing should be prepared until it is restored.',
      },
    };
  }

  const program = workspace.programs.find(p => p.id === programId);
  if (!program) {
    return {
      ok: false,
      failure: {
        status: 'failed',
        code: 'program-missing',
        message: 'This campaign no longer exists in the workspace.',
        recovery: 'It may have been removed since this page was opened. Return to Command and pick a current campaign.',
        href: '/operations',
      },
    };
  }

  // A campaign that is no longer Active must not generate work, whatever the
  // page was showing when it loaded.
  if (program.status !== 'Active') {
    return {
      ok: false,
      failure: {
        status: 'failed',
        code: 'program-inactive',
        message: `"${program.name}" is no longer active — it is now ${program.status}.`,
        recovery: 'Only an active campaign can be prepared. Ask the administrator to reactivate it, or choose another campaign.',
        href: '/operations',
      },
    };
  }

  const listed = deps.repository.listMoments(workspace.organizationId);
  if (!listed.ok) {
    return {
      ok: false,
      failure: {
        status: 'failed',
        code: 'operations-unreadable',
        message: `The operational records could not be read. ${listed.reason}`,
        recovery: 'Nothing has been changed. Reload the page; if the data was set aside, it must be recovered before preparing anything.',
      },
    };
  }

  const context: GenerationContext = {
    workspaceId: workspace.organizationId,
    program,
    // Current collections, read now — never the ones captured at page load.
    people: workspace.people satisfies Person[],
    classes: workspace.relationshipClasses satisfies RelationshipClass[],
    assignments: workspace.policyAssignments satisfies PolicyAssignment[],
    policies: workspace.recognitionPolicies satisfies RecognitionPolicy[],
    existingSourceKeys: new Map(listed.value.map(m => [m.sourceKey, m.id])),
    now: deps.now(),
  };

  return { ok: true, context, program, workspace };
}

// ─── Material-change fingerprint ─────────────────────────────────────────────

/**
 * A deterministic summary of everything about a preview that an operator would
 * want to re-read before committing.
 *
 * **Excludes anything nondeterministic**: `now`, `resolvedAt`, and generated
 * record ids. Those change on every recomputation and say nothing about whether
 * the decision the operator made is still the right one. Including them would
 * make every confirmation report a spurious change and train operators to click
 * through the warning — which is worse than no warning at all.
 *
 * **Includes** who is pending, each person's outcome and issue codes, the
 * resolved policy identity, version, scope and exact Money, and the four
 * delivery promises captured by OperationsState v6. A budget moving by one
 * minor unit or any delivery promise changing is material.
 */
export function fingerprintPreview(preview: PreparationPreview): string {
  const line = (a: PersonAssessment): string => {
    const r = a.resolution;
    const resolution = r
      ? JSON.stringify([
          r.policyAssignmentId,
          r.policyId,
          `v${r.policyVersion}`,
          r.resolvedCountryScope,
          r.occasionType,
          `${r.approvedRecognitionBudget.amountMinor}${r.approvedRecognitionBudget.currency}`,
          r.deliveryRequirement,
          r.preferredDeliveryWindow,
          r.signatureRequired,
          r.proofRequired,
        ])
      : 'none';
    // Issue codes only — messages carry names and wording that may be reworded
    // without the operational meaning changing.
    const issues = a.issues.map(i => i.code).slice().sort().join('+') || 'none';
    return [a.personId, a.status, issues, resolution].join('|');
  };

  const pending = preview.pending.map(line).sort();
  const alreadyPrepared = preview.alreadyPrepared.map(a => a.personId).slice().sort();
  // Currency totals are derived from the above, but included explicitly so a
  // change in aggregate money can never slip through unnoticed.
  const totals = preview.byCurrency
    .map(c => `${c.currency}:${c.peopleCount}:${c.totalMinor}`)
    .slice()
    .sort();

  return JSON.stringify({ pending, alreadyPrepared, totals });
}

// ─── The confirmation gate ───────────────────────────────────────────────────

export interface IdFactoryWithMoment {
  moment: () => string;
  decision: () => string;
  event: () => string;
}

/**
 * Re-read live state and decide whether the operator's confirmation may proceed.
 *
 * **Writes nothing under any outcome.** The caller commits only on `ready`, and
 * only the batch returned here — which was built from live state, not from the
 * preview the page was holding.
 */
export function revalidateForConfirmation(
  programId: string,
  confirmedFingerprint: string,
  deps: ConfirmationDeps,
  ids: IdFactoryWithMoment,
  actorId?: string,
): RevalidationResult {
  const live = loadLiveContext(programId, deps);
  if (!live.ok) return live.failure;

  const preview = previewPreparation(live.context);
  const fingerprint = fingerprintPreview(preview);

  if (fingerprint !== confirmedFingerprint) {
    return {
      status: 'changed',
      message: 'This campaign’s information changed while you were reviewing it.',
      recovery: 'Nothing has been prepared. The figures below are current — please look again and confirm.',
      preview,
      context: live.context,
      fingerprint,
    };
  }

  if (preview.pending.length === 0) {
    return {
      status: 'failed',
      code: 'nothing-to-prepare',
      message: 'Everyone in this campaign has already been prepared.',
      recovery: 'Open the moments queue to see the work that already exists.',
      href: '/operations/moments',
    };
  }

  return {
    status: 'ready',
    batch: buildMomentBatch(live.context, ids, actorId),
    preview,
    context: live.context,
    fingerprint,
  };
}
