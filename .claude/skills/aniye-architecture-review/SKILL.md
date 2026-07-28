---
name: aniye-architecture-review
description: Reviews Aniyé architecture proposals, domain changes and milestone definitions against the System Atlas, Relationship Operations Atlas, approved ADRs, roadmap and recovery requirements. Use before implementing Programs, Moments, Operations, money, lifecycle or other structural changes.
argument-hint: "[proposal, milestone, or architecture question]"
---

# Aniyé Architecture Review

Review the requested change:

$ARGUMENTS

This is a review-only workflow. Do not edit application code unless the user separately requests implementation.

## Required inspection

1. Read the root `CLAUDE.md` (it includes `AGENTS.md`).
2. Locate and read the latest applicable governing documents. **The paths below are the ones that exist in this repository — verify each before relying on it, and do not substitute a remembered path.**

   | Source | Path | Notes |
   |--------|------|-------|
   | System Atlas | `docs/ANIYE_SYSTEM_ATLAS.md` | The authority. §4 canonical objects, §15 persistence, §18 ADR registry. Check the version footer at the end |
   | Relationship Operations Atlas | `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` | How Aniyé executes. **§9 lists what is deliberately unresolved**; §10 is the breach checklist |
   | Master Roadmap | `docs/MASTER_ROADMAP.md` | **Authoritative for milestones and sequencing** |
   | Experience Doctrine | `docs/ANIYE_EXPERIENCE_DOCTRINE.md` | Governs how it feels; §2 is the completion checklist |
   | ADRs 004–011 | `docs/adr/*.md` + `docs/adr/README.md` | Each accepted ADR carries **binding Council conditions** that often narrow the original draft. Read them. The README's status table separates *accepted* from *implemented* |
   | ADRs 001–002 | `docs/ANIYE_SYSTEM_ATLAS.md` §18 | No standalone files — the Atlas is authoritative |
   | ADR-003 | — | **Retired.** Never reconstructed, never accepted. Do not reuse or renumber the number, and do not treat it as a dependency |
   | Recovery Ledger | `docs/RECOVERY_LEDGER.md` | **Historical** — the record of what was lost and how it was recovered. Still live for open conflicts (C-codes) and People compromises (P-codes). Its superseded H3 rows are marked; do not schedule from them |
   | Architecture checkpoint | `docs/H2_H3_ARCHITECTURE_CHECKPOINT.md` | Full analysis behind ADR-004…009, the closed-loop definition, and the original implementation pathway (mapped to H3.x in the Master Roadmap) |
   | Experience audit | `docs/ANIYE_EXPERIENCE_AUDIT.md`, `docs/ANIYE_FRICTION_REGISTER.md` | Open EX-codes and their status |

   **Two documents that were previously absent now exist — reconstructed in R6, 2026-07-28:**

   - **`docs/RELATIONSHIP_OPERATIONS_ATLAS.md`** — ✅ **reconstructed in R6** and authoritative for how Aniyé executes. Its **§9 Unresolved** lists ten rules that deliberately do not exist (operator roles, SLAs, commercial role, QA taxonomy, partner onboarding and more). If a proposal depends on one, it is **blocked pending decision** — do not reconstruct it from memory.
   - **`docs/MASTER_ROADMAP.md`** — ✅ **created in R6** and **authoritative for the roadmap** (Council, 2026-07-28). Milestones are **H3.1 … H3.8**; Catalog, Gift and Vendor *Intelligence* are H4.1–H4.3, deferred until the pilot. `ANIYE_SYSTEM_ATLAS.md` §17 is the thematic summary and `H2_H3_ARCHITECTURE_CHECKPOINT.md` Part 3 the original pathway (mapped in the roadmap's checkpoint table); where they disagree, the Master Roadmap wins. `RECOVERY_LEDGER.md` §0/§10 is now a **historical** record — its superseded H3 rows are marked as such and must not be scheduled from.

3. Inspect the existing code, types, persistence layer, migrations and validation related to the proposal:

   | Area | Path |
   |------|------|
   | Workspace domain | `lib/workspace.ts` |
   | Schema versions + migration chain | `lib/migrations.ts` (currently **v6**) |
   | Money | `lib/money.ts` (integer minor units, pinned exponent table) |
   | Policy resolution | `lib/assignments.ts` |
   | People, CSV import | `lib/people.ts`, `lib/csv.ts` |
   | Campaign Programs | `lib/programs.ts` |
   | Operations (separate persistence) | `lib/operations/{types,store,local-store,generation}.ts` (OperationsState **v1**) |
   | Verification gate | `lib/verification.ts` |
   | Validation suites | `scripts/validate-*.mts` |

4. Use repository evidence rather than conversational memory. Quote file paths and line references.
5. If a required source is missing or conflicting, report it instead of silently resolving it.

## Review areas

Check each, and say explicitly when one is not applicable:

- **Canonical terminology** — the Atlas names objects; the interface uses human language (Doctrine §2 translation table). Superseded vocabulary (`Category`, `Tier`) must not reappear.
- **Domain ownership and boundaries** — Atlas §3, the nine domains.
- **Workspace versus Operations** — ADR-005 and ADR-010. Separate route trees, shells, roles, and *persistence*. Operations reads configuration and proposes; it never writes it.
- **Decisions versus Operational Events** — ADR-006. A Decision is a judgement between alternatives with a required reason; an Event is append-only fact. Nothing is recorded until the user confirms.
- **Object identity and lifecycle** — deterministic source keys, idempotency, supersession rather than mutation.
- **Person, Recognition Policy, Program and Moment relationships** — ADR-004 and ADR-008. A Program targets **exactly one** Relationship Group, carries no pinned policy, and policy resolves **per Moment** by the recipient's country.
- **Money and financial representation** — ADR-007. Integer minor units, pinned exponents, no implicit FX, currencies never summed.
- **Persistence and migration consequences** — ordered chain, idempotent, destructive steps backed up, validated before the app sees the payload.
- **Recovery and backward compatibility** — a v1 workspace must still walk every rung to current.
- **Authorization boundaries** — **there is no authentication or role model.** Any proposal that assumes one is blocked (ADR-010).
- **Experience-doctrine consequences** — one clear next action, progressive disclosure, no dead ends, confirmation before consequence.
- **Downstream H3, H4, H5 effects** — Atlas §17 and checkpoint Part 3.

## Output

Return, in this order:

1. **Review scope** — what was proposed, restated precisely.
2. **Evidence inspected** — repository paths, with line references where a specific rule is cited.
3. **Verdict** — exactly one of **Approved** · **Approved with conditions** · **Blocked pending decision**.
4. **Conflicts or missing decisions** — including any governing document that is absent.
5. **Required ADRs or Atlas updates** — name the section. A new structural decision needs an ADR before implementation, not after.
6. **Data and migration consequences** — schema version, whether the step is additive or destructive, what a backup must capture, what post-migration validation must refuse.
7. **Implementation constraints** — what the milestone may and may not touch.
8. **Acceptance criteria** — testable, expressed as validation cases where possible.
9. **Recommended next action.**

Label every statement as one of:

- **Repository-confirmed** — verified in a named file this session.
- **Unresolved** — no decision exists; must be settled before implementation.
- **Recommendation** — your judgement, not yet approved.

Do not reconstruct missing rules from memory. If the answer depends on a document that does not exist, say so and stop.
