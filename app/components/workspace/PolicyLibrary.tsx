"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RecognitionPolicy, PolicyStatus, SetupStage } from '@/lib/workspace';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace, updateWorkspace, isStageComplete } from '@/lib/workspace';
import SetupProgress from './SetupProgress';

const STATUS_STYLES: Record<PolicyStatus, string> = {
  Draft:     'bg-stone/10 text-stone',
  Published: 'bg-gold/15 text-ink',
  Archived:  'bg-stone/8 text-stone/50',
};

function PolicyCard({
  policy,
  onDuplicate,
  onArchive,
  onUnarchive,
}: {
  policy: RecognitionPolicy;
  onDuplicate: (p: RecognitionPolicy) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}) {
  const enabledRules = policy.recognitionRules.filter(r => r.isEnabled);
  const isArchived = policy.status === 'Archived';

  return (
    <div className={`bg-white rounded-2xl border border-stone/20 p-6 flex flex-col gap-4 ${isArchived ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`font-body text-xs rounded-full px-2.5 py-0.5 ${STATUS_STYLES[policy.status]}`}>
          {policy.status}
        </span>
        <span className="font-body text-xs text-stone/50 flex-shrink-0">v{policy.version}</span>
      </div>

      <div className="flex-1">
        <h3 className="font-display font-semibold text-lg text-ink mb-1 leading-snug">
          {policy.name || <span className="text-stone/50 italic">Untitled policy</span>}
        </h3>
        {policy.description && (
          <p className="font-body text-sm text-stone leading-relaxed line-clamp-2">{policy.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone/10">
        <span className="font-body text-xs text-stone/60">
          {enabledRules.length} moment type{enabledRules.length !== 1 ? 's' : ''}
          {' · '}
          {policy.approvalWorkflow === 'None' ? 'No approval' : `${policy.approvalWorkflow} approval`}
        </span>
        <div className="flex items-center gap-3">
          {!isArchived && (
            <Link
              href={`/workspace/policies/${policy.id}`}
              className="font-body text-xs font-semibold text-ink hover:text-gold transition-colors"
            >
              {policy.status === 'Draft' ? 'Edit' : 'View'}
            </Link>
          )}
          <button
            type="button"
            onClick={() => onDuplicate(policy)}
            className="font-body text-xs text-stone hover:text-ink transition-colors"
          >
            Duplicate
          </button>
          {isArchived ? (
            <button
              type="button"
              onClick={() => onUnarchive(policy.id)}
              className="font-body text-xs text-stone hover:text-ink transition-colors"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onArchive(policy.id)}
              className="font-body text-xs text-stone hover:text-ink transition-colors"
            >
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PolicyLibrary() {
  const router = useRouter();
  const [policies, setPolicies] = useState<RecognitionPolicy[] | null>(null);
  const [classesNotConfirmed, setClassesNotConfirmed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [stage, setStage] = useState<SetupStage | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (!isStageComplete('classes', ws.setupStage) && ws.setupStage !== 'policies') {
      setClassesNotConfirmed(true);
      return;
    }
    setPolicies(ws.recognitionPolicies ?? []);
    setStage(ws.setupStage);
    setWorkspace(ws);
  }, [router]);

  /**
   * H2.4 — the Policy Library previously had no way forward, because the step
   * after it did not exist. Advancing requires a Published policy: assignments
   * cannot be made against drafts.
   */
  function handleContinue() {
    updateWorkspace({ setupStage: 'assignments' });
    router.push('/workspace/assignments');
  }

  function persist(updated: RecognitionPolicy[]) {
    const next = updateWorkspace({ recognitionPolicies: updated });
    if (next) setWorkspace(next);
    setPolicies(updated);
  }

  function handleDuplicate(policy: RecognitionPolicy) {
    const now = new Date().toISOString();
    const copy: RecognitionPolicy = {
      ...policy,
      id: `policy-${Date.now()}`,
      name: `${policy.name} (copy)`,
      status: 'Draft',
      version: 1,
      parentPolicyId: undefined,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    };
    const current = policies ?? [];
    persist([...current, copy]);
  }

  function handleArchive(id: string) {
    const current = policies ?? [];
    persist(current.map(p => p.id === id ? { ...p, status: 'Archived', updatedAt: new Date().toISOString() } : p));
  }

  function handleUnarchive(id: string) {
    const current = policies ?? [];
    persist(current.map(p => p.id === id ? { ...p, status: 'Draft', updatedAt: new Date().toISOString() } : p));
  }

  if (classesNotConfirmed) {
    return (
      <div className="space-y-6 max-w-xl">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Recognition rules</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            One step to go first
          </h2>
          <p className="font-body text-stone">
            Confirm your relationship groups, then you can set the rules for how each one is
            recognized.
          </p>
        </div>
        <Link
          href="/workspace/classes"
          className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
        >
          Go to relationship groups &#8594;
        </Link>
      </div>
    );
  }

  if (!policies) return null;

  const visible = showArchived ? policies : policies.filter(p => p.status !== 'Archived');
  const archivedCount = policies.filter(p => p.status === 'Archived').length;
  const publishedCount = policies.filter(p => p.status === 'Published').length;
  const draftCount = policies.filter(p => p.status === 'Draft').length;

  // EX-H5 — one recommended action, chosen from state, instead of four gold
  // buttons of equal weight. The recommendation follows what actually unblocks
  // the operator next.
  const latestDraft = [...policies]
    .filter(p => p.status === 'Draft')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  const primary =
    policies.length === 0
      ? { label: 'Create your first rule', href: '/workspace/policies/new' as const }
      : publishedCount === 0 && latestDraft
        ? { label: `Finish and publish ${latestDraft.name || 'your draft'}`, href: `/workspace/policies/${latestDraft.id}` }
        : publishedCount > 0 && stage === 'policies'
          ? { label: 'Continue to who each rule applies to', onClick: handleContinue }
          : { label: 'New rule', href: '/workspace/policies/new' as const };

  const primaryClass =
    'inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';

  return (
    <div className="space-y-8">

      {/* Page intro */}
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
          Recognition rules
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          How each group is recognized
        </h2>
        <p className="font-body text-stone">
          A rule sets the budget, who approves it, and how it&apos;s delivered — for each occasion
          worth marking.
        </p>
      </div>

      {/* Explanation */}
      <div className="bg-cream rounded-2xl border border-stone/20 p-5">
        <p className="font-body text-sm text-ink leading-relaxed">
          Rules are reusable — one rule can cover several groups. Write them here, then decide who
          each one applies to in the next step. A rule has to be published before it can be used.
        </p>
      </div>

      {/* One primary action */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {'onClick' in primary ? (
          <button type="button" onClick={primary.onClick} className={primaryClass}>
            {primary.label} &#8594;
          </button>
        ) : (
          <Link href={primary.href} className={primaryClass}>
            {primary.label} &#8594;
          </Link>
        )}
        {/* Secondary only when the primary isn't already "write a new rule" */}
        {policies.length > 0 && !('href' in primary && primary.href === '/workspace/policies/new') && (
          <Link
            href="/workspace/policies/new"
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors"
          >
            Write another rule
          </Link>
        )}
      </div>

      {publishedCount === 0 && policies.length > 0 && (
        <p className="font-body text-sm text-stone -mt-4">
          Nothing is published yet. Open a draft and publish it to move on.
        </p>
      )}

      {/* Stats */}
      {policies.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {publishedCount > 0 && (
            <div>
              <p className="font-display font-bold text-2xl text-ink">{publishedCount}</p>
              <p className="font-body text-xs text-stone">Published</p>
            </div>
          )}
          {draftCount > 0 && (
            <div>
              <p className="font-display font-bold text-2xl text-ink">{draftCount}</p>
              <p className="font-body text-xs text-stone">Draft</p>
            </div>
          )}
          {archivedCount > 0 && (
            <div>
              <p className="font-display font-bold text-2xl text-ink">{archivedCount}</p>
              <p className="font-body text-xs text-stone">Archived</p>
            </div>
          )}
        </div>
      )}

      {/* Rules or empty state */}
      {policies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone/30 py-14 px-6 text-center">
          <p className="font-body text-ink font-semibold mb-1">No rules yet</p>
          <p className="font-body text-sm text-stone max-w-md mx-auto">
            Start with one — most organizations write a rule for their employees first, then add
            others as they go.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map(policy => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
            />
          ))}
        </div>
      )}

      {/* Show/hide archived */}
      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived(v => !v)}
          className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-4"
        >
          {showArchived ? 'Hide' : 'Show'} {archivedCount} archived rule{archivedCount !== 1 ? 's' : ''}
        </button>
      )}

      {workspace && <SetupProgress workspace={workspace} compact />}

    </div>
  );
}
