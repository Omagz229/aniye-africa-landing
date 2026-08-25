# ADR-017 — Customer-facing Moment visibility and OPS-U4b exception handling

**Status: Accepted · Not implemented**
**Date drafted:** 2026-08-19
**Date accepted:** 2026-08-19 — Council, accepted as written
**Targets:** H4.0 (Pre-pilot completion)

> **Accepted · Not implemented.** Acceptance authorizes the architecture below for later
> implementation; it does not deliver any of it. No customer-facing route, no read surface, and no
> OPS-U4b resolution exists in code yet. Its implementation genuinely depends on
> [ADR-015](ADR-015-production-persistence-authentication-and-tenant-isolation.md) — a customer
> seeing anything at all presupposes an authenticated `CustomerAdministrator` and enforced tenant
> isolation, both accepted but not yet implemented — and reuses [ADR-016](ADR-016-recurring-and-triggered-program-generation.md)'s
> `ProgramGenerationRunEvent` model only where noted below, without depending on ADR-016's own
> implementation for anything else. With this acceptance, **all three H4.0 governance ADRs
> (ADR-015, ADR-016, ADR-017) are now Accepted · Not implemented** — H4.0's architecture is settled;
> none of it is built.

## Context

`docs/MASTER_ROADMAP.md` names H4.0's [P] set as including **"customer-facing Moment visibility"**
and, separately, **"delivery-failure and redelivery handling."** `RELATIONSHIP_OPERATIONS_ATLAS.md`
§6 already carries an accepted, un-implemented specification for the first — **"What the customer
sees at each step"** — verified below against the actual checkout, not assumed built.

**Verified: no customer-facing Moment visibility of any kind exists today.** `app/workspace/` has
route directories for `assignments`, `classes`, `policies`, `programs`, `profile`, `people` — no
`moments`, no `timeline`. `app/components/workspace/ProgramDetail.tsx`'s only mention of "moment" is
one sentence of static prose ("Individual recognition moments are prepared..."); it renders no actual
Moment data. Everything §6's table describes is **accepted specification, not built code**:

| Step | Accepted: what the customer sees | Verified status |
|---|---|---|
| Program active | Program summary | Not built — no Moment data reaches Workspace |
| Moment generated | Upcoming count | Not built |
| Policy resolved | Budget per moment | Not built |
| Brief prepared | **Nothing** | Correctly nothing — no work needed |
| Item selected | Category only, never vendor | Not built |
| Vendor/courier selected | **Nothing** | Correctly nothing |
| Fulfilment tracked | Status only | Not built |
| Delivery confirmed | Confirmation + curated proof | **⚠️ Still future architecture** — H3.6 (ADR-012) stores proof as metadata only, no file. Neither this ADR nor ADR-015 builds file storage (ADR-010 gate 4 remains open) |
| Cost recorded | Their charge only, never cost or margin | Not built |
| Moment closed | Nine-field safe timeline projection | **Built, but Operations-only** — `lib/operations/timeline.ts`'s `RecipientTimelineEntry`/`listRecipientTimeline()` exist and are exercised at `/operations/timeline/[personId]`; the customer-facing route was explicitly left to H4.0 by ADR-014 |

**The one piece of this table that is both built and already safe to reuse** is the last row.
`RecipientTimelineEntry` is a nine-key, exact-field whitelist (`entryId`, `recipientFirstName`,
`recipientLastName`, `occasion`, `plannedDate`, `outcomeDate`, `outcome`, `giftCategory`, `summary`)
with no cost, vendor, courier, or proof field to begin with — it was built for exactly this exposure
and needs no redesign, only a new, customer-facing consumer.

### The OPS-U4b trigger fires the moment this ADR is accepted, not later

`RELATIONSHIP_OPERATIONS_ATLAS.md` §9 lists **OPS-U4b** (QA and adjudication taxonomy — "what
constitutes a QA exception, who adjudicates, how disputes are resolved, what the customer is told")
as deferred, with five triggers for when the deferral ends. **Trigger 4 is named explicitly: "H4.0
customer-facing Moment visibility."** ADR-014 confirmed its own H3.8 scope did not trip it, because
the built timeline projection "stays inside Operations." **This ADR is the one that trips it** — any
customer-facing Moment visibility, however narrow, satisfies trigger 4. This ADR must therefore
resolve OPS-U4b, not merely build visibility and leave it deferred again.

**Two accepted decisions this ADR builds inside, not around:**

- **ADR-005**: "Vendor cost, courier cost, margin, vendor and courier identity, QA exceptions and
  internal notes must never be projected into Workspace." Every field this ADR exposes is checked
  against this list.
- **ADR-015 §6**: the deny-by-default matrix already names what this ADR must define — a
  `CustomerAdministrator` may see "the customer-facing views ADR-017 later governs, inside its own
  workspace only."

**One fact bounds scope**: `CP-U2` ("Does any near-term customer require policy approval?") is
classified ⚪, not blocking, "`Approval` stays deferred indefinitely" unless it changes. This ADR
builds no approval object or workflow, consistent with every prior ADR that has touched this
question.

## Decision

### 1. What is exposed, mapped one-for-one to the accepted table, nothing more

- **Program summary** (name, occasion types, population count, active/paused state) — derived from
  the `Program` a `CustomerAdministrator` already owns and can read directly; no new data, only a new
  read surface.
- **Upcoming count and budget per moment** — derived from `Moment`s belonging to the
  `CustomerAdministrator`'s own workspace, filtered to non-terminal statuses; the amount shown is the
  resolved `approvedRecognitionBudget`, never vendor cost, courier cost, or margin — none of which
  exist on `Moment` itself, only on records Operations alone reads (`RecognitionOrder`,
  `VendorSelection`, `CourierSelection`).
- **Item category, never the item** — the resolved category only (matching `policyResolutionSnapshot
  .excludedCategories`' own category vocabulary), never a vendor name, an offer amount, or which item
  was chosen.
- **Fulfilment status only** — `Dispatched` / `DeliveryFailed` / `Delivered`, in customer-safe
  language, with **no courier identity, no proof metadata, and no redelivery reasoning** (a
  `Redelivery` Decision's `reason` field is an internal operator note under ADR-012, not customer
  copy). A `DeliveryFailed` Moment reads as "in progress" or equivalent to the customer — the same
  status-only boundary the table already sets, extended to cover the failure/redelivery case
  `docs/MASTER_ROADMAP.md` names separately. This is the whole of what this ADR does for
  "delivery-failure and redelivery handling" — the lifecycle itself (`Dispatched` → `DeliveryFailed`
  → `Redelivery` → `Delivered`) was fully built at H3.6 and is unchanged here.
- **Their charge only** — `estimatedCustomerCharge` where it exists on a `RecognitionOrder`, never
  `estimatedVendorCost`, `estimatedCourierCost`, or `grossMargin`.
- **The existing nine-field safe timeline, reused unchanged** — `listRecipientTimeline()` and
  `RecipientTimelineEntry` (`lib/operations/timeline.ts`) are the closed-Moment view. This ADR adds a
  Workspace-facing route that calls the same function; it does not add a field, and does not change
  `hasExactTimelineKeys`'s enforcement.
- **Nothing beyond this list.** No proof file, no vendor/courier identity, no cost, no margin, no
  internal note, no QA exception ever reaches Workspace, at H4.0 or by this ADR at all.

### 2. Access: an extension of ADR-015's deny-by-default matrix, not a new boundary

- **Every view this ADR defines is `CustomerAdministrator`-only, scoped to their own workspace** —
  the same boundary ADR-015 §6 already states. `InternalOperator`s continue reading the existing,
  richer Operations views; this ADR does not change what they see.
- **A `CustomerAdministrator` sees every Person's data in their own workspace** — unlike the existing
  Operations timeline route (`/operations/timeline/[personId]`, one person at a time), a customer
  view is naturally workspace-wide: an organization administrator reviews recognition across their
  whole population, not one recipient at a time. This is a genuine difference in shape from the
  existing route, not a re-derivation of its access rule.
- **No recipient-level login or portal is built.** ADR-014 already states "recipient acknowledgement
  is unsupported and excluded, not architecturally impossible" — this ADR does not revisit that. The
  audience is the organization's own administrator, not the person being recognized.

### 3. OPS-U4b is resolved narrowly: no taxonomy is built, because none is exposed to dispute

**This ADR resolves OPS-U4b by deciding what is *not* built, and stating precisely why the narrow
scope in Decision §1 makes that safe — not by inventing a QA/dispute system with no operational
evidence behind it**, consistent with the Atlas's own standing reasoning ("intelligence built before
evidence exists is invention," applied here to process rather than intelligence.)

- **No `QAException` object, no dispute Decision or Event type, and no in-app exception-reporting
  flow are built.** ADR-012 already excluded `QAException` explicitly at H3.6; this ADR does not
  reintroduce it.
- **"What the customer is told" is exactly the fields in Decision §1** — status words, a category, a
  charge, and, once closed, the nine-field timeline's own `outcome` and `summary`. There is no
  customer-facing detail beyond those fields for a dispute to be *about* — no proof image to contest,
  no vendor name to complain about, no cost breakdown to question.
- **"How disputes are resolved" is unchanged from today: off-platform, human-mediated.** If a
  customer administrator believes a status or outcome is wrong, they contact Aniyé through an
  existing channel outside this product (support email, phone, account manager) — not a new in-app
  flow. Any resulting correction is made by an operator, through Operations, exactly as ADR-005
  already permits: **Operations may propose a correction to Workspace configuration; it does not
  silently rewrite it, and this ADR builds no new write path around that rule.**
- **This is a decision the Council can revisit** once real customer usage produces evidence of what
  disputes actually look like — exactly the standard the checkpoint already applies to intelligence
  work. It is not a permanent architectural ceiling; it is what H4.0 needs, and what the current
  evidence base supports deciding.
- **OPS-U4b's other four triggers are unaffected** by this decision and remain live: a genuine
  customer-visible operational audit trail, a second party submitting or disputing delivery evidence,
  or the external pilot would each independently reopen this question regardless of what this ADR
  decides now.

### 4. What crosses the boundary is read-only and derived, never a new write path

- **Every view in Decision §1 is a read.** This ADR adds no Workspace write, no customer-initiated
  Decision, and no customer-initiated Event — consistent with ADR-005's "Operations may propose,
  never silently write" and, symmetrically, with Workspace never gaining a write into Operations'
  own records either.
- **Nothing is recomputed or cached into a new customer-facing document.** Program summary, upcoming
  count, budget, category, status, charge, and the timeline entries are all **derived on read** from
  existing Operations records, the same "derived, never stored" principle ADR-007 already applies to
  margin — there is no new persisted customer-facing projection beyond the timeline entries
  `lib/operations/timeline.ts` already builds.
- **If ADR-016 is implemented before this ADR is, a `ProgramGenerationRunEvent`'s summary counts may
  inform the "upcoming count" figure** — but its `blockedCandidates` detail (personId and reason for
  each `Blocked` candidate) is never exposed to a `CustomerAdministrator`; that remains
  Operations-only diagnostic detail, and doing otherwise would leak per-person generation-failure
  detail with no basis in the accepted "what the customer sees" table.

## What this ADR does not decide

| Not decided or built here | Where it actually gets decided |
|---|---|
| Proof-file delivery to the customer | ADR-010 gate 4 (secure file storage), still fully open; neither ADR-015 nor this ADR governs it |
| Any QA exception taxonomy, dispute object, or adjudication workflow | Explicitly declined at H4.0 (Decision §3); reopened only if a later trigger fires |
| Policy approval flows or objects | **CP-U2** — currently ⚪, not blocking |
| Recipient-level login, portal, or acknowledgement | Excluded per ADR-014; not revisited here |
| A customer-visible operational audit trail beyond the nine-field timeline | Not built — would independently retrigger OPS-U4b if it were |
| Any change to `RecipientTimelineEntry`'s nine fields or `hasExactTimelineKeys`'s enforcement | ADR-014 — unchanged |
| Any change to the Fulfilment lifecycle, `Redelivery` Decision, or courier/proof data | ADR-012 — unchanged; this ADR only narrows what of it reaches the customer |
| Multi-organization or cross-workspace customer administrator workflows | Not applicable — a `CustomerAdministrator` only ever sees their own workspace (ADR-015) |
| Authentication, tenant isolation, or the backend this ADR's routes run on | **ADR-015** — this ADR's implementation depends on it; its own review did not |

## Consequences

- `app/workspace/` gains new routes (a Moments/recognition overview, and a per-recipient or
  workspace-wide timeline view) — genuinely new; nothing in Workspace today reads Operations data at
  all.
- `lib/operations/timeline.ts`'s `listRecipientTimeline()` gains a second, workspace-scoped consumer
  (today's is single-`personId`, Operations-only); no change to its own signature or the nine-field
  shape.
- A new, narrow read-only query surface is required — Program summary, upcoming count, budget,
  category, fulfilment status, and charge — each an explicit derivation from existing Operations
  records, never a new stored field. This is new code, not a reuse of any existing Operations
  component, since every existing Operations view (`MomentDetail.tsx`, `MomentsList.tsx`,
  `FulfilmentPanel.tsx`) renders the full internal detail this ADR must not expose.
- No `QAException`, dispute, or exception object is added to `lib/operations/types.ts` — a deliberate
  absence, not an oversight (Decision §3).
- A new validation suite must prove, at minimum: every field reaching a `CustomerAdministrator`-scoped
  read is on the Decision §1 whitelist and nothing else is; a `DeliveryFailed`/`Redelivery` Moment
  never exposes courier identity or a Decision's internal `reason`; the nine-field timeline route
  produces the identical entries the Operations route already does, for the same underlying data; a
  `CustomerAdministrator` session can read across every Person in their own workspace and is refused
  another workspace's data (reusing ADR-015's own isolation proof); an `InternalOperator` session is
  refused these new customer-facing routes, matching ADR-015 §6's matrix.
- `RELATIONSHIP_OPERATIONS_ATLAS.md` §9's **OPS-U4b** row should be marked resolved on acceptance —
  narrowly, as Decision §3 states, not as a fully-built taxonomy.

## Relationship to earlier decisions

- **Builds exactly the table `RELATIONSHIP_OPERATIONS_ATLAS.md` §6 already accepted**, verified
  row-by-row against the actual checkout rather than assumed built.
- **Trips, and resolves, OPS-U4b's trigger 4** — the first ADR to do so; ADR-014 explicitly avoided
  it by staying Operations-only.
- **Extends ADR-015's access matrix**, not a new boundary: `CustomerAdministrator`-only,
  workspace-scoped, read-only.
- **Reuses ADR-014's nine-field timeline projection unchanged**, and ADR-012's Fulfilment lifecycle
  unchanged, narrowing only what of each reaches Workspace.
- **Extends ADR-005's "propose, never write" rule** to disputes specifically: a customer's disagreement
  with a status or outcome becomes an operator-mediated correction proposal, not a new write path
  Workspace gains directly.
- **Does not depend on ADR-016's acceptance** for anything beyond the narrow, optional connection
  noted in Decision §4 — its own review and this ADR's are independent, exactly as ADR-016 stated
  about itself relative to ADR-015.
- **Does not build what ADR-010's fourth gate (secure file storage) would require** — proof-file
  delivery to the customer remains out of scope, exactly as ADR-015 left it.
