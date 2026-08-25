'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type {
  Decision,
  ExecutionBrief,
  Fulfilment,
  Memory,
  Moment,
  OperationalEvent,
  RecognitionOrder,
} from '@/lib/operations/types';
import { buildMomentClosure, previewClosure } from '@/lib/operations/closure';
import type { ClosurePreview } from '@/lib/operations/closure';

/**
 * Closing one Moment and writing its Memory — H3.8, implementing ADR-014.
 *
 * **Nothing writes until the operator confirms** (ADR-006). Closure is
 * **irreversible**: there is no reopen and no re-cancellation once a Moment
 * reads `Closed`, so the confirmation says so in as many words.
 *
 * ⚠️ **Recipient acknowledgement is unsupported and excluded here.** This
 * screen records an Aniyé operator confirming a delivered, reconciled
 * recognition is complete — not the recipient confirming anything.
 */

type Phase = 'loading' | 'failed' | 'missing' | 'ready';

const primaryButton =
  'rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]';

const quietButton =
  'font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2';

function ids() {
  return {
    memory: () => `memory-${crypto.randomUUID()}`,
    event: () => `event-${crypto.randomUUID()}`,
  };
}

export default function ClosurePanel({ momentId }: { momentId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [fulfilments, setFulfilments] = useState<Fulfilment[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [orders, setOrders] = useState<RecognitionOrder[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(load, [momentId]);

  function load() {
    const ws = getWorkspace();
    if (!ws) {
      setFailure({ message: 'The organization’s configuration could not be read.' });
      setPhase('failed');
      return;
    }
    const repo = browserOperationsRepository();
    if (!repo) return;
    setWorkspaceId(ws.organizationId);

    const found = repo.findMoment(ws.organizationId, momentId);
    if (!found.ok) {
      setFailure({ message: 'The operational records could not be read.', detail: found.reason });
      setPhase('failed');
      return;
    }
    if (!found.value) { setPhase('missing'); return; }
    setMoment(found.value);

    const live = repo.findLiveBriefForMoment(ws.organizationId, momentId);
    if (!live.ok) {
      setFailure({ message: 'The execution brief could not be read.', detail: live.reason });
      setPhase('failed');
      return;
    }
    setBrief(live.value);

    const state = repo.load(ws.organizationId);
    if (!state.ok) {
      setFailure({ message: 'The closure record could not be read.', detail: state.reason });
      setPhase('failed');
      return;
    }
    setDecisions(state.value?.decisions.filter(d => d.momentId === momentId) ?? []);
    setFulfilments(state.value?.fulfilments.filter(f => f.momentId === momentId) ?? []);
    setEvents(state.value?.events.filter(e => e.momentId === momentId) ?? []);
    setOrders(state.value?.recognitionOrders.filter(o => o.momentId === momentId) ?? []);
    setMemories(state.value?.memories.filter(m => m.momentId === momentId) ?? []);
    setPhase('ready');
  }

  function reset() {
    setSubmitting(false);
    setConfirming(false);
    load();
  }

  function context() {
    return { moment: moment!, brief, decisions, fulfilments, events, orders, memories };
  }

  function handleClose() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setSubmitting(true);
    setError(null);

    const built = buildMomentClosure({
      ...context(), now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }

    const written = repo.commitMomentClosure(workspaceId, built.value, built.value.event.recordedAt);
    if (!written.ok) {
      // The repository revalidated and refused. Nothing was written, and the
      // screen is re-read so the operator sees the state that refused them.
      setError(written.reason);
      reset();
      return;
    }
    setError(null);
    reset();
  }

  // ─── Loading, failure, missing ─────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="bg-white rounded-2xl p-8" role="status" aria-live="polite">
        <p className="font-body text-sm text-stone">Loading…</p>
      </div>
    );
  }

  if (phase === 'missing') {
    return (
      <div className="bg-white rounded-2xl p-8 text-center">
        <p className="font-body text-sm text-stone mb-4">That moment no longer exists.</p>
        <Link href="/operations/moments" className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors inline-flex items-center min-h-[44px] py-2">
          Back to the queue
        </Link>
      </div>
    );
  }

  if (phase === 'failed' || !moment) {
    return (
      <div className="space-y-4 max-w-xl">
        <div className="bg-white rounded-2xl p-6" role="alert">
          <p className="font-body text-sm font-semibold text-ink mb-1">
            {failure?.message ?? 'This screen could not be loaded.'}
          </p>
          {failure?.detail && <p className="font-body text-xs text-stone mt-1 leading-snug">{failure.detail}</p>}
          <p className="font-body text-sm text-stone mt-2 leading-relaxed">
            Nothing has been changed. Until this loads, this screen cannot say whether this moment can
            close.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
        <Link href={`/operations/moments/${momentId}`} className={quietButton}>← Back to the moment</Link>
      </div>
    );
  }

  // Pure. Recomputed on every render, deliberately — it writes nothing.
  const preview: ClosurePreview = previewClosure(context());
  const memory = preview.memory;

  return (
    <div className="space-y-5 max-w-2xl">

      <div>
        <Link href={`/operations/moments/${moment.id}`} className={`${quietButton} mb-1`}>
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Close the moment</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {/* ── Already closed ── */}
      {moment.status === 'Closed' && memory ? (
        <>
          <div className="bg-ink text-cream rounded-2xl px-5 py-4" aria-live="polite">
            <p className="font-body text-sm font-semibold">Closed</p>
            <p className="font-body text-xs text-cream/70 mt-1">
              Delivered {memory.outcomeDate.slice(0, 10)} · closed {memory.createdAt.slice(0, 10)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">Memory</p>
            <p className="font-body text-sm text-ink leading-relaxed">
              This recognition is recorded as complete. It joins{' '}
              {moment.recipientSnapshot.firstName}’s relationship timeline.
            </p>
            <Link href={`/operations/timeline/${moment.personId}`}
              className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors mt-3 inline-flex items-center min-h-[44px] py-2">
              View the relationship timeline →
            </Link>
          </div>
          <p className="font-body text-xs text-stone/60 leading-relaxed">
            Closure is irreversible in this build — there is no reopen and no re-cancellation once a
            moment reads Closed.
          </p>
        </>
      ) : (
        <>
          {/* ── Blocked: every state names its own way out (Doctrine §1.8). ── */}
          {preview.blockers.length > 0 && (
            <div className="bg-gold/10 rounded-2xl px-5 py-4">
              <p className="font-body text-sm font-semibold text-ink mb-2">This moment cannot close yet</p>
              <ul className="space-y-3">
                {preview.blockers.map(b => (
                  <li key={b.code} className="font-body text-sm text-stone leading-snug">
                    {b.message}
                    <span className="block text-xs text-stone/80 mt-0.5">{b.recovery}</span>
                    {b.href && (
                      <Link href={b.href} className="font-semibold text-ink hover:text-gold transition-colors mt-1 inline-flex items-center min-h-[44px] py-2">
                        Go there →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="bg-white rounded-2xl px-5 py-4" role="alert">
              <p className="font-body text-sm text-ink">{error}</p>
              <p className="font-body text-xs text-stone mt-1">Nothing was recorded.</p>
            </div>
          )}

          {preview.action === 'close' && (
            confirming ? (
              <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
                <div>
                  <p className="font-body text-sm font-semibold text-ink">Confirm this recognition is complete?</p>
                  <p className="font-body text-sm text-stone mt-1 leading-relaxed">
                    This writes a Memory to {moment.recipientSnapshot.firstName}’s relationship timeline
                    and moves the moment to <strong>Closed</strong>. This is <strong>irreversible</strong> —
                    there is no reopen and no re-cancellation once it is confirmed.
                  </p>
                  <p className="font-body text-xs text-stone/70 mt-2 leading-snug">
                    This confirms that Aniyé’s delivery and its costs are complete — not that{' '}
                    {moment.recipientSnapshot.firstName} has acknowledged anything. Recipient
                    acknowledgement is not part of this build.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleClose} disabled={submitting}
                    className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 min-h-[44px]">
                    {submitting ? 'Closing…' : 'Close the moment'}
                  </button>
                  <button type="button" onClick={() => { setConfirming(false); setError(null); }} className={quietButton}>
                    Not yet
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button type="button" className={primaryButton} onClick={() => { setConfirming(true); setError(null); }}>
                  Close the moment
                </button>
                <p className="font-body text-sm text-stone">
                  Nothing is recorded until you confirm.
                </p>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
