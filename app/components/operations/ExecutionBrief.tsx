'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkspace } from '@/lib/workspace';
import type { DeliveryAddress, Person } from '@/lib/workspace';
import { formatAddress, formatMoney } from '@/lib/workspace';
import { browserOperationsRepository } from '@/lib/operations/local-store';
import type { Decision, ExecutionBrief as Brief, Moment } from '@/lib/operations/types';
import { buildBriefConfirmation, buildBriefRevision, previewBrief } from '@/lib/operations/briefs';
import type { BriefPreview } from '@/lib/operations/briefs';

const EMPTY_ADDRESS = {
  line1: '', line2: '', city: '', stateOrRegion: '',
  postalCode: '', countryCode: '', landmark: '', deliveryInstructions: '',
};

const field =
  'w-full rounded-lg border border-stone/20 bg-white px-3 py-2 font-body text-sm text-ink placeholder:text-stone/40 focus:outline-none focus:ring-2 focus:ring-gold transition-shadow';

export default function ExecutionBriefPanel({ momentId }: { momentId: string }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [person, setPerson] = useState<Person | undefined>(undefined);
  const [live, setLive] = useState<Brief | null>(null);
  const [history, setHistory] = useState<Brief[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Override draft — **UI state only**. ADR-006: draft choices are never
  // persisted, and nothing here reaches storage until the operator confirms.
  const [overriding, setOverriding] = useState(false);
  const [address, setAddress] = useState({ ...EMPTY_ADDRESS });
  const [reason, setReason] = useState('');

  useEffect(load, [momentId]);

  function load() {
    const ws = getWorkspace();
    const repo = browserOperationsRepository();
    if (!ws || !repo) return;
    setWorkspaceId(ws.organizationId);

    const found = repo.findMoment(ws.organizationId, momentId);
    if (!found.ok || !found.value) { setNotFound(true); return; }
    setMoment(found.value);
    setPerson(ws.people.find(p => p.id === found.value!.personId));

    const current = repo.findLiveBriefForMoment(ws.organizationId, momentId);
    if (current.ok) setLive(current.value);
    const all = repo.listBriefsForMoment(ws.organizationId, momentId);
    if (all.ok) setHistory(all.value);
    const state = repo.load(ws.organizationId);
    if (state.ok && state.value) {
      setDecisions(state.value.decisions.filter(d => d.momentId === momentId));
    }
  }

  function ids() {
    return {
      brief: () => `brief-${crypto.randomUUID()}`,
      moment: () => `moment-${crypto.randomUUID()}`,
      decision: () => `decision-${crypto.randomUUID()}`,
      event: () => `event-${crypto.randomUUID()}`,
    };
  }

  function handleConfirm() {
    if (!moment || !workspaceId) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setError(null);

    const built = buildBriefConfirmation({
      moment, person, now: new Date().toISOString(), ids: ids(),
      existingBrief: live,
      ...(overriding ? { override: { address, reason } } : {}),
    });
    if (!built.ok) { setError(built.reason); return; }

    const written = repo.commitBrief(workspaceId, built.value, built.value.brief.confirmedAt);
    if (!written.ok) { setError(written.reason); return; }

    setOverriding(false);
    setAddress({ ...EMPTY_ADDRESS });
    setReason('');
    load();
  }

  function handleRevise() {
    if (!moment || !workspaceId || !live) return;
    const repo = browserOperationsRepository();
    if (!repo) return;
    setError(null);

    // Supersede the Decision that confirmed the brief being replaced.
    const priorDecision = decisions.find(
      d =>
        d.status === 'Confirmed' &&
        (d.decisionType === 'BriefConfirmation' || d.decisionType === 'AddressOverride') &&
        (d.inputs as { briefId?: string }).briefId === live.id,
    );

    const built = buildBriefRevision({
      moment, current: live, address, reason,
      now: new Date().toISOString(), ids: ids(),
      supersedesDecisionId: priorDecision?.id,
    });
    if (!built.ok) { setError(built.reason); return; }

    const written = repo.commitBrief(workspaceId, built.value, built.value.brief.confirmedAt);
    if (!written.ok) { setError(written.reason); return; }

    setOverriding(false);
    setAddress({ ...EMPTY_ADDRESS });
    setReason('');
    load();
  }

  if (notFound) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center">
        <p className="font-body text-sm text-stone mb-4">That moment no longer exists.</p>
        <Link href="/operations/moments"
          className="font-body text-sm font-semibold text-ink hover:text-gold transition-colors">
          Back to the queue
        </Link>
      </div>
    );
  }

  if (!moment) return <div className="bg-white rounded-2xl p-8"><p className="font-body text-sm text-stone">Loading…</p></div>;

  // Preview writes nothing. Recomputed on every render, deliberately.
  const preview: BriefPreview = previewBrief(moment, person, {
    existingBrief: live,
    ...(overriding ? { overrideAddress: address } : {}),
  });
  const snapshot = moment.policyResolutionSnapshot;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/operations/moments/${moment.id}`}
          className="font-body text-sm text-stone hover:text-ink transition-colors mb-3 inline-block">
          ← Back to the moment
        </Link>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">Brief</h2>
        <p className="font-body text-sm text-stone mt-1">
          {moment.recipientSnapshot.firstName} {moment.recipientSnapshot.lastName} · {moment.occasionType}
        </p>
      </div>

      {live && (
        <div className="bg-ink text-cream rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold">
            Confirmed — revision {live.revision}
          </p>
          <p className="font-body text-xs text-cream/70 mt-1">
            {new Date(live.confirmedAt).toLocaleString()} · shipping to {formatAddress(live.deliveryAddressSnapshot)}
          </p>
        </div>
      )}

      {/* The work itself */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-5">
        <Row label="Recipient" value={`${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`} />
        <Row label="Group" value={moment.relationshipGroupSnapshot.name} />
        <Row label="Occasion" value={moment.occasionType} />
        <Row label="Target date" value={moment.targetDate} />
        {snapshot && <Row label="Budget" value={formatMoney(snapshot.approvedRecognitionBudget)} />}

        <div>
          <p className="font-body text-xs uppercase tracking-wide text-stone/60 mb-1.5">Delivery address</p>
          {preview.draft?.address ? (
            <>
              <p className="font-body text-sm text-ink">{formatAddress(preview.draft.address)}</p>
              {preview.draft.address.landmark && (
                <p className="font-body text-xs text-stone mt-0.5">Landmark: {preview.draft.address.landmark}</p>
              )}
              {preview.draft.address.deliveryInstructions && (
                <p className="font-body text-xs text-stone mt-0.5">{preview.draft.address.deliveryInstructions}</p>
              )}
              <p className="font-body text-xs text-stone/60 mt-1">
                {preview.draft.addressSource === 'OperatorOverride'
                  ? 'Operator-supplied for this brief only'
                  : 'From the customer’s record'}
              </p>
            </>
          ) : (
            <p className="font-body text-sm text-stone/60">Not on file.</p>
          )}
        </div>

        {snapshot && (
          <div>
            <p className="font-body text-xs uppercase tracking-wide text-stone/60 mb-1.5">Constraints</p>
            <ul className="space-y-1">
              {preview.draft?.constraints.map((c, i) => (
                <li key={i} className="font-body text-sm text-ink">{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* No dead ends: every blocker names its own way out (Doctrine §1.8). */}
      {preview.blockers.length > 0 && (
        <div className="bg-gold/10 rounded-2xl px-5 py-4">
          <p className="font-body text-sm font-semibold text-ink mb-2">
            {live ? 'This brief is already confirmed' : 'Not ready to confirm'}
          </p>
          <ul className="space-y-2">
            {preview.blockers.map(b => (
              <li key={b.code} className="font-body text-sm text-stone leading-snug">
                {b.message}
                {b.recovery && <span className="block text-xs text-stone/80 mt-0.5">{b.recovery}</span>}
                {b.href && (
                  <Link href={b.href} className="font-semibold text-ink hover:text-gold transition-colors ml-1">
                    Open in Workspace →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="bg-white rounded-2xl px-5 py-4">
          <p className="font-body text-sm text-ink">{error}</p>
        </div>
      )}

      {/* Override / correction. Never writes to the customer's record. */}
      {moment.status === 'ReadyForExecution' && (
        <div className="bg-white rounded-2xl p-5 sm:p-6">
          {!overriding ? (
            <button type="button" onClick={() => { setOverriding(true); setError(null); }}
              className="font-body text-sm text-stone hover:text-ink transition-colors underline underline-offset-2">
              {live ? 'Correct the delivery address' : 'Use a different address for this brief'}
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-body text-sm font-semibold text-ink">
                  {live ? 'Correct the address' : 'Address for this brief only'}
                </p>
                <p className="font-body text-xs text-stone/70 mt-1 leading-snug">
                  This applies to this brief alone. The customer’s record is not changed — ask them to
                  update it in Workspace if the address is wrong there too.
                </p>
              </div>

              <input className={field} value={address.line1} placeholder="Street address"
                onChange={e => setAddress(a => ({ ...a, line1: e.target.value }))} />
              <input className={field} value={address.line2} placeholder="Apartment, floor or building (optional)"
                onChange={e => setAddress(a => ({ ...a, line2: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={field} value={address.city} placeholder="City"
                  onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} />
                <input className={field} value={address.stateOrRegion} placeholder="State or region (optional)"
                  onChange={e => setAddress(a => ({ ...a, stateOrRegion: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={`${field} uppercase`} maxLength={2} value={address.countryCode} placeholder="Country (NG)"
                  onChange={e => setAddress(a => ({ ...a, countryCode: e.target.value.toUpperCase() }))} />
                <input className={field} value={address.postalCode} placeholder="Postal code (optional)"
                  onChange={e => setAddress(a => ({ ...a, postalCode: e.target.value }))} />
              </div>
              <input className={field} value={address.landmark} placeholder="Nearest landmark (optional)"
                onChange={e => setAddress(a => ({ ...a, landmark: e.target.value }))} />
              <input className={field} value={address.deliveryInstructions} placeholder="Delivery notes (optional)"
                onChange={e => setAddress(a => ({ ...a, deliveryInstructions: e.target.value }))} />

              <div>
                <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="ov-reason">
                  Why is this being changed?
                </label>
                <input id="ov-reason" className={field} value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Recipient has moved office; confirmed by phone" />
                <p className="font-body text-xs text-stone/70 mt-1.5">
                  Required. It becomes part of the permanent record.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={live ? handleRevise : handleConfirm}
                  className="rounded-full bg-ink text-cream px-5 py-2.5 font-body text-sm font-semibold hover:bg-ink/90 transition-colors">
                  {live ? 'Save correction' : 'Confirm with this address'}
                </button>
                <button type="button"
                  onClick={() => { setOverriding(false); setAddress({ ...EMPTY_ADDRESS }); setReason(''); setError(null); }}
                  className="rounded-full border border-stone/20 px-5 py-2.5 font-body text-sm text-stone hover:text-ink transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* One primary action, chosen from state (Doctrine §1.1). */}
      {!live && !overriding && (
        <button type="button" onClick={handleConfirm} disabled={!preview.confirmable}
          className="rounded-full bg-ink text-cream px-6 py-3 font-body text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Confirm this brief
        </button>
      )}

      {/* Correction history — preserved, never rewritten. */}
      {history.length > 1 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6">
          <p className="font-body text-sm font-semibold text-ink mb-3">Revisions</p>
          <ol className="space-y-3">
            {history.map(b => (
              <li key={b.id} className="border-l-2 border-stone/15 pl-3">
                <p className="font-body text-sm text-ink">
                  Revision {b.revision}
                  {b.status === 'Superseded' && <span className="text-stone/60"> · superseded</span>}
                </p>
                <p className="font-body text-xs text-stone mt-0.5">
                  {formatAddress(b.deliveryAddressSnapshot)}
                </p>
                {b.addressOverride && (
                  <p className="font-body text-xs text-stone/70 mt-0.5">
                    {b.addressOverride.reason} · {new Date(b.addressOverride.overriddenAt).toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-xs uppercase tracking-wide text-stone/60 mb-1">{label}</p>
      <p className="font-body text-sm text-ink">{value}</p>
    </div>
  );
}

export type { DeliveryAddress };
