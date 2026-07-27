"use client";

import { useState } from 'react';
import type { WorkspaceState } from '@/lib/workspace';
import { updateWorkspace } from '@/lib/workspace';
import type { ImportPlan, ImportRow, ImportSummary } from '@/lib/people';
import {
  applyPeopleImport,
  createCsvSource,
  csvTemplate,
  planPeopleImport,
} from '@/lib/people';
import StepHeader from './StepHeader';

interface Props {
  workspace: WorkspaceState;
  onImported: (workspace: WorkspaceState, summary: ImportSummary) => void;
  onCancel: () => void;
}

const STEPS = ['Upload', 'Check the columns', 'Review', 'Confirm', 'Done'];

/**
 * Rows are grouped by *what the operator has to do about them*, not by the
 * internal state name (Doctrine §1.9, §2.9). Four buckets, in the order they
 * matter: what will happen, what needs a decision, what was left alone.
 */
type Bucket = 'ready' | 'update' | 'attention' | 'skipped';

const BUCKET_ORDER: Bucket[] = ['ready', 'update', 'attention', 'skipped'];

const BUCKET_COPY: Record<Bucket, { title: string; blurb: string; tone: string }> = {
  ready: {
    title: 'Ready to add',
    blurb: 'These people will be added to your directory.',
    tone: 'bg-gold/15 text-ink',
  },
  update: {
    title: 'Will update someone you already have',
    blurb: 'These match someone already in your directory. A spreadsheet import takes priority over a manually added record, so their details will be refreshed. Anything your file leaves blank is kept as it is.',
    tone: 'bg-ink text-cream',
  },
  attention: {
    title: 'Needs attention',
    blurb: 'These rows can\'t be imported as they are. Fix them in your file and upload again — or import the rest now and add these later.',
    tone: 'bg-stone/20 text-ink',
  },
  skipped: {
    title: 'Already in your directory',
    blurb: 'These match someone you already have, from a source we don\'t override. Nothing will change for them.',
    tone: 'bg-stone/10 text-stone',
  },
};

function bucketOf(row: ImportRow): Bucket {
  switch (row.state) {
    case 'ready':
    case 'ready-unassigned':
      return 'ready';
    case 'will-update':
      return 'update';
    case 'duplicate-retained':
      return 'skipped';
    default:
      return 'attention';
  }
}

/** Short, human label for one row inside its bucket. */
function rowLabel(row: ImportRow): string | null {
  switch (row.state) {
    case 'ready-unassigned':  return 'No relationship group yet';
    case 'ambiguous-class':   return 'Group name matches more than one group';
    case 'missing-required':  return 'Needs a first and last name';
    case 'invalid':           return 'Check this row';
    default:                  return null;
  }
}

export default function PeopleImport({ workspace, onImported, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Bucket | null>('attention');
  const [result, setResult] = useState<ImportSummary | null>(null);

  function readFile(file: File) {
    setError(null);
    setPlan(null);
    setFilename(file.name);

    const reader = new FileReader();
    reader.onerror = () => setError('We couldn\'t read that file. Try saving it again as a CSV.');
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const planned = planPeopleImport(text, workspace.relationshipClasses, workspace.people, 'CSV');
      if (planned.status === 'error') {
        setError(planned.reason);
        return;
      }
      setPlan(planned.plan);
      setStep(1);
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aniye-people-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    if (!plan || !filename) return;
    const now = new Date().toISOString();
    const source = createCsvSource(filename, now, `source-${crypto.randomUUID()}`);
    const applied = applyPeopleImport(
      plan, workspace.people, source, now, () => `person-${crypto.randomUUID()}`,
    );

    const updated = updateWorkspace({
      people: applied.people,
      peopleSources: [...workspace.peopleSources, source],
    });
    if (!updated) return;

    setResult(applied.summary);
    setStep(4);
    onImported(updated, applied.summary);
  }

  const buckets = plan
    ? BUCKET_ORDER.map(bucket => [bucket, plan.rows.filter(r => bucketOf(r) === bucket)] as const)
        .filter(([, rows]) => rows.length > 0)
    : [];

  const willWrite = plan ? plan.summary.created + plan.summary.updated : 0;
  const needsAttention = plan ? plan.summary.invalid + plan.rows.filter(r => r.state === 'ambiguous-class').length : 0;

  return (
    <div className="max-w-3xl space-y-6">
      <StepHeader eyebrow="People" title="Import a list" steps={STEPS} current={step} />

      {/* ── 1. Upload ── */}
      {step === 0 && (
        <>
          <p className="font-body text-stone">
            Upload a spreadsheet of the people you want to recognise. We&apos;ll check it over before
            anything is added.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
            className={`rounded-2xl border border-dashed p-8 sm:p-10 text-center transition-colors ${
              dragging ? 'border-gold bg-gold/5' : 'border-stone/30 bg-white'
            }`}
          >
            <p className="font-body text-sm text-ink mb-1">
              {filename ?? 'Drop your CSV file here'}
            </p>
            <p className="font-body text-xs text-stone mb-5">or pick one from your device</p>
            <label className="inline-flex items-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 cursor-pointer hover:brightness-105 hover:shadow-md transition-all">
              Choose a file
              <input type="file" accept=".csv,text/csv" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
            </label>
          </div>

          {error && <Problem>{error}</Problem>}

          <div className="bg-cream rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-sm font-semibold text-ink mb-1">Not sure what it should look like?</p>
            <p className="font-body text-sm text-stone mb-3">
              Start from our template. Only first and last name are required — everything else is
              optional, and column names don&apos;t have to match exactly.
            </p>
            <button type="button" onClick={downloadTemplate}
              className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors underline underline-offset-4">
              Download the template
            </button>
          </div>

          <button type="button" onClick={onCancel}
            className="font-body text-sm text-stone hover:text-ink transition-colors">
            Cancel
          </button>
        </>
      )}

      {/* ── 2. Match and validate ── */}
      {step === 1 && plan && (
        <>
          <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 space-y-4">
            <div>
              <p className="font-body text-sm font-semibold text-ink mb-1">
                We read {plan.summary.total} {plan.summary.total === 1 ? 'row' : 'rows'} from {filename}
              </p>
              <p className="font-body text-sm text-stone">
                Here&apos;s what we understood from your columns.
              </p>
            </div>

            {plan.unrecognizedHeaders.length > 0 && (
              <div className="bg-cream rounded-xl px-4 py-3">
                <p className="font-body text-xs text-stone leading-relaxed">
                  We ignored {plan.unrecognizedHeaders.length === 1 ? 'one column' : `${plan.unrecognizedHeaders.length} columns`} we
                  didn&apos;t recognise: <span className="text-ink">{plan.unrecognizedHeaders.join(', ')}</span>.
                  Everything else came through fine.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat value={plan.summary.created} label="To add" />
              <Stat value={plan.summary.updated} label="To update" />
              <Stat value={needsAttention} label="Need attention" />
              <Stat value={plan.summary.skipped - (plan.summary.skipped - plan.rows.filter(r => r.state === 'duplicate-retained').length)} label="Already have" />
            </div>
          </div>

          <Nav
            primary={{ label: 'Review the details', onClick: () => setStep(2) }}
            back={() => { setStep(0); setPlan(null); }}
            cancel={onCancel}
          />
        </>
      )}

      {/* ── 3. Review issues ── */}
      {step === 2 && plan && (
        <>
          <p className="font-body text-stone">
            Nothing has been imported yet. Open any group to see the rows inside it.
          </p>

          <div className="space-y-3">
            {buckets.map(([bucket, rows]) => {
              const copy = BUCKET_COPY[bucket];
              const isOpen = expanded === bucket;
              return (
                <div key={bucket} className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : bucket)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-cream/40 transition-colors"
                  >
                    <span className={`font-body text-sm font-semibold rounded-full px-2.5 py-0.5 flex-shrink-0 ${copy.tone}`}>
                      {rows.length}
                    </span>
                    <span className="font-body text-sm font-semibold text-ink flex-1 min-w-0">
                      {copy.title}
                    </span>
                    <span aria-hidden className="text-stone/50 text-xs flex-shrink-0">
                      {isOpen ? '⌃' : '⌄'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 space-y-3">
                      <p className="font-body text-xs text-stone leading-relaxed">{copy.blurb}</p>
                      <ul className="divide-y divide-stone/10">
                        {rows.map(row => {
                          const label = rowLabel(row);
                          return (
                            <li key={row.rowNumber} className="py-2.5">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className="font-body text-xs text-stone/40 w-6 flex-shrink-0">
                                  {row.rowNumber}
                                </span>
                                <span className="font-body text-sm text-ink font-medium">
                                  {row.displayName}
                                </span>
                                {row.draft?.email && (
                                  <span className="font-body text-xs text-stone">{row.draft.email}</span>
                                )}
                                {label && (
                                  <span className="font-body text-xs text-stone/70">· {label}</span>
                                )}
                              </div>
                              {(bucket === 'attention' || bucket === 'skipped') && (
                                <p className="font-body text-xs text-stone pl-9 mt-0.5 leading-snug">
                                  {row.message}
                                </p>
                              )}
                              {row.warnings.map((warning, i) => (
                                <p key={i} className="font-body text-xs text-stone/70 pl-9 mt-0.5 leading-snug">
                                  {warning}
                                </p>
                              ))}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Nav
            primary={{
              label: willWrite === 0 ? 'Nothing to import' : 'Continue',
              onClick: () => setStep(3),
              disabled: willWrite === 0,
            }}
            back={() => setStep(1)}
            cancel={onCancel}
          />
          {willWrite === 0 && (
            <p className="font-body text-sm text-stone">
              None of these rows can be imported yet. Fix them in your file and upload it again.
            </p>
          )}
        </>
      )}

      {/* ── 4. Confirm ── */}
      {step === 3 && plan && (
        <>
          <div className="bg-white rounded-2xl border border-stone/20 p-5 sm:p-6 space-y-3">
            <p className="font-body text-sm font-semibold text-ink">Here&apos;s what will happen</p>
            <ul className="space-y-2">
              {plan.summary.created > 0 && (
                <ConfirmLine>
                  <strong className="font-semibold">{plan.summary.created}</strong>{' '}
                  {plan.summary.created === 1 ? 'person' : 'people'} added to your directory
                </ConfirmLine>
              )}
              {plan.summary.updated > 0 && (
                <ConfirmLine>
                  <strong className="font-semibold">{plan.summary.updated}</strong> existing{' '}
                  {plan.summary.updated === 1 ? 'record' : 'records'} updated
                </ConfirmLine>
              )}
              {needsAttention > 0 && (
                <ConfirmLine muted>
                  <strong className="font-semibold">{needsAttention}</strong>{' '}
                  {needsAttention === 1 ? 'row' : 'rows'} left out — you can fix and re-upload later
                </ConfirmLine>
              )}
              {plan.rows.filter(r => r.state === 'duplicate-retained').length > 0 && (
                <ConfirmLine muted>
                  <strong className="font-semibold">
                    {plan.rows.filter(r => r.state === 'duplicate-retained').length}
                  </strong>{' '}
                  already in your directory — left untouched
                </ConfirmLine>
              )}
            </ul>
            <p className="font-body text-xs text-stone/70 pt-1">
              We&apos;ll record this as one import named &ldquo;{filename?.replace(/\.csv$/i, '')}&rdquo;,
              so you can always see where these people came from.
            </p>
          </div>

          <Nav
            primary={{ label: `Import ${willWrite} ${willWrite === 1 ? 'record' : 'records'}`, onClick: handleImport }}
            back={() => setStep(2)}
            cancel={onCancel}
          />
        </>
      )}

      {/* ── 5. Results ── */}
      {step === 4 && result && (
        <div className="bg-white rounded-2xl border border-stone/20 p-6 sm:p-8 space-y-4">
          <div>
            <p className="font-display font-bold text-xl text-ink mb-1">Import complete</p>
            <p className="font-body text-stone">
              {result.created > 0 && `${result.created} ${result.created === 1 ? 'person' : 'people'} added`}
              {result.created > 0 && result.updated > 0 && ', '}
              {result.updated > 0 && `${result.updated} updated`}
              {result.created === 0 && result.updated === 0 && 'No changes were made'}.
            </p>
          </div>
          {needsAttention > 0 && (
            <p className="font-body text-sm text-stone bg-cream rounded-xl px-4 py-3">
              {needsAttention} {needsAttention === 1 ? 'row' : 'rows'} couldn&apos;t be imported. Fix
              those in your file and upload it again whenever you&apos;re ready.
            </p>
          )}
          <button type="button" onClick={onCancel}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
            Back to People &#8594;
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Nav({
  primary, back, cancel,
}: {
  primary: { label: string; onClick: () => void; disabled?: boolean };
  back?: () => void;
  cancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {primary.label} {!primary.disabled && <span aria-hidden>&#8594;</span>}
      </button>
      {back && (
        <button type="button" onClick={back}
          className="font-body text-sm text-stone hover:text-ink transition-colors">
          Back
        </button>
      )}
      <button type="button" onClick={cancel}
        className="font-body text-sm text-stone/70 hover:text-ink transition-colors sm:ml-auto">
        Cancel
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display font-bold text-2xl text-ink">{value}</p>
      <p className="font-body text-xs text-stone">{label}</p>
    </div>
  );
}

function ConfirmLine({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={`font-body text-sm flex items-start gap-2.5 ${muted ? 'text-stone' : 'text-ink'}`}>
      <span aria-hidden className={muted ? 'text-stone/40' : 'text-gold'}>&bull;</span>
      <span>{children}</span>
    </li>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{children}</p>;
}
