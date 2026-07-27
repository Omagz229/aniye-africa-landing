"use client";

import { useMemo, useState } from 'react';
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

interface Props {
  workspace: WorkspaceState;
  /** Null when adding someone new. */
  person: Person | null;
  onSaved: (workspace: WorkspaceState) => void;
  onCancel: () => void;
}

const field =
  'w-full rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';
const label = 'block font-body text-xs text-stone uppercase tracking-wider mb-1.5';

export default function PersonForm({ workspace, person, onSaved, onCancel }: Props) {
  const [firstName, setFirstName] = useState(person?.firstName ?? '');
  const [lastName, setLastName] = useState(person?.lastName ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [role, setRole] = useState(person?.role ?? '');
  const [country, setCountry] = useState(person?.country ?? '');
  const [startDate, setStartDate] = useState(person?.startDate ?? '');
  const [birthday, setBirthday] = useState(person?.birthday ?? '');
  const [classIds, setClassIds] = useState<string[]>(person?.relationshipClassIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const classesById = useMemo(
    () => new Map(workspace.relationshipClasses.map(c => [c.id, c])),
    [workspace.relationshipClasses],
  );

  // Selectable classes are the active ones. An inactive class already on this
  // record stays selected and is shown with a warning — deactivating a class is
  // not a reason to rewrite people's history.
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

  const staleSelections = classIds
    .map(id => ({ id, cls: classesById.get(id) }))
    .filter(entry => entry.cls === undefined || !entry.cls.isActive);

  const phoneMatches = findPhoneMatches(normalizePhone(phone), workspace.people, person?.id);

  function toggleClass(id: string) {
    setClassIds(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
    setError(null);
  }

  function handleSave() {
    if (firstName.trim() === '' || lastName.trim() === '') {
      setError('A first name and a last name are required.');
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail !== undefined && !isValidEmail(normalizedEmail)) {
      setError(`"${email.trim()}" is not a valid email address.`);
      return;
    }

    // Duplicate email is refused outright rather than merged — a manual entry is
    // the lowest-priority source, so it must never overwrite anything.
    if (normalizedEmail !== undefined) {
      const duplicate = findPersonByEmail(normalizedEmail, workspace.people, person?.id);
      if (duplicate) {
        setError(
          `${duplicate.firstName} ${duplicate.lastName} already uses ${normalizedEmail}. Edit that record instead of creating a second one.`,
        );
        return;
      }
    }

    const parsedCountry = normalizeCountry(country);
    if (!parsedCountry.ok) { setError(parsedCountry.reason); return; }

    const parsedBirthday = normalizeBirthday(birthday);
    if (!parsedBirthday.ok) { setError(parsedBirthday.reason); return; }

    const parsedStartDate = normalizeStartDate(startDate);
    if (!parsedStartDate.ok) { setError(parsedStartDate.reason); return; }

    const now = new Date().toISOString();
    const { sources, source } = ensureManualSource(
      workspace.peopleSources,
      now,
      `source-${crypto.randomUUID()}`,
    );

    const base = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: normalizePhone(phone),
      role: role.trim() || undefined,
      country: parsedCountry.value,
      startDate: parsedStartDate.value,
      birthday: parsedBirthday.value,
      relationshipClassIds: classIds,
      updatedAt: now,
    };

    const people = person
      ? workspace.people.map(p => (p.id === person.id ? { ...p, ...base } : p))
      : [
          ...workspace.people,
          {
            id: `person-${crypto.randomUUID()}`,
            ...base,
            sourceId: source.id,
            sourceType: source.type,
            status: 'Active' as const,
            createdAt: now,
          },
        ];

    const updated = updateWorkspace({ people, peopleSources: sources });
    if (updated) onSaved(updated);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
          {person ? 'Edit person' : 'Add a person'}
        </h2>
      </div>

      <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="pf-first">First name</label>
            <input id="pf-first" className={field} value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setError(null); }} placeholder="Ada" />
          </div>
          <div>
            <label className={label} htmlFor="pf-last">Last name</label>
            <input id="pf-last" className={field} value={lastName}
              onChange={(e) => { setLastName(e.target.value); setError(null); }} placeholder="Obi" />
          </div>
          <div>
            <label className={label} htmlFor="pf-email">Email</label>
            <input id="pf-email" type="email" className={field} value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="ada@example.com" />
          </div>
          <div>
            <label className={label} htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" className={field} value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(null); }} placeholder="+234 800 000 0000" />
          </div>
          <div>
            <label className={label} htmlFor="pf-role">Role</label>
            <input id="pf-role" className={field} value={role}
              onChange={(e) => setRole(e.target.value)} placeholder="Chief Executive" />
          </div>
          <div>
            <label className={label} htmlFor="pf-country">Country</label>
            <input id="pf-country" className={`${field} uppercase`} value={country} maxLength={2}
              onChange={(e) => { setCountry(e.target.value.toUpperCase()); setError(null); }} placeholder="NG" />
          </div>
          <div>
            <label className={label} htmlFor="pf-start">Start date</label>
            <input id="pf-start" className={field} value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setError(null); }} placeholder="2021-03-01" />
          </div>
          <div>
            <label className={label} htmlFor="pf-birthday">Birthday</label>
            <input id="pf-birthday" className={field} value={birthday}
              onChange={(e) => { setBirthday(e.target.value); setError(null); }} placeholder="04-17" />
            <p className="font-body text-xs text-stone/60 mt-1">MM-DD. The year is not needed.</p>
          </div>
        </div>

        {phoneMatches.length > 0 && (
          <p className="font-body text-xs text-stone bg-cream rounded-lg px-3 py-2">
            This phone number also appears on{' '}
            {phoneMatches.map(p => `${p.firstName} ${p.lastName}`).join(', ')}. That is allowed —
            phone numbers are not treated as identity.
          </p>
        )}
      </div>

      {/* Relationship Classes */}
      <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 space-y-4">
        <div>
          <p className="font-body text-sm font-semibold text-ink mb-1">Relationship Classes</p>
          <p className="font-body text-xs text-stone">
            A person may belong to more than one class. Level 0 is the highest within a type.
          </p>
        </div>

        {grouped.length === 0 ? (
          <p className="font-body text-sm text-stone/60">
            No active Relationship Classes. Activate one before assigning people.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([type, classes]) => (
              <div key={type}>
                <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">{type}</p>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {classes.map(cls => (
                    <label key={cls.id} className="flex items-center gap-2.5 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={classIds.includes(cls.id)}
                        onChange={() => toggleClass(cls.id)}
                        className="w-4 h-4 rounded border-stone/30 text-gold focus:ring-gold focus:ring-offset-0"
                      />
                      <span className="font-body text-sm text-ink">{cls.name || 'Untitled class'}</span>
                      <span className="font-body text-xs text-stone/60">Level {cls.level}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {staleSelections.length > 0 && (
          <div className="bg-cream rounded-xl px-4 py-3">
            <p className="font-body text-xs font-semibold text-ink mb-1">Historical class references</p>
            <p className="font-body text-xs text-stone leading-snug">
              This record still points at{' '}
              {staleSelections
                .map(entry => entry.cls ? `${entry.cls.name} (inactive)` : `${entry.id} (no longer exists)`)
                .join(', ')}
              . These are kept for history and cannot be selected for new records. Uncheck only if you
              want to drop the reference.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {staleSelections.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => toggleClass(entry.id)}
                  className="font-body text-xs text-stone hover:text-ink transition-colors underline underline-offset-2"
                >
                  Remove {entry.cls?.name ?? entry.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {person ? 'Save changes' : 'Add person'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-sm text-stone hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
