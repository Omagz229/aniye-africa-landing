# Aniyé Friction Register

> Companion to [`ANIYE_EXPERIENCE_AUDIT.md`](ANIYE_EXPERIENCE_AUDIT.md). Audited at commit `1b1025e`.
> Every entry is tied to a real route or component. No generic design advice.

**Status values:** `Open` · `Deferred` (accepted, not before pilot) · `Fixed` · `Won't fix`
**Effort:** XS < 1h · S 1–3h · M half-day to a day · L multi-day
**Blocks Programs:** whether the Programs milestone should not begin until this is corrected.

| Total | Critical | High | Medium | Low |
|-------|----------|------|--------|-----|
| **28** | 2 | 8 | 11 | 7 |

---

## Critical

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Blocks Programs | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|-----------------|------------|--------|
| **EX-C1** | Returning admin | `/verify` · `VerifyGate.tsx` | `handleContinue` called `createWorkspace` then `saveWorkspace` unconditionally. Re-opening an old verify link destroyed all groups, rules, assignments and people. No confirmation, no backup, unrecoverable | **Done.** Decision moved into `lib/verification.ts` — pure, storage injected. `/verify` now reads before writing: an existing workspace is *always* continued, never replaced. Replacement is not implemented at all. The gate shows what is already there and resumes at the correct step | S | Yes | None | **Fixed (E1)** |
| **EX-C2** | Mobile-only user | All `/workspace/*` · shell | `ml-60` content, `fixed w-60` sidebar, `left-60` header, no breakpoints. Content column ≈135px at 375px. Every setup route unusable on a phone | **Done.** Sidebar is an off-canvas drawer below `lg` (`-translate-x-full` → `translate-x-0`, `lg:translate-x-0`); content offset is `lg:ml-60`; header is `left-0 lg:left-60` with a menu trigger. Scrim blocks background interaction, Escape and route change close it, body scroll locks | M | Yes | None | **Fixed (E1)** |

---

## High

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Blocks Programs | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|-----------------|------------|--------|
| **EX-H1** | First-time admin | `/assessment` · `AssessmentWizard.tsx:22` | ~15 fields over 4 steps held only in `useState`. Refresh, browser-back or tab close loses everything. `localStorage` is written once, at submit. The longest unsaved form in the product is the first thing a stranger fills in | Autosave to `aniye_assessment_draft` on change; offer resume on return, mirroring `aniye_person_draft` | S | No | Pattern exists in `PersonForm` | **Fixed** — autosaved to `aniye_assessment_draft` and offered back on return. Read via `useSyncExternalStore` so the server and first client render agree. Verified 2026-07-29 |
| **EX-H2** | Any admin | `/workspace/policies/new` | `PolicyForm` renders Cancel only when `onCancel` is passed (`PolicyForm.tsx:439`); the route renders `<PolicyForm />` with no props. Only escape is the sidebar — which is invisible on mobile (EX-C2) | **Done.** `PolicyForm` now derives `leave = onCancel ?? (() => router.push('/workspace/policies'))`. A persistent "← Back to recognition rules" link sits above the heading, and Cancel always renders | XS | Yes | None | **Fixed (E1)** |
| **EX-H3** | Admin configuring policies | `PolicyForm.tsx` | 463 lines, six sections, ~14 fields plus nine moment-type rows, all expanded at once. Highest cognitive load in the product, at the step users understand least. Directly contradicts Doctrine §1.5 while `PersonForm` beside it complies | Restructure into guided steps, mirroring `PersonForm`. **E1 did not do this** — explicitly out of scope. E1 only made the occasion rows wrap on mobile and renamed the sections into plain language | M | No | Pattern exists in `PersonForm` | **Fixed** — rebuilt as four guided steps (name → occasions → delivery → review), mirroring `PersonForm`. Gift preferences behind progressive disclosure. Verified in create and edit modes 2026-07-29 |
| **EX-H4** | Any admin | `WorkspaceHeader.tsx:11-18` | `PAGE_TITLES` has no entry for `/workspace/assignments`, `/workspace/policies/new`, `/workspace/policies/[id]`. Three of eight routes show the header title "Workspace", losing orientation | **Done.** `PAGE_TITLES` is now a longest-match prefix list covering every route, plus a regex branch for `/workspace/policies/<id>`. Titles use plain language | XS | Yes | None | **Fixed (E1)** |
| **EX-H5** | Admin configuring policies | `/workspace/policies` · `PolicyLibrary.tsx` | Four gold primary buttons on one page (New Policy, empty-state create, continue-to-assignments, plus per-card actions). No single next action at the heaviest step | **Done.** One primary chosen from state: "Create your first rule" when empty → "Finish and publish {draft}" when nothing is published → "Continue to who each rule applies to" when one is → "New rule" otherwise. Everything else is text-weight | S | No | None | **Fixed (E1)** |
| **EX-H6** | Returning admin | All setup routes | `SetupProgress` renders only inside `PeopleDirectory`; `SetupChecklist` only on `/workspace`. Inside any other step there is no sense of position in the sequence | **Done.** `SetupProgress` renders on all five setup routes. Rewritten to derive entirely from `SETUP_STAGES` + `setupStage` — no duplicated progress state — and shows Programs honestly as "Not yet" | S | Yes | Component exists | **Fixed (E1)** |
| **EX-H7** | Any admin | `/workspace/classes` · `RelationshipClassesPage.tsx:71-78` | Deactivating a class is one unconfirmed toggle and silently stops policy resolution for everyone in it. Deleting a custom class is one unconfirmed `×` and leaves dangling references on Person records | **Done.** Both confirmed via the shared `ConfirmDialog`, with impact: people currently in the group, assignments pointing at it, and reversibility. Buttons are "Keep group active / Turn off group" and "Keep group / Delete group". Re-activating stays one click — it is harmless | S | No | `ConfirmDialog` extracted | **Fixed (E1)** |
| **EX-H8** | Any admin | `/workspace/assignments` · `PolicyAssignmentsPage.tsx` | Assignment removal is a single unconfirmed `×`, sitting beside a reversible Deactivate with equal visual ease. Removing the wrong one silently changes which policy governs a class | **Done.** Removal and deactivation both confirmed, with impact naming the group, the rule, the scope, and whether that assignment is the one currently in effect. Buttons are "Keep assignment / Remove assignment" | S | No | Same `ConfirmDialog` | **Fixed (E1)** |

---

## Medium

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|------------|--------|
| **EX-M1** | Admin unfamiliar with Aniyé | `/workspace/classes`, `/workspace/policies`, `/workspace/assignments` | Page titles use internal vocabulary — "Relationship Classes", "Policy Library", "Policy Assignments" — with no plain-language gloss. People does this well; nothing else does | **Largely done in E1** as a side effect of the EX-H4 language work: Relationship Classes → *Relationship groups*, Policy Library → *Recognition rules*, Policy Assignments → *Who each rule applies to*, each with a supporting sentence. Remaining: a few in-page labels | S | None | **Mostly fixed (E1)** |
| **EX-M2** | Returning admin | Four route guards | `classes`, `policies`, `assignments`, `people` each write bespoke blocked-state copy — four voices for one concept | Extract one `BlockedStep` component taking heading, body and target | S | None | Open |
| **EX-M3** | Any admin | `/workspace/classes`, `/workspace/assignments` | Confirming navigates away with no acknowledgement of what was accomplished. Only People shows a structured outcome | Reuse the People outcome-panel pattern on confirm | S | None | Open |
| **EX-M4** | First-time admin | `OrgProfileForm.tsx:155-161` | `operatingCountries` is stored as `string[]` but edited as a comma-joined string, re-split on save. The assessment already parsed it once — the data round-trips through a lossy format | Edit as chips/tags, or keep the string form but stop re-parsing what is already structured | S | None | Open |
| **EX-M5** | Admin configuring policies | `PolicyForm.tsx` | A half-written policy is lost on navigation. Inconsistent with `PersonForm`, and the policy form is considerably longer | Autosave a policy draft, matching `aniye_person_draft` | S | EX-H3 | **Fixed** — new rules autosave to `aniye_policy_draft` and are offered back; edits are never autosaved. Landed with EX-H3. Verified 2026-07-29 |
| **EX-M6** | First-time admin | `/verify` · `VerifyGate.tsx` | Copy reads "In production, a verification link would be sent to…" — the interface describes a feature that does not exist, in front of the user | Either implement verification or remove the sentence. Do not narrate absent features to customers | XS | Product decision | Open |
| **EX-M7** | Mobile-only user | `/workspace/people` · `PeopleDirectory.tsx` | The page stacks primary action, outcome panel, filters, list, coverage grid and setup progress. A long scroll on a phone even once EX-C2 is fixed | Partly addressed: `SetupProgress` is now last on the page. Coverage is still always expanded | S | EX-C2 | Open |
| **EX-M8** | Any admin | `PolicyLibrary.tsx`, `PeopleImport.tsx` | Tables rely on `overflow-x-auto`. Horizontal scrolling inside a page violates Doctrine §2.8, acceptable only as a fallback | Card layouts below `lg`, as `PeopleDirectory` already does | S | EX-C2 | **Fixed** — both named components were rebuilt without tables, so the `overflow-x-auto` this described no longer exists. `PeopleDirectory` was the cited good example and still renders cards below `lg`. Verified 2026-07-29 |
| **EX-M9** | Admin adding one person | `PersonForm.tsx` | Four steps for what is often two fields. A user adding a single new hire pays the full guided-flow cost | Allow Review from step 1 once required fields are valid — "Skip to review" | S | None | Deferred |
| **EX-M10** | User importing a large list | `PeopleImport.tsx` | Every row renders in the review step; a 2,000-row file with many failures produces an unusable wall. No way to export just the failed rows | Cap the rendered rows per bucket with "show all"; offer a failed-rows CSV download | M | None | Deferred |
| **EX-M11** | Screen-reader user | `AssessmentWizard`, `PersonForm`, `PeopleImport` | No focus management between steps. Focus is left on a removed button; the view change is not announced | Move focus to the step heading and add an `aria-live` region for step changes | S | None | Open |

---

## Low

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|------------|--------|
| **EX-L1** | Any admin | `WorkspaceHeader.tsx:44-52` | Notification bell is focusable, labelled "coming soon", and does nothing | **Done.** Now `disabled`, hidden below `sm`, and labelled "Notifications — not available yet" | XS | None | **Fixed (E1)** |
| **EX-L2** | Keyboard user | `PeopleDirectory.tsx` `ConfirmDialog` | Sets `role="dialog"` and `aria-modal` but does not trap focus or close on `Escape` | **Done.** The shared `ConfirmDialog` traps Tab, closes on Escape, focuses the non-destructive choice first, locks body scroll, and restores focus on close | S | EX-H7 | **Fixed (E1)** |
| **EX-L3** | Screen-reader user | `RelationshipClassesPage.tsx` desktop branch | The remove `×` has no `aria-label` in the desktop layout; the mobile branch has one | **Done.** `aria-label={`Remove ${cls.name}`}` added to the desktop branch | XS | None | **Fixed (E1)** |
| **EX-L4** | Mobile-only user | `PeopleDirectory.tsx` `ConfirmDialog` | Bottom-docked on small screens (correct) but no scroll containment if body text grows | Add `max-h` and internal scroll | XS | None | Deferred |
| **EX-L5** | Any visitor | `RelationshipSnapshot.tsx:161-171` | Uses raw `<a href>` rather than `<Link>` — full page reload on the snapshot → verify transition | Use `next/link` | XS | None | Open |
| **EX-L6** | Maintainer | `PeopleImport.tsx` step-1 stats | The fourth statistic is computed by a double subtraction that always resolves to the duplicate count. Output is correct, intent is unreadable | Replace with a direct count | XS | None | Open |
| **EX-L7** | Maintainer | `RECOVERY_LEDGER.md` §7, `ANIYE_SYSTEM_ATLAS.md` §2 | Both record the assessment storage key as `aniye_assessment`. The code writes **`aniye_last_submission`** (`AssessmentWizard.tsx:35`) | Correct both documents to match the implementation | XS | None | **Fixed** in this audit |

---

## Blocking Summary

| Question | Answer |
|----------|--------|
| Critical findings open | **0** — both fixed in E1 |
| High findings open | **3** — EX-H1, EX-H3, and EX-M-tier follow-ups |
| Findings marked *blocks Programs* | **0** — all five corrected in E1 |
| **Programs status (experience)** | **Unblocked** |

All five Programs-gating findings were corrected in Experience Correction E1. **From an experience perspective Programs is unblocked.**

Three findings remain open at High or near-High and should be corrected before any external pilot, but none changes the shape of what Programs is built on:

| ID | Why deferred |
|----|-------------|
| **EX-H1** — assessment autosave | Pre-workspace surface. Programs does not touch it |
| **EX-H3** — `PolicyForm` guided rebuild | Explicitly out of E1 scope. The form works and is now readable on mobile; restructuring it is a pre-pilot quality task |
| **EX-M5** — policy draft autosave | Depends on EX-H3 |

**The architecture-correction checkpoint remains mandatory before Programs**, independently of this register.

---

*Aniyé Friction Register — 27 July 2026 — audited at commit `1b1025e`.*
