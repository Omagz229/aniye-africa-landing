"use client";

import { useEffect, useRef, useState } from 'react';
import StepHeader from './StepHeader';
import { useRouter } from 'next/navigation';
import type {
  Money,
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
import { formatMoney, parseMoney, toMajorString, zero } from '@/lib/money';

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-sm text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow';

const selectCls =
  'w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow appearance-none';

const budgetInputCls =
  'w-28 sm:w-36 rounded-xl border border-stone/30 bg-white px-3 py-2 font-body text-sm text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow text-right';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildBlankPolicy(workspaceId: string, baseCurrency: string): RecognitionPolicy {
  const now = new Date().toISOString();
  return {
    id: `policy-${Date.now()}`,
    workspaceId,
    name: '',
    description: '',
    recognitionRules: RECOGNITION_MOMENT_TYPES.map(mt => {
      // ADR-007 — storage is canonical minor units from the very first write.
      const blank = zero(baseCurrency);
      return {
        momentType: mt,
        budgetPerPerson: blank.ok ? blank.value : { amountMinor: 0, currency: 'NGN' },
        isEnabled: false,
      };
    }),
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

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-1.5">
      <p className="font-body text-xs uppercase tracking-wide text-stone/60 sm:w-40 flex-shrink-0">{label}</p>
      <p className={`font-body text-sm ${value ? 'text-ink' : 'text-stone/50'}`}>{value ?? 'Not set'}</p>
    </div>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-stone/10">
        <p className="font-body text-xs text-stone uppercase tracking-widest">{label}</p>
      </div>
      <div className="px-5 sm:px-6 py-5 space-y-4">{children}</div>
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

/**
 * Budget entry, in the amounts a human actually types.
 *
 * The operator enters major units — "500000" for five hundred thousand naira.
 * Parsing to canonical minor units happens here, at the edge, on blur; the
 * `amountMinor` representation never appears in the interface, and no
 * floating-point value is ever written to the workspace.
 */
function BudgetInput({
  value,
  onCommit,
  onError,
}: {
  value: Money;
  onCommit: (next: Money) => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => (value.amountMinor === 0 ? '' : toMajorString(value)));

  useEffect(() => {
    setDraft(value.amountMinor === 0 ? '' : toMajorString(value));
  }, [value.amountMinor, value.currency]);

  function commit() {
    const raw = draft.trim();
    if (raw === '') {
      const blank = zero(value.currency);
      if (blank.ok) onCommit(blank.value);
      onError(null);
      return;
    }
    const parsed = parseMoney(raw, value.currency);
    if (!parsed.ok) {
      onError(parsed.reason);
      setDraft(value.amountMinor === 0 ? '' : toMajorString(value));
      return;
    }
    onError(null);
    onCommit(parsed.value.money);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={e => { setDraft(e.target.value); onError(null); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="0"
      aria-label="Budget per person"
      className={budgetInputCls}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  existingPolicy?: RecognitionPolicy;
  onCancel?: () => void;
}

/**
 * EX-M5 — a half-written rule used to vanish on navigation. Draft only: nothing
 * reaches `workspace.recognitionPolicies` until Save or Publish, and edits are
 * never autosaved, so an abandoned edit leaves the stored rule exactly as it was.
 */
const DRAFT_KEY = 'aniye_policy_draft';

/**
 * EX-H3 — four questions instead of one wall.
 *
 * The previous form put six sections, fourteen fields and nine occasion rows on
 * a single page: the highest cognitive load in the product, at the step users
 * understand least. Everything below step 2 has a sensible default, so the
 * guided order is name → occasions → delivery → review, and the rule is
 * publishable after step 2.
 */
const STEPS = ['What is this rule?', 'Which occasions?', 'How it is delivered', 'Review'];

export default function PolicyForm({ existingPolicy, onCancel }: Props) {
  const router = useRouter();
  // EX-H2 — /workspace/policies/new rendered this component with no props, so
  // the Cancel button never appeared and the only way out was the sidebar,
  // which is itself hidden on mobile. There is now always a way back.
  const leave = onCancel ?? (() => router.push('/workspace/policies'));
  const [form, setForm] = useState<RecognitionPolicy | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('NGN');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  /**
   * Step changes move focus to the new heading and are announced.
   *
   * Without this a keyboard or screen-reader user pressed Continue and focus
   * stayed on a button that had just been replaced — the view changed silently.
   * Focus is moved from the click handler rather than an effect, so it happens
   * exactly when the user acts and nowhere else.
   *
   * Scoped to this form. EX-M11 names `AssessmentWizard`, `PersonForm` and
   * `PeopleImport` as well, and none of those is addressed here.
   */
  const headingRef = useRef<HTMLDivElement>(null);

  function goToStep(next: number) {
    setBudgetError(null);
    setStep(next);
    // A macrotask, not rAF: this has to run *after* React has committed the new
    // step, and rAF can fire before the commit lands.
    setTimeout(() => headingRef.current?.focus(), 0);
  }
  const [showGifts, setShowGifts] = useState(false);
  const [resumed, setResumed] = useState<RecognitionPolicy | null>(null);
  const isEdit = !!existingPolicy;

  useEffect(() => {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    setBaseCurrency(ws.baseCurrency);
    if (existingPolicy) {
      setForm({ ...existingPolicy });
      return;
    }
    setForm(buildBlankPolicy(ws.organizationId, ws.baseCurrency));
    // Offered back rather than silently restored (EX-M5).
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RecognitionPolicy;
        if (parsed && typeof parsed === 'object' && parsed.id) setResumed(parsed);
      }
    } catch {
      // A malformed draft is simply not offered.
    }
  }, [router, existingPolicy]);

  // Autosave new rules only. Never edits.
  useEffect(() => {
    if (isEdit || resumed || !form) return;
    if (!form.name.trim() && !form.recognitionRules.some(r => r.isEnabled)) return;
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* convenience, not a contract */ }
  }, [form, isEdit, resumed]);

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
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clean up */ }
    router.push('/workspace/policies');
  }

  if (!form) return null;

  // ─── Resume prompt (EX-M5) ─────────────────────────────────────────────────
  if (resumed) {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Recognition rules</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            Pick up where you left off?
          </h2>
          <p className="font-body text-stone">
            You were writing{' '}
            <span className="font-semibold text-ink">{resumed.name.trim() || 'a rule'}</span>{' '}
            and didn&apos;t finish. Nothing was saved to your rules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button"
            onClick={() => { setForm(resumed); setResumed(null); }}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
            Continue &#8594;
          </button>
          <button type="button"
            onClick={() => { try { window.localStorage.removeItem(DRAFT_KEY); } catch {} setResumed(null); }}
            className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
            Start fresh
          </button>
        </div>
      </div>
    );
  }

  const isLast = step === STEPS.length - 1;
  const enabledRules = form.recognitionRules.filter(r => r.isEnabled);

  const canPublish = form.name.trim().length > 0 && form.recognitionRules.some(r => r.isEnabled);

  return (
    <div className="space-y-8">

      {/* Persistent way back (EX-H2) */}
      <div>
        <button
          type="button"
          onClick={leave}
          className="font-body text-sm text-stone hover:text-ink transition-colors mb-3 -ml-1 px-1 inline-flex items-center min-h-[44px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-stone"
        >
          &#8592; Back to recognition rules
        </button>
        <div ref={headingRef} tabIndex={-1} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded">
          <StepHeader
            eyebrow={isEdit ? 'Edit rule' : 'New rule'}
            title={isEdit ? (form.name || 'Untitled rule') : 'Write a recognition rule'}
            steps={STEPS}
            current={step}
          />
        </div>
        {/* Announced on change; visually redundant with the step list above. */}
        <p aria-live="polite" className="sr-only">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      {step === 0 && (
      <FormSection label="Rule details">
        <Field label="Policy name">
          <input
            type="text"
            value={form.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="e.g. Executive recognition"
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
      )}

      {step === 1 && (
      <FormSection label="Occasions and budgets">
        <p className="font-body text-xs text-stone/70 -mt-1">
          Turn on the occasions this rule covers, and set a budget per person for each.
        </p>
        <div className="divide-y divide-stone/10 -mx-5 sm:-mx-6">
          {form.recognitionRules.map(rule => (
            <div
              key={rule.momentType}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 sm:px-6 py-3.5 transition-opacity ${!rule.isEnabled ? 'opacity-50' : ''}`}
            >
              <Toggle
                active={rule.isEnabled}
                onToggle={() => patchRule(rule.momentType, { isEnabled: !rule.isEnabled })}
              />
              <span className="flex-1 min-w-[8rem] font-body text-sm text-ink">{rule.momentType}</span>
              {rule.isEnabled && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <BudgetInput
                    value={rule.budgetPerPerson}
                    onCommit={budgetPerPerson => patchRule(rule.momentType, { budgetPerPerson })}
                    onError={setBudgetError}
                  />
                  <span className="font-body text-xs text-stone w-8">{rule.budgetPerPerson.currency}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        {budgetError && (
          <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{budgetError}</p>
        )}
        <p className="font-body text-xs text-stone/60 -mb-1">
          Budgets are per person, per occasion, in {baseCurrency}.
        </p>
      </FormSection>
      )}

      {step === 2 && (
      <div className="space-y-8">
      <FormSection label="Approvals">
        <Field label="Who signs this off before it happens?">
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

      {!showGifts ? (
        <button type="button" onClick={() => setShowGifts(true)}
          className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-2 inline-flex items-center min-h-[44px] py-2">
          Set gift preferences
        </button>
      ) : (
      <FormSection label="Gift preferences">
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
      )}

      <FormSection label="Delivery">
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
      </div>
      )}

      {/* Step 3 — Review. Nothing is written until an action here. */}
      {step === 3 && (
        <FormSection label="Review">
          <ReviewRow label="Name" value={form.name.trim() || undefined} />
          <ReviewRow label="Description" value={form.description.trim() || undefined} />
          <ReviewRow
            label="Occasions"
            value={enabledRules.length === 0 ? undefined
              : enabledRules.map(r => `${r.momentType} · ${formatMoney(r.budgetPerPerson)}`).join(', ')}
          />
          <ReviewRow label="Approval" value={form.approvalWorkflow === 'None' ? 'No approval required' : `${form.approvalWorkflow} approval`} />
          <ReviewRow label="Delivery" value={form.deliveryRequirement} />
          <ReviewRow label="Delivery timing" value={form.preferredDeliveryWindow.trim() || undefined} />
          <ReviewRow label="Preferred gifts" value={form.preferredGiftCategories.join(', ') || undefined} />
          <ReviewRow label="Excluded gifts" value={form.excludedCategories.join(', ') || undefined} />
          <ReviewRow label="Signature required" value={form.signatureRequired ? 'Yes — recipient signs on delivery' : 'No'} />
          <ReviewRow label="Proof of delivery" value={form.proofRequired ? 'Yes — photo or document required' : 'No'} />
          <ReviewRow label="Reporting" value={form.reportingCadence === 'None' ? 'No reporting' : form.reportingCadence} />
          <p className="font-body text-xs text-stone/60 pt-1">
            A draft can be edited freely. Publishing makes this rule assignable to a relationship group.
          </p>
        </FormSection>
      )}

      {/* Navigation — one clear next action per step (Doctrine §1.1) */}
      <div className="flex flex-col sm:flex-row items-start gap-3 pt-2">
        {!isLast ? (
          <button
            type="button"
            onClick={() => goToStep(Math.min(STEPS.length - 1, step + 1))}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
          >
            Continue &#8594;
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => save('Published')}
              disabled={!canPublish}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Publish rule
            </button>
            <button
              type="button"
              onClick={() => save('Draft')}
              className="rounded-full border border-stone/30 text-ink font-semibold text-sm px-6 py-3 hover:border-stone/60 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2"
            >
              Save as draft
            </button>
          </>
        )}
        {step > 0 && (
          <button
            type="button"
            onClick={() => goToStep(Math.max(0, step - 1))}
            className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={leave}
          className="font-body text-sm text-stone/70 hover:text-ink transition-colors sm:ml-auto inline-flex items-center min-h-[44px] py-2"
        >
          Cancel
        </button>
      </div>

      {isLast && !canPublish && (
        <p className="font-body text-xs text-stone/60 -mt-4">
          {!form.name.trim()
            ? 'Give this rule a name before you can publish it.'
            : 'Turn on at least one occasion before you can publish this rule.'}
        </p>
      )}

    </div>
  );
}
