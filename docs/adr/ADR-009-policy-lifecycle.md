# ADR-009 — Recognition Policy lifecycle is Draft → Published → Archived; approval is a record, not a state

**Status: Proposed — Council Review Required**
**Date drafted:** 2026-07-27
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-f--recognition-policy-lifecycle)

> Not accepted. Do not implement until the Council has reviewed this decision.

## Decision

| State | Meaning |
|-------|---------|
| **Draft** | Editable. Not assignable, does not resolve. Simulation may run against it |
| **Published** | Live and **immediately executable**. Assignable and resolvable |
| **Archived** | Withdrawn. Existing assignments preserved for history; not selectable for new ones |

Approval becomes a **requirement plus a record**, not a lifecycle state:

- A workspace setting `requiresPolicyApproval` gates publishing *(deferred until a customer needs it)*.
- When set, publishing requires an `Approval` object — itself a Decision under ADR-006.
- When unset, publishing is direct.

## Why `Preview` and `Approved` are rejected as states

**`Preview` is a presentation mode.** Nothing about a policy changes when previewed — no field differs, no behaviour differs, nothing waits on it. Simulation can run against a Draft. Making it a state forces every policy through a rung that does nothing.

**`Approved` is a governance fact.** Modelling it as a status forces every organization through an approval step. A three-person startup has no policy approver; a bank has three. An enum cannot express "required here, not there" — but `approvedBy` / `approvedAt` records the fact perfectly well without occupying the lifecycle.

## Consequences

- **No schema change.** The implemented `PolicyStatus` is already correct.
- Resolves conflict **C4** by amending Atlas §4 and §11 rather than the code.
- Archiving a policy never breaks in-flight Moments — they carry their own snapshot. New generation reports `no-executable-policy`, which `resolvePolicyAssignment()` already returns with the archived assignment listed under `skipped`. **This behaviour is built and validated today.**
- The `Approval` object, `requiresPolicyApproval`, and the role model are all deferred.
