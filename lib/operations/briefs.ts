/**
 * Execution Brief construction — H3.2, implementing ADR-011.
 *
 * Every function here is **pure**. Nothing in this module reads or writes
 * storage, which is what makes ADR-006's rule enforceable rather than merely
 * stated: previewing a brief calls `previewBrief`, and that cannot persist
 * anything because it has nothing to persist with. Only the repository writes,
 * and only when the operator confirms.
 *
 * The brief is the operator's unit of work and is **deliberately invisible to
 * the customer** (checkpoint milestone 4). Nothing here is projected into
 * Workspace.
 */

import type { DeliveryAddress, Person, WorkspaceState } from '../workspace';
import { isAddressComplete, missingAddressFields, ADDRESS_FIELD_LABELS, normalizeAddress } from '../workspace';
import type {
  AddressOverrideRecord,
  AddressSource,
  Decision,
  ExecutionBrief,
  Moment,
  OperationalEvent,
} from './types';
import type { IdFactory } from './generation';
import type { OperationsRepository } from './store';

// ─── Preview ─────────────────────────────────────────────────────────────────

/** A named reason a brief cannot be confirmed, with the Workspace page that fixes it. */
export interface BriefBlocker {
  code: 'moment-not-ready' | 'moment-cancelled' | 'no-policy-snapshot' | 'address-incomplete' | 'brief-exists';
  message: string;
  /** Operations links out; it never edits configuration (ADR-005). */
  href?: string;
  /** What the operator can do here, without leaving Operations. */
  recovery?: string;
}

export interface BriefPreview {
  momentId: string;
  /** Null when the Moment cannot produce a brief at all. */
  draft: BriefDraft | null;
  /** Empty means confirmable. */
  blockers: BriefBlocker[];
  confirmable: boolean;
}

/** Everything a confirmation would write, before anyone has confirmed anything. */
export interface BriefDraft {
  momentId: string;
  recipientName: string;
  address?: DeliveryAddress;
  addressSource: AddressSource;
  occasionType: string;
  targetDate: string;
  constraints: string[];
}

/**
 * Constraints the operator must honour, read from the resolved policy snapshot.
 *
 * Read from the **snapshot**, never re-resolved live: the brief must render what
 * governed this Moment when it was generated, even if the policy has since been
 * edited or archived.
 */
function constraintsFrom(moment: Moment): string[] {
  const snapshot = moment.policyResolutionSnapshot;
  if (!snapshot) return [];
  const scope =
    snapshot.resolvedCountryScope === 'Global'
      ? 'Global rule — no country-specific assignment applied.'
      : `${snapshot.resolvedCountryScope}-specific rule applied.`;
  return [
    `Recognition rule: ${snapshot.policyName} (v${snapshot.policyVersion}).`,
    scope,
    `Occasion: ${snapshot.occasionType}.`,
  ];
}

/**
 * Compute what a brief for this Moment would contain, and what stops it.
 *
 * **Writes nothing.** Call it as often as you like.
 *
 * `overrideAddress` lets the operator preview a correction before committing to
 * it — the draft the interface holds, not a stored value.
 */
export function previewBrief(
  moment: Moment,
  person: Person | undefined,
  options: { existingBrief?: ExecutionBrief | null; overrideAddress?: Partial<DeliveryAddress> } = {},
): BriefPreview {
  const blockers: BriefBlocker[] = [];

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so it cannot be prepared for execution.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    // MOMENT_STATUSES is deliberately not expanded (ADR-011). A NeedsReview
    // Moment already carries named issues; the brief just refuses and points at
    // them rather than inventing a status of its own.
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review before a brief can be prepared.',
      recovery: 'Resolve the issues listed on the moment, then re-open this brief.',
    });
  }

  if (!moment.policyResolutionSnapshot) {
    blockers.push({
      code: 'no-policy-snapshot',
      message: 'No budget was resolved for this moment, so there are no constraints to brief against.',
    });
  }

  if (options.existingBrief && options.existingBrief.status === 'Confirmed') {
    blockers.push({
      code: 'brief-exists',
      message: 'A brief has already been confirmed for this moment.',
      recovery: 'Correct the address instead — that creates a new revision and preserves this one.',
    });
  }

  // The address: an operator draft wins over the customer's default for preview
  // purposes, but the customer's record is never touched either way.
  const override = normalizeAddress(options.overrideAddress);
  const address = override ?? person?.deliveryAddress;
  const addressSource: AddressSource = override ? 'OperatorOverride' : 'PersonDefault';

  if (!isAddressComplete(address)) {
    const missing = missingAddressFields(address).map(f => ADDRESS_FIELD_LABELS[f]);
    blockers.push({
      code: 'address-incomplete',
      message:
        address === undefined
          ? `${moment.recipientSnapshot.firstName} has no delivery address on file.`
          : `The delivery address is missing a ${missing.join(' and ')}.`,
      // Doctrine §1.8 — name the problem and the route out of it.
      href: '/workspace/people',
      recovery:
        'Ask the customer to add it in Workspace, or record a one-off override below with a reason.',
    });
  }

  const draft: BriefDraft | null =
    moment.policyResolutionSnapshot === undefined
      ? null
      : {
          momentId: moment.id,
          recipientName: `${moment.recipientSnapshot.firstName} ${moment.recipientSnapshot.lastName}`.trim(),
          address,
          addressSource,
          occasionType: moment.occasionType,
          targetDate: moment.targetDate,
          constraints: constraintsFrom(moment),
        };

  return { momentId: moment.id, draft, blockers, confirmable: blockers.length === 0 };
}

// ─── Confirmation ────────────────────────────────────────────────────────────

/** What one confirmation writes: the brief, its Decision, and its Event. */
export interface BriefBundle {
  brief: ExecutionBrief;
  decision: Decision;
  event: OperationalEvent;
  /** Set when this bundle revises an earlier brief. */
  supersedes?: { briefId: string; decisionId?: string };
}

export interface ConfirmBriefInput {
  moment: Moment;
  person: Person | undefined;
  now: string;
  ids: IdFactory & { brief: () => string };
  actorId?: string;
  /** Present only when the operator is overriding the customer's address. */
  override?: { address: Partial<DeliveryAddress>; reason: string; source?: OperationalEvent['source'] };
  existingBrief?: ExecutionBrief | null;
}

export type BriefResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Build everything a first confirmation writes.
 *
 * Refuses rather than repairs: if the preview is not confirmable, nothing is
 * built. The caller cannot end up with a half-valid brief to persist.
 */
export function buildBriefConfirmation(input: ConfirmBriefInput): BriefResult<BriefBundle> {
  const { moment, person, now, ids, actorId } = input;

  if (input.override && input.override.reason.trim().length === 0) {
    return { ok: false, reason: 'Give a reason for the override — it becomes part of the record.' };
  }

  const preview = previewBrief(moment, person, {
    existingBrief: input.existingBrief,
    overrideAddress: input.override?.address,
  });

  if (!preview.confirmable || !preview.draft) {
    return { ok: false, reason: preview.blockers.map(b => b.message).join(' ') || 'This brief cannot be confirmed.' };
  }

  const snapshot = moment.policyResolutionSnapshot;
  if (!snapshot) return { ok: false, reason: 'No budget was resolved for this moment.' };

  const address = preview.draft.address;
  if (!address) return { ok: false, reason: 'No delivery address is available for this moment.' };

  const overrideRecord: AddressOverrideRecord | undefined = input.override
    ? {
        reason: input.override.reason.trim(),
        actorType: 'Operator',
        actorId,
        source: input.override.source ?? 'Platform',
        overriddenAt: now,
        previousAddress: person?.deliveryAddress,
        previousAddressSource: 'PersonDefault',
      }
    : undefined;

  const briefId = ids.brief();

  const brief: ExecutionBrief = {
    id: briefId,
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    status: 'Confirmed',
    revision: 1,
    recipientSnapshot: moment.recipientSnapshot,
    relationshipGroupSnapshot: moment.relationshipGroupSnapshot,
    policyResolutionSnapshot: snapshot,
    // Copied, not referenced (ADR-011).
    deliveryAddressSnapshot: address,
    addressSource: preview.draft.addressSource,
    ...(overrideRecord ? { addressOverride: overrideRecord } : {}),
    occasionType: moment.occasionType,
    targetDate: moment.targetDate,
    approvedBudget: snapshot.approvedRecognitionBudget,
    constraints: preview.draft.constraints,
    createdAt: now,
    confirmedAt: now,
  };

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'BriefConfirmation',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    inputs: {
      briefId,
      addressSource: brief.addressSource,
      policyId: snapshot.policyId,
      policyVersion: snapshot.policyVersion,
      hadPersonDefaultAddress: person?.deliveryAddress !== undefined,
    },
    finalDecision: `Brief confirmed for ${preview.draft.recipientName} — ${brief.occasionType} on ${brief.targetDate}.`,
    reason: overrideRecord
      ? `Confirmed against an operator-supplied address. ${overrideRecord.reason}`
      : 'Confirmed against the delivery address on the customer’s record.',
    createdAt: now,
    confirmedAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    eventType: 'BriefGenerated',
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    payload: { briefId, revision: 1, addressSource: brief.addressSource },
    occurredAt: now,
    recordedAt: now,
  };

  return { ok: true, value: { brief, decision, event } };
}

// ─── The brief queue ─────────────────────────────────────────────────────────

/** One Moment waiting for a brief, with whether its recipient can actually be reached. */
export interface QueueEntry {
  moment: Moment;
  hasAddress: boolean;
}

/**
 * What the queue screen needs, or why it could not be produced.
 *
 * The three outcomes are deliberately **distinct**: a successful read of an
 * empty store is not the same fact as a read that failed, and collapsing them
 * is how a storage failure comes to be displayed as "nothing to do".
 */
export type BriefQueueResult =
  | { status: 'ok'; waiting: QueueEntry[]; confirmed: ExecutionBrief[] }
  | { status: 'failed'; message: string; recovery: string; detail?: string };

export interface QueueDeps {
  readWorkspace: () => WorkspaceState | null;
  repository: Pick<OperationsRepository, 'listMoments' | 'listBriefs'>;
}

/**
 * Read the queue. **Writes nothing** — two list calls and pure assembly.
 *
 * Closes defect **H3.2-D1**: this previously returned an empty queue whenever a
 * read failed, so an unreadable or quarantined operations payload was rendered
 * as "no moments are ready for a brief yet". The operator would have had no way
 * to tell an empty store from a broken one, and the reassuring reading is the
 * dangerous one — work that exists would look like work that does not.
 */
export function loadBriefQueue(deps: QueueDeps): BriefQueueResult {
  const workspace = deps.readWorkspace();
  if (!workspace) {
    return {
      status: 'failed',
      message: 'The organization’s configuration could not be read.',
      recovery: 'Reload the page. Until it loads, this queue cannot say whether any briefs exist.',
    };
  }

  const moments = deps.repository.listMoments(workspace.organizationId);
  if (!moments.ok) {
    return {
      status: 'failed',
      message: 'The operational records could not be read.',
      // The adapter's reason names the real cause — a quarantined payload, a
      // foreign workspace, damaged JSON. Preserved rather than flattened.
      detail: moments.reason,
      recovery: 'Nothing has been changed. Try again; if this persists the stored data has been set aside and must be recovered before briefing.',
    };
  }

  const briefs = deps.repository.listBriefs(workspace.organizationId);
  if (!briefs.ok) {
    return {
      status: 'failed',
      message: 'The execution briefs could not be read.',
      detail: briefs.reason,
      recovery: 'Nothing has been changed. Try again; if this persists the stored data has been set aside and must be recovered before briefing.',
    };
  }

  const liveByMoment = new Set(
    briefs.value.filter(b => b.status === 'Confirmed').map(b => b.momentId),
  );
  const peopleById = new Map(workspace.people.map(p => [p.id, p]));

  return {
    status: 'ok',
    waiting: moments.value
      .filter(m => m.status === 'ReadyForExecution' && !liveByMoment.has(m.id))
      .map(m => ({
        moment: m,
        hasAddress: isAddressComplete(peopleById.get(m.personId)?.deliveryAddress),
      })),
    confirmed: briefs.value.filter(b => b.status === 'Confirmed'),
  };
}

// ─── Correction of a confirmed brief ─────────────────────────────────────────

export interface ReviseBriefInput {
  moment: Moment;
  current: ExecutionBrief;
  address: Partial<DeliveryAddress>;
  reason: string;
  now: string;
  ids: IdFactory & { brief: () => string };
  actorId?: string;
  source?: OperationalEvent['source'];
  /** The Decision that confirmed `current`, so it can be superseded. */
  supersedesDecisionId?: string;
}

/**
 * Correct the address on an already-confirmed brief.
 *
 * ADR-006 and ADR-011: the original is **preserved**, a **revision** is created,
 * the applicable Decision is **superseded**, and an
 * `ExecutionBriefAddressOverridden` Event is appended. Nothing is mutated in
 * place except the original's supersession metadata — its content, reason and
 * timestamps are never rewritten.
 *
 * `Person.deliveryAddress` is **not** touched. Not here, not later.
 */
export function buildBriefRevision(input: ReviseBriefInput): BriefResult<BriefBundle> {
  const { current, now, ids, actorId } = input;

  if (input.reason.trim().length === 0) {
    return { ok: false, reason: 'Give a reason for the correction — it becomes part of the record.' };
  }
  if (current.status !== 'Confirmed') {
    return { ok: false, reason: 'That brief has already been superseded. Correct the current one instead.' };
  }

  const address = normalizeAddress(input.address);
  if (!isAddressComplete(address) || !address) {
    const missing = missingAddressFields(address).map(f => ADDRESS_FIELD_LABELS[f]);
    return { ok: false, reason: `The corrected address is still missing a ${missing.join(' and ')}.` };
  }

  const briefId = ids.brief();

  const override: AddressOverrideRecord = {
    reason: input.reason.trim(),
    actorType: 'Operator',
    actorId,
    source: input.source ?? 'Platform',
    overriddenAt: now,
    previousAddress: current.deliveryAddressSnapshot,
    previousAddressSource: current.addressSource,
  };

  const brief: ExecutionBrief = {
    ...current,
    id: briefId,
    status: 'Confirmed',
    revision: current.revision + 1,
    revisionOfBriefId: current.id,
    supersededByBriefId: undefined,
    supersededAt: undefined,
    deliveryAddressSnapshot: address,
    addressSource: 'OperatorOverride',
    addressOverride: override,
    createdAt: now,
    confirmedAt: now,
  };

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: current.workspaceId,
    momentId: current.momentId,
    decisionType: 'AddressOverride',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    inputs: {
      briefId,
      supersededBriefId: current.id,
      previousAddress: current.deliveryAddressSnapshot,
      previousAddressSource: current.addressSource,
      revision: brief.revision,
    },
    finalDecision: `Address overridden on revision ${brief.revision}.`,
    reason: override.reason,
    createdAt: now,
    confirmedAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: current.workspaceId,
    momentId: current.momentId,
    eventType: 'ExecutionBriefAddressOverridden',
    actorType: 'Operator',
    actorId,
    source: input.source ?? 'Platform',
    payload: {
      briefId,
      supersededBriefId: current.id,
      revision: brief.revision,
      reason: override.reason,
    },
    occurredAt: now,
    recordedAt: now,
  };

  return {
    ok: true,
    value: {
      brief,
      decision,
      event,
      supersedes: { briefId: current.id, decisionId: input.supersedesDecisionId },
    },
  };
}
