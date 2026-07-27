# ADR-008 — Person has three lifecycle states

**Status: Accepted**
**Date drafted:** 2026-07-27
**Date accepted:** 2026-07-27 — Council
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-e--person-lifecycle)

> Accepted by Council on 2026-07-27, subject to the conditions recorded below.

## Council conditions on acceptance

- Person lifecycle is **`Active` | `Inactive` | `Archived`**.
- **Inactive** people are retained and remain visible in the directory, and are **excluded from automatic Program populations**.
- No existing person is automatically converted to `Inactive` by migration.

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
