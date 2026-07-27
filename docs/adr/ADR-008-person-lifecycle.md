# ADR-008 — Person has three lifecycle states

**Status: Proposed — Council Review Required**
**Date drafted:** 2026-07-27
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-e--person-lifecycle)

> Not accepted. Do not implement until the Council has reviewed this decision.

## Decision

| State | In directory | In automatic Program populations | In historical reporting |
|-------|:---:|:---:|:---:|
| **Active** | ✅ | ✅ | ✅ |
| **Inactive** | ✅ | ❌ | ✅ |
| **Archived** | ❌ | ❌ | ✅ |

Presented to users as **Active / Paused / Archived**.

Person state governs **future eligibility only** and is never retroactive — Moments already executed remain valid and reportable.

## Why the third state now

H2.5 reduced this to two states on the reasoning that `Inactive` and `Archived` expressed the same thing. That was correct at the time: with no Programs, "excluded from automatic population" had no meaning.

Programs creates that meaning. Without `Inactive`, an administrator whose employee is on twelve months' leave must choose between hiding them from the directory or continuing to send them gifts. Neither is right.

The doctrine test — *do not create a lifecycle state unless it has distinct behaviour* — now passes where it previously failed.

## Consequences

- `Person.status` union widens; schema v5, **additive**, no data transform.
- Required before Programs: population selection is the core of ADR-004, and `Active` is its predicate.
- HRIS *suspended* maps to `Inactive`; HRIS *removed* maps to `Archived` (Atlas §12 already forbids auto-delete).

## Supersedes

The two-state reduction made in H2.5, recorded as compromise **P7** in the recovery ledger.
