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
 * The one email-shape rule, shared by the form, the write boundary and
 * structural read validation.
 *
 * Exported because it was previously applied in only two of those three places:
 * a malformed address that reached storage another way still read as valid,
 * which made the boundary check look stronger than it was.
 */
export function isVendorEmailShape(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_SHAPE.test(value.trim());
}

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

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * A canonical ISO instant — **exactly** what `Date.prototype.toISOString()`
 * emits, and nothing else: `YYYY-MM-DDTHH:mm:ss.sssZ`.
 *
 * The pattern alone is not enough, and neither is `Date.parse`. Both are far
 * more permissive than they look:
 *
 * - `Date.parse` accepts `"2026"`, `"August 1 2026"` and locale strings.
 * - It **normalizes impossible calendar dates rather than refusing them**:
 *   `2026-02-30T00:00:00.000Z` parses happily and becomes 2 March, and
 *   `2026-02-29` becomes 1 March because 2026 is not a leap year.
 *
 * So the test is a **round trip**: parse it, re-serialize it, and require the
 * result to equal the input byte for byte. A date the runtime silently moved is
 * not the date anybody wrote down, and a record whose timestamp cannot be
 * compared byte-for-byte across builds is not evidence.
 *
 * Milliseconds are **required** at exactly three digits, because that is what
 * `toISOString()` produces — accepting `.1`, `.12` or no fraction at all would
 * admit values this system never emits and cannot compare by equality.
 *
 * Deliberately **no ordering rule** beyond this: `createdAt` and `updatedAt` are
 * validated for shape, not sequence, and `quotedAt` may precede `recordedAt`.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  // The round trip. Anything the runtime normalized comes back different.
  return parsed.toISOString() === value;
}

/**
 * Every field a `Vendor` is allowed to have. **Nothing else may be persisted.**
 *
 * This is the list that keeps H4.4 out of H3.4: a caller cannot smuggle in a
 * `reliabilityScore`, `rating`, `capacity`, `sla`, `onboardingStatus` or a price
 * list by handing the repository an object that happens to satisfy the
 * `Vendor` interface at compile time. TypeScript does not check excess
 * properties on a value that has already been widened, and it checks nothing at
 * all at runtime.
 */
export const VENDOR_KEYS = [
  'id', 'workspaceId', 'name', 'countryCode', 'city',
  'whatsapp', 'email', 'isActive', 'note', 'createdAt', 'updatedAt',
] as const;

export type CanonicalVendorResult = { ok: true; value: Vendor } | { ok: false; reason: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate an untrusted object and **rebuild** a Vendor from its allowed fields.
 *
 * Rebuilding rather than spreading is the point. Spreading an untrusted object
 * into persisted state means every future field anyone attaches to it survives
 * into the audit record; constructing a fresh object from a fixed field list
 * means nothing can arrive that this milestone did not declare.
 *
 * The same email shape the form applies is applied **here**, at the boundary, so
 * a caller that bypasses the form cannot store an address nobody could write to.
 */
export function canonicalVendor(input: unknown, workspaceId: string): CanonicalVendorResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'That vendor is not a record. Nothing was saved.' };
  }
  const raw = input as Record<string, unknown>;

  const allowed = new Set<string>(VENDOR_KEYS);
  const extra = Object.keys(raw).filter(k => !allowed.has(k));
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `A vendor cannot carry ${extra.join(', ')}. The directory records who a vendor is and how to reach them, nothing more. Nothing was saved.`,
    };
  }

  for (const field of ['id', 'name', 'countryCode', 'city'] as const) {
    if (!nonEmpty(raw[field])) {
      return { ok: false, reason: `That vendor is missing a ${field}. Nothing was saved.` };
    }
  }
  if (raw.workspaceId !== workspaceId) {
    return { ok: false, reason: 'That vendor belongs to a different workspace. Nothing was saved.' };
  }
  if (!/^[A-Z]{2}$/.test(raw.countryCode as string)) {
    return { ok: false, reason: 'That vendor has an invalid country code. Nothing was saved.' };
  }
  if (typeof raw.isActive !== 'boolean') {
    return { ok: false, reason: 'That vendor has no active state. Nothing was saved.' };
  }

  // Present-but-wrong is refused; absent is fine. `undefined` is treated as
  // absent so an explicitly-cleared optional field behaves like an omitted one.
  for (const field of ['whatsapp', 'email', 'note'] as const) {
    if (raw[field] === undefined) continue;
    if (!nonEmpty(raw[field])) {
      return { ok: false, reason: `That vendor's ${field} is not usable text. Nothing was saved.` };
    }
  }
  if (raw.email !== undefined && !EMAIL_SHAPE.test((raw.email as string).trim())) {
    return { ok: false, reason: 'That email address does not look right. Nothing was saved.' };
  }
  if (raw.whatsapp === undefined && raw.email === undefined) {
    return { ok: false, reason: 'That vendor has no way of being contacted. Nothing was saved.' };
  }

  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!isIsoInstant(raw[field])) {
      return { ok: false, reason: `That vendor's ${field} is not a readable timestamp. Nothing was saved.` };
    }
  }

  // Rebuilt from the allowed fields alone — nothing untrusted survives.
  return {
    ok: true,
    value: {
      id: (raw.id as string).trim(),
      workspaceId,
      name: (raw.name as string).trim(),
      countryCode: raw.countryCode as string,
      city: (raw.city as string).trim(),
      ...(raw.whatsapp !== undefined ? { whatsapp: (raw.whatsapp as string).trim() } : {}),
      ...(raw.email !== undefined ? { email: (raw.email as string).trim() } : {}),
      isActive: raw.isActive,
      ...(raw.note !== undefined ? { note: (raw.note as string).trim() } : {}),
      createdAt: raw.createdAt as string,
      updatedAt: raw.updatedAt as string,
    },
  };
}
