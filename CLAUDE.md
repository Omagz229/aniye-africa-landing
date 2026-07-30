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
| ADRs 004–012 and registry | `docs/adr/` |
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
- **H3.6 — Fulfilment tracking is complete and [ADR-012](docs/adr/ADR-012-fulfilment-lifecycle-and-proof-recording.md) is implemented. The next milestone is H3.7 — Recognition Order and commercial tracking, and it has not begun.** The lifecycle is built exactly as accepted: three statuses — `Dispatched` · `DeliveryFailed` · `Delivered`; one Fulfilment per Moment, created only on confirmed dispatch, no persisted draft; `Redelivery` is the **only** Decision; `ProofReceived` after `Delivered` only and it changes no status. **Proof is metadata — never a file, URL, data URI, base64 or Blob**, refused at the write boundary on the payload *and* on the Event itself. `QAException`, disputes, `Returned`, `Escalation`, webhooks and tracking do not exist and must not be added.
- **The Fulfilment holds current state; the ordered Events are the historical truth.** `replayFulfilment()` walks a Fulfilment's Events in persisted order, and structural validation refuses any record whose status or attempt number disagrees with its own replay. Never mutate or reorder an earlier Event to make a lifecycle read correctly.
- **Both pre-H3.6 corrections landed before it, in the required order:** (1) the **H3.3/H3.4 malformed-container correction** applies the exported `isPlainRecord` before destructuring or property access and establishes that vendor `offers` is an array of plain records; no schema change. (2) the **policy-snapshot `v5 → v6` migration** captures `deliveryRequirement`, `preferredDeliveryWindow`, `signatureRequired` and `proofRequired` on newly generated Moments; legacy absence means *"not recorded"*, never a default, and it **blocks dispatch** with a named recovery. Do not reopen either.
- **A pre-v6 Moment cannot be dispatched, and cannot be repaired.** The promises are unrecoverable (the policy is edited in place at the same id and version) and the Moment cannot be prepared again — `createMoments` refuses a `sourceKey` that already exists, and cancelling does not release it. Never offer a re-preparation action; the recovery must say so.
- **Unresolved identifiers are source-scoped.** `CP-Un` = checkpoint open questions · `OPS-Un` = Operations Atlas §9 · `LEDGER-Cn` = ledger conflicts. Bare `U4` and bare `U5` each previously meant two different questions. **OPS-U4a is resolved and implemented; OPS-U4b (QA and adjudication) is deferred.** **CP-U3 / OPS-U3 (merchant of record) and CP-U4 (first pilot currency) both bind at H3.7** and must be closed before it starts.
- **Inspect existing code before editing.** Most of what a milestone needs already exists — the migration runner, `resolvePolicyAssignment()`, the Money helpers, the operations repository, `ConfirmDialog`. Reimplementing them is a defect.
- **Structural persistence changes require** an ordered migration, a schema-version update, and a Recovery Ledger entry. The workspace chain is in `lib/migrations.ts` (currently v7) and moves one version at a time; `OperationsState` versions independently in `lib/operations/types.ts` (currently **v7**, the additive `fulfilments` rung). Both counters now read 7; that is a coincidence, not coupling — never assert independence by asserting the numbers differ.  Historical migrations are frozen — pin their value sets rather than referencing live enums.
- **Never silently overwrite unrelated working-tree changes.** Run `git status` first and preserve what you did not author.
- **Do not commit, push or tag unless explicitly requested.**

## Commands

```
npm run typecheck            npm run lint              npm run build
npm run validate:verification    npm run validate:migration
npm run validate:assignments     npm run validate:people
npm run validate:money           npm run validate:programs
npm run validate:briefs          npm run validate:operations
npm run validate:selection       npm run validate:vendors
npm run validate:couriers        npm run validate:fulfilments
```

**All twelve suites, or the run is incomplete.** `validate:briefs` was previously missing from this
list, so following it as written under-ran the gates by a full suite (47 checks). The current total
is **504**.

Validation is plain `.mts` scripts under `scripts/`, run via a Node type-stripping resolver — **there is no test framework**. A new domain area gets its own suite plus a `validate:<area>` script.

**Report results honestly.** Never describe an untested result as verified; if a check was static analysis rather than execution, say which.

## Boundaries that are easy to breach

- **Workspace is customer configuration; Operations is Aniyé's record of what it did** (ADR-005, ADR-010). Separate route trees, shells, navigation and persistence. Operations reads configuration and may propose corrections — it never writes them.
- **Vendor cost, courier cost, margin, vendor and courier identity, QA exceptions and internal notes must never be projected into Workspace.**
- **A Program never pins a policy** (ADR-004). Policy resolves per Moment, by the recipient's country.
- **Money is integer minor units with a pinned exponent table** (ADR-007). Currencies are never summed and there is no implicit FX.
- **Nothing operational is recorded until the user confirms** (ADR-006). Browsing and abandoned selections are not Decisions.
- **There is no authentication and no role model.** Operations runs on browser storage as an internal prototype; a production backend, authentication, multi-tenancy and secure file storage are mandatory before any external access (ADR-010).
