"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace, SETUP_STAGES, isStageComplete, isStageActive } from '@/lib/workspace';

export default function SetupChecklist() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);

  useEffect(() => {
    setWorkspace(getWorkspace());
  }, []);

  if (!workspace) return null;

  const firstName = workspace.contactName.split(' ')[0] || 'there';
  const allComplete = workspace.setupStage === 'active';

  return (
    <div className="space-y-8">

      {/* Welcome */}
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">Getting Started</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
          Welcome, {firstName}.
        </h2>
        <p className="font-body text-stone">
          Let&apos;s set up{' '}
          <span className="font-semibold text-ink">{workspace.companyName || 'your workspace'}</span>.
          Here&apos;s what we&apos;ll build together.
        </p>
      </div>

      {/* Progress checklist */}
      <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
        {SETUP_STAGES.map((stage, i) => {
          const complete = isStageComplete(stage.key, workspace.setupStage);
          const active = isStageActive(stage.key, workspace.setupStage);
          const isLast = i === SETUP_STAGES.length - 1;

          return (
            <div
              key={stage.key}
              className={`flex items-start gap-4 p-5 ${!isLast ? 'border-b border-stone/10' : ''}`}
            >
              {/* Status indicator */}
              <div
                className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  complete
                    ? 'bg-gold border-gold'
                    : active
                    ? 'border-gold'
                    : 'border-stone/25'
                }`}
              >
                {complete && (
                  <span className="text-ink text-xs font-bold leading-none">&#10003;</span>
                )}
                {active && (
                  <div className="w-2 h-2 rounded-full bg-gold" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`font-body text-sm font-semibold ${
                      complete || active ? 'text-ink' : 'text-stone'
                    }`}
                  >
                    {stage.label}
                  </p>
                  {!stage.available && !complete && (
                    <span className="font-body text-xs text-stone/50 bg-stone/8 rounded-full px-2 py-0.5 flex-shrink-0">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="font-body text-xs text-stone mt-0.5 leading-snug">
                  {stage.description}
                </p>
              </div>

              {/* Action link */}
              {stage.available && (complete || active) && (
                <Link
                  href={stage.href}
                  className="flex-shrink-0 font-body text-xs font-semibold text-gold hover:underline mt-1 transition-colors"
                >
                  {complete ? 'Edit' : 'Start →'}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Contextual next action */}
      {!allComplete && (
        <div className="bg-ink rounded-2xl p-6 sm:p-8">
          <p className="font-body text-xs text-gold uppercase tracking-widest mb-2">
            {workspace.setupStage === 'profile' ? 'First Step' : 'Next Step'}
          </p>
          {workspace.setupStage === 'profile' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Review your Organization Profile
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                We&apos;ve pre-filled it from your Relationship Assessment. Confirm the details,
                then set your base currency and timezone.
              </p>
              <Link
                href="/workspace/profile"
                className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md"
              >
                Review Organization Profile &#8594;
              </Link>
            </>
          )}
          {workspace.setupStage === 'classes' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Define your Relationship Classes
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                Relationship Classes are available in the next milestone. Your Organization Profile is confirmed.
              </p>
            </>
          )}
        </div>
      )}

    </div>
  );
}
