"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RelationshipClass, RelationshipCategory, RelationshipTier } from '@/lib/workspace';
import {
  getWorkspace,
  updateWorkspace,
  DEFAULT_RELATIONSHIP_CLASSES,
} from '@/lib/workspace';

const CATEGORIES: RelationshipCategory[] = [
  'Internal', 'Client', 'Governance', 'Partner', 'Supplier', 'Community', 'Other',
];
const TIERS: RelationshipTier[] = ['Strategic', 'Priority', 'Standard', 'Custom'];

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
    const newClass: RelationshipClass = {
      id: `class-custom-${Date.now()}`,
      name: '',
      category: 'Other',
      description: '',
      tier: 'Standard',
      isDefault: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setClasses(prev => {
      const next = [...(prev ?? []), newClass];
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

      {/* Why classes matter */}
      <div className="bg-cream rounded-2xl border border-stone/20 p-5">
        <p className="font-body text-sm text-ink leading-relaxed">
          Each class drives distinct Relationship Policies — budgets, approval flows, gift
          preferences, and delivery timelines. Classes represent how your organization
          differentiates people, not just how you categorize them.
        </p>
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
          <div className="hidden sm:grid sm:grid-cols-[1fr_9rem_9rem_3.5rem_2rem] gap-3 px-5 py-3 border-b border-stone/10">
            <span className="font-body text-xs text-stone uppercase tracking-wider">Name</span>
            <span className="font-body text-xs text-stone uppercase tracking-wider">Category</span>
            <span className="font-body text-xs text-stone uppercase tracking-wider">Tier</span>
            <span className="font-body text-xs text-stone uppercase tracking-wider text-center">Active</span>
            <span />
          </div>

          {classes.map((cls, i) => (
            <ClassRow
              key={cls.id}
              cls={cls}
              isLast={i === classes.length - 1}
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
      </div>

      {/* Policies note */}
      <div className="bg-white rounded-2xl border border-stone/20 p-5">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">Coming next</p>
        <p className="font-body text-sm text-ink font-semibold mb-1">
          Policies, budgets, approvals, and gift preferences
        </p>
        <p className="font-body text-sm text-stone">
          These will be configured per class in the Relationship Policies step.
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
        Confirming advances your workspace setup to Relationship Policies.
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
            className={`flex-1 rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow ${!cls.isActive ? 'opacity-50' : ''}`}
          />
          <Toggle active={cls.isActive} onToggle={() => onChange({ isActive: !cls.isActive })} />
          {!cls.isDefault && (
            <button
              type="button"
              onClick={onRemove}
              className="text-stone/40 hover:text-stone transition-colors text-xl leading-none flex-shrink-0 w-6 text-center"
            >
              &times;
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={cls.category}
            onChange={(e) => onChange({ category: e.target.value as RelationshipCategory })}
            className="flex-1 rounded-lg border border-stone/20 bg-white px-3 py-1.5 font-body text-xs text-stone focus:outline-none focus:ring-2 focus:ring-gold transition-shadow appearance-none"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={cls.tier}
            onChange={(e) => onChange({ tier: e.target.value as RelationshipTier })}
            className="flex-1 rounded-lg border border-stone/20 bg-white px-3 py-1.5 font-body text-xs text-stone focus:outline-none focus:ring-2 focus:ring-gold transition-shadow appearance-none"
          >
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Desktop layout: single row */}
      <div
        className={`hidden sm:grid sm:grid-cols-[1fr_9rem_9rem_3.5rem_2rem] gap-3 items-center ${!cls.isActive ? 'opacity-50' : ''}`}
      >
        <input
          type="text"
          value={cls.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Class name"
          className={ghostInput}
        />
        <select
          value={cls.category}
          onChange={(e) => onChange({ category: e.target.value as RelationshipCategory })}
          className={ghostSelect}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={cls.tier}
          onChange={(e) => onChange({ tier: e.target.value as RelationshipTier })}
          className={ghostSelect}
        >
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex justify-center">
          <Toggle active={cls.isActive} onToggle={() => onChange({ isActive: !cls.isActive })} />
        </div>
        <div className="flex justify-center">
          {!cls.isDefault && (
            <button
              type="button"
              onClick={onRemove}
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
