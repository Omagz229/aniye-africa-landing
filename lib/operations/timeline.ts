/**
 * The safe recipient timeline — H3.8, implementing
 * [ADR-014](../../docs/adr/ADR-014-moment-closure-memory-and-safe-timeline.md) §7.
 *
 * A pure, exact-key **whitelist** projection. It is built by **naming every
 * field individually into a fresh object** — never a spread of an internal
 * record with fields hidden in the UI, because hiding a field is not excluding
 * it.
 *
 * ⚠️ **This is an internal Operations preview, not a customer portal.** ADR-010
 * forbids giving a recipient access while Operations runs on browser storage.
 * H4.0 owns the actual customer-facing route; this module only proves the
 * projection is correct and safe.
 */

import type { GiftCategory } from '../workspace';
import type { Decision, Memory, MemoryOutcome, Moment, RecognitionOrder } from './types';
import { isPlainRecord } from './types';

/**
 * Exactly nine required fields (ADR-014 §7). `giftCategory` is **required**
 * and resolved through the RecognitionOrder's immutable `itemSelectionDecisionId`
 * — never through whichever `ItemSelection` Decision happens to be currently
 * live for the Moment, because a later re-selection on a different path must
 * not silently relabel a closed Memory's gift.
 */
export interface RecipientTimelineEntry {
  entryId: string;
  recipientFirstName: string;
  recipientLastName: string;
  occasion: string;
  plannedDate: string;
  outcomeDate: string;
  outcome: MemoryOutcome;
  giftCategory: GiftCategory;
  /** Derived only from fields 2–8. Never persisted; never operator-authored. */
  summary: string;
}

/** The exact nine keys — and the whole of them. Enforced at a boundary below. */
export const TIMELINE_ENTRY_KEYS = [
  'entryId', 'recipientFirstName', 'recipientLastName', 'occasion',
  'plannedDate', 'outcomeDate', 'outcome', 'giftCategory', 'summary',
] as const;

/** Runtime proof that a projection carries exactly the nine whitelisted keys. */
export function hasExactTimelineKeys(entry: Record<string, unknown>): boolean {
  const keys = Object.keys(entry).sort();
  const expected = [...TIMELINE_ENTRY_KEYS].sort();
  return keys.length === expected.length && keys.every((k, i) => k === expected[i]);
}

export type TimelineResult =
  | { ok: true; value: RecipientTimelineEntry }
  | { ok: false; reason: string };

/**
 * Build one safe timeline entry for a closed Moment's Memory.
 *
 * `giftCategory` is read from the **exact** immutable `ItemSelection` Decision
 * named by `order.itemSelectionDecisionId` — not from `findLiveItemSelection`,
 * which answers a different question ("what is chosen *now*") that a later
 * re-selection on this Moment's chain could silently change.
 */
export function buildRecipientTimelineEntry(
  memory: Memory,
  moment: Moment,
  order: RecognitionOrder | null,
  decisions: readonly Decision[],
): TimelineResult {
  if (memory.momentId !== moment.id) {
    return { ok: false, reason: 'That memory does not belong to this moment.' };
  }
  if (!order || order.id !== memory.recognitionOrderId) {
    return {
      ok: false,
      reason: 'No recognition order backs this memory, so the gift category cannot be resolved safely.',
    };
  }

  const itemDecision = decisions.find(d => d.id === order.itemSelectionDecisionId) ?? null;
  if (!itemDecision || !isPlainRecord(itemDecision.inputs)) {
    return { ok: false, reason: 'The immutable item selection behind this memory could not be read.' };
  }
  const snapshot = itemDecision.inputs.selectedItem;
  if (!isPlainRecord(snapshot) || typeof snapshot.category !== 'string') {
    return { ok: false, reason: 'The item selection carries no readable gift category.' };
  }
  const giftCategory = snapshot.category as GiftCategory;

  const recipientFirstName = moment.recipientSnapshot.firstName;
  const recipientLastName = moment.recipientSnapshot.lastName;
  const occasion = moment.occasionType;
  const plannedDate = moment.targetDate;
  const outcomeDate = memory.outcomeDate;
  const outcome = memory.outcome;

  // Named field by field into a fresh object — never a spread.
  const entry: RecipientTimelineEntry = {
    entryId: memory.id,
    recipientFirstName,
    recipientLastName,
    occasion,
    plannedDate,
    outcomeDate,
    outcome,
    giftCategory,
    summary: buildSummary({ recipientFirstName, occasion, outcome, giftCategory }),
  };

  if (!hasExactTimelineKeys(entry as unknown as Record<string, unknown>)) {
    return { ok: false, reason: 'The timeline projection did not resolve to its exact nine fields.' };
  }

  return { ok: true, value: entry };
}

function buildSummary(parts: {
  recipientFirstName: string;
  occasion: string;
  outcome: MemoryOutcome;
  giftCategory: GiftCategory;
}): string {
  const verb = parts.outcome === 'Delivered' ? 'received' : parts.outcome;
  return `${parts.recipientFirstName} ${verb} a ${parts.giftCategory} gift for ${parts.occasion}.`;
}

/**
 * Every safe timeline entry for one person, in **outcome order**.
 *
 * Entries that cannot be safely resolved (no order, no readable item
 * selection) are omitted rather than shown with a missing gift category —
 * `giftCategory` is required, never optional, on this projection.
 */
export function listRecipientTimeline(
  personId: string,
  moments: readonly Moment[],
  memories: readonly Memory[],
  orders: readonly RecognitionOrder[],
  decisions: readonly Decision[],
): RecipientTimelineEntry[] {
  const personMoments = new Map(moments.filter(m => m.personId === personId).map(m => [m.id, m]));

  const entries: RecipientTimelineEntry[] = [];
  for (const memory of memories) {
    const moment = personMoments.get(memory.momentId);
    if (!moment) continue;
    const order = orders.find(o => o.id === memory.recognitionOrderId) ?? null;
    const built = buildRecipientTimelineEntry(memory, moment, order, decisions);
    if (built.ok) entries.push(built.value);
  }

  return entries.sort((a, b) => a.outcomeDate.localeCompare(b.outcomeDate));
}
