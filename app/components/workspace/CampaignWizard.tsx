"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Money, RelationshipClass, WorkspaceState } from '@/lib/workspace';
import { RECOGNITION_MOMENT_TYPES, sortRelationshipClasses, updateWorkspace } from '@/lib/workspace';
import { formatMoney, parseMoney, toMajorString } from '@/lib/money';
import type { AllocationPreview, PopulationSummary } from '@/lib/programs';
import {
  activateCampaign,
  blankEnvelope,
  checkActivation,
  createCampaignDraft,
  previewAllocations,
  summarizePopulation,
} from '@/lib/programs';
import StepHeader from './StepHeader';

/**
 * Draft continuity (Doctrine §2.12).
 *
 * Versioned key: a draft written by an older wizard shape is discarded rather
 * than restored into a form that no longer matches it. Nothing here is a
 * Program — the canonical record is written once, at activation.
 */
const DRAFT_KEY = 'aniye_program_draft_v1';

interface Draft {
  name: string;
  description: string;
  occasionType: string;
  relationshipClassId: string;
  campaignStartDate: string;
  campaignEndDate: string;
  /** Major-unit strings, keyed by currency. Parsed at the edge. */
  budgets: Record<string, string>;
  step: number;
}

const EMPTY_DRAFT: Draft = {
  name: '', description: '', occasionType: '', relationshipClassId: '',
  campaignStartDate: '', campaignEndDate: '', budgets: {}, step: 0,
};

const STEPS = ['What are we marking?', 'Who does it cover?', 'When and budget', 'Review'];

const field =
  'w-full rounded-lg border border-stone/20 bg-white px-3 py-2.5 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';
const labelClass = 'block font-body text-sm font-medium text-ink mb-1.5';

/** Reject anything that is not a well-formed draft of the current shape. */
function readDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const d = parsed as Partial<Draft>;
    if (typeof d.name !== 'string' || typeof d.occasionType !== 'string') return null;
    if (d.budgets !== undefined && (typeof d.budgets !== 'object' || d.budgets === null)) return null;
    if (!d.name && !d.occasionType && !d.relationshipClassId) return null;
    const step = typeof d.step === 'number' && d.step >= 0 && d.step < STEPS.length ? d.step : 0;
    return { ...EMPTY_DRAFT, ...d, budgets: d.budgets ?? {}, step };
  } catch {
    return null;
  }
}

function clearDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export default function CampaignWizard({ workspace }: { workspace: WorkspaceState }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resumed, setResumed] = useState<Draft | null>(null);
  const [checked, setChecked] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [confirmStartOver, setConfirmStartOver] = useState(false);

  useEffect(() => {
    const saved = readDraft();
    if (saved) setResumed(saved);
    setChecked(true);
  }, []);

  useEffect(() => {
    if (resumed || !checked) return;
    if (!draft.name && !draft.occasionType && !draft.relationshipClassId) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, step }));
    } catch {
      // Autosave is a convenience, not a contract.
    }
  }, [draft, step, resumed, checked]);

  const activeClasses = useMemo(
    () => sortRelationshipClasses(workspace.relationshipClasses.filter(c => c.isActive)),
    [workspace.relationshipClasses],
  );

  const selectedClass = activeClasses.find(c => c.id === draft.relationshipClassId);

  const population: PopulationSummary | null = useMemo(
    () => draft.relationshipClassId
      ? summarizePopulation(draft.relationshipClassId, workspace.people, workspace.relationshipClasses)
      : null,
    [draft.relationshipClassId, workspace.people, workspace.relationshipClasses],
  );

  const preview: AllocationPreview | null = useMemo(
    () => draft.relationshipClassId && draft.occasionType
      ? previewAllocations({
          relationshipClassId: draft.relationshipClassId,
          occasionType: draft.occasionType,
          people: workspace.people,
          classes: workspace.relationshipClasses,
          assignments: workspace.policyAssignments,
          policies: workspace.recognitionPolicies,
        })
      : null,
    [draft.relationshipClassId, draft.occasionType, workspace],
  );

  /** Envelopes parsed from the major-unit fields the operator typed. */
  const envelopes: Money[] = useMemo(() => {
    if (!preview) return [];
    return preview.byCurrency.map(allocation => {
      const typed = draft.budgets[allocation.currency];
      if (typed === undefined || typed.trim() === '') return blankEnvelope(allocation.currency);
      const parsed = parseMoney(typed, allocation.currency);
      return parsed.ok ? parsed.value.money : blankEnvelope(allocation.currency);
    });
  }, [preview, draft.budgets]);

  const activation = useMemo(() => {
    if (!draft.relationshipClassId || !draft.occasionType) return null;
    return checkActivation({
      relationshipClassId: draft.relationshipClassId,
      occasionType: draft.occasionType,
      campaignStartDate: draft.campaignStartDate,
      campaignEndDate: draft.campaignEndDate,
      budgetEnvelopes: envelopes,
      people: workspace.people,
      classes: workspace.relationshipClasses,
      assignments: workspace.policyAssignments,
      policies: workspace.recognitionPolicies,
    });
  }, [draft, envelopes, workspace]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setError(null);
  }

  // Prefill each budget with the current allocation — the recommended minimum.
  useEffect(() => {
    if (step !== 2 || !preview) return;
    setDraft(prev => {
      const budgets = { ...prev.budgets };
      let changed = false;
      for (const allocation of preview.byCurrency) {
        if (budgets[allocation.currency] === undefined) {
          budgets[allocation.currency] = toMajorString(allocation.total);
          changed = true;
        }
      }
      return changed ? { ...prev, budgets } : prev;
    });
  }, [step, preview]);

  function next() {
    if (step === 0) {
      if (draft.name.trim() === '') { setError('Give this campaign a name so you can find it later.'); return; }
      if (draft.occasionType === '') { setError('Choose the occasion this campaign marks.'); return; }
    }
    if (step === 1 && draft.relationshipClassId === '') {
      setError('Choose the group of people this campaign covers.'); return;
    }
    if (step === 2) {
      if (!draft.campaignStartDate || !draft.campaignEndDate) { setError('Add a start and end date.'); return; }
    }
    setError(null);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  }

  function handleActivate() {
    const now = new Date().toISOString();
    const program = createCampaignDraft(
      {
        name: draft.name,
        description: draft.description,
        relationshipClassId: draft.relationshipClassId,
        occasionType: draft.occasionType,
        campaignStartDate: draft.campaignStartDate,
        campaignEndDate: draft.campaignEndDate,
        budgetEnvelopes: envelopes,
      },
      now,
      `program-${crypto.randomUUID()}`,
    );

    // Eligibility is recomputed here — the preview may be minutes stale.
    const result = activateCampaign(
      program,
      {
        relationshipClassId: program.relationshipClassId,
        occasionType: program.occasionType,
        people: workspace.people,
        classes: workspace.relationshipClasses,
        assignments: workspace.policyAssignments,
        policies: workspace.recognitionPolicies,
      },
      now,
    );

    if (!result.ok) {
      setError(result.blockers[0].message);
      setStep(3);
      return;
    }

    const updated = updateWorkspace({ programs: [...workspace.programs, result.program] });
    if (!updated) return;
    clearDraft();
    router.push(`/workspace/programs/${result.program.id}`);
  }

  if (!checked) return null;

  // ─── Resume ────────────────────────────────────────────────────────────────
  if (resumed) {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Campaigns</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            Pick up where you left off?
          </h2>
          <p className="font-body text-stone">
            You were setting up{' '}
            <span className="font-semibold text-ink">{resumed.name || 'a campaign'}</span> and
            didn&apos;t finish. Nothing has been activated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button"
            onClick={() => { setDraft(resumed); setStep(resumed.step); setResumed(null); }}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
            Continue &#8594;
          </button>
          <button type="button" onClick={() => setConfirmStartOver(true)}
            className="font-body text-sm text-stone hover:text-ink transition-colors">
            Start over
          </button>
        </div>
        {confirmStartOver && (
          <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-2">
            <p className="font-body text-sm font-semibold text-ink">Discard that draft?</p>
            <p className="font-body text-sm text-stone">
              Everything you entered for &ldquo;{resumed.name || 'that campaign'}&rdquo; will be lost.
              Nothing was activated, so nothing else changes.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={() => setConfirmStartOver(false)}
                className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
                Keep the draft
              </button>
              <button type="button"
                onClick={() => { clearDraft(); setResumed(null); setConfirmStartOver(false); }}
                className="font-body text-sm text-stone hover:text-ink transition-colors">
                Discard and start over
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="max-w-2xl space-y-6">
      <StepHeader eyebrow="Campaigns" title="New campaign" steps={STEPS} current={step} />

      <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 space-y-5">

        {/* ── 1. What are we marking? ── */}
        {step === 0 && (
          <>
            <p className="font-body text-sm text-stone">
              A campaign recognises one group of people, for one occasion, over a set period.
            </p>
            <div>
              <label className={labelClass} htmlFor="cw-name">Campaign name</label>
              <input id="cw-name" className={field} value={draft.name} autoFocus
                onChange={e => set('name', e.target.value)} placeholder="December client appreciation" />
            </div>
            <div>
              <label className={labelClass} htmlFor="cw-occasion">What are we marking?</label>
              <select id="cw-occasion" className={field} value={draft.occasionType}
                onChange={e => set('occasionType', e.target.value)}>
                <option value="">Choose an occasion</option>
                {RECOGNITION_MOMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <p className="font-body text-xs text-stone/70 mt-1.5">
                Your recognition rules set the budget for each occasion.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="cw-desc">
                Short description <span className="font-normal text-stone/60 text-xs ml-1">Optional</span>
              </label>
              <input id="cw-desc" className={field} value={draft.description}
                onChange={e => set('description', e.target.value)} placeholder="End-of-year thank you" />
            </div>
          </>
        )}

        {/* ── 2. Who does it cover? ── */}
        {step === 1 && (
          <>
            <div>
              <p className="font-body text-sm text-ink mb-1">Which group does this campaign cover?</p>
              <p className="font-body text-sm text-stone">
                A campaign covers one group. The active people in it are frozen when you activate.
              </p>
            </div>

            {activeClasses.length === 0 ? (
              <p className="font-body text-sm text-stone/70">
                You have no active relationship groups. Turn one on before creating a campaign.
              </p>
            ) : (
              <div className="space-y-2">
                {activeClasses.map(cls => (
                  <GroupOption
                    key={cls.id}
                    cls={cls}
                    selected={draft.relationshipClassId === cls.id}
                    recommended={activeClasses.length === 1}
                    count={summarizePopulation(cls.id, workspace.people, workspace.relationshipClasses).eligible.length}
                    onSelect={() => set('relationshipClassId', cls.id)}
                  />
                ))}
              </div>
            )}

            {population && selectedClass && (
              <div className="bg-cream rounded-xl px-4 py-3 space-y-2">
                <p className="font-body text-sm text-ink">
                  <span className="font-semibold">{population.eligible.length}</span>{' '}
                  active {population.eligible.length === 1 ? 'person' : 'people'} in {selectedClass.name}
                  {population.countries.length > 0 && ` across ${population.countries.join(', ')}`}.
                </p>
                {(population.pausedCount > 0 || population.archivedCount > 0 || population.missingCountry.length > 0) && (
                  <ul className="space-y-0.5">
                    {population.pausedCount > 0 && (
                      <Detail>{population.pausedCount} paused — not included</Detail>
                    )}
                    {population.archivedCount > 0 && (
                      <Detail>{population.archivedCount} archived — not included</Detail>
                    )}
                    {population.missingCountry.length > 0 && (
                      <Detail>{population.missingCountry.length} with no country recorded</Detail>
                    )}
                  </ul>
                )}
                {preview && preview.unresolved.length > 0 && (
                  <p className="font-body text-xs text-stone">
                    {preview.unresolved.length}{' '}
                    {preview.unresolved.length === 1 ? 'person does' : 'people do'} not yet have a
                    rule for {draft.occasionType}. You&apos;ll see how to fix that before activating.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 3. When and budget ── */}
        {step === 2 && (
          <>
            <div>
              <p className="font-body text-sm text-ink mb-1">When does it run, and what&apos;s reserved?</p>
              <p className="font-body text-sm text-stone">
                Budgets are per currency. We&apos;ve filled in what your current rules allow.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="cw-start">Start date</label>
                <input id="cw-start" type="date" className={field} value={draft.campaignStartDate}
                  onChange={e => set('campaignStartDate', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="cw-end">End date</label>
                <input id="cw-end" type="date" className={field} value={draft.campaignEndDate}
                  onChange={e => set('campaignEndDate', e.target.value)} />
              </div>
            </div>

            {preview && preview.byCurrency.length > 0 ? (
              <div className="space-y-3">
                {preview.byCurrency.map(allocation => (
                  <div key={allocation.currency}>
                    <label className={labelClass} htmlFor={`cw-budget-${allocation.currency}`}>
                      {allocation.currency} budget
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="font-body text-sm text-stone w-10 flex-shrink-0">{allocation.currency}</span>
                      <input
                        id={`cw-budget-${allocation.currency}`}
                        className={field}
                        inputMode="decimal"
                        value={draft.budgets[allocation.currency] ?? ''}
                        onChange={e => set('budgets', { ...draft.budgets, [allocation.currency]: e.target.value })}
                      />
                    </div>
                    <p className="font-body text-xs text-stone/70 mt-1.5">
                      {allocation.peopleCount} {allocation.peopleCount === 1 ? 'person' : 'people'} ·
                      your rules currently allow {formatMoney(allocation.total)}
                    </p>
                  </div>
                ))}
                <p className="font-body text-xs text-stone bg-cream rounded-xl px-4 py-3 leading-relaxed">
                  This is the amount reserved for recognition under your current rules. Delivery and
                  operating costs are tracked separately when fulfilment is added.
                </p>
              </div>
            ) : (
              <p className="font-body text-sm text-stone/70">
                No budgets to set yet — nobody in this group has a rule for {draft.occasionType}.
                You&apos;ll see how to fix that on the next step.
              </p>
            )}
          </>
        )}

        {/* ── 4. Review ── */}
        {step === 3 && (
          <>
            <div>
              <p className="font-body text-sm text-ink mb-1">Check this over</p>
              <p className="font-body text-sm text-stone">
                Nothing is committed until you activate.
              </p>
            </div>

            <dl className="divide-y divide-stone/10">
              <Row label="Occasion" value={draft.occasionType} />
              <Row label="Group" value={selectedClass?.name} />
              <Row label="People" value={population ? `${population.eligible.length} active` : undefined} />
              <Row label="Countries" value={population?.countries.join(', ') || 'Not recorded'} />
              <Row label="Dates" value={draft.campaignStartDate && draft.campaignEndDate
                ? `${draft.campaignStartDate} to ${draft.campaignEndDate}` : undefined} />
              {envelopes.map(e => (
                <Row key={e.currency} label={`${e.currency} budget`} value={formatMoney(e)} />
              ))}
            </dl>

            {activation && !activation.ok && (
              <div className="space-y-2">
                <p className="font-body text-sm font-semibold text-ink">Before you can activate</p>
                {activation.blockers.map((blocker, i) => (
                  <div key={i} className="bg-gold/15 rounded-xl px-4 py-3">
                    <p className="font-body text-sm text-ink">{blocker.message}</p>
                    <p className="font-body text-xs text-stone mt-0.5">{blocker.recovery}</p>
                    {blocker.href && (
                      <Link href={blocker.href}
                        className="font-body text-xs font-semibold text-ink hover:text-gold transition-colors inline-block mt-1.5">
                        Go there &#8594;
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activation?.ok && preview && preview.unresolved.length === 0 && (
              <p className="font-body text-sm text-stone bg-cream rounded-xl px-4 py-3">
                Everyone in this group has a rule for {draft.occasionType}. Activating freezes the
                list of {population?.eligible.length} {population?.eligible.length === 1 ? 'person' : 'people'}.
              </p>
            )}

            {preview && preview.unresolved.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowDetail(v => !v)} aria-expanded={showDetail}
                  className="font-body text-sm text-stone hover:text-ink transition-colors">
                  {showDetail ? 'Hide' : 'See'} who is affected
                </button>
                {showDetail && (
                  <ul className="mt-2 space-y-1">
                    {preview.unresolved.map(entry => (
                      <li key={entry.person.id} className="font-body text-xs text-stone">
                        {entry.person.firstName} {entry.person.lastName}
                        {entry.person.country ? ` (${entry.person.country})` : ''} — {entry.unresolvedReason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isLast ? (
          <button type="button" onClick={handleActivate} disabled={!activation?.ok}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
            Activate campaign &#8594;
          </button>
        ) : (
          <button type="button" onClick={next}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
            Continue &#8594;
          </button>
        )}
        {step > 0 && (
          <button type="button" onClick={() => { setError(null); setStep(s => s - 1); }}
            className="font-body text-sm text-stone hover:text-ink transition-colors">
            Back
          </button>
        )}
        <Link href="/workspace/programs"
          className="font-body text-sm text-stone/70 hover:text-ink transition-colors sm:ml-auto">
          Cancel
        </Link>
      </div>

      {(draft.name || draft.occasionType) && (
        <p className="font-body text-xs text-stone/50">
          Your progress is saved as you go. Nothing is committed until you activate.
        </p>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function GroupOption({
  cls, selected, recommended, count, onSelect,
}: {
  cls: RelationshipClass; selected: boolean; recommended: boolean; count: number; onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
        selected ? 'border-gold bg-gold/5' : 'border-stone/20 bg-white hover:border-stone/35'
      }`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-body text-sm font-semibold text-ink">
          {cls.name || 'Untitled group'}
          {recommended && !selected && (
            <span className="font-body text-xs font-normal text-ink bg-gold/20 rounded-full px-2 py-0.5 ml-2">
              Recommended
            </span>
          )}
        </span>
        <span className="font-body text-xs text-stone">
          {count} active {count === 1 ? 'person' : 'people'}
        </span>
      </div>
      <p className="font-body text-xs text-stone/70 mt-0.5">
        {cls.type} · Level {cls.level}
      </p>
    </button>
  );
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <li className="font-body text-xs text-stone flex items-start gap-2">
      <span aria-hidden className="text-stone/40">&bull;</span>
      <span>{children}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
      <dt className="font-body text-xs text-stone uppercase tracking-wider w-28 flex-shrink-0">{label}</dt>
      <dd className={`font-body text-sm flex-1 min-w-0 ${value ? 'text-ink' : 'text-stone/50'}`}>
        {value ?? 'Not set'}
      </dd>
    </div>
  );
}
