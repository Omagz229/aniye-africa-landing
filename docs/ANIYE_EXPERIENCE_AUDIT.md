# Aniyé Experience Audit

> Audited 2026-07-27 at commit `1b1025e`, against [`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md).
> **Inspection only** — no application component or domain model was changed during this audit.
> Companion: [`ANIYE_FRICTION_REGISTER.md`](ANIYE_FRICTION_REGISTER.md).

**The question:** *Does each actor always understand what to do next, without feeling overwhelmed?*

---

## 1. Executive Summary

The product has a coherent spine. The H1 discovery journey is genuinely good — the assessment is short, well-paced, and the snapshot pays off the effort. The H2 configuration arc is architecturally complete and the People flow (R3a) demonstrates the Doctrine working.

But the audit found **two Critical defects that must be fixed before anything else ships**, and neither is a design nicety:

1. **`/verify` silently destroys a configured workspace.** Re-opening an old verification link wipes every class, policy, assignment and person, with no confirmation and no recoverable copy. This is data loss, not friction.
2. **The workspace is unusable on a phone.** There is no responsive treatment anywhere in the workspace shell — a fixed 240px sidebar with a hardcoded `ml-60` content offset. On a 375px viewport the content column is roughly 135px wide. Every one of the six setup routes is affected. The careful mobile work inside the People page renders inside an unusable frame.

The second finding also invalidates a claim in the R3 report: I described the People page as having mobile card layouts and adequate tap targets. Those exist and are correct — but they are inside a shell that makes them unreachable on mobile. The component was responsive; the page was not.

**Beyond the Criticals, the dominant pattern is inconsistency rather than absence.** The Doctrine's principles are implemented well in exactly one place — People — and unevenly everywhere else. The Policy step is the sharpest contrast: `PersonForm` is a four-step guided flow with autosave, while `PolicyForm` is a single 463-line form with six sections, no steps, no disclosure, and no way back out of `/workspace/policies/new`.

**Programs remains blocked.** Two Critical and eight High findings, of which six are on the setup journey Programs will sit at the end of.

| Severity | Count |
|----------|-------|
| **Critical** | 2 |
| **High** | 8 |
| **Medium** | 11 |
| **Low** | 7 |
| **Total** | **28** |

**Not audited:** vendor, courier, recipient, and internal Operations interfaces. None exist. Doctrine requirements for them are recorded as future gates in §13 rather than as findings.

---

## 2. Journey Maps

### Journey A — New organization

**Start condition:** anonymous visitor, no stored state.

| # | Step | Route | Primary action | Memory reused | Uncertainty / abandonment risk |
|---|------|-------|----------------|---------------|-------------------------------|
| 1 | Landing | `/` | "Start your assessment" | — | Low. Narrative arc is clear |
| 2 | Assessment | `/assessment` | "Continue" (validated per step) | Nothing — fresh each visit | **High.** ~15 fields across 4 steps with **no persistence**. Refresh or accidental back = total loss (EX-H1) |
| 3 | Snapshot | `/report?d=` | "Set up your workspace" | Assessment, via base64 URL param | Low. Payoff is immediate and legible |
| 4 | Verification | `/verify?d=` | "Continue to Workspace" | Assessment, via the same param | Medium. Copy says a link "would be sent in production" — describes a feature that does not exist (EX-M6) |
| 5 | Workspace | `/workspace` | "Review Organization Profile" | Company, industry, size, countries, contact all prefilled | Low. Checklist is the strongest orientation surface in the product |
| 6 | Profile | `/workspace/profile` | "Confirm and continue" | Assessment answers prefilled | Low, but countries round-trip through a comma string (EX-M4) |
| 7 | Classes | `/workspace/classes` | "Confirm Relationship Classes" | 11 seeded defaults | Medium. Deactivating or deleting a class is a single unconfirmed click (EX-H7) |
| 8 | Policies | `/workspace/policies` | **Ambiguous — four gold CTAs** | Nothing | **High.** Heaviest step, least guidance (EX-H5, EX-H3, EX-H2) |
| 9 | Assignments | `/workspace/assignments` | "Confirm assignments" | Classes and published policies | Medium. Good blocked states; per-class add form is dense |
| 10 | People | `/workspace/people` | State-dependent, single primary | Classes; draft autosave | Low. Reference implementation |

**Completion signal:** confirming People advances `setupStage` to `programs`; the checklist then reads "Your workspace is configured" and names Programs as not yet available. This is an honest, non-dead-end ending.

**Sharpest drop-off risk:** steps 2 and 8.

---

### Journey B — Returning setup user

**Start condition:** stored workspace, setup partially complete.

| # | Step | Behaviour | Assessment |
|---|------|-----------|------------|
| 1 | Return to `/workspace` | `WorkspaceShell` loads and migrates; redirects to `/assessment` if nothing stored | Works. Migration is silent, correctly |
| 2 | Understand progress | `SetupChecklist` shows all five stages with complete / active / "Coming soon" markers | **Good.** The single best returning-user surface |
| 3 | Resume the right step | Contextual "Next Step" panel with a direct link, per stage | **Good** for all five stages |
| 4 | Complete it | Route-level guards on classes, policies, assignments, people | Works, but each guard writes its own copy — no shared pattern |
| 5 | Understand what comes next | Only on `/workspace` and `/workspace/people` | **Gap.** `SetupProgress` is rendered only inside People (EX-H6) |

**Uncertainty:** once inside any step other than People, the user has no indication of where they are in the overall sequence. The sidebar shows locked items but not position.

**Abandonment point:** a user who leaves mid-Policy loses nothing stored, but returns to a Policy Library with no memory of what they were doing.

---

### Journey C — Manual people setup

**Start condition:** `setupStage: people`, empty directory.

| # | Step | Primary action | Memory reused | Notes |
|---|------|----------------|---------------|-------|
| 1 | `/workspace/people` | **"Add your first person"** | — | Single primary, chosen from state |
| 2 | Choose | "Import a list" *(recommended when empty)* | — | Two cards, use-case framed, one marked Recommended |
| 3 | Who they are | "Continue" | — | First/last required and unmarked; email/role tagged Optional; phone disclosed |
| 4 | Where they fit | "Continue" | Active classes, grouped by type, sorted by level | Level 0 explained inline |
| 5 | Dates that matter | "Continue" | — | Both optional, format shown in hint text |
| 6 | Review | "Add {name}" | Everything entered | Nothing written until this click |
| 7 | Outcome | Dismissible panel + coverage line | Directory state | *"Ada Obi is in your directory. 12 people are ready. 2 still need a relationship group."* |

**Memory:** draft autosaved to `aniye_person_draft` on every keystroke; offered back as an explicit "Continue / Start fresh" choice on return.
**Completion signal:** named outcome + coverage + the primary action recomputed.
**Residual risk:** the flow is four steps for what is often two fields (EX-M9).

---

### Journey D — CSV people setup

| # | Step | Primary action | Notes |
|---|------|----------------|-------|
| 1 | Choose import | "Upload a file" | Template download offered alongside |
| 2 | Upload | Drop or "Choose a file" | Parse failures explained in plain language |
| 3 | Check the columns | "Review the details" | Row count, ignored columns named, four counts |
| 4 | Review | "Continue" | Rows grouped by **required action**, not by internal state |
| 5 | Confirm | "Import N records" | Bulleted statement of what will happen |
| 6 | Done | "Back to People" | Counts + unresolved-row guidance |

**Memory:** none across sessions — an abandoned import restarts from upload. Acceptable; a file is cheap to re-select.
**Uncertainty:** step 3's fourth statistic is computed with a redundant double-subtraction that always yields the duplicate count (`PeopleImport.tsx`, step 1 block). Correct output, unreadable code (EX-L6).
**Abandonment point:** a file with many bad rows dumps every row into the "Needs attention" bucket with no export of just the failures (EX-M10).
**Completion signal:** explicit, with a next action.

---

## 3. Doctrine Compliance Scorecard

Compliance across all audited surfaces. "Partial" means implemented somewhere and absent elsewhere.

| # | Principle | Status | Where it holds | Where it fails |
|---|-----------|--------|----------------|----------------|
| 1 | One clear next action | **Partial** | People, Assignments, Profile, Checklist | Policy Library (4 gold CTAs) |
| 2 | Progressive disclosure | **Partial** | People (phone, filters, import buckets) | PolicyForm — 6 sections, all expanded |
| 3 | Recommend before many choices | **Partial** | People add/import chooser | Policy Library offers no starting point |
| 4 | Remember once, reuse everywhere | **Good** | Assessment → profile → workspace; class seeds | Countries round-trip; assessment itself is not remembered |
| 5 | Guided onboarding not long forms | **Partial** | Assessment (4 steps), PersonForm (4 steps), Import (5 steps) | PolicyForm — single long form |
| 6 | Meaningful progress | **Partial** | Checklist, SetupProgress, StepHeader | Progress absent on 5 of 6 setup routes |
| 7 | Actor-specific simplicity | **Not assessable** | Only one actor exists | — |
| 8 | No dead ends | **Fails** | Most routes have a way back | `/workspace/policies/new` has none |
| 9 | Cross-channel continuity | **Not assessable** | Web only | — |
| 10 | Delight strengthens trust | **Good** | Coverage lines, resume prompt, honest empty copy | — |
| 11 | Mobile-first vendor/courier | **Not assessable** | Not built | — |
| 12 | No dark patterns | **Good** | No false urgency, no pre-checked consent, no hidden exits | — |

### Definition of Experiential Completion — by surface

| Check | `/` | `/assessment` | `/report` | `/verify` | `/workspace` | profile | classes | policies | assignments | people |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Primary action obvious | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 2. Next step explained | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| 3. Advanced options hidden | n/a | ✅ | n/a | n/a | n/a | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ |
| 4. Repeated info prefilled | n/a | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |
| 5. Empty states useful | n/a | n/a | ⚠️ | n/a | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| 6. Errors explain recovery | n/a | ⚠️ | ⚠️ | n/a | n/a | ⚠️ | n/a | ⚠️ | ✅ | ✅ |
| 7. Success states + next | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| 8. Mobile usable | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 9. Human language | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| 10. Unnecessary choices reduced | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ |
| 11. Destructive actions confirmed | n/a | n/a | n/a | ❌ | n/a | n/a | ❌ | ⚠️ | ❌ | ✅ |
| 12. Save and continue | n/a | ❌ | n/a | n/a | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |

✅ met · ⚠️ partial · ❌ not met · n/a not applicable

---

## 4. Findings by Severity

Full detail per finding is in [`ANIYE_FRICTION_REGISTER.md`](ANIYE_FRICTION_REGISTER.md). Summarised here with evidence.

### Critical (2)

**EX-C1 — `/verify` silently destroys an existing workspace.**
*Actor:* returning administrator. *Route:* `/verify`, `VerifyGate.tsx`.
`handleContinue()` calls `createWorkspace(...)` then `saveWorkspace(workspace)` unconditionally. `saveWorkspace` performs a bare `localStorage.setItem(WORKSPACE_KEY, ...)` (`lib/workspace.ts:504`). There is no check for an existing workspace, no confirmation, and no backup — the migration runner's backup only fires on a destructive *migration*, not on an overwrite.
*Consequence:* an administrator who re-opens an old snapshot or verification link — from an email, a bookmark, or browser history — loses every relationship class, policy, assignment, and person with one click and no warning. Unrecoverable.
*Blocks Programs:* **yes.** Programs will add more state to the same document, raising the cost of every occurrence.

**EX-C2 — The workspace is unusable on mobile.**
*Actor:* mobile-only user. *Routes:* all six workspace routes. *Component:* `WorkspaceShell.tsx:41`, `WorkspaceSidebar.tsx:43`, `WorkspaceHeader.tsx:35`.
`<main className="ml-60 pt-14">`, `<aside className="fixed inset-y-0 left-0 w-60">`, `<header className="fixed top-0 left-60 right-0">`. A grep for responsive prefixes across all three files returns exactly one hit — `hidden sm:block` on the header's user name. There is no breakpoint, no drawer, no toggle.
*Consequence:* on a 375px viewport the sidebar occupies 240px and the content column is ~135px. Every setup task is effectively impossible. The responsive card layouts inside `PeopleDirectory` and the mobile-aware `StepHeader` are rendered unreachable by the frame containing them.
*Blocks Programs:* **yes.** Programs would inherit the same shell.

### High (8)

| ID | Finding | Route / component |
|----|---------|-------------------|
| **EX-H1** | Assessment has no persistence. ~15 fields across 4 steps held in `useState` only (`AssessmentWizard.tsx:22`). A refresh, browser-back, or closed tab loses everything before submission. `localStorage` is written *once*, at submit. | `/assessment` |
| **EX-H2** | `/workspace/policies/new` is a dead end. `PolicyForm` renders Cancel only when an `onCancel` prop is supplied (`PolicyForm.tsx:439`); the route renders `<PolicyForm />` with no props. The only escape is the sidebar. | `/workspace/policies/new` |
| **EX-H3** | `PolicyForm` is a 463-line single-page form: six sections, ~14 fields plus nine moment-type rows, all expanded, no steps, no disclosure. It is the highest-cognitive-load surface in the product and sits at the step users understand least. | `PolicyForm.tsx` |
| **EX-H4** | `WorkspaceHeader.PAGE_TITLES` has no entry for `/workspace/assignments`, `/workspace/policies/new`, or `/workspace/policies/[id]`. Three of eight routes render the header title "Workspace". | `WorkspaceHeader.tsx:11-18` |
| **EX-H5** | Policy Library presents four gold primary buttons (New Policy, empty-state create, continue-to-assignments, plus card actions). No single next action at the heaviest step. | `PolicyLibrary.tsx` |
| **EX-H6** | Setup progress exists on only two of seven setup surfaces. `SetupProgress` is rendered solely inside `PeopleDirectory`; `SetupChecklist` only on `/workspace`. Inside any other step the user has no sense of position. | workspace routes |
| **EX-H7** | Relationship class deactivation and deletion are single unconfirmed clicks. The toggle sets `isActive: false`, which silently stops policy resolution for everyone in that class; `removeCustomClass` deletes outright, leaving dangling references on Person records that the code then has to report as invalid. | `RelationshipClassesPage.tsx:71-78` |
| **EX-H8** | Policy Assignment removal is a single unconfirmed `×`. Removing the wrong assignment silently changes which policy governs a class. Deactivate exists and is reversible — but delete sits beside it with equal ease. | `PolicyAssignmentsPage.tsx` |

### Medium (11) and Low (7)

Enumerated in the friction register (EX-M1 … EX-M11, EX-L1 … EX-L7). Themes: terminology gaps on four routes, no shared blocked-state pattern, countries round-tripping through a comma string, unversioned person draft, large-CSV rendering, non-functional notification affordance.

---

## 5. Route-by-Route Review

Scores are 1–5, where **3 = acceptable, ships without embarrassment**; 5 = exemplary; 1 = broken.

| Route | Next-step clarity | Cognitive load | Continuity | Mobile | Error recovery | Trust | Enjoyment |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/` | 5 | 5 | 4 | 5 | n/a | 5 | 5 |
| `/assessment` | 4 | 4 | **1** | 4 | 3 | 4 | 4 |
| `/report` | 4 | 4 | 3 | 4 | 2 | 5 | 5 |
| `/verify` | 4 | 5 | 3 | 4 | **1** | 3 | 4 |
| `/workspace` | 5 | 4 | 5 | **1** | n/a | 4 | 4 |
| `/workspace/profile` | 4 | 3 | 4 | **1** | 3 | 4 | 3 |
| `/workspace/classes` | 4 | 3 | 3 | **1** | 2 | 3 | 3 |
| `/workspace/policies` | **2** | **2** | **2** | **1** | 2 | 3 | 2 |
| `/workspace/assignments` | 4 | 3 | 3 | **1** | 4 | 4 | 3 |
| `/workspace/people` | 5 | 4 | 5 | **2** | 5 | 5 | 4 |

**Notes on scoring.** Mobile scores of 1 across the workspace are a single shared cause (EX-C2) — they are not six independent problems, and one fix lifts all of them. People scores 2 rather than 1 because its internals are already correct and would be usable the moment the shell is fixed. `/assessment` continuity scores 1 for total loss on refresh. `/verify` error recovery scores 1 because the destructive path has no recovery at all. `/workspace/policies` is the weakest route on five of seven dimensions and is the single highest-value target after the Criticals.

**Deliberately not aggregated into one number.** A single score would hide that the product is strong at both ends of the journey and weak in one specific middle section.

---

## 6. Cross-Route Consistency

| Area | State |
|------|-------|
| **Navigation** | Consistent. Sidebar unlock logic is centralised in `isStageComplete`; Programs is permanently gated by `built: false` (correct — cannot link to a 404) |
| **Route guards** | Present on all four gated routes, but each writes bespoke copy. `classes` uses "Complete your profile first", `policies` "Confirm your Relationship Classes first", `assignments` "Complete the earlier steps first", `people` "A couple of steps to go first". Four voices for one concept (EX-M2) |
| **Primary action styling** | `rounded-full bg-gold text-ink font-semibold` is used consistently for primaries — the vocabulary is right; the discipline of *one per screen* is not |
| **Confirmation patterns** | Three different models: modal dialog (People archive), inline warn-then-repeat (People confirm, Assignments confirm), and none at all (classes, assignments removal) |
| **Success feedback** | Only People has a structured outcome panel. Other steps navigate away silently on confirm |
| **Terminology** | Diverges by route — see §9 |
| **Page titles** | Broken on three routes (EX-H4) |

---

## 7. Mobile Findings

**EX-C2 dominates everything else here.** Until the shell is responsive, no other mobile finding in the workspace can be observed by a real user.

| Finding | Detail |
|---------|--------|
| **EX-C2** | Fixed 240px sidebar, `ml-60` content, `left-60` header, zero breakpoints. Content column ≈135px on a 375px device |
| **EX-M7** | The People page stacks primary action, outcome panel, filters, list, coverage grid and setup progress. Even once the shell is fixed, it is a long scroll on a phone |
| **EX-M8** | Desktop tables in `PolicyLibrary` and the import preview rely on `overflow-x-auto`. Horizontal scrolling inside a page is a Doctrine §2.8 violation, tolerable only as a fallback |
| **EX-L4** | The archive confirmation dialog docks to the bottom on small screens (correct) but has no scroll containment if body text grows |

**What is already right:** `PeopleDirectory` card layouts below `lg`, `StepHeader`'s collapsed step indicator, full-width checkbox rows in `PersonForm`, and the public H1 routes, which are fully responsive.

---

## 8. Accessibility Findings

Basics only — this was not a full WCAG audit, and none of these are Critical.

| ID | Finding |
|----|---------|
| **EX-M11** | No focus management between steps in either wizard. Advancing a step leaves focus on the (now removed) button; screen-reader users are not told the view changed. Affects `AssessmentWizard`, `PersonForm`, `PeopleImport` |
| **EX-L1** | The notification bell is a `<button>` with an accessible label of "Notifications (coming soon)" but no `disabled` attribute and no action — it is focusable and does nothing |
| **EX-L2** | The archive dialog sets `role="dialog"` and `aria-modal` but does not trap focus or close on `Escape` |
| **EX-L3** | Class and person removal buttons use `×` with `aria-label` — correct — but the class list's remove control in `RelationshipClassesPage` has no label at all in the desktop branch |

**Already correct:** form controls are labelled throughout; `aria-label` on every filter select; `aria-expanded` on disclosure toggles; `role="switch"` with `aria-checked` on toggles; visible focus rings via `focus-visible:ring-gold`.

---

## 9. Language and Terminology

The Doctrine's translation table is honoured on `/workspace/people` and nowhere else.

| Route | Internal vocabulary shown unexplained |
|-------|--------------------------------------|
| `/workspace/classes` | "Relationship Classes", "Type", "Level" — Level is explained; Type is not |
| `/workspace/policies` | "Recognition Policies", "Policy Library", "Draft / Published / Archived", "v1" version badges |
| `/workspace/assignments` | "Policy Assignments", "Global", "priority", "In effect" — scope and priority are explained; the page title is not |
| `/workspace` | Stage labels are human ("Organization", "People"), but "Relationship Classes" and "Policy Assignments" appear raw |

**Confirmed absent:** superseded ADR-002 vocabulary. A grep for "Category" and "Tier" across `app/components/workspace/` returns only *gift* categories in `PolicyForm`, which is correct and unrelated.

**Documentation error found during the audit:** `RECOVERY_LEDGER.md` §7 records the assessment's storage key as `aniye_assessment`. The code writes **`aniye_last_submission`** (`AssessmentWizard.tsx:35`), and the Atlas §2 also says `aniye_assessment`. Two documents disagree with the implementation. Recorded as EX-L7; corrected in the ledger as part of this audit.

---

## 10. Save-and-Return Findings

| Surface | Behaviour | Verdict |
|---------|-----------|---------|
| Assessment | Nothing stored until submit | **EX-H1 — worst gap in the product.** The longest unsaved form is the one strangers fill in first |
| Snapshot | Fully reconstructible from the `?d=` URL param | Good — shareable and bookmarkable |
| Workspace | Every confirm writes through `updateWorkspace`; migrations run on read | Good |
| Profile / Classes / Assignments | Written on confirm; classes and assignments also write on each edit | Good |
| Policy draft | A new policy is not stored until saved; no in-progress draft | **EX-M5.** Inconsistent with `PersonForm`, and the policy form is far longer |
| Person (new) | Autosaved to `aniye_person_draft`, offered back as an explicit choice | **Exemplary** |
| Person (edit) | Not autosaved by design — an abandoned edit must not mutate a stored record | Correct, and worth keeping |
| CSV import | Not persisted across sessions | Acceptable |

---

## 11. Recommended Pre-Programs Corrections

Deliberately minimal. This is **not** a redesign — it is the set that removes data loss, removes dead ends, and makes the setup journey coherent enough that Programs can be built on top of it without inheriting the problems.

### Must fix before Programs (5)

| ID | Correction | Effort | Why it gates Programs |
|----|-----------|--------|----------------------|
| **EX-C1** | Guard workspace creation. If a workspace already exists, `/verify` must ask before replacing it — and back the old one up first, reusing the existing `workspaceBackupKey` helper | S | Programs adds more state to the same document. Every additional collection raises the cost of one accidental overwrite |
| **EX-C2** | Make the workspace shell responsive: sidebar as an off-canvas drawer below `lg`, `ml-60` behind a breakpoint, a header toggle | M | Programs inherits the shell. Fixing it after doubles the work |
| **EX-H2** | Give `/workspace/policies/new` a way back | XS | A dead end on the setup path Programs completes |
| **EX-H4** | Add the three missing `PAGE_TITLES` entries | XS | Programs will add more routes to the same map |
| **EX-H6** | Render `SetupProgress` on every setup route, not just People | S | Programs is the final milestone in that progress display; it needs to exist first |

**Total: one medium, two small, two extra-small.** No visual redesign.

### Should fix before pilot (5)

| ID | Correction | Effort |
|----|-----------|--------|
| **EX-H1** | Autosave the assessment, matching the `aniye_person_draft` pattern | S |
| **EX-H3** | Restructure `PolicyForm` into guided steps mirroring `PersonForm` | M |
| **EX-H5** | Reduce the Policy Library to one state-dependent primary action, mirroring People | S |
| **EX-H7 / EX-H8** | Confirmation on class deactivation, class deletion, assignment removal — the `ConfirmDialog` already exists in `PeopleDirectory` and should be extracted | S |
| **EX-M2** | One shared blocked-state component replacing four bespoke ones | S |

### Can defer (all Medium and Low not listed above)

Terminology glosses on classes/policies/assignments, the countries round-trip, large-CSV virtualisation, draft versioning, focus management, dialog focus trapping, notification affordance, `<a>` → `<Link>` on the snapshot.

---

## 12. Deferred Improvements

Genuinely optional, recorded so they are not rediscovered later: per-route contextual help, an export of failed CSV rows, keyboard shortcuts, richer coverage visualisation, undo-after-action instead of confirm-before-action for reversible operations, and a saved-view system for people filters.

---

## 13. Future Actor Experience Gates

No findings are recorded for interfaces that do not exist. These are the Doctrine requirements each future actor surface must satisfy **before it ships**, recorded now so they are designed in rather than retrofitted.

| Actor | Gate |
|-------|------|
| **Vendor** | Doctrine §1.11 — mobile-first, one-handed, poor-connection tolerant. Stock confirmation and order acceptance must be reachable in a single tap from a message |
| **Courier** | §1.11 and §1.8 — delivery confirmation and proof capture must work offline-tolerant, with no dead end when a delivery fails. A failed delivery is a state, not an error |
| **Recipient** | §1.10 and §1.12 — the gift experience must never require an account, never harvest data as a condition of receipt, and never use the moment for upsell |
| **Operations (internal)** | §1.7 — operator complexity must not leak into any customer-facing surface. Concierge tooling is its own actor with its own interface |
| **All four** | §1.9 — a task begun in WhatsApp or email must be completable on the web and vice versa. WhatsApp remains a channel, not a system of record (Atlas §13) |

---

*Aniyé Experience Audit — 27 July 2026 — audited at commit `1b1025e`.*
*Inspection only. No application component or domain model was modified.*
