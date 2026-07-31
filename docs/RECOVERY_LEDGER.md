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
| — | **H3.3 — Minimum Catalog + manual item selection** | ✅ **Complete** — OperationsState v3 | H3.3 |
| — | **H3.4 — Vendor directory + hand-entered offers** | ✅ **Complete** — OperationsState v4 | H3.4 |
| — | **H3.5 — Courier directory + manual selection** | ✅ **Complete** — OperationsState v5 | H3.5 |
| — | **H3.3/H3.4-D1 — malformed runtime-container correction** | ✅ **Complete** — no schema change | H3.3/H3.4-D1 |
| — | **Pre-H3.6 — policy-resolution delivery snapshot** | ✅ **Complete** — OperationsState v6 | Snapshot v6 |
| — | **H3.6 — Fulfilment tracking** | ✅ **Complete** — OperationsState v7; ADR-012 implemented | H3.6 |
| — | **H3.6 → H3.7 commercial governance closure** | ✅ **Complete** — ADR-013 accepted; documentation only | Governance |
| — | **H3.7 — Recognition Order + commercial tracking** | ✅ **Complete** — OperationsState v8; ADR-013 implemented | H3.7 |
| — | **H3.7 → H3.8 confirmation-and-memory governance closure** | ✅ **Complete** — ADR-014 accepted; documentation only | Governance |
| — | **H3.8 — Confirmation + Memory** | ⬜ **Architecture governed by ADR-014; implementation not begun** | — |
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

### ✅ Pre-pilot regression correction

Three defects found reviewing the work above, all in code from that same pass.

**Assessment same-session resume regression.** From empty storage, the first
keystroke autosaved, the store notified, `useSyncExternalStore` returned the new
draft, and — because `dismissedResume` was still `false` — **the resume prompt
replaced the wizard the visitor was actively filling in**.

Corrected with an explicit `touched` latch set from the event handlers, not
derived from `data`. Deriving it would have let clearing every field resurrect
the prompt mid-session; a latch cannot flip back. Set in handlers rather than an
effect, so no new lint and no extra render. A draft is now offered only when it
was already present on arrival.

**PolicyForm Review was incomplete.** It rendered **9** rows against **11**
configurable values — `signatureRequired` and `proofRequired` were omitted. Both
added; Review is now 11 of 11. *(An earlier report said "eight fields", which was
wrong on both counts — the count was 9 rendered and 11 configurable.)*

**PolicyForm step accessibility.** Continue and Back changed the view silently:
focus stayed on a button that had just been replaced. Now `goToStep` moves focus
to the step heading, an `aria-live="polite"` region announces the change, and
`aria-current="step"` marks the active step. Focus is moved on a macrotask, not
`requestAnimationFrame` — rAF fired before React committed the new step and the
focus call was lost, which the first attempt at this proved.

**Scope.** `aria-current` went into the shared `StepHeader`, so `PersonForm` and
`CampaignWizard` inherit it. **EX-M11 is not fixed** — it names
`AssessmentWizard`, `PersonForm` and `PeopleImport`, and none of those has focus
management. Only `PolicyForm` does.

**Browser evidence, from genuinely empty storage, without pressing Continue or
Start fresh:**

| Step | Result |
|---|---|
| Entry, no draft | No prompt, wizard renders |
| First keystroke | Draft written, **prompt did not appear**, still on the wizard |
| Continued typing | No prompt |
| Field cleared entirely | **No prompt** — the latch holds |
| Return visit with a draft | Prompt shown; Continue restored the value and step |
| Continue / Back in PolicyForm | Focus landed on the heading wrapper each time; live region read "Step 2 of 4: Which occasions?", "Step 3 of 4: How it is delivered", "Step 2 of 4: Which occasions?"; `aria-current` tracked |
| Review | All **11** labels present; signature "Yes — recipient signs on delivery", proof "No" |

### ✅ H3.3 — Minimum Catalog and manual item selection

**First new-build milestone since H3.2, and the first Decision with real
alternatives.** Everything before it was a deterministic resolution or a yes/no
confirmation.

**What was built.** `lib/catalog.ts` — a pure seed of 24 items across NGN, KES
and GHS, each with a stable id, name, one-line description, one existing
`GiftCategory`, an active flag and a canonical `Money` price. Four pure
eligibility rules. `lib/operations/selection.ts` — preview and builders, neither
able to reach storage. A new route `/operations/moments/[id]/item`, entered from
the confirmed brief and from the Moment.

**Deliberately not built:** catalog administration, a customer-facing catalog
route, vendor availability, intent hierarchy, collections, ranking,
recommendations, personalization, images. Those are H4.2 – H4.4, behind the
pilot.

#### The configuration gap, and why history blocks rather than guesses

`PolicyResolutionSnapshot` recorded the approved budget but **not** the
exclusions, so H3.3 could not have filtered against anything trustworthy for an
existing record.

Generation now snapshots `excludedCategories`, and `OperationsState` moves
**v2 → v3**: one rung, additive, and it **writes nothing into any existing
record**.

> **The tempting repair was the dangerous one.** Walking the stored Moments and
> giving each an empty exclusion list would have converted *"nobody recorded
> this"* into the confident claim *"nothing was excluded"* — silent, and capable
> of sending a gift the governing rule forbade.
>
> The escape hatch was checked and is **unavailable**:
> `PolicyForm.save()` (`app/components/workspace/PolicyForm.tsx:299`) writes an
> edited policy back to the **same `id` at the same `version`**, including when
> publishing. `policyId` + `policyVersion` therefore prove nothing about whether
> the exclusions still hold. Equivalence is not provable, so selection **blocks**
> with a named explanation and a recovery — re-prepare the recipient — and the
> original record is left untouched.

#### Naming

The checkpoint proposed the Event `ItemPrepared`. **`ItemSelected` was recorded
instead**: nothing is prepared there — no vendor asked, no order, nothing made
or moved. `RELATIONSHIP_OPERATIONS_ATLAS.md` §6 reserves that call for the
milestone that builds the step. `ItemSubstitution` was **not** added; it
presupposes a selection something downstream has consumed.

#### Two defects the new suite found before a human did

| Defect | Consequence had it shipped |
|---|---|
| `snapshotItem()` aliased the item's `Money` object instead of copying it | Repricing a catalog item would have rewritten what an operator chose last quarter — the exact failure the snapshot exists to prevent |
| `validateOperationsState` checked `workspaceId` on Moments and briefs but **not** on Decisions or Events | A record stamped with another organization's id could be filed under this one. Fixed at the validation layer, so it closes on the H3.2 write paths too |

#### One found in the live browser

With no brief yet confirmed, the summary panel read *"Approved budget: Not
resolved"* and *"Excluded categories: not recorded"*. **Both were false** — they
are on the Moment; there was simply no brief to read them from. The panel now
falls back to the Moment's own snapshot for display, clearly labelled, while
eligibility still comes from the brief alone. The fallback cannot widen what may
be chosen, and it cannot reach past the trust gate: a brief whose snapshot lacks
exclusions still blocks.

#### Amendments to the H3.2 suite — declared, not silent

Four checks in `validate-briefs.mts` pinned literals this milestone legitimately
moves. **They were amended, so "existing suites unchanged" is not true of this
milestone and is not claimed.**

| Check | Was | Now |
|---|---|---|
| 6 | `CURRENT_OPERATIONS_SCHEMA_VERSION === 2` | `>= 2`, and still asserts independence from the workspace version |
| 7 | migrates to literal `2` | migrates to `CURRENT_OPERATIONS_SCHEMA_VERSION` |
| 9 | read reaches literal `2` | read reaches `CURRENT_OPERATIONS_SCHEMA_VERSION` |
| 35 | `ItemSelection` forbidden as a later milestone | removed from that list — H3.3 is the milestone that produces it |

Three of the four are now version-agnostic, so the next rung will not break them
again. What they test is unchanged.

#### Gates

| Gate | Result |
|---|---|
| Validation | **281/281 across nine suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, **selection 47** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly the pre-H3.3 baseline |
| `build` | Succeeds, **24 routes** — one intentional addition |
| Routes | All 12 sampled return 200, including `/operations/moments/[id]/item` |
| Links | Every internal `href` resolves to a built route; no dead ends |

#### Browser evidence

Full flow driven live, not simulated: seed → prepare → confirm brief → choose an
item.

| State | Result |
|---|---|
| Loading | `role="status" aria-live="polite"`; resolves within a frame on local storage — not separately captured |
| Read failure | Corrupted payload: named, adapter's reason preserved, *"Nothing has been changed"*, retry and a way back. **Not rendered as an empty list** |
| No confirmed brief | Named, links to the brief |
| Constraints unrecorded | Named, recovery is re-prepare, **no items listed** |
| No eligible items | Budget lowered to NGN 1,000 — names the budget, explains that budget and exclusions belong to the customer, links to Workspace |
| Eligible list | Exactly the 6 expected of 24, price-ascending; spa day at *exactly* budget correctly absent (excluded category), withdrawn whisky set absent, KES and GHS items absent |
| Draft selection | Arrow keys moved and selected; live region announced *"Artisan chocolate box selected — NGN 35,000.00"*; **store still held 0 selections after two changes** |
| Confirmation | Primary action disabled until a reason is typed; panel states what will be recorded |
| Confirmed | **1** Decision, **1** Event, **1** storage write. Candidate set of 6 recorded; `recommendation` and `overrideReason` both absent |
| Duplicate refusal | Reload → still 1 and 1; list gone; *"An item has already been chosen"* |
| Keyboard and focus | Native radios, `peer-focus-visible` ring, detail toggle separate from selection |
| Targets | No H3.3 control under 44px |
| Overflow | No page-level or inner-container horizontal scroll at any width |

**Widths actually measured** (`window.innerWidth`): **400px**, **768px**,
**1200px**.

> ⚠️ **1440px was not reached.** The widest physically achievable viewport on the
> verification machine was 1200px. **No width was simulated by toggling classes**,
> and none is reported as though it were. Two non-issues were identified and
> dismissed by inspection: an `sr-only` legend with `overflow:hidden`, and a 4px
> overshoot inside the closed, `visibility:hidden` nav drawer — pre-existing shell
> markup, never on screen.
>
> **Real-device testing was not performed and is not claimed.** It remains a
> pre-pilot **[P]** item (H4.0).

#### Also corrected

`MomentDetail` still said *"The Execution Brief is the next stage and is not yet
enabled"* — true when H3.1 shipped, false from H3.2 onward, and sitting directly
beneath a button that opened it. The next action is now computed from state: no
brief → *Open the brief*; brief confirmed → *Choose an item*; item chosen →
*View the chosen item*.

**Still open:** four sub-44px targets in the `OperationsShell` navigation drawer
(40px links, 32px close). Pre-existing H3.1 shell chrome, untouched by this
milestone, and recorded here rather than quietly absorbed.

### ✅ H3.3-D1 — the repository trust boundary

**Acceptance defect, found reviewing H3.3 after it shipped. No schema change.**

`commitItemSelection()` re-read `OperationsState` and checked the Moment, the
live brief's **id and revision**, and the absence of an existing selection — and
then **believed the rest of the submitted Decision.**

> A structurally valid bundle could therefore keep the correct brief reference
> while carrying a different approved budget, different exclusions, a truncated
> or reordered candidate set, a mispriced selected-item snapshot, or an Event
> naming a different item — and still be committed.
>
> The result would have been an audit trail that was **internally consistent and
> wrong**, which is worse than no audit trail: every downstream reader would have
> had no way to tell.

It also could not notice a catalog that had moved on. An item withdrawn,
repriced above budget, repriced into another currency, or recategorized into an
excluded category between the screen opening and the operator confirming would
have been written as though it were still eligible.

#### The correction

`verifyItemSelection()` in `lib/operations/selection.ts` — pure, and called by
the repository **before** the single atomic write. The rule is now absolute:
**recompute the answer and compare; never believe what was handed in.**

| Recomputed from | What is compared |
|---|---|
| Re-read `OperationsState` | Moment resolved and `ReadyForExecution`; not cancelled; no live `ItemSelection` |
| The **live confirmed brief** | Brief id and revision; approved `Money`; applied exclusions. Refused outright if exclusions were never recorded |
| The **current catalog** | Complete deterministic eligible set, in order; the selected item still active, exact-currency, at or under budget, outside the exclusions |
| Rebuilt evidence | Ordered candidate ids **and** ordered candidate snapshots; selected id; selected name, category and copied `Money` |
| The Decision itself | `ItemSelection` · `Confirmed` · `HumanOperator` · non-blank reason · no fabricated `recommendation` or `overrideReason` · correct workspace and Moment |
| The Event | `ItemSelected` · `Operator` · `Platform` · same workspace, Moment, actor · payload's brief id/revision and item id equal to the Decision's · one shared instant across `createdAt`/`confirmedAt`/`occurredAt`/`recordedAt` |

Any mismatch writes **nothing** and returns a named refusal ending *"Review the
moment and choose again — nothing was recorded."* The single-write atomic
transaction and append-only history are unchanged.

**The Workspace policy is still never read here.** The brief's immutable snapshot
remains authoritative for constraints — a policy edited since generation did not
govern this Moment. The *catalog* is deliberately the opposite: read live,
because staleness there is exactly the risk.

**Also fixed:** `buildItemSelection` aliased the brief's approved-budget `Money`
into the Decision instead of copying it — the same defect already corrected for
the catalog-item snapshot, in the one place it had been missed.

#### Catalog injection

`createLocalOperationsRepository(storage, { catalog })`. Injected for the same
reason storage already was: **a trust boundary that can only be exercised
against the production seed cannot be tested for staleness.** Building a second
repository over the *same* storage with a changed catalog reproduces the real
scenario exactly. Production passes nothing and gets the shipped seed.

#### 18 new repository-level checks — selection 47 → 65

Every one submits something structurally valid that keeps the correct brief
reference, and proves the refusal left **both** collections byte-identical and
the storage write log untouched.

| # | Proves zero writes for |
|---|---|
| 48 | The selected item removed from the catalog |
| 49 | The selected item made inactive after the screen opened |
| 50 | The selected item repriced **one minor unit** above budget — and that exactly at budget still commits, so the boundary is the boundary |
| 51 | The selected item repriced into another currency |
| 52 | The selected item's category becoming excluded |
| 53 | Altered approved-budget evidence — inflated, wrong currency, missing |
| 54 | Altered exclusion evidence — emptied, substituted, missing |
| 55 | Missing, reordered, truncated, extended or absent candidate lists |
| 56 | Altered candidate or selected-item snapshots — repriced, renamed, recategorized, missing |
| 57 | A selected id disagreeing with its snapshot, in both directions |
| 58 | An Event payload naming a different item, brief or revision |
| 59 | `RuleEngine`, non-`Confirmed`, blank-reason, or fabricated recommendation/override |
| 60 | Non-`Operator` actor, wrong source, wrong event type, wrong actor id |
| 61 | A Decision and Event assembled at different instants |
| 62 | A **tampered live brief at the same id and revision** — budget altered underneath |
| 63 | A brief whose exclusions vanish at the same reference |
| 64 | A Moment sent back for review, or cancelled, underneath |
| 65 | The honest bundle still commits in one write — the boundary is not simply refusing everything |

Check 65 is deliberate: a validation suite that only proves refusals would pass
just as well against a boundary that refuses everything.

#### Gates

| Gate | Result |
|---|---|
| Validation | **299/299 across nine suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, **selection 65** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly baseline |
| `build` | Succeeds, **24 routes** — unchanged |
| Routes | All 12 sampled return 200 |
| Links | Every internal `href` resolves to a built route |

### ✅ H3.4 — Vendor directory, hand-entered offers and manual vendor selection

**The first Decision carrying a cost**, and the point at which Aniyé starts
accumulating the operational evidence that H4.4's Vendor Intelligence will
eventually be built from.

**What was built.** `lib/operations/vendors.ts` — draft validation, snapshots
and deterministic ordering. `lib/operations/vendor-selection.ts` — preview,
builders and the repository trust boundary. Two routes: `/operations/vendors`
with an inline add/edit form, and `/operations/moments/[id]/vendor`. Vendors
joined the shell navigation and left the "not built yet" list.

**Deliberately not built:** scores, ratings, reliability, capacity, lead-time
policy, quality grades, price lists, preferred status, contracts, SLAs, ranking,
recommendations, automatic routing, vendor accounts, a portal, vendor-facing
routes, automated quote requests, APIs, couriers, fulfilment, proof of delivery,
`RecognitionOrder`, customer charge or margin. WhatsApp remains a channel an
operator records by hand.

**OPS-U5 was not invented.** Partner onboarding is unresolved and the Operations
Atlas §9 says in terms that H3.4 builds *a directory an operator types into,
which needs no onboarding process*. No ADR was raised, because none was needed.

#### The judgement calls, and why

| Question | Answer |
|---|---|
| Event name | **`VendorSelected`**, not the checkpoint's `VendorContacted`. Aniyé sends nothing — an operator types up what they were already told, so the occurrence is the *selection*. The channel each quote arrived through is a `source` field on the offer, where it belongs |
| Where the item comes from | The **live `ItemSelection` Decision**, never re-read from the catalog. That Decision is the immutable record of what was chosen and at what price |
| Where delivery context comes from | The **current confirmed brief**. A brief may take a governed address-only revision after an item was chosen; that must not invalidate the item, so the selection references both |
| Zero-cost quotes | **Allowed.** A vendor absorbing a cost is a real quote; refusing it would invent a commercial rule nobody decided. Negative is refused — that is a data error, not a discount |
| Quote above catalog price | **Allowed.** There is no rule that a vendor must quote below the item price. Inventing one would make the tool misreport what vendors actually said |
| Deleting a vendor | **Impossible.** Deactivation only — a vendor who quoted last quarter has to stay resolvable from the offers naming them |
| Directory CRUD | **Not** a Moment Decision and **not** an OperationalEvent. Adding a vendor changes no Moment's execution, which is ADR-006's own test |

#### The trust boundary

`verifyVendorSelection()` recomputes before the single atomic write: the Moment
still ready and in this workspace, the live brief matching the submitted
reference, the live `ItemSelection` matching **and its item snapshot matching
exactly**, no existing vendor selection, every offer unique by id and by vendor,
every vendor still present, in-workspace and **active**, every vendor snapshot
matching the record **as it stands now**, every quote valid and in the item's
exact currency, every channel and timestamp valid, the complete ordered
considered set matching the offers being committed, the selection resolving to
exactly one of them, the Decision `Confirmed`/`HumanOperator` with a reason and
no fabricated recommendation, and the Event `VendorSelected`/`Operator`/
`Platform` agreeing with the Decision at one shared instant.

> **One limit stated honestly.** The repository can verify everything Aniyé
> holds. It **cannot prove what a vendor actually said** — a quote is
> attributable operator testimony, not an independently verified fact, and the
> code does not pretend otherwise.

#### Schema

`OperationsState` **v3 → v4**: one additive rung adding `vendors` and
`vendorOffers`, inventing nothing and touching no Moment, brief, Decision, Event
or H3.3 evidence. A v1 payload still walks v1 → v2 → v3 → v4 one rung at a time,
unknown future keys survive, future versions are refused, and reads never rewrite
storage. Workspace schema unchanged at **v7**.

#### Amendments to earlier suites — declared, not silent

Four checks pinned literals this milestone legitimately moves. **Three of the
four are now version-agnostic**, so the next rung will not break them again.

| Suite | Check | Change |
|---|---|---|
| briefs | 35 | `VendorSelection` removed from the "later milestone" list — H3.4 produces it |
| selection | 38 | `=== 3` → `>= 3`, and migrates to `CURRENT_OPERATIONS_SCHEMA_VERSION` |
| selection | 39 | Migrates to `CURRENT_OPERATIONS_SCHEMA_VERSION` rather than literal `3` |
| selection | 42 | `VendorSelection` removed from the forbidden list. **`VendorContacted` stays forbidden** — H3.4 deliberately does not use it |

#### Gates

| Gate | Result |
|---|---|
| Validation | **357/357 across ten suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, **vendors 58** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly baseline |
| `build` | Succeeds, **26 routes** — two intentional additions |
| Routes | All 13 sampled return 200, including both new routes |
| Links | Every internal `href` resolves to a built route |

#### Browser evidence

Full flow driven live: empty directory → add three vendors → edit, deactivate,
reactivate → prepare a Moment → confirm brief → choose item → record three
quotes → choose the second → confirm.

| State | Result |
|---|---|
| Directory loading / read failure | Corrupted payload: named, adapter reason preserved, *"cannot say whether any vendors exist"*, retry offered. **Never rendered as an empty directory** |
| Empty directory | One obvious action — *Add the first vendor* |
| Add / validation | Blank save named all four errors and wrote **0 vendors** |
| Edit / deactivate | Deactivation left the record in place (3 of 3 shown · 2 active); reactivation restored it |
| Zero-write proof | Filtering, opening an edit form, typing in it and cancelling left storage **byte-identical** |
| No brief · no item | Both blockers named simultaneously, each linking to its own recovery |
| No active vendors | Deactivated vendor correctly absent from the quote dropdown |
| Offer validation | Empty add named vendor, amount and date; wrote nothing |
| One-offer comparison | Allowed, and explicitly named as a limited comparison |
| Three offers | Entered with zero writes; primary action disabled until one was chosen |
| Keyboard | Arrow key moved and selected the second offer; live region announced *"Abuja Concept Store selected — NGN 31,500.50"* |
| Confirmation | Stated it would record **all 3 quotes including the ones not chosen** |
| Confirmed | **1** Decision, **1** Event, **3** offers, **1** storage write. All three considered offers carried vendor, money, channel, quoted time, lead time and terms. No `recommendation`, no `overrideReason` |
| Duplicate refusal | Reload → still 1/1/3; *"A vendor has already been chosen"* |
| Stale vendor | Deactivating the chosen vendor mid-comparison produced *"\"Abuja Concept Store\" was deactivated while this was open… nothing was recorded"* — and **0 offers, 0 selections** written |
| Overflow | No page-level or inner-container horizontal scroll at any width |
| Targets | No H3.4 control under 44px — the new form fields were raised from 41–42px after measurement |

**Widths actually measured** (`window.innerWidth`): **1440px**, **768px**, **500px**.

> ⚠️ **The mobile cell is 500px, not 390–420px.** The window manager clamps
> Chrome to a ~500px minimum width. Reported as measured. **No width was
> simulated by toggling classes, and real-device testing was not performed and is
> not claimed** — it remains a pre-pilot **[P]** item (H4.0).

**Still open:** the four sub-44px targets in the `OperationsShell` navigation
drawer (40px links, 32px close). Pre-existing H3.1 shell chrome, untouched.

### ✅ H3.4-D1 — the vendor runtime shape and trust boundary

**Acceptance defect, found reviewing H3.4 after it shipped. No schema change —
`OperationsState` stays v4, Workspace stays v7.**

The builders produced the intended shapes. The **repository did not enforce
them**, and TypeScript cannot: it checks no excess property on a value that has
already been widened, and it checks nothing at all once the code is running.

Every example below was **reproduced against the shipped code** before being
fixed — not inferred from reading it.

| Passed before | Why it mattered |
|---|---|
| A `Vendor` carrying `reliabilityScore`, `rating`, `capacity`, `sla`, `onboardingStatus` or a price list | **H4.4 arriving inside H3.4.** A scorecard in the directory is exactly the intelligence this milestone exists to defer until there is evidence for it |
| A malformed email reaching `createVendor` directly | The email shape was checked in the form only, so any caller bypassing the form could store an address nobody could write to |
| Non-string `whatsapp`, `email` or `note` | A vendor "contactable" at `42` |
| Unreadable `createdAt` / `updatedAt` | A record whose timestamps cannot be compared is not evidence |
| A bundle whose Decision, Event **and** offer timestamps were all the same unusable string | The shared-instant rule tested **equality**, and three copies of `"banana"` agree with each other perfectly |
| Non-string offer `terms`, duplicated consistently in the offer and the considered set | The comparison was offer-against-itself, so a consistent lie passed |
| A `finalDecision` naming the wrong vendor, the wrong amount, or blank | The headline every casual reader believes, contradicting the evidence beneath it |
| Extra fields on `VendorOffer`, `Decision.inputs`, considered entries or the Event payload | `customerCharge`, `margin`, `revenue`, `catalogCost`, `score`, `rank`, `recommendation` — reading, years later, as though H3.4 had decided something it explicitly did not. **U3 is unresolved until H3.7** |

#### The correction

**Vendors are rebuilt, not spread.** `canonicalVendor()` validates the exact
eleven-field list and **constructs a fresh record from it**, so nothing
undeclared can reach persisted state through `createVendor`, `updateVendor` or
`setVendorActive`. It enforces required strings, the two-letter country code,
present-but-wrong optionals, the form's own email shape, at least one contact
method, and canonical ISO instants — with **no ordering rule** invented between
`createdAt` and `updatedAt`.

Spreading an untrusted object into persisted state means every field anyone ever
attaches to it survives into the audit record. Rebuilding from a fixed list means
only what this milestone declared can arrive.

**Timestamps must be readable, not merely equal.** `isIsoInstant()` was
introduced here — `Date.parse` alone accepts `"2026"`, `"August 1 2026"` and
locale strings.

> ⚠️ **Corrected by H3.4-D2.** This entry claimed the predicate required
> "exactly what `toISOString()` emits". **It did not.** It accepted second
> precision and one- or two-digit fractions, and it accepted impossible calendar
> dates because `Date.parse` normalizes them rather than refusing them. See
> H3.4-D2 below. Applied to the Decision's `createdAt` and
`confirmedAt`, the Event's `occurredAt` and `recordedAt`, and every offer's
`recordedAt` and `quotedAt`. The shared-instant rule is unchanged, and `quotedAt`
stays independently valid and **may precede** `recordedAt` — the vendor spoke
before the operator typed it up, which is the normal case.

**`finalDecision` is recomputed, not compared.** `vendorFinalDecision()` is now
shared by the builder and the boundary, so the summary is regenerated from the
selected vendor snapshot and quoted cost and must match exactly.

**Exact keys on everything newly submitted** — `VendorOffer` (16),
`Decision.inputs` (11), considered-offer entries (8), and the Event payload
(exactly 5 identifiers). Applied to the **bundle being written only**, never to
stored history: unknown keys must still survive migration, so they are preserved
on read and refused at the door.

> ⚠️ **Corrected by H3.4-D2.** This was **outer-level only**. Extra keys *inside*
> allowed objects — `vendorSnapshot`, `itemSnapshot`, `price`,
> `quotedVendorCost`, `approvedBudget` — still passed whenever they were copied
> consistently into every representation. See H3.4-D2 below.

Structural validation was strengthened to match, so a payload that reached
storage another way still cannot be read as valid.

> ⚠️ **Partially corrected by H3.4-D2.** Structural validation checked a stored
> vendor email was non-empty text but **not** that it was address-shaped, so a
> malformed address that reached storage another way still read as valid.

**Preserved unchanged:** live-brief and live-`ItemSelection` authority, immutable
item and vendor snapshots, exact currency matching, zero-cost quotes, the
complete ordered considered set, `HumanOperator`/`Confirmed` semantics, no
recommendation or override reason, single-write atomicity, append-only history,
duplicate refusal, no hard delete, and the edit protections on id, workspace,
`createdAt` and active state. The v1 → v2 → v3 → v4 chain is untouched, reads
still never rewrite storage, and **no existing record was retrofitted**.

**Still not claimed:** the repository verifies everything Aniyé holds. It cannot
prove what a vendor said.

#### 16 new refusal checks — vendors 58 → 74

Checks 59–74. Each proves the write is refused **and** that vendors, offers,
decisions and events are byte-identical afterwards with zero storage writes:
intelligence fields on create (59) and on edit (60); malformed email at the
repository (61); non-string optionals (62); unreadable timestamps (63);
unreachable vendor (64); malformed fields on read (65); shared unreadable
timestamps (66); unreadable `quotedAt`, and a valid one preceding `recordedAt`
(67); non-string and blank terms duplicated in both places (68); altered, blank
and contradictory `finalDecision` (69); extra `Decision.inputs` (70); extra
offer and considered-offer fields (71); extra Event payload fields (72).

**73 and 74 are the counterweight**: an honest create, edit, deactivation and
selection still commit, and a rebuilt vendor carries exactly the declared field
list. A validator that refuses everything would otherwise pass every check above.

#### Gates

| Gate | Result |
|---|---|
| Validation | **373/373 across ten suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, **vendors 74** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly baseline |
| `build` | Succeeds, **26 routes** — unchanged |
| Routes | All 13 sampled return 200 |
| Links | Every internal `href` resolves to a built route |

**No UI or route change was required, and none was made** — `git diff app/` is
empty. **The H3.4 browser evidence recorded above remains applicable**, and no
new browser run was performed or claimed.

### ✅ H3.4-D2 — the remaining runtime-shape gaps

**Second acceptance defect on the same boundary.** D1 closed the outer level and
**over-claimed**: it said the timestamp rule accepted "exactly what
`toISOString()` emits" and that exact keys were enforced on everything newly
submitted. Neither was true as written, and both claims are corrected above
rather than left standing.

All three defect classes were **reproduced against the shipped code** before
being fixed.

| Passed before | Why |
|---|---|
| `2026-02-29`, `2026-02-30`, `2026-04-31` at canonical-looking precision | `Date.parse` **normalizes impossible dates rather than refusing them** — 2026 is not a leap year, so 29 February became 1 March, and the predicate only asked whether parsing succeeded |
| `2026-08-01T00:00:00Z`, `.1Z`, `.12Z` | The regex made milliseconds optional and allowed one to three digits, so it admitted forms this system never emits and cannot compare by equality |
| `vendorSnapshot.reliabilityScore`, `.capacity`, `selectedVendor.recommendation` | Comparators inspect the fields they know about. Both sides carried the extra, so every comparison agreed |
| `itemSnapshot.catalogDerivedCost`, `itemSnapshot.price.margin` | Same — and `price` was never key-checked at all |
| `quotedVendorCost.actualPaidCost`, `.revenue`, `approvedBudget.customerCharge` | Same. **Commercial vocabulary H3.4 explicitly does not decide**, arriving inside an allowed field |
| A stored vendor email of `not-an-address` | `validateOperationsState` required non-empty text, not the address shape — and a WhatsApp number alongside it does not make the address usable |

#### The correction

**Canonical instants are a round trip, not a pattern match.**
`isIsoInstant()` now requires `YYYY-MM-DDTHH:mm:ss.sssZ` — milliseconds
mandatory at exactly three digits — **and** that
`new Date(value).toISOString() === value`. A date the runtime silently moved is
not the date anybody wrote down. Refused: impossible dates, normalized overflow,
missing or short fractions, offsets, date-only and locale strings. A genuine
leap day in a genuine leap year still passes, so the rule refuses impossible
dates rather than February. `quotedAt` may still precede `recordedAt`, and no
ordering is invented between `createdAt` and `updatedAt`.

**Exactness is now recursive, against a projection of live truth.** Small exact
validators for `Money` (2 keys), `VendorSnapshot` (4) and `CatalogItemSnapshot`
(4, with `price` itself exact `Money`) are applied at every newly submitted
location: an offer's `itemSnapshot`, its `price`, its `vendorSnapshot` and
`quotedVendorCost`; `Decision.inputs.selectedItem` and its `price`;
`approvedBudget`; every considered entry's `vendor` and `quotedVendorCost`;
`selectedVendor`; `selectedQuotedVendorCost`.

> The expected value is **rebuilt from the trusted live record** — the live
> Vendor, the live `ItemSelection`, the live brief — as exactly its declared
> fields. `readChosenItem()` now returns a canonical projection rather than a
> spread, so even an extra field on a stored H3.3 Decision cannot be inherited
> by a new H3.4 record. Nothing undeclared survives, because the thing it is
> compared against cannot contain it.

**One email rule, in all three places.** `isVendorEmailShape()` is exported and
now applied inside `validateOperationsState()` as well as the form and the write
boundary.

**Two superseded comparators were deleted**, not left beside the strict ones:
`sameMoney` and `sameItemSnapshot` in `vendor-selection.ts` had no remaining
callers, and a loose comparator sitting next to an exact one is a trap for the
next edit. H3.3's own `sameMoney` in `selection.ts` is untouched.

#### One earlier assertion amended — declared

`validate-vendors.mts` check 63 asserted `isIsoInstant('2026-08-01T00:00:00Z')`
was **true**, while D1's prose claimed the predicate matched `toISOString()`
exactly. Both could not hold. The assertion now requires second precision to be
**refused**, which is what the corrected rule does.

#### 10 new checks — vendors 74 → 84

75 impossible and normalized dates (each first proven to survive `Date.parse`,
so the fixture is a real trap) · 76 millisecond precision, including that a live
`new Date().toISOString()` still passes · 77 non-canonical timestamps in a
bundle · 78 vendor-snapshot extras · 79 item-snapshot and price extras · 80
quoted-cost and budget extras · 81 extras duplicated consistently throughout,
first asserting the fixture really is consistent so the check tests what it
claims · 82 malformed stored email, with WhatsApp deliberately also present · 83
valid and absent stored emails still read · 84 honest writes still commit.

#### Gates

| Gate | Result |
|---|---|
| Validation | **383/383 across ten suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, **vendors 84** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly baseline |
| `build` | Succeeds, **26 routes** — unchanged |
| Routes | All 13 sampled return 200 |
| Links | All 28 internal targets resolve to built routes |

**Preserved unchanged:** `OperationsState` v4, Workspace v7, the v1 → v2 → v3 →
v4 chain, live-brief and live-`ItemSelection` authority, zero-cost quotes, exact
currency matching, the complete ordered considered set, `finalDecision`
recomputation, `HumanOperator`/`Confirmed` semantics, no recommendation or
override reason, single-write atomicity, append-only history, duplicate refusal,
no hard delete — and no claim that Aniyé proves what a vendor said.

**No UI or routing change was required, and none was made** — `git diff app/` is
empty. **The H3.4 browser evidence remains applicable**; no new browser run was
performed or claimed.

> **Reporting correction.** The D1 completion report said commit `9670fce`
> changed five files. It changed **six** — the header miscounted while the path
> list beneath it was correct.

### ✅ H3.5 — Courier directory and manual selection, per country

**The last cost in the picture**, and the first milestone whose completion test
is about *coverage* rather than a single record.

**What was built.** `lib/operations/couriers.ts` — draft validation, canonical
rebuild, per-country lookup and coverage. `lib/operations/courier-selection.ts` —
preview, builder and trust boundary. Two routes: `/operations/couriers` with the
coverage panel, and `/operations/moments/[id]/courier`. Couriers joined the shell
navigation and left the "not built yet" list, which now holds only Catalog and
Fulfilment.

**Deliberately not built** — checkpoint milestone 7 excludes rate APIs, tracking
integration and optimization *in terms*, so: no rate cards, tracking numbers, API
credentials, service levels, zones, transit-time models, scoring, ranking,
automatic routing, courier accounts, portals or courier-facing routes. No
fulfilment, proof of delivery, `RecognitionOrder`, customer charge or margin.

#### The judgement calls, and why

| Question | Answer |
|---|---|
| Event name | **`CourierSelected`** — see the declared departure below |
| Shape | Like **H3.3**, not H3.4. Courier alternatives are *knowable* (the active couriers serving the country), so the considered set is **recomputed**, not typed in, and one cost is recorded rather than several. No `courierOffers` collection |
| Country model | **One country per row.** A courier working in two countries is two rows — the smallest model that answers "who carries in NG?" without inventing coverage or routing. No city field: city routing is optimization |
| Carriage ceiling | **None invented.** A quote above the vendor cost or the approved budget is allowed — the budget governs what the *recipient* receives (ADR-004), and relating carriage to it is a commercial decision **U3** has not made |
| Zero carriage | **Allowed.** A courier absorbing a leg is a real quote. Negative is refused |
| Where the country comes from | The **live confirmed brief**; item and vendor from their live Decisions. Never re-derived from Workspace |

> ⚠️ **A declared departure from the checkpoint.** Part 2 row 9 and the Operations
> Atlas loop table both leave the Event column **blank** for courier selection,
> proposing a Decision and nothing else. H3.5 records **`CourierSelected`**
> anyway.
>
> That blank is a proposal, not a decision against, and by ADR-006's own test —
> *does it change the state of a Moment's execution?* — assigning a carrier
> plainly does. Without it the Moment timeline would read "Item chosen · Vendor
> chosen · …nothing…" until dispatch, silently skipping a step that materially
> moved the job. **Recorded here rather than made quietly.**

#### The named gap, and a conflict surfaced

Milestone 7's completion test is *"a courier is selectable for every operating
country, or the gap is named"*. The directory answers it: every country
deliveries are going to, how many briefs are heading there, how many active
couriers carry there — each gap named **with the country in it**, and an inline
*Add one for NG* that prefills the country.

> ⚠️ **Coverage is measured against confirmed briefs, not
> `WorkspaceState.operatingCountries`.**
>
> Operating countries are **free-text names** captured in the assessment
> (`"Nigeria"`). Every delivery country in Operations is **ISO 3166-1 alpha-2**
> (`"NG"`). **No name-to-code mapping exists anywhere in this repository** —
> confirmed by inspection of `lib/workspace.ts`, `lib/assignments.ts` and
> `lib/people.ts`.
>
> Building one would mean guessing at spellings, languages and disputed names in
> order to answer a question confirmed briefs already answer exactly — and briefs
> are the better evidence besides: a country the organization *says* it operates
> in but has never shipped to needs no courier, and one it ships to must have one
> whether or not anyone listed it.
>
> **Surfaced, not resolved** *— as it stood at H3.5 completion.* If the Council
> wants coverage measured against declared operating countries, that needs a
> country model first, and an ADR.

> ✅ **Subsequently resolved — governance closure of 2026-07-30.** The paragraph
> above is preserved as the account of what was true when H3.5 landed. It is no
> longer the current position.
>
> The Council **accepted the implemented operational authority** and rewrote the
> completion test to:
>
> *"A courier is selectable for every country represented by a current confirmed
> Execution Brief, or the gap is named."*
>
> **Current confirmed Execution Briefs are the accepted operational coverage
> authority.** `operatingCountries` remains free-text assessment and marketing
> data and is **not** operational country authority — no normalization, no
> name-to-code mapping, no canonical country collection, **no Workspace v8**. A
> country model, if ever wanted, takes its own milestone and architecture review.
>
> See the *H3.5 → H3.6 governance decision closure* entry below, and
> [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md).

#### The trust boundary

`verifyCourierSelection()` recomputes before the single atomic write: the Moment
still ready and in this workspace, the live brief matching, the live
`ItemSelection` **and** `VendorSelection` matching, the delivery country matching
the brief, the courier still present, in-workspace, **active** and serving that
country, the snapshot matching the live record exactly, the considered set
matching the directory in order, the quote valid and in the item's currency, the
channel and timestamps canonical, the summary recomputed, and the Event agreeing
at one shared readable instant.

Built with H3.4-D1 and H3.4-D2 already learned: exact keys at every level
**including nested objects**, canonical ISO instants with a round trip, and a
recomputed `finalDecision` — none of it retrofitted.

> Same honest limit as vendors: this verifies everything Aniyé holds. It **cannot
> prove what a courier said.**

**One defect the suite caught before a human did:** the builder checked directory
membership by id but never the passed courier's own `isActive` flag, so a
deactivated *copy* of an active courier passed the id check. The repository would
still have refused it, but the builder now refuses it too, with a clear message.

#### Schema

`OperationsState` **v4 → v5**: one additive rung adding `couriers`, inventing
nothing and touching no Moment, brief, Decision, Event, vendor or offer. A v1
payload still walks v1 → v2 → v3 → v4 → v5 one rung at a time, unknown future
keys survive, future versions are refused, and reads never rewrite storage.
Workspace unchanged at **v7**.

#### Amendments to earlier suites — declared, not silent

| Suite | Check | Change |
|---|---|---|
| briefs | 35 | `CourierSelection` removed from the "later milestone" list — H3.5 produces it |
| selection | 42 | Same |
| vendors | 34 | Same |
| vendors | 53, 54, 55 | Pinned literal `4`; now assert `>= 4` or `CURRENT_OPERATIONS_SCHEMA_VERSION`, so the next rung will not break them |

#### Gates

| Gate | Result |
|---|---|
| Validation | **429/429 across eleven suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, vendors 84, **couriers 46** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly baseline |
| `build` | Succeeds, **28 routes** — two intentional additions |
| Routes | All sampled return 200, including both new routes |
| Links | Every internal `href` resolves to a built route |

#### Browser evidence

Full chain driven live: brief → item → vendor → carriage.

| State | Result |
|---|---|
| Empty directory | One obvious action — *Add the first courier* |
| Coverage gap | *"One country you are delivering to has no courier · NG · 1 brief · no active courier"*, with an inline fix |
| Add via the gap | Country **prefilled to NG**; blank save named every field and wrote **0 couriers** |
| Coverage complete | Flipped to *"Every country you are delivering to has a courier"* after two NG couriers |
| Per-country scoping | A KE courier was added and correctly **absent** from the NG selection list |
| Moment with no courier | *"No active courier carries in NG"* — the gap named with the country in it |
| Draft entry | Choosing and pricing wrote **nothing**; primary disabled until both were set |
| Confirmation | Stated it records the choice, the reason, the quote and **all 2 couriers available** |
| Confirmed | **1** Decision, **1** Event, **1** write. Both NG couriers in the considered set; no `recommendation`, no `overrideReason` |
| Duplicate refusal | *"A courier has already been chosen for this moment"* |
| Stale courier | Deactivating the chosen courier mid-flow produced *"\"Swift Dispatch\" was deactivated while this was open… nothing was recorded"* — **0 selections** written |
| Migration | The **v4 → v5 rung was observed running in the browser** against a v4 payload |
| Overflow / targets | No page or inner-container horizontal scroll; no H3.5 control under 44px |

**Widths actually measured** (`window.innerWidth`): **1440px**, **768px**,
**400px**. No width was simulated by toggling classes.

> **Real-device testing was not performed and is not claimed.** It remains a
> pre-pilot **[P]** item (H4.0).

**Still open:** the four sub-44px targets in the `OperationsShell` navigation
drawer. Pre-existing H3.1 shell chrome, untouched.

#### ✅ H3.5-D1 — malformed runtime containers

**Acceptance defect, found reviewing H3.5 after it shipped. No schema change —
`OperationsState` stays v5, Workspace stays v7.**

The boundary enforced exact keys **after** receiving a valid object. It never
established that it *had* one.

> `extraKeys(null, allowed)` returns no extras — correctly, since `null` has no
> keys — so a malformed container sailed through the key check and **threw** on
> the property reads beneath it.
>
> **A thrown exception is not a refusal.** It returns no `StoreResult`, names no
> recovery, and leaves the operator unable to say whether anything was written.
> The whole point of a `StoreResult` boundary is that the caller always learns
> the outcome; an exception is the one path that tells them nothing.

Every case was **reproduced against the shipped code** before being fixed.

| Submitted | Before |
|---|---|
| `write` = `null` / `undefined` / `[]` | **Threw** — `commitCourierSelection` destructured before checking |
| Decision missing or `null` | **Threw** on `decision.momentId` |
| Event missing or `null` | **Threw** on `event.momentId` |
| `Decision.inputs` = `null` / `undefined` | **Threw** on `inputs.briefId` |
| `Decision.inputs` = `[]` / a primitive | Refused, but only *incidentally* — an array has no `briefId`, so the comparison merely failed. Not a named refusal |
| `Event.payload` = `null` / `undefined` | **Threw** on `payload.briefId`, once an otherwise-honest bundle reached that far |
| `Event.payload` = `[]` | Refused incidentally, as above |

#### The correction

**`isPlainRecord` is exported from `lib/operations/types.ts`** and refuses
`null`, `undefined`, arrays and primitives. The file's long-standing private
`isPlainObject` is now an alias of it, so there is one implementation rather than
two that could drift.

**Shape before contents, in both places:**

- `commitCourierSelection()` validates the **write bundle, Decision and Event**
  are records before reading any property from them.
- `verifyCourierSelection()` does the same at its own entry — it is callable
  directly and cannot assume the repository already checked — and then requires
  `Decision.inputs` and `Event.payload` to be plain records **before** the
  extra-key checks or any property access.

Every refusal uses the existing review-again recovery language, so a malformed
submission reads like every other refusal rather than like a crash.

> **TypeScript types were not weakened to accommodate malformed callers.** The
> interfaces still say what an honest submission looks like; the boundary simply
> stops believing them at runtime, which is what a boundary is for. The compiler
> is gone by the time a caller hands the repository `null`.

**Preserved unchanged:** the Courier model and directory behaviour, confirmed-brief
coverage, `CourierSelection`/`CourierSelected`, the recomputed candidate set,
carriage-cost and currency treatment, canonical timestamps, recursive exactness,
stale-state revalidation, single-write atomicity, `OperationsState` v5, Workspace
v7, the migration chain, and every route and screen.

#### 7 new checks — couriers 46 → 53

47 null/undefined/array/string/numeric/boolean bundles · 48 missing, null, array
and string Decisions, and a bundle with no `decision` key at all · 49 the same
for the Event · 50 malformed `Decision.inputs` containers · 51 malformed
`Event.payload` containers, submitted on an **otherwise-honest bundle** so they
reach their own gate — which is precisely the path that used to throw · 52
`isPlainRecord` itself, against ten non-records and three records · 53 the
counterweight: an honest selection still commits in exactly one write.

Every refusal check asserts three things together: **it did not throw**, the
reason carries the review-again recovery, and couriers, Decisions and Events are
byte-identical afterwards with zero storage writes. Each case is exercised
**twice** — once through `commitCourierSelection` and once directly against
`verifyCourierSelection`.

#### Gates

| Gate | Result |
|---|---|
| Validation | **436/436 across eleven suites** — verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, vendors 84, **couriers 53** |
| `typecheck` | Clean |
| `lint` | **47 problems — 26 errors, 21 warnings.** Exactly baseline |
| `build` | Succeeds, **28 routes** — unchanged |
| Routes | All 11 sampled return 200 |
| Links | All 30 internal targets resolve to built routes |

**No UI or routing change was required, and none was made** — `git diff app/` is
empty. **The H3.5 browser evidence remains applicable**; no new browser run was
performed or claimed.

> ⚠️ **The same latent shape exists on the H3.3 and H3.4 boundaries.**
> `commitItemSelection` and `commitVendorSelection` destructure their write
> bundles and read `decision.inputs` and `event.payload` without a container
> check, exactly as this one did. They were **not** changed here, because this
> correction is scoped to H3.5 — but the gap is real, it is recorded now rather
> than discovered later, and it should be closed by a Council-scoped correction
> covering both.

#### ✅ H3.6 governance — resolved 2026-07-30

**Was:** *"gated on unresolved U4."* **Now:** resolved by
[ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md), with the
adjudication half deferred. See the governance closure entry below.

### ✅ H3.5 → H3.6 governance decision closure — 2026-07-30

**Documentation only.** No code, schema, migration, validation script, route or
UI changed. `git diff` touches documentation and `CLAUDE.md` and nothing else.

Council decisions on the checkpoint prepared at `4c16f0c`
([`H3_5_H3_6_GOVERNANCE_CHECKPOINT.md`](H3_5_H3_6_GOVERNANCE_CHECKPOINT.md)).

#### A · H3.5 country coverage — implemented authority accepted

The completion test is **rewritten**:

> *"A courier is selectable for every country represented by a current confirmed
> Execution Brief, or the gap is named."*

`WorkspaceState.operatingCountries` **remains a free-text assessment and
marketing field and is not operational country authority.** No normalization, no
name-to-code mapping, no canonical country collection, **no Workspace v8**. A
future country model requires its own milestone and its own architecture review.

#### B · ADR-012 — accepted

[ADR-012 — Fulfilment lifecycle and the proof-receipt boundary](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md).

| | Decision |
|---|---|
| Object | **One Fulfilment per Moment.** No persisted `Pending` or draft. Created **only** when initial dispatch is confirmed |
| States | Exactly three — `Dispatched` · `DeliveryFailed` · `Delivered` |
| Initial dispatch | Atomically creates the Fulfilment at `Dispatched` and appends `Dispatched`. **No Decision invented** where no judgement between alternatives occurred |
| Failure | Atomically sets `DeliveryFailed` and appends `DeliveryFailed`. **Not Event-only** — the current actionable state must identify that redelivery is required |
| Redelivery | Allowed **only** from `DeliveryFailed`. Atomically records a Confirmed **`Redelivery` Decision** with a required human reason, returns state to `Dispatched`, and appends `Dispatched` with the **next attempt number** |
| Delivery | Allowed **only** from `Dispatched`. Atomically sets `Delivered` and appends `Delivered` |
| Proof | `ProofReceived` appended **only after** `Delivered`. **Not a Fulfilment status** |
| Invariants | Decisions immutable, Events append-only and ordered. The Fulfilment holds **current state**; the ordered Event history is **historical truth** |
| Excluded | `Returned`, `Escalation`, `QAException`, dispute adjudication, courier webhooks, tracking integrations |

ADR-006's confirmation, atomicity and append-only rules continue to govern.

#### C · Proof storage — metadata only

**H3.6 records receipt metadata and stores no proof file.** `ProofReceived` may
record only: proof kind or kinds constrained to **`Photo` · `Document` ·
`Signature`**; channel/source; actor; `occurredAt` and `recordedAt`; and the
identifiers binding it to the Fulfilment and Moment.

> **It must not store** image or document bytes, a URL pretending the file is
> durable, a data URI, base64, Blob content, or recipient-home photographs and
> other proof content in `localStorage`.

**The operator experience must say honestly** that the prototype records that
proof was received and does **not** retain the evidence file.

**The customer-facing promise is corrected.** *"Confirmation + curated proof"* is
**future accepted architecture**, not delivered by the metadata-only H3.6
prototype. Secure, access-controlled file storage remains mandatory before actual
proof files exist and before the external pilot.

#### D · The former Operations U4, split

| | |
|---|---|
| **OPS-U4a** — lifecycle and proof recording | ✅ **Resolved** by ADR-012 |
| **OPS-U4b** — QA exceptions, adjudication, disputes, what the customer is told | 🟠 **Deferred.** H3.6 must not introduce `QAException` or a dispute path |

**The present single-operator internal prototype has no second party with whom to
adjudicate a dispute.** OPS-U4b becomes blocking at the earliest of: a
customer-facing delivery, proof or exception view; a customer-visible operational
audit trail; any second party submitting or disputing delivery evidence; **H4.0**
customer-facing Moment visibility; or the external pilot.

#### E · The `U4` identifier collision, resolved

**Two documents used bare `U4` for different questions**, and two used bare `U5`
the same way:

| Bare | Operations Atlas meant | Master Roadmap meant |
|---|---|---|
| `U4` | Exception and QA taxonomy | *What is the first pilot currency?* |
| `U5` | Vendor and courier onboarding | *Class lifecycle fields* |

Identifiers are now **source-scoped, preserving provenance**, and **nothing was
renumbered**:

- **`CP-U1 … CP-U4`** — checkpoint open questions (Master Roadmap register)
- **`LEDGER-C2`, `LEDGER-C5`** — ledger conflicts, previously numbered U5/U6 in that register
- **`OPS-U1 … OPS-U10`** — Operations Atlas §9, with `OPS-U4` split into `a` and `b`

The collision table is recorded in `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 and the
Master Roadmap's *Unresolved* register.

#### F · Policy-resolution snapshot defect — **four** fields, not three

**Accepted.** The checkpoint identified three missing delivery fields; the Council
records **four**. All are configurable customer promises, shown back to the
customer in `PolicyForm`'s Review step, and **absent from
`PolicyResolutionSnapshot`**:

1. `deliveryRequirement`
2. `preferredDeliveryWindow`
3. `signatureRequired`
4. `proofRequired`

**The required correction:**

| # | Requirement |
|---|---|
| 1 | A **separate additive `OperationsState` v5 → v6 migration** |
| 2 | Newly generated Moments capture **all four** from the resolved policy |
| 3 | Existing Moments are **not** backfilled |
| 4 | Absence means **"not recorded when this Moment was prepared"** |
| 5 | **Never** default absence to `Standard`, an empty delivery window, or `false` for either flag |
| 6 | H3.6 must **refuse** a legacy Moment lacking required delivery context, with a named recovery — never infer current policy state |
| 7 | Policy id + version **cannot** recover the history: the policy is edited in place at the same id and version |
| 8 | **`OperationsState` remains v5 in this commit.** v6 is planned and must not be reported as landed |

> This is the **third** instance of the same class — `excludedCategories` at H3.3,
> and now four delivery fields. Every Moment generated before the migration lands
> is permanently unable to say whether proof was required.

#### G · H3.3/H3.4 malformed-container correction — recorded, not implemented

**Verified pending correction**, covering `commitItemSelection` /
`verifyItemSelection` and `commitVendorSelection` / `verifyVendorSelection`.

They must apply the exported **`isPlainRecord`** pattern **before destructuring or
property access**. H3.4 must additionally establish that **`offers` is an array**
and that **each newly submitted offer is a plain record** before any exact-key or
field checks.

**Independent, no schema change, and it must land before the v5 → v6 migration.**
Not implemented in this documentation task.

#### State after this commit

| | |
|---|---|
| H3.5 | ✅ **Complete** |
| H3.6 | ⬜ **Not begun.** Governance resolved |
| Workspace schema | **v7** |
| `OperationsState` | **v5** — v6 planned, **not landed** |
| Must land before H3.6 | H3.3/H3.4 container correction, then the v5 → v6 snapshot migration |
| Still deferred | Actual proof-file storage · OPS-U4b adjudication |

### ✅ H3.5 → H3.6 governance documentation D1 — 2026-07-30

**Documentation only.** No code, schema, migration, validation script, route or
UI changed. A follow-up to the governance closure above, correcting statements
that the closure left contradicting it.

**The problem.** The closure recorded the country-coverage decision in the
roadmap's *decided* section and in ADR-012 — but several **current-state**
passages elsewhere still described the same question as open, and two ADR
implementation rows had gone stale during H3.3 – H3.5.

| # | Corrected |
|---|---|
| 1 | `MASTER_ROADMAP.md` described H3.5 as *"per operating country"* in the status row and the milestone table. Now distinguishes **the directory is country-scoped** from **coverage authority is the countries on current confirmed Execution Briefs** |
| 2 | The roadmap's H3.5 narrative still ended *"Surfaced rather than resolved"*. Replaced with the Council resolution and the exact accepted completion test |
| 3 | `RELATIONSHIP_OPERATIONS_ATLAS.md` §3 repeated the same unresolved wording. Replaced, and confirmed Execution Briefs stated as the accepted authority. Atlas bumped **v1.7 → v1.8** |
| 4 | This ledger's H3.5 entry read as though the authority were still open. **Preserved as the historical account** and explicitly qualified with the later decision |
| 5 | `docs/adr/README.md` claimed ADR-006 applied to *"Moment generation only"* and that `OperationsState` was *"now v2"*. Both stale — see below |

**The original checkpoint wording is preserved wherever it is quoted**, marked as
historical provenance rather than deleted. The rewritten test is stated
immediately after it, so no reader meets the old wording without the new.

#### ADR implementation table — corrected

| ADR | Was | Now |
|---|---|---|
| **ADR-006** | *"Decisions and Events exist for Moment generation only"* | Applies **through H3.5** — Moment generation, brief confirmation and address override, item selection, vendor selection, courier selection. **Still partly implemented**: the fulfilment lifecycle is accepted (ADR-012) and not built |
| **ADR-010** | *"`OperationsState` v1 (now v2)"* | **Introduced v1**; current is **v5** |
| **ADR-011** | *"`OperationsState` v2"* | **Landed at v2**; current is **v5** |
| **ADR-012** | — | **Accepted, not implemented.** H3.6 has not begun |

#### Deliberately left alone

- **Dated historical footers** — Master Roadmap v1.6, System Atlas v3.9, and this
  ledger's dated H3.4/H3.5 lines. They record what was true when written, and the
  current registers already carry the qualification. Rewriting them would
  falsify the record.
- **The milestone-count discrepancy.** The roadmap's *other* "Surfaced rather
  than resolved" — the 37-versus-31 counting-granularity question — is a
  **different and genuinely open** matter. Untouched.

#### State after this correction

**H3.5 remains complete. H3.6 has not begun.** Workspace **v7**;
`OperationsState` **v5**, with v6 planned and not landed. Both pending
corrections — the H3.3/H3.4 malformed-container fix and the policy-snapshot
v5 → v6 migration — remain **unimplemented** and must land, in that order,
before H3.6.

### ✅ H3.3/H3.4-D1 — malformed runtime-container correction — 2026-07-30

**Correctness correction. No schema, migration, UI or route change.** This
implements the Council-scoped correction recorded in the governance checkpoint
without beginning the separate policy-snapshot v5 → v6 migration or H3.6.

#### What changed

- `commitItemSelection()` and `verifyItemSelection()` now establish that the
  write bundle, Decision, Event, `Decision.inputs` and `Event.payload` are plain
  records **before** destructuring or property access.
- `commitVendorSelection()` and `verifyVendorSelection()` apply the same gates.
  They additionally establish that `offers` is an array and that **every newly
  submitted offer is a plain record** before exact-key or field checks.
- Every refusal uses the existing operation-specific review-again recovery and
  states that nothing was recorded.
- TypeScript interfaces were **not weakened**. The already exported
  `isPlainRecord` remains the one shared runtime predicate; the three
  milestone-specific `extraKeys` helpers were not consolidated because the
  Council did not authorize that wider refactor.

#### Proof

Fourteen new checks exercise every guard through both the repository and the
pure verifier directly. Together they assert: **no throw**, the named
review-again recovery, zero storage writes, byte-identical stored bytes,
byte-identical `OperationsState` collections, and an honest confirmation still
committing in exactly one write.

| Suite | Before | After |
|---|---:|---:|
| Item selection | 65 | **71** |
| Vendor selection | 84 | **92** |
| All eleven suites | 436 | **450** |

Typecheck clean. Lint unchanged at **47 problems — 26 errors, 21 warnings**.
Production build succeeds with **28 routes**. No browser run was performed:
there is no UI change, so the existing H3.3/H3.4 visual evidence remains the
relevant evidence.

#### State after this correction

| | |
|---|---|
| H3.5 | ✅ **Complete** |
| H3.6 | ⬜ **Not begun.** Governance resolved |
| Workspace schema | **v7** |
| `OperationsState` | **v5** — v6 planned, **not landed** |
| Must land before H3.6 | **Policy-resolution snapshot v5 → v6** — the only remaining prerequisite |
| Still deferred | Actual proof-file storage · OPS-U4b adjudication |

### ✅ Pre-H3.6 — policy-resolution delivery snapshot — 2026-07-30

**Structural correctness correction. `OperationsState` v5 → v6.** This is the
second and final prerequisite ordered by the H3.5 → H3.6 governance decision.
It does not begin H3.6 and adds no Fulfilment, Decision, Event, route or UI.

#### What changed

- Newly resolved `PolicyResolutionSnapshot` records all four customer delivery
  promises: `deliveryRequirement`, `preferredDeliveryWindow`,
  `signatureRequired` and `proofRequired`.
- The v5 → v6 migration is a **pure version bump**. It does not walk or rewrite
  Moments, Decisions, Events or copied Execution Brief snapshots, and it
  preserves unknown keys.
- Existing snapshots keep all four fields absent. Absence means **"not recorded
  when this Moment was prepared"** — never `Standard`, an empty window or
  `false`.
- The four fields form one optional legacy-compatible group. Structural
  validation accepts all four absent or all four well-typed; partial or malformed
  presence is refused.
- Confirmation-time fingerprints include every delivery promise, so an in-place
  policy edit after preview writes nothing and requires a fresh confirmation.

#### Proof

Four focused checks cover the pure migration, exact capture, legacy-versus-malformed
shape handling and confirmation-time materiality. Operations validation rises
**50 → 54**; all eleven suites pass **454/454 checks**. Typecheck is clean. Lint is
unchanged at **47 problems — 26 errors, 21 warnings**. The production build succeeds
with **28 routes**. No browser run was performed because there is no UI change.

#### State after this correction

| | |
|---|---|
| H3.5 | ✅ **Complete** |
| H3.6 | ⬜ **Not begun.** Governance and prerequisites resolved |
| Workspace schema | **v7** |
| `OperationsState` | **v6** |
| Remaining prerequisite before H3.6 | **None** |
| Still deferred | Actual proof-file storage · OPS-U4b adjudication |
---

### ✅ H3.6 — Fulfilment tracking — 2026-07-30

**New build, not recovery. `OperationsState` v6 → v7.**
[ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) is implemented as accepted, with
every Council condition held and no variance.

**What was built.** One `Fulfilment` per Moment, created **only** on confirmed initial dispatch —
there is no persisted `Pending` and no draft, so a Moment with carriage arranged but nothing
dispatched simply has none, and that absence is itself the fact. Three statuses: `Dispatched`,
`DeliveryFailed`, `Delivered`. Five named repository transitions, each **one atomic write** over a
fully validated proposed state: initial dispatch, failed attempt, redelivery, delivery confirmation,
proof receipt.

**`Redelivery` is the only Decision.** Dispatching and delivering are occurrences — there were no
alternatives, so a reason field on them could only ever be filler. Choosing to try again after a
failure is a real choice between real alternatives (redeliver, cancel, or handle it outside the
system), so it carries a required human reason exactly as every other Decision does.

**Current state is a projection; the Events are the historical truth.** `replayFulfilment()` walks a
Fulfilment's Events in persisted order, and `validateOperationsState` **refuses any stored record
whose status or attempt disagrees with its own replay**. Nothing is mutated or reordered to produce
a history: a fulfilment that failed once and was redelivered reads `Dispatched` at attempt 2, and its
Events read `Dispatched#1 · DeliveryFailed#1 · Dispatched#2 · Delivered#2 · ProofReceived#2`.

**Proof is metadata, and the boundary is enforced twice.** `ProofReceived` records a kind (`Photo`,
`Document`, `Signature`), the channel, the actor and both timestamps. The exact-key check runs on the
payload **and on the Event itself** — the second was added because checking only the payload would
have left `event.proofUrl` free to reach storage beside a spotless payload, one nesting level above
where the rule was being looked for. Fourteen forbidden field names are proven refused, and proven
absent from storage afterwards. There is no upload control, and the operator surface states plainly
that the evidence file is not retained.

**The legacy gate is honest about having no repair.** A Moment prepared before `OperationsState` v6
carries none of the four delivery promises and cannot be dispatched. It also cannot be fixed: the
promises are unrecoverable (a policy is edited in place at the same id and version) and the Moment
cannot be prepared again, because generation refuses a `sourceKey` that already exists and cancelling
does not release it. The recovery says exactly that rather than offering an action that would fail.

**Two defects found in the existing suites, and corrected rather than worked around:**

1. **`validate:operations` check 3 and `validate:briefs` check 6 asserted the Workspace and
   `OperationsState` schema versions were _unequal_**, as a proxy for "they move independently".
   That was only ever incidentally true — two independent counters coincide the moment they have
   taken the same number of steps, and at H3.6 both reached 7. Both checks now assert what actually
   matters: that the operations chain lands on its own constant, and that the two states persist
   under different storage keys (ADR-010).
2. **`CLAUDE.md`'s command block omitted `validate:briefs`** — 47 checks. Anyone following it as
   written under-ran the gates by a full suite. Added, with the total stated.

**Not built, as required:** `QAException`, disputes, adjudication (**OPS-U4b**), `Returned`,
`Escalation`, tracking numbers, tracking URLs, courier webhooks, carrier APIs, delivery scoring or
routing, external-party access, and any storage of proof content. `MOMENT_STATUSES` is unchanged at
three. Workspace schema is unchanged at **v7**.

**Gates.** New suite `validate:fulfilments` — **50 checks**. **504 checks across twelve suites**
(verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47,
operations 54, selection 71, vendors 92, couriers 53, fulfilments 50). Typecheck clean. Lint **47
problems — 26 errors, 21 warnings**, exactly the pre-H3.6 baseline. Build succeeds with **30 routes**
(two intentional additions: `/operations/fulfilments` and `/operations/moments/[id]/fulfilment`).

⚠️ **No browser verification was performed.** The two new operator surfaces are covered by automated
checks and static review only. No responsive, keyboard, focus or overflow behaviour has been
observed running, and none is claimed. Real-device testing remains outstanding, as it has since H3.1.

**H3.7 has not begun**, and is gated on **CP-U3 / OPS-U3** (merchant of record) and **CP-U4** (first
pilot currency).

---

### ✅ H3.6 → H3.7 commercial governance closure — 2026-07-30

**Documentation only.** No code, schema, migration, validation script, route, component or UI
changed. Workspace remains **v7**; `OperationsState` remains **v7**. The 504-check, lint and build
baselines are unchanged and were **not rerun** — there was nothing for them to exercise.

**[ADR-013](adr/ADR-013-commercial-role-pilot-currency-and-recognition-order.md) created and
accepted**, closing the two questions that had blocked H3.7 since the H2 → H3 Architecture
Checkpoint.

**CP-U3 / OPS-U3 — resolved.** `commercialRole = MerchantOfRecord`. Aniyé contracts with the
corporate customer for the complete managed-recognition outcome and procures vendor and courier
fulfilment as its own operational cost. This matches what the Atlas has asserted since before the
question was asked — *"The customer buys from Aniyé. The vendor is a fulfillment partner"* (§9) — and
what §15 already implied by distinguishing *"what it cost them"* from *"what it cost **us**."*

⚠️ **It is a platform and pilot posture, not a legal, tax or accounting opinion.** Qualified Nigerian
advisers must confirm the contracts, VAT treatment, invoicing, refunds and the principal-versus-agent
accounting treatment before any external pilot. If professional advice later requires an Agent model,
existing orders must **not** be silently relabelled, historical `MerchantOfRecord` snapshots must
**not** be reinterpreted, and a **new governance decision** is required.

**CP-U4 — resolved.** **NGN**, for every amount on a pilot `RecognitionOrder`. A supplier quote or
cost in any other currency makes the order multi-currency and therefore outside the approved H3.7
architecture — never converted, never defaulted, never implicitly compared. **FX stays out of H3.7
entirely**: no rate source, snapshot, conversion, settlement currency or cross-border arithmetic.

**Pricing — manual, per order.** `estimatedCustomerCharge` is entered deliberately by an operator,
explicitly confirmed, and immutable once the order exists. **No formula, no percentage, no rate card,
no pricing engine**, and no payment, cash-only or settlement assumption. Aniyé has no pricing
evidence yet, and a formula chosen now would encode a commercial rule nobody decided while looking
identical in the data to one that had been.

**ADR-007 clarified, not replaced.** `estimatedItemCost` is **superseded for H3.7** by
`estimatedVendorCost`, read from the confirmed `VendorSelection` quote — the catalog price answers
what a gift is worth against the budget, not what a vendor will charge Aniyé, and the repository has
said so since H3.4. Integer minor units, the pinned exponent table, the prohibition on implicit FX,
one order per Moment and **derived-never-stored margin** are all unchanged. ADR-007's own text is not
rewritten; it carries a forward pointer.

**Earlier revenue proposals — preserved, deferred, non-authoritative.** Vendor commission, sender
service fee, corporate subscription, payment margin, featured placement, percentage pricing and
*"25% + courier fee"* are recorded as historical proposals. **Corporate subscription remains a
possible future account-level model and can never be a `RecognitionOrder` field** — a one-per-Moment
object cannot carry a recurring account-level fee. The founders' original material is neither deleted
nor rewritten; the later Council decision controls the pilot architecture.

**Conflicting analysis handled, not blended.** Material produced during the Council process that
argued for an Agent posture, percentage pricing or cash-only framing is recorded in ADR-013's *What
was rejected* section as **superseded analysis**, with the reasoning preserved. It was not merged
with the accepted decisions.

**Pilot sequence.** One corporate organization, Lagos fulfilment, city-first — a domestic closed-loop
pilot. **Nigeria → Cameroon remains the intended first cross-border corridor**, sequenced after it.
The historical cross-border plan is **not abandoned and not superseded**; the decision changes
sequence, not strategy. The corridor needs its own architecture decision, because the implemented
H3.3–H3.5 chain refuses currency mismatch by design and would have to be reopened.

**Current-state documentation drift corrected**, with dated historical entries left intact:

| Document | Was | Now |
|---|---|---|
| `docs/adr/README.md` | Current `OperationsState` **v6** | **v7** |
| `docs/MASTER_ROADMAP.md` basis footer | `OperationsState` v6, System Atlas v3.11, ADR-001 … ADR-012 | **v7**, v3.13, ADR-001 … **ADR-013** |
| `docs/ANIYE_SYSTEM_ATLAS.md` §17 | "As of … `OperationsState` v6"; Fulfilment listed as not implemented | **v7**; Fulfilment **implemented**; Recognition Order listed as accepted-not-implemented |
| `docs/ANIYE_SYSTEM_ATLAS.md` §18 | ADR-012 "No — H3.6 not begun" | **Implemented** at H3.6 |
| `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` §1 | `OperationsState` **v6** | **v7** |
| `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` footer | Implemented state stopped at **H3.5** | Through **H3.6** |

**H3.7 is unblocked by governance and has not begun.** No `RecognitionOrder`, no `commercialRole`
field, no actual vendor cost, courier cost or customer charge, and no margin calculation exists
anywhere in the repository. Milestone count stays **24 of 37**; H3 stays **6 of 8**.

**Still gating an external pilot:** Nigerian legal, tax and accounting confirmation of the commercial
posture, and ADR-010's unchanged production backend, authentication, multi-tenancy and secure
file-storage requirements. **OPS-U4b** (QA and adjudication) remains deferred.

---

### ✅ H3.7 — Recognition Order and commercial tracking — 2026-07-31

**New build, not recovery. `OperationsState` v7 → v8.**
[ADR-013](adr/ADR-013-commercial-role-pilot-currency-and-recognition-order.md) is implemented as
accepted, with every decision held and no variance. Workspace remains **v7**.

**What was built.** One `RecognitionOrder` per Moment, created **only** on explicit confirmation —
there is no draft, and no cancellation. Two statuses: `Committed`, then `Reconciled` once all three
actual amounts are confirmed. `commercialRole` is snapshotted at creation, immutable, and **only
`MerchantOfRecord` may ever be written** — `Agent` and `Unspecified` exist as ADR-007's reserved
values and are refused at the write boundary and in structural validation.

**Every amount is NGN, and a non-NGN amount is refused rather than converted.** There is no exchange
rate, no snapshot, no conversion and no settlement currency anywhere in H3.7.

**The quotation is a judgement, not a calculation.** `estimatedCustomerCharge` is typed by an
operator and confirmed with a reason. The field starts empty and **nothing prefills or suggests it**:
no budget-derived figure, no percentage, no margin target, no rate card, no pricing engine. A quote
below cost, above budget, or zero is accepted, because no accepted rule prohibits any of them and
inventing one would be a commercial decision nobody has made.

**The estimates come from the confirmed quotes, not the catalog.** `estimatedVendorCost` reads the
live `VendorSelection` Decision and `estimatedCourierCost` the `CourierSelection` — ADR-007's
`estimatedItemCost` is superseded. The live browser run demonstrated the distinction concretely: the
chosen item was **NGN 38,000** and the vendor quoted **NGN 34,000**, and the order carries the quote.

**Margin is derived on read and never stored.** `grossMargin()` computes
`actualCustomerCharge − actualVendorCost − actualCourierCost` in integer minor units, returns nothing
until all three exist, and refuses a currency mismatch rather than converting. **Correcting a cost
therefore needs no second write** — there is nothing stored to update, which is exactly why ADR-007
forbids storing it.

**Corrections supersede; they never rewrite.** Actuals are confirmed as one set after `Delivered`. A
correction appends a new `CostReconciliation` carrying the previous values and marks the prior one
`Superseded`, leaving its amounts, reason and summary byte-identical. Two corrections leave three
records in persisted order.

**A committed order is now required before a new initial dispatch.** A quotation is a human judgement
that cannot be reconstructed once a parcel has gone, so the commercial authority is recorded before
the dispatch rather than chased afterwards.

⚠️ **Legacy Fulfilments were not backfilled, and never will be.** A Fulfilment dispatched before H3.7
keeps its complete history, remains structurally valid, and can still record failures, redeliveries,
deliveries and proof. The migration invents no order for it, and the surface states the limitation
verbatim: *"Commercial authority was not recorded before this fulfilment began, so a Recognition
Order cannot be reconstructed safely."*

**One judgement the brief left to the architecture review — Events.** ADR-006's test is whether
something changes the state of a Moment's execution. Committing the order **does**, because dispatch
now requires it, and every other gating step records an Event; without one the timeline would read
"Courier chosen · …nothing… · Dispatched", the exact gap H3.5 added `CourierSelected` to close. So
**`RecognitionOrderCommitted` was added**. **Reconciliation and correction append no Event** — they
record amounts after execution has finished. Declared rather than assumed.

**Not built, as required:** payments, collections, invoicing, settlement, refunds, chargebacks,
taxes, duties, service fees, FX, multi-currency orders, rate cards, pricing engines, percentage
pricing, vendor commission, sender service fee, corporate subscription, payment margin, featured
placement, `actualOtherCosts`, stored margin, Moment closure and Memory. `MOMENT_STATUSES` is
unchanged at three; Workspace schema and configuration are untouched.

**Gates.** New suite `validate:orders` — **47 checks**. **551 checks across thirteen suites**
(verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47,
operations 54, selection 71, vendors 92, couriers 53, fulfilments 50, orders 47). Typecheck clean.
Lint **47 problems — 26 errors, 21 warnings**, exactly the pre-H3.7 baseline. Build succeeds with
**32 routes** (two intentional additions: `/operations/orders` and
`/operations/moments/[id]/order`).

**Browser verification — performed.** The full flow was run live against a workspace whose stored
operations payload was still at **v5**, which migrated to **v8** on the first write with
`recognitionOrders: []` and no backfill. Courier selected → dispatch refused with a named recovery →
quotation typed and cancelled (**zero writes**) → committed (**one write**) → refreshed and the
authority persisted → dispatched → delivered → actuals confirmed (**one write**, margin NGN 24,500) →
vendor cost corrected (**one write**, margin NGN 27,500) → courier cost corrected (**one write**,
margin NGN 27,000) → three reconciliations preserved in order, two superseded. An invalid amount
produced a named error with **zero writes** and unchanged state. Measured `window.innerWidth`:
**1440px**, **768px** and a browser-clamped **500px** — 390px was requested and the browser did not
grant it. No page or clipped inner overflow at any width; every new control ≥ 44px; the gold focus
ring present and `:focus-visible` matching; Tab order correct through the forms.

⚠️ **Real-device testing remains outstanding** and is not claimed.

**H3.8 — Confirmation + Memory is next and has not begun.** No Moment closure, no `Memory` record and
no `MomentClosed` Event exists. **Still gating an external pilot:** the ADR-013 professional
confirmations (Nigerian legal, tax, accounting and payments) and ADR-010's production backend,
authentication, multi-tenancy and secure file storage. **OPS-U4b** remains deferred.

### ✅ H3.7 → H3.8 confirmation-and-memory governance closure — 2026-07-31

**Documentation only. No code, schema, migration, validation, route or UI changed.**

**Starting commit `e7a34b2e27172700b3a0a1631d3c1c02ae626428`** — *feat: track recognition order
financials*, parent `dcb36fa5351180eb455216f6f12896dd7721c523` — *docs: close H3.7 commercial
governance*. Verified as the local `HEAD` and the `origin/recovery/h3-reconstruction` tip before this
entry was written; worktree clean; `stash@{0}` and all 11 tags preserved untouched.

**[ADR-014](adr/ADR-014-moment-closure-memory-and-safe-timeline.md) accepted, and not implemented.**
It resolves the architecture required to close a Moment and create its relationship Memory, so H3.8
can be built without inventing semantics from the unreconciled legacy Memory draft:

- **Confirmation** at H3.8 is an operator confirming a delivered, reconciled recognition is complete —
  distinct from `Delivered`, `ProofReceived` and RecognitionOrder reconciliation. **Recipient
  acknowledgement is unsupported and excluded**, not architecturally impossible: a future governance
  decision could introduce an operator-recorded one.
- The terminal Moment status is **`Closed`**, superseding the checkpoint's `Fulfilled`, entered only
  from `ReadyForExecution`, and **irreversible**.
- **Domain ownership is explicit and separate from storage location:** the Relationship Engine owns
  the Moment's current state; Knowledge owns Memory and `MomentClosed`; Operations only orchestrates
  the atomic write; `OperationsState` is the shared prototype persistence envelope, not a domain
  boundary.
- The canonical **Memory** is re-issued as exactly eleven fields, superseding the Atlas §4 draft in
  full — `type`, `summary`, ambiguous `date` and generic `createdBy` are not implemented; occasion,
  target date, recipient identity and gift category are referenced, never copied.
- The safe recipient timeline is a **nine-field exact-key whitelist projection**, gift category
  required and resolved through the RecognitionOrder's immutable `itemSelectionDecisionId`, never
  through whichever `ItemSelection` happens to be live.
- **Three separate prohibition boundaries** are defined — persisted Memory, the `MomentClosed` Event
  payload, and the timeline projection — replacing an earlier contradictory single list that would
  have forbidden `workspaceId` and `recognitionOrderId` even as internal Memory fields.
- Closure appends one `MomentClosed` Event and **records no Decision** — ADR-006's own judgement test,
  already applied by ADR-012 to dispatch and delivery, applies the same way here; `DECISION_TYPES` is
  unchanged.
- The later implementation adds one additive rung, `OperationsState` **v8 → v9** (`memories: []`, no
  backfill, no Moment rewritten); Workspace stays **v7**.
- The checkpoint's *"envelope consumption final"* is recorded as **unsupported by the current
  architecture**, not implemented — no Workspace write, no mutable Program total, no financial ledger.

**No implementation occurred.** No `Memory` type or collection, no `Closed` Moment status, no
`MomentClosed` Event, no closure repository operation and no recipient-timeline route exist after this
entry. `OperationsState` remains **v8**; Workspace remains **v7**; milestone count stays **25 of 37**;
H3 stays **7 of 8**. Baselines are unchanged and were **not rerun** — 551 checks across thirteen
suites, lint 47 (26 errors, 21 warnings), build 32 routes.

**The resulting governance commit becomes H3.8's required starting commit** for any later
implementation of this architecture. System Atlas v3.15, Master Roadmap v2.3, Relationship Operations
Atlas v2.3.



---

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
*Updated after the pre-pilot regression correction — assessment same-session resume prompt suppressed via an interaction latch; PolicyForm Review completed to 11 of 11 configurable values; PolicyForm step focus, live announcement and `aria-current` added. EX-M11 remains open. 234 checks, lint 47 (26 errors, 21 warnings), build 23 routes.*
*Updated after H3.3 (Minimum Catalog + manual item selection) — `OperationsState` **v3** (additive; newly generated Moments snapshot `policyResolutionSnapshot.excludedCategories`, and the rung writes nothing into any existing record). Workspace schema unchanged at **v7**. A pre-H3.3 record **blocks** item selection with a named recovery rather than assuming an empty exclusion list, because a policy is edited in place at the same version and equivalence is not provable. Event named `ItemSelected`, not the checkpoint's `ItemPrepared`; `ItemSubstitution` not added. Three defects found and fixed — an aliased `Money` snapshot, missing workspace-id checks on Decisions and Events, and a false "not resolved / not recorded" panel before a brief exists. Four H3.2 checks amended and declared. **281 checks across nine suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 24 routes. Verified live at 400px, 768px and 1200px; **1440px was not reachable and real-device testing is still not done**. System Atlas v3.7, Master Roadmap v1.4, Relationship Operations Atlas v1.4.*
*Updated after the H3.3 repository trust-boundary correction (H3.3-D1) — `commitItemSelection()` verified the brief id and revision and then trusted the rest of the submitted Decision, so a structurally valid bundle could alter the budget, exclusions, candidate set, selected snapshot or Event payload and still commit; a stale catalog was invisible to it. `verifyItemSelection()` now recomputes every claim from re-read state, the live brief's immutable snapshot and the current catalog, and refuses any mismatch without writing. Approved-budget `Money` is now defensively copied when building the Decision. Catalog injection added to the local repository so staleness is testable without touching the production seed. 18 new repository-level checks (selection 47 → 65); **299 checks across nine suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 24 routes. No schema change — `OperationsState` stays **v3**, Workspace stays **v7**.*
*Updated after H3.4 (Vendor directory, hand-entered offers and manual vendor selection) — `OperationsState` **v4** (additive: `vendors`, `vendorOffers`; invents nothing, touches no existing record). Workspace schema unchanged at **v7**. Only a manual directory and hand-entered offers exist: no scoring, ranking, routing, APIs, vendor accounts, portal, courier, fulfilment or commerce, and **U5 partner onboarding was not invented**. Event named **`VendorSelected`**, not the checkpoint's `VendorContacted` — Aniyé contacts nobody. The chosen item is read from the live `ItemSelection` Decision, never re-read from the catalog; delivery context comes from the current confirmed brief. Zero-cost quotes allowed, negative refused, no invented rule that a quote sit below catalog price. `verifyVendorSelection()` recomputes every claim before one atomic write. Four earlier checks amended and declared. **357 checks across ten suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 26 routes. Verified live at 1440px, 768px and 500px; **the 500px floor is the window manager's, and real-device testing is still not done**. System Atlas v3.8, Master Roadmap v1.5, Relationship Operations Atlas v1.5.*
*Updated after the H3.4 vendor trust-boundary correction (H3.4-D1) — the builders produced the intended shapes but the repository did not enforce them at runtime, so a Vendor could carry `reliabilityScore`/`rating`/`capacity`/`sla`/`onboardingStatus`, a malformed email could reach `createVendor` directly, optional fields and timestamps went unchecked, a bundle whose shared instants were all the same unusable string satisfied the equality rule, non-string offer terms passed when duplicated consistently, a `finalDecision` could contradict its own evidence, and extra commercial fields could be attached to offers, `Decision.inputs`, considered entries or the Event payload. Vendors are now **rebuilt** from an exact eleven-field list rather than spread; timestamps must be canonical ISO instants, not merely equal; `finalDecision` is recomputed from a shared formatter; and exact keys are enforced on everything newly submitted while stored history keeps preserving unknown keys. 16 new refusal checks (vendors 58 → 74), each proving zero writes and byte-identical collections, plus two proving honest writes still commit. **373 checks across ten suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 26 routes. No schema change — `OperationsState` stays **v4**, Workspace **v7**; the migration chain and existing records are untouched. **No UI change, so the existing H3.4 browser evidence stands and no new browser run was performed.**
*Updated after the remaining H3.4 runtime-shape correction (H3.4-D2) — D1 over-claimed on two counts, both corrected in its own entry above. `isIsoInstant()` accepted second precision, one- and two-digit fractions, and **impossible calendar dates**, because `Date.parse` normalizes rather than refuses; it now requires `YYYY-MM-DDTHH:mm:ss.sssZ` **and** an exact `toISOString()` round trip. Exactness was outer-level only, so extra keys inside `vendorSnapshot`, `itemSnapshot`, `price`, `quotedVendorCost` and `approvedBudget` survived whenever duplicated consistently; exact `Money`, `VendorSnapshot` and `CatalogItemSnapshot` validators are now applied recursively at every newly submitted location, compared against a projection rebuilt from live truth. `validateOperationsState()` now applies the shared `isVendorEmailShape()` rule, so a malformed stored address no longer reads as valid. Two superseded comparators deleted. One earlier assertion amended and declared. 10 new checks (vendors 74 → 84); **383 checks across ten suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 26 routes. No schema change — `OperationsState` **v4**, Workspace **v7**, migration chain and existing records untouched. **No UI change, so the existing H3.4 browser evidence stands and no new browser run was performed.** Reporting correction: commit `9670fce` changed six files, not five.*
*Updated after H3.5 (Courier directory and manual selection, per country) — `OperationsState` **v5** (additive: `couriers`; invents nothing, touches no existing record). Workspace unchanged at **v7**. Only a manual per-country directory and one recorded carriage cost exist: no rate APIs, tracking, optimization, scoring, ranking, routing, courier accounts or portals, and **U5 partner onboarding was again not invented**. Selection is shaped like H3.3 rather than H3.4 because courier alternatives are knowable — the considered set is recomputed, not typed in. Event named **`CourierSelected`**, a **declared departure** from the checkpoint, which proposes no Event for this step; ADR-006's own test says assigning a carrier changes a Moment's execution. **A conflict is surfaced rather than resolved:** coverage is measured against confirmed briefs because `WorkspaceState.operatingCountries` are free-text names and no name-to-code mapping exists anywhere in the repository. No carriage ceiling was invented; zero is valid, negative is not, currency must match exactly. One builder defect caught by the suite (a deactivated courier passed the id-membership check). **429 checks across eleven suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 28 routes. Verified live at 1440px, 768px and 400px, including the v4 → v5 migration running in the browser; **real-device testing still not done**. ⚠️ **H3.6 is gated on unresolved U4** — the QA and exception taxonomy — and secure file storage becomes relevant there. System Atlas v3.9, Master Roadmap v1.6, Relationship Operations Atlas v1.6.*
*Updated after the H3.5 courier runtime-boundary correction (H3.5-D1) — the boundary enforced exact keys only after receiving a valid object, and `extraKeys` reports no extras for `null`, so malformed containers passed the key check and **threw** on the property reads beneath it. A thrown exception is not a refusal: it returns no `StoreResult`, names no recovery, and leaves the operator unable to say whether anything was written. `isPlainRecord` is now exported from `lib/operations/types.ts` (the private `isPlainObject` became an alias of it), and both `commitCourierSelection()` and `verifyCourierSelection()` validate the write bundle, Decision, Event, `Decision.inputs` and `Event.payload` are plain records **before** reading any property. TypeScript types were not weakened. 7 new checks (couriers 46 → 53), each asserting no throw, the review-again recovery, zero writes and byte-identical collections, exercised through both the repository and the verifier directly. **436 checks across eleven suites**, typecheck clean, lint 47 (26 errors, 21 warnings) at baseline, build 28 routes. No schema change — `OperationsState` **v5**, Workspace **v7**, migration chain and existing records untouched. **No UI change, so the existing H3.5 browser evidence stands.** ⚠️ **The same latent shape exists on the H3.3 and H3.4 boundaries and was deliberately left out of scope — recorded for a Council-scoped correction.***
*Updated after the H3.5 → H3.6 governance decision closure (2026-07-30) — **documentation only; no code, schema, migration, validation, route or UI changed.** H3.5's completion test rewritten to name confirmed Execution Briefs as the operational country authority; `operatingCountries` stays a free-text assessment field and no Workspace v8 is added. **[ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) accepted** — one Fulfilment per Moment, no persisted draft, exactly three states, `Redelivery` the only Decision, `ProofReceived` after `Delivered` only, and **proof recorded as metadata with no file stored**; `Returned`, `Escalation`, `QAException`, disputes, webhooks and tracking all excluded. The former Operations `U4` is split — **OPS-U4a resolved**, **OPS-U4b deferred** with a five-point trigger, since a single-operator prototype has no second party to adjudicate with. Unresolved identifiers are now source-scoped (`CP-Un`, `OPS-Un`, `LEDGER-Cn`) after two documents were found using bare `U4` and bare `U5` for different questions; **nothing was renumbered**. The policy-snapshot defect is accepted at **four** missing delivery fields, not three. The H3.3/H3.4 malformed-container correction is recorded as pending and must land **before** the v5 → v6 migration. **H3.5 remains complete; H3.6 has not begun; Workspace stays v7 and `OperationsState` stays v5.** System Atlas v3.10, Master Roadmap v1.7, Relationship Operations Atlas v1.7, ADR-012 accepted.*
*Updated after the H3.5 → H3.6 governance documentation correction D1 (2026-07-30) — **documentation only; no code, schema, migration, validation, route or UI changed.** Current-state passages that still described the country-coverage question as open have been reconciled with the governance closure: the Master Roadmap no longer calls H3.5 "per operating country" and no longer ends its H3.5 narrative "surfaced rather than resolved"; the Operations Atlas §3 named-gap section records the Council resolution and the exact accepted completion test, and is bumped **v1.7 → v1.8**; this ledger's H3.5 entry is **preserved as a historical account and explicitly qualified** with the later decision. **Current confirmed Execution Briefs are the accepted operational coverage authority**; `operatingCountries` remains free-text assessment and marketing data. `docs/adr/README.md` corrected — ADR-006 now applies through H3.5 and remains partly implemented; ADR-010 introduced `OperationsState` v1 with current **v5**; ADR-011 landed at v2 with current **v5**; ADR-012 accepted and not implemented. Dated historical footers and the separate, still-open milestone-count discrepancy were deliberately left intact. **H3.5 remains complete; H3.6 has not begun; Workspace stays v7 and `OperationsState` stays v5** — v6 planned, not landed. Relationship Operations Atlas v1.8.*
*Updated after H3.3/H3.4-D1 (malformed runtime-container correction) — the two older selection boundaries now apply the exported `isPlainRecord` pattern before destructuring or property access, matching H3.5-D1. Item and vendor repository commits and direct verifiers refuse malformed write bundles, Decisions, Events, `Decision.inputs` and `Event.payload`; H3.4 also requires `offers` to be an array and every newly submitted offer to be a plain record before exact-key or field checks. TypeScript interfaces were not weakened. Fourteen new checks exercise both paths and prove no throw, the existing review-again recovery, zero writes, byte-identical state and honest one-write commits: selection **65 → 71**, vendors **84 → 92**, **450 checks across eleven suites**. Typecheck clean; lint unchanged at **47 (26 errors, 21 warnings)**; build **28 routes**. No UI, route, schema or migration changed; Workspace remains **v7**, `OperationsState` remains **v5**, H3.6 has not begun, and the policy-snapshot **v5 → v6** migration is the only remaining prerequisite.*
*Updated after the pre-H3.6 policy-resolution delivery snapshot correction — `OperationsState` **v6** captures `deliveryRequirement`, `preferredDeliveryWindow`, `signatureRequired` and `proofRequired` on newly generated Moments. The v5 → v6 migration is a pure version bump: existing records are not backfilled, legacy absence remains unknown, and partial or malformed delivery context is refused. Confirmation revalidation treats every delivery promise as material. Operations validation **50 → 54**; **454 checks across eleven suites**; typecheck clean; lint unchanged at **47 (26 errors, 21 warnings)**; build **28 routes**. No UI or route changed, so no browser run was performed. Workspace remains **v7**; H3.6 has not begun; both prerequisites are now complete. System Atlas v3.11, Master Roadmap v1.9, Relationship Operations Atlas v1.9.*
*Updated after H3.6 (Fulfilment tracking) — `OperationsState` **v7** (additive `fulfilments`; invents no Fulfilment, touches no existing record; a v1 payload still walks every rung). Workspace unchanged at **v7**, and the two counters now coincide without being coupled — the two checks that asserted independence by asserting inequality were corrected to test separate persistence instead. ADR-012 implemented as accepted: one Fulfilment per Moment created only on confirmed dispatch, no persisted draft, three statuses, `Redelivery` the only Decision, `ProofReceived` after `Delivered` only and changing no status. Proof is metadata — no file, URL, data URI, base64 or blob — refused on the payload **and** on the Event itself, and proven absent from storage. Current state is checked against a replay of each fulfilment's own Events. A pre-v6 Moment is refused at dispatch with a recovery that does not promise a re-preparation the idempotency rules cannot perform. New suite `validate:fulfilments` (50); **504 checks across twelve suites**; typecheck clean; lint 47 (26 errors, 21 warnings); build 30 routes. **No browser verification was performed**; real-device testing remains outstanding. H3.7 has not begun and is gated on CP-U3 / OPS-U3 and CP-U4.*
*Updated after the H3.6 → H3.7 commercial governance closure (2026-07-30) — **documentation only; no code, schema, migration, validation, route or UI changed.** [ADR-013](adr/ADR-013-commercial-role-pilot-currency-and-recognition-order.md) created and accepted, closing **CP-U3 / OPS-U3** (`commercialRole = MerchantOfRecord`, a platform and pilot posture rather than a legal opinion) and **CP-U4** (**NGN** for every amount on a pilot `RecognitionOrder`). FX stays out of H3.7 entirely; `estimatedCustomerCharge` is a **manual per-order quotation** with no formula, percentage, rate card or pricing engine and no payment or cash assumption; ADR-007's `estimatedItemCost` is superseded for H3.7 by `estimatedVendorCost` from the confirmed `VendorSelection` quote; `grossMargin` stays derived on read and never stored. Vendor commission, sender service fee, corporate subscription, payment margin, featured placement and percentage pricing are preserved historically but **deferred and non-authoritative**. First pilot is one corporate organization with **Lagos fulfilment, city-first**; **Nigeria → Cameroon remains the first cross-border corridor, sequenced after it and not abandoned**. Current-state drift corrected across the ADR registry, both Atlases and the roadmap basis footer; dated historical entries left intact. Baselines unchanged and **not rerun** — 504 checks across twelve suites, lint 47 (26 errors, 21 warnings), build 30 routes. Workspace **v7**, `OperationsState` **v7**, **24 of 37**, H3 **6 of 8**. **H3.7 is unblocked by governance and has not begun.***
*Updated after H3.7 (Recognition Order and commercial tracking) — `OperationsState` **v8** (additive `recognitionOrders`; invents no order for any Moment or already-dispatched Fulfilment; a v1 payload still walks every rung). Workspace unchanged at **v7**. ADR-013 implemented as accepted: one order per Moment, `Committed` → `Reconciled`, **no draft and no cancellation**; `commercialRole` immutable and **only `MerchantOfRecord` writable**; **every amount NGN**, refused rather than converted, with no FX anywhere; **the customer quotation typed by an operator and never prefilled or derived**; estimates from the confirmed vendor and courier quotes rather than the catalog price; **`grossMargin` derived on read and never stored**, so correcting a cost changes it with **no second write**; corrections **supersede** the live reconciliation without rewriting it. **A committed order is required before a new initial dispatch**; legacy Fulfilments keep their history and are never backfilled. New suite `validate:orders` (47); **551 checks across thirteen suites**; typecheck clean; lint 47 (26 errors, 21 warnings); build 32 routes. **Verified live in a browser** at measured widths of 1440px, 768px and a browser-clamped 500px, including a v5 → v8 migration on first write, zero-write cancellation, single-write confirmations and margin following two corrections; real-device testing remains outstanding. Milestone count **25 of 37**; H3 **7 of 8**. **H3.8 has not begun.***
*Updated after the H3.7 → H3.8 confirmation-and-memory governance closure (2026-07-31) — **documentation only; no code, schema, migration, validation, route or UI changed.** [ADR-014](adr/ADR-014-moment-closure-memory-and-safe-timeline.md) created and accepted, governing H3.8: **Confirmation** means an operator confirming a delivered, reconciled recognition is complete, distinct from `Delivered`, `ProofReceived` and RecognitionOrder reconciliation, with **recipient acknowledgement unsupported and excluded** rather than ruled out permanently. The terminal Moment status is **`Closed`**, superseding the checkpoint's `Fulfilled`, entered only from `ReadyForExecution` and **irreversible**. **Domain ownership is explicit**: the Relationship Engine owns the Moment's current state, Knowledge owns Memory and `MomentClosed`, Operations only orchestrates the atomic write, and `OperationsState` is the shared prototype persistence envelope rather than a domain boundary. The canonical **Memory** is re-issued as exactly eleven fields, superseding the Atlas §4 draft in full; the safe recipient timeline is a **nine-field exact-key whitelist projection**, with gift category required and resolved through the RecognitionOrder's immutable `itemSelectionDecisionId`. **Three separate prohibition boundaries** govern persisted Memory, the `MomentClosed` Event payload and the projection. Closure appends one `MomentClosed` Event and **records no Decision** — ADR-006's own judgement test, already applied by ADR-012 to dispatch and delivery. The later implementation adds `OperationsState` **v8 → v9** (additive `memories: []`, no backfill); the checkpoint's *"envelope consumption final"* is recorded as unsupported by the current architecture. **The starting commit for this closure was `e7a34b2e27172700b3a0a1631d3c1c02ae626428`, and the resulting commit becomes H3.8's required starting commit.** Baselines unchanged and **not rerun** — 551 checks across thirteen suites, lint 47 (26 errors, 21 warnings), build 32 routes. Milestone count stays **25 of 37**; H3 stays **7 of 8**; `OperationsState` stays **v8**; Workspace stays **v7**. **H3.8 is architecture-governed and has not begun.** System Atlas v3.15, Master Roadmap v2.3, Relationship Operations Atlas v2.3.*
