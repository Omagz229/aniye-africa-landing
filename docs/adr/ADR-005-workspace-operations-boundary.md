# ADR-005 — Workspace and Operations are separate product surfaces

**Status: Accepted**
**Date drafted:** 2026-07-27
**Date accepted:** 2026-07-27 — Council
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-b--workspace-versus-operations)

> Accepted by Council on 2026-07-27, subject to the conditions recorded below.

## Council conditions on acceptance

- Workspace and Operations use **separate route trees, shells, roles and navigation**.
- Operations **may read** customer configuration and **may propose** corrections.
- Operations **must not silently modify** customer configuration. Any change originates from, or is accepted by, the customer.

## Decision

`/workspace/*` serves organization administrators configuring recognition.
`/operations/*` serves Aniyé internal operators executing it.

They share **canonical objects and a design system**. They share **neither shell, navigation, roles, nor route tree**.

- Operations holds **read-only** access to Workspace configuration and may **propose** changes, never write them.
- Vendor cost, courier cost, margin, vendor and courier identity, QA exceptions and internal notes **must never** be projected into Workspace.
- Internal users may open a **read-only** view of a customer workspace; it emits an Operational Event visible in the customer's own audit trail. No write-mode impersonation.
- Customer approvals cross the boundary as **objects**, not screens.

## Explicitly rejected

Placing Operations navigation inside `WorkspaceSidebar` — the pattern the lost implementation used. It leaks commercial data one conditional away from disclosure, conflates two audiences against Doctrine §1.7, obstructs multi-tenancy, and couples two very different release cadences.

## Consequences

- A separate `OperationsShell`; reusable components, separate access boundaries.
- Every canonical object carries an authoritative `workspaceId` once the backend lands.
- The boundary cannot be enforced client-side, which is an argument for the backend preceding any real Operations build.
