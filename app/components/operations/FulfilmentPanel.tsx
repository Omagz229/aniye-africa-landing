'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace, formatAddress } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type {
  Decision,
  ExecutionBrief,
  Fulfilment,
  Moment,
  OperationalEvent,
  ProofKind,
} from '@/lib/operations/types';
import { EVENT_SOURCES, PROOF_KINDS } from '@/lib/operations/types';
import {
  buildDelivery,
  buildDeliveryFailure,
  buildInitialDispatch,
  buildProofReceipt,
  buildRedelivery,
  humanDeliveryRequirement,
  humanFulfilmentStatus,
  previewFulfilment,
} from '@/lib/operations/fulfilment';
import type { FulfilmentPreview } from '@/lib/operations/fulfilment';

/**
 * Tracking one Moment's fulfilment — H3.6, implementing ADR-012.
 *
 * **Nothing writes until the operator confirms** (ADR-006). Opening this screen,
 * ticking a proof kind and changing a channel are all component state; every
 * persisted transition goes through an explicit confirmation step.
 *
 * ⚠️ **There is no upload control, and there never will be in this build.** The
 * proof surface records that proof arrived and says plainly that the file is not
 * retained — ADR-012 §7. An interface implying otherwise would be worse than one
 * that stores nothing.
 */

type Phase = 'loading' | 'failed' | 'missing' | 'ready';

/** Which confirmation step is open. Never more than one. */
type Confirming = 'dispatch' | 'fail' | 'redeliver' | 'deliver' | 'proof' | null;

const field =
  'w-full min-h-[44px] rounded-lg border border-stone/20 bg-white px-3 py-3 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

const primaryButton =
  'rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]';

const quietButton =
  'font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2';

function ids() {
  return {
    fulfilment: () => `fulfilment-${crypto.randomUUID()}`,
    decision: () => `decision-${crypto.randomUUID()}`,
    event: () => `event-${crypto.randomUUID()}`,
  };
}

export default function FulfilmentPanel({ momentId }: { momentId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [fulfilments, setFulfilments] = useState<Fulfilment[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);

  // ── Draft state. UI only; none of it is persisted. ──
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [reason, setReason] = useState('');
  const [proofKinds, setProofKinds] = useState<ProofKind[]>([]);
  const [proofSource, setProofSource] = useState<OperationalEvent['source']>('WhatsApp');
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

    // The whole state, so the lifecycle history is read in **persisted order**.
    const state = repo.load(ws.organizationId);
    if (!state.ok) {
      setFailure({ message: 'The fulfilment record could not be read.', detail: state.reason });
      setPhase('failed');
      return;
    }
    setDecisions(state.value?.decisions.filter(d => d.momentId === momentId) ?? []);
    setEvents(state.value?.events.filter(e => e.momentId === momentId) ?? []);
    setFulfilments(state.value?.fulfilments.filter(f => f.momentId === momentId) ?? []);
    setPhase('ready');
  }

  function reset() {
    setSubmitting(false);
    setConfirming(null);
    setReason('');
    setProofKinds([]);
    load();
  }

  function afterWrite(written: { ok: boolean; reason?: string }) {
    if (!written.ok) {
      // The repository revalidated and refused. Nothing was written, and the
      // screen is re-read so the operator sees the state that refused them.
      setError(written.reason ?? 'That step could not be recorded.');
      reset();
      return;
    }
    setError(null);
    reset();
  }

  function context() {
    return { moment: moment!, brief, decisions, fulfilments, events };
  }

  function handleDispatch() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setSubmitting(true);
    setError(null);

    const built = buildInitialDispatch({
      ...context(), now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }
    afterWrite(repo.commitInitialDispatch(workspaceId, built.value, built.value.event.recordedAt));
  }

  function handleFailure() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setSubmitting(true);
    setError(null);

    const built = buildDeliveryFailure({
      ...context(), now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }
    afterWrite(repo.commitDeliveryFailure(workspaceId, built.value, built.value.event.recordedAt));
  }

  function handleRedelivery() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setSubmitting(true);
    setError(null);

    const built = buildRedelivery({
      ...context(), reason, now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }
    afterWrite(repo.commitRedelivery(workspaceId, built.value, built.value.decision.confirmedAt));
  }

  function handleDelivery() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setSubmitting(true);
    setError(null);

    const built = buildDelivery({
      ...context(), now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }
    afterWrite(repo.commitDelivery(workspaceId, built.value, built.value.event.recordedAt));
  }

  function handleProof() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setSubmitting(true);
    setError(null);

    const built = buildProofReceipt({
      ...context(), kinds: proofKinds, source: proofSource,
      now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }
    afterWrite(repo.commitProofReceipt(workspaceId, built.value, built.value.event.recordedAt));
  }

  function toggleKind(kind: ProofKind) {
    setProofKinds(current =>
      current.includes(kind) ? current.filter(k => k !== kind) : [...current, kind],
    );
    setError(null);
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
            Nothing has been changed. Until this loads, this screen cannot say whether anything has
            been dispatched.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
        <Link href="/operations/fulfilments" className={quietButton}>← Back to fulfilments</Link>
      </div>
    );
  }

  // Pure. Recomputed on every render, deliberately — it writes nothing.
  const preview: FulfilmentPreview = previewFulfilment(context());
  const f = preview.fulfilment;
  const dc = preview.deliveryContext;

  return (
    <div className="space-y-5">

      <div>
        <Link href={`/operations/moments/${moment.id}`} className={`${quietButton} mb-1`}>
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Fulfilment</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {/* ── Current state and attempt ── */}
      {f && (
        <div className="bg-ink text-cream rounded-2xl px-5 py-4" aria-live="polite">
          <p className="font-body text-sm font-semibold">{humanFulfilmentStatus(f.status)}</p>
          <p className="font-body text-xs text-cream/70 mt-1">
            Attempt {f.attempt}
            {f.attempt > 1 && ` · ${f.attempt - 1} earlier ${f.attempt === 2 ? 'attempt' : 'attempts'} failed`}
            {' '}· dispatched {f.createdAt.slice(0, 10)}
          </p>
          <p className="font-body text-xs text-cream/50 mt-2 leading-snug">
            This line is the current state. The history below is what actually happened, in the order
            it was recorded — nothing in it is ever edited.
          </p>
        </div>
      )}

      {/* ── Immutable execution authority ── */}
      <Panel title="What is being delivered">
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
          <Fact label="Occasion" value={moment.occasionType} />
          <Fact label="Item" value={preview.authority?.itemName ?? 'Not chosen'} />
          <Fact label="Vendor" value={preview.authority?.vendorName ?? 'Not chosen'} />
          <Fact label="Courier" value={preview.authority?.courierName ?? 'Not chosen'} />
          <Fact label="Brief" value={brief ? `Revision ${brief.revision}` : 'Not confirmed'} />
        </div>
        {brief && (
          <p className="font-body text-xs text-stone/60 leading-snug pt-3">
            {formatAddress(brief.deliveryAddressSnapshot)}
          </p>
        )}
        <p className="font-body text-xs text-stone/60 leading-snug pt-2">
          Frozen when each was confirmed. A later edit to the catalog, the directories or the
          customer’s records cannot rewrite what went out.
        </p>
      </Panel>

      {/* ── Frozen delivery promises ── */}
      <Panel title="What was promised">
        {dc ? (
          <>
            <Row label="Delivery" value={humanDeliveryRequirement(dc.deliveryRequirement)} />
            <Row label="Window" value={dc.preferredDeliveryWindow || 'None specified'} />
            <Row label="Signature" value={dc.signatureRequired ? 'Required' : 'Not required'} />
            <Row label="Proof" value={dc.proofRequired ? 'Required' : 'Optional'} />
            <p className="font-body text-xs text-stone/60 pt-2 leading-relaxed">
              Captured from the governing rule when this moment was prepared. Shown so you know what
              was promised — this build schedules nothing from it and judges nothing against it.
            </p>
          </>
        ) : (
          <p className="font-body text-sm text-stone leading-relaxed">
            Not recorded. This moment was prepared before delivery promises were captured, so what was
            promised is genuinely unknown — it is not that nothing was promised.
          </p>
        )}
      </Panel>

      {/* ── Blocked: every state names its own way out (Doctrine §1.8). ── */}
      {preview.blockers.length > 0 && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink mb-2">Nothing can be dispatched yet</p>
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

      {/* ── The one transition the current state allows ── */}

      {preview.action === 'dispatch' && (
        confirming !== 'dispatch' ? (
          <div className="space-y-3">
            <button type="button" className={primaryButton}
              onClick={() => { setConfirming('dispatch'); setError(null); }}>
              Confirm dispatch
            </button>
            <p className="font-body text-sm text-stone">
              Nothing is recorded until you confirm.
            </p>
          </div>
        ) : (
          <ConfirmBox
            title="Confirm the courier has it?"
            body="This creates the fulfilment record at attempt 1 and starts its history. It cannot be undone in this build — a failed attempt is recorded as a failure, not by deleting this."
            action="Confirm dispatch"
            submitting={submitting}
            onConfirm={handleDispatch}
            onCancel={() => { setConfirming(null); setError(null); }}
          />
        )
      )}

      {preview.action === 'deliver' && (
        <div className="space-y-4">
          {confirming === 'deliver' ? (
            <ConfirmBox
              title="Confirm it reached the recipient?"
              body="This records the delivery against the current attempt and appends it to the history."
              action="Confirm delivery"
              submitting={submitting}
              onConfirm={handleDelivery}
              onCancel={() => { setConfirming(null); setError(null); }}
            />
          ) : confirming === 'fail' ? (
            <ConfirmBox
              title="Record this attempt as failed?"
              body="The fulfilment moves to “needs redelivery” and the failed attempt stays on the record. Sending it again is a separate, deliberate step that asks for your reason."
              action="Record the failure"
              submitting={submitting}
              onConfirm={handleFailure}
              onCancel={() => { setConfirming(null); setError(null); }}
            />
          ) : (
            <>
              {/* Delivery is the primary action; failure stays available and quiet. */}
              <button type="button" className={primaryButton}
                onClick={() => { setConfirming('deliver'); setError(null); }}>
                Mark delivered
              </button>
              <div>
                <button type="button" className={quietButton}
                  onClick={() => { setConfirming('fail'); setError(null); }}>
                  The attempt failed
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {preview.action === 'redeliver' && (
        confirming !== 'redeliver' ? (
          <div className="space-y-3">
            <button type="button" className={primaryButton}
              onClick={() => { setConfirming('redeliver'); setError(null); }}>
              Send it again
            </button>
            <p className="font-body text-sm text-stone">
              The last attempt failed. Nothing is recorded until you confirm.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <p className="font-body text-sm font-semibold text-ink">
                Send this again as attempt {f ? f.attempt + 1 : 2}?
              </p>
              <p className="font-body text-sm text-stone mt-1 leading-relaxed">
                This is the one step in delivery that is a judgement — you could send it again, cancel
                the moment, or handle it outside this system. So it is recorded as a decision with your
                reason attached.
              </p>
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="redelivery-reason">
                Why send it again?
              </label>
              <input id="redelivery-reason" value={reason} className={field}
                placeholder="Recipient was travelling; confirmed they are back Monday"
                onChange={e => { setReason(e.target.value); setError(null); }} />
              <p className="font-body text-xs text-stone/70 mt-1.5">
                Required. It becomes part of the permanent record.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleRedelivery} disabled={submitting || reason.trim().length === 0}
                className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
                {submitting ? 'Recording…' : 'Confirm redelivery'}
              </button>
              <button type="button" onClick={() => { setConfirming(null); setError(null); }} className={quietButton}>
                Not yet
              </button>
            </div>
          </div>
        )
      )}

      {preview.action === 'proof' && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <p className="font-body text-sm font-semibold text-ink">
              {preview.proofOutstanding ? 'Proof was promised for this delivery' : 'Record proof of delivery'}
            </p>
            <p className="font-body text-sm text-stone mt-1 leading-relaxed">
              {preview.proofOutstanding
                ? 'The governing rule promised proof, and none has been recorded yet.'
                : dc?.proofRequired === false
                  ? 'Proof was not required here. You can still record it if it arrived.'
                  : 'Record it if proof arrived.'}
            </p>
            {/*
              ADR-012 §7, stated to the operator in as many words. An interface
              that implied the file was kept would be worse than one that keeps
              nothing — there is deliberately no upload control anywhere here.
            */}
            <p className="font-body text-xs text-ink bg-gold/15 rounded-xl px-4 py-3 mt-3 leading-snug">
              This records that proof was received. The evidence file is not retained in this
              prototype.
            </p>
          </div>

          <fieldset>
            <legend className="font-body text-sm font-medium text-ink mb-2">What arrived?</legend>
            <div className="flex flex-wrap gap-2">
              {PROOF_KINDS.map(kind => {
                const on = proofKinds.includes(kind);
                return (
                  <button key={kind} type="button" onClick={() => toggleKind(kind)} aria-pressed={on}
                    className={`rounded-full px-5 py-3 font-body text-sm min-h-[44px] transition-colors ${
                      on ? 'bg-ink text-cream' : 'border border-stone/20 text-ink hover:border-stone/40'
                    }`}>
                    {kind}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="sm:max-w-xs">
            <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="proof-source">
              How it reached you
            </label>
            <select id="proof-source" className={field} value={proofSource}
              onChange={e => setProofSource(e.target.value as OperationalEvent['source'])}>
              {EVENT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {confirming === 'proof' ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleProof} disabled={submitting}
                className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 min-h-[44px]">
                {submitting ? 'Recording…' : `Confirm — ${proofKinds.join(' and ')} via ${proofSource}`}
              </button>
              <button type="button" onClick={() => { setConfirming(null); setError(null); }} className={quietButton}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" disabled={proofKinds.length === 0}
              onClick={() => { setConfirming('proof'); setError(null); }}
              className={primaryButton}>
              Record proof received
            </button>
          )}
          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            {proofKinds.length === 0
              ? 'Nothing chosen yet. Nothing is saved until you confirm.'
              : `${proofKinds.join(' and ')} selected. Nothing is saved until you confirm.`}
          </p>
        </div>
      )}

      {/* ── The append-only history, in persisted order ── */}
      {f && (
        <Panel title={`Lifecycle (${preview.history.length})`}>
          <ol className="space-y-2 -my-1">
            {preview.history.map(event => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3">
                <span aria-hidden className="text-gold text-xs">•</span>
                <span className="font-body text-sm text-ink">{humanLifecycle(event)}</span>
                <span className="font-body text-xs text-stone/60">{event.source.toLowerCase()}</span>
                <span className="font-body text-xs text-stone/50 ml-auto">
                  {event.occurredAt.slice(0, 16).replace('T', ' ')}
                </span>
              </li>
            ))}
          </ol>
          <p className="font-body text-xs text-stone/60 pt-3 leading-relaxed">
            Shown in the order it was recorded. Append-only — a later attempt is a new entry, never a
            change to an earlier one.
          </p>
        </Panel>
      )}

      {/* Redelivery reasons, which are the only judgements the lifecycle records */}
      {decisions.some(d => d.decisionType === 'Redelivery') && (
        <Panel title="Redelivery decisions">
          <ul className="divide-y divide-stone/10 -my-1">
            {decisions.filter(d => d.decisionType === 'Redelivery').map(d => (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-body text-sm font-medium text-ink">{d.finalDecision}</span>
                  <span className="font-body text-xs text-stone/50 ml-auto">{d.confirmedAt.slice(0, 10)}</span>
                </div>
                <p className="font-body text-xs text-stone mt-0.5 leading-snug">“{d.reason}”</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function humanLifecycle(event: OperationalEvent): string {
  const attempt = typeof event.payload.attempt === 'number' ? event.payload.attempt : null;
  const suffix = attempt === null ? '' : ` — attempt ${attempt}`;
  switch (event.eventType) {
    case 'Dispatched': return `${attempt === 1 ? 'Dispatched' : 'Sent again'}${suffix}`;
    case 'DeliveryFailed': return `Delivery failed${suffix}`;
    case 'Delivered': return `Delivered${suffix}`;
    case 'ProofReceived': {
      const kinds = Array.isArray(event.payload.proofKinds) ? event.payload.proofKinds.join(' and ') : 'Proof';
      return `Proof received — ${kinds}`;
    }
    default: return event.eventType;
  }
}

function ConfirmBox({
  title, body, action, submitting, onConfirm, onCancel,
}: {
  title: string; body: string; action: string; submitting: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <p className="font-body text-sm font-semibold text-ink">{title}</p>
        <p className="font-body text-sm text-stone mt-1 leading-relaxed">{body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onConfirm} disabled={submitting}
          className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 min-h-[44px]">
          {submitting ? 'Recording…' : action}
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>Not yet</button>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone/20 p-5">
      <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-xs uppercase tracking-wide text-stone/60 mb-1">{label}</p>
      <p className="font-body text-sm text-ink break-words">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5">
      <span className="font-body text-xs text-stone uppercase tracking-wider w-24 flex-shrink-0">{label}</span>
      <span className={`font-body text-sm flex-1 min-w-0 ${value ? 'text-ink' : 'text-stone/50'}`}>
        {value ?? 'Not recorded'}
      </span>
    </div>
  );
}
