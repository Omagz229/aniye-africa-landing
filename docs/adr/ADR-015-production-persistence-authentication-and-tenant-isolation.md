# ADR-015 — Production persistence, authentication and tenant isolation for H4.0

**Status: Accepted · Not implemented**
**Date drafted:** 2026-08-18
**Date revised:** 2026-08-18 — second and third revisions, addressing Council feedback on the first two drafts
**Date accepted:** 2026-08-18 — Council, with corrections 2–4 from the third-revision review verified and applied; correction 1 (a proposed filename change) was not applied because `CloseMomentPanel.tsx` does not exist in this repository — `ClosurePanel.tsx` is canonical and its ADR-015 citation is unchanged
**Targets:** H4.0 (Pre-pilot completion)

> **Accepted · Not implemented.** Acceptance authorizes the architecture below for later
> implementation; it does not deliver a backend. No ADR-010 gate row, and nothing in this document,
> should be described as satisfied, addressed, built, or proven until implementation exists and is
> validated against it. Per `CLAUDE.md`, this accepted ADR now governs structural implementation
> alongside the latest applicable Atlas definitions.

## Context

ADR-010 (2026-07-27) put every operational record behind a repository interface and named, in its
own "mandatory gates" table, exactly what a production adapter needs that the `localStorage` adapter
does not: server-side persistence, authentication, enforced multi-tenancy, and secure file storage.
`RELATIONSHIP_OPERATIONS_ATLAS.md` §8 restates the same table and is explicit that authentication is
required **"for both customer administrators and internal operators"** — not internal operators
alone. §8 also states the current rule this ADR narrows:

> **Anyone who can reach the app can reach `/operations`.** ... any proposal assuming a role or
> permission check is blocked (ADR-010, Atlas §15b).

`docs/MASTER_ROADMAP.md` names H4.0's own [P] set as including **"a backend with real tenant
isolation and access control"** — pulled forward from the checkpoint's milestone 13, which the
Council already agreed (`MASTER_ROADMAP.md`, the H5.1 non-deferral note) "does not wait for H5."
This ADR is the first proposal that assumes authentication and a real backend exist, and it is only
valid to write because H4.0 is the point the roadmap names for that assumption to start being true.

**Where the gate actually binds.** Atlas §8 is explicit that the full ADR-010 gate — all four
mandatory rows — binds "at the controlled pilot (H4.1), and independently at whatever moment an
external party is first given access," and that **no H3 milestone requires it**. H4.0 is pre-pilot:
this ADR, once accepted, governs the capability that later implementation must build for the gate to
check at H4.1 — acceptance authorizes that work, it does not perform it, and building it later does
not itself satisfy the gate or make H4.1 pilot-ready — see **Relationship to ADR-010** below.

**Three things this ADR must not do**, because the surrounding documents are explicit that they
remain open:

1. **Invent an operator role or permission model.** `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 **OPS-U1**
   ("operator roles and permissions") is classified 🟠, blocking **H5.1**, not H4.0. `MASTER_ROADMAP.md`
   names H5.1 itself as "Production backend, authentication, **roles**, real tenant isolation" —
   `roles`, in the granular sense of a permission matrix, is H5.1's word. ADR-005's Council condition
   that Workspace and Operations "use separate route trees, shells, **roles** and navigation" uses
   `roles` at the surface-separation level — administrator surface versus operator surface — not as a
   permission hierarchy within either surface. Atlas §8's "Authorization: Role-based, per ADR-005"
   row for the pilot means the same surface-level distinction, not a matrix this ADR must build.
2. **Decide whether the pilot involves more than one organization.** Checkpoint open question 1,
   tracked as **CP-U1**, is unresolved and blocks **H4.1**, not H4.0 — "decides how much of H5.1 must
   land before H4.1" (`MASTER_ROADMAP.md`, same H5.1 note). The checkpoint's own completion test for
   the full backend milestone — "two organizations coexist with no cross-visibility, proven by test"
   — is **H5.1's test**. This ADR requires later implementation to prove the same *isolation
   mechanism* with synthetic workspaces (Decision §2), without deciding how many *real* organizations
   the pilot itself will have.
3. **Decide whether policy approval is required.** Checkpoint open question 2, tracked as **CP-U2**,
   is classified ⚪ not blocking — "`Approval` stays deferred indefinitely" unless a near-term customer
   requires it. This ADR builds no approval object or workflow.

**Two facts further constrain the shape of the decision:**

- There is currently **no backend at all**. `package.json` carries `next`, `react`, `react-dom` and
  no server, database, ORM or auth dependency. This is a from-scratch architecture decision, not a
  migration of an existing one — but from-scratch does not mean the browser prototype's history is
  irrelevant; see Decision §3 on cutover.
- `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 **OPS-U4b** (QA and adjudication taxonomy) records that it
  "becomes blocking at **H4.0**" because H4.0 adds customer-facing Moment visibility (trigger 4). That
  trigger is **ADR-017's** concern, not this one — noted here only so the boundary between the three
  H4.0 ADRs stays visible: this one is the ground the other two stand on, and does not itself touch
  visibility, exception handling, or Recurring/Triggered generation semantics.

## Decision

### 1. Authentication for both principal types; authorization stays a fixed two-type boundary

**Authentication and authorization are distinct, and H4.0 requires both — not merely verified
identity.**

- **Authentication** establishes who is making a request, for **both** principal types Atlas §8
  names: **customer administrators** (Workspace) and **internal Aniyé operators** (Operations).
  Sessions are server-verified on every request; there is no client-trusted identity claim for
  either. This ADR does not introduce a third principal type — vendor, courier or recipient access
  remains exactly as prohibited as ADR-010 already states.
- **Authorization**, at H4.0, is a **fixed principal/access-type boundary, not a granular role
  model**:
  - `CustomerAdministrator` and `InternalOperator` are the only two access types this ADR defines.
  - There is **no operator-role hierarchy, no permission matrix, and no configurable permission**.
    All H4.0 internal operators who are granted access to a workspace share the **same capability
    set** inside it — this ADR does not distinguish a senior operator from a junior one, or a
    commercial-detail viewer from anyone else. That distinction, if it is ever needed, is OPS-U1's
    decision to make, at H5.1.
  - `CustomerAdministrator` similarly carries one capability set inside its own workspace — this ADR
    does not build a Workspace-side permission model either.
  - **Every request derives its workspace context from the authenticated server session** — from a
    membership or access-grant record resolved server-side — **never from a client-supplied
    `workspaceId`**. A request that names a `workspaceId` the session has no grant for is refused at
    the server boundary, not filtered after the fact.
- This narrows ADR-010's and Atlas §8's "assume no authentication and no role or permission check"
  rule to **"assume authenticated administrators and operators, each within one fixed access type
  and no finer role or permission distinction below it."** It does **not** settle OPS-U1's full role
  and permission model, and does not settle what a `CustomerAdministrator`'s eventual permissions look
  like once Workspace itself needs finer distinctions (e.g. a second admin on the same account) —
  that is future work, not this ADR's. The complete boundary of what each access type may reach is
  stated as a deny-by-default matrix in Decision §6.

### 2. Single-workspace operator workflow over enforced multi-tenant storage

> **Single-workspace operator workflow over enforced multi-tenant storage.**

The **product workflow** and the **storage guarantee** are deliberately not the same claim, and this
ADR states both separately so neither is mistaken for the other:

- **Product workflow (H4.0):** one authenticated session — administrator or operator — works inside
  **one explicitly granted workspace** at a time. H4.0 builds **no tenant switcher, no cross-workspace
  portfolio view, and no operation that spans more than one workspace in a single session.** This is
  the shape OPS-U10 (cross-workspace operator workflow) would replace, and OPS-U10 stays deferred to
  H4.1 pending OPS-U1 and CP-U1.
- **Storage guarantee (independent of how many workspaces any one session touches):** the backend
  must
  1. scope **every** persisted record and **every** query to a `workspaceId`;
  2. derive that scope **server-side**, from the session's membership/grant — never from client
     input;
  3. **deny** a forged or mismatched `workspaceId` at the point of the request, not downstream;
  4. **preserve tenant identity through every transaction and audit record** — a Decision, Event, or
     Memory never loses or changes its owning `workspaceId` across the atomic write that created it;
  5. **prove denial using at least two synthetic workspaces** — later implementation must include an
     automated test that creates two workspaces with no real-organization content, authenticates a
     session granted to one, and asserts every attempted read or write against the other is refused,
     matching the shape of the checkpoint's own completion test for the full backend milestone
     (H5.1) without claiming to be that milestone.
- **Synthetic isolation testing does not decide how many real organizations participate in the
  pilot.** Passing the two-synthetic-workspace test is a property of the storage layer, proven with
  data invented for the test — it says nothing about **CP-U1**, which remains unresolved, and nothing
  about **OPS-U10**'s multi-organization operator workflow, which remains deferred to H4.1.
- The narrower H4.0 product workflow does **not** weaken the storage guarantee: the backend enforces
  isolation identically whether the product currently offers a switcher or not. A future workflow
  change (OPS-U10) would change what a session may request, never what the storage layer refuses.

### 3. A new server persistence architecture, with an explicit, non-silent cutover

**This is a from-scratch architecture, not a migration.** `package.json`'s absence of any backend,
database, or authentication dependency supports that — but from-scratch does not remove the need for
an explicit decision about the browser prototype's existing history, so this ADR states one:

- The pilot server workspace **starts empty.** There is **no automatic `localStorage` import, no
  backfill, and no silent adoption** of any existing browser-stored `WorkspaceState` or
  `OperationsState` into the server.
- **Browser state never implicitly becomes server authority.** A record that exists only in a
  browser's `localStorage` has no bearing on what the server considers true, and no code path in
  this ADR reads one to construct the other.
- **`WorkspaceState` v7 and `OperationsState` v9 are prototype client schema versions.** They are not
  automatically the production database schema. The server schema is designed against the same
  canonical objects and the same domain invariants, but its own version numbering, table shapes, and
  migration chain **require an accepted follow-up architecture decision before implementation
  begins** — consistent with Decision §6's list of mechanics this ADR leaves for follow-up governance
  — not a choice made silently in the course of building it. This ADR does not pre-declare the server
  schema equal to, or derived line-for-line from, the client schema.
- **What must survive the adapter replacement, unchanged:** the domain invariants already governed by
  accepted ADRs — immutable, append-only history (ADR-006); named repository operations with no
  generic `save(anything)` (ADR-010); one atomic transaction per confirmation, containing **every
  record the specific named operation requires** — a Decision, an Event, both, or, as
  `CostReconciliation` already shows (no Event, per the Relationship Operations Atlas v2.2 record),
  a Decision with no Event — never assumed to be a fixed Decision-plus-Event shape (ADR-006); the
  independent, additive, one-rung-at-a-time migration discipline already established for both schema
  chains. None of these relax because the adapter is now a server instead of a browser.
- **The named operations are the stable contract; their transport shape is not assumed to carry over
  unchanged.** The current `OperationsRepository` interface (`lib/operations/store.ts`) is
  synchronous — every method returns `StoreResult<T>`, never `Promise<StoreResult<T>>` — and today's
  client components call it, together with `getWorkspace()`, directly through
  `browserOperationsRepository()` (for example `app/components/operations/ClosurePanel.tsx`,
  `CourierDirectory.tsx`, `VendorSelection.tsx`). A server or network boundary is asynchronous by
  nature, and this ADR does **not** claim that synchronous, directly-called shape survives it. What
  is stable is the **named domain operations and the invariants they enforce**; the transport-facing
  shape of that contract — synchronous or asynchronous, direct call or request/response — is expected
  to change. Under this ADR, client components call **authenticated server actions or route
  handlers**; they do not select an adapter or hold a raw repository reference themselves. Existing
  `.mts` validation suites exercise the domain operations' invariants today and are expected to keep
  doing so, but they **may require an asynchronous contract harness** once the transport changes —
  this ADR does not claim they are unaffected by that change.
- **Any later facility to import real prototype data — for a demo, a migration, or a specific
  customer's continuity — requires separate governance and validation.** This ADR neither builds nor
  authorizes one. A caller wanting that must raise its own ADR and its own validation suite; it is
  not a corollary of this one.

### 4. What this ADR governs of ADR-010's gate, and what it explicitly leaves open

**This ADR does not close ADR-010's pilot gate.** It governs three of the gate's four rows, at the
scope stated above, and states plainly what remains:

- **Governed here:** production server-side persistence; authentication for both customer
  administrators and internal operators; enforced tenant access (Decision §2).
- **Not closed by this ADR alone:** the gate's own wording requires authentication **for both**
  principal types **and** enforced multi-tenancy **and** a production backend **and** secure file
  storage, together, "before any external pilot." Building three of the four does not make the pilot
  ready — **H4.1 cannot be described as pilot-ready until every remaining ADR-010 prerequisite is
  satisfied**, including the one this ADR does not touch.
- **Secure proof-file storage is not governed here and remains a separate, unresolved pilot
  prerequisite.** ADR-010's fourth gate stays exactly as open as it already was. **Proof metadata is
  distinct from proof-file storage**: ADR-012 (H3.6) already records proof as metadata only — no
  file, URL, data URI, base64 or Blob, refused at the write boundary — and that remains true and
  unaffected by this ADR. Nothing about proof *files* is decided, built, or newly required here.
  **ADR-017 may not expose a proof file unless separate proof-storage governance is accepted first.**
  Proof-file storage is not automatically ADR-017's responsibility merely because ADR-017 touches
  customer visibility; it remains unassigned until a future ADR — which may or may not be ADR-017 —
  takes it on.

### 5. Authenticated identity populates existing actor fields — nothing new is added to the schema

The relevant record types already expose actor fields built for a world with no authentication:
`Decision.actorId`, `OperationalEvent.actorType`/`actorId`, and `Memory.createdByActorType`/
`createdByActorId` (`lib/operations/types.ts`). ADR-014 explicitly records that
`Memory.createdByActorId` "remains optional because no authenticated user model exists (OPS-U1,
ADR-010) — the same reasoning `Decision.actorId` and `OperationalEvent.actorId` already apply"
(ADR-014 §6, Canonical Memory). This ADR does not add a field to any of them; it decides
how those existing fields get populated once an authenticated user model exists.

- **Every new authenticated human action populates its actor fields from the server session.** A
  `Decision.actorId`, an `OperationalEvent.actorId`, and a `Memory.createdByActorId` are each
  derived from the authenticated identity that made the confirming request — never from anything the
  request body itself supplies.
- **Actor identity and actor type are never trusted from a submitted payload.** A request asserting
  its own `actorId` is refused identically to one asserting a `workspaceId` it has no grant for
  (Decision §1) — the server derives both from the same authenticated session, not from what the
  caller claims.
- **The two access types this ADR defines map onto the existing `ActorType` enum**
  (`ACTOR_TYPES = ['System', 'Operator', 'Customer', 'Vendor', 'Courier']`, `lib/operations/types.ts`)
  without adding a value to it: an `InternalOperator` session records as `Operator`; a
  `CustomerAdministrator` session records as `Customer`. Neither `Vendor` nor `Courier` gains a
  session under this ADR, consistent with Decision §1 and ADR-010's existing prohibition.
- **A newly authenticated Moment closure populates both `Memory.createdByActorId` and the closing
  `MomentClosed` Event's own `actorType`/`actorId` envelope fields** — the top-level actor fields
  every `OperationalEvent` already carries, **not** its six-key `payload`.
  `MOMENT_CLOSED_PAYLOAD_KEYS` (`memoryId`, `fulfilmentId`, `recognitionOrderId`, `outcome`,
  `outcomeDate`, `previousStatus`) is fixed by ADR-014, and this ADR adds nothing to it.
- **Historical records with a missing `actorId` remain valid.** Nothing in this ADR backfills an
  actor onto a Decision, Event, or Memory recorded before authentication existed. Absence continues
  to mean "recorded before an authenticated identity was available," exactly as the existing code
  comments already document — this ADR does not retroactively assign an actor to history that never
  had one.
- **System-authored actions remain `actorType: 'System'`, with no `actorId`.** Automatic Decisions
  such as `MomentQualification` and `PolicyResolution` are not made by an authenticated person, and
  this ADR does not require them to acquire one.

### 6. Deny-by-default access boundary, and mechanics left for follow-up

| Principal | Permitted | Refused |
|---|---|---|
| **Customer administrator** | Its own `/workspace` configuration; the customer-facing views ADR-017 later governs, inside its own workspace only | `/operations`; any internal or commercial record — vendor cost, courier cost, margin, vendor/courier identity, QA exceptions, internal notes (ADR-005); any other workspace |
| **Internal operator** | `/operations` for a workspace it has been explicitly granted; **read-only** Workspace configuration where ADR-005 already permits it | Any write to Workspace configuration (ADR-005); any workspace it has not been granted; any operation spanning more than one workspace in a session (Decision §2) |

This is the complete authorization boundary this ADR defines — nothing narrower or wider than the
two rows above exists for either principal type at H4.0, consistent with Decision §1's "fixed access
type, no permission matrix."

**What this ADR leaves undecided, because deciding it now would exceed its scope:** account
provisioning and invitation, session expiry and revocation, account recovery, the authentication
provider, the database engine, the server schema design and its own migration chain (Decision §3),
the deployment target, and who administers an access grant — who may grant `InternalOperator` access
to a workspace, and who may grant `CustomerAdministrator` access to theirs. None of these has a
governing decision anywhere in this repository today. This ADR does not
decide them by omission — **each requires its own follow-up architecture decision before
implementation begins**, and that decision should be raised and accepted before the first line of
this ADR's implementation is written, not discovered mid-build.

## What this ADR does not decide

Listed, not inferred, per `CLAUDE.md`'s standing rule — each of the following stays exactly as
unresolved, or exactly out of scope, as it already was:

| Not decided or built here | Where it actually gets decided |
|---|---|
| Granular operator roles and a permission matrix | **OPS-U1** — H5.1 |
| Number of real pilot organizations | **CP-U1** — must resolve before H4.1 |
| Multi-organization operator workflow, tenant switching, portfolio views | **OPS-U10** — H4.1, depends on OPS-U1 and CP-U1 |
| Recurring and Triggered Program generation semantics | **ADR-016** |
| Customer-facing Moment visibility, service cases, customer communication, QA/adjudication taxonomy | **ADR-017** / **OPS-U4b** |
| Policy approval objects or workflows | **CP-U2** — currently ⚪, not blocking; not built unless CP-U2 changes |
| Enterprise permissions, SSO, SAML, API keys | **H5.3** |
| Vendor, courier or recipient accounts of any kind | Remains prohibited per ADR-010 until its own gate is met |
| Proof-file upload, retention or access | ADR-010 gate 4 — separate from this ADR; see Decision §4 |
| Automatic import of prototype browser data | Not built here; requires its own future ADR if ever needed |
| Cross-workspace reporting or operations | **OPS-U10** — H4.1 |
| Payment, invoicing, settlement, tax, refund or FX concepts | Deferred exactly as every prior ADR in this project has left them |
| Account provisioning/invitation, session expiry/revocation, recovery, auth provider, database engine, server schema design and migration chain, deployment target, access-grant administration | Not decided here — each requires its own follow-up ADR before implementation (Decision §6) |

## Consequences

- **On acceptance**, this ADR's status becomes **Accepted · Not implemented** — matching how
  ADR-013 and ADR-014 were tracked between Council acceptance and their own build milestones.
  Acceptance authorizes `lib/operations/` and the equivalent Workspace persistence module to gain a
  server adapter reached through authenticated server actions or route handlers, replacing today's
  direct client calls to `browserOperationsRepository()`/`getWorkspace()`; it does **not** itself
  deliver that adapter, and no ADR-010 gate row should be marked implemented until the corresponding
  code is built and validated.
- Existing `.mts` validation suites exercise the named domain operations and their invariants today.
  Once a server adapter exists, they — or a new contract-level suite alongside them — must prove the
  same invariants against it: authentication for both principal types, cross-workspace refusal, actor
  fields correctly populated (Decision §5), and the two-synthetic-workspace denial proof (Decision
  §2). This ADR does not claim any of that proof exists yet, and does not claim the existing suites
  are unaffected by the transport change (Decision §3).
- The browser-only local adapter is **not deleted**. It remains available for local development and
  for the validation suites; nothing in this ADR requires every environment to run the server
  adapter, and nothing in it imports the local adapter's data into the server one (Decision §3).
- `RELATIONSHIP_OPERATIONS_ATLAS.md` §8 and §10 rule 17 ("assume no authentication and no roles") need
  a narrowly-worded amendment **on acceptance**: the rule becomes "assume authenticated administrators
  and operators, each within one fixed access type and no finer permission distinction below it" —
  not "assume full authorization is solved." §10 rule 16's premise (browser-only storage) stops being
  universally true once this adapter exists in an environment that uses it; the rule's *intent* — no
  vendor, courier, or recipient gets access — is unchanged and does not lift with this ADR.
  ADR-014 §6 records that `Memory.createdByActorId` is optional "because no authenticated user model
  exists," applying the same reasoning to `Decision.actorId` and `OperationalEvent.actorId`; the code
  comment on `AddressOverrideRecord.actorType` ("there is no role model") documents the same ADR-010
  assumption independently. Both will need their own correction once implementation, not merely
  acceptance, lands (Decision §5).
- **ADR-010's "mandatory gates before external exposure" table is not marked satisfied by acceptance
  of this ADR.** On acceptance, the table should gain an annotation that persistence, authentication
  (both principal types), and tenant access are **governed** — an accepted architecture exists for
  them — while all four rows, including the three this ADR governs, remain **operationally open**
  until implementation lands and is validated against the invariants above. Secure file storage stays
  open throughout, unaffected by this ADR either way (Decision §4).

## Relationship to earlier decisions

- **Extends ADR-010's intent** that production persistence be an adapter change rather than a
  rewrite of domain logic — while correcting an assumption ADR-010 left implicit. ADR-010's
  repository interface (`OperationsRepository`, `lib/operations/store.ts`) is synchronous and called
  directly from client components; this ADR does not claim that shape survives a server boundary
  unchanged. What survives is the **named-operations contract and the invariants it enforces**
  (Decision §3); the transport becomes asynchronous, server-only, and reached through authenticated
  server actions or route handlers rather than a client-held repository reference. **Does not claim
  to close ADR-010's pilot gate** (Decision §4).
- **Narrows ADR-010's and Atlas §8's "assume no authentication and no role or permission check" rule**
  to "assume authenticated administrators and operators, each a fixed access type with no finer
  permission model" — a partial supersession, not a repeal. The granular-role half of the original
  rule is unchanged and explicitly re-affirmed here, not merely left standing by omission.
- **Reads ADR-005's "separate roles" condition at the surface-separation level** — administrator
  surface versus operator surface, which this ADR's two principal types implement — **not** as
  authorization for a permission hierarchy within either surface. Workspace and Operations remain
  separate shells, route trees and navigation; neither gains an internal role model under this ADR.
- **Leaves ADR-012's proof-metadata decision untouched** and explicitly distinguishes it from the
  still-open proof-file-storage prerequisite (Decision §4).
- **Populates, but does not extend, the actor fields ADR-006, ADR-011 and ADR-014 already defined**
  (`Decision.actorId`, `AddressOverrideRecord.actorType`/`actorId`, `Memory.createdByActorType`/
  `createdByActorId`) — see Decision §5. No prior ADR's field list gains a member.
- **Is the ground that ADR-017 is built on; ADR-016 is not the same dependency.** ADR-017 (customer-facing
  Moment visibility, service cases, QA/adjudication) genuinely depends on this ADR — a customer
  seeing anything at all presupposes an authenticated `CustomerAdministrator` and enforced tenant
  isolation, so ADR-017 should not be reviewed as though those exist until this ADR is accepted.
  ADR-016 (Recurring and Triggered Program generation semantics) is a different kind of decision — it
  governs *what* Programs generate and when, which can be reviewed on its own terms independently of
  authentication; only ADR-016's eventual **implementation** must run against this ADR's backend and
  respect its tenant-isolation and actor-identity rules (Decision §5), not its *review*. Neither ADR
  should be read as accepted until this one is, and neither is begun by this revision.
