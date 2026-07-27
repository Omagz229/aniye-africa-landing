# ADR-004 — Program is an operational commitment, not a policy container

**Status: Proposed — Council Review Required**
**Date drafted:** 2026-07-27
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-a--what-a-program-is)

> Not accepted. Do not implement until the Council has reviewed this decision.

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
