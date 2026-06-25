# Aniyé Africa MMP — Design Specification

**Date:** 2026-06-25
**Status:** APPROVED — build immediately
**Preceding spec:** 2026-06-24-aniye-africa-landing-design.md

---

## 1. Product Direction

Aniyé Africa helps organizations never miss the moments that matter.

This MMP evolves the consumer landing page into the front door of the Aniyé Platform. It generates qualified corporate leads, captures relationship intelligence, and delivers an executive-grade Relationship Snapshot as the first product experience.

**Platform progression (architected now, built incrementally):**
```
Assessment → Relationship Snapshot → Consultation → Relationship Programs
→ Customer Workspace → Relationship History → Relationship Intelligence
```

The Snapshot is Version 1 of the organization's future Relationship Profile.

---

## 2. Tech Stack (Unchanged)

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.9 (App Router) |
| Language | TypeScript |
| Styling | Tailwind v4 — `@theme` in globals.css, no config file |
| React | 19.2.4 |
| Fonts | Fraunces (headings) + Inter (body) via `next/font/local` |
| Backend | None — static + client state |
| Form state | React `useState` in client components |
| Data passing | Base64-encoded JSON URL param: `/report?d=<encoded>` |
| Submission capture | `console.log` + localStorage + TODO comment for webhook |

---

## 3. Brand Tokens (Unchanged)

```css
--color-cream: #F3EFE6;
--color-ink:   #2B2622;
--color-gold:  #C9A24B;
--color-stone: #9A9082;
--color-white: #FFFFFF;
--font-display: var(--font-fraunces), Georgia, serif;
--font-body:    var(--font-inter), system-ui, sans-serif;
```

---

## 4. Pages

| Route | Component | Type |
|---|---|---|
| `/` | `app/page.tsx` | Server |
| `/assessment` | `app/assessment/page.tsx` | Server wrapper, client wizard |
| `/report` | `app/report/page.tsx` | Server (reads searchParams) |

---

## 5. File Structure

```
app/
  page.tsx                            ← Home (updated)
  assessment/
    page.tsx                          ← Assessment shell
  report/
    page.tsx                          ← Relationship Snapshot shell
  components/
    NavBar.tsx                        ← Updated: nav links + assessment CTA
    Footer.tsx                        ← Minor copy update
    StickyMobileCTA.tsx               ← Updated: "Start Assessment"
    sections/
      Hero.tsx                        ← Rewritten: corporate narrative
      OurBelief.tsx                   ← Adapted: relationship infrastructure
      HowItWorks.tsx                  ← Rewritten: Understand/Prepare/Execute/Learn
      ForCompanies.tsx                ← New: use cases grid
      SnapshotPreview.tsx             ← New: teases Relationship Snapshot
      Coverage.tsx                    ← Kept
      FAQ.tsx                         ← Updated: corporate Q&As
      FinalCTA.tsx                    ← Updated: "Start Relationship Assessment"
      # Retired: TrustBar, RelationshipStatement, WhyAniye, GiftTypes,
      #          TrustSection, EarlyPromise (content absorbed into new sections)
    assessment/
      AssessmentWizard.tsx            ← Client component, manages step state
      steps/
        StepOrganization.tsx          ← Step 1
        StepContact.tsx               ← Step 2
        StepScope.tsx                 ← Step 3
        StepReview.tsx                ← Step 4
    report/
      RelationshipSnapshot.tsx        ← Main report component
      ExecutiveInsight.tsx            ← Personalized headline finding
      ExecutiveSummary.tsx            ← Org overview table
      MaturityModel.tsx               ← Level 1-4, score bar
      WhatWeFound.tsx                 ← Breakdown of findings
      ActionPlan.tsx                  ← 90-day plan
      SnapshotCTA.tsx                 ← "First Relationship Program" CTA

lib/
  assessment.ts                       ← Form types + AssessmentData interface
  scoring.ts                          ← Heuristic scoring + insight generation
  constants.ts                        ← Updated with assessment WhatsApp URL
```

---

## 6. Homepage — Narrative Arc

Each section answers the next question in the visitor's mind.

| # | Section | Visitor question answered |
|---|---|---|
| 1 | NavBar | "Where am I? How do I start?" |
| 2 | Hero | "What is Aniyé, and why does it matter?" |
| 3 | OurBelief (dark) | "Do they understand our problem?" |
| 4 | HowItWorks | "How does Aniyé actually work?" |
| 5 | ForCompanies | "Is this built for an organization like mine?" |
| 6 | SnapshotPreview | "What will I get from the assessment?" |
| 7 | Coverage | "Do they operate in our markets?" |
| 8 | FAQ | "What are the specifics?" |
| 9 | FinalCTA | "I'm ready to start." |

### NavBar
- Logo (left) + nav links: "How It Works" · "For Companies" · "Assessment"
- CTA button (right, desktop): "Start Assessment" — gold bg, ink text
- Mobile: logo + hamburger-free (just logo + sticky bottom CTA)

### Hero
- H1: "Never miss the moments that matter."
- Subtext: "Aniyé helps organizations recognize employees, clients, and partners across Africa through thoughtful relationship programs and concierge fulfillment."
- Primary CTA: "Start Relationship Assessment" (gold button)
- Secondary CTA: "Talk to Aniyé" (WhatsApp link, text style)
- Monogram watermark (keep existing treatment)

### OurBelief (dark section, adapted)
- H2: "Relationships are the infrastructure of every great organization."
- Body: Relationships with employees, clients, and partners define organizational culture. Yet most organizations miss the moments that matter most — not from lack of care, but lack of system.

### HowItWorks (rewritten)
- H2: "How Aniyé Works"
- 4 steps: Understand · Prepare · Execute · Learn
  1. Understand: "We learn your organization, your people, and the moments that matter to them."
  2. Prepare: "We build your relationship calendar, source trusted local partners, and prepare fulfillment."
  3. Execute: "We coordinate every moment — from sourcing to delivery — so nothing is missed."
  4. Learn: "Every completed moment feeds back into your organization's relationship intelligence."
- Bottom CTA: "See How It Works For Your Team" → assessment link

### ForCompanies (new section)
- H2: "Built for Organizations That Value Their People"
- Audience chips: HR · People Ops · Executive Assistants · Founders · Customer Success · Partnerships
- Moments grid (adapted from GiftTypes): Employee Birthdays, Work Anniversaries, New Hires, Promotions, Farewells, Client Appreciation, Partner Gifts, Executive Gifting, Seasonal Recognition, Remote Team Moments

### SnapshotPreview (new section, dark)
- H2: "Your Relationship Snapshot"
- Body: "Complete the assessment and receive your organization's Relationship Snapshot — an executive summary of your relationship landscape, maturity level, and 90-day action plan."
- Preview card (visual mockup):
  - Shows the executive summary format (company name, groups, countries, moments, maturity)
  - Shows "Relationship Maturity: Level 2 — Developing"
  - Shows "90-Day Action Plan" label
- CTA: "Start Your Assessment →"

### Coverage
- Keep existing. Minor copy: "We support relationship programs across Africa."

### FAQ (updated for corporate)
- "What is a Relationship Snapshot?" / "How long does the assessment take?" (5 minutes) / "What happens after I submit?" / "Do you integrate with HR software?" / "Which countries do you operate in?" / "What does 'concierge fulfillment' mean?"

### FinalCTA
- H2: "Let's Build Your First Relationship Program"
- Body: "Start with your Relationship Assessment. We'll show you where your organization stands and what to do next."
- CTA: "Start Relationship Assessment" (gold, full/auto width)
- Secondary: "Talk to Aniyé" (WhatsApp text link)

---

## 7. Assessment Wizard

**Client component with local `useState` step management.**

### Step Labels (conversational)
- Step 1: "Tell us about your organization"
- Step 2: "Who should we work with?"
- Step 3: "Help us understand your relationships"
- Step 4: "You're almost there"

### Step 1 — Organization
| Field | Type | Required |
|---|---|---|
| Company name | text | yes |
| Website | text | no |
| Industry | select | yes |
| Employee count | select (1–50, 51–200, 201–1000, 1000+) | yes |
| Countries of operation | text (comma-separated) | yes |

Industries: Technology, Financial Services, Healthcare, Retail/FMCG, Professional Services, NGO/Development, Government, Education, Media, Other

### Step 2 — Contact
| Field | Type | Required |
|---|---|---|
| Your name | text | yes |
| Your role | select | yes |
| Email address | email | yes |
| Phone / WhatsApp | text | no |

Roles: HR Director/Manager, People Operations, Executive Assistant, Founder/CEO, Customer Success, Partnerships, Marketing, Other

### Step 3 — Relationships
| Field | Type | Required |
|---|---|---|
| Who do you recognize? | multi-select | yes (min 1) |
| What moments matter? | multi-select | yes (min 1) |
| How do you manage this today? | radio | yes |
| Approximate annual moments | number | no |
| Countries where recipients are located | text | no |
| What is your biggest challenge? | multi-select | no |

Who: Employees, Clients, Partners, Board, Investors, Suppliers, Other
Moments: Birthdays, Work anniversaries, New hires, Promotions, Farewells, Holidays/seasonal, Client milestones, Custom events
Process: No system, Memory/calendar, Excel/Sheets, HR software, Assistant/EA, WhatsApp
Challenges: Forgetting important moments, Coordinating across multiple countries, Finding reliable vendors, Tracking deliveries, Budget approvals, Manual reminders, Knowing what to send, Other

### Step 4 — Review
- Summary of all answered fields
- "Edit" link per section
- "Complete Your Assessment" button
- Micro-copy: "Your Relationship Snapshot will be ready immediately."

### Submission
```typescript
// On submit:
console.log("[Aniyé Assessment Submission]", formData);
localStorage.setItem("aniye_last_submission", JSON.stringify({ ...formData, submittedAt: new Date().toISOString() }));
// TODO: Send to Airtable/Google Sheets/Notion webhook here
// Endpoint: process.env.NEXT_PUBLIC_SUBMISSION_WEBHOOK_URL
const encoded = btoa(JSON.stringify(formData));
router.push(`/report?d=${encoded}`);
```

---

## 8. Relationship Snapshot

**Server component. Reads `searchParams.d`, decodes, calls scoring, renders.**

### Section 1 — Executive Insight
One personalized paragraph generated from actual submission data.

Logic: Combine top challenge(s) + country count + process type + primary relationship group.

Example: "Your organization manages relationships across [N] countries using primarily [process]. This creates the greatest operational risk around [primary challenge], particularly for [top relationship group]."

Never generic. Always references at least 3 data points from the submission.

### Section 2 — Executive Summary
```
[Company Name]                    [Industry]
─────────────────────────────────────────────
People who matter     [relationship groups, comma-separated]
Countries represented [count derived from both fields]
Relationship groups   [count]
Key moment types      [top 3 moments listed]
Estimated annual moments [number or "Not specified"]
Current process       [process label]
─────────────────────────────────────────────
Prepared by Aniyé Africa · [date]
```

### Section 3 — Relationship Maturity
```
Relationship Maturity
Level [1|2|3|4] of 4
[Label: Foundational | Developing | Progressing | Advanced]
[Score bar — gold fill, cream bg]
[2-sentence interpretation using their specific data]
```

Maturity levels:
- Level 1 — Foundational (0–25): No formal system. Moments happen ad hoc.
- Level 2 — Developing (26–50): Some awareness. Manual tracking. Gaps across countries.
- Level 3 — Progressing (51–75): Structured intent. Opportunities to systematize and scale.
- Level 4 — Advanced (76–100): Systematic approach. Ready to optimize and expand.

### Section 4 — What We Found
4 finding cards:
- Relationship Groups: [n] identified
- Moment Types: [n] mapped
- Geographic Reach: [n] countries
- Process Maturity: [label]
- Primary Challenge: [top challenge(s)]

### Section 5 — 90-Day Action Plan
Personalized from submission data.

**Immediate Priorities** (2–3, derived from challenges selected):
- Mapped from challenge → action: e.g. "Forgetting moments" → "Build a relationship calendar for [top group]"

**Suggested First Relationship Program** (derived from top moment type + top group):
- e.g. "Start with employee birthday recognition — your largest relationship group with the clearest recurring cycle."

**Highest-Priority Countries** (from recipient countries field):
- List countries if provided, else: "Define your primary country of operation to prioritize fulfillment."

**Operational Improvements** (from process + challenges):
- e.g. "Replace manual reminders with a structured 90-day recognition calendar."

**Recommended Next Step:**
- "Schedule a consultation to turn this Snapshot into your first active Relationship Program."

### Section 6 — CTA
- H2: "Let's Build Your First Relationship Program"
- Body: "Your Relationship Snapshot is the starting point. Aniyé will work with you to turn insight into execution."
- Primary: "Schedule a Consultation" (gold button → WhatsApp)
- Secondary: "Continue on WhatsApp" (text link)
- Footer note: "This Snapshot is Version 1 of your organization's Relationship Profile."

---

## 9. Scoring Logic

```typescript
// lib/scoring.ts

export function computeScore(data: AssessmentData): number {
  let score = 0;

  // Relationship groups (max 24)
  score += Math.min(data.whoRecognize.length * 4, 24);

  // Moment types (max 24)
  score += Math.min(data.whatMoments.length * 4, 24);

  // Geographic complexity (max 20)
  const countryCount = parseCountries(data.recipientCountries).length;
  if (countryCount === 0) score += 8;
  else if (countryCount === 1) score += 20;
  else if (countryCount <= 3) score += 14;
  else score += 8;

  // Process maturity (max 32)
  const processScore: Record<string, number> = {
    'No system': 0,
    'Memory/calendar': 8,
    'Excel/Sheets': 12,
    'WhatsApp': 14,
    'Assistant/EA': 20,
    'HR software': 32,
  };
  score += processScore[data.currentProcess] ?? 0;

  return Math.min(score, 100);
}

export function getMaturityLevel(score: number): { level: number; label: string } {
  if (score <= 25) return { level: 1, label: 'Foundational' };
  if (score <= 50) return { level: 2, label: 'Developing' };
  if (score <= 75) return { level: 3, label: 'Progressing' };
  return { level: 4, label: 'Advanced' };
}

export function generateExecutiveInsight(data: AssessmentData): string {
  const countryCount = parseCountries(data.recipientCountries).length
    || parseCountries(data.operatingCountries).length;
  const process = data.currentProcess;
  const topGroup = data.whoRecognize[0] ?? 'your people';
  const topChallenge = data.biggestChallenges[0] ?? null;

  let insight = `Your organization manages relationships`;
  if (countryCount > 1) {
    insight += ` across ${countryCount} countries`;
  }
  insight += ` using ${process === 'No system' ? 'no formal system' : process.toLowerCase()}`;
  if (topChallenge) {
    insight += `. The greatest operational risk is around ${topChallenge.toLowerCase()}`;
  }
  insight += `, particularly for ${topGroup.toLowerCase()} recognition.`;
  return insight;
}
```

---

## 10. constants.ts Updates

```typescript
export const WHATSAPP_URL = "https://wa.me/2348074827676?text=Hi%20Aniy%C3%A9%20Africa%2C%0A%0AI%27d%20like%20to%20send%20a%20gift.%0A%0ARecipient%20Country%3A%0AOccasion%3A%0ABudget%3A%0APreferred%20Delivery%20Date%3A";
export const WHATSAPP_ASSESSMENT_URL = "https://wa.me/2348074827676?text=Hi%20Aniy%C3%A9%20Africa%2C%0A%0AI%27ve%20completed%20the%20Relationship%20Assessment%20and%20would%20like%20to%20discuss%20my%20Relationship%20Snapshot.";
export const WHATSAPP_NUMBER = "+234 807 482 7676";
export const EMAIL = "helloaniyeafrica@gmail.com";
```

---

## 11. Out of Scope

- Authentication / login
- SaaS dashboard
- Vendor/courier portal
- Payment systems
- HRIS integrations
- File upload parsing (UI placeholder only if included)
- Real-time webhook (TODO comment only)
- PDF export of Snapshot (future feature)
