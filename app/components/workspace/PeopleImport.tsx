"use client";

import { useState } from 'react';
import type { WorkspaceState } from '@/lib/workspace';
import { updateWorkspace } from '@/lib/workspace';
import type { ImportPlan, ImportRowState } from '@/lib/people';
import {
  applyPeopleImport,
  createCsvSource,
  csvTemplate,
  planPeopleImport,
} from '@/lib/people';

interface Props {
  workspace: WorkspaceState;
  onImported: (workspace: WorkspaceState, summary: string) => void;
  onCancel: () => void;
}

const STATE_LABELS: Record<ImportRowState, string> = {
  'ready':              'Ready',
  'ready-unassigned':   'Ready — unassigned',
  'will-update':        'Will update higher-priority record',
  'duplicate-retained': 'Duplicate — existing record retained',
  'invalid':            'Invalid',
  'ambiguous-class':    'Ambiguous class',
  'missing-required':   'Missing required field',
};

const STATE_STYLES: Record<ImportRowState, string> = {
  'ready':              'bg-gold/15 text-ink',
  'ready-unassigned':   'bg-gold/10 text-ink',
  'will-update':        'bg-ink text-cream',
  'duplicate-retained': 'bg-stone/10 text-stone',
  'invalid':            'bg-stone/15 text-stone',
  'ambiguous-class':    'bg-stone/15 text-stone',
  'missing-required':   'bg-stone/15 text-stone',
};

export default function PeopleImport({ workspace, onImported, onCancel }: Props) {
  const [filename, setFilename] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function readFile(file: File) {
    setError(null);
    setPlan(null);
    setFilename(file.name);

    const reader = new FileReader();
    reader.onerror = () => setError('That file could not be read.');
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = planPeopleImport(
        text,
        workspace.relationshipClasses,
        workspace.people,
        'CSV',
      );
      if (result.status === 'error') {
        setError(result.reason);
        return;
      }
      setPlan(result.plan);
    };
    reader.readAsText(file);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) readFile(file);
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
    const result = applyPeopleImport(
      plan,
      workspace.people,
      source,
      now,
      () => `person-${crypto.randomUUID()}`,
    );

    const updated = updateWorkspace({
      people: result.people,
      peopleSources: [...workspace.peopleSources, source],
    });
    if (!updated) return;

    const { created, updated: updatedCount, skipped, invalid } = result.summary;
    onImported(
      updated,
      `Imported ${created} new ${created === 1 ? 'person' : 'people'}` +
        (updatedCount > 0 ? `, updated ${updatedCount}` : '') +
        (skipped > 0 ? `, skipped ${skipped}` : '') +
        (invalid > 0 ? `, ${invalid} invalid` : '') +
        '.',
    );
  }

  const willWrite = plan ? plan.summary.created + plan.summary.updated : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">People</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">Import from CSV</h2>
          <p className="font-body text-stone">
            Nothing is written until you review the preview and confirm.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex-shrink-0 font-body text-xs font-semibold text-ink hover:text-gold transition-colors underline underline-offset-4"
        >
          Download CSV template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-gold bg-gold/5' : 'border-stone/30 bg-white'
        }`}
      >
        <p className="font-body text-sm text-ink mb-1">
          {filename ? filename : 'Drop a CSV file here'}
        </p>
        <p className="font-body text-xs text-stone mb-4">
          or choose one from your computer
        </p>
        <label className="inline-flex items-center gap-2 rounded-full bg-ink text-cream font-semibold text-xs px-5 py-2.5 cursor-pointer hover:brightness-125 transition-all">
          Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </label>
      </div>

      {error && (
        <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>
      )}

      {plan && (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-6">
            <Stat value={plan.summary.created} label="To add" />
            <Stat value={plan.summary.updated} label="To update" />
            <Stat value={plan.summary.skipped} label="Skipped" />
            <Stat value={plan.summary.invalid} label="Invalid" />
          </div>

          {plan.unrecognizedHeaders.length > 0 && (
            <p className="font-body text-xs text-stone bg-cream rounded-xl px-4 py-3">
              Ignored {plan.unrecognizedHeaders.length === 1 ? 'column' : 'columns'}:{' '}
              {plan.unrecognizedHeaders.join(', ')}.
            </p>
          )}

          {/* Preview */}
          <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem]">
                <thead>
                  <tr className="border-b border-stone/10">
                    <Th className="w-12">#</Th>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Classes</Th>
                    <Th>Outcome</Th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map(row => (
                    <tr key={row.rowNumber} className="border-b border-stone/5 last:border-0 align-top">
                      <Td className="text-stone/50">{row.rowNumber}</Td>
                      <Td className="text-ink font-medium">{row.displayName}</Td>
                      <Td className="text-stone">{row.draft?.email ?? '—'}</Td>
                      <Td className="text-stone">
                        {row.draft && row.draft.relationshipClassIds.length > 0
                          ? row.draft.relationshipClassIds
                              .map(id => workspace.relationshipClasses.find(c => c.id === id)?.name ?? id)
                              .join(', ')
                          : '—'}
                      </Td>
                      <Td>
                        <span className={`inline-block font-body text-xs rounded-full px-2 py-0.5 mb-1 ${STATE_STYLES[row.state]}`}>
                          {STATE_LABELS[row.state]}
                        </span>
                        <p className="font-body text-xs text-stone leading-snug">{row.message}</p>
                        {row.warnings.map((warning, i) => (
                          <p key={i} className="font-body text-xs text-stone/70 leading-snug mt-0.5">
                            {warning}
                          </p>
                        ))}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={willWrite === 0}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              {willWrite === 0
                ? 'Nothing to import'
                : `Import ${willWrite} ${willWrite === 1 ? 'record' : 'records'} →`}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="font-body text-sm text-stone hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {!plan && !error && (
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-sm text-stone hover:text-ink transition-colors"
        >
          Back to People
        </button>
      )}
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left font-body text-xs text-stone uppercase tracking-wider px-4 py-3 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`font-body text-sm px-4 py-3 ${className}`}>{children}</td>;
}
