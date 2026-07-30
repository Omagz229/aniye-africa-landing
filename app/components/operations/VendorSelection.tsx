'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace, formatAddress } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Decision, ExecutionBrief, Moment, Vendor } from '@/lib/operations/types';
import { OFFER_SOURCES } from '@/lib/operations/types';
import {
  buildVendorSelection,
  emptyOfferDraft,
  previewVendorSelection,
  validateOfferDraft,
} from '@/lib/operations/vendor-selection';
import type {
  NormalizedOffer,
  OfferDraft,
  OfferFieldErrors,
  VendorSelectionPreview,
} from '@/lib/operations/vendor-selection';

/**
 * Comparing hand-entered vendor quotes for one Moment — H3.4.
 *
 * **Nothing here writes until the operator confirms** (ADR-006). Adding,
 * editing, removing and re-choosing draft rows are all component state; only
 * `commitVendorSelection` reaches storage, behind an explicit confirmation with
 * a required reason.
 *
 * ⚠️ **No ranking, no recommendation, no "best value" badge.** Rows appear in
 * the order the operator entered them. Aniyé has no evidence yet about which
 * vendors deliver well — this milestone is where that evidence starts being
 * recorded, and suggesting an answer before it exists would be invention.
 */

type Phase = 'loading' | 'failed' | 'missing' | 'ready';

const field =
  'w-full min-h-[44px] rounded-lg border border-stone/20 bg-white px-3 py-3 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

export default function VendorSelectionPanel({ momentId }: { momentId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // ── Draft state. UI only; none of it is persisted. ──
  const [rows, setRows] = useState<NormalizedOffer[]>([]);
  const [draft, setDraft] = useState<OfferDraft>(emptyOfferDraft());
  const [rowErrors, setRowErrors] = useState<OfferFieldErrors>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

    const directory = repo.listVendors(ws.organizationId);
    if (!directory.ok) {
      setFailure({ message: 'The vendor directory could not be read.', detail: directory.reason });
      setPhase('failed');
      return;
    }
    setVendors(directory.value);

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
    if (!moment || !workspaceId || submitting || selectedIndex === null) return;
    const repo = browserOperationsRepository();
    if (!repo) return;

    setSubmitting(true);
    setError(null);

    const built = buildVendorSelection({
      moment, brief, decisions, vendors,
      offers: rows,
      selectedIndex,
      reason,
      now: new Date().toISOString(),
      ids: {
        moment: () => `moment-${crypto.randomUUID()}`,
        decision: () => `decision-${crypto.randomUUID()}`,
        event: () => `event-${crypto.randomUUID()}`,
        offer: () => `offer-${crypto.randomUUID()}`,
      },
      actorId: 'operator-local',
    });
    if (!built.ok) { setError(built.reason); setSubmitting(false); return; }

    const written = repo.commitVendorSelection(workspaceId, built.value, built.value.decision.confirmedAt);
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
    setRows([]);
    setSelectedIndex(null);
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
            Nothing has been changed. Until this loads, this screen cannot say whether a vendor has
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
  const preview: VendorSelectionPreview = previewVendorSelection({ moment, brief, decisions, vendors });
  const currency = preview.chosen?.snapshot.price.currency ?? '';
  const usedVendorIds = new Set(rows.map(r => r.vendor.id));
  const available = preview.vendors.filter(v => !usedVendorIds.has(v.id));

  function addRow() {
    const checked = validateOfferDraft(draft, preview.vendors, currency);
    if (!checked.ok) { setRowErrors(checked.errors); return; }
    if (usedVendorIds.has(checked.value.vendor.id)) {
      setRowErrors({ vendor: `${checked.value.vendor.name} is already in this comparison.` });
      return;
    }
    setRowErrors({});
    setRows(r => [...r, checked.value]);
    setDraft(emptyOfferDraft());
    setError(null);
  }

  function removeRow(index: number) {
    setRows(r => r.filter((_, i) => i !== index));
    setSelectedIndex(current => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
    setError(null);
  }

  return (
    <div className="space-y-5">

      <div>
        <Link href={`/operations/moments/${moment.id}`}
          className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Compare vendor offers</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {/* ── Confirmed. The success state, and what comes next. ── */}
      {preview.confirmed && (
        <div className="bg-ink text-cream rounded-2xl px-5 py-4" aria-live="polite">
          <p className="font-body text-sm font-semibold">Chosen — {preview.confirmed.vendor.name}</p>
          <p className="font-body text-xs text-cream/70 mt-1">
            {formatMoney(preview.confirmed.quotedVendorCost)} quoted ·
            {' '}{preview.confirmed.vendor.city}, {preview.confirmed.vendor.countryCode} ·
            {' '}{preview.confirmed.consideredCount === 1
              ? 'one quote considered'
              : `${preview.confirmed.consideredCount} quotes considered`}
          </p>
          <p className="font-body text-xs text-cream/70 mt-2 leading-snug">“{preview.confirmed.reason}”</p>
          <p className="font-body text-xs text-cream/50 mt-3 leading-snug">
            This is what the vendor quoted Aniyé, not what anyone has paid.
          </p>
          {/* The one obvious next step once a vendor is chosen (H3.5). */}
          <Link href={`/operations/moments/${moment.id}/courier`}
            className="mt-3 inline-flex items-center rounded-full bg-gold text-ink px-5 font-body text-sm font-semibold hover:brightness-105 transition-all min-h-[44px]">
            Arrange carriage →
          </Link>
        </div>
      )}

      {/* ── What is being quoted for ── */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
          <Fact label="Occasion" value={moment.occasionType} />
          <Fact
            label="Delivering to"
            value={brief ? `${brief.deliveryAddressSnapshot.city}, ${brief.deliveryAddressSnapshot.countryCode}` : 'Not confirmed'}
          />
          <Fact label="Brief" value={brief ? `Revision ${brief.revision}` : 'Not confirmed'} />
          <Fact
            label="Chosen item"
            value={preview.chosen ? `${preview.chosen.snapshot.name} · ${preview.chosen.snapshot.category}` : 'Not chosen'}
          />
          <Fact
            label="Item price"
            value={preview.chosen ? formatMoney(preview.chosen.snapshot.price) : '—'}
          />
          <Fact
            label="Approved budget"
            value={preview.approvedBudget ? formatMoney(preview.approvedBudget) : 'Not resolved'}
          />
        </div>
        {brief && (
          <p className="font-body text-xs text-stone/60 leading-snug">
            {formatAddress(brief.deliveryAddressSnapshot)}
          </p>
        )}
        {preview.chosen && (
          <p className="font-body text-xs text-stone/60 leading-snug">
            The item and its price are read from the decision that chose it, so a later catalog change
            cannot rewrite what a vendor was asked to quote for.
          </p>
        )}
      </div>

      {/* ── Blocked: every state names its own way out (Doctrine §1.8). ── */}
      {preview.blockers.length > 0 && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink mb-2">
            {preview.confirmed ? 'Already decided' : 'Nothing can be quoted yet'}
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

      {/* ── Recording quotes ── */}
      {preview.selectable && (
        <>
          <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <p className="font-body text-sm font-semibold text-ink">Record a quote</p>
              <p className="font-body text-xs text-stone/70 mt-1 leading-snug">
                What each vendor told you, in {currency}. Quotes are never converted, and this is what
                they will charge Aniyé — not the customer.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="o-vendor">Vendor</label>
                <select id="o-vendor" className={field} value={draft.vendorId}
                  aria-invalid={rowErrors.vendor ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, vendorId: e.target.value })); setRowErrors({}); }}>
                  <option value="">Choose a vendor…</option>
                  {available.map(v => (
                    <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.countryCode}</option>
                  ))}
                </select>
                {rowErrors.vendor && <p className="font-body text-xs text-ink mt-1.5">{rowErrors.vendor}</p>}
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="o-amount">
                  Quoted cost ({currency})
                </label>
                <input id="o-amount" className={field} value={draft.amount} inputMode="decimal" placeholder="32000.00"
                  aria-invalid={rowErrors.amount ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, amount: e.target.value })); setRowErrors({}); }} />
                {rowErrors.amount && <p className="font-body text-xs text-ink mt-1.5">{rowErrors.amount}</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="o-source">How they told you</label>
                <select id="o-source" className={field} value={draft.source}
                  onChange={e => setDraft(d => ({ ...d, source: e.target.value as OfferDraft['source'] }))}>
                  {OFFER_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="o-quoted">When</label>
                <input id="o-quoted" type="date" className={field} value={draft.quotedAt}
                  aria-invalid={rowErrors.quotedAt ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, quotedAt: e.target.value })); setRowErrors({}); }} />
                {rowErrors.quotedAt && <p className="font-body text-xs text-ink mt-1.5">{rowErrors.quotedAt}</p>}
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="o-lead">
                  Lead time <span className="text-stone/60 font-normal">(days, optional)</span>
                </label>
                <input id="o-lead" className={field} value={draft.leadTimeDays} inputMode="numeric" placeholder="3"
                  aria-invalid={rowErrors.leadTimeDays ? true : undefined}
                  onChange={e => { setDraft(d => ({ ...d, leadTimeDays: e.target.value })); setRowErrors({}); }} />
                {rowErrors.leadTimeDays && <p className="font-body text-xs text-ink mt-1.5">{rowErrors.leadTimeDays}</p>}
              </div>
            </div>

            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="o-terms">
                Terms or notes <span className="text-stone/60 font-normal">(optional)</span>
              </label>
              <input id="o-terms" className={field} value={draft.terms} placeholder="Includes gift wrap; pay on collection"
                onChange={e => setDraft(d => ({ ...d, terms: e.target.value }))} />
            </div>

            <button type="button" onClick={addRow} disabled={available.length === 0}
              className="rounded-full border border-stone/20 px-5 font-body text-sm font-semibold text-ink hover:border-stone/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
              Add this quote
            </button>
            {available.length === 0 && (
              <p className="font-body text-xs text-stone">
                Every active vendor is already in this comparison.
              </p>
            )}
          </div>

          {/* ── The comparison ── */}
          {rows.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="sr-only">Choose one quote</legend>
              {rows.map((row, index) => (
                <OfferRow
                  key={`${row.vendor.id}-${index}`}
                  row={row}
                  index={index}
                  checked={selectedIndex === index}
                  onSelect={() => { setSelectedIndex(index); setError(null); }}
                  onRemove={() => removeRow(index)}
                />
              ))}
            </fieldset>
          )}

          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            {rows.length === 0
              ? 'No quotes recorded yet. Nothing is saved until you confirm.'
              : selectedIndex === null
                ? `${rows.length} ${rows.length === 1 ? 'quote' : 'quotes'} recorded. Choose one.`
                : `${rows[selectedIndex].vendor.name} selected — ${formatMoney(rows[selectedIndex].quotedVendorCost)}.`}
          </p>

          {/* Honest about a thin comparison, without forbidding it. */}
          {rows.length === 1 && (
            <p className="font-body text-sm text-stone bg-gold/10 rounded-xl px-4 py-3">
              You are comparing a single quote. That is allowed and will be recorded as such — but the
              decision will show one option was considered, not several.
            </p>
          )}

          {/* ── Confirmation before consequence (Doctrine §2.11). ── */}
          {!confirming ? (
            <button type="button" disabled={selectedIndex === null}
              onClick={() => { setConfirming(true); setError(null); }}
              className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
              Choose this vendor
            </button>
          ) : selectedIndex !== null ? (
            <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <p className="font-body text-sm font-semibold text-ink">
                  Confirm {rows[selectedIndex].vendor.name} for {moment.recipientSnapshot.firstName}?
                </p>
                <p className="font-body text-sm text-stone mt-1 leading-relaxed">
                  {formatMoney(rows[selectedIndex].quotedVendorCost)} quoted for{' '}
                  {preview.chosen?.snapshot.name}.
                </p>
                <p className="font-body text-xs text-stone/70 mt-2 leading-snug">
                  Confirming records all {rows.length} {rows.length === 1 ? 'quote' : 'quotes'} you
                  entered — including the ones you did not choose — your reason, and the vendor’s
                  details as they stand now. This is an estimate of what the vendor will charge Aniyé.
                  It cannot be changed in this build.
                </p>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="vendor-reason">
                  Why this vendor?
                </label>
                <input id="vendor-reason" value={reason}
                  onChange={e => { setReason(e.target.value); setError(null); }}
                  placeholder="Only one who could deliver before the target date"
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
                  Keep comparing
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One recorded quote.
 *
 * A **real radio input**, visually hidden and driven through its label — native
 * keyboard behaviour, native role and checked state, visible focus through
 * `peer-focus-visible`. Remove sits outside the label so discarding a row does
 * not select it.
 */
function OfferRow({
  row, index, checked, onSelect, onRemove,
}: {
  row: NormalizedOffer;
  index: number;
  checked: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const id = `offer-${index}`;
  return (
    <div className={`rounded-2xl border transition-colors ${
      checked ? 'border-ink bg-white' : 'border-stone/20 bg-white hover:border-stone/40'
    }`}>
      <input type="radio" name="vendor-offer" id={id} className="sr-only peer" checked={checked} onChange={onSelect} />
      <label htmlFor={id}
        className="flex items-start gap-3 p-4 sm:p-5 cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-gold rounded-2xl">
        <span aria-hidden
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
            checked ? 'border-ink' : 'border-stone/30'
          }`}>
          {checked && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-body text-sm font-semibold text-ink">{row.vendor.name}</span>
            <span className="font-body text-sm text-ink">{formatMoney(row.quotedVendorCost)}</span>
          </span>
          <span className="block font-body text-xs text-stone mt-1">
            {row.vendor.city}, {row.vendor.countryCode} · quoted by {row.source} on{' '}
            {row.quotedAt.slice(0, 10)}
            {row.leadTimeDays !== undefined && ` · ${row.leadTimeDays} day${row.leadTimeDays === 1 ? '' : 's'} lead time`}
          </span>
          {row.terms && <span className="block font-body text-xs text-stone/70 mt-1 break-words">{row.terms}</span>}
        </span>
      </label>
      <div className="px-4 sm:px-5 pb-3 -mt-1">
        <button type="button" onClick={onRemove}
          className="font-body text-xs text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px]">
          Remove this quote
        </button>
      </div>
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
