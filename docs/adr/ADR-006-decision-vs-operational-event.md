# ADR-006 — Decisions and Operational Events are distinct, and recorded only on confirmation

**Status: Accepted**
**Date drafted:** 2026-07-27
**Date accepted:** 2026-07-27 — Council
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-c--decision-versus-operational-event)

> Accepted by Council on 2026-07-27, subject to the conditions recorded below.

## Council conditions on acceptance

- Draft choices **remain in UI state**. They are not persisted.
- **Only confirmation writes**, and it writes all three together: the state change, a `Confirmed` Decision, and the corresponding Operational Event.
- Browsing and abandoned selections are **never** persisted as Decisions.
- The first operational version needs only two statuses: **`Confirmed`** and **`Superseded`**.

## Decision

A **Decision** records a judgement between alternatives. It carries a required `reason`, may be **superseded**, and is **never mutated**.

An **OperationalEvent** records that something happened. It is **append-only**, never edited, and is corrected only by appending a referencing event.

Test: *could it have gone another way, and does the reason matter later?* If yes, Decision. If not, Event.

- Deterministic rule results are Decisions with `provider: System` — a policy resolution had alternatives.
- Ordinary CRUD is audit, not an Operational Event. The test is whether it changes the state of a Moment's execution.
- Failed actions are first-class Events, never absences.
- Early H3 uses **only `Confirmed` and `Superseded`** decision statuses.

## The recording rule

> Draft in the interface → the user confirms → **one transaction** writes the state change, the Decision, and the Operational Event together.

Browsing is not persisted. Abandoned selections are not persisted. Comparing four vendor offers produces **one** `VendorSelection` Decision, at confirmation.

## Explicitly rejected

The lost pattern of recording `GiftSelection` and `GiftSubstitution` the moment an item was clicked. It turns the audit trail into a record of mouse movement, burying the judgements that matter.

`Proposed` and `Cancelled` statuses are omitted: an unconfirmed proposal is UI draft state, and `Cancelled` is indistinguishable from `Superseded` in practice.

## Consequences

- Two new objects in the **Knowledge** domain (Atlas §3), not the Relationship Engine.
- Both are operational records that belong in a backend, not the client-side workspace document.

> ✅ **[ADR-016](ADR-016-recurring-and-triggered-program-generation.md) (accepted 2026-08-19) extends
> the Operational Event model** into a discriminated union — a Moment-scoped variant (today's exact
> shape) and a new Program-scoped `ProgramGenerationRun` variant, which carries `programId` instead
> of a fabricated `momentId`. The append-only, never-edited guarantee this ADR establishes is
> unchanged for both variants; only the concrete shape gains a second case. **Governed, not yet
> implemented** — `OperationalEvent` in code still has one shape, with `momentId` required.
