'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Vendor } from '@/lib/operations/types';
import {
  EMPTY_VENDOR_DRAFT,
  applyVendorEdit,
  buildVendor,
  filterVendors,
  sortVendors,
  validateVendorDraft,
  vendorToDraft,
} from '@/lib/operations/vendors';
import type { VendorDraft, VendorValidationErrors } from '@/lib/operations/vendors';

/**
 * The vendor directory — H3.4.
 *
 * A list an operator maintains by hand. **Opening the form, typing in it,
 * filtering the list and cancelling all write nothing**; only Save writes, and
 * it writes once.
 *
 * There is no delete. A vendor who quoted last quarter has to stay resolvable
 * from the offers that name them, so the reversible action is *deactivate*.
 */

type Phase = 'loading' | 'failed' | 'ready';

const field =
  'w-full min-h-[44px] rounded-lg border border-stone/20 bg-white px-3 py-3 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

export default function VendorDirectory() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // ── Draft state. UI only; none of it is persisted until Save. ──
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<VendorDraft>({ ...EMPTY_VENDOR_DRAFT });
  const [errors, setErrors] = useState<VendorValidationErrors>({});
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

    const list = repo.listVendors(ws.organizationId);
    if (!list.ok) {
      // A failed read is never rendered as an empty directory.
      setFailure({ message: 'The vendor directory could not be read.', detail: list.reason });
      setPhase('failed');
      return;
    }
    setVendors(sortVendors(list.value));
    setPhase('ready');
  }

  function openAdd() {
    setAdding(true);
    setEditingId(null);
    setDraft({ ...EMPTY_VENDOR_DRAFT });
    setErrors({});
    setError(null);
    setSaved(null);
  }

  function openEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setAdding(false);
    setDraft(vendorToDraft(vendor));
    setErrors({});
    setError(null);
    setSaved(null);
  }

  function closeForm() {
    setAdding(false);
    setEditingId(null);
    setDraft({ ...EMPTY_VENDOR_DRAFT });
    setErrors({});
    setError(null);
  }

  function handleSave() {
    if (!workspaceId) return;
    const repo = browserOperationsRepository();
    if (!repo) return;

    const checked = validateVendorDraft(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});

    const now = new Date().toISOString();
    const written = editingId
      ? (() => {
          const existing = vendors.find(v => v.id === editingId);
          if (!existing) return { ok: false as const, reason: 'That vendor is no longer in the directory.' };
          return repo.updateVendor(workspaceId, applyVendorEdit(existing, checked.value, now), now);
        })()
      : repo.createVendor(workspaceId, buildVendor(checked.value, `vendor-${crypto.randomUUID()}`, workspaceId, now), now);

    if (!written.ok) { setError(written.reason); return; }

    setSaved(`${checked.value.name} saved.`);
    closeForm();
    load();
  }

  function toggleActive(vendor: Vendor) {
    if (!workspaceId) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    const written = repo.setVendorActive(workspaceId, vendor.id, !vendor.isActive, new Date().toISOString());
    if (!written.ok) { setError(written.reason); return; }
    setSaved(vendor.isActive ? `${vendor.name} deactivated.` : `${vendor.name} reactivated.`);
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
            Nothing has been changed. Until this loads, this screen cannot say whether any vendors exist.
          </p>
          <button type="button" onClick={() => { setFailure(null); setPhase('loading'); load(); }}
            className="mt-4 rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const shown = filterVendors(vendors, query);
  const activeCount = vendors.filter(v => v.isActive).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Vendors</h2>
        <p className="font-body text-sm text-stone mt-1">
          People Aniyé can buy from. Kept by hand — nobody here has an account, and nothing is sent
          automatically.
        </p>
      </div>

      {saved && (
        <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3" role="status" aria-live="polite">
          {saved}
        </p>
      )}
      {error && (
        <p className="font-body text-sm text-ink bg-white rounded-xl px-4 py-3" role="alert">{error}</p>
      )}

      {/* ── Empty: one obvious action, not just an absence (Doctrine §2.5). ── */}
      {vendors.length === 0 && !adding ? (
        <div className="bg-white rounded-2xl p-6 sm:p-8">
          <p className="font-body text-sm font-semibold text-ink mb-1">No vendors yet</p>
          <p className="font-body text-sm text-stone leading-relaxed mb-4">
            A vendor is someone you can ask for a quote. You need at least one before you can compare
            offers for a moment.
          </p>
          <button type="button" onClick={openAdd}
            className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
            Add the first vendor
          </button>
        </div>
      ) : null}

      {/* ── The form. Opening and cancelling write nothing. ── */}
      {(adding || editingId) && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <p className="font-body text-sm font-semibold text-ink">
            {editingId ? 'Edit vendor' : 'Add a vendor'}
          </p>

          <div>
            <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="v-name">Name</label>
            <input id="v-name" className={field} value={draft.name} placeholder="Lagos Gift Company"
              aria-invalid={errors.name ? true : undefined}
              onChange={e => { setDraft(d => ({ ...d, name: e.target.value })); setError(null); }} />
            {errors.name && <p className="font-body text-xs text-ink mt-1.5">{errors.name}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="v-country">Country</label>
              <input id="v-country" className={`${field} uppercase`} maxLength={2} value={draft.countryCode} placeholder="NG"
                aria-invalid={errors.countryCode ? true : undefined}
                onChange={e => { setDraft(d => ({ ...d, countryCode: e.target.value.toUpperCase() })); setError(null); }} />
              {errors.countryCode && <p className="font-body text-xs text-ink mt-1.5">{errors.countryCode}</p>}
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="v-city">City</label>
              <input id="v-city" className={field} value={draft.city} placeholder="Lagos"
                aria-invalid={errors.city ? true : undefined}
                onChange={e => { setDraft(d => ({ ...d, city: e.target.value })); setError(null); }} />
              {errors.city && <p className="font-body text-xs text-ink mt-1.5">{errors.city}</p>}
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="v-whatsapp">
                  WhatsApp or phone
                </label>
                <input id="v-whatsapp" className={field} value={draft.whatsapp} placeholder="+234 801 234 5678"
                  onChange={e => { setDraft(d => ({ ...d, whatsapp: e.target.value })); setError(null); }} />
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="v-email">Email</label>
                <input id="v-email" className={field} value={draft.email} placeholder="orders@vendor.example"
                  onChange={e => { setDraft(d => ({ ...d, email: e.target.value })); setError(null); }} />
              </div>
            </div>
            <p className="font-body text-xs text-stone/70 mt-1.5">
              One of the two is enough. Quotes are collected by hand — usually over WhatsApp.
            </p>
            {errors.contact && <p className="font-body text-xs text-ink mt-1.5">{errors.contact}</p>}
          </div>

          <div>
            <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="v-note">
              Note <span className="text-stone/60 font-normal">(optional)</span>
            </label>
            <input id="v-note" className={field} value={draft.note} placeholder="Handles same-day within Lagos"
              onChange={e => { setDraft(d => ({ ...d, note: e.target.value })); setError(null); }} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSave}
              className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
              {editingId ? 'Save changes' : 'Save vendor'}
            </button>
            <button type="button" onClick={closeForm}
              className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── The list ── */}
      {vendors.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {!adding && !editingId && (
              <button type="button" onClick={openAdd}
                className="rounded-full bg-ink text-cream px-5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors min-h-[44px]">
                Add a vendor
              </button>
            )}
            <label className="sr-only" htmlFor="v-filter">Filter vendors</label>
            <input id="v-filter" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Filter by name, city or country"
              className="flex-1 min-w-[200px] rounded-full border border-stone/20 bg-white px-4 min-h-[44px] font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow" />
          </div>

          <p className="font-body text-sm text-stone" role="status" aria-live="polite">
            {shown.length} of {vendors.length} shown · {activeCount} active
          </p>

          <ul className="space-y-3">
            {shown.map(vendor => (
              <li key={vendor.id}
                className={`rounded-2xl border p-4 sm:p-5 ${
                  vendor.isActive ? 'border-stone/20 bg-white' : 'border-stone/15 bg-white/60'
                }`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold text-ink">
                      {vendor.name}
                      {!vendor.isActive && (
                        <span className="font-normal text-stone/60"> · deactivated</span>
                      )}
                    </p>
                    <p className="font-body text-xs text-stone mt-0.5">
                      {vendor.city}, {vendor.countryCode}
                    </p>
                    <p className="font-body text-xs text-stone mt-1 break-words">
                      {[vendor.whatsapp, vendor.email].filter(Boolean).join(' · ')}
                    </p>
                    {vendor.note && (
                      <p className="font-body text-xs text-stone/70 mt-1 break-words">{vendor.note}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => openEdit(vendor)}
                      className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px] px-2 whitespace-nowrap">
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleActive(vendor)}
                      className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px] px-2 whitespace-nowrap">
                      {vendor.isActive ? 'Deactivate' : 'Reactivate'}
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
            Vendors are deactivated rather than removed — a vendor who quoted before has to stay
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
