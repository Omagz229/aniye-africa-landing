# ADR-013 — Commercial role, pilot currency and the RecognitionOrder financial model

**Status: Accepted**
**Date drafted:** 2026-07-30
**Date accepted:** 2026-07-30 — Council
**Implementation status: ⬜ Not implemented — H3.7 has not begun**
**Full analysis:** H3.6 → H3.7 Commercial Governance Council, 2026-07-30 · builds on
[ADR-007](ADR-007-money-and-financial-spine.md) and
[H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md) open questions 3 and 4

> Accepted by Council on 2026-07-30. This record resolves **CP-U3 / OPS-U3** and **CP-U4**, the two
> questions that blocked H3.7. **Accepting it does not implement H3.7.**

## Context

Two questions have been open since the H2 → H3 Architecture Checkpoint, and both had to be answered
before a financial object could carry meaning:

- **CP-U3 / OPS-U3** — *is Aniyé the merchant of record, or an agent?* It changes what
  `actualCustomerCharge` legally means. ADR-007 reserved `commercialRole` for the answer precisely so
  that answering it later would need no migration of meaning.
- **CP-U4** — *what is the first pilot currency?* If the pilot is single-currency, FX snapshots defer
  entirely.

A third question emerged with them: **what is the first operational pilot?** Older material describes
a Nigeria-sender → Cameroon-recipient corridor as the market-entry wedge; the later direction is to
begin operationally in Lagos, corporate-first and city-first. These were found to describe **different
stages**, not competing answers.

**Why this could not be deferred again.** ADR-007's Council condition already states that *"until
Aniyé's commercial role is legally resolved, margin is an operational figure, not accounting
revenue."* Building `actualCustomerCharge` under `Unspecified` would persist a number whose meaning
was undecided — the same defect this repository has refused at every previous step: unrecorded
`excludedCategories` (H3.3), absent delivery promises (pre-H3.6), and unproven Decision evidence
(H3.3-D1). Ambiguous money semantics are not an acceptable starting point.

## Council conditions on acceptance

Binding for H3.7:

- **`commercialRole = MerchantOfRecord`** for platform architecture and the first pilot. This is a
  **platform and pilot posture, not a legal opinion.**
- **Every financial amount on a pilot `RecognitionOrder` is NGN.** A non-NGN supplier quote makes the
  order multi-currency and therefore **outside** the approved H3.7 architecture.
- **FX stays out of H3.7 entirely** — no rate source, no snapshot, no conversion, no settlement
  currency, no cross-border arithmetic.
- **`estimatedCustomerCharge` is a manual per-order quotation.** No formula, no rate card, no pricing
  engine.
- **`grossMargin` is derived on read and never stored** (ADR-007, unchanged).
- **Payments, invoicing, settlement and reconciliation remain absent.**
- **Professional confirmation is required before any external pilot.**

## Decision

### 1. Commercial posture

**Aniyé is the merchant of record and contractual principal for the managed recognition service.**

Aniyé contracts with the corporate customer for the **complete managed-recognition outcome**, and
procures vendor and courier fulfilment as **its own operational cost**. `commercialRole` therefore
takes the value **`MerchantOfRecord`** from the set ADR-007 reserved
(`Unspecified | MerchantOfRecord | Agent`).

This is consistent with what the repository already asserts. Atlas §9, *The Vendor Boundary*:

> "The customer buys from **Aniyé**. The vendor is a fulfillment partner."
> "The Item is the product. The Vendor is the mechanism."

And Atlas §15: the customer sees *"what happened and what it cost them"*; Operations sees *"how it
happened and what it cost **us**."* — "cost us" is principal language, and it has been in the Atlas
since before this question was asked.

> ⚠️ **This is the accepted platform and pilot posture. It is not a definitive legal, tax or
> accounting opinion**, and it must not be presented as one.

**Before any external pilot**, qualified Nigerian legal, tax and accounting advisers must confirm the
intended customer, vendor and courier contracts; VAT treatment; invoicing; refunds and chargebacks;
and the principal-versus-agent accounting treatment.

**If professional advice later requires an Agent model:**

- **Do not silently relabel existing orders.**
- **Do not reinterpret historical `MerchantOfRecord` snapshots** — a snapshot records what was
  believed and asserted at the time, which is exactly why it is a snapshot.
- **Require a new governance decision**, and any migration it needs.

**Being a payment provider's "merchant" does not establish this role**, and was not relied upon.
Four statuses must be kept distinct: **payment-account holder** · **merchant of record** ·
**contractual seller or principal** · **accounting principal versus agent**. A payment processor
settles money; it does not decide who sold what to whom.

### 2. First operational pilot

The first operational pilot is:

| | |
|---|---|
| Commercial posture | Corporate-first |
| Scale | **One** corporate organization |
| Customer / sender | Nigeria |
| Recipients and fulfilment | **Lagos** |
| Geography | **City-first**, not nationwide |
| Shape | A **domestic closed-loop** operational pilot |

**Nigeria → Cameroon remains the intended first cross-border corridor**, sequenced after the Lagos
operational loop has been validated.

> **The historical cross-border plan is not abandoned and is not superseded.** This decision changes
> **sequence**, not the wider cross-border strategy. Cross-border gifting remains the market-entry
> wedge for the broader mission — Africa's relationship infrastructure. Lagos validates the closed
> operational loop; Nigeria → Cameroon opens cross-border commerce.

**The corridor requires its own architecture decision before it may be built.** This is not a
formality: the implemented H3.3–H3.5 chain **already refuses currency mismatch by design**.
`itemEligibility()` refuses an item whose price currency differs from the approved budget, and
`buildCourierSelection()` refuses a courier quote whose currency differs from the vendor quote —
*"Quotes are never converted."* A cross-border corridor would require reopening three completed
milestones, not adding a field to a fourth.

### 3. Pilot currency

**Every financial amount on a pilot `RecognitionOrder` must be NGN**, including:

- `approvedBudget`
- `estimatedVendorCost`
- `estimatedCourierCost`
- `estimatedCustomerCharge`
- `actualVendorCost`
- `actualCourierCost`
- `actualCustomerCharge`

**A supplier quote or cost in any non-NGN currency makes that order multi-currency, and therefore
outside the approved H3.7 pilot architecture.**

Such an amount must **not** be converted, **not** defaulted to NGN, and **not** compared implicitly.
It is refused, and the order does not proceed under this architecture.

### 4. FX treatment

**FX snapshots remain deferred from H3.7.** H3.7 must contain:

- no exchange-rate source;
- no FX snapshot;
- no conversion;
- no settlement currency;
- no cross-border arithmetic.

**Multi-currency `RecognitionOrder`s require a later architecture decision before they may be
implemented.** ADR-007's FX snapshot shape (`{ from, to, rate, source, capturedAt }`) stands as
accepted architecture for when that day comes; it is simply not built here.

### 5. Manual per-order pilot pricing

**`estimatedCustomerCharge` is a manually determined per-order quotation.** It must be:

- **entered deliberately** by an operator;
- **reviewed and explicitly confirmed** before it is recorded;
- **stored as immutable order authority** once the `RecognitionOrder` is created.

**It must not be calculated automatically from** any of: the approved budget · the catalog price ·
the vendor cost · the courier cost · a margin target · a percentage · *"25% + courier"* · vendor
commission · a sender service fee · payment margin · subscription · featured placement.

**No rate card and no pricing engine is accepted for H3.7.**

**No payment assumption is accepted either.** Do not introduce "cash-only", payment-method,
payment-received or settlement assumptions. **Payments and collections remain outside H3.7.**

> **Why manual, and why this is not a gap.** Aniyé has no pricing evidence yet — a formula chosen now
> would encode a commercial rule nobody has decided, and it would look identical in the data to one
> that had been. A quotation an operator entered and confirmed is an honest record of a judgement. A
> quotation a formula produced is an assertion about a pricing model that does not exist. The same
> reasoning kept `excludedCategories` optional and kept the delivery promises absent rather than
> defaulted.

### 6. Earlier revenue proposals — preserved, deferred, non-authoritative

The following were proposed in earlier founders' material. They are **recorded here as historical
proposals** and are **deferred and non-authoritative for H3.7**:

| Proposal | Status for H3.7 |
|---|---|
| Vendor commission | ⏸️ Deferred — not a pilot revenue mechanism |
| Sender service fee | ⏸️ Deferred — ADR-007 already defers "service fee" by name |
| Corporate subscription | ⏸️ Deferred — **account-level, not per-Moment** |
| Payment margin | ⏸️ Deferred — belongs to payments, which are out of scope |
| Featured placement | ⏸️ Deferred |
| Percentage-based pricing | ❌ **Rejected for H3.7** — see §5 |
| *"25% + courier fee"* | ❌ **Rejected for H3.7** — see §5 |

**Corporate subscription remains a possible future account-level commercial model.** It is **not a
`RecognitionOrder` field** and is not part of the pilot — a one-per-Moment object cannot carry a
recurring account-level fee, and attempting it would misstate both.

> **The original founders' material is not deleted or rewritten.** It stands as the record of what
> was proposed. **This later Council decision controls the pilot architecture.**

### 7. `RecognitionOrder` financial semantics

This clarifies [ADR-007](ADR-007-money-and-financial-spine.md) rather than replacing it.

- **One `RecognitionOrder` per Moment** remains accepted (ADR-007).
- It belongs **only to `OperationsState`** (ADR-005, ADR-010). It is never projected into Workspace.
- **`commercialRole` is snapshotted on the `RecognitionOrder` and is immutable.** Its accepted pilot
  value is `MerchantOfRecord`.

| Field | Meaning |
|---|---|
| `commercialRole` | The posture asserted **at order creation**. Immutable. `MerchantOfRecord` for the pilot |
| `approvedBudget` | The **frozen recipient-recognition budget** from the confirmed Execution Brief. **Not the customer charge**, and **not automatically a ceiling** on vendor or courier costs |
| `estimatedVendorCost` | From the **immutable selected vendor quote** — the live `VendorSelection` Decision |
| `estimatedCourierCost` | From the **immutable selected courier quote** — the live `CourierSelection` Decision |
| `estimatedCustomerCharge` | The **confirmed manual per-order quotation** (§5) |
| `actualVendorCost` | The final **operator-confirmed** amount incurred with the vendor. **It does not prove payment** |
| `actualCourierCost` | The final **operator-confirmed** amount incurred with the courier. **It does not prove payment** |
| `actualCustomerCharge` | The final **operator-confirmed** amount Aniyé charges the corporate customer. **It does not mean cash received** |

**Payment, invoicing, settlement and reconciliation remain absent.** No field on this object asserts
that money moved.

#### `estimatedItemCost` is superseded for H3.7

**ADR-007's `estimatedItemCost` is superseded for H3.7 by `estimatedVendorCost`.**

**The catalog item price is not Aniyé's vendor cost.** The catalog price answers *"what is this gift
worth to the recipient, against the approved budget?"* — it is the figure item selection filters on.
What the vendor will charge Aniyé is a different number, obtained by asking a vendor, and it is
already recorded: `quotedVendorCost` on the confirmed `VendorSelection` Decision, which the
implementation is explicit is *"an estimate of what the vendor will charge Aniyé … never derived from
`CatalogItem.price`."*

**The implemented `VendorSelection` quote is the authoritative estimate.** Carrying a second,
catalog-derived cost estimate alongside it would create two answers to one question.

### 8. Derived gross margin

The pilot operational calculation is:

```
grossMargin = actualCustomerCharge − actualVendorCost − actualCourierCost
```

**Conditions, all required:**

- all three amounts must **exist**;
- all three must be **NGN**;
- the result is **derived on read**;
- it is **never persisted**;
- correcting an underlying actual cost **automatically changes the derived result**;
- **no second "update margin" write may exist.**

> **Why there is no second write.** Because margin is derived, a corrected cost needs no margin
> update — there is nothing stored to update. One atomic write records the corrected amount, and the
> figure recomputes at read. This is exactly why ADR-007 forbids storing it.

**Until professional review is complete, this is an internal operational measure.** It is **not**:

- accounting revenue;
- accounting gross profit;
- taxable profit;
- cash received.

**And it is not the company's complete profitability.** Taxes, duties, service fees, refunds, payment
costs and other commercial items remain deferred, so the figure is deliberately partial.
Documentation and interface copy must not describe it otherwise.

## What was rejected

Recorded so the reasoning survives, and so neither is quietly revived.

**`commercialRole = Agent`** — rejected for H3.7. It contradicts Atlas §9's *"The customer buys from
Aniyé"*; it makes `actualCustomerCharge` an inaccurate field name, requiring `grossAmountCollected`,
`commission`/`platformFee` and `amountRemittedToVendor` — fields ADR-007 defers; and it sits in
tension with **ADR-005**, which forbids projecting vendor identity into Workspace, while an agency
relationship normally presumes a disclosed or identifiable principal. Adopting Agent would require
amending an accepted ADR, not merely selecting a different enum value.

**`commercialRole = Unspecified`** — rejected. It would leave H3.7 blocked, or force ambiguous money
semantics into persistence.

**Percentage pricing, and *"25% + courier fee"*** — rejected for H3.7. See §5.

**Cash-only or payment-received assumptions** — rejected. Nothing in H3.7 asserts that money moved.

> Analysis produced during the Council process that argued for an Agent posture, percentage pricing
> or cash-only framing is **superseded analysis, not accepted architecture**. It is preserved as
> rejected reasoning and must not be blended with the decisions above.

## H3.7 consequences

**What becomes possible.** H3.7 may now define a `RecognitionOrder` with a defined meaning for every
amount it carries, because the currency is fixed, the posture is asserted, and the pricing method is
decided.

**What H3.7 must contain.** One `RecognitionOrder` per Moment in `OperationsState`; an immutable
`commercialRole` snapshot; the frozen `approvedBudget`; two estimates read from the immutable
selection Decisions; one manually confirmed `estimatedCustomerCharge`; three operator-confirmed
actuals; and a derived margin.

**What must be immutable after order creation.** `id`, `workspaceId`, `momentId`,
`executionBriefId`, `commercialRole`, `approvedBudget`, all estimates including the confirmed
quotation, and `createdAt`. **Estimates are evidence of what was expected** and must never be edited
to match what happened.

**What may be corrected.** `actualVendorCost`, `actualCourierCost` and `actualCustomerCharge` — by
**supersession with a Decision carrying a reason** (ADR-006), never by mutation, following the same
pattern the Execution Brief revision path already uses.

**Persistence.** A `recognitionOrders` collection is additive to `OperationsState`. The exact schema
rung is fixed by the milestone that implements it, **not by this record**. `OperationsState` is **v7**
and Workspace is **v7** at acceptance.

**H3.8 consequence.** Commercial detail must remain absent from customer-facing Memory: vendor cost,
courier cost, margin, vendor and courier identity, QA exceptions and internal notes (ADR-005), plus
every estimate and the `commercialRole` snapshot. The customer may see **their own charge** and what
happened.

## Explicitly excluded from H3.7

Payments · collections · invoicing · settlement · reconciliation · refunds · chargebacks · taxes and
duties · service fees · FX of any kind · multi-currency orders · rate cards · pricing engines ·
percentage pricing · vendor commission · sender service fee · corporate subscription · payment margin
· featured placement · cash-received or payment-method assumptions · accounting integration ·
customer-facing commercial disclosure beyond their own charge.

## Required before any external pilot

Nothing below is a product decision, and none of it is settled by this record.

1. **Nigerian legal counsel** — do the customer, vendor and courier contracts make Aniyé principal?
   Who bears fulfilment failure?
2. **Nigerian tax adviser** — VAT treatment on gross service value; registration position; obligations
   under the current Nigerian tax administration regime.
3. **Accountant or auditor** — a documented principal-versus-agent control analysis against the
   signed contracts, supporting gross presentation.
4. **Payments counsel** — the executed payment-provider agreement, settlement flows, chargeback
   allocation, and any licensing consequence of holding customer funds.
5. **Before any corridor work** — Central African (CEMAC/BEAC) foreign-exchange declaration and
   authorised-intermediary obligations for Cameroon fulfilment.
6. **ADR-010's pilot gate, unchanged** — production backend, authentication, multi-tenancy and secure
   file storage before any external party is given access.

## Relationship to earlier decisions

**Clarifies [ADR-007](ADR-007-money-and-financial-spine.md)** — selects `MerchantOfRecord` from the
reserved set, supersedes `estimatedItemCost` for H3.7 in favour of `estimatedVendorCost`, and leaves
integer minor units, the pinned exponent table, the prohibition on implicit FX, one order per Moment
and derived-never-stored margin **entirely intact**.

**Sits inside [ADR-005](ADR-005-workspace-operations-boundary.md)** — the `RecognitionOrder` lives in
Operations; cost, margin and partner identity never reach Workspace.

**Applies [ADR-006](ADR-006-decision-vs-operational-event.md)** — corrections supersede rather than
mutate, and each confirmation is one atomic transaction.

**Honours [ADR-010](ADR-010-operational-persistence-boundary.md)** — the external-pilot gate is
unchanged and is reinforced above.

**Does not touch [ADR-012](ADR-012-fulfilment-lifecycle-and-proof-recording.md)** — the fulfilment
lifecycle is implemented and unaffected. `actualVendorCost` and `actualCourierCost` are not delivery
facts and record no proof.

## Supersedes

- ADR-007's `estimatedItemCost` field proposal, **for H3.7 only**, replaced by `estimatedVendorCost`
  read from the confirmed `VendorSelection` Decision.

Nothing else is superseded. The earlier founders' revenue proposals are **deferred, not superseded**
— they remain available to a future account-level commercial decision.

## Acceptance does not implement H3.7

**This record is governance, not implementation.** At acceptance:

- no `RecognitionOrder` exists;
- no `commercialRole` field exists in code;
- no actual vendor cost, courier cost or customer charge exists;
- no margin calculation exists;
- `OperationsState` remains **v7** and Workspace remains **v7**;
- the roadmap remains **24 of 37**, with H3 at **6 of 8**.

**H3.7 is governance-ready and has not begun.**
