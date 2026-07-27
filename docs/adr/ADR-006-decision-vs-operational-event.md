# ADR-006 — Decisions and Operational Events are distinct, and recorded only on confirmation

**Status: Proposed — Council Review Required**
**Date drafted:** 2026-07-27
**Full analysis:** [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md#decision-c--decision-versus-operational-event)

> Not accepted. Do not implement until the Council has reviewed this decision.

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
