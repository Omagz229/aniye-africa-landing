'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import type { Money } from '@/lib/money';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { OperationsState } from '@/lib/operations/types';
import { grossMargin, previewRecognitionOrder } from '@/lib/operations/recognition-order';

/**
 * The Recognition Order queue — H3.7.
 *
 * Five working groups in the order an operator works them, plus the one group
 * that exists only to be honest about the prototype's own history.
 *
 * ⚠️ **A failed read is never rendered as an empty queue.** "Nothing to cost" and
 * "we could not find out what there is to cost" are different facts, and showing
 * the first when the second is true would tell an operator their work was done.
 *
 * **Reads only** — every confirmation happens on the Moment's own order screen.
 */

type Phase = 'loading' | 'failed' | 'ready';

interface Row {
  momentId: string;
  name: string;
  occasion: string;
  charge: Money | null;
  margin: Money | null;
}

interface Groups {
  create: Row[];
  committed: Row[];
  reconcile: Row[];
  reconciled: Row[];
  legacy: Row[];
}

const EMPTY: Groups = { create: [], committed: [], reconcile: [], reconciled: [], legacy: [] };

export default function OrdersQueue() {
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
    setGroups(buildOrderGroups(state.value));
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

  const total = groups.create.length + groups.committed.length + groups.reconcile.length + groups.reconciled.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Recognition Orders</h2>
        <p className="font-body text-sm text-stone mt-1">
          {total === 0
            ? 'No moment has reached commercial commitment yet.'
            : `${total} ${total === 1 ? 'moment' : 'moments'} with commercial authority in progress.`}
        </p>
      </div>

      <Group
        title="Ready to commit"
        hint="Item, vendor and courier are chosen. Committing fixes the budget and estimates and records your customer quotation — and it must happen before dispatch."
        empty="Nothing is waiting to be costed."
        rows={groups.create}
      />
      <Group
        title="Committed — awaiting delivery"
        hint="Commercial authority is fixed. Actual amounts can be confirmed once the moment is delivered."
        empty="Nothing is awaiting delivery."
        rows={groups.committed}
      />
      <Group
        title="Delivered — ready to reconcile"
        hint="Delivered, with actual amounts still to confirm."
        empty="Nothing is waiting to be reconciled."
        rows={groups.reconcile}
      />
      <Group
        title="Reconciled"
        hint="All three actual amounts confirmed. Operational margin is derived on read, never stored."
        empty="Nothing reconciled yet."
        rows={groups.reconciled}
        showMargin
      />

      {groups.legacy.length > 0 && (
        <Group
          title="No commercial authority"
          hint="These were dispatched before commercial tracking existed. Their delivery history is intact; an order cannot be reconstructed for them, because the quotation was never recorded and no formula may invent one."
          empty=""
          rows={groups.legacy}
        />
      )}
    </div>
  );
}

/** Pure, and separated so the grouping rules are testable without a DOM. */
export function buildOrderGroups(state: OperationsState | null): Groups {
  if (!state) return EMPTY;
  const groups: Groups = { create: [], committed: [], reconcile: [], reconciled: [], legacy: [] };

  for (const moment of state.moments) {
    const brief =
      state.executionBriefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
    const preview = previewRecognitionOrder({
      moment,
      brief,
      decisions: state.decisions.filter(d => d.momentId === moment.id),
      orders: state.recognitionOrders,
      fulfilments: state.fulfilments,
    });

    const order = preview.order;
    const row: Row = {
      momentId: moment.id,
      name: `${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`,
      occasion: moment.occasionType,
      charge: order?.estimatedCustomerCharge ?? null,
      margin: grossMargin(order),
    };

    if (order) {
      if (order.status === 'Reconciled') groups.reconciled.push(row);
      else if (preview.action === 'reconcile') groups.reconcile.push(row);
      else groups.committed.push(row);
      continue;
    }

    if (preview.action === 'create') { groups.create.push(row); continue; }
    if (preview.blockers.some(b => b.code === 'legacy-fulfilment')) groups.legacy.push(row);
  }

  return groups;
}

function Group({
  title, hint, empty, rows, showMargin = false,
}: { title: string; hint: string; empty: string; rows: Row[]; showMargin?: boolean }) {
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
              <Link href={`/operations/moments/${row.momentId}/order`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 min-h-[44px] rounded-lg hover:bg-cream/60 transition-colors -mx-2 px-2">
                <span className="font-body text-sm text-ink font-medium">{row.name}</span>
                <span className="font-body text-xs text-stone/60">{row.occasion}</span>
                {row.charge && (
                  <span className="font-body text-xs text-stone/60">{formatMoney(row.charge)} quoted</span>
                )}
                {showMargin && row.margin && (
                  <span className="font-body text-xs rounded-full bg-gold/20 text-ink px-2 py-0.5">
                    margin {formatMoney(row.margin)}
                  </span>
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
