# Aniyé Africa — Recovery Ledger

> Recovery audit performed 2026-07-27 after loss of the previous development machine.
> This document records the surviving state of the repository, what is confirmed missing,
> and the reconstruction sequence.
>
> **Standards that govern reconstruction:** [`ANIYE_SYSTEM_ATLAS.md`](ANIYE_SYSTEM_ATLAS.md) for what
> the platform is; [`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) for how it feels.
> Every user-facing milestone from H2.5 onward must satisfy the Doctrine's Definition of
> Experiential Completion before it is called done.

---

## 0. Reconstruction Status

| Step | Milestone | Status | Landed in |
|------|-----------|--------|-----------|
| 0 | Schema versioning foundation | ✅ **Reconstructed** | R1 |
| 1 | **ADR-002** — Relationship Type + numeric Relationship Level | ✅ **Reconstructed** | R1 |
| 2 | **H2.4** — Policy Assignments | ✅ **Reconstructed** | R2 |
| 3 | **H2.5** — People Sources and People | ✅ **Reconstructed** | R3 |
| — | **Aniyé Experience Audit** | ✅ **Complete** | Audit |
| — | **Experience Correction E1** | ✅ **Complete — Programs unblocked (experience)** | E1 |
| — | **H2 → H3 Architecture Checkpoint** | ✅ **Complete** | Checkpoint |
| — | **Council acceptance of ADR-004 … ADR-009** | ✅ **Accepted 2026-07-27** | R4 |
| — | **R4 — schema v5 (Money + Person lifecycle)** | ✅ **Complete** | R4 |
| — | **R5 — H2.6 Campaign Programs (schema v6)** | ✅ **Complete — H2 Configure done** | R5 |
| — | **H3.1 — Operational foundation + Moment Engine** | ✅ **Complete** | H3.1 |
| 4 | **Relationship Operations Atlas** | ✅ **Reconstructed** | R6 |
| — | **R6 — governance reconciliation (ADR-011, Master Roadmap)** | ✅ **Complete** | R6 |
| — | **H3.2 — Execution Brief** | ✅ **Complete** — schema v7, OperationsState v2 | H3.2 |
| — | **H3.3 — Minimum Catalog** | ⬅️ **Next** — ungated | — |
| — | **Production backend + authentication** | ⛔ **Mandatory before any external pilot** | — |

> **Reconstruction is complete.** Every milestone this ledger was opened to recover has landed.
> From H3.2 onward the work is new build, not recovery, and it is tracked in
> [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) — **the authoritative roadmap** as of 2026-07-28.

### ⚠️ Superseded reconstruction rows 5–10

The original ledger listed six further steps. **All are superseded** by the Council decisions of
2026-07-28, and are retained here only so historical references resolve. **Do not schedule work
from this table.**

| Original | Original definition | Superseded by |
|---|---|---|
| ~~5~~ | ~~ADR-003 — Decision Engine~~ | ⚠️ **Struck.** ADR-003 is **retired permanently** and is not a dependency of anything. Policy resolution is `resolvePolicyAssignment()`; recording judgements is ADR-006's `Decision`. See [`adr/README.md`](adr/README.md) |
| ~~6~~ | ~~H3.1 — Moment Engine~~ | ✅ **Delivered as H3.1**, without a Decision Engine. See §0 above |
| ~~7~~ | ~~H3.2 — Execution Brief~~ | **H3.2**, unchanged in intent. Now gated on ADR-011 rather than on ADR-003 |
| ~~8~~ | ~~H3.3 — Catalog Intelligence~~ | **H3.3 is a minimum flat catalog with manual item selection.** Catalog *Intelligence* is **H4.2**, deferred until the pilot produces evidence |
| ~~9~~ | ~~H3.4 — Gift Intelligence~~ | **H3.4 is a vendor directory with hand-entered offers.** Gift *Intelligence* is **H4.3** |
| ~~10~~ | ~~H3.5 — Vendor Intelligence~~ | **H3.5 is a courier directory with manual selection.** Vendor *Intelligence* is **H4.4** |

**Why the intelligence milestones moved.** Checkpoint Part 2 classifies all three as **[D]** —
deferrable until operational evidence exists — and states the reasoning that binds them:
*"Intelligence built before that evidence exists is invention."* Aniyé has no operational evidence
yet about which vendors deliver well or which gifts land. The manual flow generates the data that
makes intelligence possible; the reverse is not true.

The canonical sequence is now **H3.1 … H3.8** in [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md).

### R1 — Schema versioning + ADR-002

**Schema versioning foundation — reconstructed.**
`WorkspaceState.schemaVersion` now exists and is stamped on every write. `lib/migrations.ts` holds an ordered, idempotent migration chain with post-migration structural validation, pre-migration backup, and safe-failure quarantine. All reads pass through it via `getWorkspace()`. Schema versions: **v1** (legacy H2.3, unversioned) → **v2** (ADR-002, current).

**ADR-002 — reconstructed.**
`RelationshipCategory` and `RelationshipTier` are removed from the canonical type. `RelationshipClass` now carries `type` (nine canonical Relationship Types) and `level` (integer 0–99, 0 highest). The legacy mapping is explicit, documented in code and in Atlas ADR-002, and covered by validation.

**H2.4 gate — passed.**
H2.4 was held until migration validation passed. `npm run validate:migration` reports **18/18 checks passing**, including all twelve required cases. Typecheck and build are green. The gate is satisfied; H2.4 is the next reconstruction milestone.

**Not started in R1, per scope:** H2.4, H2.5, and every Horizon 3 milestone.

### R2 — H2.4 Policy Assignments

**H2.4 — reconstructed. Schema v3 introduced.**

**The canonical link is restored.** The Atlas §11 flow — Relationship Class → **Policy Assignment** → Recognition Policy → Program → Moment — was broken at its second link (conflict C7). `PolicyAssignment` now exists as a first-class object with a `policyAssignments` collection on `WorkspaceState`, a `/workspace/assignments` route, and a pure resolution engine in `lib/assignments.ts`. C7 is **resolved**; ADR-001 is now fully implemented rather than merely specified.

**Schema v2 → v3.** Adds the `policyAssignments` collection and inserts the `assignments` setup stage between `policies` and `people`. A v2 workspace already past `policies` is walked back to `assignments` when a Published policy exists, or to `policies` when none does — recorded as a migration warning, never silent. Marked destructive because `setupStage` is rewritten, so the pre-migration payload is backed up first.

**Also fixed in R2, because H2.4 could not work without it:** the Policy Library had no forward action at all — the setup flow dead-ended at `policies`, because the step after it did not exist when H2.3 was built. A "Continue to Policy Assignments" action was added, gated on having at least one Published policy.

**Housekeeping completed in R2:**

- The false `h3.5-vendor-intelligence` tag was **deleted** from the remote (conflict C9 — **resolved**). An accurate `recovery-r1-adr002` tag now points at the real R1 commit.
- The `.ts` import extensions introduced in R1 were **removed**, and `allowImportingTsExtensions` dropped from `tsconfig.json`. Application code is back to idiomatic extensionless imports; the validation scripts resolve `.ts` through a small Node hook (`scripts/register-ts-resolver.mjs`) instead of the whole project carrying a non-default compiler flag. R1 risk 2 — **retired**.

**Deliberately not addressed** (out of H2.4 scope, per instruction): conflicts C2, C4, and C5. The `PolicyStatus` lifecycle keeps its current three states — see C4 below for the resulting Atlas mismatch.

**Not started in R2, per scope:** H2.5, Programs, and every Horizon 3 milestone.

### R3 — H2.5 People Sources and People

**H2.5 — reconstructed. Schema v4 introduced. H2 Configure recovery is complete.**

The workspace could describe *how* it recognizes people — classes, policies, assignments — but not *who*. That gap is closed. `Person` and `PeopleSource` now exist as first-class objects with a `/workspace/people` route, manual entry, CSV import, and a pure domain layer in `lib/people.ts` and `lib/csv.ts`.

**People Sources restored.** `PeopleSource` abstracts provenance: one source per CSV import (named from the file), one reusable Manual source per workspace. `HRIS` exists as a canonical source type only — no external integration was built. It is declared now so precedence has a stable top rung and a future connector needs no further migration.

**People directory restored.** Search, filters by Relationship Type / Class / country / status, source and class badges, archive and restore, a desktop table and mobile cards, and derived coverage counts per class.

**Schema v3 → v4.** Adds `peopleSources` and `people`. Purely additive: nothing existing is touched and `setupStage` is deliberately unchanged, so no backup is taken. A v1 workspace still walks v1 → v2 → v3 → v4 one rung at a time.

**C3 resolved — by deriving, not storing.** `memberCount` is computed from Person records on read. Storing it would have created a second source of truth that every person edit, import, archive, and class change would have to keep in step. `lib/people.ts` derives active and total counts per class, people with no class, and people referencing inactive or missing classes.

**Also fixed in R3:** the sidebar's Programs entry now carries an explicit `built: false` flag. Without it, confirming the people step would advance `setupStage` to `programs` and unlock a link to a route that does not exist. Programs stays permanently visible as the next unavailable stage.

**Deliberately not addressed** (out of H2.5 scope, per instruction): C2, C4, C5, and C6. See the conflicts table.

**Not started in R3, per scope:** Programs, Operations, and every Horizon 3 milestone.

### R3a — Experience Doctrine integration

[`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) was introduced after R3 shipped and applied back over the People experience. **No architectural or functional scope changed** — `lib/people.ts`, `lib/csv.ts`, `lib/migrations.ts`, and `lib/workspace.ts` are untouched, and all 68 validation checks still pass. The change is entirely presentation, flow, and language.

Applied to People:

- **One recommended action per state** — "Add your first person" when empty, "Confirm people" when the state is ready, "Add people" otherwise. CSV import is always a visible secondary.
- **Guided choice** on "Add people" — import a list vs. add one person, each explained by use case, with a recommendation that flips on whether the directory is empty.
- **Add Person is now a four-step flow** — Who they are → Where they fit → Dates that matter → Review. Required fields are unmarked and prominent; optional ones carry an explicit tag; phone sits behind progressive disclosure.
- **Class selection speaks human** — "relationship type", "recognition level", "Level 0 is the highest recognition priority". Category and Tier language does not appear anywhere in the interface.
- **CSV import is a five-step sequence** — Upload → Check the columns → Review → Confirm → Done, with rows grouped by *what the operator must do about them* rather than by internal state name.
- **Autosave with resume** — an unfinished new person is drafted to `aniye_person_draft` and offered back on return. Nothing reaches `workspace.people` until the final step. Edits are never autosaved.
- **Archiving now requires confirmation**, and setup progress is shown as named milestones.

New components: `StepHeader.tsx`, `SetupProgress.tsx`. New localStorage key: `aniye_person_draft` (draft only, never workspace data, cleared on save or cancel).

### ✅ Aniyé Experience Audit — complete

**Performed at commit `1b1025e`.** Inspection only — no application component or domain model was changed. Full findings: [`ANIYE_EXPERIENCE_AUDIT.md`](ANIYE_EXPERIENCE_AUDIT.md) and [`ANIYE_FRICTION_REGISTER.md`](ANIYE_FRICTION_REGISTER.md).

| Severity | Count |
|----------|-------|
| **Critical** | 2 |
| **High** | 8 |
| **Medium** | 11 |
| **Low** | 7 |
| **Total** | **28** |

**The two Critical findings are defects, not design opinions:**

- **EX-C1 — `/verify` silently destroys a configured workspace.** `VerifyGate` calls `createWorkspace` then `saveWorkspace` unconditionally; `saveWorkspace` is a bare `setItem`. Re-opening an old verification link from an email or bookmark wipes every class, policy, assignment and person, with no confirmation and no recoverable copy. The migration backup does not apply — it fires on destructive *migration*, not on overwrite.
- **EX-C2 — the workspace is unusable on mobile.** `WorkspaceShell` uses a hardcoded `ml-60` against a `fixed w-60` sidebar with no breakpoints anywhere. On a 375px viewport the content column is roughly 135px. All six setup routes are affected, and this **supersedes a claim in the R3 report**: the People components are genuinely responsive, but they render inside a frame that makes them unreachable on a phone.

**Exact Programs gate — 5 findings must be corrected:**

| ID | Correction | Effort |
|----|-----------|--------|
| EX-C1 | Guard workspace creation; back up before any replacement | S |
| EX-C2 | Responsive workspace shell (drawer sidebar below `lg`) | M |
| EX-H2 | `/workspace/policies/new` has no way back — dead end | XS |
| EX-H4 | Three routes render the header title "Workspace" | XS |
| EX-H6 | Setup progress renders on only 2 of 7 setup surfaces | S |

### ✅ Experience Correction E1 — complete

**All five Programs-gating findings corrected**, plus three more High findings and three Low ones picked up along the way. Corrections only: no domain model changed, no schema version introduced, no Programs or Operations work. `lib/workspace.ts` changed solely in `SETUP_STAGES` display copy.

| Finding | Outcome |
|---------|---------|
| **EX-C1** | ✅ `/verify` reads before writing. An existing workspace is always continued, never replaced — replacement is not implemented at all. Decision lives in `lib/verification.ts`, pure with injected storage, proven by `npm run validate:verification` (9 checks incl. byte-equivalence and idempotence) |
| **EX-C2** | ✅ Off-canvas drawer below `lg`; `lg:ml-60` content, `left-0 lg:left-60` header, scrim, Escape, route-change close, body scroll lock. Desktop unchanged |
| **EX-H2** | ✅ `/workspace/policies/new` has a persistent back link and an always-rendered Cancel |
| **EX-H4** | ✅ Longest-match title map covering every route, in plain language |
| **EX-H5** | ✅ Recognition rules page has one state-chosen primary action |
| **EX-H6** | ✅ `SetupProgress` on all five setup routes, derived from `SETUP_STAGES` |
| **EX-H7 / EX-H8** | ✅ Shared `ConfirmDialog` with named buttons and real impact numbers, guarding group deactivation/deletion, assignment removal/deactivation and person archiving |
| **Language** | ✅ Relationship Classes → *relationship groups*, Recognition Policies → *recognition rules*, Policy Assignments → *who each rule applies to*, applied consistently. Canonical names untouched in types, routes and the Atlas |

**Programs is unblocked from an experience perspective.** Zero Critical, zero Programs-gating findings remain.

**The architecture-correction checkpoint remains mandatory before Programs**, independently of the experience work. That gate has not moved.

### Deferred pre-pilot experience work

Not resolved in E1, and not marked resolved. None gates Programs; all should be closed before external customers:

| ID | Deferred work | Why |
|----|--------------|-----|
| **EX-H1** | Assessment autosave — ~15 fields still lost on refresh | Pre-workspace surface; Programs does not touch it |
| **EX-H3** | `PolicyForm` guided rebuild into steps | Explicitly out of E1 scope. E1 made it readable on mobile and renamed its sections, but it is still one long form |
| **EX-M5** | Policy draft autosave | Depends on EX-H3 |
| **EX-M4, M7, M8, M9, M10, M11** | Countries round-trip, People page length, table fallbacks, review shortcut, large-CSV rendering, wizard focus management | Medium-severity polish |
| **EX-L4 – EX-L7** | Dialog scroll containment, `<a>` → `<Link>`, import stat readability | Low |

**Responsive verification limitation, recorded honestly:** the Chrome extension was not connected during E1, so the responsive review was static analysis plus an HTTP smoke test across all ten routes — not a live visual pass. Every route returns 200 and every layout offset is breakpoint-gated, but no screenshot was taken at any width. A real-device check remains outstanding before pilot.

### Audit scope (for reference)

**Audit scope:**

| Surface | Built in |
|---------|----------|
| Landing page | H1 |
| Assessment | H1 |
| Snapshot / report | H1 |
| Verification gate | H2.1 |
| Workspace setup and overview | H2.1 |
| Relationship Classes | H2.2 / R1 |
| Recognition Policies | H2.3 |
| Policy Assignments | R2 |
| People | R3 / R3a |

**Output: a prioritised friction register**, each entry naming the surface, the Doctrine principle or completion check it fails, and the proposed fix.

| Priority | Meaning |
|----------|---------|
| **Critical** | Blocks task completion or causes misunderstanding |
| **High** | Creates significant effort or decision paralysis |
| **Medium** | Reduces clarity or enjoyment |
| **Low** | Polish and delight |

**All three pre-audit predictions were confirmed** and are now recorded as EX-H5 (Policy Library competing actions), EX-H1 (assessment predates the guided-flow pattern) and EX-M1 (unexplained internal vocabulary). The audit also found two Critical defects that inspection-from-memory had missed entirely.

### ✅ H2 → H3 Architecture Checkpoint — complete

**Prepared at commit `9c8e7d2`. Documentation only** — no application code, domain model, or schema version changed. Full analysis: [`H2_H3_ARCHITECTURE_CHECKPOINT.md`](H2_H3_ARCHITECTURE_CHECKPOINT.md). Draft ADRs: [`adr/`](adr/).

All six decisions are **Proposed — Council Review Required**. None is accepted, and the System Atlas was deliberately left unchanged so it never claims a decision that has not been made.

| ADR | Decision | Schema impact | Blocks Programs |
|-----|----------|---------------|-----------------|
| **ADR-004** | Program is an operational commitment; policy resolves **per Moment**, never pinned at Program level | New `programs` collection (additive) | ✅ Yes |
| **ADR-005** | Workspace and Operations are separate surfaces; Operations never writes configuration | None client-side | Decision only |
| **ADR-006** | Decisions vs Operational Events; recorded **only on confirmation**; `Confirmed`/`Superseded` only | Backend objects | Decision only |
| **ADR-007** | Money as integer minor units + ISO 4217; `RecognitionOrder` as the financial object | **v4 → v5, destructive** | ✅ **Hard prerequisite** |
| **ADR-008** | Person gains `Inactive` (supersedes P7) | v5, additive | ✅ Yes |
| **ADR-009** | Policy lifecycle stays three states; approval is a record (resolves C4) | **None** | Decision only |

**Two findings the checkpoint surfaced that were not previously recorded:**

1. **The proposed Program field list contradicted ADR-001.** Carrying `policyAssignmentId` on a Program would pin one policy to a whole run, which cannot represent the country-scoped assignments ADR-001 exists to support — a multinational program would silently apply one country's rule to everyone. ADR-004 resolves this by resolving policy per Moment.
2. **ADR-003 is deliberately left unused.** This ledger reserved it for a "Decision Engine" the lost implementation apparently had. The analysis concluded no such object is needed: `resolvePolicyAssignment()` already resolves policy, and recording judgements is ADR-006's `Decision`. Reusing the number would imply a decision never made.

**C4 and C6 both have proposed resolutions.** C4 resolves with no code change (ADR-009 amends the Atlas instead). C6 resolves via the v5 Money migration (ADR-007) and is the single hard prerequisite for Programs.

### ✅ Checkpoint decisions accepted — R4 complete

**All six ADRs were accepted by Council on 2026-07-27**, each with binding conditions recorded on the record itself. Full records: [`adr/`](adr/).

| ADR | Status | Implemented in R4 |
|-----|--------|-------------------|
| **ADR-004** Program | Accepted | ❌ Architecture only — Council narrowed it to **one Relationship Group per Program** |
| **ADR-005** Workspace / Operations | Accepted | ❌ Architecture only |
| **ADR-006** Decision / Operational Event | Accepted | ❌ Architecture only |
| **ADR-007** Money + Recognition Order | Accepted | ✅ **Money implemented — schema v5.** RecognitionOrder deferred |
| **ADR-008** Person lifecycle | Accepted | ✅ **Implemented — schema v5** |
| **ADR-009** Policy lifecycle | Accepted | ✅ **Confirmed — no code change was required** |

**ADR-003 remains retired.** Registry notes added to Atlas §18 and [`adr/README.md`](adr/README.md). The number is not reused and not renumbered — reusing it would make a historical reference point at a decision that was never made.

### Schema v5 — complete

- **Money (ADR-007)** — `{ amountMinor: integer, currency: ISO 4217 }`, with a pinned exponent table in `lib/money.ts` covering zero-, two- and three-decimal currencies. **Destructive migration**, backed up verbatim first. An unknown currency is left unconverted and the workspace then refused, rather than stored at a scale nobody can determine. **Conflict C6 is resolved.**
- **Person lifecycle (ADR-008)** — `Active | Inactive | Archived`, additive. No record changes state and nothing is ever migrated *into* `Inactive`. Ledger compromise **P7 is superseded**.
- A v1 workspace still walks **v1 → v2 → v3 → v4 → v5** one rung at a time.

**Validation: 102 checks across five suites, all passing** — verification 9, migration 18, assignments 20, people 30, money 25.

### ✅ R5 — H2.6 Campaign Programs. **H2 Configure is complete.**

**Schema v6.** Adds the `programs` collection (additive, no backup) and closes R4 risk 1 by validating `baseCurrency` against the pinned currency table — a known code is normalized to uppercase, an unknown one is refused rather than replaced with a guess.

**Campaign Programs only.** `Recurring` and `Triggered` are declared in the schema so they need no later migration, but nothing can create one. **No Moments are generated** — a Campaign prepares the population and configuration that a future Moment engine will consume.

**What a Campaign is:** one Relationship Group, one occasion, a defined period, and **one budget envelope per currency**. It carries no `policyAssignmentId`, no `recognitionPolicyId` and no universal policy snapshot — policy still resolves per person, per country, and will be snapshotted per Moment.

**Currency handling.** Allocation is grouped by currency and **never summed across currencies**: a group spanning Nigeria and Kenya has an allocation in two currencies, and expressing that as one number would need an exchange rate. No FX exists.

**Freezing.** Activation recomputes eligibility from live data rather than trusting the preview, then freezes **Person ids only** — no copied Person records, no policy data. Later additions, pauses, archives and removals do not rewrite a frozen population.

**Setup completes here.** With one Active Program, the administrator can finish setup; `setupStage` advances to `active` and the workspace states plainly: *"Your recognition foundation is ready"*, followed by the truthful next state — Moment execution is not yet enabled in this recovery build. No dead end, no unavailable button.

**Validation: 137 checks across six suites, all passing** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35.

### ✅ H3.1 — Operational foundation and Moment generation

**ADR-010 accepted and implemented.** `WorkspaceState` remains **v6** customer configuration; operational records live in a **separate `OperationsState` v1** under its own storage key, versioned independently. Access is through a repository interface with named operations — there is deliberately no generic `save(state)`.

**A separate Operations environment.** `/operations/*` has its own shell, navigation, header and vocabulary, and reuses nothing from `WorkspaceSidebar`. Future sections are shown as explicitly unavailable rather than as clickable dead ends.

**Moment generation.** From an Active Campaign's frozen population: eligibility is re-evaluated against current configuration, and **nobody is silently dropped** — a person who cannot proceed gets a Moment marked `NeedsReview` with a named issue and a link to the Workspace page that fixes it. Operations never edits customer configuration.

**Decisions and Events, per ADR-006.** Every Moment gets a `MomentQualification` Decision explaining its status; successful resolution additionally gets a `PolicyResolution` Decision recording the candidates, the winner and the precedence reason. Events are append-only. **Previewing writes nothing** — confirmation commits Moments, Decisions and Events in one atomic operation, with the proposed state validated in full first.

**Idempotency.** Every Moment carries a deterministic `sourceKey`. Refreshing, returning, double-clicking or re-preparing the same campaign reports records as *already prepared* rather than duplicating them.

**Validation: 172 checks across seven suites, all passing** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, operations 35.

### ✅ R6 — Governance reconciliation. **Documentation only.**

**Trigger.** An architecture review of the H3 reconstruction scope, requested 2026-07-28, found the
roadmap unimplementable as written. Three sources defined H3 and none agreed: this ledger placed
H3.1 as both *Complete* and *Not started* in the same table, gated the sequence on the **retired
ADR-003**, and listed H3.3–H3.5 as Catalog, Gift and Vendor **Intelligence** — which checkpoint
Part 2 classifies as deferrable until after the pilot. The Council settled it.

**No application code, schema, migration, validation script or `package.json` changed.**
Typecheck, build and all seven validation suites were run before and after, and are unchanged.

**Council decision 1 — canonical H3 roadmap.** H3.x is retained as the roadmap vocabulary and
redefined as **H3.1 … H3.8**: Moment Engine (done) → Execution Brief → minimum Catalog → vendor
directory → courier directory → Fulfilment → Recognition Order → Confirmation and Memory. Catalog,
Gift and Vendor **Intelligence** move to **H4.2 – H4.4**, deferred until the pilot produces
operational evidence, and must not be represented as the next H3 milestones. Checkpoint Part 3's
numbers 1–13 are mapped to the H3.x identifiers so both sources stay readable.

**Council decision 2 — ADR-011, recipient address.** The review found that `Person` carries **no
address**, while H3.2's completion test depends on one. Worse, the gap sat on the ADR-005 boundary:
an address is customer configuration, but the operator discovers it is wrong. [ADR-011](adr/ADR-011-recipient-address.md)
resolves it — `Person` owns an optional customer-controlled `deliveryAddress` (schema **v7**,
additive, **not built**); the Execution Brief carries a `deliveryAddressSnapshot`; a Moment may stay
`ReadyForExecution` without an address but a **brief cannot be confirmed** without one;
**`MOMENT_STATUSES` is not expanded**; an operator override applies to one brief with reason,
provenance and timestamp and **never writes back to `Person`**.

**Documents changed:**

| File | Change |
|------|--------|
| `docs/adr/ADR-011-recipient-address.md` | **New.** Accepted |
| `docs/MASTER_ROADMAP.md` | **New.** The authoritative H0–H5 roadmap |
| `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` | **New.** Recovery milestone 4, outstanding since the audit |
| `docs/adr/README.md` | ADR-011 registered; implementation-status table added |
| `docs/ANIYE_SYSTEM_ATLAS.md` | → **v3.3.** §4 Moment corrected to the implemented H3.1 model; §4 Person gains the accepted-not-implemented `deliveryAddress`; §18 gains ADR-010 and ADR-011 and corrects ADR-005/006/007 from "No" to "Partly"; §17 restated as v6 + Operations v1 |
| `docs/RECOVERY_LEDGER.md` | This entry; §0, §4, §5, §7, §9, §10 corrected |

**Milestone 4 — Relationship Operations Atlas — reconstructed.** Built **only** from repository code,
accepted ADRs and the checkpoint. Nothing was written from memory. Rules that could not be recovered
are marked **Unresolved** in its own §9 rather than invented — including the operator role model,
SLAs, exception taxonomy, vendor and courier onboarding, and pricing.

**Stale statements corrected:** the schema version in §7 (v4 → **v6**); the §5 route table (12 → 21
routes, adding Programs and Operations); the "schema v7" claim about Moments (superseded by ADR-010
— Moments are `OperationsState` v1 and the workspace stays at v6); the ADR-003 dependency in §0,
§4, §9 and §10; and the proposed paths `lib/decision-engine.ts`, `lib/moments.ts` and
`app/workspace/moments/…`, which would have put Operations records in the Workspace tree.

**Historical records were preserved, not deleted.** Superseded blocks carry an explicit marker and
the correction above them.

### R6 — Council corrections (same reconciliation, second pass)

The Council accepted R6 subject to ten corrections. All are documentation-only and are applied:

| # | Correction | Applied |
|---|---|---|
| 1 | Rename ADR-011 to lowercase kebab | `adr/ADR-011-recipient-address.md`; all four references updated |
| 2 | Keep `ExecutionBriefAddressOverridden`; do not restore `AddressUpdated` | Retained. The ambiguous name is not reintroduced anywhere |
| 3 | H0 is an **approved retrospective label** for real completed work | Restated in `MASTER_ROADMAP.md` §H0. The underlying work is **not** described as invented |
| 4 | H4 remains **Learn**; all external connectors belong to **H5.4 — Integrations** | H4 renamed and renumbered; connectors moved out of H4.4/H4.5, which no longer hold them anywhere. Relocation note records both the original H3 placement and the intermediate H4 one |
| 5 | Confirm H2.6 Complete, H3.1 Complete, H3.2 Next; and the milestone count | All three states confirmed. **The count is 19 of 37, not 15 of 31** — see below |
| 6 | Preserve "draft, not specification" for `Gift / Item`, `Fulfilment`, `Memory` | Strengthened in `RELATIONSHIP_OPERATIONS_ATLAS.md` §3, each named with the milestone that must re-issue its field list |
| 7 | Retain the `CLAUDE.md` and skill-file corrections | Retained unchanged |
| 8 | Keep unsupported operational rules unresolved | All ten remain unresolved. **None was invented a resolution** |
| 9 | Classify every unresolved item and conflict by what it blocks | Applied in three registers: §8 above, `MASTER_ROADMAP.md` §Unresolved, and `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 |
| 10 | State where the ADR-010 pilot gate binds, per repository evidence | ⚠️ **Evidence does not support "binds from H3.4"** — see below |

**Correction 5 — the milestone count does not match.** The Council's instruction was conditional
(*"if the roadmap still contains 31 milestones"*). It does not: at one-row-one-milestone granularity
the roadmap contains **37 milestones, 19 complete**. The three named milestone *states* are
confirmed exactly as instructed — H2.6 Complete, H3.1 Complete, H3.2 Next. The difference is
**counting granularity, not status**, and is surfaced in `MASTER_ROADMAP.md` §Milestone count rather
than resolved by adjusting the roadmap to fit a number.

**Correction 10 — an earlier R6 claim is withdrawn.** R6 stated the ADR-010 gate "binds from H3.4 in
practical terms". **No governing document establishes that**, and the claim was inference. ADR-010
attaches the gate to *any external pilot* and to *any grant of access to a second party*. H3.4 and
H3.5 build directories an operator types into — checkpoint milestone 6 excludes "automated requests,
APIs" and milestone 7 excludes "rate APIs, tracking integration" — so no H3 milestone grants anyone
access. **The gate binds at the pilot (H4.1). It does not block H3.2, H3.3, H3.4 or H3.5.**

### ✅ H3.1-D1 — confirmation-time revalidation. **Acceptance correction, no schema change.**

**Found by the H3.1 recovery-integrity audit**, 2026-07-28. Not a reconstruction: H3.1 itself remains
at `485b5643a5683a0017ff9d7a50e078e2cd5f2fe1`, tagged `h3.1-moment-generation`, and neither the
commit nor the tag was touched.

**Committed and pushed** as `312a22d16d69f08ab9a3c4c54d6455391799e3d4`, parent `2e05986`. The remote
`recovery/h3-reconstruction` was verified at that SHA before any H3.2 work resumed.

**The defect.** `PrepareMoments.handleConfirm` rebuilt the batch from the `GenerationContext`
captured at page load, refreshing **only the timestamp**:

```ts
const fresh: GenerationContext = { ...context, now: new Date().toISOString() };
```

People, Relationship Groups, assignments, Recognition Policies, the Program's status and the
existing Moment source keys were all as-of-load. A person archived, a group switched off or a policy
unpublished between preview and confirmation was invisible, so a Moment could be written as
`ReadyForExecution` carrying a snapshot that was already stale. The in-code comment read as if it
re-read data; it did not. The repository's duplicate backstop always prevented **duplicates** — there
was no equivalent guard for **eligibility**, and no validation check covered it.

**Severity.** Low on browser-only storage, where Workspace and Operations share one device and the
trigger needs one person in two tabs. **Medium-to-high once a backend lands (H5.1)**, when customer
and operator genuinely act at the same time. Corrected now rather than carried.

**The correction.** A small, React-free service — `lib/operations/confirmation.ts` — with three
entry points: `loadLiveContext`, `fingerprintPreview` and `revalidateForConfirmation`. Readers are
injected, so every branch including the read failures is exercisable in validation rather than only
in a browser. No broad new abstraction: the generation engine, the repository and the atomic commit
are unchanged and still do the work.

At confirmation the Workspace is re-read through the canonical path, the Program located again and
checked for `Active`, and its frozen population, People, groups, assignments, policies and existing
source keys all re-read. The batch is built from that live context. **Nothing captured at page load
is reused.**

**Material-change detection.** A deterministic fingerprint over: who is pending, each person's
outcome and sorted issue codes, and the resolved assignment id, policy id, policy version, country
scope, occasion and exact Money — plus the already-prepared set and the per-currency totals.
**Timestamps and generated record ids are excluded**; including them would report a spurious change
on every confirmation and train operators to click through the warning, which is worse than no
warning. A budget moving by one minor unit **is** material.

**On a mismatch, nothing is written.** The displayed preview is replaced with the current result, the
change is explained in plain language, and the operator must review and confirm again.

**On a read failure, a missing Program or an inactive Program, nothing is written.** The actual
problem is shown with a recovery, never as an empty queue and never as success.

**Nothing was weakened:** frozen-population semantics, per-person and per-country resolution,
structured `NeedsReview` handling, exact Money snapshots, separate-currency handling, duplicate
prevention, atomic commits, and the WorkspaceState v6 / OperationsState v1 separation all stand
unchanged. `MOMENT_STATUSES` is untouched.

**Regression coverage — 15 new checks, operations suite 35 → 50.** Person Active → Inactive (36) and
→ Archived (37) after preview; group disabled (38); assignment removed (39); policy archived (40);
budget changed on the same policy version (41); campaign made inactive (42) and removed (43); a
Moment appearing between preview and confirmation (44); workspace read failure (45); operations read
failure (46); refreshed preview confirmable on the second attempt with the newly-paused person
correctly written `NeedsReview` rather than a stale `ReadyForExecution` (47); unchanged state commits
the complete atomic batch (48); the fingerprint ignores time (49); no partial records survive a
refused confirmation (50).

**Validation: 187 checks across seven suites, all passing** — verification 9, migration 18,
assignments 20, people 30, money 25, programs 35, operations 50. Typecheck clean, build clean,
21 routes, lint unchanged from baseline.

**⚠️ Live visual verification: still NOT performed.** The Claude-in-Chrome extension was unavailable
on three separate attempts across this pass and the audit before it. HTTP status checks and static
responsive inspection **do not count**. Per the acceptance instruction, **H3.1 is therefore not
marked fully accepted** — the code defect is closed, the visual gate is not.

**Remaining risks.**

- Visual verification outstanding for all seven H2.6 and H3.1 routes at 390 / 768 / 1440 px.
- Revalidation narrows the stale-write window to the microseconds between the live read and the
  commit; it does not eliminate it. Closing it fully needs transactional writes, which needs the
  backend (H5.1). Acceptable for a single-device prototype and recorded here so it is not forgotten.
- The fingerprint deliberately ignores issue *message* wording. A reworded message with identical
  codes will not trigger a re-confirmation. Intentional — wording is presentation, not meaning.
### ✅ H3.2 — Execution Brief

**Workspace schema v7 and `OperationsState` v2. Both additive.** The first milestone after the
governance reconciliation, and the first that is new build rather than recovery.

**Schema v6 → v7 — additive, no backup.** Declares `Person.deliveryAddress` (ADR-011). The rung is
deliberately a **no-op on data**: no record is transformed and **no person is given an address**.
Every field is carried through by spread, including keys this build does not recognize, so a
forward-compatible payload survives the rung. A v1 workspace still walks **v1 → v7**, one rung at a
time — six rungs, proven.

**`OperationsState` v1 → v2 — additive.** Adds `executionBriefs`. A stored v1 payload is **migrated,
not quarantined** — discarding real operational history because a collection was added would be data
loss wearing a safety feature's clothes. The migration runs **in memory on read**; the upgraded
shape is persisted by the next write, so opening Operations never rewrites storage. **The storage key
keeps its `_v1` suffix on purpose**: it names a location, not a version, and moving it would orphan
every record already written.

**The address gate, exactly as ADR-011 requires.**

- A missing address **never blocks Moment generation**. `MOMENT_STATUSES` is unchanged at three
  values — completeness is a property of the brief, not the Moment.
- It **blocks brief confirmation**, names the missing fields, and links to the Workspace page that
  fixes them.
- The gate is enforced in **persistence as well as the interface**: a stored brief with an
  incomplete address is refused, so no caller can bypass it.
- An incomplete address on a `Person` is **valid stored state** — refusing the workspace over it
  would lock an administrator out of the screen that corrects it.

**Override and correction.** An operator overrides the address for **one brief**, with a required
reason, actor, channel and timestamp. **`Person.deliveryAddress` is never written** (ADR-005).
Correcting a confirmed brief preserves the original — only supersession metadata changes, proven by
field-by-field comparison — creates a revision, supersedes the confirming Decision, and appends
`ExecutionBriefAddressOverridden`. A Moment never holds two live briefs.

**Preview writes nothing.** `previewBrief` and both builders are pure and live in a module with no
storage access. The suite injects a write-recording storage and asserts the write count is
unchanged across repeated previews and a full confirmation build.

**Deliberately excluded**, and not started: item, vendor and courier selection (H3.3–H3.5); CSV
address columns; address verification or geocoding; multiple addresses per person. Each is a later
milestone or an explicit ADR-011 non-decision.

**Validation: 232 checks across eight suites, all passing** — verification 9, migration 18,
assignments 20, people 30, money 25, programs 35, briefs 45, operations 50.

### ✅ H3.2-D1 — the brief queue must not render a read failure as empty

**Found by the H3.1 recovery-integrity audit**, in code written during H3.2.

**Root cause.** `BriefsList.load()` carried a single `ready` boolean and collapsed three genuinely
different outcomes into it — workspace unavailable, repository read failed, and a healthy read of an
empty store. All three produced empty arrays, and the render then showed *"No moments are ready for
a brief yet."* An operator could not distinguish **no work** from **cannot see the work**, and the
reassuring reading was the dangerous one: briefs that existed would have looked like briefs that did
not. It also contradicted `ExecutionBrief.tsx` beside it, which already handled failures properly.

**Correction.** `loadBriefQueue()` in the existing briefs service returns a discriminated
`{ status: 'ok' … } | { status: 'failed', message, recovery, detail? }`. The component now renders
**four distinct states — loading, failed, empty, populated**. The adapter's own reason is preserved
in `detail` rather than flattened, the failure names a recovery, and the panel states plainly that
this *is not* an empty queue. Retry re-reads through the same path and **creates or changes no
canonical record**. No new abstraction: it mirrors the shape `confirmation.ts` already established.

**Regression coverage — 8 new checks, brief suite 37 → 45.** Healthy empty (38); healthy populated
(39); a person with no address still listed and flagged (40); malformed payload → error not empty
(41); foreign-workspace payload → error, never guessed empty (42); unreadable workspace → error (43);
retry performs a fresh read and recovers (44); reading writes no Brief, Decision or Event (45).

### ✅ Visual acceptance corrections — H3.1-D2…D4 and H3.2-D2…D3

**The live visual verification finally ran** on 2026-07-29, once the Chrome extension connected.
It found five defects that every automated suite had passed. All five are corrected here.

| # | Defect | Correction |
|---|--------|-----------|
| **H3.1-D2** | `OperationsShell`'s closed drawer kept **5 tab stops** while translated off-screen — keyboard and screen-reader users landed on navigation they could not see | `inert` + `aria-hidden` applied whenever the drawer is off-screen, driven by a `matchMedia('(min-width: 1024px)')` listener so it never applies at `lg` and above where the sidebar is permanently visible |
| **H3.1-D3** | Tap targets below any usable minimum — "Fix in workspace" **15px**, "Back to Command" **20px** | Both raised to a **44px** minimum with `inline-flex` + `min-h-[44px]` |
| **H3.1-D4** | Allocation read *"across 5 people"* beside *"4 Ready / 1 Need review"* — the figure counts everyone whose policy resolved, including those held back | The count is now stated: *"Includes 1 person who still needs review and cannot proceed yet."* The number was never wrong; it was ambiguous |
| **H3.2-D2** | `titleFor()` had no case for either new route — `/operations/briefs` fell through to **"Command"**, and `/operations/moments/[id]/brief` inherited **"Moments"** | Both cases added, brief tested **before** the moments prefix. Extracted to `lib/operations/routes.ts` so the mapping is unit-testable rather than only visible in a browser |
| **H3.2-D3** | The brief's missing-address recovery links to `/workspace/people`, but that directory showed **no indication of who lacked an address** — the destination did not surface what the operator was sent to fix | A "No delivery address" badge on both the mobile card and desktop row, driven by the **same `isAddressComplete()` predicate** the brief gate uses, so the two can never disagree |

**Regression coverage — 2 new checks, brief suite 45 → 47.** Route titles for all six Operations
paths (46); address completeness agreeing between the directory badge and the queue flag (47).
The drawer and tap-target fixes are verified in the browser rather than by unit test — they are
rendering properties, and asserting them in jsdom would prove nothing.

**Verified live at 390–500px:** drawer links **unfocusable** when hidden and fully interactive when
opened; both tap targets measured at **44px**; the allocation note rendering; the "No delivery
address" badge appearing on exactly the right people; header titles correct on every route.

**Still outstanding.** `WorkspaceShell` carries the **identical** drawer defect to H3.1-D2 —
9 tab stops when closed. It is E1-era code, outside both milestones, and deliberately left rather
than silently widening this scope. **It should be fixed before pilot.**

### ✅ H3 final visual acceptance — complete 10 × 3 matrix

**This is a different exercise from the targeted pass on 2026-07-28.** That one covered the
critical paths only — 11 of 30 cells — and its report contained an arithmetic error: it said
*"19 of 30 remain unchecked"* while its own matrix showed **20** unchecked cells. **The correct
figure was 20 unchecked / 10 checked**, and neither number is load-bearing now: this pass re-ran
**all 30 cells from scratch** and relied on none of the earlier results.

**Widths verified by reading `window.innerWidth` on every cell**, never by trusting a resize tool's
success report — an early screenshot in the previous pass reported success at 390 while the viewport
was actually 1360, and was discarded.

| Column | Measured |
|---|---|
| Mobile | **392px** on 8 routes; **500px** on 2 (`/workspace/people`, `/operations/briefs`) |
| Tablet | **768px** on all 10 |
| Desktop | **1440px** on all 10 |

⚠️ **Two mobile cells were measured at 500px, not ~390.** Chrome enforced a minimum window width
of 500 once the extension side panel was open — 340px was requested and 500 returned. Both are
below the `lg` (1024px) breakpoint, so the mobile layout was genuinely exercised, but the exact
390px figure was not reached on those two. Recorded rather than rounded.

**Result: no horizontal overflow, correct route header and correct drawer state on all 30 cells.**

### WorkspaceShell drawer — root cause and correction

The closed drawer kept **nine tab stops**. The cause was not merely a missing `inert`:

```jsx
aria-hidden={!open ? undefined : false}
```

That evaluates to *"not hidden"* in **both** states — closed **and** open. It never hid anything
from assistive technology at all.

Corrected with the pattern already verified in `OperationsShell`, extracted once rather than pasted
twice: **`lib/use-offcanvas-hidden.ts`** reads the `lg` breakpoint through `matchMedia` and returns
whether the drawer is currently off-canvas. Both shells consume it; the inline copy written for
H3.1-D2 was removed. It returns `false` during SSR and first paint, so hidden navigation is never
briefly exposed and no hydration mismatch is introduced.

**Browser evidence, `/workspace/people` at 392px:** closed → `inert=true`, `aria-hidden="true"`,
all **9** links refused focus, `document.activeElement` stayed `BODY`. Opened → `inert` and
`aria-hidden` removed, first link took focus. Escape → `inert` restored. At **1440px** on all ten
routes → drawer at `x=0`, **never** inert, navigation focusable.

### Further defects found and corrected in this pass

**Sub-44px touch targets across five H3.1/H3.2 routes.** The worst was **"Open in Workspace →" at
17px** — the recovery action out of a blocked brief, and the smallest control on the screen. Also
"Back to the moment" (20px), the override toggle (20px), "Back to moments" (20px), "Cancel this
moment" (20px), "View moments" (20px, in the already-prepared state) and the moments filter chips
(34px). All raised to a **44px** minimum. Re-verified at 500px: **zero** sub-44px controls remain
on `/operations/moments`, `/operations/moments/[id]`, `/operations/moments/[id]/brief`,
`/operations/programs/[id]/prepare`.

**H2-era targets — subsequently corrected.** The same defect class existed in H2.5/H2.6 code and
was initially left out of scope. It was corrected in a follow-up on request:
`/workspace/people` **13 → 0** (Edit/Pause/Archive raised from **16px**, "Or import a list" from
20px), `/workspace/programs/[id]` **2 → 0**, `/workspace/programs/new` **3 → 2**.

The two remaining are **42px text inputs** using the shared form-input class. They were left
deliberately: raising that class restyles every input across People, Policy and Campaign forms for
two pixels, and 42px clears WCAG 2.5.8 AA (24px) comfortably. Not a defect.

⚠️ **A regression was introduced and caught during this work.** Adding `flex-wrap` to the row
actions made them stack vertically in the desktop table's narrow actions column, tripling row
height to ~180px. Corrected with `whitespace-nowrap` and no wrapping; rows measured back at 77px.
A before/after measurement confirmed the tap-target classes add **0px** to the table's 924px
scroll width — that width is the pre-existing **EX-M8** `overflow-x-auto` behaviour, and page-level
overflow remains false at every width.

**Environmental interference accounted for.** The Notion extension's floating control overlays the
bottom-left of every page and obscured a primary CTA during the previous pass. It was suppressed by
injected CSS for the duration of this verification.

### ✅ EX-M8 closed, and a desktop overflow of my own making

**EX-M8 was mischaracterised in the previous report.** It was recorded as *"the People table still
relies on horizontal scroll below `lg` rather than a card layout"*. That was wrong twice over:

- The finding names **`PolicyLibrary.tsx` and `PeopleImport.tsx`**, not `PeopleDirectory`. Both have
  since been rebuilt and **contain no tables at all** — the `overflow-x-auto` it described is gone.
- `PeopleDirectory` was EX-M8's **good example**, not a victim. It renders cards below `lg` and a
  table above, and always has.

**EX-M8 is therefore resolved**, and was already resolved before this pass touched anything.

**What was actually broken was mine.** The desktop People table scrolled horizontally — 924px inside
an 830px container. Measured directly by hiding the H3.2 "No delivery address" badge and
re-measuring: **830px without it, 924px with it. The badge cost exactly 94px, exactly the
overflow.** Two badges laid side by side widened the Added column to 264px.

Fixed by stacking them vertically: Added column **264 → 162px**, table **924 → 830px**, inner scroll
gone, row heights unchanged at 77px, badge still shown.

**Why the complete matrix missed it.** The sweep tested `documentElement.scrollWidth > innerWidth` —
*page* overflow — which stayed `false` throughout because the scroll was contained inside the
table's own `overflow-x-auto`. A container scrolling within a page is exactly what Doctrine §2.8
calls a fallback, and the audit had no check for it. **Any future visual pass should measure inner
scroll containers, not only page overflow.**

### ✅ Pre-pilot experience corrections — EX-H1, EX-H3, EX-M5, EX-M8

The last open pre-pilot findings from the Experience Audit, plus the drawer
accessibility work finished properly.

**EX-H1 — assessment autosave.** Fifteen fields over four steps lived only in
`useState`; a refresh lost all of it, on the first thing a stranger fills in.
Now autosaved to `aniye_assessment_draft` and **offered back**, never silently
restored.

Read through **`useSyncExternalStore`**, not an effect and not a lazy
`useState` initializer. The server has no `localStorage`: a lazy initializer
would render nothing on the server and a resume prompt on the client — a
hydration mismatch. `getServerSnapshot` returns `null` so both renders agree.
`getSnapshot` returns the **raw string**, which `Object.is` compares by value,
so an unchanged draft cannot loop; parsing happens separately in a `useMemo`.
Same-window writes announce themselves through a custom event, because
`storage` only reaches *other* tabs.

**EX-H3 — `PolicyForm` guided rebuild.** Six sections, fourteen fields and nine
occasion rows on one page became **four steps**: name → occasions → delivery →
review. Everything after step 2 has a sensible default, so a rule is publishable
once occasions are set. Gift preferences sit behind progressive disclosure.

**EX-M5 — policy draft autosave.** Landed with EX-H3, which it depended on. New
rules autosave to `aniye_policy_draft` and are offered back; **edits are never
autosaved**, so an abandoned edit leaves the stored rule exactly as it was.

**Drawer first-frame accessibility.** The previous fix relied on `inert` applied
by an effect, which leaves the first frame unprotected. Corrected in both shells
with **`invisible` / `lg:visible` in CSS**: `visibility: hidden` removes the
closed drawer from the tab order and the accessibility tree from first paint,
with no JavaScript. Server and initial client markup are unchanged — the shells
render a loading state and mount the drawer only after hydration, so there is no
markup to mismatch. `inert` and `aria-hidden` remain as belt-and-braces once the
breakpoint is known.

**EX-M8 — closed, no code needed.** Its two named components, `PolicyLibrary.tsx`
and `PeopleImport.tsx`, were rebuilt without tables, so the `overflow-x-auto` it
described no longer exists. `PeopleDirectory` was the cited good example and
still renders cards below `lg`.

**Browser evidence.**

| Claim | Evidence |
|---|---|
| Drawer safe at first frame | With `lg:visible` removed and **`inert`/`aria-hidden` stripped**, computed `visibility: hidden` and **all links refused focus** — CSS alone, both shells |
| Desktop nav visible and focusable | `visibility: visible`, focus succeeds at 1792px, both shells |
| Open restores it | `invisible` → `visible` on the hamburger, both shells |
| Escape and backdrop close it | Both return the drawer to `invisible` |
| EX-H1 autosave | Draft written on first keystroke; step persisted as the wizard advanced |
| EX-H1 resume | Prompt shown after reload; **Continue restored Step 2 of 4** and all three field values |
| EX-H1 start fresh | Draft removed, wizard reset to Step 1, fields empty |
| EX-H1 submit | Draft cleared, `aniye_last_submission` written, return visit shows **no** resume prompt |
| EX-H3 create | Four steps, Review lists every value, publish enabled only with a name and an occasion |
| EX-H3 edit | Full prefill across all steps; Back/Forward retained values exactly; save transitioned Draft → Published with no duplicate |
| EX-H3 edit autosave suppressed | `aniye_policy_draft` stayed `null` throughout an edit |
| EX-H3 cancel | Stored policy unchanged across all ten fields, gifts, exclusions and rules |

**A note on the verification itself.** A renderer freeze during this pass was
caused by my own instrumentation — a `setInterval(…, 0)` polling for an element
that does not exist on `/assessment` — not by the application. Recorded so the
freeze is not later mistaken for a product defect.

### ⛔ The hard gate before an external pilot

**Browser persistence is an internal prototype only.** Per ADR-010, all of the following are mandatory before anyone outside Aniyé touches this:

1. A **production backend** with durable server-side persistence.
2. **Authentication** — none exists; anyone who can reach the app can reach `/operations`.
3. **Multi-tenancy** with enforced isolation, since operators work across organizations.
4. **Secure file storage**, before proof of delivery exists.

**No vendor, courier, recipient or additional internal user may be given access while Operations runs on browser storage.** Each implies a second party reading or writing operational records, and this adapter can authenticate nobody and prevent nobody with devtools from rewriting the audit trail.

This moves the backend **earlier than the H2→H3 checkpoint anticipated** — it is now the gate on Execution Briefs reaching anyone outside Aniyé, not merely a scaling concern.

### Still required before an external pilot

- **EX-H1** — assessment autosave; ~15 fields are still lost on refresh.
- **EX-H3** — `PolicyForm` guided rebuild.
- **Live responsive visual review on real devices.** Never performed. H3.1 adds four more routes that have had no visual check at any width.

### ~~The remaining gate before the minimum closed operational loop~~ — ⚠️ superseded, written at R5

> ⚠️ **Superseded by H3.1 and ADR-010.** Retained verbatim below as the R5-era record. **Two of its
> three claims are now wrong:**
>
> - **"A `Moment` type and collection (schema v7)"** — ✅ **superseded by ADR-010.** `WorkspaceState`
>   **stays at v6** and gains no operational collection. Moments live in a separate `OperationsState`
>   at **v1**, versioned independently. Schema **v7 is a different change entirely** — the additive
>   `Person.deliveryAddress` field of ADR-011, and it is **not built**.
> - **"The next milestone is Moment generation"** — ✅ **delivered as H3.1.** The next milestone is
>   **H3.2, Execution Brief**.
>
> The third claim — per-Moment policy snapshotting — was delivered as specified.

**H2 Configure is finished.** An organization can now describe who matters, how each group is recognized, which rule reaches whom, who its people are, and what it has committed to.

The next milestone is **Moment generation** — checkpoint Part 3, milestone 3. It is the first step that produces operational records rather than configuration, and it needs three things that do not exist yet:

1. A `Moment` type and collection (schema v7).
2. **Per-Moment policy snapshotting** — the piece ADR-004 deliberately deferred from the Program.
3. `Decision` and `OperationalEvent` records (ADR-006), which are the first objects that arguably belong in a backend rather than a browser document.

After Moments come the Execution Brief and the `/operations` surface (ADR-005), at which point the client-only architecture will be genuinely strained.

**Still required before an external pilot, unchanged by R5:**

- **EX-H1** — assessment autosave; ~15 fields are still lost on refresh.
- **EX-H3** — `PolicyForm` guided rebuild.
- **Live mobile visual verification on real devices.** Never performed. R5 added three routes that have had no visual check at any width.

### Still required before an external pilot

- **Live mobile visual verification on real devices — still outstanding.** E1's responsive work was verified by static analysis and an HTTP smoke test only; the Chrome extension was not connected and no screenshot was taken at any width. R4 changed no layout, so this is unchanged and still required.
- **EX-H1** — assessment autosave (~15 fields still lost on refresh).
- **EX-H3** — `PolicyForm` guided rebuild.
- A backend with real tenant isolation, if the pilot involves more than one organization.

### ~~⚠️ Gate before Operations reconstruction~~ — ✅ satisfied, retained for the record

> ✅ **This gate is closed.** The architecture-correction checkpoint completed, all four questions
> were answered, and the resulting ADRs were accepted: **ADR-004** (Program definition),
> **ADR-005** (Workspace/Operations boundary), **ADR-006** (Decision vs Operational Event) and
> **ADR-007** (Money — conflict C6). Operations reconstruction proceeded as H3.1.
>
> ⚠️ The final paragraph below is factually stale: Money is **no longer** stored as face value —
> ADR-007 landed as schema v5 — and the "Decision Engine" it refers to is **ADR-003, retired**.

**Operations reconstruction must not begin until the architecture-correction checkpoint is completed.** That checkpoint covers:

1. **Program definition** — what a Program actually is, and how it relates to Moments
2. **Workspace versus Operations boundary** — which domain owns what, per Atlas §3
3. **Decision versus Operational Event distinction** — the Relationship Engine / Knowledge boundary in concrete terms
4. **Minimum financial and Money model** — conflict C6, which must be settled before any budget arithmetic

C6 in particular is now load-bearing: Money is still stored as face value rather than minor units, and the Decision Engine cannot do budget arithmetic safely until that is resolved.

---

## 1. Current Remote HEAD

| Item | Value |
|------|-------|
| Remote | `https://github.com/Omagz229/aniye-africa-landing.git` |
| HEAD SHA | `b639349b2add816801cd083c79bac3fa9470a799` |
| Short SHA | `b639349` |
| Subject | `feat(ADR-001 + H2.3): Recognition Policy as first-class object + Policy Library` |
| Working tree | Clean |
| Active branch | `recovery/h3-reconstruction` |

**All remote refs point at the same commit:**

```
b639349  refs/heads/main
b639349  refs/heads/recovery/h3-reconstruction
b639349  refs/tags/h2-complete
b639349  refs/tags/h3.5-vendor-intelligence
```

### ⚠️ Critical finding — misleading tag

The tag **`h3.5-vendor-intelligence` points at the H2.3 commit**, not at any H3 work.
The tag was created and pushed, but the commits it was meant to mark never reached the remote.
**This tag must not be trusted as evidence that H3.5 exists.** It should be deleted or re-pointed
once reconstruction reaches H3.5.

### Local recovery is not possible

| Check | Result |
|-------|--------|
| `git reflog` | Only two entries: `clone` then `checkout` — this is a fresh clone |
| `git stash list` | Empty |
| `git fsck --lost-found` | No dangling commits, trees, or blobs |
| Unpushed local branches | None |

There is **no unpushed work recoverable from this machine**. Everything after `b639349`
must be reconstructed from the System Atlas and the milestone specifications.

---

## 2. Build & Typecheck Status

| Check | Command | Result |
|-------|---------|--------|
| Install | `npm install` | ✅ Pass (6 high-severity advisories in transitive deps; 2 unapproved install scripts — `sharp`, `unrs-resolver`) |
| Typecheck | `npx tsc --noEmit` | ✅ Pass — 0 errors |
| Build | `npm run build` | ✅ Pass — compiled in 3.1s, 13 static pages generated |

**Note:** `package.json` has **no `typecheck` script**. Only `dev`, `build`, `start`, `lint` exist.
Adding `"typecheck": "tsc --noEmit"` is recommended as part of reconstruction hygiene.

**Stack:** Next.js `16.2.9` (Turbopack), React `19.2.4`, Tailwind `^4`, TypeScript `^5`.
No state library, no test runner, no persistence layer beyond `localStorage`.

---

## 3. Surviving Milestones

Confirmed present on the remote:

| Milestone | Commit | Status |
|-----------|--------|--------|
| H1 — Landing page MVP | `73dd36e` | ✅ Present |
| H1 — Assessment wizard (4 steps) | `b4dd3ba` | ✅ Present |
| H1 — Relationship Snapshot report | `e53aaee` | ✅ Present |
| System Atlas v1.0 → v2.0 | `3fae2a0` | ✅ Present |
| System Atlas v2.1 (5 pre-H2 decisions) | `74ebaff` | ✅ Present |
| H2.1 — Organization Workspace Foundation | `e91e9bd` | ✅ Present |
| H2.2 — Relationship Classes workspace step | `fa8a8d8` | ✅ Present |
| ADR-001 + H2.3 — Recognition Policy as first-class object + Policy Library | `b639349` | ✅ Present |

**Latest surviving milestone: H2.3 (Policy Library), with ADR-001 recorded in System Atlas v2.2.**

---

## 4. Missing Milestones

All confirmed absent from the repository — verified by file inspection, not assumption.

| # | Milestone | Evidence of Absence |
|---|-----------|--------------------|
| 1 | ~~**ADR-002** — Relationship Type + numeric Relationship Level~~ | ~~Atlas §18 stops at ADR-001. `lib/workspace.ts` still uses the two-axis `RelationshipCategory` + string `RelationshipTier` model.~~ **✅ Reconstructed in R1.** |
| 2 | ~~**H2.4** — Policy Assignments~~ | ~~`PolicyAssignment` is specified in Atlas §4 and §11 but has **no TypeScript type, no route, no component**.~~ **✅ Reconstructed in R2.** |
| 3 | ~~**H2.5** — People Sources and People~~ | ~~`Person` specified in Atlas §4, `PeopleSource` in Atlas §12. No types, no `/workspace/people` route.~~ **✅ Reconstructed in R3.** |
| 4 | ~~**Relationship Operations Atlas**~~ | ~~No such file in `docs/`. Only `ANIYE_SYSTEM_ATLAS.md` exists.~~ **✅ Reconstructed in R6** as [`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md), from repository-confirmed architecture and accepted ADRs only. Rules that could not be recovered are marked **Unresolved** rather than invented. |
| 5 | ~~**ADR-003** — Decision Engine~~ | ⚠️ **Struck — retired permanently, not a missing milestone.** Only a number and a title ever survived. The checkpoint concluded no such object is needed: `resolvePolicyAssignment()` resolves policy, and ADR-006's `Decision` records judgements. **The number is not reused and not renumbered.** See [`adr/README.md`](adr/README.md) |
| 6 | ~~**H3.1** — Moment Engine~~ | ~~No `Moment` type in code.~~ **✅ Reconstructed in H3.1** — in `lib/operations/`, not `lib/workspace.ts`, per ADR-010 |
| 7 | ~~**H3.2** — Execution Brief~~ | **✅ Built in H3.2.** `lib/operations/briefs.ts`, `/operations/briefs`, `/operations/moments/[id]/brief`. Workspace schema v7 + `OperationsState` v2 |
| 8 | ~~**H3.3** — Catalog Intelligence~~ | ⚠️ **Redefined.** **H3.3 is a minimum flat catalog with manual item selection.** Atlas §9's Intent → Category → Collection → Item hierarchy is **Catalog Intelligence, H4.2** — deferred until the pilot produces evidence |
| 9 | ~~**H3.4** — Gift Intelligence~~ | ⚠️ **Redefined.** **H3.4 is a vendor directory with hand-entered offers.** Gift Intelligence is **H4.3**. `GIFT_CATEGORIES` remains a flat string list and that is correct for H3.3 |
| 10 | ~~**H3.5** — Vendor Intelligence~~ | ⚠️ **Redefined.** **H3.5 is a courier directory with manual selection.** Vendor Intelligence is **H4.4**. The `h3.5-vendor-intelligence` tag was a false marker and was deleted in R2 (C9) |

**Nothing after H2.3 survived.** Items 1–3 were reconstructed in R1, R2 and R3; item 6 in H3.1; item 4 in R6. Item 5 is **struck, not outstanding**. Items 7–10 are new build, redefined by the Council decisions of 2026-07-28 and tracked in [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) as **H3.2 … H3.8**. **Recovery is complete.**

---

## 5. Existing Routes

From `npm run build` output — **21 routes total** (re-run and re-counted in R6):

| Route | Rendering | Milestone | Source |
|-------|-----------|-----------|--------|
| `/` | Static | H1 | `app/page.tsx` |
| `/assessment` | Static | H1 | `app/assessment/page.tsx` |
| `/report` | Dynamic | H1 | `app/report/page.tsx` |
| `/verify` | Dynamic | H2.1 | `app/verify/page.tsx` |
| `/workspace` | Static | H2.1 | `app/workspace/page.tsx` |
| `/workspace/profile` | Static | H2.1 | `app/workspace/profile/page.tsx` |
| `/workspace/classes` | Static | H2.2 | `app/workspace/classes/page.tsx` |
| `/workspace/policies` | Static | H2.3 | `app/workspace/policies/page.tsx` |
| `/workspace/policies/new` | Static | H2.3 | `app/workspace/policies/new/page.tsx` |
| `/workspace/policies/[id]` | Dynamic | H2.3 | `app/workspace/policies/[id]/page.tsx` |
| `/workspace/assignments` | Static | **H2.4 (R2)** | `app/workspace/assignments/page.tsx` |
| `/workspace/people` | Static | **H2.5 (R3)** | `app/workspace/people/page.tsx` |
| `/workspace/programs` | Static | **H2.6 (R5)** | `app/workspace/programs/page.tsx` |
| `/workspace/programs/new` | Static | **H2.6 (R5)** | `app/workspace/programs/new/page.tsx` |
| `/workspace/programs/[id]` | Dynamic | **H2.6 (R5)** | `app/workspace/programs/[id]/page.tsx` |
| `/operations` | Static | **H3.1** | `app/operations/page.tsx` |
| `/operations/moments` | Static | **H3.1** | `app/operations/moments/page.tsx` |
| `/operations/moments/[id]` | Dynamic | **H3.1** | `app/operations/moments/[id]/page.tsx` |
| `/operations/programs/[id]/prepare` | Dynamic | **H3.1** | `app/operations/programs/[id]/prepare/page.tsx` |
| `/sitemap.xml` | Static | H1 | `app/sitemap.ts` |
| `/_not-found` | Static | — | framework |

`/operations/*` is a **separate route tree with its own shell and navigation** (ADR-005). It shares
nothing with `WorkspaceSidebar`. It has **no authentication and no role model** — anyone who can
reach the app can reach it (ADR-010).

### Routes referenced but not implemented

Shown in `app/components/operations/OperationsShell.tsx` as explicitly unavailable rather than
omitted, so there are no clickable dead ends:

- **Catalog** — H3.3 · **Vendors** — H3.4 · **Couriers** — H3.5 · **Fulfilment** — H3.6.

~~**Execution Briefs** — H3.2.~~ Built in H3.2; now a live nav entry.

~~No route exists for **Policy Assignments** (H2.4).~~ Added in R2.
~~`/workspace/people` — required by H2.5.~~ Added in R3.
~~`/workspace/programs` — intentionally unimplemented, `built: false`.~~ Added in R5. The sidebar entry is now labelled *Campaigns* with `built: true` (`WorkspaceSidebar.tsx:27`).

---

## 6. Existing Canonical Objects

### Implemented in `lib/workspace.ts`

| Object / Type | Line | Notes |
|---------------|------|-------|
| `WorkspaceState` | 18 | Root persisted object; flattens Organization + Workspace + Organization Profile |
| `SetupStage` | 1 | `profile \| classes \| policies \| people \| programs \| active` |
| `RelationshipClass` | — | **R1:** two-axis model is now `type` + numeric `level` (ADR-002) |
| ~~`RelationshipCategory`~~ | — | **R1:** removed. Superseded by `RelationshipType`; survives only as `LegacyRelationshipCategoryV1` in `lib/migrations.ts` |
| ~~`RelationshipTier`~~ | — | **R1:** removed. Superseded by numeric `level`; survives only as `LegacyRelationshipTierV1` in `lib/migrations.ts` |
| `RelationshipType` | — | **R1:** `Employee \| Client \| Partner \| Supplier \| Board \| Investor \| Government \| Community \| Other` |
| `PolicyAssignment` | — | **R2:** `relationshipClassId` + `recognitionPolicyId` + optional `countryCode` + `priority` + `isActive`. References only, never denormalized |
| `AssignmentScope` | — | **R2:** `Global \| Country`, *derived* from `countryCode` rather than stored |
| `Person` | — | **R3:** required names, optional normalized email as the identity key, `relationshipClassIds` references, `sourceId` + `sourceType` provenance, `Active \| Archived` |
| `PeopleSource` | — | **R3:** `Manual \| CSV \| HRIS`; one source per CSV import, one reusable Manual source per workspace. HRIS is a declared future type with no integration |
| `Money` | 40 | `{ amount, currency }` — face value, not minor units |
| `RecognitionPolicy` | 87 | Full ADR-001 shape incl. `version`, `parentPolicyId` |
| `RecognitionRule` | 76 | `momentType`, `budgetPerPerson`, `isEnabled` |
| `ApprovalWorkflow` | 82 | `None \| Manager \| Finance \| Executive` |
| `DeliveryRequirement` | 83 | `Standard \| Courier \| HandDelivered \| Digital` |
| `ReportingCadence` | 84 | `None \| Weekly \| Monthly \| Quarterly` |
| `PolicyStatus` | 85 | `Draft \| Published \| Archived` |
| `GIFT_CATEGORIES` | 47 | 12 flat strings |
| `RECOGNITION_MOMENT_TYPES` | 63 | 9 strings, matches Atlas §11 |
| `DEFAULT_RELATIONSHIP_CLASSES` | 111 | 11 seeded classes |
| `SUPPORTED_CURRENCIES` | 125 | `NGN, KES, GHS, ZAR, USD` |
| `TIMEZONES` | 136 | 12 zones |

### Specified in the Atlas but absent from code

`Organization` (§4), `Workspace` (§4, as distinct from Organization), `Organization Profile` (§4, as a
distinct object), `Relationship Profile` (§4), `Program` (§4), `Moment` (§4),
`Gift / Item` (§4), `Fulfillment` (§4), `Memory` (§4), `Insight` (§4).

~~`Policy Assignment` (§4, §11)~~ — implemented in R2.
~~`Person` (§4), `PeopleSource` (§12)~~ — implemented in R3.

---

## 7. Current Persistence / Schema

### localStorage keys in use

| Key | Written by | Shape |
|-----|-----------|-------|
| `aniye_workspace` | `lib/migrations.ts` (`WORKSPACE_KEY`) | Single serialized `WorkspaceState`, carrying `schemaVersion` — **currently v7** (`lib/migrations.ts`, `CURRENT_WORKSPACE_SCHEMA_VERSION`) |
| `aniye_last_submission` | `app/components/assessment/AssessmentWizard.tsx:35` | Assessment answers, written **once at submit** (H1, pre-workspace). *Corrected during the Experience Audit — this ledger and Atlas §2 both previously recorded the key as `aniye_assessment`, which the code has never used (EX-L7).* |
| `aniye_workspace_backup_v<n>_<ts>` | **R1:** `lib/migrations.ts` | Verbatim pre-migration payload, written before a destructive migration only |
| `aniye_workspace_quarantine` | **R1:** `lib/migrations.ts` | Unreadable payload set aside so it cannot be overwritten. Written at most once |
| `aniye_person_draft` | **R3a:** `PersonForm.tsx` | An unfinished new person, so the flow can be resumed. Never workspace data; cleared on save or cancel; not written for edits |
| `aniye_program_draft_v1` | **R5:** `CampaignWizard.tsx` | An unfinished Campaign, resumable. Draft only — nothing reaches `workspace.programs` until the final step |
| `aniye_operations_v1` | **H3.1:** `lib/operations/local-store.ts` | Serialized `OperationsState` — **schema v2, versioned independently** of the workspace chain (ADR-010). The key keeps its `_v1` suffix deliberately: it names a storage *location*, and moving it would orphan existing operational history |
| `aniye_operations_quarantine` | **H3.1:** `lib/operations/local-store.ts` | Unreadable **or foreign-`workspaceId`** operational payload, set aside rather than overwritten. Written at most once |

**E1 added no storage keys.** `/verify` now writes `aniye_workspace` only when no workspace exists.

### Storage model

- **Two documents, two chains.** `WorkspaceState` (**v7**) is customer configuration.
  `OperationsState` (**v2**) is Aniyé's record of what it did. They version independently and
  neither migrates the other — ADR-010.
- **One blob per document.** Policies, classes, people and programs are nested arrays inside
  `WorkspaceState`, not separate collections. There is no index, no per-object key.
- Workspace is seeded in `app/components/verify/VerifyGate.tsx` at the moment the user passes the
  verify gate — read-before-write since E1, so an existing workspace is continued, never replaced.
- Workspace read/write surface is four functions: `getWorkspace`, `saveWorkspace`,
  `updateWorkspace`, plus stage helpers.
- **Operations has no equivalent.** Access is through the `OperationsRepository` interface with
  named operations only — there is deliberately **no generic `save(state)`**, because a generic
  setter is how append-only guarantees get lost (`lib/operations/store.ts`).

### Schema/version gaps

| # | Gap | Impact on reconstruction |
|---|-----|-------------------------|
| S1 | ~~**No `schemaVersion` field** on `WorkspaceState`.~~ | **✅ Resolved in R1.** `schemaVersion` is stamped on every write; `createWorkspace()` is the single construction point. |
| S2 | ~~**Migrations are ad-hoc presence checks** — "if field missing, seed it."~~ | **✅ Resolved in R1.** `lib/migrations.ts` provides an ordered, idempotent, validated migration chain with backup and safe failure. |
| S3 | ~~**Money stored as face value**, not smallest currency unit.~~ | **✅ Resolved in R4.** ADR-007 implemented as schema v5 — integer minor units, pinned exponent table, destructive migration with backup. Conflict C6 closed. *(The original entry said this must be reconciled "before any budget arithmetic in the Decision Engine (ADR-003)". **ADR-003 is retired and was never a dependency**; the reconciliation happened under ADR-007.)* |
| S4 | **No `workspaceId` on `RelationshipClass`**, though `RecognitionPolicy` has one and Atlas §4 requires it on both. — still open | Inconsistent ownership model; breaks once multi-workspace arrives. ADR-005 notes every canonical object gains an authoritative `workspaceId` once the backend lands. |
| S5 | `WorkspaceState` carries `organizationId` only — Organization, Workspace, and Organization Profile are collapsed into one flat record. Atlas §4 defines three distinct objects. | Acceptable for H2/H3 local-storage phase, but must be recorded as intentional debt. |
| S6 | ~~No collection for `policyAssignments`, `people`, `peopleSources`, `programs`, or `moments`.~~ | **✅ Resolved.** `policyAssignments` landed as v3 (R2); `people` and `peopleSources` as v4 (R3); `programs` as v6 (R5). **`moments` did not land in `WorkspaceState` at all** — ADR-010 answered the open question by putting Moments, Decisions and Events in a separate `OperationsState` v1. The workspace document has no operational collection and will not gain one. |
| S7 | ~~**No delivery address on `Person`.**~~ | **✅ Resolved in H3.2.** ADR-011 implemented as **schema v7, additive** — `Person.deliveryAddress`, optional and customer-controlled. No record was transformed and no person was given an address by migration. |

---

## 8. Conflicting or Outdated Architecture Found

These are live contradictions between the surviving code and the surviving Atlas.
They must be resolved deliberately during reconstruction, not silently overwritten.

### Dependency classification (R6)

Every **still-open** conflict, schema gap and People compromise below carries one of three markers.
Resolved entries need none.

| Marker | Meaning |
|---|---|
| 🔴 | **Blocks H3.2** — the Execution Brief cannot be built correctly without it |
| 🟠 | **Blocks a later named milestone** — named explicitly, and only that one |
| ⚪ | **Does not currently block implementation** |

**Nothing open in this section is 🔴.** The full open register:

| Item | Blocks | Milestone |
|---|:---:|---|
| **C2** — class lifecycle fields | ⚪ | — |
| **C5** — default class seed list | ⚪ | — |
| **S4** — no `workspaceId` on `RelationshipClass` | 🟠 | **H5.1** — multi-tenancy |
| **S5** — Organization / Workspace / Profile collapsed | 🟠 | **H5.2** — multi-workspace |
| ~~**S7**~~ — delivery address on `Person` | — | ✅ **Resolved in H3.2**, schema v7 |
| **P1, P2** — field-level provenance, admin-locked fields | 🟠 | **H5.4** — first HR connector |
| **P3** — source priority not configurable | 🟠 | **H5.4** |
| **P4** — name + startDate conflict detection | 🟠 | **H5.4** — connectors supplying records with no email |
| **P5** — no `.xlsx` import | ⚪ | — |
| **P6** — `tags`, `department`, `manager` absent | 🟠 | **H5.4** |
| **P8** — repeated class id deduplicated at count time | ⚪ | Cosmetic |

| # | Conflict | Code | Atlas | Resolution |
|---|----------|------|-------|-----------|
| C1 | ~~**Relationship Class taxonomy** — the central conflict.~~ | ~~`category` + `tier`~~ | ~~§4: single `tier` enum~~ | **✅ Resolved in R1.** ADR-002 supersedes both. Code and Atlas §4/§10 now agree on `type` + numeric `level`. |
| C2 | **Class lifecycle fields** — still open | `isDefault: boolean`, `isActive: boolean` | §4: `isCustom: boolean`, `status: Draft \| Active \| Archived` | Atlas is authoritative; `isActive` cannot express Draft, and Atlas §10 requires archive-not-delete. Deliberately **out of ADR-002 scope** — it is a lifecycle change, not a taxonomy one. Atlas §4 now carries an implementation note pointing here. |
| C3 | ~~**`memberCount` missing**~~ | — | — | **✅ Resolved in R3** — by deriving rather than storing. `lib/people.ts` computes active/total counts per class, unassigned people, and invalid class references on read. Atlas §4 and §10 updated to say `memberCount` is derived, never persisted. |
| C4 | ~~**Policy lifecycle truncated**~~ — **✅ Resolved in R4** by ADR-009, which amends the Atlas rather than the code: `Preview` is a UI mode and approval is a governance record, so the implemented three states were already correct. Original entry retained below. | `PolicyStatus = Draft \| Published \| Archived` | §4 and §11: `Draft → Preview → Approved → Published → Archived`, with approver ID + timestamp recorded at Approve | Code is missing the `Preview` and `Approved` states and the approval audit fields. **Held out of H2.4 by instruction.** H2.4 treats `Published` as the sole executable status, which is forward-compatible: when `Approved` and `Preview` arrive, only `EXECUTABLE_POLICY_STATUS` in `lib/migrations.ts` and the assignability gate need revisiting. Recorded here as the remaining Atlas mismatch. |
| C5 | **Default class seed list incomplete** — still open | 11 classes in `DEFAULT_RELATIONSHIP_CLASSES` | §10 previously listed 16 standard classes | Out of ADR-002 scope. R1 aligned Atlas §10 to the 11 classes the code actually seeds, so the two no longer contradict each other; whether to seed more (Strategic Partners, Government, Media, Community) and whether `Staff` should be named `Employees` remain open product questions. |
| C6 | ~~**Money unit**~~ | — | — | **✅ Resolved in R4.** ADR-007 accepted and implemented as schema v5: integer minor units + ISO 4217, pinned exponent table, destructive migration with backup. 25 validation checks. |
| C7 | ~~**No Policy Assignment layer**~~ | — | — | **✅ Resolved in R2.** `PolicyAssignment`, the `policyAssignments` collection, `/workspace/assignments`, and `resolvePolicyAssignment()` now close the chain. |
| C8 | ~~**Setup checklist has no assignments stage**~~ | — | — | **✅ Resolved in R2.** `assignments` inserted between `policies` and `people` across `SETUP_STAGES`, the sidebar, the checklist, and the stage-order helpers. |
| C9 | ~~**Misleading git tag**~~ | — | — | **✅ Resolved in R2.** `h3.5-vendor-intelligence` deleted locally and from the remote; `recovery-r1-adr002` created against the real R1 commit. |
| C10 | ~~**No `typecheck` npm script**~~ | — | — | **✅ Resolved in R1.** `typecheck` and `validate:migration` scripts added. |

### People-specific compromises (new in R3)

These are deliberate H2.5 scope decisions, not defects. Each is recorded so the checkpoint can revisit it.

| # | Compromise | Why | When it matters |
|---|-----------|-----|-----------------|
| P1 | **No field-level provenance.** A higher-priority import replaces supplied fields wholesale; the record does not remember which source last set each individual field. | Atlas §12 specifies admin-`locked` fields and a `rawSource` audit blob. Both are connector-era concerns and would be speculative without a real HRIS. | When the first HR connector ships and two live sources contend for the same record. |
| P2 | **No admin-locked fields.** Specified in Atlas §12, not built. | Same as P1 — the locking UI has no meaning until multiple automatic sources exist. | Same as P1. |
| P3 | **Source priority is fixed, not configurable per workspace.** Atlas §12 says reranking is a workspace setting. | `HRIS > CSV > Manual` is the documented default; making it configurable before any integration exists would be a setting nobody could use. | H4 integrations. |
| P4 | **Name + startDate conflict detection is not implemented.** Only normalized email matches automatically. | Deliberate: it is a heuristic, and H2.5's rule is that nothing merges without a real key. | When connectors supply records with no email. |
| P5 | **Excel (.xlsx) import is not implemented**, though Atlas §12 lists it at H2. | CSV covers the same need with an RFC 4180 parser and no dependency. Excel would require a parsing library. | If operators actually arrive with .xlsx rather than .csv. |
| P6 | **`Person.tags`, `department`, and `manager` are not implemented.** | `tags` is unused elsewhere; `department`/`manager` belong to the HR connector shape in Atlas §12, not the canonical model today. | Org-chart-aware recognition, H4+. |
| P7 | ~~**`Person.status` is `Active \| Archived`**~~ | **✅ Superseded in R4.** The H2.5 reasoning held at the time: with no Programs, "excluded from automatic population" had no meaning. ADR-004 created that meaning, so ADR-008 restored `Inactive`. | Resolved. |
| P8 | **A repeated class id on one Person record is deduplicated at count time, not at write time.** | Counting once per class is the behaviour that matters; normalizing on write would need a migration for existing records. | Cosmetic only. |

---

## 9. Files Requiring Reconstruction

> **R1 landed:** `lib/migrations.ts` (new), `lib/workspace.ts`, `app/components/workspace/RelationshipClassesPage.tsx`,
> `app/components/verify/VerifyGate.tsx`, `scripts/validate-schema-migration.mts` (new), `package.json`,
> `tsconfig.json`, `docs/ANIYE_SYSTEM_ATLAS.md`, `docs/RECOVERY_LEDGER.md`.
> `SetupChecklist.tsx` and `WorkspaceSidebar.tsx` needed no change for ADR-002 — neither reads the
> class taxonomy. The policy components (`PolicyForm`, `PolicyDetail`, `PolicyLibrary`) were likewise
> untouched: their "category" references are *gift* categories, unrelated to Relationship Class.
>
> **R2 landed:** `lib/assignments.ts` (new), `app/components/workspace/PolicyAssignmentsPage.tsx` (new),
> `app/workspace/assignments/page.tsx` (new), `scripts/validate-policy-assignments.mts` (new),
> `scripts/register-ts-resolver.mjs` (new), `lib/migrations.ts`, `lib/workspace.ts`,
> `app/components/workspace/SetupChecklist.tsx`, `WorkspaceSidebar.tsx`, `PolicyLibrary.tsx`,
> `package.json`, `tsconfig.json`, `scripts/validate-schema-migration.mts`, and both docs.
> `VerifyGate.tsx` needed no change — it creates workspaces through `createWorkspace()`, which
> picked up the new collection automatically. That is the R1 foundation paying off.
>
>
> **R3 landed:** `lib/people.ts` (new), `lib/csv.ts` (new),
> `app/components/workspace/PeopleDirectory.tsx` (new), `PersonForm.tsx` (new),
> `PeopleImport.tsx` (new), `app/workspace/people/page.tsx` (new),
> `scripts/validate-people.mts` (new), `lib/migrations.ts`, `lib/workspace.ts`,
> `SetupChecklist.tsx`, `WorkspaceSidebar.tsx`, `package.json`,
> `scripts/validate-policy-assignments.mts`, and both docs.
> `VerifyGate.tsx` again needed no change, for the same reason as in R2.
>
> **R5 landed:** `lib/programs.ts` (new), `app/components/workspace/CampaignWizard.tsx` (new),
> `NewCampaign.tsx` (new), `ProgramDetail.tsx` (new), `ProgramsPage.tsx` (new),
> `app/workspace/programs/{page,new/page,[id]/page}.tsx` (new),
> `scripts/validate-programs.mts` (new), `lib/migrations.ts`, `lib/workspace.ts`,
> `SetupChecklist.tsx`, `WorkspaceHeader.tsx`, `WorkspaceSidebar.tsx`, `package.json`,
> `scripts/validate-money.mts`, `scripts/validate-policy-assignments.mts`,
> `scripts/validate-verification.mts`, `docs/adr/ADR-004-program-definition.md`, and both docs.
>
> **H3.1 landed:** `lib/operations/{types,store,local-store,generation}.ts` (new),
> `app/components/operations/{OperationsShell,OperationsCommand,MomentsList,MomentDetail,PrepareMoments}.tsx` (new),
> `app/operations/{layout,page,moments/page,moments/[id]/page,programs/[id]/prepare/page}.tsx` (new),
> `scripts/validate-operations.mts` (new), `docs/adr/ADR-010-operational-persistence-boundary.md` (new),
> `app/components/workspace/ProgramDetail.tsx`, `package.json`, `docs/adr/README.md`, and both docs.
> **`lib/workspace.ts` and `lib/migrations.ts` needed no change** — ADR-010 kept operational
> records out of the workspace document entirely.
>
> **R6 landed (documentation only):** `docs/adr/ADR-011-recipient-address.md` (new),
> `docs/MASTER_ROADMAP.md` (new), `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` (new),
> `docs/adr/README.md`, `docs/ANIYE_SYSTEM_ATLAS.md`, `docs/RECOVERY_LEDGER.md`.
> **No application file, schema, migration, validation script or `package.json` changed.**
>
> ⚠️ **The two tables below are the original R1-era plan.** They are superseded and retained only
> for the audit trail. **Do not plan work from them** — see [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md).

### ~~Will be modified~~ — ⚠️ superseded R1-era plan

> ⚠️ Stale on one point of substance: it requires **ADR-003** to be added to Atlas §18. ADR-003 is
> **retired permanently** and must not be added anywhere. Everything else in this table was done.

| File | Reason |
|------|--------|
| `docs/ANIYE_SYSTEM_ATLAS.md` | ADR-002 and ADR-003 must be added to §18; §4 Relationship Class and §10 rewritten for ADR-002; version bumped past v2.2 |
| `lib/workspace.ts` | Every missing milestone touches it: type changes (ADR-002), new collections (H2.4, H2.5), `schemaVersion` + real migration runner, new `SETUP_STAGES` entries |
| `app/components/workspace/RelationshipClassesPage.tsx` | ADR-002 changes the class shape the UI edits (332 lines) |
| `app/components/workspace/SetupChecklist.tsx` | New stages for assignments and people |
| `app/components/workspace/WorkspaceSidebar.tsx` | New navigation entries |
| `app/components/verify/VerifyGate.tsx` | Workspace seeding must set `schemaVersion` and new collections |
| `app/components/workspace/PolicyForm.tsx` | Policy lifecycle states (C4); Decision Engine inputs |
| `app/components/workspace/PolicyDetail.tsx` | Show assignments; lifecycle states |
| `app/components/workspace/PolicyLibrary.tsx` | Assignment counts per policy |
| `package.json` | Add `typecheck` script |

### ~~Will be created~~ — ⚠️ superseded R1-era plan

> ⚠️ **Four of these paths are wrong and must not be used.** Corrections in the right-hand column.

| Original proposed path | Milestone | Outcome |
|------|-----------|---------|
| `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` | Relationship Operations Atlas | ✅ **Created in R6**, at that path |
| `lib/migrations.ts` (or equivalent) | Schema versioning | ✅ Created in R1 |
| `app/workspace/assignments/page.tsx` + components | H2.4 | ✅ Created in R2 |
| `app/workspace/people/page.tsx` + components | H2.5 | ✅ Created in R3 |
| ~~`app/workspace/people/sources/…`~~ | H2.5 | ❌ **Never built.** People Sources are surfaced inside the People directory rather than on their own route. No separate route is planned |
| ~~`lib/decision-engine.ts`~~ | ~~ADR-003~~ | ⚠️ **Struck. Never to be created.** ADR-003 is retired; `resolvePolicyAssignment()` in `lib/assignments.ts` already resolves policy, and ADR-006's `Decision` records judgements |
| ~~`lib/moments.ts` + `app/workspace/moments/…`~~ | H3.1 | ⚠️ **Wrong tree.** Delivered as `lib/operations/` + `app/operations/` — Moments are Operations, not Workspace (ADR-005, ADR-010). **No `app/workspace/moments` route will ever exist** |
| `lib/execution-brief.ts` + brief route/components | **H3.2** | ⬜ Outstanding. Route belongs under `app/operations/`, **not** `app/workspace/` |
| ~~`lib/catalog.ts` — H3.3 Catalog Intelligence~~ | **H3.3** | ⬜ Redefined: a **minimum flat catalog**, under `lib/operations/`. Catalog Intelligence is H4.2 |
| ~~`lib/gift-intelligence.ts` — H3.4~~ | **H3.4** | ⚠️ Redefined: H3.4 is a **vendor directory with hand-entered offers**. Gift Intelligence is **H4.3** |
| ~~`lib/vendors.ts` — H3.5 Vendor Intelligence~~ | **H3.5** | ⚠️ Redefined: H3.5 is a **courier directory**. A vendor directory is H3.4. Vendor Intelligence is **H4.4** |

*(Exact filenames are proposals, subject to the reconstruction prompt for each milestone.)*

---

## 10. Proposed Reconstruction Sequence

Ordered by dependency. Each step is gated on `npx tsc --noEmit` and `npm run build` passing.

| Order | Task | Depends on | Why this position |
|-------|------|-----------|-------------------|
| 0 | ✅ **Schema versioning foundation** — `schemaVersion` on `WorkspaceState`, ordered migration runner, `typecheck` script. | — | Gap S1/S2. ADR-002 is a *transform* migration; the presence-check pattern could not express it. Doing this after ADR-002 would have meant migrating twice. **Landed in R1.** |
| 1 | ✅ **ADR-002** — Relationship Type + numeric Relationship Level | 0 | Resolves C1. Changes the shape of `RelationshipClass`, which every downstream object references, so doing it first avoids reworking H2.4, H2.5, and H3.1. **Landed in R1.** |
| 2 | ✅ **H2.4** — Policy Assignments | 1 | Restored the broken link in the Atlas §11 canonical flow. Resolves C7 and C8. **Landed in R2.** |
| 3 | ✅ **H2.5** — People Sources and People | 1, 2 | Resolved C3 by deriving member counts. **Landed in R3.** Completes the H2 Configure arc. |
| — | ✅ **Aniyé Experience Audit** | 3 | 28 findings: 2 Critical, 8 High, 11 Medium, 7 Low. See `ANIYE_EXPERIENCE_AUDIT.md`. |
| — | ✅ **Experience Correction E1** | Audit | Closed all 5 Programs-gating findings plus EX-H5, EX-H7, EX-H8 and three Low. **Landed in E1.** |
| — | ✅ **Architecture-correction checkpoint** — *was required before Operations* | 3 | Program definition; Workspace vs Operations boundary; Decision vs Operational Event; minimum financial and Money model (C6). **Complete.** All four answered; ADR-004 … ADR-009 accepted. |
| — | ✅ **R4 — schema v5** (Money as minor units, Person `Inactive`) | Checkpoint | The hard prerequisite: a budget envelope is arithmetic. **Landed in R4.** |
| — | ✅ **R5 — H2.6 Campaign Programs, schema v6** | R4 | **Landed in R5.** H2 Configure complete. |
| 4 | ✅ **Relationship Operations Atlas** | 1, 2, 3 | Documents the operating model once Class → Assignment → Policy → Person is whole. **Landed in R6**, reconstructed from repository-confirmed architecture and accepted ADRs only. |
| ~~5~~ | ⚠️ ~~**ADR-003** — Decision Engine~~ | — | **Struck. Retired permanently.** `resolvePolicyAssignment()` already resolves policy; ADR-006's `Decision` records judgements. Nothing is left for a separate engine to own, and **nothing depends on this row**. |
| ~~6~~ | ✅ **H3.1** — Operational foundation + Moment Engine | 3 (**not** 5) | Delivered **without** a Decision Engine, in `lib/operations/` under ADR-010. **Landed in H3.1.** |
| ~~7–10~~ | ⚠️ ~~H3.2 … H3.5 as originally sequenced~~ | — | **Superseded by the Council decisions of 2026-07-28.** The canonical sequence is **H3.2 … H3.8** in [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md). Catalog, Gift and Vendor **Intelligence** are **H4.2 – H4.4**, deferred until the pilot produces evidence. |

### Next action

**Reconstruction is complete.** Every milestone this ledger was opened to recover has landed:
schema versioning and ADR-002 (R1), Policy Assignments (R2), People (R3), Money and Person
lifecycle (R4), Campaign Programs (R5), the operational foundation and Moment Engine (H3.1), and
the Relationship Operations Atlas (R6). **From here the work is new build, not recovery.**

**The next milestone is H3.2 — Execution Brief.** It is gated on one thing:

> **ADR-011 is accepted; Workspace schema v7 is not built.** `Person.deliveryAddress` and the
> brief's `deliveryAddressSnapshot` are the prerequisite for H3.2's completion test — *"an
> incomplete address blocks confirmation with a named recovery"*. **H3.2 begins with the additive
> v7 migration, not with the brief UI.**

Roadmap authority moves to [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md). This ledger remains the record
of *what was lost and how it was recovered*, plus the open conflicts (C-codes) and People
compromises (P-codes) that are still live.

> ⚠️ **The four questions below are answered.** Retained verbatim for the audit trail.
> 1 → ADR-004 · 2 → ADR-005 and ADR-010 · 3 → ADR-006 · 4 → ADR-007.

The next link *is* Program, and that is exactly where the surviving architecture is least settled.
Four questions must be answered before any Operations code is written:

1. **Program definition** — Atlas §4 defines a Program with a `policySnapshot` taken at Approval, but
   never says whether a Program is a schedule, a campaign, or a budget envelope. Moment generation
   depends on the answer.
2. **Workspace versus Operations boundary** — everything so far lives in one `WorkspaceState`
   document. Operations introduces records that are events rather than configuration, and Atlas §3's
   Relationship Engine / Knowledge split needs to be made concrete before they are mixed.
3. **Decision versus Operational Event** — `resolvePolicyAssignment()` produces a *decision*. A
   Moment is an *event*. Whether decisions are persisted or recomputed changes the entire data model.
4. **Minimum financial and Money model (C6)** — Money is still face value, not minor units. This must
   be settled before the Decision Engine performs any budget arithmetic.

Reconstruction steps 4–10 remain in the sequence above and are gated behind this checkpoint.

---

## 11. Recovery Branch

All reconstruction work is performed on **`recovery/h3-reconstruction`**.
`main` is not modified directly. The branch currently tracks `origin/recovery/h3-reconstruction`.

---

*Recovery Ledger — Aniyé Africa — 27 July 2026*
*Audit basis: commit `b639349`, System Atlas v2.2.*
*Updated after R1 (schema versioning + ADR-002) — System Atlas v2.3.*
*Updated after R2 (H2.4 Policy Assignments, schema v3) — System Atlas v2.4.*
*Updated after R3 (H2.5 People Sources and People, schema v4) — System Atlas v2.5. H2 Configure recovery complete.*
*Updated after R3a (Experience Doctrine integration) — Experience Doctrine v1.0. No architectural change.*
*Updated after the Aniyé Experience Audit — 28 findings, Programs blocked pending 5 corrections. Documentation only.*
*Updated after Experience Correction E1 — all 5 gating findings closed; Programs unblocked on experience. Architecture checkpoint remains mandatory.*
*Updated after the H2 → H3 Architecture Checkpoint — 6 ADRs drafted, all Proposed. Council approval is now the only gate. Documentation only; no schema version changed.*
*Updated after R4 — all 6 ADRs accepted; schema v5 implemented (Money + Person lifecycle); C4 and C6 resolved; Programs unblocked. System Atlas v3.0.*
*Updated after R5 — H2.6 Campaign Programs implemented (schema v6); H2 Configure complete; Moment generation is the next milestone. System Atlas v3.1.*
*Updated after H3.1 — ADR-010 accepted; OperationsState v1 separate from WorkspaceState v6; Moment generation, Decisions and Operational Events implemented; backend and authentication now the hard gate before pilot. System Atlas v3.2.*
*Updated after R6 (governance reconciliation) — ADR-011 accepted; `MASTER_ROADMAP.md` created and now authoritative for the roadmap; `RELATIONSHIP_OPERATIONS_ATLAS.md` reconstructed, closing recovery milestone 4; H3 redefined as H3.1 … H3.8 with Intelligence deferred to H4; retired ADR-003 dependencies struck. System Atlas v3.3. **Documentation only — no code, schema, migration, validation script or package.json changed.** Reconstruction is complete; from H3.2 the work is new build.*
*Updated after R6 Council corrections — ADR-011 renamed to lowercase kebab; H4 renamed **Learn** and renumbered; **all external connectors relocated to H5.4 — Integrations**; every open conflict, schema gap, People compromise and unresolved operational rule classified by what it blocks; milestone count published as **19 of 37** with the 31/15 discrepancy surfaced, not resolved; **the claim that the ADR-010 gate binds from H3.4 withdrawn** as unsupported by any governing document. System Atlas v3.4, Master Roadmap v1.1, Relationship Operations Atlas v1.1. **Documentation only. Nothing blocks H3.2.***
*Updated after the H3.1 acceptance correction (H3.1-D1) — confirmation now re-reads live Workspace, Program status, population, People, groups, assignments, policies and source keys before writing; a material change or any read failure writes nothing and requires review. 15 regression checks added (operations 35 → 50); 187 checks total. No schema change — WorkspaceState v6, OperationsState v1. System Atlas v3.5. **Live visual verification still pending; H3.1 not yet fully accepted.***
*Updated after H3.2 (Execution Brief) — Workspace schema **v7** (additive `Person.deliveryAddress`, ADR-011) and `OperationsState` **v2** (additive `executionBriefs`); a stored v1 operations payload migrates rather than being quarantined; the address gate blocks brief confirmation but never Moment generation; `MOMENT_STATUSES` unchanged. 209 checks across eight suites. System Atlas v3.5, Master Roadmap v1.2, Relationship Operations Atlas v1.2. **First post-recovery build milestone.***
*Updated after the H3.2 acceptance correction (H3.2-D1) — the brief queue now distinguishes loading, failed, empty and populated; a read failure is never shown as an empty queue and its reason is preserved. 8 regression checks added (briefs 37 → 45); 232 checks total across eight suites. H3.1-D1 committed and pushed at `312a22d`. **Live visual verification still pending for all H2.6, H3.1 and H3.2 routes; neither milestone is fully accepted.***
*Updated after live visual verification (2026-07-29) — five defects found and corrected: H3.1-D2 drawer focus trap, H3.1-D3 sub-44px tap targets, H3.1-D4 ambiguous allocation, H3.2-D2 wrong header titles, H3.2-D3 missing-address invisible in the recovery destination. 234 checks across eight suites. `WorkspaceShell`'s identical drawer defect remains, out of scope.*
*Updated after the complete H3 visual acceptance matrix (2026-07-29) — all 30 route × width cells re-run from scratch; the earlier 19-vs-20 discrepancy corrected to 20 unchecked at that time. WorkspaceShell drawer defect root-caused and fixed via a shared `useOffcanvasHidden` hook; sub-44px touch targets corrected across five H3.1/H3.2 routes. 234 checks across eight suites, lint at baseline. Two mobile cells measured at 500px rather than ~390 due to a Chrome minimum-window-width floor. H2-era touch targets remain outstanding.*
*Updated after the H2-era touch-target correction — `/workspace/people`, `/workspace/programs/[id]` and `/workspace/programs/new` raised to a 44px minimum; a wrap regression in the desktop people table was caught and fixed. Two 42px shared form inputs left as-is (clears WCAG AA). 234 checks, lint at baseline.*
*Updated after the EX-M8 review — the finding was already resolved and had been mischaracterised; correction recorded in the friction register. A desktop table overflow introduced by the H3.2 address badge was found by direct measurement and fixed by stacking the badges. Audit gap noted: page-overflow checks do not catch inner scroll containers.*
*Updated after the pre-pilot experience corrections — EX-H1, EX-H3, EX-M5 and EX-M8 all closed. Assessment draft read through `useSyncExternalStore` with a null server snapshot; PolicyForm rebuilt into four guided steps; drawer first-frame accessibility moved from `inert` to CSS `visibility` in both shells. 234 checks, lint 47 (26 errors, 21 warnings), build 23 routes.*
