@AGENTS.md

# Aniyé Project Governance

## Authoritative documents

These files govern structural work. They exist in this repository — check them, do not work from memory.

| Source | Path |
|--------|------|
| System Atlas — what the platform is | `docs/ANIYE_SYSTEM_ATLAS.md` |
| Experience Doctrine — how it feels | `docs/ANIYE_EXPERIENCE_DOCTRINE.md` |
| ADRs 004–010 and registry | `docs/adr/` |
| ADRs 001–002 | `docs/ANIYE_SYSTEM_ATLAS.md` §18 (no standalone files) |
| Recovery Ledger — reconstruction state, open conflicts | `docs/RECOVERY_LEDGER.md` |
| H2→H3 architecture checkpoint | `docs/H2_H3_ARCHITECTURE_CHECKPOINT.md` |
| Experience audit and friction register | `docs/ANIYE_EXPERIENCE_AUDIT.md`, `docs/ANIYE_FRICTION_REGISTER.md` |

**Approved ADRs and the latest applicable Atlas definitions govern structural implementation.** Each accepted ADR carries binding Council conditions that often narrow the original draft — read those, not just the decision.

**Two documents referenced elsewhere do not exist here:**

- `docs/RELATIONSHIP_OPERATIONS_ATLAS.md` — never reconstructed (recovery milestone 4). Do not substitute the System Atlas for it, and do not write its contents from memory.
- A standalone master roadmap. The roadmap is distributed across Atlas §17, checkpoint Part 3, and Recovery Ledger §0/§10.

**ADR-003 is retired.** Never reconstructed, never accepted. Do not reuse or renumber it.

## Rules

- **Surface missing or conflicting decisions; never guess.** If two documents disagree, report the disagreement rather than picking one.
- **Do not encode unresolved checkpoint questions as settled architecture.** An open question stays open until a Council decision closes it.
- **Run an architecture review before structural domain work** — new canonical objects, lifecycle changes, persistence changes, Workspace/Operations boundary changes, money. Use `/aniye-architecture-review`.
- **One roadmap milestone per implementation scope.** Use `/aniye-implement-milestone`. If a request spans several, ask which one.
- **Inspect existing code before editing.** Most of what a milestone needs already exists — the migration runner, `resolvePolicyAssignment()`, the Money helpers, the operations repository, `ConfirmDialog`. Reimplementing them is a defect.
- **Structural persistence changes require** an ordered migration, a schema-version update, and a Recovery Ledger entry. The workspace chain is in `lib/migrations.ts` (currently v6) and moves one version at a time; `OperationsState` versions independently in `lib/operations/types.ts` (v1). Historical migrations are frozen — pin their value sets rather than referencing live enums.
- **Never silently overwrite unrelated working-tree changes.** Run `git status` first and preserve what you did not author.
- **Do not commit, push or tag unless explicitly requested.**

## Commands

```
npm run typecheck            npm run lint              npm run build
npm run validate:verification    npm run validate:migration
npm run validate:assignments     npm run validate:people
npm run validate:money           npm run validate:programs
npm run validate:operations
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
