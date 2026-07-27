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
  Moment,
  MomentStatus,
  OperationalEvent,
  OperationsState,
} from './types';

export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What a single atomic preparation run writes. */
export interface MomentBatch {
  moments: Moment[];
  decisions: Decision[];
  events: OperationalEvent[];
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

  /** Structural check of the stored state, without modifying it. */
  validate(workspaceId: string): StoreResult<true>;
}
