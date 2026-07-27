/**
 * Campaign Programs — H2.6, implementing ADR-004.
 *
 * A **Program** is a controlled operational commitment: it takes a defined
 * population and a defined occasion and commits the organization to
 * recognizing them over a defined period, within explicit budget envelopes.
 *
 * ─── What a Program is deliberately not ──────────────────────────────────────
 * A Program never pins a policy. It carries no `policyAssignmentId`, no
 * `recognitionPolicyId` and no universal policy snapshot, because a single
 * snapshot cannot represent the country-scoped assignments ADR-001 introduced:
 * one group spanning Nigeria, Kenya and South Africa resolves to three
 * different policies, and one snapshot would silently apply one country's rule
 * to everyone.
 *
 * Policy resolution therefore happens **per person, per Moment**, through
 * `resolvePolicyAssignment()`. What this module computes is a *preview* — an
 * accurate picture of what the current configuration would produce right now.
 * It is recomputed at activation and never trusted from a stale draft.
 *
 * Pure and framework-free, like lib/assignments.ts and lib/people.ts: no
 * storage, no React, a value returned for every outcome including failure.
 */

import { SCHEMA_V6_PROGRAM_MODES, SCHEMA_V6_PROGRAM_STATUSES } from './migrations';
import type { SchemaV6ProgramMode, SchemaV6ProgramStatus } from './migrations';
import type {
  Money,
  PolicyAssignment,
  Person,
  RecognitionPolicy,
  RelationshipClass,
} from './workspace';
import { resolvePolicyAssignment } from './assignments';
import { isEligibleForAutomaticPopulation } from './people';
import { addMoney, currencyExponent, formatMoney, zero } from './money';

// ─── Canonical model ─────────────────────────────────────────────────────────

export const PROGRAM_MODES = SCHEMA_V6_PROGRAM_MODES;
export type ProgramMode = SchemaV6ProgramMode;

export const PROGRAM_STATUSES = SCHEMA_V6_PROGRAM_STATUSES;
export type ProgramStatus = SchemaV6ProgramStatus;

/**
 * The only mode H2.6 can create. `Recurring` and `Triggered` are declared in the
 * schema so they need no migration later, but nothing here produces them.
 */
export const IMPLEMENTED_PROGRAM_MODES: readonly ProgramMode[] = ['Campaign'];

export function isImplementedMode(mode: ProgramMode): boolean {
  return IMPLEMENTED_PROGRAM_MODES.includes(mode);
}

/**
 * The population as it stood at activation. **References only** — no copied
 * Person records, no policy data. Copying people here would create a second
 * source of truth for names and addresses that would immediately drift.
 */
export interface FrozenPopulation {
  personIds: string[];
  frozenAt: string;
}

export interface Program {
  id: string;
  name: string;
  description?: string;
  mode: ProgramMode;
  status: ProgramStatus;
  /** Exactly one Relationship Group per Program — ADR-004 Council condition. */
  relationshipClassId: string;
  occasionType: string;
  campaignStartDate: string;
  campaignEndDate: string;
  /** At most one envelope per currency. Never summed across currencies. */
  budgetEnvelopes: Money[];
  frozenPopulation?: FrozenPopulation;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  completedAt?: string;
  archivedAt?: string;
}

// ─── Budget envelopes ────────────────────────────────────────────────────────

export type EnvelopeResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Validate a set of envelopes.
 *
 * Currencies are never added together. An organization operating in NGN and KES
 * holds two separate budgets, and "the total" is a question with no correct
 * answer without an exchange rate — which ADR-007 requires to be an explicit,
 * dated snapshot, not an implicit conversion.
 */
export function validateEnvelopes(envelopes: Money[]): EnvelopeResult<Money[]> {
  const seen = new Set<string>();

  for (const envelope of envelopes) {
    if (currencyExponent(envelope.currency) === null) {
      return { ok: false, reason: `${envelope.currency} is not a supported currency.` };
    }
    if (!Number.isSafeInteger(envelope.amountMinor) || envelope.amountMinor < 0) {
      return { ok: false, reason: `The ${envelope.currency} budget must be a whole, non-negative amount.` };
    }
    if (seen.has(envelope.currency)) {
      return { ok: false, reason: `There is more than one ${envelope.currency} budget. Keep one per currency.` };
    }
    seen.add(envelope.currency);
  }

  return { ok: true, value: envelopes };
}

export function findEnvelope(envelopes: Money[], currency: string): Money | undefined {
  return envelopes.find(e => e.currency === currency);
}

// ─── Population ──────────────────────────────────────────────────────────────

export interface PopulationSummary {
  /** Active people currently in the selected group. */
  eligible: Person[];
  /** In the group but paused — retained, not recognized. */
  pausedCount: number;
  /** In the group but archived. */
  archivedCount: number;
  /** Distinct countries among eligible people. */
  countries: string[];
  /** Eligible people with no country recorded. */
  missingCountry: Person[];
}

/**
 * Who a Campaign would currently cover.
 *
 * Recomputed from live workspace data every time. A draft preview reflects the
 * directory as it stands; only activation freezes it.
 */
export function summarizePopulation(
  relationshipClassId: string,
  people: Person[],
  classes: RelationshipClass[],
): PopulationSummary {
  const cls = classes.find(c => c.id === relationshipClassId);
  const inGroup = people.filter(p => p.relationshipClassIds.includes(relationshipClassId));

  // An inactive group covers nobody — its members are not recognized at all.
  const eligible =
    cls && cls.isActive ? inGroup.filter(isEligibleForAutomaticPopulation) : [];

  const countries = [...new Set(eligible.map(p => p.country).filter((c): c is string => Boolean(c)))].sort();

  return {
    eligible,
    pausedCount: inGroup.filter(p => p.status === 'Inactive').length,
    archivedCount: inGroup.filter(p => p.status === 'Archived').length,
    countries,
    missingCountry: eligible.filter(p => !p.country),
  };
}

// ─── Policy resolution preview ───────────────────────────────────────────────

export interface PersonAllocation {
  person: Person;
  /** Set when the person's rule resolved for this occasion. */
  allocation?: Money;
  assignmentId?: string;
  policyId?: string;
  policyName?: string;
  /** Set when it did not. Plain language, ready to show. */
  unresolvedReason?: string;
}

export interface CurrencyAllocation {
  currency: string;
  peopleCount: number;
  /** Sum of per-person allocations **in this currency only**. */
  total: Money;
}

export interface AllocationPreview {
  perPerson: PersonAllocation[];
  /** One entry per currency. Deliberately never a single grand total. */
  byCurrency: CurrencyAllocation[];
  resolved: PersonAllocation[];
  unresolved: PersonAllocation[];
}

export interface PreviewInput {
  relationshipClassId: string;
  occasionType: string;
  people: Person[];
  classes: RelationshipClass[];
  assignments: PolicyAssignment[];
  policies: RecognitionPolicy[];
}

/**
 * What the current configuration would allocate, per person and per currency.
 *
 * Uses the same `resolvePolicyAssignment()` the Moment engine will use, so the
 * preview cannot drift from execution. Two people in the same group but
 * different countries may legitimately resolve to different policies, different
 * budgets, and different currencies — that is ADR-001 working, not an error.
 *
 * **There is deliberately no grand total.** Adding NGN to KES would require an
 * exchange rate, and an implicit one is exactly the kind of quiet inaccuracy
 * that makes financial reporting untrustworthy.
 */
export function previewAllocations(input: PreviewInput): AllocationPreview {
  const summary = summarizePopulation(input.relationshipClassId, input.people, input.classes);
  const perPerson: PersonAllocation[] = [];

  for (const person of summary.eligible) {
    const resolution = resolvePolicyAssignment({
      relationshipClassId: input.relationshipClassId,
      countryCode: person.country,
      classes: input.classes,
      assignments: input.assignments,
      policies: input.policies,
    });

    if (resolution.status === 'unresolved') {
      perPerson.push({
        person,
        unresolvedReason:
          resolution.reason === 'no-active-assignments'
            ? 'No recognition rule is connected to this group yet.'
            : resolution.reason === 'no-executable-policy'
              ? person.country
                ? `No published rule applies in ${person.country}.`
                : 'No published rule applies.'
              : resolution.detail,
      });
      continue;
    }

    const rule = resolution.policy.recognitionRules.find(
      r => r.momentType === input.occasionType && r.isEnabled,
    );

    if (!rule) {
      perPerson.push({
        person,
        assignmentId: resolution.assignment.id,
        policyId: resolution.policy.id,
        policyName: resolution.policy.name,
        unresolvedReason: `"${resolution.policy.name || 'Their rule'}" does not cover ${input.occasionType}.`,
      });
      continue;
    }

    perPerson.push({
      person,
      allocation: rule.budgetPerPerson,
      assignmentId: resolution.assignment.id,
      policyId: resolution.policy.id,
      policyName: resolution.policy.name,
    });
  }

  // Group by currency. Each currency totals independently.
  const byCurrency: CurrencyAllocation[] = [];
  for (const entry of perPerson) {
    if (!entry.allocation) continue;
    const existing = byCurrency.find(c => c.currency === entry.allocation!.currency);
    if (existing) {
      const sum = addMoney(existing.total, entry.allocation);
      if (sum.ok) existing.total = sum.value;
      existing.peopleCount++;
    } else {
      byCurrency.push({
        currency: entry.allocation.currency,
        peopleCount: 1,
        total: entry.allocation,
      });
    }
  }
  byCurrency.sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    perPerson,
    byCurrency,
    resolved: perPerson.filter(e => e.allocation !== undefined),
    unresolved: perPerson.filter(e => e.allocation === undefined),
  };
}

// ─── Activation ──────────────────────────────────────────────────────────────

export interface ActivationBlocker {
  /** Plain-language statement of the problem. */
  message: string;
  /** What to do about it. */
  recovery: string;
  /** Where to go, when there is a page that fixes it. */
  href?: string;
}

export type ActivationCheck =
  | { ok: true; population: PopulationSummary; preview: AllocationPreview }
  | { ok: false; blockers: ActivationBlocker[] };

export interface ActivationInput extends PreviewInput {
  campaignStartDate: string;
  campaignEndDate: string;
  budgetEnvelopes: Money[];
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Every condition that must hold before a Campaign may be activated.
 *
 * Returns *all* blockers rather than the first, so an administrator fixes one
 * round of problems instead of discovering them one at a time.
 */
export function checkActivation(input: ActivationInput): ActivationCheck {
  const blockers: ActivationBlocker[] = [];

  const cls = input.classes.find(c => c.id === input.relationshipClassId);
  if (!cls) {
    return {
      ok: false,
      blockers: [{
        message: 'The relationship group for this campaign no longer exists.',
        recovery: 'Choose a different group.',
        href: '/workspace/classes',
      }],
    };
  }
  if (!cls.isActive) {
    blockers.push({
      message: `"${cls.name}" is turned off, so nobody in it can be recognized.`,
      recovery: 'Turn the group back on, or choose a different one.',
      href: '/workspace/classes',
    });
  }

  // ─ Dates ─
  if (!isValidIsoDate(input.campaignStartDate)) {
    blockers.push({ message: 'The start date is not a valid date.', recovery: 'Use a date like 2026-12-01.' });
  }
  if (!isValidIsoDate(input.campaignEndDate)) {
    blockers.push({ message: 'The end date is not a valid date.', recovery: 'Use a date like 2026-12-20.' });
  }
  if (
    isValidIsoDate(input.campaignStartDate) &&
    isValidIsoDate(input.campaignEndDate) &&
    input.campaignEndDate < input.campaignStartDate
  ) {
    blockers.push({
      message: 'The campaign ends before it starts.',
      recovery: 'Set an end date on or after the start date.',
    });
  }

  const population = summarizePopulation(input.relationshipClassId, input.people, input.classes);
  const preview = previewAllocations(input);

  // ─ Population ─
  if (population.eligible.length === 0) {
    blockers.push({
      message: `Nobody in "${cls.name}" is active, so this campaign would cover no one.`,
      recovery: 'Add people to this group, or reactivate someone who is paused.',
      href: '/workspace/people',
    });
  }

  // Country is required whenever the group has any country-scoped assignment —
  // without it, resolution cannot tell which rule applies.
  const hasCountryScopedAssignment = input.assignments.some(
    a => a.isActive && a.relationshipClassId === input.relationshipClassId && a.countryCode,
  );
  if (hasCountryScopedAssignment && population.missingCountry.length > 0) {
    blockers.push({
      message: `${population.missingCountry.length} ${population.missingCountry.length === 1 ? 'person has' : 'people have'} no country recorded, and this group has country-specific rules.`,
      recovery: 'Add a country to those records so the right rule can be applied.',
      href: '/workspace/people',
    });
  }

  // ─ Policy coverage ─
  const noAssignment = preview.unresolved.filter(e => e.policyId === undefined);
  const noRule = preview.unresolved.filter(e => e.policyId !== undefined);

  if (noAssignment.length > 0) {
    blockers.push({
      message: `${noAssignment.length} ${noAssignment.length === 1 ? 'person has' : 'people have'} no published rule connected to them.`,
      recovery: 'Connect a published recognition rule to this group.',
      href: '/workspace/assignments',
    });
  }
  if (noRule.length > 0) {
    blockers.push({
      message: `${noRule.length} ${noRule.length === 1 ? 'person does' : 'people do'} not yet have a rule for ${input.occasionType}.`,
      recovery: `Turn on ${input.occasionType} in the recognition rule that covers them.`,
      href: '/workspace/policies',
    });
  }

  // ─ Budgets, per currency ─
  const envelopeCheck = validateEnvelopes(input.budgetEnvelopes);
  if (!envelopeCheck.ok) {
    blockers.push({ message: envelopeCheck.reason, recovery: 'Correct the budget and try again.' });
  }

  for (const allocation of preview.byCurrency) {
    const envelope = findEnvelope(input.budgetEnvelopes, allocation.currency);
    if (!envelope) {
      blockers.push({
        message: `${allocation.peopleCount} ${allocation.peopleCount === 1 ? 'person is' : 'people are'} recognized in ${allocation.currency}, but there is no ${allocation.currency} budget.`,
        recovery: `Add a ${allocation.currency} budget of at least ${formatMoney(allocation.total)}.`,
      });
      continue;
    }
    if (envelope.amountMinor < allocation.total.amountMinor) {
      blockers.push({
        message: `The ${allocation.currency} budget is below the amount your recognition rules currently allow.`,
        recovery: `Raise it to at least ${formatMoney(allocation.total)}, or narrow the group.`,
      });
    }
  }

  if (blockers.length > 0) return { ok: false, blockers };
  return { ok: true, population, preview };
}

// ─── Creating and activating ─────────────────────────────────────────────────

export interface NewCampaignInput {
  name: string;
  description?: string;
  relationshipClassId: string;
  occasionType: string;
  campaignStartDate: string;
  campaignEndDate: string;
  budgetEnvelopes: Money[];
}

export function createCampaignDraft(input: NewCampaignInput, now: string, id: string): Program {
  return {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    mode: 'Campaign',
    status: 'Draft',
    relationshipClassId: input.relationshipClassId,
    occasionType: input.occasionType,
    campaignStartDate: input.campaignStartDate,
    campaignEndDate: input.campaignEndDate,
    budgetEnvelopes: input.budgetEnvelopes,
    createdAt: now,
    updatedAt: now,
  };
}

export type ActivationResult =
  | { ok: true; program: Program; population: PopulationSummary; preview: AllocationPreview }
  | { ok: false; blockers: ActivationBlocker[] };

/**
 * Activate a Campaign, freezing its population.
 *
 * **Eligibility is recomputed here, not read from the preview.** A draft may
 * have been open for an hour while someone was archived or a rule was
 * unpublished; trusting the preview would freeze a population that no longer
 * matches reality.
 *
 * After activation the frozen list does not move: people added to the group
 * later are not swept in, and people removed or paused later are not silently
 * dropped. Whether a frozen person is still executable is a question for Moment
 * generation, which records an exception rather than rewriting history.
 */
export function activateCampaign(
  program: Program,
  context: PreviewInput,
  now: string,
): ActivationResult {
  if (program.status !== 'Draft') {
    return {
      ok: false,
      blockers: [{
        message: `This campaign is already ${program.status.toLowerCase()}.`,
        recovery: 'Only a draft campaign can be activated.',
      }],
    };
  }

  const check = checkActivation({
    ...context,
    relationshipClassId: program.relationshipClassId,
    occasionType: program.occasionType,
    campaignStartDate: program.campaignStartDate,
    campaignEndDate: program.campaignEndDate,
    budgetEnvelopes: program.budgetEnvelopes,
  });

  if (!check.ok) return { ok: false, blockers: check.blockers };

  return {
    ok: true,
    program: {
      ...program,
      status: 'Active',
      activatedAt: now,
      updatedAt: now,
      frozenPopulation: {
        // References only — never copied Person records.
        personIds: check.population.eligible.map(p => p.id),
        frozenAt: now,
      },
    },
    population: check.population,
    preview: check.preview,
  };
}

// ─── Reading a Program back ──────────────────────────────────────────────────

/** How many people a Program covers — frozen once active, live while draft. */
export function programPopulationCount(
  program: Program,
  people: Person[],
  classes: RelationshipClass[],
): number {
  if (program.frozenPopulation) return program.frozenPopulation.personIds.length;
  return summarizePopulation(program.relationshipClassId, people, classes).eligible.length;
}

/** Whether at least one Program is Active — the setup-completion condition. */
export function hasActiveProgram(programs: Program[]): boolean {
  return programs.some(p => p.status === 'Active');
}

export function sortPrograms(programs: Program[]): Program[] {
  const order: Record<ProgramStatus, number> = { Draft: 0, Active: 1, Completed: 2, Archived: 3 };
  return [...programs].sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** A zero envelope in the workspace's base currency, for a blank budget field. */
export function blankEnvelope(currency: string): Money {
  const blank = zero(currency);
  return blank.ok ? blank.value : { amountMinor: 0, currency: 'NGN' };
}
