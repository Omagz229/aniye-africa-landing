'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace, formatAddress, formatMoney } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { BriefQueueResult } from '@/lib/operations/briefs';
import { loadBriefQueue } from '@/lib/operations/briefs';

/**
 * The operator's queue.
 *
 * Doctrine §1.1 — this shows **what needs attention next**, not a table of
 * everything. Moments awaiting a brief come first; confirmed briefs are the
 * quieter record below them.
 *
 * Four states, kept distinct on purpose (H3.2-D1): **loading**, **failed**,
 * **empty** and **populated**. A read that failed must never be shown as a
 * queue with nothing in it.
 */
export default function BriefsList() {
  const [result, setResult] = useState<BriefQueueResult | null>(null);

  useEffect(load, []);

  /** Reads only. Retrying re-reads and creates or changes no canonical record. */
  function load() {
    const repo = browserOperationsRepository();
    if (!repo) {
      setResult({
        status: 'failed',
        message: 'Operational storage is unavailable in this browser.',
        recovery: 'Reload the page. This queue cannot say whether any briefs exist until it can read.',
      });
      return;
    }
    setResult(loadBriefQueue({ readWorkspace: getWorkspace, repository: repo }));
  }

  // ── Loading — distinct from empty ──
  if (result === null) {
    return (
      <div className="space-y-5">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Briefs</h2>
        <p className="font-body text-sm text-stone">Loading the queue…</p>
      </div>
    );
  }

  // ── Failed — the actual problem, never an empty queue ──
  if (result.status === 'failed') {
    return (
      <div className="space-y-5">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Briefs</h2>
        <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-2">
          <p className="font-body text-xs text-stone uppercase tracking-widest">Cannot show the queue</p>
          <p className="font-body text-sm font-semibold text-ink">{result.message}</p>
          {result.detail && (
            <p className="font-body text-xs text-stone/80 leading-snug">{result.detail}</p>
          )}
          <p className="font-body text-sm text-stone leading-snug">{result.recovery}</p>
          <p className="font-body text-xs text-stone/60 pt-1">
            This is not an empty queue — briefs may exist that cannot be read right now.
          </p>
        </div>
        <button type="button" onClick={load}
          className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors">
          Try again
        </button>
      </div>
    );
  }

  const { waiting, confirmed } = result;

  if (waiting.length === 0 && confirmed.length === 0) {
    return (
      <div className="space-y-5">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Briefs</h2>
        <div className="bg-white rounded-2xl p-8 text-center">
          <p className="font-body text-sm text-stone mb-1">No moments are ready for a brief yet.</p>
          <p className="font-body text-xs text-stone/70 mb-4">
            Briefs are prepared from moments that have passed review.
          </p>
          <Link href="/operations/moments"
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
            Open the moments queue →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Briefs</h2>
        <p className="font-body text-sm text-stone mt-1">
          {waiting.length > 0
            ? `${waiting.length} moment${waiting.length === 1 ? '' : 's'} waiting for a brief.`
            : 'Everything ready has been briefed.'}
        </p>
      </div>

      {waiting.length > 0 && (
        <div className="space-y-3">
          {waiting.map(({ moment, hasAddress }) => (
            <Link key={moment.id} href={`/operations/moments/${moment.id}/brief`}
              className="block bg-white rounded-2xl px-5 py-4 hover:bg-white/70 transition-colors">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-body text-sm font-semibold text-ink">
                  {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName}
                </p>
                <span className={`font-body text-xs px-2 py-0.5 rounded-full ${
                  hasAddress ? 'bg-stone/8 text-stone' : 'bg-gold/20 text-ink'
                }`}>
                  {hasAddress ? 'Ready to brief' : 'No address yet'}
                </span>
              </div>
              <p className="font-body text-xs text-stone mt-1">
                {moment.occasionType} · {moment.targetDate}
                {moment.policyResolutionSnapshot &&
                  ` · ${formatMoney(moment.policyResolutionSnapshot.approvedRecognitionBudget)}`}
              </p>
            </Link>
          ))}
        </div>
      )}

      {confirmed.length > 0 && (
        <div>
          <p className="font-body text-xs uppercase tracking-wide text-stone/60 mb-2">Confirmed</p>
          <div className="space-y-3">
            {confirmed.map(brief => (
              <Link key={brief.id} href={`/operations/moments/${brief.momentId}/brief`}
                className="block bg-white rounded-2xl px-5 py-4 hover:bg-white/70 transition-colors">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-body text-sm font-semibold text-ink">
                    {brief.recipientSnapshot.firstName} {brief.recipientSnapshot.lastName}
                  </p>
                  <span className="font-body text-xs text-stone/60">
                    Revision {brief.revision}
                  </span>
                </div>
                <p className="font-body text-xs text-stone mt-1">
                  {formatAddress(brief.deliveryAddressSnapshot)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
