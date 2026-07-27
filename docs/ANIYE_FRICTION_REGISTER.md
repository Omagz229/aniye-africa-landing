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
| **EX-C1** | Returning admin | `/verify` · `VerifyGate.tsx:34-52` | `handleContinue` calls `createWorkspace` then `saveWorkspace` unconditionally. `saveWorkspace` does a bare `setItem` (`lib/workspace.ts:504`). Re-opening an old verify link from email, bookmark or history destroys all classes, policies, assignments and people. No confirmation, no backup, unrecoverable | Check for an existing workspace before creating. If present, offer "Continue to your workspace" as the primary and "Start over" as a confirmed destructive secondary. Back up the existing payload via the existing `workspaceBackupKey` helper before any replacement | S | **Yes** | None | Open |
| **EX-C2** | Mobile-only user | All `/workspace/*` · `WorkspaceShell.tsx:41`, `WorkspaceSidebar.tsx:43`, `WorkspaceHeader.tsx:35` | `ml-60` content, `fixed w-60` sidebar, `left-60` header, no breakpoints anywhere. Content column ≈135px on a 375px viewport. Every setup route unusable on a phone; the responsive work inside People is unreachable | Sidebar becomes an off-canvas drawer below `lg` with a header toggle; `ml-60`/`left-60` move behind the `lg:` breakpoint | M | **Yes** | None | Open |

---

## High

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Blocks Programs | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|-----------------|------------|--------|
| **EX-H1** | First-time admin | `/assessment` · `AssessmentWizard.tsx:22` | ~15 fields over 4 steps held only in `useState`. Refresh, browser-back or tab close loses everything. `localStorage` is written once, at submit. The longest unsaved form in the product is the first thing a stranger fills in | Autosave to `aniye_assessment_draft` on change; offer resume on return, mirroring `aniye_person_draft` | S | No | Pattern exists in `PersonForm` | Open |
| **EX-H2** | Any admin | `/workspace/policies/new` | `PolicyForm` renders Cancel only when `onCancel` is passed (`PolicyForm.tsx:439`); the route renders `<PolicyForm />` with no props. Only escape is the sidebar — which is invisible on mobile (EX-C2) | Pass an `onCancel` that routes back to `/workspace/policies`, or render a persistent back link | XS | **Yes** | None | Open |
| **EX-H3** | Admin configuring policies | `PolicyForm.tsx` | 463 lines, six sections, ~14 fields plus nine moment-type rows, all expanded at once. Highest cognitive load in the product, at the step users understand least. Directly contradicts Doctrine §1.5 while `PersonForm` beside it complies | Restructure into guided steps: Name and purpose → Budgets per moment → Approval and delivery → Review. Collapse Experience Preferences and Reporting behind disclosure | M | No | Pattern exists in `PersonForm` | Open |
| **EX-H4** | Any admin | `WorkspaceHeader.tsx:11-18` | `PAGE_TITLES` has no entry for `/workspace/assignments`, `/workspace/policies/new`, `/workspace/policies/[id]`. Three of eight routes show the header title "Workspace", losing orientation | Add the three entries; add a fallback derived from the path rather than a constant | XS | **Yes** | None | Open |
| **EX-H5** | Admin configuring policies | `/workspace/policies` · `PolicyLibrary.tsx` | Four gold primary buttons on one page (New Policy, empty-state create, continue-to-assignments, plus per-card actions). No single next action at the heaviest step | One state-dependent primary, mirroring `PeopleDirectory`: "Create your first policy" when empty, "Continue to Policy Assignments" when one is published, "New policy" otherwise | S | No | None | Open |
| **EX-H6** | Returning admin | All setup routes | `SetupProgress` renders only inside `PeopleDirectory`; `SetupChecklist` only on `/workspace`. Inside any other step there is no sense of position in the sequence | Render `SetupProgress` on profile, classes, policies and assignments as well | S | **Yes** | Component exists | Open |
| **EX-H7** | Any admin | `/workspace/classes` · `RelationshipClassesPage.tsx:71-78` | Deactivating a class is one unconfirmed toggle and silently stops policy resolution for everyone in it. Deleting a custom class is one unconfirmed `×` and leaves dangling references on Person records | Confirm both. Deactivation should state how many people are affected — `activeMemberCount` already computes this | S | No | Extract `ConfirmDialog` from `PeopleDirectory` | Open |
| **EX-H8** | Any admin | `/workspace/assignments` · `PolicyAssignmentsPage.tsx` | Assignment removal is a single unconfirmed `×`, sitting beside a reversible Deactivate with equal visual ease. Removing the wrong one silently changes which policy governs a class | Confirm removal; visually subordinate delete to deactivate | S | No | Same `ConfirmDialog` | Open |

---

## Medium

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|------------|--------|
| **EX-M1** | Admin unfamiliar with Aniyé | `/workspace/classes`, `/workspace/policies`, `/workspace/assignments` | Page titles use internal vocabulary — "Relationship Classes", "Policy Library", "Policy Assignments" — with no plain-language gloss. People does this well; nothing else does | One-line human subtitle per page, per the Doctrine translation table | S | None | Open |
| **EX-M2** | Returning admin | Four route guards | `classes`, `policies`, `assignments`, `people` each write bespoke blocked-state copy — four voices for one concept | Extract one `BlockedStep` component taking heading, body and target | S | None | Open |
| **EX-M3** | Any admin | `/workspace/classes`, `/workspace/assignments` | Confirming navigates away with no acknowledgement of what was accomplished. Only People shows a structured outcome | Reuse the People outcome-panel pattern on confirm | S | None | Open |
| **EX-M4** | First-time admin | `OrgProfileForm.tsx:155-161` | `operatingCountries` is stored as `string[]` but edited as a comma-joined string, re-split on save. The assessment already parsed it once — the data round-trips through a lossy format | Edit as chips/tags, or keep the string form but stop re-parsing what is already structured | S | None | Open |
| **EX-M5** | Admin configuring policies | `PolicyForm.tsx` | A half-written policy is lost on navigation. Inconsistent with `PersonForm`, and the policy form is considerably longer | Autosave a policy draft, matching `aniye_person_draft` | S | EX-H3 | Deferred |
| **EX-M6** | First-time admin | `/verify` · `VerifyGate.tsx` | Copy reads "In production, a verification link would be sent to…" — the interface describes a feature that does not exist, in front of the user | Either implement verification or remove the sentence. Do not narrate absent features to customers | XS | Product decision | Open |
| **EX-M7** | Mobile-only user | `/workspace/people` · `PeopleDirectory.tsx` | The page stacks primary action, outcome panel, filters, list, coverage grid and setup progress. A long scroll on a phone even once EX-C2 is fixed | Collapse coverage behind disclosure on small screens; move `SetupProgress` to the bottom | S | EX-C2 | Open |
| **EX-M8** | Any admin | `PolicyLibrary.tsx`, `PeopleImport.tsx` | Tables rely on `overflow-x-auto`. Horizontal scrolling inside a page violates Doctrine §2.8, acceptable only as a fallback | Card layouts below `lg`, as `PeopleDirectory` already does | S | EX-C2 | Open |
| **EX-M9** | Admin adding one person | `PersonForm.tsx` | Four steps for what is often two fields. A user adding a single new hire pays the full guided-flow cost | Allow Review from step 1 once required fields are valid — "Skip to review" | S | None | Deferred |
| **EX-M10** | User importing a large list | `PeopleImport.tsx` | Every row renders in the review step; a 2,000-row file with many failures produces an unusable wall. No way to export just the failed rows | Cap the rendered rows per bucket with "show all"; offer a failed-rows CSV download | M | None | Deferred |
| **EX-M11** | Screen-reader user | `AssessmentWizard`, `PersonForm`, `PeopleImport` | No focus management between steps. Focus is left on a removed button; the view change is not announced | Move focus to the step heading and add an `aria-live` region for step changes | S | None | Open |

---

## Low

| ID | Actor | Route / component | Friction | Recommended correction | Effort | Dependency | Status |
|----|-------|-------------------|----------|------------------------|--------|------------|--------|
| **EX-L1** | Any admin | `WorkspaceHeader.tsx:44-52` | Notification bell is focusable, labelled "coming soon", and does nothing | Add `disabled`, or remove until it works | XS | None | Deferred |
| **EX-L2** | Keyboard user | `PeopleDirectory.tsx` `ConfirmDialog` | Sets `role="dialog"` and `aria-modal` but does not trap focus or close on `Escape` | Add focus trap and `Escape` handler when the component is extracted for EX-H7/H8 | S | EX-H7 | Open |
| **EX-L3** | Screen-reader user | `RelationshipClassesPage.tsx` desktop branch | The remove `×` has no `aria-label` in the desktop layout; the mobile branch has one | Add the label | XS | None | Open |
| **EX-L4** | Mobile-only user | `PeopleDirectory.tsx` `ConfirmDialog` | Bottom-docked on small screens (correct) but no scroll containment if body text grows | Add `max-h` and internal scroll | XS | None | Deferred |
| **EX-L5** | Any visitor | `RelationshipSnapshot.tsx:161-171` | Uses raw `<a href>` rather than `<Link>` — full page reload on the snapshot → verify transition | Use `next/link` | XS | None | Open |
| **EX-L6** | Maintainer | `PeopleImport.tsx` step-1 stats | The fourth statistic is computed by a double subtraction that always resolves to the duplicate count. Output is correct, intent is unreadable | Replace with a direct count | XS | None | Open |
| **EX-L7** | Maintainer | `RECOVERY_LEDGER.md` §7, `ANIYE_SYSTEM_ATLAS.md` §2 | Both record the assessment storage key as `aniye_assessment`. The code writes **`aniye_last_submission`** (`AssessmentWizard.tsx:35`) | Correct both documents to match the implementation | XS | None | **Fixed** in this audit |

---

## Blocking Summary

| Question | Answer |
|----------|--------|
| Critical findings open | **2** — EX-C1, EX-C2 |
| High findings open | **8** |
| Findings marked *blocks Programs* | **5** — EX-C1, EX-C2, EX-H2, EX-H4, EX-H6 |
| **Programs status** | **Blocked** |

Programs may begin once the five blocking findings are corrected. The remaining High findings (EX-H1, EX-H3, EX-H5, EX-H7, EX-H8) should be corrected before any external pilot, but do not gate the Programs milestone itself — none of them change the shape of what Programs would be built on.

---

*Aniyé Friction Register — 27 July 2026 — audited at commit `1b1025e`.*
