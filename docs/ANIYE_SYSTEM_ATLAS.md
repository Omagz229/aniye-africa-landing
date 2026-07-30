# Aniyé Africa — System Atlas

> **Master architectural map for the Aniyé platform.**
> Before adding any major feature, consult this document.
> Every feature must answer the five questions in §19 before implementation begins.
>
> **Companion standard:** [`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) governs how the
> platform *feels*, where this document governs what it *is*. It is a permanent product and
> interaction standard, not an ADR — every user-facing milestone is measured against its Definition
> of Experiential Completion before being called done.

---

## 1. Purpose of Aniyé

Aniyé helps organizations never miss the moments that matter.

Behind every strong organization are people and relationships maintained through consistent, intentional recognition — employees who feel seen, clients who feel valued, partners who feel trusted. Aniyé is the infrastructure that makes that possible across Africa.

**Core belief:** Relationships are the infrastructure of every great organization.

**What Aniyé does:**
- Gives organizations a structured way to identify, plan, and execute relationship moments
- Brings African gifting intelligence — local context, local vendors, local delivery
- Scales human care across geographies, time zones, and organizational complexity

---

## 2. The Current MMP (Horizon 1)

**Live at:** https://aniye-africa-landing.vercel.app

**Routes:**
| Route | Type | Purpose |
|-------|------|---------|
| `/` | Server Component | Homepage — narrative arc from problem to solution |
| `/assessment` | Server + Client | 4-step Relationship Assessment wizard |
| `/report` | Server Component | Relationship Snapshot (decoded from URL param `?d=`) |

**Assessment flow:**
1. Tell us about your organization (company, industry, headcount, countries)
2. Who should we work with? (contact details)
3. Help us understand your relationships (who, what moments, process, challenges)
4. You're almost there (review + submit)

**Submission handling:**
- `console.log` for debug visibility
- `localStorage` persistence under key `aniye_last_submission`, written once at submit *(corrected during the Experience Audit — this document previously recorded `aniye_assessment`, a key the code has never used)*
- TODO: webhook to CRM/Notion/Airtable on submission

**Data passing pattern (stateless, no auth):**
```
btoa(unescape(encodeURIComponent(JSON.stringify(data)))) → URL param ?d=
JSON.parse(decodeURIComponent(escape(atob(encoded)))) → report page decode
```

**Scoring model (heuristic, v1):**
- Relationship groups × 4 (max 24)
- Moment types × 4 (max 24)
- Geography breadth (max 20)
- Process maturity (max 32)
- Total: 0–100 → Level 1–4 Maturity

**Maturity levels:**
| Level | Label | Score |
|-------|-------|-------|
| 1 | Foundational | 0–25 |
| 2 | Developing | 26–50 |
| 3 | Progressing | 51–75 |
| 4 | Advanced | 76–100 |

**Full platform arc:**
Assessment → Snapshot → Consultation → Organization Profile → Workspace → Relationship Classes → Policies → Programs → Execution → Learning → Intelligence

---

## 3. The Nine Platform Domains

Every feature belongs to exactly one domain. Domain boundaries are strict — no domain reaches into another's objects without going through a defined interface.

| # | Domain | Owns | Does NOT own |
|---|--------|------|-------------|
| 1 | **Identity** | Auth, accounts, users, roles, permissions, API keys | Business logic of any kind |
| 2 | **People** | Person records, PeopleSource connectors, import pipelines, deduplication | Relationship rules, programs |
| 3 | **Relationship Engine** | Relationship Classes, Recognition Policies, Policy Assignments, Programs, Moments, Organization Profile, Relationship Profile | Historical records, vendor intelligence |
| 4 | **Gift Intelligence** | Intent → Category → Collection → Item catalog, curation, budget recommendations | Fulfillment, delivery logistics |
| 5 | **Fulfillment** | Orders, vendor routing, delivery tracking, proof of delivery, communication channels | Catalog management, relationships |
| 6 | **Knowledge** | Interaction history, Memory records, vendor intelligence, country intelligence, delivery intelligence, recommendations | Current operational state |
| 7 | **Integrations** | HR connectors, CRM adapters, calendar sync, webhooks, API consumers, normalization layer | Canonical model definition |
| 8 | **Insights** | Analytics, spend reports, engagement scores, program performance, AI-generated observations | Raw data storage |
| 9 | **Platform** | Feature flags, API versioning, migrations, audit logs, infrastructure configuration | Any business domain |

### Domain Boundary: Relationship Engine vs Knowledge

This boundary is the most important distinction in the platform.

**Relationship Engine** owns the **current operational state**:
- Organization Profile (current configuration of the org)
- Relationship Classes (who the org recognizes, today)
- Relationship Policies (how they recognize each class, today)
- Programs (what recognition initiatives are active or planned)
- Moments (what has been scheduled or is pending)
- Relationship Profile (the live, structured representation of relationship health — updated as programs run)

**Knowledge** owns **historical learning**:
- Memory records (what happened, when, to whom)
- Interaction timeline (chronological record of all moments executed)
- Vendor intelligence (what vendors have delivered well in which countries)
- Country intelligence (cultural context, delivery constraints, lead times)
- Delivery intelligence (what delivery methods work for which recipient profiles)
- Recommendations (derived from history — "this worked last time for this class")

**Rule:** The Relationship Engine looks forward. Knowledge looks backward. If a record describes what *is*, it belongs to the Relationship Engine. If it describes what *was* or what can be *learned*, it belongs to Knowledge.

---

## 4. Canonical Data Model

These are the core objects of the Aniyé platform. All features operate on these objects. No external system's schema overrides these definitions. When an external system provides conflicting structure, it is normalized at the integration boundary.

### Money

**ADR-007 (Accepted) — implemented in schema v5.**

| Field | Type | Description |
|-------|------|-------------|
| `amountMinor` | integer | Count of the currency's **smallest unit**. NGN 500,000 is `50000000` kobo |
| `currency` | string | ISO 4217 alpha-3, uppercase, validated against a pinned table |

The minor-unit exponent comes from a **pinned table** in `lib/money.ts` supporting zero-decimal (JPY, KRW, RWF), two-decimal (NGN, KES, USD) and three-decimal (BHD, KWD, OMR) currencies. It is not stored per record and is never inferred from browser locale.

Formatting happens at the display edge; operators enter and read major units and never see `amountMinor`. Cross-currency arithmetic is refused — it requires an explicit dated exchange-rate snapshot.

A canonical value type used wherever monetary amounts appear. **Never store a number without a currency.**

```typescript
interface Money {
  amountMinor: number;  // integer count of the smallest unit — kobo, cents, fils
  currency: string;     // ISO 4217 alpha-3, uppercase
}
```

**Currencies in the pinned table** — `lib/money.ts`, grouped by minor-unit exponent:

| Exponent | Currencies | One major unit equals |
|----------|-----------|----------------------|
| **0** | JPY, KRW, VND, RWF, UGX, XOF, XAF, CLP, ISK | 1 minor unit |
| **2** | **NGN, KES, GHS, ZAR, USD**, EUR, GBP, EGP, MAD, TZS, ETB, CAD, AUD, AED, CHF, CNY, INR | 100 minor units |
| **3** | BHD, KWD, OMR, TND, JOD, IQD, LYD | 1000 minor units |

A currency must be in this table before an amount in it can be stored. An unknown code is **refused**, never assumed to be two-decimal — guessing would misprice every JPY amount a hundredfold.

All budget fields, item prices, and spend reports use `Money`. Display formatting is locale-aware; **precision never is**.

**Currency default rule:** A workspace's `baseCurrency` is the default currency for all Relationship Policies in that workspace. Any Policy may explicitly override with a different currency (e.g., a USD policy within an NGN workspace). When a Program is Approved, the exchange rate between any non-base currencies and the workspace `baseCurrency` is locked at that moment and stored on the Program record. Cross-border reporting always converts to workspace `baseCurrency` using the locked rate.

---

### Organization

The top-level account. One organization may have multiple workspaces.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `name` | string | Legal or trading name |
| `industry` | string | Standardized industry label |
| `country` | string | ISO 3166-1 alpha-2 primary country |
| `operatingCountries` | string[] | All countries where the org has presence |
| `employeeCount` | string | Headcount band |
| `maturityLevel` | 1–4 | Current relationship maturity |
| `status` | enum | Prospect / Verified / Active / Suspended |
| `createdAt` | ISO timestamp | — |

---

### Workspace

An operational unit within an organization (e.g., Nigeria HQ, East Africa). An organization starts with one workspace.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `organizationId` | UUID | Parent org |
| `name` | string | Workspace label |
| `baseCurrency` | string | ISO 4217 default currency for budgets |
| `timezone` | string | IANA timezone (e.g., Africa/Lagos) |
| `status` | enum | Onboarding / Active / Suspended |

---

### Organization Profile

The structured, validated configuration of an organization in Aniyé. Distinct from the Relationship Snapshot (see §7).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `organizationId` | UUID | — |
| `completionStage` | enum | Snapshot / Verified / Workspace / Classes / Policies / Programs / Active |
| `snapshotData` | JSON | Preserved output of initial Assessment |
| `contactName` | string | Primary contact |
| `contactEmail` | string | Verified email |
| `contactRole` | string | — |
| `verifiedAt` | ISO timestamp | When email was confirmed |
| `lastUpdatedAt` | ISO timestamp | — |

**Lifecycle:** Assessment → Snapshot → Email Verification → Organization Profile → Workspace → Classes → Policies → Programs → Active

---

### Relationship Profile

A live, structured representation of an organization's relationship health — owned by the Relationship Engine, updated as programs execute.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `organizationId` | UUID | — |
| `maturityLevel` | 1–4 | Current maturity, recalculated on each program cycle |
| `classCount` | number | Total Relationship Classes defined |
| `activeProgramCount` | number | Programs currently running |
| `momentsThisYear` | number | Moments executed in current calendar year |
| `coverageCountries` | string[] | Countries where moments have been delivered |
| `lastActivityAt` | ISO timestamp | Most recent executed moment |
| `version` | number | Increments on profile recalculation (see versioning triggers below) |

> **Relationship Snapshot vs Relationship Profile:**
> The **Snapshot** is a one-time diagnostic report generated from the Assessment — a point-in-time picture for a prospect. It requires no account.
> The **Relationship Profile** is a live operational record updated as the organization runs programs — it belongs to a verified, active organization. The Snapshot is Version 0 of the Profile.

**Profile versioning triggers:**
- A Program changes status to `Active` or `Completed`
- A nightly background job runs if any Moments changed status during that day
- Version does not increment on individual Moment changes in real time — the nightly pass consolidates them
- Every version increment records a `versionedAt` timestamp and a `triggerType` (ProgramStatusChange / NightlyRecalculation)

---

### Person

Any individual tracked in Aniyé — employee, client, partner, board member.

**Implemented in H2.5** (schema v4).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `firstName` | string | **Required** |
| `lastName` | string | **Required** |
| `email` | string? | Optional, but **normalized** (trimmed, lowercased) when present. The duplicate-identity key |
| `phone` | string? | Optional. Never used as an identity key — see §12 |
| `country` | string? | ISO 3166-1 alpha-2, uppercase |
| `role` | string? | Job title or relationship role |
| `startDate` | ISO date? | Employment or relationship start, `YYYY-MM-DD` |
| `birthday` | string? | `MM-DD`. The year is not required and is discarded if supplied |
| `relationshipClassIds` | UUID[] | Classes this person belongs to. References only, never denormalized |
| `sourceId` | UUID | The PeopleSource this record last came from |
| `sourceType` | enum | Manual / CSV / HRIS — denormalized deliberately, so precedence can be evaluated without a source lookup |
| `externalId` | string? | Stable id in the originating system |
| `status` | enum | **Active / Inactive / Archived** — ADR-008 (Accepted), implemented in schema v5 |
| `createdAt` | ISO timestamp | — |
| `updatedAt` | ISO timestamp | — |
| `archivedAt` | ISO timestamp? | Set when archived |
| `deliveryAddress` | object? | ✅ **Implemented in H3.2** (ADR-011), schema **v7**, additive |

✅ **Delivery address — implemented in H3.2 (ADR-011), schema v7.**

`Person` owns an **optional, customer-controlled default `deliveryAddress`**. Minimum structured
shape: **`line1`, `city`, `countryCode` are required**; `line2`, `stateOrRegion`, `postalCode`,
`landmark` and `deliveryInstructions` are optional. Postal code is deliberately not required —
it is unreliable or absent across much of Aniyé's operating footprint.

**An absent or half-entered address is a valid stored state.** It never blocks Moment generation and
never invalidates a workspace; it blocks only *brief confirmation*, and is named there with a link
to the Workspace page that fixes it. Refusing the workspace over it would lock an administrator out
of the very screen that corrects it.

The Execution Brief carries a **`deliveryAddressSnapshot`** (§15f), for the same reason a Moment
carries a policy snapshot: the brief must still explain where a gift was sent after the customer
edits the record. **An operator override applies to one brief only and never writes back to
`Person`** — updating the default address is an explicit customer action in Workspace (ADR-005).

A Person may belong to zero, one, or many Relationship Classes. Zero is valid and expected during setup — the person exists, but no policy reaches them until a class is assigned.

**Three lifecycle states (ADR-008, Accepted — implemented in schema v5):**

| State | In the directory | Eligible for automatic Program populations | In historical reporting |
|-------|:---:|:---:|:---:|
| `Active` | ✅ | ✅ | ✅ |
| `Inactive` | ✅ | ❌ | ✅ |
| `Archived` | ❌ | ❌ | ✅ |

Presented to users as **Active / Paused / Archived**. Person state governs **future eligibility only** and is never retroactive — Moments already executed remain valid and reportable.

`Inactive` exists for the case Programs creates: an employee on extended leave should not receive automatic recognition, but must not be hidden from the directory or erased from reporting. An import **never** changes lifecycle state — reactivation is a deliberate act, not a side effect of a spreadsheet upload.

**Archived people** keep every field and class reference. They are excluded from active member counts and must not be treated as program members, but they are never deleted.

> **Implementation note:** `Inactive` was briefly reduced away in H2.5, when — with no Programs — "excluded from automatic population" had no meaning. ADR-008 restored it once Programs created that meaning. Ledger compromise P7 is superseded. `workspaceId` is omitted because the client-side workspace is a single document. `tags` and `department`/`manager` are not implemented — they belong with the HR connectors in §12.

---

### People Source

Where a Person record came from. The abstraction that lets a CSV upload today and an HR connector tomorrow feed the same directory under the same precedence rules, without the Person model knowing which is which.

**Implemented in H2.5** (schema v4).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `name` | string | Display label. Derived from the filename for CSV imports |
| `type` | enum | Manual / CSV / **HRIS** |
| `status` | enum | Active / Archived / Disconnected |
| `filename` | string? | Original upload filename, for CSV sources |
| `externalSystem` | string? | Name of the external system, for HRIS sources |
| `importedAt` | ISO timestamp? | When rows were last brought in |
| `lastSyncedAt` | ISO timestamp? | Reserved for HRIS |
| `createdAt` | ISO timestamp | — |
| `updatedAt` | ISO timestamp | — |

**Cardinality rules:**

- **One source per CSV import** — named from the file, recording `filename` and `importedAt`. Never one source per row.
- **One Manual source per workspace**, reused for every hand-entered person. A source per person would make provenance meaningless.

**`HRIS` is a canonical future source type only.** H2.5 builds no external integration. The value is declared now so that source precedence has a stable top rung and imported records can carry correct provenance the day a connector ships — without another schema migration. See §12 for the connector roadmap.

**Archiving or disconnecting a source never touches its people.** The Person records remain, keep their `sourceId`, and stay fully operational; only the source's state changes.

---

### Relationship Class

A named group of people who receive similar recognition treatment. Classes are configurable per workspace.

Classes are described by two independent axes (**ADR-002**): a **Relationship Type**, which states the nature of the relationship, and a numeric **Relationship Level**, which states relative recognition priority within that type.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `workspaceId` | UUID | — |
| `name` | string | Display label. Editable at any time; carries no canonical meaning |
| `type` | enum | Relationship Type — Employee / Client / Partner / Supplier / Board / Investor / Government / Community / Other |
| `level` | integer | Relationship Level — 0–99. **0 is the highest** recognition priority within the type |
| `description` | string? | Optional context |
| `memberCount` | number | **Derived, never stored** — see below |
| `isCustom` | boolean | `false` for standard templates, `true` for org-created |
| `status` | enum | Draft / Active / Archived |

**Standard classes by type (see §10 for the full reference).**

**Member counts are derived, not stored.** As of H2.5 the implementation computes them from Person records on read rather than persisting a `memberCount` field. Storing it would create a second source of truth that every person edit, import, archive, and class change would have to keep in step — and that would be wrong the first time one of those paths forgot. The helpers in `lib/people.ts` derive:

- **active member count** per class — people with `status: Active`
- **total member count** per class — including archived people
- **people with no class** — active people no policy can reach
- **people referencing inactive or missing classes** — reported, never silently stripped

A person is counted once per class even if the id is repeated on their record, and a reference to a class that no longer exists never corrupts another class's count.

> **Implementation note (as of ADR-002):** the workspace implementation persists `isDefault` and `isActive` in place of `isCustom` and `status`. This divergence predates ADR-002 and is tracked as C2 in `docs/RECOVERY_LEDGER.md`. The `memberCount` divergence (C3) is **resolved** as of H2.5 — by deriving rather than storing.

---

### Recognition Policy

A named, reusable definition of how recognition should happen. Recognition Policies are standalone objects — not owned by any Relationship Class. Classes reference policies through Policy Assignments.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `workspaceId` | UUID | Owning workspace |
| `name` | string | Policy name (e.g., "Executive Recognition Policy") |
| `description` | string | Purpose and intended scope |
| `recognitionRules` | RecognitionRule[] | Per-moment-type budgets and enablement flags |
| `approvalWorkflow` | enum | None / Manager / Finance / Executive |
| `preferredGiftCategories` | string[] | Preferred category tags |
| `excludedCategories` | string[] | Categories not appropriate |
| `deliveryRequirement` | enum | Standard / Courier / HandDelivered / Digital |
| `preferredDeliveryWindow` | string? | e.g., "3 business days before date" |
| `signatureRequired` | boolean | — |
| `proofRequired` | boolean | — |
| `reportingCadence` | enum | None / Weekly / Monthly / Quarterly |
| `status` | enum | **Draft / Published / Archived** — ADR-009 (Accepted). `Preview` is a UI mode, not a state; approval is a separate governance record |
| `version` | number | Increments each time a new draft is published |
| `parentPolicyId` | UUID? | Set when this policy is a new draft derived from a Published policy |
| `createdAt` | ISO timestamp | — |
| `updatedAt` | ISO timestamp | — |
| `publishedAt` | ISO timestamp? | When last Published |

Programs reference Recognition Policies via Policy Assignments. At Program Approval, a `policySnapshot` (immutable copy of all referenced Published policies) is taken and stored on the Program record — guaranteeing the Program runs against the rules it was approved under, even if policies are later updated.

#### RecognitionRule

| Field | Type | Description |
|-------|------|-------------|
| `momentType` | string | Standardized type label (Birthday, Work Anniversary, Promotion, etc.) |
| `budgetPerPerson` | Money | Per-person spend limit |
| `isEnabled` | boolean | Whether this moment type is active under this policy |

---

### Policy Assignment

The link between a Relationship Class and a Recognition Policy. Multiple assignments per class are supported, enabling country-specific policy overrides for multinational organizations.

**Implemented in H2.4** (schema v3). This is the object that completes the canonical flow of §11 — without it, a Relationship Class has no route to a policy.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `relationshipClassId` | UUID | The class being configured. A reference, never denormalized |
| `recognitionPolicyId` | UUID | The policy being assigned. A reference, never denormalized |
| `countryCode` | string? | ISO 3166-1 alpha-2, uppercase, for a country-specific override. Absent or blank means **Global** |
| `priority` | integer | Higher wins among assignments of the same scope |
| `isActive` | boolean | Inactive assignments are retained for audit but never resolve |
| `createdAt` | ISO timestamp | — |
| `updatedAt` | ISO timestamp | Also the second tiebreaker in resolution |

An assignment holds references only. It never copies class or policy data, so a policy edit is immediately visible through every assignment that points at it.

**Scope rule:** Country-scoped assignments take precedence over Global assignments for moments in that country. Assignment changes do not affect Programs already in Approved or Active status — their `policySnapshot` is immutable.

See §11 for the full resolution algorithm.

> **Implementation note:** the implemented model names the country field `countryCode` rather than `scope`, and uses a boolean `isActive` rather than a `status` enum. Scope is *derived* from `countryCode` rather than stored twice, which removes the possibility of the two disagreeing. `workspaceId` is omitted because the client-side workspace is a single document; it returns when the backend does.

---

### Program

> ✅ **Implemented in H2.6 (schema v6) — Campaign mode only.**
> `Recurring` and `Triggered` are declared in the schema so they need no migration later, but
> **neither is implemented**: nothing in the product can create one. **Moment generation does not
> exist yet** — a Campaign prepares the population and configuration a future Moment engine will
> consume, and generates nothing.

**ADR-004 (Accepted):** A Program is a **controlled operational commitment** — it takes a defined population and a defined occasion and commits the organization to recognizing them over a defined period or trigger pattern, within a budget envelope.

The four objects separate cleanly:

| Object | Question it answers |
|--------|--------------------|
| **Recognition Policy** | What recognition is permitted or required? |
| **Policy Assignment** | Which group, and where, does that policy govern? |
| **Program** | Is recognition actually running, for whom, when, against what budget? |
| **Moment** | One person, one occasion, one execution |

| Field | Type | Description |
|-------|------|-------------|
| `id`, `workspaceId` | UUID | — |
| `name`, `description` | string | — |
| `momentTypes` | string[] | One Program may cover several occasions |
| `relationshipClassId` | UUID | **Exactly one** Relationship Class per Program (Council condition) |
| `frozenPopulation` | `{ personIds, frozenAt }`? | Set at activation. **References only** — no copied Person records, no policy data |
| `mode` | enum | Recurring / Triggered / Campaign |
| `populationRule` | JSON | Minimum: all `Active` people in that class |
| `startDate` / `endDate` | ISO date / ISO date? | `endDate` null means open-ended |
| `budgetEnvelopes` | Money[] | **One envelope per currency.** See below |
| `status` | enum | Draft / Active / Paused / Completed / Cancelled |
| `momentGenerationRule` | JSON | Lead time, de-duplication window |
| `createdAt`, `updatedAt`, `createdBy` | — | — |

**A Program does not store `policyAssignmentId`, and does not carry one universal policy snapshot.** Each Moment resolves its own applicable assignment and policy from the Program's Relationship Class and the **Person's country**, and the resolved assignment *and* policy are snapshotted onto that Moment.

This is not a detail. A single Program-level snapshot cannot represent the country-scoped assignments ADR-001 introduced: a Program covering Executive Leadership across Nigeria, Kenya and South Africa resolves to three different policies, and one snapshot would silently apply one country's rule to everyone.

**Modes:**

| Mode | Trigger | Population |
|------|---------|-----------|
| **Recurring** | A date derived from a Person field | Re-evaluated on the configured cadence |
| **Triggered** | An event | Evaluated at trigger time |
| **Campaign** | A fixed window | **Frozen at activation** |

### Currency-specific budget envelopes

A Program holds **one budget envelope per currency**, never a single total.

A group spanning Nigeria and Kenya resolves to different policies in different currencies (ADR-001), so its allocation is genuinely two numbers: *NGN 100,000 for 2 people, KES 20,000 for 1 person*. A single figure would require an exchange rate, and ADR-007 requires those to be explicit dated snapshots rather than implicit conversions.

**Aniyé therefore never calculates a cross-currency grand total.** Each currency is validated, budgeted and compared independently. Activation is blocked if any resolved currency has no envelope, or an envelope below what the current rules allow.

**No FX conversion exists in H2.6.**

### Campaign population and freezing

| | Draft | Active |
|---|-------|--------|
| Population | **Re-evaluated live** on every view | **Frozen** at activation |
| Later additions to the group | Included | Not included |
| Later pauses, archives, removals | Reflected | Do not rewrite the frozen list |

Eligibility is **recomputed at activation**, never taken from the preview — a draft may have been open for an hour while someone was archived or a rule unpublished.

Eligible means: the group is active, `Person.status === 'Active'`, and the person is in that group. Paused and archived people are excluded, and counted separately so the administrator can see why.

Whether a frozen person is still executable is a question for Moment generation, which will record an exception rather than rewriting history.

### Policy resolution stays per Moment

A Program still carries **no** `policyAssignmentId`, **no** `recognitionPolicyId` and **no** universal policy snapshot. The Campaign preview resolves policy per person — through the same `resolvePolicyAssignment()` the Moment engine will use — but stores none of it. Snapshotting happens per Moment, when Moments exist.

`budgetConsumed` is **derived on read**, never stored — the same reasoning as `memberCount`.

---

### Moment

A single recognized instance — one person, one occasion, one execution.

> ✅ **Implemented in H3.1** — generation only. A Moment is **not** part of `WorkspaceState`; it
> lives in the separate `OperationsState` (§15d, ADR-010). The operational semantics — eligibility
> re-evaluation, atomic confirmation, idempotency — are in **§15e**, which is the fuller reference.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `workspaceId` | UUID | The workspace this Moment belongs to. A payload for another is refused, never adopted |
| `programId` | UUID | Parent Program. **Not nullable** — every Moment comes from a Program |
| `personId` | UUID | Recipient |
| `relationshipClassId` | UUID | The group the Program targeted |
| `occasionType` | string | Standardized occasion label |
| `targetDate` | ISO date | When it should execute |
| `status` | enum | `NeedsReview` / `ReadyForExecution` / `Cancelled` |
| `sourceKey` | string | Deterministic logical identity — `campaign::workspace::program::person::occasion`. What makes repeat preparation idempotent |
| `recipientSnapshot` | object | Name, email, phone, country, role. **A subset, not the whole Person** |
| `relationshipGroupSnapshot` | object | Group id, display name, Relationship Type, numeric Level |
| `policyResolutionSnapshot` | object? | Assignment id, policy id, name, **version**, country scope, occasion, approved budget as canonical `Money`, excluded categories, and the four delivery promises (`deliveryRequirement`, `preferredDeliveryWindow`, `signatureRequired`, `proofRequired`), resolved timestamp. Required when `ReadyForExecution`; delivery fields are absent only on legacy pre-v6 records |
| `issues` | array | Named blockers, each with the Workspace page that fixes it |
| `createdAt` / `updatedAt` | ISO timestamp | — |
| `cancelledAt` | ISO timestamp? | — |

**Statuses stop at generation.** `Dispatched`, `Fulfilled` and `Missed` do not exist and must not be
added speculatively — each needs the object that produces it. Item selection lives on the
Recognition Order (H3.7), not here; delivery state lives on Fulfillment (H3.6).

**Address readiness is not a Moment status** (ADR-011). A Moment may be `ReadyForExecution` without
an address; completeness is a property of the Execution Brief.

> **Superseded shape.** Through H2.6 this section described a Moment with `momentType`,
> `scheduledDate`, `giftItemId`, `policyId`, `budget` and a six-value status running to `Fulfilled`.
> No such record was ever built. It is superseded by the H3.1 implementation above and by ADR-004,
> which moved the policy snapshot from the Program onto the Moment.

---

### Gift / Item — Catalog Item

A product an operator can choose for a recipient.

**Implemented at H3.3** in `lib/catalog.ts`, as a pure seed module. It is deliberately **not** in
`WorkspaceState`: the catalog is Aniyé's, not the customer's, and no catalog master data is ever
written into the customer's document.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable across builds — a confirmed Decision references it forever |
| `name` | string | — |
| `description` | string | One line, to tell two similar items apart |
| `category` | `GiftCategory` | **The existing policy vocabulary**, never a competing taxonomy |
| `isActive` | boolean | Withdrawn items stay in the list so historical selections stay legible |
| `price` | Money | Canonical — integer minor units, pinned exponent (ADR-007) |

> ⚠️ **The pre-H3.3 field list is superseded.** It specified `vendorId`, `intent`, `collectionIds`,
> `vendorCost`, `availableCountries`, `images`, `tags` and a four-value `status`. **None of them
> survived the milestone that built the object.** Each belongs to work that does not exist: vendors
> and cost to H3.4 and H3.7, the intent hierarchy and collections to **H4.2 Catalog Intelligence**,
> behind the pilot.
>
> This is the second time a §4 field list written ahead of implementation turned out to be wrong on
> every field — §4 Moment was the first. Treat `Fulfilment`, `Memory` and `Insight` accordingly.
> *(See `RELATIONSHIP_OPERATIONS_ATLAS.md` §3.)*

**Selection is an operational act, not a catalog one.** An item is chosen against a Moment's
**immutable** policy snapshot — approved budget and excluded categories — and the choice is recorded
as one `ItemSelection` Decision carrying the complete eligible candidate set, the selected item's
snapshot and the operator's reason. Currencies are matched exactly and never converted.

---

### Vendor

A partner Aniyé buys from. **Implemented at H3.4** in `lib/operations/types.ts`, inside
`OperationsState` — never in `WorkspaceState`, and never projected into any Workspace route.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable — confirmed offers reference it forever |
| `workspaceId` | string | Scoped consistently to the one workspace `OperationsState` holds |
| `name` · `countryCode` · `city` | string | Who they are and where |
| `whatsapp` · `email` | string? | **At least one required** — a vendor nobody can reach is not a vendor |
| `isActive` | boolean | Deactivated, **never deleted** |
| `note` | string? | Free text. Not a grade, not a score |
| `createdAt` · `updatedAt` | ISO 8601 | — |

> ⚠️ **No scores, ratings, reliability, capacity, lead-time policy, quality grades, price lists,
> preferred status, contracts, SLAs or onboarding state.** Vendor *Intelligence* is **H4.4**, gated
> on the pilot; partner onboarding is unresolved **OPS-U5**. A directory an operator types into needs
> neither, and there is no vendor account, portal or vendor-facing route.

### VendorOffer

An immutable record of what an operator was quoted for the item already chosen for a Moment.
Carries the Moment, the brief and revision quoted against, the live `ItemSelection` Decision, the
item and vendor snapshots, `quotedVendorCost` as canonical Money, the channel the quote arrived
through (`WhatsApp` · `Email` · `Phone` · `Manual`), when it was quoted, when it was recorded, an
optional whole-day lead time and optional terms.

> ⚠️ **`quotedVendorCost` is an estimate of what the vendor will charge Aniyé** — not the customer's
> charge, not the catalog price, not an actual paid cost, not revenue, not margin, and **never
> derived from `Gift / Item.price`**. Currencies are never converted; every offer in one comparison
> uses the item's exact currency (ADR-007). Aniyé's commercial role remains unresolved (U3) until
> H3.7.

---

### Courier

Who carries the gift the last leg. **Implemented at H3.5** in `lib/operations/types.ts`, inside
`OperationsState` — never in `WorkspaceState`, and never projected into any Workspace route.

| Field | Type | Description |
|-------|------|-------------|
| `id` · `workspaceId` | string | — |
| `name` | string | — |
| `countryCode` | ISO-2 | **The one country this row serves.** Selection is per country |
| `whatsapp` · `email` | string? | **At least one required** |
| `isActive` | boolean | Deactivated, **never deleted** |
| `note` | string? | Free text. Not a grade, not a score |
| `createdAt` · `updatedAt` | ISO 8601 | — |

> ⚠️ **No rate cards, tracking numbers, API credentials, service levels, zones, transit-time models,
> scoring or automatic routing** — checkpoint milestone 7 excludes rate APIs, tracking integration
> and optimization in terms. There is no courier account, portal or courier-facing route, and no
> city field: city-level routing is optimization, and country is what selection turns on.

**Selection records one carriage cost, plus the complete set of couriers who were available in that
country.** Those alternatives are *knowable*, so they are recomputed rather than typed in — unlike
vendor quotes. The delivery country comes from the live confirmed brief.

> ⚠️ `quotedCourierCost` is an estimate of what the courier will charge **Aniyé**. No ceiling
> relates it to the vendor cost or the approved budget: the budget governs what the recipient
> receives (ADR-004), and relating carriage to it is a commercial decision U3 has not made.

---

### Fulfillment

Tracks delivery execution. The Fulfillment Object is the system of record. WhatsApp and other communication channels are execution tools only.

> ⚠️ **The field list below is the superseded pre-H3.6 draft**, retained for provenance.
> **[ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md), accepted 2026-07-30, re-issues it.** Do not implement against the table as written.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `momentId` | UUID | — |
| `vendorOrderId` | string? | External vendor reference |
| ~~`status`~~ | ~~enum~~ | ⚠️ **Superseded.** ADR-012 fixes exactly three states: `Dispatched` · `DeliveryFailed` · `Delivered`. `Pending`, `Confirmed` and `Returned` are **not** implemented |
| `channel` | enum | Platform / WhatsApp / Email / Phone / Manual |
| ~~`trackingUrl`~~ | ~~string?~~ | ⚠️ Tracking integration is excluded by checkpoint milestone 8 |
| `estimatedDeliveryDate` | ISO date? | — |
| `deliveredAt` | ISO timestamp? | — |
| ~~`proofUrl`~~ | ~~string?~~ | ⚠️ **Superseded.** ADR-012 records proof as **metadata only** — kind (`Photo` · `Document` · `Signature`), channel, actor, timestamps. **No file, no URL, no bytes, no data URI** |
| `notes` | string? | Internal ops notes |
| `updatedAt` | ISO timestamp | Last status change |

**Under ADR-012** there is **one Fulfilment per Moment**, created only when initial dispatch is
confirmed — there is no persisted draft. The Fulfilment holds **current state**; the ordered Event
history is the **historical truth**. `Redelivery` is the only Decision the lifecycle produces.

⚠️ **`MOMENT_STATUSES` is not expanded.** Fulfilment state belongs to the Fulfilment (Atlas §15e).

✅ **Implemented at H3.6**, at `OperationsState` **v7** (additive `fulfilments`). The built record is
twelve fields and is specified in
[`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md) §3, which is authoritative for
it. Of the draft above, **`vendorOrderId`, `channel`, `estimatedDeliveryDate`, `deliveredAt` and
`notes` were not built either** — the delivery instant is on the `Delivered` Event, the channel is an
Event field, and an estimate nothing consumes is speculation. The `Gift / Item` lesson held: almost
none of the draft survived contact with the milestone that built it.

⚠️ **What H3.6 still does not deliver.** Proof *files* are not stored, so Atlas §15b's
*"confirmation + curated proof"* customer promise remains **future architecture**. `QAException`,
dispute adjudication (**OPS-U4b**), `Returned`, `Escalation`, tracking numbers, tracking URLs and
courier webhooks do not exist.

---

### Memory

A record of a past relationship interaction. Owned by Knowledge. Never modified after creation — append only.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `personId` | UUID | — |
| `momentId` | UUID? | Optional link to the triggering Moment |
| `fulfillmentId` | UUID? | Optional link to execution record |
| `type` | enum | Gift / Note / Call / Visit / Event / Milestone |
| `summary` | string | Human-readable description |
| `date` | ISO date | When it happened |
| `createdBy` | UUID | User who logged it (or system) |
| `createdAt` | ISO timestamp | — |

---

### Insight

A computed or AI-generated observation about relationship health. Owned by Insights domain.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `scope` | enum | Organization / Workspace / Class / Person |
| `scopeId` | UUID | — |
| `type` | enum | MissedMoment / SpendAnomaly / EngagementDrop / Recommendation / Milestone |
| `body` | string | Human-readable text |
| `confidence` | 0–1 | Model confidence (1.0 for deterministic rules) |
| `generatedAt` | ISO timestamp | — |
| `expiresAt` | ISO timestamp? | When the insight becomes stale |
| `dismissed` | boolean | — |
| `dismissedBy` | UUID? | — |

---

## 5. Three Key Documents — Definitions

These three documents are frequently confused. Their differences are structural.

| Document | Owner | Auth Required | Lifecycle | Purpose |
|----------|-------|--------------|-----------|---------|
| **Relationship Snapshot** | Prospect (no account) | No | Generated once from Assessment, URL-encoded | Point-in-time diagnostic. Version 0 of the Profile. |
| **Relationship Profile** | Verified Organization | Yes | Live, updated on each program cycle | Operational health record. Lives in Relationship Engine. |
| **Organization Profile** | Verified Organization | Yes | Setup wizard, then maintained | Org configuration, contact verification, workspace settings. Lives in Identity + Relationship Engine. |

---

## 6. Progressive Trust

Progressive Trust is a core platform principle. Aniyé earns depth of relationship with each organization gradually, unlocking capabilities as trust and data increase. No stage forces the user to do more than they are ready for.

```
Visitor
  └─ Assessment (no auth, no account)
       └─ Relationship Snapshot (instant value, no commitment)
            └─ Email Verification (identity confirmed)
                 └─ Organization Workspace (account created)
                      └─ Organization Profile (org context established)
                           └─ Relationship Classes (who matters defined)
                                └─ Recognition Policies (how to recognize them)
                                     └─ Policy Assignments (which policies apply to which classes)
                                          └─ People Import (who they are)
                                          └─ Programs (recognition in motion)
                                               └─ HR Integrations (automated people sync)
                                                    └─ Automation (moments auto-scheduled)
                                                         └─ Intelligence (AI-driven recommendations)
```

**Stage gate rules:**
- Each stage requires completing the previous stage
- No stage requires purchasing before experiencing value
- Concierge fulfillment (WhatsApp-led) bridges Snapshot → Programs before the platform is fully configured
- Feature flags control which stages are available to which organizations

---

## 7. Corporate Journey

The end-to-end operational path for an organization adopting Aniyé.

```
Homepage
  └─ Assessment (4-step conversational wizard)
       └─ Relationship Snapshot (executive report, no auth)
            └─ Consultation (WhatsApp or call — Aniyé concierge)
                 └─ Email Verification (confirms identity)
                      └─ Workspace Creation (name, currency, timezone)
                           └─ Organization Profile (industry, headcount, countries)
                                └─ Relationship Classes (define who matters)
                                     └─ Recognition Policies (reusable policy library — budget, approval, delivery rules)
                                          └─ Policy Assignments (assign policies to Relationship Classes)
                                               └─ People Import (manual, CSV, or HR connector)
                                                    └─ Programs (create and schedule recognition initiatives)
                                                    └─ Execution (moments dispatched, gifts fulfilled)
                                                         └─ Relationship Profile (updated, versioned)
                                                              └─ Knowledge (history, memory, intelligence)
```

**Stage gates:**
| Gate | Requirement |
|------|-------------|
| Assessment → Snapshot | None |
| Snapshot → Verification | Valid email address |
| Verification → Workspace | Email link confirmed |
| Workspace → Classes | Workspace name, currency, timezone |
| Classes → Policies | At least one Relationship Class |
| Policies → Assignments | At least one Recognition Policy |
| Assignments → People | At least one Policy Assignment |
| People → Programs | At least one Person in a Class |
| Programs → Execution | Program in Approved status |

---

## 8. Individual Journey (Horizon 2)

The path for a single person using Aniyé to send a gift. Organized around human **Intent**, not product taxonomy or occasion.

```
Homepage
  └─ Choose: Individual
       └─ Intent (Celebrate / Welcome / Appreciate / Comfort / Festive)
            └─ Category (e.g., Food & Drink, Wellness, Experiences, Home & Living)
                 └─ Collection (curated set for this intent + context)
                      └─ Item (specific product, prominently featured)
                           └─ Recipient (name, delivery address, country)
                                └─ Delivery (date, method, personal message)
                                     └─ Confirmation (order summary + tracking)
                                          └─ Memory (moment recorded — foundation of future intelligence)
```

**Key principles:**
- The customer buys from **Aniyé**, not from a vendor. Vendor information is internal.
- Navigation starts from Intent — not "What are you looking for?" but "What do you want to express?"
- **Auth model:** Guest checkout — no account required to complete a purchase. After order confirmation, the user is offered account creation to save their history and enable future recommendations. Memory records are created in both cases: attributed to an account if the user signs up, anonymous otherwise. Anonymous Memory records can be claimed retroactively if the user signs up within 30 days.
- Individual journey feeds the Knowledge domain, enabling personalized recommendations over time.

> **Horizon:** Individual journey is scoped to Horizon 2. Current MMP (H1) is corporate-only.

---

## 9. Gift Intelligence

Aniyé's catalog is structured around human intent. The customer experiences curation — not a product database.

### Intent Hierarchy

```
Intent  (what the giver wants to express)
  └─ Category  (type of gift)
       └─ Collection  (curated set for a specific context)
            └─ Item  (the specific product)
                 └─ Vendor  (internal only — who fulfills it)
```

### The Five Intents

| Intent | Expresses | Example Occasions |
|--------|-----------|------------------|
| **Celebrate** | Pride, acknowledgment of achievement | Birthdays, promotions, anniversaries, new hires, graduations |
| **Welcome** | Warmth, belonging, first impressions | Onboarding, first meeting, new partnership |
| **Appreciate** | Gratitude, recognition | Thank you, above-and-beyond performance, loyalty |
| **Comfort** | Empathy, presence during difficulty | Bereavement, illness, loss, hardship |
| **Festive** | Shared celebration of season | Christmas, Eid, New Year, Diwali, national holidays |

### Catalog Rules

- Every Item maps to exactly **one Intent**
- Items may appear in **multiple Collections** (a collection is a curation, not an exclusive container)
- Collections are curated by Aniyé's team — never auto-generated from vendor feeds
- Vendor availability is recorded per country
- Budget tiers inform surfacing: given a budget, show Items within ±20% of that range first
- Items are priced in `Money` — always with currency, never as a bare number

### The Vendor Boundary

The customer buys from **Aniyé**. The vendor is a fulfillment partner.

- Vendor names, margins, and internal costs are never shown to the end customer
- If a vendor discontinues an item, Aniyé replaces it with an equivalent — the customer sees continuity
- Vendor performance feeds Knowledge (delivery intelligence) — not the Gift Intelligence catalog directly
- The Item is the product. The Vendor is the mechanism.

---

## 10. Relationship Classes (Full Reference)

Relationship Classes are configurable per workspace. Every class carries a **Relationship Type** and a numeric **Relationship Level** (ADR-002). The list below contains standard templates. Organizations may add custom classes at any time.

### Relationship Type

The nature of the relationship. A closed canonical set of nine values — the only part of a class the platform reasons about categorically.

| Type | Covers |
|------|--------|
| `Employee` | People employed by the organization |
| `Client` | Organizations or individuals who buy from the organization |
| `Partner` | Collaboration, channel, and referral relationships |
| `Supplier` | Vendors and service providers |
| `Board` | Board of directors and governance seats |
| `Investor` | Shareholders, LPs, and funding partners |
| `Government` | Regulatory contacts and public sector relationships |
| `Community` | NGO, foundation, and civic relationships |
| `Other` | Anything the set above does not cover |

### Relationship Level

Relative recognition priority **within a type**.

- Integer, range **0–99**
- **Level 0 is the highest** priority; higher numbers rank lower
- No fixed number of levels — an organization defines as many rungs per type as its structure requires
- Levels need not be dense. Gaps are meaningful and permitted: a single Partner class at level 1 with nothing at level 0 is valid
- The canonical identifier is the number. The class **name** is a display label the organization may rename at any time without changing the class's position
- No job title is encoded in the hierarchy. "Executive Leadership" is a name an organization chose, not a platform concept

Level is comparable only within a type. `Employee` level 0 and `Client` level 0 are both "highest of their kind"; they are not equivalent to each other and the platform never compares them.

### Standard Classes

| Class | Type | Level | Typical Use |
|-------|------|-------|-------------|
| Executive Leadership | Employee | 0 | C-suite, founders |
| Senior Leadership | Employee | 1 | VPs, Directors |
| Managers | Employee | 2 | People managers |
| Staff | Employee | 3 | All remaining employees |
| VIP Clients | Client | 0 | Highest-value, strategic accounts |
| Strategic Clients | Client | 1 | Growth-stage, high-potential accounts |
| Standard Clients | Client | 2 | Active customer base |
| Partners | Partner | 0 | Channel or referral partners |
| Suppliers | Supplier | 0 | Vendors and service providers |
| Board Members | Board | 0 | Board of directors |
| Investors | Investor | 0 | Active shareholders, LPs |

These are the levels a **newly created** workspace is seeded with. A workspace migrated from schema v1 derives its levels from the legacy tier mapping in ADR-002 and may differ — see the migration note there.

**Display order:** by Type in the canonical order above, then by ascending Level, then by name.

**Flexibility rules:**
- Organizations can rename any standard class to match their internal language
- Organizations can create additional classes beyond this list, including multiple levels under the same type
- Classes can be archived (not deleted) to preserve historical records
- A Person may belong to multiple classes (e.g., a client who is also an investor)

---

## 11. Recognition Policy Model

### Why Policies Are Reusable

A Recognition Policy is a standalone object — not owned by a class. This design enables:

- **Cross-class consistency** — a single "Standard Employee Policy" assigned to Managers, Staff, and any future class
- **Multinational operations** — different budget and delivery rules per country, assigned to the same class via country-scoped Policy Assignments
- **Simplified updates** — changing a policy propagates to all classes that reference it, without touching each class individually
- **Audit trail consolidation** — all version history lives on the policy object, not scattered across class definitions

### Canonical Flow

```
Relationship Class
      ↓
  Policy Assignment (global or country-scoped)
      ↓
  Recognition Policy
      ↓
  Program
      ↓
  Moment
      ↓
  Fulfillment
```

### Policy Sections

Every Recognition Policy is organized into five sections:

| Section | Contents |
|---------|----------|
| **Recognition Rules** | Moment types with per-person budgets and enabled/disabled flags |
| **Approval Workflow** | Who must approve before a Program can execute |
| **Experience Preferences** | Preferred gift categories; excluded categories |
| **Delivery Requirements** | Delivery method, timing window, signature and proof requirements |
| **Reporting** | Reporting cadence |

### Policy Lifecycle

```
Draft → Preview → Approve → Publish
```

- **Draft**: editable, not yet applied to any Program
- **Preview**: locked for review; simulation of upcoming moments can be run
- **Approve**: sign-off recorded with approver ID and timestamp
- **Publish**: live, governs all Programs whose Policy Assignments reference this policy
- A new Draft can be created from any Published policy (linked via `parentPolicyId`); the Published version remains active until the new version reaches Published state
- At **Program Approval**, a `policySnapshot` (immutable copy of all referenced policies) is taken and stored on the Program record — the Program always runs under the rules it was approved against, regardless of subsequent policy changes

### Policy Assignment Rules

- A Relationship Class may have zero, one, or many Policy Assignments
- A Global assignment (blank `countryCode`) applies to all countries
- A country-scoped assignment takes precedence over the Global assignment for moments in that country
- Multiple classes may reference the same Recognition Policy
- Only a **Published** policy may be attached to a new assignment
- Assignment changes do not affect Programs already in Approved or Active status

### Assignment Resolution

*Given a Relationship Class and a country, which policy governs recognition right now?*

Implemented in `lib/assignments.ts` as `resolvePolicyAssignment()` — pure, framework-free, and returning a value for every outcome including failure. Nothing throws for ordinary absence.

**Precedence, in order:**

1. **The class must exist and be active.** An inactive class resolves nothing.
2. **Only active assignments for that exact class** are considered. There is no fallback to another class's assignment under any circumstances.
3. **Only assignments whose policy exists and is Published** remain candidates.
4. **Country scope beats Global** for a country lookup.
5. **Higher `priority` wins** within a scope.
6. **Later `updatedAt`**, then **`id`** — so the order is total, and the result never depends on input order.

**Executability is filtered before scope is applied.** An archived country override therefore cannot shadow a working Global assignment: it is not a candidate at all, and the Global assignment resolves instead. Every such fallback is reported on the result's `skipped` list rather than happening silently — an operator must be able to see that a narrower rule was passed over.

**Unresolved reasons** are explicit: `class-not-found`, `class-inactive`, `no-active-assignments`, `no-executable-policy`.

### Active, Inactive, and Archived

| State | Resolves? | Retained? | Notes |
|-------|-----------|-----------|-------|
| Active assignment → Published policy | Yes | Yes | The operational case |
| Inactive assignment | No | **Yes** | Deactivation is the reversible alternative to deletion. Preserved for audit |
| Assignment on an **inactive class** | No | **Yes** | Deactivating a class never deletes its assignments |
| Assignment → **Archived** policy | No | **Yes** | Historical reference is preserved; the policy cannot be selected for a new assignment |
| Assignment → **missing** policy | No | Yes | Reported as `policy-missing`; the assignment is not auto-deleted |

The rule throughout: **resolution is restrictive, retention is permissive.** Nothing is deleted as a side effect of a state change, and nothing that is not currently executable is treated as if it were.

A country code that is stored but malformed is never treated as Global — silently widening an override's reach would be the opposite of the operator's intent. It is ignored and reported.

### Standard Moment Types

| Moment Type | Trigger |
|-------------|---------|
| Birthday | Person's birthday (MM-DD) |
| Work Anniversary | Person's `startDate` anniversary |
| Promotion | Manual trigger or HR event |
| New Hire Welcome | Person's first day |
| Holiday Recognition | Calendar-based (Eid, Christmas, New Year, etc.) |
| Client Anniversary | Relationship `startDate` anniversary |
| Deal Closure | Manual trigger or CRM event |
| Achievement Recognition | Manual trigger |
| Farewell | Manual trigger or HR deactivation event |

### Example: Employee Recognition — Birthday

**Two classes, two policy assignments, one shared policy:**

| Class | Policy Assignment | Recognition Policy | Budget / Person | Approval |
|-------|------------------|--------------------|----------------|----------|
| Executive Leadership | Global | Executive Recognition Policy | NGN 500,000 | CEO |
| Senior Leadership | Global | Senior Recognition Policy | NGN 250,000 | Manager |
| Managers | Global | Standard Employee Policy | NGN 150,000 | Manager |
| Staff | Global | Standard Employee Policy | NGN 75,000 | None |

**Observation:** Managers and Staff share "Standard Employee Policy." The policy is the same object — classes simply reference it. Future versions will support per-assignment budget overrides without requiring separate policy objects.

### Example: Multinational Policy Assignments

| Class | Scope | Recognition Policy | Budget / Person |
|-------|-------|--------------------|----------------|
| Executive Leadership | Global (default) | Executive Recognition Policy | NGN 500,000 |
| Executive Leadership | Kenya | Executive Recognition Policy — KE | KES 250,000 |
| Executive Leadership | South Africa | Executive Recognition Policy — ZA | ZAR 8,000 |

**Observation:** One class, three assignments. Country-scoped assignments override the global default. Programs in Nigeria use the global policy; Programs in Kenya or South Africa use their country-specific policy.

---

## 12. Integration Layer — People Sources

### Canonical Abstraction

Aniyé defines its own Person model. No HR system's schema dictates Aniyé's internal structure. Every external source is normalized at the integration boundary before touching the canonical model.

```
External HR System
      ↓
  Connector (source-specific adapter)
      ↓
  Normalization (maps to CanonicalPersonImport)
      ↓
  Validation (required fields, format checks)
      ↓
  Deduplication (email-based match, merge rules)
      ↓
  Canonical Person record
```

### Supported People Sources

Implementation status as of H2.5: **Manual and CSV are built.** Everything below them is a connector that produces the same canonical shape — none exist yet, and the `HRIS` source type stands in for all of them.

| Source | Type | Horizon | Status |
|--------|------|---------|--------|
| Manual entry | Built-in | H1 | ✅ Implemented (H2.5) |
| CSV upload | Built-in | H2 | ✅ Implemented (H2.5) |
| Excel upload | Built-in | H2 | Not implemented — ledger compromise **P5** |
| Google Sheets | Integration | **H5.4** | Not implemented |
| BambooHR | Integration | **H5.4** | Not implemented |
| HiBob | Integration | **H5.4** | Not implemented |
| Personio | Integration | **H5.4** | Not implemented |
| Rippling | Integration | **H5.4** | Not implemented |
| Deel | Integration | **H5.4** | Not implemented |
| Workday | Integration | **H5.4** | Not implemented |
| SAP SuccessFactors | Integration | **H5.4** | Not implemented |
| Oracle HCM | Integration | **H5.4** | Not implemented |

> **Horizon corrected 2026-07-28 (Council).** This table previously placed Google Sheets, BambooHR,
> HiBob and Personio at **H3** and the rest at **H4**. **Every external connector is now H5.4 —
> Integrations.** H3 is the closed operational loop and H4 is Learn; neither contains connector work.
> See [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md). Ledger compromise **P3** — configurable source
> priority — is classified against H5.4 for the same reason.

### Canonical Import Interface

Every connector must produce this shape before entering Aniyé:

```typescript
interface CanonicalPersonImport {
  externalId: string;       // source system's unique identifier
  firstName: string;
  lastName: string;
  email: string;            // primary deduplication key
  phone?: string;
  country?: string;         // ISO 3166-1 alpha-2
  role?: string;
  startDate?: string;       // ISO 8601 date
  birthday?: string;        // MM-DD (no year)
  department?: string;
  manager?: string;         // external ID of manager
  tags?: string[];
  rawSource?: Record<string, unknown>; // preserved for audit, never used in logic
}
```

### Normalization Rules

**Implemented in H2.5:**

| Field | Rule |
|-------|------|
| `email` | Trimmed and lowercased. The **only** automatic duplicate key |
| `country` | Trimmed and uppercased; must be two letters or the row is rejected |
| `birthday` | `MM-DD`, `MM/DD`, `YYYY-MM-DD`, or `YYYY/MM/DD` accepted; stored as `MM-DD` |
| `startDate` | `YYYY-MM-DD` or `YYYY/MM/DD` accepted; stored as `YYYY-MM-DD` |
| `phone` | Trimmed, internal whitespace collapsed. Never normalized into an identity key |

Email normalization stops at trim-and-lowercase. Plus-address stripping and provider-specific dot folding are deliberately **not** done: they are heuristics, and treating two genuinely different addresses as one person is a worse failure than leaving a duplicate for an operator to resolve.

**Not yet implemented:** admin-`locked` fields, and the `rawSource` audit blob. Field-level provenance — remembering which source last set each individual field — is explicitly out of scope until connectors exist.

### Duplicate Identity

- **Normalized email is the primary automatic duplicate key.** A record with no usable email is **never** merged automatically — there is no key to match on, and inferring identity from a name is how directories get silently corrupted.
- **Phone numbers never merge records.** A phone match is surfaced as a warning only. Numbers are shared, reassigned, and mistyped too often to be treated as identity.
- **A repeated email within a single import file** is imported once; later rows are reported as duplicates pointing at the earlier row.
- **Name + startDate matching** is specified above for a future connector; it is not implemented, and would flag for review rather than merge.

### Synchronization

- Push sync: HR system notifies Aniyé via webhook on record changes
- Pull sync: Aniyé polls the HR system on a configurable schedule (default: daily)
- Full refresh: replaces all records from source; used on initial import and on request
- Delta sync: processes only changes since last sync; preferred for ongoing operation

### Source Priority

**Canonical ranking (highest to lowest): `HRIS` > `CSV` > `Manual`.**

The reasoning is **authority, not recency**. An HRIS is the system of record for employment facts; a CSV is a deliberate bulk statement; a manual entry is one person typing. A higher-priority source may correct a lower one, never the reverse.

Precedence only ever decides *which record wins a collision*. It never deletes anything.

**Implemented in H2.5.** Reranking per workspace and admin-locked fields are specified but not built.

### Duplicate Behaviour

When an incoming record matches an existing normalized email:

| Case | Outcome |
|------|---------|
| **Existing source ranks higher** | The existing record is kept untouched. The incoming row is reported as a duplicate, with the reason naming both sources |
| **Equal priority** | The existing record is kept. Reported as needing operator review rather than overwritten — an equal-authority collision has no automatic winner |
| **Incoming source ranks higher** | The existing record is **updated in place** |

An update under precedence preserves, in every case:

- the existing **`id`** and `createdAt` — this is an update, not a replacement
- **any field the incoming record did not supply.** Absence is not an instruction to erase
- **class assignments**, unless the incoming record explicitly carried replacements
- **`status` and `archivedAt`** — an import must never silently resurrect someone an operator archived

...and records the new `sourceId` and `sourceType`.

### Class Assignment on Import

Class references resolve by **exact match only**, in this order:

1. `relationship_class_id` — an exact class id
2. an exact normalized display name (trimmed, lowercased, internal whitespace collapsed)
3. an exact **Relationship Type + numeric Level** pair

**There is no fuzzy matching at any step.** A near-miss on a class name would quietly put people into the wrong recognition tier — the kind of error nobody notices until a gift reaches the wrong person.

| Situation | Behaviour |
|-----------|-----------|
| Reference matches exactly one class | Assigned |
| Reference matches **more than one** class | Row is blocked as *Ambiguous class*. Nothing is assigned |
| Reference matches nothing | Warned, left unassigned; the person still imports |
| Reference matches an **inactive** class | Warned, not assigned; the person still imports |
| No class reference at all | Person imports as *Ready — unassigned* |

A person may be imported without a class. They are flagged as unassigned rather than rejected, because an unassigned person is recoverable and a rejected import row is not.

### Conflict Resolution

| Scenario | Resolution |
|----------|-----------|
| New person, no match | Create canonical Person |
| No usable email | Create — never merged automatically |
| Email match, incoming source ranks higher | Update in place, preserving id and unsupplied fields |
| Email match, incoming source ranks lower | Keep existing; report the incoming row as a duplicate |
| Email match, equal priority | Keep existing; flag for operator review — never overwrite |
| Email repeated within one import file | Import the first; report later rows against it |
| Name + startDate match, different email | Flag for manual review — do not auto-merge *(specified, not implemented)* |
| Person removed from source | Archive — never auto-delete |
| Admin-locked field, any source | Skip — never overwrite locked fields *(specified, not implemented)* |

### Import Result States

Every previewed row carries exactly one outcome, shown before anything is written:

| State | Meaning |
|-------|---------|
| **Ready** | Will be added, with classes assigned |
| **Ready — unassigned** | Will be added with no Relationship Class |
| **Will update higher-priority record** | Matches an existing person from a lower-priority source |
| **Duplicate — existing record retained** | Matches an existing person from an equal or higher-priority source |
| **Invalid** | A field failed normalization |
| **Ambiguous class** | A class reference matched more than one class |
| **Missing required field** | No first name or no last name |

Only the first three write anything. Import returns counts for created, updated, skipped, and invalid rows.

### Event Handling

HR integration events that trigger downstream actions in Aniyé:

| Event | Aniyé Action |
|-------|-------------|
| `person.created` | Create Person record, assign to default Relationship Class if configured |
| `person.updated` (birthday) | Reschedule any pending Birthday moments |
| `person.updated` (startDate) | Recalculate Work Anniversary dates |
| `person.deactivated` | Mark Person inactive, cancel pending Moments, notify admin |
| `person.reactivated` | Restore Person, prompt admin to review |
| `sync.failed` | Notify admin, halt dependent automation, log incident |

---

## 13. Fulfillment Architecture

### WhatsApp Is a Channel, Not a System of Record

The Fulfillment Object is the system of record. WhatsApp, email, phone, and any other communication tool are execution channels only. If a delivery update happens over WhatsApp, it must be recorded back into the Fulfillment Object before it has any operational meaning.

### Fulfillment Flow

```
Moment (Approved)
      ↓
  Fulfillment Object created (status: Pending)
      ↓
  Channel selected (Platform / WhatsApp / Email)
      ↓
  Vendor notified (internal — not shown to customer)
      ↓
  Fulfillment Object updated (status: Confirmed)
      ↓
  Dispatch (status: Dispatched, tracking URL recorded)
      ↓
  Delivery (status: Delivered, deliveredAt recorded)
      ↓
  Proof captured (proofUrl recorded if required)
      ↓
  Memory record created (Knowledge domain)
      ↓
  Moment marked: Fulfilled
```

### In H1 (Concierge Mode)

During H1, fulfillment is concierge-led. Every WhatsApp consultation must end with an Aniyé ops team member completing a structured Fulfillment Object — not leaving the record in the chat thread.

**H1 Fulfillment Object — required fields (ops intake form):**

| Field | Type | Notes |
|-------|------|-------|
| `momentType` | string | e.g., Birthday, Client Appreciation |
| `recipientName` | string | Full name |
| `recipientPhone` | string | For delivery coordination |
| `recipientAddress` | string | Street address — required for physical delivery |
| `recipientCountry` | string | ISO code |
| `itemDescription` | string | What was agreed / what is being sent |
| `budget` | Money | Amount + currency, agreed during consultation |
| `scheduledDate` | ISO date | When delivery should happen |
| `deliveryRequirement` | enum | Standard / Courier / HandDelivered / Digital |
| `notes` | string? | Special instructions, dietary info, etc. |
| `channel` | enum | Always `WhatsApp` in H1 |

**H1 flow:**
1. Assessment → Snapshot
2. User contacts Aniyé via WhatsApp
3. Consultation happens (WhatsApp is the communication channel)
4. Aniyé ops completes the structured intake form → Fulfillment Object created (status: Pending)
5. All subsequent status updates are logged into the Fulfillment Object
6. Completion creates a Memory record in the Knowledge domain
7. The Fulfillment Object — not the WhatsApp thread — is what counts

This schema is the exact schema H3 automation inherits. No data archaeology needed when fulfillment becomes platform-automated.

---

## 14. Configuration Lifecycle

All major configuration objects follow this lifecycle. No configuration goes live without an Approve step.

```
Draft → Preview → Approve → Publish
```

**Applies to:**
- Relationship Policies
- Programs
- Budgets (program-level and workspace-level)
- Organization Settings (workspace currency, timezone, default policies)
- Major platform configuration (feature flags, API keys, integration settings)

| Stage | State | Who Can Act | What Happens |
|-------|-------|-------------|-------------|
| **Draft** | Editable | Creator, admins | Changes saved, not active |
| **Preview** | Locked | Reviewer | Simulation of upcoming moments can be run; no real actions |
| **Approve** | Approved | Designated approver | Sign-off recorded with user ID + timestamp |
| **Publish** | Live | System | Configuration is active; governs all downstream objects |
| **Archive** | Inactive | Admin | Preserved for history; a new Draft can begin |

**Rule:** A Published configuration is immutable. To change it, create a new Draft. The currently Published version remains active until the new version reaches Published state.

---

## 15. Platform Resilience

### API Versioning
- All APIs are versioned: `/api/v1/`, `/api/v2/`
- A version is supported for ≥12 months after the next version ships
- Breaking changes require a new version number; additive changes do not
- Deprecation notices appear in API responses 90 days before sunset

### Database Migrations
- Additive only: new columns, new tables, new indexes
- Never drop or rename a column without a deprecation period
- Large data migrations run as background jobs — never blocking deploys
- Every migration is reversible or has a documented rollback procedure

### Client Schema Versioning

Until the backend exists, the workspace is persisted client-side and carries its own schema version. The same discipline applies as to database migrations, adapted to a store that cannot be migrated centrally — every browser holds a payload that may be any age, and the app must be able to read all of them.

- `WorkspaceState.schemaVersion` is an integer stamped on every write. A payload with **no** version is by definition the pre-versioning H2.3 schema (v1)
- Migrations form an **ordered chain**, one version to the next. The runner walks the chain and never skips a rung
- Migrations are **idempotent** and never re-run: a payload already at the current version is returned untouched, with no write
- Migrations are **pinned to the schema version they target**. A migration validates against the value set as it stood at that version, deliberately decoupled from the app's live enums, so that a later ADR extending an enum cannot retroactively change how historical data was migrated
- A **backup** of the verbatim pre-migration payload is written before any destructive migration is persisted, keyed `aniye_workspace_backup_v<from>_<timestamp>`. No backup is taken on a normal read
- Migration **fails safely**: a payload that cannot be read or that fails post-migration validation is never overwritten. It is quarantined so the next workspace creation cannot destroy it
- A payload from a **newer** schema version than the running build is refused rather than downgraded

Implementation: `lib/migrations.ts`, `lib/money.ts`. Validation: `validate:migration`, `validate:assignments`, `validate:people`, `validate:money`, `validate:verification`.

**v4 → v5 is destructive** — every Money value is rewritten as `amountMinor = round(amount × 10^exponent)`, so the pre-migration payload is backed up verbatim first. A currency absent from the pinned table is left unconverted and the workspace is then refused by validation, rather than being stored at a scale nobody can determine. Excess precision is rounded half away from zero and reported as a migration warning. The Person widening in the same rung is purely additive: no record changes state, and nothing is ever migrated *into* `Inactive`.

**Version history:**

| Version | Milestone | Change |
|---------|-----------|--------|
| v1 | H2.3 | The pre-versioning shape. Identified by the *absence* of `schemaVersion` |
| v2 | ADR-002 | `RelationshipClass.category` + `tier` → `type` + numeric `level` |
| v3 | H2.4 | Adds the `policyAssignments` collection and the `assignments` setup stage |
| v4 | H2.5 | Adds the `peopleSources` and `people` collections |
| v5 | R4 | **ADR-007** — Money converted from major-unit face values to integer minor units. **ADR-008** — Person status widened to include `Inactive` |
| v6 | H2.6 | Adds the `programs` collection; validates `baseCurrency` against the pinned table |

**Setup stage remap (v2 → v3).** The `assignments` step is new, so a v2 workspace that had already moved past `policies` had skipped a step that now exists:

- `profile`, `classes`, `policies` — unchanged
- `people`, `programs`, `active` → **`assignments`**, when at least one Published policy exists
- `people`, `programs`, `active` → **`policies`**, when none does

The second case matters: an assignment cannot be created without a Published policy, so routing the operator to `assignments` with nothing to assign would dead-end them. The remap is recorded as a migration warning rather than performed silently.

**v3 → v4 is purely additive.** Two empty collections, nothing existing touched, `setupStage` deliberately left alone — the `people` stage already existed in the v3 stage list, so unlike the v2 → v3 remap there is no step a workspace could have skipped. Because nothing is rewritten, no backup is taken.

### Feature Flags
- Named by domain: `identity.email_verification`, `engine.programs`, `integrations.bamboohr`
- Boolean by default; percentage rollout available for gradual releases
- Cleaned up within one major version of general availability
- No feature flag should outlive its horizon

### Deployment
- Zero-downtime deploys: blue/green or rolling
- Every deploy is reversible within 10 minutes
- Production deploys require a passing build and all integration tests green

### The Boundary Rule
No external system dictates Aniyé's internal model. All external data is translated at the integration boundary. Aniyé's canonical model is the only source of truth.

---

## 15b. Workspace versus Operations

> ✅ **Partly implemented in H3.1.** `/operations/*` exists with its own shell, navigation and
> route tree. **No role model and no authentication exist** — anyone who can reach the app can
> reach Operations. That is acceptable for an internal prototype and is a hard blocker for a pilot
> (§15d).

**ADR-005 (Accepted):** `/workspace/*` serves organization administrators configuring recognition. `/operations/*` serves Aniyé internal operators executing it. They share **canonical objects and a design system**, and share **neither shell, navigation, roles, nor route tree**.

| | Workspace | Operations |
|---|-----------|------------|
| Audience | Organization administrators | Aniyé internal operators |
| Scope | One organization | Across all organizations |
| Owns | Profile, groups, policies, assignments, people, programs, customer-facing approvals and reports | Moments, Execution Briefs, item selection, vendor offers, courier selection, QA, fulfilment, exceptions, commercial detail, Decisions, Operational Events |

**Never projected into Workspace:** vendor cost, courier cost, margin, vendor and courier identity, QA exceptions, internal notes. The customer sees *what happened and what it cost them*; Operations sees *how it happened and what it cost us*.

**Operations may read configuration and propose corrections, but must never silently modify it.** An operator who spots a wrong address raises a suggestion the administrator accepts. Internal users may open a **read-only** view of a customer workspace, which emits an Operational Event visible in the customer's own audit trail.

Placing Operations navigation inside the Workspace sidebar is **rejected**.

---

## 15c. Decisions and Operational Events

> ✅ **Implemented in H3.1**, in the separate `OperationsState` (§15d), not in the workspace document.

**ADR-006 (Accepted):** A **Decision** records a judgement between alternatives; it carries a required reason, may be superseded, and is never mutated. An **OperationalEvent** records that something happened; it is append-only, never edited, and corrected only by appending a referencing event.

The test: *could it have gone another way, and does the reason matter later?* If yes, Decision. If not, Event.

- Deterministic rule results **are** Decisions, with `provider: System`.
- Ordinary CRUD is audit, not an Operational Event — the test is whether it changes the state of a Moment's execution.
- Failed actions are first-class Events, never absences.
- Early H3 uses only **`Confirmed`** and **`Superseded`** decision statuses.

**The recording rule:** draft choices stay in UI state; **only confirmation writes**, and it writes the state change, the Decision and the Operational Event together. Browsing and abandoned selections are never persisted as Decisions.

Both objects belong to the **Knowledge** domain (§3). ADR-010 keeps them out of `WorkspaceState` entirely — see §15d.

**H3.1 scope.** Decision types: `MomentQualification`, `PolicyResolution`, `MomentCancellation`. Event types: `MomentCreated`, `MomentMarkedReady`, `MomentNeedsReview`, `MomentCancelled`. Providers: `RuleEngine` for deterministic resolution, `HumanOperator` for judgement. More arrive with the steps that produce them.

---

## 15d. Operational persistence — ADR-010

> ⚠️ **Internal prototype only. Browser storage. Not production-safe.**

`WorkspaceState` is **customer configuration** and stays that way. Operational records — Moments, Decisions, Operational Events — live in a **separate `OperationsState`** belonging to exactly one `workspaceId`.

| | WorkspaceState | OperationsState |
|---|---------------|-----------------|
| Owns | Configuration the customer edits | The record of what Aniyé did |
| Schema | v7 | v6, versioned **independently** |
| Storage key | `aniye_workspace` | `aniye_operations_v1` |
| Growth | Bounded by organization size | Unbounded |
| Mutability | Edited freely | Events append-only; Decisions immutable except supersession |

Access is through a **repository interface** with named operations — create moments, append a Decision, append an Event. There is deliberately no generic `save(state)`: a generic setter is how append-only guarantees get lost.

**A payload belonging to a different workspace is refused, never adopted**, and preserved rather than overwritten — it is another organization's history.

### What the local adapter is not

**Mandatory before any external pilot:** a production backend, authentication for both customer administrators and internal operators, multi-tenancy with enforced isolation, and secure file storage before proof of delivery exists.

**Until Operations uses browser-only persistence, no vendor, courier, recipient or additional internal user may be given access.** Each implies a second party reading or writing operational records, and this adapter can authenticate nobody, isolate nobody, and prevent nobody with devtools from rewriting the audit trail.

---

## 15e. Moment

> ✅ **Implemented in H3.1** — generation only. Fulfilment stages do not exist.

One person, one occasion, one execution. Generated from an Active Campaign's frozen population.

| Field | Notes |
|-------|-------|
| `sourceKey` | Deterministic logical identity — `campaign::workspace::program::person::occasion`. What makes repeat preparation idempotent |
| `recipientSnapshot` | Name, email, phone, country, role. **A subset, not the whole Person** |
| `relationshipGroupSnapshot` | Group id, display name, Relationship Type, numeric Level |
| `policyResolutionSnapshot` | Assignment id, policy id, name, **version**, country scope, occasion, approved budget as canonical Money, excluded categories, and the four delivery promises. The delivery fields are absent only on legacy pre-v6 records and are never defaulted |
| `issues` | Named, each with the Workspace page that fixes it |
| `status` | `NeedsReview` · `ReadyForExecution` · `Cancelled` |

**Statuses stop at generation.** Dispatched, delivered and closed do not exist and must not be added speculatively — each needs the object that produces it.

**The policy snapshot is the piece ADR-004 deferred from the Program.** It must still explain why this Moment received this budget after the policy is edited, republished or archived, which is why it captures the version rather than a reference.

### Eligibility is re-evaluated, and nobody is silently dropped

A Campaign froze *who is covered*. It did not freeze *whether they can be executed*. Between activation and preparation someone may have been paused, a group turned off, a rule unpublished.

**A Moment is created for every frozen person.** One that cannot proceed is marked `NeedsReview` with a named issue, not skipped — skipping would lose them. Operations links to the Workspace page that fixes each issue and **never edits configuration itself** (ADR-005).

### Atomic confirmation

Previewing writes nothing. On confirmation, one operation commits Moments, qualification Decisions, policy-resolution Decisions and Operational Events **together** — the proposed state is validated in full first, so a batch that would produce an invalid state commits nothing at all.

### The preview shows; the confirmation re-reads

**Nothing is written from state captured earlier.** At confirmation the Workspace is read again, the
Program is located again and checked for `Active`, and its frozen population, People, Relationship
Groups, policy assignments, Recognition Policies and existing Moment source keys are all re-read.
The batch is built from that live state, never from the collections the page was holding.

**If live state moved while the operator was reviewing, nothing is written.** The screen is replaced
with the current figures, the change is explained in plain language, and the operator must look
again and confirm a second time. Comparison ignores timestamps and generated record ids — otherwise
every confirmation would report a spurious change and train operators to click through the warning.

**If the Workspace cannot be read, the Program is missing or no longer Active, or the operations
store cannot be read**, nothing is written and the actual problem is shown with a recovery. None of
these is ever presented as an empty queue or as success.

> Closes defect **H3.1-D1**, found by the H3.1 recovery-integrity audit: confirmation previously
> refreshed only the timestamp, so a person archived — or a group, assignment or policy changed —
> between preview and confirmation could still produce a `ReadyForExecution` Moment carrying a stale
> snapshot. The repository's duplicate backstop always prevented duplicates; there was no equivalent
> guard for eligibility. Covered by 15 regression checks.

---

## 15f. Execution Brief

> ✅ **Implemented in H3.2** — `OperationsState` v2, carried forward at v5.

The operator's unit of work for one Moment: **who, where, how much, and what constraints apply.**
Deliberately invisible to the customer — nothing here is projected into Workspace.

| Field | Notes |
|-------|-------|
| `status` | `Confirmed` · `Superseded`. **There is no `Draft`** — an unconfirmed brief is UI preview state, exactly as ADR-006 requires of every draft choice |
| `revision` | 1 on first confirmation, incrementing with each correction |
| `revisionOfBriefId` / `supersededByBriefId` | The correction chain, in both directions |
| `deliveryAddressSnapshot` | **Copied** from `Person.deliveryAddress` at confirmation, never referenced |
| `addressSource` | `PersonDefault` · `OperatorOverride` |
| `addressOverride` | Reason, actor, channel, timestamp and the previous address. Present only on an override |
| `policyResolutionSnapshot`, `approvedBudget`, `constraints` | Read from the **Moment's** snapshot, never re-resolved live |

**Only a `ReadyForExecution` Moment can produce a brief.** A Moment still under review has no
resolved budget, so there are no constraints to brief against.

### The address gate

**A missing address never blocks Moment generation** — `MOMENT_STATUSES` is not expanded, because
address completeness is a property of the brief, not of the Moment (ADR-011).

**It blocks brief confirmation**, and the block names the missing fields and links to the Workspace
page that fixes them. Enforced at the persistence layer as well as in the interface: a stored brief
whose address is incomplete is refused, so the gate cannot be bypassed by a caller.

### Override and correction

An operator who finds an address wrong **overrides it for that brief alone**, with a required
reason, actor, channel and timestamp. **`Person.deliveryAddress` is never written** — not
automatically, not eventually (ADR-005).

Correcting an already-confirmed brief **preserves the original**: a new revision is created, the
original is marked `Superseded` with nothing else rewritten, the confirming Decision is superseded,
and an **`ExecutionBriefAddressOverridden`** Event is appended. A Moment never holds two live briefs.

**H3.2 scope.** Decision types: `BriefConfirmation`, `AddressOverride`. Event types:
`BriefGenerated`, `ExecutionBriefAddressOverridden`. More arrive with the steps that produce them.

---

## 16. Enterprise Readiness (Architectural Foundations)

These capabilities are not built yet. They are documented here to ensure architectural decisions made in H1–H3 do not block their implementation in H4–H5.

### Multiple Administrators
- Every Workspace will support multiple users with distinct roles
- Role model: Owner / Admin / Manager / Viewer
- Permissions are workspace-scoped; a user may have different roles in different workspaces
- Implementation: role-based access control (RBAC), not hardcoded permissions

### Workspace Permissions
- Fine-grained permissions on sensitive operations: Approve Programs, Approve Spend, Import People, Manage Integrations
- Permission sets are configurable by workspace Owners

### Audit Logs
- Every state-changing action is recorded: who, what, when, from where
- Audit logs are append-only and never purged
- Exportable for compliance reporting
- Scope: Organization, Workspace, or object-level (e.g., all changes to a specific Program)

### Version History
- All major configuration objects (Policies, Programs, Organization Profile) maintain a version history
- Any previous version can be viewed and compared
- Rollback to a previous Published version is supported

### Import History
- Every People import creates an Import Record: source, timestamp, rows processed, conflicts flagged, outcome
- Import Records are retained indefinitely
- Admins can audit who imported what and when

### API Keys
- Organizations will be able to generate API keys scoped to specific operations
- Keys are rotatable without service interruption
- Key usage is logged

### Enterprise Integrations
- SAML/SSO for identity federation (Azure AD, Okta, Google Workspace)
- Scheduled integration health reports
- Integration-level permissions (who can configure, who can view sync status)

> **Build rule:** Every H1–H3 decision should be answerable by: "Does this close off any of the enterprise capabilities above?" If yes, reconsider.

---

## 17. Horizon Roadmap

> **Reading this document:** the Atlas describes both *accepted architecture* and *implemented
> capability*, and they are not the same thing. Sections describing something not yet built carry an
> explicit ⚠️ marker. As of **Workspace schema v7 and `OperationsState` v6**:
>
> | Implemented | Accepted but not implemented |
> |-------------|------------------------------|
> | Organization Profile, Relationship Class, Recognition Policy, Policy Assignment, Person, People Source, Money, Program (Campaign mode), Moment (generation), Decision, Operational Event, the `/operations` shell, recipient address, Execution Brief, the minimum flat Catalog and manual item selection, the manual Vendor directory, hand-entered VendorOffers and manual vendor selection, **the per-country Courier directory and manual courier selection** | Program (Recurring, Triggered), **Catalog/Gift/Vendor Intelligence**, vendor or courier accounts and portals, courier rate APIs and tracking, Fulfilment *(ADR-012 accepted, not implemented)*, Recognition Order, Approval, roles and authentication, production backend, **secure file storage for proof** |

> **The authoritative roadmap is [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md).** The horizon table below
> is the thematic summary; `MASTER_ROADMAP.md` carries the canonical H3.1 … H3.8 milestone
> definitions, their dependencies and their status, and governs roadmap reporting.

| Horizon | Theme | Key Deliverables |
|---------|-------|-----------------|
| **H1** | Assessment + Snapshot | Homepage, Assessment wizard, Relationship Snapshot, concierge fulfillment (manual, WhatsApp-led), Fulfillment Object architecture |
| **H2** | Organization Profile + Individual Journey | Email verification, workspace creation, Organization Profile, Relationship Profile v1, Individual gifting flow (Intent → Memory), basic People import (CSV/Excel) |
| **H3** | Operational execution — the closed loop | Moment Engine, Execution Brief, minimum Catalog, vendor and courier directories, Fulfilment tracking, Recognition Order, Confirmation and Memory. **Milestones H3.1 … H3.8 — see [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md)** |
| **H4** | **Learn** | Pre-pilot completion (Recurring and Triggered Program modes, customer-facing Moment visibility, redelivery handling, EX-H1, EX-H3, live device testing), the controlled pilot, then Catalog / Gift / Vendor Intelligence, AI-generated Insights, automated moment scheduling, Relationship Profile v2, spend analytics — **each built on pilot evidence** |
| **H5** | Relationship Infrastructure | Production backend, authentication, roles, tenant isolation; multi-workspace and multi-country operations; enterprise permissions, API keys, SAML/SSO; **H5.4 Integrations — Google Sheets, BambooHR, HiBob, Personio, Rippling, Deel, Workday, SAP, Oracle**; partner network, full Relationship OS across Africa |

---

## 18. Resolved Architecture Decisions

These decisions were resolved before H2 implementation. Documented for audit trail.

| # | Decision | Resolution | Documented In |
|---|----------|-----------|--------------|
| 1 | Budget currency default | Workspace `baseCurrency` cascades to all Policies. Each Policy may override. Exchange rate locked at Program Approval. | §4 Money, §11 Policy Model |
| 2 | Individual journey auth | Guest checkout — no account required. Account offer post-confirmation. Anonymous Memory records claimable within 30 days. | §8 Individual Journey |
| 3 | Concierge handoff format | Structured 10-field intake form per consultation → Fulfillment Object. Recipient address required. Same schema H3 automation inherits. | §13 Fulfillment Architecture |
| 4 | Relationship Profile versioning trigger | Program status changes (Active/Completed) + nightly background recalculation if Moments changed that day. Not per-Moment in real time. | §4 Relationship Profile |
| 5 | Person deduplication authority | Configurable source priority per workspace. Default: HR integrations > CSV/Excel > Manual. Admin-locked fields never overwritten. Conflicts logged. | §12 Integration Layer |
| ADR-001 | Recognition Policy promoted to first-class reusable object | Policies are standalone objects not owned by any class. Classes reference policies via Policy Assignments. Supports multinational orgs (country-scoped assignments) and cross-class reuse. `policySnapshot` at Program Approval makes programs immutable to policy changes. **Fully implemented as of H2.4** — the Policy Assignment linking layer now exists, closing the Class → Assignment → Policy chain that ADR-001 specified. | §4 Recognition Policy, §4 Policy Assignment, §11 Recognition Policy Model |
| ADR-002 | Relationship Class described by Relationship Type + numeric Relationship Level | The `RelationshipCategory` + `RelationshipTier` model is superseded. Type states the nature of the relationship (nine canonical values); Level states relative recognition priority within that type, as an organization-defined integer 0–99 where 0 is highest. Existing persisted workspaces are migrated by an explicit, versioned mapping. | §4 Relationship Class, §10 Relationship Classes, ADR-002 below |

### ADR registry

Full records for ADR-004 onward live in [`adr/`](adr/). Accepted decisions are binding; each carries the Council conditions attached at acceptance.

| # | Decision | Status | Implemented |
|---|----------|--------|-------------|
| 1–5 | Pre-H2 decisions (table above) | Accepted | Yes |
| **ADR-001** | Recognition Policy as a first-class reusable object | Accepted | Yes — H2.3 / H2.4 |
| **ADR-002** | Relationship Type + numeric Relationship Level | Accepted | Yes — schema v2 |
| **ADR-003** | — | ⚠️ **Retired** | See note below |
| **ADR-004** | Program is an operational commitment | Accepted 2026-07-27 | **Partly** — Campaign mode, schema v6. Recurring and Triggered not implemented |
| **ADR-005** | Workspace and Operations are separate surfaces | Accepted 2026-07-27 | **Partly** — H3.1. Separate route tree, shell and navigation exist (§15b). **No roles and no authentication** |
| **ADR-006** | Decisions vs Operational Events | Accepted 2026-07-27 | **Partly** — H3.1. Decisions and Events exist for Moment generation only (§15c) |
| **ADR-007** | Money as integer minor units | Accepted 2026-07-27 | **Partly** — Money implemented, schema v5. `RecognitionOrder` deferred to H3.7 |
| **ADR-008** | Person has three lifecycle states | Accepted 2026-07-27 | **Yes** — schema v5 |
| **ADR-009** | Policy lifecycle stays three states | Accepted 2026-07-27 | **Yes** — no code change was required |
| **ADR-010** | Operational records live outside `WorkspaceState` | Accepted 2026-07-27 | **Yes** — H3.1, `OperationsState` v1 (§15d) |
| **ADR-011** | Recipient address is customer-owned; operator overrides are per-brief | Accepted 2026-07-28 | **Yes** — H3.2, Workspace schema v7 + `OperationsState` v2 (§15f) |
| **ADR-012** | Fulfilment lifecycle and the proof-receipt boundary | Accepted 2026-07-30 | ⬜ **No** — H3.6 not begun. The separate policy-snapshot prerequisite has landed at `OperationsState` v6 (§4 *Fulfillment*) |

#### ⚠️ ADR-003 — retired

**ADR-003 is retired. The number is not reused and not renumbered.**

The recovery audit found a reference to an "ADR-003 — Decision Engine" among the work lost with the previous development machine. Only the number and a title survived — not the decision, not the reasoning, not the object. It was never reconstructed, and the H2 → H3 checkpoint concluded it should not be: policy resolution already exists as `resolvePolicyAssignment()`, and recording judgements is ADR-006's `Decision`.

Reusing the number would make a historical reference point at something never agreed. An empty rung is a smaller cost than a misleading one. Full note: [`adr/README.md`](adr/README.md).

### ADR-002 — Relationship Type + Relationship Level

**Status:** Accepted. Supersedes the Category/Tier model introduced in H2.2.

**Context.** H2.2 described a Relationship Class with two string enums: `category` (Internal, Client, Governance, Partner, Supplier, Community, Other) and `tier` (Strategic, Priority, Standard, Custom). Three problems surfaced:

1. **`tier` was a closed four-value scale.** An organization with five rungs of seniority could not express the fifth. The ceiling was arbitrary and structural.
2. **`category` conflated distinct relationships.** `Governance` covered both board seats and shareholdings, and there was no way at all to express a government or regulatory relationship.
3. **Tier names implied a fixed hierarchy.** "Strategic" and "Standard" read as platform-defined seniority, which invited job titles into what should be an organization-defined ordering.

**Decision.**

- A Relationship Class is described by two independent axes: **Relationship Type** and **Relationship Level**.
- **Relationship Type** represents the *nature* of the relationship. Nine canonical values: `Employee`, `Client`, `Partner`, `Supplier`, `Board`, `Investor`, `Government`, `Community`, `Other`. This is the only part of a class the platform reasons about categorically.
- **Relationship Level** represents *relative recognition priority within that type*. It is a numeric integer in the range 0–99.
- **Level 0 is the highest** priority. Higher numbers rank lower.
- **Levels are organization-defined.** There is no fixed maximum number of organizational levels, levels need not be dense, and gaps are meaningful rather than errors.
- **The canonical identifier is numeric.** The class display name remains freely editable and carries no canonical meaning. No job title — CEO, Director, Staff — is encoded in the hierarchy.
- Level is comparable only **within** a type. The platform never compares an `Employee` level against a `Client` level.

**Consequence: existing persisted workspaces require migration.** Every H2.3 workspace in a browser carries the superseded fields. The migration is explicit and versioned — schema v1 → v2, implemented in `lib/migrations.ts` — not inferred at read time.

**Migration mapping (schema v1 → v2).**

*Category → Type (fallback):*

| Legacy `category` | Relationship Type |
|-------------------|-------------------|
| Internal | `Employee` |
| Client | `Client` |
| Governance | `Board` |
| Partner | `Partner` |
| Supplier | `Supplier` |
| Community | `Community` |
| Other | `Other` |

*Name rules (applied first, taking precedence over the category fallback):*

| Legacy class name matches | Relationship Type |
|---------------------------|-------------------|
| `investor` / `investors` | `Investor` |
| `government` / `public sector` | `Government` |
| `board` / `boards` / `governance` | `Board` |

These are word-boundary matches on a closed, explicit list — not fuzzy inference. They exist solely to recover the two types v1 had no way to express (`Investor`, `Government`) and to confirm `Board`. First match wins, so `Investor` is tested before `Board`. An unrecognized category falls back to `Other`; a class is never dropped for being unrecognizable.

*Tier → Level (fallback):*

| Legacy `tier` | Relationship Level |
|---------------|--------------------|
| Strategic | 0 |
| Priority | 1 |
| Standard | 2 |
| Custom | 3 |

A missing or unrecognized tier maps to level 3.

*Preserved verbatim:* `id`, `name`, `description`, `isDefault`, `isActive`, `createdAt`, `updatedAt`, and every field of the workspace outside the class list — including all Recognition Policies. Custom classes are never deleted.

*Dropped:* `category`, `tier` — superseded, and refused by post-migration validation if still present.

**Known consequence of the mapping.** Legacy `tier` was a single four-value scale applied across every category; v2 level is a per-type ladder. The mapping is order-preserving but not gap-free, so a migrated workspace can have (say) a lone Partner class at level 1 with nothing at level 0. This is valid — level is a priority number, not a dense index — and differs from the clean 0-based ladder a newly created workspace is seeded with (§10). Organizations may renumber at any time.

---

## 19. Build Rule

Before implementing any feature, answer all five questions. If any answer is unclear, the feature is not ready to build.

1. **Which domain does it belong to?**
   Identity / People / Relationship Engine / Gift Intelligence / Fulfillment / Knowledge / Integrations / Insights / Platform

2. **Which canonical object does it affect?**
   Organization / Workspace / Organization Profile / Relationship Profile / Person / Relationship Class / Recognition Policy / Policy Assignment / Program / Moment / Gift/Item / Fulfillment / Memory / Insight / Money

3. **Which user does it serve?**
   - Visitor exploring the platform
   - Prospect completing an Assessment
   - Verified organization admin setting up a workspace
   - Manager creating or approving a Program
   - Approver reviewing a Moment
   - Individual gifting a person
   - Aniyé ops team managing concierge fulfillment

4. **Which horizon does it belong to?**
   H1 through H5. Features in a later horizon must not block or entangle features in an earlier one.

5. **Does it improve execution, learning, trust, or customer value?**
   *(For anything user-facing, also walk the Definition of Experiential Completion in [`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) §2 before calling it done.)*
   - **Execution** — makes it faster or easier to recognize people
   - **Learning** — generates better data, insights, or memory over time
   - **Trust** — increases reliability, auditability, or compliance confidence
   - **Customer value** — measurably improves outcomes for the organization or recipient

---

*System Atlas v3.12 — Aniyé Africa — July 2026*
*Maintained alongside the codebase. Update this document whenever platform direction changes.*
*v3.12: **H3.6 — fulfilment tracking implemented; [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) is built as accepted.** `OperationsState` **v7** (additive `fulfilments`; invents no Fulfilment, touches no existing record; a v1 payload still walks every rung). Workspace unchanged at **v7** — the two counters coincide without being coupled. **§4 `Fulfillment` is marked implemented**, with the superseded draft retained for provenance: `vendorOrderId`, `channel`, `estimatedDeliveryDate`, `deliveredAt` and `notes` were **not** built either, alongside the already-superseded status enum, `trackingUrl` and `proofUrl`. The built twelve-field record is specified in `RELATIONSHIP_OPERATIONS_ATLAS.md` §3. One Fulfilment per Moment, created only on confirmed dispatch, no persisted draft; three statuses; `Redelivery` the only Decision; `ProofReceived` after `Delivered` only, changing no status. **Proof is metadata — no file, URL, data URI, base64 or blob** — so §15b's *"confirmation + curated proof"* promise remains future architecture. `MOMENT_STATUSES` unchanged at three. Milestone count **24 of 37**; H3 is **6 of 8**; **H3.7 is next, gated on CP-U3 / OPS-U3 and CP-U4, and has not begun.** ⚠️ No browser verification was performed for H3.6; real-device testing remains outstanding and is not claimed.*
*v3.11: **Pre-H3.6 policy-resolution snapshot correction implemented.** `OperationsState` **v6** admits `deliveryRequirement`, `preferredDeliveryWindow`, `signatureRequired` and `proofRequired` on newly generated Moment snapshots. The `v5 → v6` rung is a pure version bump: no existing Moment or copied Execution Brief snapshot is backfilled, and absence remains "not recorded", never a default. Partial or malformed delivery context is refused. Confirmation revalidation treats all four promises as material. Workspace remains **v7**; H3.6 and ADR-012's Fulfilment remain **not implemented**.*
*v3.10: **H3.5 → H3.6 governance decision closure — documentation only.** No code, schema, migration, validation, route or UI changed. **§4 `Fulfillment` is re-issued by [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md)** — the draft status enum is superseded by exactly three states (`Dispatched` · `DeliveryFailed` · `Delivered`), `proofUrl` and `trackingUrl` are superseded, and proof is recorded as **metadata only with no file stored**. One Fulfilment per Moment, created only on confirmed dispatch; `Redelivery` is the only Decision; `MOMENT_STATUSES` unchanged at three. §18 registers ADR-012 as **accepted and not implemented**. §17 records secure file storage for proof among the not-implemented set. **H3.6 has not begun**; Workspace remains **v7** and `OperationsState` remains **v5** — v6 is planned, not landed*
*v3.9: H3.5 — the per-country Courier directory and manual courier selection implemented. `OperationsState` **v5** (additive: `couriers`; invents nothing, touches no existing record); Workspace unchanged at **v7**. **§4 gains `Courier`** — it did not exist in this document before, so nothing was re-issued; it lives in `OperationsState` and is never projected into Workspace. §15d updated to v7/v5; §17 reading block and implemented/not-implemented split restated. `MOMENT_STATUSES` unchanged at three. No rate APIs, tracking, optimization, scoring, routing, courier account or portal was built; fulfilment tracking remains H3.6 and is gated on unresolved U4. ADR-010 remains the external-pilot gate*
*v3.8: H3.4 — the manual Vendor directory, hand-entered VendorOffers and manual vendor selection implemented. `OperationsState` **v4** (additive: `vendors`, `vendorOffers`; invents nothing, touches no existing record); Workspace schema unchanged at **v7**. **§4 gains `Vendor` and `VendorOffer`** — neither existed in this document before, so nothing was re-issued; both live in `OperationsState` and are never projected into Workspace. §15d updated to v7/v4; §17 reading block and implemented/not-implemented split restated. `MOMENT_STATUSES` unchanged at three. Vendor Intelligence remains deferred to H4.4; no scoring, routing, API, portal, vendor account, courier, fulfilment or commerce was built. ADR-010 remains the external-pilot gate*
*v3.7: H3.3 — minimum Catalog and manual item selection implemented. `OperationsState` **v3** (additive: `policyResolutionSnapshot.excludedCategories`, invented on no existing record); Workspace schema unchanged at **v7**. **§4 `Gift / Item` re-issued** — its pre-H3.3 field list is superseded, and none of `vendorId`, `intent`, `collectionIds`, `vendorCost`, `availableCountries`, `images` or `tags` survived; the implemented object has six fields and lives in `lib/catalog.ts`, never in `WorkspaceState`. §15d updated to v7/v3; §17 reading block and implemented/not-implemented split restated. `MOMENT_STATUSES` unchanged at three. Catalog, Gift and Vendor Intelligence remain deferred to H4.2–H4.4, behind the pilot; ADR-010 remains the external-pilot gate*
*v3.6: H3.2 — Execution Brief implemented. Workspace schema **v7** (additive `Person.deliveryAddress`, ADR-011) and `OperationsState` **v2** (additive `executionBriefs`). §4 Person marks the address implemented; new §15f defines the Execution Brief, the address gate, override and revision; §15d updated to v7/v2; §17 reading block restated; §18 marks ADR-011 implemented. `MOMENT_STATUSES` unchanged*
*v3.5: H3.1 acceptance correction — defect **H3.1-D1** closed. §15e gains "The preview shows; the confirmation re-reads": confirmation re-reads the Workspace, Program status, frozen population, People, groups, assignments, policies and existing source keys, builds the batch from live state, writes nothing when live state moved or when a read fails, and requires a second confirmation. 15 regression checks added (operations 35 → 50). No schema change; WorkspaceState stays v6 and OperationsState stays v1. **Live visual verification still not performed**
*v3.4: Council corrections to the reconciliation (documentation only). §17 H4 renamed **Learn**; **all external connectors moved to H5.4 — Integrations**, removing the intermediate H4.4/H4.5 placement. §12's Supported People Sources table corrected — it still placed Google Sheets, BambooHR, HiBob and Personio at H3 and the remaining five at H4; all nine are now H5.4. ADR-011 renamed to `adr/ADR-011-recipient-address.md` to match the repository's lowercase-kebab convention*
*v3.3: Governance reconciliation (documentation only — no code, schema, migration or validation change). ADR-011 accepted (recipient address; Workspace schema v7 accepted, **not built**); §4 Person gains the accepted-not-implemented `deliveryAddress`; §4 Moment corrected to the implemented H3.1 model and the superseded pre-H3.1 shape marked as such; §18 registry gains ADR-010 and ADR-011 and corrects ADR-005/006/007 from "No" to "Partly"; §17 restated as Workspace v6 + OperationsState v1 and pointed at the new [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md), which is now authoritative for H3.1 … H3.8; H3/H4 horizon rows corrected — people-source connectors and Gift/Catalog/Vendor Intelligence sit in H4, not H3*
*v3.2: H3.1 — ADR-010 accepted; operational records moved to a separate OperationsState (§15d); Moment generation, Decision and OperationalEvent implemented (§15c, §15e); the /operations shell exists but has no roles or authentication. Browser persistence is an internal prototype only — no production backend, no external partner access, Execution Brief and everything after it unimplemented*
*v3.1: H2.6 — Campaign Programs implemented (schema v6). Program marked implemented for Campaign mode only; currency-specific budget envelopes documented with no FX; frozen-population semantics recorded; policy resolution confirmed as per-Moment and still absent from the Program record; Moment generation explicitly still absent*
*v3.0: ADR-004 … ADR-009 accepted by Council. Money redefined as integer minor units and Person gains Inactive (both implemented, schema v5); Program, Workspace/Operations, Decision/Operational Event and Recognition Order recorded as accepted architecture and explicitly marked NOT IMPLEMENTED; Policy lifecycle confirmed as three states, resolving C4 with no code change; ADR registry added with the ADR-003 retirement note*
*v2.5: H2.5 — Person and People Source implemented (schema v4); §4 gains the People Source object; §10/§4 member counts are derived rather than stored (resolves C3); §12 rewritten for the implemented normalization, source precedence, duplicate identity, class assignment, and import result states; HRIS documented as a future source abstraction only*
*v2.4: H2.4 — Policy Assignment implemented (schema v3); §4 Policy Assignment updated to the implemented model; §11 gains the resolution algorithm and active/inactive/archived rules; §15 gains the schema version history and the v2 → v3 stage remap; ADR-001 confirmed fully implemented*
*v2.3: ADR-002 — Relationship Type + numeric Relationship Level supersedes Category/Tier; §10 rewritten; client schema versioning added to §15*
*v2.2: ADR-001 — Recognition Policy promoted to first-class reusable object; Policy Assignment introduced as linking layer; multinational policy support via country-scoped assignments; §11 Relationship Policy Model fully rewritten*
*v2.1: Resolved 5 pre-H2 open questions (currency default, individual auth, concierge handoff, profile versioning, deduplication authority)*
*v2.0: 12 architectural decisions — domain boundaries, Money object, Progressive Trust, enterprise foundations*
*v1.0: Initial Atlas (June 2026)*
