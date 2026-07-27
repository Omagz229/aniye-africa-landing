"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  PolicyAssignment,
  PolicyStatus,
  RecognitionPolicy,
  RelationshipClass,
  RelationshipType,
  WorkspaceState,
} from '@/lib/workspace';
import {
  assignmentScope,
  getWorkspace,
  isAssignablePolicy,
  sortRelationshipClasses,
  updateWorkspace,
} from '@/lib/workspace';
import {
  activeClassesWithoutAssignment,
  hasAnyResolvableAssignment,
  resolvePolicyAssignment,
  validateNewAssignment,
} from '@/lib/assignments';
import SetupProgress from './SetupProgress';
import ConfirmDialog from './ConfirmDialog';

const STATUS_STYLES: Record<PolicyStatus, string> = {
  Draft:     'bg-stone/10 text-stone',
  Published: 'bg-gold/15 text-ink',
  Archived:  'bg-stone/8 text-stone/50',
};

export default function PolicyAssignmentsPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [stepLocked, setStepLocked] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [pendingWarning, setPendingWarning] = useState<RelationshipClass[] | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PolicyAssignment | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<PolicyAssignment | null>(null);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (ws.setupStage === 'profile' || ws.setupStage === 'classes') {
      setStepLocked(true);
      return;
    }
    setWorkspace(ws);
  }, [router]);

  function commit(patch: Partial<WorkspaceState>) {
    const updated = updateWorkspace(patch);
    if (updated) setWorkspace(updated);
    setConfirmError(null);
    setPendingWarning(null);
  }

  const activeClasses = useMemo(
    () => (workspace ? sortRelationshipClasses(workspace.relationshipClasses.filter(c => c.isActive)) : []),
    [workspace],
  );

  const assignablePolicies = useMemo(
    () => (workspace ? workspace.recognitionPolicies.filter(isAssignablePolicy) : []),
    [workspace],
  );

  // ─── Mutations ─────────────────────────────────────────────────────────────

  function addAssignment(classId: string, policyId: string, countryCode: string, priority: number) {
    if (!workspace) return { ok: false as const, reason: 'Workspace unavailable.' };

    const validation = validateNewAssignment(
      { relationshipClassId: classId, recognitionPolicyId: policyId, countryCode, priority },
      workspace.relationshipClasses,
      workspace.recognitionPolicies,
    );
    if (!validation.ok) return validation;

    const now = new Date().toISOString();
    const assignment: PolicyAssignment = {
      id: `assignment-${crypto.randomUUID()}`,
      relationshipClassId: classId,
      recognitionPolicyId: policyId,
      countryCode: validation.countryCode,
      priority,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    commit({ policyAssignments: [...workspace.policyAssignments, assignment] });
    return { ok: true as const };
  }

  function setAssignmentActive(id: string, isActive: boolean) {
    if (!workspace) return;
    commit({
      policyAssignments: workspace.policyAssignments.map(a =>
        a.id === id ? { ...a, isActive, updatedAt: new Date().toISOString() } : a,
      ),
    });
  }

  function removeAssignment(id: string) {
    if (!workspace) return;
    commit({ policyAssignments: workspace.policyAssignments.filter(a => a.id !== id) });
  }

  function renameClass(id: string, name: string) {
    if (!workspace) return;
    commit({
      relationshipClasses: workspace.relationshipClasses.map(c =>
        c.id === id ? { ...c, name, updatedAt: new Date().toISOString() } : c,
      ),
    });
  }

  function handleConfirm() {
    if (!workspace) return;

    if (!hasAnyResolvableAssignment(
      workspace.relationshipClasses,
      workspace.policyAssignments,
      workspace.recognitionPolicies,
    )) {
      setConfirmError(
        'Connect at least one published rule to an active group before continuing.',
      );
      return;
    }

    const unassigned = activeClassesWithoutAssignment(
      workspace.relationshipClasses,
      workspace.policyAssignments,
      workspace.recognitionPolicies,
    );

    // Warn once, then let the operator proceed — partial coverage is a normal
    // starting point, not an error.
    if (unassigned.length > 0 && pendingWarning === null) {
      setPendingWarning(unassigned);
      return;
    }

    const updated = updateWorkspace({ setupStage: 'people' });
    if (updated) router.push('/workspace');
  }

  // ─── Gates ─────────────────────────────────────────────────────────────────

  if (stepLocked) {
    return (
      <BlockedState
        eyebrow="Who each rule applies to"
        heading="A couple of steps to go first"
        body="Confirm your organization details and relationship groups, then you can connect rules to groups."
        href="/workspace"
        cta="Back to setup"
      />
    );
  }

  if (!workspace) return null;

  if (activeClasses.length === 0) {
    return (
      <BlockedState
        eyebrow="Who each rule applies to"
        heading="Turn on a relationship group first"
        body="This step connects a group to a rule, and you have no active groups. Turn one on, or add a new one, then come back."
        href="/workspace/classes"
        cta="Go to relationship groups"
      />
    );
  }

  if (assignablePolicies.length === 0) {
    const hasAnyPolicy = workspace.recognitionPolicies.length > 0;
    return (
      <BlockedState
        eyebrow="Who each rule applies to"
        heading="Publish a recognition rule first"
        body={
          hasAnyPolicy
            ? 'Only a published rule can be used here. Yours are all still drafts or archived — publish one, then come back.'
            : 'Only a published rule can be used here. Write a recognition rule and publish it, then come back.'
        }
        href="/workspace/policies"
        cta="Go to recognition rules"
      />
    );
  }

  // ─── Main ──────────────────────────────────────────────────────────────────

  const grouped = groupByType(activeClasses);

  return (
    <div className="space-y-8">

      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
          Who each rule applies to
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          Connect groups to rules
        </h2>
        <p className="font-body text-stone">
          Decide which recognition rule covers each group — everywhere, or in one country.
        </p>
      </div>

      <div className="bg-cream rounded-2xl border border-stone/20 p-5 space-y-3">
        <p className="font-body text-sm text-ink leading-relaxed">
          Rules are reusable. One rule can cover several groups, and one group can have several
          assignments — a default for everywhere, plus country-specific exceptions.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          <div>
            <p className="font-body text-xs font-semibold text-ink mb-0.5">Scope</p>
            <p className="font-body text-xs text-stone leading-snug">
              A country-specific assignment wins over the everywhere one, in that country.
            </p>
          </div>
          <div>
            <p className="font-body text-xs font-semibold text-ink mb-0.5">Priority</p>
            <p className="font-body text-xs text-stone leading-snug">
              When two assignments share a scope, the higher priority wins. Default is 0.
            </p>
          </div>
        </div>
        <div className="pt-1">
          <Link
            href="/workspace/policies"
            className="font-body text-xs font-semibold text-ink hover:text-gold transition-colors"
          >
            Manage your recognition rules &#8594;
          </Link>
        </div>
      </div>

      {grouped.map(([type, classes]) => (
        <div key={type} className="space-y-3">
          <p className="font-body text-xs text-stone uppercase tracking-widest">{type}</p>
          <div className="space-y-3">
            {classes.map(cls => (
              <ClassAssignmentCard
                key={cls.id}
                cls={cls}
                workspace={workspace}
                assignablePolicies={assignablePolicies}
                onAdd={(policyId, countryCode, priority) =>
                  addAssignment(cls.id, policyId, countryCode, priority)
                }
                onSetActive={(id, isActive) => {
                  // Turning one on is harmless; turning one off changes which
                  // rule reaches the group, so it is confirmed.
                  const target = workspace.policyAssignments.find(a => a.id === id);
                  if (isActive || !target) setAssignmentActive(id, true);
                  else setPendingDeactivate(target);
                }}
                onRemove={(id) => {
                  const target = workspace.policyAssignments.find(a => a.id === id);
                  if (target) setPendingRemove(target);
                }}
                onRename={(name) => renameClass(cls.id, name)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Confirm */}
      <div className="space-y-3 pt-2">
        {confirmError && (
          <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">
            {confirmError}
          </p>
        )}
        {pendingWarning && pendingWarning.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-sm font-semibold text-ink mb-1">
              {pendingWarning.length} active group{pendingWarning.length !== 1 ? 's have' : ' has'} no
              rule yet
            </p>
            <p className="font-body text-sm text-stone mb-2">
              {pendingWarning.map(c => c.name || 'Untitled group').join(', ')}. Nobody in{' '}
              {pendingWarning.length === 1 ? 'that group' : 'those groups'} will be recognized until
              a rule is connected. You can carry on and come back to this.
            </p>
            <p className="font-body text-xs text-stone/60">
              Confirm again to continue.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {pendingWarning ? 'Continue anyway →' : 'Confirm and continue →'}
        </button>
        <p className="font-body text-xs text-stone/60">
          Next you&apos;ll add the people who belong to these groups.
        </p>
      </div>

      <SetupProgress workspace={workspace} compact />

      {pendingDeactivate && (
        <ConfirmDialog
          title="Turn off this assignment?"
          body="The group keeps its other assignments, but this one stops applying. Nothing is deleted — you can turn it back on whenever you like."
          impact={assignmentImpact(pendingDeactivate, workspace)}
          cancelLabel="Keep assignment"
          confirmLabel="Turn off assignment"
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => {
            setAssignmentActive(pendingDeactivate.id, false);
            setPendingDeactivate(null);
          }}
        />
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove this assignment?"
          body="This cannot be undone. If you only want to pause it, turn it off instead — that keeps the record and can be reversed."
          impact={assignmentImpact(pendingRemove, workspace)}
          cancelLabel="Keep assignment"
          confirmLabel="Remove assignment"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            removeAssignment(pendingRemove.id);
            setPendingRemove(null);
          }}
        />
      )}

    </div>
  );
}

/** Names the concrete consequence of touching one assignment. */
function assignmentImpact(assignment: PolicyAssignment, workspace: WorkspaceState): string[] {
  const cls = workspace.relationshipClasses.find(c => c.id === assignment.relationshipClassId);
  const policy = workspace.recognitionPolicies.find(p => p.id === assignment.recognitionPolicyId);
  const scope = assignmentScope(assignment);

  const resolution = cls
    ? resolvePolicyAssignment({
        relationshipClassId: cls.id,
        countryCode: assignment.countryCode,
        classes: workspace.relationshipClasses,
        assignments: workspace.policyAssignments,
        policies: workspace.recognitionPolicies,
      })
    : null;

  const inEffect = resolution?.status === 'resolved' && resolution.assignment.id === assignment.id;

  return [
    `Group: ${cls?.name || 'unknown group'}`,
    `Rule: ${policy?.name || 'a rule that no longer exists'}`,
    scope === 'Country' ? `Applies in ${assignment.countryCode} only` : 'Applies everywhere',
    inEffect
      ? 'This is the assignment currently in effect for that group'
      : 'This is not the assignment currently in effect',
  ];
}

// ─── Class card ──────────────────────────────────────────────────────────────

interface ClassCardProps {
  cls: RelationshipClass;
  workspace: WorkspaceState;
  assignablePolicies: RecognitionPolicy[];
  onAdd: (policyId: string, countryCode: string, priority: number) => { ok: boolean; reason?: string };
  onSetActive: (id: string, isActive: boolean) => void;
  onRemove: (id: string) => void;
  onRename: (name: string) => void;
}

function ClassAssignmentCard({
  cls,
  workspace,
  assignablePolicies,
  onAdd,
  onSetActive,
  onRemove,
  onRename,
}: ClassCardProps) {
  const [adding, setAdding] = useState(false);

  const assignments = workspace.policyAssignments
    .filter(a => a.relationshipClassId === cls.id)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const aScope = assignmentScope(a);
      const bScope = assignmentScope(b);
      if (aScope !== bScope) return aScope === 'Country' ? -1 : 1;
      return b.priority - a.priority;
    });

  const resolution = resolvePolicyAssignment({
    relationshipClassId: cls.id,
    classes: workspace.relationshipClasses,
    assignments: workspace.policyAssignments,
    policies: workspace.recognitionPolicies,
  });

  return (
    <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">

      {/* Class header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-stone/10">
        <input
          type="text"
          value={cls.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="Class name"
          aria-label="Class name"
          className="flex-1 min-w-0 bg-transparent font-body text-sm font-semibold text-ink rounded-lg px-2 py-1 border border-transparent focus:border-stone/30 focus:bg-white focus:outline-none transition-colors placeholder:text-stone/40"
        />
        <span className="font-body text-xs text-stone bg-cream rounded-full px-2.5 py-0.5 flex-shrink-0">
          Level {cls.level}
        </span>
      </div>

      {/* Assignments */}
      {assignments.length === 0 ? (
        <p className="px-5 py-4 font-body text-sm text-stone/60">
          No assignment yet — this class receives no recognition until a policy is assigned.
        </p>
      ) : (
        <ul className="divide-y divide-stone/10">
          {assignments.map(assignment => {
            const policy = workspace.recognitionPolicies.find(
              p => p.id === assignment.recognitionPolicyId,
            );
            const scope = assignmentScope(assignment);
            const isWinner =
              resolution.status === 'resolved' && resolution.assignment.id === assignment.id;

            return (
              <li
                key={assignment.id}
                className={`px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${!assignment.isActive ? 'opacity-50' : ''}`}
              >
                <span
                  className={`font-body text-xs rounded-full px-2.5 py-0.5 flex-shrink-0 ${
                    scope === 'Country' ? 'bg-ink text-cream' : 'bg-stone/10 text-stone'
                  }`}
                >
                  {scope === 'Country' ? assignment.countryCode : 'Global'}
                </span>

                <span className="font-body text-sm text-ink flex-1 min-w-0 truncate">
                  {policy
                    ? policy.name || 'Untitled policy'
                    : <span className="text-stone/60 italic">Policy no longer exists</span>}
                </span>

                {policy && (
                  <span className={`font-body text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${STATUS_STYLES[policy.status]}`}>
                    {policy.status}
                  </span>
                )}

                <span className="font-body text-xs text-stone/60 flex-shrink-0">
                  priority {assignment.priority}
                </span>

                {isWinner && (
                  <span className="font-body text-xs text-ink bg-gold/15 rounded-full px-2 py-0.5 flex-shrink-0">
                    In effect
                  </span>
                )}

                <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={() => onSetActive(assignment.id, !assignment.isActive)}
                    className="font-body text-xs text-stone hover:text-ink transition-colors"
                  >
                    {assignment.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(assignment.id)}
                    aria-label="Remove assignment"
                    className="text-stone/30 hover:text-stone transition-colors text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Resolution summary */}
      {resolution.status === 'resolved' && resolution.skipped.length > 0 && (
        <p className="px-5 pb-3 font-body text-xs text-stone/70">
          {resolution.skipped[0].detail} The next applicable assignment is in effect.
        </p>
      )}

      {/* Add */}
      <div className="px-5 py-3 border-t border-stone/10">
        {adding ? (
          <AddAssignmentForm
            assignablePolicies={assignablePolicies}
            onCancel={() => setAdding(false)}
            onSubmit={(policyId, countryCode, priority) => {
              const result = onAdd(policyId, countryCode, priority);
              if (result.ok) setAdding(false);
              return result;
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="font-body text-xs font-semibold text-ink hover:text-gold transition-colors"
          >
            + Add assignment
          </button>
        )}
      </div>

    </div>
  );
}

// ─── Add form ────────────────────────────────────────────────────────────────

function AddAssignmentForm({
  assignablePolicies,
  onSubmit,
  onCancel,
}: {
  assignablePolicies: RecognitionPolicy[];
  onSubmit: (policyId: string, countryCode: string, priority: number) => { ok: boolean; reason?: string };
  onCancel: () => void;
}) {
  const [policyId, setPolicyId] = useState(assignablePolicies[0]?.id ?? '');
  const [scope, setScope] = useState<'Global' | 'Country'>('Global');
  const [countryCode, setCountryCode] = useState('');
  const [priority, setPriority] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const fieldClass =
    'rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-xs text-ink focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

  function submit() {
    const parsedPriority = Number.parseInt(priority, 10);
    if (Number.isNaN(parsedPriority)) {
      setError('Priority must be a whole number.');
      return;
    }
    const result = onSubmit(policyId, scope === 'Country' ? countryCode : '', parsedPriority);
    if (!result.ok) setError(result.reason ?? 'That assignment could not be created.');
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem_5rem]">
        <select
          value={policyId}
          onChange={(e) => { setPolicyId(e.target.value); setError(null); }}
          aria-label="Recognition rule"
          className={fieldClass}
        >
          {assignablePolicies.map(p => (
            <option key={p.id} value={p.id}>{p.name || 'Untitled policy'}</option>
          ))}
        </select>

        <select
          value={scope}
          onChange={(e) => { setScope(e.target.value as 'Global' | 'Country'); setError(null); }}
          aria-label="Scope"
          className={fieldClass}
        >
          <option value="Global">Global</option>
          <option value="Country">Country-specific</option>
        </select>

        <input
          type="text"
          value={countryCode}
          onChange={(e) => { setCountryCode(e.target.value.toUpperCase()); setError(null); }}
          placeholder="NG"
          maxLength={2}
          disabled={scope === 'Global'}
          aria-label="Country code"
          className={`${fieldClass} uppercase disabled:opacity-40 disabled:cursor-not-allowed`}
        />

        <input
          type="number"
          step={1}
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setError(null); }}
          aria-label="Priority"
          className={fieldClass}
        />
      </div>

      {error && <p className="font-body text-xs text-ink bg-gold/15 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          className="rounded-full bg-ink text-cream font-semibold text-xs px-4 py-2 hover:brightness-125 transition-all"
        >
          Add assignment
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-xs text-stone hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Blocked state ───────────────────────────────────────────────────────────

function BlockedState({
  eyebrow, heading, body, href, cta,
}: {
  eyebrow: string; heading: string; body: string; href: string; cta: string;
}) {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">{eyebrow}</p>
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Preserves the canonical sort order while splitting into per-type runs. */
function groupByType(classes: RelationshipClass[]): Array<[RelationshipType, RelationshipClass[]]> {
  const groups: Array<[RelationshipType, RelationshipClass[]]> = [];
  for (const cls of classes) {
    const last = groups[groups.length - 1];
    if (last && last[0] === cls.type) last[1].push(cls);
    else groups.push([cls.type, [cls]]);
  }
  return groups;
}
