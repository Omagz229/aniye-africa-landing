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
import { CATALOG_ITEMS, eligibleItems, findCatalogItem, itemEligibility, snapshotItem } from '../catalog';
import { formatMoney } from '../money';
import type { Money } from '../money';
import type { Decision, ExecutionBrief, Moment, OperationalEvent } from './types';
import { isPlainRecord } from './types';
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
      // Copied, not aliased — the same rule the item snapshot follows. A written
      // Decision must not hold a live reference into the brief it was judged
      // against.
      approvedBudget: { ...constraints.approvedBudget },
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

// ─── The repository trust boundary ───────────────────────────────────────────

/**
 * Prove a submitted selection against recomputed truth.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 * `buildItemSelection` produces correct evidence, but the repository must not
 * *assume* its caller used it. Before this function, `commitItemSelection`
 * checked the brief id and revision and then took the rest of the Decision on
 * trust — so a structurally valid bundle could keep the right brief reference
 * while carrying a different approved budget, different exclusions, a truncated
 * candidate set or a selected-item snapshot at the wrong price, and still be
 * written. The audit trail would have been internally consistent and wrong,
 * which is the worst failure an audit trail has.
 *
 * The rule is simple and absolute: **the repository recomputes the answer and
 * compares, rather than believing what it was handed.** Anything it cannot
 * reproduce exactly is refused, and nothing is written.
 *
 * ─── Where truth comes from ──────────────────────────────────────────────────
 * The **live confirmed brief's immutable snapshot** — never the current
 * Workspace policy. A policy edited since the Moment was generated did not
 * govern this Moment, and reading it here would let a later edit silently
 * change what was allowed. The catalog, by contrast, *is* read live: an item
 * withdrawn, repriced or newly excluded between the screen opening and the
 * operator confirming must stop the write.
 *
 * Pure. It reads nothing and writes nothing; the repository hands it state.
 */

/** What the boundary compares against. All of it recomputed, none of it trusted. */
export interface VerifySelectionInput {
  workspaceId: string;
  moment: Moment;
  /** Every brief for this Moment, as stored. The live one is resolved here. */
  briefs: readonly ExecutionBrief[];
  /** Every Decision for this workspace, as stored. */
  decisions: readonly Decision[];
  write: SelectionBundle;
  /** The catalog as it is **now**. Injected so staleness is testable. */
  items?: readonly CatalogItem[];
}

export type VerifySelectionResult = { ok: true } | { ok: false; reason: string };

/** Every refusal ends the same way: nothing was written, go and look again. */
const REVIEW_AGAIN = 'Review the moment and choose again — nothing was recorded.';

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `${what} ${REVIEW_AGAIN}` };
}

function sameMoney(a: unknown, b: Money): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const m = a as Partial<Money>;
  return m.amountMinor === b.amountMinor && m.currency === b.currency;
}

function sameStringList(a: unknown, b: readonly string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

function sameSnapshot(a: unknown, b: CatalogItemSnapshot): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const s = a as Partial<CatalogItemSnapshot>;
  return (
    s.itemId === b.itemId &&
    s.name === b.name &&
    s.category === b.category &&
    sameMoney(s.price, b.price)
  );
}

export function verifyItemSelection(input: VerifySelectionInput): VerifySelectionResult {
  const { workspaceId, moment } = input;

  // ── 0. The submission itself must be a record before anything is read ──
  //
  // Callable directly, so it cannot assume the repository already checked.
  if (!isPlainRecord(input.write)) {
    return refuse('That submission is not a record.');
  }
  const { decision, event } = input.write as Partial<SelectionBundle>;
  if (!isPlainRecord(decision)) return refuse('That submission carries no readable decision.');
  if (!isPlainRecord(event)) return refuse('That submission carries no readable event.');

  const items = input.items ?? CATALOG_ITEMS;

  // ── 1. The Decision must be the kind of record this operation writes ──
  if (decision.decisionType !== 'ItemSelection') {
    return refuse('That decision does not record an item selection.');
  }
  if (decision.status !== 'Confirmed') {
    return refuse('An item selection is only ever recorded as Confirmed.');
  }
  // ADR-006: choosing between real alternatives is a human judgement. A rule
  // engine has no basis for it, and recording one as automatic would misstate
  // who is answerable for the choice.
  if (decision.provider !== 'HumanOperator') {
    return refuse('An item selection must be recorded as an operator judgement.');
  }
  if (typeof decision.reason !== 'string' || decision.reason.trim().length === 0) {
    return refuse('An item selection needs a reason.');
  }
  // H3.3 makes no recommendation, so there is nothing to recommend or override.
  if (decision.recommendation !== undefined || decision.overrideReason !== undefined) {
    return refuse('An item selection carries no recommendation to override.');
  }
  if (decision.workspaceId !== workspaceId || decision.momentId !== moment.id) {
    return refuse('That decision belongs to a different workspace or moment.');
  }

  // ── 2. The Moment must still be executable ──
  if (moment.status === 'Cancelled') {
    return refuse('That moment has been cancelled.');
  }
  if (moment.status !== 'ReadyForExecution') {
    return refuse('That moment is no longer ready for execution.');
  }

  // ── 3. One live selection, ever ──
  if (findLiveSelectionDecision(input.decisions, moment.id)) {
    return refuse('An item has already been chosen for this moment.');
  }

  // ── 4. The brief the operator saw must still be the live one ──
  const live = input.briefs.find(b => b.momentId === moment.id && b.status === 'Confirmed') ?? null;
  if (!live) {
    return refuse('This moment has no confirmed brief.');
  }

  if (!isPlainRecord(decision.inputs)) {
    return refuse('That decision records nothing readable.');
  }
  const inputs = decision.inputs;
  if (inputs.briefId !== live.id || inputs.briefRevision !== live.revision) {
    return refuse('The brief was corrected while this was open.');
  }

  // ── 5. Constraints come from the live brief, not from the submission ──
  const snapshot = live.policyResolutionSnapshot;
  const budget = snapshot.approvedRecognitionBudget;
  const excluded = snapshot.excludedCategories;
  if (excluded === undefined) {
    return refuse('The rule that governed this moment was never recorded, so no item can be chosen against it.');
  }

  // ── 6. Recompute, then compare. Nothing below trusts the caller. ──
  const eligible = eligibleItems({ approvedBudget: budget, excludedCategories: excluded }, items);

  const chosen = findCatalogItem(String(inputs.selectedItemId ?? ''), items);
  if (!chosen) {
    return refuse('That item is no longer in the catalog.');
  }
  // Named individually so the operator learns *what changed*, not merely that
  // something did.
  const eligibility = itemEligibility(chosen, { approvedBudget: budget, excludedCategories: excluded });
  if (!eligibility.eligible) {
    switch (eligibility.reason) {
      case 'inactive':
        return refuse(`"${chosen.name}" has been withdrawn from the catalog.`);
      case 'currency-mismatch':
        return refuse(`"${chosen.name}" is no longer priced in ${budget.currency}.`);
      case 'over-budget':
        return refuse(`"${chosen.name}" is now priced above the approved budget.`);
      case 'category-excluded':
        return refuse(`"${chosen.name}" is in a category this moment's rule excludes.`);
    }
  }

  const expectedSnapshot = snapshotItem(chosen);
  const expectedCandidates = eligible.map(snapshotItem);

  if (!sameMoney(inputs.approvedBudget, budget)) {
    return refuse('The recorded budget does not match the brief.');
  }
  if (!sameStringList(inputs.excludedCategories, excluded)) {
    return refuse('The recorded exclusions do not match the brief.');
  }
  // Order is part of the evidence: `eligibleItems` is a total order, so a
  // reordered list is a list that was not produced by this system.
  if (!sameStringList(inputs.candidateItemIds, eligible.map(i => i.id))) {
    return refuse('The recorded list of qualifying items does not match the catalog.');
  }
  if (
    !Array.isArray(inputs.candidates) ||
    inputs.candidates.length !== expectedCandidates.length ||
    !inputs.candidates.every((c, i) => sameSnapshot(c, expectedCandidates[i]))
  ) {
    return refuse('The recorded details of the qualifying items do not match the catalog.');
  }
  if (!sameSnapshot(inputs.selectedItem, expectedSnapshot)) {
    return refuse('The recorded details of the chosen item do not match the catalog.');
  }

  // ── 7. The Event must describe the same occurrence ──
  if (event.eventType !== 'ItemSelected') {
    return refuse('That event does not record an item selection.');
  }
  if (event.workspaceId !== workspaceId || event.momentId !== moment.id) {
    return refuse('That event belongs to a different workspace or moment.');
  }
  if (event.actorType !== 'Operator') {
    return refuse('An item selection is an operator action.');
  }
  // The choice was made in the platform. A `WhatsApp` or `Phone` source here
  // would claim it arrived through a channel that recorded nothing.
  if (event.source !== 'Platform') {
    return refuse('An item selection recorded here came through the platform.');
  }
  if (event.actorId !== decision.actorId) {
    return refuse('The decision and event name different actors.');
  }

  if (!isPlainRecord(event.payload)) {
    return refuse('That item-selection event records nothing readable.');
  }
  const payload = event.payload;
  if (
    payload.briefId !== inputs.briefId ||
    payload.briefRevision !== inputs.briefRevision ||
    payload.itemId !== inputs.selectedItemId
  ) {
    return refuse('The event and the decision disagree about what was chosen.');
  }

  // One transaction, therefore one instant. The builder writes `now` to all
  // four; anything else means the pair was assembled from two different moments
  // and the timeline would lie about when the choice happened.
  if (decision.createdAt !== decision.confirmedAt) {
    return refuse('The decision was created and confirmed at different times.');
  }
  if (event.occurredAt !== event.recordedAt || event.occurredAt !== decision.confirmedAt) {
    return refuse('The event and the decision disagree about when this happened.');
  }

  return { ok: true };
}
