# Aniyé Africa — System Atlas

> **Master architectural map for the Aniyé platform.**
> Before adding any major feature, consult this document.
> Every feature must answer the five questions in §19 before implementation begins.

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

## 2. The Current MMP (Horizon 1)

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

**Data passing pattern (stateless, no auth):**
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

**Full platform arc:**
Assessment → Snapshot → Consultation → Organization Profile → Workspace → Relationship Classes → Policies → Programs → Execution → Learning → Intelligence

---

## 3. The Nine Platform Domains

Every feature belongs to exactly one domain. Domain boundaries are strict — no domain reaches into another's objects without going through a defined interface.

| # | Domain | Owns | Does NOT own |
|---|--------|------|-------------|
| 1 | **Identity** | Auth, accounts, users, roles, permissions, API keys | Business logic of any kind |
| 2 | **People** | Person records, PeopleSource connectors, import pipelines, deduplication | Relationship rules, programs |
| 3 | **Relationship Engine** | Relationship Classes, Policies, Programs, Moments, Organization Profile, Relationship Profile | Historical records, vendor intelligence |
| 4 | **Gift Intelligence** | Intent → Category → Collection → Item catalog, curation, budget recommendations | Fulfillment, delivery logistics |
| 5 | **Fulfillment** | Orders, vendor routing, delivery tracking, proof of delivery, communication channels | Catalog management, relationships |
| 6 | **Knowledge** | Interaction history, Memory records, vendor intelligence, country intelligence, delivery intelligence, recommendations | Current operational state |
| 7 | **Integrations** | HR connectors, CRM adapters, calendar sync, webhooks, API consumers, normalization layer | Canonical model definition |
| 8 | **Insights** | Analytics, spend reports, engagement scores, program performance, AI-generated observations | Raw data storage |
| 9 | **Platform** | Feature flags, API versioning, migrations, audit logs, infrastructure configuration | Any business domain |

### Domain Boundary: Relationship Engine vs Knowledge

This boundary is the most important distinction in the platform.

**Relationship Engine** owns the **current operational state**:
- Organization Profile (current configuration of the org)
- Relationship Classes (who the org recognizes, today)
- Relationship Policies (how they recognize each class, today)
- Programs (what recognition initiatives are active or planned)
- Moments (what has been scheduled or is pending)
- Relationship Profile (the live, structured representation of relationship health — updated as programs run)

**Knowledge** owns **historical learning**:
- Memory records (what happened, when, to whom)
- Interaction timeline (chronological record of all moments executed)
- Vendor intelligence (what vendors have delivered well in which countries)
- Country intelligence (cultural context, delivery constraints, lead times)
- Delivery intelligence (what delivery methods work for which recipient profiles)
- Recommendations (derived from history — "this worked last time for this class")

**Rule:** The Relationship Engine looks forward. Knowledge looks backward. If a record describes what *is*, it belongs to the Relationship Engine. If it describes what *was* or what can be *learned*, it belongs to Knowledge.

---

## 4. Canonical Data Model

These are the core objects of the Aniyé platform. All features operate on these objects. No external system's schema overrides these definitions. When an external system provides conflicting structure, it is normalized at the integration boundary.

### Money

A canonical value type used wherever monetary amounts appear. **Never store a number without currency.**

```typescript
interface Money {
  amount: number;     // integer in smallest currency unit (e.g., kobo, cents)
  currency: string;   // ISO 4217 code
}
```

**Supported currencies (v1):**
| Code | Currency | Country |
|------|----------|---------|
| NGN | Nigerian Naira | Nigeria |
| KES | Kenyan Shilling | Kenya |
| GHS | Ghanaian Cedi | Ghana |
| ZAR | South African Rand | South Africa |
| USD | US Dollar | Cross-border / international |

All budget fields, item prices, and spend reports use `Money`. Display formatting is locale-aware. Cross-border programs store amounts in the workspace's base currency with a recorded exchange rate at time of approval.

---

### Organization

The top-level account. One organization may have multiple workspaces.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `name` | string | Legal or trading name |
| `industry` | string | Standardized industry label |
| `country` | string | ISO 3166-1 alpha-2 primary country |
| `operatingCountries` | string[] | All countries where the org has presence |
| `employeeCount` | string | Headcount band |
| `maturityLevel` | 1–4 | Current relationship maturity |
| `status` | enum | Prospect / Verified / Active / Suspended |
| `createdAt` | ISO timestamp | — |

---

### Workspace

An operational unit within an organization (e.g., Nigeria HQ, East Africa). An organization starts with one workspace.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `organizationId` | UUID | Parent org |
| `name` | string | Workspace label |
| `baseCurrency` | string | ISO 4217 default currency for budgets |
| `timezone` | string | IANA timezone (e.g., Africa/Lagos) |
| `status` | enum | Onboarding / Active / Suspended |

---

### Organization Profile

The structured, validated configuration of an organization in Aniyé. Distinct from the Relationship Snapshot (see §7).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `organizationId` | UUID | — |
| `completionStage` | enum | Snapshot / Verified / Workspace / Classes / Policies / Programs / Active |
| `snapshotData` | JSON | Preserved output of initial Assessment |
| `contactName` | string | Primary contact |
| `contactEmail` | string | Verified email |
| `contactRole` | string | — |
| `verifiedAt` | ISO timestamp | When email was confirmed |
| `lastUpdatedAt` | ISO timestamp | — |

**Lifecycle:** Assessment → Snapshot → Email Verification → Organization Profile → Workspace → Classes → Policies → Programs → Active

---

### Relationship Profile

A live, structured representation of an organization's relationship health — owned by the Relationship Engine, updated as programs execute.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `organizationId` | UUID | — |
| `maturityLevel` | 1–4 | Current maturity, recalculated on each program cycle |
| `classCount` | number | Total Relationship Classes defined |
| `activeProgramCount` | number | Programs currently running |
| `momentsThisYear` | number | Moments executed in current calendar year |
| `coverageCountries` | string[] | Countries where moments have been delivered |
| `lastActivityAt` | ISO timestamp | Most recent executed moment |
| `version` | number | Increments on each recalculation |

> **Relationship Snapshot vs Relationship Profile:**
> The **Snapshot** is a one-time diagnostic report generated from the Assessment — a point-in-time picture for a prospect. It requires no account.
> The **Relationship Profile** is a live operational record updated as the organization runs programs — it belongs to a verified, active organization. The Snapshot is Version 0 of the Profile.

---

### Person

Any individual tracked in Aniyé — employee, client, partner, board member.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `workspaceId` | UUID | Owning workspace |
| `firstName` | string | — |
| `lastName` | string | — |
| `email` | string | Primary email |
| `phone` | string? | Optional |
| `country` | string | ISO 3166-1 alpha-2 delivery country |
| `role` | string? | Job title or relationship role |
| `startDate` | ISO date? | Employment or relationship start |
| `birthday` | string? | MM-DD format (no year required) |
| `sourceId` | UUID? | Reference to originating PeopleSource record |
| `relationshipClassIds` | UUID[] | Classes this person belongs to |
| `tags` | string[] | Freeform |
| `status` | enum | Active / Inactive / Archived |

---

### Relationship Class

A named group of people who receive similar recognition treatment. Classes are configurable per workspace.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `workspaceId` | UUID | — |
| `name` | string | Label |
| `tier` | enum | Internal / External / Governance / Ecosystem |
| `description` | string? | Optional context |
| `memberCount` | number | Computed from Person records |
| `isCustom` | boolean | `false` for standard templates, `true` for org-created |
| `status` | enum | Draft / Active / Archived |

**Standard classes by tier (see §11 for full list).**

---

### Relationship Policy

Rules governing how a Relationship Class is recognized for a specific moment type. Programs reference Policies — they do not own budget or approval rules directly.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `relationshipClassId` | UUID | Owning class |
| `momentType` | string | Standardized moment label (e.g., Birthday, Work Anniversary) |
| `budgetPerPerson` | Money | Per-person spend limit |
| `approvalWorkflow` | enum | None / Manager / Finance / Executive |
| `giftPreferences` | string[] | Preferred category tags |
| `excludedCategories` | string[] | Categories not appropriate for this class |
| `deliveryRequirement` | enum | Standard / Courier / HandDelivered / Digital |
| `preferredDeliveryWindow` | string? | e.g., "3 business days before date" |
| `proofRequired` | boolean | — |
| `reportingRequired` | boolean | — |
| `status` | enum | Draft / Preview / Approved / Published / Archived |

---

### Program

A planned, recurring or one-off recognition initiative. Programs reference Relationship Policies — they do not redefine rules.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `workspaceId` | UUID | — |
| `name` | string | e.g., "Q4 Client Appreciation 2026" |
| `momentType` | string | — |
| `status` | enum | Draft / Preview / Approved / Active / Completed / Cancelled |
| `startDate` | ISO date | — |
| `endDate` | ISO date? | Optional for recurring |
| `totalBudget` | Money | Allocated program budget |
| `relationshipClassIds` | UUID[] | Classes in scope |
| `policySnapshot` | JSON | Copy of applicable policies at time of Approval (immutable reference) |
| `createdBy` | UUID | User |
| `approvedBy` | UUID? | User |
| `approvedAt` | ISO timestamp? | — |

---

### Moment

A single recognized instance — one person, one occasion, one execution.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `programId` | UUID? | Parent program (null for ad hoc) |
| `personId` | UUID | Recipient |
| `momentType` | string | Standardized type label |
| `scheduledDate` | ISO date | When it should execute |
| `status` | enum | Pending / Approved / Dispatched / Fulfilled / Missed / Cancelled |
| `giftItemId` | UUID? | Selected item |
| `policyId` | UUID? | Governing policy |
| `budget` | Money | Approved spend for this moment |

---

### Gift / Item

A curated product or experience. The customer experiences Items — vendor information is secondary.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `vendorId` | UUID | Source vendor (not exposed to end customer) |
| `name` | string | — |
| `description` | string | — |
| `intent` | enum | Celebrate / Welcome / Appreciate / Comfort / Festive |
| `category` | string | Parent category label |
| `collectionIds` | UUID[] | Curated collections this item appears in |
| `price` | Money | Retail price as shown to customer |
| `vendorCost` | Money | Internal cost (not customer-facing) |
| `availableCountries` | string[] | ISO codes for delivery coverage |
| `images` | string[] | URLs |
| `tags` | string[] | Freeform |
| `status` | enum | Draft / Active / OutOfStock / Discontinued |

---

### Fulfillment

Tracks delivery execution. The Fulfillment Object is the system of record. WhatsApp and other communication channels are execution tools only.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `momentId` | UUID | — |
| `vendorOrderId` | string? | External vendor reference |
| `status` | enum | Pending / Confirmed / Dispatched / Delivered / Failed / Returned |
| `channel` | enum | Platform / WhatsApp / Email / Phone / Manual |
| `trackingUrl` | string? | — |
| `estimatedDeliveryDate` | ISO date? | — |
| `deliveredAt` | ISO timestamp? | — |
| `proofUrl` | string? | Photo, signature, or document |
| `notes` | string? | Internal ops notes |
| `updatedAt` | ISO timestamp | Last status change |

---

### Memory

A record of a past relationship interaction. Owned by Knowledge. Never modified after creation — append only.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `personId` | UUID | — |
| `momentId` | UUID? | Optional link to the triggering Moment |
| `fulfillmentId` | UUID? | Optional link to execution record |
| `type` | enum | Gift / Note / Call / Visit / Event / Milestone |
| `summary` | string | Human-readable description |
| `date` | ISO date | When it happened |
| `createdBy` | UUID | User who logged it (or system) |
| `createdAt` | ISO timestamp | — |

---

### Insight

A computed or AI-generated observation about relationship health. Owned by Insights domain.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | — |
| `scope` | enum | Organization / Workspace / Class / Person |
| `scopeId` | UUID | — |
| `type` | enum | MissedMoment / SpendAnomaly / EngagementDrop / Recommendation / Milestone |
| `body` | string | Human-readable text |
| `confidence` | 0–1 | Model confidence (1.0 for deterministic rules) |
| `generatedAt` | ISO timestamp | — |
| `expiresAt` | ISO timestamp? | When the insight becomes stale |
| `dismissed` | boolean | — |
| `dismissedBy` | UUID? | — |

---

## 5. Three Key Documents — Definitions

These three documents are frequently confused. Their differences are structural.

| Document | Owner | Auth Required | Lifecycle | Purpose |
|----------|-------|--------------|-----------|---------|
| **Relationship Snapshot** | Prospect (no account) | No | Generated once from Assessment, URL-encoded | Point-in-time diagnostic. Version 0 of the Profile. |
| **Relationship Profile** | Verified Organization | Yes | Live, updated on each program cycle | Operational health record. Lives in Relationship Engine. |
| **Organization Profile** | Verified Organization | Yes | Setup wizard, then maintained | Org configuration, contact verification, workspace settings. Lives in Identity + Relationship Engine. |

---

## 6. Progressive Trust

Progressive Trust is a core platform principle. Aniyé earns depth of relationship with each organization gradually, unlocking capabilities as trust and data increase. No stage forces the user to do more than they are ready for.

```
Visitor
  └─ Assessment (no auth, no account)
       └─ Relationship Snapshot (instant value, no commitment)
            └─ Email Verification (identity confirmed)
                 └─ Organization Workspace (account created)
                      └─ Organization Profile (org context established)
                           └─ Relationship Classes (who matters defined)
                                └─ Policies (how to recognize them)
                                     └─ People Import (who they are)
                                          └─ Programs (recognition in motion)
                                               └─ HR Integrations (automated people sync)
                                                    └─ Automation (moments auto-scheduled)
                                                         └─ Intelligence (AI-driven recommendations)
```

**Stage gate rules:**
- Each stage requires completing the previous stage
- No stage requires purchasing before experiencing value
- Concierge fulfillment (WhatsApp-led) bridges Snapshot → Programs before the platform is fully configured
- Feature flags control which stages are available to which organizations

---

## 7. Corporate Journey

The end-to-end operational path for an organization adopting Aniyé.

```
Homepage
  └─ Assessment (4-step conversational wizard)
       └─ Relationship Snapshot (executive report, no auth)
            └─ Consultation (WhatsApp or call — Aniyé concierge)
                 └─ Email Verification (confirms identity)
                      └─ Workspace Creation (name, currency, timezone)
                           └─ Organization Profile (industry, headcount, countries)
                                └─ Relationship Classes (define who matters)
                                     └─ Relationship Policies (budget, approval, delivery rules per class)
                                          └─ People Import (manual, CSV, or HR connector)
                                               └─ Programs (create and schedule recognition initiatives)
                                                    └─ Execution (moments dispatched, gifts fulfilled)
                                                         └─ Relationship Profile (updated, versioned)
                                                              └─ Knowledge (history, memory, intelligence)
```

**Stage gates:**
| Gate | Requirement |
|------|-------------|
| Assessment → Snapshot | None |
| Snapshot → Verification | Valid email address |
| Verification → Workspace | Email link confirmed |
| Workspace → Classes | Workspace name, currency, timezone |
| Classes → Policies | At least one Relationship Class |
| Policies → People | At least one Policy per Class |
| People → Programs | At least one Person in a Class |
| Programs → Execution | Program in Approved status |

---

## 8. Individual Journey (Horizon 2)

The path for a single person using Aniyé to send a gift. Organized around human **Intent**, not product taxonomy or occasion.

```
Homepage
  └─ Choose: Individual
       └─ Intent (Celebrate / Welcome / Appreciate / Comfort / Festive)
            └─ Category (e.g., Food & Drink, Wellness, Experiences, Home & Living)
                 └─ Collection (curated set for this intent + context)
                      └─ Item (specific product, prominently featured)
                           └─ Recipient (name, delivery address, country)
                                └─ Delivery (date, method, personal message)
                                     └─ Confirmation (order summary + tracking)
                                          └─ Memory (moment recorded — foundation of future intelligence)
```

**Key principles:**
- The customer buys from **Aniyé**, not from a vendor. Vendor information is internal.
- Navigation starts from Intent — not "What are you looking for?" but "What do you want to express?"
- Each completed order creates a Memory record — the beginning of relationship intelligence for individual users.
- Individual journey feeds the Knowledge domain, enabling personalized recommendations over time.

> **Horizon:** Individual journey is scoped to Horizon 2. Current MMP (H1) is corporate-only.

---

## 9. Gift Intelligence

Aniyé's catalog is structured around human intent. The customer experiences curation — not a product database.

### Intent Hierarchy

```
Intent  (what the giver wants to express)
  └─ Category  (type of gift)
       └─ Collection  (curated set for a specific context)
            └─ Item  (the specific product)
                 └─ Vendor  (internal only — who fulfills it)
```

### The Five Intents

| Intent | Expresses | Example Occasions |
|--------|-----------|------------------|
| **Celebrate** | Pride, acknowledgment of achievement | Birthdays, promotions, anniversaries, new hires, graduations |
| **Welcome** | Warmth, belonging, first impressions | Onboarding, first meeting, new partnership |
| **Appreciate** | Gratitude, recognition | Thank you, above-and-beyond performance, loyalty |
| **Comfort** | Empathy, presence during difficulty | Bereavement, illness, loss, hardship |
| **Festive** | Shared celebration of season | Christmas, Eid, New Year, Diwali, national holidays |

### Catalog Rules

- Every Item maps to exactly **one Intent**
- Items may appear in **multiple Collections** (a collection is a curation, not an exclusive container)
- Collections are curated by Aniyé's team — never auto-generated from vendor feeds
- Vendor availability is recorded per country
- Budget tiers inform surfacing: given a budget, show Items within ±20% of that range first
- Items are priced in `Money` — always with currency, never as a bare number

### The Vendor Boundary

The customer buys from **Aniyé**. The vendor is a fulfillment partner.

- Vendor names, margins, and internal costs are never shown to the end customer
- If a vendor discontinues an item, Aniyé replaces it with an equivalent — the customer sees continuity
- Vendor performance feeds Knowledge (delivery intelligence) — not the Gift Intelligence catalog directly
- The Item is the product. The Vendor is the mechanism.

---

## 10. Relationship Classes (Full Reference)

Relationship Classes are configurable per workspace. The list below contains standard templates. Organizations may add custom classes at any time.

### Standard Classes by Tier

**Internal — Employees:**
| Class | Typical Use |
|-------|------------|
| Executive Leadership | C-suite, founders |
| Senior Leadership | VPs, Directors |
| Managers | People managers |
| Employees | All remaining staff |

**External — Clients:**
| Class | Typical Use |
|-------|------------|
| VIP Clients | Highest-value, strategic accounts |
| Strategic Clients | Growth-stage, high-potential accounts |
| Standard Clients | Active customer base |

**Governance:**
| Class | Typical Use |
|-------|------------|
| Board Members | Board of directors |
| Investors | Active shareholders, LPs |

**Ecosystem:**
| Class | Typical Use |
|-------|------------|
| Strategic Partners | Deep collaboration relationships |
| Partners | Channel or referral partners |
| Suppliers | Vendors and service providers |
| Government | Regulatory contacts, public sector relationships |
| Media | Press, journalists, content partnerships |
| Community | NGO, foundation, civic relationships |

**Flexibility rules:**
- Organizations can rename any standard class to match their internal language
- Organizations can create additional classes beyond this list
- Classes can be archived (not deleted) to preserve historical records
- A Person may belong to multiple classes (e.g., a client who is also an investor)

---

## 11. Relationship Policy Model

Every Relationship Class may have one Policy per moment type. Programs reference these Policies — they do not redefine rules.

### Policy Fields

| Field | Purpose |
|-------|---------|
| `momentType` | The occasion this policy governs (Birthday, Promotion, Anniversary, etc.) |
| `budgetPerPerson` | Money object — per-person spend limit |
| `approvalWorkflow` | None / Manager / Finance / Executive |
| `giftPreferences` | Preferred category tags (e.g., "Food & Drink", "Wellness") |
| `excludedCategories` | Categories inappropriate for this class |
| `deliveryRequirement` | Standard / Courier / HandDelivered / Digital |
| `preferredDeliveryWindow` | e.g., "3 business days before the date" |
| `proofRequired` | Whether a delivery photo or signature is needed |
| `reportingRequired` | Whether a per-event receipt is generated |

### Policy Lifecycle

```
Draft → Preview → Approve → Publish
```

- **Draft**: editable, not yet applied to any Program
- **Preview**: locked for review; simulation of upcoming moments can be run
- **Approve**: sign-off recorded with approver ID and timestamp
- **Publish**: live, governs all active Programs referencing this class
- A new Draft can be created from any Published policy; the Published version remains active until the new version is Approved and Published

### Example: Employee Recognition Program

**Birthday Program:**

| Class | Budget / Person | Approval | Delivery |
|-------|----------------|----------|----------|
| Executive Leadership | NGN 500,000 | CEO | Hand-delivered |
| Senior Leadership | NGN 250,000 | Manager | Courier |
| Managers | NGN 150,000 | Manager | Standard |
| Employees | NGN 75,000 | None | Standard |

**Work Anniversary (5-year):**

| Class | Budget / Person | Approval | Proof Required |
|-------|----------------|----------|---------------|
| Executive Leadership | NGN 1,000,000 | CEO | Yes |
| Senior Leadership | NGN 500,000 | Manager | Yes |
| Managers | NGN 250,000 | Manager | No |
| Employees | NGN 150,000 | None | No |

---

## 12. Integration Layer — People Sources

### Canonical Abstraction

Aniyé defines its own Person model. No HR system's schema dictates Aniyé's internal structure. Every external source is normalized at the integration boundary before touching the canonical model.

```
External HR System
      ↓
  Connector (source-specific adapter)
      ↓
  Normalization (maps to CanonicalPersonImport)
      ↓
  Validation (required fields, format checks)
      ↓
  Deduplication (email-based match, merge rules)
      ↓
  Canonical Person record
```

### Supported People Sources

| Source | Type | Horizon |
|--------|------|---------|
| Manual entry | Built-in | H1 |
| CSV upload | Built-in | H2 |
| Excel upload | Built-in | H2 |
| Google Sheets | Integration | H3 |
| BambooHR | Integration | H3 |
| HiBob | Integration | H3 |
| Personio | Integration | H3 |
| Rippling | Integration | H4 |
| Deel | Integration | H4 |
| Workday | Integration | H4 |
| SAP SuccessFactors | Integration | H4 |
| Oracle HCM | Integration | H4 |

### Canonical Import Interface

Every connector must produce this shape before entering Aniyé:

```typescript
interface CanonicalPersonImport {
  externalId: string;       // source system's unique identifier
  firstName: string;
  lastName: string;
  email: string;            // primary deduplication key
  phone?: string;
  country?: string;         // ISO 3166-1 alpha-2
  role?: string;
  startDate?: string;       // ISO 8601 date
  birthday?: string;        // MM-DD (no year)
  department?: string;
  manager?: string;         // external ID of manager
  tags?: string[];
  rawSource?: Record<string, unknown>; // preserved for audit, never used in logic
}
```

### Normalization Rules

- Email is the primary deduplication key across all sources
- If a person exists with the same email, the import updates their record and logs the change
- If a person exists with a different email but matching name + startDate, flag as a **conflict** requiring manual review — do not auto-merge
- Fields from a later import overwrite earlier fields unless marked `locked` by an admin
- The `rawSource` field is stored but never used in downstream logic — Aniyé's canonical model is authoritative

### Synchronization

- Push sync: HR system notifies Aniyé via webhook on record changes
- Pull sync: Aniyé polls the HR system on a configurable schedule (default: daily)
- Full refresh: replaces all records from source; used on initial import and on request
- Delta sync: processes only changes since last sync; preferred for ongoing operation

### Conflict Resolution

| Scenario | Resolution |
|----------|-----------|
| New person, no match | Create canonical Person |
| Email match, same source | Update in place, log change |
| Email match, different source | Update in place, record both source IDs |
| Name + startDate match, different email | Flag for manual review, do not auto-merge |
| Person removed from source | Mark `status: Inactive` — never auto-delete |
| Field conflict between two active sources | Prefer the source with higher configured priority |

### Event Handling

HR integration events that trigger downstream actions in Aniyé:

| Event | Aniyé Action |
|-------|-------------|
| `person.created` | Create Person record, assign to default Relationship Class if configured |
| `person.updated` (birthday) | Reschedule any pending Birthday moments |
| `person.updated` (startDate) | Recalculate Work Anniversary dates |
| `person.deactivated` | Mark Person inactive, cancel pending Moments, notify admin |
| `person.reactivated` | Restore Person, prompt admin to review |
| `sync.failed` | Notify admin, halt dependent automation, log incident |

---

## 13. Fulfillment Architecture

### WhatsApp Is a Channel, Not a System of Record

The Fulfillment Object is the system of record. WhatsApp, email, phone, and any other communication tool are execution channels only. If a delivery update happens over WhatsApp, it must be recorded back into the Fulfillment Object before it has any operational meaning.

### Fulfillment Flow

```
Moment (Approved)
      ↓
  Fulfillment Object created (status: Pending)
      ↓
  Channel selected (Platform / WhatsApp / Email)
      ↓
  Vendor notified (internal — not shown to customer)
      ↓
  Fulfillment Object updated (status: Confirmed)
      ↓
  Dispatch (status: Dispatched, tracking URL recorded)
      ↓
  Delivery (status: Delivered, deliveredAt recorded)
      ↓
  Proof captured (proofUrl recorded if required)
      ↓
  Memory record created (Knowledge domain)
      ↓
  Moment marked: Fulfilled
```

### In H1 (Concierge Mode)

During H1, fulfillment is concierge-led:

1. Assessment → Snapshot
2. User contacts Aniyé via WhatsApp
3. Aniyé team creates Fulfillment Object manually
4. All status updates are logged into the Fulfillment Object (even if communicated over WhatsApp)
5. Completion creates a Memory record
6. The Fulfillment Object — not the WhatsApp thread — is what counts

This ensures clean data exists from day one and the migration to automated fulfillment in H3 requires no data archaeology.

---

## 14. Configuration Lifecycle

All major configuration objects follow this lifecycle. No configuration goes live without an Approve step.

```
Draft → Preview → Approve → Publish
```

**Applies to:**
- Relationship Policies
- Programs
- Budgets (program-level and workspace-level)
- Organization Settings (workspace currency, timezone, default policies)
- Major platform configuration (feature flags, API keys, integration settings)

| Stage | State | Who Can Act | What Happens |
|-------|-------|-------------|-------------|
| **Draft** | Editable | Creator, admins | Changes saved, not active |
| **Preview** | Locked | Reviewer | Simulation of upcoming moments can be run; no real actions |
| **Approve** | Approved | Designated approver | Sign-off recorded with user ID + timestamp |
| **Publish** | Live | System | Configuration is active; governs all downstream objects |
| **Archive** | Inactive | Admin | Preserved for history; a new Draft can begin |

**Rule:** A Published configuration is immutable. To change it, create a new Draft. The currently Published version remains active until the new version reaches Published state.

---

## 15. Platform Resilience

### API Versioning
- All APIs are versioned: `/api/v1/`, `/api/v2/`
- A version is supported for ≥12 months after the next version ships
- Breaking changes require a new version number; additive changes do not
- Deprecation notices appear in API responses 90 days before sunset

### Database Migrations
- Additive only: new columns, new tables, new indexes
- Never drop or rename a column without a deprecation period
- Large data migrations run as background jobs — never blocking deploys
- Every migration is reversible or has a documented rollback procedure

### Feature Flags
- Named by domain: `identity.email_verification`, `engine.programs`, `integrations.bamboohr`
- Boolean by default; percentage rollout available for gradual releases
- Cleaned up within one major version of general availability
- No feature flag should outlive its horizon

### Deployment
- Zero-downtime deploys: blue/green or rolling
- Every deploy is reversible within 10 minutes
- Production deploys require a passing build and all integration tests green

### The Boundary Rule
No external system dictates Aniyé's internal model. All external data is translated at the integration boundary. Aniyé's canonical model is the only source of truth.

---

## 16. Enterprise Readiness (Architectural Foundations)

These capabilities are not built yet. They are documented here to ensure architectural decisions made in H1–H3 do not block their implementation in H4–H5.

### Multiple Administrators
- Every Workspace will support multiple users with distinct roles
- Role model: Owner / Admin / Manager / Viewer
- Permissions are workspace-scoped; a user may have different roles in different workspaces
- Implementation: role-based access control (RBAC), not hardcoded permissions

### Workspace Permissions
- Fine-grained permissions on sensitive operations: Approve Programs, Approve Spend, Import People, Manage Integrations
- Permission sets are configurable by workspace Owners

### Audit Logs
- Every state-changing action is recorded: who, what, when, from where
- Audit logs are append-only and never purged
- Exportable for compliance reporting
- Scope: Organization, Workspace, or object-level (e.g., all changes to a specific Program)

### Version History
- All major configuration objects (Policies, Programs, Organization Profile) maintain a version history
- Any previous version can be viewed and compared
- Rollback to a previous Published version is supported

### Import History
- Every People import creates an Import Record: source, timestamp, rows processed, conflicts flagged, outcome
- Import Records are retained indefinitely
- Admins can audit who imported what and when

### API Keys
- Organizations will be able to generate API keys scoped to specific operations
- Keys are rotatable without service interruption
- Key usage is logged

### Enterprise Integrations
- SAML/SSO for identity federation (Azure AD, Okta, Google Workspace)
- Scheduled integration health reports
- Integration-level permissions (who can configure, who can view sync status)

> **Build rule:** Every H1–H3 decision should be answerable by: "Does this close off any of the enterprise capabilities above?" If yes, reconsider.

---

## 17. Horizon Roadmap

| Horizon | Theme | Key Deliverables |
|---------|-------|-----------------|
| **H1** | Assessment + Snapshot | Homepage, Assessment wizard, Relationship Snapshot, concierge fulfillment (manual, WhatsApp-led), Fulfillment Object architecture |
| **H2** | Organization Profile + Individual Journey | Email verification, workspace creation, Organization Profile, Relationship Profile v1, Individual gifting flow (Intent → Memory), basic People import (CSV/Excel) |
| **H3** | Relationship Programs | Relationship Classes, Policies, Programs, People import automation, first scheduled moments, Google Sheets connector, BambooHR, HiBob, Personio |
| **H4** | Integrations + Intelligence | HR integrations (Rippling, Deel, Workday, SAP, Oracle), AI-generated Insights, automated moment scheduling, Relationship Profile v2, spend analytics |
| **H5** | Relationship Infrastructure | Multi-workspace, multi-country operations, enterprise permissions, API keys, SAML/SSO, partner network, full Relationship OS across Africa |

---

## 18. Open Questions (Resolve Before H2)

These decisions should be resolved before H2 implementation begins:

| # | Question | Implication |
|---|----------|-------------|
| 1 | **Budget currency default** — does a workspace's `baseCurrency` default all Policy budgets, or must each Policy specify currency explicitly? | Affects how cross-border programs handle multi-currency spend |
| 2 | **Individual journey auth** — does the individual gifting flow in H2 require account creation, or can it run as a guest checkout? | Determines whether Memory records can be attributed to a persistent user |
| 3 | **Concierge handoff protocol** — what is the exact format of the Fulfillment Object created during H1 concierge mode? A structured internal form is needed before H2 so data isn't recreated from scratch | Clean migration from manual to automated fulfillment in H3 |
| 4 | **Relationship Profile versioning trigger** — what events cause the Relationship Profile `version` to increment? On every moment? On every program cycle? On a schedule? | Determines how "current maturity" is calculated and displayed |
| 5 | **Person deduplication authority** — if two People Sources provide conflicting data for the same email, which source wins? Is this configurable per workspace? | Affects all H3 import pipeline logic |

---

## 19. Build Rule

Before implementing any feature, answer all five questions. If any answer is unclear, the feature is not ready to build.

1. **Which domain does it belong to?**
   Identity / People / Relationship Engine / Gift Intelligence / Fulfillment / Knowledge / Integrations / Insights / Platform

2. **Which canonical object does it affect?**
   Organization / Workspace / Organization Profile / Relationship Profile / Person / Relationship Class / Relationship Policy / Program / Moment / Gift/Item / Fulfillment / Memory / Insight / Money

3. **Which user does it serve?**
   - Visitor exploring the platform
   - Prospect completing an Assessment
   - Verified organization admin setting up a workspace
   - Manager creating or approving a Program
   - Approver reviewing a Moment
   - Individual gifting a person
   - Aniyé ops team managing concierge fulfillment

4. **Which horizon does it belong to?**
   H1 through H5. Features in a later horizon must not block or entangle features in an earlier one.

5. **Does it improve execution, learning, trust, or customer value?**
   - **Execution** — makes it faster or easier to recognize people
   - **Learning** — generates better data, insights, or memory over time
   - **Trust** — increases reliability, auditability, or compliance confidence
   - **Customer value** — measurably improves outcomes for the organization or recipient

---

*System Atlas v2.0 — Aniyé Africa — June 2026*
*Maintained alongside the codebase. Update this document whenever platform direction changes.*
*Previous version: v1.0 (initial, June 2026)*
