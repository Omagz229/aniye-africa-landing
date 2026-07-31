"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ConfirmDialog from '@/app/components/workspace/ConfirmDialog';
import { getWorkspace } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Moment, OperationsState } from '@/lib/operations/types';
import type { ClosurePreview, RecipientTimelineEntry } from '@/lib/operations/closure';
import {
  buildMomentClosure,
  giftCategoryForOrder,
  previewMomentClosure,
  projectRecipientTimelineEntry,
} from '@/lib/operations/closure';

interface ViewModel {
  moment: Moment;
  preview: ClosurePreview;
  entry: RecipientTimelineEntry | null;
  giftCategory: string | null;
}

function context(state: OperationsState, moment: Moment) {
  return {
    moment,
    briefs: state.executionBriefs,
    decisions: state.decisions,
    fulfilments: state.fulfilments,
    orders: state.recognitionOrders,
    events: state.events,
    memories: state.memories,
  };
}

export default function CloseMomentPanel({ momentId }: { momentId: string }) {
  const [model, setModel] = useState<ViewModel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    const workspace = getWorkspace();
    const repo = browserOperationsRepository();
    if (!workspace || !repo) return;
    const loaded = repo.load(workspace.organizationId);
    if (!loaded.ok || !loaded.value) {
      setError(loaded.ok ? 'No operations record exists for this workspace.' : loaded.reason);
      return;
    }
    const moment = loaded.value.moments.find(value => value.id === momentId);
    if (!moment) {
      setNotFound(true);
      return;
    }
    const preview = previewMomentClosure(context(loaded.value, moment));
    const memory = loaded.value.memories.find(value => value.momentId === moment.id) ?? null;
    const projected = memory ? projectRecipientTimelineEntry(loaded.value, memory) : null;
    if (projected && !projected.ok) setError(projected.reason);
    const category = preview.authority
      ? giftCategoryForOrder(loaded.value.decisions, preview.authority.order)
      : null;
    if (category && !category.ok) setError(category.reason);
    setModel({
      moment,
      preview,
      entry: projected?.ok ? projected.value : null,
      giftCategory: category?.ok ? category.value : null,
    });
  }, [momentId]);

  useEffect(() => {
    const task = window.setTimeout(load, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  function closeMoment() {
    const workspace = getWorkspace();
    const repo = browserOperationsRepository();
    if (!workspace || !repo) return;
    setError(null);

    // Confirmation-time reread. The repository performs a second reread and
    // rebuild at its own trust boundary before the one storage write.
    const loaded = repo.load(workspace.organizationId);
    if (!loaded.ok || !loaded.value) {
      setError(loaded.ok ? 'No operations record exists for this workspace.' : loaded.reason);
      setConfirming(false);
      return;
    }
    const moment = loaded.value.moments.find(value => value.id === momentId);
    if (!moment) {
      setError('That moment no longer exists.');
      setConfirming(false);
      return;
    }
    const now = new Date().toISOString();
    const built = buildMomentClosure({
      ...context(loaded.value, moment),
      now,
      ids: {
        memory: () => `memory-${crypto.randomUUID()}`,
        event: () => `event-${crypto.randomUUID()}`,
      },
    });
    if (!built.ok) {
      setError(built.reason);
      setConfirming(false);
      load();
      return;
    }
    const committed = repo.commitMomentClosure(workspace.organizationId, built.value, now);
    setConfirming(false);
    if (!committed.ok) {
      setError(committed.reason);
      load();
      return;
    }
    load();
  }

  if (notFound) {
    return (
      <div className="space-y-4 max-w-xl">
        <p className="font-body text-stone">That moment no longer exists.</p>
        <Link href="/operations/moments" className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3">
          Back to moments &#8594;
        </Link>
      </div>
    );
  }
  if (!model) return null;

  const { moment, preview, entry, giftCategory } = model;
  const authority = preview.authority;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/operations/moments/${moment.id}`} className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          &#8592; Back to the moment
        </Link>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Confirmation + Memory</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Close the moment</h2>
        <p className="font-body text-sm text-stone mt-2 leading-relaxed">
          Confirm that this delivered and reconciled recognition is complete. This is operator closure,
          not recipient acknowledgement.
        </p>
      </div>

      {preview.action === 'closed' && entry ? (
        <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-4">
          <div>
            <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Closed</p>
            <p className="font-body text-sm text-ink font-semibold">The immutable Memory is on the relationship timeline.</p>
          </div>
          <SafeFacts entry={entry} />
          <Link href={`/operations/timeline/${moment.personId}`} className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
            View relationship timeline &#8594;
          </Link>
        </div>
      ) : (
        <>
          {authority && giftCategory && (
            <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-3">
              <p className="font-body text-xs text-stone uppercase tracking-widest">Timeline preview</p>
              <Fact label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
              <Fact label="Occasion" value={moment.occasionType} />
              <Fact label="Planned" value={moment.targetDate} />
              <Fact label="Outcome" value="Delivered" />
              <Fact label="Outcome date" value={authority.deliveredEvent.occurredAt.slice(0, 10)} />
              <Fact label="Gift category" value={giftCategory} />
              <p className="font-body text-xs text-stone/60 pt-2 leading-relaxed">
                This preview is built from customer-safe fields only. It contains no vendor, courier,
                address, cost, margin, proof or internal-note detail.
              </p>
            </div>
          )}

          {preview.blockers.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone/20 p-5">
              <p className="font-body text-sm font-semibold text-ink mb-3">What must be resolved first</p>
              <ul className="space-y-4">
                {preview.blockers.map(blocker => (
                  <li key={blocker.code}>
                    <p className="font-body text-sm text-ink">{blocker.message}</p>
                    <p className="font-body text-xs text-stone mt-1 leading-relaxed">
                      {blocker.recovery}
                      {blocker.href && (
                        <Link href={blocker.href} className="font-semibold text-ink hover:text-gold transition-colors ml-1">
                          Go there &#8594;
                        </Link>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.action === 'close' && (
            <div className="space-y-3">
              <button type="button" onClick={() => setConfirming(true)}
                className="w-full rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors">
                Confirm completion and close
              </button>
              <p className="font-body text-xs text-stone/60 text-center">
                Opening, reviewing or leaving this page records nothing.
              </p>
            </div>
          )}
        </>
      )}

      {error && <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Close this moment permanently?"
          body="One confirmation will close the Moment, create its immutable Memory and append MomentClosed in a single write."
          impact={[
            'The Moment becomes Closed and cannot be reopened or cancelled.',
            'Exactly one immutable Memory is added to the relationship timeline.',
            'No recipient acknowledgement or Decision is recorded.',
          ]}
          cancelLabel="Keep the moment open"
          confirmLabel="Close the moment"
          onCancel={() => setConfirming(false)}
          onConfirm={closeMoment}
        />
      )}
    </div>
  );
}

function SafeFacts({ entry }: { entry: RecipientTimelineEntry }) {
  return (
    <div className="space-y-1">
      <Fact label="Recipient" value={`${entry.recipientFirstName} ${entry.recipientLastName}`} />
      <Fact label="Occasion" value={entry.occasion} />
      <Fact label="Planned" value={entry.plannedDate} />
      <Fact label="Outcome" value={entry.outcome} />
      <Fact label="Outcome date" value={entry.outcomeDate} />
      <Fact label="Gift category" value={entry.giftCategory} />
      <Fact label="Summary" value={entry.summary} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5">
      <span className="font-body text-xs text-stone uppercase tracking-wider w-28 flex-shrink-0">{label}</span>
      <span className="font-body text-sm text-ink flex-1 min-w-0">{value}</span>
    </div>
  );
}
