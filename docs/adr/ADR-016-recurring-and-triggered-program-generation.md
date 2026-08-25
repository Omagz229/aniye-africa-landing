# ADR-016 — Recurring and Triggered Program generation

**Status: Accepted · Not implemented**
**Date drafted:** 2026-08-18
**Date revised:** 2026-08-18 — fourth revision, re-verified against the actual checkout and
correcting several claims the third revision made without checking code
**Date accepted:** 2026-08-19 — Council, fourth revision accepted as written
**Targets:** H4.0 (Pre-pilot completion)

> **Accepted · Not implemented.** Acceptance authorizes the architecture below for later
> implementation; it does not deliver any of it. No claim in this document — the discriminated
> `Program` or `OperationalEvent` unions, the per-candidate transactional operation, the corrected
> `timezone` creation contract — should be read as already built. Its review did not depend on
> [ADR-015](ADR-015-production-persistence-authentication-and-tenant-isolation.md) — Program
> generation semantics are independent of authentication — but its **implementation** must run
> against ADR-015's backend and respect its actor-identity rules, both now accepted.

> **This revision was produced by re-reading the actual checkout, not by applying the review text
> at face value.** Several claims in the third revision did not survive that check and are corrected
> below, each marked with the exact evidence:
>
> - **The Workspace `timezone` field already exists** (`lib/workspace.ts:126`, lowercase, required;
>   `docs/ANIYE_SYSTEM_ATLAS.md` §4 already documents it). The third revision proposed adding a
>   second `timeZone` field via a v7→v8 migration — wrong, and struck.
> - **`createMoments` refuses its entire batch on one duplicate `sourceKey`**, not just that one
>   candidate (`lib/operations/local-store.ts`, `createMoments`: *"a batch containing an
>   already-prepared identity is refused whole rather than partially applied"*). The third revision's
>   claim that this "already provides" per-candidate `Duplicate` outcomes unchanged was wrong.
> - **No code path anywhere sets a Program's status to `Completed`.** `grep -rn "'Completed'"` across
>   `lib/` and `app/` matches only the enum declaration itself
>   (`SCHEMA_V6_PROGRAM_STATUSES`, `lib/migrations.ts`). The third revision's claim that Campaign
>   "already" auto-completes on `endDate` was fabricated — struck.
> - **`archive()` (`app/components/workspace/ProgramDetail.tsx`) has no status guard beyond "not
>   already `Archived`"** — `Draft`, `Active`, or (if it were ever reached) `Completed` can all be
>   archived today. The third revision's transition table only listed `Active`/`Paused → Archived`
>   and called it "unchanged" — it was narrower than the actual, current behavior.
> - **`OperationalEvent.momentId` is a required, non-optional field**
>   (`lib/operations/types.ts:326`). A Program-level run cannot be represented by appending an
>   `EventType` to the existing shape without a real structural change.

## Context

ADR-004 (2026-07-27) accepted three Program modes — **Recurring**, **Triggered**, **Campaign** —
distinguished by whether population is continuously re-evaluated or frozen at activation. Only
**Campaign** was ever implemented, at H2.6: `lib/programs.ts` states plainly, "`Recurring` and
`Triggered` are declared in the schema so they need no migration later, but nothing here produces
them" (`IMPLEMENTED_PROGRAM_MODES: readonly ProgramMode[] = ['Campaign']`).

`RELATIONSHIP_OPERATIONS_ATLAS.md` §9 **OPS-U6** names three separate gaps — **"cadence,
de-duplication window, cycle component of the `sourceKey`"** — classified 🟠, blocking **H4.0**.
**Lead time is not cadence** — the checkpoint's worked examples name both separately ("Nightly, 14
days ahead"), resolved as two distinct questions (Decision §2).

**Two accepted decisions this ADR builds inside, not around:**

- **ADR-005 / ADR-015**: Workspace configuration — including the existing `timezone` field
  (Decision §6) — is written only by an authenticated `CustomerAdministrator`; an `InternalOperator`
  holds read-only Workspace access where ADR-005 permits it, and never writes any of it. `Program`
  lives in `WorkspaceState` — its creation, activation, pausing, resuming and archiving are
  Workspace-configuration writes (Decision §1).
- **ADR-008**: Person lifecycle is `Active | Inactive | Archived`, governs **future eligibility
  only**, and is "never retroactive." Recurring's population semantics are built to this rule exactly
  (Decision §7).

**Six Council decisions from the prior review are preserved unchanged**, and are not reopened by this
revision: organization-local timezone governs `asOfDate`; February 29 observed on the 28th in
non-leap years; `triggerWindowDays` defaults to 30 and is stored explicitly; `Cancelled` struck,
`Archived` confirmed, `Paused` added; no mutable Program-level exceptions roster; H4.0 builds the
daily catch-up and manual-rerun path only, no synchronous Person-write invocation. Everything below
implements those six decisions **correctly against the actual checkout** — the corrections in this
revision are about *how* they are built, not *whether*.

### The Program-status amendment — restated precisely against what is actually shipped

ADR-004's own accepted reasoning requires a `Paused` status. The shipped schema
(`SCHEMA_V6_PROGRAM_STATUSES`, `lib/migrations.ts`) is `['Draft', 'Active', 'Completed', 'Archived']`
— no `Paused`, `Archived` where ADR-004 named `Cancelled`, and, verified this revision, **`Completed`
has never been reachable by any code path** — it is exactly as unimplemented as `Paused` was before
this ADR, not a "legitimate existing use" as the third revision wrongly claimed.

**Decided, unchanged from the prior Council decision**: `Cancelled` is struck from ADR-004's accepted
vocabulary; `Archived` is confirmed as the terminal, non-resumable stop it already is in shipped
code; `Paused` is added as a distinct, resumable status. This is **an explicit, named partial
amendment of ADR-004**. See Decision §13 for the complete, honestly-rebuilt transition table.

## Decision

### 1. Program configuration is a Workspace write; generation is an Operations action

- **Program creation, activation, pausing, resuming and archiving are `WorkspaceState` writes,
  performed only by an authenticated `CustomerAdministrator`** (ADR-005, ADR-015 §6). An
  `InternalOperator` may read Workspace configuration only where ADR-005/ADR-015 already permit it,
  and **must not configure a Program**. The same boundary governs the existing Workspace `timezone`
  field (Decision §6): the `CustomerAdministrator` sets it; the `InternalOperator` reads it,
  server-side, while operating generation.
- **Generation — turning eligible population into Moments — stays Operations territory**, exactly
  where Campaign's generation already lives (`/operations/programs/[id]/prepare`,
  `lib/operations/generation.ts`). This ADR does not move it into Workspace.
- **Attribution follows the pattern Campaign's own code already establishes, extended, not
  reinvented:**
  - `MomentQualification` and `PolicyResolution` Decisions remain `provider: 'RuleEngine'`, with no
    `actorId` — unchanged by this ADR for any mode.
  - **The daily catch-up run (Decision §12) is `actorType: 'System'`, with no human `actorId`** —
    mirroring the existing `MomentMarkedReady`/`MomentNeedsReview` Events' attribution.
  - **An explicitly authorized manual rerun — invoking the exact same server-side generation
    operation as the daily run (Decision §12) — is `actorType: 'Operator'`, with `actorId` derived
    from the authenticated server session** (ADR-015 Decision §5), never trusted from a request body.

### 2. Cadence, resolved separately from lead time — H4.0 builds the daily path only

**Cadence — how often eligibility is checked — is a distinct question from lead time.**

- **Active Recurring and Triggered Programs are evaluated at least once per organization-local
  calendar day** (Decision §6). The wall-clock time and the mechanism performing the check are
  **infrastructure, deferred to ADR-015 §6's deployment-target decision**; that a daily domain
  cadence exists is decided here.
- **H4.0 builds the daily catch-up path only** — decided, unchanged from the prior review. Generation
  is **not** invoked synchronously from a Person create, import, or update write. **The daily
  invocation calls the exact same idempotent server-side generation operation used for an authorized
  manual rerun** (Decision §12) — one operation, two callers.
- **This changes invocation timing, not eligibility.** Decision §4's Triggered window is unchanged by
  building only the daily path.
- **A missed or delayed daily run needs no special recovery**, because generation is evaluated fresh
  against current data on every run, not diffed against a schedule.
- **OPS-U6 is resolved in full**: cadence (this section), de-duplication window (Decision §5 —
  `CalendarYear` for Recurring, `ProgramLifetime` for Triggered), and the `sourceKey` cycle component
  (Decision §3).

### 3. `sourceKey` gains a cycle component for Recurring; Triggered's stays cycle-free

- **`recurringSourceKey(workspaceId, programId, personId, occasionType, cycleYear)`** — the calendar
  year of the **observed** occurrence (Decision §6 defines the February 29 case).
- **`triggeredSourceKey(workspaceId, programId, personId, occasionType)`** — no cycle component,
  identical in shape to `campaignSourceKey`, which is what "once per person, ever" is checked
  against.
- **"Once ever" means once per canonical `Person.id`, Program and occasion** — not deduplication
  across accidentally duplicated Person records, which this ADR does not attempt to solve.

### 4. Exact Triggered semantics — a current-state predicate, not transition detection

**Corrected this revision.** The daily evaluator has no creation snapshot, no field-change history,
and no `startDateRecordedAt` — nothing in this codebase records *when* a field was set, only its
current value. It **cannot** distinguish "created or imported with `startDate` already set" from
"`startDate` added to an existing Person later." The third revision's "qualifying transition:
creation or import with `startDate` set" was not implementable with the data H4.0 actually stores,
and is replaced with a **current-state predicate**:

A Person is a Triggered candidate on a given day's evaluation if, and only if:

1. they are a member of the daily candidate universe (Decision §7 — currently `Active` and in the
   Program's relationship class);
2. `Person.startDate` is present and valid;
3. the organization-local `asOfDate` (Decision §6) falls within
   `startDate − leadTimeDays` through `startDate + triggerWindowDays`, inclusive;
4. the Program/person/occasion `triggeredSourceKey` has not already generated a Moment.

- **Adding `startDate` to an existing Person qualifies them if the addition happens while they are
  still within the configured window** — there is no way, and no need, to distinguish this from a
  brand-new hire whose `startDate` was set at creation; both simply satisfy the same predicate on
  whatever day they first do.
- **Adding it after the window has closed does not qualify them** — they simply never satisfy
  condition 3, and the daily evaluation reports nothing for them (not even `NotDue`, since `NotDue`
  applies to a candidate who has not yet entered their window, not one whose window already closed
  with no `startDate` to have entered it).
- **The generated Moment's `targetDate` is `Person.startDate`.**
- **Existing qualifying people are evaluated at activation** — a Triggered Program's first daily
  evaluation checks the current population exactly as every later day's does.
- **Immediate Person-write invocation remains deferred** (Decision §2) — this predicate is evaluated
  identically whether it is checked once a day or, later, on every write; nothing about it assumes
  transition detection is available even when that path is eventually built.
- **`triggerWindowDays` creation default: 30 — decided, unchanged.** Configurable per Triggered
  Program; every stored configuration carries the explicit value; generation refuses to run rather
  than substitute a fallback if it is somehow missing; no maximum is imposed.

### 5. A mode-discriminated `Program` schema — relying on the existing activation model, not new date fields

**Corrected this revision**: the prior draft added `activeFrom`/`activeUntil` to Recurring and
Triggered. Checked against `lib/programs.ts`: `Program` already carries `activatedAt?: string` (set
when a Program is activated) and `archivedAt?: string`. **`activeFrom` adds nothing beyond
`activatedAt`** — a Program's activation instant is already recorded, and "is this Program currently
generating" is already fully answered by `status === 'Active'`, not by a second timestamp.
**`activeUntil` is actively wrong for these two modes**: Recurring and Triggered are open-ended by
the checkpoint's own description ("never completes... runs until paused") and stop only through
`Paused` or `Archived` (Decision §13) — a stored end date would leave an `Active` Program silently
inert forever once it passed, contradicting the "explicit stop" model this ADR otherwise builds.
**Both fields are removed.** The existing `status`/`activatedAt`/`archivedAt` model is reused
unchanged.

```ts
type Program = CampaignProgram | RecurringProgram | TriggeredProgram;

interface CampaignProgram extends ProgramBase {
  mode: 'Campaign';
  campaignStartDate: string;
  campaignEndDate: string;
  frozenPopulation?: FrozenPopulation;
  // unchanged from today — no field here is added, removed, or renamed
}

interface RecurringProgram extends ProgramBase {
  mode: 'Recurring';
  recurringDateField: 'birthday';          // closed enum of one value at H4.0
  leadTimeDays: number;                    // default 14 at creation
  deduplicationScope: 'CalendarYear';
}

interface TriggeredProgram extends ProgramBase {
  mode: 'Triggered';
  triggerField: 'PersonStartDate';         // closed enum of one value at H4.0
  leadTimeDays: number;
  triggerWindowDays: number;               // required, explicit, default 30 at creation — Decision §4
  deduplicationScope: 'ProgramLifetime';   // never `CalendarYear` — Triggered's sourceKey has no cycle
}
```

`ProgramBase` already carries `status`, `activatedAt`, `archivedAt` (and, once Decision §13 lands,
the additional transition timestamps that requires); neither new interface adds a competing date
field.

- **`triggerWindowDays` exists only on `TriggeredProgram`.** A `CampaignProgram` or `RecurringProgram`
  payload carrying it is **refused outright**, the same discipline `FORBIDDEN_MEMORY_FIELDS` already
  applies elsewhere.
- **`deduplicationScope: 'ProgramLifetime'` on Triggered, never `'CalendarYear'`** — Triggered's
  `sourceKey` (Decision §3) carries no cycle, so a calendar-year scope has nothing to mean there.
- **The Workspace `timezone` field (Decision §6) is not a `Program` field** — it lives once per
  Workspace.
- Requires an **additive** Workspace schema migration, **v7 → v8**, for the `Program` union and the
  `Paused` status (Decision §13) — **not** for `timezone`, which already exists (Decision §6). Per
  `CLAUDE.md`, this needs its own ordered migration, schema-version update, and Recovery Ledger entry
  at implementation.

### 6. Calendar behavior — the existing `timezone` field, its creation contract corrected

**Corrected this revision**: `WorkspaceState` already has a lowercase `timezone: string` field
(`lib/workspace.ts:126`), documented in `docs/ANIYE_SYSTEM_ATLAS.md` §4, drawn from a curated
`TIMEZONES` list of IANA identifiers (`lib/workspace.ts:513`). **This ADR does not add a second
field, and every reference below uses the existing field and its exact casing.**

- **The authoritative instant is the Workspace's own `timezone` — not UTC, not the operator's browser
  timezone.** `asOfDate` — the calendar date generation evaluates against — is **derived server-side**
  from `WorkspaceState.timezone`, never from client input.
- **The existing creation-time fallback is corrected, not the field.** `createWorkspace()`
  (`lib/workspace.ts:577`) currently defaults a missing `timezone` to `'Africa/Lagos'` silently:
  `timezone: input.timezone ?? 'Africa/Lagos'`. **New Workspaces must supply an explicit, valid IANA
  `timezone` at creation — the silent fallback is removed for new creation going forward.** Every
  **existing** stored `timezone` value, including ones that only exist today because of that
  fallback, **remains valid as-is** — nothing is erased, replaced, or re-validated retroactively.
- **No runtime validator currently checks a stored `timezone` value against `TIMEZONES`** — verified:
  the list is consumed only by `OrgProfileForm.tsx` to populate a selection control, with no
  server-side or data-layer check anywhere. "Invalid" is therefore a case this ADR must define for
  defensive purposes (a value reaching storage some other way — direct edit, a future import path),
  not a case the current code actively produces or catches today.
- **A Recurring or Triggered Program cannot be activated until its Workspace has a valid `timezone`**
  — a new activation blocker for the two continuous modes only. **Campaign's existing activation
  behavior is completely unaffected**, since Campaign never depended on a calendar-day cadence.
  Because `timezone` is already a required field populated by the single `createWorkspace()`
  construction point, this blocker is expected to be inert in practice for every Workspace created
  through that path — it exists for the defensive case above and for whatever pre-`createWorkspace()`
  data may still be uncovered, not because today's system is known to produce Workspaces with no
  `timezone`.
- **Access follows ADR-005/ADR-015 exactly as every other Workspace field**: the
  `CustomerAdministrator` configures `timezone`; the `InternalOperator` reads it, server-side, only
  while operating generation.
- **February 29 — decided, unchanged.** Observed on February 29 itself in a leap year, and on
  February 28 in a non-leap year. **`cycleYear` in `recurringSourceKey` is the observance year** in
  both cases, guaranteeing exactly one Moment per person, Program, occasion and year.
- **Year-crossing** (against the Workspace's own `timezone`, not UTC): when a lead-time window spans a
  year boundary, `cycleYear` is the calendar year of the birthday occurrence being prepared for, the
  *later* year.
- **A candidate with a missing or invalid trigger field** produces the assessment outcome `Blocked`,
  reason `missing-trigger-field` (Decision §9) — never a fabricated Moment, never silently dropped.

### 7. The candidate universe, and Recurring population semantics

**This section resolves the eligibility-taxonomy contradiction the third revision left** (Decision §7
classified relationship-group state as both `Ineligible` and a `NeedsReview` reason). The fix starts
from how the candidate set is actually built, verified against `lib/people.ts`:

- **The daily candidate universe for a Program is exactly what `eligiblePeopleForClasses` already
  computes for Campaign** — `Active` people (`isEligibleForAutomaticPopulation`) currently in the
  Program's relationship class — **reused unchanged**, recomputed fresh every day.
- **A person who is `Inactive`, `Archived`, or no longer a member of the class is therefore never in
  the candidate set at all** — not assessed, not recorded, not a `GenerationCandidateResult` of any
  kind. This is stronger than "produces an `Ineligible` outcome": under this ADR's own candidate
  construction, per ADR-008's "future eligibility only" rule, such a person simply isn't there to
  produce an outcome about. `Ineligible` remains part of the assessment type (Decision §9) for
  symmetry with Campaign's per-person model and for any future widening of the candidate universe —
  **it is not reachable in practice under this ADR**, and this ADR does not claim otherwise.
- **A Moment already generated before a person later becomes ineligible is unchanged and never
  retroactively removed** — ADR-008: "Moments already executed remain valid and reportable."
- **A broken relationship group — missing or deactivated — is a Program-level condition, not a
  per-candidate one.** If the Program's `relationshipClassId` no longer resolves to an existing,
  active class, the daily run **halts for that Program before any candidate is assessed**, recorded
  once in that day's `ProgramGenerationRun` Event (Decision §11) — not fanned out into one issue per
  eligible person, which would otherwise repeat the same root cause every day the group stays broken.
  This is the corrected reading of what was previously assessed per-person as `group-missing`/
  `group-inactive` in `assessPerson`; for continuous modes it is checked once, at the Program level,
  before candidate assessment begins.
- **A candidate whose policy cannot resolve for an individual reason — no executable assignment, no
  rule for this occasion, missing country for a country-scoped assignment — still generates a
  `NeedsReview` Moment**, exactly as Campaign's `assessPerson` already does for those specific issue
  codes. These are per-candidate problems, not Program-level ones, and remain per-candidate
  `NeedsReview` (Decision §9).

### 8. Budget — currency-safe, and not RecognitionOrder "committed spend"

Campaign's envelope check (`validateEnvelopes` plus a total-allocation comparison in
`lib/programs.ts`) runs once, at activation, against the frozen population's projected cost in each
currency it uses — verified against the code, there is no ongoing exhaustion mechanism for continuous
modes to reuse. `budgetEnvelopes` is `Money[]` — **one array of independent, single-currency
envelopes, never a cross-currency total.** This ADR decides:

- **Reserved allocation is derived from the generated Moment's `PolicyResolutionSnapshot
  .approvedRecognitionBudget`** — a `Money` value captured at generation time, in whatever currency
  the resolved policy uses. **This is not, and is never described as, `RecognitionOrder` "committed
  spend"** — a `RecognitionOrder` (ADR-013) does not exist yet at generation time; it is created much
  later, at vendor/item selection. Budget reservation for Recurring/Triggered happens entirely before
  any `RecognitionOrder` could exist, using the same policy-resolution snapshot Campaign already
  captures at generation.
- **Consumption and admission are evaluated per currency, independently.** A candidate is compared
  only against the envelope matching their resolved policy's currency; envelopes in other currencies
  are irrelevant to that candidate. **Currencies are never combined and no FX conversion occurs** —
  unchanged from ADR-007's standing rule.
- **Budget period**: for **Recurring**, an **annual** allocation, one period per `cycleYear`
  (Decision §5's `CalendarYear` scope), reset to zero at each `cycleYear` boundary — new behavior;
  nothing in the codebase resets a counter automatically today. For **Triggered**, a
  **program-lifetime total** per currency (Decision §5's `ProgramLifetime` scope), never reset.
- **Two distinct reason codes, not one**: `budget-envelope-missing` — the Program has no envelope at
  all in the candidate's resolved currency — and `budget-exhausted-for-period` — an envelope exists in
  that currency but the current period's remaining headroom cannot cover this candidate. Both produce
  the assessment outcome `Blocked` (Decision §9), distinguished by reason code.
- **Deterministic ordering is retained while each currency is enforced independently**: candidates are
  processed in one deterministic order (ascending `personId`); a currency's remaining headroom is
  decremented only as that currency's own candidates are admitted, in that same order — a candidate
  whose currency is exhausted does not block or reorder candidates resolved in a different currency.
- **Recovery after a budget correction**: an unfunded candidate's `sourceKey` was never created, so a
  later envelope increase requires no special retry path — the next daily run generates them normally
  once headroom exists in their currency.

### 9. Assessment is separate from the committed result

**Corrected this revision.** A pure function that writes nothing cannot know whether a due candidate
will ultimately become `Generated` or lose a `sourceKey` uniqueness race and become `Duplicate` — that
outcome depends on what actually gets committed, which only the transactional operation (Decision
§10) knows. The prior revision's single `CandidateOutcome` type conflated an assessment-time judgement
with a commit-time result. Split into two:

**Assessment** — pure, produced by extending `assessPerson`'s existing shape, over the candidate
universe (Decision §7):

```ts
type CandidateAssessment = 'Due' | 'NotDue' | 'Ineligible' | 'Blocked';

interface GenerationCandidateAssessment {
  personId: string;
  assessment: CandidateAssessment;
  /** Required for Blocked; the codes below. Never set for Ineligible — under
   *  this ADR's candidate universe (Decision §7), Ineligible people are never
   *  assessed in the first place, so no reason is ever attached to it here. */
  reasonCode?: string;
}
```

- `Due` — eligible, in window, `sourceKey` not yet known to exist as of assessment time. May still
  resolve to `NeedsReview` once committed (see below) — `Due` says "should attempt generation," not
  "will generate cleanly."
- `NotDue` — eligible, outside the `leadTimeDays`/`triggerWindowDays` window.
- `Ineligible` — retained in the type for symmetry with Campaign's model; not reachable in practice
  under this ADR (Decision §7).
- `Blocked` — would otherwise be `Due`, but cannot proceed: `missing-trigger-field` (Decision §6),
  `budget-envelope-missing`, or `budget-exhausted-for-period` (Decision §8).

**Committed result** — produced only by the transactional operation (Decision §10), after it has
actually attempted to write:

```ts
type CandidateOutcome = 'Generated' | 'Duplicate' | 'NotDue' | 'Ineligible' | 'Blocked';

interface GenerationCandidateResult {
  personId: string;
  outcome: CandidateOutcome;
  reasonCode?: string;          // carried over for Blocked; unset otherwise
  momentId?: string;            // present for Generated and Duplicate
  /** Present only when outcome is Generated. Exposes whether the created
   *  Moment is ReadyForExecution or NeedsReview — NeedsReview is a status of
   *  a generated Moment, never a separate non-generation outcome. */
  momentStatus?: 'ReadyForExecution' | 'NeedsReview';
}
```

- Every `Due` assessment becomes either `Generated` (with `momentStatus` reflecting whichever status
  `assessPerson`'s existing policy-resolution logic produces — `NeedsReview` for an unresolved policy,
  no-occasion-rule, or missing country, per Decision §7's last bullet) or `Duplicate` (the `sourceKey`
  turned out to already exist by commit time — Decision §10).
- `NotDue`, `Ineligible`, and `Blocked` assessments pass through to the result unchanged — nothing
  further is attempted for them, so there is nothing further to decide.
- **`NeedsReview` is never turned into a non-generation outcome.** A `NeedsReview` Moment is a
  `Generated` result whose `momentStatus` says so — it is a real Moment, in Operations' queue,
  requiring resolution under the existing generation rules, exactly as Campaign's does today.

### 10. Concurrency and transaction boundaries

**New this revision**, correcting the prior claim that the existing `createMoments` batch refusal
"already provides" per-candidate `Duplicate` handling unchanged. Verified against
`lib/operations/local-store.ts`: `createMoments` refuses its **entire batch** — atomically, and
correctly, for Campaign's one-shot use — on a single duplicate `sourceKey`. A daily run touching many
candidates cannot use that behavior directly: one already-generated candidate among many due ones
would refuse Moments for everyone else in the same run.

- **Each due candidate's write is its own atomic transaction** — budget admission for that
  candidate's currency, the unique-`sourceKey` insertion, the Moment, its Decisions, and its Events
  commit together, or none of them do. **The entire daily run is explicitly not all-or-nothing.**
- **A `sourceKey` uniqueness conflict is caught per candidate, not per run.** If a candidate's
  `sourceKey` turns out to already exist at commit time — a concurrent run, an earlier partial
  success, or a manual rerun overlapping the daily one — the existing Moment is re-read, that
  candidate's result becomes `Duplicate`, and **every other candidate in the run proceeds
  independently.**
- **Budget admission and creation are serialized per `(Program, period, currency)`** — or protected by
  an equivalent database-level invariant with the same effect — so that two overlapping runs (the
  daily run and a manual rerun, or two retries) cannot each independently observe headroom and jointly
  oversubscribe the same currency's envelope for the same period. This is a new coordination
  requirement; nothing in the current codebase provides it, because nothing today writes to a shared
  budget counter concurrently.
- **Implementation requires a new, concurrency-aware "insert-if-absent" repository operation** —
  distinct from `createMoments`'s batch-refusal shape — that performs the per-candidate transaction
  above and reports which of `Generated`/`Duplicate` actually happened. This ADR does not claim
  `createMoments` can be reused unchanged for this; it explicitly requires new repository surface.

### 11. The run-audit Event — a discriminated extension of ADR-006's Event model

**Corrected this revision.** `OperationalEvent.momentId` is a required `string`
(`lib/operations/types.ts:326`) — a Program-level run cannot be represented by adding an `EventType`
to the existing shape, because every existing Event, and everything that reads one (the Moment
timeline in `MomentDetail.tsx`, `validateOperationsState`'s Event checks), assumes a real `momentId`
it can resolve to an actual Moment. This is **named here as an extension of ADR-006's Event model with
a real type and validation effect**, not a type-only addition:

```ts
type OperationalEventEnvelope = MomentEvent | ProgramGenerationRunEvent;

interface MomentEvent {
  scope: 'Moment';
  id: string;
  workspaceId: string;
  momentId: string;              // required, as today
  eventType: EventType;          // the existing enum, unchanged
  actorType: ActorType;
  actorId?: string;
  source: EventSource;
  payload: Record<string, unknown>;
  occurredAt: string;
  recordedAt: string;
}

interface ProgramGenerationRunEvent {
  scope: 'ProgramGenerationRun';
  id: string;
  workspaceId: string;
  programId: string;             // required — no fabricated momentId, ever
  actorType: ActorType;          // 'System' for the daily run, 'Operator' for a manual rerun — Decision §1
  actorId?: string;
  asOfDate: string;
  countsByOutcome: Record<CandidateOutcome, number>;
  /** Every Blocked candidate this run, by personId and reason — the
   *  actionable failures an unattended run cannot otherwise be diagnosed
   *  from. NotDue and ordinary Ineligible populations are never persisted
   *  here — both are large, expected, and non-actionable; persisting them
   *  would turn this Event into the mutable exceptions roster the Council
   *  already rejected (Decision §9's predecessor, Council decision 5). */
  blockedCandidates: Array<{ personId: string; reasonCode: string }>;
  occurredAt: string;
  recordedAt: string;
}
```

- Every existing call site constructing an Event continues to produce a `MomentEvent` — the union's
  first variant is exactly today's shape, `scope` is the only addition to it. `validateOperationsState`
  gains a branch validating `ProgramGenerationRunEvent`'s own required fields (`programId`, no
  `momentId`), rather than relaxing `momentId` to optional across the board, which would weaken every
  existing check that a Moment Event's `momentId` resolves to a real Moment.
- **Persisted, per the Council's exceptions-roster decision**: the run summary (counts) and the
  identities and reasons of every `Blocked` candidate — append-only, part of the same Event log every
  other Operations action already writes to.
- **Not persisted**: `NotDue` or ordinary (candidate-universe-excluded) `Ineligible` populations, on
  any run, ever — those are the Council's explicit exclusion (Council decision 5, preserved unchanged).

### 12. The production execution boundary

- The pure assessment (Decision §9) reuses the exact shape `assessPerson`/`GenerationContext` already
  establish for Campaign: pure, framework-free, computes the candidate universe (Decision §7) and an
  assessment per candidate, writes nothing.
- **One transactional server operation** invokes it — called identically by the daily catch-up run
  and by an authorized manual rerun (Decision §1, §2) — and:
  - **re-reads** Program status and configuration, the Workspace `timezone`, Person eligibility,
    classes, policies, assignments, existing `sourceKey`s, and current-period, current-currency
    budget consumption at execution time, never from an earlier snapshot trusted stale — extending
    the principle `lib/programs.ts` already states for Campaign: "recomputed at activation and never
    trusted from a stale draft";
  - **derives workspace and actor context server-side**, per ADR-015 Decision §1/§5;
  - **commits each `Due` candidate through the per-candidate transactional operation** (Decision §10)
    — not a single batch commit — converting each into `Generated` or `Duplicate`;
  - **appends one `ProgramGenerationRunEvent`** (Decision §11) summarizing the whole run;
  - has **no stale evaluation to reconcile**, because eligibility, budget headroom, and `sourceKey`
    existence are all re-read at the moment of each candidate's own commit, not carried forward from
    an earlier preview.

### 13. Program status: the amendment, and the transition table rebuilt from actual behavior

**Decided, unchanged from the prior Council decision**: `Cancelled` is struck from ADR-004's accepted
vocabulary; `Archived` is confirmed as the terminal, non-resumable stop it already is in shipped code;
`Paused` is added as a distinct, resumable status. `Paused` is additive to the same v7→v8 migration
Decision §5 requires.

**The transition table below is rebuilt from what `archive()` and the rest of `ProgramDetail.tsx`
actually do today, not restated as "unchanged" from a narrower table that was never accurate:**

| Transition | Permitted for | Notes |
|---|---|---|
| `Draft → Active` | All three modes | Unchanged |
| `Draft → Archived` | All three modes | **Already possible today** — `archive()` has no status guard beyond "not already `Archived`"; a Program can be archived before it ever activates |
| `Active → Archived` | All three modes | Unchanged, today's primary path |
| `Active → Paused` | Recurring, Triggered only | New. Campaign has no ongoing generation to pause |
| `Paused → Active` | Recurring, Triggered only | New. Resuming returns the Program to `Active`; generation resumes on the next daily run |
| `Paused → Archived` | Recurring, Triggered only | New, symmetric with the existing `Active → Archived` path |
| `Active → Completed` | **None** | **Verified: no code path sets this status today, for any mode.** `Completed` is accepted (ADR-004) and now additionally reachable in the type, but this ADR does not build the automatic transition — that is future, unbuilt work, exactly as `Paused` was before this revision. `Completed` is **preserved in the vocabulary**, not removed, so a future ADR can build the transition without another amendment |
| — | Recurring, Triggered | **Never auto-transition to `Completed`**, consistent with both being open-ended — this line is unaffected by the correction above, since neither mode was ever a candidate for it |

- **While `Paused`, generation produces nothing for that Program** — the daily run skips it entirely
  — but **every existing Moment, Decision, and Event is untouched**, exactly as ADR-004's own
  reasoning requires.
- **Every Workspace status transition is attributed to the authenticated `CustomerAdministrator`**
  who performed it (Decision §1).

## What this ADR does not decide

| Not decided or built here | Where it actually gets decided |
|---|---|
| Person date fields beyond `birthday` for Recurring | A future ADR, when a second real case exists |
| Trigger fields beyond `Person.startDate` | A future ADR, when a second real case exists |
| Whether/when immediate on-Person-write generation is built | A future decision — explicitly deferred (Decision §2) |
| Generation scheduling / execution infrastructure | ADR-015 §6 — deployment target, its own follow-up ADR |
| An automatic `Active → Completed` transition, for any mode | A future ADR — `Completed` stays reachable in the vocabulary, unbuilt (Decision §13) |
| Approval before generation runs | **CP-U2** — currently ⚪, not blocking |
| Customer-facing visibility of upcoming or generated Moments | **ADR-017** |
| Any persisted exceptions-management model or dedicated exceptions UI | A later ADR, when a concrete operator workflow demands it (Decision §11) |
| Timezone value validation against `TIMEZONES` at write time | Not built today, not built by this ADR — flagged as a defensive gap (Decision §6) |
| Reporting periods, extended population filters, `configurationSnapshot` | Deferred exactly as ADR-004 and the checkpoint already left them |
| Person-identity deduplication across accidental duplicate records | Not this ADR's problem to solve (Decision §3) |
| Any change to Campaign's existing fields or `sourceKey` format | Not touched — Campaign is unaffected by this ADR |

**No Council choice remains open.** The six preserved decisions (timezone authority, February 29,
`triggerWindowDays` default, the status amendment, no exceptions roster, daily-only execution) are
unchanged from the prior round; this revision corrects how each is implemented against the actual
checkout, not what was decided.

## Consequences

- **No new Workspace field.** The existing `timezone` field is reused; only its creation-time
  fallback (`createWorkspace()`, `lib/workspace.ts:577`) changes, from silent `Africa/Lagos` to a
  required explicit value for new Workspaces (Decision §6).
- `lib/programs.ts`'s `Program` becomes a discriminated union **without** `activeFrom`/`activeUntil`
  (Decision §5); `SCHEMA_V6_PROGRAM_STATUSES` gains `Paused` (Decision §13) — one additive Workspace
  schema bump, **v7 → v8**, requiring its own ordered migration and Recovery Ledger entry.
- Program activation gains a new blocker for Recurring/Triggered — an invalid or missing Workspace
  `timezone` — expected to be inert in practice given `timezone`'s existing required-field status
  (Decision §6); Campaign's activation is unaffected.
- `lib/operations/types.ts`'s `OperationalEvent` becomes a discriminated union
  (`MomentEvent` | `ProgramGenerationRunEvent`, Decision §11) — a real structural change,
  **not** additive-only; `validateOperationsState` gains a validation branch for the new variant.
  Every existing Event-construction call site is unaffected in shape, since `MomentEvent` is today's
  exact structure plus one discriminant field.
- `lib/operations/generation.ts` gains `RecurringGenerationContext`/`TriggeredGenerationContext`,
  each producing `GenerationCandidateAssessment`s (Decision §9, pure); a **new** transactional
  repository operation performs per-candidate commits (Decision §10) — this is not an extension of
  `createMoments`, which remains exactly as it is today for Campaign's own use.
- Budget consumption tracking, per `(Program, cycleYear-or-lifetime, currency)`, is genuinely new —
  derived on read from generated Moments' policy-resolution snapshots, never stored as a running
  counter, never combining currencies (Decision §8).
- **No persisted exceptions object is introduced.** Visibility is the generation run's own result
  (`GenerationCandidateResult[]`) plus one `ProgramGenerationRunEvent` per run, persisting only
  `Blocked` candidates by identity and reason (Decision §11).
- `IMPLEMENTED_PROGRAM_MODES` grows from `['Campaign']` to `['Campaign', 'Recurring', 'Triggered']`
  only once implementation lands and is validated.
- A new validation suite must prove, at minimum: `timezone`'s existing casing and required-field
  status are reused, and the creation-time `Africa/Lagos` fallback no longer applies to new
  Workspaces; a `startDate` added to an existing Person qualifies them inside the window and does not
  outside it; assessment (`Due`/`NotDue`/`Blocked`) is distinct from committed result
  (`Generated`/`Duplicate`), with `NeedsReview` exposed as a `Generated` Moment's status; a run
  containing both a genuinely new candidate and a `sourceKey` collision produces one `Generated` and
  one `Duplicate` with no cross-candidate failure; two overlapping runs (daily plus manual) never
  produce a duplicate Moment and never jointly oversubscribe a currency's envelope; independent
  envelopes in two different currencies are each enforced correctly with no cross-currency effect; a
  `ProgramGenerationRunEvent` carries a real `programId` and no fabricated `momentId`, and
  `validateOperationsState` accepts it; `Blocked` candidates are persisted on the run Event while
  `NotDue`/excluded-`Ineligible` populations are not; `Draft`, `Active`, and (if ever reached)
  `Completed` can all be archived, matching today's actual `archive()` behavior; no generation occurs
  for a `Paused` Program.
- `RELATIONSHIP_OPERATIONS_ATLAS.md` §9's **OPS-U6** row should be marked resolved on acceptance.

## Relationship to earlier decisions

- **Implements the two remaining modes ADR-004 already accepted**, and **explicitly, partially
  amends** ADR-004's status vocabulary — striking `Cancelled`, confirming `Archived`, adding `Paused`,
  and preserving `Completed` in the vocabulary without inventing an automatic transition this ADR does
  not build (Decision §13).
- **Builds inside ADR-005/ADR-015's Workspace/Operations boundary**: Program and `timezone`
  configuration are `CustomerAdministrator` writes; generation is an Operations action, attributed to
  `System` or an authenticated `Operator` session (Decision §1, §6, §12).
- **Honors ADR-008's Person-lifecycle rule precisely**, expressed here as candidate-universe
  construction rather than a per-candidate outcome (Decision §7).
- **Extends ADR-006's Event model with a real structural change** — a discriminated
  `OperationalEvent` union — named as such, not described as adding an `EventType` with no schema
  effect (Decision §11).
- **Resolves `RELATIONSHIP_OPERATIONS_ATLAS.md` §9 OPS-U6** in full: cadence, de-duplication window,
  and the `sourceKey` cycle component (Decision §2, §3, §5, §8).
- **Requires new repository surface** (Decision §10) rather than claiming `createMoments`'s existing
  batch-refusal behavior serves continuous modes unchanged — a correction to what the prior revision
  claimed, not a new architectural boundary.
- **Its review is independent of ADR-015; its implementation is not** — the transactional execution
  boundary (Decision §12) is where the two meet, and where `timezone` is read server-side under
  ADR-015's access rules.
- **Does not touch ADR-017's territory** — nothing here decides what a customer sees, or whether a
  `ProgramGenerationRunEvent` is ever exposed outside Operations.
