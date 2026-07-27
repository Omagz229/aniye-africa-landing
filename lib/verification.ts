/**
 * Verification-gate safety — EX-C1.
 *
 * Before this module, `/verify` called `createWorkspace()` and `saveWorkspace()`
 * unconditionally. Re-opening an old verification link from an email, a
 * bookmark, or browser history replaced the stored workspace outright — every
 * relationship group, rule, assignment and person, with no confirmation and no
 * recoverable copy.
 *
 * The decision now lives here rather than in the component, because "does this
 * destroy the customer's data?" is not a question that should only be
 * answerable by rendering React. It is pure, storage is injected, and it is
 * covered by `npm run validate:verification`.
 *
 * **This module never replaces an existing workspace.** Replacement is not
 * implemented at all in E1 — an unrecoverable action nobody asked for is worse
 * than a missing feature. The existing workspace always wins.
 */

import { WORKSPACE_KEY, loadAndMigrateWorkspace } from './migrations';
import type { WorkspaceStorage } from './migrations';
import { SETUP_STAGES, createWorkspace } from './workspace';
import type { NewWorkspaceInput, SetupStage, WorkspaceState } from './workspace';

/** Where a workspace at a given stage should resume. */
export function setupStageHref(stage: SetupStage): string {
  const entry = SETUP_STAGES.find(s => s.key === stage && s.available);
  // `programs` and any future unbuilt stage fall back to the overview, which
  // states honestly that the next capability is not available yet. Never link
  // somewhere that would 404.
  return entry?.href ?? '/workspace';
}

export type VerificationOutcome =
  | {
      action: 'created';
      workspace: WorkspaceState;
      href: string;
    }
  | {
      action: 'continued';
      workspace: WorkspaceState;
      href: string;
      /** True when the existing workspace has progressed past first setup. */
      hasConfiguration: boolean;
    };

export interface WorkspaceFootprint {
  relationshipClasses: number;
  recognitionPolicies: number;
  policyAssignments: number;
  people: number;
}

/** What an operator would lose if a workspace were ever replaced. */
export function workspaceFootprint(workspace: WorkspaceState): WorkspaceFootprint {
  return {
    relationshipClasses: workspace.relationshipClasses.length,
    recognitionPolicies: workspace.recognitionPolicies.length,
    policyAssignments: workspace.policyAssignments.length,
    people: workspace.people.length,
  };
}

/**
 * True once the workspace holds work the operator did themselves, as opposed to
 * the defaults every new workspace is seeded with.
 */
export function hasMeaningfulConfiguration(workspace: WorkspaceState): boolean {
  return (
    workspace.setupStage !== 'profile' ||
    workspace.recognitionPolicies.length > 0 ||
    workspace.policyAssignments.length > 0 ||
    workspace.people.length > 0
  );
}

/**
 * Decide what `/verify` should do. Pure — reads and writes nothing.
 *
 * `existing === null` is the only path that produces a new workspace.
 */
export function resolveVerification(
  existing: WorkspaceState | null,
  input: NewWorkspaceInput,
): VerificationOutcome {
  if (existing) {
    return {
      action: 'continued',
      workspace: existing,
      href: setupStageHref(existing.setupStage),
      hasConfiguration: hasMeaningfulConfiguration(existing),
    };
  }

  const workspace = createWorkspace(input);
  return {
    action: 'created',
    workspace,
    href: setupStageHref(workspace.setupStage),
  };
}

/**
 * Storage-facing wrapper. Writes **only** when a workspace is created.
 *
 * Idempotent: running it repeatedly against the same storage creates one
 * workspace on the first call and leaves it untouched on every call after,
 * which is exactly what makes a stale verification link safe to reopen.
 */
export function runVerification(
  storage: WorkspaceStorage,
  input: NewWorkspaceInput,
): VerificationOutcome {
  const loaded = loadAndMigrateWorkspace<WorkspaceState>(storage);

  // An unreadable payload is deliberately *not* treated as "no workspace".
  // The migration runner has already quarantined it; overwriting it here would
  // undo that protection. Refusing to create is the safe answer — the operator
  // sees the continuation state and no data is destroyed.
  const existing = loaded.status === 'ok' ? loaded.workspace : null;
  if (loaded.status === 'invalid') {
    return {
      action: 'continued',
      workspace: recoveryPlaceholder(input),
      href: '/workspace',
      hasConfiguration: true,
    };
  }

  const outcome = resolveVerification(existing, input);
  if (outcome.action === 'created') {
    storage.setItem(WORKSPACE_KEY, JSON.stringify(outcome.workspace));
  }
  return outcome;
}

/**
 * Stand-in used only when stored data could not be read. It is never written to
 * storage — it exists so the UI has something to render while the real payload
 * stays quarantined and intact.
 */
function recoveryPlaceholder(input: NewWorkspaceInput): WorkspaceState {
  return { ...createWorkspace(input), companyName: input.companyName };
}
