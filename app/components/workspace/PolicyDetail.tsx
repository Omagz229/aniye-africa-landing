"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RecognitionPolicy, PolicyStatus } from '@/lib/workspace';
import { getWorkspace, updateWorkspace } from '@/lib/workspace';
import PolicyForm from './PolicyForm';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<PolicyStatus, string> = {
  Draft:     'bg-stone/10 text-stone',
  Published: 'bg-gold/15 text-ink',
  Archived:  'bg-stone/8 text-stone/50',
};

function StatusBadge({ status }: { status: PolicyStatus }) {
  return (
    <span className={`font-body text-xs rounded-full px-2.5 py-0.5 ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

// ─── Document section ─────────────────────────────────────────────────────────

function DocSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">{label}</p>
      {children}
    </section>
  );
}

// ─── Money formatter ──────────────────────────────────────────────────────────

function fmt(amount: number, currency: string): string {
  if (!amount) return '—';
  return `${currency} ${amount.toLocaleString()}`;
}

// ─── Document view ────────────────────────────────────────────────────────────

function PolicyDocument({ policy }: { policy: RecognitionPolicy }) {
  const enabledRules = policy.recognitionRules.filter(r => r.isEnabled);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const approvalLabels: Record<string, string> = {
    None: 'No approval required.',
    Manager: 'Manager approval required before any program can execute.',
    Finance: 'Finance approval required before any program can execute.',
    Executive: 'Executive approval required before any program can execute.',
  };

  const deliveryLabels: Record<string, string> = {
    Standard: 'Standard delivery',
    Courier: 'Courier (same-day / next-day)',
    HandDelivered: 'Hand-delivered by Aniyé',
    Digital: 'Digital delivery only',
  };

  const reportingLabels: Record<string, string> = {
    None: 'No reporting.',
    Weekly: 'Weekly reporting.',
    Monthly: 'Monthly reporting.',
    Quarterly: 'Quarterly reporting.',
  };

  return (
    <div className="space-y-8">

      {/* Document header */}
      <div className="pb-6 border-b border-stone/15">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <p className="font-body text-xs text-stone uppercase tracking-widest">Recognition Policy</p>
          <div className="flex items-center gap-2">
            <StatusBadge status={policy.status} />
            <span className="font-body text-xs text-stone/50">v{policy.version}</span>
          </div>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          {policy.name}
        </h2>
        {policy.description && (
          <p className="font-body text-stone leading-relaxed">{policy.description}</p>
        )}
        <p className="font-body text-xs text-stone/40 mt-3">
          Prepared by Aniy&eacute; Africa &middot; {today}
        </p>
      </div>

      {/* Section 1: Recognition Rules */}
      <DocSection label="Recognition Rules">
        {enabledRules.length > 0 ? (
          <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
            {enabledRules.map((rule, i) => (
              <div
                key={rule.momentType}
                className={`flex items-center justify-between px-5 py-4 ${i < enabledRules.length - 1 ? 'border-b border-stone/10' : ''}`}
              >
                <span className="font-body text-sm text-ink">{rule.momentType}</span>
                <div className="text-right">
                  <span className="font-body text-sm font-semibold text-ink">
                    {fmt(rule.budgetPerPerson.amount, rule.budgetPerPerson.currency)}
                  </span>
                  <span className="font-body text-xs text-stone ml-1">/ person</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone/20 px-5 py-4">
            <p className="font-body text-sm text-stone/60">No recognition rules configured.</p>
          </div>
        )}
      </DocSection>

      {/* Section 2: Approval */}
      <DocSection label="Approval Workflow">
        <div className="bg-white rounded-2xl border border-stone/20 px-5 py-4">
          <p className="font-body text-sm text-ink">{approvalLabels[policy.approvalWorkflow]}</p>
        </div>
      </DocSection>

      {/* Section 3: Experience Preferences */}
      <DocSection label="Experience Preferences">
        <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-stone/10">
            <p className="font-body text-xs text-stone uppercase tracking-wider mb-2">Preferred</p>
            {policy.preferredGiftCategories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {policy.preferredGiftCategories.map(cat => (
                  <span key={cat} className="font-body text-xs bg-gold/10 text-ink border border-gold/30 rounded-full px-3 py-1">
                    {cat}
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-body text-sm text-stone/60">No preferences set — all categories considered.</p>
            )}
          </div>
          <div className="px-5 py-4">
            <p className="font-body text-xs text-stone uppercase tracking-wider mb-2">Excluded</p>
            {policy.excludedCategories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {policy.excludedCategories.map(cat => (
                  <span key={cat} className="font-body text-xs bg-stone/8 text-stone border border-stone/20 rounded-full px-3 py-1">
                    {cat}
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-body text-sm text-stone/60">No exclusions — all categories available.</p>
            )}
          </div>
        </div>
      </DocSection>

      {/* Section 4: Delivery */}
      <DocSection label="Delivery Requirements">
        <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
          {[
            { label: 'Method', value: deliveryLabels[policy.deliveryRequirement] },
            { label: 'Timing', value: policy.preferredDeliveryWindow || '—' },
            { label: 'Signature', value: policy.signatureRequired ? 'Required' : 'Not required' },
            { label: 'Proof of delivery', value: policy.proofRequired ? 'Required' : 'Not required' },
          ].map(({ label, value }, i, arr) => (
            <div
              key={label}
              className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-stone/10' : ''}`}
            >
              <span className="font-body text-sm text-stone">{label}</span>
              <span className="font-body text-sm font-medium text-ink text-right">{value}</span>
            </div>
          ))}
        </div>
      </DocSection>

      {/* Section 5: Reporting */}
      <DocSection label="Reporting">
        <div className="bg-white rounded-2xl border border-stone/20 px-5 py-4">
          <p className="font-body text-sm text-ink">{reportingLabels[policy.reportingCadence]}</p>
        </div>
      </DocSection>

    </div>
  );
}

// ─── PolicyDetail main ────────────────────────────────────────────────────────

interface Props {
  policyId: string;
}

export default function PolicyDetail({ policyId }: Props) {
  const router = useRouter();
  const [policy, setPolicy] = useState<RecognitionPolicy | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    const found = (ws.recognitionPolicies ?? []).find(p => p.id === policyId);
    if (!found) { setNotFound(true); return; }
    setPolicy(found);
  }, [policyId, router]);

  function handleCreateNewDraft() {
    if (!policy) return;
    const ws = getWorkspace();
    if (!ws) return;
    const now = new Date().toISOString();
    const draft: RecognitionPolicy = {
      ...policy,
      id: `policy-${Date.now()}`,
      status: 'Draft',
      version: policy.version + 1,
      parentPolicyId: policy.id,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    };
    const updated = [...(ws.recognitionPolicies ?? []), draft];
    updateWorkspace({ recognitionPolicies: updated });
    router.push(`/workspace/policies/${draft.id}`);
  }

  function handleArchive() {
    if (!policy) return;
    const ws = getWorkspace();
    if (!ws) return;
    const updated = (ws.recognitionPolicies ?? []).map(p =>
      p.id === policy.id ? { ...p, status: 'Archived' as const, updatedAt: new Date().toISOString() } : p
    );
    updateWorkspace({ recognitionPolicies: updated });
    router.push('/workspace/policies');
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <p className="font-body text-stone">Policy not found.</p>
        <Link href="/workspace/policies" className="font-body text-sm text-gold underline underline-offset-4">
          ← Back to Policy Library
        </Link>
      </div>
    );
  }

  if (!policy) return null;

  if (editMode) {
    return (
      <PolicyForm
        existingPolicy={policy}
        onCancel={() => setEditMode(false)}
      />
    );
  }

  return (
    <div className="space-y-8">

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href="/workspace/policies"
          className="font-body text-sm text-stone hover:text-ink transition-colors"
        >
          &#8592; Policy Library
        </Link>
        <div className="flex items-center gap-3">
          {policy.status === 'Draft' && (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors"
            >
              Edit
            </button>
          )}
          {policy.status === 'Published' && (
            <button
              type="button"
              onClick={handleCreateNewDraft}
              className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors"
            >
              Create New Draft
            </button>
          )}
          {policy.status !== 'Archived' && (
            <button
              type="button"
              onClick={handleArchive}
              className="font-body text-sm text-stone hover:text-ink transition-colors"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Policy document */}
      <PolicyDocument policy={policy} />

      {/* Publish from document view (Draft only) */}
      {policy.status === 'Draft' && (
        <div className="pt-4 border-t border-stone/15">
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="rounded-full border border-stone/30 text-ink font-semibold text-sm px-6 py-3 hover:border-stone/60 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2"
            >
              Edit Policy
            </button>
            <button
              type="button"
              onClick={() => {
                const ws = getWorkspace();
                if (!ws) return;
                const now = new Date().toISOString();
                const published = { ...policy, status: 'Published' as const, publishedAt: now, updatedAt: now };
                const updated = (ws.recognitionPolicies ?? []).map(p => p.id === policy.id ? published : p);
                updateWorkspace({ recognitionPolicies: updated });
                setPolicy(published);
              }}
              disabled={policy.recognitionRules.filter(r => r.isEnabled).length === 0}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Publish Policy
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
