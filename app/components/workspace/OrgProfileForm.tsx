"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';
import {
  getWorkspace,
  saveWorkspace,
  SUPPORTED_CURRENCIES,
  CURRENCY_LABELS,
  TIMEZONES,
  TIMEZONE_LABELS,
} from '@/lib/workspace';
import { INDUSTRIES } from '@/lib/assessment';

const inputCls =
  'w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-sm text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow';

const selectCls =
  'w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-shadow appearance-none';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone/20 p-6 space-y-5">
      <p className="font-body text-xs text-stone uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-body text-sm font-medium text-ink mb-1.5">
        {label}
        {optional && (
          <span className="font-normal text-stone/60 ml-1">(optional)</span>
        )}
      </label>
      {children}
      {hint && (
        <p className="font-body text-xs text-stone/60 mt-1.5">{hint}</p>
      )}
    </div>
  );
}

export default function OrgProfileForm() {
  const router = useRouter();
  const [form, setForm] = useState<WorkspaceState | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    const ws = getWorkspace();
    if (ws) setForm(ws);
  }, []);

  function update(partial: Partial<WorkspaceState>) {
    setForm((prev) => (prev ? { ...prev, ...partial } : null));
    setSaveState('idle');
  }

  function handleSave() {
    if (!form) return;
    saveWorkspace(form);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  }

  function handleConfirm() {
    if (!form) return;
    saveWorkspace({ ...form, setupStage: 'classes' });
    router.push('/workspace');
  }

  if (!form) return null;

  return (
    <div className="space-y-6">

      {/* Page intro */}
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
          Organization Profile
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
          {form.companyName || 'Your Organization'}
        </h2>
        <p className="font-body text-sm text-stone mt-1">
          Pre-filled from your Relationship Assessment. Confirm and update as needed.
        </p>
      </div>

      {/* Company Details */}
      <Section title="Company Details">
        <Field label="Company name">
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            placeholder="Acme Corporation"
            className={inputCls}
          />
        </Field>
        <Field label="Website" optional>
          <input
            type="url"
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            placeholder="https://example.com"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Industry">
            <select
              value={form.industry}
              onChange={(e) => update({ industry: e.target.value })}
              className={selectCls}
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </Field>
          <Field label="Company size">
            <select
              value={form.employeeCount}
              onChange={(e) => update({ employeeCount: e.target.value })}
              className={selectCls}
            >
              <option value="">Select size</option>
              {['1–50', '51–200', '201–1,000', '1,000+'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Geographic Presence */}
      <Section title="Geographic Presence">
        <Field
          label="Countries of operation"
          hint="Separate multiple countries with commas"
        >
          <input
            type="text"
            value={form.operatingCountries.join(', ')}
            onChange={(e) =>
              update({
                operatingCountries: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Nigeria, Kenya, South Africa"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Operations */}
      <Section title="Operations">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Base currency">
            <select
              value={form.baseCurrency}
              onChange={(e) => update({ baseCurrency: e.target.value })}
              className={selectCls}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
              className={selectCls}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{TIMEZONE_LABELS[tz] ?? tz}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="font-body text-xs text-stone/70 leading-relaxed">
          Base currency governs all Relationship Policy budgets. Individual Policies may override with a
          different currency — exchange rates are locked at Program Approval.
        </p>
      </Section>

      {/* Primary Contact */}
      <Section title="Primary Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name">
            <input
              type="text"
              value={form.contactName}
              onChange={(e) => update({ contactName: e.target.value })}
              placeholder="Full name"
              className={inputCls}
            />
          </Field>
          <Field label="Role">
            <input
              type="text"
              value={form.contactRole}
              onChange={(e) => update({ contactRole: e.target.value })}
              placeholder="HR Director"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Email">
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => update({ contactEmail: e.target.value })}
            placeholder="name@company.com"
            className={inputCls}
          />
        </Field>
        <Field label="Phone" optional>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="+234 800 000 0000"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          className="rounded-full border border-stone/30 text-ink font-semibold text-sm px-6 py-3 transition-all hover:border-stone/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2"
        >
          {saveState === 'saved' ? '&#10003; Saved' : 'Save changes'}
        </button>
        <button
          onClick={handleConfirm}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Profile confirmed &#8594;
        </button>
      </div>

      <p className="font-body text-xs text-stone/60">
        Confirming your profile advances your workspace setup to Relationship Classes.
      </p>

    </div>
  );
}
