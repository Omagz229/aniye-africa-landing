/**
 * Manual item selection — H3.3, checkpoint milestone 5.
 *
 * **The first Decision with real alternatives.** Everything before it was a
 * deterministic resolution or a yes/no confirmation; here several items fit the
 * budget and the rule, the operator picks one, and the reason matters later.
 * That is exactly ADR-006's test for a Decision.
 *
 * Every function is **pure**. Nothing here reads or writes storage, which is
 * what makes "browsing writes nothing" enforceable rather than merely claimed:
 * previewing, filtering and changing a draft selection call functions that have
 * nothing to persist with. Only `OperationsRepository.commitItemSelection`
 * writes, and only on confirmation.
 */

import type { CatalogItem, CatalogItemSnapshot, ItemConstraints } from '../catalog';
import { CATALOG_ITEMS, eligibleItems, findCatalogItem, snapshotItem } from '../catalog';
import { formatMoney } from '../money';
import type { Money } from '../money';
import type { Decision, ExecutionBrief, Moment, OperationalEvent } from './types';
import type { IdFactory } from './generation';

// ─── Preview ─────────────────────────────────────────────────────────────────

/** A named reason an item cannot be selected, with the way out of it. */
export interface SelectionBlocker {
  code:
    | 'moment-cancelled'
    | 'moment-not-ready'
    | 'no-confirmed-brief'
    | 'constraints-unrecorded'
    | 'selection-exists'
    | 'no-eligible-items';
  message: string;
  /** What the operator can do about it. Doctrine §1.8 — no dead ends. */
  recovery: string;
  /** Where to go. Operations links out; it never edits configuration. */
  href?: string;
}

export interface SelectionPreview {
  momentId: string;
  /** Present once a confirmed brief has been found. */
  brief: ExecutionBrief | null;
  approvedBudget: Money | null;
  /**
   * `null` means **not recorded**, which is not the same as `[]`. The interface
   * must render the two differently and this type keeps them distinguishable.
   */
  excludedCategories: readonly string[] | null;
  /** Complete, deterministically ordered. Empty when nothing qualifies. */
  eligible: CatalogItem[];
  /** The already-confirmed selection, when there is one. */
  confirmed: ConfirmedSelection | null;
  blockers: SelectionBlocker[];
  /** True only when an operator may confirm a choice right now. */
  selectable: boolean;
}

/** A confirmed selection, read back out of its Decision for display. */
export interface ConfirmedSelection {
  decisionId: string;
  item: CatalogItemSnapshot;
  reason: string;
  confirmedAt: string;
  briefId: string;
  briefRevision: number;
}

export interface SelectionContext {
  moment: Moment;
  /** The Moment's current live brief, or null if it has none. */
  brief: ExecutionBrief | null;
  /** Every Decision recorded against this Moment. */
  decisions: readonly Decision[];
  /** Injected so the catalog can be varied under test. */
  items?: readonly CatalogItem[];
}

/**
 * The live selection Decision for a Moment, or null.
 *
 * `Confirmed` only — a superseded selection is history, not the current answer.
 */
export function findLiveSelectionDecision(
  decisions: readonly Decision[],
  momentId: string,
): Decision | null {
  return (
    decisions.find(
      d => d.momentId === momentId && d.decisionType === 'ItemSelection' && d.status === 'Confirmed',
    ) ?? null
  );
}

function readConfirmed(decision: Decision): ConfirmedSelection | null {
  const inputs = decision.inputs as {
    selectedItem?: CatalogItemSnapshot;
    briefId?: string;
    briefRevision?: number;
  };
  if (!inputs.selectedItem) return null;
  return {
    decisionId: decision.id,
    item: inputs.selectedItem,
    reason: decision.reason,
    confirmedAt: decision.confirmedAt,
    briefId: inputs.briefId ?? '',
    briefRevision: inputs.briefRevision ?? 0,
  };
}

/**
 * What the operator may choose from, and what stops them.
 *
 * **Writes nothing.** Call it on every render, on every keystroke of a filter,
 * as often as you like.
 *
 * The constraints come from the **brief's** policy snapshot rather than a live
 * policy read. The brief copied that snapshot from the Moment at confirmation,
 * and the Moment captured it at generation; a policy edited since then did not
 * govern this Moment, so filtering against it would quietly rewrite history.
 */
export function previewItemSelection(context: SelectionContext): SelectionPreview {
  const { moment, brief } = context;
  const items = context.items ?? CATALOG_ITEMS;
  const blockers: SelectionBlocker[] = [];

  const liveDecision = findLiveSelectionDecision(context.decisions, moment.id);
  const confirmed = liveDecision ? readConfirmed(liveDecision) : null;

  if (moment.status === 'Cancelled') {
    blockers.push({
      code: 'moment-cancelled',
      message: 'This moment was cancelled, so nothing further can be chosen for it.',
      recovery: 'Nothing to do here. The cancellation and its reason stay on the record.',
    });
  } else if (moment.status !== 'ReadyForExecution') {
    blockers.push({
      code: 'moment-not-ready',
      message: 'This moment still needs review, so it has no confirmed budget to choose against.',
      recovery: 'Resolve the issues listed on the moment, then confirm its brief.',
    });
  }

  if (!brief || brief.status !== 'Confirmed') {
    blockers.push({
      code: 'no-confirmed-brief',
      message: 'No brief has been confirmed for this moment yet.',
      recovery: 'Confirm the brief first — it fixes the address and the budget an item is chosen against.',
      href: `/operations/moments/${moment.id}/brief`,
    });
  }

  if (liveDecision) {
    blockers.push({
      code: 'selection-exists',
      message: 'An item has already been chosen for this moment.',
      recovery: 'It stands on the record. Changing it needs a substitution, which this build does not do.',
    });
  }

  const snapshot = brief?.policyResolutionSnapshot;
  const approvedBudget = snapshot?.approvedRecognitionBudget ?? null;
  const excludedCategories = snapshot?.excludedCategories ?? null;

  // The trust gate. A record generated before H3.3 has no exclusion snapshot,
  // and there is no honest way to reconstruct one: the policy is edited in
  // place at the same version, so matching id and version proves nothing about
  // whether its exclusions still hold. Blocking is the only correct outcome —
  // filtering against `[]` would silently permit a category the rule forbade.
  if (brief && brief.status === 'Confirmed' && excludedCategories === null) {
    blockers.push({
      code: 'constraints-unrecorded',
      message:
        'This moment was prepared before excluded gift categories were recorded, so the rule that governed it cannot be reconstructed.',
      recovery:
        'Prepare this recipient again from the campaign. A newly generated moment captures the exclusions, and this one stays on the record untouched.',
      href: `/operations/programs/${moment.programId}/prepare`,
    });
  }

  const eligible =
    approvedBudget && excludedCategories
      ? eligibleItems({ approvedBudget, excludedCategories }, items)
      : [];

  // Only worth saying once nothing else is in the way — "no items qualify" is
  // misleading advice when the real problem is that no brief exists.
  if (blockers.length === 0 && eligible.length === 0) {
    blockers.push({
      code: 'no-eligible-items',
      message: approvedBudget
        ? `Nothing in the catalog is available at ${formatMoney(approvedBudget)} once the rule’s exclusions are applied.`
        : 'Nothing in the catalog qualifies for this moment.',
      recovery:
        'The budget or the exclusions need to change, and both belong to the customer. Ask them to revise the recognition rule, then prepare this recipient again.',
      href: '/workspace/policies',
    });
  }

  return {
    momentId: moment.id,
    brief: brief ?? null,
    approvedBudget,
    excludedCategories,
    eligible,
    confirmed,
    blockers,
    selectable: blockers.length === 0,
  };
}

// ─── Confirmation ────────────────────────────────────────────────────────────

/** What one confirmation writes: the Decision and its Event, together. */
export interface SelectionBundle {
  decision: Decision;
  event: OperationalEvent;
}

export interface ConfirmSelectionInput extends SelectionContext {
  selectedItemId: string;
  reason: string;
  now: string;
  ids: IdFactory;
  actorId?: string;
}

export type SelectionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Build everything a confirmed selection writes.
 *
 * **Refuses rather than repairs.** If the preview is not selectable, or the
 * chosen item is not in the eligible set computed here and now, nothing is
 * built — so the caller can never end up holding a half-valid Decision to
 * persist. Re-deriving eligibility rather than trusting the caller's list is
 * the point: the screen the operator is looking at may be minutes old.
 */
export function buildItemSelection(input: ConfirmSelectionInput): SelectionResult<SelectionBundle> {
  const { moment, now, ids, actorId } = input;

  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, reason: 'Say why you chose this item — it becomes part of the record.' };
  }

  const preview = previewItemSelection(input);
  if (!preview.selectable) {
    return {
      ok: false,
      reason: preview.blockers.map(b => b.message).join(' ') || 'An item cannot be chosen for this moment.',
    };
  }

  const brief = preview.brief;
  const budget = preview.approvedBudget;
  const excluded = preview.excludedCategories;
  // `selectable` already implies all three, but the compiler does not know it
  // and a future edit to the blocker list should not be able to slip past.
  if (!brief || !budget || !excluded) {
    return { ok: false, reason: 'This moment has no confirmed budget and exclusions to choose against.' };
  }

  const chosen = preview.eligible.find(item => item.id === input.selectedItemId);
  if (!chosen) {
    const known = findCatalogItem(input.selectedItemId, input.items ?? CATALOG_ITEMS);
    return {
      ok: false,
      reason: known
        ? `"${known.name}" is no longer available within this moment’s budget and exclusions. Review the list and choose again.`
        : 'That item is not in the catalog. Review the list and choose again.',
    };
  }

  const constraints: ItemConstraints = { approvedBudget: budget, excludedCategories: excluded };
  const selectedItem = snapshotItem(chosen);

  const decision: Decision = {
    id: ids.decision(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    decisionType: 'ItemSelection',
    status: 'Confirmed',
    provider: 'HumanOperator',
    actorId,
    /**
     * Enough immutable evidence to explain the judgement years later: what was
     * on the table, what governed it, and what was picked.
     *
     * The **complete** candidate set is recorded, not just a count. "Chose the
     * ceramic set from nine options" is auditable; "chose the ceramic set" is
     * an assertion. Snapshots rather than ids, because a catalog price change
     * or a withdrawal must not rewrite what was true at confirmation.
     */
    inputs: {
      briefId: brief.id,
      briefRevision: brief.revision,
      approvedBudget: constraints.approvedBudget,
      excludedCategories: [...constraints.excludedCategories],
      candidateItemIds: preview.eligible.map(item => item.id),
      candidates: preview.eligible.map(snapshotItem),
      selectedItemId: chosen.id,
      selectedItem,
    },
    // No `recommendation`: H3.3 makes none, so there is nothing to override and
    // `overrideReason` is deliberately absent rather than empty.
    finalDecision: `${selectedItem.name} — ${formatMoney(selectedItem.price)} (${selectedItem.category})`,
    reason,
    createdAt: now,
    confirmedAt: now,
  };

  const event: OperationalEvent = {
    id: ids.event(),
    workspaceId: moment.workspaceId,
    momentId: moment.id,
    // Selected, not prepared: no vendor has been asked and nothing has moved.
    eventType: 'ItemSelected',
    actorType: 'Operator',
    actorId,
    source: 'Platform',
    // The smallest payload that identifies the occurrence. The evidence lives
    // on the Decision; duplicating it here would create two versions of it.
    payload: { briefId: brief.id, briefRevision: brief.revision, itemId: chosen.id },
    occurredAt: now,
    recordedAt: now,
  };

  return { ok: true, value: { decision, event } };
}
