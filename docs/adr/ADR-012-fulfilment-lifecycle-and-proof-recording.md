# ADR-012 — Fulfilment lifecycle and the proof-receipt boundary

**Status: Accepted**
**Date drafted:** 2026-07-30
**Date accepted:** 2026-07-30 — Council
**Full analysis:** [H3.5 → H3.6 Governance Checkpoint](../H3_5_H3_6_GOVERNANCE_CHECKPOINT.md) · historical context in [H2 → H3 Architecture Checkpoint](../H2_H3_ARCHITECTURE_CHECKPOINT.md) Part 2 rows 10–11 and Part 3 milestone 8

> Accepted by Council on 2026-07-30. This record resolves **OPS-U4a** and explicitly defers
> **OPS-U4b**.
>
> **Implementation note, 2026-07-30:** the separate policy-resolution snapshot prerequisite has
> landed at `OperationsState` **v6**. It adds no Fulfilment and does not implement this ADR; H3.6
> remains not begun.

## Context

Checkpoint Part 3 milestone 8 requires *"dispatch → delivered → proof, with failure and redelivery
paths"*, with the completion test *"a failed delivery followed by redelivery produces a complete,
ordered event history with no mutation"*. It excludes courier webhooks.

Three things stood in the way, and this record settles all three.

**First, no taxonomy survived.** The Operations Atlas recorded the exception and QA question as
unresolved — `QAException` exists only as a proposed Decision name in checkpoint Part 2, with no
definition of what qualifies, who adjudicates, or what the customer is told. Treated as one
question, it blocked the whole milestone.

**Second, Atlas §4's `Fulfillment` field list is a draft, not a specification.** It proposes six
statuses (`Pending / Confirmed / Dispatched / Delivered / Failed / Returned`), a `trackingUrl` and a
`proofUrl`. The Operations Atlas §3 already marks that list as needing re-issue by the milestone that
builds it. The `Gift / Item` draft turned out wrong on **every field** when H3.3 built it; this list
is treated the same way.

**Third, `proofUrl` presupposes storage that does not exist.** ADR-010 lists **secure file storage**
among the four mandatory pilot prerequisites, specifically *"before proof of delivery exists"*. A URL
field implies a durable, access-controlled artefact. The prototype has no such thing, and
`localStorage` is emphatically not one.

## Council conditions on acceptance

Binding for the first Fulfilment version:

- **One Fulfilment per Moment.** Never two.
- **No persisted `Pending` or draft Fulfilment.** An intention to dispatch is UI state, exactly as an
  unconfirmed brief, item or vendor choice is (ADR-006).
- **The Fulfilment is created only when initial dispatch is confirmed.**
- **Statuses are exactly three:** `Dispatched`, `DeliveryFailed`, `Delivered`. No others.
- **No Decision is invented where no judgement between alternatives occurred.**
- **Proof receipt is metadata only.** No file, no URL, no bytes.
- **`MOMENT_STATUSES` is not expanded.** Fulfilment state belongs to the Fulfilment.
- **Nothing is recorded until confirmation**, and each confirmation is one atomic transaction.

## Decision

### 1. The object

**One Fulfilment exists per Moment**, and it is **created only when initial dispatch is confirmed**.

There is **no persisted `Pending` and no draft**. A Moment with a courier chosen but nothing
dispatched simply has no Fulfilment — which is a fact the absence states plainly. Persisting a
`Pending` row would record an intention nobody confirmed, and ADR-006 has refused that at every
previous step: no `Draft` brief, no stored item browse, no saved vendor comparison.

### 2. The three states

| Status | Meaning |
|---|---|
| `Dispatched` | It is with the courier and in transit |
| `DeliveryFailed` | An attempt failed. **Redelivery is required** |
| `Delivered` | It reached the recipient |

`Pending`, `Confirmed` and `Returned` from the Atlas §4 draft are **not** implemented.
`Returned` in particular is deliberately absent: it describes an outcome nothing in H3.6 can act on,
and inventing a state no flow can leave is how speculative lifecycles accumulate.

### 3. The transitions

Each is **one atomic transaction** over a fully validated proposed state (ADR-006).

| # | Transition | From | Writes |
|---|---|:---:|---|
| 1 | **Initial dispatch** | *(no Fulfilment)* | Creates the Fulfilment at `Dispatched` · appends `Dispatched` |
| 2 | **Failed attempt** | `Dispatched` | Sets state to `DeliveryFailed` · appends `DeliveryFailed` |
| 3 | **Redelivery** | `DeliveryFailed` **only** | Records a **Confirmed `Redelivery` Decision** with a required human reason · sets state back to `Dispatched` · appends `Dispatched` carrying the **next attempt number** |
| 4 | **Delivery confirmation** | `Dispatched` **only** | Sets state to `Delivered` · appends `Delivered` |
| 5 | **Proof receipt** | `Delivered` **only** | Appends `ProofReceived` |

### 4. Why dispatch and delivery carry no Decision

**A Decision records a judgement between alternatives, with a reason that matters later** (ADR-006).

Confirming that a parcel went out, or that it arrived, is **not** such a judgement — there were no
alternatives. It is an occurrence. Recording it as a Decision would inflate the audit trail with
entries whose "reason" field could only ever be filler, and would make the genuine judgements harder
to find.

**Redelivery is different, and it does carry a Decision.** After a failure the operator can redeliver,
cancel, or escalate outside the system. Choosing to try again is a real choice between real
alternatives, and why it was made matters months later. It therefore requires a **human reason**,
exactly as every other Decision in this system does.

### 5. Why failure is not Event-only

An Event alone would leave the Fulfilment sitting at `Dispatched` while everyone involved knows the
attempt failed. **The current state has to be actionable**: an operator scanning the queue must be
able to see which jobs need redelivery without replaying the event history of each one.

So `DeliveryFailed` is both — the state changes *and* the Event is appended. The state answers "what
now?"; the history answers "what happened?".

### 6. Current state versus historical truth

> **The Fulfilment holds current state. The ordered Event history is the historical truth.**

A Fulfilment that has failed twice and been redelivered twice reads `Dispatched` — and its Event
history reads `Dispatched · DeliveryFailed · Dispatched · DeliveryFailed · Dispatched`, with attempt
numbers. **Nothing is mutated to produce that record**: Decisions remain immutable, Events remain
append-only and ordered, and the current-state field is a projection, never a substitute.

That is exactly what milestone 8's completion test asks for.

### 7. The proof-receipt boundary

**H3.6 records that proof was received. It stores no proof file.**

`ProofReceived` may record **only** structured metadata sufficient to say what was received:

| Recorded | Notes |
|---|---|
| Proof kind or kinds | Constrained to **`Photo`**, **`Document`**, **`Signature`** |
| Channel / source | How it reached Aniyé |
| Actor | Who recorded it |
| `occurredAt` and `recordedAt` | When it happened, and when Aniyé learned of it |
| Identifiers binding it to the Fulfilment and Moment | — |

**It must not store**, in any form:

- image or document **bytes**;
- a **URL** pretending the file is durable;
- a **data URI**;
- **base64**;
- **Blob** content;
- recipient-home photographs, or any other proof content, in `localStorage`.

**The reasoning is not merely ADR-010 compliance.** ADR-010 already states that anyone with devtools
can rewrite this audit trail. Adding a photograph of a recipient's home to that store would move the
prototype from *"weak guarantees on operational records"* to *"holding personal data with none"* —
a different category of risk, and one no completion test requires taking.

Milestone 8's test is about **ordered event history**, not about pixels. `ProofReceived` with a kind,
a channel, an actor and two timestamps is a complete record of the occurrence. The artefact is a
separate concern with a separate prerequisite.

**The operator experience must say so honestly** — that the prototype records that proof was
received and **does not retain the evidence file**. An interface implying otherwise would be worse
than one that stores nothing.

### 8. The customer-facing promise, corrected

Atlas §15b and checkpoint Part 2 row 11 promise the customer *"Confirmation + curated proof"*.

**That is future accepted architecture. The metadata-only H3.6 prototype does not deliver it.** The
confirmation exists; the curated proof does not, because the file does not exist to curate.

This is recorded rather than implied, and it is a second independent reason the pilot gate binds
where ADR-010 puts it. **Secure, access-controlled file storage remains mandatory before actual proof
files exist, and before any external pilot.**

## What this record does not decide

Deliberately out of scope, and **not** to be inferred from anything above:

- **What constitutes a QA exception**, who adjudicates it, how disputes are resolved, and what the
  customer is told. This is **OPS-U4b**, deferred — see below.
- `QAException` and any dispute path. **H3.6 must not introduce either.**
- `Returned` and `Escalation`. Escalation has no target: there is no role model (**OPS-U1**).
- **Courier webhooks and tracking integrations** — excluded by checkpoint milestone 8 in terms.
- **Where proof files will eventually live.** A storage provider is not an architecture decision.
- Commercial consequences of delivery. **CP-U3** binds at H3.7, not here.

### OPS-U4b — the deferral, and its trigger

The present system is a **single-operator internal prototype with no second party**. There is nobody
to adjudicate a dispute *with*: no customer-facing delivery view, no customer-visible audit trail, no
authentication, and no external party able to submit or contest evidence.

Building an adjudication taxonomy now would encode an unmade decision about a conversation that
cannot yet happen.

**OPS-U4b becomes blocking at the earliest of:**

1. a customer-facing delivery, proof or exception view;
2. a customer-visible operational audit trail;
3. any second party submitting or disputing delivery evidence;
4. **H4.0** customer-facing Moment visibility;
5. the external pilot.

## Consequences

**Persistence.** A `fulfilments` collection is additive to `OperationsState`. New Decision and Event
types are required — `Redelivery` as a Decision; `Dispatched`, `DeliveryFailed`, `Delivered` and
`ProofReceived` as Events. The exact schema rung is fixed by the milestone that implements it, **not
by this record**. At acceptance `OperationsState` was **v5**; the separate prerequisite snapshot
correction subsequently moved it to **v6** without adding a Fulfilment.

**Ordering with prerequisite work.** At acceptance, two corrections were required **before** H3.6
implementation. Both have since landed, in this order:

1. The **H3.3/H3.4 malformed-container correction** — verified, independent, no schema change.
2. The **policy-resolution snapshot `v5 → v6` migration** — four missing delivery fields, without
   which H3.6 cannot know whether proof was even required.

**Interface honesty.** The operator surface must state that proof files are not retained.

## Relationship to earlier decisions

Applies **ADR-006** throughout: nothing recorded until confirmation, one atomic transaction per
confirmation, Decisions immutable, Events append-only, and a Decision only where a genuine judgement
occurred. Sits inside **ADR-010**'s persistence split and honours its file-storage prerequisite by
storing no file. Preserves **ADR-005** — no fulfilment detail crosses into Workspace beyond the
status the customer is entitled to see. Leaves **ADR-007** untouched; delivery records no money.

## Supersedes

- Atlas §4's draft `Fulfillment` status enum (`Pending / Confirmed / Dispatched / Delivered / Failed /
  Returned`), replaced by the three states above.
- Atlas §4's `proofUrl` field, replaced by metadata-only `ProofReceived` for the H3.6 prototype.
- Checkpoint Part 2 row 10's `Escalation` Decision and row 11's `QAException` Decision, **deferred**
  rather than replaced — they return with OPS-U4b.

The historical checkpoint text is **not rewritten**. It stands as the record of what was proposed;
this ADR is the record of what was decided.
