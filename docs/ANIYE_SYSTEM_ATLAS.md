# Aniyé Africa — System Atlas

> **Master architectural map for the Aniyé platform.**
> Before adding any major feature, consult this document.
> Every feature must answer the four questions in §12 before implementation begins.

---

## 1. Purpose of Aniyé

Aniyé helps organizations never miss the moments that matter.

Behind every strong organization are people and relationships maintained through consistent, intentional recognition — employees who feel seen, clients who feel valued, partners who feel trusted. Aniyé is the infrastructure that makes that possible across Africa.

**Core belief:** Relationships are the infrastructure of every great organization.

**What Aniyé does:**
- Gives organizations a structured way to identify, plan, and execute relationship moments
- Brings African gifting intelligence — local context, local vendors, local delivery
- Scales human care across geographies, time zones, and organizational complexity

---

## 2. The Current MMP

**Live at:** https://aniye-africa-landing.vercel.app

**Routes:**
| Route | Type | Purpose |
|-------|------|---------|
| `/` | Server Component | Homepage — narrative arc from problem to solution |
| `/assessment` | Server + Client | 4-step Relationship Assessment wizard |
| `/report` | Server Component | Relationship Snapshot (decoded from URL param `?d=`) |

**Assessment flow:**
1. Tell us about your organization (company, industry, headcount, countries)
2. Who should we work with? (contact details)
3. Help us understand your relationships (who, what moments, process, challenges)
4. You're almost there (review + submit)

**Submission handling:**
- `console.log` for debug visibility
- `localStorage` persistence under key `aniye_assessment`
- TODO: webhook to CRM/Notion/Airtable on submission

**Data passing pattern:**
```
btoa(unescape(encodeURIComponent(JSON.stringify(data)))) → URL param ?d=
JSON.parse(decodeURIComponent(escape(atob(encoded)))) → report page decode
```

**Scoring model (heuristic, v1):**
- Relationship groups × 4 (max 24)
- Moment types × 4 (max 24)
- Geography breadth (max 20)
- Process maturity (max 32)
- Total: 0–100 → Level 1–4 Maturity

**Maturity levels:**
| Level | Label | Score |
|-------|-------|-------|
| 1 | Foundational | 0–25 |
| 2 | Developing | 26–50 |
| 3 | Progressing | 51–75 |
| 4 | Advanced | 76–100 |

**Future arc:** Assessment → Snapshot → Consultation → Organization Profile → Workspace → Programs → Execution → Learning → Intelligence

---

## 3. The Nine Platform Domains

Every feature belongs to exactly one domain.

| # | Domain | Responsibility |
|---|--------|---------------|
| 1 | **Identity** | Authentication, authorization, organization accounts, user roles, permissions |
| 2 | **People** | Person records, people sources, imports, canonical profile management |
| 3 | **Relationship Engine** | Relationship classes, policies, programs, moment scheduling, rules |
| 4 | **Gift Intelligence** | Intent → Category → Collection → Item mapping, vendor catalog, curation |
| 5 | **Fulfillment** | Order creation, vendor routing, delivery tracking, proof of delivery |
| 6 | **Knowledge** | Memory records, relationship history, interaction timeline, notes |
| 7 | **Integrations** | HR systems, CRMs, calendars, webhooks, API consumers |
| 8 | **Insights** | Analytics, spend reports, engagement scores, program performance |
| 9 | **Platform** | Feature flags, versioning, migrations, audit logs, infrastructure |

---

## 4. Canonical Data Model

These are the core objects of the Aniyé platform. All features operate on these objects. No external system's schema should override these definitions.

### Organization
The top-level account. One organization may have multiple workspaces.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `name` | Legal or trading name |
| `industry` | Standardized industry label |
| `country` | Primary country of operation |
| `operatingCountries` | All countries where the org has presence |
| `employeeCount` | Headcount band |
| `maturityLevel` | Current relationship maturity (1–4) |
| `createdAt` | ISO timestamp |

### Workspace
An operational unit within an organization (e.g., Nigeria HQ, East Africa). An organization starts with one workspace.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `organizationId` | Parent org |
| `name` | Workspace label |
| `currency` | Default currency for budgets |
| `timezone` | Primary timezone |

### Person
Any individual tracked in Aniyé — employee, client, partner, board member.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `workspaceId` | Owning workspace |
| `firstName` | — |
| `lastName` | — |
| `email` | Primary email |
| `phone` | Optional |
| `country` | Delivery country |
| `role` | Job title or role |
| `startDate` | Employment or relationship start |
| `birthday` | Optional (day/month, no year required) |
| `sourceId` | Reference to originating PeopleSource record |
| `tags` | Array of freeform tags |

### Relationship Class
A named group of people who receive similar treatment (e.g., "Executive Leadership", "VIP Clients").

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `workspaceId` | — |
| `name` | Label (see §8 for examples) |
| `description` | Optional |
| `memberCount` | Computed |

### Relationship Policy
Rules governing how a Relationship Class is recognized for a specific moment type.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `relationshipClassId` | — |
| `momentType` | e.g., "Birthday", "Work Anniversary", "Promotion" |
| `budgetPerPerson` | Currency amount |
| `approvalWorkflow` | None / Manager / Finance / Executive |
| `giftPreferences` | Array of preferred categories or tags |
| `deliveryRequirements` | e.g., "Hand-delivered", "Courier only" |
| `proofRequired` | Boolean |
| `reportingRequired` | Boolean |

### Program
A planned, recurring or one-off recognition initiative (e.g., "Q4 Client Appreciation").

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `workspaceId` | — |
| `name` | — |
| `momentType` | — |
| `status` | Draft / Preview / Approved / Active / Completed |
| `startDate` | — |
| `endDate` | Optional |
| `budget` | Total allocated |
| `relationshipClasses` | Classes in scope |

### Moment
A single recognized instance — one person, one occasion.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `programId` | Parent program (optional for ad hoc) |
| `personId` | Recipient |
| `momentType` | Standardized type label |
| `scheduledDate` | When it should be executed |
| `status` | Pending / Approved / Fulfilled / Missed |
| `giftItemId` | Selected item |

### Gift / Item
A curated product or experience available for gifting.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `vendorId` | Source vendor |
| `name` | — |
| `description` | — |
| `intent` | Celebrate / Welcome / Appreciate / Comfort / Festive |
| `category` | Parent category |
| `collectionId` | Curated collection |
| `priceNGN` | Price in NGN |
| `availableCountries` | Delivery coverage |
| `images` | Array of URLs |
| `tags` | Freeform |

### Fulfillment
Tracks delivery of a gift for a specific Moment.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `momentId` | — |
| `vendorOrderId` | External reference |
| `status` | Pending / Dispatched / Delivered / Failed |
| `trackingUrl` | Optional |
| `deliveredAt` | ISO timestamp |
| `proofUrl` | Photo or document |
| `notes` | — |

### Memory
A record of a past relationship interaction, used to build the Relationship Profile.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `personId` | — |
| `momentId` | Optional |
| `type` | Gift / Note / Call / Event |
| `summary` | Free text |
| `date` | — |
| `createdBy` | User who logged it |

### Insight
A computed or AI-generated observation about relationship health.

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `scope` | Organization / Workspace / Class / Person |
| `scopeId` | — |
| `type` | MissedMoment / SpendAnomaly / EngagementDrop / Recommendation |
| `body` | Human-readable text |
| `generatedAt` | ISO timestamp |
| `dismissed` | Boolean |

---

## 5. Corporate Journey

The end-to-end path for an organization adopting Aniyé.

```
Homepage
  └─ Assessment (4-step wizard)
       └─ Snapshot (Relationship Snapshot report)
            └─ Email Verification (confirm contact)
                 └─ Organization Profile (full org setup)
                      └─ Workspace Onboarding (name, currency, timezone)
                           └─ Relationship Classes (define who matters)
                                └─ Policies (budget, approval, preferences per class)
                                     └─ Programs (create first recognition program)
                                          └─ Execution (moments dispatched, gifts sent)
                                               └─ Learning (reports, insights, memory)
```

**Stage gates:**
- Assessment → Snapshot: no auth required, URL-encoded data
- Snapshot → Organization Profile: email verification required
- Organization Profile → Workspace: first-time setup wizard
- Programs → Execution: at least one Relationship Class + Policy required

---

## 6. Individual Journey

The path for a single person using Aniyé to send a gift.

```
Homepage
  └─ Individual path (entry intent selection)
       └─ Intent (Celebrate / Welcome / Appreciate / Comfort / Festive)
            └─ Category (e.g., Food & Drink, Experiences, Home)
                 └─ Collection (curated set of items for the intent)
                      └─ Item (specific product selection)
                           └─ Recipient (name, address, delivery country)
                                └─ Delivery (date, method, message)
                                     └─ Confirmation (order summary + tracking)
```

> **Note:** The individual journey is a future horizon. Current MMP focuses entirely on the corporate journey.

---

## 7. Gift Intelligence Model

Aniyé's gift catalog is structured around human intent, not product taxonomy.

### Intents
| Intent | Meaning |
|--------|---------|
| **Celebrate** | Milestone moments — birthdays, promotions, anniversaries, new hires |
| **Welcome** | Onboarding, first impressions, new relationships |
| **Appreciate** | Gratitude, recognition, thank you |
| **Comfort** | Condolences, bereavement, illness, hardship |
| **Festive** | Seasonal — Christmas, Eid, New Year, Diwali |

### Hierarchy
```
Intent
  └─ Category (e.g., Food & Drink, Wellness, Experiences, Home & Living)
       └─ Collection (curated group for a specific occasion/audience)
            └─ Item (specific product from a Vendor)
                 └─ Vendor (supplier fulfilling the item)
```

### Rules
- Every Item maps to exactly one Intent
- Items may belong to multiple Collections
- Collections are curated by Aniyé — not auto-generated from vendor catalogs
- Vendor availability is per-country
- Budget-tiered recommendations: given a budget, surface appropriate items within that range

---

## 8. Relationship Class and Policy Model

### Standard Relationship Classes

**Internal (Employees):**
- Executive Leadership
- Directors
- Managers
- Staff

**External (Clients):**
- VIP Clients
- Strategic Clients
- Standard Clients

**Governance:**
- Board
- Investors

**Partners & Supply:**
- Partners
- Suppliers

> Organizations can create custom classes. These are templates to accelerate setup.

### Policy Model

Each class can have one Policy per moment type. Example:

**Employee Birthday Program:**

| Class | Budget per Person | Approval |
|-------|------------------|----------|
| Executive Leadership | $500 | CEO |
| Directors | $250 | Manager |
| Managers | $150 | Manager |
| Staff | $75 | None |

**Policy fields per class × moment type:**
- Budget allocation (per-person amount)
- Approval workflow (None / Manager / Finance / Executive)
- Gift preferences (preferred categories, excluded items)
- Delivery requirements (courier, hand-delivered, digital)
- Proof required (photo, signature)
- Reporting needs (monthly summary, per-event receipt)

---

## 9. HR Integration Groundwork

### People Source Abstraction

Aniyé defines its own canonical Person model. No HR system's schema dictates Aniyé's internal structure.

**PeopleSource** is an abstraction layer. All external data maps into canonical Person records before entering Aniyé.

### Supported Source Types (by horizon)

| Source | Type | Horizon |
|--------|------|---------|
| Manual entry | Built-in | H1 |
| CSV upload | Built-in | H2 |
| Excel upload | Built-in | H2 |
| Google Sheets | Integration | H3 |
| BambooHR | Integration | H3 |
| HiBob | Integration | H3 |
| Deel | Integration | H4 |
| Workday | Integration | H4 |
| SAP HCM | Integration | H4 |
| Oracle HCM | Integration | H4 |

### Mapping Contract

Every PeopleSource connector must produce:

```typescript
interface CanonicalPersonImport {
  externalId: string;        // source system's identifier
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  country?: string;
  role?: string;
  startDate?: string;        // ISO date
  birthday?: string;         // MM-DD format
  department?: string;
  tags?: string[];
}
```

Aniyé's import pipeline validates, deduplicates, and maps this into the canonical `Person` model. Downstream systems never touch raw HR data.

---

## 10. Platform Resilience Principles

### Configuration Lifecycle
All major configuration (Relationship Classes, Policies, Programs) follows:

```
Draft → Preview → Approve → Publish
```

- **Draft**: editable, not active
- **Preview**: locked for review, simulation available
- **Approve**: sign-off recorded with timestamp and user
- **Publish**: live, immutable until a new draft is created

### Database & API Rules
- Versioned APIs: `/api/v1/`, `/api/v2/` — old versions supported for ≥1 major version
- Backward-compatible migrations: additive only; columns removed only after deprecation period
- Progressive migrations: large data migrations run in background jobs, never blocking deploys
- No downtime deploys: blue/green or rolling; zero-downtime is the default expectation

### Feature Flags
New capabilities ship behind flags. Flags are:
- Named by domain: `identity.email_verification`, `engine.programs`, `integrations.bamboohr`
- Boolean by default; percentage rollout for gradual releases
- Cleaned up within one major version of GA

### Boundary Rule
No HR platform, CRM, or external system should ever dictate Aniyé's internal data model. External data is always translated at the integration boundary. Aniyé's canonical model is the source of truth.

---

## 11. Horizon Roadmap

| Horizon | Theme | Key Deliverables |
|---------|-------|-----------------|
| **H1** | Assessment + Snapshot | Homepage, Assessment wizard, Relationship Snapshot, concierge fulfillment (manual, WhatsApp-led) |
| **H2** | Organization Profile | Email verification, org profile setup, workspace onboarding, Relationship Profile v1 |
| **H3** | Programs + Policies | Relationship classes, policies, programs, people imports (CSV/Excel), first automated moments |
| **H4** | Integrations + Intelligence | HR integrations (BambooHR, HiBob, Deel), AI-generated insights, automated scheduling |
| **H5** | Relationship Infrastructure | Multi-workspace, multi-country operations, partner network, full Relationship OS across Africa |

---

## 12. Build Rule

Before implementing any feature, answer all five questions:

1. **Which domain does it belong to?**
   One of: Identity, People, Relationship Engine, Gift Intelligence, Fulfillment, Knowledge, Integrations, Insights, Platform

2. **Which canonical object does it affect?**
   One or more of: Organization, Workspace, Person, Relationship Class, Relationship Policy, Program, Moment, Gift/Item, Fulfillment, Memory, Insight

3. **Which user does it serve?**
   - Organization admin setting up the workspace
   - Manager executing a program
   - Approver reviewing a moment
   - Individual gifting a person
   - Aniyé ops team managing concierge fulfillment

4. **Which horizon does it belong to?**
   H1 through H5. Features in a later horizon should not block or entangle features in an earlier one.

5. **Does it improve execution, learning, trust, or customer value?**
   - **Execution**: makes it faster or easier to recognize people
   - **Learning**: generates better data, insights, or memory
   - **Trust**: increases reliability, auditability, or compliance
   - **Customer value**: measurably improves outcomes for the organization or recipient

If a feature cannot clearly answer all five questions, it is not ready to be built.

---

*System Atlas v1.0 — Aniyé Africa — June 2026*
*Maintained alongside the codebase. Update when platform direction changes.*
