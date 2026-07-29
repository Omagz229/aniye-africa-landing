"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkspaceState } from '@/lib/workspace';
import { getWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import type { PreparationPreview } from '@/lib/operations/generation';
import { previewPreparation } from '@/lib/operations/generation';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { ConfirmationDeps, RevalidationFailure } from '@/lib/operations/confirmation';
import { fingerprintPreview, loadLiveContext, revalidateForConfirmation } from '@/lib/operations/confirmation';

interface Summary {
  created: number;
  ready: number;
  needsReview: number;
  alreadyPrepared: number;
}

export default function PrepareMoments({ programId }: { programId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [preview, setPreview] = useState<PreparationPreview | null>(null);
  /**
   * The fingerprint of the preview currently on screen — what the operator is
   * about to confirm. Compared against live state at confirmation; a mismatch
   * refreshes the screen and writes nothing.
   */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<RevalidationFailure | null>(null);
  const [changedNotice, setChangedNotice] = useState<{ message: string; recovery: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showReview, setShowReview] = useState(true);
  const [showReady, setShowReady] = useState(false);

  useEffect(() => { rebuild(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [programId]);

  /** The injected readers the revalidation service uses. Browser-side wiring only. */
  function deps(): ConfirmationDeps | null {
    const repo = browserOperationsRepository();
    if (!repo) return null;
    return { readWorkspace: getWorkspace, repository: repo, now: () => new Date().toISOString() };
  }

  function rebuild() {
    const ws = getWorkspace();
    if (!ws) { router.push('/assessment'); return; }
    setWorkspace(ws);

    const d = deps();
    if (!d) return;
    d.repository.initialise(ws.organizationId, new Date().toISOString());

    const live = loadLiveContext(programId, d);
    if (!live.ok) {
      // A missing campaign keeps its dedicated screen; everything else becomes
      // a named blocker rather than an empty or falsely successful state.
      if (live.failure.code === 'program-missing') { setNotFound(true); return; }
      setBlocked(live.failure);
      setPreview(null);
      return;
    }

    setBlocked(null);
    // Previewing writes nothing — ADR-006.
    const next = previewPreparation(live.context);
    setPreview(next);
    setFingerprint(fingerprintPreview(next));
  }

  const program = useMemo(
    () => workspace?.programs.find(p => p.id === programId),
    [workspace, programId],
  );

  /**
   * H3.1-D1 — confirmation re-reads live state before writing anything.
   *
   * Nothing captured at page load is reused: the Workspace, the Program and its
   * status, the frozen population, People, groups, assignments, policies and
   * existing source keys are all read again here.
   */
  function handleConfirm() {
    if (!workspace || !preview || fingerprint === null) return;
    setError(null);
    setChangedNotice(null);

    const d = deps();
    if (!d) return;

    const result = revalidateForConfirmation(programId, fingerprint, d, {
      moment: () => `moment-${crypto.randomUUID()}`,
      decision: () => `decision-${crypto.randomUUID()}`,
      event: () => `event-${crypto.randomUUID()}`,
    }, 'operator-local');

    // Read failure, missing or inactive campaign — nothing written, problem named.
    if (result.status === 'failed') {
      setConfirming(false);
      if (result.code === 'program-missing') { setNotFound(true); return; }
      setBlocked(result);
      setPreview(null);
      return;
    }

    // Live state moved. Nothing is written; the screen is replaced with the
    // current figures and the operator must look again.
    if (result.status === 'changed') {
      setConfirming(false);
      setPreview(result.preview);
      setFingerprint(result.fingerprint);
      setChangedNotice({ message: result.message, recovery: result.recovery });
      const ws = getWorkspace();
      if (ws) setWorkspace(ws);
      return;
    }

    const { batch, context } = result;

    // Atomic: every record lands, or none does. The repository's duplicate
    // backstop still applies on top of the revalidation above.
    const written = d.repository.createMoments(workspace.organizationId, batch, context.now);
    if (!written.ok) {
      setError(written.reason);
      setConfirming(false);
      rebuild();
      return;
    }

    setSummary({
      created: batch.moments.length,
      ready: batch.moments.filter(m => m.status === 'ReadyForExecution').length,
      needsReview: batch.moments.filter(m => m.status === 'NeedsReview').length,
      alreadyPrepared: result.preview.alreadyPrepared.length,
    });
    setConfirming(false);
    rebuild();
  }

  if (notFound) {
    return (
      <div className="space-y-4 max-w-xl">
        <p className="font-body text-stone">That campaign no longer exists.</p>
        <Link href="/operations" className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 transition-all">
          Back to Command &#8594;
        </Link>
      </div>
    );
  }

  // ─── Blocked state ─────────────────────────────────────────────────────────
  // A read failure or an inactive campaign is shown as the actual problem, never
  // as an empty queue and never as success (Doctrine §2.6).
  if (blocked) {
    return (
      <div className="space-y-5 max-w-2xl">
        <Link href="/operations" className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
          &#8592; Back to Command
        </Link>
        <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-2">
          <p className="font-body text-xs text-stone uppercase tracking-widest">Cannot prepare</p>
          <p className="font-body text-ink font-semibold">{blocked.message}</p>
          <p className="font-body text-sm text-stone leading-snug">{blocked.recovery}</p>
          <p className="font-body text-xs text-stone/60 pt-1">Nothing has been created or changed.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => { setBlocked(null); rebuild(); }}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 transition-all">
            Try again
          </button>
          {blocked.href && (
            <Link href={blocked.href}
              className="rounded-full border border-stone/20 px-6 py-3 font-body text-sm text-stone hover:text-ink transition-colors">
              Go to {blocked.href === '/operations/moments' ? 'moments' : 'Command'}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!workspace || !program || !preview) return null;

  // ─── Completion state ──────────────────────────────────────────────────────
  if (summary) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Prepared</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">
            {summary.created} moment{summary.created === 1 ? '' : 's'} created
          </h2>
          <p className="font-body text-stone">{program.name}</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone/20 p-5">
          <ul className="space-y-2">
            <Line>{summary.ready} ready for execution</Line>
            {summary.needsReview > 0 && <Line muted>{summary.needsReview} need review before they can proceed</Line>}
            {summary.alreadyPrepared > 0 && <Line muted>{summary.alreadyPrepared} were already prepared and were left alone</Line>}
          </ul>
        </div>

        <Link href="/operations/moments"
          className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all">
          View moments &#8594;
        </Link>
      </div>
    );
  }

  const nothingToDo = preview.pending.length === 0;

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <Link href="/operations" className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          &#8592; Back to Command
        </Link>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Prepare moments</p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-1">{program.name}</h2>
        <p className="font-body text-stone">
          {program.occasionType} · target {program.campaignStartDate}
        </p>
      </div>

      {/* Live state moved while the operator was reviewing. Calm, not alarming —
          nothing went wrong, and nothing was written. */}
      {changedNotice && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink">{changedNotice.message}</p>
          <p className="font-body text-sm text-stone mt-1 leading-snug">{changedNotice.recovery}</p>
        </div>
      )}

      {/* Summary first — details behind disclosure */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat value={program.frozenPopulation?.personIds.length ?? 0} label="Frozen population" />
        <Stat value={preview.ready.length} label="Ready" />
        <Stat value={preview.needsReview.length} label="Need review" emphasis={preview.needsReview.length > 0} />
        <Stat value={preview.alreadyPrepared.length} label="Already prepared" />
      </div>

      <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-2">
        {preview.countries.length > 0 && (
          <Fact label="Countries">{preview.countries.join(', ')}</Fact>
        )}
        {preview.byCurrency.length > 0 ? (
          preview.byCurrency.map(c => (
            <Fact key={c.currency} label={`${c.currency} allocation`}>
              {formatMoney({ amountMinor: c.totalMinor, currency: c.currency })} across {c.peopleCount}{' '}
              {c.peopleCount === 1 ? 'person' : 'people'}
            </Fact>
          ))
        ) : (
          <Fact label="Allocation">Nothing resolves yet</Fact>
        )}
        {preview.needsReview.length > 0 && (
          // The allocation counts everyone whose policy resolved, including those
          // held back for review — so the figure is the campaign's full cost, not
          // what will actually go out today. Said plainly rather than left to be
          // inferred from two numbers that disagree (H3.1-D4).
          <p className="font-body text-xs text-stone/60 pt-1">
            Includes {preview.needsReview.length}{' '}
            {preview.needsReview.length === 1 ? 'person who still needs' : 'people who still need'} review
            and cannot proceed yet.
          </p>
        )}
        {preview.byCurrency.length > 1 && (
          <p className="font-body text-xs text-stone/60 pt-1">
            Currencies are listed separately — they are never added together.
          </p>
        )}
      </div>

      {/* Needs review first: it is the only part that requires a decision */}
      {preview.needsReview.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
          <button type="button" onClick={() => setShowReview(v => !v)} aria-expanded={showReview}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-cream/40 transition-colors">
            <span className="font-body text-sm font-semibold rounded-full px-2.5 py-0.5 bg-stone/20 text-ink flex-shrink-0">
              {preview.needsReview.length}
            </span>
            <span className="font-body text-sm font-semibold text-ink flex-1">Will need review</span>
            <span aria-hidden className="text-stone/50 text-xs">{showReview ? '⌃' : '⌄'}</span>
          </button>
          {showReview && (
            <div className="px-5 pb-4">
              <p className="font-body text-xs text-stone mb-3 leading-relaxed">
                These are still created — nobody is silently dropped — but they cannot proceed until
                the configuration is corrected in the customer workspace.
              </p>
              <ul className="divide-y divide-stone/10">
                {preview.needsReview.map(a => (
                  <li key={a.personId} className="py-2.5">
                    <p className="font-body text-sm text-ink font-medium">{a.displayName}</p>
                    {a.issues.map((issue, i) => (
                      <p key={i} className="font-body text-xs text-stone mt-0.5">
                        {issue.message}
                        {issue.href && (
                          // Own line with vertical padding: an inline link inherited
                          // the 15px line-box and was unusably small on a phone (H3.1-D3).
                          <Link
                            href={issue.href}
                            className="mt-1 inline-flex items-center min-h-[44px] py-2 font-semibold text-ink hover:text-gold transition-colors"
                          >
                            Fix in workspace &#8594;
                          </Link>
                        )}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Ready — collapsed by default; it needs no attention */}
      {preview.ready.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone/20 overflow-hidden">
          <button type="button" onClick={() => setShowReady(v => !v)} aria-expanded={showReady}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-cream/40 transition-colors">
            <span className="font-body text-sm font-semibold rounded-full px-2.5 py-0.5 bg-gold/15 text-ink flex-shrink-0">
              {preview.ready.length}
            </span>
            <span className="font-body text-sm font-semibold text-ink flex-1">Ready for execution</span>
            <span aria-hidden className="text-stone/50 text-xs">{showReady ? '⌃' : '⌄'}</span>
          </button>
          {showReady && (
            <ul className="px-5 pb-4 divide-y divide-stone/10">
              {preview.ready.map(a => (
                <li key={a.personId} className="py-2.5 flex flex-wrap items-baseline gap-x-3">
                  <span className="font-body text-sm text-ink">{a.displayName}</span>
                  {a.person?.country && <span className="font-body text-xs text-stone">{a.person.country}</span>}
                  {a.resolution && (
                    <span className="font-body text-xs text-stone ml-auto">
                      {formatMoney(a.resolution.approvedRecognitionBudget)} · {a.resolution.policyName}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>}

      {/* Confirmation — nothing operational is written before this */}
      {nothingToDo ? (
        <div className="bg-cream rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-1">Everything is prepared</p>
          <p className="font-body text-sm text-stone">
            Every frozen person in this campaign already has a moment.
          </p>
          <Link href="/operations/moments"
            className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors inline-flex items-center min-h-[44px] py-2 mt-1">
            View moments &#8594;
          </Link>
        </div>
      ) : confirming ? (
        <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-3">
          <p className="font-body text-sm font-semibold text-ink">
            Create {preview.pending.length} moment{preview.pending.length === 1 ? '' : 's'}?
          </p>
          <p className="font-body text-sm text-stone leading-relaxed">
            This records {preview.pending.length} moment{preview.pending.length === 1 ? '' : 's'} with
            a decision explaining each one. {preview.ready.length} will be ready for execution
            {preview.needsReview.length > 0 && `, ${preview.needsReview.length} will need review`}.
            It is written once and cannot be undone in bulk.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleConfirm}
              className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
              Yes, prepare {preview.pending.length}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              className="font-body text-sm text-stone hover:text-ink transition-colors">
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}
          className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
          Prepare {preview.pending.length} moment{preview.pending.length === 1 ? '' : 's'} &#8594;
        </button>
      )}
    </div>
  );
}

function Stat({ value, label, emphasis }: { value: number; label: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis && value > 0 ? 'border-gold/40 bg-gold/5' : 'border-stone/20 bg-white'}`}>
      <p className="font-display font-bold text-2xl text-ink">{value}</p>
      <p className="font-body text-xs text-stone leading-snug">{label}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="font-body text-xs text-stone uppercase tracking-wider w-28 flex-shrink-0">{label}</span>
      <span className="font-body text-sm text-ink flex-1 min-w-0">{children}</span>
    </div>
  );
}

function Line({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={`font-body text-sm flex items-start gap-2.5 ${muted ? 'text-stone' : 'text-ink'}`}>
      <span aria-hidden className={muted ? 'text-stone/40' : 'text-gold'}>&bull;</span>
      <span>{children}</span>
    </li>
  );
}
