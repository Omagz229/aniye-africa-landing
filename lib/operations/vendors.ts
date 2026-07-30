/**
 * The vendor directory — H3.4, checkpoint milestone 6.
 *
 * **A list an operator maintains by hand.** No portal, no accounts, no
 * automated quote requests, no APIs. The checkpoint is explicit that item,
 * vendor and courier selection need *an operator, a list and a text field* —
 * intelligence built before operational evidence exists is invention, and this
 * milestone is where the evidence starts being recorded.
 *
 * Pure and framework-free. Nothing here reads or writes storage, which is what
 * makes "opening and cancelling a form writes nothing" enforceable rather than
 * merely stated.
 *
 * ⚠️ **Ordinary directory maintenance is not a Moment Decision and not an
 * OperationalEvent.** Adding a vendor changes no Moment's execution, so by
 * ADR-006's own test it is configuration-shaped work, not a judgement about a
 * job. The Decision arrives when a vendor is *chosen* for a Moment.
 */

import type { Vendor, VendorSnapshot } from './types';

// ─── Drafts and validation ───────────────────────────────────────────────────

/** What the form holds. Strings throughout — it is a form. */
export interface VendorDraft {
  name: string;
  countryCode: string;
  city: string;
  whatsapp: string;
  email: string;
  note: string;
}

export const EMPTY_VENDOR_DRAFT: VendorDraft = {
  name: '', countryCode: '', city: '', whatsapp: '', email: '', note: '',
};

/** Field-level, so the form can point at the input that is wrong. */
export type VendorFieldError = 'name' | 'countryCode' | 'city' | 'contact';

export interface VendorValidationErrors {
  name?: string;
  countryCode?: string;
  city?: string;
  contact?: string;
}

export type VendorDraftResult =
  | { ok: true; value: NormalizedVendorDraft }
  | { ok: false; errors: VendorValidationErrors };

export interface NormalizedVendorDraft {
  name: string;
  countryCode: string;
  city: string;
  whatsapp?: string;
  email?: string;
  note?: string;
}

/** Deliberately permissive: any address-shaped string. Nothing is sent to it. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check a draft and normalize it.
 *
 * **At least one contact method is required** — a vendor nobody can reach
 * cannot be quoted, so a record without a route to them is not a useful row.
 * Which one is up to the operator; in practice it is usually WhatsApp.
 *
 * There is deliberately no qualification, contracting, threshold or approval
 * check here. Partner onboarding is unresolved **U5** and belongs before the
 * pilot; a directory an operator types into needs none of it.
 */
export function validateVendorDraft(draft: VendorDraft): VendorDraftResult {
  const errors: VendorValidationErrors = {};

  const name = draft.name.trim();
  const countryCode = draft.countryCode.trim().toUpperCase();
  const city = draft.city.trim();
  const whatsapp = draft.whatsapp.trim();
  const email = draft.email.trim();
  const note = draft.note.trim();

  if (name.length === 0) errors.name = 'Give the vendor a name.';
  if (countryCode.length === 0) {
    errors.countryCode = 'Which country are they in?';
  } else if (!/^[A-Z]{2}$/.test(countryCode)) {
    errors.countryCode = 'Use the two-letter country code — NG, KE, GH.';
  }
  if (city.length === 0) errors.city = 'Which city?';

  if (whatsapp.length === 0 && email.length === 0) {
    errors.contact = 'Add a WhatsApp number or an email — otherwise nobody can reach them for a quote.';
  } else if (email.length > 0 && !EMAIL_SHAPE.test(email)) {
    errors.contact = 'That email address does not look right.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name, countryCode, city,
      ...(whatsapp.length > 0 ? { whatsapp } : {}),
      ...(email.length > 0 ? { email } : {}),
      ...(note.length > 0 ? { note } : {}),
    },
  };
}

// ─── Building ────────────────────────────────────────────────────────────────

export function buildVendor(draft: NormalizedVendorDraft, id: string, workspaceId: string, now: string): Vendor {
  return { id, workspaceId, ...draft, isActive: true, createdAt: now, updatedAt: now };
}

/**
 * Apply an edit.
 *
 * `id`, `workspaceId`, `createdAt` and `isActive` are carried through rather
 * than taken from the draft — an edit form must not be able to reassign a
 * vendor to another workspace, resurrect a deactivated one, or rewrite when it
 * was added. Optional fields are rebuilt from the draft, so clearing a note or
 * an email actually clears it.
 */
export function applyVendorEdit(existing: Vendor, draft: NormalizedVendorDraft, now: string): Vendor {
  return {
    id: existing.id,
    workspaceId: existing.workspaceId,
    isActive: existing.isActive,
    createdAt: existing.createdAt,
    ...draft,
    updatedAt: now,
  };
}

export function vendorToDraft(vendor: Vendor): VendorDraft {
  return {
    name: vendor.name,
    countryCode: vendor.countryCode,
    city: vendor.city,
    whatsapp: vendor.whatsapp ?? '',
    email: vendor.email ?? '',
    note: vendor.note ?? '',
  };
}

// ─── Snapshots and reading ───────────────────────────────────────────────────

/**
 * What a confirmed offer keeps about a vendor.
 *
 * **A copy, not a reference.** Renaming a vendor, moving them to another city
 * or deactivating them must never rewrite a comparison an operator made months
 * ago — the same rule the address, policy and item snapshots follow.
 */
export function snapshotVendor(vendor: Vendor): VendorSnapshot {
  return {
    vendorId: vendor.id,
    name: vendor.name,
    countryCode: vendor.countryCode,
    city: vendor.city,
  };
}

/** Do two snapshots describe the same vendor record, field for field? */
export function sameVendorSnapshot(a: unknown, b: VendorSnapshot): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const s = a as Partial<VendorSnapshot>;
  return s.vendorId === b.vendorId && s.name === b.name && s.countryCode === b.countryCode && s.city === b.city;
}

/**
 * Deterministic display order: name, then id.
 *
 * An ordering, **not a ranking**. There is no preferred vendor, no score and no
 * recommendation in H3.4 — sorting alphabetically is the least suggestive
 * arrangement available, and it is stable.
 */
export function sortVendors(vendors: readonly Vendor[]): Vendor[] {
  return [...vendors].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function activeVendors(vendors: readonly Vendor[]): Vendor[] {
  return sortVendors(vendors.filter(v => v.isActive));
}

/** Name, city or country. Component state only — filtering writes nothing. */
export function filterVendors(vendors: readonly Vendor[], query: string): Vendor[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...vendors];
  return vendors.filter(v =>
    v.name.toLowerCase().includes(q) ||
    v.city.toLowerCase().includes(q) ||
    v.countryCode.toLowerCase().includes(q),
  );
}
