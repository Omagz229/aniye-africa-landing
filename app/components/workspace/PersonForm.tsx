"use client";

import { useEffect, useMemo, useState } from 'react';
import type { Person, RelationshipClass, RelationshipType, WorkspaceState } from '@/lib/workspace';
import { sortRelationshipClasses, updateWorkspace } from '@/lib/workspace';
import {
  ensureManualSource,
  findPersonByEmail,
  findPhoneMatches,
  isValidEmail,
  normalizeBirthday,
  normalizeCountry,
  normalizeEmail,
  normalizePhone,
  normalizeStartDate,
} from '@/lib/people';
import StepHeader from './StepHeader';

interface Props {
  workspace: WorkspaceState;
  /** Null when adding someone new. */
  person: Person | null;
  onSaved: (workspace: WorkspaceState, person: Person, wasNew: boolean) => void;
  onCancel: () => void;
}

/**
 * Draft autosave (Doctrine §2.12 — save progress and continue).
 *
 * Kept in its own key, deliberately separate from the workspace: an unfinished
 * person is not a person. Nothing reaches `workspace.people` until the operator
 * confirms on the final step.
 */
const DRAFT_KEY = 'aniye_person_draft';

interface Draft {
  firstName: string; lastName: string; email: string; phone: string; role: string;
  country: string; startDate: string; birthday: string; classIds: string[]; step: number;
}

const EMPTY_DRAFT: Draft = {
  firstName: '', lastName: '', email: '', phone: '', role: '',
  country: '', startDate: '', birthday: '', classIds: [], step: 0,
};

const STEPS = ['Who they are', 'Where they fit', 'Dates that matter', 'Review'];

const field =
  'w-full rounded-lg border border-stone/20 bg-white px-3 py-2.5 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';
const labelClass = 'block font-body text-sm font-medium text-ink mb-1.5';

function readDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    // Only worth restoring if the operator actually typed something.
    if (!parsed.firstName && !parsed.lastName && !parsed.email) return null;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

function clearDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export default function PersonForm({ workspace, person, onSaved, onCancel }: Props) {
  const isEditing = person !== null;

  const [draft, setDraft] = useState<Draft>(() =>
    person
      ? {
          firstName: person.firstName, lastName: person.lastName,
          email: person.email ?? '', phone: person.phone ?? '', role: person.role ?? '',
          country: person.country ?? '', startDate: person.startDate ?? '',
          birthday: person.birthday ?? '', classIds: person.relationshipClassIds, step: 0,
        }
      : EMPTY_DRAFT,
  );
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(Boolean(person?.phone));
  const [resumed, setResumed] = useState<Draft | null>(null);

  // Offer to resume rather than silently restoring — a surprise prefill is
  // worse than a restart.
  useEffect(() => {
    if (isEditing) return;
    const saved = readDraft();
    if (saved) setResumed(saved);
  }, [isEditing]);

  // Autosave every change on a new person. Never on an edit: an abandoned edit
  // should leave the stored record exactly as it was.
  useEffect(() => {
    if (isEditing || resumed) return;
    if (!draft.firstName && !draft.lastName && !draft.email) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, step }));
    } catch {
      // Storage full or unavailable — autosave is a convenience, not a contract.
    }
  }, [draft, step, isEditing, resumed]);

  const classesById = useMemo(
    () => new Map(workspace.relationshipClasses.map(c => [c.id, c])),
    [workspace.relationshipClasses],
  );

  const grouped = useMemo(() => {
    const active = sortRelationshipClasses(workspace.relationshipClasses.filter(c => c.isActive));
    const groups: Array<[RelationshipType, RelationshipClass[]]> = [];
    for (const cls of active) {
      const last = groups[groups.length - 1];
      if (last && last[0] === cls.type) last[1].push(cls);
      else groups.push([cls.type, [cls]]);
    }
    return groups;
  }, [workspace.relationshipClasses]);

  const staleSelections = draft.classIds
    .map(id => ({ id, cls: classesById.get(id) }))
    .filter(entry => entry.cls === undefined || !entry.cls.isActive);

  const phoneMatches = findPhoneMatches(normalizePhone(draft.phone), workspace.people, person?.id);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setError(null);
  }

  function toggleClass(id: string) {
    setDraft(prev => ({
      ...prev,
      classIds: prev.classIds.includes(id)
        ? prev.classIds.filter(c => c !== id)
        : [...prev.classIds, id],
    }));
    setError(null);
  }

  // ─── Per-step validation ───────────────────────────────────────────────────

  function validateIdentity(): boolean {
    if (draft.firstName.trim() === '' || draft.lastName.trim() === '') {
      setError('We need a first and last name to add someone.');
      return false;
    }
    const email = normalizeEmail(draft.email);
    if (email !== undefined && !isValidEmail(email)) {
      setError(`"${draft.email.trim()}" doesn't look like an email address. Check for a typo, or leave it blank.`);
      return false;
    }
    if (email !== undefined) {
      const duplicate = findPersonByEmail(email, workspace.people, person?.id);
      if (duplicate) {
        setError(
          `${duplicate.firstName} ${duplicate.lastName} is already in your directory with this email. Open their record to make changes instead of adding a second one.`,
        );
        return false;
      }
    }
    return true;
  }

  function validateDates(): boolean {
    const country = normalizeCountry(draft.country);
    if (!country.ok) { setError(country.reason); return false; }
    const birthday = normalizeBirthday(draft.birthday);
    if (!birthday.ok) { setError(birthday.reason); return false; }
    const startDate = normalizeStartDate(draft.startDate);
    if (!startDate.ok) { setError(startDate.reason); return false; }
    return true;
  }

  function next() {
    if (step === 0 && !validateIdentity()) return;
    if (step === 2 && !validateDates()) return;
    setError(null);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  }

  function back() {
    setError(null);
    setStep(s => Math.max(0, s - 1));
  }

  function handleSave() {
    if (!validateIdentity() || !validateDates()) return;

    // Normalize once and reuse — calling the parser twice per field would work
    // but leaves the compiler unable to see that validation already passed.
    const country = normalizeCountry(draft.country);
    const startDate = normalizeStartDate(draft.startDate);
    const birthday = normalizeBirthday(draft.birthday);
    if (!country.ok || !startDate.ok || !birthday.ok) return;

    const now = new Date().toISOString();
    const { sources, source } = ensureManualSource(
      workspace.peopleSources, now, `source-${crypto.randomUUID()}`,
    );

    const base = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: normalizeEmail(draft.email),
      phone: normalizePhone(draft.phone),
      role: draft.role.trim() || undefined,
      country: country.value,
      startDate: startDate.value,
      birthday: birthday.value,
      relationshipClassIds: draft.classIds,
      updatedAt: now,
    };

    const saved: Person = person
      ? { ...person, ...base }
      : {
          id: `person-${crypto.randomUUID()}`,
          ...base,
          sourceId: source.id,
          sourceType: source.type,
          status: 'Active',
          createdAt: now,
        };

    const people = person
      ? workspace.people.map(p => (p.id === person.id ? saved : p))
      : [...workspace.people, saved];

    const updated = updateWorkspace({ people, peopleSources: sources });
    if (!updated) return;

    clearDraft();
    onSaved(updated, saved, !person);
  }

  function handleCancel() {
    if (!isEditing) clearDraft();
    onCancel();
  }

  // ─── Resume prompt ─────────────────────────────────────────────────────────

  if (resumed) {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            Pick up where you left off?
          </h2>
          <p className="font-body text-stone">
            You were adding{' '}
            <span className="font-semibold text-ink">
              {`${resumed.firstName} ${resumed.lastName}`.trim() || 'someone'}
            </span>{' '}
            and didn&apos;t finish. Nothing was saved to your directory.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { setDraft(resumed); setStep(resumed.step ?? 0); setShowPhone(Boolean(resumed.phone)); setResumed(null); }}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
          >
            Continue &#8594;
          </button>
          <button
            type="button"
            onClick={() => { clearDraft(); setResumed(null); }}
            className="font-body text-sm text-stone hover:text-ink transition-colors"
          >
            Start fresh
          </button>
        </div>
      </div>
    );
  }

  // ─── Steps ─────────────────────────────────────────────────────────────────

  const isLast = step === STEPS.length - 1;

  return (
    <div className="max-w-2xl space-y-6">
      <StepHeader
        eyebrow="People"
        title={isEditing ? `Edit ${person.firstName} ${person.lastName}` : 'Add a person'}
        steps={STEPS}
        current={step}
      />

      <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 space-y-5">

        {/* 1 — Basic identity */}
        {step === 0 && (
          <>
            <p className="font-body text-sm text-stone">
              Just the essentials. You can fill in the rest as you go.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="pf-first">First name</label>
                <input id="pf-first" className={field} value={draft.firstName} autoFocus
                  onChange={(e) => set('firstName', e.target.value)} placeholder="Ada" />
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-last">Last name</label>
                <input id="pf-last" className={field} value={draft.lastName}
                  onChange={(e) => set('lastName', e.target.value)} placeholder="Obi" />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="pf-email">
                Email <OptionalTag />
              </label>
              <input id="pf-email" type="email" className={field} value={draft.email}
                onChange={(e) => set('email', e.target.value)} placeholder="ada@example.com" />
              <p className="font-body text-xs text-stone/70 mt-1.5">
                Used to recognise the same person across imports, so nobody gets added twice.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="pf-role">
                Role <OptionalTag />
              </label>
              <input id="pf-role" className={field} value={draft.role}
                onChange={(e) => set('role', e.target.value)} placeholder="Chief Executive" />
            </div>

            {/* Progressive disclosure — most people won't add a phone number here */}
            {showPhone ? (
              <div>
                <label className={labelClass} htmlFor="pf-phone">
                  Phone <OptionalTag />
                </label>
                <input id="pf-phone" className={field} value={draft.phone}
                  onChange={(e) => set('phone', e.target.value)} placeholder="+234 800 000 0000" />
                {phoneMatches.length > 0 && (
                  <p className="font-body text-xs text-stone bg-cream rounded-lg px-3 py-2 mt-2">
                    {phoneMatches.map(p => `${p.firstName} ${p.lastName}`).join(', ')} also{' '}
                    {phoneMatches.length === 1 ? 'has' : 'have'} this number. That&apos;s fine — we
                    only use email to spot the same person twice.
                  </p>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setShowPhone(true)}
                className="font-body text-sm text-stone hover:text-ink transition-colors">
                + Add a phone number
              </button>
            )}
          </>
        )}

        {/* 2 — Relationship placement */}
        {step === 1 && (
          <>
            <div>
              <p className="font-body text-sm text-ink mb-1">
                Which groups does {draft.firstName || 'this person'} belong to?
              </p>
              <p className="font-body text-sm text-stone">
                This is what connects them to your recognition policies. You can skip it and come
                back later.
              </p>
            </div>

            <div className="bg-cream rounded-xl px-4 py-3">
              <p className="font-body text-xs text-stone leading-relaxed">
                Groups are organised by <span className="font-semibold text-ink">relationship type</span>{' '}
                — employee, client, partner — and within each type by{' '}
                <span className="font-semibold text-ink">recognition level</span>.{' '}
                <span className="font-semibold text-ink">Level 0 is the highest recognition priority.</span>
              </p>
            </div>

            {grouped.length === 0 ? (
              <p className="font-body text-sm text-stone/70">
                You have no active relationship groups yet. You can still add this person and place
                them later.
              </p>
            ) : (
              <div className="space-y-4">
                {grouped.map(([type, classes]) => (
                  <div key={type}>
                    <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">{type}</p>
                    <div className="space-y-1">
                      {classes.map(cls => (
                        <label key={cls.id}
                          className="flex items-center gap-3 cursor-pointer py-2 px-3 -mx-1 rounded-lg hover:bg-cream/60 transition-colors">
                          <input
                            type="checkbox"
                            checked={draft.classIds.includes(cls.id)}
                            onChange={() => toggleClass(cls.id)}
                            className="w-4 h-4 flex-shrink-0 rounded border-stone/30 text-gold focus:ring-gold focus:ring-offset-0"
                          />
                          <span className="font-body text-sm text-ink flex-1 min-w-0 truncate">
                            {cls.name || 'Untitled group'}
                          </span>
                          <span className="font-body text-xs text-stone/60 flex-shrink-0">
                            Level {cls.level}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="pf-country">
                Country <OptionalTag />
              </label>
              <input id="pf-country" className={`${field} uppercase max-w-[8rem]`} value={draft.country} maxLength={2}
                onChange={(e) => set('country', e.target.value.toUpperCase())} placeholder="NG" />
              <p className="font-body text-xs text-stone/70 mt-1.5">
                Two-letter country code. Decides which country-specific policy applies to them.
              </p>
            </div>

            {staleSelections.length > 0 && (
              <div className="bg-cream rounded-xl px-4 py-3">
                <p className="font-body text-xs font-semibold text-ink mb-1">Kept from before</p>
                <p className="font-body text-xs text-stone leading-snug">
                  This person is still linked to{' '}
                  {staleSelections
                    .map(entry => entry.cls ? `${entry.cls.name} (no longer in use)` : `a group that has been deleted`)
                    .join(', ')}
                  . We keep these for history. Remove one only if it no longer applies.
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {staleSelections.map(entry => (
                    <button key={entry.id} type="button" onClick={() => toggleClass(entry.id)}
                      className="font-body text-xs text-stone hover:text-ink transition-colors underline underline-offset-2">
                      Remove {entry.cls?.name ?? 'deleted group'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 3 — Important dates */}
        {step === 2 && (
          <>
            <div>
              <p className="font-body text-sm text-ink mb-1">The moments worth remembering</p>
              <p className="font-body text-sm text-stone">
                These are what Aniyé watches for. Both are optional — you can add them any time.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="pf-birthday">
                  Birthday <OptionalTag />
                </label>
                <input id="pf-birthday" className={field} value={draft.birthday}
                  onChange={(e) => set('birthday', e.target.value)} placeholder="04-17" />
                <p className="font-body text-xs text-stone/70 mt-1.5">
                  Month and day, like 04-17. The year isn&apos;t needed.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-start">
                  Start date <OptionalTag />
                </label>
                <input id="pf-start" className={field} value={draft.startDate}
                  onChange={(e) => set('startDate', e.target.value)} placeholder="2021-03-01" />
                <p className="font-body text-xs text-stone/70 mt-1.5">
                  When they joined, like 2021-03-01. Used for work anniversaries.
                </p>
              </div>
            </div>
          </>
        )}

        {/* 4 — Review */}
        {step === 3 && (
          <>
            <div>
              <p className="font-body text-sm text-ink mb-1">Check this over</p>
              <p className="font-body text-sm text-stone">
                Nothing has been saved yet. Go back to change anything.
              </p>
            </div>
            <dl className="divide-y divide-stone/10">
              <ReviewRow label="Name" value={`${draft.firstName} ${draft.lastName}`.trim()} />
              <ReviewRow label="Email" value={normalizeEmail(draft.email)} />
              <ReviewRow label="Role" value={draft.role.trim() || undefined} />
              <ReviewRow label="Phone" value={normalizePhone(draft.phone)} />
              <ReviewRow label="Country" value={draft.country.trim() || undefined} />
              <ReviewRow
                label="Groups"
                value={
                  draft.classIds.length === 0
                    ? undefined
                    : draft.classIds
                        .map(id => {
                          const cls = classesById.get(id);
                          return cls ? `${cls.name} (Level ${cls.level})` : 'Deleted group';
                        })
                        .join(', ')
                }
                emptyHint="No group yet — they won't receive recognition until you add one"
              />
              <ReviewRow label="Birthday" value={draft.birthday.trim() || undefined} />
              <ReviewRow label="Start date" value={draft.startDate.trim() || undefined} />
            </dl>
          </>
        )}

        {error && (
          <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>
        )}
      </div>

      {/* Navigation — one primary action, always on the right weight */}
      <div className="flex flex-wrap items-center gap-3">
        {isLast ? (
          <button type="button" onClick={handleSave}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
            {isEditing ? 'Save changes' : `Add ${draft.firstName || 'person'}`} &#8594;
          </button>
        ) : (
          <button type="button" onClick={next}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
            Continue &#8594;
          </button>
        )}
        {step > 0 && (
          <button type="button" onClick={back}
            className="font-body text-sm text-stone hover:text-ink transition-colors">
            Back
          </button>
        )}
        <button type="button" onClick={handleCancel}
          className="font-body text-sm text-stone/70 hover:text-ink transition-colors sm:ml-auto">
          Cancel
        </button>
      </div>

      {!isEditing && (draft.firstName || draft.lastName) && (
        <p className="font-body text-xs text-stone/50">
          Your progress is saved as you type. Nothing is added to your directory until you finish.
        </p>
      )}
    </div>
  );
}

function OptionalTag() {
  return <span className="font-body text-xs font-normal text-stone/60 ml-1">Optional</span>;
}

function ReviewRow({
  label, value, emptyHint,
}: {
  label: string; value?: string; emptyHint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
      <dt className="font-body text-xs text-stone uppercase tracking-wider w-24 flex-shrink-0">{label}</dt>
      <dd className={`font-body text-sm flex-1 min-w-0 ${value ? 'text-ink' : 'text-stone/50'}`}>
        {value ?? emptyHint ?? 'Not set'}
      </dd>
    </div>
  );
}
