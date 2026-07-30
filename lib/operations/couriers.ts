/**
 * The courier directory — H3.5, checkpoint milestone 7.
 *
 * **A list an operator maintains by hand, scoped per country.** That scoping is
 * the whole milestone: the checkpoint asks for "a courier list *per country*",
 * and selection offers only the couriers who serve where a brief is actually
 * going.
 *
 * ⚠️ Checkpoint milestone 7 excludes **rate APIs, tracking integration and
 * optimization** in terms. So: no rate cards, no tracking numbers, no API
 * credentials, no service levels, no zones, no transit-time models, no scoring
 * and no automatic routing. Courier *intelligence* — like vendor intelligence —
 * has to be built from recorded outcomes, and this is where the recording
 * starts.
 *
 * Pure and framework-free. Nothing here reads or writes storage.
 *
 * Shares `canonicalVendor`'s hard-won rules by reusing the same predicates:
 * `isIsoInstant` and `isVendorEmailShape` are imported rather than re-derived,
 * because H3.4-D1 and H3.4-D2 established both the hard way.
 */

import type { Courier, CourierSnapshot } from './types';
import { isIsoInstant, isVendorEmailShape } from './vendors';

// ─── Drafts and validation ───────────────────────────────────────────────────

/** What the form holds. Strings throughout — it is a form. */
export interface CourierDraft {
  name: string;
  countryCode: string;
  whatsapp: string;
  email: string;
  note: string;
}

export const EMPTY_COURIER_DRAFT: CourierDraft = {
  name: '', countryCode: '', whatsapp: '', email: '', note: '',
};

export interface CourierValidationErrors {
  name?: string;
  countryCode?: string;
  contact?: string;
}

export type CourierDraftResult =
  | { ok: true; value: NormalizedCourierDraft }
  | { ok: false; errors: CourierValidationErrors };

export interface NormalizedCourierDraft {
  name: string;
  countryCode: string;
  whatsapp?: string;
  email?: string;
  note?: string;
}

/**
 * Check a draft and normalize it.
 *
 * **The country is required and is not optional-by-omission**, unlike a vendor's
 * city: a courier row exists to answer "who can carry this in NG?", and a row
 * that cannot answer it is not usable. At least one contact method is required
 * for the same reason it is on a Vendor — a courier nobody can reach cannot be
 * booked.
 *
 * No qualification, contracting or onboarding check. Partner onboarding is
 * unresolved **U5** and belongs before the pilot.
 */
export function validateCourierDraft(draft: CourierDraft): CourierDraftResult {
  const errors: CourierValidationErrors = {};

  const name = draft.name.trim();
  const countryCode = draft.countryCode.trim().toUpperCase();
  const whatsapp = draft.whatsapp.trim();
  const email = draft.email.trim();
  const note = draft.note.trim();

  if (name.length === 0) errors.name = 'Give the courier a name.';
  if (countryCode.length === 0) {
    errors.countryCode = 'Which country do they carry in?';
  } else if (!/^[A-Z]{2}$/.test(countryCode)) {
    errors.countryCode = 'Use the two-letter country code — NG, KE, GH.';
  }

  if (whatsapp.length === 0 && email.length === 0) {
    errors.contact = 'Add a WhatsApp number or an email — otherwise nobody can book them.';
  } else if (email.length > 0 && !isVendorEmailShape(email)) {
    errors.contact = 'That email address does not look right.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name, countryCode,
      ...(whatsapp.length > 0 ? { whatsapp } : {}),
      ...(email.length > 0 ? { email } : {}),
      ...(note.length > 0 ? { note } : {}),
    },
  };
}

// ─── Building ────────────────────────────────────────────────────────────────

export function buildCourier(
  draft: NormalizedCourierDraft, id: string, workspaceId: string, now: string,
): Courier {
  return { id, workspaceId, ...draft, isActive: true, createdAt: now, updatedAt: now };
}

/** Identity, ownership, creation time and active state are carried, never taken. */
export function applyCourierEdit(existing: Courier, draft: NormalizedCourierDraft, now: string): Courier {
  return {
    id: existing.id,
    workspaceId: existing.workspaceId,
    isActive: existing.isActive,
    createdAt: existing.createdAt,
    ...draft,
    updatedAt: now,
  };
}

export function courierToDraft(courier: Courier): CourierDraft {
  return {
    name: courier.name,
    countryCode: courier.countryCode,
    whatsapp: courier.whatsapp ?? '',
    email: courier.email ?? '',
    note: courier.note ?? '',
  };
}

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Every field a `Courier` is allowed to have. **Nothing else may be persisted.**
 *
 * The same list-and-rebuild discipline H3.4-D1 established for vendors, applied
 * from the first line here rather than retrofitted: a caller must not be able to
 * attach a rate card, a service level, a tracking integration or a score by
 * handing the repository an object that satisfies the interface at compile time.
 */
export const COURIER_KEYS = [
  'id', 'workspaceId', 'name', 'countryCode',
  'whatsapp', 'email', 'isActive', 'note', 'createdAt', 'updatedAt',
] as const;

export type CanonicalCourierResult = { ok: true; value: Courier } | { ok: false; reason: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate an untrusted object and **rebuild** a Courier from its allowed fields. */
export function canonicalCourier(input: unknown, workspaceId: string): CanonicalCourierResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'That courier is not a record. Nothing was saved.' };
  }
  const raw = input as Record<string, unknown>;

  const allowed = new Set<string>(COURIER_KEYS);
  const extra = Object.keys(raw).filter(k => !allowed.has(k));
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `A courier cannot carry ${extra.join(', ')}. The directory records who carries where, and how to reach them, nothing more. Nothing was saved.`,
    };
  }

  for (const field of ['id', 'name', 'countryCode'] as const) {
    if (!nonEmpty(raw[field])) {
      return { ok: false, reason: `That courier is missing a ${field}. Nothing was saved.` };
    }
  }
  if (raw.workspaceId !== workspaceId) {
    return { ok: false, reason: 'That courier belongs to a different workspace. Nothing was saved.' };
  }
  if (!/^[A-Z]{2}$/.test(raw.countryCode as string)) {
    return { ok: false, reason: 'That courier has an invalid country code. Nothing was saved.' };
  }
  if (typeof raw.isActive !== 'boolean') {
    return { ok: false, reason: 'That courier has no active state. Nothing was saved.' };
  }

  for (const field of ['whatsapp', 'email', 'note'] as const) {
    if (raw[field] === undefined) continue;
    if (!nonEmpty(raw[field])) {
      return { ok: false, reason: `That courier's ${field} is not usable text. Nothing was saved.` };
    }
  }
  if (raw.email !== undefined && !isVendorEmailShape(raw.email)) {
    return { ok: false, reason: 'That email address does not look right. Nothing was saved.' };
  }
  if (raw.whatsapp === undefined && raw.email === undefined) {
    return { ok: false, reason: 'That courier has no way of being reached. Nothing was saved.' };
  }

  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!isIsoInstant(raw[field])) {
      return { ok: false, reason: `That courier's ${field} is not a readable timestamp. Nothing was saved.` };
    }
  }

  return {
    ok: true,
    value: {
      id: (raw.id as string).trim(),
      workspaceId,
      name: (raw.name as string).trim(),
      countryCode: raw.countryCode as string,
      ...(raw.whatsapp !== undefined ? { whatsapp: (raw.whatsapp as string).trim() } : {}),
      ...(raw.email !== undefined ? { email: (raw.email as string).trim() } : {}),
      isActive: raw.isActive,
      ...(raw.note !== undefined ? { note: (raw.note as string).trim() } : {}),
      createdAt: raw.createdAt as string,
      updatedAt: raw.updatedAt as string,
    },
  };
}

// ─── Snapshots and reading ───────────────────────────────────────────────────

/** Copied, never referenced — renaming a courier must not rewrite past selections. */
export function snapshotCourier(courier: Courier): CourierSnapshot {
  return { courierId: courier.id, name: courier.name, countryCode: courier.countryCode };
}

export const COURIER_SNAPSHOT_KEYS = ['courierId', 'name', 'countryCode'] as const;

export function sameCourierSnapshot(a: unknown, b: CourierSnapshot): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const s = a as Partial<CourierSnapshot>;
  return s.courierId === b.courierId && s.name === b.name && s.countryCode === b.countryCode;
}

/**
 * Exactly three keys, matching the live record's declared projection.
 *
 * H3.4-D2's lesson applied from the start: an extra key *inside* an allowed
 * object survives every value comparison when it is copied consistently, so the
 * shape has to be checked, not just the values.
 */
export function exactCourierSnapshot(value: unknown, expected: CourierSnapshot): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const permitted = new Set<string>(COURIER_SNAPSHOT_KEYS);
  if (Object.keys(value as Record<string, unknown>).some(k => !permitted.has(k))) return false;
  return sameCourierSnapshot(value, expected);
}

/** Deterministic display order: name, then id. An ordering, **not a ranking**. */
export function sortCouriers(couriers: readonly Courier[]): Courier[] {
  return [...couriers].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * The couriers who can actually carry this one — **active, and serving this
 * country**. The complete alternative set for a Decision, in a stable order.
 */
export function couriersFor(couriers: readonly Courier[], countryCode: string): Courier[] {
  return sortCouriers(couriers.filter(c => c.isActive && c.countryCode === countryCode));
}

/** Name or country. Component state only — filtering writes nothing. */
export function filterCouriers(couriers: readonly Courier[], query: string): Courier[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...couriers];
  return couriers.filter(c =>
    c.name.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q),
  );
}

// ─── Coverage ────────────────────────────────────────────────────────────────

/** One country Aniyé is delivering to, and whether anyone can carry there. */
export interface CourierCoverage {
  countryCode: string;
  /** How many confirmed briefs are heading there. Evidence, not a forecast. */
  briefCount: number;
  activeCouriers: number;
}

/**
 * Where deliveries are going, and where nobody can carry them.
 *
 * This is checkpoint milestone 7's completion test — *"a courier is selectable
 * for every operating country, or the gap is named"* — made answerable.
 *
 * ⚠️ **Coverage is measured against confirmed briefs, not
 * `WorkspaceState.operatingCountries`, and that is deliberate.** Operating
 * countries are free-text names captured in the assessment (`"Nigeria"`), while
 * every delivery country in Operations is ISO 3166-1 alpha-2 (`"NG"`), and **no
 * name-to-code mapping exists anywhere in this repository**. Inventing one would
 * mean guessing at spellings, languages and disputed names in order to answer a
 * question the briefs already answer exactly.
 *
 * Confirmed briefs are also the better evidence: a country the organization
 * *says* it operates in but has never shipped to needs no courier yet, and a
 * country it ships to *must* have one whether or not anyone listed it.
 */
export function courierCoverage(
  deliveryCountries: readonly string[],
  couriers: readonly Courier[],
): CourierCoverage[] {
  const counts = new Map<string, number>();
  for (const code of deliveryCountries) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([countryCode, briefCount]) => ({
      countryCode,
      briefCount,
      activeCouriers: couriers.filter(c => c.isActive && c.countryCode === countryCode).length,
    }))
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

/** The countries with deliveries and nobody to carry them. The named gap. */
export function coverageGaps(coverage: readonly CourierCoverage[]): CourierCoverage[] {
  return coverage.filter(c => c.activeCouriers === 0);
}
