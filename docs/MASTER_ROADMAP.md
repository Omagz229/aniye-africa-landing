# Aniyé Africa — Master Roadmap

> **This is the authoritative roadmap.** Council decision, 2026-07-28.
>
> Before this document existed, the roadmap was distributed across three sources that had drifted
> apart: `ANIYE_SYSTEM_ATLAS.md` §17 (thematic horizons), `H2_H3_ARCHITECTURE_CHECKPOINT.md` Part 3
> (implementation pathway, numbered 1–13), and `RECOVERY_LEDGER.md` §0/§10 (reconstruction
> sequence, numbered H3.1–H3.5). The three disagreed on what H3 contained and in what order.
>
> **H3.x governs roadmap reporting.** The checkpoint's milestone numbers are preserved and mapped
> below so both sources stay readable, but where they conflict, this document wins.

**Governing companions:** [`ANIYE_SYSTEM_ATLAS.md`](ANIYE_SYSTEM_ATLAS.md) for what the platform is ·
[`ANIYE_EXPERIENCE_DOCTRINE.md`](ANIYE_EXPERIENCE_DOCTRINE.md) for how it feels ·
[`adr/`](adr/) for binding decisions · [`RECOVERY_LEDGER.md`](RECOVERY_LEDGER.md) for reconstruction state.

---

## Status at a glance

| | Value |
|---|---|
| **Workspace schema** | **v7** — `lib/migrations.ts` |
| **`OperationsState` schema** | **v5** — `lib/operations/types.ts`, versioned independently (ADR-010) |
| **Last completed milestone** | **H3.5** — Courier directory + manual selection. **Directory scoped per country; coverage authority is the countries on current confirmed Execution Briefs** |
| **Next milestone** | **H3.6** — Fulfilment tracking. **Governance resolved (ADR-012); not begun; one correction pending** |
| **Milestones** | **23 of 37 complete** — see *Milestone count* |
| **Blocking H3.6** | ✅ **Governance resolved** — [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md), 2026-07-30. ✅ **H3.3/H3.4-D1 complete.** ⚠️ **The policy-snapshot v5 → v6 migration remains** — see *Before H3.6 may begin* |
| **Outstanding** | ⚠️ **Live responsive testing on real devices** — still never performed. Browser verification at emulated widths is not a substitute; it is a pre-pilot **[P]** item (H4.0) |
| **Blocking the pilot (H4.1)** | ⛔ Production backend, authentication, multi-tenancy, secure file storage (ADR-010). **This gate does not bind on any H3 milestone** |

---

## Horizons

| Horizon | Theme | State |
|---------|-------|-------|
| **H0** | Foundation — retrospective label for pre-roadmap work | ✅ Complete |
| **H1** | Assessment + Snapshot | ✅ Complete |
| **H2** | Configure — Organization Profile through Programs | ✅ Complete |
| **H3** | Operational execution — the closed loop | 🔨 In progress (5 of 8 done) |
| **H4** | Learn — pilot, then intelligence built on its evidence | ⬜ Not started |
| **H5** | Relationship Infrastructure — backend, enterprise, **integrations** | ⬜ Not started |

---

## H0 — Foundation

**H0 is a newly approved retrospective roadmap label** (Council, 2026-07-28) for foundation and
recovery work that was **completed before a canonical roadmap existed**.

**The work itself is not new and was not invented here.** Every milestone below shipped, is present
in the repository, and is recorded in [`RECOVERY_LEDGER.md`](RECOVERY_LEDGER.md) with the release
that landed it. What was missing was a roadmap identifier — which is why this work kept being
described as "not a reconstruction milestone" and fell outside every count. H0 gives it one.

| # | Milestone | Landed | State |
|---|-----------|--------|-------|
| H0.1 | Schema versioning foundation — `schemaVersion`, ordered migration runner, backup, quarantine, `typecheck` | R1 | ✅ |
| H0.2 | Experience Doctrine integration | R3a | ✅ |
| H0.3 | Aniyé Experience Audit — 28 findings | Audit | ✅ |
| H0.4 | Experience Correction E1 — all Programs-gating findings closed | E1 | ✅ |
| H0.5 | H2 → H3 Architecture Checkpoint | Checkpoint | ✅ |
| H0.6 | Council acceptance of ADR-004 … ADR-009 | R4 | ✅ |
| H0.7 | Governance reconciliation — ADR-011, this roadmap, Relationship Operations Atlas | R6 | ✅ |

---

## H1 — Assessment + Snapshot

| # | Milestone | State |
|---|-----------|-------|
| H1.1 | Landing page | ✅ |
| H1.2 | Assessment wizard | ✅ |
| H1.3 | Relationship Snapshot report | ✅ |
| H1.4 | Concierge fulfillment — manual, WhatsApp-led; Fulfillment Object architecture | ✅ (architecture; Atlas §13) |

**Outstanding pre-pilot debt:** **EX-H1** — assessment autosave. ~15 fields are still lost on refresh.

---

## H2 — Configure

An organization can describe who matters, how each group is recognized, which rule reaches whom,
who its people are, and what it has committed to. **Complete.**

| # | Milestone | Schema | Landed | State |
|---|-----------|--------|--------|-------|
| H2.1 | Organization Workspace foundation, verification gate | v1 | — | ✅ |
| H2.2 | Relationship Classes | v2 (ADR-002) | R1 | ✅ |
| H2.3 | Recognition Policies / Policy Library | — | — | ✅ |
| H2.4 | Policy Assignments | v3 | R2 | ✅ |
| H2.5 | People Sources and People | v4 | R3 | ✅ |
| H2.6a | Money as integer minor units; Person lifecycle | v5 | R4 | ✅ |
| H2.6 | Campaign Programs | v6 | R5 | ✅ |

**Outstanding pre-pilot debt:** **EX-H3** — `PolicyForm` guided rebuild (463 lines, six sections,
one page); **EX-M5** — policy draft autosave, which depends on it.

---

## H3 — Operational execution

**The minimum closed operational loop.** The smallest sequence that takes a configured organization
to a delivered, costed, closed recognition. Everything not on this path is deferred.

**Council decision, 2026-07-28:** the H3 sequence below replaces the pre-checkpoint definition in
`RECOVERY_LEDGER.md`, which listed H3.3–H3.5 as Catalog, Gift and Vendor **Intelligence**. Those are
**deferred to H4.2 – H4.4**, behind the pilot.

| # | Milestone | Checkpoint Part 3 | Depends on | Class | State |
|---|-----------|:---:|---|:---:|-------|
| **H3.1** | **Operational Foundation + Moment Engine** — `OperationsState`, the `/operations` shell, Moment generation with per-Moment policy snapshot, Decisions and Operational Events | 3 | H2.6 | **[R]** | ✅ **Complete** |
| **H3.2** | **Execution Brief** — an operator-facing brief per Moment: recipient, address, budget, constraints; the address gate, operator override and governed revision | 4 | H3.1 · ADR-011 / schema v7 | **[R]** | ✅ **Complete** |
| **H3.3** | **Minimum Catalog + manual item selection** — a flat item list filtered by budget and excluded categories; operator selects one | 5 | H3.2 · `OperationsState` v3 | **[R]** | ✅ **Complete** |
| **H3.4** | **Vendor directory, hand-entered offers + manual selection** | 6 | H3.3 · `OperationsState` v4 | **[R]** | ✅ **Complete** |
| **H3.5** | **Courier directory + manual selection** — a **country-scoped** directory; coverage measured against the countries on current confirmed Execution Briefs | 7 | H3.4 · `OperationsState` v5 | **[R]** | ✅ **Complete** |
| **H3.6** | **Fulfilment tracking** — dispatch → delivered → proof, with failure and redelivery paths | 8 | H3.5 · **ADR-012** · two pending corrections | **[R]** | ⬅️ **Next — not begun** |
| **H3.7** | **Recognition Order + commercial tracking** — budget, estimates, actuals, derived margin | 9 | H3.6 | **[R]** | ⬜ |
| **H3.8** | **Confirmation + Memory** — the Moment closes; a Memory record enters the relationship timeline | 10 | H3.7 | **[R]** | ⬜ |

**[R]** = required for the first closed loop. Checkpoint Part 2 classifies every H3 milestone above as **[R]**.

### Completion tests

Carried forward verbatim in substance from checkpoint Part 3. Each is the test that closes the milestone.

| # | Completion test |
|---|-----------------|
| H3.1 | Archiving an assigned policy after generation leaves in-flight Moments unchanged and blocks new generation with a named issue |
| H3.2 | A brief renders every constraint from the snapshot, and an incomplete address **blocks confirmation** with a named recovery (ADR-011) |
| H3.3 | Selection writes exactly **one** `ItemSelection` Decision on confirm, and browsing writes none |
| H3.4 | Comparing three offers and choosing the second writes one `VendorSelection` Decision with the rejected offers in `inputs` |
| H3.5 | **A courier is selectable for every country represented by a current confirmed Execution Brief, or the gap is named** *(Council, 2026-07-30 — see below)* |
| H3.6 | A failed delivery followed by redelivery produces a complete, ordered event history with no mutation |
| H3.7 | Margin is derived, never stored, and a corrected vendor cost recomputes it without a second write |
| H3.8 | A closed Moment appears on the recipient's timeline with occasion, date and outcome — and **no commercial detail** |

### The H3.2 gate — closed

**ADR-011 landed with H3.2.** Workspace schema **v7** added the additive `Person.deliveryAddress`;
`OperationsState` **v2** added `executionBriefs`. Both migrations are additive and a v1 workspace
still walks every rung. Nothing gated H3.3.

### What H3.3 built, and what it deliberately did not

**Only a minimum flat catalog exists.** `lib/catalog.ts` is a pure seed module — stable id, name,
one-line description, one existing `GiftCategory`, an active flag and a canonical `Money` price.
Twenty-four items across three currencies. There is **no catalog administration surface, no
customer-facing catalog route, and no vendor availability**. Adding an item is a code change.

**Catalog, Gift and Vendor Intelligence remain deferred to H4.2 – H4.4**, behind the pilot. H3.3
built no intent hierarchy, no collections, no ranking, no recommendations, no personalization and
no images. Eligibility is four deterministic rules and nothing more: active · currency matches the
approved budget **exactly** · price at or under budget in minor units · category not excluded by the
governing snapshot. **No FX** (ADR-007) — an item priced in another currency is not comparable, and
one a single minor unit over budget is excluded.

**`OperationsState` moved to v3.** One additive rung, and it **adds nothing to existing records**:
newly generated Moments now snapshot `policyResolutionSnapshot.excludedCategories`, and pre-H3.3
records legitimately have no such field.

> **Why a pre-H3.3 record blocks item selection.** `PolicyForm.save()` writes an edited policy back
> to the **same `id` at the same `version`**, including when publishing. Matching `policyId` and
> `policyVersion` against the live policy therefore proves nothing about whether its exclusions
> still hold what they held at generation. Equivalence is **not provable**, so the migration invents
> no empty list and selection is blocked with a named explanation and a recovery — re-prepare the
> recipient, which leaves the original record untouched. Defaulting to `[]` would have converted
> "unknown" into the false claim "nothing was excluded", and could have sent a gift the governing
> rule forbade.

**Event naming.** The checkpoint proposed `ItemPrepared`; H3.3 records **`ItemSelected`**. Nothing is
prepared at this step — no vendor has been asked and nothing has moved. Per
[`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md) §6 the checkpoint's downstream
names are proposals, and the milestone that builds each one fixes its final name. `ItemSubstitution`
was **not** added: it presupposes a selection something downstream has already consumed.

### What H3.4 built, and what it deliberately did not

**Only a manual vendor directory and hand-entered offers exist.** A `Vendor` is six fields an
operator typed — name, country, city, at least one contact method, an active flag and an optional
note. A `VendorOffer` is an immutable record of what an operator was told, carrying the quote, the
channel it arrived through, when it was quoted and when it was recorded.

**Nothing was built that resembles intelligence.** No scores, ratings, reliability, capacity,
lead-time policy, quality grades, price lists, preferred status, contracts, SLAs, ranking,
recommendations or automatic routing. Rows appear in the order the operator entered them. **Vendor
Intelligence remains H4.4**, gated on the pilot — it has to be built from recorded outcomes, and
H3.4 is the milestone that starts recording them.

**No vendor accounts, no portal, no vendor-facing route, no automated quote requests, no APIs and no
external integrations.** WhatsApp stays what it has always been: a channel an operator records by
hand. No courier, fulfilment, proof of delivery, `RecognitionOrder`, customer charge or margin was
introduced.

**Two sources of truth, deliberately different.** Delivery context comes from the **current confirmed
brief**; the chosen item comes from the **live `ItemSelection` Decision**, never re-read from the
catalog. A brief may take a governed address-only revision after an item was chosen, and that must
not invalidate the item — so the vendor selection references both, and snapshots the brief it was
quoted against.

**`quotedVendorCost` is an estimate of what the vendor will charge Aniyé.** Not the customer's
charge, not the catalog price, not an actual paid cost, not revenue, not margin, and **never derived
from `CatalogItem.price`**. Every offer in a comparison must use the item's exact currency; quotes
are never converted (ADR-007). Zero is allowed — a vendor absorbing a cost is a real quote, and
refusing it would invent a commercial rule nobody decided. Negative is refused. There is deliberately
**no rule that a quote must sit below the catalog price**: the two answer different questions.

**`OperationsState` moved to v4.** One additive rung adding the `vendors` and `vendorOffers`
collections, inventing nothing and touching no existing record. Workspace schema stays **v7**.

### What H3.5 built, and what it deliberately did not

**Only a manual courier directory and one recorded carriage cost exist.** A `Courier` is ten fields
an operator typed — name, **one country**, at least one contact method, an active flag, an optional
note and timestamps. That country scoping *is* the milestone: checkpoint milestone 7 asks for "a
courier list per country", and selection offers only the couriers who serve where the brief is going.

**Nothing was built that milestone 7 excludes.** No rate APIs, no tracking integration, no
optimization — and therefore no rate cards, tracking numbers, API credentials, service levels, zones,
transit-time models, scoring or automatic routing. Couriers appear alphabetically; nothing is ranked
or recommended.

**Shaped like H3.3, not H3.4, and deliberately.** A vendor comparison had to persist several
hand-entered quotes because nothing in the system knows what a vendor will say. Courier alternatives
*are* knowable — they are exactly the active couriers serving the country — so the considered set is
**recomputed** rather than typed in, and one cost is recorded rather than several. There is no
`courierOffers` collection.

**The completion test, made answerable.** Checkpoint milestone 7 originally asked that *"a courier is
selectable for every operating country, or the gap is named"* — preserved here as the historical
wording.

> ✅ **Council resolved this on 2026-07-30.** The completion test now reads:
>
> *"A courier is selectable for every country represented by a current confirmed Execution Brief, or
> the gap is named."*

The directory shows every country deliveries are going to, how many briefs are heading there, and how
many active couriers carry there — naming each gap with the country in it and offering to fix it
inline.

> ✅ **Coverage is measured against confirmed briefs, not `WorkspaceState.operatingCountries` —
> accepted by Council, 2026-07-30.**
>
> Operating countries are free-text names captured in the assessment (`"Nigeria"`); every delivery
> country in Operations is ISO 3166-1 alpha-2 (`"NG"`); and **no name-to-code mapping exists
> anywhere in this repository**. Inventing one would mean guessing at spellings, languages and
> disputed names to answer a question the briefs already answer exactly. Confirmed briefs are also
> the better evidence: a country the organization *says* it operates in but has never shipped to
> needs no courier, and one it ships to must have one whether or not anyone listed it.
>
> **`operatingCountries` remains free-text assessment and marketing data and is not operational
> country authority.** No normalization, no name-to-code mapping, no canonical country collection,
> **no Workspace v8**. A country model, if ever wanted, takes its own milestone and its own
> architecture review.

**No carriage ceiling was invented.** A courier cost above the vendor quote or above the approved
budget is allowed: the budget governs what the *recipient* receives (ADR-004), and relating carriage
to it is a commercial decision **CP-U3 / OPS-U3** has not made. Zero is allowed — a courier absorbing a leg is a
real quote. Negative is not. Every quote must use the item's exact currency; quotes are never
converted (ADR-007).

**`OperationsState` moved to v5.** One additive rung adding the `couriers` collection, inventing
nothing and touching no existing record. Workspace schema stays **v7**.

> ⚠️ **Event naming — a deliberate departure from the checkpoint.** Part 2 row 9 and the Operations
> Atlas loop table both leave the Event column **blank** for courier selection, proposing a Decision
> and nothing else. H3.5 records **`CourierSelected`** anyway. That absence is a proposal, not a
> decision against, and by ADR-006's own test — *does it change the state of a Moment's execution?* —
> assigning a carrier plainly does. Without it the Moment timeline would read "Item chosen · Vendor
> chosen · …nothing…" until dispatch, silently skipping a step that materially moved the job.
> **Recorded here rather than made quietly.**

**Event naming.** The checkpoint proposed `VendorContacted`; H3.4 records **`VendorSelected`**.
Aniyé contacts nobody — an operator types up what they were already told, so the occurrence is the
*selection*, and the channel each quote arrived through is a `source` field on the offer.
`VendorSubstitution` was not added.

### ⛔ The ADR-010 gate — what it actually binds

Per **ADR-010**, all four are mandatory and none is scheduled:

1. A **production backend** with durable server-side persistence.
2. **Authentication** — none exists. Anyone who can reach the app can reach `/operations`.
3. **Multi-tenancy** with enforced isolation.
4. **Secure file storage**, before proof of delivery exists.

**ADR-010 binds the gate to two things, and neither is an H3 milestone:**

| The gate binds at | Source |
|---|---|
| **Any external pilot** — *"All of the following are required before any external pilot"* | ADR-010 |
| **The moment any second party is given access** — *"no vendor, courier, recipient or additional internal user may be given access"* | ADR-010 |

**No H3 milestone requires giving a second party access.** H3.4 and H3.5 build *directories the
operator fills in by hand*: checkpoint milestone 6 excludes "automated requests, APIs", and
milestone 7 excludes "rate APIs, tracking integration". A vendor recorded in a directory is a row
an operator typed, not an account. **The gate therefore binds at H4.1, the controlled pilot** — and
independently at any decision to give an external party access, whenever that decision is taken.

> ⚠️ **Correction.** An earlier draft of this roadmap stated the gate "binds from H3.4 onward in
> practical terms". **That was inference, not document evidence, and it is withdrawn.** No governing
> document places the gate at H3.4. **It does not block H3.2, H3.3, H3.4 or H3.5.**

### Visual verification — the record, corrected

> ⚠️ **Correction.** Earlier versions of this document stated that live visual verification had
> "never been performed for any H2.6, H3.1 or H3.2 route", and that neither H3.1 nor H3.2 was fully
> accepted until it was. **That statement was stale and is withdrawn.** A complete 10-route × 3-width
> live browser matrix was run and accepted before commit `66e24c2`, and **H3.1 and H3.2 are fully
> accepted**, not merely automated-accepted.

What remains outstanding is narrower and unchanged: a **live responsive review on real devices**.
Browser verification at resized viewports is not that, and is not described as that anywhere in this
repository. It is a **pre-pilot [P]** item (H4.0), not an H3 blocker.

**H3.3 browser verification.** Every named state was exercised live at **400px**, **768px** and
**1200px** measured `window.innerWidth`. 1440px was not reachable in that session.

**H3.4 browser verification.** Every named state exercised live at **1440px**, **768px** and
**500px** measured `window.innerWidth` (the window manager clamped that session to a ~500px floor).

**H3.5 browser verification.** Empty directory; the coverage gap named with the country in it; the
inline *Add one for NG* path with the country prefilled; blank-save validation; three couriers added
across two countries; coverage flipping to complete; a Moment with no courier for its country; the
per-country list correctly excluding the KE courier; draft entry; confirmation; the confirmed
selection; duplicate refusal; and a courier **deactivated mid-flow**, which the trust boundary
refused live with zero writes — all at **1440px**, **768px** and **400px** measured
`window.innerWidth`. The v4 → v5 migration was also observed running in the browser against a
v4 payload.

> **No width was simulated by toggling classes.** Page-level and inner-container horizontal
> scrolling were checked programmatically at every width and both are clean; no H3.5 control is
> under 44px.
>
> **Real-device testing was not performed and is not claimed.**

---

## H4 — Learn

**Run it for real, then learn from what actually happened.** Everything after the pilot is **[D]** —
deferrable until operational evidence exists. The checkpoint's reasoning is binding: *"Intelligence
built before that evidence exists is invention."* A manual flow generates the data that later makes
intelligence possible; the reverse is not true.

| # | Milestone | Depends on | Class | State |
|---|-----------|---|:---:|-------|
| **H4.0** | **Pre-pilot completion** — the checkpoint's **[P]** set: Recurring and Triggered Program modes; customer-facing Moment visibility; approval flows where required; delivery-failure and redelivery handling; **EX-H1** assessment autosave; **EX-H3** `PolicyForm` rebuild; **live responsive testing on real devices**; a backend with real tenant isolation and access control | H3.8 | **[P]** | ⬜ |
| **H4.1** | **Controlled pilot** — one real organization, one real Campaign, real deliveries | H4.0 + the ADR-010 gate | **[P]** | ⬜ |
| **H4.2** | **Catalog Intelligence** — Intent → Category → Collection → Item (Atlas §9) | H4.1 | **[D]** | ⬜ |
| **H4.3** | **Gift Intelligence** — recommendations, budget surfacing | H4.2 | **[D]** | ⬜ |
| **H4.4** | **Vendor Intelligence** — scoring, automated routing | H4.1 | **[D]** | ⬜ |
| **H4.5** | **Insights and analytics** — AI-generated Insights, spend analytics, Relationship Profile v2 | H4.1 | **[D]** | ⬜ |

**H4.1's dependency is the point.** Each recommendation must be traceable to recorded outcomes, not
to assumptions. Completion test: a full cycle completes with no manual database intervention.

**Why Recurring and Triggered sit in H4.0, not H3.** Checkpoint Part 2 classifies them **[P]** —
required before external pilot — not **[R]**, required for the first closed loop. A single Campaign
closes the loop; recurrence does not. ADR-004 accepts all three modes, and only Campaign is built.

---

## H5 — Relationship Infrastructure

| # | Milestone | Depends on | State |
|---|-----------|---|-------|
| H5.1 | **Production backend, authentication, roles, real tenant isolation** — checkpoint Part 3 milestone 13 | — | ⬜ |
| H5.2 | Multi-workspace, multi-country operations | H5.1 | ⬜ |
| H5.3 | Enterprise permissions, API keys, SAML/SSO | H5.1 | ⬜ |
| **H5.4** | **Integrations** — people-source connectors (**Google Sheets, BambooHR, HiBob, Personio**) and HR integrations (**Rippling, Deel, Workday, SAP, Oracle**) | H5.1 · H2.5 | ⬜ |
| H5.5 | Partner network — full Relationship OS across Africa | H5.1 | ⬜ |

> ⚠️ **H5.1 does not wait for H5.** ADR-010 makes it a **pre-pilot [P]** item — checkpoint Part 2
> lists "a backend with real tenant isolation and access control" in the [P] set, which is why it
> also appears inside H4.0. It is *numbered* here because that is where the capability set belongs.
> Checkpoint open question 1 — *does the pilot involve more than one organization?* — decides how
> much of it must land before H4.1. **That question is unresolved (U1).**

**Connector placement — reconciliation note.** Atlas §17 originally listed Google Sheets, BambooHR,
HiBob and Personio under **H3**, and an earlier draft of this roadmap relocated them to **H4.4/H4.5**.
**Both placements are superseded by the Council decision of 2026-07-28: all external connectors are
H5.4.** The supporting evidence is consistent with that — Atlas §12 records HRIS as a future source
*abstraction* only with no integration built, and ledger compromise **P3** defers configurable
source priority until a real connector exists. **Nothing was dropped; only relocated**, and the
intermediate H4.4/H4.5 placement no longer exists anywhere in the roadmap.

---

## Checkpoint mapping

Both numbering schemes, side by side. `H2_H3_ARCHITECTURE_CHECKPOINT.md` Part 3 is preserved
unchanged; this table is how to read it.

| Checkpoint Part 3 | Canonical | Note |
|:---:|---|---|
| 1 | H2.6a | Architecture migrations and canonical types — schema v5 |
| 2 | H2.6 | Minimum Programs — Campaign mode only, schema v6 |
| 3 | **H3.1** | Moment generation and configuration snapshot |
| 4 | **H3.2** | Execution Brief |
| 5 | **H3.3** | Minimum Catalog and item selection |
| 6 | **H3.4** | Vendor Offer and manual vendor selection |
| 7 | **H3.5** | Courier directory and manual selection |
| 8 | **H3.6** | Fulfilment lifecycle |
| 9 | **H3.7** | Commercial tracking — RecognitionOrder |
| 10 | **H3.8** | Confirmation and Memory |
| 11 | H4.1 | Controlled pilot (its **[P]** prerequisites are H4.0) |
| 12 | H4.2 – H4.4 | Deeper intelligence |
| 13 | H5.1 | Production backend and access controls |
| — | H5.4 | Integrations. **No checkpoint milestone** — connectors were never on the closed-loop path |

**Superseded numbering.** `RECOVERY_LEDGER.md` §0 and §10 previously defined H3.1 as "Moment
Engine" gated on the **retired ADR-003**, and H3.3–H3.5 as Catalog, Gift and Vendor Intelligence.
That definition is superseded in full. ADR-003 is retired permanently and is not a dependency of
anything.

---

## Milestone count

Counting basis: every numbered milestone in the six horizon tables above. One row, one milestone.

| Horizon | Milestones | Complete |
|---------|:---:|:---:|
| **H0** — Foundation | 7 | **7** |
| **H1** — Assessment + Snapshot | 4 | **4** |
| **H2** — Configure | 7 | **7** |
| **H3** — Operational execution | 8 | **5** |
| **H4** — Learn | 6 | 0 |
| **H5** — Relationship Infrastructure | 5 | 0 |
| **Total** | **37** | **23** |

**23 of 37 major milestones complete.**

> ⚠️ **This does not match the 15 of 31 the Council asked to be confirmed.** The instruction was
> conditional — *"if the roadmap still contains 31 milestones"* — and it does not; at this
> granularity it contains 37. The three specific milestone states the Council named **are** confirmed
> and correct in the tables above:
>
> | Milestone | State when the Council asked (2026-07-28) | State now |
> |---|---|---|
> | **H2.6 — Campaign Programs** | ✅ Complete | ✅ Complete |
> | **H3.1 — Operational Foundation + Moment Engine** | ✅ Complete | ✅ Complete |
> | **H3.2 — Execution Brief** | ⬅️ Next | ✅ Complete |
> | **H3.3 — Minimum Catalog + item selection** | ⬜ | ✅ Complete |
>
> The difference is one of **counting granularity**, not status. If the Council intends a coarser
> grain — for example excluding H0's retrospective labels, or collapsing H2.6a into H2.6 — the totals
> change and this table should be re-issued. **Surfaced rather than resolved**, per the governance
> rule on conflicting sources.

---

## Unresolved

Open questions that affect sequencing. **None is settled, and none may be encoded as architecture
until a Council decision closes it.**

> ⚠️ **Identifiers are source-scoped — Council, 2026-07-30.** This register's `U4` (*first pilot
> currency*) and the Operations Atlas's `U4` (*QA taxonomy*) were different questions sharing one
> label; so were the two `U5`s. Rows below now carry **`CP-Un`** for checkpoint open questions and
> **`LEDGER-Cn`** for ledger conflicts. Operations Atlas questions are **`OPS-Un`**. **Nothing was
> renumbered** — see [`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md) §9 for
> the collision table.

**Dependency classification** — every item carries one:
**🔴 blocks H3.2** · **🟠 blocks a later named milestone** · **⚪ does not currently block implementation**

| # | Question | Blocks | Source |
|---|----------|--------|--------|
| **CP-U1** | **Does the pilot involve more than one organization?** If yes, more of H5.1 must land before H4.1 — the client-side model cannot isolate tenants | 🟠 **H4.1** | Checkpoint open question 1 |
| **CP-U2** | **Does any near-term customer require policy approval?** If not, `Approval` stays deferred indefinitely | ⚪ Not blocking — `Approval` is unscheduled | Checkpoint open question 2 |
| **CP-U3** | **Is Aniyé the merchant of record, or an agent?** It changes what `actualCustomerCharge` legally means. ADR-007 reserves `commercialRole` for the answer | 🟠 **H3.7** | Checkpoint open question 3 · ADR-007 |
| **CP-U4** | **What is the first pilot currency?** If single-currency, FX snapshots defer entirely | 🟠 **H3.7**, and H4.1 scope | Checkpoint open question 4 |
| **LEDGER-C2** | **Class lifecycle fields** — code has `isDefault`/`isActive`; Atlas §4 specifies `isCustom` + `Draft/Active/Archived` | ⚪ Not blocking — H2 shipped on the implemented model | Ledger conflict **C2**, open |
| **LEDGER-C5** | **Default class seed list** — whether to seed more than 11 classes, and whether `Staff` should be `Employees` | ⚪ Not blocking — a product question, not a structural one | Ledger conflict **C5**, open |

**Nothing in this register blocks H3.6.** The operational unresolved items are classified the same
way in [`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md) §9 — where
**OPS-U4a is now resolved** by ADR-012 and **OPS-U4b is deferred**.

### Before H3.6 may begin

**The governance question is settled.** [ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md)
was accepted on 2026-07-30: three Fulfilment states, one Fulfilment per Moment, no persisted draft,
`Redelivery` as the only Decision, and **proof recorded as metadata with no file stored**. It
resolves **OPS-U4a** and defers **OPS-U4b** with a recorded trigger.

**The first of two prerequisite corrections is complete.** The second remains, preserving the
accepted order:

| # | Correction | Status | Schema | Why first |
|---|---|---|---|---|
| 1 | **H3.3/H3.4 malformed-container correction** | ✅ **Complete — H3.3/H3.4-D1** | None | Both repository and direct-verifier boundaries now refuse malformed bundles, Decisions, Events, nested inputs/payloads and H3.4 offer containers without throwing or writing |
| 2 | **Policy-resolution snapshot `v5 → v6`** | ⬜ **Next — not begun** | `OperationsState` **v6** | H3.6 cannot know whether proof was even required. Every Moment generated before it lands is permanently unable to answer |

> ⚠️ **`OperationsState` is v5.** v6 is **planned and not landed**. No document may report it as
> implemented until the migration ships.

**Still deferred, and not H3.6's to decide:** `QAException`, dispute adjudication, what the customer
is told about an exception (**OPS-U4b**); `Returned` and `Escalation`; courier webhooks and tracking
integrations; and where proof files will eventually live. **CP-U3 / OPS-U3 — merchant of record —
still binds at H3.7**, not H3.6.

**ADR-010's external-pilot gate still does not bind on H3.6** — no second party is given access. But
**secure, access-controlled file storage remains mandatory before actual proof files exist**, which
is exactly why ADR-012 stores none.

### H3.5 country coverage — decided

**Council, 2026-07-30.** The completion test above is **rewritten** to name the operational
authority the implementation already uses:

> *"A courier is selectable for every country represented by a current confirmed Execution Brief, or
> the gap is named."*

`WorkspaceState.operatingCountries` **remains a free-text assessment and marketing field.** It is
captured as one comma-separated input, split naively, never validated, and holds country *names*
while every operational country is ISO 3166-1 alpha-2. **It is not operational country authority.**

**Do not add** normalization, name-to-code mapping, a canonical country collection, or Workspace v8.
A future country model requires **its own milestone and its own architecture review**.

---

*Master Roadmap v1.8 — Aniyé Africa — 30 July 2026*
*v1.8: **H3.3/H3.4-D1 malformed runtime-container correction complete.** `commitItemSelection()` / `verifyItemSelection()` and `commitVendorSelection()` / `verifyVendorSelection()` now apply the existing `isPlainRecord` runtime boundary before destructuring or property access; H3.4 additionally requires `offers` to be an array and every submitted offer to be a plain record before exact-key or field checks. TypeScript interfaces were not weakened. Fourteen new checks exercise both repository and direct-verifier paths and prove no throw, the existing review-again recovery, zero writes, byte-identical state and honest one-write commits: selection **65 → 71**, vendors **84 → 92**, **450 checks across eleven suites**. Typecheck clean; lint unchanged at **47 problems (26 errors, 21 warnings)**; build succeeds with **28 routes**. No UI, route, schema or migration changed; Workspace remains **v7**, `OperationsState` remains **v5**, H3.6 has not begun, and the separate policy-snapshot **v5 → v6** migration is now the only remaining prerequisite.*
*v1.7: **H3.5 → H3.6 governance decision closure — documentation only. No code, schema, migration, validation, route or UI changed.** H3.5's completion test is **rewritten** to "a courier is selectable for every country represented by a current confirmed Execution Brief, or the gap is named" — `operatingCountries` remains a free-text assessment field and is **not** operational country authority; no normalization, mapping, country collection or Workspace v8. **[ADR-012](adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) accepted** — three Fulfilment states, one per Moment, no persisted draft, `Redelivery` the only Decision, **proof recorded as metadata with no file stored**; it resolves **OPS-U4a** and defers **OPS-U4b**. Unresolved identifiers are now **source-scoped** (`CP-Un`, `OPS-Un`, `LEDGER-Cn`) because bare `U4` and bare `U5` each meant two different questions; **nothing was renumbered**. Two corrections must land before H3.6: the **H3.3/H3.4 malformed-container correction** (no schema change) and the **policy-snapshot `v5 → v6` migration** for four missing delivery fields. **H3.5 remains complete; H3.6 has not begun; Workspace stays v7 and `OperationsState` stays v5** — v6 is planned, not landed. Actual proof-file storage and adjudication remain deferred.*
*v1.6: **H3.5 — Courier directory and manual selection complete.** `OperationsState` **v5** (additive: `couriers`; invents nothing, touches no existing record). Workspace unchanged at **v7**. **429 checks across eleven suites** (verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, vendors 84, couriers 46); typecheck clean; build **28 routes** (two intentional additions); lint **47 problems — 26 errors, 21 warnings**, exactly the pre-H3.5 baseline. Milestone count **23 of 37**; H3 is **5 of 8**. H3.6 is next **and is gated on unresolved U4** — the QA and exception taxonomy, first needed at delivery confirmation. Only a manual per-country directory and one recorded carriage cost exist; no rate APIs, tracking, optimization, scoring or routing. Event named **`CourierSelected`** — a **declared departure** from the checkpoint, which proposes no Event for this step. Coverage is measured against confirmed briefs because `operatingCountries` are free-text names with no code mapping in the repository — surfaced, not resolved. Verified live at 1440px, 768px and 400px. ADR-010 remains the external-pilot gate; real-device testing remains outstanding.*
*v1.5: **H3.4 — Vendor directory, hand-entered offers and manual vendor selection complete.** `OperationsState` **v4** (additive: `vendors`, `vendorOffers`; invents nothing, touches no existing record). Workspace schema unchanged at **v7**. **357 checks across ten suites** (verification 9, migration 18, assignments 20, people 30, money 25, programs 35, briefs 47, operations 50, selection 65, vendors 58); typecheck clean; build succeeds with **26 routes** (two intentional additions); lint **47 problems — 26 errors, 21 warnings**, exactly the pre-H3.4 baseline. Milestone count **22 of 37**; H3 is **4 of 8**. H3.5 is next. Only a manual directory and hand-entered offers exist — Vendor Intelligence remains H4.4, and no scoring, routing, API, portal, courier, fulfilment or commerce was built. Event named **`VendorSelected`**, not the checkpoint's `VendorContacted`. **The v1.4 footer's 281-check figure is corrected: the accepted H3.3 state was 299 checks across nine suites**, after the H3.3-D1 trust-boundary correction. ADR-010 remains the external-pilot gate and binds at H4.1. Real-device testing remains outstanding and is not claimed.*
*v1.4: **H3.3 — Minimum Catalog + manual item selection complete.** `OperationsState` **v3** (additive; `policyResolutionSnapshot.excludedCategories`). Workspace schema unchanged at **v7**. 281 checks across nine suites at first landing, **corrected to 299** by H3.3-D1 (selection 47 → 65); typecheck clean; build succeeds with **24 routes**; lint **47 problems — 26 errors, 21 warnings**, exactly the pre-H3.3 baseline. Milestone count **21 of 37**; H3 is **3 of 8**. H3.4 is next. Minimum flat catalog only — Catalog/Gift/Vendor Intelligence remain H4.2–H4.4. **The stale claim that H3.1/H3.2 visual verification was never performed is withdrawn.** ADR-010 remains the external-pilot gate and binds at H4.1. Real-device testing remains outstanding and is not claimed.*
*v1.3: H3.1-D1 and H3.2-D1 acceptance corrections recorded. 232 checks across eight suites.*
*v1.2: **H3.2 — Execution Brief complete.** Workspace schema v7, `OperationsState` v2. H3.3 is next and is ungated. Milestone count 20 of 37.*
*v1.1: Council corrections. H0 restated as an approved retrospective label for real completed work. H4 renamed **Learn** and renumbered — pre-pilot [P] set becomes H4.0, pilot H4.1, intelligence H4.2–H4.5. **All external connectors moved to H5.4 — Integrations**; the intermediate H4.4/H4.5 placement is removed entirely. Milestone count published (37/19) with the 31/15 discrepancy surfaced rather than resolved. Every unresolved item classified by what it blocks. **The claim that the ADR-010 gate binds from H3.4 is withdrawn** — no governing document establishes it; the gate binds at the pilot and at any grant of external access.*
*v1.0: Created by the governance reconciliation (R6) under Council decisions of 2026-07-28.*
*Supersedes the H3 sequences in `RECOVERY_LEDGER.md` §0 and §10 for roadmap reporting.*
*Basis: Workspace schema v7, `OperationsState` v5, System Atlas v3.10, ADR-001 … ADR-012.*
