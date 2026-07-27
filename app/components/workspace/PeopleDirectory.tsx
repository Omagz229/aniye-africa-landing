"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  PeopleSourceType,
  Person,
  PersonStatus,
  RelationshipType,
  WorkspaceState,
} from '@/lib/workspace';
import {
  RELATIONSHIP_TYPES,
  getWorkspace,
  personFullName,
  sortRelationshipClasses,
  updateWorkspace,
} from '@/lib/workspace';
import {
  memberCountsByClass,
  peopleWithInvalidClassReferences,
  peopleWithoutClass,
} from '@/lib/people';
import PersonForm from './PersonForm';
import PeopleImport from './PeopleImport';

type Mode = 'list' | 'add' | 'edit' | 'import';

const SOURCE_STYLES: Record<PeopleSourceType, string> = {
  Manual: 'bg-stone/10 text-stone',
  CSV:    'bg-cream text-ink',
  HRIS:   'bg-ink text-cream',
};

export default function PeopleDirectory() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [stepLocked, setStepLocked] = useState(false);
  const [mode, setMode] = useState<Mode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<RelationshipType | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<PersonStatus | 'all'>('Active');

  // Confirmation
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (ws.setupStage === 'profile' || ws.setupStage === 'classes' || ws.setupStage === 'policies') {
      setStepLocked(true);
      return;
    }
    setWorkspace(ws);
  }, [router]);

  const classesById = useMemo(
    () => new Map((workspace?.relationshipClasses ?? []).map(c => [c.id, c])),
    [workspace],
  );

  const sortedClasses = useMemo(
    () => sortRelationshipClasses(workspace?.relationshipClasses ?? []),
    [workspace],
  );

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const person of workspace?.people ?? []) {
      if (person.country) set.add(person.country);
    }
    return [...set].sort();
  }, [workspace]);

  const filtered = useMemo(() => {
    const people = workspace?.people ?? [];
    const query = search.trim().toLowerCase();

    return people.filter(person => {
      if (statusFilter !== 'all' && person.status !== statusFilter) return false;
      if (countryFilter !== 'all' && person.country !== countryFilter) return false;
      if (classFilter !== 'all' && !person.relationshipClassIds.includes(classFilter)) return false;

      if (typeFilter !== 'all') {
        const matchesType = person.relationshipClassIds.some(
          id => classesById.get(id)?.type === typeFilter,
        );
        if (!matchesType) return false;
      }

      if (query !== '') {
        const haystack = [
          personFullName(person), person.email ?? '', person.phone ?? '', person.role ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [workspace, search, typeFilter, classFilter, countryFilter, statusFilter, classesById]);

  const memberCounts = useMemo(
    () => memberCountsByClass(workspace?.people ?? [], workspace?.relationshipClasses ?? []),
    [workspace],
  );

  function commit(patch: Partial<WorkspaceState>) {
    const updated = updateWorkspace(patch);
    if (updated) setWorkspace(updated);
    setConfirmWarning(null);
  }

  function setPersonStatus(id: string, status: PersonStatus) {
    if (!workspace) return;
    const now = new Date().toISOString();
    commit({
      people: workspace.people.map(p =>
        p.id === id
          ? { ...p, status, updatedAt: now, archivedAt: status === 'Archived' ? now : undefined }
          : p,
      ),
    });
  }

  function handleConfirm() {
    if (!workspace) return;

    const active = workspace.people.filter(p => p.status === 'Active');
    const unassigned = peopleWithoutClass(workspace.people);
    const invalidRefs = peopleWithInvalidClassReferences(workspace.people, workspace.relationshipClasses);

    const warnings: string[] = [];
    if (active.length === 0) {
      warnings.push('There are no active people in this workspace. You can continue and add them later, but no recognition can be scheduled until someone is here.');
    }
    if (unassigned.length > 0) {
      warnings.push(`${unassigned.length} active ${unassigned.length === 1 ? 'person has' : 'people have'} no Relationship Class, so no policy applies to them.`);
    }
    if (invalidRefs.length > 0) {
      warnings.push(`${invalidRefs.length} ${invalidRefs.length === 1 ? 'person references' : 'people reference'} a Relationship Class that is inactive or no longer exists. The references are preserved but will not resolve.`);
    }

    if (warnings.length > 0 && confirmWarning === null) {
      setConfirmWarning(warnings.join(' '));
      return;
    }

    const updated = updateWorkspace({ setupStage: 'programs' });
    if (updated) router.push('/workspace');
  }

  // ─── Gates ─────────────────────────────────────────────────────────────────

  if (stepLocked) {
    return (
      <BlockedState
        heading="Complete the earlier steps first"
        body="Confirm your Organization Profile, Relationship Classes, and Recognition Policies before adding people."
        href="/workspace"
        cta="Back to setup"
      />
    );
  }

  if (!workspace) return null;

  if (mode === 'add' || (mode === 'edit' && editingId)) {
    const person = mode === 'edit' ? workspace.people.find(p => p.id === editingId) ?? null : null;
    return (
      <PersonForm
        workspace={workspace}
        person={person}
        onSaved={(ws) => {
          setWorkspace(ws);
          setMode('list');
          setEditingId(null);
          setNotice(person ? 'Person updated.' : 'Person added.');
        }}
        onCancel={() => { setMode('list'); setEditingId(null); }}
      />
    );
  }

  if (mode === 'import') {
    return (
      <PeopleImport
        workspace={workspace}
        onImported={(ws, summary) => { setWorkspace(ws); setMode('list'); setNotice(summary); }}
        onCancel={() => setMode('list')}
      />
    );
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  const activeCount = workspace.people.filter(p => p.status === 'Active').length;
  const unassignedCount = peopleWithoutClass(workspace.people).length;
  const hasFilters =
    search.trim() !== '' || typeFilter !== 'all' || classFilter !== 'all' ||
    countryFilter !== 'all' || statusFilter !== 'Active';

  const selectClass =
    'rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-xs text-ink focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

  return (
    <div className="space-y-8">

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
            Who you recognize
          </h2>
          <p className="font-body text-stone">
            The employees, clients, and partners your policies apply to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setMode('import')}
            className="rounded-full border border-stone/25 font-body text-sm font-semibold text-ink px-5 py-2.5 hover:bg-white transition-colors"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setMode('add')}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 hover:shadow-md transition-all"
          >
            + Add person
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-4 bg-gold/15 rounded-xl px-4 py-3">
          <p className="font-body text-sm text-ink">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="text-stone/50 hover:text-ink transition-colors text-lg leading-none flex-shrink-0"
          >
            &times;
          </button>
        </div>
      )}

      {workspace.people.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone/30 py-16 px-6 text-center">
          <p className="font-body text-ink font-semibold mb-1">No people yet</p>
          <p className="font-body text-sm text-stone mb-6 max-w-md mx-auto">
            Add people one at a time, or import a CSV. Each person can belong to one or more
            Relationship Classes, which is how policies reach them.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setMode('import')}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
            >
              Import a CSV &#8594;
            </button>
            <button
              type="button"
              onClick={() => setMode('add')}
              className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors"
            >
              Add someone manually
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="font-display font-bold text-2xl text-ink">{activeCount}</p>
              <p className="font-body text-xs text-stone">Active</p>
            </div>
            {workspace.people.length - activeCount > 0 && (
              <div>
                <p className="font-display font-bold text-2xl text-ink">{workspace.people.length - activeCount}</p>
                <p className="font-body text-xs text-stone">Archived</p>
              </div>
            )}
            {unassignedCount > 0 && (
              <div>
                <p className="font-display font-bold text-2xl text-ink">{unassignedCount}</p>
                <p className="font-body text-xs text-stone">Unassigned</p>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, role"
              aria-label="Search people"
              className="flex-1 min-w-[12rem] rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-xs text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow"
            />
            <select value={typeFilter} aria-label="Filter by Relationship Type" className={selectClass}
              onChange={(e) => setTypeFilter(e.target.value as RelationshipType | 'all')}>
              <option value="all">All types</option>
              {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={classFilter} aria-label="Filter by Relationship Class" className={selectClass}
              onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">All classes</option>
              {sortedClasses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Untitled'} · L{c.level}{!c.isActive ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
            <select value={countryFilter} aria-label="Filter by country" className={selectClass}
              onChange={(e) => setCountryFilter(e.target.value)}>
              <option value="all">All countries</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} aria-label="Filter by status" className={selectClass}
              onChange={(e) => setStatusFilter(e.target.value as PersonStatus | 'all')}>
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch(''); setTypeFilter('all'); setClassFilter('all');
                  setCountryFilter('all'); setStatusFilter('Active');
                }}
                className="font-body text-xs text-stone hover:text-ink transition-colors px-2"
              >
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone/20 py-12 text-center">
              <p className="font-body text-sm text-stone">No people match these filters.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-2xl border border-stone/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone/10">
                        <Th>Name</Th><Th>Role</Th><Th>Contact</Th><Th>Country</Th>
                        <Th>Classes</Th><Th>Source</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(person => (
                        <tr
                          key={person.id}
                          className={`border-b border-stone/5 last:border-0 ${person.status === 'Archived' ? 'opacity-55' : ''}`}
                        >
                          <Td className="text-ink font-medium">{personFullName(person)}</Td>
                          <Td className="text-stone">{person.role || '—'}</Td>
                          <Td className="text-stone">{person.email || person.phone || '—'}</Td>
                          <Td className="text-stone">{person.country || '—'}</Td>
                          <Td><ClassBadges person={person} classesById={classesById} /></Td>
                          <Td>
                            <span className={`font-body text-xs rounded-full px-2 py-0.5 ${SOURCE_STYLES[person.sourceType]}`}>
                              {person.sourceType}
                            </span>
                          </Td>
                          <Td className="text-stone">{person.status}</Td>
                          <Td className="text-right whitespace-nowrap">
                            <RowActions
                              person={person}
                              onEdit={() => { setEditingId(person.id); setMode('edit'); }}
                              onArchive={() => setPersonStatus(person.id, 'Archived')}
                              onRestore={() => setPersonStatus(person.id, 'Active')}
                            />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-3">
                {filtered.map(person => (
                  <div
                    key={person.id}
                    className={`bg-white rounded-2xl border border-stone/20 p-4 space-y-2.5 ${person.status === 'Archived' ? 'opacity-55' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-sm font-semibold text-ink truncate">
                          {personFullName(person)}
                        </p>
                        {person.role && <p className="font-body text-xs text-stone">{person.role}</p>}
                      </div>
                      <span className={`font-body text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${SOURCE_STYLES[person.sourceType]}`}>
                        {person.sourceType}
                      </span>
                    </div>

                    {(person.email || person.phone) && (
                      <p className="font-body text-xs text-stone break-words">
                        {person.email || person.phone}
                        {person.country ? ` · ${person.country}` : ''}
                      </p>
                    )}

                    <ClassBadges person={person} classesById={classesById} />

                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-stone/10">
                      <span className="font-body text-xs text-stone/60">{person.status}</span>
                      <RowActions
                        person={person}
                        onEdit={() => { setEditingId(person.id); setMode('edit'); }}
                        onArchive={() => setPersonStatus(person.id, 'Archived')}
                        onRestore={() => setPersonStatus(person.id, 'Active')}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Class coverage */}
          <div className="bg-white rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">Coverage by class</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              {sortedClasses.filter(c => c.isActive).map(cls => {
                const counts = memberCounts.get(cls.id);
                return (
                  <div key={cls.id} className="flex items-baseline justify-between gap-3">
                    <span className="font-body text-sm text-ink truncate">
                      {cls.name || 'Untitled'}{' '}
                      <span className="text-stone/50 text-xs">L{cls.level}</span>
                    </span>
                    <span className="font-body text-xs text-stone flex-shrink-0">
                      {counts?.active ?? 0}
                      {counts && counts.total !== counts.active && (
                        <span className="text-stone/50"> of {counts.total}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="font-body text-xs text-stone/60 mt-3">
              Counts are derived from Person records, never stored on the class.
            </p>
          </div>
        </>
      )}

      {/* Confirm */}
      <div className="space-y-3 pt-2">
        {confirmWarning && (
          <div className="bg-white rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-sm font-semibold text-ink mb-1">Before you continue</p>
            <p className="font-body text-sm text-stone mb-2">{confirmWarning}</p>
            <p className="font-body text-xs text-stone/60">Confirm again to continue.</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {confirmWarning ? 'Confirm anyway →' : 'Confirm people →'}
        </button>
        <p className="font-body text-xs text-stone/60">
          {activeCount} active {activeCount === 1 ? 'person' : 'people'}
          {unassignedCount > 0 ? `, ${unassignedCount} without a class` : ''}. Confirming completes
          workspace configuration.
        </p>
      </div>

    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ClassBadges({
  person,
  classesById,
}: {
  person: Person;
  classesById: Map<string, { name: string; level: number; isActive: boolean }>;
}) {
  if (person.relationshipClassIds.length === 0) {
    return <span className="font-body text-xs text-stone/50 italic">Unassigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {person.relationshipClassIds.map(id => {
        const cls = classesById.get(id);
        if (!cls) {
          return (
            <span key={id} title="This class no longer exists"
              className="font-body text-xs rounded-full px-2 py-0.5 bg-stone/10 text-stone/60 line-through">
              {id}
            </span>
          );
        }
        return (
          <span
            key={id}
            title={cls.isActive ? undefined : 'This class is inactive'}
            className={`font-body text-xs rounded-full px-2 py-0.5 ${
              cls.isActive ? 'bg-cream text-ink' : 'bg-stone/10 text-stone/60'
            }`}
          >
            {cls.name || 'Untitled'} · L{cls.level}
            {!cls.isActive && ' (inactive)'}
          </span>
        );
      })}
    </div>
  );
}

function RowActions({
  person, onEdit, onArchive, onRestore,
}: {
  person: Person; onEdit: () => void; onArchive: () => void; onRestore: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <button type="button" onClick={onEdit}
        className="font-body text-xs font-semibold text-ink hover:text-gold transition-colors">
        Edit
      </button>
      {person.status === 'Active' ? (
        <button type="button" onClick={onArchive}
          className="font-body text-xs text-stone hover:text-ink transition-colors">
          Archive
        </button>
      ) : (
        <button type="button" onClick={onRestore}
          className="font-body text-xs text-stone hover:text-ink transition-colors">
          Restore
        </button>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left font-body text-xs text-stone uppercase tracking-wider px-4 py-3 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`font-body text-sm px-4 py-3 align-top ${className}`}>{children}</td>;
}

function BlockedState({
  heading, body, href, cta,
}: {
  heading: string; body: string; href: string; cta: string;
}) {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">{heading}</h2>
        <p className="font-body text-stone">{body}</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
      >
        {cta} &#8594;
      </Link>
    </div>
  );
}
