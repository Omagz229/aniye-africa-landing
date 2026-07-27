"use client";

import Link from 'next/link';
import type { WorkspaceState } from '@/lib/workspace';
import { SETUP_STAGES, isStageComplete } from '@/lib/workspace';

/**
 * Compact setup progress, shown on every setup route (EX-H6).
 *
 * Derived entirely from `SETUP_STAGES` and `setupStage` — there is no second
 * source of progress to keep in step. Completed steps, the current step, and
 * the honestly-unavailable Programs step all come from the same list the
 * sidebar and checklist use.
 *
 * Deliberately calm: no percentage, no celebration, no ring to fill. Progress
 * that means something does not need decoration.
 */
export default function SetupProgress({
  workspace,
  /** Hide the continuation link on the page the operator is already on. */
  compact = false,
}: {
  workspace: WorkspaceState;
  compact?: boolean;
}) {
  const stages = SETUP_STAGES;
  const completedCount = stages.filter(s => isStageComplete(s.key, workspace.setupStage)).length;
  const current = stages.find(s => s.key === workspace.setupStage);
  const allStepsDone = completedCount === stages.length;

  return (
    <div className="bg-cream rounded-2xl border border-stone/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <p className="font-body text-xs text-stone uppercase tracking-widest">Your setup</p>
        <p className="font-body text-xs text-stone/70">
          {completedCount} of {stages.length} done
        </p>
      </div>

      <ol className="space-y-1.5 mb-3">
        {stages.map(stage => {
          const done = isStageComplete(stage.key, workspace.setupStage);
          const active = stage.key === workspace.setupStage;
          const unavailable = !stage.available;

          return (
            <li key={stage.key} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`text-sm leading-5 flex-shrink-0 w-3.5 text-center ${
                  done ? 'text-gold' : active ? 'text-ink' : 'text-stone/30'
                }`}
              >
                {done ? '✓' : active ? '●' : '○'}
              </span>
              <span
                className={`font-body text-sm flex-1 min-w-0 ${
                  done ? 'text-ink' : active ? 'text-ink font-medium' : 'text-stone/60'
                }`}
              >
                {stage.label}
              </span>
              {unavailable && !done && (
                <span className="font-body text-xs text-stone/50 flex-shrink-0">Not yet</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="border-t border-stone/15 pt-3">
        {allStepsDone || workspace.setupStage === 'programs' || workspace.setupStage === 'active' ? (
          <p className="font-body text-sm text-stone">
            <span className="text-ink font-medium">Everything is configured.</span> Creating your
            first program is the next capability, and it isn&apos;t available yet.
          </p>
        ) : current ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
            <p className="font-body text-sm text-stone min-w-0">
              <span className="text-ink font-medium">Now:</span> {current.description.toLowerCase()}
            </p>
            {!compact && current.available && (
              <Link
                href={current.href}
                className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors flex-shrink-0"
              >
                Go there &#8594;
              </Link>
            )}
          </div>
        ) : null}
      </div>

      <p className="font-body text-xs text-stone/50 mt-2.5">
        Your work is saved as you go.
      </p>
    </div>
  );
}
