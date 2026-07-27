# Aniyé Africa — Recovery Ledger

> Recovery audit performed 2026-07-27 after loss of the previous development machine.
> This document records the surviving state of the repository, what is confirmed missing,
> and the reconstruction sequence.

---

## 0. Reconstruction Status

| Step | Milestone | Status | Landed in |
|------|-----------|--------|-----------|
| 0 | Schema versioning foundation | ✅ **Reconstructed** | R1 |
| 1 | **ADR-002** — Relationship Type + numeric Relationship Level | ✅ **Reconstructed** | R1 |
| 2 | **H2.4** — Policy Assignments | ⛔ Blocked → now unblocked, see below | — |
| 3 | H2.5 — People Sources and People | ⬜ Not started | — |
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
| 2 | **H2.4** — Policy Assignments | `PolicyAssignment` is specified in Atlas §4 and §11 but has **no TypeScript type, no route, no component**. `WorkspaceState` has no `policyAssignments` field. |
| 3 | **H2.5** — People Sources and People | `Person` specified in Atlas §4, `PeopleSource` in Atlas §12. No types, no `/workspace/people` route. `SETUP_STAGES` marks `people` as `available: false`. |
| 4 | **Relationship Operations Atlas** | No such file in `docs/`. Only `ANIYE_SYSTEM_ATLAS.md` exists. |
| 5 | **ADR-003** — Decision Engine | Not present in Atlas §18. No decision-engine module anywhere in `lib/`. |
| 6 | **H3.1** — Moment Engine | No `Moment` type in code (Atlas §4 defines it). No moment generation or scheduling logic. |
| 7 | **H3.2** — Execution Brief | No such concept in code or in the Atlas. |
| 8 | **H3.3** — Catalog Intelligence | Atlas §9 describes Intent → Category → Collection → Item. No catalog code exists. |
| 9 | **H3.4** — Gift Intelligence | `GIFT_CATEGORIES` exists as a flat string list only (`lib/workspace.ts:47`). No intent hierarchy, no recommendation logic. |
| 10 | **H3.5** — Vendor Intelligence | No vendor types, routes, or logic. The `h3.5-vendor-intelligence` tag is a false marker (see §1). |

**Nothing after H2.3 survived.** Items 2–10 remain outstanding; item 1 was reconstructed in R1 (see §0).

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
| `/sitemap.xml` | Static | H1 | `app/sitemap.ts` |
| `/_not-found` | Static | — | framework |

### Routes referenced but not implemented

Declared in `lib/workspace.ts` `SETUP_STAGES` with `available: false`:

- `/workspace/people` — required by H2.5
- `/workspace/programs` — required by H3

No route exists for **Policy Assignments** (H2.4) — the setup checklist has no stage for it at all.

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
distinct object), `Relationship Profile` (§4), `Person` (§4), **`Policy Assignment` (§4, §11)**,
`Program` (§4), `Moment` (§4), `Gift / Item` (§4), `Fulfillment` (§4), `Memory` (§4), `Insight` (§4),
`PeopleSource` (§12).

---

## 7. Current Persistence / Schema

### localStorage keys in use

| Key | Written by | Shape |
|-----|-----------|-------|
| `aniye_workspace` | `lib/migrations.ts` (`WORKSPACE_KEY`) | Single serialized `WorkspaceState`, now carrying `schemaVersion` |
| `aniye_assessment` | `app/components/assessment/AssessmentWizard.tsx:34` | Assessment answers (H1, pre-workspace) |
| `aniye_workspace_backup_v<n>_<ts>` | **R1:** `lib/migrations.ts` | Verbatim pre-migration payload, written before a destructive migration only |
| `aniye_workspace_quarantine` | **R1:** `lib/migrations.ts` | Unreadable payload set aside so it cannot be overwritten. Written at most once |

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
| S6 | No collection for `policyAssignments`, `people`, `peopleSources`, `programs`, or `moments`. | Each missing milestone needs both a type and a `WorkspaceState` field plus migration. Adding one is now a routine schema bump (v2 → v3 …) rather than a bespoke presence check. |

---

## 8. Conflicting or Outdated Architecture Found

These are live contradictions between the surviving code and the surviving Atlas.
They must be resolved deliberately during reconstruction, not silently overwritten.

| # | Conflict | Code | Atlas | Resolution |
|---|----------|------|-------|-----------|
| C1 | ~~**Relationship Class taxonomy** — the central conflict.~~ | ~~`category` + `tier`~~ | ~~§4: single `tier` enum~~ | **✅ Resolved in R1.** ADR-002 supersedes both. Code and Atlas §4/§10 now agree on `type` + numeric `level`. |
| C2 | **Class lifecycle fields** — still open | `isDefault: boolean`, `isActive: boolean` | §4: `isCustom: boolean`, `status: Draft \| Active \| Archived` | Atlas is authoritative; `isActive` cannot express Draft, and Atlas §10 requires archive-not-delete. Deliberately **out of ADR-002 scope** — it is a lifecycle change, not a taxonomy one. Atlas §4 now carries an implementation note pointing here. |
| C3 | **`memberCount` missing** | Not present on `RelationshipClass` | §4: `memberCount` computed from Person records | Deferred until H2.5 lands `Person`. |
| C4 | **Policy lifecycle truncated** | `PolicyStatus = Draft \| Published \| Archived` | §4 and §11: `Draft → Preview → Approved → Published → Archived`, with approver ID + timestamp recorded at Approve | Code is missing two states and the approval audit fields. |
| C5 | **Default class seed list incomplete** — still open | 11 classes in `DEFAULT_RELATIONSHIP_CLASSES` | §10 previously listed 16 standard classes | Out of ADR-002 scope. R1 aligned Atlas §10 to the 11 classes the code actually seeds, so the two no longer contradict each other; whether to seed more (Strategic Partners, Government, Media, Community) and whether `Staff` should be named `Employees` remain open product questions. |
| C6 | **Money unit** | Face value (`500000` = NGN 500,000) | §4: smallest currency unit (kobo/cents) | Documented deviation. Must be settled before Decision Engine arithmetic. |
| C7 | **No Policy Assignment layer** | Policies exist but nothing links a class to a policy | §11 canonical flow: Class → Policy Assignment → Policy → Program → Moment → Fulfillment | The chain is broken at its second link. Blocks all of H3. |
| C8 | **Setup checklist has no assignments stage** | `SETUP_STAGES` = profile → classes → policies → people → programs | §11 flow requires assignment between policies and people | H2.4 must insert a stage. |
| C9 | **Misleading git tag** — still open | `h3.5-vendor-intelligence` → `b639349` (the H2.3 commit) | — | Delete or re-point the tag; do not treat it as milestone evidence. Left in place in R1 because deleting a pushed tag is a remote-history change worth doing deliberately. |
| C10 | ~~**No `typecheck` npm script**~~ | — | — | **✅ Resolved in R1.** `typecheck` and `validate:migration` scripts added. |

---

## 9. Files Requiring Reconstruction

> **R1 landed:** `lib/migrations.ts` (new), `lib/workspace.ts`, `app/components/workspace/RelationshipClassesPage.tsx`,
> `app/components/verify/VerifyGate.tsx`, `scripts/validate-schema-migration.mts` (new), `package.json`,
> `tsconfig.json`, `docs/ANIYE_SYSTEM_ATLAS.md`, `docs/RECOVERY_LEDGER.md`.
> `SetupChecklist.tsx` and `WorkspaceSidebar.tsx` needed no change for ADR-002 — neither reads the
> class taxonomy. The policy components (`PolicyForm`, `PolicyDetail`, `PolicyLibrary`) were likewise
> untouched: their "category" references are *gift* categories, unrelated to Relationship Class.
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
| 2 | ⬅️ **H2.4** — Policy Assignments — *next* | 1 | Restores the broken link in the Atlas §11 canonical flow (C7). Needed the final class shape from ADR-002, which now exists. Also resolves C8. |
| 3 | **H2.5** — People Sources and People | 1, 2 | `Person.relationshipClassIds` needs the ADR-002 class shape. Unblocks `memberCount` (C3). Moments cannot exist without people. |
| 4 | **Relationship Operations Atlas** | 1, 2, 3 | Documents the operating model once Class → Assignment → Policy → Person is whole. Specification input for ADR-003. |
| 5 | **ADR-003** — Decision Engine | 4 | Resolves "which policy applies to this person for this moment type in this country" — requires assignments, people, and scope precedence to all exist. Settle C6 (Money unit) here. |
| 6 | **H3.1** — Moment Engine | 5 | Generates Moments by running the Decision Engine over People × Policies. |
| 7 | **H3.2** — Execution Brief | 6 | Renders a Moment into an actionable brief. |
| 8 | **H3.3** — Catalog Intelligence | 7 | Supplies the item universe the brief selects from. |
| 9 | **H3.4** — Gift Intelligence | 8 | Intent → Category → Collection → Item on top of the catalog. Replaces the flat `GIFT_CATEGORIES`. |
| 10 | **H3.5** — Vendor Intelligence | 9 | Routes chosen gifts to vendors. Re-point the `h3.5-vendor-intelligence` tag (C9) once genuinely reached. |

### Next reconstruction task

**Step 2 — H2.4, Policy Assignments.**

Steps 0 and 1 landed in R1. H2.4 was gated on migration validation passing; it does (18/18), so the
gate is clear. H2.4 restores the second link in the Atlas §11 canonical flow
(Class → **Policy Assignment** → Policy → Program → Moment), which is currently broken and blocks
every Horizon 3 milestone. It needed the final Relationship Class shape, which ADR-002 now fixes.

Expected shape of the work: a `PolicyAssignment` type and a `policyAssignments` collection on
`WorkspaceState` (schema **v2 → v3**, a routine additive migration on the R1 foundation), an
assignments stage in `SETUP_STAGES` (C8), and a `/workspace/assignments` route.

---

## 11. Recovery Branch

All reconstruction work is performed on **`recovery/h3-reconstruction`**.
`main` is not modified directly. The branch currently tracks `origin/recovery/h3-reconstruction`.

---

*Recovery Ledger — Aniyé Africa — 27 July 2026*
*Audit basis: commit `b639349`, System Atlas v2.2.*
*Updated after R1 (schema versioning + ADR-002) — System Atlas v2.3.*
