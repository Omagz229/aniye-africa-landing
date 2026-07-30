# H3.5 → H3.6 Governance Checkpoint

> ## ✅ Decided by Council, 2026-07-30 — all five questions closed
>
> This document was prepared as a **review**. It has since been **decided**. Section 7 records the
> rulings; the analysis above it is preserved as the reasoning they were taken on, quoting sources as
> they read at the time — including the bare `U4` that the Council has since qualified.
>
> **Where a *Recommendation* below differs from the ruling, the ruling wins.** One did: question Q5
> was recorded at **four** missing delivery fields, not three.
>
> | | |
> |---|---|
> | Prepared at | `4c16f0c1ed78cf0bf8e8cdef1c080d8b6ec8d272` |
> | Decided | 2026-07-30 — Council |
> | Produced | [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) |
> | Status after decision | **H3.5 complete · H3.6 not begun · Workspace v7 · `OperationsState` v5** |
>
> **Review-only. No application code, schema, migration or validation was changed** to produce this
> document or to record the decisions in it.

**Every statement below carries one of three labels:**

| Label | Meaning |
|---|---|
| **Repository-confirmed** | Verified in a named file, or reproduced by running code, during this review |
| **Unresolved** | No decision exists. It must be settled before implementation, not inferred |
| **Recommendation** | This reviewer's judgement. Not approved, and not to be treated as approved |

---

## 1. Scope

The Council asked for four questions to be resolved before H3.6 — Fulfilment tracking. A fifth was
**discovered during this review** and is included because it gates H3.6 directly and is the same
class of defect the Council has already ruled on once.

| # | Question | Reviewer's verdict | **Council ruling** |
|---|---|---|---|
| Q1 | "Every operating country" vs the implemented "every confirmed delivery country" | Reword, or fund a country model | ✅ **Reworded.** No country model |
| Q2 | **OPS-U4** — QA/exception, failed-delivery, redelivery, proof and dispute taxonomy | Split it. ADR needed for part | ✅ **Split.** ADR-012 accepted; OPS-U4b deferred |
| Q3 | May H3.6 store proof in the browser prototype? | Defer the file, keep the record | ✅ **Metadata only.** No file |
| Q4 | Malformed-container gaps in H3.3 and H3.4 | Confirmed. One scoped correction | ✅ **Recorded as pending.** Lands before v6 |
| Q5 | **Discovered:** `proofRequired` never reaches Operations | Three fields; decide before more Moments generate | ✅ **Accepted at four fields** |

> ⚠️ **The bare `U4` used in this document's original Q2 was itself part of the collision the Council
> resolved.** It meant the Operations Atlas question — now **`OPS-U4`**. See §7 E.

---

## 2. Evidence inspected

**Repository-confirmed.** Files read or executed during this review:

| Area | Source |
|---|---|
| Country capture | `app/components/assessment/steps/StepOrganization.tsx:56`, `lib/assessment.ts:6`, `lib/scoring.ts:17` |
| Country storage | `lib/workspace.ts:124` (`operatingCountries: string[]`), `:502` `SUPPORTED_CURRENCIES`, `:513` `TIMEZONES` |
| Coverage implementation | `lib/operations/couriers.ts` — `courierCoverage()`, `coverageGaps()` |
| Fulfilment proposals | `H2_H3_ARCHITECTURE_CHECKPOINT.md` Part 2 rows 10–11, Part 3 milestone 8 |
| Fulfilment object | `ANIYE_SYSTEM_ATLAS.md` §4 *Fulfillment*, §13, `:1264` |
| Pilot gate | `docs/adr/ADR-010-operational-persistence-boundary.md:41`, `:50` |
| U4 text | `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 |
| Policy proof fields | `lib/workspace.ts:221–222`, `app/components/workspace/PolicyForm.tsx:56–57, 570–577, 617–618` |
| Snapshot contents | `lib/operations/types.ts` — `PolicyResolutionSnapshot` |
| Container gaps | `lib/operations/selection.ts`, `vendor-selection.ts`, `local-store.ts` — **reproduced by execution** |

---

## Q1 — "Every operating country" versus confirmed delivery countries

### What the completion test says

**Repository-confirmed.** Checkpoint Part 3 milestone 7: *"a courier is selectable for every
operating country, or the gap is named."*

### What "operating country" actually is

**Repository-confirmed, and this is the crux.** It is a **free-text marketing field**, not an
operational one:

- Captured in the assessment as a single text input, placeholder `"Nigeria, Ghana, Kenya"`, with the
  hint *"Separate multiple countries with commas"* (`StepOrganization.tsx:56`).
- Split naively on commas and newlines — `raw.split(/[,\n]+/).map(s => s.trim())` (`lib/scoring.ts:17`).
- Stored as `operatingCountries: string[]` of **names** (`lib/workspace.ts:124`).
- **No validation, no normalisation, no canonical list, and no name-to-code mapping exists anywhere
  in the repository.** Confirmed by inspection of `workspace.ts`, `assignments.ts`, `people.ts`,
  `money.ts` and `migrations.ts`.

Every delivery country in Operations is **ISO 3166-1 alpha-2** — `Person.country`,
`DeliveryAddress.countryCode`, `PolicyAssignment.countryCode`, `Courier.countryCode`.

So a user may type `"Nigeria"`, `"nigeria"`, `"NG"`, `"Nigeria & Ghana"` or `"West Africa"`, and
nothing in the system can turn any of it into `NG` without a table that does not exist.

### What H3.5 implemented

**Repository-confirmed.** `courierCoverage()` measures against the **ISO codes on confirmed
Execution Briefs** — every country deliveries are actually going to, how many briefs are heading
there, and how many active couriers carry there. Gaps are named with the country code in them.

### The options

| | Option | Cost | Consequence |
|---|---|---|---|
| **A** | **Reword the completion test** to "every country with a confirmed delivery" | None | The measure is already implemented and is strictly stronger operationally |
| **B** | Build a country model — pinned ISO table, structured `operatingCountries`, migration | **Workspace schema v8**, a new migration, assessment UI change, back-fill of existing free text | H2 configuration work landing inside H3, for a question briefs already answer |
| **C** | Hybrid — keep brief coverage as the operational signal, additionally surface unmatched declared names as advisory | Moderate | Two coverage numbers that can disagree, with no way to reconcile them |

### Recommendation

**Recommendation: Option A.** Reword the completion test.

The reasoning is not convenience. Brief-based coverage is **better evidence**, in both directions:

- A country the organization *declares* but has never shipped to needs no courier — funding one
  there is waste driven by a marketing form.
- A country it *does* ship to must have a courier **whether or not anyone listed it** — and only the
  brief-based measure catches that case.

Option B is defensible if the Council wants pre-emptive coverage planning, but it is an **H2 schema
change** (`operatingCountries` is customer configuration), it needs its own ADR, and it does not make
H3.6 more correct. It should not be smuggled into an H3 milestone.

> ⚠️ **Whichever option is chosen, one document must change.** The checkpoint's completion test and
> the H3.5 record currently describe different measures. **Unresolved** until the Council picks one.

---

## Q2 — U4: the QA, failure, redelivery, proof and dispute taxonomy

### What U4 says

**Repository-confirmed.** `RELATIONSHIP_OPERATIONS_ATLAS.md` §9:

> **U4 — Exception and QA taxonomy** — what counts as a QA exception, who adjudicates, what the
> customer is told. 🟠 **Blocks H3.6.** `QAException` appears only as a proposed Decision name in
> checkpoint Part 2. **No taxonomy survives.** It is first needed at delivery confirmation.

### What the checkpoint proposes

**Repository-confirmed**, and it is thinner than it looks:

| Step | Decision | Event |
|---|---|---|
| 10 · Fulfilment tracked | `Redelivery` / `Escalation` **on failure** | `Dispatched`, `DeliveryFailed` |
| 11 · Delivery confirmed | `QAException` **if disputed** | `Delivered`, `ProofReceived` |

Atlas §4 `Fulfillment.status` proposes `Pending / Confirmed / Dispatched / Delivered / Failed /
Returned`. Milestone 8 excludes **courier webhooks** — so every state is recorded by an operator by
hand, exactly as items, vendors and couriers are.

> ⚠️ Atlas §4's `Fulfillment` field list is marked **"draft, not specification"** by
> `RELATIONSHIP_OPERATIONS_ATLAS.md` §3, with H3.6 named as the milestone that must re-issue it. The
> `Gift / Item` draft turned out wrong on **every field** when H3.3 built it. Do not implement
> against that list as written.

### The distinction the Council should draw

**Recommendation.** U4 bundles two questions that have different urgency, and treating them as one
blocks H3.6 unnecessarily:

| | Question | Needed for H3.6? |
|---|---|---|
| **U4a — lifecycle** | What states exist, what a failure is, how redelivery is recorded | **Yes.** The completion test is *"a failed delivery followed by redelivery produces a complete, ordered event history with no mutation"* — unanswerable without it |
| **U4b — adjudication** | What counts as a QA exception, **who adjudicates**, **what the customer is told** | **No.** All three presuppose a second party. There is **no customer-facing Moment view, no customer audit trail and no authentication** (ADR-010, ledger U8). There is nobody to dispute *with* |

**U4a needs an ADR before H3.6 starts.** The minimum it must settle:

1. The terminal and non-terminal states, and whether `Returned` is distinct from `Failed`.
2. Whether a failed delivery is an **Event only** or also a **Decision**. *(ADR-006's test: could it
   have gone another way, and does the reason matter later? A courier failing is an occurrence —
   Event. An operator choosing to redeliver rather than cancel is a judgement — Decision.)*
3. Whether redelivery **appends to the same Fulfilment** or creates a second one. *(Atlas §15e and
   ADR-006 both favour appending; a second record would make "the fulfilment" ambiguous, exactly as
   two live briefs would have.)*
4. Whether `Escalation` exists at all in H3.6, given there is no role model to escalate **to** (U1).

**U4b should be deferred explicitly**, and recorded as deferred rather than left open — it becomes
real at H4.0/H4.1 when customer-facing visibility exists. Building a dispute taxonomy now would
encode an unmade decision about a conversation that cannot yet happen.

> **Unresolved.** U4a requires an ADR. U4b requires a Council decision to defer.

---

## Q3 — May H3.6 store proof in the browser prototype?

### What ADR-010 says

**Repository-confirmed**, `ADR-010-operational-persistence-boundary.md`:

- Line 41 — `| File storage | None | Secure, access-controlled (proof of delivery) |`
- Line 50 — *"**Secure file storage**, before proof of delivery exists."*

Atlas `:1462` repeats it: *"secure file storage before proof of delivery exists."*

Atlas §4 `Fulfillment.proofUrl` is typed `string?` — *"Photo, signature, or document"*. **A URL
presupposes storage that does not exist.**

### The options

| | Option | Assessment |
|---|---|---|
| **A** | **Record proof, store no file** — capture *that* proof was received, through which channel, when, and who confirmed it. No image, no document, no URL | Stores nothing, so ADR-010's storage gate is not engaged |
| **B** | Store the file as a data URI in `localStorage` | **Reject.** Quota is ~5MB total for the entire workspace; no access control; a courier's photo of someone's home sitting in a browser store anyone with devtools can read and rewrite |
| **C** | Defer H3.6 entirely until the backend exists | Blocks the closed loop on infrastructure that is not scheduled |

### Recommendation

**Recommendation: Option A — defer the file, keep the record.**

It satisfies milestone 8's completion test in full. That test is *"a failed delivery followed by
redelivery produces a complete, ordered event history with no mutation"* — it is about **event
history**, not about pixels. `ProofReceived` as an Event with a channel, a timestamp and an actor is
a complete record of the occurrence; the artefact is a separate concern.

Option B is not a shortcut, it is a different and worse thing. ADR-010 already states that *anyone
with devtools can rewrite the audit trail* — adding a recipient's home photograph to that store
crosses from "prototype with weak guarantees" into holding personal data with none.

> **The Council should also decide the honest customer-facing consequence.** Atlas §15b promises the
> customer *"Confirmation + curated proof"*. Under Option A the confirmation exists and the curated
> proof does not. That is a **known, recorded gap**, not a silent one — and it is a second, separate
> reason the pilot gate binds where ADR-010 puts it.

**Unresolved** until the Council rules. Recommendation is A, with the customer-facing gap recorded.

---

## Q4 — Malformed-container gaps in H3.3 and H3.4

### Verified, not assumed

**Repository-confirmed by execution.** I built the malformed submissions and ran them against the
shipped code at `4c16f0c`. **11 of 14 probes threw an exception instead of returning a refusal.**

| Boundary | Submission | Result |
|---|---|---|
| `verifyItemSelection` | `write = null` | **Threw** — destructured before checking |
| | `decision = null` | **Threw** on `decision.decisionType` |
| | `inputs = null` | **Threw** on `inputs.briefId` |
| | `payload = null` | Refused — but only because an earlier check bailed first |
| `commitItemSelection` | `write` / `decision` / `event` = `null` | **Threw** on all three |
| `verifyVendorSelection` | `write = null` | **Threw** — destructured `offers` before checking |
| | `decision = null` | **Threw** on `decision.decisionType` |
| | `inputs = null` | **Threw** on `inputs.briefId` |
| | `offers = null` | Refused — shadowed by an earlier check |
| `commitVendorSelection` | `write` / `decision` = `null` | **Threw** on both |
| | `offers = null` | Refused — shadowed |

**Zero storage writes occurred throughout.** So the exposure is **crash-not-refusal**, not data
corruption: no malformed submission can write. But a thrown exception returns no `StoreResult`, names
no recovery, and leaves the operator unable to say whether anything was written — which is precisely
what the `StoreResult` boundary exists to guarantee.

The three "refused" cases are **shadowed, not safe**: they bail at an earlier check and would throw
if reached, exactly as the H3.5 payload case did before H3.5-D1.

### Root cause

**Repository-confirmed.** Both modules define their own `extraKeys(value, allowed)`, which returns
`[]` for `null`, `undefined` and primitives — correctly, since they have no keys. An exact-key check
therefore *passes* a malformed container straight through to the property reads beneath it.

H3.5-D1 already exported `isPlainRecord` from `lib/operations/types.ts` for exactly this.

### Recommendation

**Recommendation: one scoped correction, `H3.3/H3.4-D1`**, applying the H3.5-D1 pattern to both
boundaries:

1. Gate `write`, `decision`, `event` — and `offers` for vendors — with `isPlainRecord` at the top of
   both `commit*` operations and both `verify*` functions.
2. Gate `decision.inputs` and `event.payload` before extra-key checks or property access.
3. Use each module's existing review-again recovery language.
4. **Do not weaken TypeScript types** to accommodate malformed callers.
5. Add refusal tests asserting, together: **no throw**, the named recovery, zero writes, and
   byte-identical collections — plus a counterweight proving honest submissions still commit.

Expected: `selection` and `vendors` suite totals rise; **lint must stay at exactly 47 (26 errors, 21
warnings)**; no UI, route or schema change.

> **Consider also** consolidating the three duplicate `extraKeys` implementations into one shared
> helper that refuses non-records at source. That would make the class of defect unreachable rather
> than fixed three times — but it touches three milestones' code, so it is a Council call, not an
> implementation one.

---

## Q5 — Discovered: `proofRequired` never reaches Operations

**This was not on the Council's list. It is included because it gates H3.6 directly, and because it
gets worse every day it is not decided.**

### What is repository-confirmed

The customer **can already require proof**, and is told so:

- `RecognitionPolicy.proofRequired: boolean` and `signatureRequired: boolean` (`lib/workspace.ts:221–222`).
- Both are editable toggles in `PolicyForm` (`:570`, `:577`).
- Both are shown back in the Review step: *"Proof of delivery — Yes, photo or document required"* and
  *"Signature required — Yes, recipient signs on delivery"* (`:617–618`).

And **none of it reaches Operations.** `PolicyResolutionSnapshot` carries exactly nine fields:
`policyAssignmentId`, `policyId`, `policyName`, `policyVersion`, `resolvedCountryScope`,
`occasionType`, `approvedRecognitionBudget`, `excludedCategories?`, `resolvedAt`.

A grep of `lib/operations/` for `proofRequired`, `signatureRequired` and `deliveryRequirement`
returns **nothing**.

### Why this is urgent rather than merely open

This is **the same defect the Council already ruled on at H3.3** — `excludedCategories` was likewise
configurable, likewise promised to the customer, and likewise never snapshotted.

And the same recovery argument applies, which is what makes it time-sensitive:

> `PolicyForm.save()` writes an edited policy back to the **same `id` at the same `version`**,
> including when publishing (`PolicyForm.tsx:299–318`). So `policyId` + `policyVersion` can never
> prove what `proofRequired` held at generation.

**Every Moment generated between now and the fix is permanently unable to answer "was proof
required?"** — and H3.6 is the milestone that will need to ask.

### Recommendation

**Recommendation.** Extend `PolicyResolutionSnapshot` with the delivery constraints H3.6 needs —
`proofRequired`, `signatureRequired`, and `deliveryRequirement` — as **optional** fields, following
H3.3's precedent exactly:

- One additive `OperationsState` rung (**v5 → v6**), inventing nothing on existing records.
- Absent must keep meaning **"nobody recorded this"**, never `false`. Defaulting to `false` would
  read as *"the customer did not require proof"* — a silent, confident falsehood that could close a
  Moment without the proof its governing rule demanded.
- Historical records lacking it **block proof capture** with a named explanation and a recovery, as
  pre-H3.3 records block item selection.

Deciding this **before** H3.6 starts, rather than during it, means the migration lands once.

> **Unresolved.** Requires a Council decision. It is additive and low-risk, but it is a change to a
> canonical snapshot and therefore structural.

---

## 3. Data and migration consequences

| Question | Schema effect |
|---|---|
| Q1 Option A | **None** |
| Q1 Option B | **Workspace v8** — structured `operatingCountries`, a pinned country table, back-fill of existing free text. Destructive if it rewrites the field |
| Q2 U4a | Likely **`OperationsState` v6+** when `Fulfillment` lands — decided by the ADR, not here |
| Q3 Option A | **None** — no file, no field |
| Q4 | **None** — runtime guards only |
| Q5 | **`OperationsState` v5 → v6**, additive, invents nothing |

> If Q5 and U4a are both accepted, they should be **sequenced deliberately** — snapshot extension
> first, as its own rung, so the Fulfilment rung is not carrying two unrelated changes.

**Unchanged by everything above:** Workspace **v7**, the v1 → v5 chain, unknown-key preservation,
reads never rewriting storage, and every existing record.

---

## 4. What H3.6 may not do, whatever is decided

**Repository-confirmed constraints**, carried forward:

1. **No courier webhooks, no tracking APIs, no rate APIs** — checkpoint milestones 7 and 8.
2. **No second party gets access** while Operations runs on browser storage (ADR-010).
3. **Nothing is recorded until confirmation**; one atomic transaction; append-only (ADR-006).
4. **Vendor cost, courier cost, margin and internal notes never cross into Workspace** (ADR-005).
5. **`MOMENT_STATUSES` stays at three.** Fulfilment stages belong to the Fulfilment object, not the
   Moment — Atlas §15e, and the rule that has held since H3.1.
6. **U3 — merchant of record — still binds at H3.7**, not H3.6.
7. **Atlas §4's `Fulfillment` field list is a draft.** H3.6 re-issues it; it does not implement it.

---

## 5. Acceptance criteria for the decisions

Testable, so the Council can tell whether its ruling was implemented:

| # | Criterion |
|---|---|
| Q1 | Exactly one coverage measure is described in the checkpoint, the roadmap and the Operations Atlas — and it matches `courierCoverage()` |
| Q2 | An accepted ADR names the fulfilment states, whether failure is Event-only, and how redelivery is recorded. U4b is recorded as deferred with its trigger |
| Q3 | The completion test passes with **no file stored anywhere**, and the customer-facing proof gap is recorded in the Atlas rather than implied |
| Q4 | Every malformed container returns a named refusal, throws nothing, writes nothing, and leaves collections byte-identical — proven for both boundaries, with honest submissions still committing |
| Q5 | A Moment generated after the change carries the delivery constraints; one generated before it **blocks** proof capture with a named recovery; the migration invents nothing |

---

## 6. Recommended next action

**Recommendation**, in this order:

1. **Council rules on Q1, Q3 and Q5** — each is a short decision with a clear recommendation, and
   none needs new analysis.
2. **Raise the U4a ADR** (fulfilment lifecycle). Record **U4b as deferred**, with "customer-facing
   Moment visibility exists" as its trigger.
3. **Implement `H3.3/H3.4-D1`** — the container correction. It is independent of every other decision
   here, carries no schema change, and closes verified correctness debt.
4. **Implement the Q5 snapshot extension** if accepted, as its own rung, before H3.6 generates more
   Moments.
5. **Then, and only then, begin H3.6.**

Steps 3 and 4 can proceed in parallel with the U4a ADR; step 5 cannot.


---

## 7. Council decisions — 2026-07-30

**These are the rulings. Everything above is the reasoning they were taken on.**

### A · H3.5 country coverage

**The implemented operational authority is accepted.** The H3.5 completion test is rewritten to:

> *"A courier is selectable for every country represented by a current confirmed Execution Brief, or
> the gap is named."*

`WorkspaceState.operatingCountries` **remains a free-text assessment and marketing field. It is not
operational country authority.** No normalization, no name-to-code mapping, no canonical country
collection, **no Workspace v8**. A future country model requires its own milestone and its own
architecture review.

### B · ADR-012 — accepted

[ADR-012 — Fulfilment lifecycle and the proof-receipt boundary](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md),
**Accepted 2026-07-30**. One Fulfilment per Moment; no persisted `Pending` or draft; created only on
confirmed initial dispatch; exactly three states; initial dispatch and delivery invent **no**
Decision; failure is **not** Event-only because the current state must identify that redelivery is
required; **`Redelivery` is the only Decision** and requires a human reason; `ProofReceived` follows
`Delivered` and is **not a status**; Decisions immutable and Events append-only, with the Fulfilment
holding current state and the ordered Event history holding historical truth. `Returned`,
`Escalation`, `QAException`, dispute adjudication, courier webhooks and tracking integrations are
**excluded**. ADR-006 continues to govern.

### C · Proof storage

**H3.6 records receipt metadata and stores no proof file.** `ProofReceived` may record only proof
kind (**`Photo` · `Document` · `Signature`**), channel/source, actor, `occurredAt`/`recordedAt`, and
the identifiers binding it to the Fulfilment and Moment.

**It must not store** image or document bytes, a URL pretending the file is durable, a data URI,
base64, Blob content, or recipient-home photographs and other proof content in `localStorage`.

The operator experience **must say honestly** that the prototype records that proof was received and
does not retain the evidence file. *"Confirmation + curated proof"* is corrected to **future accepted
architecture**, not delivered by the metadata-only H3.6 prototype. Secure, access-controlled file
storage remains mandatory before actual proof files exist and before the external pilot.

### D · The former Operations U4, split

**OPS-U4a** — lifecycle and proof recording — **resolved by ADR-012**.
**OPS-U4b** — what constitutes a QA exception, who adjudicates, how disputes are resolved, what the
customer is told — **deferred**. **H3.6 must not introduce `QAException` or a dispute path.**

The present single-operator internal prototype has **no second party with whom to adjudicate a
dispute**. OPS-U4b becomes blocking at the earliest of: a customer-facing delivery, proof or
exception view; a customer-visible operational audit trail; any second party submitting or disputing
delivery evidence; **H4.0** customer-facing Moment visibility; or the external pilot.

### E · The identifier collision, resolved

Unresolved identifiers are **source-scoped, preserving provenance**, and **nothing was renumbered**:
**`CP-U1 … CP-U4`** for checkpoint open questions, **`LEDGER-C2` / `LEDGER-C5`** for ledger conflicts
previously numbered U5/U6 in the roadmap register, and **`OPS-U1 … OPS-U10`** for Operations Atlas
§9 — with `OPS-U4` split into `a` and `b`. The collision is documented in
[`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md) §9 and the Master Roadmap's
*Unresolved* register.

### F · Policy-resolution snapshot defect — **four** fields

**Accepted, and widened.** This review identified three; the Council records **four**:
`deliveryRequirement`, `preferredDeliveryWindow`, `signatureRequired`, `proofRequired`.

A **separate additive `OperationsState` v5 → v6 migration** captures all four on newly generated
Moments. Existing Moments are **not** backfilled. Absence means *"not recorded when this Moment was
prepared"* and must **never** default to `Standard`, an empty delivery window, or `false`. H3.6 must
**refuse** a legacy Moment lacking required delivery context with a named recovery rather than infer
current policy state — policy id + version cannot recover the history, because the policy is edited
in place at the same id and version.

> **`OperationsState` remains v5.** v6 is planned and **must not be reported as landed**.

### G · H3.3/H3.4 malformed-container correction

**Recorded as pending.** `commitItemSelection` / `verifyItemSelection` and `commitVendorSelection` /
`verifyVendorSelection` must apply the exported **`isPlainRecord`** pattern **before destructuring or
property access**. H3.4 must additionally establish that **`offers` is an array** and that **each
newly submitted offer is a plain record** before exact-key or field checks.

**Independent, no schema change, and it must land before the v5 → v6 migration.**

---

## 8. State after this decision

| | |
|---|---|
| **H3.5** | ✅ Complete |
| **H3.6** | ⬜ **Not begun.** Governance resolved |
| **Workspace schema** | **v7** |
| **`OperationsState`** | **v5** — v6 planned, **not landed** |
| **Must land before H3.6** | 1 · H3.3/H3.4 container correction 2 · policy-snapshot v5 → v6 |
| **Still deferred** | Actual proof-file storage · OPS-U4b adjudication |

---

*H3.5 → H3.6 Governance Checkpoint — Aniyé Africa — 30 July 2026*
*Prepared as review-only; decided by Council 2026-07-30. No code, schema, migration, validation, route or UI changed at any point.*
*Basis: commit `4c16f0c`, Workspace schema v7, `OperationsState` v5, System Atlas v3.9, Master Roadmap v1.6, Relationship Operations Atlas v1.6, ADR-001 … ADR-011.*
*Q4 and Q5 were verified by executing the shipped code, not by reading it.*
