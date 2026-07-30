'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import { GIFT_CATEGORIES } from '@/lib/workspace';
import type { CatalogItem } from '@/lib/catalog';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Decision, ExecutionBrief, Moment } from '@/lib/operations/types';
import { buildItemSelection, previewItemSelection } from '@/lib/operations/selection';
import type { SelectionPreview } from '@/lib/operations/selection';

/**
 * The operator chooses one item for one Moment — H3.3.
 *
 * **Nothing here writes until the operator confirms** (ADR-006). Opening the
 * screen, filtering by category, opening an item's detail, changing the
 * selection and navigating away all leave storage untouched: the preview is a
 * pure function and the draft selection is component state. The only call that
 * reaches storage is `commitItemSelection`, behind an explicit confirmation
 * with a required reason.
 */

type Phase = 'loading' | 'failed' | 'ready' | 'missing';

export default function ItemSelectionPanel({ momentId }: { momentId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);

  // ── Draft state. UI only; none of it is ever persisted. ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    if (!repo) return; // SSR — the effect re-runs in the browser.
    setWorkspaceId(ws.organizationId);

    const found = repo.findMoment(ws.organizationId, momentId);
    if (!found.ok) {
      // A failed read is never rendered as an empty list. The reassuring
      // reading is the dangerous one.
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
    if (!repo || !selectedId) return;

    setSubmitting(true);
    setError(null);

    const built = buildItemSelection({
      moment, brief, decisions,
      selectedItemId: selectedId,
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

    const written = repo.commitItemSelection(workspaceId, built.value, built.value.decision.confirmedAt);
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
    setSelectedId(null);
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
      <Dead message="That moment no longer exists." />
    );
  }

  if (phase === 'failed' || !moment) {
    return (
      <div className="space-y-4 max-w-xl">
        <div className="bg-white rounded-2xl p-6" role="alert">
          <p className="font-body text-sm font-semibold text-ink mb-1">
            {failure?.message ?? 'This screen could not be loaded.'}
          </p>
          {failure?.detail && (
            <p className="font-body text-xs text-stone mt-1 leading-snug">{failure.detail}</p>
          )}
          <p className="font-body text-sm text-stone mt-2 leading-relaxed">
            Nothing has been changed. Until this loads, this screen cannot say whether an item has
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
  const preview: SelectionPreview = previewItemSelection({ moment, brief, decisions });

  /**
   * What to *show* in the summary panel.
   *
   * Deliberately separate from what governs eligibility. Once a brief is
   * confirmed the preview's values are authoritative and are used as-is —
   * including its `null`, which is the trust gate saying the exclusions were
   * never recorded. Before a brief exists there is nothing to be authoritative
   * about, so the Moment's own snapshot is shown for information: it is the
   * same immutable snapshot the brief will copy, and reporting it as "not
   * resolved" would have been simply untrue.
   *
   * The fallback can never widen what may be chosen — `eligible` and
   * `selectable` come from the preview alone, and no brief means no selection.
   */
  const awaitingBrief = !brief || brief.status !== 'Confirmed';
  const shownBudget = awaitingBrief
    ? moment.policyResolutionSnapshot?.approvedRecognitionBudget ?? null
    : preview.approvedBudget;
  const shownExclusions = awaitingBrief
    ? moment.policyResolutionSnapshot?.excludedCategories ?? null
    : preview.excludedCategories;

  const categoriesPresent = ['All', ...new Set(preview.eligible.map(i => i.category))]
    .filter(c => c === 'All' || (GIFT_CATEGORIES as readonly string[]).includes(c));
  const shown = category === 'All'
    ? preview.eligible
    : preview.eligible.filter(i => i.category === category);
  const selected = preview.eligible.find(i => i.id === selectedId) ?? null;

  return (
    <div className="space-y-5">

      <div>
        <Link href={`/operations/moments/${moment.id}`}
          className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Choose an item</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {/* ── Confirmed. The success state, and what comes next. ── */}
      {preview.confirmed && (
        <div className="bg-ink text-cream rounded-2xl px-5 py-4" aria-live="polite">
          <p className="font-body text-sm font-semibold">Chosen — {preview.confirmed.item.name}</p>
          <p className="font-body text-xs text-cream/70 mt-1">
            {formatMoney(preview.confirmed.item.price)} · {preview.confirmed.item.category} ·
            {' '}{new Date(preview.confirmed.confirmedAt).toLocaleString()}
          </p>
          <p className="font-body text-xs text-cream/70 mt-2 leading-snug">
            “{preview.confirmed.reason}”
          </p>
          {/* The one obvious next step once an item is chosen (H3.4). */}
          <Link href={`/operations/moments/${moment.id}/vendor`}
            className="mt-3 inline-flex items-center rounded-full bg-gold text-ink px-5 font-body text-sm font-semibold hover:brightness-105 transition-all min-h-[44px]">
            Compare vendor offers →
          </Link>
        </div>
      )}

      {/* ── What governs the choice ── */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
          <Fact label="Occasion" value={moment.occasionType} />
          <Fact
            label="Approved budget"
            value={shownBudget ? formatMoney(shownBudget) : 'Not resolved'}
          />
          <Fact label="Target date" value={moment.targetDate} />
        </div>

        <div>
          <p className="font-body text-xs uppercase tracking-wide text-stone/60 mb-1.5">
            Categories the rule excludes
          </p>
          {shownExclusions === null ? (
            <p className="font-body text-sm text-stone">
              Not recorded when this moment was prepared.
            </p>
          ) : shownExclusions.length === 0 ? (
            <p className="font-body text-sm text-ink">None — every category is allowed.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {shownExclusions.map(c => (
                <li key={c} className="font-body text-xs rounded-full bg-stone/10 text-ink px-2.5 py-1">
                  {c}
                </li>
              ))}
            </ul>
          )}
          {/* Nothing was captured, so there is nothing to reassure anyone about. */}
          {shownExclusions !== null && (
            <p className="font-body text-xs text-stone/60 mt-2 leading-snug">
              {awaitingBrief
                ? 'Captured when this moment was prepared. Confirming the brief fixes these as the constraints an item is chosen against.'
                : 'Captured when this moment was prepared. It still explains this choice even if the rule changes afterwards.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Blocked: every state names its own way out (Doctrine §1.8). ── */}
      {preview.blockers.length > 0 && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink mb-2">
            {preview.confirmed ? 'Already decided' : 'Nothing can be chosen yet'}
          </p>
          <ul className="space-y-3">
            {preview.blockers.map(b => (
              <li key={b.code} className="font-body text-sm text-stone leading-snug">
                {b.message}
                <span className="block text-xs text-stone/80 mt-0.5">{b.recovery}</span>
                {b.href && (
                  <Link href={b.href}
                    className="font-semibold text-ink hover:text-gold transition-colors mt-1 inline-flex items-center min-h-[44px] py-2">
                    {b.href.startsWith('/workspace') ? 'Open in Workspace →' : 'Go there →'}
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

      {/* ── The list ── */}
      {preview.selectable && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-body text-xs uppercase tracking-wide text-stone/60 w-full sm:w-auto">
              {preview.eligible.length} {preview.eligible.length === 1 ? 'item fits' : 'items fit'} this budget
            </span>
            {categoriesPresent.length > 2 && categoriesPresent.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`font-body text-sm rounded-full px-3.5 min-h-[44px] transition-colors ${
                  category === c
                    ? 'bg-ink text-cream'
                    : 'bg-white text-stone hover:text-ink border border-stone/20'
                }`}>
                {c}
              </button>
            ))}
          </div>

          <fieldset className="space-y-3">
            <legend className="sr-only">Choose one item for this recipient</legend>
            {shown.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                checked={selectedId === item.id}
                expanded={expandedId === item.id}
                onSelect={() => { setSelectedId(item.id); setError(null); }}
                onToggleDetail={() => setExpandedId(id => (id === item.id ? null : item.id))}
              />
            ))}
          </fieldset>

          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            {selected
              ? `${selected.name} selected — ${formatMoney(selected.price)}.`
              : 'Nothing selected yet. Choosing an item records nothing until you confirm.'}
          </p>

          {/* ── Confirmation before consequence (Doctrine §2.11). ── */}
          {!confirming ? (
            <button type="button" disabled={!selected} onClick={() => { setConfirming(true); setError(null); }}
              className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
              Choose this item
            </button>
          ) : selected ? (
            <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <p className="font-body text-sm font-semibold text-ink">
                  Confirm {selected.name} for {moment.recipientSnapshot.firstName}?
                </p>
                <p className="font-body text-sm text-stone mt-1 leading-relaxed">
                  {formatMoney(selected.price)} against a {preview.approvedBudget ? formatMoney(preview.approvedBudget) : ''} budget.
                </p>
                <p className="font-body text-xs text-stone/70 mt-2 leading-snug">
                  Confirming records the choice, your reason, and the full list of
                  {' '}{preview.eligible.length} items that qualified — so the decision can be explained
                  later. It cannot be changed in this build.
                </p>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="selection-reason">
                  Why this item?
                </label>
                <input id="selection-reason" value={reason}
                  onChange={e => { setReason(e.target.value); setError(null); }}
                  placeholder="Recipient mentioned they are a keen cook"
                  className="w-full rounded-lg border border-stone/20 bg-white px-3 py-2.5 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow" />
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

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One item.
 *
 * A **real radio input**, visually hidden and driven through its label. That
 * buys native keyboard behaviour — arrow keys move within the group, space
 * selects — plus the correct role and checked state for a screen reader,
 * without reimplementing any of it. The visible focus ring follows the input
 * through `peer-focus-visible`.
 *
 * The detail toggle is a separate button outside the label, so expanding an
 * item does not select it.
 */
function ItemCard({
  item, checked, expanded, onSelect, onToggleDetail,
}: {
  item: CatalogItem;
  checked: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleDetail: () => void;
}) {
  return (
    <div className={`rounded-2xl border transition-colors ${
      checked ? 'border-ink bg-white' : 'border-stone/20 bg-white hover:border-stone/40'
    }`}>
      <input
        type="radio"
        name="catalog-item"
        id={`item-${item.id}`}
        className="sr-only peer"
        checked={checked}
        onChange={onSelect}
      />
      <label htmlFor={`item-${item.id}`}
        className="flex items-start gap-3 p-4 sm:p-5 cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-gold rounded-2xl">
        <span aria-hidden
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
            checked ? 'border-ink' : 'border-stone/30'
          }`}>
          {checked && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-body text-sm font-semibold text-ink">{item.name}</span>
            <span className="font-body text-sm text-ink">{formatMoney(item.price)}</span>
          </span>
          <span className="block font-body text-xs text-stone mt-1">{item.category}</span>
          {expanded && (
            <span className="block font-body text-sm text-stone mt-2 leading-snug">
              {item.description}
            </span>
          )}
        </span>
      </label>
      <div className="px-4 sm:px-5 pb-3 -mt-1">
        <button type="button" onClick={onToggleDetail} aria-expanded={expanded}
          className="font-body text-xs text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px]">
          {expanded ? 'Hide details' : 'Details'}
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

function Dead({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl p-8 text-center">
      <p className="font-body text-sm text-stone mb-4">{message}</p>
      <Link href="/operations/moments"
        className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors inline-flex items-center min-h-[44px] py-2">
        Back to the queue
      </Link>
    </div>
  );
}
