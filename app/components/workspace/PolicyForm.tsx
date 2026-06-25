"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  RecognitionPolicy,
  RecognitionRule,
  ApprovalWorkflow,
  DeliveryRequirement,
  ReportingCadence,
} from '@/lib/workspace';
import {
  getWorkspace,
  updateWorkspace,
  RECOGNITION_MOMENT_TYPES,
  GIFT_CATEGORIES,
} from '@/lib/workspace';

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-sm text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow';

const selectCls =
  'w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow appearance-none';

const budgetInputCls =
  'w-36 rounded-xl border border-stone/30 bg-white px-3 py-2 font-body text-sm text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow text-right';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildBlankPolicy(workspaceId: string, baseCurrency: string): RecognitionPolicy {
  const now = new Date().toISOString();
  return {
    id: `policy-${Date.now()}`,
    workspaceId,
    name: '',
    description: '',
    recognitionRules: RECOGNITION_MOMENT_TYPES.map(mt => ({
      momentType: mt,
      budgetPerPerson: { amount: 0, currency: baseCurrency },
      isEnabled: false,
    })),
    approvalWorkflow: 'None',
    preferredGiftCategories: [],
    excludedCategories: [],
    deliveryRequirement: 'Standard',
    preferredDeliveryWindow: '3 business days before the occasion',
    signatureRequired: false,
    proofRequired: false,
    reportingCadence: 'Monthly',
    status: 'Draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
      <div className="px-6 py-4 border-b border-stone/10">
        <p className="font-body text-xs text-stone uppercase tracking-widest">{label}</p>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-body text-sm font-medium text-ink mb-1.5">
        {label}
        {optional && <span className="font-normal text-stone/60 ml-1">(optional)</span>}
      </label>
      {children}
      {hint && <p className="font-body text-xs text-stone/60 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  existingPolicy?: RecognitionPolicy;
  onCancel?: () => void;
}

export default function PolicyForm({ existingPolicy, onCancel }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<RecognitionPolicy | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('NGN');

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    setBaseCurrency(ws.baseCurrency);
    if (existingPolicy) {
      setForm({ ...existingPolicy });
    } else {
      setForm(buildBlankPolicy(ws.organizationId, ws.baseCurrency));
    }
  }, [router, existingPolicy]);

  function patch(partial: Partial<RecognitionPolicy>) {
    setForm(prev => prev ? { ...prev, ...partial, updatedAt: new Date().toISOString() } : null);
  }

  function patchRule(momentType: string, rulePatch: Partial<RecognitionRule>) {
    setForm(prev => {
      if (!prev) return null;
      const rules = prev.recognitionRules.map(r =>
        r.momentType === momentType ? { ...r, ...rulePatch } : r
      );
      return { ...prev, recognitionRules: rules, updatedAt: new Date().toISOString() };
    });
  }

  function toggleCategory(category: string, field: 'preferredGiftCategories' | 'excludedCategories') {
    setForm(prev => {
      if (!prev) return null;
      const current = prev[field];
      const next = current.includes(category)
        ? current.filter(c => c !== category)
        : [...current, category];
      return { ...prev, [field]: next, updatedAt: new Date().toISOString() };
    });
  }

  function save(status: 'Draft' | 'Published') {
    if (!form) return;
    const ws = getWorkspace();
    if (!ws) return;
    const now = new Date().toISOString();
    const toSave: RecognitionPolicy = {
      ...form,
      status,
      updatedAt: now,
      ...(status === 'Published' ? { publishedAt: now } : {}),
    };
    const existing = ws.recognitionPolicies ?? [];
    const idx = existing.findIndex(p => p.id === toSave.id);
    const updated = idx >= 0
      ? existing.map((p, i) => (i === idx ? toSave : p))
      : [...existing, toSave];
    updateWorkspace({ recognitionPolicies: updated });
    router.push('/workspace/policies');
  }

  if (!form) return null;

  const canPublish = form.name.trim().length > 0 && form.recognitionRules.some(r => r.isEnabled);
  const isEdit = !!existingPolicy;

  return (
    <div className="space-y-8">

      {/* Page intro */}
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
          {isEdit ? 'Edit' : 'New'} Recognition Policy
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
          {isEdit ? (form.name || 'Untitled Policy') : 'Create a Recognition Policy'}
        </h2>
        {!isEdit && (
          <p className="font-body text-stone mt-1">
            Policies are reusable. You&apos;ll assign them to Relationship Classes in the next step.
          </p>
        )}
      </div>

      {/* Section 0: Policy Details */}
      <FormSection label="Policy Details">
        <Field label="Policy name">
          <input
            type="text"
            value={form.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="e.g. Executive Recognition Policy"
            className={inputCls}
          />
        </Field>
        <Field label="Description" optional hint="Describe the purpose and intended scope of this policy.">
          <textarea
            value={form.description}
            onChange={e => patch({ description: e.target.value })}
            placeholder="e.g. Governs recognition for Executive Leadership — high-touch, hand-delivered, CEO-approved."
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </FormSection>

      {/* Section 1: Recognition Rules */}
      <FormSection label="Recognition Rules">
        <p className="font-body text-xs text-stone/70 -mt-1">
          Enable the moment types this policy covers. Set a per-person budget for each.
        </p>
        <div className="divide-y divide-stone/10 -mx-6">
          {form.recognitionRules.map(rule => (
            <div
              key={rule.momentType}
              className={`flex items-center gap-4 px-6 py-3.5 transition-opacity ${!rule.isEnabled ? 'opacity-50' : ''}`}
            >
              <Toggle
                active={rule.isEnabled}
                onToggle={() => patchRule(rule.momentType, { isEnabled: !rule.isEnabled })}
              />
              <span className="flex-1 font-body text-sm text-ink">{rule.momentType}</span>
              {rule.isEnabled && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="number"
                    min={0}
                    value={rule.budgetPerPerson.amount || ''}
                    onChange={e =>
                      patchRule(rule.momentType, {
                        budgetPerPerson: {
                          amount: parseFloat(e.target.value) || 0,
                          currency: rule.budgetPerPerson.currency || baseCurrency,
                        },
                      })
                    }
                    placeholder="0"
                    className={budgetInputCls}
                  />
                  <span className="font-body text-xs text-stone w-8">{rule.budgetPerPerson.currency || baseCurrency}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="font-body text-xs text-stone/60 -mb-1">
          Budgets are per person, per moment. Currency defaults to your workspace base currency ({baseCurrency}).
        </p>
      </FormSection>

      {/* Section 2: Approval Workflow */}
      <FormSection label="Approval Workflow">
        <Field label="Who must approve before a program can execute?">
          <select
            value={form.approvalWorkflow}
            onChange={e => patch({ approvalWorkflow: e.target.value as ApprovalWorkflow })}
            className={selectCls}
          >
            <option value="None">No approval required</option>
            <option value="Manager">Manager approval</option>
            <option value="Finance">Finance approval</option>
            <option value="Executive">Executive approval</option>
          </select>
        </Field>
        {form.approvalWorkflow !== 'None' && (
          <p className="font-body text-xs text-stone/70">
            Any program referencing this policy will require {form.approvalWorkflow.toLowerCase()} sign-off before moments can be dispatched.
          </p>
        )}
      </FormSection>

      {/* Section 3: Experience Preferences */}
      <FormSection label="Experience Preferences">
        <div>
          <p className="font-body text-sm font-medium text-ink mb-3">Preferred gift categories</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GIFT_CATEGORIES.map(cat => {
              const preferred = form.preferredGiftCategories.includes(cat);
              const excluded = form.excludedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    if (excluded) return;
                    toggleCategory(cat, 'preferredGiftCategories');
                  }}
                  disabled={excluded}
                  className={`text-left rounded-xl px-3 py-2.5 font-body text-xs transition-all border ${
                    preferred
                      ? 'bg-gold/10 border-gold/40 text-ink font-semibold'
                      : excluded
                      ? 'border-stone/15 text-stone/30 cursor-not-allowed'
                      : 'border-stone/20 text-stone hover:border-stone/40 hover:text-ink'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="font-body text-sm font-medium text-ink mb-1.5">Excluded categories</p>
          <p className="font-body text-xs text-stone/60 mb-3">
            Categories that are never appropriate for this policy — regardless of intent.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GIFT_CATEGORIES.map(cat => {
              const preferred = form.preferredGiftCategories.includes(cat);
              const excluded = form.excludedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    if (preferred) return;
                    toggleCategory(cat, 'excludedCategories');
                  }}
                  disabled={preferred}
                  className={`text-left rounded-xl px-3 py-2.5 font-body text-xs transition-all border ${
                    excluded
                      ? 'bg-stone/10 border-stone/40 text-ink font-semibold'
                      : preferred
                      ? 'border-stone/15 text-stone/30 cursor-not-allowed'
                      : 'border-stone/20 text-stone hover:border-stone/40 hover:text-ink'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </FormSection>

      {/* Section 4: Delivery Requirements */}
      <FormSection label="Delivery Requirements">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Delivery method">
            <select
              value={form.deliveryRequirement}
              onChange={e => patch({ deliveryRequirement: e.target.value as DeliveryRequirement })}
              className={selectCls}
            >
              <option value="Standard">Standard delivery</option>
              <option value="Courier">Courier (same-day / next-day)</option>
              <option value="HandDelivered">Hand-delivered by Aniyé</option>
              <option value="Digital">Digital delivery only</option>
            </select>
          </Field>
          <Field label="Delivery timing">
            <input
              type="text"
              value={form.preferredDeliveryWindow}
              onChange={e => patch({ preferredDeliveryWindow: e.target.value })}
              placeholder="e.g. 3 business days before the occasion"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center justify-between gap-4 bg-cream rounded-xl px-4 py-3 flex-1">
            <div>
              <p className="font-body text-sm font-medium text-ink">Signature required</p>
              <p className="font-body text-xs text-stone/60">Recipient must sign on delivery</p>
            </div>
            <Toggle active={form.signatureRequired} onToggle={() => patch({ signatureRequired: !form.signatureRequired })} />
          </div>
          <div className="flex items-center justify-between gap-4 bg-cream rounded-xl px-4 py-3 flex-1">
            <div>
              <p className="font-body text-sm font-medium text-ink">Proof of delivery</p>
              <p className="font-body text-xs text-stone/60">Photo or document required</p>
            </div>
            <Toggle active={form.proofRequired} onToggle={() => patch({ proofRequired: !form.proofRequired })} />
          </div>
        </div>
      </FormSection>

      {/* Section 5: Reporting */}
      <FormSection label="Reporting">
        <Field
          label="Reporting cadence"
          hint="How often should recognition activity reports be generated for programs using this policy?"
        >
          <select
            value={form.reportingCadence}
            onChange={e => patch({ reportingCadence: e.target.value as ReportingCadence })}
            className={selectCls}
          >
            <option value="None">No reporting</option>
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
            <option value="Quarterly">Quarterly</option>
          </select>
        </Field>
      </FormSection>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-start gap-3 pt-2">
        <button
          type="button"
          onClick={() => save('Draft')}
          className="rounded-full border border-stone/30 text-ink font-semibold text-sm px-6 py-3 hover:border-stone/60 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={() => save('Published')}
          disabled={!canPublish}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Publish Policy
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="font-body text-sm text-stone hover:text-ink transition-colors py-3"
          >
            Cancel
          </button>
        )}
      </div>

      {!canPublish && form.name.trim().length > 0 && (
        <p className="font-body text-xs text-stone/60 -mt-4">
          Enable at least one Recognition Rule to publish this policy.
        </p>
      )}
      {!form.name.trim() && (
        <p className="font-body text-xs text-stone/60 -mt-4">
          Add a policy name to publish.
        </p>
      )}

    </div>
  );
}
