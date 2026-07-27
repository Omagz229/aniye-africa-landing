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
                Check your organization details
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                We&apos;ve filled these in from your assessment. Confirm them, then set your
                currency and timezone.
              </p>
              <Link
                href="/workspace/profile"
                className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md"
              >
                Check your details &#8594;
              </Link>
            </>
          )}
          {workspace.setupStage === 'classes' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Set up your relationship groups
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                Choose the groups of people your organization recognizes differently. Each group
                gets its own budgets, approvals and gift preferences.
              </p>
              <Link
                href="/workspace/classes"
                className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md"
              >
                Set up your groups &#8594;
              </Link>
            </>
          )}
          {workspace.setupStage === 'policies' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Write your recognition rules
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                Rules are reusable — set the budget, who approves it and how it&apos;s delivered,
                then decide which groups each one covers.
              </p>
              <Link
                href="/workspace/policies"
                className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md"
              >
                Write your rules &#8594;
              </Link>
            </>
          )}
          {workspace.setupStage === 'assignments' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Decide who each rule applies to
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                Connect each group to a published rule — everywhere, or per country. This is what
                lets Aniyé know which rule applies to whom.
              </p>
              <Link
                href="/workspace/assignments"
                className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md"
              >
                Connect groups to rules &#8594;
              </Link>
            </>
          )}
          {workspace.setupStage === 'people' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Add the people you recognize
              </h3>
              <p className="font-body text-sm text-cream/70 mb-5">
                Import a list or add people one at a time. Putting each person in a relationship
                group is what connects them to the rules you&apos;ve already written.
              </p>
              <Link
                href="/workspace/people"
                className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md"
              >
                Add your people &#8594;
              </Link>
            </>
          )}
          {workspace.setupStage === 'programs' && (
            <>
              <h3 className="font-display font-semibold text-xl text-cream mb-2">
                Your workspace is configured
              </h3>
              <p className="font-body text-sm text-cream/70">
                Groups, rules, assignments and people are all in place. Turning that into
                recognition that actually happens is the next capability, and it isn&apos;t
                available yet.
              </p>
            </>
          )}
        </div>
      )}

    </div>
  );
}
