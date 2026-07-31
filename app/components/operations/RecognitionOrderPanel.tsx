'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type {
  Decision,
  ExecutionBrief,
  Fulfilment,
  Moment,
  RecognitionOrder,
} from '@/lib/operations/types';
import { ORDER_CURRENCY } from '@/lib/operations/types';
import {
  actualsFromEstimates,
  actualsFromOrder,
  buildOrderCommitment,
  buildReconciliation,
  emptyActualsDraft,
  emptyQuotationDraft,
  previewRecognitionOrder,
  validateActuals,
  validateQuotation,
} from '@/lib/operations/recognition-order';
import type {
  ActualsDraft,
  ActualsErrors,
  OrderPreview,
  QuotationDraft,
  QuotationErrors,
} from '@/lib/operations/recognition-order';

/**
 * The Recognition Order for one Moment — H3.7, implementing ADR-013.
 *
 * **Nothing writes until the operator confirms** (ADR-006). Typing a quotation,
 * typing actuals and cancelling are all component state.
 *
 * ⚠️ **The customer quotation is never suggested.** The budget and the vendor and
 * courier estimates are shown as read-only authority, and the quotation field
 * starts empty and stays empty until someone types in it. A prefilled number
 * would be a pricing model wearing a placeholder's clothes — ADR-013 §5.
 *
 * ⚠️ **Operational margin is derived on read and never stored**, and the copy
 * below says exactly what it is not.
 */

type Phase = 'loading' | 'failed' | 'missing' | 'ready';
type Confirming = 'commit' | 'reconcile' | 'correct' | null;

const field =
  'w-full min-h-[44px] rounded-lg border border-stone/20 bg-white px-3 py-3 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

const primaryButton =
  'rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]';

const quietButton =
  'font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2';

function ids() {
  return {
    order: () => `order-${crypto.randomUUID()}`,
    decision: () => `decision-${crypto.randomUUID()}`,
    event: () => `event-${crypto.randomUUID()}`,
  };
}

export default function RecognitionOrderPanel({ momentId }: { momentId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [orders, setOrders] = useState<RecognitionOrder[]>([]);
  const [fulfilments, setFulfilments] = useState<Fulfilment[]>([]);

  // ── Draft state. UI only; none of it is persisted. ──
  const [quotation, setQuotation] = useState<QuotationDraft>(emptyQuotationDraft());
  const [quotationErrors, setQuotationErrors] = useState<QuotationErrors>({});
  const [actuals, setActuals] = useState<ActualsDraft>(emptyActualsDraft());
  const [actualsErrors, setActualsErrors] = useState<ActualsErrors>({});
  const [confirming, setConfirming] = useState<Confirming>(null);
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
      setFailure({ message: 'The commercial record could not be read.', detail: state.reason });
      setPhase('failed');
      return;
    }
    setDecisions(state.value?.decisions.filter(d => d.momentId === momentId) ?? []);
    setOrders(state.value?.recognitionOrders.filter(o => o.momentId === momentId) ?? []);
    setFulfilments(state.value?.fulfilments.filter(f => f.momentId === momentId) ?? []);
    setPhase('ready');
  }

  function reset() {
    setSubmitting(false);
    setConfirming(null);
    setQuotation(emptyQuotationDraft());
    setActuals(emptyActualsDraft());
    setQuotationErrors({});
    setActualsErrors({});
    load();
  }

  function context() {
    return { moment: moment!, brief, decisions, orders, fulfilments };
  }

  function handleCommit() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;

    const checked = validateQuotation(quotation);
    if (!checked.ok) { setQuotationErrors(checked.errors); return; }

    setSubmitting(true);
    setError(null);

    const built = buildOrderCommitment({
      ...context(), quotation: checked.value,
      now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }

    const written = repo.commitRecognitionOrder(workspaceId, built.value, built.value.decision.confirmedAt);
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

  function handleActuals(correcting: boolean) {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;

    const checked = validateActuals(actuals);
    if (!checked.ok) { setActualsErrors(checked.errors); return; }

    setSubmitting(true);
    setError(null);

    const built = buildReconciliation({
      ...context(), actuals: checked.value,
      now: new Date().toISOString(), ids: ids(), actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }

    const written = correcting
      ? repo.correctRecognitionOrderActuals(workspaceId, built.value, built.value.decision.confirmedAt)
      : repo.reconcileRecognitionOrder(workspaceId, built.value, built.value.decision.confirmedAt);
    if (!written.ok) { setError(written.reason); reset(); return; }
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
            Nothing has been changed. Until this loads, this screen cannot say whether an order exists.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
        <Link href="/operations/orders" className={quietButton}>← Back to orders</Link>
      </div>
    );
  }

  // Pure. Recomputed on every render, deliberately — it writes nothing.
  const preview: OrderPreview = previewRecognitionOrder(context());
  const order = preview.order;
  const a = preview.authority;

  return (
    <div className="space-y-5">

      <div>
        <Link href={`/operations/moments/${moment.id}`} className={`${quietButton} mb-1`}>
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Recognition Order</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {/* ── Current commercial state ── */}
      {order && (
        <div className="bg-ink text-cream rounded-2xl px-5 py-4" aria-live="polite">
          <p className="font-body text-sm font-semibold">
            {order.status === 'Reconciled' ? 'Reconciled' : 'Committed'}
          </p>
          <p className="font-body text-xs text-cream/70 mt-1">
            Quoted {formatMoney(order.estimatedCustomerCharge)} · committed {order.createdAt.slice(0, 10)}
          </p>
          <p className="font-body text-xs text-cream/50 mt-2 leading-snug">
            Aniyé is the merchant of record for this order. The amounts below are what Aniyé charges and
            incurs — none of them says that money has moved.
          </p>
        </div>
      )}

      {/* ── Immutable authority ── */}
      <Panel title="Commercial authority">
        {a || order ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
              <Fact label="Brief" value={order ? `Revision ${order.briefRevision}` : a ? `Revision ${a.briefRevision}` : '—'} />
              <Fact label="Item" value={a?.itemName ?? 'Recorded on the order'} />
              <Fact label="Vendor" value={a?.vendorName ?? 'Recorded on the order'} />
              <Fact label="Courier" value={a?.courierName ?? 'Recorded on the order'} />
              <Fact label="Commercial role" value={order ? order.commercialRole : 'MerchantOfRecord'} />
            </div>
            <div className="border-t border-stone/10 mt-4 pt-3">
              <Row label="Approved budget" value={formatMoney((order ?? a!).approvedBudget)} />
              <Row label="Vendor estimate" value={formatMoney((order ?? a!).estimatedVendorCost)} />
              <Row label="Courier estimate" value={formatMoney((order ?? a!).estimatedCourierCost)} />
              {order && <Row label="Customer quotation" value={formatMoney(order.estimatedCustomerCharge)} />}
            </div>
            <p className="font-body text-xs text-stone/60 pt-3 leading-relaxed">
              The budget comes from the confirmed brief and the estimates from the confirmed vendor and
              courier quotes. {order
                ? 'They were frozen when this order was committed, and a later edit anywhere cannot rewrite them.'
                : 'They are read-only here — the approved budget is not the customer charge, and it is not a ceiling on cost.'}
            </p>
          </>
        ) : (
          <p className="font-body text-sm text-stone">
            The authority for an order is not complete yet — see below.
          </p>
        )}
      </Panel>

      {/* ── Blocked: every state names its own way out (Doctrine §1.8). ── */}
      {preview.blockers.length > 0 && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink mb-2">
            {preview.blockers.some(b => b.code === 'legacy-fulfilment')
              ? 'No order can be created for this moment'
              : 'An order cannot be committed yet'}
          </p>
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

      {/* ── Create: the manual quotation ── */}
      {preview.action === 'create' && a && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <p className="font-body text-sm font-semibold text-ink">What is Aniyé charging for this?</p>
            <p className="font-body text-sm text-stone mt-1 leading-relaxed">
              Enter the quotation for this order. It is <strong>not calculated</strong> from the budget or
              the costs above — there is no rate card and no percentage in this build, and nothing here
              suggests a figure.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="order-charge">
                Customer quotation ({ORDER_CURRENCY})
              </label>
              <input id="order-charge" className={field} value={quotation.amount} inputMode="decimal"
                placeholder="e.g. 62000"
                aria-invalid={quotationErrors.amount ? true : undefined}
                onChange={e => { setQuotation(q => ({ ...q, amount: e.target.value })); setQuotationErrors({}); setError(null); }} />
              {quotationErrors.amount && <p className="font-body text-xs text-ink mt-1.5">{quotationErrors.amount}</p>}
            </div>
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="order-reason">
              How did you arrive at it?
            </label>
            <input id="order-reason" className={field} value={quotation.reason}
              placeholder="Agreed rate for this client’s December programme"
              aria-invalid={quotationErrors.reason ? true : undefined}
              onChange={e => { setQuotation(q => ({ ...q, reason: e.target.value })); setQuotationErrors({}); setError(null); }} />
            {quotationErrors.reason
              ? <p className="font-body text-xs text-ink mt-1.5">{quotationErrors.reason}</p>
              : <p className="font-body text-xs text-stone/70 mt-1.5">Required. It becomes part of the permanent record.</p>}
          </div>

          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            Nothing is saved until you confirm.
          </p>

          {confirming !== 'commit' ? (
            <button type="button" className={primaryButton}
              disabled={quotation.amount.trim().length === 0}
              onClick={() => { setConfirming('commit'); setError(null); }}>
              Review and commit
            </button>
          ) : (
            <div className="border-t border-stone/10 pt-4 space-y-3">
              <p className="font-body text-sm font-semibold text-ink">
                Commit this Recognition Order?
              </p>
              <p className="font-body text-sm text-stone leading-relaxed">
                The approved budget, both estimates and your quotation of{' '}
                {ORDER_CURRENCY} {quotation.amount.trim()} become <strong>immutable</strong>. Only the
                actual amounts can be corrected later, and only after delivery. This order must exist
                before the moment can be dispatched.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleCommit} disabled={submitting}
                  className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 min-h-[44px]">
                  {submitting ? 'Recording…' : 'Commit the order'}
                </button>
                <button type="button" onClick={() => { setConfirming(null); setError(null); }} className={quietButton}>
                  Keep editing
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Committed, awaiting delivery ── */}
      {preview.action === 'await-delivery' && (
        <div className="bg-cream rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-1">Awaiting delivery</p>
          <p className="font-body text-sm text-stone leading-relaxed">
            {preview.fulfilment
              ? 'Actual amounts can be confirmed once this is delivered.'
              : 'The commercial authority is committed, so this moment can now be dispatched.'}
          </p>
          <Link href={`/operations/moments/${moment.id}/fulfilment`}
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors mt-2 inline-flex items-center min-h-[44px] py-2">
            {preview.fulfilment ? 'Open fulfilment →' : 'Continue to fulfilment →'}
          </Link>
        </div>
      )}

      {/* ── Reconcile, or correct ── */}
      {(preview.action === 'reconcile' || preview.action === 'correct') && order && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <p className="font-body text-sm font-semibold text-ink">
              {preview.action === 'reconcile' ? 'Record the actual amounts' : 'Correct an actual amount'}
            </p>
            <p className="font-body text-sm text-stone mt-1 leading-relaxed">
              {preview.action === 'reconcile'
                ? 'What was finally incurred and finally charged. All three are confirmed together.'
                : 'A correction keeps the earlier figures on the record and adds a new decision explaining the change.'}
            </p>
            <p className="font-body text-xs text-stone/70 mt-2 leading-snug">
              These are the final operator-confirmed amounts. <strong>None of them means money has been
              paid, invoiced or received</strong> — payments and settlement are not part of this build.
            </p>
          </div>

          {confirming === null && (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={primaryButton}
                onClick={() => {
                  setActuals(preview.action === 'reconcile' ? actualsFromEstimates(order) : actualsFromOrder(order));
                  setConfirming(preview.action === 'reconcile' ? 'reconcile' : 'correct');
                  setError(null);
                }}>
                {preview.action === 'reconcile' ? 'Enter actual amounts' : 'Correct the amounts'}
              </button>
              {preview.action === 'reconcile' && (
                <p className="font-body text-xs text-stone/70 basis-full leading-snug">
                  The form opens pre-filled from the estimates so unchanged figures need no re-typing.
                  Nothing is saved until you confirm.
                </p>
              )}
            </div>
          )}

          {(confirming === 'reconcile' || confirming === 'correct') && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['vendor', 'Actual vendor cost', order.estimatedVendorCost],
                  ['courier', 'Actual courier cost', order.estimatedCourierCost],
                  ['charge', 'Actual customer charge', order.estimatedCustomerCharge],
                ] as const).map(([key, label, estimate]) => (
                  <div key={key}>
                    <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor={`actual-${key}`}>
                      {label} ({ORDER_CURRENCY})
                    </label>
                    <input id={`actual-${key}`} className={field} value={actuals[key]} inputMode="decimal"
                      aria-invalid={actualsErrors[key] ? true : undefined}
                      onChange={e => { setActuals(d => ({ ...d, [key]: e.target.value })); setActualsErrors({}); setError(null); }} />
                    {actualsErrors[key]
                      ? <p className="font-body text-xs text-ink mt-1.5">{actualsErrors[key]}</p>
                      : <p className="font-body text-xs text-stone/60 mt-1.5">Estimated {formatMoney(estimate)}</p>}
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="actuals-reason">
                  {confirming === 'correct' ? 'Why are these being corrected?' : 'What are these based on?'}
                </label>
                <input id="actuals-reason" className={field} value={actuals.reason}
                  placeholder={confirming === 'correct'
                    ? 'Vendor invoice arrived lower than quoted'
                    : 'Vendor and courier invoices received; charged as quoted'}
                  aria-invalid={actualsErrors.reason ? true : undefined}
                  onChange={e => { setActuals(d => ({ ...d, reason: e.target.value })); setActualsErrors({}); setError(null); }} />
                {actualsErrors.reason
                  ? <p className="font-body text-xs text-ink mt-1.5">{actualsErrors.reason}</p>
                  : <p className="font-body text-xs text-stone/70 mt-1.5">Required. It becomes part of the permanent record.</p>}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => handleActuals(confirming === 'correct')} disabled={submitting}
                  className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 min-h-[44px]">
                  {submitting ? 'Recording…' : confirming === 'correct' ? 'Confirm the correction' : 'Confirm the amounts'}
                </button>
                <button type="button" onClick={() => { setConfirming(null); setActualsErrors({}); setError(null); }} className={quietButton}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Actuals and derived margin ── */}
      {order?.status === 'Reconciled' && (
        <Panel title="Actual amounts">
          <Row label="Vendor" value={formatMoney(order.actualVendorCost!)} />
          <Row label="Courier" value={formatMoney(order.actualCourierCost!)} />
          <Row label="Customer" value={formatMoney(order.actualCustomerCharge!)} />
          <div className="border-t border-stone/10 mt-3 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5">
              <span className="font-body text-xs text-stone uppercase tracking-wider w-32 flex-shrink-0">
                Operational margin
              </span>
              <span className="font-body text-sm font-semibold text-ink flex-1 min-w-0">
                {preview.margin ? formatMoney(preview.margin) : 'Not available'}
              </span>
            </div>
          </div>
          <p className="font-body text-xs text-stone/70 pt-2 leading-relaxed">
            Customer charge less vendor and courier cost, calculated fresh every time this page is read
            and <strong>never stored</strong> — correcting a cost changes it immediately, with no second
            record to update.
          </p>
          <p className="font-body text-xs text-stone/70 pt-2 leading-relaxed">
            This is <strong>not accounting revenue, not accounting gross profit, not taxable profit and
            not cash received</strong>. It is also <strong>not the company’s complete profitability</strong>:
            taxes, duties, service fees, refunds and payment costs are not recorded in this build.
          </p>
        </Panel>
      )}

      {/* ── The commercial decision history ── */}
      {preview.history.length > 0 && (
        <Panel title={`Commercial decisions (${preview.history.length})`}>
          <ul className="divide-y divide-stone/10 -my-1">
            {preview.history.map(d => (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-body text-sm font-medium text-ink">
                    {d.decisionType === 'RecognitionOrderCommitment' ? 'Order committed' : 'Costs reconciled'}
                  </span>
                  {d.status === 'Superseded' && (
                    <span className="font-body text-xs text-stone/50">superseded</span>
                  )}
                  <span className="font-body text-xs text-stone/50 ml-auto">{d.confirmedAt.slice(0, 10)}</span>
                </div>
                <p className="font-body text-sm text-ink mt-0.5">{d.finalDecision}</p>
                <p className="font-body text-xs text-stone mt-0.5 leading-snug">“{d.reason}”</p>
              </li>
            ))}
          </ul>
          <p className="font-body text-xs text-stone/60 pt-3 leading-relaxed">
            Shown in the order recorded. A superseded decision keeps its original figures and reason —
            nothing here is ever rewritten.
          </p>
        </Panel>
      )}
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
      <span className="font-body text-xs text-stone uppercase tracking-wider w-32 flex-shrink-0">{label}</span>
      <span className={`font-body text-sm flex-1 min-w-0 ${value ? 'text-ink' : 'text-stone/50'}`}>
        {value ?? 'Not recorded'}
      </span>
    </div>
  );
}
