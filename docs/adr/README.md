# Architecture Decision Records — drafts

> **Nothing in this directory is Accepted.**
>
> ADR-001 and ADR-002 are *accepted* and live in [`../ANIYE_SYSTEM_ATLAS.md`](../ANIYE_SYSTEM_ATLAS.md) §18,
> where the Atlas is the authority. This directory holds **drafts only** — proposals awaiting Council
> review, kept out of the Atlas precisely so the Atlas never claims a decision that has not been made.

## Status vocabulary

| Status | Meaning |
|--------|---------|
| **Proposed** | Written up with options and a recommendation. Not decided |
| **Council Review Required** | Proposed, and blocking implementation until reviewed |
| **Accepted** | Decided. Moves into Atlas §18; the draft here is deleted |
| **Rejected** | Decided against. Kept for the reasoning |

## Current drafts

All six come from the [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md), which holds
the full analysis — current implementation, Atlas position, conflict, options, trade-offs, and
implications. These files carry the proposed wording only.

| ADR | Title | Status | Blocks Programs |
|-----|-------|--------|-----------------|
| [ADR-004](ADR-004-program-definition.md) | Program is an operational commitment | Council Review Required | ✅ |
| [ADR-005](ADR-005-workspace-operations-boundary.md) | Workspace and Operations are separate surfaces | Council Review Required | Decision only |
| [ADR-006](ADR-006-decision-vs-operational-event.md) | Decisions vs Operational Events | Council Review Required | Decision only |
| [ADR-007](ADR-007-money-and-financial-spine.md) | Money as integer minor units | Council Review Required | ✅ **Hard prerequisite** |
| [ADR-008](ADR-008-person-lifecycle.md) | Person gains an Inactive state | Council Review Required | ✅ |
| [ADR-009](ADR-009-policy-lifecycle.md) | Policy lifecycle stays three states | Council Review Required | Decision only |

**ADR-003 is deliberately unused.** The recovery ledger reserved it for a "Decision Engine" that the
lost implementation apparently had. The analysis in this checkpoint concluded that no such object is
needed: `resolvePolicyAssignment()` already performs policy resolution, and the recording of
judgements is ADR-006's `Decision` object. Reusing the number would imply a decision that was never
made. If a genuine Decision Engine emerges later, it takes a new number.
