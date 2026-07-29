"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import { formatMoney } from '@/lib/money';
import type { Decision, ExecutionBrief, Moment, OperationalEvent } from '@/lib/operations/types';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import { buildCancellation } from '@/lib/operations/generation';
import { findLiveSelectionDecision } from '@/lib/operations/selection';

export default function MomentDetail({ momentId }: { momentId: string }) {
  const [moment, setMoment] = useState<Moment | null>(null);
  const [brief, setBrief] = useState<ExecutionBrief | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [momentId]);

  function load() {
    const ws = getWorkspace();
    if (!ws) return;
    setWorkspaceId(ws.organizationId);

    const repo = browserOperationsRepository();
    if (!repo) return;

    const found = repo.findMoment(ws.organizationId, momentId);
    if (!found.ok || found.value === null) { setNotFound(true); return; }
    setMoment(found.value);

    // Read so the next action can be computed from state rather than guessed.
    const live = repo.findLiveBriefForMoment(ws.organizationId, momentId);
    if (live.ok) setBrief(live.value);

    const state = repo.load(ws.organizationId);
    if (state.ok && state.value) {
      setDecisions(state.value.decisions.filter(d => d.momentId === momentId));
      setEvents(
        state.value.events
          .filter(e => e.momentId === momentId)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      );
    }
  }

  function handleCancel() {
    if (!moment || !workspaceId) return;
    setError(null);

    const now = new Date().toISOString();
    const built = buildCancellation(moment, reason, now, {
      moment: () => `moment-${crypto.randomUUID()}`,
      decision: () => `decision-${crypto.randomUUID()}`,
      event: () => `event-${crypto.randomUUID()}`,
    }, 'operator-local');

    if (!built.ok) { setError(built.reason); return; }

    const repo = browserOperationsRepository();
    if (!repo) return;

    const status = repo.updateMomentStatus(workspaceId, moment.id, 'Cancelled', now, { cancelledAt: now });
    if (!status.ok) { setError(status.reason); return; }

    const decision = repo.appendDecision(workspaceId, built.value.decision);
    if (!decision.ok) { setError(decision.reason); return; }

    const event = repo.appendEvent(workspaceId, built.value.event);
    if (!event.ok) { setError(event.reason); return; }

    setCancelling(false);
    setReason('');
    load();
  }

  if (notFound) {
    return (
      <div className="space-y-4 max-w-xl">
        <p className="font-body text-stone">That moment no longer exists.</p>
        <Link href="/operations/moments"
          className="inline-flex rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 transition-all">
          Back to moments &#8594;
        </Link>
      </div>
    );
  }

  if (!moment) return null;

  const recipient = moment.recipientSnapshot;
  const snapshot = moment.policyResolutionSnapshot;
  const selection = findLiveSelectionDecision(decisions, moment.id);
  const nextAction: 'brief' | 'item' | 'done' =
    !brief || brief.status !== 'Confirmed' ? 'brief' : selection ? 'done' : 'item';

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <Link href="/operations/moments" className="font-body text-sm text-stone hover:text-ink transition-colors mb-1 inline-flex items-center min-h-[44px] py-2">
          &#8592; Back to moments
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">{moment.occasionType}</p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
              {recipient.firstName} {recipient.lastName}
            </h2>
          </div>
          <span className={`font-body text-xs rounded-full px-2.5 py-0.5 flex-shrink-0 ${
            moment.status === 'ReadyForExecution' ? 'bg-gold/15 text-ink'
            : moment.status === 'Cancelled' ? 'bg-stone/8 text-stone/50'
            : 'bg-stone/15 text-ink'
          }`}>
            {moment.status === 'ReadyForExecution' ? 'Ready' : moment.status === 'NeedsReview' ? 'Needs review' : 'Cancelled'}
          </span>
        </div>
      </div>

      {/* Recipient and group snapshots */}
      <Panel title="Recipient">
        <Row label="Name" value={`${recipient.firstName} ${recipient.lastName}`} />
        <Row label="Email" value={recipient.email} />
        <Row label="Phone" value={recipient.phone} />
        <Row label="Country" value={recipient.country} />
        <Row label="Role" value={recipient.role} />
        <Row label="Group" value={`${moment.relationshipGroupSnapshot.name} · ${moment.relationshipGroupSnapshot.type} Level ${moment.relationshipGroupSnapshot.level}`} />
        <Row label="Target date" value={moment.targetDate} />
      </Panel>

      {/* Why this budget */}
      {snapshot ? (
        <Panel title="Recognition budget">
          <Row label="Budget" value={formatMoney(snapshot.approvedRecognitionBudget)} />
          <Row label="Rule" value={`${snapshot.policyName} (v${snapshot.policyVersion})`} />
          <Row label="Scope" value={snapshot.resolvedCountryScope === 'Global' ? 'Applies everywhere' : `${snapshot.resolvedCountryScope} only`} />
          <Row label="Resolved" value={snapshot.resolvedAt.slice(0, 10)} />
          <p className="font-body text-xs text-stone/60 pt-2 leading-relaxed">
            Captured when this moment was prepared. It still explains this budget even if the rule
            changes afterwards.
          </p>
        </Panel>
      ) : (
        <Panel title="Recognition budget">
          <p className="font-body text-sm text-stone">
            No budget resolved — see the issues below.
          </p>
        </Panel>
      )}

      {/*
        The one clear next action for a ready moment, **chosen from state**
        (Doctrine §1.1): no brief yet → confirm one; brief confirmed but nothing
        chosen → choose an item; item chosen → the moment is as far as this
        build takes it.
      */}
      {moment.status === 'ReadyForExecution' && (
        nextAction === 'brief' ? (
          <Link href={`/operations/moments/${moment.id}/brief`}
            className="block rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold text-center hover:bg-ink/90 transition-colors">
            Open the brief
          </Link>
        ) : nextAction === 'item' ? (
          <Link href={`/operations/moments/${moment.id}/item`}
            className="block rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold text-center hover:bg-ink/90 transition-colors">
            Choose an item
          </Link>
        ) : (
          <Link href={`/operations/moments/${moment.id}/item`}
            className="block rounded-full border border-stone/20 px-6 py-3 font-body text-sm font-semibold text-ink text-center hover:border-stone/40 transition-colors">
            View the chosen item
          </Link>
        )
      )}

      {/* Issues, with the workspace link that fixes each */}
      {moment.issues.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-2">Why this needs review</p>
          <ul className="space-y-2">
            {moment.issues.map((issue, i) => (
              <li key={i} className="font-body text-sm text-stone">
                {issue.message}
                {issue.href && (
                  <Link href={issue.href} className="font-semibold text-ink hover:text-gold transition-colors ml-1">
                    Fix in workspace &#8594;
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="font-body text-xs text-stone/60 mt-3 leading-relaxed">
            Operations never edits customer configuration. Corrections are made in the workspace, and
            this moment is re-assessed when it next moves forward.
          </p>
        </div>
      )}

      {/*
        Where this moment actually stands. The previous copy here said the
        Execution Brief "is not yet enabled" — true when H3.1 shipped, false
        from H3.2 onward, and it sat directly beneath a button that opened it.
      */}
      {moment.status === 'ReadyForExecution' && (
        <div className="bg-cream rounded-2xl border border-stone/20 p-5">
          <p className="font-body text-sm font-semibold text-ink mb-1">Ready for execution</p>
          <p className="font-body text-sm text-stone leading-relaxed">
            {nextAction === 'brief'
              ? 'Confirm the brief next — it fixes the address and the budget an item is chosen against.'
              : nextAction === 'item'
                ? 'The brief is confirmed. Choosing an item is the next step.'
                : 'An item has been chosen. Sourcing it from a vendor is the next stage and is not built yet — nothing further can be done with this moment in this build.'}
          </p>
        </div>
      )}

      {/* Decision history */}
      <Panel title={`Decisions (${decisions.length})`}>
        {decisions.length === 0 ? (
          <p className="font-body text-sm text-stone/60">None recorded.</p>
        ) : (
          <ul className="divide-y divide-stone/10 -my-1">
            {decisions.map(decision => (
              <li key={decision.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-body text-sm font-medium text-ink">{decision.decisionType}</span>
                  <span className="font-body text-xs text-stone/60">
                    {decision.provider === 'RuleEngine' ? 'automatic' : 'operator'}
                  </span>
                  {decision.status === 'Superseded' && (
                    <span className="font-body text-xs text-stone/50">superseded</span>
                  )}
                  <span className="font-body text-xs text-stone/50 ml-auto">
                    {decision.confirmedAt.slice(0, 10)}
                  </span>
                </div>
                <p className="font-body text-sm text-ink mt-0.5">{decision.finalDecision}</p>
                <p className="font-body text-xs text-stone mt-0.5 leading-snug">{decision.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Event timeline */}
      <Panel title={`Timeline (${events.length})`}>
        {events.length === 0 ? (
          <p className="font-body text-sm text-stone/60">Nothing recorded.</p>
        ) : (
          <ul className="space-y-2 -my-1">
            {events.map(event => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3">
                <span aria-hidden className="text-gold text-xs">&bull;</span>
                <span className="font-body text-sm text-ink">{humanEvent(event.eventType)}</span>
                <span className="font-body text-xs text-stone/60">{event.actorType.toLowerCase()}</span>
                <span className="font-body text-xs text-stone/50 ml-auto">
                  {event.occurredAt.slice(0, 16).replace('T', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="font-body text-xs text-stone/60 pt-2">
          Append-only. Nothing here is ever edited or removed.
        </p>
      </Panel>

      {error && <p className="font-body text-sm text-ink bg-gold/15 rounded-xl px-4 py-3">{error}</p>}

      {/* Cancellation — a judgement, so it needs a reason */}
      {moment.status !== 'Cancelled' && (
        cancelling ? (
          <div className="bg-white rounded-2xl border border-stone/20 p-5 space-y-3">
            <p className="font-body text-sm font-semibold text-ink">Cancel this moment?</p>
            <p className="font-body text-sm text-stone leading-relaxed">
              It stays on the record with your reason attached. This cannot be undone in this build.
            </p>
            <div>
              <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="cancel-reason">
                Why are you cancelling?
              </label>
              <input id="cancel-reason" value={reason} onChange={e => { setReason(e.target.value); setError(null); }}
                placeholder="Recipient left the organization"
                className="w-full rounded-lg border border-stone/20 bg-white px-3 py-2.5 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow" />
              <p className="font-body text-xs text-stone/60 mt-1.5">
                This becomes part of the permanent record.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { setCancelling(false); setReason(''); setError(null); }}
                className="rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 hover:brightness-105 transition-all">
                Keep this moment
              </button>
              <button type="button" onClick={handleCancel}
                className="font-body text-sm text-stone hover:text-ink transition-colors">
                Cancel the moment
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCancelling(true)}
            className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2">
            Cancel this moment
          </button>
        )
      )}
    </div>
  );
}

function humanEvent(type: string): string {
  switch (type) {
    case 'MomentCreated': return 'Moment created';
    case 'MomentMarkedReady': return 'Marked ready for execution';
    case 'MomentNeedsReview': return 'Flagged for review';
    case 'MomentCancelled': return 'Cancelled';
    case 'BriefGenerated': return 'Brief confirmed';
    case 'ExecutionBriefAddressOverridden': return 'Brief address corrected';
    case 'ItemSelected': return 'Item chosen';
    default: return type;
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone/20 p-5">
      <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5">
      <span className="font-body text-xs text-stone uppercase tracking-wider w-24 flex-shrink-0">{label}</span>
      <span className={`font-body text-sm flex-1 min-w-0 ${value ? 'text-ink' : 'text-stone/50'}`}>
        {value ?? 'Not recorded'}
      </span>
    </div>
  );
}
