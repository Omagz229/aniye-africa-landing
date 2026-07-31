/**
 * Canonical operational records — H3.1, implementing ADR-006 and ADR-010.
 *
 * These are **not** workspace configuration. A Moment is something Aniyé is
 * doing; a Decision is a judgement it made; an Event is something that
 * happened. They accumulate rather than being edited, they are written by
 * operators rather than by the customer, and per ADR-010 they live in a
 * separate `OperationsState` that the customer's document never sees.
 */

import type { Money } from '../money';
import { isValidMoney } from '../money';
import { isIsoInstant, isVendorEmailShape } from './vendors';
import type { CatalogItemSnapshot } from '../catalog';
import type { DeliveryAddress, DeliveryRequirement, RelationshipType } from '../workspace';

// ─── Moment ──────────────────────────────────────────────────────────────────

/**
 * The Relationship Engine's canonical Moment lifecycle.
 *
 * `Closed` is produced only by the H3.8 closure operation. Dispatch and
 * delivery remain Fulfilment states and deliberately never become Moment
 * statuses.
 */
export const MOMENT_STATUSES = ['NeedsReview', 'ReadyForExecution', 'Cancelled', 'Closed'] as const;
export type MomentStatus = (typeof MOMENT_STATUSES)[number];

/**
 * What the next operational step needs to reach a person — deliberately not the
 * whole Person record. Copying everything would create a second source of truth
 * for data the customer keeps editing.
 */
export interface RecipientSnapshot {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  country?: string;
  role?: string;
}

/** Enough to explain which group this Moment came from, after the group changes. */
export interface RelationshipGroupSnapshot {
  relationshipClassId: string;
  name: string;
  type: RelationshipType;
  level: number;
}

/**
 * Why this Moment received this budget — the answer must survive the policy
 * being edited, republished or archived afterwards.
 *
 * Deliberately not the whole policy: the fields here are the ones that explain
 * the outcome, and nothing more.
 */
export interface PolicyResolutionSnapshot {
  policyAssignmentId: string;
  policyId: string;
  policyName: string;
  policyVersion: number;
  /** The country code the winning assignment was scoped to, or 'Global'. */
  resolvedCountryScope: string;
  occasionType: string;
  approvedRecognitionBudget: Money;
  /**
   * The gift categories the governing policy excluded, captured at generation —
   * **H3.3, and deliberately optional.**
   *
   * Optional because it is *absent* on every Moment generated before H3.3, and
   * absent has to keep meaning "nobody recorded this", not "nothing was
   * excluded". Defaulting it to `[]` would be the worst possible repair: it
   * reads as a fact, it is silent, and it would let an operator send a gift the
   * governing rule forbade.
   *
   * There is no way to recover it after the fact. `RecognitionPolicy` is edited
   * **in place at the same version** — `PolicyForm.save()` writes the same `id`
   * and the same `version` back, including when publishing — so matching
   * `policyId` and `policyVersion` against the live policy proves nothing about
   * whether `excludedCategories` still holds what it held at generation.
   *
   * So a Moment without this field blocks item selection with a named
   * explanation and a recovery, rather than being filtered against a guess.
   */
  excludedCategories?: string[];
  /**
   * The delivery promises that governed this Moment, captured at generation —
   * **OperationsState v6, and deliberately optional as one complete group.**
   *
   * Every pre-v6 Moment lacks all four. Their absence means "not recorded when
   * this Moment was prepared"; it must never be read as `Standard`, an empty
   * window, or `false`. A later fulfilment step must name the missing context
   * and require recovery rather than re-resolving a policy that may have been
   * edited in place at the same id and version.
   */
  deliveryRequirement?: DeliveryRequirement;
  preferredDeliveryWindow?: string;
  signatureRequired?: boolean;
  proofRequired?: boolean;
  resolvedAt: string;
}

/** A named reason a Moment cannot proceed. Shown to the operator verbatim. */
export interface MomentIssue {
  code:
    | 'person-missing'
    | 'person-inactive'
    | 'person-archived'
    | 'group-missing'
    | 'group-inactive'
    | 'country-missing'
    | 'no-executable-assignment'
    | 'no-occasion-rule';
  message: string;
  /** Workspace page that fixes it. Operations links out; it never edits. */
  href?: string;
}

export interface Moment {
  id: string;
  workspaceId: string;
  programId: string;
  personId: string;
  relationshipClassId: string;
  occasionType: string;
  targetDate: string;
  status: MomentStatus;
  /**
   * Deterministic logical identity. Two generation runs for the same workspace,
   * program, person and occasion produce the same key — which is what makes
   * repeat preparation report "already prepared" instead of duplicating.
   */
  sourceKey: string;
  recipientSnapshot: RecipientSnapshot;
  relationshipGroupSnapshot: RelationshipGroupSnapshot;
  policyResolutionSnapshot?: PolicyResolutionSnapshot;
  issues: MomentIssue[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

// ─── Decision ────────────────────────────────────────────────────────────────

/** ADR-006 Council condition: two statuses only for the first operational version. */
export const DECISION_STATUSES = ['Confirmed', 'Superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_PROVIDERS = ['HumanOperator', 'RuleEngine'] as const;
export type DecisionProvider = (typeof DECISION_PROVIDERS)[number];

/** Only the types H3.1 – H3.3 actually produce. More arrive with the steps that need them. */
export const DECISION_TYPES = [
  'MomentQualification',
  'PolicyResolution',
  'MomentCancellation',
  // H3.2 — ADR-011. Confirming a brief is a judgement (the operator asserts the
  // brief is correct and executable); overriding its address is a second one.
  'BriefConfirmation',
  'AddressOverride',
  // H3.3 — the first Decision with real alternatives. Several items fit the
  // budget and the rule; the operator picks one and says why.
  //
  // `ItemSubstitution` is **not** added here. Substituting presupposes a
  // selection that already exists and something downstream that consumed it;
  // neither exists yet, and a type nothing can produce is not architecture.
  'ItemSelection',
  // H3.4 — the first Decision carrying a **cost**. Several vendors quoted for
  // the item already chosen; the operator picks one and says why.
  //
  // `VendorSubstitution` is not added, for the same reason `ItemSubstitution`
  // was not: nothing downstream has consumed a vendor selection yet.
  'VendorSelection',
  // H3.5 — who carries it, and what that leg costs. Chosen from the couriers
  // that actually serve the delivery country, which is the whole reason the
  // directory is scoped per country.
  'CourierSelection',
  // H3.6 — ADR-012, and **the only Decision the fulfilment lifecycle records.**
  //
  // Dispatching and delivering are occurrences, not judgements: there were no
  // alternatives, so a "reason" field on them could only ever be filler.
  // Choosing to try again after a failed attempt *is* a judgement — the operator
  // could redeliver, cancel, or escalate outside the system — and why they chose
  // to try again matters months later. So it carries a required human reason,
  // exactly as every other Decision does.
  'Redelivery',
  // H3.7 — ADR-013. Two judgements, and only two.
  //
  // `RecognitionOrderCommitment` records the **manual customer quotation**. It is
  // a genuine judgement between alternatives: no formula produced the number,
  // and the operator could have quoted differently. ADR-013 §5 forbids deriving
  // it from the budget, the costs, a percentage or a rate card, which is exactly
  // why it needs a reason — a quotation nobody can explain later is not
  // evidence.
  //
  // `CostReconciliation` records the **final operator-confirmed actuals**. A
  // correction supersedes the live one with a new Decision of the same type,
  // carrying the previous values; the original is never rewritten.
  'RecognitionOrderCommitment',
  'CostReconciliation',
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/**
 * A judgement between alternatives, with a required reason.
 *
 * Never mutated. A decision that no longer holds is superseded by a new one,
 * and the original keeps its original text — an audit trail that can be edited
 * is not evidence.
 */
export interface Decision {
  id: string;
  workspaceId: string;
  momentId: string;
  decisionType: DecisionType;
  status: DecisionStatus;
  provider: DecisionProvider;
  actorId?: string;
  /** What was considered — candidates, inputs, the query. */
  inputs: Record<string, unknown>;
  recommendation?: string;
  finalDecision: string;
  reason: string;
  /** Required when the final decision differs from the recommendation. */
  overrideReason?: string;
  createdAt: string;
  confirmedAt: string;
  supersededAt?: string;
  supersededByDecisionId?: string;
}

// ─── OperationalEvent ────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'MomentCreated',
  'MomentMarkedReady',
  'MomentNeedsReview',
  'MomentCancelled',
  // H3.2 — ADR-011.
  'BriefGenerated',
  // Named for what actually happens: a *brief* was overridden, not a customer
  // record updated. Supersedes the checkpoint's ambiguous `AddressUpdated`,
  // which implied a write across the ADR-005 boundary that never occurs.
  'ExecutionBriefAddressOverridden',
  // H3.3. The checkpoint proposed `ItemPrepared`, but nothing is prepared here:
  // no vendor has been asked, no order exists, nothing has been made or moved.
  // An item was **selected**, and that is the whole occurrence. Per
  // `RELATIONSHIP_OPERATIONS_ATLAS.md` §6 the checkpoint's downstream names are
  // proposals, and the milestone that builds each one fixes its final name.
  'ItemSelected',
  // H3.4. The checkpoint proposed `VendorContacted`, and that is **not** what
  // happens here. Aniyé sends nothing: an operator who already spoke to vendors
  // by phone or WhatsApp types up what they were quoted and picks one. The
  // occurrence is the *selection*. Recording a contact event would assert an
  // outreach this build never performs — and the channel each quote arrived
  // through is already a `source` field on the offer, where it belongs.
  'VendorSelected',
  // H3.5.
  //
  // ⚠️ **A deliberate departure from the checkpoint.** Part 2 row 9 and this
  // Atlas's loop table both leave the Event column blank for courier selection,
  // proposing a Decision and nothing else. That is recorded as a proposal, not
  // a decision against — and by ADR-006's own test ("does it change the state of
  // a Moment's execution?") assigning a carrier plainly does. Without it the
  // Moment timeline would read "Item chosen · Vendor chosen · …nothing…" until
  // dispatch, silently skipping a step that materially moved the job.
  // Surfaced in the Recovery Ledger rather than made quietly.
  'CourierSelected',
  // H3.6 — the fulfilment lifecycle (ADR-012). Four Events, three states: the
  // extra Event is `ProofReceived`, which records an occurrence *after*
  // `Delivered` without changing the Fulfilment's status.
  //
  // ⚠️ `Returned`, `Escalation` and `QAException` are deliberately absent.
  // `Returned` describes an outcome nothing in H3.6 can act on; escalation has
  // no target because there is no role model (OPS-U1); and the exception and
  // adjudication taxonomy is OPS-U4b, deferred.
  'Dispatched',
  'DeliveryFailed',
  'Delivered',
  'ProofReceived',
  // H3.7 — **one Event, deliberately.**
  //
  // Committing the order changes what may happen to the Moment next: from H3.7
  // onward an initial dispatch requires one. By ADR-006's own test — "does it
  // change the state of a Moment's execution?" — that is an occurrence, and
  // every other gating step (brief, item, vendor, courier) records one. Without
  // it the timeline would read "Courier chosen · …nothing… · Dispatched",
  // which is the exact gap H3.5 added `CourierSelected` to close.
  //
  // ⚠️ **Reconciliation and correction append no Event.** They record amounts
  // after execution has finished and change nothing about the Moment's
  // execution — the `CostReconciliation` Decisions carry the judgement, the
  // reason and the history. Adding Events would fill the timeline with
  // bookkeeping and make the genuine occurrences harder to find.
  'RecognitionOrderCommitted',
  // H3.8 — operator confirmation that a delivered, reconciled recognition is
  // complete. The occurrence writes a Memory and closes the Moment atomically;
  // it is not recipient acknowledgement and carries no Decision.
  'MomentClosed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ACTOR_TYPES = ['System', 'Operator', 'Customer', 'Vendor', 'Courier'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const EVENT_SOURCES = ['Platform', 'WhatsApp', 'Email', 'Phone', 'Manual'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/**
 * Something that happened. Append-only: never edited, never deleted.
 *
 * A future correction mechanism appends a referencing event rather than
 * rewriting one. Ordinary reads, renders and button clicks are **not** events —
 * the test is whether it changes the state of a Moment's execution.
 */
export interface OperationalEvent {
  id: string;
  workspaceId: string;
  momentId: string;
  eventType: EventType;
  actorType: ActorType;
  actorId?: string;
  source: EventSource;
  payload: Record<string, unknown>;
  /** When it happened in the world. */
  occurredAt: string;
  /** When Aniyé learned of it. The two differ once external parties report. */
  recordedAt: string;
}

// ─── ExecutionBrief ──────────────────────────────────────────────────────────

/**
 * H3.2 statuses only, and deliberately the same two ADR-006 gives a Decision.
 *
 * There is no `Draft`. A brief is only written on confirmation — an unconfirmed
 * brief is UI preview state, exactly as ADR-006 requires of every other draft
 * choice. Adding `Draft` would mean persisting something nobody asserted.
 */
export const BRIEF_STATUSES = ['Confirmed', 'Superseded'] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

/** Where the address on a brief came from. Provenance is required on override. */
export const ADDRESS_SOURCES = ['PersonDefault', 'OperatorOverride'] as const;
export type AddressSource = (typeof ADDRESS_SOURCES)[number];

/**
 * An operator's correction to one brief's address.
 *
 * **Never writes back to `Person`** (ADR-005, ADR-011). The customer's record is
 * left for the customer to correct; this records only what Aniyé actually
 * shipped against, and why.
 */
export interface AddressOverrideRecord {
  /** Required. Becomes part of the permanent record. */
  reason: string;
  /** Who made the call. `Operator` in H3.2 — there is no role model (ADR-010). */
  actorType: ActorType;
  actorId?: string;
  /** How the correction reached Aniyé — the channel is a field, not a system. */
  source: EventSource;
  overriddenAt: string;
  /** What the brief said before. Kept so the correction is legible later. */
  previousAddress?: DeliveryAddress;
  previousAddressSource: AddressSource;
}

/**
 * The operator's unit of work for one Moment: who, where, how much, and what
 * constraints apply. Deliberately invisible to the customer.
 *
 * Immutable once confirmed. A correction supersedes it with a new revision
 * rather than editing it — an execution record that can be rewritten after the
 * fact is not evidence of what was executed.
 */
export interface ExecutionBrief {
  id: string;
  workspaceId: string;
  momentId: string;
  status: BriefStatus;
  /** 1 for the first confirmation, incrementing with each revision. */
  revision: number;
  /** Set on a revision, pointing at the brief it replaces. */
  revisionOfBriefId?: string;
  /** Set on the superseded brief, pointing forward. Never set twice. */
  supersededByBriefId?: string;
  supersededAt?: string;

  /** Copied from the Moment, not referenced — the Moment's snapshots may age. */
  recipientSnapshot: RecipientSnapshot;
  relationshipGroupSnapshot: RelationshipGroupSnapshot;
  /**
   * Required. A brief without a resolved budget has no constraints to render,
   * which is why only a `ReadyForExecution` Moment can produce one.
   */
  policyResolutionSnapshot: PolicyResolutionSnapshot;

  /**
   * **Copied from `Person.deliveryAddress` at confirmation** — the same reason
   * the policy snapshot is copied (Atlas §15e). The brief must still explain
   * where a gift was sent after the customer edits their record. A reference
   * would let history rewrite itself.
   */
  deliveryAddressSnapshot: DeliveryAddress;
  addressSource: AddressSource;
  /** Present only when an operator overrode the address for this brief. */
  addressOverride?: AddressOverrideRecord;

  occasionType: string;
  targetDate: string;
  approvedBudget: Money;
  /** Free-text constraints carried from the resolved policy. */
  constraints: string[];

  createdAt: string;
  confirmedAt: string;
}

// ─── Vendor ──────────────────────────────────────────────────────────────────

/**
 * Someone Aniyé can buy from — **a row an operator typed**, not an account.
 *
 * There is no vendor portal, no login, no automated request and no API. Atlas §4
 * never defined this object, so nothing is being re-issued here: H3.4 defines
 * it, and defines it as small as the milestone actually needs.
 *
 * ⚠️ **Deliberately absent, and not oversights:** scores, ratings, reliability,
 * capacity, lead-time policy, quality grades, price lists, categories,
 * preferred status, contracts, SLAs, onboarding or offboarding state. Vendor
 * *Intelligence* is H4.4 and is gated on the pilot — it must be built from
 * recorded outcomes, and H3.4 is the milestone that starts recording them.
 * Partner onboarding is unresolved **U5** and belongs before the pilot; a
 * directory an operator types into needs none of it.
 */
export interface Vendor {
  id: string;
  /** One workspace per `OperationsState` today. Scoped consistently anyway. */
  workspaceId: string;
  name: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  countryCode: string;
  city: string;
  /**
   * At least one of these is required — a vendor nobody can reach is not a
   * vendor. WhatsApp is a **channel recorded by hand**, never an integration.
   */
  whatsapp?: string;
  email?: string;
  /**
   * Deactivated rather than deleted. A vendor who quoted last quarter must stay
   * resolvable, so there is no hard delete anywhere in the repository.
   */
  isActive: boolean;
  /** Free text. Not a grade, not a score — whatever the operator needs to recall. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a confirmed record keeps about a vendor.
 *
 * **Copied, never referenced** — the same rule the address, policy and item
 * snapshots follow. Renaming or deactivating a vendor must not rewrite what an
 * operator compared six months ago.
 */
export interface VendorSnapshot {
  vendorId: string;
  name: string;
  countryCode: string;
  city: string;
}

// ─── VendorOffer ─────────────────────────────────────────────────────────────

/**
 * How a quote reached Aniyé.
 *
 * Deliberately **not** `EVENT_SOURCES`: `Platform` is absent, because no vendor
 * can reach this platform. Every quote arrives through a human conversation
 * that an operator then types up.
 */
export const OFFER_SOURCES = ['WhatsApp', 'Email', 'Phone', 'Manual'] as const;
export type OfferSource = (typeof OFFER_SOURCES)[number];

/**
 * An immutable record of what an operator was quoted for the item already
 * chosen for this Moment.
 *
 * Written only as part of a confirmed comparison — a draft row on the screen is
 * not an offer (ADR-006). Once written it is never edited: H3.4 has no offer
 * revision, substitution or negotiation flow.
 *
 * ⚠️ **`quotedVendorCost` is an estimate of what the vendor will charge Aniyé.**
 * It is not the customer's charge, not the catalog price, not an actual paid
 * cost, not revenue and not margin. It is **never derived from
 * `CatalogItem.price`** — the two answer different questions, and Aniyé's
 * commercial role is unresolved (U3) until H3.7.
 */
export interface VendorOffer {
  id: string;
  workspaceId: string;
  momentId: string;
  /** The brief that supplied the delivery context this was quoted against. */
  briefId: string;
  briefRevision: number;
  /** The live `ItemSelection` Decision that is the authority for the item. */
  itemSelectionDecisionId: string;
  selectedItemId: string;
  /** Copied from that Decision, never re-read from the live catalog. */
  itemSnapshot: CatalogItemSnapshot;
  vendorId: string;
  vendorSnapshot: VendorSnapshot;
  quotedVendorCost: Money;
  source: OfferSource;
  /** When the vendor gave the quote, in the world. */
  quotedAt: string;
  /** When the operator committed it to Aniyé. The two differ, and both matter. */
  recordedAt: string;
  /** Whole days, non-negative. Absent means the vendor did not say. */
  leadTimeDays?: number;
  terms?: string;
}

// ─── Courier ─────────────────────────────────────────────────────────────────

/**
 * Someone who carries the gift the last leg — **a row an operator typed**, like
 * a Vendor, and for the same reasons.
 *
 * ⚠️ **Scoped to exactly one country.** That is the whole point of the
 * directory: checkpoint milestone 7 is "a courier list *per country*", and
 * selection offers only the couriers who serve where the brief is actually
 * going. A courier operating in two countries is two rows, which is the
 * smallest model that answers the question without inventing a coverage or
 * routing scheme.
 *
 * ⚠️ **Deliberately absent, and not oversights:** rate cards, tracking numbers,
 * API credentials, service levels, zones, transit-time models, scoring,
 * optimization or automatic routing. Checkpoint milestone 7 excludes "rate APIs,
 * tracking integration, optimization" in terms. There is **no city field**
 * either — city-level routing is optimization, and country is what selection
 * actually turns on.
 */
export interface Courier {
  id: string;
  workspaceId: string;
  name: string;
  /** ISO 3166-1 alpha-2, uppercase. The one country this row serves. */
  countryCode: string;
  /** At least one required — a courier nobody can reach cannot be booked. */
  whatsapp?: string;
  email?: string;
  /** Deactivated rather than deleted, so past selections stay resolvable. */
  isActive: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** What a confirmed selection keeps about a courier. Copied, never referenced. */
export interface CourierSnapshot {
  courierId: string;
  name: string;
  countryCode: string;
}

// ─── Fulfilment ──────────────────────────────────────────────────────────────

/**
 * Exactly three, fixed by ADR-012.
 *
 * ⚠️ `Pending`, `Confirmed`, `Failed` and `Returned` from the Atlas §4 draft are
 * **not** implemented and must not be added. A Moment with carriage arranged but
 * nothing dispatched simply has no Fulfilment — the absence states that plainly,
 * and persisting a `Pending` row would record an intention nobody confirmed.
 */
export const FULFILMENT_STATUSES = ['Dispatched', 'DeliveryFailed', 'Delivered'] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

/**
 * What kind of proof arrived. **Not the proof itself** — see `Fulfilment`.
 *
 * A closed set, and deliberately not inferred from anything: `signatureRequired`
 * does not imply a `Signature` proof kind, and comparing what arrived against
 * what the policy promised is QA adjudication, which is OPS-U4b and deferred.
 */
export const PROOF_KINDS = ['Photo', 'Document', 'Signature'] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

/**
 * What Aniyé is doing about getting one Moment's gift to its recipient — H3.6,
 * implementing ADR-012.
 *
 * **One per Moment, created only when initial dispatch is confirmed.** There is
 * no draft and no `Pending`.
 *
 * ⚠️ **This record holds current state. The ordered Event history is the
 * historical truth.** A Fulfilment that failed twice and was redelivered twice
 * reads `Dispatched` at attempt 3, and its Events read
 * `Dispatched · DeliveryFailed · Dispatched · DeliveryFailed · Dispatched`.
 * Nothing is mutated to produce that record: the status and attempt here are a
 * projection of the Events, never a substitute for them, and structural
 * validation refuses a Fulfilment whose fields disagree with its own replay.
 *
 * ⚠️ **Deliberately absent, and not oversights:** tracking numbers, tracking
 * URLs, `proofUrl`, file names, any proof content, carrier API references,
 * webhooks, money, vendor orders, QA exceptions, disputes, escalation targets
 * and delivery estimates. The evidence for *what* was dispatched lives on the
 * immutable brief and the three selection Decisions this record references —
 * duplicating their snapshots here would create a second source of truth for
 * facts that are already frozen.
 */
export interface Fulfilment {
  id: string;
  workspaceId: string;
  momentId: string;
  status: FulfilmentStatus;
  /** Which attempt is current. 1 on initial dispatch; only redelivery raises it. */
  attempt: number;

  /** The confirmed brief that governed the dispatch, and the exact revision. */
  briefId: string;
  briefRevision: number;
  /** The three live selection Decisions — the authority for what went out. */
  itemSelectionDecisionId: string;
  vendorSelectionDecisionId: string;
  courierSelectionDecisionId: string;

  createdAt: string;
  updatedAt: string;
}

// ─── RecognitionOrder ────────────────────────────────────────────────────────

/**
 * The three values ADR-007 reserved, so the eventual legal answer needs no
 * migration of meaning.
 *
 * ⚠️ **H3.7 writes `MerchantOfRecord` and nothing else** (ADR-013 §1). `Agent`
 * and `Unspecified` exist here because the reserved set is part of the accepted
 * architecture, not because either may be stored — the write boundary refuses
 * both. If professional advice later requires `Agent`, that needs a **new
 * governance decision**, never a silent relabelling of orders already written.
 */
export const COMMERCIAL_ROLES = ['Unspecified', 'MerchantOfRecord', 'Agent'] as const;
export type CommercialRole = (typeof COMMERCIAL_ROLES)[number];

/** The only role H3.7 may write. */
export const PILOT_COMMERCIAL_ROLE = 'MerchantOfRecord' satisfies CommercialRole;

/**
 * The only currency an H3.7 order may carry, in any field (ADR-013 §3).
 *
 * A supplier quote in another currency does not make the order convertible — it
 * makes the order **outside the approved architecture**. There is no FX in
 * H3.7, so an XAF cost beside an NGN charge could only ever be compared by
 * inventing a rate nobody approved.
 */
export const ORDER_CURRENCY = 'NGN';

/**
 * Two statuses, and no cancellation.
 *
 * `Committed` — the commercial authority is fixed and dispatch may proceed.
 * `Reconciled` — all three actuals are confirmed.
 *
 * ⚠️ There is deliberately **no `Draft`, `Cancelled`, `Invoiced`, `Paid` or
 * `Settled`.** A draft would persist an intention nobody confirmed (ADR-006);
 * the rest presuppose payments, which ADR-013 excludes from H3.7 entirely.
 */
export const RECOGNITION_ORDER_STATUSES = ['Committed', 'Reconciled'] as const;
export type RecognitionOrderStatus = (typeof RECOGNITION_ORDER_STATUSES)[number];

/**
 * What one Moment cost Aniyé and what Aniyé charged for it — H3.7, implementing
 * [ADR-013](../../docs/adr/ADR-013-commercial-role-pilot-currency-and-recognition-order.md).
 *
 * **One per Moment** (ADR-007). It lives only in `OperationsState` and is never
 * projected into Workspace: cost, margin and partner identity stop at the
 * boundary (ADR-005).
 *
 * ─── What is immutable, and why ──────────────────────────────────────────────
 * Everything above `actual*` is fixed at creation. The estimates are **evidence
 * of what was expected**, and editing them to match what happened would destroy
 * the only thing that makes a variance legible. Corrections apply to actuals
 * alone, through a superseding Decision.
 *
 * ⚠️ **`grossMargin` is not a field and must never become one.** It is derived
 * on read (ADR-007, ADR-013 §8) — which is also why correcting a cost needs no
 * second write: there is nothing stored to update.
 *
 * ⚠️ **Deliberately absent, and not oversights:** `estimatedItemCost` (superseded
 * by `estimatedVendorCost` — the catalog price is not Aniyé's cost),
 * `estimatedTotalCost`, `actualOtherCosts`, `amountPaid`, `paymentStatus`,
 * `paymentMethod`, `invoiceId`, `settlementStatus`, `serviceFee`, `commission`,
 * `subscription`, `refund`, `tax`, `duty`, `fxRate`, `exchangeRate` and
 * `settlementCurrency`. Each is refused by name at the write boundary.
 *
 * ⚠️ **No amount here asserts that money moved.** `actualCustomerCharge` is what
 * Aniyé charges, not what Aniyé received.
 */
export interface RecognitionOrder {
  id: string;
  workspaceId: string;
  momentId: string;

  /** The confirmed brief that governed this order, and its exact revision. */
  executionBriefId: string;
  briefRevision: number;
  /** The three live selection Decisions — immutable authority for what was bought. */
  itemSelectionDecisionId: string;
  vendorSelectionDecisionId: string;
  courierSelectionDecisionId: string;

  /** Snapshotted at creation and immutable. `MerchantOfRecord` for the pilot. */
  commercialRole: CommercialRole;

  /**
   * The frozen recipient-recognition budget, copied from the confirmed brief.
   *
   * **Not the customer charge**, and **not automatically a ceiling** on vendor
   * or courier cost (ADR-013 §7) — it governs what the *recipient* receives.
   */
  approvedBudget: Money;
  /** From the confirmed `VendorSelection` quote. Never the catalog price. */
  estimatedVendorCost: Money;
  /** From the confirmed `CourierSelection` quote. */
  estimatedCourierCost: Money;
  /**
   * **The manual per-order quotation** (ADR-013 §5). Entered deliberately by an
   * operator, explicitly confirmed, then immutable. Never calculated from the
   * budget, the costs, a percentage, a margin target or a rate card.
   */
  estimatedCustomerCharge: Money;

  /** Present only once reconciled. All three arrive together. */
  actualVendorCost?: Money;
  actualCourierCost?: Money;
  actualCustomerCharge?: Money;

  status: RecognitionOrderStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

/** ADR-014 permits exactly one outcome in H3.8. */
export const MEMORY_OUTCOMES = ['Delivered'] as const;
export type MemoryOutcome = (typeof MEMORY_OUTCOMES)[number];

/**
 * The immutable Knowledge record created when a Moment closes.
 *
 * It keeps references and closure authority only. Occasion, target date,
 * recipient name and gift category remain on their governed source records and
 * are resolved through the customer-safe projection rather than duplicated.
 */
export interface Memory {
  id: string;
  workspaceId: string;
  momentId: string;
  personId: string;
  fulfilmentId: string;
  recognitionOrderId: string;
  outcome: MemoryOutcome;
  /** ISO date copied from the authoritative Delivered Event's `occurredAt`. */
  outcomeDate: string;
  createdByActorType: 'Operator';
  createdByActorId?: string;
  createdAt: string;
}

// ─── OperationsState ─────────────────────────────────────────────────────────

/**
 * Independent of the workspace schema version — see ADR-010.
 *
 * **v2 (H3.2)** adds the `executionBriefs` collection. Additive.
 * **v3 (H3.3)** admits `policyResolutionSnapshot.excludedCategories` on newly
 * generated Moments. Additive, and it **adds nothing to existing records**.
 * **v4 (H3.4)** adds the `vendors` and `vendorOffers` collections. Additive.
 * **v5 (H3.5)** adds the `couriers` collection. Additive.
 * **v6 (pre-H3.6 correction)** admits the four policy delivery promises on
 * newly generated Moments. Additive, and it **adds nothing to existing records**.
 * **v7 (H3.6)** adds the `fulfilments` collection. Additive.
 * **v8 (H3.7)** adds the `recognitionOrders` collection. Additive.
 * **v9 (H3.8)** adds the `memories` collection. Additive, with no backfill.
 *
 * There is no `courierSelections` collection: unlike a vendor comparison, which
 * had to persist several hand-entered quotes, a courier selection is one choice
 * with one cost and the Decision carries all of it.
 */
export const CURRENT_OPERATIONS_SCHEMA_VERSION = 9;

/**
 * The storage *location*, not a version assertion.
 *
 * Deliberately unchanged at v5. ADR-010 and Atlas §15d name this key, and
 * moving it would orphan every operational record already written — the exact
 * history this module exists to protect. The version lives inside the payload.
 */
export const OPERATIONS_KEY = 'aniye_operations_v1';

/**
 * Unreadable or foreign operational data is moved here rather than overwritten.
 * Fixed key, written at most once.
 */
export const OPERATIONS_QUARANTINE_KEY = 'aniye_operations_quarantine';

export interface OperationsState {
  schemaVersion: number;
  /** Exactly one workspace. A payload for another is refused, never adopted. */
  workspaceId: string;
  moments: Moment[];
  decisions: Decision[];
  events: OperationalEvent[];
  /** H3.2, additive at operations schema v2. */
  executionBriefs: ExecutionBrief[];
  /** H3.4, additive at operations schema v4. */
  vendors: Vendor[];
  vendorOffers: VendorOffer[];
  /** H3.5, additive at operations schema v5. */
  couriers: Courier[];
  /** H3.6, additive at operations schema v7. */
  fulfilments: Fulfilment[];
  /** H3.7, additive at operations schema v8. */
  recognitionOrders: RecognitionOrder[];
  /** H3.8, additive at operations schema v9. */
  memories: Memory[];
  createdAt: string;
  updatedAt: string;
}

export function emptyOperationsState(workspaceId: string, now: string): OperationsState {
  return {
    schemaVersion: CURRENT_OPERATIONS_SCHEMA_VERSION,
    workspaceId,
    moments: [],
    decisions: [],
    events: [],
    executionBriefs: [],
    vendors: [],
    vendorOffers: [],
    couriers: [],
    fulfilments: [],
    recognitionOrders: [],
    memories: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Operations migration ────────────────────────────────────────────────────

export type OperationsMigrationResult =
  | { status: 'current'; state: OperationsState }
  | { status: 'migrated'; state: OperationsState; from: number }
  | { status: 'invalid'; reason: string };

/**
 * Bring a stored operations payload up to the current version.
 *
 * Pure. One rung at a time, exactly as the workspace chain works — a v1 payload
 * must reach v2 without being discarded. Quarantining real operational history
 * because a collection was added would be a data-loss bug wearing a safety
 * feature's clothes.
 *
 * **Preserves unknown keys.** The spread carries through anything this build
 * does not recognize, so a payload written by a later build survives a round
 * trip rather than being silently reduced to the fields named here.
 */
export function migrateOperationsState(raw: unknown): OperationsMigrationResult {
  if (!isPlainObject(raw)) return { status: 'invalid', reason: 'Operations state is not an object.' };

  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { status: 'invalid', reason: `Unreadable operations schemaVersion: ${String(version)}.` };
  }
  if (version > CURRENT_OPERATIONS_SCHEMA_VERSION) {
    return {
      status: 'invalid',
      reason: `Operations state is at v${version}, newer than this build understands (v${CURRENT_OPERATIONS_SCHEMA_VERSION}). Refusing to downgrade.`,
    };
  }

  let working: Record<string, unknown>;
  try {
    working = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    return { status: 'invalid', reason: 'Operations state could not be safely copied.' };
  }

  const from = version;

  // v1 → v2: add the executionBriefs collection. Additive; nothing else moves.
  if ((working.schemaVersion as number) === 1) {
    working = {
      ...working,
      executionBriefs: Array.isArray(working.executionBriefs) ? working.executionBriefs : [],
      schemaVersion: 2,
    };
  }

  // v2 → v3: admit `policyResolutionSnapshot.excludedCategories` on Moments
  // generated from here on. **A pure version bump — no record is touched.**
  //
  // It is tempting to walk the Moments and give each an empty exclusion list,
  // and that would be a data-loss bug wearing a migration's clothes: a v2
  // Moment genuinely does not know what its policy excluded, and writing `[]`
  // would convert "unknown" into the false claim "nothing was excluded". The
  // absence is the evidence, and it is preserved exactly. `selection.ts` reads
  // it as *unknown* and blocks, which is the only honest outcome.
  //
  // Same shape as the workspace v6 → v7 rung, and for the same reason.
  if ((working.schemaVersion as number) === 2) {
    working = { ...working, schemaVersion: 3 };
  }

  // v3 → v4: add the vendor collections. Additive, and it **invents nothing** —
  // a workspace that has never had a vendor gets two empty arrays, not a
  // fabricated directory. Existing Moments, briefs, Decisions and Events are
  // carried through by the spread, untouched.
  if ((working.schemaVersion as number) === 3) {
    working = {
      ...working,
      vendors: Array.isArray(working.vendors) ? working.vendors : [],
      vendorOffers: Array.isArray(working.vendorOffers) ? working.vendorOffers : [],
      schemaVersion: 4,
    };
  }

  // v4 → v5: add the courier collection. Additive, and it **invents nothing** —
  // a workspace that has never had a courier gets an empty array, not a
  // fabricated directory. Everything earlier is carried through by the spread.
  if ((working.schemaVersion as number) === 4) {
    working = {
      ...working,
      couriers: Array.isArray(working.couriers) ? working.couriers : [],
      schemaVersion: 5,
    };
  }

  // v5 → v6: admit the four delivery promises on policy snapshots generated
  // from here on. **A pure version bump — no Moment or copied brief snapshot is
  // touched.**
  //
  // Backfilling would invent customer promises. A missing `proofRequired`, for
  // example, means nobody recorded whether proof was required; writing `false`
  // would silently turn that unknown into permission to proceed without it.
  if ((working.schemaVersion as number) === 5) {
    working = { ...working, schemaVersion: 6 };
  }

  // v6 → v7: add the fulfilment collection. Additive, and it **invents nothing**
  // — a workspace where nothing has ever been dispatched gets an empty array,
  // not a fabricated Fulfilment.
  //
  // Backfilling one for every Moment that has a courier would be the worst
  // possible repair: it would assert that a parcel went out when nobody
  // confirmed that it had. Under ADR-012 the *absence* of a Fulfilment is
  // itself the fact — this Moment has not been dispatched — and the absence is
  // preserved exactly.
  if ((working.schemaVersion as number) === 6) {
    working = {
      ...working,
      fulfilments: Array.isArray(working.fulfilments) ? working.fulfilments : [],
      schemaVersion: 7,
    };
  }

  // v7 → v8: add the recognition-order collection. Additive, and it **invents
  // nothing** — no Moment, and no already-dispatched Fulfilment, receives a
  // fabricated order.
  //
  // Backfilling would be the worst possible repair. An order carries a
  // **manual customer quotation** that only an operator can supply (ADR-013 §5)
  // and two estimates that must come from the confirmed selection quotes. A
  // synthesised order would assert a price nobody quoted, and it would be
  // indistinguishable in storage from one that had been. A Moment or Fulfilment
  // without an order is prototype history from before commercial authority was
  // recorded, and the absence is the honest fact.
  if ((working.schemaVersion as number) === 7) {
    working = {
      ...working,
      recognitionOrders: Array.isArray(working.recognitionOrders) ? working.recognitionOrders : [],
      schemaVersion: 8,
    };
  }

  // v8 → v9: add the Memory collection. Additive, and it **invents nothing**.
  // No delivered Moment is rewritten to Closed, and no legacy Fulfilment is
  // given a Memory. Closure requires commercial authority and an explicit
  // operator confirmation, neither of which a migration may fabricate.
  if ((working.schemaVersion as number) === 8) {
    working = {
      ...working,
      memories: Array.isArray(working.memories) ? working.memories : [],
      schemaVersion: 9,
    };
  }

  return from === CURRENT_OPERATIONS_SCHEMA_VERSION
    ? { status: 'current', state: working as unknown as OperationsState }
    : { status: 'migrated', state: working as unknown as OperationsState, from };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * A plain record — **not** `null`, `undefined`, an array, or a primitive.
 *
 * Exported because runtime boundaries need it as much as structural validation
 * does. A repository must never depend on a TypeScript interface for runtime
 * safety: the compiler is gone by the time a caller hands it `null`, and an
 * exception is not a refusal — it is a crash that tells the operator nothing and
 * leaves them unable to say whether anything was written.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The long-standing internal alias. One implementation, two names. */
const isPlainObject = isPlainRecord;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * A policy snapshot's exclusion list, if it has one.
 *
 * Absent is **valid** — that is every pre-H3.3 record, and refusing it would
 * quarantine real operational history. Present but malformed is not: a
 * half-written exclusion list is worse than none, because selection would treat
 * it as trustworthy.
 */
function excludedCategoriesValid(snapshot: unknown): boolean {
  if (!isPlainObject(snapshot)) return true;
  const excluded = snapshot.excludedCategories;
  if (excluded === undefined) return true;
  return Array.isArray(excluded) && excluded.every(c => typeof c === 'string');
}

const SNAPSHOT_DELIVERY_REQUIREMENTS = [
  'Standard',
  'Courier',
  'HandDelivered',
  'Digital',
] as const satisfies readonly DeliveryRequirement[];

/**
 * A legacy snapshot has none of the delivery context; a v6 snapshot has all of
 * it. Partial presence is malformed rather than a third, ambiguous state.
 */
function deliveryContextValid(snapshot: unknown): boolean {
  if (!isPlainObject(snapshot)) return true;

  const values = [
    snapshot.deliveryRequirement,
    snapshot.preferredDeliveryWindow,
    snapshot.signatureRequired,
    snapshot.proofRequired,
  ];
  if (values.every(value => value === undefined)) return true;

  return (
    typeof snapshot.deliveryRequirement === 'string' &&
    (SNAPSHOT_DELIVERY_REQUIREMENTS as readonly string[]).includes(snapshot.deliveryRequirement) &&
    typeof snapshot.preferredDeliveryWindow === 'string' &&
    typeof snapshot.signatureRequired === 'boolean' &&
    typeof snapshot.proofRequired === 'boolean'
  );
}

// ─── Fulfilment lifecycle replay ─────────────────────────────────────────────

/** The four Events the fulfilment lifecycle appends, in no particular order. */
export const FULFILMENT_EVENT_TYPES = [
  'Dispatched',
  'DeliveryFailed',
  'Delivered',
  'ProofReceived',
] as const;
export type FulfilmentEventType = (typeof FULFILMENT_EVENT_TYPES)[number];

/** Exact payload for the three state-changing lifecycle Events. */
export const LIFECYCLE_PAYLOAD_KEYS = ['fulfilmentId', 'attempt'] as const;

/**
 * Exact payload for `ProofReceived` — **and the whole of it.**
 *
 * Everything else a proof receipt needs is already an Event field: the channel
 * is `source`, who recorded it is `actorType`/`actorId`, when it happened and
 * when Aniyé learned of it are `occurredAt`/`recordedAt`, and the workspace and
 * Moment binding are on the Event itself. What remains is the binding to the
 * Fulfilment and attempt, and what kind of proof arrived.
 *
 * ⚠️ Anything else — `url`, `proofUrl`, `fileName`, `dataUri`, `base64`,
 * `bytes`, `blob`, `image`, `attachment` — is refused by the exact-key check.
 * ADR-012 §7: H3.6 records **that** proof was received and stores no proof.
 */
export const PROOF_PAYLOAD_KEYS = ['fulfilmentId', 'attempt', 'proofKinds'] as const;

/** Exact payload for the sole H3.8 closure Event. */
export const MOMENT_CLOSED_PAYLOAD_KEYS = [
  'memoryId',
  'fulfilmentId',
  'recognitionOrderId',
  'outcome',
  'outcomeDate',
  'previousStatus',
] as const;

/** Exact persisted Memory keys; actor id is the sole optional field. */
export const MEMORY_REQUIRED_KEYS = [
  'id',
  'workspaceId',
  'momentId',
  'personId',
  'fulfilmentId',
  'recognitionOrderId',
  'outcome',
  'outcomeDate',
  'createdByActorType',
  'createdAt',
] as const;
export const MEMORY_OPTIONAL_KEYS = ['createdByActorId'] as const;

/**
 * Field names an H3.7 `RecognitionOrder` must never carry, refused **by name**
 * rather than by an exact-key check alone.
 *
 * Two reasons for naming them. First, a typed field list plus an exact-key check
 * already refuses unknown keys — but the error then says "cannot record
 * `fxRate`" without saying why, and the next person adds it. Second, each of
 * these is something a reasonable engineer would think belonged here:
 * `grossMargin` is derived (ADR-007), `estimatedItemCost` was superseded
 * (ADR-013 §7), and everything else presupposes payments, taxes or FX, all of
 * which ADR-013 excludes from H3.7 in terms.
 */
export const FORBIDDEN_ORDER_FIELDS = [
  'grossMargin', 'margin', 'profit',
  'estimatedItemCost', 'estimatedTotalCost', 'actualOtherCosts',
  'amountPaid', 'paymentStatus', 'paymentMethod', 'invoiceId', 'settlementStatus',
  'serviceFee', 'commission', 'subscription', 'refund', 'tax', 'duty',
  'fxRate', 'exchangeRate', 'settlementCurrency',
] as const;

export type FulfilmentReplay =
  | { ok: true; status: FulfilmentStatus; attempt: number; redeliveries: number; count: number }
  | { ok: false; reason: string };

function exactPayloadKeys(payload: Record<string, unknown>, allowed: readonly string[]): string[] {
  const permitted = new Set<string>(allowed);
  return Object.keys(payload).filter(k => !permitted.has(k));
}

function proofKindsValid(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set<string>();
  for (const kind of value) {
    if (typeof kind !== 'string' || !(PROOF_KINDS as readonly string[]).includes(kind)) return false;
    if (seen.has(kind)) return false;
    seen.add(kind);
  }
  return true;
}

/**
 * Walk one Fulfilment's Events **in persisted order** and derive what they say
 * its state must be.
 *
 * This is the mechanism behind ADR-012's central claim: the Fulfilment record
 * holds current state, the Events are the historical truth, and the two are
 * checked against each other rather than one being trusted. A stored Fulfilment
 * claiming `Delivered` whose Events stop at `DeliveryFailed` is refused — an
 * impossible lifecycle is a corrupted record, not a display quirk.
 *
 * Pure, and deliberately usable without the repository.
 */
export function replayFulfilment(events: readonly unknown[], fulfilmentId: string): FulfilmentReplay {
  let status: FulfilmentStatus | null = null;
  let attempt = 0;
  let redeliveries = 0;
  let count = 0;
  let previousInstant = '';

  for (const raw of events) {
    if (!isPlainObject(raw)) continue;
    const eventType = raw.eventType;
    if (typeof eventType !== 'string' || !(FULFILMENT_EVENT_TYPES as readonly string[]).includes(eventType)) {
      continue;
    }
    if (!isPlainObject(raw.payload)) {
      return { ok: false, reason: `A ${eventType} event carries no readable payload.` };
    }
    const payload = raw.payload;
    if (payload.fulfilmentId !== fulfilmentId) continue;

    count++;

    const isProof = eventType === 'ProofReceived';
    const extra = exactPayloadKeys(payload, isProof ? PROOF_PAYLOAD_KEYS : LIFECYCLE_PAYLOAD_KEYS);
    if (extra.length > 0) {
      return { ok: false, reason: `A ${eventType} event cannot carry ${extra.join(', ')}.` };
    }

    const at = payload.attempt;
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 1) {
      return { ok: false, reason: `A ${eventType} event has an invalid attempt number.` };
    }
    if (isProof && !proofKindsValid(payload.proofKinds)) {
      return { ok: false, reason: 'A ProofReceived event must name at least one distinct known proof kind.' };
    }

    // Time may repeat within one transaction, but it must never run backwards.
    for (const field of ['occurredAt', 'recordedAt'] as const) {
      if (!isIsoInstant(raw[field])) {
        return { ok: false, reason: `A ${eventType} event has an unreadable ${field}.` };
      }
    }
    const occurredAt = raw.occurredAt as string;
    if (previousInstant !== '' && occurredAt < previousInstant) {
      return { ok: false, reason: `A ${eventType} event happened before the step it follows.` };
    }
    previousInstant = occurredAt;

    switch (eventType) {
      case 'Dispatched':
        if (status === null) {
          if (at !== 1) return { ok: false, reason: 'A fulfilment must open at attempt 1.' };
        } else if (status === 'DeliveryFailed') {
          if (at !== attempt + 1) {
            return { ok: false, reason: 'A redelivery must advance the attempt number by exactly one.' };
          }
          redeliveries++;
        } else {
          return { ok: false, reason: 'A dispatch can only follow a failed attempt.' };
        }
        status = 'Dispatched';
        attempt = at;
        break;

      case 'DeliveryFailed':
        if (status !== 'Dispatched') return { ok: false, reason: 'A failed attempt can only follow a dispatch.' };
        if (at !== attempt) return { ok: false, reason: 'A failed attempt must name the attempt that failed.' };
        status = 'DeliveryFailed';
        break;

      case 'Delivered':
        if (status !== 'Dispatched') return { ok: false, reason: 'A delivery can only follow a dispatch.' };
        if (at !== attempt) return { ok: false, reason: 'A delivery must name the attempt that arrived.' };
        status = 'Delivered';
        break;

      case 'ProofReceived':
        if (status !== 'Delivered') return { ok: false, reason: 'Proof can only be recorded after delivery.' };
        if (at !== attempt) return { ok: false, reason: 'Proof must name the attempt it belongs to.' };
        break;
    }
  }

  if (status === null) return { ok: false, reason: 'That fulfilment has no dispatch on record.' };
  return { ok: true, status, attempt, redeliveries, count };
}

/**
 * Structural gate for a whole operations payload.
 *
 * Applied both on read and — critically — to the *proposed* state before any
 * write, so a batch that would produce an invalid state commits nothing.
 */
export function validateOperationsState(raw: unknown, expectedWorkspaceId?: string): ValidationResult {
  if (!isPlainObject(raw)) return { ok: false, reason: 'Operations state is not an object.' };

  if (raw.schemaVersion !== CURRENT_OPERATIONS_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Expected operations schemaVersion ${CURRENT_OPERATIONS_SCHEMA_VERSION}, found ${String(raw.schemaVersion)}.`,
    };
  }
  if (!isNonEmptyString(raw.workspaceId)) {
    return { ok: false, reason: 'Operations state has no workspaceId.' };
  }
  if (expectedWorkspaceId !== undefined && raw.workspaceId !== expectedWorkspaceId) {
    return {
      ok: false,
      reason: `Operations state belongs to workspace "${raw.workspaceId}", not "${expectedWorkspaceId}".`,
    };
  }
  for (const collection of ['moments', 'decisions', 'events', 'executionBriefs', 'vendors', 'vendorOffers', 'couriers', 'fulfilments', 'recognitionOrders', 'memories'] as const) {
    if (!Array.isArray(raw[collection])) {
      return { ok: false, reason: `${collection} is not an array.` };
    }
  }

  const momentIds = new Set<string>();
  const momentById = new Map<string, Record<string, unknown>>();
  const sourceKeys = new Set<string>();

  for (const [i, moment] of (raw.moments as unknown[]).entries()) {
    if (!isPlainObject(moment)) return { ok: false, reason: `Moment at index ${i} is not an object.` };
    if (!isNonEmptyString(moment.id)) return { ok: false, reason: `Moment at index ${i} has no id.` };
    if (momentIds.has(moment.id)) return { ok: false, reason: `Duplicate moment id "${moment.id}".` };
    momentIds.add(moment.id);
    momentById.set(moment.id, moment);

    if (!isNonEmptyString(moment.sourceKey)) {
      return { ok: false, reason: `Moment "${moment.id}" has no sourceKey.` };
    }
    if (sourceKeys.has(moment.sourceKey)) {
      return { ok: false, reason: `Duplicate moment sourceKey "${moment.sourceKey}".` };
    }
    sourceKeys.add(moment.sourceKey);

    if (moment.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Moment "${moment.id}" belongs to a different workspace.` };
    }
    if (typeof moment.status !== 'string' || !(MOMENT_STATUSES as readonly string[]).includes(moment.status)) {
      return { ok: false, reason: `Moment "${moment.id}" has an invalid status: ${String(moment.status)}.` };
    }
    if (!isNonEmptyString(moment.programId) || !isNonEmptyString(moment.personId)) {
      return { ok: false, reason: `Moment "${moment.id}" is missing a program or person reference.` };
    }
    if (!isPlainObject(moment.recipientSnapshot)) {
      return { ok: false, reason: `Moment "${moment.id}" has no recipient snapshot.` };
    }
    if (!Array.isArray(moment.issues)) {
      return { ok: false, reason: `Moment "${moment.id}" has a malformed issues list.` };
    }
    // A ready Moment must be able to explain its budget.
    if (
      (moment.status === 'ReadyForExecution' || moment.status === 'Closed') &&
      !isPlainObject(moment.policyResolutionSnapshot)
    ) {
      return { ok: false, reason: `Moment "${moment.id}" is executable or closed but has no policy resolution snapshot.` };
    }
    if (!excludedCategoriesValid(moment.policyResolutionSnapshot)) {
      return { ok: false, reason: `Moment "${moment.id}" has a malformed excluded-category snapshot.` };
    }
    if (!deliveryContextValid(moment.policyResolutionSnapshot)) {
      return { ok: false, reason: `Moment "${moment.id}" has a malformed delivery-context snapshot.` };
    }
  }

  const decisionIds = new Set<string>();
  for (const [i, decision] of (raw.decisions as unknown[]).entries()) {
    if (!isPlainObject(decision)) return { ok: false, reason: `Decision at index ${i} is not an object.` };
    if (!isNonEmptyString(decision.id)) return { ok: false, reason: `Decision at index ${i} has no id.` };
    if (decisionIds.has(decision.id)) return { ok: false, reason: `Duplicate decision id "${decision.id}".` };
    decisionIds.add(decision.id);

    if (typeof decision.status !== 'string' || !(DECISION_STATUSES as readonly string[]).includes(decision.status)) {
      return { ok: false, reason: `Decision "${decision.id}" has an invalid status: ${String(decision.status)}.` };
    }
    if (typeof decision.provider !== 'string' || !(DECISION_PROVIDERS as readonly string[]).includes(decision.provider)) {
      return { ok: false, reason: `Decision "${decision.id}" has an invalid provider.` };
    }
    if (typeof decision.decisionType !== 'string' || !(DECISION_TYPES as readonly string[]).includes(decision.decisionType)) {
      return { ok: false, reason: `Decision "${decision.id}" has an invalid type.` };
    }
    // ADR-006: a reason is required, always.
    if (!isNonEmptyString(decision.reason)) {
      return { ok: false, reason: `Decision "${decision.id}" has no reason.` };
    }
    if (!momentIds.has(decision.momentId as string)) {
      return { ok: false, reason: `Decision "${decision.id}" references an unknown moment.` };
    }
    // Tenancy, enforced at the record and not only at the payload. Moments and
    // briefs were already checked; decisions and events were not, so a record
    // stamped with another organization's id could be filed under this one.
    if (decision.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Decision "${decision.id}" belongs to a different workspace.` };
    }
  }

  // ── One live item selection per Moment (H3.3) ──
  // Enforced here rather than only in the repository, so a batch that would
  // produce two live selections commits nothing — "the selected item" has to
  // stay unambiguous for every step downstream of it.
  const liveSelectionByMoment = new Set<string>();
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'ItemSelection' || decision.status !== 'Confirmed') continue;
    const momentId = decision.momentId as string;
    if (liveSelectionByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one live item selection.` };
    }
    liveSelectionByMoment.add(momentId);
  }

  const eventIds = new Set<string>();
  for (const [i, event] of (raw.events as unknown[]).entries()) {
    if (!isPlainObject(event)) return { ok: false, reason: `Event at index ${i} is not an object.` };
    if (!isNonEmptyString(event.id)) return { ok: false, reason: `Event at index ${i} has no id.` };
    if (eventIds.has(event.id)) return { ok: false, reason: `Duplicate event id "${event.id}".` };
    eventIds.add(event.id);

    if (typeof event.eventType !== 'string' || !(EVENT_TYPES as readonly string[]).includes(event.eventType)) {
      return { ok: false, reason: `Event "${event.id}" has an invalid type: ${String(event.eventType)}.` };
    }
    if (typeof event.actorType !== 'string' || !(ACTOR_TYPES as readonly string[]).includes(event.actorType)) {
      return { ok: false, reason: `Event "${event.id}" has an invalid actor type.` };
    }
    if (!isNonEmptyString(event.occurredAt) || !isNonEmptyString(event.recordedAt)) {
      return { ok: false, reason: `Event "${event.id}" is missing a timestamp.` };
    }
    if (!momentIds.has(event.momentId as string)) {
      return { ok: false, reason: `Event "${event.id}" references an unknown moment.` };
    }
    if (event.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Event "${event.id}" belongs to a different workspace.` };
    }
  }

  // ── Execution Briefs (H3.2) ──
  const briefIds = new Set<string>();
  const liveBriefByMoment = new Map<string, string>();

  for (const [i, brief] of (raw.executionBriefs as unknown[]).entries()) {
    if (!isPlainObject(brief)) return { ok: false, reason: `Brief at index ${i} is not an object.` };
    if (!isNonEmptyString(brief.id)) return { ok: false, reason: `Brief at index ${i} has no id.` };
    if (briefIds.has(brief.id)) return { ok: false, reason: `Duplicate brief id "${brief.id}".` };
    briefIds.add(brief.id);

    if (brief.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Brief "${brief.id}" belongs to a different workspace.` };
    }
    if (!momentIds.has(brief.momentId as string)) {
      return { ok: false, reason: `Brief "${brief.id}" references an unknown moment.` };
    }
    if (typeof brief.status !== 'string' || !(BRIEF_STATUSES as readonly string[]).includes(brief.status)) {
      return { ok: false, reason: `Brief "${brief.id}" has an invalid status: ${String(brief.status)}.` };
    }
    if (typeof brief.revision !== 'number' || !Number.isInteger(brief.revision) || brief.revision < 1) {
      return { ok: false, reason: `Brief "${brief.id}" has an invalid revision.` };
    }
    if (!isPlainObject(brief.policyResolutionSnapshot)) {
      return { ok: false, reason: `Brief "${brief.id}" has no policy resolution snapshot.` };
    }
    if (!excludedCategoriesValid(brief.policyResolutionSnapshot)) {
      return { ok: false, reason: `Brief "${brief.id}" has a malformed excluded-category snapshot.` };
    }
    if (!deliveryContextValid(brief.policyResolutionSnapshot)) {
      return { ok: false, reason: `Brief "${brief.id}" has a malformed delivery-context snapshot.` };
    }

    // ADR-011 — the confirmation gate, enforced at the persistence layer and
    // not only in the UI. A stored brief whose address is incomplete would mean
    // the gate had been bypassed.
    const address = brief.deliveryAddressSnapshot;
    if (!isPlainObject(address)) {
      return { ok: false, reason: `Brief "${brief.id}" has no delivery address snapshot.` };
    }
    for (const field of ['line1', 'city', 'countryCode'] as const) {
      const value = address[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        return {
          ok: false,
          reason: `Brief "${brief.id}" was stored with an incomplete address — ${field} is missing.`,
        };
      }
    }

    if (
      typeof brief.addressSource !== 'string' ||
      !(ADDRESS_SOURCES as readonly string[]).includes(brief.addressSource)
    ) {
      return { ok: false, reason: `Brief "${brief.id}" has an invalid address source.` };
    }
    // An override without a reason is not a record of a judgement.
    if (brief.addressSource === 'OperatorOverride') {
      const override = brief.addressOverride;
      if (!isPlainObject(override) || !isNonEmptyString(override.reason)) {
        return { ok: false, reason: `Brief "${brief.id}" was overridden without a reason.` };
      }
      if (!isNonEmptyString(override.overriddenAt)) {
        return { ok: false, reason: `Brief "${brief.id}" has an override with no timestamp.` };
      }
    }

    // At most one live brief per Moment. Two would make "the brief" ambiguous
    // for every downstream step.
    if (brief.status === 'Confirmed') {
      const momentId = brief.momentId as string;
      if (liveBriefByMoment.has(momentId)) {
        return {
          ok: false,
          reason: `Moment "${momentId}" has more than one live brief.`,
        };
      }
      liveBriefByMoment.set(momentId, brief.id);
    }
  }

  // ── Vendors (H3.4) ──
  const vendorIds = new Set<string>();
  for (const [i, vendor] of (raw.vendors as unknown[]).entries()) {
    if (!isPlainObject(vendor)) return { ok: false, reason: `Vendor at index ${i} is not an object.` };
    if (!isNonEmptyString(vendor.id)) return { ok: false, reason: `Vendor at index ${i} has no id.` };
    if (vendorIds.has(vendor.id)) return { ok: false, reason: `Duplicate vendor id "${vendor.id}".` };
    vendorIds.add(vendor.id);

    if (vendor.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Vendor "${vendor.id}" belongs to a different workspace.` };
    }
    for (const field of ['name', 'countryCode', 'city'] as const) {
      if (!isNonEmptyString(vendor[field]) || (vendor[field] as string).trim().length === 0) {
        return { ok: false, reason: `Vendor "${vendor.id}" is missing a ${field}.` };
      }
    }
    if (!/^[A-Z]{2}$/.test(vendor.countryCode as string)) {
      return { ok: false, reason: `Vendor "${vendor.id}" has an invalid country code.` };
    }
    // Present-but-wrong is refused; absent is fine. Checked here as well as at
    // the write path, so a payload that reached storage another way still
    // cannot be read as valid.
    for (const field of ['whatsapp', 'email', 'note'] as const) {
      if (vendor[field] === undefined) continue;
      if (typeof vendor[field] !== 'string' || (vendor[field] as string).trim().length === 0) {
        return { ok: false, reason: `Vendor "${vendor.id}" has an unusable ${field}.` };
      }
    }
    // The **same** shape rule the form and the write boundary apply. It was
    // previously enforced in only two of the three places, so a malformed
    // address that reached storage another way still read as valid — and a
    // WhatsApp number alongside it did not make the email any more usable.
    if (vendor.email !== undefined && !isVendorEmailShape(vendor.email)) {
      return { ok: false, reason: `Vendor "${vendor.id}" has a malformed email address.` };
    }
    // A vendor nobody can reach is not a vendor. Enforced in the persistence
    // layer as well as the form, so it cannot be bypassed by a caller.
    const reachable = vendor.whatsapp !== undefined || vendor.email !== undefined;
    if (!reachable) {
      return { ok: false, reason: `Vendor "${vendor.id}" has no way of being contacted.` };
    }
    if (typeof vendor.isActive !== 'boolean') {
      return { ok: false, reason: `Vendor "${vendor.id}" has no active state.` };
    }
    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (!isIsoInstant(vendor[field])) {
        return { ok: false, reason: `Vendor "${vendor.id}" has an unreadable ${field}.` };
      }
    }
  }

  // ── Vendor offers (H3.4) ──
  const offerIds = new Set<string>();
  for (const [i, offer] of (raw.vendorOffers as unknown[]).entries()) {
    if (!isPlainObject(offer)) return { ok: false, reason: `Offer at index ${i} is not an object.` };
    if (!isNonEmptyString(offer.id)) return { ok: false, reason: `Offer at index ${i} has no id.` };
    if (offerIds.has(offer.id)) return { ok: false, reason: `Duplicate offer id "${offer.id}".` };
    offerIds.add(offer.id);

    if (offer.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Offer "${offer.id}" belongs to a different workspace.` };
    }
    if (!momentIds.has(offer.momentId as string)) {
      return { ok: false, reason: `Offer "${offer.id}" references an unknown moment.` };
    }
    if (!briefIds.has(offer.briefId as string)) {
      return { ok: false, reason: `Offer "${offer.id}" references an unknown brief.` };
    }
    // Vendors are deactivated, never deleted, so this reference always resolves.
    if (!vendorIds.has(offer.vendorId as string)) {
      return { ok: false, reason: `Offer "${offer.id}" references an unknown vendor.` };
    }
    if (!decisionIds.has(offer.itemSelectionDecisionId as string)) {
      return { ok: false, reason: `Offer "${offer.id}" references an unknown item selection.` };
    }
    if (typeof offer.source !== 'string' || !(OFFER_SOURCES as readonly string[]).includes(offer.source)) {
      return { ok: false, reason: `Offer "${offer.id}" has an invalid source: ${String(offer.source)}.` };
    }
    // ADR-007 — integer minor units, known currency, and never negative. Zero is
    // permitted: a vendor absorbing a cost is a real quote, and refusing it
    // would invent a commercial rule nobody decided.
    const cost = offer.quotedVendorCost;
    if (!isValidMoney(cost) || cost.amountMinor < 0) {
      return { ok: false, reason: `Offer "${offer.id}" has an invalid quoted cost.` };
    }
    if (!isPlainObject(offer.vendorSnapshot) || !isPlainObject(offer.itemSnapshot)) {
      return { ok: false, reason: `Offer "${offer.id}" is missing a vendor or item snapshot.` };
    }
    if (!isIsoInstant(offer.quotedAt) || !isIsoInstant(offer.recordedAt)) {
      return { ok: false, reason: `Offer "${offer.id}" has an unreadable timestamp.` };
    }
    if (offer.terms !== undefined && (typeof offer.terms !== 'string' || offer.terms.trim().length === 0)) {
      return { ok: false, reason: `Offer "${offer.id}" has unusable terms.` };
    }
    if (
      offer.leadTimeDays !== undefined &&
      (typeof offer.leadTimeDays !== 'number' ||
        !Number.isInteger(offer.leadTimeDays) ||
        offer.leadTimeDays < 0)
    ) {
      return { ok: false, reason: `Offer "${offer.id}" has an invalid lead time.` };
    }
  }

  // ── Couriers (H3.5) ──
  const courierIds = new Set<string>();
  for (const [i, courier] of (raw.couriers as unknown[]).entries()) {
    if (!isPlainObject(courier)) return { ok: false, reason: `Courier at index ${i} is not an object.` };
    if (!isNonEmptyString(courier.id)) return { ok: false, reason: `Courier at index ${i} has no id.` };
    if (courierIds.has(courier.id)) return { ok: false, reason: `Duplicate courier id "${courier.id}".` };
    courierIds.add(courier.id);

    if (courier.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Courier "${courier.id}" belongs to a different workspace.` };
    }
    for (const field of ['name', 'countryCode'] as const) {
      if (!isNonEmptyString(courier[field]) || (courier[field] as string).trim().length === 0) {
        return { ok: false, reason: `Courier "${courier.id}" is missing a ${field}.` };
      }
    }
    if (!/^[A-Z]{2}$/.test(courier.countryCode as string)) {
      return { ok: false, reason: `Courier "${courier.id}" has an invalid country code.` };
    }
    for (const field of ['whatsapp', 'email', 'note'] as const) {
      if (courier[field] === undefined) continue;
      if (typeof courier[field] !== 'string' || (courier[field] as string).trim().length === 0) {
        return { ok: false, reason: `Courier "${courier.id}" has an unusable ${field}.` };
      }
    }
    // The same shared shape rule the form and the write boundary apply.
    if (courier.email !== undefined && !isVendorEmailShape(courier.email)) {
      return { ok: false, reason: `Courier "${courier.id}" has a malformed email address.` };
    }
    if (courier.whatsapp === undefined && courier.email === undefined) {
      return { ok: false, reason: `Courier "${courier.id}" has no way of being contacted.` };
    }
    if (typeof courier.isActive !== 'boolean') {
      return { ok: false, reason: `Courier "${courier.id}" has no active state.` };
    }
    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (!isIsoInstant(courier[field])) {
        return { ok: false, reason: `Courier "${courier.id}" has an unreadable ${field}.` };
      }
    }
  }

  // ── Fulfilments (H3.6, ADR-012) ──
  //
  // The strongest structural rule in the file, because it is the only one that
  // checks a stored record against a *replay* of its own history rather than
  // against a field. A Fulfilment cannot claim a lifecycle its Events do not
  // support, and its Events cannot describe one its record does not match.
  const fulfilmentIds = new Set<string>();
  const fulfilmentById = new Map<string, Record<string, unknown>>();
  const fulfilmentByMoment = new Map<string, string>();
  const redeliveriesByFulfilment = new Map<string, number>();

  for (const [i, fulfilment] of (raw.fulfilments as unknown[]).entries()) {
    if (!isPlainObject(fulfilment)) return { ok: false, reason: `Fulfilment at index ${i} is not an object.` };
    if (!isNonEmptyString(fulfilment.id)) return { ok: false, reason: `Fulfilment at index ${i} has no id.` };
    if (fulfilmentIds.has(fulfilment.id)) {
      return { ok: false, reason: `Duplicate fulfilment id "${fulfilment.id}".` };
    }
    fulfilmentIds.add(fulfilment.id);
    fulfilmentById.set(fulfilment.id, fulfilment);

    if (fulfilment.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}" belongs to a different workspace.` };
    }
    if (!momentIds.has(fulfilment.momentId as string)) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}" references an unknown moment.` };
    }
    // ADR-012: one Fulfilment per Moment. Never two.
    const momentId = fulfilment.momentId as string;
    if (fulfilmentByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one fulfilment.` };
    }
    fulfilmentByMoment.set(momentId, fulfilment.id);

    if (
      typeof fulfilment.status !== 'string' ||
      !(FULFILMENT_STATUSES as readonly string[]).includes(fulfilment.status)
    ) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}" has an invalid status: ${String(fulfilment.status)}.` };
    }
    if (
      typeof fulfilment.attempt !== 'number' ||
      !Number.isInteger(fulfilment.attempt) ||
      fulfilment.attempt < 1
    ) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}" has an invalid attempt number.` };
    }

    // The immutable authority for what was dispatched. Each must still resolve.
    if (!briefIds.has(fulfilment.briefId as string)) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}" references an unknown brief.` };
    }
    if (
      typeof fulfilment.briefRevision !== 'number' ||
      !Number.isInteger(fulfilment.briefRevision) ||
      fulfilment.briefRevision < 1
    ) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}" has an invalid brief revision.` };
    }
    for (const field of [
      'itemSelectionDecisionId',
      'vendorSelectionDecisionId',
      'courierSelectionDecisionId',
    ] as const) {
      if (!decisionIds.has(fulfilment[field] as string)) {
        return { ok: false, reason: `Fulfilment "${fulfilment.id}" references an unknown ${field}.` };
      }
    }
    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (!isIsoInstant(fulfilment[field])) {
        return { ok: false, reason: `Fulfilment "${fulfilment.id}" has an unreadable ${field}.` };
      }
    }

    // The replay, and the whole point of it.
    const replay = replayFulfilment(raw.events as unknown[], fulfilment.id);
    if (!replay.ok) {
      return { ok: false, reason: `Fulfilment "${fulfilment.id}": ${replay.reason}` };
    }
    if (replay.status !== fulfilment.status) {
      return {
        ok: false,
        reason: `Fulfilment "${fulfilment.id}" says it is ${fulfilment.status}, but its history says ${replay.status}.`,
      };
    }
    if (replay.attempt !== fulfilment.attempt) {
      return {
        ok: false,
        reason: `Fulfilment "${fulfilment.id}" says attempt ${fulfilment.attempt}, but its history says ${replay.attempt}.`,
      };
    }
    redeliveriesByFulfilment.set(fulfilment.id, replay.redeliveries);
  }

  // No lifecycle Event may float free of a Fulfilment, and none may cross into
  // another Moment or workspace.
  for (const event of raw.events as Record<string, unknown>[]) {
    if (
      typeof event.eventType !== 'string' ||
      !(FULFILMENT_EVENT_TYPES as readonly string[]).includes(event.eventType)
    ) {
      continue;
    }
    if (!isPlainObject(event.payload)) {
      return { ok: false, reason: `Event "${String(event.id)}" carries no readable payload.` };
    }
    const fulfilmentId = event.payload.fulfilmentId;
    if (typeof fulfilmentId !== 'string' || !fulfilmentIds.has(fulfilmentId)) {
      return { ok: false, reason: `Event "${String(event.id)}" references an unknown fulfilment.` };
    }
    if (fulfilmentByMoment.get(event.momentId as string) !== fulfilmentId) {
      return { ok: false, reason: `Event "${String(event.id)}" names a fulfilment belonging to another moment.` };
    }
  }

  // ── Recognition Orders (H3.7, ADR-013) ──
  const orderIds = new Set<string>();
  const orderById = new Map<string, Record<string, unknown>>();
  const orderByMoment = new Map<string, string>();

  for (const [i, order] of (raw.recognitionOrders as unknown[]).entries()) {
    if (!isPlainObject(order)) return { ok: false, reason: `Recognition order at index ${i} is not an object.` };
    if (!isNonEmptyString(order.id)) return { ok: false, reason: `Recognition order at index ${i} has no id.` };
    if (orderIds.has(order.id)) return { ok: false, reason: `Duplicate recognition order id "${order.id}".` };
    orderIds.add(order.id);
    orderById.set(order.id, order);

    if (order.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Recognition order "${order.id}" belongs to a different workspace.` };
    }
    if (!momentIds.has(order.momentId as string)) {
      return { ok: false, reason: `Recognition order "${order.id}" references an unknown moment.` };
    }
    // ADR-007: one RecognitionOrder per Moment. Never two.
    const momentId = order.momentId as string;
    if (orderByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one recognition order.` };
    }
    orderByMoment.set(momentId, order.id);

    if (!briefIds.has(order.executionBriefId as string)) {
      return { ok: false, reason: `Recognition order "${order.id}" references an unknown brief.` };
    }
    if (
      typeof order.briefRevision !== 'number' ||
      !Number.isInteger(order.briefRevision) ||
      order.briefRevision < 1
    ) {
      return { ok: false, reason: `Recognition order "${order.id}" has an invalid brief revision.` };
    }
    for (const field of [
      'itemSelectionDecisionId',
      'vendorSelectionDecisionId',
      'courierSelectionDecisionId',
    ] as const) {
      if (!decisionIds.has(order[field] as string)) {
        return { ok: false, reason: `Recognition order "${order.id}" references an unknown ${field}.` };
      }
    }

    // ADR-013 §1: H3.7 writes exactly one role. `Agent` and `Unspecified` are
    // reserved values, not storable ones.
    if (order.commercialRole !== PILOT_COMMERCIAL_ROLE) {
      return {
        ok: false,
        reason: `Recognition order "${order.id}" records commercial role ${String(order.commercialRole)}; only ${PILOT_COMMERCIAL_ROLE} is accepted.`,
      };
    }
    if (
      typeof order.status !== 'string' ||
      !(RECOGNITION_ORDER_STATUSES as readonly string[]).includes(order.status)
    ) {
      return { ok: false, reason: `Recognition order "${order.id}" has an invalid status: ${String(order.status)}.` };
    }

    // ADR-013 §3: every amount is NGN, and never negative. Zero is permitted —
    // a complimentary order is a real one, and refusing it would invent a
    // commercial rule nobody decided.
    for (const field of [
      'approvedBudget',
      'estimatedVendorCost',
      'estimatedCourierCost',
      'estimatedCustomerCharge',
    ] as const) {
      const amount = order[field];
      if (!isValidMoney(amount) || amount.amountMinor < 0) {
        return { ok: false, reason: `Recognition order "${order.id}" has an invalid ${field}.` };
      }
      if (amount.currency !== ORDER_CURRENCY) {
        return {
          ok: false,
          reason: `Recognition order "${order.id}" records ${field} in ${amount.currency}; H3.7 orders are ${ORDER_CURRENCY} only.`,
        };
      }
    }

    // The three actuals arrive together, and their presence defines the status.
    const actuals = ['actualVendorCost', 'actualCourierCost', 'actualCustomerCharge'] as const;
    const present = actuals.filter(f => order[f] !== undefined);
    if (present.length !== 0 && present.length !== actuals.length) {
      return { ok: false, reason: `Recognition order "${order.id}" has a partial set of actual amounts.` };
    }
    for (const field of present) {
      const amount = order[field];
      if (!isValidMoney(amount) || amount.amountMinor < 0) {
        return { ok: false, reason: `Recognition order "${order.id}" has an invalid ${field}.` };
      }
      if (amount.currency !== ORDER_CURRENCY) {
        return {
          ok: false,
          reason: `Recognition order "${order.id}" records ${field} in ${amount.currency}; H3.7 orders are ${ORDER_CURRENCY} only.`,
        };
      }
    }
    if ((order.status === 'Reconciled') !== (present.length === actuals.length)) {
      return {
        ok: false,
        reason: `Recognition order "${order.id}" is ${String(order.status)} but its actual amounts say otherwise.`,
      };
    }

    // `grossMargin` is derived and must never reach storage under any name.
    for (const forbidden of FORBIDDEN_ORDER_FIELDS) {
      if (order[forbidden] !== undefined) {
        return { ok: false, reason: `Recognition order "${order.id}" cannot record ${forbidden}.` };
      }
    }

    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (!isIsoInstant(order[field])) {
        return { ok: false, reason: `Recognition order "${order.id}" has an unreadable ${field}.` };
      }
    }
  }

  // ── Memory and closure (H3.8, ADR-014) ──
  //
  // One atomic bundle must remain legible as one bundle after storage: a
  // Closed Moment, one immutable Memory and one exact MomentClosed Event. A
  // partial or cross-linked bundle is invalid state, not something reads may
  // paper over.
  const memoryIds = new Set<string>();
  const memoryByMoment = new Map<string, Record<string, unknown>>();
  const closureEventByMoment = new Map<string, Record<string, unknown>>();

  for (const event of raw.events as Record<string, unknown>[]) {
    if (event.eventType !== 'MomentClosed') continue;
    if (closureEventByMoment.has(event.momentId as string)) {
      return { ok: false, reason: `Moment "${String(event.momentId)}" has more than one closure event.` };
    }
    closureEventByMoment.set(event.momentId as string, event);
  }

  for (const [i, memory] of (raw.memories as unknown[]).entries()) {
    if (!isPlainObject(memory)) return { ok: false, reason: `Memory at index ${i} is not an object.` };

    const extra = exactPayloadKeys(memory, [...MEMORY_REQUIRED_KEYS, ...MEMORY_OPTIONAL_KEYS]);
    if (extra.length > 0) {
      return { ok: false, reason: `Memory at index ${i} cannot carry ${extra.join(', ')}.` };
    }
    for (const field of MEMORY_REQUIRED_KEYS) {
      if (!(field in memory)) return { ok: false, reason: `Memory at index ${i} is missing ${field}.` };
    }

    if (!isNonEmptyString(memory.id)) return { ok: false, reason: `Memory at index ${i} has no id.` };
    if (memoryIds.has(memory.id)) return { ok: false, reason: `Duplicate memory id "${memory.id}".` };
    memoryIds.add(memory.id);

    if (memory.workspaceId !== raw.workspaceId) {
      return { ok: false, reason: `Memory "${memory.id}" belongs to a different workspace.` };
    }
    if (!isNonEmptyString(memory.momentId) || !momentIds.has(memory.momentId)) {
      return { ok: false, reason: `Memory "${memory.id}" references an unknown moment.` };
    }
    if (memoryByMoment.has(memory.momentId)) {
      return { ok: false, reason: `Moment "${memory.momentId}" has more than one Memory.` };
    }
    memoryByMoment.set(memory.momentId, memory);

    const moment = momentById.get(memory.momentId)!;
    if (moment.status !== 'Closed') {
      return { ok: false, reason: `Memory "${memory.id}" belongs to a Moment that is not Closed.` };
    }
    if (!isNonEmptyString(memory.personId) || memory.personId !== moment.personId) {
      return { ok: false, reason: `Memory "${memory.id}" does not match its Moment's person.` };
    }

    if (!isNonEmptyString(memory.fulfilmentId) || !fulfilmentIds.has(memory.fulfilmentId)) {
      return { ok: false, reason: `Memory "${memory.id}" references an unknown fulfilment.` };
    }
    const fulfilment = fulfilmentById.get(memory.fulfilmentId)!;
    if (fulfilment.momentId !== memory.momentId || fulfilment.status !== 'Delivered') {
      return { ok: false, reason: `Memory "${memory.id}" is not backed by this Moment's delivered fulfilment.` };
    }

    if (!isNonEmptyString(memory.recognitionOrderId) || !orderIds.has(memory.recognitionOrderId)) {
      return { ok: false, reason: `Memory "${memory.id}" references an unknown recognition order.` };
    }
    const order = orderById.get(memory.recognitionOrderId)!;
    if (order.momentId !== memory.momentId || order.status !== 'Reconciled') {
      return { ok: false, reason: `Memory "${memory.id}" is not backed by this Moment's reconciled order.` };
    }

    if (
      order.executionBriefId !== fulfilment.briefId ||
      order.briefRevision !== fulfilment.briefRevision ||
      order.itemSelectionDecisionId !== fulfilment.itemSelectionDecisionId ||
      order.vendorSelectionDecisionId !== fulfilment.vendorSelectionDecisionId ||
      order.courierSelectionDecisionId !== fulfilment.courierSelectionDecisionId
    ) {
      return { ok: false, reason: `Memory "${memory.id}" is backed by authorities that disagree.` };
    }

    if (memory.outcome !== 'Delivered') {
      return { ok: false, reason: `Memory "${memory.id}" has an invalid outcome.` };
    }
    if (!isIsoDate(memory.outcomeDate)) {
      return { ok: false, reason: `Memory "${memory.id}" has an unreadable outcomeDate.` };
    }
    if (memory.createdByActorType !== 'Operator') {
      return { ok: false, reason: `Memory "${memory.id}" was not created by an operator.` };
    }
    if (
      memory.createdByActorId !== undefined &&
      (!isNonEmptyString(memory.createdByActorId) || memory.createdByActorId.trim().length === 0)
    ) {
      return { ok: false, reason: `Memory "${memory.id}" has an unusable actor id.` };
    }
    if (!isIsoInstant(memory.createdAt)) {
      return { ok: false, reason: `Memory "${memory.id}" has an unreadable createdAt.` };
    }

    const delivered = (raw.events as Record<string, unknown>[]).find(
      event =>
        event.eventType === 'Delivered' &&
        isPlainObject(event.payload) &&
        event.payload.fulfilmentId === memory.fulfilmentId,
    );
    if (!delivered || !isIsoInstant(delivered.occurredAt)) {
      return { ok: false, reason: `Memory "${memory.id}" has no authoritative Delivered event.` };
    }
    if (memory.outcomeDate !== delivered.occurredAt.slice(0, 10)) {
      return { ok: false, reason: `Memory "${memory.id}" does not use the authoritative delivery date.` };
    }

    const brief = (raw.executionBriefs as Record<string, unknown>[]).find(b => b.id === fulfilment.briefId);
    if (!brief || brief.status !== 'Confirmed' || !isPlainObject(brief.policyResolutionSnapshot)) {
      return { ok: false, reason: `Memory "${memory.id}" has no current confirmed brief authority.` };
    }
    const proofRequired = brief.policyResolutionSnapshot.proofRequired;
    if (typeof proofRequired !== 'boolean') {
      return { ok: false, reason: `Memory "${memory.id}" has no frozen proof requirement.` };
    }
    if (
      proofRequired &&
      !(raw.events as Record<string, unknown>[]).some(
        event =>
          event.eventType === 'ProofReceived' &&
          isPlainObject(event.payload) &&
          event.payload.fulfilmentId === memory.fulfilmentId,
      )
    ) {
      return { ok: false, reason: `Memory "${memory.id}" was created without required proof.` };
    }

    const closed = closureEventByMoment.get(memory.momentId);
    if (!closed || !isPlainObject(closed.payload)) {
      return { ok: false, reason: `Memory "${memory.id}" has no matching MomentClosed event.` };
    }
    const closedPayload = closed.payload;
    const payloadExtra = exactPayloadKeys(closedPayload, MOMENT_CLOSED_PAYLOAD_KEYS);
    if (payloadExtra.length > 0 || MOMENT_CLOSED_PAYLOAD_KEYS.some(key => !(key in closedPayload))) {
      return { ok: false, reason: `Memory "${memory.id}" has a malformed MomentClosed payload.` };
    }
    if (
      closed.actorType !== 'Operator' ||
      closed.source !== 'Platform' ||
      closed.actorId !== memory.createdByActorId ||
      closed.occurredAt !== memory.createdAt ||
      closed.recordedAt !== memory.createdAt ||
      closedPayload.memoryId !== memory.id ||
      closedPayload.fulfilmentId !== memory.fulfilmentId ||
      closedPayload.recognitionOrderId !== memory.recognitionOrderId ||
      closedPayload.outcome !== memory.outcome ||
      closedPayload.outcomeDate !== memory.outcomeDate ||
      closedPayload.previousStatus !== 'ReadyForExecution'
    ) {
      return { ok: false, reason: `Memory "${memory.id}" and its MomentClosed event disagree.` };
    }
  }

  for (const moment of raw.moments as Record<string, unknown>[]) {
    const memory = memoryByMoment.get(moment.id as string);
    const closed = closureEventByMoment.get(moment.id as string);
    if (moment.status === 'Closed') {
      if (!memory || !closed) {
        return { ok: false, reason: `Closed Moment "${String(moment.id)}" has no complete closure bundle.` };
      }
    } else if (memory || closed) {
      return { ok: false, reason: `Moment "${String(moment.id)}" has closure history but is not Closed.` };
    }
  }

  // Every commercial Decision must belong to a Moment that has an order.
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'RecognitionOrderCommitment' && decision.decisionType !== 'CostReconciliation') {
      continue;
    }
    if (!orderByMoment.has(decision.momentId as string)) {
      return {
        ok: false,
        reason: `Commercial decision "${String(decision.id)}" belongs to a moment with no recognition order.`,
      };
    }
  }

  // At most one live `CostReconciliation` per Moment. Corrections supersede.
  const liveReconciliationByMoment = new Set<string>();
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'CostReconciliation' || decision.status !== 'Confirmed') continue;
    const momentId = decision.momentId as string;
    if (liveReconciliationByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one live cost reconciliation.` };
    }
    liveReconciliationByMoment.add(momentId);
  }

  // Every `Redelivery` Decision must correspond to exactly one confirmed
  // redelivery transition — no more, no fewer. A Decision without its dispatch
  // records a judgement that never took effect; a dispatch without its Decision
  // is a state change nobody accounted for.
  const redeliveriesSeen = new Map<string, number>();
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'Redelivery') continue;
    if (decision.status !== 'Confirmed') {
      return { ok: false, reason: `Redelivery decision "${String(decision.id)}" is only ever recorded as Confirmed.` };
    }
    if (decision.provider !== 'HumanOperator') {
      return { ok: false, reason: `Redelivery decision "${String(decision.id)}" must be an operator judgement.` };
    }
    if (!isPlainObject(decision.inputs)) {
      return { ok: false, reason: `Redelivery decision "${String(decision.id)}" records nothing readable.` };
    }
    const extra = exactPayloadKeys(decision.inputs, LIFECYCLE_PAYLOAD_KEYS);
    if (extra.length > 0) {
      return { ok: false, reason: `A redelivery cannot record ${extra.join(', ')}.` };
    }
    const fulfilmentId = decision.inputs.fulfilmentId;
    if (typeof fulfilmentId !== 'string' || !fulfilmentIds.has(fulfilmentId)) {
      return { ok: false, reason: `Redelivery decision "${String(decision.id)}" references an unknown fulfilment.` };
    }
    if (fulfilmentByMoment.get(decision.momentId as string) !== fulfilmentId) {
      return { ok: false, reason: `Redelivery decision "${String(decision.id)}" names a fulfilment belonging to another moment.` };
    }
    const attempt = decision.inputs.attempt;
    if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 2) {
      return { ok: false, reason: `Redelivery decision "${String(decision.id)}" has an invalid attempt number.` };
    }
    redeliveriesSeen.set(fulfilmentId, (redeliveriesSeen.get(fulfilmentId) ?? 0) + 1);
  }
  for (const [fulfilmentId, expected] of redeliveriesByFulfilment) {
    const seen = redeliveriesSeen.get(fulfilmentId) ?? 0;
    if (seen !== expected) {
      return {
        ok: false,
        reason: `Fulfilment "${fulfilmentId}" has ${expected} redelivery dispatch(es) but ${seen} redelivery decision(s).`,
      };
    }
  }

  // At most one live courier selection per Moment — the same rule item and
  // vendor selection follow, and for the same reason.
  const liveCourierByMoment = new Set<string>();
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'CourierSelection' || decision.status !== 'Confirmed') continue;
    const momentId = decision.momentId as string;
    if (liveCourierByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one live courier selection.` };
    }
    liveCourierByMoment.add(momentId);
  }

  // At most one live vendor selection per Moment — the same rule item selection
  // follows, and for the same reason.
  const liveVendorByMoment = new Set<string>();
  for (const decision of raw.decisions as Record<string, unknown>[]) {
    if (decision.decisionType !== 'VendorSelection' || decision.status !== 'Confirmed') continue;
    const momentId = decision.momentId as string;
    if (liveVendorByMoment.has(momentId)) {
      return { ok: false, reason: `Moment "${momentId}" has more than one live vendor selection.` };
    }
    liveVendorByMoment.add(momentId);
  }

  // Supersession must point somewhere real, and only forward.
  for (const brief of raw.executionBriefs as Record<string, unknown>[]) {
    if (brief.status === 'Superseded') {
      if (!isNonEmptyString(brief.supersededByBriefId) || !briefIds.has(brief.supersededByBriefId)) {
        return { ok: false, reason: `Brief "${String(brief.id)}" is superseded by an unknown brief.` };
      }
    }
    if (brief.revisionOfBriefId !== undefined && !briefIds.has(brief.revisionOfBriefId as string)) {
      return { ok: false, reason: `Brief "${String(brief.id)}" revises an unknown brief.` };
    }
  }

  return { ok: true };
}

// ─── Source keys ─────────────────────────────────────────────────────────────

/**
 * Deterministic logical identity for a Campaign Moment.
 *
 * For Campaign v1 a person receives one Moment per program per occasion, so the
 * key needs no cycle component. When Recurring programs arrive — where the same
 * person legitimately receives a Moment every year — the generation cycle joins
 * the key. The `campaign` prefix marks which scheme produced it, so both can
 * coexist without ambiguity.
 */
export function campaignSourceKey(
  workspaceId: string,
  programId: string,
  personId: string,
  occasionType: string,
): string {
  return ['campaign', workspaceId, programId, personId, occasionType].join('::');
}
