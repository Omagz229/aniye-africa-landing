# Aniyé Experience Doctrine

> **A permanent product and interaction standard — not an architecture decision.**
> The System Atlas governs what Aniyé *is*. This document governs how it *feels*.
> Every user-facing milestone is measured against §2 before it is called done.

Aniyé may be complex internally. Every customer, vendor, courier, recipient, and operator should experience it as clear, effortless, warm, and dependable.

**The intended feeling:**

> *"I do not have to keep all of this in my head. Aniyé has it under control."*

Complexity is the platform's job, not the user's. Every principle below follows from that one sentence.

---

## 1. Principles

### 1. One clear next action

Every screen has exactly one obvious thing to do next. Secondary options exist, but they are visibly secondary — different weight, different colour, different size. A screen offering three equal buttons has made the user do the platform's thinking.

When the right action depends on state, compute it. Do not present all possible actions and let the user work out which applies.

### 2. Progressive disclosure

Show what is needed now. Reveal the rest when it becomes relevant.

Advanced options, optional fields, and rare configurations start hidden. This is not about hiding power — it is about not charging every user the cost of options most of them will never touch.

### 3. Recommend before presenting many choices

When there is a sensible default, lead with it. A list of equally-weighted options is a decision the platform failed to make.

Where a genuine choice exists, explain what each option is *for* — the use case, not the mechanism.

### 4. Remember once and reuse everywhere

Information the user has already given is never asked for twice. Prefill from what is known: the assessment feeds the profile, the profile feeds defaults, earlier steps feed later ones.

If a field can be derived, derive it. If it can be prefilled, prefill it and let the user correct it.

### 5. Guided onboarding rather than long setup forms

Break setup into short, purposeful steps with a visible position in a sequence. A form with thirty fields is a wall; the same thirty fields across four steps with clear intent is a path.

Each step should be answerable without leaving the screen to look something up.

### 6. Meaningful progress and gamification

Show real progress against real milestones. "Recognition structure complete" means something; a progress ring that fills for typing does not.

Progress must be honest and adult. No confetti for entering an email address, no streaks, no artificial scarcity.

### 7. Actor-specific simplicity

Each actor sees only their own surface. An operator configuring policies, a vendor confirming stock, a courier confirming delivery, and a recipient receiving a gift share a system but not an interface.

Never leak one actor's complexity into another's view.

### 8. No dead ends

Every state offers a way forward. Empty states carry an action. Errors carry a recovery. Blocked states name the thing that unblocks them and link to it.

A screen that tells the user something is wrong without telling them what to do next is an unfinished screen.

### 9. Continuity across web, mobile, email, and WhatsApp

A task started in one channel can be continued in another. State belongs to the platform, not to the surface it was entered on.

WhatsApp is a channel, not a system of record (Atlas §13). The same applies to email and SMS.

### 10. Delight must strengthen trust

Warmth is expressed through clarity, good defaults, and remembering things — not through animation or novelty. Delight that slows a task down is decoration.

The moment of delight in Aniyé is the user realising the platform already handled something.

### 11. Mobile-first vendor and courier interactions

Vendors and couriers work on phones, often one-handed, often on poor connections. Their flows are designed for mobile first and desktop second — large targets, minimal typing, no horizontal scrolling, no multi-column forms.

### 12. No manipulative engagement or dark patterns

No false urgency. No guilt copy. No pre-checked consent. No hiding the exit. No making destructive actions easy and reversals hard.

Aniyé's business depends on organisations trusting it with their relationships. Any pattern that trades a user's clarity for a metric is prohibited.

---

## 2. Definition of Experiential Completion

A user-facing milestone is not complete until every line below is true. This is a checklist, not a philosophy — it is meant to be walked through literally.

| # | Check |
|---|-------|
| 1 | The **primary action is visually obvious** — one action, clearly weighted above the rest |
| 2 | The **next step is explained** — the user knows what happens after they act |
| 3 | **Advanced options are hidden** until relevant |
| 4 | **Repeated information is prefilled** wherever it is already known |
| 5 | **Empty states provide a useful action**, never just an absence |
| 6 | **Errors explain both the problem and how to recover** |
| 7 | **Success states acknowledge completion and show what comes next** |
| 8 | **Mobile interaction is usable** — no horizontal scroll, adequate targets, no desktop-only affordances |
| 9 | **Internal system language is translated into human language** |
| 10 | **Unnecessary choices are reduced** — every remaining choice earns its place |
| 11 | **Potentially destructive actions require confirmation** |
| 12 | **Users can save progress and continue** where practical |

### Language translation reference

Principle 9 in practice. Internal vocabulary is correct in code and in the Atlas; it does not belong on screen unexplained.

| Internal | On screen |
|----------|-----------|
| `relationshipClassIds` | "Relationship groups" / the class names themselves |
| Relationship Level | **Recognition Level**, with "Level 0 is the highest recognition priority" |
| `setupStage` | Named milestones — "Policies assigned", "People added" |
| `ready-unassigned` | "Ready — no relationship group yet" |
| `duplicate-retained` | "Already in your directory — existing record kept" |
| `ambiguous-class` | "Matches more than one group — tell us which" |
| `missing-required` | "Needs a first and last name" |
| Schema version / migration | Never shown. Silent |
| Source priority / precedence | "Imported records take priority over manually added ones" |

Superseded vocabulary — **Category** and **Tier** (pre-ADR-002) — must never appear in the interface.

---

## 3. Scope

This doctrine applies to every surface: the marketing site, the assessment, the workspace, operator tooling, vendor and courier interfaces, recipient-facing messages, and transactional email and WhatsApp templates.

It is a standing standard. It is not versioned per milestone and does not require an ADR to invoke — every milestone is expected to meet it.

**Related:**
- [`ANIYE_SYSTEM_ATLAS.md`](ANIYE_SYSTEM_ATLAS.md) — what the platform is and what it owns
- [`RECOVERY_LEDGER.md`](RECOVERY_LEDGER.md) — reconstruction status and the pending Experience Audit

---

*Aniyé Experience Doctrine v1.0 — July 2026*
*A permanent product and interaction standard. Update when the standard itself changes, not per feature.*
