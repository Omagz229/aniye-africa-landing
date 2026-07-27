"use client";

import type { SetupStage, WorkspaceState } from '@/lib/workspace';
import { isStageComplete } from '@/lib/workspace';

/**
 * Honest setup progress (Doctrine §1.6 — meaningful progress, not gamification).
 *
 * Milestones are named after what the organization has actually achieved, not
 * after internal stage keys. No percentage, no streak, no celebration for
 * ordinary work — just a clear statement of where things stand and what comes
 * next.
 */
const MILESTONES: Array<{ stage: SetupStage; done: string; next: string }> = [
  { stage: 'profile',     done: 'Organization profile complete', next: 'Confirm your organization profile' },
  { stage: 'classes',     done: 'Recognition structure complete', next: 'Define who matters to you' },
  { stage: 'policies',    done: 'Recognition policies written',   next: 'Write your recognition policies' },
  { stage: 'assignments', done: 'Policies assigned',              next: 'Assign policies to your groups' },
  { stage: 'people',      done: 'People added',                   next: 'Add the people you recognise' },
];

export default function SetupProgress({ workspace }: { workspace: WorkspaceState }) {
  const completed = MILESTONES.filter(m => isStageComplete(m.stage, workspace.setupStage));
  const current = MILESTONES.find(m => m.stage === workspace.setupStage);
  const allDone = completed.length === MILESTONES.length;

  return (
    <div className="bg-cream rounded-2xl border border-stone/20 p-5">
      <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">Your setup</p>

      <ul className="space-y-1.5 mb-3">
        {MILESTONES.map(milestone => {
          const done = isStageComplete(milestone.stage, workspace.setupStage);
          const active = milestone.stage === workspace.setupStage;
          if (!done && !active) return null;
          return (
            <li key={milestone.stage} className="flex items-start gap-2.5">
              <span aria-hidden className={`text-sm leading-5 flex-shrink-0 ${done ? 'text-gold' : 'text-stone/30'}`}>
                {done ? '✓' : '○'}
              </span>
              <span className={`font-body text-sm ${done ? 'text-ink' : 'text-stone'}`}>
                {done ? milestone.done : milestone.next}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="font-body text-sm text-stone border-t border-stone/15 pt-3">
        {allDone ? (
          <>
            <span className="text-ink font-medium">Next:</span> create your first program — turning
            all of this into recognition that actually happens.{' '}
            <span className="text-stone/70">That capability is coming soon.</span>
          </>
        ) : current ? (
          <>
            <span className="text-ink font-medium">Now:</span> {current.next.toLowerCase()}.
          </>
        ) : (
          <>
            <span className="text-ink font-medium">Next:</span> create your first program.
          </>
        )}
      </p>
    </div>
  );
}
