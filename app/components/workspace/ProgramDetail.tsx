"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Program, ProgramStatus, WorkspaceState } from '@/lib/workspace';
import { getWorkspace, updateWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import { programPopulationCount, summarizePopulation } from '@/lib/programs';
import ConfirmDialog from './ConfirmDialog';

const STATUS_STYLES: Record<ProgramStatus, string> = {
  Draft:     'bg-stone/10 text-stone',
  Active:    'bg-gold/15 text-ink',
  Completed: 'bg-cream text-ink',
  Archived:  'bg-stone/8 text-stone/50',
};

export default function ProgramDetail({ programId }: { programId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<Program | null>(null);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (!ws.programs.some(p => p.id === programId)) { setNotFound(true); return; }
    setWorkspace(ws);
  }, [router, programId]);

  const program = workspace?.programs.find(p => p.id === programId);

  const cls = useMemo(
    () => workspace?.relationshipClasses.find(c => c.id === program?.relationshipClassId),
    [workspace, program],
  );

  function archive() {
    if (!workspace || !program) return;
    const now = new Date().toISOString();
    const updated = updateWorkspace({
      programs: workspace.programs.map(p =>
        p.id === program.id ? { ...p, status: 'Archived' as const, archivedAt: now, updatedAt: now } : p,
      ),
    });
    if (updated) setWorkspace(updated);
    setPendingArchive(null);
  }

  if (notFound) {
    return (
      <div className="space-y-4 max-w-xl">
        <p className="font-body text-stone">That campaign no longer exists.</p>
        <Link href="/workspace/programs"
          className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 transition-all">
          Back to campaigns &#8594;
        </Link>
      </div>
    );
  }

  if (!workspace || !program) return null;

  const count = programPopulationCount(program, workspace.people, workspace.relationshipClasses);
  // For a draft, membership is still live and worth showing as such.
  const livePopulation = program.frozenPopulation
    ? null
    : summarizePopulation(program.relationshipClassId, workspace.people, workspace.relationshipClasses);

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <Link href="/workspace/programs"
          className="font-body text-sm text-stone hover:text-ink transition-colors mb-3 inline-block">
          &#8592; Back to campaigns
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Campaign</p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
              {program.name || 'Untitled campaign'}
            </h2>
            {program.description && (
              <p className="font-body text-stone mt-1">{program.description}</p>
            )}
          </div>
          <span className={`font-body text-xs rounded-full px-2.5 py-0.5 flex-shrink-0 ${STATUS_STYLES[program.status]}`}>
            {program.status}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6">
        <dl className="divide-y divide-stone/10">
          <Row label="Occasion" value={program.occasionType} />
          <Row label="Group" value={cls?.name ?? 'This group no longer exists'} />
          <Row
            label="People"
            value={
              program.frozenPopulation
                ? `${count} frozen on ${program.frozenPopulation.frozenAt.slice(0, 10)}`
                : `${count} active right now`
            }
          />
          <Row label="Runs" value={`${program.campaignStartDate} → ${program.campaignEndDate}`} />
          {program.budgetEnvelopes.length > 0 ? (
            program.budgetEnvelopes.map(e => (
              <Row key={e.currency} label={`${e.currency} budget`} value={formatMoney(e)} />
            ))
          ) : (
            <Row label="Budget" value={undefined} />
          )}
          {program.activatedAt && (
            <Row label="Activated" value={program.activatedAt.slice(0, 10)} />
          )}
        </dl>
      </div>

      {program.status === 'Active' && (
        <div className="bg-cream rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-1">This campaign is ready</p>
          <p className="font-body text-sm text-stone leading-relaxed">
            The {count} {count === 1 ? 'person' : 'people'} it covers {count === 1 ? 'was' : 'were'}{' '}
            frozen when you activated it — later changes to{' '}
            {cls?.name ?? 'the group'} won&apos;t change who is included.
          </p>
          <p className="font-body text-sm text-stone leading-relaxed mt-2">
            This campaign is ready for Aniyé to prepare. Individual recognition moments are prepared
            by the Aniyé team; you&apos;ll see progress here once that stage reports back.
          </p>
        </div>
      )}

      {livePopulation && program.status === 'Draft' && (
        <div className="bg-cream rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-1">Still a draft</p>
          <p className="font-body text-sm text-stone leading-relaxed">
            This campaign covers whoever is active in {cls?.name ?? 'the group'} right now — the list
            keeps updating until you activate it.
          </p>
        </div>
      )}

      {program.status !== 'Archived' && (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => setPendingArchive(program)}
            className="font-body text-sm text-stone hover:text-ink transition-colors">
            Archive this campaign
          </button>
        </div>
      )}

      {pendingArchive && (
        <ConfirmDialog
          title={`Archive ${pendingArchive.name || 'this campaign'}?`}
          body={
            pendingArchive.status === 'Active'
              ? 'This campaign is active and has a frozen population. Archiving stops it being carried into the recognition stage. Nothing that has already happened is undone, and the record is kept.'
              : 'It stays in your records but is removed from your everyday list.'
          }
          impact={
            pendingArchive.status === 'Active'
              ? [
                  `${count} ${count === 1 ? 'person' : 'people'} are frozen into this campaign`,
                  'The frozen list is preserved exactly as it is',
                  'To change who is covered, create a new campaign rather than editing this one',
                ]
              : ['Nothing has been committed for this campaign yet']
          }
          cancelLabel={pendingArchive.status === 'Active' ? 'Keep it active' : 'Keep it'}
          confirmLabel="Archive campaign"
          onCancel={() => setPendingArchive(null)}
          onConfirm={archive}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
      <dt className="font-body text-xs text-stone uppercase tracking-wider w-28 flex-shrink-0">{label}</dt>
      <dd className={`font-body text-sm flex-1 min-w-0 ${value ? 'text-ink' : 'text-stone/50'}`}>
        {value ?? 'Not set'}
      </dd>
    </div>
  );
}
