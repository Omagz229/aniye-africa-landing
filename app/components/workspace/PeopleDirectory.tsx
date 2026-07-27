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
  PERSON_STATUS_LABELS,
  RELATIONSHIP_TYPES,
  getWorkspace,
  personFullName,
  sortRelationshipClasses,
  updateWorkspace,
} from '@/lib/workspace';
import type { ImportSummary } from '@/lib/people';
import {
  memberCountsByClass,
  peopleWithInvalidClassReferences,
  peopleWithoutClass,
} from '@/lib/people';
import PersonForm from './PersonForm';
import PeopleImport from './PeopleImport';
import SetupProgress from './SetupProgress';
import ConfirmDialog from './ConfirmDialog';

type Mode = 'list' | 'choose' | 'add' | 'edit' | 'import';

const SOURCE_LABELS: Record<PeopleSourceType, string> = {
  Manual: 'Added by hand',
  CSV: 'From a file',
  HRIS: 'From your HR system',
};

const SOURCE_STYLES: Record<PeopleSourceType, string> = {
  Manual: 'bg-stone/10 text-stone',
  CSV: 'bg-cream text-ink',
  HRIS: 'bg-ink text-cream',
};

export default function PeopleDirectory() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [stepLocked, setStepLocked] = useState(false);
  const [mode, setMode] = useState<Mode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ headline: string; detail?: string } | null>(null);
  const [pendingArchive, setPendingArchive] = useState<Person | null>(null);
  const [pendingPause, setPendingPause] = useState<Person | null>(null);

  // Filters are an advanced tool — hidden until there are enough people for
  // them to earn their place (Doctrine §1.2).
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<RelationshipType | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<PersonStatus | 'all'>('Active');

  const [confirmWarning, setConfirmWarning] = useState<string[] | null>(null);

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
    for (const person of workspace?.people ?? []) if (person.country) set.add(person.country);
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
        if (!person.relationshipClassIds.some(id => classesById.get(id)?.type === typeFilter)) return false;
      }
      if (query !== '') {
        const haystack = [personFullName(person), person.email ?? '', person.phone ?? '', person.role ?? '']
          .join(' ').toLowerCase();
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

  function coverageLine(ws: WorkspaceState): string {
    const active = ws.people.filter(p => p.status === 'Active').length;
    const unassigned = peopleWithoutClass(ws.people).length;
    if (active === 0) return 'No one is in your directory yet.';
    const ready = active - unassigned;
    return unassigned === 0
      ? `All ${active} ${active === 1 ? 'person is' : 'people are'} ready to be recognised.`
      : `${ready} ${ready === 1 ? 'person is' : 'people are'} ready. ${unassigned} still ${unassigned === 1 ? 'needs a relationship group' : 'need a relationship group'}.`;
  }

  function handleConfirm() {
    if (!workspace) return;
    const active = workspace.people.filter(p => p.status === 'Active');
    const unassigned = peopleWithoutClass(workspace.people);
    const invalidRefs = peopleWithInvalidClassReferences(workspace.people, workspace.relationshipClasses);

    const warnings: string[] = [];
    if (active.length === 0) {
      warnings.push('There\'s nobody in your directory yet. You can continue and add people later — but nothing can be recognised until someone is here.');
    }
    if (unassigned.length > 0) {
      warnings.push(`${unassigned.length} ${unassigned.length === 1 ? 'person has' : 'people have'} no relationship group, so no rule reaches them yet.`);
    }
    if (invalidRefs.length > 0) {
      warnings.push(`${invalidRefs.length} ${invalidRefs.length === 1 ? 'person is' : 'people are'} linked to a group that's no longer in use. We keep the link for your records, but it won't apply a rule.`);
    }

    if (warnings.length > 0 && confirmWarning === null) {
      setConfirmWarning(warnings);
      return;
    }
    const updated = updateWorkspace({ setupStage: 'programs' });
    if (updated) router.push('/workspace');
  }

  // ─── Gates ─────────────────────────────────────────────────────────────────

  if (stepLocked) {
    return (
      <BlockedState
        heading="A couple of steps to go first"
        body="People slot into the relationship groups and recognition rules you've set up. Finish those and this step will be waiting."
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
        onSaved={(ws, saved, wasNew) => {
          setWorkspace(ws);
          setMode('list');
          setEditingId(null);
          setOutcome({
            headline: wasNew
              ? `${saved.firstName} ${saved.lastName} is in your directory.`
              : `${saved.firstName} ${saved.lastName} updated.`,
            detail: saved.relationshipClassIds.length === 0
              ? 'They don\'t have a relationship group yet, so no rule reaches them. Open their record to add one.'
              : coverageLine(ws),
          });
        }}
        onCancel={() => { setMode('list'); setEditingId(null); }}
      />
    );
  }

  if (mode === 'import') {
    return (
      <PeopleImport
        workspace={workspace}
        onImported={(ws, summary: ImportSummary) => {
          setWorkspace(ws);
          setOutcome({
            headline:
              summary.created > 0
                ? `${summary.created} ${summary.created === 1 ? 'person' : 'people'} added${summary.updated > 0 ? `, ${summary.updated} updated` : ''}.`
                : summary.updated > 0
                  ? `${summary.updated} ${summary.updated === 1 ? 'record' : 'records'} updated.`
                  : 'No changes were made.',
            detail: coverageLine(ws),
          });
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  if (mode === 'choose') {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            How would you like to add people?
          </h2>
          <p className="font-body text-stone">Either way, nothing is saved until you confirm.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <ChoiceCard
            title="Import a list"
            blurb="Best when you're setting up, or you already have a spreadsheet from HR. Add dozens or hundreds at once."
            cta="Upload a file"
            onClick={() => setMode('import')}
            recommended={workspace.people.length === 0}
          />
          <ChoiceCard
            title="Add one person"
            blurb="Best for a new hire, a new client, or anyone you're adding on their own."
            cta="Fill in their details"
            onClick={() => setMode('add')}
            recommended={workspace.people.length > 0}
          />
        </div>

        <button type="button" onClick={() => setMode('list')}
          className="font-body text-sm text-stone hover:text-ink transition-colors">
          Back to People
        </button>
      </div>
    );
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  const activeCount = workspace.people.filter(p => p.status === 'Active').length;
  const pausedCount = workspace.people.filter(p => p.status === 'Inactive').length;
  const archivedCount = workspace.people.filter(p => p.status === 'Archived').length;
  const unassignedCount = peopleWithoutClass(workspace.people).length;
  const isEmpty = workspace.people.length === 0;

  // One recommended next action, chosen from state (Doctrine §1.1, §1.3).
  const readyToConfirm = workspace.setupStage === 'people' && activeCount > 0;
  const primary = isEmpty
    ? { label: 'Add your first person', onClick: () => setMode('choose') }
    : readyToConfirm
      ? { label: 'Confirm people', onClick: handleConfirm }
      : { label: 'Add people', onClick: () => setMode('choose') };

  const hasFilters =
    search.trim() !== '' || typeFilter !== 'all' || classFilter !== 'all' ||
    countryFilter !== 'all' || statusFilter !== 'Active';

  const selectClass =
    'rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-xs text-ink focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

  return (
    <div className="space-y-8">

      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          Who you recognise
        </h2>
        <p className="font-body text-stone">
          {isEmpty
            ? 'The employees, clients and partners your recognition rules apply to.'
            : coverageLine(workspace)}
        </p>
      </div>

      {/* Success feedback — what happened, and what to do next */}
      {outcome && (
        <div className="bg-white rounded-2xl border border-stone/20 p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-body text-sm font-semibold text-ink mb-0.5">{outcome.headline}</p>
            {outcome.detail && <p className="font-body text-sm text-stone">{outcome.detail}</p>}
          </div>
          <button type="button" onClick={() => setOutcome(null)} aria-label="Dismiss"
            className="text-stone/40 hover:text-ink transition-colors text-lg leading-none flex-shrink-0">
            &times;
          </button>
        </div>
      )}

      {/* Primary action, always first and always alone in its weight class */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" onClick={primary.onClick}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
          {primary.label} &#8594;
        </button>
        {isEmpty ? (
          <button type="button" onClick={() => setMode('import')}
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
            Or import a list
          </button>
        ) : readyToConfirm ? (
          <button type="button" onClick={() => setMode('choose')}
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
            Add more people
          </button>
        ) : (
          <button type="button" onClick={() => setMode('import')}
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
            Or import a list
          </button>
        )}
      </div>

      {/* Confirmation warnings — shown once, then the user may proceed */}
      {confirmWarning && (
        <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-2">
          <p className="font-body text-sm font-semibold text-ink">Worth knowing before you continue</p>
          <ul className="space-y-1.5">
            {confirmWarning.map((warning, i) => (
              <li key={i} className="font-body text-sm text-stone flex items-start gap-2.5">
                <span aria-hidden className="text-stone/40">&bull;</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button type="button" onClick={handleConfirm}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
              Continue anyway &#8594;
            </button>
            <button type="button" onClick={() => setConfirmWarning(null)}
              className="font-body text-sm text-stone hover:text-ink transition-colors">
              Let me fix that first
            </button>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="bg-cream rounded-2xl border border-stone/20 p-6">
          <p className="font-body text-sm font-semibold text-ink mb-1">
            Adding people is the last piece of setup
          </p>
          <p className="font-body text-sm text-stone">
            Each person joins one or more of the relationship groups you defined. That&apos;s what
            connects them to a recognition rule — so Aniyé knows what to do, for whom, and when.
          </p>
        </div>
      ) : (
        <>
          {/* Filters — disclosed, not permanent furniture */}
          {workspace.people.length > 6 && (
            <div className="space-y-3">
              <button type="button" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}
                className="font-body text-sm text-stone hover:text-ink transition-colors">
                {showFilters ? 'Hide' : 'Find someone'} {hasFilters && !showFilters && '· filters on'}
              </button>

              {showFilters && (
                <div className="flex flex-wrap gap-2">
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email or role" aria-label="Search people"
                    className="flex-1 min-w-[12rem] rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-xs text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow" />
                  <select value={typeFilter} aria-label="Filter by relationship type" className={selectClass}
                    onChange={(e) => setTypeFilter(e.target.value as RelationshipType | 'all')}>
                    <option value="all">Any relationship</option>
                    {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={classFilter} aria-label="Filter by relationship group" className={selectClass}
                    onChange={(e) => setClassFilter(e.target.value)}>
                    <option value="all">Any group</option>
                    {sortedClasses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Untitled'} · Level {c.level}{!c.isActive ? ' (not in use)' : ''}
                      </option>
                    ))}
                  </select>
                  {countries.length > 0 && (
                    <select value={countryFilter} aria-label="Filter by country" className={selectClass}
                      onChange={(e) => setCountryFilter(e.target.value)}>
                      <option value="all">Any country</option>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <select value={statusFilter} aria-label="Filter by status" className={selectClass}
                    onChange={(e) => setStatusFilter(e.target.value as PersonStatus | 'all')}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Paused</option>
                    <option value="Archived">Archived</option>
                    <option value="all">Everyone</option>
                  </select>
                  {hasFilters && (
                    <button type="button"
                      onClick={() => {
                        setSearch(''); setTypeFilter('all'); setClassFilter('all');
                        setCountryFilter('all'); setStatusFilter('Active');
                      }}
                      className="font-body text-xs text-stone hover:text-ink transition-colors px-2">
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone/20 py-12 px-6 text-center">
              <p className="font-body text-sm text-ink mb-1">Nobody matches that</p>
              <p className="font-body text-sm text-stone mb-4">
                Try a different search, or clear what you&apos;ve set.
              </p>
              <button type="button"
                onClick={() => {
                  setSearch(''); setTypeFilter('all'); setClassFilter('all');
                  setCountryFilter('all'); setStatusFilter('Active');
                }}
                className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block bg-white rounded-2xl border border-stone/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone/10">
                        <Th>Name</Th><Th>Role</Th><Th>Contact</Th>
                        <Th>Relationship groups</Th><Th>Added</Th><Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(person => (
                        <tr key={person.id}
                          className={`border-b border-stone/5 last:border-0 ${person.status !== 'Active' ? 'opacity-60' : ''}`}>
                          <Td className="text-ink font-medium">
                            {personFullName(person)}
                            {person.status !== 'Active' && (
                              <span className="font-body text-xs text-stone/60 ml-2">
                                {PERSON_STATUS_LABELS[person.status]}
                              </span>
                            )}
                          </Td>
                          <Td className="text-stone">{person.role || '—'}</Td>
                          <Td className="text-stone">
                            {person.email || person.phone || '—'}
                            {person.country && <span className="text-stone/50"> · {person.country}</span>}
                          </Td>
                          <Td><ClassBadges person={person} classesById={classesById} /></Td>
                          <Td>
                            <span className={`font-body text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${SOURCE_STYLES[person.sourceType]}`}>
                              {SOURCE_LABELS[person.sourceType]}
                            </span>
                          </Td>
                          <Td className="text-right whitespace-nowrap">
                            <RowActions person={person}
                              onEdit={() => { setEditingId(person.id); setMode('edit'); }}
                              onPause={() => setPendingPause(person)}
                              onArchive={() => setPendingArchive(person)}
                              onReactivate={() => setPersonStatus(person.id, 'Active')} />
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
                  <div key={person.id}
                    className={`bg-white rounded-2xl border border-stone/20 p-4 space-y-2.5 ${person.status !== 'Active' ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-sm font-semibold text-ink truncate">
                          {personFullName(person)}
                        </p>
                        {person.role && <p className="font-body text-xs text-stone">{person.role}</p>}
                      </div>
                      <span className={`font-body text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${SOURCE_STYLES[person.sourceType]}`}>
                        {SOURCE_LABELS[person.sourceType]}
                      </span>
                    </div>
                    {(person.email || person.phone) && (
                      <p className="font-body text-xs text-stone break-words">
                        {person.email || person.phone}
                        {person.country ? ` · ${person.country}` : ''}
                      </p>
                    )}
                    <ClassBadges person={person} classesById={classesById} />
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-stone/10">
                      <span className="font-body text-xs text-stone/60">
                        {PERSON_STATUS_LABELS[person.status]}
                      </span>
                      <RowActions person={person}
                        onEdit={() => { setEditingId(person.id); setMode('edit'); }}
                        onPause={() => setPendingPause(person)}
                        onArchive={() => setPendingArchive(person)}
                        onReactivate={() => setPersonStatus(person.id, 'Active')} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Coverage — derived, and framed as reassurance rather than a report */}
          <div className="bg-white rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-sm font-semibold text-ink mb-3">Who&apos;s covered</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
              {sortedClasses.filter(c => c.isActive).map(cls => {
                const counts = memberCounts.get(cls.id);
                const active = counts?.active ?? 0;
                return (
                  <div key={cls.id} className="flex items-baseline justify-between gap-3">
                    <span className="font-body text-sm text-ink truncate">
                      {cls.name || 'Untitled'}{' '}
                      <span className="text-stone/50 text-xs">Level {cls.level}</span>
                    </span>
                    <span className={`font-body text-xs flex-shrink-0 ${active === 0 ? 'text-stone/45' : 'text-stone'}`}>
                      {active === 0 ? 'nobody yet' : `${active} ${active === 1 ? 'person' : 'people'}`}
                    </span>
                  </div>
                );
              })}
            </div>
            {archivedCount > 0 && (
              <p className="font-body text-xs text-stone/60 mt-3">
                {archivedCount} archived {archivedCount === 1 ? 'person is' : 'people are'} kept for
                your records and not counted here.
              </p>
            )}
          </div>
        </>
      )}

      <SetupProgress workspace={workspace} />

      {/* Pausing stops future recognition but keeps the person in the directory */}
      {pendingPause && (
        <ConfirmDialog
          title={`Pause ${personFullName(pendingPause)}?`}
          body="They stay in your directory and in your reports, but won't be included in any automatic recognition until you reactivate them."
          impact={[
            'Useful for parental leave, sabbaticals, or a relationship on hold',
            pendingPause.relationshipClassIds.length > 0
              ? `They stay in ${pendingPause.relationshipClassIds.length} relationship group${pendingPause.relationshipClassIds.length === 1 ? '' : 's'}`
              : 'They are not in any relationship group',
            'Reactivating is one click, whenever you are ready',
          ]}
          cancelLabel="Keep them active"
          confirmLabel="Pause recognition"
          onConfirm={() => { setPersonStatus(pendingPause.id, 'Inactive'); setPendingPause(null); }}
          onCancel={() => setPendingPause(null)}
        />
      )}

      {/* Archiving removes them from ordinary workflows entirely */}
      {pendingArchive && (
        <ConfirmDialog
          title={`Archive ${personFullName(pendingArchive)}?`}
          body="They're kept for your history but removed from your everyday lists, and won't be included in any recognition. Use this when someone has left."
          impact={[
            'They disappear from the People list unless you filter for Archived',
            pendingArchive.relationshipClassIds.length > 0
              ? `Their ${pendingArchive.relationshipClassIds.length} relationship group link${pendingArchive.relationshipClassIds.length === 1 ? '' : 's'} and all past recognition are kept`
              : 'All their past recognition is kept',
            'If they are only away for a while, pause them instead',
          ]}
          cancelLabel="Keep them active"
          confirmLabel="Archive person"
          onConfirm={() => { setPersonStatus(pendingArchive.id, 'Archived'); setPendingArchive(null); }}
          onCancel={() => setPendingArchive(null)}
        />
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ChoiceCard({
  title, blurb, cta, onClick, recommended,
}: {
  title: string; blurb: string; cta: string; onClick: () => void; recommended?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-2xl border p-5 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
        recommended ? 'border-gold bg-white' : 'border-stone/20 bg-white hover:border-stone/35'
      }`}>
      {recommended && (
        <span className="inline-block font-body text-xs text-ink bg-gold/20 rounded-full px-2.5 py-0.5 mb-2">
          Recommended
        </span>
      )}
      <p className="font-display font-semibold text-lg text-ink mb-1">{title}</p>
      <p className="font-body text-sm text-stone mb-3 leading-relaxed">{blurb}</p>
      <span className="font-body text-sm font-semibold text-ink">{cta} &#8594;</span>
    </button>
  );
}

function ClassBadges({
  person, classesById,
}: {
  person: Person;
  classesById: Map<string, { name: string; level: number; isActive: boolean }>;
}) {
  if (person.relationshipClassIds.length === 0) {
    return (
      <span className="font-body text-xs text-stone/60">
        No group yet
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {person.relationshipClassIds.map(id => {
        const cls = classesById.get(id);
        if (!cls) {
          return (
            <span key={id} title="This group has been deleted"
              className="font-body text-xs rounded-full px-2 py-0.5 bg-stone/10 text-stone/60">
              Deleted group
            </span>
          );
        }
        return (
          <span key={id} title={cls.isActive ? undefined : 'This group is no longer in use'}
            className={`font-body text-xs rounded-full px-2 py-0.5 ${
              cls.isActive ? 'bg-cream text-ink' : 'bg-stone/10 text-stone/60'
            }`}>
            {cls.name || 'Untitled'} · L{cls.level}
            {!cls.isActive && ' (not in use)'}
          </span>
        );
      })}
    </div>
  );
}

/**
 * ADR-008 — three states, three non-destructive actions.
 *
 * Reactivating is one click: it restores eligibility and loses nothing. Pausing
 * and archiving both change who gets recognised, so both are confirmed.
 */
function RowActions({
  person, onEdit, onPause, onArchive, onReactivate,
}: {
  person: Person;
  onEdit: () => void;
  onPause: () => void;
  onArchive: () => void;
  onReactivate: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-4">
      <button type="button" onClick={onEdit}
        className="font-body text-xs font-semibold text-ink hover:text-gold transition-colors">
        Edit
      </button>
      {person.status !== 'Active' && (
        <button type="button" onClick={onReactivate}
          className="font-body text-xs text-stone hover:text-ink transition-colors">
          Reactivate
        </button>
      )}
      {person.status === 'Active' && (
        <button type="button" onClick={onPause}
          className="font-body text-xs text-stone hover:text-ink transition-colors">
          Pause
        </button>
      )}
      {person.status !== 'Archived' && (
        <button type="button" onClick={onArchive}
          className="font-body text-xs text-stone hover:text-ink transition-colors">
          Archive
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
      <Link href={href}
        className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
        {cta} &#8594;
      </Link>
    </div>
  );
}
