'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace, formatAddress } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Courier, Decision, ExecutionBrief, Moment } from '@/lib/operations/types';
import { OFFER_SOURCES } from '@/lib/operations/types';
import {
  buildCourierSelection,
  emptyCourierQuoteDraft,
  previewCourierSelection,
  validateCourierQuote,
} from '@/lib/operations/courier-selection';
import type {
  CourierQuoteDraft,
  CourierQuoteErrors,
  CourierSelectionPreview,
} from '@/lib/operations/courier-selection';

/**
 * Choosing who carries the last leg — H3.5.
 *
 * **Nothing writes until the operator confirms** (ADR-006). Choosing a courier,
 * typing a cost and changing either are all component state.
 *
 * ⚠️ **No ranking and no recommendation.** The couriers serving the delivery
 * country appear alphabetically. Aniyé has no evidence yet about which courier
 * delivers well — that is what H3.6's fulfilment records will eventually
 * provide, and suggesting an answer before then would be invention.
 */

type Phase = 'loading' | 'failed' | 'missing' | 'ready';

const field =
  'w-full min-h-[44px] rounded-lg border border-stone/20 bg-white px-3 py-3 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

export default function CourierSelectionPanel({ momentId }: { momentId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);

  // ── Draft state. UI only; none of it is persisted. ──
  const [draft, setDraft] = useState<CourierQuoteDraft>(emptyCourierQuoteDraft());
  const [quoteErrors, setQuoteErrors] = useState<CourierQuoteErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
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

    const directory = repo.listCouriers(ws.organizationId);
    if (!directory.ok) {
      setFailure({ message: 'The courier directory could not be read.', detail: directory.reason });
      setPhase('failed');
      return;
    }
    setCouriers(directory.value);

    const state = repo.load(ws.organizationId);
    if (!state.ok) {
      setFailure({ message: 'The decision history could not be read.', detail: state.reason });
      setPhase('failed');
      return;
    }
    setDecisions(state.value?.decisions.filter(d => d.momentId === momentId) ?? []);
    setPhase('ready');
  }

  function handleConfirm() {
    if (!moment || !workspaceId || submitting) return;
    const repo = browserOperationsRepository();
    if (!repo) return;

    const currency = previewCourierSelection({ moment, brief, decisions, couriers })
      .chosenVendor?.quotedVendorCost.currency ?? '';
    const checked = validateCourierQuote(draft, couriers, currency);
    if (!checked.ok) { setQuoteErrors(checked.errors); return; }

    setSubmitting(true);
    setError(null);

    const built = buildCourierSelection({
      moment, brief, decisions, couriers,
      quote: checked.value,
      reason,
      now: new Date().toISOString(),
      ids: {
        moment: () => `moment-${crypto.randomUUID()}`,
        decision: () => `decision-${crypto.randomUUID()}`,
        event: () => `event-${crypto.randomUUID()}`,
      },
      actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }

    const written = repo.commitCourierSelection(workspaceId, built.value, built.value.decision.confirmedAt);
    if (!written.ok) {
      // The repository revalidated and refused. Nothing was written, and the
      // screen is re-read so the operator sees the state that refused them.
      setError(written.reason);
      setSubmitting(false);
      setConfirming(false);
      load();
      return;
    }

    setSubmitting(false);
    setConfirming(false);
    setReason('');
    setDraft(emptyCourierQuoteDraft());
    load();
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
        <Link href="/operations/moments"
          className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors inline-flex items-center min-h-[44px] py-2">
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
            Nothing has been changed. Until this loads, this screen cannot say whether a courier has
            already been chosen.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
        <Link href="/operations/moments"
          className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
          ← Back to moments
        </Link>
      </div>
    );
  }

  // Pure. Recomputed on every render, deliberately — it writes nothing.
  const preview: CourierSelectionPreview = previewCourierSelection({ moment, brief, decisions, couriers });
  const currency = preview.chosenVendor?.quotedVendorCost.currency ?? '';
  const selected = preview.couriers.find(c => c.id === draft.courierId) ?? null;

  return (
    <div className="space-y-5">

      <div>
        <Link href={`/operations/moments/${moment.id}`}
          className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Arrange carriage</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {/* ── Confirmed. The success state, and what comes next. ── */}
      {preview.confirmed && (
        <div className="bg-ink text-cream rounded-2xl px-5 py-4" aria-live="polite">
          <p className="font-body text-sm font-semibold">Carrying — {preview.confirmed.courier.name}</p>
          <p className="font-body text-xs text-cream/70 mt-1">
            {formatMoney(preview.confirmed.quotedCourierCost)} quoted ·
            {' '}{preview.confirmed.courier.countryCode} ·
            {' '}{preview.confirmed.consideredCount === 1
              ? 'the only courier available'
              : `chosen from ${preview.confirmed.consideredCount} available`}
          </p>
          <p className="font-body text-xs text-cream/70 mt-2 leading-snug">“{preview.confirmed.reason}”</p>
          <p className="font-body text-xs text-cream/50 mt-3 leading-snug">
            This is what the courier quoted Aniyé, not what anyone has paid. Tracking the dispatch is
            the next stage and is not built yet.
          </p>
        </div>
      )}

      {/* ── What is being carried, and where ── */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
          <Fact label="Occasion" value={moment.occasionType} />
          <Fact label="Delivering to" value={preview.deliveryCountryCode ?? 'Not confirmed'} />
          <Fact label="Brief" value={brief ? `Revision ${brief.revision}` : 'Not confirmed'} />
          <Fact label="Item" value={preview.chosenItem?.name ?? 'Not chosen'} />
          <Fact
            label="Collecting from"
            value={preview.chosenVendor ? `${preview.chosenVendor.snapshot.name}, ${preview.chosenVendor.snapshot.city}` : 'No vendor chosen'}
          />
        </div>
        {brief && (
          <p className="font-body text-xs text-stone/60 leading-snug">
            {formatAddress(brief.deliveryAddressSnapshot)}
          </p>
        )}
        {preview.chosenVendor && (
          <p className="font-body text-xs text-stone/60 leading-snug">
            The country comes from the confirmed brief, and the vendor from the decision that chose
            them — so a later edit cannot change who was asked to carry what.
          </p>
        )}
      </div>

      {/* ── Blocked: every state names its own way out (Doctrine §1.8). ── */}
      {preview.blockers.length > 0 && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink mb-2">
            {preview.confirmed ? 'Already decided' : 'Carriage cannot be arranged yet'}
          </p>
          <ul className="space-y-3">
            {preview.blockers.map(b => (
              <li key={b.code} className="font-body text-sm text-stone leading-snug">
                {b.message}
                <span className="block text-xs text-stone/80 mt-0.5">{b.recovery}</span>
                {b.href && (
                  <Link href={b.href}
                    className="font-semibold text-ink hover:text-gold transition-colors mt-1 inline-flex items-center min-h-[44px] py-2">
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

      {/* ── Choosing ── */}
      {preview.selectable && (
        <>
          <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <p className="font-body text-sm font-semibold text-ink">
                {preview.couriers.length === 1
                  ? `One courier carries in ${preview.deliveryCountryCode}`
                  : `${preview.couriers.length} couriers carry in ${preview.deliveryCountryCode}`}
              </p>
              <p className="font-body text-xs text-stone/70 mt-1 leading-snug">
                Listed alphabetically. What they quoted for carriage goes in {currency} — quotes are
                never converted, and this is what they will charge Aniyé, not the customer.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="q-courier">Courier</label>
                <select id="q-courier" className={field} value={draft.courierId}
                  aria-invalid={quoteErrors.courier ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, courierId: e.target.value })); setQuoteErrors({}); setError(null); }}>
                  <option value="">Choose a courier…</option>
                  {preview.couriers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {quoteErrors.courier && <p className="font-body text-xs text-ink mt-1.5">{quoteErrors.courier}</p>}
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="q-amount">
                  Quoted for carriage ({currency})
                </label>
                <input id="q-amount" className={field} value={draft.amount} inputMode="decimal" placeholder="4500.00"
                  aria-invalid={quoteErrors.amount ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, amount: e.target.value })); setQuoteErrors({}); setError(null); }} />
                {quoteErrors.amount && <p className="font-body text-xs text-ink mt-1.5">{quoteErrors.amount}</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="q-source">How they told you</label>
                <select id="q-source" className={field} value={draft.source}
                  onChange={e => setDraft(d => ({ ...d, source: e.target.value as CourierQuoteDraft['source'] }))}>
                  {OFFER_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="q-quoted">When</label>
                <input id="q-quoted" type="date" className={field} value={draft.quotedAt}
                  aria-invalid={quoteErrors.quotedAt ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, quotedAt: e.target.value })); setQuoteErrors({}); }} />
                {quoteErrors.quotedAt && <p className="font-body text-xs text-ink mt-1.5">{quoteErrors.quotedAt}</p>}
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="q-lead">
                  Transit <span className="text-stone/60 font-normal">(days, optional)</span>
                </label>
                <input id="q-lead" className={field} value={draft.leadTimeDays} inputMode="numeric" placeholder="2"
                  aria-invalid={quoteErrors.leadTimeDays ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, leadTimeDays: e.target.value })); setQuoteErrors({}); }} />
                {quoteErrors.leadTimeDays && <p className="font-body text-xs text-ink mt-1.5">{quoteErrors.leadTimeDays}</p>}
              </div>
            </div>

            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="q-terms">
                Terms or notes <span className="text-stone/60 font-normal">(optional)</span>
              </label>
              <input id="q-terms" className={field} value={draft.terms} placeholder="Collects from the vendor before 3pm"
                onChange={e => setDraft(d => ({ ...d, terms: e.target.value }))} />
            </div>
          </div>

          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            {selected
              ? `${selected.name} chosen${draft.amount.trim() ? ` — ${currency} ${draft.amount.trim()}` : ''}. Nothing is saved until you confirm.`
              : 'No courier chosen yet. Nothing is saved until you confirm.'}
          </p>

          {preview.couriers.length === 1 && (
            <p className="font-body text-sm text-stone bg-gold/10 rounded-xl px-4 py-3">
              Only one courier carries in {preview.deliveryCountryCode}, so there is no comparison to
              make. That is recorded as such — the decision will show one option was available.
            </p>
          )}

          {/* ── Confirmation before consequence (Doctrine §2.11). ── */}
          {!confirming ? (
            <button type="button" disabled={!selected || draft.amount.trim().length === 0}
              onClick={() => { setConfirming(true); setError(null); }}
              className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
              Choose this courier
            </button>
          ) : selected ? (
            <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <p className="font-body text-sm font-semibold text-ink">
                  Confirm {selected.name} to carry in {preview.deliveryCountryCode}?
                </p>
                <p className="font-body text-sm text-stone mt-1 leading-relaxed">
                  {currency} {draft.amount.trim()} quoted for carriage.
                </p>
                <p className="font-body text-xs text-stone/70 mt-2 leading-snug">
                  Confirming records the choice, your reason, the quote, and all{' '}
                  {preview.couriers.length}{' '}
                  {preview.couriers.length === 1 ? 'courier that was' : 'couriers that were'} available
                  in {preview.deliveryCountryCode} — so the decision can be explained later. This is an
                  estimate of what the courier will charge Aniyé. It cannot be changed in this build.
                </p>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="courier-reason">
                  Why this courier?
                </label>
                <input id="courier-reason" value={reason}
                  onChange={e => { setReason(e.target.value); setError(null); }}
                  placeholder="Only one collecting from Abuja same-day"
                  className={field} />
                <p className="font-body text-xs text-stone/70 mt-1.5">
                  Required. It becomes part of the permanent record.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleConfirm} disabled={submitting || reason.trim().length === 0}
                  className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
                  {submitting ? 'Recording…' : 'Confirm this choice'}
                </button>
                <button type="button" onClick={() => { setConfirming(false); setError(null); }}
                  className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
                  Keep looking
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
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
