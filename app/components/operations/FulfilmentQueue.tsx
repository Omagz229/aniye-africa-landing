'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { OperationsState } from '@/lib/operations/types';
import { previewFulfilment } from '@/lib/operations/fulfilment';

/**
 * The fulfilment queue — H3.6.
 *
 * Four working groups, in the order an operator actually works them: what needs
 * sending, what is out, what came back, what landed. **Reads only** — every
 * transition happens on the Moment's own fulfilment screen, behind its own
 * confirmation.
 *
 * ⚠️ **A failed read is never rendered as an empty queue.** "Nothing to dispatch"
 * and "we could not find out what there is to dispatch" are different facts, and
 * showing the first when the second is true would tell an operator their work is
 * done when it is not.
 */

type Phase = 'loading' | 'failed' | 'ready';

interface Row {
  momentId: string;
  name: string;
  occasion: string;
  attempt: number | null;
  proofOutstanding: boolean;
  proofRecorded: boolean;
  /** Present only for the blocked group — the first named reason. */
  blocker?: string;
}

interface Groups {
  dispatch: Row[];
  transit: Row[];
  redelivery: Row[];
  delivered: Row[];
  blocked: Row[];
}

const EMPTY: Groups = { dispatch: [], transit: [], redelivery: [], delivered: [], blocked: [] };

export default function FulfilmentQueue() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [groups, setGroups] = useState<Groups>(EMPTY);

  useEffect(load, []);

  function load() {
    const ws = getWorkspace();
    if (!ws) {
      setFailure({ message: 'The organization’s configuration could not be read.' });
      setPhase('failed');
      return;
    }
    const repo = browserOperationsRepository();
    if (!repo) return;

    const state = repo.load(ws.organizationId);
    if (!state.ok) {
      setFailure({ message: 'The operational records could not be read.', detail: state.reason });
      setPhase('failed');
      return;
    }
    setGroups(buildGroups(state.value));
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
            {failure?.message ?? 'This queue could not be loaded.'}
          </p>
          {failure?.detail && <p className="font-body text-xs text-stone mt-1 leading-snug">{failure.detail}</p>}
          <p className="font-body text-sm text-stone mt-2 leading-relaxed">
            Nothing has been changed. This is not an empty queue — until it loads, there is no way to
            say what is waiting.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
        <Link href="/operations" className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
          ← Back to command
        </Link>
      </div>
    );
  }

  const total =
    groups.dispatch.length + groups.transit.length + groups.redelivery.length + groups.delivered.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Fulfilments</h2>
        <p className="font-body text-sm text-stone mt-1">
          {total === 0
            ? 'Nothing has been dispatched yet.'
            : `${total} ${total === 1 ? 'moment' : 'moments'} in the delivery pipeline.`}
        </p>
      </div>

      <Group
        title="Ready to dispatch"
        hint="A courier is arranged and the delivery promises are on record. Confirming dispatch starts the fulfilment."
        empty="Nothing is waiting to be dispatched."
        rows={groups.dispatch}
      />
      <Group
        title="In transit"
        hint="With the courier. Mark each one delivered, or record a failed attempt."
        empty="Nothing is out with a courier."
        rows={groups.transit}
      />
      <Group
        title="Needs redelivery"
        hint="An attempt failed. Sending it again is a decision, and asks for a reason."
        empty="No failed attempts."
        rows={groups.redelivery}
      />
      <Group
        title="Delivered"
        hint="Arrived. Where proof was promised, it is flagged until it is recorded."
        empty="Nothing delivered yet."
        rows={groups.delivered}
      />

      {groups.blocked.length > 0 && (
        <Group
          title="Cannot be dispatched"
          hint="Each of these is missing something upstream, or was prepared before delivery promises were recorded."
          empty=""
          rows={groups.blocked}
        />
      )}
    </div>
  );
}

/** Pure, and separated so the grouping rules are testable without a DOM. */
export function buildGroups(state: OperationsState | null): Groups {
  if (!state) return EMPTY;
  const groups: Groups = { dispatch: [], transit: [], redelivery: [], delivered: [], blocked: [] };

  for (const moment of state.moments) {
    const brief =
      state.executionBriefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
    const preview = previewFulfilment({
      moment,
      brief,
      decisions: state.decisions.filter(d => d.momentId === moment.id),
      fulfilments: state.fulfilments,
      events: state.events.filter(e => e.momentId === moment.id),
    });

    const f = preview.fulfilment;
    const row: Row = {
      momentId: moment.id,
      name: `${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`,
      occasion: moment.occasionType,
      attempt: f?.attempt ?? null,
      proofOutstanding: preview.proofOutstanding,
      proofRecorded: preview.history.some(e => e.eventType === 'ProofReceived'),
    };

    if (f) {
      if (f.status === 'Dispatched') groups.transit.push(row);
      else if (f.status === 'DeliveryFailed') groups.redelivery.push(row);
      else groups.delivered.push(row);
      continue;
    }

    if (preview.action === 'dispatch') {
      groups.dispatch.push(row);
      continue;
    }

    // Only surface a Moment as blocked once it has got as far as carriage —
    // everything earlier belongs to the moments queue, not this one.
    const nearlyReady = preview.blockers.every(
      b => b.code === 'delivery-context-missing' || b.code === 'authority-disagrees',
    );
    if (preview.blockers.length > 0 && nearlyReady) {
      groups.blocked.push({ ...row, blocker: preview.blockers[0].message });
    }
  }

  return groups;
}

function Group({
  title, hint, empty, rows,
}: { title: string; hint: string; empty: string; rows: Row[] }) {
  return (
    <section className="bg-white rounded-2xl border border-stone/20 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-1">
        <h3 className="font-body text-sm font-semibold text-ink">{title}</h3>
        <span className="font-body text-xs text-stone/60">{rows.length}</span>
      </div>
      <p className="font-body text-xs text-stone/70 leading-snug mb-3">{hint}</p>

      {rows.length === 0 ? (
        <p className="font-body text-sm text-stone/60">{empty}</p>
      ) : (
        <ul className="divide-y divide-stone/10 -my-1">
          {rows.map(row => (
            <li key={row.momentId} className="py-1">
              <Link href={`/operations/moments/${row.momentId}/fulfilment`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 min-h-[44px] rounded-lg hover:bg-cream/60 transition-colors -mx-2 px-2">
                <span className="font-body text-sm text-ink font-medium">{row.name}</span>
                <span className="font-body text-xs text-stone/60">{row.occasion}</span>
                {row.attempt !== null && row.attempt > 1 && (
                  <span className="font-body text-xs text-stone/60">attempt {row.attempt}</span>
                )}
                {row.proofOutstanding && (
                  <span className="font-body text-xs rounded-full bg-gold/20 text-ink px-2 py-0.5">
                    proof required
                  </span>
                )}
                {row.proofRecorded && (
                  <span className="font-body text-xs text-stone/60">proof recorded</span>
                )}
                {row.blocker && (
                  <span className="font-body text-xs text-stone/70 basis-full">{row.blocker}</span>
                )}
                <span aria-hidden className="font-body text-sm text-stone/40 ml-auto">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
