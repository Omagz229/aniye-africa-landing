/**
 * People and People Sources — H2.5.
 *
 * Normalization, source precedence, duplicate identity, CSV import planning,
 * and derived member counts. Pure and framework-free, like lib/assignments.ts:
 * no storage, no React, a value returned for every outcome including failure.
 *
 * The design principle running through this file is that an import must never
 * lose information it cannot recover. Every rule that could discard data —
 * duplicate handling, class resolution, field merging — is biased towards
 * reporting the problem and keeping what exists.
 */

import { COUNTRY_CODE_PATTERN } from './migrations';
import type {
  PeopleSource,
  PeopleSourceType,
  Person,
  RelationshipClass,
  RelationshipType,
} from './workspace';
import { matchHeaders, parseCsv, toCsv } from './csv';

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * The duplicate-identity key: trimmed and lowercased.
 *
 * Deliberately *not* doing anything cleverer — no plus-address stripping, no
 * provider-specific dot folding. Those are heuristics, and treating two
 * genuinely different addresses as one person is a worse failure than leaving
 * a duplicate for an operator to resolve.
 */
export function normalizeEmail(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const normalized = raw.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_SHAPE.test(email);
}

export function normalizePhone(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const normalized = raw.trim().replace(/\s+/g, ' ');
  return normalized === '' ? undefined : normalized;
}

/** Digits only — used for the advisory phone-match warning, never for merging. */
export function phoneDigits(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits : undefined;
}

export type NormalizeResult = { ok: true; value: string | undefined } | { ok: false; reason: string };

export function normalizeCountry(raw: string | undefined | null): NormalizeResult {
  if (raw === undefined || raw === null || raw.trim() === '') return { ok: true, value: undefined };
  const normalized = raw.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(normalized)) {
    return { ok: false, reason: `"${raw.trim()}" is not a two-letter country code (e.g. NG, KE, ZA).` };
  }
  return { ok: true, value: normalized };
}

/**
 * Birthdays are stored as MM-DD. The year is not required, and is dropped when
 * supplied — an organization rarely knows it, and storing a partial one invites
 * age inference nobody asked for.
 */
export function normalizeBirthday(raw: string | undefined | null): NormalizeResult {
  if (raw === undefined || raw === null || raw.trim() === '') return { ok: true, value: undefined };
  const input = raw.trim().replace(/\//g, '-');

  let month: number;
  let day: number;

  const withYear = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const withoutYear = /^(\d{1,2})-(\d{1,2})$/.exec(input);

  if (withYear) {
    month = Number(withYear[2]);
    day = Number(withYear[3]);
  } else if (withoutYear) {
    month = Number(withoutYear[1]);
    day = Number(withoutYear[2]);
  } else {
    return { ok: false, reason: `"${raw.trim()}" is not a recognizable birthday. Use MM-DD or YYYY-MM-DD.` };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: `"${raw.trim()}" is not a valid date.` };
  }

  return { ok: true, value: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

export function normalizeStartDate(raw: string | undefined | null): NormalizeResult {
  if (raw === undefined || raw === null || raw.trim() === '') return { ok: true, value: undefined };
  const input = raw.trim().replace(/\//g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  if (!match) {
    return { ok: false, reason: `"${raw.trim()}" is not a recognizable date. Use YYYY-MM-DD.` };
  }
  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(iso)) {
    return { ok: false, reason: `"${raw.trim()}" is not a valid date.` };
  }
  return { ok: true, value: iso };
}

// ─── Source precedence ───────────────────────────────────────────────────────

/**
 * Canonical precedence: **HRIS > CSV > Manual.**
 *
 * The reasoning is authority, not recency. An HRIS is the system of record for
 * employment facts; a CSV is a deliberate bulk statement; a manual entry is one
 * person typing. A higher-priority source may correct a lower one, never the
 * reverse.
 *
 * Precedence only ever decides *which record wins a collision*. It never
 * deletes anything — see `resolveDuplicate`.
 */
export const SOURCE_PRIORITY: Record<PeopleSourceType, number> = {
  Manual: 0,
  CSV: 1,
  HRIS: 2,
};

export function sourcePriority(type: PeopleSourceType): number {
  return SOURCE_PRIORITY[type];
}

export type DuplicateOutcome = 'create' | 'update' | 'retain-existing';

export interface DuplicateDecision {
  outcome: DuplicateOutcome;
  existing?: Person;
  reason: string;
}

/**
 * Decide what to do about an incoming record whose email already exists.
 *
 * A record with no usable email is never matched automatically — there is no
 * key to match on, and guessing at identity from a name is how directories get
 * silently corrupted.
 */
export function resolveDuplicate(
  incomingEmail: string | undefined,
  incomingSourceType: PeopleSourceType,
  existingPeople: Person[],
): DuplicateDecision {
  if (incomingEmail === undefined) {
    return {
      outcome: 'create',
      reason: 'No email supplied, so this record cannot be matched automatically. Added as a new person.',
    };
  }

  const existing = findPersonByEmail(incomingEmail, existingPeople);
  if (!existing) return { outcome: 'create', reason: 'New record.' };

  const incomingPriority = sourcePriority(incomingSourceType);
  const existingPriority = sourcePriority(existing.sourceType);

  if (incomingPriority > existingPriority) {
    return {
      outcome: 'update',
      existing,
      reason: `Existing ${existing.sourceType} record updated: ${incomingSourceType} takes precedence over ${existing.sourceType}.`,
    };
  }

  if (incomingPriority < existingPriority) {
    return {
      outcome: 'retain-existing',
      existing,
      reason: `Existing record kept: it came from ${existing.sourceType}, which takes precedence over ${incomingSourceType}.`,
    };
  }

  return {
    outcome: 'retain-existing',
    existing,
    reason: `Existing record kept: both came from ${existing.sourceType}, so this needs review rather than an automatic overwrite.`,
  };
}

export function findPersonByEmail(
  email: string | undefined,
  people: Person[],
  excludePersonId?: string,
): Person | undefined {
  if (email === undefined) return undefined;
  const key = normalizeEmail(email);
  if (key === undefined) return undefined;
  return people.find(p => p.id !== excludePersonId && normalizeEmail(p.email) === key);
}

/**
 * Advisory only. A phone match is surfaced as a warning and never merges
 * records — numbers are shared, reassigned, and mistyped far too often to be
 * treated as identity.
 */
export function findPhoneMatches(
  phone: string | undefined,
  people: Person[],
  excludePersonId?: string,
): Person[] {
  const digits = phoneDigits(phone);
  if (digits === undefined) return [];
  return people.filter(p => p.id !== excludePersonId && phoneDigits(p.phone) === digits);
}

// ─── Merging under precedence ────────────────────────────────────────────────

export interface PersonDraft {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: string;
  country?: string;
  startDate?: string;
  birthday?: string;
  externalId?: string;
  relationshipClassIds: string[];
  /** True when the incoming record actually carried class information. */
  providedClass: boolean;
}

/**
 * Apply a higher-priority incoming record onto an existing Person.
 *
 * Rules, all in the direction of preservation:
 *   - the existing `id` and `createdAt` survive; this is an update, not a swap
 *   - a field the incoming record did not supply keeps its existing value —
 *     absence is not an instruction to erase
 *   - class assignments survive unless the incoming record explicitly carried
 *     replacements
 *   - `status` and `archivedAt` survive; an import must not silently resurrect
 *     someone an operator archived
 *   - provenance moves to the new source
 *
 * Field-level provenance — remembering *which* source last set each individual
 * field — is deliberately out of scope for H2.5.
 */
export function mergePersonFromImport(
  existing: Person,
  draft: PersonDraft,
  source: PeopleSource,
  now: string,
): Person {
  return {
    ...existing,
    firstName: draft.firstName || existing.firstName,
    lastName: draft.lastName || existing.lastName,
    email: draft.email ?? existing.email,
    phone: draft.phone ?? existing.phone,
    role: draft.role ?? existing.role,
    country: draft.country ?? existing.country,
    startDate: draft.startDate ?? existing.startDate,
    birthday: draft.birthday ?? existing.birthday,
    externalId: draft.externalId ?? existing.externalId,
    relationshipClassIds: draft.providedClass
      ? [...draft.relationshipClassIds]
      : [...existing.relationshipClassIds],
    sourceId: source.id,
    sourceType: source.type,
    updatedAt: now,
  };
}

export function createPersonFromDraft(
  draft: PersonDraft,
  source: PeopleSource,
  now: string,
  id: string,
): Person {
  return {
    id,
    firstName: draft.firstName,
    lastName: draft.lastName,
    email: draft.email,
    phone: draft.phone,
    role: draft.role,
    country: draft.country,
    startDate: draft.startDate,
    birthday: draft.birthday,
    externalId: draft.externalId,
    relationshipClassIds: [...draft.relationshipClassIds],
    sourceId: source.id,
    sourceType: source.type,
    status: 'Active',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── People Sources ──────────────────────────────────────────────────────────

export const MANUAL_SOURCE_NAME = 'Manually added';

/**
 * One Manual source per workspace, reused for every hand-entered person.
 * Creating a source per person would make provenance meaningless.
 */
export function ensureManualSource(
  sources: PeopleSource[],
  now: string,
  id: string,
): { sources: PeopleSource[]; source: PeopleSource } {
  const existing = sources.find(s => s.type === 'Manual' && s.status === 'Active');
  if (existing) return { sources, source: existing };

  const source: PeopleSource = {
    id,
    name: MANUAL_SOURCE_NAME,
    type: 'Manual',
    status: 'Active',
    createdAt: now,
    updatedAt: now,
  };
  return { sources: [...sources, source], source };
}

/** One CSV source per import — named from the file, not from any row. */
export function createCsvSource(filename: string, now: string, id: string): PeopleSource {
  const trimmed = filename.trim();
  const base = trimmed.replace(/\.csv$/i, '') || 'CSV import';
  return {
    id,
    name: base,
    type: 'CSV',
    status: 'Active',
    filename: trimmed || undefined,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Derived member counts (resolves the deferred C3 concern) ────────────────
//
// `memberCount` is never stored on RelationshipClass. Storing it would create a
// second source of truth that has to be kept in step with every person edit,
// import, archive, and class change — and would be wrong the first time one of
// those paths forgot to update it. It is derived instead.

export interface ClassMembership {
  active: number;
  total: number;
}

export function memberCountsByClass(
  people: Person[],
  classes: RelationshipClass[],
): Map<string, ClassMembership> {
  const counts = new Map<string, ClassMembership>();
  for (const cls of classes) counts.set(cls.id, { active: 0, total: 0 });

  for (const person of people) {
    // A person counts once per class, even if the id is repeated on the record.
    for (const classId of new Set(person.relationshipClassIds)) {
      const entry = counts.get(classId);
      if (!entry) continue; // dangling reference — reported separately
      entry.total++;
      if (person.status === 'Active') entry.active++;
    }
  }

  return counts;
}

export function activeMemberCount(classId: string, people: Person[]): number {
  return people.filter(
    p => p.status === 'Active' && new Set(p.relationshipClassIds).has(classId),
  ).length;
}

export function totalMemberCount(classId: string, people: Person[]): number {
  return people.filter(p => new Set(p.relationshipClassIds).has(classId)).length;
}

/** Active people carrying no class at all — they receive no recognition. */
export function peopleWithoutClass(people: Person[]): Person[] {
  return people.filter(p => p.status === 'Active' && p.relationshipClassIds.length === 0);
}

export interface InvalidClassReference {
  person: Person;
  /** Classes that exist but have been deactivated. */
  inactiveClassIds: string[];
  /** Classes that no longer exist at all. */
  missingClassIds: string[];
}

/**
 * Active people pointing at classes that are inactive or gone.
 *
 * Both are preserved on the record rather than stripped — a deactivated class
 * is history worth keeping — so they are reported instead.
 */
export function peopleWithInvalidClassReferences(
  people: Person[],
  classes: RelationshipClass[],
): InvalidClassReference[] {
  const byId = new Map(classes.map(c => [c.id, c]));
  const results: InvalidClassReference[] = [];

  for (const person of people) {
    if (person.status !== 'Active') continue;
    const inactiveClassIds: string[] = [];
    const missingClassIds: string[] = [];

    for (const classId of new Set(person.relationshipClassIds)) {
      const cls = byId.get(classId);
      if (!cls) missingClassIds.push(classId);
      else if (!cls.isActive) inactiveClassIds.push(classId);
    }

    if (inactiveClassIds.length > 0 || missingClassIds.length > 0) {
      results.push({ person, inactiveClassIds, missingClassIds });
    }
  }

  return results;
}

// ─── Class reference resolution ──────────────────────────────────────────────

export type ClassReference =
  | { kind: 'id'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'typeLevel'; type: string; level: number };

export type ClassLookup =
  | { status: 'resolved'; classId: string; isActive: boolean; name: string }
  | { status: 'ambiguous'; matches: string[] }
  | { status: 'not-found' };

function normalizeClassName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve one class reference. Exact matches only, in the documented order:
 *
 *   1. `relationship_class_id` — an exact id
 *   2. an exact normalized display name
 *   3. an exact Relationship Type + numeric Level pair
 *
 * There is no fuzzy matching at any step. A near-miss on a class name would
 * quietly put people into the wrong recognition tier, which is precisely the
 * kind of error nobody notices until a gift goes to the wrong person.
 */
export function resolveClassReference(
  reference: ClassReference,
  classes: RelationshipClass[],
): ClassLookup {
  if (reference.kind === 'id') {
    const match = classes.find(c => c.id === reference.value.trim());
    return match
      ? { status: 'resolved', classId: match.id, isActive: match.isActive, name: match.name }
      : { status: 'not-found' };
  }

  if (reference.kind === 'name') {
    const key = normalizeClassName(reference.value);
    if (key === '') return { status: 'not-found' };
    const matches = classes.filter(c => normalizeClassName(c.name) === key);
    if (matches.length === 0) return { status: 'not-found' };
    if (matches.length > 1) return { status: 'ambiguous', matches: matches.map(c => c.id) };
    return { status: 'resolved', classId: matches[0].id, isActive: matches[0].isActive, name: matches[0].name };
  }

  const matches = classes.filter(
    c => c.type === (reference.type as RelationshipType) && c.level === reference.level,
  );
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1) return { status: 'ambiguous', matches: matches.map(c => c.id) };
  return { status: 'resolved', classId: matches[0].id, isActive: matches[0].isActive, name: matches[0].name };
}

// ─── CSV import ──────────────────────────────────────────────────────────────

export type CsvField =
  | 'firstName' | 'lastName' | 'email' | 'phone' | 'role' | 'country'
  | 'startDate' | 'birthday' | 'relationshipClass' | 'relationshipClassId'
  | 'relationshipType' | 'relationshipLevel' | 'externalId';

export const CSV_HEADER_ALIASES: Record<CsvField, readonly string[]> = {
  firstName: ['first_name', 'firstname', 'first name', 'given name', 'givenname'],
  lastName: ['last_name', 'lastname', 'last name', 'surname', 'family name'],
  email: ['email', 'email address', 'e mail', 'work email'],
  phone: ['phone', 'phone number', 'mobile', 'telephone'],
  role: ['role', 'title', 'job title', 'position'],
  country: ['country', 'country code'],
  startDate: ['start_date', 'startdate', 'start date', 'hire date', 'joined'],
  birthday: ['birthday', 'date_of_birth', 'dob', 'birth date'],
  relationshipClass: ['relationship_class', 'class', 'relationship class', 'classes'],
  relationshipClassId: ['relationship_class_id', 'class_id', 'relationship class id'],
  relationshipType: ['relationship_type', 'type', 'relationship type'],
  relationshipLevel: ['relationship_level', 'level', 'relationship level'],
  externalId: ['external_id', 'externalid', 'employee_id', 'employee id', 'staff id'],
};

/** Multiple classes in one cell are separated by `;` or `|`, never by a comma. */
const CLASS_SEPARATOR = /[;|]/;

export type ImportRowState =
  | 'ready'
  | 'ready-unassigned'
  | 'will-update'
  | 'duplicate-retained'
  | 'invalid'
  | 'ambiguous-class'
  | 'missing-required';

/** States that actually write something when the import is applied. */
export const APPLIED_ROW_STATES: readonly ImportRowState[] = ['ready', 'ready-unassigned', 'will-update'];

export interface ImportRow {
  /** 1-based data row, excluding the header. Matches what the operator sees. */
  rowNumber: number;
  state: ImportRowState;
  message: string;
  warnings: string[];
  displayName: string;
  draft?: PersonDraft;
  existingPersonId?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
}

export interface ImportPlan {
  rows: ImportRow[];
  summary: ImportSummary;
  unrecognizedHeaders: string[];
}

export type ImportPlanResult =
  | { status: 'ok'; plan: ImportPlan }
  | { status: 'error'; reason: string };

const INVALID_STATES: readonly ImportRowState[] = ['invalid', 'missing-required'];

/**
 * Read a CSV into a reviewable plan. Nothing is written — the operator sees
 * every row's fate before anything happens.
 */
export function planPeopleImport(
  csvText: string,
  classes: RelationshipClass[],
  existingPeople: Person[],
  incomingSourceType: PeopleSourceType,
): ImportPlanResult {
  const table = parseCsv(csvText);
  if (table.length === 0) return { status: 'error', reason: 'That file is empty.' };

  const [headerRow, ...dataRows] = table;
  const { columns, unrecognized } = matchHeaders<CsvField>(headerRow, CSV_HEADER_ALIASES);

  if (columns.firstName === undefined || columns.lastName === undefined) {
    return {
      status: 'error',
      reason: 'The file needs a first name and a last name column. Download the template to see the expected headers.',
    };
  }
  if (dataRows.length === 0) {
    return { status: 'error', reason: 'That file has headers but no rows.' };
  }

  const cell = (row: string[], field: CsvField): string => {
    const index = columns[field];
    if (index === undefined) return '';
    return (row[index] ?? '').trim();
  };

  const rows: ImportRow[] = [];
  // Emails claimed earlier in this same file, so a file that repeats a person
  // does not quietly import them twice.
  const seenInFile = new Map<string, number>();

  dataRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const firstName = cell(raw, 'firstName');
    const lastName = cell(raw, 'lastName');
    const displayName = `${firstName} ${lastName}`.trim() || `Row ${rowNumber}`;
    const warnings: string[] = [];

    if (firstName === '' || lastName === '') {
      rows.push({
        rowNumber, displayName, warnings,
        state: 'missing-required',
        message: 'A first name and a last name are required.',
      });
      return;
    }

    // Field normalization — any failure invalidates the row rather than
    // importing a half-understood record.
    const email = normalizeEmail(cell(raw, 'email'));
    if (email !== undefined && !isValidEmail(email)) {
      rows.push({
        rowNumber, displayName, warnings,
        state: 'invalid',
        message: `"${cell(raw, 'email')}" is not a valid email address.`,
      });
      return;
    }

    const country = normalizeCountry(cell(raw, 'country'));
    if (!country.ok) {
      rows.push({ rowNumber, displayName, warnings, state: 'invalid', message: country.reason });
      return;
    }

    const birthday = normalizeBirthday(cell(raw, 'birthday'));
    if (!birthday.ok) {
      rows.push({ rowNumber, displayName, warnings, state: 'invalid', message: birthday.reason });
      return;
    }

    const startDate = normalizeStartDate(cell(raw, 'startDate'));
    if (!startDate.ok) {
      rows.push({ rowNumber, displayName, warnings, state: 'invalid', message: startDate.reason });
      return;
    }

    // ─ Class resolution ─
    const references: ClassReference[] = [];
    for (const token of cell(raw, 'relationshipClassId').split(CLASS_SEPARATOR)) {
      if (token.trim() !== '') references.push({ kind: 'id', value: token.trim() });
    }
    for (const token of cell(raw, 'relationshipClass').split(CLASS_SEPARATOR)) {
      if (token.trim() !== '') references.push({ kind: 'name', value: token.trim() });
    }
    const typeCell = cell(raw, 'relationshipType');
    const levelCell = cell(raw, 'relationshipLevel');
    if (typeCell !== '' && levelCell !== '') {
      const level = Number.parseInt(levelCell, 10);
      if (Number.isNaN(level)) {
        warnings.push(`Relationship level "${levelCell}" is not a number and was ignored.`);
      } else {
        references.push({ kind: 'typeLevel', type: typeCell.trim(), level });
      }
    } else if (typeCell !== '' || levelCell !== '') {
      warnings.push('Relationship type and level must both be present to identify a class. Both were ignored.');
    }

    const classIds: string[] = [];
    let ambiguous = false;

    for (const reference of references) {
      const lookup = resolveClassReference(reference, classes);
      const label =
        reference.kind === 'typeLevel'
          ? `${reference.type} level ${reference.level}`
          : reference.value;

      if (lookup.status === 'ambiguous') {
        ambiguous = true;
        warnings.push(`"${label}" matches more than one Relationship Class.`);
        continue;
      }
      if (lookup.status === 'not-found') {
        warnings.push(`No Relationship Class matches "${label}". Left unassigned.`);
        continue;
      }
      if (!lookup.isActive) {
        warnings.push(`Relationship Class "${lookup.name}" is inactive and cannot be assigned.`);
        continue;
      }
      if (!classIds.includes(lookup.classId)) classIds.push(lookup.classId);
    }

    if (ambiguous) {
      rows.push({
        rowNumber, displayName, warnings,
        state: 'ambiguous-class',
        message: 'This row names a class that matches more than one Relationship Class. Use relationship_class_id to disambiguate.',
      });
      return;
    }

    const draft: PersonDraft = {
      firstName, lastName, email,
      phone: normalizePhone(cell(raw, 'phone')),
      role: cell(raw, 'role') || undefined,
      country: country.value,
      startDate: startDate.value,
      birthday: birthday.value,
      externalId: cell(raw, 'externalId') || undefined,
      relationshipClassIds: classIds,
      providedClass: references.length > 0,
    };

    // ─ Duplicates within this file ─
    if (email !== undefined) {
      const earlier = seenInFile.get(email);
      if (earlier !== undefined) {
        rows.push({
          rowNumber, displayName, warnings, draft,
          state: 'duplicate-retained',
          message: `Row ${earlier} in this file already uses ${email}. Only the first was kept.`,
        });
        return;
      }
      seenInFile.set(email, rowNumber);
    }

    // ─ Duplicates against the directory ─
    const decision = resolveDuplicate(email, incomingSourceType, existingPeople);

    if (decision.outcome === 'retain-existing') {
      rows.push({
        rowNumber, displayName, warnings, draft,
        state: 'duplicate-retained',
        message: decision.reason,
        existingPersonId: decision.existing?.id,
      });
      return;
    }

    if (decision.outcome === 'update') {
      rows.push({
        rowNumber, displayName, warnings, draft,
        state: 'will-update',
        message: decision.reason,
        existingPersonId: decision.existing!.id,
      });
      return;
    }

    // Advisory only — a phone match never blocks or merges.
    const phoneMatches = findPhoneMatches(draft.phone, existingPeople);
    if (phoneMatches.length > 0) {
      warnings.push(
        `This phone number also appears on ${phoneMatches.map(p => `${p.firstName} ${p.lastName}`).join(', ')}. Imported as a separate person — review if that is wrong.`,
      );
    }

    rows.push({
      rowNumber, displayName, warnings, draft,
      state: classIds.length === 0 ? 'ready-unassigned' : 'ready',
      message:
        classIds.length === 0
          ? 'Will be added without a Relationship Class.'
          : 'Ready to import.',
    });
  });

  return { status: 'ok', plan: { rows, summary: summarize(rows), unrecognizedHeaders: unrecognized } };
}

function summarize(rows: ImportRow[]): ImportSummary {
  return {
    total: rows.length,
    created: rows.filter(r => r.state === 'ready' || r.state === 'ready-unassigned').length,
    updated: rows.filter(r => r.state === 'will-update').length,
    skipped: rows.filter(r => r.state === 'duplicate-retained' || r.state === 'ambiguous-class').length,
    invalid: rows.filter(r => INVALID_STATES.includes(r.state)).length,
  };
}

export interface ApplyImportResult {
  people: Person[];
  summary: ImportSummary;
}

/**
 * Apply a reviewed plan. Only rows in `APPLIED_ROW_STATES` write anything;
 * everything else is left exactly as the preview said it would be.
 */
export function applyPeopleImport(
  plan: ImportPlan,
  existingPeople: Person[],
  source: PeopleSource,
  now: string,
  newId: () => string,
): ApplyImportResult {
  const people = [...existingPeople];

  for (const row of plan.rows) {
    if (!row.draft || !APPLIED_ROW_STATES.includes(row.state)) continue;

    if (row.state === 'will-update' && row.existingPersonId) {
      const index = people.findIndex(p => p.id === row.existingPersonId);
      if (index === -1) continue;
      people[index] = mergePersonFromImport(people[index], row.draft, source, now);
      continue;
    }

    people.push(createPersonFromDraft(row.draft, source, now, newId()));
  }

  return { people, summary: plan.summary };
}

// ─── Template ────────────────────────────────────────────────────────────────

export const CSV_TEMPLATE_HEADERS = [
  'first_name', 'last_name', 'email', 'phone', 'role', 'country',
  'start_date', 'birthday', 'relationship_class', 'relationship_class_id', 'external_id',
];

export function csvTemplate(): string {
  return toCsv([
    CSV_TEMPLATE_HEADERS,
    ['Ada', 'Obi', 'ada.obi@example.com', '+234 800 000 0000', 'Chief Executive', 'NG', '2021-03-01', '04-17', 'Executive Leadership', '', 'EMP-001'],
    ['Kwame', 'Mensah', 'kwame@example.com', '', 'Regional Manager', 'GH', '2023-07-15', '11-02', 'Managers', '', 'EMP-002'],
    ['Amina', 'Yusuf', 'amina@example.com', '', 'Procurement Lead', 'KE', '', '', '', 'class-standard-clients', ''],
  ]);
}
