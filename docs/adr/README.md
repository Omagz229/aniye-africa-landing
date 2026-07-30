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
| [ADR-004](ADR-004-program-definition.md) | Program is an operational commitment | **Accepted** | 2026-07-27 |
| [ADR-005](ADR-005-workspace-operations-boundary.md) | Workspace and Operations are separate surfaces | **Accepted** | 2026-07-27 |
| [ADR-006](ADR-006-decision-vs-operational-event.md) | Decisions vs Operational Events | **Accepted** | 2026-07-27 |
| [ADR-007](ADR-007-money-and-financial-spine.md) | Money as integer minor units | **Accepted** | 2026-07-27 |
| [ADR-008](ADR-008-person-lifecycle.md) | Person has three lifecycle states | **Accepted** | 2026-07-27 |
| [ADR-009](ADR-009-policy-lifecycle.md) | Policy lifecycle stays three states | **Accepted** | 2026-07-27 |
| [ADR-010](ADR-010-operational-persistence-boundary.md) | Operational records live outside WorkspaceState | **Accepted** | 2026-07-27 |
| [ADR-011](ADR-011-recipient-address.md) | Recipient address is customer-owned; operator overrides are per-brief | **Accepted** | 2026-07-28 |
| [ADR-012](ADR-012-fulfilment-lifecycle-and-proof-recording.md) | Fulfilment lifecycle and the proof-receipt boundary | **Accepted** | 2026-07-30 |

**ADR-012 resolves OPS-U4a** (the Fulfilment lifecycle and proof-receipt boundary) and explicitly
**defers OPS-U4b** (QA, adjudication and disputes) with a recorded trigger. See
[`../RELATIONSHIP_OPERATIONS_ATLAS.md`](../RELATIONSHIP_OPERATIONS_ATLAS.md) §9 for the source-scoped
unresolved register.

Every accepted record carries the **Council conditions** attached at acceptance. Those conditions are
binding and in several cases narrow the original draft — ADR-004 most notably, where a Program now
targets exactly one Relationship Group rather than several.

## Implementation status

Acceptance and implementation are not the same thing. This column is the quick answer; the record
itself is the authority.

| ADR | Implemented |
|-----|-------------|
| ADR-001 | ✅ Yes — H2.3 / H2.4 |
| ADR-002 | ✅ Yes — schema v2 |
| ADR-004 | ⚠️ Partly — Campaign mode only, schema v6. Recurring and Triggered not implemented |
| ADR-005 | ⚠️ Partly — H3.1. Separate route tree, shell and navigation exist. **No roles, no authentication** |
| ADR-006 | ⚠️ Partly — H3.1. Decisions and Events exist for Moment generation only |
| ADR-007 | ⚠️ Partly — Money implemented, schema v5. `RecognitionOrder` deferred to H3.7 |
| ADR-008 | ✅ Yes — schema v5 |
| ADR-009 | ✅ Yes — no code change was required |
| ADR-010 | ✅ Yes — H3.1, `OperationsState` v1 (now v2) |
| ADR-011 | ✅ Yes — H3.2, Workspace schema v7 + `OperationsState` v2 |
| ADR-012 | ⬜ **No — accepted, not implemented.** H3.6 has not begun. `OperationsState` remains v5 |

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
