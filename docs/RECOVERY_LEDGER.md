# Aniyé Africa — Recovery Ledger

> Recovery audit performed 2026-07-27 after loss of the previous development machine.
> This document records the surviving state of the repository, what is confirmed missing,
> and the proposed reconstruction sequence. **No missing milestones are implemented here.**

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
| 1 | **ADR-002** — Relationship Type + numeric Relationship Level | Atlas §18 stops at ADR-001. `lib/workspace.ts` still uses the two-axis `RelationshipCategory` + string `RelationshipTier` model. |
| 2 | **H2.4** — Policy Assignments | `PolicyAssignment` is specified in Atlas §4 and §11 but has **no TypeScript type, no route, no component**. `WorkspaceState` has no `policyAssignments` field. |
| 3 | **H2.5** — People Sources and People | `Person` specified in Atlas §4, `PeopleSource` in Atlas §12. No types, no `/workspace/people` route. `SETUP_STAGES` marks `people` as `available: false`. |
| 4 | **Relationship Operations Atlas** | No such file in `docs/`. Only `ANIYE_SYSTEM_ATLAS.md` exists. |
| 5 | **ADR-003** — Decision Engine | Not present in Atlas §18. No decision-engine module anywhere in `lib/`. |
| 6 | **H3.1** — Moment Engine | No `Moment` type in code (Atlas §4 defines it). No moment generation or scheduling logic. |
| 7 | **H3.2** — Execution Brief | No such concept in code or in the Atlas. |
| 8 | **H3.3** — Catalog Intelligence | Atlas §9 describes Intent → Category → Collection → Item. No catalog code exists. |
| 9 | **H3.4** — Gift Intelligence | `GIFT_CATEGORIES` exists as a flat string list only (`lib/workspace.ts:47`). No intent hierarchy, no recommendation logic. |
| 10 | **H3.5** — Vendor Intelligence | No vendor types, routes, or logic. The `h3.5-vendor-intelligence` tag is a false marker (see §1). |

**Nothing after H2.3 survived.**

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
| `RelationshipClass` | 6 | Two-axis model: `category` + `tier` |
| `RelationshipCategory` | 3 | `Internal \| Client \| Governance \| Partner \| Supplier \| Community \| Other` |
| `RelationshipTier` | 4 | `Strategic \| Priority \| Standard \| Custom` |
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
| `aniye_workspace` | `lib/workspace.ts:166` (`WORKSPACE_KEY`) | Single serialized `WorkspaceState` |
| `aniye_assessment` | `app/components/assessment/AssessmentWizard.tsx:34` | Assessment answers (H1, pre-workspace) |

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
| S1 | **No `schemaVersion` field** on `WorkspaceState`. | Migrations cannot be ordered or made idempotent. Every future migration must re-run presence checks forever. |
| S2 | **Migrations are ad-hoc presence checks** (`lib/workspace.ts:174-185`) — "if field missing, seed it." | Cannot express a *transform* migration, which ADR-002 requires (`category` + `tier` → `type` + numeric `level`). This is the blocking gap. |
| S3 | **Money stored as face value**, not smallest currency unit. Deviation is documented in-code at `lib/workspace.ts:37-39` but contradicts Atlas §4 Money. | Must be reconciled before any budget arithmetic in the Decision Engine (ADR-003). |
| S4 | **No `workspaceId` on `RelationshipClass`**, though `RecognitionPolicy` has one and Atlas §4 requires it on both. | Inconsistent ownership model; breaks once multi-workspace arrives. |
| S5 | `WorkspaceState` carries `organizationId` only — Organization, Workspace, and Organization Profile are collapsed into one flat record. Atlas §4 defines three distinct objects. | Acceptable for H2/H3 local-storage phase, but must be recorded as intentional debt. |
| S6 | No collection for `policyAssignments`, `people`, `peopleSources`, `programs`, or `moments`. | Each missing milestone needs both a type and a `WorkspaceState` field plus migration. |

---

## 8. Conflicting or Outdated Architecture Found

These are live contradictions between the surviving code and the surviving Atlas.
They must be resolved deliberately during reconstruction, not silently overwritten.

| # | Conflict | Code | Atlas | Resolution |
|---|----------|------|-------|-----------|
| C1 | **Relationship Class taxonomy** — the central conflict. | `category` (7 values: Internal/Client/Governance/Partner/Supplier/Community/Other) **plus** `tier` (4 values: Strategic/Priority/Standard/Custom) | §4: single `tier` enum = Internal / External / Governance / Ecosystem | Neither is correct going forward. **ADR-002** (Relationship Type + numeric Relationship Level) supersedes both. |
| C2 | **Class lifecycle fields** | `isDefault: boolean`, `isActive: boolean` | §4: `isCustom: boolean`, `status: Draft \| Active \| Archived` | Atlas is authoritative; `isActive` cannot express Draft, and Atlas §10 requires archive-not-delete. |
| C3 | **`memberCount` missing** | Not present on `RelationshipClass` | §4: `memberCount` computed from Person records | Deferred until H2.5 lands `Person`. |
| C4 | **Policy lifecycle truncated** | `PolicyStatus = Draft \| Published \| Archived` | §4 and §11: `Draft → Preview → Approved → Published → Archived`, with approver ID + timestamp recorded at Approve | Code is missing two states and the approval audit fields. |
| C5 | **Default class seed list incomplete** | 11 classes in `DEFAULT_RELATIONSHIP_CLASSES` | §10 lists 16 standard classes | Missing: Strategic Partners, Government, Media, Community. Also code names the class `Staff` where Atlas §10 says `Employees`. |
| C6 | **Money unit** | Face value (`500000` = NGN 500,000) | §4: smallest currency unit (kobo/cents) | Documented deviation. Must be settled before Decision Engine arithmetic. |
| C7 | **No Policy Assignment layer** | Policies exist but nothing links a class to a policy | §11 canonical flow: Class → Policy Assignment → Policy → Program → Moment → Fulfillment | The chain is broken at its second link. Blocks all of H3. |
| C8 | **Setup checklist has no assignments stage** | `SETUP_STAGES` = profile → classes → policies → people → programs | §11 flow requires assignment between policies and people | H2.4 must insert a stage. |
| C9 | **Misleading git tag** | `h3.5-vendor-intelligence` → `b639349` (the H2.3 commit) | — | Delete or re-point the tag; do not treat it as milestone evidence. |
| C10 | **No `typecheck` npm script** | `package.json` scripts: dev, build, start, lint | — | Add `"typecheck": "tsc --noEmit"`. |

---

## 9. Files Requiring Reconstruction

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
| 0 | **Schema versioning foundation** — add `schemaVersion` to `WorkspaceState` and a real ordered migration runner. Add `typecheck` script. | — | Gap S1/S2. ADR-002 is a *transform* migration; the current presence-check pattern cannot express it. Doing this after ADR-002 means migrating twice. |
| 1 | **ADR-002** — Relationship Type + numeric Relationship Level | 0 | Resolves C1 and C2. Changes the shape of `RelationshipClass`, which every downstream object references. Every later milestone reads classes; doing this first avoids reworking H2.4, H2.5, and H3.1 later. |
| 2 | **H2.4** — Policy Assignments | 1 | Restores the broken link in the Atlas §11 canonical flow (C7). Needs the final class shape from ADR-002. Also resolves C8. |
| 3 | **H2.5** — People Sources and People | 1, 2 | `Person.relationshipClassIds` needs the ADR-002 class shape. Unblocks `memberCount` (C3). Moments cannot exist without people. |
| 4 | **Relationship Operations Atlas** | 1, 2, 3 | Documents the operating model once Class → Assignment → Policy → Person is whole. Specification input for ADR-003. |
| 5 | **ADR-003** — Decision Engine | 4 | Resolves "which policy applies to this person for this moment type in this country" — requires assignments, people, and scope precedence to all exist. Settle C6 (Money unit) here. |
| 6 | **H3.1** — Moment Engine | 5 | Generates Moments by running the Decision Engine over People × Policies. |
| 7 | **H3.2** — Execution Brief | 6 | Renders a Moment into an actionable brief. |
| 8 | **H3.3** — Catalog Intelligence | 7 | Supplies the item universe the brief selects from. |
| 9 | **H3.4** — Gift Intelligence | 8 | Intent → Category → Collection → Item on top of the catalog. Replaces the flat `GIFT_CATEGORIES`. |
| 10 | **H3.5** — Vendor Intelligence | 9 | Routes chosen gifts to vendors. Re-point the `h3.5-vendor-intelligence` tag (C9) once genuinely reached. |

### Recommended first reconstruction task

**Step 0 + Step 1 together: schema versioning foundation, then ADR-002.**

Rationale: ADR-002 is not additive — it *replaces* the `category` + `tier` axes on
`RelationshipClass` with Relationship Type + a numeric Relationship Level. That is a destructive
transform on data already persisted under `aniye_workspace`. The current migration pattern
(`lib/workspace.ts:174-185`) can only seed missing fields; it cannot transform existing ones, and
with no `schemaVersion` it cannot tell a pre-ADR-002 workspace from a post-ADR-002 one. Landing the
version field and migration runner first makes ADR-002 safe and makes every subsequent milestone's
schema change routine.

Everything downstream — Policy Assignments, People, the Decision Engine, the Moment Engine — reads
the Relationship Class shape. Reconstructing them before ADR-002 guarantees rework.

---

## 11. Recovery Branch

All reconstruction work is performed on **`recovery/h3-reconstruction`**.
`main` is not modified directly. The branch currently tracks `origin/recovery/h3-reconstruction`.

---

*Recovery Ledger — Aniyé Africa — 27 July 2026*
*Audit basis: commit `b639349`, System Atlas v2.2.*
