"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RelationshipClass, RelationshipType } from '@/lib/workspace';
import {
  getWorkspace,
  updateWorkspace,
  clampRelationshipLevel,
  nextLevelForType,
  sortRelationshipClasses,
  DEFAULT_RELATIONSHIP_CLASSES,
  RELATIONSHIP_LEVEL_MAX,
  RELATIONSHIP_LEVEL_MIN,
  RELATIONSHIP_TYPES,
} from '@/lib/workspace';

export default function RelationshipClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<RelationshipClass[] | null>(null);
  const [profileNotConfirmed, setProfileNotConfirmed] = useState(false);

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    if (ws.setupStage === 'profile') {
      setProfileNotConfirmed(true);
      return;
    }
    const loaded =
      ws.relationshipClasses && ws.relationshipClasses.length > 0
        ? ws.relationshipClasses
        : DEFAULT_RELATIONSHIP_CLASSES.map(c => ({ ...c }));
    setClasses(loaded);
  }, [router]);

  function persist(updated: RelationshipClass[]) {
    updateWorkspace({ relationshipClasses: updated });
  }

  function patchClass(id: string, patch: Partial<RelationshipClass>) {
    setClasses(prev => {
      if (!prev) return prev;
      const next = prev.map(c =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
      );
      persist(next);
      return next;
    });
  }

  function addCustomClass() {
    setClasses(prev => {
      const current = prev ?? [];
      const now = new Date().toISOString();
      const newClass: RelationshipClass = {
        id: `class-custom-${Date.now()}`,
        name: '',
        type: 'Other',
        level: nextLevelForType(current, 'Other'),
        description: '',
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const next = [...current, newClass];
      persist(next);
      return next;
    });
  }

  function removeCustomClass(id: string) {
    setClasses(prev => {
      if (!prev) return prev;
      const next = prev.filter(c => c.id !== id);
      persist(next);
      return next;
    });
  }

  function handleConfirm() {
    if (!classes) return;
    updateWorkspace({ setupStage: 'policies', relationshipClasses: classes });
    router.push('/workspace');
  }

  // Display order is canonical: by type, then ascending level. Storage order is
  // left alone so rows do not shuffle underneath an edit in progress.
  const ordered = useMemo(
    () => (classes ? sortRelationshipClasses(classes) : []),
    [classes],
  );

  if (profileNotConfirmed) {
    return (
      <div className="space-y-6 max-w-xl">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
            Relationship Classes
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            Complete your profile first
          </h2>
          <p className="font-body text-stone">
            Confirm your Organization Profile before configuring Relationship Classes.
          </p>
        </div>
        <Link
          href="/workspace/profile"
          className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
        >
          Go to Organization Profile &#8594;
        </Link>
      </div>
    );
  }

  if (!classes) return null;

  const activeCount = classes.filter(c => c.isActive).length;

  return (
    <div className="space-y-8">

      {/* Page intro */}
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
          Relationship Classes
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
          Define who matters
        </h2>
        <p className="font-body text-stone">
          Define the groups of people your organization recognizes differently.
        </p>
      </div>

      {/* Type and Level explainer */}
      <div className="bg-cream rounded-2xl border border-stone/20 p-5 space-y-3">
        <p className="font-body text-sm text-ink leading-relaxed">
          Each class drives distinct Recognition Policies — budgets, approval flows, gift
          preferences, and delivery timelines. Classes represent how your organization
          differentiates people, not just how you categorize them.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          <div>
            <p className="font-body text-xs font-semibold text-ink mb-0.5">Type</p>
            <p className="font-body text-xs text-stone leading-snug">
              The nature of the relationship — Employee, Client, Board, and so on.
            </p>
          </div>
          <div>
            <p className="font-body text-xs font-semibold text-ink mb-0.5">
              Level &mdash; 0 is highest
            </p>
            <p className="font-body text-xs text-stone leading-snug">
              Recognition priority within a type. Level 0 receives the highest recognition;
              higher numbers rank lower. Use as many levels ({RELATIONSHIP_LEVEL_MIN}&ndash;
              {RELATIONSHIP_LEVEL_MAX}) as your organization needs.
            </p>
          </div>
        </div>
      </div>

      {/* Class list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-body text-xs text-stone uppercase tracking-widest">
            {activeCount} active class{activeCount !== 1 ? 'es' : ''}
          </p>
          <p className="font-body text-xs text-stone/50">{classes.length} total</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
          {/* Column headers — desktop only */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_9rem_5rem_3.5rem_2rem] gap-3 px-5 py-3 border-b border-stone/10">
            <span className="font-body text-xs text-stone uppercase tracking-wider">Name</span>
            <span className="font-body text-xs text-stone uppercase tracking-wider">Type</span>
            <span className="font-body text-xs text-stone uppercase tracking-wider">Level</span>
            <span className="font-body text-xs text-stone uppercase tracking-wider text-center">Active</span>
            <span />
          </div>

          {ordered.map((cls, i) => (
            <ClassRow
              key={cls.id}
              cls={cls}
              isLast={i === ordered.length - 1}
              onChange={(patch) => patchClass(cls.id, patch)}
              onRemove={() => removeCustomClass(cls.id)}
            />
          ))}
        </div>

        {/* Add custom class */}
        <button
          type="button"
          onClick={addCustomClass}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-stone/30 py-3 font-body text-sm text-stone hover:border-stone/50 hover:text-ink hover:bg-white transition-all"
        >
          <span className="text-base leading-none font-medium">+</span>
          Add custom class
        </button>
        <p className="font-body text-xs text-stone/60 mt-2">
          A type can hold as many levels as you need — add several Employee classes at
          levels 0, 1, 2 and up to build your own ladder.
        </p>
      </div>

      {/* Policies note */}
      <div className="bg-white rounded-2xl border border-stone/20 p-5">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">Coming next</p>
        <p className="font-body text-sm text-ink font-semibold mb-1">
          Policies, budgets, approvals, and gift preferences
        </p>
        <p className="font-body text-sm text-stone">
          These will be configured per class in the Recognition Policies step.
        </p>
      </div>

      {/* Confirm CTA */}
      <div className="flex flex-col sm:flex-row items-start gap-3 pt-2">
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Confirm Relationship Classes &#8594;
        </button>
      </div>
      <p className="font-body text-xs text-stone/60 -mt-4">
        Confirming advances your workspace setup to Recognition Policies.
      </p>

    </div>
  );
}

// ─── ClassRow ────────────────────────────────────────────────────────────────

interface ClassRowProps {
  cls: RelationshipClass;
  isLast: boolean;
  onChange: (patch: Partial<RelationshipClass>) => void;
  onRemove: () => void;
}

const ghostInput =
  'bg-transparent font-body text-sm text-ink rounded-lg px-2 py-1 border border-transparent focus:border-stone/30 focus:bg-white focus:outline-none transition-colors w-full placeholder:text-stone/40';

const ghostSelect =
  'bg-transparent font-body text-xs text-stone rounded-lg px-2 py-1 border border-transparent focus:border-stone/30 focus:bg-white focus:outline-none transition-colors appearance-none w-full';

function ClassRow({ cls, isLast, onChange, onRemove }: ClassRowProps) {
  return (
    <div className={`px-4 py-3 ${!isLast ? 'border-b border-stone/10' : ''}`}>

      {/* Mobile layout: two rows */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={cls.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Class name"
            aria-label="Class name"
            className={`flex-1 rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow ${!cls.isActive ? 'opacity-50' : ''}`}
          />
          <Toggle active={cls.isActive} onToggle={() => onChange({ isActive: !cls.isActive })} />
          {!cls.isDefault && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${cls.name || 'class'}`}
              className="text-stone/40 hover:text-stone transition-colors text-xl leading-none flex-shrink-0 w-6 text-center"
            >
              &times;
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={cls.type}
            onChange={(e) => onChange({ type: e.target.value as RelationshipType })}
            aria-label="Relationship type"
            className="flex-1 rounded-lg border border-stone/20 bg-white px-3 py-1.5 font-body text-xs text-stone focus:outline-none focus:ring-2 focus:ring-gold transition-shadow appearance-none"
          >
            {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <LevelInput
            level={cls.level}
            onCommit={(level) => onChange({ level })}
            className="w-24 rounded-lg border border-stone/20 bg-white px-3 py-1.5 font-body text-xs text-stone focus:outline-none focus:ring-2 focus:ring-gold transition-shadow"
          />
        </div>
      </div>

      {/* Desktop layout: single row */}
      <div
        className={`hidden sm:grid sm:grid-cols-[1fr_9rem_5rem_3.5rem_2rem] gap-3 items-center ${!cls.isActive ? 'opacity-50' : ''}`}
      >
        <input
          type="text"
          value={cls.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Class name"
          aria-label="Class name"
          className={ghostInput}
        />
        <select
          value={cls.type}
          onChange={(e) => onChange({ type: e.target.value as RelationshipType })}
          aria-label="Relationship type"
          className={ghostSelect}
        >
          {RELATIONSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <LevelInput
          level={cls.level}
          onCommit={(level) => onChange({ level })}
          className={ghostSelect}
        />
        <div className="flex justify-center">
          <Toggle active={cls.isActive} onToggle={() => onChange({ isActive: !cls.isActive })} />
        </div>
        <div className="flex justify-center">
          {!cls.isDefault && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${cls.name || 'class'}`}
              className="text-stone/30 hover:text-stone transition-colors text-xl leading-none"
            >
              &times;
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── LevelInput ──────────────────────────────────────────────────────────────

/**
 * Level edits are held locally and committed on blur or Enter. Committing on
 * every keystroke would re-sort the list mid-edit, since level is part of the
 * display order.
 */
function LevelInput({
  level,
  onCommit,
  className,
}: {
  level: number;
  onCommit: (level: number) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(String(level));

  useEffect(() => {
    setDraft(String(level));
  }, [level]);

  function commit() {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isNaN(parsed) ? level : clampRelationshipLevel(parsed);
    setDraft(String(next));
    if (next !== level) onCommit(next);
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={RELATIONSHIP_LEVEL_MIN}
      max={RELATIONSHIP_LEVEL_MAX}
      step={1}
      value={draft}
      aria-label="Relationship level — 0 is highest"
      title="0 is the highest recognition priority within this type"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={className}
    />
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 ${
        active ? 'bg-gold' : 'bg-stone/25'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          active ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
