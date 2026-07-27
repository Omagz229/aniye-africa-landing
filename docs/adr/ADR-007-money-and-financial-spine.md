# ADR-007 — Money is integer minor units with a validated ISO 4217 code

**Status: Accepted**
**Date drafted:** 2026-07-27
**Date accepted:** 2026-07-27 — Council
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-d--money-and-the-financial-spine)

> Accepted by Council on 2026-07-27, subject to the conditions recorded below.

## Council conditions on acceptance

- Money is `{ amountMinor: integer, currency: ISO 4217 }` with a **pinned currency exponent table**.
- **`RecognitionOrder` is one per Moment.**
- **Gross margin is derived**, never stored.
- Until Aniyé's commercial role is legally resolved, **margin is an operational figure, not accounting revenue**, and must not be presented as the latter.
- A future `commercialRole` field will carry: `Unspecified` | `MerchantOfRecord` | `Agent`. It is **not implemented in R4**; the value is reserved so the eventual legal answer needs no migration of meaning.

## Decision

```ts
interface Money {
  amountMinor: number;   // integer, in the currency's smallest unit
  currency: CurrencyCode; // ISO 4217 alpha-3, uppercase, validated
}
```

- Exponents come from a **pinned table** supporting zero-decimal (JPY, KRW, RWF), two-decimal (NGN, KES, USD) and three-decimal (BHD, KWD, TND) currencies. Not stored per record.
- Rounding **half away from zero**, only at conversion and division, never in intermediate steps. Residuals are recorded, never dropped.
- Formatting happens at the display edge via `Intl.NumberFormat`. Formatted strings are never stored.
- Exchange rates are **dated snapshots** on the financial record — `{ from, to, rate, source, capturedAt }` — never re-derived retrospectively.
- Cross-currency comparison requires an explicit FX snapshot and is never implicit.

## The minimum financial object

**`RecognitionOrder`**, one per Moment. Named for the platform's own domain language; partially customer-showable, unlike "Fulfilment Order"; a record with a lifecycle, unlike "Commercial Brief".

**Required for the prototype:** `id`, `workspaceId`, `momentId`, `executionBriefId`, `approvedBudget`, `estimatedItemCost`, `estimatedCourierCost`, `estimatedCustomerCharge`, `actualVendorCost`, `actualCourierCost`, `actualCustomerCharge`, `status`, timestamps.

**Deferred:** packaging, taxes and duties, service fee, contingency, other costs, amount paid, refunds, FX snapshots, reconciliation timestamp.

`grossMargin` is **derived, never stored** — same reasoning as `memberCount` (conflict C3).

## Why not the alternatives

Floating-point major units (the current representation) accumulate error and have no safe equality. Decimal strings are arguably the most correct but require a decimal library for every operation, which the milestone constraints forbid. Integer minor units are exact to roughly ₦90 trillion within `Number.MAX_SAFE_INTEGER`.

## Consequences

- **Schema v4 → v5, destructive.** `amountMinor = round(amount × 10^exponent)`. The pre-migration payload is backed up. Free-form currency strings that match no pinned code fail validation and are quarantined rather than mangled.
- Resolves conflict **C6**, open since the recovery audit.
- **Hard prerequisite for Programs** — a budget envelope is arithmetic.
- No payment gateway, invoicing or accounting integration is in scope.
