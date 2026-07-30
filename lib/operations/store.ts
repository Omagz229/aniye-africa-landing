/**
 * The operations repository interface — ADR-010.
 *
 * Every write is a **named operation** with its own preconditions. There is
 * deliberately no `save(state)`: a generic setter would let any caller write
 * any shape, which is precisely how append-only guarantees get lost. The
 * interface here is the contract a backend adapter must satisfy, written before
 * the backend exists so that replacing the local adapter is a swap rather than
 * a rewrite.
 */

import type {
  Decision,
  ExecutionBrief,
  Fulfilment,
  Moment,
  MomentStatus,
  OperationalEvent,
  OperationsState,
  Courier,
  Vendor,
  VendorOffer,
} from './types';

export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What a single atomic preparation run writes. */
export interface MomentBatch {
  moments: Moment[];
  decisions: Decision[];
  events: OperationalEvent[];
}

/** What one brief confirmation or correction writes, atomically. */
export interface BriefWrite {
  brief: ExecutionBrief;
  decision: Decision;
  event: OperationalEvent;
  /** When revising: the brief to mark superseded, and the Decision to supersede. */
  supersedes?: { briefId: string; decisionId?: string };
}

/** What one confirmed item selection writes, atomically (H3.3). */
export interface ItemSelectionWrite {
  decision: Decision;
  event: OperationalEvent;
}

/**
 * What one confirmed vendor comparison writes, atomically (H3.4).
 *
 * **Every considered offer**, not only the chosen one — the rejected quotes are
 * the evidence that a choice was made at all.
 */
export interface VendorSelectionWrite {
  offers: VendorOffer[];
  decision: Decision;
  event: OperationalEvent;
}

/**
 * What one confirmed courier selection writes, atomically (H3.5).
 *
 * No separate record collection: unlike a vendor comparison, which had to
 * persist several hand-entered quotes, this is one choice with one cost and the
 * Decision carries all of it.
 */
export interface CourierSelectionWrite {
  decision: Decision;
  event: OperationalEvent;
}

/**
 * What confirming initial dispatch writes, atomically (H3.6).
 *
 * The Fulfilment is **created here and nowhere else** — there is no draft, and
 * no `Pending` row precedes it (ADR-012).
 */
export interface DispatchWrite {
  fulfilment: Fulfilment;
  event: OperationalEvent;
}

/**
 * What a failure, a delivery confirmation or a proof receipt writes: **one
 * Event, and no Decision.**
 *
 * The Fulfilment's status and attempt are recomputed by the implementation from
 * re-read state — deliberately not submitted, so no caller can assert a
 * lifecycle its own Events do not support.
 */
export interface FulfilmentEventWrite {
  event: OperationalEvent;
}

/**
 * What a confirmed redelivery writes, atomically (H3.6).
 *
 * The only fulfilment transition carrying a Decision, because it is the only one
 * where the operator chose between real alternatives.
 */
export interface RedeliveryWrite {
  decision: Decision;
  event: OperationalEvent;
}

export interface OperationsRepository {
  /**
   * Read the stored state for a workspace.
   *
   * Returns `null` when nothing is stored. Refuses — rather than adopts — a
   * payload belonging to a different workspace.
   */
  load(workspaceId: string): StoreResult<OperationsState | null>;

  /** Create empty state for a workspace. Fails if state already exists. */
  initialise(workspaceId: string, now: string): StoreResult<OperationsState>;

  listMoments(workspaceId: string): StoreResult<Moment[]>;

  findMoment(workspaceId: string, momentId: string): StoreResult<Moment | null>;

  /** Look a Moment up by its deterministic identity — the idempotency check. */
  findMomentBySourceKey(workspaceId: string, sourceKey: string): StoreResult<Moment | null>;

  /**
   * Commit a whole preparation run **atomically**.
   *
   * The proposed state is validated in full before anything is stored: either
   * every record in the batch lands, or none does. A batch containing a Moment
   * whose `sourceKey` already exists is refused outright rather than partially
   * applied.
   */
  createMoments(workspaceId: string, batch: MomentBatch, now: string): StoreResult<MomentBatch>;

  /**
   * Controlled status transition. Not a general-purpose update — the caller
   * cannot rewrite snapshots, ids, or history through this.
   */
  updateMomentStatus(
    workspaceId: string,
    momentId: string,
    status: MomentStatus,
    now: string,
    extra?: { cancelledAt?: string },
  ): StoreResult<Moment>;

  appendDecision(workspaceId: string, decision: Decision): StoreResult<Decision>;

  appendEvent(workspaceId: string, event: OperationalEvent): StoreResult<OperationalEvent>;

  /**
   * Mark a Decision superseded by another. The original text is never altered —
   * only the supersession metadata is set, and only once.
   */
  supersedeDecision(
    workspaceId: string,
    decisionId: string,
    supersededByDecisionId: string,
    now: string,
  ): StoreResult<Decision>;

  // ── Execution Briefs (H3.2) ──

  listBriefs(workspaceId: string): StoreResult<ExecutionBrief[]>;

  /** The one live brief for a Moment, or null. Superseded revisions are excluded. */
  findLiveBriefForMoment(workspaceId: string, momentId: string): StoreResult<ExecutionBrief | null>;

  /** Every revision for a Moment, oldest first — the correction history. */
  listBriefsForMoment(workspaceId: string, momentId: string): StoreResult<ExecutionBrief[]>;

  /**
   * Commit a brief confirmation **atomically** — the brief, its Decision and its
   * Event land together or not at all, over a fully validated proposed state.
   *
   * When `supersedes` is present this is a correction: the named brief is marked
   * `Superseded` and the named Decision superseded, and **the original's content
   * is never rewritten**. A Moment that already has a live brief is refused
   * unless the write supersedes it.
   */
  commitBrief(workspaceId: string, write: BriefWrite, now: string): StoreResult<ExecutionBrief>;

  // ── Item selection (H3.3) ──

  /**
   * The one live `ItemSelection` Decision for a Moment, or null.
   *
   * A read. Superseded selections are excluded — this answers "what is chosen
   * now", not "what has ever been chosen".
   */
  findLiveItemSelection(workspaceId: string, momentId: string): StoreResult<Decision | null>;

  /**
   * Commit an item selection **atomically** — the Decision and its Event land
   * together or not at all, over a fully validated proposed state.
   *
   * **Recomputes rather than trusts.** An implementation must re-read state and
   * rebuild the answer from the live confirmed brief's immutable snapshot and
   * the current catalog, then compare every piece of submitted evidence against
   * it: the approved budget, the applied exclusions, the complete ordered
   * candidate set and its snapshots, and the selected item's own snapshot. The
   * Decision must be a Confirmed `HumanOperator` judgement with a reason, and
   * the Event must describe the same occurrence at the same instant.
   *
   * A structurally valid bundle that keeps the right brief reference while
   * altering any of that is **refused, and nothing is written** — an audit trail
   * that is internally consistent and wrong is worse than no audit trail.
   *
   * Constraints come from the brief, never from a live Workspace policy read: a
   * policy edited since generation did not govern this Moment. The catalog, by
   * contrast, is read live, so an item withdrawn, repriced or newly excluded
   * while the screen sat open stops the write.
   */
  commitItemSelection(
    workspaceId: string,
    write: ItemSelectionWrite,
    now: string,
  ): StoreResult<Decision>;

  // ── Vendor directory (H3.4) ──
  //
  // Ordinary directory maintenance is **not** a Moment Decision and not an
  // OperationalEvent: adding a vendor changes no Moment's execution, which is
  // ADR-006's own test. The judgement is recorded when a vendor is *chosen*.

  listVendors(workspaceId: string): StoreResult<Vendor[]>;

  findVendor(workspaceId: string, vendorId: string): StoreResult<Vendor | null>;

  createVendor(workspaceId: string, vendor: Vendor, now: string): StoreResult<Vendor>;

  /**
   * Replace a vendor's editable fields. Not a general setter — the
   * implementation carries `id`, `workspaceId`, `createdAt` and `isActive`
   * through from the stored record, so an edit cannot reassign a vendor to
   * another workspace or resurrect a deactivated one.
   */
  updateVendor(workspaceId: string, vendor: Vendor, now: string): StoreResult<Vendor>;

  /**
   * Deactivate or reactivate. **There is deliberately no delete.** A vendor who
   * quoted last quarter must stay resolvable from the offers that name them.
   */
  setVendorActive(workspaceId: string, vendorId: string, isActive: boolean, now: string): StoreResult<Vendor>;

  // ── Vendor selection (H3.4) ──

  listVendorOffers(workspaceId: string, momentId: string): StoreResult<VendorOffer[]>;

  /** The one live `VendorSelection` Decision for a Moment, or null. */
  findLiveVendorSelection(workspaceId: string, momentId: string): StoreResult<Decision | null>;

  /**
   * Commit a vendor comparison **atomically** — every considered offer, one
   * Decision and one Event land together or not at all.
   *
   * **Recomputes rather than trusts**, exactly as `commitItemSelection` does:
   * the Moment, the live brief, the live `ItemSelection` Decision and every
   * vendor record are re-read, and each piece of submitted evidence is compared
   * against them. A vendor renamed or deactivated while the screen sat open
   * stops the write.
   *
   * One honest limit: the repository can verify everything Aniyé holds, but it
   * **cannot prove what a vendor said**. A quote is attributable operator
   * testimony — channel, quoted time and recorder — not an independently
   * verified fact, and nothing here pretends otherwise.
   */
  commitVendorSelection(
    workspaceId: string,
    write: VendorSelectionWrite,
    now: string,
  ): StoreResult<Decision>;

  // ── Courier directory (H3.5) ──
  //
  // Scoped **per country**: a courier row answers "who can carry this in NG?".
  // Like vendors, directory maintenance is neither a Decision nor an Event.

  listCouriers(workspaceId: string): StoreResult<Courier[]>;

  findCourier(workspaceId: string, courierId: string): StoreResult<Courier | null>;

  createCourier(workspaceId: string, courier: Courier, now: string): StoreResult<Courier>;

  /** Identity, ownership, creation time and active state come from the stored record. */
  updateCourier(workspaceId: string, courier: Courier, now: string): StoreResult<Courier>;

  /** Deactivate or reactivate. **There is deliberately no delete.** */
  setCourierActive(workspaceId: string, courierId: string, isActive: boolean, now: string): StoreResult<Courier>;

  // ── Courier selection (H3.5) ──

  /** The one live `CourierSelection` Decision for a Moment, or null. */
  findLiveCourierSelection(workspaceId: string, momentId: string): StoreResult<Decision | null>;

  /**
   * Commit a courier selection **atomically** — the Decision and its Event land
   * together or not at all.
   *
   * **Recomputes rather than trusts.** The Moment, the live brief, the live
   * `ItemSelection` and `VendorSelection`, the delivery country and the couriers
   * serving it are all re-read, and every piece of submitted evidence is
   * compared against them — including nested shapes, which H3.4-D2 proved must
   * be checked rather than assumed.
   *
   * The same honest limit as vendors: this cannot prove what a courier said.
   */
  commitCourierSelection(
    workspaceId: string,
    write: CourierSelectionWrite,
    now: string,
  ): StoreResult<Decision>;

  // ── Fulfilment (H3.6) ──
  //
  // Five named transitions, one per lifecycle step. Deliberately **not** one
  // `updateFulfilment(status)`: a generic setter would let any caller move a
  // Fulfilment to any state, which is exactly the guarantee ADR-012 exists to
  // hold. Each operation below re-reads state, recomputes the transition its own
  // name allows, validates the full proposed state, and performs **one** write.

  listFulfilments(workspaceId: string): StoreResult<Fulfilment[]>;

  /** The one Fulfilment for a Moment, or null. Never more than one. */
  findFulfilmentForMoment(workspaceId: string, momentId: string): StoreResult<Fulfilment | null>;

  /**
   * Confirm that the courier has it — **the only operation that creates a
   * Fulfilment.**
   *
   * Refuses, with a named recovery and zero writes, unless the Moment is
   * `ReadyForExecution` in this workspace with no Fulfilment already, its live
   * confirmed brief and all three live selection Decisions exist and agree with
   * each other, and the brief's policy snapshot carries **all four** v6 delivery
   * promises. Legacy absence means "not recorded"; it is never defaulted and the
   * live policy is never re-resolved.
   */
  commitInitialDispatch(workspaceId: string, write: DispatchWrite, now: string): StoreResult<Fulfilment>;

  /** Record that the current attempt failed. `Dispatched` → `DeliveryFailed`. */
  commitDeliveryFailure(
    workspaceId: string,
    write: FulfilmentEventWrite,
    now: string,
  ): StoreResult<Fulfilment>;

  /**
   * Send it again. `DeliveryFailed` → `Dispatched`, attempt + 1, with a
   * Confirmed `Redelivery` Decision carrying the operator's reason. All three
   * land together or not at all.
   */
  commitRedelivery(workspaceId: string, write: RedeliveryWrite, now: string): StoreResult<Fulfilment>;

  /** Record that it reached the recipient. `Dispatched` → `Delivered`. */
  commitDelivery(workspaceId: string, write: FulfilmentEventWrite, now: string): StoreResult<Fulfilment>;

  /**
   * Record that proof arrived. Appends one Event and **changes no status**.
   *
   * ⚠️ Metadata only — kind, channel, actor and timestamps. An implementation
   * must refuse any payload carrying a file, file name, URL, data URI, base64 or
   * blob (ADR-012 §7).
   */
  commitProofReceipt(
    workspaceId: string,
    write: FulfilmentEventWrite,
    now: string,
  ): StoreResult<Fulfilment>;

  /** Structural check of the stored state, without modifying it. */
  validate(workspaceId: string): StoreResult<true>;
}
