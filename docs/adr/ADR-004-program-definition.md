# ADR-004 — Program is an operational commitment, not a policy container

**Status: Accepted**
**Date drafted:** 2026-07-27
**Date accepted:** 2026-07-27 — Council
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-a--what-a-program-is)

> Accepted by Council on 2026-07-27, subject to the conditions recorded below.

## Council conditions on acceptance

Binding for the first Program version:

- **One Program targets exactly one Relationship Group.** This narrows the draft, which proposed `relationshipClassIds: UUID[]`. The field becomes singular `relationshipClassId`. Multi-group programs are achieved by creating one Program per group, which keeps population, budget and reporting unambiguous.
- A Program **does not store `policyAssignmentId`**.
- A Program **does not carry one universal policy snapshot**.
- Each **Moment** resolves its applicable assignment and policy from the Program's Relationship Group and the **Person's country**, and the resolved assignment *and* policy are snapshotted onto that Moment.
- **Campaign** population **freezes at activation**.
- **Recurring** and **Triggered** populations are re-evaluated according to their configured cadence or trigger.

## Decision

A **Program** takes a defined population and a defined occasion and commits the organization to recognizing them over a defined period or trigger pattern, within a budget envelope.

A Program references **relationship groups, never a Policy Assignment**. Policy resolution occurs at Moment generation using the recipient's country, and the resolved policy is snapshotted onto the **Moment**.

Programs have three modes:

- **Recurring** — date-derived from a Person field; population re-evaluated continuously
- **Triggered** — event-derived; population evaluated at trigger time
- **Campaign** — fixed window; population **frozen at activation**

Program status: `Draft / Active / Paused / Completed / Cancelled`.

## Why not the alternative

Pinning a `policyAssignmentId` to a Program contradicts ADR-001. Country-scoped assignments exist so one group can be governed by different rules in different countries; a Program-level policy snapshot would silently apply one country's rule to everyone. It is also brittle — deactivating that assignment would break a running Program.

## Consequences

- New `programs` collection; additive schema bump.
- `Moment` gains `programId` and `policySnapshot`.
- Program-level `configurationSnapshot` and `reportingPeriod` are deferred.
- Reuses `resolvePolicyAssignment()`, already built and validated.

## Supersedes

Amends Atlas §4 Program: `momentType` becomes plural `momentTypes`; `policySnapshot` moves from Program to Moment; `status` loses `Preview` and `Approved` and gains `Paused`.
