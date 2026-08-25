# Architecture Decision Records — registry

> ADR-001 and ADR-002 live in [`../ANIYE_SYSTEM_ATLAS.md`](../ANIYE_SYSTEM_ATLAS.md) §18, where the
> Atlas is the authority. ADR-004 onward live here as full records.

## Status vocabulary

| Status | Meaning |
|--------|---------|
| **Proposed** | Written up with options and a recommendation. Not decided |
| **Council Review Required** | Proposed, and blocking implementation until reviewed |
| **Accepted** | Decided. Binding |
| **Rejected** | Decided against. Kept for the reasoning |
| **Retired** | Never accepted, and will not be revisited under this number |

## Registry

| ADR | Title | Status | Accepted |
|-----|-------|--------|----------|
| ADR-001 | Recognition Policy as a first-class reusable object | **Accepted** | Pre-recovery — Atlas §18 |
| ADR-002 | Relationship Type + numeric Relationship Level | **Accepted** | Pre-recovery — Atlas §18 |
| **ADR-003** | — | ⚠️ **Retired — never reconstructed** | See note below |
| [ADR-004](ADR-004-program-definition.md) | Program is an operational commitment | **Accepted · Partly amended by ADR-016** | 2026-07-27 |
| [ADR-005](ADR-005-workspace-operations-boundary.md) | Workspace and Operations are separate surfaces | **Accepted** | 2026-07-27 |
| [ADR-006](ADR-006-decision-vs-operational-event.md) | Decisions vs Operational Events | **Accepted** | 2026-07-27 |
| [ADR-007](ADR-007-money-and-financial-spine.md) | Money as integer minor units | **Accepted** | 2026-07-27 |
| [ADR-008](ADR-008-person-lifecycle.md) | Person has three lifecycle states | **Accepted** | 2026-07-27 |
| [ADR-009](ADR-009-policy-lifecycle.md) | Policy lifecycle stays three states | **Accepted** | 2026-07-27 |
| [ADR-010](ADR-010-operational-persistence-boundary.md) | Operational records live outside WorkspaceState | **Accepted** | 2026-07-27 |
| [ADR-011](ADR-011-recipient-address.md) | Recipient address is customer-owned; operator overrides are per-brief | **Accepted** | 2026-07-28 |
| [ADR-012](ADR-012-fulfilment-lifecycle-and-proof-recording.md) | Fulfilment lifecycle and the proof-receipt boundary | **Accepted · Implemented** | 2026-07-30 |
| [ADR-013](ADR-013-commercial-role-pilot-currency-and-recognition-order.md) | Commercial role, pilot currency and the RecognitionOrder financial model | **Accepted · Implemented** | 2026-07-30 |
| [ADR-014](ADR-014-moment-closure-memory-and-safe-timeline.md) | Moment closure, Memory ownership and the safe relationship timeline | **Accepted · Implemented** | 2026-07-31 |
| [ADR-015](ADR-015-production-persistence-authentication-and-tenant-isolation.md) | Production persistence, authentication and tenant isolation for H4.0 | **Accepted · Not implemented** | 2026-08-18 |
| [ADR-016](ADR-016-recurring-and-triggered-program-generation.md) | Recurring and Triggered Program generation | **Accepted · Not implemented** | 2026-08-19 |
| [ADR-017](ADR-017-customer-facing-moment-visibility-and-exception-handling.md) | Customer-facing Moment visibility and OPS-U4b exception handling | **Accepted · Not implemented** | 2026-08-19 |

**ADR-015 governs H4.0's backend slice** — production server-side persistence, authentication for
both customer administrators and internal operators, and enforced tenant isolation. Authorization is
a fixed two-type boundary (`CustomerAdministrator`, `InternalOperator`), not a granular role model —
**OPS-U1 remains open and unresolved by this ADR**. It does not close ADR-010's pilot gate: secure
proof-file storage stays a separate, unresolved prerequisite, and several implementation mechanics
(auth provider, database engine, deployment target, session lifecycle, access-grant administration)
require their own follow-up ADRs before implementation begins. See ADR-015 §4–§6 for the complete
boundary.

**ADR-016 resolves OPS-U6** (cadence, de-duplication window, `sourceKey` cycle) and **explicitly,
partially amends ADR-004** — `Cancelled` struck, `Archived` confirmed terminal, `Paused` added,
`Completed` preserved in the vocabulary with no automatic transition built. It reuses the Workspace
`timezone` field already accepted (correcting only its silent creation-time fallback), extends
ADR-006's Event model into a discriminated union to carry Program-level runs, and requires new
repository surface for per-candidate transactional commits — `createMoments`'s existing batch
behavior is explicitly not reused unchanged. See ADR-016 §1–§13 for the complete boundary.

**ADR-017 resolves OPS-U4b** — narrowly: no `QAException`, no dispute object, no in-app exception
flow. It builds exactly the customer-facing exposure `RELATIONSHIP_OPERATIONS_ATLAS.md` §6 already
accepted (Program summary, upcoming count, budget, item category, fulfilment status, the customer's
own charge, and the existing nine-field safe timeline), read-only and `CustomerAdministrator`-scoped
per ADR-015 §6, with no proof file, vendor/courier identity, cost, or margin ever crossing the
Workspace boundary. Proof-file delivery (ADR-010 gate 4) and policy approval (CP-U2) remain
unresolved and untouched. See ADR-017 §1–§4 for the complete boundary.

**ADR-013 resolves CP-U3 / OPS-U3 and CP-U4** — the commercial role and the first pilot currency — and
was **implemented at H3.7**.

**ADR-014 governs H3.8** — the terminal `Closed` Moment status, the eleven-field canonical `Memory`,
the nine-field safe timeline projection and the closure Event/Decision model. It was accepted before
implementation and is now **implemented at H3.8** without changing its approved boundary.

**ADR-012 resolves OPS-U4a** (the Fulfilment lifecycle and proof-receipt boundary), was implemented at H3.6, and explicitly
**defers OPS-U4b** (QA, adjudication and disputes) with a recorded trigger. See
[`../RELATIONSHIP_OPERATIONS_ATLAS.md`](../RELATIONSHIP_OPERATIONS_ATLAS.md) §9 for the source-scoped
unresolved register.

Every accepted record carries the **Council conditions** attached at acceptance. Those conditions are
binding and in several cases narrow the original draft — ADR-004 most notably, where a Program now
targets exactly one Relationship Group rather than several.

## Implementation status

Acceptance and implementation are not the same thing. This column is the quick answer; the record
itself is the authority.

> **Schema versions here are stated as of this revision.** Where an ADR *introduced* or *landed at* a
> version, that is said explicitly and the **current** version is given alongside it — a row reading
> "now vN" goes stale the moment the next rung ships, which is how ADR-010's row came to claim v2
> while the chain had reached v5. Current: **Workspace v7 · `OperationsState` v9**.

| ADR | Implemented |
|-----|-------------|
| ADR-001 | ✅ Yes — H2.3 / H2.4 |
| ADR-002 | ✅ Yes — schema v2 |
| ADR-004 | ⚠️ Partly — Campaign mode only, schema v6. Recurring and Triggered are **governed by ADR-016** (accepted 2026-08-19) but not implemented — Campaign's own behavior is unaffected |
| ADR-005 | ⚠️ Partly — H3.1. Separate route tree, shell and navigation exist. **No roles, no authentication** |
| ADR-006 | ✅ **Yes for the H3 execution loop — through H3.8.** Decisions and Events cover Moment generation, brief confirmation and address override, item selection, vendor selection, courier selection, the fulfilment lifecycle, commercial commitment and reconciliation, and closure. Closure correctly records no Decision because it is not a judgement between alternatives |
| ADR-007 | ⚠️ Partly — Money implemented, schema v5. `RecognitionOrder` deferred to H3.7 |
| ADR-008 | ✅ Yes — schema v5 |
| ADR-009 | ✅ Yes — no code change was required |
| ADR-010 | ✅ Yes — H3.1, **introduced `OperationsState` v1**. Current `OperationsState` is **v9** |
| ADR-011 | ✅ Yes — H3.2, **landed at** Workspace schema v7 + `OperationsState` v2. Current `OperationsState` is **v9** |
| ADR-013 | ✅ Yes — H3.7, **landed at `OperationsState` v8** (additive `recognitionOrders`). Every decision implemented without variance; `MerchantOfRecord` is a **platform and pilot posture, not a legal opinion**, and the professional confirmations still bind before any external pilot |
| ADR-012 | ✅ Yes — H3.6, **landed at `OperationsState` v7** (additive `fulfilments`). Every Council condition held; proof is metadata with **no file stored**. `QAException` and OPS-U4b adjudication remain deferred, and proof-file storage is still an ADR-010 pilot prerequisite |
| ADR-014 | ✅ **Yes — H3.8, landed at `OperationsState` v9** (additive `memories`). One atomic confirmation closes the Moment, writes one immutable Memory and appends one `MomentClosed` Event with no Decision; the Operations-only timeline is an exact nine-field safe projection. Workspace remains **v7** |
| ADR-015 | ⬜ **Not implemented — accepted 2026-08-18, governs H4.0's backend slice.** No server adapter, authenticated session, or enforced tenant-isolation check exists in code; `browserOperationsRepository()`/`getWorkspace()` are still called directly from client components. `OperationsState` stays **v9** and Workspace stays **v7** until implementation lands — server schema and migration chain are their own follow-up decision (ADR-015 §3, §6), not assumed equal to the client chain |
| ADR-016 | ⬜ **Not implemented — accepted 2026-08-19, governs Recurring and Triggered generation.** `IMPLEMENTED_PROGRAM_MODES` stays `['Campaign']`; no discriminated `Program` or `OperationalEvent` union, no per-candidate transactional operation, and no daily-cadence execution path exist in code. The Workspace `timezone` field (`lib/workspace.ts:126`) predates this ADR and needs no new migration for itself — only its silent `createWorkspace()` fallback changes on implementation. Workspace stays **v7** until the additive v7→v8 rung for the `Program` union and `Paused` lands |
| ADR-017 | ⬜ **Not implemented — accepted 2026-08-19, governs customer-facing Moment visibility and OPS-U4b.** No route exists under `app/workspace/` for Moments or a timeline; `lib/operations/timeline.ts`'s `listRecipientTimeline()` has only its existing Operations-only, single-`personId` consumer. `RELATIONSHIP_OPERATIONS_ATLAS.md` §6's "what the customer sees" table remains accepted specification until this lands |

---

## ⚠️ ADR-003 — retired, permanently

**ADR-003 is retired. The number is not reused and not renumbered.**

The recovery audit found a reference to an "ADR-003 — Decision Engine" among the milestones lost with
the previous development machine. No such record survived: not the decision, not the reasoning, not
the object it described. Only the number and a title.

It was never reconstructed, and the H2 → H3 Architecture Checkpoint concluded it should not be:

- Policy resolution already exists as `resolvePolicyAssignment()` in `lib/assignments.ts` — pure,
  documented, and covered by 20 validation checks.
- Recording judgements is [ADR-006](ADR-006-decision-vs-operational-event.md)'s `Decision` object.

Between them, nothing is left for a separate Decision Engine to own.

**Why the number stays empty.** Reusing 003 for an unrelated decision would make the historical
reference point at something that was never agreed, and would quietly imply that a lost proposal had
been accepted. An empty rung in the sequence is a smaller cost than a misleading one. If a genuine
Decision Engine is ever needed, it takes the next free number and argues its own case.

*Status: Retired — lost historical proposal, never reconstructed, never accepted.*
