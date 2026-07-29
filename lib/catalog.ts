/**
 * The minimum catalog — H3.3, checkpoint milestone 5.
 *
 * ⚠️ **This is deliberately not Catalog Intelligence.** No intent hierarchy, no
 * collections, no ranking, no personalization, no recommendations, no vendor,
 * no cost, no images. Those are H4.2 – H4.4 and are gated on the pilot, for the
 * reason the checkpoint states plainly: *intelligence built before operational
 * evidence exists is invention*. Item selection needs an operator, a list and a
 * text field. This module is the list.
 *
 * Atlas §4's `Gift / Item` draft carries `vendorId`, `intent`, `collectionIds`,
 * `vendorCost`, `images` and `tags`. Per `RELATIONSHIP_OPERATIONS_ATLAS.md` §3
 * that field list is a **draft, not a specification**, and H3.3 is the milestone
 * that reviews and re-issues it. Every field it lists beyond the six below
 * belongs to a milestone that has not been built, so none of them is here.
 *
 * Pure and framework-free. Nothing in this module reads or writes storage,
 * which is what lets the selection screen honestly claim that browsing and
 * filtering record nothing.
 */

import type { GiftCategory } from './workspace';
import type { Money } from './money';

// ─── The item ────────────────────────────────────────────────────────────────

/**
 * One thing an operator can choose for a recipient.
 *
 * Six fields, and each earns its place: an identity that survives being
 * referenced from a Decision, something to show the operator, the category the
 * governing policy filters on, whether it can be chosen at all, and a price to
 * compare against the approved budget.
 */
export interface CatalogItem {
  /** Stable across builds. A confirmed Decision references it forever. */
  id: string;
  name: string;
  /** One line, to tell two similar items apart. Not marketing copy. */
  description: string;
  /**
   * **The existing `GiftCategory` vocabulary**, not a competing taxonomy.
   * Recognition Policies already exclude by these exact strings, and a second
   * category system would mean exclusions silently stopped matching.
   */
  category: GiftCategory;
  /** Withdrawn items stay in the list so historical selections stay legible. */
  isActive: boolean;
  /** Canonical Money — integer minor units, pinned exponent (ADR-007). */
  price: Money;
}

function ngn(major: number): Money {
  return { amountMinor: Math.round(major * 100), currency: 'NGN' };
}
function kes(major: number): Money {
  return { amountMinor: Math.round(major * 100), currency: 'KES' };
}
function ghs(major: number): Money {
  return { amountMinor: Math.round(major * 100), currency: 'GHS' };
}

/**
 * The seed.
 *
 * A small deterministic list, hand-written rather than generated, priced in the
 * currencies the operating countries actually use. There is no administration
 * surface and no vendor availability: adding an item is a code change, which is
 * the correct weight for a list this size at this milestone.
 *
 * Prices are **per currency, never converted**. An item priced in KES is simply
 * not a candidate for a naira budget — see `itemEligibility`.
 */
export const CATALOG_ITEMS: readonly CatalogItem[] = [
  // ── Nigeria ──
  { id: 'item-ng-coffee-set', name: 'Single-origin coffee set', description: 'Three Nigerian-roasted single origins with a pour-over kit.', category: 'Food & Drink', isActive: true, price: ngn(28_000) },
  { id: 'item-ng-chocolate-box', name: 'Artisan chocolate box', description: 'Twenty-four pieces made with Nigerian cocoa.', category: 'Food & Drink', isActive: true, price: ngn(35_000) },
  { id: 'item-ng-spa-day', name: 'Spa half-day', description: 'Massage and treatment at a partner spa in Lagos or Abuja.', category: 'Wellness & Spa', isActive: true, price: ngn(50_000) },
  { id: 'item-ng-wellness-kit', name: 'Rest and recovery kit', description: 'Weighted throw, sleep mask and a set of teas.', category: 'Wellness & Spa', isActive: true, price: ngn(42_500) },
  { id: 'item-ng-ceramic-set', name: 'Hand-thrown ceramic set', description: 'Four cups and a serving bowl from a studio in Abeokuta.', category: 'Home & Living', isActive: true, price: ngn(38_000) },
  { id: 'item-ng-throw', name: 'Handwoven throw', description: 'Aso-oke weave in undyed cotton.', category: 'Home & Living', isActive: true, price: ngn(64_000) },
  { id: 'item-ng-headphones', name: 'Noise-cancelling headphones', description: 'Over-ear, with a two-year warranty.', category: 'Technology & Gadgets', isActive: true, price: ngn(180_000) },
  { id: 'item-ng-power-bank', name: 'Fast-charge power bank', description: '20,000mAh, three ports, cabin-safe.', category: 'Technology & Gadgets', isActive: true, price: ngn(45_000) },
  { id: 'item-ng-book-bundle', name: 'Contemporary African fiction', description: 'Three hardbacks chosen for the year.', category: 'Books & Learning', isActive: true, price: ngn(32_000) },
  { id: 'item-ng-leather-folio', name: 'Leather document folio', description: 'Full-grain, made in Kano, initials optional.', category: 'Fashion & Accessories', isActive: true, price: ngn(75_000) },
  { id: 'item-ng-art-print', name: 'Limited-edition art print', description: 'Signed, numbered, framed, from a Lagos gallery.', category: 'Art & Culture', isActive: true, price: ngn(95_000) },
  { id: 'item-ng-gym-bag', name: 'Training holdall', description: 'Water-resistant, with a separate shoe compartment.', category: 'Sports & Fitness', isActive: true, price: ngn(48_000) },
  { id: 'item-ng-hotel-night', name: 'One night, boutique hotel', description: 'Room and breakfast for two, midweek.', category: 'Travel & Hospitality', isActive: true, price: ngn(140_000) },
  { id: 'item-ng-dining-voucher', name: 'Restaurant voucher', description: 'Redeemable across a group of Lagos restaurants.', category: 'Digital Vouchers', isActive: true, price: ngn(50_000) },
  { id: 'item-ng-engraved-pen', name: 'Engraved fountain pen', description: 'Engraved with the recipient’s name; adds three days.', category: 'Custom & Personalized', isActive: true, price: ngn(58_000) },
  // Withdrawn, and kept: a Decision confirmed last quarter still has to render.
  { id: 'item-ng-whisky-set', name: 'Whisky tasting set', description: 'Withdrawn — no longer stocked.', category: 'Food & Drink', isActive: false, price: ngn(40_000) },

  // ── Kenya ──
  { id: 'item-ke-coffee-set', name: 'Single-origin coffee set', description: 'Three Kenyan AA lots with a pour-over kit.', category: 'Food & Drink', isActive: true, price: kes(4_500) },
  { id: 'item-ke-spa-day', name: 'Spa half-day', description: 'Massage and treatment at a partner spa in Nairobi.', category: 'Wellness & Spa', isActive: true, price: kes(9_000) },
  { id: 'item-ke-soapstone-set', name: 'Kisii soapstone serving set', description: 'Hand-carved bowl and board.', category: 'Home & Living', isActive: true, price: kes(6_200) },
  { id: 'item-ke-power-bank', name: 'Fast-charge power bank', description: '20,000mAh, three ports, cabin-safe.', category: 'Technology & Gadgets', isActive: true, price: kes(7_800) },
  { id: 'item-ke-safari-day', name: 'Day trip, Nairobi National Park', description: 'Guided, with transfers and lunch.', category: 'Travel & Hospitality', isActive: true, price: kes(24_000) },

  // ── Ghana ──
  { id: 'item-gh-chocolate-box', name: 'Artisan chocolate box', description: 'Twenty-four pieces made with Ghanaian cocoa.', category: 'Food & Drink', isActive: true, price: ghs(420) },
  { id: 'item-gh-kente-throw', name: 'Kente accent throw', description: 'Handwoven in Bonwire, cotton and rayon.', category: 'Home & Living', isActive: true, price: ghs(1_150) },
  { id: 'item-gh-book-bundle', name: 'Contemporary African fiction', description: 'Three hardbacks chosen for the year.', category: 'Books & Learning', isActive: true, price: ghs(560) },
];

export function findCatalogItem(
  itemId: string,
  items: readonly CatalogItem[] = CATALOG_ITEMS,
): CatalogItem | undefined {
  return items.find(item => item.id === itemId);
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

/** Why one item is not a candidate. Named, so the operator can be told. */
export type IneligibilityReason =
  | 'inactive'
  | 'currency-mismatch'
  | 'over-budget'
  | 'category-excluded';

/**
 * The constraints an item is judged against.
 *
 * Both come from the Moment's **immutable policy snapshot**, never from a live
 * policy read. A policy edited after the Moment was generated did not govern
 * that Moment, and filtering against it would silently rewrite history.
 */
export interface ItemConstraints {
  approvedBudget: Money;
  excludedCategories: readonly string[];
}

export type ItemEligibility =
  | { eligible: true }
  | { eligible: false; reason: IneligibilityReason };

/**
 * Is this item a candidate? Pure, total, and deterministic.
 *
 * The rules, in the order they are checked:
 *
 * 1. **Active.** A withdrawn item is never a candidate.
 * 2. **Exact currency match.** ADR-007: currencies are never summed and there
 *    is **no implicit FX**. A KES item is not "about right" for a naira budget;
 *    it is not comparable at all, and converting it here would invent a rate
 *    nobody approved.
 * 3. **At or under budget**, in minor units. `<=`, so an item priced exactly at
 *    the budget qualifies and one **a single minor unit above does not**. That
 *    boundary is deliberate — the budget is what was approved, not a hint.
 * 4. **Category not excluded** by the governing snapshot. Compared against the
 *    same `GiftCategory` strings the policy stores, which is why this module
 *    reuses that vocabulary rather than inventing one.
 */
export function itemEligibility(item: CatalogItem, constraints: ItemConstraints): ItemEligibility {
  if (!item.isActive) return { eligible: false, reason: 'inactive' };
  if (item.price.currency !== constraints.approvedBudget.currency) {
    return { eligible: false, reason: 'currency-mismatch' };
  }
  if (item.price.amountMinor > constraints.approvedBudget.amountMinor) {
    return { eligible: false, reason: 'over-budget' };
  }
  if (constraints.excludedCategories.includes(item.category)) {
    return { eligible: false, reason: 'category-excluded' };
  }
  return { eligible: true };
}

/**
 * Every candidate, in a **stable, deterministic order**.
 *
 * Sorted by price, then name, then id — a total order, so the same constraints
 * always produce the same list regardless of how the seed happens to be
 * arranged. That matters beyond tidiness: the Decision records the complete
 * candidate set, and a set whose order drifts between reads is weaker evidence
 * than one that does not.
 *
 * Ascending price puts the least expensive option first. It is an ordering, not
 * a recommendation — H3.3 makes none.
 */
export function eligibleItems(
  constraints: ItemConstraints,
  items: readonly CatalogItem[] = CATALOG_ITEMS,
): CatalogItem[] {
  return items
    .filter(item => itemEligibility(item, constraints).eligible)
    .sort(
      (a, b) =>
        a.price.amountMinor - b.price.amountMinor ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

/**
 * What a Decision records about the item it chose.
 *
 * **Copied, never referenced** — the same rule as `deliveryAddressSnapshot` and
 * `policyResolutionSnapshot` (Atlas §15e). The catalog is a code constant today
 * and a table tomorrow; either way a price change or a withdrawal must not
 * rewrite what an operator chose last quarter.
 */
export interface CatalogItemSnapshot {
  itemId: string;
  name: string;
  category: GiftCategory;
  price: Money;
}

export function snapshotItem(item: CatalogItem): CatalogItemSnapshot {
  return {
    itemId: item.id,
    name: item.name,
    category: item.category,
    // Copied, not aliased. Sharing the `Money` object would leave a written
    // Decision holding a live reference to a catalog entry — repricing the item
    // would then rewrite what an operator chose last quarter, which is the
    // exact failure this snapshot exists to prevent.
    price: { ...item.price },
  };
}
