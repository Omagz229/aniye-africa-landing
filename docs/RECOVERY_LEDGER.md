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
| — | **Architecture-correction checkpoint** | ⬅️ **Next — mandatory before Programs** | — |
| 4 | Relationship Operations Atlas | ⬜ Not started | — |
| 5 | ADR-003 — Decision Engine | ⬜ Not started | — |
| 6 | H3.1 — Moment Engine | ⬜ Not started | — |
| 7 | H3.2 — Execution Brief | ⬜ Not started | — |
| 8 | H3.3 — Catalog Intelligence | ⬜ Not started | — |
| 9 | H3.4 — Gift Intelligence | ⬜ Not started | — |
| 10 | H3.5 — Vendor Intelligence | ⬜ Not started | — |

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

### ⚠️ Gate before Operations reconstruction

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
| 4 | **Relationship Operations Atlas** | No such file in `docs/`. Only `ANIYE_SYSTEM_ATLAS.md` exists. |
| 5 | **ADR-003** — Decision Engine | Not present in Atlas §18. No decision-engine module anywhere in `lib/`. |
| 6 | **H3.1** — Moment Engine | No `Moment` type in code (Atlas §4 defines it). No moment generation or scheduling logic. |
| 7 | **H3.2** — Execution Brief | No such concept in code or in the Atlas. |
| 8 | **H3.3** — Catalog Intelligence | Atlas §9 describes Intent → Category → Collection → Item. No catalog code exists. |
| 9 | **H3.4** — Gift Intelligence | `GIFT_CATEGORIES` exists as a flat string list only (`lib/workspace.ts:47`). No intent hierarchy, no recommendation logic. |
| 10 | **H3.5** — Vendor Intelligence | No vendor types, routes, or logic. The `h3.5-vendor-intelligence` tag is a false marker (see §1). |

**Nothing after H2.3 survived.** Items 1–3 were reconstructed in R1, R2, and R3 (see §0), completing the H2 Configure arc. Items 4–10 remain outstanding, and are gated behind the architecture-correction checkpoint.

---

## 5. Existing Routes

From `npm run build` output — 12 routes total:

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
| `/sitemap.xml` | Static | H1 | `app/sitemap.ts` |
| `/_not-found` | Static | — | framework |

### Routes referenced but not implemented

Declared in `lib/workspace.ts` `SETUP_STAGES` with `available: false`:

- `/workspace/programs` — required by H3, and **intentionally unimplemented**. The sidebar entry
  carries an explicit `built: false` flag so it stays visible as the next unavailable stage and
  cannot be linked to even once `setupStage` reaches `programs`.

~~No route exists for **Policy Assignments** (H2.4).~~ Added in R2.
~~`/workspace/people` — required by H2.5.~~ Added in R3.

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
| `aniye_workspace` | `lib/migrations.ts` (`WORKSPACE_KEY`) | Single serialized `WorkspaceState`, now carrying `schemaVersion` (currently **v4**) |
| `aniye_last_submission` | `app/components/assessment/AssessmentWizard.tsx:35` | Assessment answers, written **once at submit** (H1, pre-workspace). *Corrected during the Experience Audit — this ledger and Atlas §2 both previously recorded the key as `aniye_assessment`, which the code has never used (EX-L7).* |
| `aniye_workspace_backup_v<n>_<ts>` | **R1:** `lib/migrations.ts` | Verbatim pre-migration payload, written before a destructive migration only |
| `aniye_workspace_quarantine` | **R1:** `lib/migrations.ts` | Unreadable payload set aside so it cannot be overwritten. Written at most once |
| `aniye_person_draft` | **R3a:** `PersonForm.tsx` | An unfinished new person, so the flow can be resumed. Never workspace data; cleared on save or cancel; not written for edits |

**E1 added no storage keys.** `/verify` now writes `aniye_workspace` only when no workspace exists.

### Storage model

- **One blob, one key.** Policies and classes are nested arrays inside `WorkspaceState`,
  not separate collections. There is no index, no per-object key.
- Workspace is seeded in `app/components/verify/VerifyGate.tsx:34-52` at the moment
  the user passes the verify gate.
- Read/write surface is four functions: `getWorkspace`, `saveWorkspace`,
  `updateWorkspace`, plus stage helpers.

### Schema/version gaps

| # | Gap | Impact on reconstruction |
|---|-----|-------------------------|
| S1 | ~~**No `schemaVersion` field** on `WorkspaceState`.~~ | **✅ Resolved in R1.** `schemaVersion` is stamped on every write; `createWorkspace()` is the single construction point. |
| S2 | ~~**Migrations are ad-hoc presence checks** — "if field missing, seed it."~~ | **✅ Resolved in R1.** `lib/migrations.ts` provides an ordered, idempotent, validated migration chain with backup and safe failure. |
| S3 | **Money stored as face value**, not smallest currency unit. Deviation is documented in-code at `lib/workspace.ts:37-39` but contradicts Atlas §4 Money. | Must be reconciled before any budget arithmetic in the Decision Engine (ADR-003). |
| S4 | **No `workspaceId` on `RelationshipClass`**, though `RecognitionPolicy` has one and Atlas §4 requires it on both. | Inconsistent ownership model; breaks once multi-workspace arrives. |
| S5 | `WorkspaceState` carries `organizationId` only — Organization, Workspace, and Organization Profile are collapsed into one flat record. Atlas §4 defines three distinct objects. | Acceptable for H2/H3 local-storage phase, but must be recorded as intentional debt. |
| S6 | No collection for ~~`policyAssignments`, `people`, `peopleSources`,~~ `programs`, or `moments`. | **Resolved for the H2 collections.** `policyAssignments` landed as v3 (R2); `people` and `peopleSources` as v4 (R3), the latter a purely additive bump requiring no backup. `programs` and `moments` are gated behind the architecture-correction checkpoint, since where they live is one of the open questions. |

---

## 8. Conflicting or Outdated Architecture Found

These are live contradictions between the surviving code and the surviving Atlas.
They must be resolved deliberately during reconstruction, not silently overwritten.

| # | Conflict | Code | Atlas | Resolution |
|---|----------|------|-------|-----------|
| C1 | ~~**Relationship Class taxonomy** — the central conflict.~~ | ~~`category` + `tier`~~ | ~~§4: single `tier` enum~~ | **✅ Resolved in R1.** ADR-002 supersedes both. Code and Atlas §4/§10 now agree on `type` + numeric `level`. |
| C2 | **Class lifecycle fields** — still open | `isDefault: boolean`, `isActive: boolean` | §4: `isCustom: boolean`, `status: Draft \| Active \| Archived` | Atlas is authoritative; `isActive` cannot express Draft, and Atlas §10 requires archive-not-delete. Deliberately **out of ADR-002 scope** — it is a lifecycle change, not a taxonomy one. Atlas §4 now carries an implementation note pointing here. |
| C3 | ~~**`memberCount` missing**~~ | — | — | **✅ Resolved in R3** — by deriving rather than storing. `lib/people.ts` computes active/total counts per class, unassigned people, and invalid class references on read. Atlas §4 and §10 updated to say `memberCount` is derived, never persisted. |
| C4 | **Policy lifecycle truncated** — still open, deliberately | `PolicyStatus = Draft \| Published \| Archived` | §4 and §11: `Draft → Preview → Approved → Published → Archived`, with approver ID + timestamp recorded at Approve | Code is missing the `Preview` and `Approved` states and the approval audit fields. **Held out of H2.4 by instruction.** H2.4 treats `Published` as the sole executable status, which is forward-compatible: when `Approved` and `Preview` arrive, only `EXECUTABLE_POLICY_STATUS` in `lib/migrations.ts` and the assignability gate need revisiting. Recorded here as the remaining Atlas mismatch. |
| C5 | **Default class seed list incomplete** — still open | 11 classes in `DEFAULT_RELATIONSHIP_CLASSES` | §10 previously listed 16 standard classes | Out of ADR-002 scope. R1 aligned Atlas §10 to the 11 classes the code actually seeds, so the two no longer contradict each other; whether to seed more (Strategic Partners, Government, Media, Community) and whether `Staff` should be named `Employees` remain open product questions. |
| C6 | **Money unit** — still open, now load-bearing | Face value (`500000` = NGN 500,000) | §4: smallest currency unit (kobo/cents) | Documented deviation. Explicitly held out of R3 by instruction. **This is now the most consequential open conflict:** it is item 4 of the architecture-correction checkpoint and must be settled before the Decision Engine does any budget arithmetic. Floating-point face values will not survive contact with multi-currency spend. |
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
| P7 | **`Person.status` is `Active \| Archived`**, where Atlas §4 previously also listed `Inactive`. | `Inactive` and `Archived` expressed the same thing. Atlas §4 updated to two states rather than the code carrying a distinction with no meaning. | Resolved in the Atlas; noted for audit. |
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
> The tables below list the remaining work.

### Will be modified

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

### Will be created

| Path | Milestone |
|------|-----------|
| `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` | Relationship Operations Atlas |
| `lib/migrations.ts` (or equivalent) | Schema versioning — prerequisite for ADR-002 |
| `app/workspace/assignments/page.tsx` + components | H2.4 |
| `app/workspace/people/page.tsx` + components | H2.5 |
| `app/workspace/people/sources/…` | H2.5 |
| `lib/decision-engine.ts` | ADR-003 |
| `lib/moments.ts` + `app/workspace/moments/…` | H3.1 |
| `lib/execution-brief.ts` + brief route/components | H3.2 |
| `lib/catalog.ts` | H3.3 |
| `lib/gift-intelligence.ts` | H3.4 |
| `lib/vendors.ts` | H3.5 |

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
| — | ⛔ **Architecture-correction checkpoint** — *required before Operations* | 3 | Program definition; Workspace vs Operations boundary; Decision vs Operational Event; minimum financial and Money model (C6). Steps 4–10 below are gated behind this. |
| 4 | **Relationship Operations Atlas** | 1, 2, 3 | Documents the operating model once Class → Assignment → Policy → Person is whole. Specification input for ADR-003. |
| 5 | **ADR-003** — Decision Engine | 4 | Resolves "which policy applies to this person for this moment type in this country" — requires assignments, people, and scope precedence to all exist. Settle C6 (Money unit) here. |
| 6 | **H3.1** — Moment Engine | 5 | Generates Moments by running the Decision Engine over People × Policies. |
| 7 | **H3.2** — Execution Brief | 6 | Renders a Moment into an actionable brief. |
| 8 | **H3.3** — Catalog Intelligence | 7 | Supplies the item universe the brief selects from. |
| 9 | **H3.4** — Gift Intelligence | 8 | Intent → Category → Collection → Item on top of the catalog. Replaces the flat `GIFT_CATEGORIES`. |
| 10 | **H3.5** — Vendor Intelligence | 9 | Routes chosen gifts to vendors. Re-point the `h3.5-vendor-intelligence` tag (C9) once genuinely reached. |

### Next action

**Two gates, in order — neither is a reconstruction milestone.**

**The Experience Audit and Experience Correction E1 are both complete.** Programs is unblocked from an experience perspective — zero Critical findings and zero Programs-gating findings remain.

**The architecture-correction checkpoint is now the only remaining gate before Programs.**

Steps 0–3 have landed and the H2 Configure arc is complete: an organization can now define who
matters (classes), how they are recognized (policies), which rules reach which group (assignments),
and who the actual people are. Every link in the Atlas §11 chain up to Program exists.

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
