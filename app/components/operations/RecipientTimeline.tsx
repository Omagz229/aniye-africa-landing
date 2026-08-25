'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import { listRecipientTimeline } from '@/lib/operations/timeline';
import type { RecipientTimelineEntry } from '@/lib/operations/timeline';

/**
 * The safe relationship timeline for one person — H3.8, implementing
 * ADR-014 §7.
 *
 * **Not a customer portal.** This is an internal Operations preview of the
 * projection that H4.0 will eventually show a recipient — nobody outside
 * Aniyé sees this screen while Operations runs on browser storage (ADR-010).
 * Only the nine whitelisted fields ever reach this page; there is no path
 * from here to cost, partner identity, proof content or any other internal
 * record.
 */

type Phase = 'loading' | 'failed' | 'ready';

const quietButton =
  'font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2';

export default function RecipientTimeline({ personId }: { personId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
  const [entries, setEntries] = useState<RecipientTimelineEntry[]>([]);

  useEffect(load, [personId]);

  function load() {
    const ws = getWorkspace();
    if (!ws) {
      setFailure({ message: 'The organization’s configuration could not be read.' });
      setPhase('failed');
      return;
    }
    const repo = browserOperationsRepository();
    if (!repo) return;

    const person = ws.people.find(p => p.id === personId);
    setPersonName(person ? `${person.firstName} ${person.lastName}` : null);

    const state = repo.load(ws.organizationId);
    if (!state.ok) {
      setFailure({ message: 'The relationship record could not be read.', detail: state.reason });
      setPhase('failed');
      return;
    }
    const s = state.value;
    setEntries(
      listRecipientTimeline(
        personId, s?.moments ?? [], s?.memories ?? [], s?.recognitionOrders ?? [], s?.decisions ?? [],
      ),
    );
    setPhase('ready');
  }

  if (phase === 'loading') {
    return (
      <div className="bg-white rounded-2xl p-8" role="status" aria-live="polite">
        <p className="font-body text-sm text-stone">Loading…</p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4 max-w-xl">
        <div className="bg-white rounded-2xl p-6" role="alert">
          <p className="font-body text-sm font-semibold text-ink mb-1">
            {failure?.message ?? 'This screen could not be loaded.'}
          </p>
          {failure?.detail && <p className="font-body text-xs text-stone mt-1 leading-snug">{failure.detail}</p>}
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
        <Link href="/operations/moments" className={quietButton}>← Back to moments</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">

      <div>
        <Link href="/operations/moments" className={`${quietButton} mb-1`}>← Back to moments</Link>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Relationship timeline</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
          {personName ?? 'This person'}
        </h2>
      </div>

      <div className="bg-gold/10 rounded-2xl px-5 py-4">
        <p className="font-body text-xs text-ink leading-snug">
          An internal Operations preview, not a customer portal — {personName ?? 'this person'} does not
          see this page. Only occasion, date and outcome are shown here; no cost, partner or proof detail
          ever reaches this projection.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone/30 py-14 px-6 text-center">
          <p className="font-body text-ink font-semibold mb-1">Nothing closed yet</p>
          <p className="font-body text-sm text-stone max-w-md mx-auto">
            Entries appear here once a moment for this person is delivered, reconciled and closed.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone/20 divide-y divide-stone/10">
          {entries.map(entry => (
            <div key={entry.entryId} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-body text-sm font-medium text-ink">{entry.occasion}</span>
                <span className="font-body text-xs text-stone/60">{entry.giftCategory}</span>
                <span className="font-body text-xs text-stone/50 ml-auto">{entry.outcomeDate.slice(0, 10)}</span>
              </div>
              <p className="font-body text-sm text-stone mt-1 leading-relaxed">{entry.summary}</p>
              <p className="font-body text-xs text-stone/50 mt-1">Planned for {entry.plannedDate}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
