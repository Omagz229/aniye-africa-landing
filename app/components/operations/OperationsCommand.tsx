"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Program, WorkspaceState } from '@/lib/workspace';
import { getWorkspace } from '@/lib/workspace';
import type { Moment } from '@/lib/operations/types';
import { campaignSourceKey } from '@/lib/operations/types';
import { browserOperationsRepository } from '@/lib/operations/local-store';

/**
 * The operator's command surface — what needs doing, in priority order.
 *
 * Deliberately not a mirror of the customer dashboard: it opens with work
 * rather than with setup progress, and it never links to a stage that does not
 * exist.
 */
export default function OperationsCommand() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) return;
    setWorkspace(ws);

    const repo = browserOperationsRepository();
    if (!repo) return;
    // Initialise on first visit so the operator never sees an empty-state error.
    repo.initialise(ws.organizationId, new Date().toISOString());
    const listed = repo.listMoments(ws.organizationId);
    if (listed.ok) setMoments(listed.value);
    else setStoreError(listed.reason);
  }, []);

  const activeCampaigns = useMemo(
    () => (workspace?.programs ?? []).filter(p => p.status === 'Active'),
    [workspace],
  );

  const preparedKeys = useMemo(() => new Set(moments.map(m => m.sourceKey)), [moments]);

  /** Campaigns with frozen people who have no Moment yet. */
  const awaitingPreparation = useMemo(() => {
    if (!workspace) return [];
    return activeCampaigns.filter(program => {
      const ids = program.frozenPopulation?.personIds ?? [];
      return ids.some(personId =>
        !preparedKeys.has(campaignSourceKey(workspace.organizationId, program.id, personId, program.occasionType)),
      );
    });
  }, [activeCampaigns, preparedKeys, workspace]);

  const needsReview = moments.filter(m => m.status === 'NeedsReview');
  const ready = moments.filter(m => m.status === 'ReadyForExecution');
  const recent = [...moments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  if (!workspace) return null;

  // One primary action, chosen by what most needs attention.
  const primary =
    awaitingPreparation.length > 0
      ? { label: `Prepare moments for ${awaitingPreparation[0].name || 'campaign'}`, href: `/operations/programs/${awaitingPreparation[0].id}/prepare` }
      : needsReview.length > 0
        ? { label: `Review ${needsReview.length} blocked moment${needsReview.length === 1 ? '' : 's'}`, href: '/operations/moments?status=NeedsReview' }
        : moments.length > 0
          ? { label: 'View all moments', href: '/operations/moments' }
          : null;

  return (
    <div className="space-y-8">

      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Command</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          What needs doing
        </h2>
        <p className="font-body text-stone">
          Operational work for {workspace.companyName || 'this organization'}.
        </p>
      </div>

      {storeError && (
        <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">
          {storeError} Your existing operational data has been preserved, not overwritten.
        </p>
      )}

      {primary && (
        <Link href={primary.href}
          className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
          {primary.label} &#8594;
        </Link>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat value={awaitingPreparation.length} label="Campaigns to prepare" />
        <Stat value={needsReview.length} label="Need review" emphasis={needsReview.length > 0} />
        <Stat value={ready.length} label="Ready" />
        <Stat value={moments.length} label="Total moments" />
      </div>

      {/* Campaigns awaiting preparation */}
      {awaitingPreparation.length > 0 ? (
        <section className="space-y-3">
          <p className="font-body text-xs text-stone uppercase tracking-widest">
            Campaigns awaiting preparation
          </p>
          {awaitingPreparation.map(program => (
            <CampaignRow key={program.id} program={program} workspace={workspace} preparedKeys={preparedKeys} />
          ))}
        </section>
      ) : activeCampaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone/20 p-6">
          <p className="font-body text-sm font-semibold text-ink mb-1">Nothing to prepare yet</p>
          <p className="font-body text-sm text-stone leading-relaxed">
            There are no active campaigns. The customer needs to configure their relationship groups,
            recognition rules, rule assignments and people, then activate a campaign — at which point
            it appears here for preparation.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone/20 p-6">
          <p className="font-body text-sm font-semibold text-ink mb-1">All campaigns are prepared</p>
          <p className="font-body text-sm text-stone">
            Every frozen person in every active campaign has a moment.
          </p>
        </div>
      )}

      {/* Needs review — prioritised above ready work */}
      {needsReview.length > 0 && (
        <section className="space-y-3">
          <p className="font-body text-xs text-stone uppercase tracking-widest">
            Moments needing review
          </p>
          <div className="bg-white rounded-2xl border border-stone/20 divide-y divide-stone/10">
            {needsReview.slice(0, 5).map(moment => <MomentRow key={moment.id} moment={moment} />)}
          </div>
          {needsReview.length > 5 && (
            <Link href="/operations/moments?status=NeedsReview"
              className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
              See all {needsReview.length} &#8594;
            </Link>
          )}
        </section>
      )}

      {/* Ready — honest about the next stage not existing */}
      {ready.length > 0 && (
        <div className="bg-cream rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-1">
            {ready.length} moment{ready.length === 1 ? '' : 's'} ready for execution
          </p>
          <p className="font-body text-sm text-stone leading-relaxed">
            The Execution Brief — recipient, address, budget and constraints in one working document
            — is the next stage, and is not yet built. Nothing further can be done with these yet.
          </p>
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <p className="font-body text-xs text-stone uppercase tracking-widest">Recently prepared</p>
          <div className="bg-white rounded-2xl border border-stone/20 divide-y divide-stone/10">
            {recent.map(moment => <MomentRow key={moment.id} moment={moment} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function CampaignRow({
  program, workspace, preparedKeys,
}: {
  program: Program; workspace: WorkspaceState; preparedKeys: Set<string>;
}) {
  const ids = program.frozenPopulation?.personIds ?? [];
  const pending = ids.filter(personId =>
    !preparedKeys.has(campaignSourceKey(workspace.organizationId, program.id, personId, program.occasionType)),
  ).length;

  return (
    <Link href={`/operations/programs/${program.id}/prepare`}
      className="block bg-white rounded-2xl border border-stone/20 p-5 hover:shadow-md transition-all">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-lg text-ink leading-snug">
            {program.name || 'Untitled campaign'}
          </p>
          <p className="font-body text-sm text-stone">
            {program.occasionType} · {program.campaignStartDate} → {program.campaignEndDate}
          </p>
        </div>
        <span className="font-body text-xs text-ink bg-gold/15 rounded-full px-2.5 py-0.5 flex-shrink-0">
          {pending} to prepare
        </span>
      </div>
    </Link>
  );
}

function MomentRow({ moment }: { moment: Moment }) {
  return (
    <Link href={`/operations/moments/${moment.id}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-cream/40 transition-colors">
      <span className="font-body text-sm text-ink font-medium">
        {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName}
      </span>
      <span className="font-body text-xs text-stone">{moment.occasionType}</span>
      {moment.recipientSnapshot.country && (
        <span className="font-body text-xs text-stone/60">{moment.recipientSnapshot.country}</span>
      )}
      <span className={`font-body text-xs rounded-full px-2 py-0.5 ml-auto flex-shrink-0 ${
        moment.status === 'ReadyForExecution' ? 'bg-gold/15 text-ink'
        : moment.status === 'Cancelled' ? 'bg-stone/8 text-stone/50'
        : 'bg-stone/15 text-ink'
      }`}>
        {moment.status === 'ReadyForExecution' ? 'Ready' : moment.status === 'NeedsReview' ? 'Needs review' : 'Cancelled'}
      </span>
    </Link>
  );
}

function Stat({ value, label, emphasis }: { value: number; label: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis && value > 0 ? 'border-gold/40 bg-gold/5' : 'border-stone/20 bg-white'}`}>
      <p className="font-display font-bold text-2xl text-ink">{value}</p>
      <p className="font-body text-xs text-stone leading-snug">{label}</p>
    </div>
  );
}
