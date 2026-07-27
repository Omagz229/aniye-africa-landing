"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import type { Moment, MomentStatus } from '@/lib/operations/types';
import { browserOperationsRepository } from '@/lib/operations/local-store';

export default function MomentsList() {
  const params = useSearchParams();
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MomentStatus | 'all'>(
    (params.get('status') as MomentStatus | null) ?? 'all',
  );

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    repo.initialise(ws.organizationId, new Date().toISOString());
    const listed = repo.listMoments(ws.organizationId);
    if (listed.ok) setMoments(listed.value);
    else { setError(listed.reason); setMoments([]); }
  }, []);

  const visible = useMemo(() => {
    const all = moments ?? [];
    const filtered = filter === 'all' ? all : all.filter(m => m.status === filter);
    // Needs-review first: it is the only group requiring action.
    const order: Record<MomentStatus, number> = { NeedsReview: 0, ReadyForExecution: 1, Cancelled: 2 };
    return [...filtered].sort((a, b) =>
      order[a.status] !== order[b.status] ? order[a.status] - order[b.status] : b.createdAt.localeCompare(a.createdAt),
    );
  }, [moments, filter]);

  if (moments === null) return null;

  const counts = {
    all: moments.length,
    NeedsReview: moments.filter(m => m.status === 'NeedsReview').length,
    ReadyForExecution: moments.filter(m => m.status === 'ReadyForExecution').length,
    Cancelled: moments.filter(m => m.status === 'Cancelled').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Moments</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          Every recognition in flight
        </h2>
        <p className="font-body text-stone">
          One person, one occasion, one execution.
        </p>
      </div>

      {error && <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>}

      {moments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone/30 py-14 px-6 text-center">
          <p className="font-body text-ink font-semibold mb-1">No moments yet</p>
          <p className="font-body text-sm text-stone mb-5 max-w-md mx-auto">
            Moments are created by preparing an active campaign.
          </p>
          <Link href="/operations"
            className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 transition-all">
            Back to Command &#8594;
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', `All ${counts.all}`],
              ['NeedsReview', `Needs review ${counts.NeedsReview}`],
              ['ReadyForExecution', `Ready ${counts.ReadyForExecution}`],
              ['Cancelled', `Cancelled ${counts.Cancelled}`],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value as MomentStatus | 'all')}
                className={`rounded-full px-4 py-2 font-body text-xs transition-colors ${
                  filter === value ? 'bg-ink text-cream' : 'bg-white border border-stone/20 text-stone hover:text-ink'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone/20 py-10 text-center">
              <p className="font-body text-sm text-stone">Nothing in that state.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone/20 divide-y divide-stone/10">
              {visible.map(moment => (
                <Link key={moment.id} href={`/operations/moments/${moment.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 hover:bg-cream/40 transition-colors">
                  <span className="font-body text-sm text-ink font-medium">
                    {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName}
                  </span>
                  <span className="font-body text-xs text-stone">{moment.occasionType}</span>
                  {moment.recipientSnapshot.country && (
                    <span className="font-body text-xs text-stone/60">{moment.recipientSnapshot.country}</span>
                  )}
                  {moment.policyResolutionSnapshot && (
                    <span className="font-body text-xs text-stone/60">
                      {formatMoney(moment.policyResolutionSnapshot.approvedRecognitionBudget)}
                    </span>
                  )}
                  <span className={`font-body text-xs rounded-full px-2 py-0.5 ml-auto flex-shrink-0 ${
                    moment.status === 'ReadyForExecution' ? 'bg-gold/15 text-ink'
                    : moment.status === 'Cancelled' ? 'bg-stone/8 text-stone/50'
                    : 'bg-stone/15 text-ink'
                  }`}>
                    {moment.status === 'ReadyForExecution' ? 'Ready' : moment.status === 'NeedsReview' ? 'Needs review' : 'Cancelled'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
