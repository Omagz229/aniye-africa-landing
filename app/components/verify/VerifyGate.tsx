"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AssessmentData } from '@/lib/assessment';
import { EMPTY_ASSESSMENT } from '@/lib/assessment';
import type { NewWorkspaceInput, WorkspaceState } from '@/lib/workspace';
import { getWorkspace, saveWorkspace } from '@/lib/workspace';
import { resolveVerification, setupStageHref, workspaceFootprint } from '@/lib/verification';

interface Props {
  encoded?: string;
}

function decodeAssessment(encoded: string | undefined): AssessmentData {
  if (!encoded) return EMPTY_ASSESSMENT;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded)))) as AssessmentData;
  } catch {
    return EMPTY_ASSESSMENT;
  }
}

function parseCountries(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

const STAGE_LABELS: Record<string, string> = {
  profile: 'confirming your organization details',
  classes: 'setting up your relationship groups',
  policies: 'writing your recognition rules',
  assignments: 'deciding who each rule applies to',
  people: 'adding your people',
  programs: 'ready for your first program',
  active: 'up and running',
};

export default function VerifyGate({ encoded }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<WorkspaceState | null>(null);
  const [checked, setChecked] = useState(false);
  const data = decodeAssessment(encoded);

  // EX-C1: look before creating. A verification link is often reopened from an
  // email or a bookmark long after setup, and the previous behaviour replaced
  // everything the operator had built.
  useEffect(() => {
    setExisting(getWorkspace());
    setChecked(true);
  }, []);

  const input: NewWorkspaceInput = {
    companyName: data.companyName,
    website: data.website,
    industry: data.industry,
    employeeCount: data.employeeCount,
    operatingCountries: parseCountries(data.operatingCountries),
    contactName: data.contactName,
    contactEmail: data.email,
    contactRole: data.role,
    phone: data.phone,
  };

  function handleContinue() {
    setLoading(true);
    const outcome = resolveVerification(existing, input);
    if (outcome.action === 'created') {
      // Reached only when `existing` was null — the sole path that writes.
      saveWorkspace(outcome.workspace);
    }
    router.push(outcome.href);
  }

  if (!checked) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  // ─── An existing workspace is always continued, never replaced ─────────────
  if (existing) {
    const footprint = workspaceFootprint(existing);
    const stageLabel = STAGE_LABELS[existing.setupStage] ?? 'continuing your setup';

    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8">

          <div className="text-center">
            <p className="font-body text-xs text-stone uppercase tracking-widest mb-4">Welcome back</p>
            <h1 className="font-display font-bold text-3xl text-ink mb-3">
              You already have a workspace here
            </h1>
            <p className="font-body text-stone leading-relaxed">
              We found the workspace for{' '}
              <span className="font-semibold text-ink">{existing.companyName || 'your organization'}</span>{' '}
              already set up on this device. Nothing has been changed — you left off{' '}
              {stageLabel}.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-stone/20 p-6 space-y-3">
            <p className="font-body text-xs text-stone uppercase tracking-widest">What&apos;s already here</p>
            <FootprintLine count={footprint.relationshipClasses} singular="relationship group" plural="relationship groups" />
            <FootprintLine count={footprint.recognitionPolicies} singular="recognition rule" plural="recognition rules" />
            <FootprintLine count={footprint.policyAssignments} singular="rule assignment" plural="rule assignments" />
            <FootprintLine count={footprint.people} singular="person" plural="people" />
          </div>

          <button
            onClick={() => router.push(setupStageHref(existing.setupStage))}
            className="w-full rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Continue to your workspace &#8594;
          </button>

          <p className="font-body text-xs text-stone/60 text-center leading-relaxed">
            Opening this link again is always safe. It never replaces what you&apos;ve already built.
          </p>

        </div>
      </div>
    );
  }

  // ─── No workspace on this device — create one ──────────────────────────────
  const displayName = data.companyName || 'Your Organization';

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">

        <div className="text-center">
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-4">Workspace Setup</p>
          <h1 className="font-display font-bold text-3xl text-ink mb-3">
            You&apos;re one step away
          </h1>
          <p className="font-body text-stone leading-relaxed">
            We&apos;ll create an Aniy&eacute; workspace for{' '}
            <span className="font-semibold text-ink">{displayName}</span>.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone/20 p-6 space-y-4">
          <p className="font-body text-xs text-stone uppercase tracking-widest">What gets created</p>
          {[
            'Your organization details — already filled in from your assessment',
            'A private workspace for your team',
            'A guided setup that takes you to your first program',
          ].map((item) => (
            <div key={item} className="flex items-start gap-3">
              <span className="text-gold font-bold text-sm mt-0.5 flex-shrink-0">&#10003;</span>
              <span className="font-body text-sm text-ink leading-snug">{item}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={loading}
          className="w-full rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating your workspace…' : 'Create my workspace'}
        </button>

        <p className="font-body text-xs text-stone/60 text-center">
          Your Relationship Snapshot and assessment answers are kept.
        </p>

      </div>
    </div>
  );
}

function FootprintLine({
  count, singular, plural,
}: {
  count: number; singular: string; plural: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`font-body text-sm font-semibold w-6 flex-shrink-0 ${count > 0 ? 'text-ink' : 'text-stone/40'}`}>
        {count}
      </span>
      <span className={`font-body text-sm ${count > 0 ? 'text-ink' : 'text-stone/50'}`}>
        {count === 1 ? singular : plural}
      </span>
    </div>
  );
}
