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
| **`OperationsState` schema** | **v2** — `lib/operations/types.ts`, versioned independently (ADR-010) |
| **Last completed milestone** | **H3.2** — Execution Brief |
| **Next milestone** | **H3.3** — Minimum Catalog + manual item selection |
| **Milestones** | **20 of 37 complete** — see *Milestone count* |
| **Blocking H3.3** | Nothing. ADR-011 landed with H3.2; no unresolved decision gates the minimum catalog |
| **Outstanding** | ⚠️ **Live visual verification** — never performed for any H2.6, H3.1 or H3.2 route. Neither H3.1 nor H3.2 is fully accepted until it is |
| **Blocking the pilot (H4.1)** | ⛔ Production backend, authentication, multi-tenancy, secure file storage (ADR-010). **This gate does not bind on any H3 milestone** |

---

## Horizons

| Horizon | Theme | State |
|---------|-------|-------|
| **H0** | Foundation — retrospective label for pre-roadmap work | ✅ Complete |
| **H1** | Assessment + Snapshot | ✅ Complete |
| **H2** | Configure — Organization Profile through Programs | ✅ Complete |
| **H3** | Operational execution — the closed loop | 🔨 In progress (2 of 8 done) |
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
| **H3.3** | **Minimum Catalog + manual item selection** — a flat item list filtered by budget and excluded categories; operator selects one | 5 | H3.2 | **[R]** | ⬅️ **Next** |
| **H3.4** | **Vendor directory, hand-entered offers + manual selection** | 6 | H3.3 | **[R]** | ⬜ |
| **H3.5** | **Courier directory + manual selection** — per operating country | 7 | H3.4 | **[R]** | ⬜ |
| **H3.6** | **Fulfilment tracking** — dispatch → delivered → proof, with failure and redelivery paths | 8 | H3.5 | **[R]** | ⬜ |
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
| H3.5 | A courier is selectable for every operating country, or the gap is named |
| H3.6 | A failed delivery followed by redelivery produces a complete, ordered event history with no mutation |
| H3.7 | Margin is derived, never stored, and a corrected vendor cost recomputes it without a second write |
| H3.8 | A closed Moment appears on the recipient's timeline with occasion, date and outcome — and **no commercial detail** |

### The H3.2 gate — closed

**ADR-011 landed with H3.2.** Workspace schema **v7** added the additive `Person.deliveryAddress`;
`OperationsState` **v2** added `executionBriefs`. Both migrations are additive and a v1 workspace
still walks every rung. Nothing now gates H3.3.

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

Also outstanding and never performed: a **live responsive visual review on real devices**. Every
responsive claim to date is static analysis plus an HTTP smoke test. It is a **pre-pilot [P]** item
(H4.0), not an H3 blocker.

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
| **H3** — Operational execution | 8 | **2** |
| **H4** — Learn | 6 | 0 |
| **H5** — Relationship Infrastructure | 5 | 0 |
| **Total** | **37** | **20** |

**20 of 37 major milestones complete.**

> ⚠️ **This does not match the 15 of 31 the Council asked to be confirmed.** The instruction was
> conditional — *"if the roadmap still contains 31 milestones"* — and it does not; at this
> granularity it contains 37. The three specific milestone states the Council named **are** confirmed
> and correct in the tables above:
>
> | Milestone | Reported state |
> |---|---|
> | **H2.6 — Campaign Programs** | ✅ **Complete** |
> | **H3.1 — Operational Foundation + Moment Engine** | ✅ **Complete** |
> | **H3.2 — Execution Brief** | ⬅️ **Next** |
>
> The 37/19 figure is a **counting-granularity** difference, not a status disagreement. If the
> Council intends a coarser grain — for example excluding H0's retrospective labels, or collapsing
> H2.6a into H2.6 — the totals change and this table should be re-issued. **Surfaced rather than
> resolved**, per the governance rule on conflicting sources.

---

## Unresolved

Open questions that affect sequencing. **None is settled, and none may be encoded as architecture
until a Council decision closes it.**

**Dependency classification** — every item carries one:
**🔴 blocks H3.2** · **🟠 blocks a later named milestone** · **⚪ does not currently block implementation**

| # | Question | Blocks | Source |
|---|----------|--------|--------|
| U1 | **Does the pilot involve more than one organization?** If yes, more of H5.1 must land before H4.1 — the client-side model cannot isolate tenants | 🟠 **H4.1** | Checkpoint open question 1 |
| U2 | **Does any near-term customer require policy approval?** If not, `Approval` stays deferred indefinitely | ⚪ Not blocking — `Approval` is unscheduled | Checkpoint open question 2 |
| U3 | **Is Aniyé the merchant of record, or an agent?** It changes what `actualCustomerCharge` legally means. ADR-007 reserves `commercialRole` for the answer | 🟠 **H3.7** | Checkpoint open question 3 · ADR-007 |
| U4 | **What is the first pilot currency?** If single-currency, FX snapshots defer entirely | 🟠 **H3.7**, and H4.1 scope | Checkpoint open question 4 |
| U5 | **Class lifecycle fields** — code has `isDefault`/`isActive`; Atlas §4 specifies `isCustom` + `Draft/Active/Archived` | ⚪ Not blocking — H2 shipped on the implemented model | Ledger conflict **C2**, open |
| U6 | **Default class seed list** — whether to seed more than 11 classes, and whether `Staff` should be `Employees` | ⚪ Not blocking — a product question, not a structural one | Ledger conflict **C5**, open |

**Nothing in this register blocks H3.3.** The operational unresolved items are classified the same
way in [`RELATIONSHIP_OPERATIONS_ATLAS.md`](RELATIONSHIP_OPERATIONS_ATLAS.md) §9, and none of those
blocks H3.3 either.

### What blocks H3.3

**Nothing.** H3.2 shipped with ADR-011, and no unresolved decision in either register gates the
minimum catalog. Checkpoint milestone 5 excludes the intent hierarchy, collections and
recommendations, so Atlas §9's catalog model is not a prerequisite — that is **H4.2**.

**The ADR-010 pilot gate does not block any H3 milestone.** See *The ADR-010 gate* above.

---

*Master Roadmap v1.3 — Aniyé Africa — 28 July 2026*
*v1.3: H3.1-D1 and H3.2-D1 acceptance corrections recorded. 232 checks across eight suites. Visual verification still outstanding — H3.1 and H3.2 are automated-accepted, not fully accepted.*
*v1.2: **H3.2 — Execution Brief complete.** Workspace schema v7, `OperationsState` v2. H3.3 is next and is ungated. Milestone count 20 of 37.*
*v1.1: Council corrections. H0 restated as an approved retrospective label for real completed work. H4 renamed **Learn** and renumbered — pre-pilot [P] set becomes H4.0, pilot H4.1, intelligence H4.2–H4.5. **All external connectors moved to H5.4 — Integrations**; the intermediate H4.4/H4.5 placement is removed entirely. Milestone count published (37/19) with the 31/15 discrepancy surfaced rather than resolved. Every unresolved item classified by what it blocks. **The claim that the ADR-010 gate binds from H3.4 is withdrawn** — no governing document establishes it; the gate binds at the pilot and at any grant of external access.*
*v1.0: Created by the governance reconciliation (R6) under Council decisions of 2026-07-28.*
*Supersedes the H3 sequences in `RECOVERY_LEDGER.md` §0 and §10 for roadmap reporting.*
*Basis: Workspace schema v7, `OperationsState` v2, System Atlas v3.5, ADR-001 … ADR-011.*
