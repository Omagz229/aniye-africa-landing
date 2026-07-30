'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Courier } from '@/lib/operations/types';
import {
  EMPTY_COURIER_DRAFT,
  applyCourierEdit,
  buildCourier,
  courierCoverage,
  courierToDraft,
  coverageGaps,
  filterCouriers,
  sortCouriers,
  validateCourierDraft,
} from '@/lib/operations/couriers';
import type { CourierCoverage, CourierDraft, CourierValidationErrors } from '@/lib/operations/couriers';

/**
 * The courier directory — H3.5.
 *
 * A list an operator maintains by hand, **scoped per country**, plus the one
 * thing checkpoint milestone 7 asks for by name: where deliveries are going and
 * where nobody can carry them.
 *
 * Opening the form, typing, filtering and cancelling write nothing; only Save
 * writes, and it writes once. There is no delete — a courier who carried before
 * has to stay resolvable, so the reversible action is *deactivate*.
 */

type Phase = 'loading' | 'failed' | 'ready';

const field =
  'w-full min-h-[44px] rounded-lg border border-stone/20 bg-white px-3 py-3 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

export default function CourierDirectory() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [coverage, setCoverage] = useState<CourierCoverage[]>([]);

  // ── Draft state. UI only; none of it is persisted until Save. ──
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CourierDraft>({ ...EMPTY_COURIER_DRAFT });
  const [errors, setErrors] = useState<CourierValidationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(load, []);

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
    repo.initialise(ws.organizationId, new Date().toISOString());

    const list = repo.listCouriers(ws.organizationId);
    if (!list.ok) {
      // A failed read is never rendered as an empty directory.
      setFailure({ message: 'The courier directory could not be read.', detail: list.reason });
      setPhase('failed');
      return;
    }
    setCouriers(sortCouriers(list.value));

    // Coverage is measured against confirmed briefs — where deliveries are
    // actually going — not against the assessment's free-text operating
    // countries, which are names with no code mapping anywhere in this build.
    const briefs = repo.listBriefs(ws.organizationId);
    if (!briefs.ok) {
      setFailure({ message: 'The execution briefs could not be read.', detail: briefs.reason });
      setPhase('failed');
      return;
    }
    setCoverage(courierCoverage(
      briefs.value.filter(b => b.status === 'Confirmed').map(b => b.deliveryAddressSnapshot.countryCode),
      list.value,
    ));
    setPhase('ready');
  }

  function openAdd(countryCode = '') {
    setAdding(true);
    setEditingId(null);
    setDraft({ ...EMPTY_COURIER_DRAFT, countryCode });
    setErrors({});
    setError(null);
    setSaved(null);
  }

  function openEdit(courier: Courier) {
    setEditingId(courier.id);
    setAdding(false);
    setDraft(courierToDraft(courier));
    setErrors({});
    setError(null);
    setSaved(null);
  }

  function closeForm() {
    setAdding(false);
    setEditingId(null);
    setDraft({ ...EMPTY_COURIER_DRAFT });
    setErrors({});
    setError(null);
  }

  function handleSave() {
    if (!workspaceId) return;
    const repo = browserOperationsRepository();
    if (!repo) return;

    const checked = validateCourierDraft(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});

    const now = new Date().toISOString();
    const written = editingId
      ? (() => {
          const existing = couriers.find(c => c.id === editingId);
          if (!existing) return { ok: false as const, reason: 'That courier is no longer in the directory.' };
          return repo.updateCourier(workspaceId, applyCourierEdit(existing, checked.value, now), now);
        })()
      : repo.createCourier(workspaceId, buildCourier(checked.value, `courier-${crypto.randomUUID()}`, workspaceId, now), now);

    if (!written.ok) { setError(written.reason); return; }

    setSaved(`${checked.value.name} saved.`);
    closeForm();
    load();
  }

  function toggleActive(courier: Courier) {
    if (!workspaceId) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    const written = repo.setCourierActive(workspaceId, courier.id, !courier.isActive, new Date().toISOString());
    if (!written.ok) { setError(written.reason); return; }
    setSaved(courier.isActive ? `${courier.name} deactivated.` : `${courier.name} reactivated.`);
    load();
  }

  // ─── Loading and failure ───────────────────────────────────────────────────

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
          <p className="font-body text-sm text-stone mt-2 leading-relaxed">
            Nothing has been changed. Until this loads, this screen cannot say whether any couriers exist.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const shown = filterCouriers(couriers, query);
  const activeCount = couriers.filter(c => c.isActive).length;
  const gaps = coverageGaps(coverage);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Couriers</h2>
        <p className="font-body text-sm text-stone mt-1">
          Who carries the last leg, per country. Kept by hand — nobody here has an account, and
          nothing is tracked automatically.
        </p>
      </div>

      {saved && (
        <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3" role="status" aria-live="polite">
          {saved}
        </p>
      )}
      {error && <p className="font-body text-sm text-ink bg-white rounded-xl px-4 py-3" role="alert">{error}</p>}

      {/* ── Coverage: the named gap (checkpoint milestone 7). ── */}
      {coverage.length > 0 && (
        <div className={`rounded-2xl px-5 py-4 ${gaps.length > 0 ? 'bg-gold/10' : 'bg-white'}`}>
          <p className="font-body text-sm font-semibold text-ink mb-2">
            {gaps.length === 0
              ? 'Every country you are delivering to has a courier'
              : gaps.length === 1
                ? 'One country you are delivering to has no courier'
                : `${gaps.length} countries you are delivering to have no courier`}
          </p>
          <ul className="space-y-1.5">
            {coverage.map(c => (
              <li key={c.countryCode} className="font-body text-sm text-stone flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-ink">{c.countryCode}</span>
                <span>
                  {c.briefCount} {c.briefCount === 1 ? 'brief' : 'briefs'} ·{' '}
                  {c.activeCouriers === 0
                    ? 'no active courier'
                    : `${c.activeCouriers} active ${c.activeCouriers === 1 ? 'courier' : 'couriers'}`}
                </span>
                {c.activeCouriers === 0 && (
                  <button type="button" onClick={() => openAdd(c.countryCode)}
                    className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px]">
                    Add one for {c.countryCode}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="font-body text-xs text-stone/60 mt-2 leading-snug">
            Counted from confirmed briefs — where deliveries are actually going.
          </p>
        </div>
      )}

      {/* ── Empty: one obvious action, not just an absence (Doctrine §2.5). ── */}
      {couriers.length === 0 && !adding ? (
        <div className="bg-white rounded-2xl p-6 sm:p-8">
          <p className="font-body text-sm font-semibold text-ink mb-1">No couriers yet</p>
          <p className="font-body text-sm text-stone leading-relaxed mb-4">
            A courier carries the gift the last leg. You need one for each country you deliver to
            before carriage can be arranged for a moment there.
          </p>
          <button type="button" onClick={() => openAdd()}
            className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Add the first courier
          </button>
        </div>
      ) : null}

      {/* ── The form. Opening and cancelling write nothing. ── */}
      {(adding || editingId) && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <p className="font-body text-sm font-semibold text-ink">
            {editingId ? 'Edit courier' : 'Add a courier'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="c-name">Name</label>
              <input id="c-name" className={field} value={draft.name} placeholder="Swift Dispatch"
                aria-invalid={errors.name ? true : undefined}
                onChange={e => { setDraft(d => ({ ...d, name: e.target.value })); setError(null); }} />
              {errors.name && <p className="font-body text-xs text-ink mt-1.5">{errors.name}</p>}
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="c-country">
                Country they carry in
              </label>
              <input id="c-country" className={`${field} uppercase`} maxLength={2} value={draft.countryCode} placeholder="NG"
                aria-invalid={errors.countryCode ? true : undefined}
                onChange={e => { setDraft(d => ({ ...d, countryCode: e.target.value.toUpperCase() })); setError(null); }} />
              {errors.countryCode && <p className="font-body text-xs text-ink mt-1.5">{errors.countryCode}</p>}
            </div>
          </div>
          <p className="font-body text-xs text-stone/70 -mt-1 leading-snug">
            One country per entry. A courier working in two countries is two entries — this build
            routes by country and nothing finer.
          </p>

          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="c-whatsapp">
                  WhatsApp or phone
                </label>
                <input id="c-whatsapp" className={field} value={draft.whatsapp} placeholder="+234 801 234 5678"
                  onChange={e => { setDraft(d => ({ ...d, whatsapp: e.target.value })); setError(null); }} />
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="c-email">Email</label>
                <input id="c-email" className={field} value={draft.email} placeholder="dispatch@courier.example"
                  onChange={e => { setDraft(d => ({ ...d, email: e.target.value })); setError(null); }} />
              </div>
            </div>
            <p className="font-body text-xs text-stone/70 mt-1.5">
              One of the two is enough. Bookings are made by hand — usually over WhatsApp.
            </p>
            {errors.contact && <p className="font-body text-xs text-ink mt-1.5">{errors.contact}</p>}
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="c-note">
              Note <span className="text-stone/60 font-normal">(optional)</span>
            </label>
            <input id="c-note" className={field} value={draft.note} placeholder="Same-day within Lagos; collects before 3pm"
              onChange={e => { setDraft(d => ({ ...d, note: e.target.value })); setError(null); }} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSave}
              className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
              {editingId ? 'Save changes' : 'Save courier'}
            </button>
            <button type="button" onClick={closeForm}
              className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── The list ── */}
      {couriers.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {!adding && !editingId && (
              <button type="button" onClick={() => openAdd()}
                className="rounded-full bg-ink text-cream px-5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
                Add a courier
              </button>
            )}
            <label className="sr-only" htmlFor="c-filter">Filter couriers</label>
            <input id="c-filter" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Filter by name or country"
              className="flex-1 min-w-[200px] rounded-full border border-stone/20 bg-white px-4 min-h-[44px] font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow" />
          </div>

          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            {shown.length} of {couriers.length} shown · {activeCount} active
          </p>

          <ul className="space-y-3">
            {shown.map(courier => (
              <li key={courier.id}
                className={`rounded-2xl border p-4 sm:p-5 ${
                  courier.isActive ? 'border-stone/20 bg-white' : 'border-stone/15 bg-white/60'
                }`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-ink">
                      {courier.name}
                      {!courier.isActive && <span className="font-normal text-stone/60"> · deactivated</span>}
                    </p>
                    <p className="font-body text-xs text-stone mt-0.5">Carries in {courier.countryCode}</p>
                    <p className="font-body text-xs text-stone mt-1 break-words">
                      {[courier.whatsapp, courier.email].filter(Boolean).join(' · ')}
                    </p>
                    {courier.note && (
                      <p className="font-body text-xs text-stone/70 mt-1 break-words">{courier.note}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => openEdit(courier)}
                      className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px] px-2 whitespace-nowrap">
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleActive(courier)}
                      className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px] px-2 whitespace-nowrap">
                      {courier.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {shown.length === 0 && (
            <p className="font-body text-sm text-stone">
              Nothing matches “{query}”.{' '}
              <button type="button" onClick={() => setQuery('')}
                className="font-semibold text-ink hover:text-gold transition-colors underline underline-offset-2">
                Clear the filter
              </button>
            </p>
          )}

          <p className="font-body text-xs text-stone/60 leading-snug">
            Couriers are deactivated rather than removed — one who carried before has to stay
            readable on the record.
          </p>
        </>
      )}

      <Link href="/operations/moments"
        className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
        ← Back to moments
      </Link>
    </div>
  );
}
