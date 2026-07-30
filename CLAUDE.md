@AGENTS.md

# Aniyé Project Governance

## Authoritative documents

These files govern structural work. They exist in this repository — check them, do not work from memory.

| Source | Path |
|--------|------|
| System Atlas — what the platform is | `docs/ANIYE_SYSTEM_ATLAS.md` |
| Relationship Operations Atlas — how Aniyé executes | `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` |
| Experience Doctrine — how it feels | `docs/ANIYE_EXPERIENCE_DOCTRINE.md` |
| **Master Roadmap — authoritative for milestones** | `docs/MASTER_ROADMAP.md` |
| ADRs 004–011 and registry | `docs/adr/` |
| ADRs 001–002 | `docs/ANIYE_SYSTEM_ATLAS.md` §18 (no standalone files) |
| Recovery Ledger — recovery record, open conflicts | `docs/RECOVERY_LEDGER.md` |
| H2→H3 architecture checkpoint | `docs/H2_H3_ARCHITECTURE_CHECKPOINT.md` |
| Experience audit and friction register | `docs/ANIYE_EXPERIENCE_AUDIT.md`, `docs/ANIYE_FRICTION_REGISTER.md` |

**Approved ADRs and the latest applicable Atlas definitions govern structural implementation.** Each accepted ADR carries binding Council conditions that often narrow the original draft — read those, not just the decision.

**`docs/MASTER_ROADMAP.md` is authoritative for the roadmap** (Council, 2026-07-28). Atlas §17 is the thematic summary and checkpoint Part 3 is the original pathway; where they disagree with the Master Roadmap, it wins. **Milestones are H3.1 … H3.8.** Catalog, Gift and Vendor *Intelligence* are H4.1–H4.3, deferred until the pilot — never describe them as the next H3 work.

**Recovery is complete.** Every milestone the Recovery Ledger was opened to recover has landed, including the Relationship Operations Atlas (R6). The Ledger remains the record of what was lost and how, plus live conflicts (C-codes) and People compromises (P-codes). **From H3.2 onward the work is new build, not reconstruction.**

**Unresolved rules are listed, not inferred.** `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 lists ten rules that do not exist — operator roles, SLAs, commercial role, QA taxonomy, partner onboarding and more. If you need one, raise an ADR; do not reconstruct it from memory.

**ADR-003 is retired.** Never reconstructed, never accepted. Do not reuse or renumber it, and do not treat it as a dependency of anything.

## Rules

- **Surface missing or conflicting decisions; never guess.** If two documents disagree, report the disagreement rather than picking one.
- **Do not encode unresolved checkpoint questions as settled architecture.** An open question stays open until a Council decision closes it.
- **Run an architecture review before structural domain work** — new canonical objects, lifecycle changes, persistence changes, Workspace/Operations boundary changes, money. Use `/aniye-architecture-review`.
- **One roadmap milestone per implementation scope.** Milestone identifiers come from `docs/MASTER_ROADMAP.md`. Use `/aniye-implement-milestone`. If a request spans several, ask which one.
- **The next milestone is H3.5 — Courier directory + manual selection, per operating country.** Nothing structural gates it. A courier, like a vendor, is a row an operator typed, so ADR-010's external-pilot gate does not bind; U3 (merchant of record) binds at H3.7. ⚠️ **Operations Atlas §9 U5 — partner onboarding — still does not exist**, and H3.4 deliberately did not invent it; raise an ADR rather than reconstructing it.
- **Inspect existing code before editing.** Most of what a milestone needs already exists — the migration runner, `resolvePolicyAssignment()`, the Money helpers, the operations repository, `ConfirmDialog`. Reimplementing them is a defect.
- **Structural persistence changes require** an ordered migration, a schema-version update, and a Recovery Ledger entry. The workspace chain is in `lib/migrations.ts` (currently v7) and moves one version at a time; `OperationsState` versions independently in `lib/operations/types.ts` (v4). Historical migrations are frozen — pin their value sets rather than referencing live enums.
- **Never silently overwrite unrelated working-tree changes.** Run `git status` first and preserve what you did not author.
- **Do not commit, push or tag unless explicitly requested.**

## Commands

```
npm run typecheck            npm run lint              npm run build
npm run validate:verification    npm run validate:migration
npm run validate:assignments     npm run validate:people
npm run validate:money           npm run validate:programs
npm run validate:operations     npm run validate:selection
npm run validate:vendors
```

Validation is plain `.mts` scripts under `scripts/`, run via a Node type-stripping resolver — **there is no test framework**. A new domain area gets its own suite plus a `validate:<area>` script.

**Report results honestly.** Never describe an untested result as verified; if a check was static analysis rather than execution, say which.

## Boundaries that are easy to breach

- **Workspace is customer configuration; Operations is Aniyé's record of what it did** (ADR-005, ADR-010). Separate route trees, shells, navigation and persistence. Operations reads configuration and may propose corrections — it never writes them.
- **Vendor cost, courier cost, margin, vendor and courier identity, QA exceptions and internal notes must never be projected into Workspace.**
- **A Program never pins a policy** (ADR-004). Policy resolves per Moment, by the recipient's country.
- **Money is integer minor units with a pinned exponent table** (ADR-007). Currencies are never summed and there is no implicit FX.
- **Nothing operational is recorded until the user confirms** (ADR-006). Browsing and abandoned selections are not Decisions.
- **There is no authentication and no role model.** Operations runs on browser storage as an internal prototype; a production backend, authentication, multi-tenancy and secure file storage are mandatory before any external access (ADR-010).
