"use client";

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { EMPTY_ASSESSMENT } from '@/lib/assessment';
import {
  getLastSubmissionServerSnapshot,
  getLastSubmissionSnapshot,
  parseLastSubmission,
  stripLegacyPayloadFromUrl,
  subscribeLastSubmission,
} from '@/lib/assessment-submission';
import type { WorkspaceState } from '@/lib/workspace';
import { saveWorkspace, DEFAULT_RELATIONSHIP_CLASSES } from '@/lib/workspace';

function parseCountries(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

export default function VerifyGate() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // PRIV-001: the assessment comes from this device, never from the URL.
  const raw = useSyncExternalStore(
    subscribeLastSubmission,
    getLastSubmissionSnapshot,
    getLastSubmissionServerSnapshot,
  );
  const data = parseLastSubmission(raw) ?? EMPTY_ASSESSMENT;

  useEffect(() => {
    stripLegacyPayloadFromUrl();
  }, []);

  function handleContinue() {
    setLoading(true);
    const workspace: WorkspaceState = {
      organizationId: crypto.randomUUID(),
      companyName: data.companyName,
      website: data.website,
      industry: data.industry,
      employeeCount: data.employeeCount,
      operatingCountries: parseCountries(data.operatingCountries),
      baseCurrency: 'NGN',
      timezone: 'Africa/Lagos',
      contactName: data.contactName,
      contactEmail: data.email,
      contactRole: data.role,
      phone: data.phone,
      setupStage: 'profile',
      createdAt: new Date().toISOString(),
      relationshipClasses: DEFAULT_RELATIONSHIP_CLASSES.map(c => ({ ...c })),
      recognitionPolicies: [],
    };
    saveWorkspace(workspace);
    router.push('/workspace');
  }

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
          <p className="font-body text-sm text-stone/70 mt-2">
            No verification email has been sent.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone/20 p-6 space-y-4">
          <p className="font-body text-xs text-stone uppercase tracking-widest">What gets created</p>
          {[
            'Your Organization Profile — pre-filled from your Relationship Assessment',
            'A preview workspace saved only in this browser — not yet a secure Aniyé account',
            'A guided setup checklist to reach your first program',
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
          {loading ? 'Creating workspace…' : 'Continue to Workspace'}
        </button>

        <p className="font-body text-xs text-stone/60 text-center">
          Your answers stay on this device. Nothing has been sent to Aniy&eacute;.
        </p>

      </div>
    </div>
  );
}
