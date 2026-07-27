# H2 → H3 Architecture Checkpoint

> Prepared 2026-07-27 at commit `9c8e7d2`.
> **Documentation only.** No application code, domain model, or schema version was changed.
> Every recommendation below is **Proposed — Council Review Required**. Nothing here is implemented.
>
> Governing documents: [`ANIYE_SYSTEM_ATLAS.md`](ANIYE_SYSTEM_ATLAS.md) (what the platform is),
> [`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) (how it feels),
> [`RECOVERY_LEDGER.md`](RECOVERY_LEDGER.md) (reconstruction state).

---

## Why this checkpoint exists

H2 is complete: an organization can describe *who matters* (relationship groups), *how each group is recognized* (rules), *which rule reaches whom* (assignments), and *who the people are*. Every link in the Atlas §11 chain up to Program exists and is validated.

The next link is Program — and it is the point where the surviving architecture is least settled. Six decisions must be made before Programs can be designed without building on sand. Three of them (Money, Person lifecycle, Policy lifecycle) are pre-existing conflicts the recovery deliberately deferred; three (Program, Workspace/Operations, Decision/Event) have never been resolved at all.

**Reading note.** Each decision states the current implementation and the Atlas position separately, because they frequently disagree. Where they do, that disagreement is the decision.

---

## Decision A — What a Program is

### Current implementation

**None.** No `Program` type, no collection, no route. `SETUP_STAGES` lists `programs` with `available: false`, and the sidebar carries `built: false` so it can never be linked. `setupStage` can reach `'programs'`, at which point the checklist states honestly that the capability does not exist.

### Current Atlas position

Atlas §4 defines a Program with `momentType`, `status` (Draft / Preview / Approved / Active / Completed / Cancelled), `startDate`, `endDate`, `totalBudget`, `relationshipClassIds`, and a `policySnapshot` taken "at time of Approval".

### Unresolved conflict

Three problems, one of them a genuine contradiction:

1. **The Atlas never says what a Program *is*.** It lists fields without stating whether a Program is a schedule, a campaign, or a budget envelope. Moment generation depends entirely on that answer.

2. **`policySnapshot` at Program level contradicts ADR-001.** ADR-001 introduced country-scoped Policy Assignments precisely so that one relationship group can be governed by different rules in different countries. A single Program-level snapshot cannot represent that: a Program covering "Executive Leadership" spans Nigeria, Kenya and South Africa, and each resolves to a *different* policy. **Snapshotting at Program level would silently apply one country's rule to everyone.**

3. **The proposed field list carries the same contradiction.** The brief suggests `relationshipClassId` *and* `policyAssignmentId` on the Program. Pinning one assignment discards the resolution engine built in H2.4 and reintroduces exactly the multinational failure ADR-001 exists to prevent. It is also brittle: deactivating that assignment would break a running Program.

### Options

| Option | Description | Verdict |
|--------|-------------|---------|
| **A1 — Program pins one Policy Assignment** | `policyAssignmentId` on the Program; one policy for the whole run | ❌ Contradicts ADR-001. Breaks multinational programs. Brittle against assignment changes |
| **A2 — Program names a population; policy resolves per Moment** | Program carries `relationshipClassIds` + `momentType`; `resolvePolicyAssignment()` runs at Moment generation using the recipient's country; the resolved policy is snapshotted **onto the Moment** | ✅ **Recommended** |
| **A3 — Program is only a budget envelope** | Programs hold money; Moments generate independently from policies | ❌ Makes Program a synonym for budget. No answer to "when does recognition happen?" |
| **A4 — No Program object; Moments generate directly from assignments** | Skip the concept | ❌ Nothing to approve, budget, pause, or report on. Removes the customer's only operational control surface |

### Recommended decision — A2

> **A Program is a controlled operational commitment: it takes a defined population and a defined occasion, and commits the organization to recognizing them over a defined period or trigger pattern, within a budget envelope.**

The four objects separate cleanly:

| Object | Question it answers | Changes when |
|--------|--------------------|--------------|
| **Recognition Rule** *(Policy)* | What recognition is permitted or required? | The organization changes its standards |
| **Rule Assignment** *(Policy Assignment)* | Which group, and where, does that rule govern? | Coverage changes |
| **Program** | Is recognition actually running, for whom, when, and against what budget? | The organization starts, pauses, or ends an initiative |
| **Moment** | One person, one occasion, one execution | Reality |

**Program does not carry `policyAssignmentId`.** Policy resolution happens at Moment generation through the existing engine, using the recipient's country. This preserves ADR-001 and reuses code that is already built and validated (20/20 checks).

### Proposed Program fields

| Field | Required for first Programs? | Notes |
|-------|------------------------------|-------|
| `id` | ✅ | — |
| `workspaceId` | ✅ | Consistent with other canonical objects. Omitted in the client-side document, restored with the backend |
| `name`, `description` | ✅ | `description` optional |
| `momentTypes: string[]` | ✅ | One Program may cover several occasions (e.g. Birthday + Work Anniversary). Plural, unlike the Atlas's singular `momentType` |
| `relationshipClassIds: UUID[]` | ✅ | Population scope. **Not** a policy reference |
| `mode` | ✅ | `Recurring` / `Triggered` / `Campaign` — see below |
| `populationRule` | ✅ | How members are selected. Minimum: *all Active people in these groups*. Extended filters deferred |
| `startDate` / `endDate` | ✅ / optional | `endDate` null means open-ended (Recurring, Triggered) |
| `budgetEnvelope: Money` | ✅ | Ceiling for the whole Program. Blocks Moment generation when exhausted |
| `budgetConsumed: Money` | ✅ | Derived on read, **not stored** — same reasoning as `memberCount` (C3) |
| `status` | ✅ | `Draft` / `Active` / `Paused` / `Completed` / `Cancelled`. See note below |
| `approvalRequired`, `approvedBy`, `approvedAt` | Deferred | Depends on Decision F |
| `momentGenerationRule` | ✅ | Lead time and de-duplication window |
| `configurationSnapshot` | **Deferred** | See below |
| `reportingPeriod` | Deferred | Reporting is post-pilot |
| `createdAt`, `updatedAt`, `createdBy` | ✅ | — |

**On `status`:** the Atlas proposes six states including `Preview` and `Approved`. Recommend five: `Draft / Active / Paused / Completed / Cancelled`. `Preview` is a presentation mode, not a state (same argument as Decision F). `Paused` is added because it has genuinely distinct behaviour — stop generating Moments, keep existing ones running — which no other state expresses.

**On `configurationSnapshot`:** deferred deliberately. The authoritative snapshot lives on the **Moment**, because that is the only granularity at which country-scoped resolution produces one answer. A Program-level snapshot of the assignment *set* is useful for audit but is not required for the first loop, and adding it before the Moment-level snapshot exists would invite the A1 mistake.

### Program modes

| Mode | Trigger | Population evaluated | Ends |
|------|---------|---------------------|------|
| **Recurring** | A date derived from a Person field (`birthday`, `startDate`) | Continuously — someone added tomorrow is covered | Open-ended until paused |
| **Triggered** | An event (new hire, promotion, deal closure) | At trigger time | Open-ended until paused |
| **Campaign** | A fixed date or window | **Frozen at activation** — a snapshot of members | On `endDate` |

The distinction matters operationally: Recurring and Triggered re-evaluate their population, Campaign does not. A client appreciation campaign should not silently grow because someone was imported mid-run.

### Worked examples

**1. Employee Birthday Program**

| Aspect | Behaviour |
|--------|-----------|
| Population | All `Active` people in Employee groups (all levels) |
| Trigger | `Recurring` — `Person.birthday` (MM-DD) |
| Policy | Resolved per Moment: `resolvePolicyAssignment(classId, person.country)`. An executive in Lagos and one in Nairobi may draw different rules and budgets |
| Active period | `startDate` today, `endDate` null |
| Budget | Annual envelope. Each Moment consumes the per-person budget from the *resolved* rule. Generation stops when the envelope is exhausted |
| Moment generation | Nightly, 14 days ahead. De-duplicated per person per occasion per calendar year |
| Completion | Never "completes" — runs until paused. Reports per calendar year |

**2. New Hire Welcome Program**

| Aspect | Behaviour |
|--------|-----------|
| Population | People entering an Employee group |
| Trigger | `Triggered` — a Person is created or imported with `startDate` within the window |
| Policy | Resolved per Moment at trigger time |
| Active period | Open-ended |
| Budget | Envelope with a low expected burn; alerts rather than hard stops |
| Moment generation | On the triggering event, scheduled for the start date. Once per person, ever |
| Completion | Open-ended |

**3. Client Appreciation Campaign**

| Aspect | Behaviour |
|--------|-----------|
| Population | **Frozen at activation** — all Active people in VIP + Strategic Clients on the day it starts |
| Trigger | `Campaign` — a single date |
| Policy | Resolved per Moment at generation, using each client's country |
| Active period | Fixed window, e.g. 1–20 December |
| Budget | Hard envelope. Over-run blocks generation and raises an exception for an operator |
| Moment generation | All at activation, so the operator sees the full run before anything executes |
| Completion | `Completed` when every Moment reaches a terminal state or the `endDate` passes |

### Implications

- **Canonical objects affected:** new `Program`; `Moment` gains `programId` and `policySnapshot`.
- **Schema:** a new `programs` collection. Additive — the R1 migration foundation handles it as a routine bump.
- **Experience:** Programs must not be one large form. See Part 4.
- **Operations:** Campaign mode is the safest first build — a finite, reviewable set of Moments.
- **Before Programs:** the definition, modes, and the "resolve per Moment" rule.
- **Deferrable:** `configurationSnapshot`, `reportingPeriod`, extended population filters, approval fields.

### Proposed ADR wording

> **ADR-004 — Program is an operational commitment, not a policy container.**
> *Status: Proposed — Council Review Required.*
> A Program takes a defined population and a defined occasion and commits the organization to recognizing them over a defined period or trigger pattern, within a budget envelope. A Program references relationship groups, never a Policy Assignment: policy resolution occurs at Moment generation using the recipient's country, and the resolved policy is snapshotted onto the Moment. Program-level policy snapshots are rejected because they cannot represent the country-scoped assignments ADR-001 introduced. Programs have three modes — Recurring, Triggered, Campaign — distinguished by whether the population is re-evaluated or frozen at activation.

---

## Decision B — Workspace versus Operations

### Current implementation

One shell, one audience. `WorkspaceShell` → `WorkspaceSidebar` + `WorkspaceHeader`, with every route under `/workspace/*`. There is no role model, no authentication, and no internal-user concept. Route guards are stage-based (`isStageComplete`), not permission-based.

### Current Atlas position

Atlas §3 defines nine domains and states the Relationship Engine / Knowledge boundary. Atlas §16 anticipates roles (Owner / Admin / Manager / Viewer) and workspace permissions as H4–H5 work. **Neither describes an internal operator surface at all** — Atlas §13 describes concierge fulfilment as a manual process, not as a product surface.

### Unresolved conflict

The lost implementation reportedly placed Operations inside `WorkspaceSidebar`. That pattern is **explicitly rejected**, and the analysis is not close:

- **It leaks commercial data.** Vendor cost and margin sitting one nav item away from the customer's own view is a single conditional away from a disclosure incident.
- **It conflates audiences.** Doctrine §1.7 requires actor-specific simplicity. An operator's queue of exceptions is noise to an administrator, and an administrator's setup checklist is noise to an operator.
- **It makes multi-tenancy harder, not easier.** An operator works *across* organizations; an administrator works *within* one. One shell cannot express both without a tenant switcher that is meaningless to the customer.
- **It couples release cycles.** Operational tooling changes weekly under real fulfilment pressure; customer configuration should not.

No compelling counter-argument was found. The only genuine cost of separation is duplicated shell code, which is addressed below.

### Recommended decision

**Two separate product surfaces, sharing a design system and canonical objects but not navigation, shells, roles, or route trees.**

| | Workspace | Operations |
|---|-----------|------------|
| Route tree | `/workspace/*` | `/operations/*` |
| Shell | `WorkspaceShell` | `OperationsShell` (separate) |
| Audience | Organization administrators | Aniyé internal operators |
| Scope | One organization | Across all organizations |
| Owns | Profile, groups, rules, assignments, people, programs, customer-facing approvals and reports | Moments, Execution Briefs, item selection, vendor offers, courier selection, QA, fulfilment, exceptions, commercial detail, Decisions, Operational Events |

**Shared:** the canonical objects, the design system (buttons, dialogs, form controls, `ConfirmDialog`), and the Experience Doctrine. Components are reusable; **access boundaries and navigation are not**.

### Data visibility

| Data | Workspace | Operations |
|------|-----------|------------|
| Groups, rules, assignments, people, programs | Read + write | **Read only** |
| Moments — existence, occasion, recipient, status | Read (summary) | Read + write |
| Execution Brief | ❌ Never | Read + write |
| Item selection and substitution reasoning | Outcome only | Full |
| Vendor identity and offers | ❌ Never | Full |
| Courier identity and cost | ❌ Never | Full |
| **Vendor cost, courier cost, margin** | ❌ **Never** | Full |
| Approved budget, customer charge | Read | Read + write |
| QA exceptions, internal notes | ❌ Never | Full |
| Proof of delivery | Read (curated) | Full |

**The rule:** the customer sees *what happened and what it cost them*. Operations sees *how it happened and what it cost us*. Internal notes, vendor identity, and any cost that is not the customer's charge must never cross into Workspace — enforced at the projection layer, not by hiding fields in the UI.

### Further determinations

- **Operations may not modify Workspace configuration.** It may *propose* — an operator who spots a wrong address or a missing group raises a suggestion the administrator accepts. One-way write prevents "we fixed it for you" support incidents that the customer cannot audit.
- **Configuration is snapshotted into Moments** at generation (Decision A), so an operator always executes against the rules in force when the Moment was created, regardless of later configuration changes.
- **Multi-tenant isolation:** every canonical object carries `workspaceId`; Operations queries are explicitly cross-tenant and must be logged as such. The current client-side single-document model makes this structurally impossible today, which is one reason a backend precedes any real Operations build.
- **Impersonation:** internal users may open a **read-only** view of a customer workspace, which emits an `OperationalEvent` (`workspace.viewed_by_operator`) visible in the customer's own audit trail. No write-mode impersonation.
- **Customer approvals cross the boundary as objects, not screens.** An approval request created in Operations appears in Workspace as a first-class item with its own state; the customer's response is a Decision. Neither side renders the other's UI.

### Implications

- **Canonical objects:** no new ones; every object gains an authoritative `workspaceId` when the backend lands.
- **Schema:** none client-side. The boundary is meaningless until there is a server enforcing it.
- **Experience:** two shells means the Doctrine is applied twice, with different weightings — Operations is dense and keyboard-first; Workspace is calm and guided.
- **Before Programs:** the boundary *decision*, so Programs is built in `/workspace` with no operator affordances leaking in.
- **Deferrable:** the entire `/operations` surface until there are Moments to operate on.

### Proposed ADR wording

> **ADR-005 — Workspace and Operations are separate product surfaces.**
> *Status: Proposed — Council Review Required.*
> `/workspace/*` serves organization administrators configuring recognition; `/operations/*` serves Aniyé internal operators executing it. They share canonical objects and a design system, and share neither shell, navigation, roles, nor route tree. Operations holds read-only access to Workspace configuration and may propose changes but never write them. Vendor cost, courier cost, margin, vendor and courier identity, QA exceptions and internal notes must never be projected into Workspace. Placing Operations navigation inside the Workspace sidebar is rejected.

---

## Decision C — Decision versus Operational Event

### Current implementation

Neither object exists. The only decision-like logic in the codebase is `resolvePolicyAssignment()` (`lib/assignments.ts`), which is pure and returns a result — it records nothing.

### Current Atlas position

Atlas §3 draws the Relationship Engine / Knowledge boundary: "The Relationship Engine looks forward. Knowledge looks backward." Atlas §4 defines `Memory` as "what happened, when, to whom". Neither `Decision` nor `OperationalEvent` is defined.

### Unresolved conflict

The Atlas has one bucket ("Memory") for two very different things, and the distinction is load-bearing. Without it, one of two failures follows: either every judgement is lost (no way to answer "why did this person get that gift?"), or every click is persisted (an unreadable log where the signal is buried).

**The lost implementation reportedly recorded `GiftSelection` and `GiftSubstitution` the moment an item was clicked.** That is the second failure. An operator comparing four items generates four selection Decisions, three of which are immediately superseded — and the audit trail becomes a record of mouse movement rather than judgement.

### The distinction

> **A Decision records a judgement between alternatives. An Operational Event records that something happened.**

A useful test: *could it have gone another way, and does the reason matter later?* If yes, it is a Decision. If it is a fact with no alternative — a courier scanned a parcel — it is an Event.

| | Decision | OperationalEvent |
|---|----------|------------------|
| Answers | *Why is it this and not something else?* | *What happened, and when?* |
| Has alternatives | Yes | No |
| Can be superseded | Yes | **Never** |
| Carries a reason | Required | Not applicable |
| Volume | Low — tens per Moment | Higher — dozens per Moment |

### Recommended `Decision`

| Field | Required for first loop? | Notes |
|-------|-------------------------|-------|
| `id`, `workspaceId`, `momentId` | ✅ | — |
| `executionBriefId` | Optional | Null for pre-brief decisions such as qualification |
| `decisionType` | ✅ | `MomentQualification`, `PolicyResolution`, `BudgetResolution`, `BudgetException`, `ItemSelection`, `ItemSubstitution`, `VendorSelection`, `CourierSelection`, `Escalation`, `Redelivery`, `QAException` |
| `status` | ✅ | **`Confirmed` / `Superseded` only** — see below |
| `provider` | ✅ | `System` (deterministic rule) / `Operator` / `Customer` |
| `actorId` | Optional | Null when `provider: System` |
| `inputs` | ✅ | What was considered — the candidate set, the resolution query |
| `recommendation` | Optional | What the system suggested, when it suggested anything |
| `finalDecision` | ✅ | What was chosen |
| `reason` | ✅ | Why. Required even for system decisions, where it is the rule that fired |
| `overrideReason` | Conditional | **Required** when `finalDecision` differs from `recommendation` |
| `createdAt`, `confirmedAt` | ✅ | — |
| `supersededAt`, `supersededByDecisionId` | ✅ | Set when replaced. The original is never mutated or deleted |

**On statuses — recommend `Confirmed` and `Superseded` only for early H3.**

`Proposed` and `Cancelled` should not exist yet:

- A **proposal that was never confirmed is UI draft state**, not a record. Persisting it is exactly the noise problem above.
- **`Cancelled` is indistinguishable from `Superseded`** in practice — both mean "this is no longer the operative decision". Two words for one state invites inconsistent usage.

If a genuine need for a durable proposal appears — an operator recommending an item for customer approval — `Proposed` can be added then, with a real workflow behind it. Adding it speculatively guarantees it gets used for drafts.

### Recommended `OperationalEvent`

| Field | Required? | Notes |
|-------|-----------|-------|
| `id`, `workspaceId`, `momentId` | ✅ | — |
| `executionBriefId` | Optional | — |
| `eventType` | ✅ | `MomentCreated`, `BriefGenerated`, `AddressUpdated`, `VendorContacted`, `ItemPrepared`, `QACompleted`, `Dispatched`, `Delivered`, `ProofReceived`, `DeliveryFailed`, `MomentClosed` |
| `actorType` | ✅ | `System` / `Operator` / `Customer` / `Vendor` / `Courier` |
| `actorId` | Optional | — |
| `source` | ✅ | `Platform` / `WhatsApp` / `Email` / `Phone` / `Manual` / `VendorAPI` / `CourierAPI` |
| `payload` | ✅ | Event-specific, JSON |
| `occurredAt` | ✅ | When it happened **in the world** |
| `recordedAt` | ✅ | When Aniyé learned of it. The two differ constantly with external couriers |

### Clarifications

- **CRUD audit versus meaningful Events.** Editing a person's phone number is an audit entry, not an Operational Event. The test: *does it change the state of a Moment's execution?* Address changes qualify because they change what the courier does; a role correction does not. Ordinary CRUD belongs in the audit log Atlas §16 anticipates — a different, lower-value stream.
- **Deterministic rule results are Decisions.** `resolvePolicyAssignment()` returning a policy is a `PolicyResolution` Decision with `provider: System`. It had alternatives (the skipped assignments the engine already reports), and the reason matters when someone asks why a Kenyan executive got the global rule.
- **Failed actions are Events, not absences.** `DeliveryFailed` is a first-class event. A failure that is only visible as a missing success event is unqueryable.
- **External vendor and courier events** are recorded with `actorType: Vendor|Courier` and a `source` naming the channel, with `occurredAt` from the external system and `recordedAt` from Aniyé.
- **Ordering and immutability.** Events are append-only and ordered by `occurredAt`, with `recordedAt` breaking ties. Events are **never** edited.
- **Correcting an inaccurate event** is done by appending a correcting event that references the original, never by mutation. An event log that can be edited is not evidence.

### The recording rule

> **Draft in the interface → the user confirms → one transaction writes the state change, the Decision, and the Operational Event together.**

Browsing is not persisted. Abandoned selections are not persisted. Comparing four vendor offers produces **one** `VendorSelection` Decision, at confirmation. This directly reverses the lost pattern.

### Implications

- **Canonical objects:** two new — `Decision` and `OperationalEvent`. Both belong to the **Knowledge** domain (Atlas §3), not the Relationship Engine.
- **Schema:** both are operational records, not workspace configuration. They belong in the backend, not in the client-side workspace document. **This is a strong argument for the backend preceding a real Operations build.**
- **Experience:** the confirm-then-record rule is why `ConfirmDialog` already exists in E1 — the pattern is established.
- **Before Programs:** the *distinction* and the recording rule, so Moment generation emits the right records from day one.
- **Deferrable:** the full `decisionType` and `eventType` enumerations; start with the types the first loop actually produces.

### Proposed ADR wording

> **ADR-006 — Decisions and Operational Events are distinct, and are recorded only on confirmation.**
> *Status: Proposed — Council Review Required.*
> A Decision records a judgement between alternatives and carries a required reason; it may be superseded but never mutated. An Operational Event records that something happened; it is append-only, never edited, and is corrected only by appending a referencing event. Deterministic rule results are Decisions with `provider: System`. Ordinary CRUD is audit, not an Operational Event. Early H3 uses only `Confirmed` and `Superseded` decision statuses. Nothing is recorded until the user confirms: draft selections, browsing, and abandoned choices are never persisted as Decisions.

---

## Decision D — Money and the financial spine

### Current implementation

```ts
export interface Money {
  amount: number;   // face value: 500000 === NGN 500,000
  currency: string; // free-form string, not a validated code
}
```

`lib/workspace.ts:141`, with an in-code comment acknowledging the deviation. Used only in `RecognitionRule.budgetPerPerson`. **No arithmetic is performed on Money anywhere in the codebase today** — it is entered, stored, and displayed. That is the only reason the current representation has survived.

### Current Atlas position

Atlas §4 Money specifies the smallest currency unit (kobo, cents). The implementation contradicts it, recorded as conflict **C6** since the recovery audit.

### Unresolved conflict

C6 has been deferred through R1, R2 and R3 because nothing computed with money. **Programs ends that.** Budget envelopes, per-Moment consumption, vendor cost, courier cost and margin are all arithmetic, and floating-point face values will not survive it:

```
0.1 + 0.2 === 0.30000000000000004
```

Applied to a Program envelope consumed across hundreds of Moments, this drifts. Applied to margin, it is a reporting defect that compounds silently.

### Options

| Option | Description | Assessment |
|--------|-------------|------------|
| **D1 — Floating-point major units** *(current)* | `{ amount: 500000, currency: 'NGN' }` | ❌ Accumulation error; no safe equality; ambiguous precision. Survives only because nothing computes |
| **D2 — Integer minor units** | `{ amountMinor: 50000000, currency: 'NGN' }` — kobo | ✅ **Recommended.** Exact arithmetic within `Number.MAX_SAFE_INTEGER`; trivially comparable; the standard representation in payments |
| **D3 — Decimal string + ISO code** | `{ amount: '500000.00', currency: 'NGN' }` | Correct but requires a decimal library for every operation, or parsing on each use. Adds a dependency for a problem D2 solves with integers |

**On not optimizing for JavaScript convenience:** D1 is the JavaScript-convenient option, and it is wrong. D3 is arguably the most *correct* — arbitrary precision, self-describing — but every arithmetic operation becomes a library call, and the brief forbids new dependencies. D2 is exact for every realistic amount: `Number.MAX_SAFE_INTEGER` is ~9.007 × 10¹⁵, which in kobo is roughly ₦90 trillion. If Aniyé ever transacts near that, a bigint migration is a well-understood change.

### Recommended representation — D2

```ts
interface Money {
  /** Integer, in the currency's smallest unit. Never fractional. */
  amountMinor: number;
  /** ISO 4217 alpha-3, uppercase. Validated against a pinned table. */
  currency: CurrencyCode;
}
```

| Concern | Resolution |
|---------|-----------|
| **Currency codes** | ISO 4217 alpha-3, uppercase, validated. Same discipline as the alpha-2 country codes already enforced in `COUNTRY_CODE_PATTERN` |
| **Precision** | The exponent comes from a **pinned table**, in the same spirit as the schema-pinned constants in `lib/migrations.ts`. Not stored per record: a currency has one exponent, and storing it invites two records disagreeing about the same currency |
| **Zero-decimal currencies** | JPY, KRW, VND, RWF, UGX have exponent 0 — `amountMinor` *is* the major unit. The table handles this; hardcoding `× 100` anywhere does not |
| **Three-decimal currencies** | BHD, KWD, TND, JOD have exponent 3. Same table |
| **Rounding** | Only at conversion and division. Round **half away from zero** on customer-facing amounts, and record any residual explicitly rather than letting it vanish. Never round in intermediate steps |
| **Display formatting** | `Intl.NumberFormat` at the edge, from minor units + exponent. Never store formatted strings |
| **FX snapshots** | An exchange rate is a **fact at a time**, stored on the financial record: `{ from, to, rate, ratePrecision, source, capturedAt }`. Never re-derived retrospectively. The Atlas already requires the rate be locked at approval (§18 decision 1) |
| **Auditability** | Integers serialize exactly to JSON. A stored amount reads back byte-identical — untrue of floats |
| **Comparison** | `a.amountMinor === b.amountMinor && a.currency === b.currency`. Cross-currency comparison requires an explicit FX snapshot and is never implicit |

### Migration from the current representation

Schema **v4 → v5**, and it is genuinely destructive:

```
amountMinor = round(amount × 10^exponent(currency))
```

Every existing `RecognitionRule.budgetPerPerson` is a face value. NGN 500,000 becomes 50,000,000 kobo. The migration is deterministic, testable, and exactly the kind of transform the R1 foundation was built for — the same shape as the ADR-002 v1→v2 mapping. It must be marked `destructive: true` so the pre-migration payload is backed up.

**Free-form currency strings are a hazard.** Any stored `currency` not matching a pinned code fails post-migration validation, and the payload is quarantined rather than silently mangled. The seeded currencies (`NGN, KES, GHS, ZAR, USD`) are all exponent 2, so the realistic migration is a clean `× 100`.

### The minimum financial object

**Recommended name: `RecognitionOrder`.**

| Candidate | Assessment |
|-----------|------------|
| **Recognition Order** | ✅ Uses the platform's own domain language, spans both the commercial and the operational side, and is partially customer-showable — the customer legitimately sees *their* order |
| Fulfilment Order | Operations-only framing. Hides that this object also answers "what did we earn?", and would need a second object for the commercial view |
| Commercial Brief | Sounds like a document rather than a record with a lifecycle. Collides conceptually with Execution Brief |

One `RecognitionOrder` per Moment. It exists to answer six questions:

| Question | Field |
|----------|-------|
| What budget was approved? | `approvedBudget` |
| What did we estimate? | `estimatedTotalCost`, `estimatedCustomerCharge` |
| What did the vendor charge? | `actualVendorCost` |
| What did the courier charge? | `actualCourierCost` |
| What was the customer charged? | `actualCustomerCharge` |
| What did Aniyé earn? | `grossMargin` — **derived, never stored** |

**Required for the prototype:**

`id`, `workspaceId`, `momentId`, `executionBriefId`, `approvedBudget`, `estimatedItemCost`, `estimatedCourierCost`, `estimatedCustomerCharge`, `actualVendorCost`, `actualCourierCost`, `actualCustomerCharge`, `status` (`Draft / Committed / Reconciled / Cancelled`), `createdAt`, `updatedAt`.

**Deferred until operational evidence exists:**

`packagingCost`, `taxesAndDuties`, `serviceFee`, `contingency`, `actualOtherCosts`, `amountPaid`, `refundOrCredit`, `exchangeRateSnapshots` *(required only once a Program spans currencies)*, `reconciledAt`.

`grossMargin` is derived — `actualCustomerCharge − (actualVendorCost + actualCourierCost + actualOtherCosts)` — for the same reason `memberCount` is derived (C3): a stored total is a second source of truth that goes wrong the first time a cost is corrected.

**No payment gateway, invoicing, or accounting integration is proposed.** The prototype records what things cost. It does not move money.

### Implications

- **Canonical objects:** `Money` redefined; new `RecognitionOrder`.
- **Schema:** v4 → v5, destructive, backed up.
- **Experience:** operators and administrators still type "500000" — conversion happens at the edge. Nobody types kobo.
- **Before Programs:** **the Money migration must land first.** A budget envelope is arithmetic.
- **Deferrable:** `RecognitionOrder` itself until Execution Briefs exist; only Money is a Programs prerequisite.

### Proposed ADR wording

> **ADR-007 — Money is integer minor units with a validated ISO 4217 code.**
> *Status: Proposed — Council Review Required.*
> Money is `{ amountMinor: integer, currency: ISO4217 }`, where `amountMinor` is expressed in the currency's smallest unit. Exponents come from a pinned table supporting zero-, two- and three-decimal currencies; they are not stored per record. Formatting happens at the display edge, never in storage. Exchange rates are captured as dated snapshots on the financial record and never re-derived. Schema v5 migrates existing face values by the currency exponent and is marked destructive. The minimum financial object is `RecognitionOrder`, one per Moment, with gross margin derived rather than stored. No payment, invoicing or accounting integration is in scope.

---

## Decision E — Person lifecycle

### Current implementation

`Active | Archived` (`lib/migrations.ts:114`, pinned to schema v4). `peopleWithoutClass()` and `activeMemberCount()` count only `Active`; archived people are retained with every field and class reference intact and excluded from counts.

### Current Atlas position

Atlas §4 originally specified `Active / Inactive / Archived`. **R3 deliberately reduced this to two states and amended the Atlas**, on the reasoning that `Inactive` and `Archived` expressed the same thing. That reduction is recorded as compromise **P7** in the ledger.

### Unresolved conflict

The R3 reasoning was correct *at the time* — with no Programs, "excluded from automatic population" had no meaning, because there were no automatic populations. **Decision A creates that meaning.**

The concrete failure without a third state: an employee goes on twelve months' parental leave. The administrator does not want birthday gifts dispatched to an empty desk, but absolutely does not want the person hidden from the directory or erased from reporting. Today the only lever is `Archived` — which hides them. The administrator's real options are "remove them from view" or "keep sending gifts", and neither is right.

The doctrine test — *do not create a lifecycle state unless it has distinct behaviour* — is now **passed**, where in R3 it was not:

| State | In directory by default | In automatic Program populations | In historical reporting |
|-------|:---:|:---:|:---:|
| **Active** | ✅ | ✅ | ✅ |
| **Inactive** | ✅ | ❌ | ✅ |
| **Archived** | ❌ | ❌ | ✅ |

Three genuinely distinct behaviours, each with a real use.

### Recommended decision — restore `Inactive`

| Situation | State | Reasoning |
|-----------|-------|-----------|
| Employee on parental or extended leave | `Inactive` | Still an employee. Should not receive automatic recognition while away |
| Departed employee | `Archived` | No longer part of the organization; history preserved |
| Former client | `Archived` | Relationship ended |
| Temporarily paused relationship | `Inactive` | Deliberate, reversible pause |
| HRIS marks *suspended* | `Inactive` | Maps to a pause, not a departure |
| HRIS *removes* the record | `Archived` | Atlas §12 already says "never auto-delete" — archive is the correct landing state |
| Restoration | `Inactive → Active` | One click. Not destructive, no confirmation needed |
| Manual archiving | `Active/Inactive → Archived` | Confirmed, as E1 already implements |

**Moment history is unaffected by state.** A Moment executed while someone was Active remains valid and reportable after they are archived. Person state governs *future* eligibility only — it is never retroactive.

**Does schema v5 need to restore `Inactive` before Programs? Yes.** Population selection is the core of Decision A, and `Active` is the predicate it selects on. Shipping Programs with a two-state model forces administrators to archive people to exclude them, which is data-destructive in effect if not in storage — and it would then need a migration to unpick.

The migration is trivially additive: the status union widens, and no existing record changes. Only post-migration validation needs the wider set.

### Implications

- **Canonical objects:** `Person.status` widens.
- **Schema:** part of v5 — additive; no data transform.
- **Experience:** the People filter gains a third option; "Archive" gains a lower-consequence sibling ("Pause"). Human language: **Active / Paused / Archived** on screen, `Active / Inactive / Archived` in the model.
- **Before Programs:** yes.
- **Deferrable:** automatic transitions from HRIS events.

### Proposed ADR wording

> **ADR-008 — Person has three lifecycle states.**
> *Status: Proposed — Council Review Required.*
> `Active` — in the directory and eligible for automatic Program populations. `Inactive` — in the directory, retained and reportable, excluded from automatic populations. `Archived` — retained for history, hidden from ordinary workflows. The third state is justified by Programs: without it the only way to exclude someone from automatic recognition is to hide them. Person state governs future eligibility only and is never retroactive — Moments already executed remain valid. Presented to users as Active / Paused / Archived. This supersedes the two-state reduction made in H2.5 (ledger P7).

---

## Decision F — Recognition Policy lifecycle

### Current implementation

`Draft | Published | Archived` (`lib/workspace.ts:186`), with `EXECUTABLE_POLICY_STATUS = 'Published'` as the single executability gate (`lib/migrations.ts:93`). Only Published rules can be assigned or resolved. Recorded as conflict **C4**, deliberately preserved through R2 and R3.

### Current Atlas position

Atlas §4 and §11 specify `Draft → Preview → Approved → Published → Archived`, with approver id and timestamp recorded at Approve.

### Unresolved conflict

The Atlas lifecycle conflates three separate concerns into one enum:

1. **A viewing mode** (`Preview`)
2. **A governance record** (`Approved` — who signed off, when)
3. **An executability state** (`Published`)

Each analysed against the doctrine test:

**`Preview` is not a state.** Nothing about a policy *changes* when previewed — no field differs, no behaviour differs, and it is not a step anything waits on. Atlas §11 describes it as "locked for review; simulation of upcoming moments can be run". Simulation is a capability, and it can run against a Draft. Making it a state means every policy must pass through a rung that does nothing.

**`Approved` is a governance fact, not a status.** Modelling it as a status forces *every* organization through an approval step. A three-person startup does not have a policy approver; a bank has three. An enum cannot express "approval required here, not there" — and the field pair `approvedBy` / `approvedAt` records the fact perfectly well without occupying the lifecycle.

**Whether approval is required is an organizational setting, not a platform law.**

### Options

| Option | Assessment |
|--------|------------|
| **F1 — Adopt the Atlas five-state lifecycle** | ❌ Two of five states fail the distinct-behaviour test. Forces approval on organizations that do not want it |
| **F2 — Keep `Draft → Published → Archived`; model approval separately** | ✅ **Recommended** |
| **F3 — Keep three states, add nothing** | ❌ Leaves no way to record who signed off, which regulated customers will require |

### Recommended decision — F2

**Lifecycle: `Draft → Published → Archived`.**

| State | Meaning |
|-------|---------|
| **Draft** | Editable. Cannot be assigned, cannot resolve. Simulation may run against it |
| **Published** | Live and immediately executable. Assignable and resolvable |
| **Archived** | Withdrawn. Existing assignments are preserved for history; cannot be selected for new ones |

**Approval becomes a requirement plus a record, not a state:**

- The workspace carries `requiresPolicyApproval: boolean` *(deferred until a customer needs it)*.
- When set, publishing is gated by an `Approval` object — `{ id, subjectType, subjectId, requestedBy, approvedBy, approvedAt, decision, reason }`.
- When unset, publishing is direct. Most organizations, most of the time.
- An `Approval` is a **Decision** in the sense of Decision C: it has alternatives, it carries a reason, and it belongs in the audit trail.

**Answers to the specific questions:**

- **Is `Preview` a state?** No — a presentation mode. Simulation runs against Drafts.
- **Is `Approved` required before `Published`?** Only when the workspace requires it.
- **Is approval optional by organization?** Yes. That is the point.
- **Who may approve?** Deferred to the role model (Atlas §16). Until roles exist, the acting administrator, recorded by id.
- **Does `Published` mean immediately executable?** Yes — that is exactly what it means, and it is already what `EXECUTABLE_POLICY_STATUS` enforces.
- **Revisions and versions?** Unchanged from ADR-001: a new Draft derived from a Published policy via `parentPolicyId`; the Published version stays live until the new one publishes.
- **What do Programs snapshot?** Nothing at Program level (Decision A). Each **Moment** snapshots the resolved Published policy.
- **What if a policy is archived after a Program begins?** Nothing breaks. In-flight Moments hold their own snapshot and execute unchanged. New Moment generation resolves without it and reports `no-executable-policy` — which `resolvePolicyAssignment()` already returns, with the archived assignment listed under `skipped`. **This behaviour is built and validated today.**

### Implications

- **Canonical objects:** `PolicyStatus` unchanged — **C4 is resolved by amending the Atlas, not the code.** New `Approval` object, deferred.
- **Schema:** **none.** This decision requires no migration, which is a point in its favour.
- **Experience:** publishing stays one action. Approval, when configured, appears as a request-and-response pair rather than a state machine the operator must learn.
- **Before Programs:** the *decision*, so Programs snapshots against a settled model.
- **Deferrable:** the `Approval` object, `requiresPolicyApproval`, and the role model.

### Proposed ADR wording

> **ADR-009 — Recognition Policy lifecycle is Draft → Published → Archived; approval is a record, not a state.**
> *Status: Proposed — Council Review Required.*
> `Preview` is rejected as a lifecycle state: nothing about a policy changes when it is previewed, and simulation runs against Drafts. `Approved` is rejected as a lifecycle state because it forces every organization through a governance step that many do not want; approval is instead recorded as an `Approval` object and gated by a per-workspace requirement. `Published` means immediately executable. Archiving a policy never breaks in-flight Moments, which carry their own snapshot. This amends Atlas §4 and §11 and resolves conflict C4 with no schema change.

---

# Part 2 — The Minimum Closed Operational Loop

The smallest sequence that takes a configured organization all the way to a delivered, costed, closed recognition. **Everything not on this path is deferred.**

Classification: **[R]** required for the first closed loop · **[P]** required before external pilot · **[D]** deferrable until operational evidence exists.

| # | Step | Canonical object | Required input | Customer action | Operator action | Decision | Operational Event | Financial effect | Complete when | Customer sees |
|---|------|-----------------|----------------|-----------------|-----------------|----------|-------------------|------------------|---------------|---------------|
| 1 | Organization configured | Workspace | — | Completes H2 setup | — | — | — | — | `setupStage: programs` | *Built* |
| 2 | Eligible Person identified | Person | Groups + status | Adds/imports people | — | — | — | — | ≥1 Active person in a group with a rule | Coverage per group | **[R]** *Built* |
| 3 | Program active | Program | Groups, occasions, budget | Creates and activates | — | — | `ProgramActivated` | Envelope committed | `status: Active` | Program summary | **[R]** |
| 4 | Moment generated | Moment | Program + population + calendar | — | — | `MomentQualification` | `MomentCreated` | — | Moment exists, `Pending` | Upcoming count | **[R]** |
| 5 | Policy and budget resolved | Moment.policySnapshot | Assignments + person country | — | — | `PolicyResolution`, `BudgetResolution` | — | Per-Moment budget reserved | Snapshot written | Budget per moment | **[R]** |
| 6 | Execution Brief prepared | ExecutionBrief | Moment + recipient + address | — | Reviews, completes address | `BudgetException` if over | `BriefGenerated`, `AddressUpdated` | Estimate produced | Brief `Ready` | *Nothing* | **[R]** |
| 7 | Item selected | RecognitionOrder | Catalog + budget | — | Chooses item | `ItemSelection` / `ItemSubstitution` | `ItemPrepared` | `estimatedItemCost` | Item confirmed | Category only | **[R]** |
| 8 | Vendor Offer selected | VendorOffer | Vendor directory | — | Requests, compares, selects | `VendorSelection` | `VendorContacted` | `estimatedVendorCost` | Offer accepted | *Nothing* | **[R]** |
| 9 | Courier selected | — | Courier directory | — | Selects courier | `CourierSelection` | — | `estimatedCourierCost` | Courier assigned | *Nothing* | **[R]** |
| 10 | Fulfilment tracked | Fulfillment | Dispatch details | — | Updates status | `Redelivery` / `Escalation` on failure | `Dispatched`, `DeliveryFailed` | — | Terminal state reached | Status only | **[R]** |
| 11 | Delivery confirmed | Fulfillment | Proof | — | Records proof | `QAException` if disputed | `Delivered`, `ProofReceived` | Actuals recorded | Proof captured | Confirmation + curated proof | **[R]** |
| 12 | Cost and outcome recorded | RecognitionOrder | Actual costs | — | Enters actuals | — | — | Margin derived | `Reconciled` | Their charge only | **[R]** |
| 13 | Moment closed | Moment, Memory | All of the above | — | — | — | `MomentClosed` | Envelope consumption final | `status: Fulfilled` | Timeline entry | **[R]** |

### Capability classification

**Required for the first closed loop [R]** — Programs (Campaign mode only), Moment generation with policy snapshot, Execution Brief, a flat catalog, a vendor directory with manually entered offers, a courier directory with manual selection, the fulfilment lifecycle, RecognitionOrder with actual costs, and Moment closure.

**Required before external pilot [P]** — Recurring and Triggered Program modes; customer-facing Moment visibility and upcoming-recognition views; approval flows where the organization requires them; delivery-failure and redelivery handling; the assessment autosave and PolicyForm rebuild still open from the Experience Audit (EX-H1, EX-H3); **live responsive testing on real devices**; a backend with real tenant isolation and access control.

**Deferrable until operational evidence exists [D]** — Gift Intelligence (intent hierarchy, recommendations); Vendor Intelligence (scoring, automated routing); Catalog Intelligence (curation, collections); courier rate APIs; automated vendor offer requests; Memory-derived recommendations; Insights and analytics; multi-currency FX; HRIS connectors.

**The most important line in this section:** steps 7, 8 and 9 need a human operator, a list, and a text field — not intelligence. Aniyé has no operational evidence yet about which vendors deliver well or which gifts land. **Intelligence built before that evidence exists is invention.** A manual flow generates the data that later makes intelligence possible; the reverse is not true.

---

# Part 3 — Revised implementation pathway

Sequenced after Council approval. Each milestone carries an explicit completion test.

### 1. Architecture migrations and canonical types — schema v5

- **Outcome:** Money as minor units; `Person.Inactive` restored; `Program`, `Moment`, `Decision`, `OperationalEvent`, `RecognitionOrder` types defined.
- **Depends on:** Council approval of ADR-007 and ADR-008.
- **Customer value:** none directly — but nothing after this is safe without it.
- **Operational value:** the financial spine every later milestone computes against.
- **Excludes:** any UI. Types and migration only.
- **Completion test:** `validate:money` proves the exponent migration for zero-, two- and three-decimal currencies; all existing suites still pass; a v1 workspace migrates v1 → v5 one rung at a time.

### 2. Minimum Programs — Campaign mode only

- **Outcome:** an administrator creates, reviews and activates a Campaign Program against a frozen population.
- **Depends on:** 1.
- **Customer value:** the first time configuration becomes commitment.
- **Operational value:** a finite, reviewable set of Moments.
- **Excludes:** Recurring, Triggered, approval flows, reporting.
- **Completion test:** activating a Campaign over two groups spanning two countries produces the correct Moment count, each carrying the correct country-resolved policy snapshot.

### 3. Moment generation and configuration snapshot

- **Outcome:** Moments generate with a resolved, immutable policy snapshot; `PolicyResolution` and `MomentQualification` Decisions are recorded.
- **Depends on:** 2.
- **Customer value:** "here is what is coming, and what each will cost".
- **Operational value:** the queue everything downstream consumes.
- **Excludes:** execution.
- **Completion test:** archiving an assigned policy after generation leaves in-flight Moments unchanged and blocks new generation with `no-executable-policy`.

### 4. Execution Brief

- **Outcome:** each Moment produces an operator-facing brief with recipient, address, budget and constraints.
- **Depends on:** 3 + the `/operations` shell.
- **Customer value:** none — deliberately invisible.
- **Operational value:** the operator's unit of work.
- **Excludes:** item, vendor, courier.
- **Completion test:** a brief renders every constraint from the snapshot, and an incomplete address blocks readiness with a named recovery.

### 5. Minimum Catalog and item selection

- **Outcome:** a flat item list filtered by budget and the rule's excluded categories; operator selects one.
- **Depends on:** 4.
- **Customer value:** category visibility only.
- **Operational value:** the first Decision with real alternatives.
- **Excludes:** intent hierarchy, collections, recommendations, images at scale.
- **Completion test:** selection writes exactly **one** `ItemSelection` Decision on confirm, and browsing writes none.

### 6. Vendor Offer and manual vendor selection

- **Outcome:** a vendor directory; operator records offers by hand and selects one.
- **Depends on:** 5.
- **Customer value:** none.
- **Operational value:** the first real cost, and the beginning of vendor evidence.
- **Excludes:** vendor scoring, automated requests, APIs.
- **Completion test:** comparing three offers and choosing the second writes one `VendorSelection` Decision with the rejected offers in `inputs`.

### 7. Courier directory and manual selection

- **Outcome:** courier list per country; operator selects and records cost.
- **Depends on:** 6.
- **Customer value:** none.
- **Operational value:** completes the cost picture.
- **Excludes:** rate APIs, tracking integration, optimization.
- **Completion test:** a courier is selectable for every operating country, or the gap is named.

### 8. Fulfilment lifecycle

- **Outcome:** dispatch → delivered → proof, with failure and redelivery paths.
- **Depends on:** 7.
- **Customer value:** **the first real payoff** — "it arrived, here is the proof".
- **Operational value:** the closed execution path.
- **Excludes:** courier webhooks.
- **Completion test:** a failed delivery followed by redelivery produces a complete, ordered event history with no mutation.

### 9. Commercial tracking — RecognitionOrder

- **Outcome:** budget, estimates, actuals and derived margin per Moment.
- **Depends on:** 8.
- **Customer value:** what they were charged.
- **Operational value:** **the first time Aniyé knows whether it makes money.**
- **Excludes:** payments, invoicing, accounting.
- **Completion test:** margin is derived, never stored, and a corrected vendor cost recomputes it without a second write.

### 10. Confirmation and Memory

- **Outcome:** the Moment closes; a Memory record enters the relationship timeline.
- **Depends on:** 9.
- **Customer value:** the relationship history that is the product's actual promise.
- **Operational value:** the evidence base for later intelligence.
- **Excludes:** derived recommendations.
- **Completion test:** a closed Moment appears on the recipient's timeline with occasion, date and outcome — and no commercial detail.

### 11. Controlled pilot

- **Outcome:** one real organization, one real Campaign, real deliveries.
- **Depends on:** 1–10, plus every **[P]** capability.
- **Excludes:** self-service signup, multiple concurrent tenants.
- **Completion test:** a full cycle completes with no manual database intervention.

### 12. Deeper intelligence

- **Outcome:** Gift, Vendor and Catalog Intelligence — built **on pilot evidence**.
- **Depends on:** 11. **This dependency is the point.**
- **Completion test:** each recommendation is traceable to recorded outcomes, not to assumptions.

### 13. Production backend and access controls

- **Outcome:** server-side persistence, authentication, roles, real tenant isolation.
- **Depends on:** pilot learning.
- **Note:** may need to move earlier if the pilot involves more than one organization — the client-side single-document model cannot isolate tenants, and Decisions and Operational Events do not belong in a browser.
- **Completion test:** two organizations coexist with no cross-visibility, proven by test.

---

# Part 4 — Experience Doctrine application

How the Doctrine changes each recommendation. Not decoration — several of these change the object model.

| Principle | Effect on this architecture |
|-----------|----------------------------|
| **One clear next action** | Programs list computes a single primary from state: *Create your first program* → *Review N moments* → *Activate* → *View progress*. The Operations queue shows the next brief needing attention, not a table of everything |
| **Progressive disclosure** | Program creation exposes 5 of ~15 fields; the rest carry sensible defaults. Generation rules, de-duplication windows and reporting periods stay hidden until someone asks |
| **State-based recommendations** | Campaign is recommended for a first Program — finite, reviewable, easy to reason about. Recurring is offered once one Campaign has completed |
| **Meaningful progress** | Programs becomes the sixth stage in `SETUP_STAGES`, replacing "Not yet". The existing `SetupProgress` picks it up automatically — it derives from that list |
| **No dead ends** | Every blocked state names its unblocker: no published rule → link to rules; no active people → link to people; envelope exhausted → *increase the budget or narrow the population*, with both routes |
| **Mobile-first partner flows** | Vendor and courier surfaces are phone-first from the first line of code, per Doctrine §1.11. Not a later adaptation — E1 proved how expensive that is |
| **Human language** | `Program` → **"recognition program"**; `Moment` → **"upcoming recognition"** for customers, **"job"** for operators; `ExecutionBrief` → **"brief"**; `RecognitionOrder` → **"costs"** in Workspace, **"order"** in Operations |
| **Confirmation before consequence** | Activating a Program is confirmed with real impact: *"This will create 47 moments and commit ₦2,350,000 of your ₦3,000,000 envelope."* The `ConfirmDialog` from E1 already does exactly this shape |
| **Continuity across channels** | A vendor offer requested over WhatsApp is completable on the web and vice versa. The Decision is the record; the channel is a `source` field |
| **Avoiding analysis paralysis** | Operators see budget-filtered items, not the whole catalog. Customers choose a mode, not fifteen fields |

### Proposed guided Program creation — 4 steps

`PolicyForm`'s failure (EX-H3: six sections, ~14 fields, one page) is the mistake to avoid. Programs has *more* fields and must not repeat it.

| Step | Question | Fields shown | Hidden behind defaults |
|------|----------|--------------|------------------------|
| **1. What are we marking?** | Which occasions? | `momentTypes` — checkboxes from the recognition rules already published | `name` auto-suggested from the selection, editable |
| **2. Who does it cover?** | Which groups? | `relationshipClassIds` — grouped by type, sorted by level, **with a live count**: *"Covers 47 people"* | `populationRule` defaults to *all Active people in these groups* |
| **3. When?** | One-off or ongoing? | `mode` — Campaign *(recommended)* / Recurring / Triggered, each explained by use case; then `startDate` / `endDate` | `momentGenerationRule` defaults to 14 days' lead time, de-duplicated per person per occasion per year |
| **4. Review and activate** | Does this look right? | Full summary: occasions, population count, per-person budget from the resolved rules, **projected total**, envelope | Everything else |

**Nothing is written until step 4.** Draft autosaved to `aniye_program_draft`, resumable — the pattern `PersonForm` already established and validated in R3a.

**Step 2's live count is the most important element in the flow.** It converts an abstract configuration decision into a concrete one: *"Covers 47 people — 3 have no address on file."* That single line prevents the most likely first-Program failure, which is activating against a population the administrator has not actually looked at.

---

# Decisions requiring Council approval

| ADR | Decision | Schema impact | Blocks Programs? |
|-----|----------|---------------|------------------|
| **ADR-004** | Program is an operational commitment; policy resolves per Moment, never pinned at Program level | New `programs` collection (additive) | ✅ Yes |
| **ADR-005** | Workspace and Operations are separate surfaces; Operations never writes configuration | None client-side | ⚠️ Decision only |
| **ADR-006** | Decisions vs Operational Events; record only on confirmation; `Confirmed`/`Superseded` only | Backend objects | ⚠️ Decision only |
| **ADR-007** | Money as integer minor units + ISO 4217; `RecognitionOrder` as the financial object | **v4 → v5, destructive** | ✅ **Yes — hard prerequisite** |
| **ADR-008** | Person gains `Inactive` | v5, additive | ✅ Yes |
| **ADR-009** | Policy lifecycle stays `Draft → Published → Archived`; approval is a record | **None** | ⚠️ Decision only |

**The hard gate is ADR-007.** A Program has a budget envelope, and an envelope is arithmetic. Everything else can be decided in parallel with early Programs work; Money cannot.

### Open questions the Council should settle

1. **Does the pilot involve more than one organization?** If yes, milestone 13 moves ahead of 11 — the client-side model cannot isolate tenants.
2. **Does any near-term customer require policy approval?** If not, `Approval` stays deferred indefinitely.
3. **Is Aniyé the merchant of record, or an agent?** Not answered here, and it changes what `actualCustomerCharge` legally means.
4. **What is the first pilot currency?** If single-currency, FX snapshots defer entirely.

---

*H2 → H3 Architecture Checkpoint — 27 July 2026 — prepared at commit `9c8e7d2`.*
*All recommendations are Proposed — Council Review Required. Nothing herein is implemented.*
