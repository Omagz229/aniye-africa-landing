---
name: aniye-implement-milestone
description: Implements one approved Aniyé roadmap milestone through code, migration, testing, validation and documentation updates. Use only after the milestone definition and dependent architecture decisions have been approved.
disable-model-invocation: true
argument-hint: "[milestone ID and approved specification]"
---

# Aniyé Milestone Implementation

Implement:

$ARGUMENTS

Work on exactly one approved milestone. If the request spans several, stop and ask which one.

## Preconditions

Before editing anything:

1. Read the root `CLAUDE.md` (it includes `AGENTS.md` — this Next.js version has breaking changes; consult `node_modules/next/dist/docs/` before writing framework code).

2. Locate and read the roadmap entry and all applicable governing documents. **Verify each path exists.**

   | Source | Path |
   |--------|------|
   | **Master Roadmap — authoritative for milestones** | `docs/MASTER_ROADMAP.md` |
   | System Atlas | `docs/ANIYE_SYSTEM_ATLAS.md` |
   | Relationship Operations Atlas | `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` |
   | Experience Doctrine | `docs/ANIYE_EXPERIENCE_DOCTRINE.md` |
   | ADRs 004–011 + registry | `docs/adr/` |
   | ADRs 001–002 | `docs/ANIYE_SYSTEM_ATLAS.md` §18 |
   | Recovery Ledger | `docs/RECOVERY_LEDGER.md` |
   | Architecture checkpoint | `docs/H2_H3_ARCHITECTURE_CHECKPOINT.md` |

   **Roadmap location:** `docs/MASTER_ROADMAP.md` is authoritative (Council, 2026-07-28). Milestones are **H3.1 … H3.8**; its checkpoint-mapping table translates `H2_H3_ARCHITECTURE_CHECKPOINT.md` Part 3's numbers. `RECOVERY_LEDGER.md` §0/§10 is historical — its superseded H3 rows are marked and **must not be scheduled from**. Catalog, Gift and Vendor *Intelligence* are **H4.1–H4.3**, deferred until the pilot; they are not H3 work.

   **Before building:** `RELATIONSHIP_OPERATIONS_ATLAS.md` §10 is the breach checklist, and its **§9 lists ten rules that deliberately do not exist** — operator roles, SLAs, commercial role, QA taxonomy, partner onboarding and more. If the milestone needs one, **stop and raise an ADR**. Do not invent it.

   Every accepted ADR carries **binding Council conditions**. They frequently narrow the original draft. Read them, not just the decision.

3. **Inspect the existing implementation before proposing new structures.** Most of what a milestone needs already exists — `resolvePolicyAssignment()`, the migration runner, the Money helpers, `ConfirmDialog`, `StepHeader`, the operations repository. Reimplementing them is a defect, not a milestone.

4. Run `git status` and **preserve all unrelated existing changes**. Never revert or overwrite work you did not author in this session.

5. Confirm the milestone has:
   - an approved definition;
   - resolved architecture dependencies (no ADR still Proposed);
   - acceptance criteria;
   - identified lifecycle and persistence consequences.

6. **If any required decision is missing, contradictory or unapproved, stop before implementing and report the blocker.** Do not encode an unresolved checkpoint question as settled architecture.

## Workflow

1. **Establish the baseline.** Run every gate before touching code, so a later failure is attributable:
   ```
   npm run typecheck
   npm run build
   npm run validate:verification
   npm run validate:migration
   npm run validate:assignments
   npm run validate:people
   npm run validate:money
   npm run validate:programs
   npm run validate:operations
   ```
2. **Produce a concise implementation plan** before editing.
3. **Identify affected files, types, routes, components and migrations.**
4. **Implement the smallest coherent slice** that satisfies the milestone. Resist adjacent improvements.
5. **Preserve canonical terminology and domain boundaries.** Canonical names live in types, routes and the Atlas; the interface uses the Doctrine's human language. Workspace and Operations do not share shells, navigation or persistence.
6. **Add ordered, backward-compatible migrations where required.** In `lib/migrations.ts` (workspace) the chain moves one version at a time and never skips a rung; a v1 workspace must still reach current. Mark a step `destructive: true` when it rewrites existing fields — that triggers the verbatim backup. Historical migrations are **frozen**: pin their value sets rather than referencing live enums.
7. **Update schema versions and recovery documentation where required.** Workspace schema is in `lib/migrations.ts`; OperationsState has its own version in `lib/operations/types.ts` and moves independently.
8. **Add or update tests.** Validation is `scripts/validate-*.mts`, run through the Node type-stripping resolver — no test framework. A new domain area gets its own suite and an `npm run validate:<area>` script. Cover the failure cases, not just the happy path.
9. **Run every applicable gate again** — typecheck, lint, build, and all validation suites. Report exact counts.
10. **Inspect the resulting user flow** against the Experience Doctrine:
    - one clear next step, chosen from state;
    - progressive disclosure;
    - useful empty states;
    - recovery paths from every error;
    - no dead ends and no links to unbuilt routes;
    - correct Workspace/Operations separation, with no commercial or internal data projected to the customer.
11. **Update the roadmap and `docs/RECOVERY_LEDGER.md` to reflect work actually completed** — never work merely planned. If the Atlas describes something not yet built, mark it explicitly as not implemented.
12. **Do not commit, push, tag or open a pull request unless explicitly requested.**

## Completion report

Return:

1. **Milestone and implemented scope** — including what was deliberately excluded.
2. **Files changed** — created versus modified.
3. **Schema or migration changes** — version transition, additive or destructive, backup behaviour, what validation now refuses.
4. **Tests and validations run, with exact results** — the real counts from the real commands.
5. **Acceptance criteria results** — each one, met or not.
6. **Architecture and experience checks** — which boundaries were verified and how.
7. **Recovery Ledger updates.**
8. **Remaining gaps or blockers** — including anything deferred and why.
9. **Recommended next milestone.**

**Never describe an untested result as verified.** If a gate was not run, say it was not run. If a check was static analysis rather than execution, say which. A claim that something works is a claim you must be able to point at output for.
