# Aniyé Africa — Relationship Operations Atlas

> **Reconstructed 2026-07-28 (R6).** The original was lost with the previous development machine and
> was never recovered. Recovery milestone 4, outstanding since the audit.
>
> ⚠️ **This document was rebuilt from repository-confirmed sources only** — implemented code,
> accepted ADRs, and the H2 → H3 Architecture Checkpoint. **Nothing here was written from memory.**
> Rules the original may have carried but that cannot be recovered from evidence are recorded in
> **§9 Unresolved**, not invented. If you need a rule and it is in §9, it does not exist yet — raise
> an ADR rather than assuming.

**Scope.** The [System Atlas](ANIYE_SYSTEM_ATLAS.md) governs what the platform *is*, from the
customer's side. This document governs **how Aniyé executes**: the operator's surface, the
operational record, and the boundary between the two. Where the two overlap, the System Atlas is
authoritative and this document defers to it.

**Companions:** [`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) ·
[`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) · [`adr/`](adr/) ·
[`H2_H3_ARCHITECTURE_CHECKPOINT.md`](H2_H3_ARCHITECTURE_CHECKPOINT.md)

---

## 1. What Operations is

**Workspace is what the customer configured. Operations is the record of what Aniyé did.**

That sentence is the whole boundary, and it is load-bearing enough that ADR-005 and ADR-010 both
exist to defend it — the first as a product and routing boundary, the second as a persistence one.

| | Workspace | Operations |
|---|-----------|------------|
| Audience | Organization administrators | Aniyé internal operators |
| Scope | One organization | Across all organizations |
| Route tree | `/workspace/*` | `/operations/*` |
| Shell | `WorkspaceShell` | `OperationsShell` — shares nothing |
| Persistence | `WorkspaceState`, key `aniye_workspace`, **v7** | `OperationsState`, key `aniye_operations_v1`, **v6** |
| Nature of records | Configuration, edited freely | Operational history, accumulating |
| Growth | Bounded by organization size | Unbounded |
| Vocabulary | "recognition program", "upcoming recognition" | "campaign", "job", "brief" |

**Owns:** Moments, Execution Briefs, item selection, vendor offers, courier selection, QA,
fulfilment, exceptions, commercial detail, Decisions and Operational Events.

**Does not own — and must never write:** Organization Profile, relationship groups, recognition
rules, assignments, people, programs. Operations **reads** configuration and **proposes**
corrections. *(Atlas §15b, ADR-005.)*

### The disclosure boundary

**Never projected into Workspace, under any circumstance:**

- vendor cost · courier cost · margin
- vendor identity · courier identity
- QA exceptions · internal operator notes

The customer sees **what happened and what it cost them**. Operations sees **how it happened and
what it cost us**. *(ADR-005; Atlas §15b.)*

This is not a UI preference. It is one conditional away from disclosure at all times, which is
precisely why ADR-005 rejected placing Operations navigation inside `WorkspaceSidebar` — the
pattern the lost implementation used.

---

## 2. The operating model

### The canonical chain

```
Relationship Class ─→ Policy Assignment ─→ Recognition Policy
                                              │
Person ──────────────────────────────────────┤
                                              ▼
                      Program ──────────→ Moment ──→ Execution Brief ──→ Recognition Order
                                              │              │
                                              └─→ Decision   └─→ Item · Vendor Offer · Courier
                                              └─→ OperationalEvent          │
                                                                            ▼
                                                                     Fulfillment ──→ Memory
```

**Left of the Moment is Workspace. From the Moment rightward is Operations.** The Moment is the
handover: generated from customer configuration, owned by Aniyé thereafter.

### Where policy resolves

**A Program never pins a policy** (ADR-004). A Program targets **exactly one Relationship Group**,
carries no `policyAssignmentId`, no `recognitionPolicyId`, and no universal policy snapshot.

Policy resolves **per Moment, by the recipient's country**, through `resolvePolicyAssignment()`
(`lib/assignments.ts`) — and the resolved assignment *and* policy are snapshotted onto that Moment.

The reason is multinational correctness: country-scoped assignments exist so one group can be
governed by different rules in different countries. A Program-level snapshot would silently apply
one country's rule to everyone, and deactivating that assignment would break a running Program.

### Money

Integer minor units with a pinned exponent table (ADR-007, `lib/money.ts`).

- **Currencies are never summed.** A group spanning Nigeria and Kenya has an allocation in two
  currencies; expressing it as one number would require an exchange rate.
- **There is no implicit FX.** Cross-currency comparison requires an explicit dated snapshot.
- **Aniyé never calculates a cross-currency grand total.** Each currency is budgeted, validated and
  compared independently.
- **Gross margin is derived, never stored** — the same reasoning as `memberCount`.

⚠️ **Margin is an operational figure, not accounting revenue**, and must not be presented as the
latter until Aniyé's commercial role is legally resolved. *(ADR-007 Council condition; see §9 **OPS-U3**.)*

---

## 3. Operational objects

### Implemented — H3.1 through H3.5

Defined in `lib/operations/types.ts`. Access is through `OperationsRepository`
(`lib/operations/store.ts`). Construction is pure, in `lib/operations/generation.ts` (Moments),
`lib/operations/briefs.ts` (briefs) and `lib/operations/selection.ts` (item selection) — none of
these modules can persist anything, which is what makes "preview writes nothing" enforceable rather
than merely stated. The catalog itself is `lib/catalog.ts`, a pure seed outside `lib/operations/`
because the Catalog belongs to Gift Intelligence; only the *selection* is an operational act.

#### Moment

One person, one occasion, one execution. Generated from an **Active Campaign's frozen population**.

**Statuses: `NeedsReview` · `ReadyForExecution` · `Cancelled`.** They stop at generation. Dispatched,
delivered and closed do not exist and **must not be added speculatively** — each needs the object
that produces it.

Carries `recipientSnapshot`, `relationshipGroupSnapshot`, an optional `policyResolutionSnapshot`
(**required** when `ReadyForExecution`), and named `issues`. Full field list: Atlas §4 and §15e.

**Snapshots are subsets, deliberately.** Copying the whole Person would create a second source of
truth for data the customer keeps editing. The snapshot answers *why this Moment received this
budget* — and must keep answering it after the policy is edited, republished or archived, which is
why it captures the policy **version** rather than a reference.

**OperationsState v6 captures all four delivery promises** from the resolved policy:
`deliveryRequirement`, `preferredDeliveryWindow`, `signatureRequired` and `proofRequired`.
Every pre-v6 Moment lacks all four, and that absence means **"not recorded when this Moment was
prepared"** — never `Standard`, an empty window, or `false`. The v5 → v6 migration backfills
nothing; partial or malformed presence is refused. H3.6 must name and recover from legacy absence
rather than infer the current policy.

#### Decision

A judgement between alternatives, with a **required reason**. Never mutated; superseded instead.

- Statuses: **`Confirmed` · `Superseded`** only. `Proposed` and `Cancelled` are explicitly rejected —
  an unconfirmed proposal is UI draft state, and `Cancelled` is indistinguishable from `Superseded`.
- Providers: `RuleEngine` (deterministic resolution) · `HumanOperator` (judgement).
- Types implemented: `MomentQualification` · `PolicyResolution` · `MomentCancellation` · **`BriefConfirmation`** · **`AddressOverride`** (H3.2) · **`ItemSelection`** (H3.3) · **`VendorSelection`** (H3.4) · **`CourierSelection`** (H3.5).
- `ItemSubstitution`, `VendorSubstitution` and `CourierSubstitution` are **not** implemented. Each
  presupposes a selection something downstream has already consumed, and nothing downstream exists.

#### OperationalEvent

Something that happened. **Append-only** — never edited, never deleted. Corrected only by appending
a referencing event.

- Types implemented: `MomentCreated` · `MomentMarkedReady` · `MomentNeedsReview` · `MomentCancelled` · **`BriefGenerated`** · **`ExecutionBriefAddressOverridden`** (H3.2) · **`ItemSelected`** (H3.3) · **`VendorSelected`** (H3.4) · **`CourierSelected`** (H3.5).
- **`ItemSelected`, not the checkpoint's `ItemPrepared`.** Nothing is prepared at that step: no
  vendor has been asked, no order exists, nothing has been made or moved. An item was *selected*,
  and that is the whole occurrence. This is §6's rule applied — the milestone that builds a step
  fixes its final name.
- Actors: `System` · `Operator` · `Customer` · `Vendor` · `Courier`.
- Sources: `Platform` · `WhatsApp` · `Email` · `Phone` · `Manual`.
- Carries both `occurredAt` (when it happened in the world) and `recordedAt` (when Aniyé learned of
  it). The two diverge as soon as external parties report.

#### ExecutionBrief

The operator's unit of work — who, where, how much, what constraints. **Invisible to the customer.**

- Statuses: **`Confirmed` · `Superseded`** only. **No `Draft`**: an unconfirmed brief is UI preview
  state, exactly as ADR-006 requires of every draft choice.
- `deliveryAddressSnapshot` is **copied** from `Person.deliveryAddress` at confirmation, never
  referenced — the brief must still explain where a gift was sent after the customer edits their
  record.
- **Only a `ReadyForExecution` Moment can produce one.** A Moment under review has no resolved
  budget, so there is nothing to brief against.
- A Moment never holds **two live briefs**. A correction supersedes; it does not add.
- Full definition: Atlas **§15f**.

**Queue states.** The briefs queue distinguishes **loading**, **failed**, **empty** and **populated**.
A read that failed is never rendered as an empty queue: the failure names what broke, preserves the
adapter's reason, offers a recovery, and says explicitly that briefs may exist which cannot be read.
Retrying re-reads and writes nothing. *(Closes H3.2-D1.)*

**The address gate.** A missing address never blocks Moment generation — `MOMENT_STATUSES` is not
expanded, because completeness is a property of the brief. It blocks **confirmation**, names the
missing fields, and links to the Workspace page that fixes them. Enforced in the persistence layer
as well as the interface, so it cannot be bypassed by a caller.

**Override.** An operator corrects the address for **one brief**, with a required reason, actor,
channel and timestamp. **`Person.deliveryAddress` is never written** (ADR-005, ADR-011). Correcting
a confirmed brief preserves the original, creates a revision, supersedes the confirming Decision and
appends `ExecutionBriefAddressOverridden`.

#### Catalog Item and item selection (H3.3)

**The catalog is a flat, deterministic seed** — `lib/catalog.ts`. Six fields and no more: stable id,
name, one-line description, one existing `GiftCategory`, an active flag, and a canonical `Money`
price. **No vendor, no cost, no intent, no collections, no images, no tags.** There is no catalog
administration surface and no customer-facing catalog route; adding an item is a code change.

This **re-issues the `Gift / Item` draft field list in Atlas §4**, which is superseded. Every field
that list carried beyond the six above belongs to a milestone that has not been built.

**Eligibility is four pure rules**, and an item must pass all of them:

| Rule | Why |
|---|---|
| The item is **active** | A withdrawn item is never a candidate; it stays in the list so historical selections stay legible |
| Currency matches the approved budget **exactly** | ADR-007 — no implicit FX. A foreign-currency item is not "about right", it is **not comparable** |
| `amountMinor` is **at or under** budget | `<=`. Exactly at budget qualifies; **one minor unit over does not** |
| The category is **not excluded** by the governing snapshot | Compared against the same `GiftCategory` strings the policy stores |

**Selection reads the snapshot, never a live policy.** A policy edited after the Moment was
generated did not govern that Moment.

⚠️ **A Moment prepared before H3.3 blocks selection**, and this is deliberate.
`PolicyResolutionSnapshot.excludedCategories` is optional because it is genuinely **absent** on
every pre-H3.3 record, and there is no honest way to recover it: `PolicyForm.save()` writes an
edited policy back to the **same id at the same version**, so `policyId` + `policyVersion` cannot
prove the exclusions are unchanged. Equivalence is not provable, so the block is named, the recovery
is to re-prepare the recipient, and the original record is left untouched. **Defaulting to an empty
list is prohibited** — it converts "unknown" into "nothing was excluded" and could send a gift the
governing rule forbade.

**One live selection per Moment**, enforced in `validateOperationsState` as well as the repository.
A confirmation is refused if the Moment is cancelled or no longer ready, if the referenced brief is
not the current live one **at the same revision**, or if a selection already exists. Browsing,
filtering, opening details, changing the draft choice and navigating away all write **nothing**.

#### Vendor and VendorOffer (H3.4)

**The directory is a list an operator types into.** A `Vendor` carries a name, country, city, at
least one contact method, an active flag and an optional note — and nothing else. Atlas §4 never
defined this object, so nothing is being re-issued: H3.4 defines it, as small as the milestone needs.

⚠️ **Deliberately absent, and not oversights:** scores, ratings, reliability, capacity, lead-time
policy, quality grades, price lists, categories, preferred status, contracts, SLAs, onboarding or
offboarding state. Vendor *Intelligence* is **H4.4**, gated on the pilot; partner onboarding is
unresolved **OPS-U5**. A directory an operator types into needs neither.

**Vendors are deactivated, never deleted.** A vendor who quoted last quarter has to stay resolvable
from the offers that name them, so there is no hard delete anywhere in the repository. Ordinary
directory maintenance is **not** a Moment Decision and **not** an OperationalEvent: adding a vendor
changes no Moment's execution, which is ADR-006's own test.

**A `VendorOffer` is an immutable record of what an operator was told.** It carries the Moment, the
brief and revision it was quoted against, the live `ItemSelection` Decision, the item snapshot, the
vendor snapshot, the quote, the channel it arrived through, when it was quoted, when it was recorded,
an optional whole-day lead time and optional terms. H3.4 has no offer revision, substitution or
negotiation flow.

> ⚠️ **`quotedVendorCost` is an estimate of what the vendor will charge Aniyé.** Not the customer's
> charge, not the catalog price, not an actual paid cost, not revenue, not margin — and **never
> derived from `CatalogItem.price`**. Every offer in one comparison must use the item's exact
> currency; quotes are never converted (ADR-007).
>
> **Zero is allowed; negative is not.** A vendor absorbing a cost is a real quote, and refusing it
> would invent a commercial rule nobody decided. There is likewise **no rule that a quote must sit
> below the catalog price** — the two answer different questions, and inventing that constraint
> would make the tool misreport what vendors actually said.

**Two sources of truth, deliberately different.** Delivery context comes from the **current confirmed
brief**; the chosen item comes from the **live `ItemSelection` Decision**, never re-read from the
catalog. A brief may take a governed address-only revision after an item was chosen, and that must
not invalidate the item — so the selection references both and snapshots the brief it quoted against.

**One live vendor selection per Moment**, enforced in `validateOperationsState` as well as the
repository. Entering, editing, reordering and discarding draft offer rows write **nothing**; one
confirmation atomically writes every considered offer, one `VendorSelection` Decision and one
`VendorSelected` Event. The Decision carries the **complete ordered considered set** — each offer's
vendor snapshot, money, channel, quoted time, lead time and terms — because the rejected offers are
what make the choice explicable years later.

> **One honest limit.** The repository verifies everything Aniyé holds: the Moment, the brief, the
> item Decision, every vendor record, and the internal consistency of the bundle. It **cannot prove
> what a vendor actually said.** A quote is attributable operator testimony — channel, quoted time,
> recorder — not an independently verified fact, and nothing in the code pretends otherwise.

#### Courier (H3.5)

**A list an operator maintains by hand, scoped per country** — ten fields: name, **one** country, at
least one contact method, an active flag, an optional note and timestamps. A courier working in two
countries is two rows, which is the smallest model that answers "who can carry this in NG?" without
inventing a coverage or routing scheme. There is deliberately **no city field**: city-level routing
is optimization, which checkpoint milestone 7 excludes.

⚠️ **Also excluded in terms by milestone 7:** rate APIs, tracking integration and optimization —
hence no rate cards, tracking numbers, API credentials, service levels, zones, transit-time models,
scoring or automatic routing. Deactivated, never deleted, like vendors.

**Selection is shaped like item selection, not vendor selection.** A vendor comparison had to persist
several hand-entered quotes because nothing knows what a vendor will say; courier alternatives *are*
knowable, so the considered set is **recomputed** from the active couriers serving the country and
one cost is recorded. There is no `courierOffers` collection.

**The delivery country comes from the live confirmed brief**, the item and vendor from their live
Decisions. None of it is re-derived from Workspace — a customer editing an address afterwards must
not silently change who was asked to carry what.

> **The named gap.** Milestone 7's completion test originally read *"a courier is selectable for
> every operating country, or the gap is named"* — preserved here as the historical wording.
>
> ✅ **Council resolved it on 2026-07-30.** The completion test now reads:
>
> *"A courier is selectable for every country represented by a current confirmed Execution Brief, or
> the gap is named."*
>
> **Current confirmed Execution Briefs are the accepted operational coverage authority.** The
> directory answers it with a coverage view over those briefs: each delivery country, how many briefs
> are heading there, and how many active couriers carry there.
>
> ⚠️ **Not `WorkspaceState.operatingCountries`, and that is settled, not merely deliberate.** Those
> are free-text names from the assessment (`"Nigeria"`); delivery countries are ISO-2 (`"NG"`); and
> **no name-to-code mapping exists in this repository**. Briefs answer the question exactly, and are
> the better evidence besides. `operatingCountries` **remains free-text assessment and marketing
> data and is not operational country authority** — no normalization, no mapping, no canonical
> country collection, no Workspace v8.

**No carriage ceiling was invented.** A quote above the vendor cost or the approved budget is
allowed — the budget governs what the *recipient* receives (ADR-004), and relating carriage to it is
a commercial decision **OPS-U3** has not made. Zero is a valid quote; negative is not; the currency must
match the item exactly.

### Accepted, not implemented

| Object | Milestone | Authority |
|--------|-----------|-----------|
| **Fulfillment** — dispatch → delivered → proof | H3.6 | **[ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md)**, accepted 2026-07-30 — supersedes the Atlas §4 draft status enum and `proofUrl` |
| **RecognitionOrder** — one per Moment; margin derived | H3.7 | ADR-007 |
| **Memory** — append-only relationship timeline entry | H3.8 | Atlas §4 |

### ⚠️ Draft, not specification

**`Fulfilment` and `Memory` — and likewise `Insight` — are specified in Atlas §4 but absent from
code.** Their Atlas field lists predate H3 and have not been reconciled against the implemented
model the way §4 Moment was in R6.

**Repository evidence cannot support canonical field definitions for any of them.** Atlas §4 Moment
turned out to be wrong on every field once H3.1 was built; there is no reason to assume these fared
better. **Treat them as drafts, not specifications**, until the milestone that builds each one
reviews and re-issues its field list:

| Object | Reviewed and fixed by |
|---|---|
| ~~`Gift / Item`~~ | ✅ **H3.3 — re-issued above.** Atlas §4's field list is superseded |
| ~~`Fulfilment`~~ | ✅ **ADR-012 re-issued it** — three states, no `Returned`, no `proofUrl`. Not yet implemented |
| `Memory` | H3.8 |
| `Insight` | H4.5 |

The `Gift / Item` case is the warning made concrete: its Atlas draft carried `vendorId`, `intent`,
`collectionIds`, `vendorCost`, `images` and `tags`, and **not one of them survived contact with the
milestone that built it.**

**Do not implement against these field lists as written.** Do not cite them as settled architecture.

---

## 4. The recording rule

> **Draft in the interface → the user confirms → one transaction writes the state change, the
> Decision, and the Operational Event together.**

This is ADR-006's central rule and the most frequently breached one.

- **Browsing is not persisted.** Abandoned selections are not persisted.
- **Previewing writes nothing.** `previewPreparation()`, `previewBrief()` and
  `previewItemSelection()` are pure and live in modules that cannot reach storage at all.
- Browsing a catalog of six eligible items, filtering by category, opening details and changing the
  chosen card four times produces **one** `ItemSelection` Decision, at confirmation — or none, if
  the operator leaves.
- Comparing three vendor quotes and choosing the second produces **one** `VendorSelection`
  Decision at confirmation, carrying all three — the two rejected quotes included, in full.
- The proposed state is **validated in full before anything is stored** — a batch that would produce
  an invalid state commits nothing at all (`validateOperationsState`).

**Explicitly rejected:** the lost pattern of recording a selection the moment an item was clicked.
It turns the audit trail into a record of mouse movement, burying the judgements that matter.

### Decision or Event?

> *Could it have gone another way, and does the reason matter later?*
> **Yes → Decision. No → Event.**

- Deterministic rule results **are** Decisions — a policy resolution had alternatives.
- Ordinary CRUD is audit, not an Operational Event. The test is whether it changes the state of a
  Moment's execution.
- **Failed actions are first-class Events, never absences.** A delivery that failed is recorded, not
  omitted.

### Idempotency

Every Moment carries a deterministic `sourceKey` —
`campaign::workspace::program::person::occasion`. Refreshing, returning, double-clicking or
re-preparing the same campaign reports records as **already prepared** rather than duplicating them.

⚠️ The `campaign` prefix marks which scheme produced the key. **Recurring programs will need a
generation-cycle component** — the same person legitimately receives a Moment every year. Both
schemes can coexist without ambiguity; the extension is not yet designed. *(See §9 U6.)*

---

## 5. Operator workflow

### Implemented — moment preparation

1. **Select an Active Campaign.** `/operations/programs/[id]/prepare`.
2. **Preview.** Eligibility is re-evaluated against *current* configuration. **Nothing is written.**
3. **Review the split** — who is ready, who needs attention, and why.
4. **Confirm.** One atomic operation commits Moments, qualification Decisions, policy-resolution
   Decisions and Events together.
5. **Work the queue.** `/operations/moments`, and `/operations/moments/[id]` for detail.

### Implemented — brief, then item

6. **Confirm the brief.** `/operations/moments/[id]/brief`. Fixes the address, the budget and the
   constraints an item will be chosen against.
7. **Choose an item.** `/operations/moments/[id]/item`. Only a Moment with a **current confirmed
   brief** reaches this screen. The operator sees recipient, occasion, approved budget and the
   applicable excluded categories; only eligible items are listed; the choice needs an explicit
   confirmation and a meaningful reason, and the screen says what confirming records.

8. **Compare vendor quotes.** `/operations/moments/[id]/vendor`. Only a Moment with a current
   confirmed brief **and** a live `ItemSelection` reaches this screen. The operator records what each
   vendor quoted, picks one, and says why. `/operations/vendors` is the directory those vendors come
   from.

**The next action is computed from state, not offered as a menu.** On a Moment: no brief → *Open the
brief*; brief confirmed, nothing chosen → *Choose an item*; item chosen, no vendor → *Compare vendor
offers*; vendor chosen, no courier → *Arrange carriage*; courier chosen → *View carriage*.
Doctrine §1.1.

9. **Arrange carriage.** `/operations/moments/[id]/courier`. Only a Moment with a confirmed brief,
   a live `ItemSelection` **and** a live `VendorSelection` reaches this screen. The operator picks
   from the couriers serving the delivery country and records what carriage costs.
   `/operations/couriers` is the directory those couriers come from, and it names any country with
   deliveries and nobody to carry them.

**Nothing is ranked.** Offers appear in the order the operator entered them; couriers appear
alphabetically. Aniyé has no evidence
yet about which vendors deliver well, and suggesting an answer before that evidence exists is exactly
what the checkpoint calls invention.

### Eligibility is re-evaluated, and nobody is silently dropped

A Campaign froze **who is covered**. It did not freeze **whether they can be executed**. Between
activation and preparation someone may have been paused, a group turned off, a rule unpublished.

**A Moment is created for every frozen person.** One that cannot proceed is marked `NeedsReview`
with a named issue — *not skipped*, because skipping would lose them.

| Issue code | Meaning |
|---|---|
| `person-missing` · `person-inactive` · `person-archived` | The recipient cannot receive |
| `group-missing` · `group-inactive` | The relationship group is gone or switched off |
| `country-missing` | No country, so no country-scoped policy can resolve |
| `no-executable-assignment` | No assignment reaches this person with a Published policy |
| `no-occasion-rule` | The resolved policy has no enabled rule for this occasion |

**Each issue carries the Workspace page that fixes it.** Operations links out; it never edits. The
administrator makes the change, and the operator re-prepares.

This is Doctrine §1.8 — no dead ends — applied to an internal surface. A blocked state that does not
name its unblocker is an unfinished screen, and that is as true for an operator as for a customer.

### Correction, never mutation

- A Decision that no longer holds is **superseded** by a new one. The original keeps its original
  text — *an audit trail that can be edited is not evidence*.
- An Event is corrected by **appending a referencing event**, never by rewriting one.
- Per ADR-011, correcting a confirmed Execution Brief **preserves the original**, creates a revision,
  supersedes the applicable Decision, and appends `ExecutionBriefAddressOverridden`.

---

## 6. The closed operational loop

The smallest sequence taking a configured organization to a delivered, costed, closed recognition.
Full table: checkpoint Part 2. Milestone identifiers: [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md).

| Step | Produces | Decision | Event | Milestone |
|---|---|---|---|---|
| Program activated | Program | — | `ProgramActivated` | H2.6 ✅ |
| Moment generated | Moment | `MomentQualification` | `MomentCreated` | H3.1 ✅ |
| Policy and budget resolved | `policyResolutionSnapshot` | `PolicyResolution` | — | H3.1 ✅ |
| Brief prepared | ExecutionBrief | `BriefConfirmation`, `AddressOverride` on correction | `BriefGenerated`, `ExecutionBriefAddressOverridden` | H3.2 ✅ |
| Item selected | Catalog Item snapshot on the Decision | `ItemSelection` | `ItemSelected` | H3.3 ✅ |
| Vendor offer selected | VendorOffer | `VendorSelection` | `VendorSelected` | H3.4 ✅ |
| Courier selected | `CourierSelection` Decision | `CourierSelection` | **`CourierSelected`** | H3.5 ✅ |
| Fulfilment tracked | Fulfillment | **`Redelivery` only** | `Dispatched`, `DeliveryFailed` | H3.6 — [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) |
| Delivery confirmed | Fulfillment | **none** | `Delivered`, `ProofReceived` *(metadata only)* | H3.6 — [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) |
| Cost recorded | RecognitionOrder | — | — | H3.7 |
| Moment closed | Moment, Memory | — | `MomentClosed` | H3.8 |

**Decision and Event names beyond H3.1 are the checkpoint's proposals, not implemented enums.** The
milestone that builds each one fixes its final name.

### What the customer sees at each step

| Step | Customer sees |
|---|---|
| Program active | Program summary |
| Moment generated | Upcoming count |
| Policy resolved | Budget per moment |
| Brief prepared | **Nothing** |
| Item selected | Category only — never the item's vendor |
| Vendor offer selected | **Nothing** |
| Courier selected | **Nothing** |
| Fulfilment tracked | Status only |
| Delivery confirmed | Confirmation + curated proof — ⚠️ **future architecture.** The metadata-only H3.6 prototype delivers the confirmation and **not** the proof file ([ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md)) |
| Cost recorded | **Their charge only** — never cost or margin |
| Moment closed | Timeline entry |

### Steps 7–9 need a human, not intelligence

> **The most important line in the checkpoint:** item, vendor and courier selection need *an
> operator, a list, and a text field*. Aniyé has no operational evidence yet about which vendors
> deliver well or which gifts land. **Intelligence built before that evidence exists is invention.**
> A manual flow generates the data that later makes intelligence possible; the reverse is not true.

Catalog, Gift and Vendor **Intelligence** are **H4.2 – H4.4**, gated on the pilot (H4.1). They are
not H3.

---

## 7. Operator experience standards

The Experience Doctrine applies to Operations in full. Operators are users. *(Doctrine §1.7 —
actor-specific simplicity — means each actor gets their own surface, not that internal surfaces get
a lower standard.)*

| Principle | In Operations |
|---|---|
| **One clear next action** | The queue shows the next brief needing attention, **not a table of everything** |
| **No dead ends** | Every blocked Moment names its unblocker and links to it |
| **Human language** | `Moment` → **"job"** for operators (**"upcoming recognition"** for customers) · `ExecutionBrief` → **"brief"** · `RecognitionOrder` → **"order"** in Operations, **"costs"** in Workspace |
| **Confirmation before consequence** | Confirmation states real impact — *"This will create 47 moments and commit ₦2,350,000 of your ₦3,000,000 envelope"* |
| **Avoiding analysis paralysis** | Operators see **budget-filtered** items, not the whole catalog |
| **Continuity across channels** | A vendor offer requested over WhatsApp is completable on the web. **The Decision is the record; the channel is a `source` field** |
| **Mobile-first partner flows** | Vendor and courier surfaces are phone-first **from the first line of code** (Doctrine §1.11) — not a later adaptation. E1 proved how expensive retrofitting is |
| **Progressive disclosure** | Future sections are shown as **explicitly unavailable**, never as clickable dead ends |

> ⚠️ **Correction.** This section previously said no Operations route had ever had a live visual
> check. **That is withdrawn** — every Operations route has been exercised in a live browser at
> three widths across H3.1 – H3.4, and defects found that way were fixed. What remains outstanding,
> and is genuinely untouched, is a **real-device pass**: resizing a desktop browser is not a phone.

---

## 8. Security, access and the pilot gate

### ⛔ There is no authentication and no role model

**Anyone who can reach the app can reach `/operations`.** This is not a gap to be worked around in
feature code — it is the current state, and any proposal assuming a role or permission check is
blocked (ADR-010, Atlas §15b).

### The local adapter is an internal prototype

| Property | Today | Required for pilot |
|---|---|---|
| Persistence | One browser, one device | Server-side, durable, backed up |
| Authentication | **None** | Required |
| Authorization | **None** | Role-based, per ADR-005 |
| Tenancy | One workspace per browser | Enforced isolation |
| Concurrency | Last write wins | Transactional |
| Audit integrity | **Anyone with devtools can rewrite history** | Append-only, tamper-evident |
| File storage | **None** | Secure, access-controlled |

**A payload belonging to a different workspace is refused, never adopted** — it is another
organization's history — and preserved rather than overwritten.

### Mandatory before any external exposure

1. A **production backend** with server-side persistence.
2. **Authentication** for both customer administrators and internal operators.
3. **Multi-tenancy** with enforced isolation.
4. **Secure file storage**, before proof of delivery exists.

> **No vendor, courier, recipient or additional internal user may be given access while Operations
> runs on browser storage.** Each implies a second party reading or writing operational records, and
> this adapter can authenticate nobody, isolate nobody, and prevent nobody from rewriting the audit
> trail. *A prototype one internal operator uses on one machine is defensible; the same prototype
> shared with a courier is not.*

### Where the gate actually binds

ADR-010 attaches it to two triggers, and **neither is an H3 milestone**:

1. **Any external pilot** — *"All of the following are required before any external pilot."*
2. **Any grant of access to a second party** — vendor, courier, recipient, or additional internal user.

**No H3 milestone requires either.** H3.4 and H3.5 build **directories the operator fills in by
hand**: checkpoint milestone 6 excludes "automated requests, APIs" and milestone 7 excludes "rate
APIs, tracking integration". A vendor in the directory is a row an operator typed, not an account
someone signs into. **The gate binds at the controlled pilot (H4.1)**, and independently at whatever
moment an external party is first given access.

> ⚠️ **Correction.** An earlier draft of this document stated the gate "binds from H3.4". **That was
> inference, not document evidence, and it is withdrawn.** No governing document places it there.
> **It does not block H3.2, H3.3, H3.4 or H3.5.**

The gate is nonetheless absolute at its real triggers: it is not a recommendation, and no schedule
pressure justifies handing a courier a browser-storage prototype.

---

## 9. Unresolved

**Rules the original Relationship Operations Atlas may have carried but which cannot be recovered
from repository evidence.** Each is recorded as absent rather than invented. **If you need one of
these, it does not exist — raise an ADR.** None of them is resolved here, and none may be
back-filled by inference.

### ⚠️ Identifiers are source-scoped — Council, 2026-07-30

**Two documents used bare `U4` for different questions**, and two used bare `U5` the same way. The
collision was live in the roadmap, this Atlas, the Recovery Ledger and `CLAUDE.md`.

| Bare identifier | This Atlas meant | The Master Roadmap meant |
|---|---|---|
| `U4` | Exception and QA taxonomy | *What is the first pilot currency?* |
| `U5` | Vendor and courier onboarding | *Class lifecycle fields* |
| `U3` | Aniyé's commercial role | The **same** question — checkpoint open question 3 |

**Every identifier is now prefixed by its source, and nothing has been renumbered.**

| Prefix | Source | Register |
|---|---|---|
| **`OPS-Un`** | This Atlas §9 | Below |
| **`CP-Un`** | `H2_H3_ARCHITECTURE_CHECKPOINT.md` open questions | [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) *Unresolved* |
| **`LEDGER-Cn`** | `RECOVERY_LEDGER.md` conflicts | [`RECOVERY_LEDGER.md`](RECOVERY_LEDGER.md) |

`OPS-U4` is now split: **`OPS-U4a`** is resolved by ADR-012, **`OPS-U4b`** is deferred.

**Dependency classification** — every item carries exactly one:

| Marker | Meaning |
|---|---|
| ✅ | **Resolved** — by a named accepted ADR |
| 🔴 | **Blocks the next milestone** |
| 🟠 | **Blocks a later named milestone** — named explicitly, and only that one |
| ⚪ | **Does not currently block implementation** |

| # | Unresolved | Blocks | Why it is not written here |
|---|---|---|---|
| **OPS-U1** | **Operator roles and permissions** — who may prepare, confirm, override, cancel, or view commercial detail | 🟠 **H5.1** | ADR-005 says Operations has "separate roles"; **no role model exists in code or in any accepted ADR**. ADR-010 confirms authorization is absent. Not an H3 blocker: H3 runs as an internal prototype where every operator is trusted by construction. Inventing a role table would encode an unmade decision |
| **OPS-U2** | **Operational SLAs** — lead times, escalation thresholds, how late a brief may sit | ⚪ | No evidence anywhere. Checkpoint milestone 4 defers the brief's non-address constraints entirely, and its completion test names only address completeness. A brief renders without an SLA |
| **OPS-U3** | **Aniyé's commercial role** — merchant of record or agent | 🟠 **H3.7** | Checkpoint open question 3, **explicitly unanswered**. It changes what `actualCustomerCharge` legally means. ADR-007 reserves `commercialRole: Unspecified \| MerchantOfRecord \| Agent` so the answer needs no migration of meaning |
| **OPS-U4a** | **Fulfilment lifecycle and proof recording** — states, whether failure is Event-only, how redelivery is recorded, whether proof files may be stored | ✅ **Resolved** — [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md), 2026-07-30 | Three states, one Fulfilment per Moment, no persisted draft, `Redelivery` the only Decision, proof recorded as **metadata only** |
| **OPS-U4b** | **QA and adjudication taxonomy** — what constitutes a QA exception, who adjudicates, how disputes are resolved, what the customer is told | 🟠 **Deferred — see the trigger below** | Still no taxonomy. **H3.6 must not introduce `QAException` or a dispute path.** The present single-operator internal prototype has **no second party with whom to adjudicate a dispute** |
| **OPS-U5** | **Vendor and courier onboarding** — qualification, contracting, performance thresholds, offboarding | 🟠 **H4.1** | H3.4/H3.5 build *directories* an operator types into, which needs no onboarding process. Onboarding becomes real when partners are engaged for the pilot |
| **OPS-U6** | **Recurring and Triggered generation semantics** — cadence, de-duplication window, cycle component of the `sourceKey` | 🟠 **H4.0** | ADR-004 accepts all three modes; **only Campaign is implemented**, and Campaign closes the loop on its own. The checkpoint proposes 14 days' lead time de-duplicated per person per occasion per year as a *default*, not a decision |
| **OPS-U7** | **Correction proposals crossing the boundary** — the object an operator raises and an administrator accepts | ⚪ | ADR-005 requires Operations to *propose* rather than write. **ADR-011 settles the address case by avoiding the crossing entirely** — the operator overrides one brief and never writes back — so H3.2 needs no general mechanism. It becomes necessary the first time a correction must actually reach configuration |
| **OPS-U8** | **Read-only customer-workspace access by internal users** | ⚪ | ADR-005 permits it and requires it to emit an Operational Event visible in the customer's own audit trail. **Neither the view nor a customer-facing audit trail exists**, and no milestone currently requires either |
| **OPS-U9** | **Pricing and customer charge derivation** — how `estimatedCustomerCharge` is computed | 🟠 **H3.7** | ADR-007 lists the fields and defers the arithmetic. Depends on U3 |
| **OPS-U10** | **Multi-organization operator workflow** — how one operator works across tenants | 🟠 **H4.1** | Depends on U1 and the absent backend. Checkpoint open question 1 — *does the pilot involve more than one organization?* — is unanswered, and it decides how much of H5.1 must precede the pilot |

### ⏳ OPS-U4b — when the deferral ends

**Deferred is not the same as ignored.** OPS-U4b becomes **blocking** at the earliest of:

1. a customer-facing delivery, proof or exception view;
2. a customer-visible operational audit trail;
3. any second party submitting or disputing delivery evidence;
4. **H4.0** customer-facing Moment visibility;
5. the external pilot.

Until one of those is true there is **no second party with whom to adjudicate a dispute**. Building
the taxonomy now would encode an unmade decision about a conversation that cannot yet happen.

### 🔴 Nothing in this register blocks H3.2

**No unresolved operational rule prevents the Execution Brief from being built correctly.** U7 is
the closest, and ADR-011 deliberately routed around it. The only outstanding prerequisite for H3.2
is **built work, not an unmade decision**: Workspace schema **v7** — `Person.deliveryAddress` — is
accepted under ADR-011 and not yet implemented. That migration is the first task inside H3.2.

**Ordinary deferrals** — decided, scheduled, and *not* unresolved: Recurring and Triggered
implementation (H4.0), Catalog / Gift / Vendor Intelligence (H4.2–H4.4), courier rate APIs,
automated offer requests, FX, and external connectors (H5.4).

---

## 10. Rules that must not be breached

A checklist. Each line is enforced by an accepted ADR, and each has a specific failure it prevents.

1. **Operations never writes customer configuration.** Read and propose only. *(ADR-005)*
2. **Commercial detail never crosses into Workspace** — vendor cost, courier cost, margin, vendor and courier identity, QA exceptions, internal notes. *(ADR-005)*
3. **Operational records never enter `WorkspaceState`.** Separate document, separate version chain. *(ADR-010)*
4. **No generic `save(state)`.** Named repository operations only — a generic setter is how append-only guarantees get lost. *(ADR-010)*
5. **Nothing is recorded until the user confirms.** Browsing and abandoned selections are not Decisions. *(ADR-006)*
6. **Confirmation is atomic** — state change, Decision and Event in one transaction, over a fully validated proposed state. *(ADR-006)*
7. **Decisions are never mutated; Events are never edited.** Supersede and append. *(ADR-006)*
8. **Every Decision carries a reason.** *(ADR-006)*
9. **A Program never pins a policy.** Policy resolves per Moment by the recipient's country. *(ADR-004)*
10. **Currencies are never summed and there is no implicit FX.** *(ADR-007)*
11. **Margin is derived, never stored — and is not accounting revenue.** *(ADR-007)*
12. **Nobody is silently dropped.** An ineligible person gets a `NeedsReview` Moment with a named issue and a route to the fix. *(Atlas §15e)*
13. **Moment statuses stop at generation.** No speculative fulfilment stages. *(Atlas §15e)*
14. **Address readiness is not a Moment status.** It is a property of the brief. *(ADR-011)*
15. **An operator address override never writes back to `Person`.** *(ADR-011)*
16. **No external party gets access while Operations runs on browser storage.** *(ADR-010)*
17. **Assume no authentication and no roles.** Any proposal that assumes otherwise is blocked. *(ADR-010)*

---

*Relationship Operations Atlas v1.9 — Aniyé Africa — 30 July 2026*
*v1.9: **Pre-H3.6 policy-resolution snapshot correction implemented.** Persistence is now `OperationsState` **v6**. Newly generated Moment snapshots capture the resolved policy's four delivery promises; existing Moments and copied brief snapshots are not backfilled, and absence remains unknown rather than becoming a default. Partial or malformed delivery context is structurally refused, and confirmation revalidation treats each promise as material. H3.6 has not begun; no Fulfilment, lifecycle type, Event, Decision, route or UI was added.*
*v1.8: **Governance documentation correction (D1) — documentation only.** §3's courier named-gap section no longer describes the country-coverage question as "surfaced rather than resolved": it records the **Council resolution of 2026-07-30**, quotes the accepted completion test verbatim, and states that **current confirmed Execution Briefs are the accepted operational coverage authority**. The original checkpoint wording is preserved as historical provenance. `operatingCountries` remains free-text assessment and marketing data and is **not** operational country authority. The dated v1.6 footer is left intact as a historical record. No code, schema, migration, validation, route or UI changed; `OperationsState` remains **v5** and H3.6 has **not** begun.*
*v1.7: **Governance decision closure before H3.6 — documentation only; no code, schema, migration or validation changed.** §9 identifiers are now **source-scoped** — `OPS-Un` here, `CP-Un` for checkpoint open questions, `LEDGER-Cn` for ledger conflicts — because bare `U4` and bare `U5` each meant two different questions across this Atlas and the Master Roadmap. **Nothing was renumbered**; the collision is documented in §9. `OPS-U4` is split: **`OPS-U4a`** (Fulfilment lifecycle and proof recording) is **resolved by [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md)**; **`OPS-U4b`** (QA, adjudication and disputes) is **deferred** with a five-point trigger, because a single-operator internal prototype has no second party to adjudicate with. §3 records ADR-012 as re-issuing the Atlas §4 `Fulfilment` draft; §6 narrows the loop table to `Redelivery` as the only fulfilment Decision and marks `ProofReceived` metadata-only; the customer-sees table records that **"confirmation + curated proof" is future architecture**, not delivered by H3.6. H3.6 has **not** begun; `OperationsState` remains **v5**.*
*v1.6: **H3.5 — courier directory and manual selection implemented.** §3 gains the `Courier` definition — ten fields, scoped to **one country**, with no rate cards, tracking, service levels, zones, scoring or routing, all excluded in terms by checkpoint milestone 7. §3 records why selection is shaped like H3.3 rather than H3.4 (courier alternatives are knowable, vendor quotes are not), that the delivery country comes from the live brief, that no carriage ceiling was invented, and how the completion test's *named gap* is answered — **against confirmed briefs, not `operatingCountries`**, because those are free-text names with no code mapping in the repository. §5 gains the carriage step and the five-state next action. §6 marks the courier step done and records **`CourierSelected`** — a **declared departure** from the checkpoint, which proposes no Event for this step; ADR-006's own test says assigning a carrier changes a Moment's execution. Persistence restated as Workspace v7 / `OperationsState` **v5**.*
*v1.5: **H3.4 — vendor directory, hand-entered offers and manual vendor selection implemented.** §3 gains the `Vendor` and `VendorOffer` definitions — six fields and no scores, and Atlas §4 never defined either, so nothing was re-issued. §3 records that vendors are deactivated rather than deleted, that directory maintenance is neither a Decision nor an Event, that `quotedVendorCost` is an estimate of what a vendor will charge Aniyé and is never derived from the catalog price, that zero is a valid quote and negative is not, and that delivery context and the chosen item come from **different** sources on purpose. §4 restates the recording rule with the three-quote case. §5 gains the vendor step and the four-state next action. §6 marks the vendor step done and fixes the Event name as **`VendorSelected`**, not the checkpoint's `VendorContacted` — Aniyé contacts nobody. §7 **withdraws the claim that no Operations route has ever had a live visual check**; a real-device pass remains genuinely outstanding. Persistence restated as Workspace v7 / `OperationsState` **v4**.*
*v1.4: **H3.3 — minimum catalog and item selection implemented.** §3 gains the Catalog Item definition and the four eligibility rules, and **re-issues Atlas §4's `Gift / Item` field list**, which is superseded — not one of its six speculative fields survived. §3 records why a pre-H3.3 record blocks selection: a policy is edited in place at the same version, so equivalence is not provable and an empty exclusion list may never be invented. §4 records that browsing a catalog writes nothing. §5 gains the brief → item workflow and the state-computed next action. §6 marks the item step done and fixes the Event name as **`ItemSelected`**, not the checkpoint's `ItemPrepared` — nothing is prepared there. `ItemSubstitution` is explicitly not implemented. Persistence restated as Workspace v7 / `OperationsState` **v3**.*
*v1.3: H3.2-D1 closed — §3 records the four distinct brief-queue states; a storage read failure is never presented as an empty queue.*
*v1.2: H3.2 — the Execution Brief moves from accepted to **implemented**. §3 gains its definition, the address gate, override and revision rules; §6 marks the brief step done; Decision and Event type lists extended; persistence restated as Workspace v7 / OperationsState v2.*
*v1.1: Council corrections. §3 gains an explicit "draft, not specification" treatment for `Gift / Item`, `Fulfilment`, `Memory` and `Insight`, each named with the milestone that must re-issue its field list. §8 **withdraws the claim that the ADR-010 gate binds from H3.4** — no governing document establishes it; the gate binds at the pilot (H4.1) and at any grant of external access. §9 gains a dependency classification on every unresolved item, and records that **none blocks H3.2**. H4/H5 milestone references renumbered.*
*v1.0: Reconstructed in R6 from repository-confirmed architecture, accepted ADRs and the H2 → H3 Architecture Checkpoint. Nothing written from memory; unrecoverable rules are listed in §9 as unresolved.*
*Basis: Workspace schema v7, `OperationsState` v6, System Atlas v3.11, ADR-001 … ADR-012.*
*Implemented state: H3.1 Moment generation · H3.2 Execution Brief · H3.3 minimum catalog and item selection · H3.4 vendor directory, offers and selection · H3.5 courier directory and selection. Everything from fulfilment onward is accepted architecture only.*
