# ADR-014 — Moment closure, Memory ownership and the safe relationship timeline

**Status: Accepted**
**Date drafted:** 2026-07-31
**Date accepted:** 2026-07-31 — Council
**Implementation status: ✅ Implemented at H3.8 — `OperationsState` v9, 2026-08-03**
**Full analysis:** H3.8 Confirmation + Memory Architecture Review, 2026-07-31 · builds on
[ADR-005](ADR-005-workspace-operations-boundary.md), [ADR-006](ADR-006-decision-vs-operational-event.md),
[ADR-010](ADR-010-operational-persistence-boundary.md) and [ADR-012](ADR-012-fulfilment-lifecycle-and-proof-recording.md) ·
[H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md) Part 2 row 13 and Part 3 milestone 10

> Accepted by Council on 2026-07-31. **This record was governance, not implementation at acceptance.**
> It resolves the architecture required to close a Moment and create its relationship Memory, so that
> H3.8 could be built without inventing semantics from the unreconciled legacy Memory draft.
> Acceptance changed no code, schema, migration, route, component or validation file; **the
> implementation landed at H3.8 on 2026-08-03** and is recorded at the end of this document.

## Context

`MASTER_ROADMAP.md` names H3.8 — Confirmation + Memory — as the next and last milestone in the H3
closed operational loop, with no known prerequisite blocker, not yet scoped in detail, its
architecture review coming first. Three things stood in the way of scoping it, and this record
settles all three.

**First, "Confirmation" is ambiguous on its face.** The completed loop already has `Delivered`
(H3.6), `ProofReceived` (H3.6, metadata only) and a `Reconciled` RecognitionOrder (H3.7). Checkpoint
Part 2 row 13 and the Master Roadmap's H3.8 completion test both use the word "closed" without
saying whose confirmation that is, or how it differs from what already exists.

**Second, the checkpoint's terminal status conflicts with the Relationship Operations Atlas's own
loop table.** Checkpoint Part 2 row 13 proposes `status: Fulfilled`. `Fulfilled` collides with the
Fulfilment object introduced at H3.6 — a Moment reading `Fulfilled` beside a Fulfilment reading
`Delivered` is two names for one idea, and three accepted validation suites currently assert that
`Fulfilled` is *not* a Moment status, a check whose underlying reasoning ("no speculative fulfilment
stage") remains correct.

**Third, and most consequentially, `ANIYE_SYSTEM_ATLAS.md` §4 marks its own `Memory` field list a
**draft, not a specification**, and names H3.8 as the milestone required to review and re-issue it —
exactly the same treatment `Fulfillment`'s draft received before ADR-012, and exactly the treatment
`Gift / Item`'s draft received before H3.3. Neither of those two drafts survived contact with the
milestone that built it. There is no reason to assume the `Memory` draft fares differently, and this
record treats it the same way: reviewed and re-issued, not implemented as written.

## Council conditions on acceptance

Binding for the first Moment-closure and Memory version:

- **Confirmation means operator closure**, not recipient acknowledgement. Recipient acknowledgement
  is **unsupported and excluded** from H3.8 — not because it is architecturally impossible, but
  because no channel, actor semantics or governance decision for it exists yet.
- **The terminal Moment status is `Closed`**, a declared departure from the checkpoint's `Fulfilled`.
  The only entry is `ReadyForExecution → Closed`, and closure is **irreversible**.
- **Memory persists in `OperationsState` v9**, additive, inventing nothing. **Domain ownership is not
  the same question as storage location** — see §2.
- **The canonical Memory has exactly eleven fields**, re-issued from first principles and superseding
  the Atlas §4 draft in full.
- **The recipient timeline is a nine-field exact-key whitelist projection**, never a spread of an
  internal record with fields hidden in the UI.
- **Three separate prohibition boundaries** govern persisted Memory, the `MomentClosed` Event payload
  and the timeline projection — each with its own permitted and forbidden keys.
- **Closure writes no Decision.** One `MomentClosed` Event, applying ADR-006's own test.
- **This is a documentation-only governance record.** It authorizes a future implementation; it does
  not perform one.

## Decision

### 1. The meaning of Confirmation

**At H3.8, Confirmation means an Aniyé operator explicitly confirming that a delivered and reconciled
recognition is complete.**

It is distinct from three things already built, and from one thing not built:

| | What it records | Built |
|---|---|---|
| `Delivered` | The parcel reached the recipient (H3.6) | ✅ |
| `ProofReceived` | Evidence arrived — metadata only, changes no status (H3.6) | ✅ |
| RecognitionOrder `Reconciled` | The three actual amounts are confirmed (H3.7) | ✅ |
| **Recipient acknowledgement** | The recipient themselves confirming receipt or satisfaction | ⛔ **Not H3.8** |

**Recipient acknowledgement is unsupported and excluded at H3.8.** This is not a claim that it is
architecturally impossible. ADR-010 forbids giving a recipient access while Operations runs on
browser storage, and no channel, actor semantics or approved recording path exists for it today. **A
later governance decision could introduce an operator-recorded acknowledgement** — received, for
example, through phone or WhatsApp exactly as a vendor quote is recorded today — but that decision has
not been made, and this record does not make it.

**H3.8 creates no recipient-confirmation field, timestamp, Event or Decision.** Delivery confirmation
and recipient confirmation are not the same thing, and nothing in this record treats them as
equivalent.

### 2. Domain ownership

**Ownership is not decided by where a record is stored.**

- The **Relationship Engine** owns the Moment's current state — the fourth status, `Closed`, is a
  Relationship Engine fact (System Atlas §3).
- **Knowledge** owns Memory and the `MomentClosed` occurrence it results from — historical learning
  about what happened, per System Atlas §3's own rule: *"if a record describes what **was**… it
  belongs to Knowledge."*
- **Operations orchestrates the atomic closure** — it is the surface where an operator confirms, and
  the transaction that writes the Moment's new state, the Memory and the Event together.
- **`OperationsState` is the shared prototype persistence envelope, not a domain boundary.** Decisions
  and Operational Events are already Knowledge-domain objects living in this same document (System
  Atlas §15c), so Memory joining them is the existing pattern, not a new one. **Putting Memory in
  `OperationsState` does not transfer its conceptual ownership to Operations, and does not transfer
  the Moment's conceptual ownership to Knowledge.**
- **ADR-010 is unaffected.** Production persistence, proper service boundaries and a real Knowledge
  store remain required before an external pilot, exactly as they already are for Decisions and
  Events.

### 3. Canonical Moment lifecycle

```
MOMENT_STATUSES = ['NeedsReview', 'ReadyForExecution', 'Cancelled', 'Closed']   // 3 → 4, future work
```

**`Closed` is the exact canonical terminal status.** It deliberately supersedes the checkpoint's
proposed `Fulfilled` — that name collides with the Fulfilment object H3.6 already built, where a
Moment reading `Fulfilled` beside a Fulfilment reading `Delivered` would be two names for one idea.

The only new transition:

| From | To | Written by |
|---|---|---|
| `ReadyForExecution` | `Closed` | the future `commitMomentClosure` operation, and no other path |

**Closure is irreversible.**

- `Closed` cannot become `Cancelled`.
- `Closed` cannot become `ReadyForExecution`.
- `Closed` cannot become `NeedsReview`.
- `Closed` cannot be reopened.
- No additional lifecycle state is introduced — no `Missed`, no `Archived`, no `Fulfilled`.

### 4. Closure prerequisites

A Moment may close only when **all** of the following hold:

- it belongs to the workspace;
- it is `ReadyForExecution`;
- it is not cancelled;
- the current confirmed Execution Brief exists;
- the authority chain is coherent — the live brief and the three live selection Decisions agree with
  each other and with the Fulfilment and RecognitionOrder that reference them;
- its Fulfilment exists and **replays to `Delivered`** (`replayFulfilment()`, ADR-012 §6 — the ordered
  Event history is the historical truth, and the current-state field is checked against it);
- its RecognitionOrder exists and is `Reconciled`;
- when the frozen brief's `policyResolutionSnapshot.proofRequired === true`, at least one matching
  `ProofReceived` Event exists on the Moment;
- no Memory already exists for the Moment;
- no `MomentClosed` Event already exists for the Moment.

**Failed-delivery and redelivery history do not prevent closure** when the current validated
Fulfilment state is `Delivered` — a Fulfilment that failed twice and was redelivered twice is exactly
as closable as one that succeeded on the first attempt (ADR-012 §6).

**`signatureRequired`, `deliveryRequirement` and `preferredDeliveryWindow` create no additional H3.8
closure gate.** Comparing what was promised against what actually happened is QA adjudication —
**OPS-U4b**, deferred — and closure must never perform it.

**A missing frozen delivery-policy snapshot must never be defaulted or re-resolved from current
Workspace policy.** A policy is edited in place at the same id and version (`PolicyForm.save()`), so a
live read proves nothing about what governed this Moment — the same reasoning H3.3 already applied to
`excludedCategories` and the pre-H3.6 correction already applied to the four delivery promises.

**A pre-H3.7 delivered Fulfilment without a RecognitionOrder can never close.** No order, commercial
history, exception flag or reconstruction path is invented for it. This preserves the honest
limitation ADR-013 already established: *"A Fulfilment dispatched before H3.7 keeps its full history
and can never receive an invented order."* The surface must name the limitation rather than offer an
action that would fabricate evidence.

**Cancelled and `NeedsReview` Moments cannot close.** Neither ever executed to `Delivered`.

### 5. Persistence and migration boundary

The later implementation adds one additive migration, **`OperationsState` v8 → v9**:

```
// v8 → v9: add the memory collection. Additive, and it invents nothing.
if ((working.schemaVersion as number) === 8) {
  working = {
    ...working,
    memories: Array.isArray(working.memories) ? working.memories : [],
    schemaVersion: 9,
  };
}
```

Binding on that future rung:

- **No Memory backfill.** Not one is created for an existing delivered-and-reconciled Moment —
  closure was never confirmed for it.
- **No existing Moment is rewritten**, and no existing Moment is changed to `Closed`.
- **Unknown keys are preserved**, carried through by the spread exactly as every prior rung does.
- **Reads remain side-effect-free** — the migration runs in memory only and never rewrites storage on
  a read.
- **v10 and newer are refused**, not downgraded — the existing `version > CURRENT_OPERATIONS_SCHEMA_VERSION`
  guard, once the constant reads 9.
- **A v1 payload walks every rung through v9**, one version at a time, exactly as the chain already
  works.
- **The storage key is unchanged.**
- **Workspace remains v7.** No Workspace field, migration, route or configuration changes.

**This governance commit performs none of the above.** `OperationsState` remains **v8** and Workspace
remains **v7** until a future implementation milestone lands the rung.

### 6. Canonical Memory

**Supersedes the Atlas §4 `Memory` draft in full.**

```ts
export const MEMORY_OUTCOMES = ['Delivered'] as const;   // only 'Delivered' is writable
export type MemoryOutcome = (typeof MEMORY_OUTCOMES)[number];

export interface Memory {
  id: string;
  workspaceId: string;
  momentId: string;
  personId: string;
  fulfilmentId: string;
  recognitionOrderId: string;
  outcome: MemoryOutcome;
  outcomeDate: string;              // ISO date
  createdByActorType: ActorType;    // 'Operator'
  createdByActorId?: string;        // optional — no authenticated user model exists
  createdAt: string;                // ISO instant
}
```

Rules:

- `MEMORY_OUTCOMES` contains exactly `Delivered`; only `Delivered` is writable.
- `outcomeDate` comes from the authoritative `Delivered` Event's `occurredAt` — the terminal delivery
  fact, not the closure instant.
- `createdByActorType` is `Operator`.
- `createdByActorId` remains optional because **no authenticated user model exists** (OPS-U1,
  ADR-010) — the same reasoning `Decision.actorId` and `OperationalEvent.actorId` already apply.
- `createdAt` is the closure-confirmation time.
- `momentId`, `personId`, `fulfilmentId` and `recognitionOrderId` are **required** — the draft left
  `momentId` and `fulfillmentId` optional; closure always has both, so optionality would be a false
  claim of uncertainty.
- **Exactly one Memory exists per closed Moment.**
- **Memory is immutable after creation.**
- **No correction or supersession path is introduced at H3.8.** Every persisted field is either a
  reference, a timestamp, or derived at commit from already-immutable evidence — there is almost
  nothing that can be wrong, and inventing a correction mechanism for a record no correction can reach
  would be the `Returned` mistake ADR-012 already refused by name. One inherited limitation follows
  from this: if the `Delivered` Event's `occurredAt` was mistyped at H3.6, `outcomeDate` inherits that
  error — that Event was already append-only and uncorrectable before H3.8, and this record inherits
  the limitation rather than inventing a repair for it.

**Not persisted, and not to be added for compatibility** — no Memory has been implemented, so there is
nothing to be compatible with:

- `type` (the draft's Gift / Note / Call / Visit / Event / Milestone enum — five of six values are
  unreachable, the same failure `Gift / Item`'s draft made);
- `summary` (composed only in the projection — see §7; a stored rendered string is a second source of
  truth, and unreviewed operator free text has no place on a customer-facing surface);
- the draft's ambiguous single `date` (split, correctly, into `outcomeDate` and `createdAt`);
- generic `createdBy` (would fabricate an identity — no user model exists);
- `occasion`, target date, recipient name or contact details (already frozen on the immutable Moment —
  a third copy of a recipient's personal data is a third thing to correct or erase);
- item name or category (derivable from the live `ItemSelection` Decision via the RecognitionOrder —
  copying pins a snapshot in a third place);
- any `Money` or commercial value.

**Occasion, planned date, recipient identity and gift category are obtained through governed
references when constructing the safe projection** (§7). They are not copied into Memory.

### 7. Safe timeline projection

`RecipientTimelineEntry` — a pure, exact-key whitelist with exactly **nine required fields**:

| # | Field | Source |
|---|---|---|
| 1 | `entryId` | `Memory.id` |
| 2 | `recipientFirstName` | `Moment.recipientSnapshot.firstName` |
| 3 | `recipientLastName` | `Moment.recipientSnapshot.lastName` |
| 4 | `occasion` | `Moment.occasionType`, translated for humans (Doctrine §9) |
| 5 | `plannedDate` | `Moment.targetDate` |
| 6 | `outcomeDate` | `Memory.outcomeDate` |
| 7 | `outcome` | `Memory.outcome` |
| 8 | `giftCategory` | **required.** Resolved through the RecognitionOrder's immutable `itemSelectionDecisionId`, read from that **exact** immutable `ItemSelection` authority — **never** resolved from whichever `ItemSelection` Decision happens to be currently live for the Moment, because a later re-selection on a different Moment path must not silently relabel a closed Memory's gift |
| 9 | `summary` | derived only from fields 2–8; never persisted; never operator-authored |

**Construction must name every field individually into a fresh object.** Object spread of an internal
record into a projection, with fields hidden in the UI, is prohibited — hiding a field is not
excluding it. The later implementation must enforce the exact nine-key output at a boundary, not by
convention.

### 8. Three separate prohibition boundaries

Three different objects exist at three different trust levels. Collapsing them into one prohibition
list is itself an error — it either forbids fields that are legitimately internal-only (like
`workspaceId` on the Memory) or fails to name fields that must never reach the projection. Each
boundary is defined on its own terms.

**A. Persisted Memory.** The eleven canonical keys in §6 are permitted in full — `workspaceId` and
`recognitionOrderId` are valid internal Memory fields; they identify and link the record and are never
themselves projected outward (§7 does not read them). Memory must contain no:

- partner (vendor or courier) identity or contact data;
- cost, charge, budget, margin, `Money` or `commercialRole`;
- selected-offer comparison;
- Decision reason or recommendation;
- operator note;
- QA, dispute or escalation material;
- delivery address or override;
- recipient contact details;
- proof metadata or content;
- policy details;
- duplicated occasion, target date, recipient name or gift category (§6 — these are referenced, not
  copied);
- summary or free text.

**B. The `MomentClosed` Event.** Its envelope carries the normal `workspaceId` and `momentId`, exactly
as every other Operational Event does. Its exact payload:

```
{ memoryId, fulfilmentId, recognitionOrderId, outcome, outcomeDate, previousStatus }
```

No other payload key is permitted.

**C. The recipient timeline projection.** Only its nine whitelisted fields (§7) may appear. It must
exclude, by name:

- `workspaceId`, `momentId`, `personId`, `fulfilmentId`, `recognitionOrderId`;
- partner identity and contacts;
- all estimates, actuals, budgets, charges, margin and `commercialRole`;
- every other RecognitionOrder field;
- offer comparisons;
- Decision `inputs`, `recommendation`, `reason` and `overrideReason`;
- internal notes;
- QA, dispute and escalation material;
- delivery address and geography;
- recipient email, phone, role and country;
- proof kind, channel, actor, timestamps, files, URLs, data URIs, base64, bytes or Blob content;
- Fulfilment status, attempt number and failure history;
- brief, selection, Program, policy, source and schema identifiers.

**No amount anywhere in the projection asserts that money moved**, because no amount is in the
projection at all.

### 9. Event and Decision model

Closure appends exactly one `MomentClosed` Operational Event:

| Field | Value |
|---|---|
| `eventType` | `MomentClosed` |
| `workspaceId` / `momentId` | from the re-read Moment |
| `actorType` | `Operator` |
| `actorId` | optional, unset unless a future real user model supplies it |
| `source` | `Platform` |
| `payload` | the exact six keys in §8.B |
| `occurredAt` | closure time |
| `recordedAt` | the same closure time |

**Closure creates no Decision.** `MomentClosure`, `MemoryWritten` and `RecipientConfirmation` are
**not** added to `DECISION_TYPES`.

**This reconciles with ADR-006, rather than departing from it.** ADR-006's original pattern describes
confirmation as writing "state + Decision + Event" together, but its own governing test is narrower
and controls: *"could it have gone another way, and does the reason matter later?"* A Decision exists
only for genuine judgement between alternatives whose reason matters later — not for every
confirmation. **ADR-012 already applied this exact test** to refuse a Decision for `Dispatched` and
`Delivered`: confirming that a parcel went out or arrived is an occurrence, not a choice between real
alternatives, and a "reason" field on it could only ever be filler. Closure is the same shape: by the
time all the prerequisites in §4 hold, there is no alternative to confirm between — the operator is
asserting that the record is complete, not choosing among options. **Closure therefore writes Moment
state + Memory + Event, with no Decision**, and `DECISION_TYPES` is unchanged.

### 10. Atomic closure bundle

The later implementation makes one successful confirmation **one atomic storage write** that:

- changes the Moment to `Closed`;
- creates the immutable Memory;
- appends `MomentClosed`.

It must:

- re-read current state at confirmation-time — nothing is trusted from what the screen was holding;
- validate plain containers (`isPlainRecord`) before any destructuring or property access — shape
  before contents, the H3.3/H3.4-D1 rule;
- recompute the current brief, selection authority, Fulfilment replay, RecognitionOrder, proof
  requirement and existing Memory/Event state from that re-read;
- validate exact keys on the Memory and on the Event payload;
- rebuild canonical records rather than trust submitted ones;
- compare submitted values field by field, nested values included;
- refuse stale, malformed, duplicate or cross-workspace submissions **without throwing** — a thrown
  exception is not a refusal, it names no recovery and leaves the operator unable to say whether
  anything was written;
- leave state **byte-identical** after every refusal;
- write nothing for opening, previewing, typing, reviewing or cancelling.

**No caller may directly submit or assert the Moment's terminal status** — it is recomputed by the
implementation, exactly as Fulfilment status and RecognitionOrder actuals already are.

### 11. Interface and route boundary

**H3.8 remains Operations-only.**

The later implementation may add exactly two routes:

| Route | Title |
|---|---|
| `/operations/moments/[id]/close` | *Close the moment* |
| `/operations/timeline/[personId]` | *Relationship timeline* |

It will also update `/operations/moments/[id]` (a Memory panel once closed, a terminal next-action
state) and `/operations/moments` (a `Closed` filter). **No new top-level navigation item is
required.**

**The Operations relationship timeline is a safe internal projection and preview.** It is not a
customer portal and does not give a recipient access — ADR-010 forbids that while Operations runs on
browser storage. **H4.0 retains ownership of the actual customer-facing timeline and Moment
visibility**; H3.8 proves the projection is correct and safe, H4.0 owns showing it to anyone outside
Aniyé.

**If implemented as scoped, the build would move from 32 to 34 routes.** This governance commit
creates no routes, and the build remains **32**.

### 12. Program-envelope consequence

Checkpoint Part 2 row 13 states that Moment closure makes Program envelope consumption final. **This
is not supported by the current architecture, and H3.8 does not implement it.**

`Program.budgetEnvelopes` lives in `WorkspaceState`, which Operations may never write (ADR-005).
`budgetConsumed` does not exist anywhere in the repository — Atlas §4 states it would be *"derived on
read, never stored,"* and no derivation is implemented. Nothing currently decrements an envelope, and
nothing ever has.

**Do not introduce, at H3.8 or as a consequence of this record:**

- a Workspace write;
- mutable Program totals;
- a financial ledger;
- payment state;
- another source of financial truth.

Any future envelope reporting requires **its own milestone and its own governance decision** — it is a
derived read over Moment `approvedBudget` values at most, not a write anywhere.

### 13. Privacy, correction and pilot gates

**H3.8 minimises duplicated personal data** — the reference-not-copy shape in §6 means Memory
duplicates no personal data at all. It does not settle:

- retention periods for Memory or the operational Event trail;
- erasure requirements for a recipient who never consented and cannot log in;
- privacy rights more generally;
- correction obligations, given Memory's deliberate immutability (§6);
- recipient access or acknowledgement (§1);
- the long-term Knowledge-store boundary once a backend exists (§2).

**These require professional confirmation before external use.** No definitive Nigerian legal opinion
appears in this record, and none should be inferred from it.

**Unchanged by this record:**

- ADR-010's production backend, authentication, multi-tenancy and secure file storage gate;
- ADR-013's legal, tax, accounting and payments confirmations;
- OPS-U4b's QA/adjudication deferral;
- the proof-file exclusion (ADR-012 §7) — no proof file, URL, data URI, base64 or Blob is stored by
  this record or by the implementation it authorizes.

## What this record does not decide

Deliberately out of scope, and **not** to be inferred from anything above:

- Recipient acknowledgement as a supported occurrence — excluded at H3.8, not ruled out permanently
  (§1).
- The customer-facing timeline route — H4.0's, not H3.8's (§11).
- **OPS-U4b** — QA, adjudication and disputes remain deferred.
- Proof-file storage, retention, correction or erasure mechanisms (§13).
- Program envelope consumption or any financial-ledger concept (§12).
- Memory-derived recommendations, scoring, Insights or analytics — H4.2–H4.5.
- Any new operator role, permission or authentication model — OPS-U1, H5.1.

## Consequences of later implementation

**Recorded at acceptance as future consequences.** All of the below is now true: implementation
landed at H3.8 on 2026-08-03, recorded in full at the end of this document.

- H3 is now **8 of 8**.
- Milestones are now **26 of 37**.
- `OperationsState` is now **v9**.
- Workspace remains **v7**.
- ADR-006 is now **fully implemented** for the H3 loop.
- **H4.0** is now the next milestone.
- The H3 exit chain now reads: configure → program → moment → brief → item → vendor → courier →
  order → dispatch → deliver → proof where required → reconcile → **close → timeline**.

**At acceptance (2026-07-31), before implementation, truth was:**

- H3 was **7 of 8**.
- **25 of 37** milestones were complete.
- `OperationsState` was **v8**.
- Workspace was **v7**.
- H3.8 was governed but unimplemented.
- ADR-014 was Accepted, not Implemented.

## Relationship to earlier decisions

**Applies [ADR-006](ADR-006-decision-vs-operational-event.md)** — its governing test, not its
"state + Decision + Event" shorthand, controls; corrections would supersede rather than mutate if a
correction path existed, but none does at H3.8 (§6, §9).

**Sits inside [ADR-005](ADR-005-workspace-operations-boundary.md)** — Memory and the timeline
projection are built on the same customer-safe-versus-internal boundary that already governs
Workspace and Operations, restated precisely for these two new objects at §8.

**Extends [ADR-010](ADR-010-operational-persistence-boundary.md)** — Memory joins Decisions and
Events as a Knowledge-domain object living in the shared prototype envelope (§2, §5); every pilot gate
ADR-010 already states is unchanged and unaffected.

**Applies [ADR-012](ADR-012-fulfilment-lifecycle-and-proof-recording.md)** — closure reads
`replayFulfilment()`'s result rather than trusting a stored status field (§4), and reuses ADR-012 §4's
own Decision-versus-Event reasoning rather than restating it from scratch (§9).

**Does not touch [ADR-013](ADR-013-commercial-role-pilot-currency-and-recognition-order.md)** — the
RecognitionOrder's fields, statuses and derived margin are read as closure evidence and referenced by
id from Memory, and nothing about them changes.

## Supersedes

- `ANIYE_SYSTEM_ATLAS.md` §4's draft `Memory` field list (`id`, `personId`, `momentId?`,
  `fulfillmentId?`, `type`, `summary`, `date`, `createdBy`, `createdAt`), replaced in full by §6
  above.
- Checkpoint Part 2 row 13's `status: Fulfilled`, replaced by `Closed` (§3).
- Checkpoint Part 2 row 13's claim that closure makes *"envelope consumption final"* — recorded as
  unsupported by current architecture rather than implemented (§12).

The historical checkpoint text is **not rewritten**. It stands as the record of what was proposed;
this ADR is the record of what was decided.

## Acceptance did not implement H3.8

**This record was governance, not implementation, at acceptance (2026-07-31).** At acceptance no
`Memory` type or collection existed, no `Closed` Moment status existed, no `MomentClosed` Event
existed, no closure repository operation existed, and no recipient-timeline route existed.
`OperationsState` was **v8**; Workspace was **v7**; the roadmap read **25 of 37** with H3 at **7 of
8**.

## Implementation record — H3.8, 2026-08-03

> **This section records what was built. It does not amend the decisions above**, every one of which
> was implemented without variance. `OperationsState` is now **v9** — the additive `memories` rung.
> Workspace remains **v7**.

| Decision | Where it is held |
|---|---|
| `Closed` is the exact fourth status | `MOMENT_STATUSES`; entered only via `commitMomentClosure`, and structural validation refuses a `Closed` Moment without exactly one Memory and one `MomentClosed` Event |
| Eleven-field Memory | `Memory` in `lib/operations/types.ts`; `FORBIDDEN_MEMORY_FIELDS` refuses the draft's `type`, `summary`, `date`, `createdBy`, occasion, recipient and gift-category fields by name |
| `outcomeDate` from the `Delivered` Event | Read from the fulfilment's own replayed history, never the closure instant |
| No Decision on closure | `DECISION_TYPES` unchanged; `MomentClosure`, `MemoryWritten` and `RecipientConfirmation` were never added |
| One `MomentClosed` Event, six-key payload | `MOMENT_CLOSED_PAYLOAD_KEYS`; enforced at the repository trust boundary and in structural validation |
| Atomic closure bundle | `lib/operations/closure.ts`'s `verifyClosureWrite()` re-reads and recomputes every prerequisite; the repository writes the Moment, Memory and Event in one storage call |
| No caller asserts the terminal status | `ClosureWrite` carries only `{ memory, event }` — no `moment` field exists to submit |
| Nine-field timeline whitelist | `lib/operations/timeline.ts`'s `RecipientTimelineEntry`, built by naming every field; `hasExactTimelineKeys()` proves it at a boundary |
| `giftCategory` via the order's frozen `itemSelectionDecisionId` | Never via `findLiveItemSelection` |
| Operations-only interface | `/operations/moments/[id]/close` and `/operations/timeline/[personId]`; no new top-level navigation |

**Closure prerequisites, exactly as decided:** confirmed brief, all three live selection Decisions in
agreement with the Fulfilment and RecognitionOrder, a Fulfilment that replays to `Delivered`, a
`Reconciled` RecognitionOrder, and — only when the frozen `proofRequired` promise is `true` — at least
one recorded `ProofReceived` Event. A pre-H3.7 delivered Fulfilment with no RecognitionOrder is
refused permanently, by name (`legacy-fulfilment`), never offered a fabricated path to closure.

**Not built, as required:** recipient acknowledgement, the customer-facing timeline route (H4.0),
QA/adjudication (OPS-U4b), any proof-file mechanism, and Program envelope consumption or any
financial-ledger concept.

**Validation:** two new suites, `validate:closure` (51 checks) and `validate:timeline` (12 checks) —
**614 checks across fifteen suites**. Typecheck clean; lint unchanged at 47 problems (26 errors, 21
warnings); build succeeds with **34 routes** (the two additions this record predicted). **Verified
live in a browser**: an existing delivered-and-reconciled Moment was closed end to end — the
confirmation copy, the atomic write, the terminal Memory panel, the disabled cancellation action, the
`Closed` filter and badge on the moments list, and the resulting entry on `/operations/timeline/p1`
showing only occasion, planned date, outcome date, outcome and gift category.
