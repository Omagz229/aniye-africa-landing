"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Program, ProgramStatus, WorkspaceState } from '@/lib/workspace';
import { getWorkspace, updateWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import { hasActiveProgram, programPopulationCount, sortPrograms } from '@/lib/programs';
import SetupProgress from './SetupProgress';

const STATUS_STYLES: Record<ProgramStatus, string> = {
  Draft:     'bg-stone/10 text-stone',
  Active:    'bg-gold/15 text-ink',
  Completed: 'bg-cream text-ink',
  Archived:  'bg-stone/8 text-stone/50',
};

export default function ProgramsPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [stepLocked, setStepLocked] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmSetup, setConfirmSetup] = useState(false);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (ws.setupStage === 'profile' || ws.setupStage === 'classes' || ws.setupStage === 'policies') {
      setStepLocked(true);
      return;
    }
    setWorkspace(ws);
  }, [router]);

  const ordered = useMemo(
    () => (workspace ? sortPrograms(workspace.programs) : []),
    [workspace],
  );

  const classesById = useMemo(
    () => new Map((workspace?.relationshipClasses ?? []).map(c => [c.id, c])),
    [workspace],
  );

  function handleCompleteSetup() {
    const updated = updateWorkspace({ setupStage: 'active' });
    if (updated) { setWorkspace(updated); setConfirmSetup(false); }
  }

  if (stepLocked) {
    return (
      <div className="space-y-6 max-w-xl">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Campaigns</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            A few steps to go first
          </h2>
          <p className="font-body text-stone">
            A campaign draws on your groups, rules and people. Finish those and this step will be
            waiting.
          </p>
        </div>
        <Link href="/workspace"
          className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
          Back to setup &#8594;
        </Link>
      </div>
    );
  }

  if (!workspace) return null;

  const visible = showArchived ? ordered : ordered.filter(p => p.status !== 'Archived');
  const archivedCount = ordered.filter(p => p.status === 'Archived').length;
  const draft = ordered.find(p => p.status === 'Draft');
  const anyActive = hasActiveProgram(workspace.programs);
  const isEmpty = visible.length === 0;
  const setupComplete = workspace.setupStage === 'active';

  // One recommended action, chosen from state.
  const primary = isEmpty
    ? { label: 'Create your first campaign', href: '/workspace/programs/new' }
    : draft
      ? { label: `Continue ${draft.name || 'your draft'}`, href: `/workspace/programs/${draft.id}` }
      : { label: 'Create a campaign', href: '/workspace/programs/new' };

  return (
    <div className="space-y-8">

      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Campaigns</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          Recognition you&apos;ve committed to
        </h2>
        <p className="font-body text-stone">
          A campaign covers one group, for one occasion, over a set period.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href={primary.href}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
          {primary.label} &#8594;
        </Link>
        {!isEmpty && draft && (
          <Link href="/workspace/programs/new"
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
            Create another
          </Link>
        )}
      </div>

      {isEmpty ? (
        <div className="bg-cream rounded-2xl border border-stone/20 p-6">
          <p className="font-body text-sm font-semibold text-ink mb-1">What a campaign does</p>
          <p className="font-body text-sm text-stone leading-relaxed">
            It takes the active people in one relationship group and commits to recognizing them for
            a particular occasion, within a budget you set. When you activate it, the list of people
            is frozen — so later changes to the group don&apos;t quietly change who is covered.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(program => {
            const cls = classesById.get(program.relationshipClassId);
            const count = programPopulationCount(program, workspace.people, workspace.relationshipClasses);
            return (
              <Link key={program.id} href={`/workspace/programs/${program.id}`}
                className={`block bg-white rounded-2xl border border-stone/20 p-5 hover:shadow-md transition-all ${program.status === 'Archived' ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-lg text-ink leading-snug">
                      {program.name || 'Untitled campaign'}
                    </p>
                    <p className="font-body text-sm text-stone">
                      {program.occasionType} · {cls?.name ?? 'group no longer exists'}
                    </p>
                  </div>
                  <span className={`font-body text-xs rounded-full px-2.5 py-0.5 flex-shrink-0 ${STATUS_STYLES[program.status]}`}>
                    {program.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-stone/10">
                  <Fact>{count} {count === 1 ? 'person' : 'people'}{program.frozenPopulation ? ' (frozen)' : ''}</Fact>
                  <Fact>{program.campaignStartDate} → {program.campaignEndDate}</Fact>
                  {program.budgetEnvelopes.map(e => <Fact key={e.currency}>{formatMoney(e)}</Fact>)}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {archivedCount > 0 && (
        <button type="button" onClick={() => setShowArchived(v => !v)}
          className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-4">
          {showArchived ? 'Hide' : 'Show'} {archivedCount} archived campaign{archivedCount !== 1 ? 's' : ''}
        </button>
      )}

      {/* Setup completion — the final H2 step */}
      {setupComplete ? (
        <div className="bg-ink rounded-2xl p-6 sm:p-8">
          <p className="font-body text-xs text-gold uppercase tracking-widest mb-2">Setup complete</p>
          <h3 className="font-display font-semibold text-xl text-cream mb-2">
            Your recognition foundation is ready.
          </h3>
          <p className="font-body text-sm text-cream/70 leading-relaxed">
            Your groups, rules, assignments, people and first campaign are all in place. Aniyé knows
            who matters to you, how each group should be recognized, and who your first campaign
            covers.
          </p>
          <p className="font-body text-sm text-cream/70 leading-relaxed mt-3">
            Moment execution — preparing and delivering each individual recognition — is the next
            stage, and is not yet enabled in this recovery build.
          </p>
        </div>
      ) : anyActive ? (
        <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-3">
          <div>
            <p className="font-body text-sm font-semibold text-ink mb-1">Ready to finish setup</p>
            <p className="font-body text-sm text-stone">
              You have an active campaign, which is the last step of configuration.
            </p>
          </div>
          {confirmSetup ? (
            <div className="space-y-2">
              <p className="font-body text-sm text-stone">
                This marks your workspace as configured. You can still add campaigns, people and
                rules at any time.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleCompleteSetup}
                  className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
                  Finish setup
                </button>
                <button type="button" onClick={() => setConfirmSetup(false)}
                  className="font-body text-sm text-stone hover:text-ink transition-colors">
                  Not yet
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmSetup(true)}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
              Finish setup &#8594;
            </button>
          )}
        </div>
      ) : null}

      <SetupProgress workspace={workspace} compact />
    </div>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return <span className="font-body text-xs text-stone">{children}</span>;
}
