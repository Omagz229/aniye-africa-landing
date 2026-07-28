# ADR-011 — Recipient address is customer-owned; operator overrides are per-brief

**Status: Accepted**
**Date drafted:** 2026-07-28
**Date accepted:** 2026-07-28 — Council
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#4-execution-brief) — milestone 4; gap surfaced by the H3 architecture review

> Accepted by Council on 2026-07-28, subject to the conditions recorded below.

## Context

Checkpoint Part 3 milestone 4 requires an Execution Brief carrying "recipient, address, budget and constraints", with the completion test *"an incomplete address blocks readiness with a named recovery"*. Part 2 step 6 lists `AddressUpdated` as an Operational Event, and Atlas §18 decision 3 records "Recipient address required" for the concierge intake.

No address exists anywhere in the model. `Person` (`lib/workspace.ts`) carries names, email, phone, role, country, dates, class references, provenance and status — and no address. `RecipientSnapshot` (`lib/operations/types.ts`) carries no address either.

The gap is not merely a missing field. It sits on the **ADR-005** boundary: a delivery address is customer configuration, but it is the operator, at brief time, who discovers it is wrong. ADR-005 forbids Operations writing configuration, while the checkpoint's own event name (`AddressUpdated`) implies exactly such a write. That contradiction is what this record resolves.

## Council conditions on acceptance

Binding for the first Execution Brief version:

- **`Person` owns an optional, customer-controlled default `deliveryAddress`.** It is Workspace configuration, edited in Workspace, by the customer.
- The field arrives **additively, through Workspace schema v7**. No existing record is transformed and no person is given an address by migration.
- A **Moment may remain `ReadyForExecution` without an address.** `MOMENT_STATUSES` is **not** expanded to express address readiness — address completeness is a property of the brief, not of the Moment.
- **An Execution Brief cannot be confirmed until its address is complete.**
- An operator **may override the address for one Execution Brief**, with a required reason, provenance and timestamp.
- **An operational override never updates the Workspace `Person`.** Not automatically, not eventually, not as a background reconciliation.
- Updating a Person's default address **requires explicit customer action in Workspace**.
- **Previewing an address or a brief writes nothing.**
- Correcting an already-confirmed brief **preserves the original**, creates a revision, supersedes the applicable Decision, and appends a precise Operational Event — `ExecutionBriefAddressOverridden`.
- Missing-address recovery **names the problem and provides a clear Workspace action**.

## Decision

### The address object

A **minimum structured address**, not a free-text blob. Structure is what makes "incomplete" a decidable question rather than a judgement call.

| Field | Required | Notes |
|-------|:---:|-------|
| `line1` | ✅ | Street address |
| `city` | ✅ | — |
| `countryCode` | ✅ | ISO 3166-1 alpha-2, uppercase — the same convention as `Person.country` |
| `line2` | — | Optional |
| `stateOrRegion` | — | Optional |
| `postalCode` | — | Optional. Deliberately not required: postal codes are unreliable or absent across much of Aniyé's operating footprint |
| `landmark` | — | Optional. Carries real delivery weight in markets where addressing is descriptive rather than numbered |
| `deliveryInstructions` | — | Optional free text — gate codes, reception details, preferred hours |

**"Complete" means `line1`, `city` and `countryCode` are all present and non-empty.** Nothing else.

### Where the address lives at each stage

| Stage | Holder | Owner | Mutability |
|-------|--------|-------|------------|
| Configuration | `Person.deliveryAddress` | **Customer** | Edited freely in Workspace |
| Execution | `ExecutionBrief.deliveryAddressSnapshot` | **Aniyé Operations** | Fixed at brief generation; changed only by a recorded override |

**An Execution Brief contains a `deliveryAddressSnapshot`.** It is a snapshot for the same reason `policyResolutionSnapshot` is one (Atlas §15e): the brief must still explain where the gift was sent after the customer edits the Person record. A reference would let history rewrite itself.

### The override path

An operator who finds an address wrong does **not** fix the customer's data. They override it for the brief in front of them, and the customer's record is left alone for the customer to correct.

1. The override is recorded on **that one brief**, with `reason`, provenance and timestamp.
2. `Person.deliveryAddress` is **unchanged** — ADR-005: Operations reads and proposes, it never writes configuration.
3. The customer's own correction, when it comes, is an explicit Workspace action.

This satisfies the checkpoint's intent while keeping the ADR-005 boundary intact. The checkpoint's `AddressUpdated` event name is **superseded** by `ExecutionBriefAddressOverridden`, which says what actually happens: a brief was overridden, not a customer record updated.

### Correcting a confirmed brief

Per ADR-006 — supersession, never mutation:

- The original brief content is **preserved**.
- A **revision** is created.
- The applicable Decision is **superseded**; its original text is never altered.
- An `ExecutionBriefAddressOverridden` Operational Event is **appended**.

### Missing-address recovery

Doctrine §1.8 — no dead ends. A brief blocked on a missing address must name the problem and link to the Workspace page that fixes it, in the same shape `MomentIssue.href` already established (`lib/operations/types.ts`). Operations links out; it never edits.

## Why not the alternatives

**Free-text address.** Cheapest to add, and it makes "is this complete?" undecidable — the exact question milestone 4's completion test depends on. It also cannot be validated, compared, or later handed to a courier API without re-parsing prose.

**Operations writes the Person record directly.** Breaks ADR-005 at its first real test. It also silently overwrites data the customer believes they control, and the customer would learn of the change only by noticing it.

**A new Moment status for "address incomplete".** Rejected explicitly. `MOMENT_STATUSES` stops at generation by design (Atlas §15e) — statuses are added only by the object that produces them, and address readiness is produced by the brief. Adding it to the Moment would put an execution-stage concern into a generation-stage enum.

**Address on the Moment's `RecipientSnapshot`.** A Moment is generated before anyone looks at an address; snapshotting one at generation would freeze a value nobody had reviewed, and the operator's correction would then have nowhere to live.

## Consequences

- **Workspace schema v6 → v7, additive.** `Person.deliveryAddress?`. No backup required — the same shape as the v3 → v4 step. **Not implemented yet.**
- **`OperationsState` v1 → v2, additive**, when the Execution Brief collection lands. Versioned independently of the workspace chain (ADR-010).
- A v1 workspace must still walk **v1 → v2 → v3 → v4 → v5 → v6 → v7**, one rung at a time.
- New Operational Event type `ExecutionBriefAddressOverridden`. New Decision type for the override, carrying the required reason.
- Post-migration validation must refuse: a confirmed brief with an incomplete `deliveryAddressSnapshot`; an override with no reason; a mutated original after revision.
- CSV import gains optional address columns. **Not in this record** — it follows the v7 field and needs no further decision.

## Unresolved, deliberately

- **Address verification or geocoding.** No decision. Not required for the first closed loop, and a provider choice is not an architecture decision.
- **Multiple addresses per Person** (home vs office). One default only. Revisit when operational evidence shows it is needed, not before.
- **Whether a courier-corrected address re-enters the system.** No courier has access, and none may be given access while Operations runs on browser storage (ADR-010).

## Relationship to earlier decisions

Extends **ADR-005** by settling the first concrete case where Operations needs data the customer owns: it proposes and overrides locally, and never writes across the boundary. Applies **ADR-006**'s supersession rule to brief revisions. Sits inside **ADR-010**'s persistence split — the Person field is Workspace, the snapshot and the override are Operations.

## Supersedes

The checkpoint's Part 2 step 6 `AddressUpdated` Operational Event, replaced by `ExecutionBriefAddressOverridden`. The checkpoint text is otherwise unchanged.
