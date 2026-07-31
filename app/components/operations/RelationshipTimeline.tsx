"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { RecipientTimelineEntry } from '@/lib/operations/closure';
import { projectRecipientTimeline } from '@/lib/operations/closure';

export default function RelationshipTimeline({ personId }: { personId: string }) {
  const [entries, setEntries] = useState<RecipientTimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const task = window.setTimeout(() => {
      const workspace = getWorkspace();
      const repo = browserOperationsRepository();
      if (!workspace || !repo) return;
      const loaded = repo.load(workspace.organizationId);
      if (!loaded.ok || !loaded.value) {
        setError(loaded.ok ? 'No operations record exists for this workspace.' : loaded.reason);
        setEntries([]);
        return;
      }
      const projected = projectRecipientTimeline(loaded.value, personId);
      if (!projected.ok) {
        setError(projected.reason);
        setEntries([]);
        return;
      }
      setEntries(projected.value);
    }, 0);
    return () => window.clearTimeout(task);
  }, [personId]);

  if (entries === null) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/operations/moments" className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          &#8592; Back to moments
        </Link>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Customer-safe Operations preview</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Relationship timeline</h2>
        <p className="font-body text-sm text-stone mt-2 leading-relaxed max-w-2xl">
          This internal preview contains only the nine whitelisted timeline fields. Customer-facing
          access belongs to H4.0 and is not enabled here.
        </p>
      </div>

      {error && <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>}

      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone/30 py-12 px-6 text-center">
          <p className="font-body text-ink font-semibold mb-1">No closed moments yet</p>
          <p className="font-body text-sm text-stone">A timeline entry appears only after an operator closes a delivered and reconciled Moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <article key={entry.entryId} className="bg-white rounded-2xl border border-stone/20 p-5 space-y-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="font-display font-semibold text-lg text-ink">
                  {entry.recipientFirstName} {entry.recipientLastName}
                </h3>
                <span className="font-body text-xs rounded-full bg-gold/15 text-ink px-2.5 py-0.5">{entry.outcome}</span>
              </div>
              <p className="font-body text-sm text-ink leading-relaxed">{entry.summary}</p>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 pt-1">
                <TimelineFact label="Occasion" value={entry.occasion} />
                <TimelineFact label="Gift category" value={entry.giftCategory} />
                <TimelineFact label="Planned date" value={entry.plannedDate} />
                <TimelineFact label="Outcome date" value={entry.outcomeDate} />
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-xs text-stone uppercase tracking-wider">{label}</dt>
      <dd className="font-body text-sm text-ink mt-0.5">{value}</dd>
    </div>
  );
}
