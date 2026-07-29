/**
 * localStorage adapter for the operations repository.
 *
 * ⚠️ **Internal prototype only — not production-safe.** Per ADR-010 this exists
 * so the operational model can be built and validated before the backend. It
 * has no authentication, no tenancy enforcement beyond a workspace-id check, no
 * concurrency control, and no tamper resistance: anyone with devtools can
 * rewrite the audit trail. **No vendor, courier, recipient or additional
 * internal user may be given access while this adapter is in use.**
 *
 * Storage is injected rather than reached for, so the whole repository can be
 * exercised outside a browser — which is how the atomicity and idempotency
 * guarantees are actually proven.
 */

import type {
  BriefWrite,
  ItemSelectionWrite,
  MomentBatch,
  OperationsRepository,
  StoreResult,
} from './store';
import type {
  Decision,
  ExecutionBrief,
  Moment,
  MomentStatus,
  OperationalEvent,
  OperationsState,
} from './types';
import {
  OPERATIONS_KEY,
  OPERATIONS_QUARANTINE_KEY,
  emptyOperationsState,
  migrateOperationsState,
  validateOperationsState,
} from './types';

export interface OperationsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createLocalOperationsRepository(storage: OperationsStorage): OperationsRepository {

  /**
   * Read, migrate, then validate. Never adopts a payload belonging to another
   * workspace.
   *
   * The migration runs **in memory only**. A v1 payload is understood and used
   * immediately, and the upgraded shape is persisted by the next write rather
   * than by a read — so merely opening Operations never rewrites storage. That
   * keeps reads free of side effects, which is what lets the preview path
   * honestly claim to write nothing.
   */
  function read(workspaceId: string): StoreResult<OperationsState | null> {
    const raw = storage.getItem(OPERATIONS_KEY);
    if (raw === null) return { ok: true, value: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      quarantine(raw);
      return { ok: false, reason: 'Stored operations data is not valid JSON. It has been set aside.' };
    }

    // Migrate before validating: a v1 payload is real operational history, and
    // quarantining it because H3.2 added a collection would be data loss.
    const migrated = migrateOperationsState(parsed);
    if (migrated.status === 'invalid') {
      quarantine(raw);
      return { ok: false, reason: migrated.reason };
    }

    const validation = validateOperationsState(migrated.state, workspaceId);
    if (!validation.ok) {
      // Preserved, never overwritten — the payload may belong to another
      // workspace, and destroying it would lose that organization's history.
      quarantine(raw);
      return { ok: false, reason: validation.reason };
    }

    return { ok: true, value: migrated.state };
  }

  function quarantine(raw: string): void {
    if (storage.getItem(OPERATIONS_QUARANTINE_KEY) !== null) return;
    try {
      storage.setItem(OPERATIONS_QUARANTINE_KEY, raw);
    } catch {
      // Storage full — the original is still in place and untouched.
    }
  }

  /**
   * The single write path. Validates the **proposed** state in full before
   * replacing the stored one, so an invalid batch commits nothing.
   */
  function commit(next: OperationsState, now: string): StoreResult<OperationsState> {
    const proposed: OperationsState = { ...next, updatedAt: now };
    const validation = validateOperationsState(proposed, proposed.workspaceId);
    if (!validation.ok) {
      return { ok: false, reason: `Refused to write invalid operations state: ${validation.reason}` };
    }
    try {
      storage.setItem(OPERATIONS_KEY, JSON.stringify(proposed));
    } catch {
      return { ok: false, reason: 'Could not write operations state. Nothing was changed.' };
    }
    return { ok: true, value: proposed };
  }

  /** Load-or-fail helper for operations that require existing state. */
  function require(workspaceId: string): StoreResult<OperationsState> {
    const loaded = read(workspaceId);
    if (!loaded.ok) return loaded;
    if (loaded.value === null) {
      return { ok: false, reason: 'No operations state exists for this workspace yet.' };
    }
    return { ok: true, value: loaded.value };
  }

  return {
    load: read,

    initialise(workspaceId, now) {
      const existing = storage.getItem(OPERATIONS_KEY);
      if (existing !== null) {
        const loaded = read(workspaceId);
        // Existing state for *this* workspace is returned rather than replaced.
        if (loaded.ok && loaded.value) return { ok: true, value: loaded.value };
        // Anything else is a foreign or unreadable payload — refuse.
        return { ok: false, reason: loaded.ok ? 'Existing operations state could not be read.' : loaded.reason };
      }
      return commit(emptyOperationsState(workspaceId, now), now);
    },

    listMoments(workspaceId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.moments ?? [] };
    },

    findMoment(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.moments.find(m => m.id === momentId) ?? null };
    },

    findMomentBySourceKey(workspaceId, sourceKey) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.moments.find(m => m.sourceKey === sourceKey) ?? null };
    },

    createMoments(workspaceId, batch, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      // Idempotency: a batch containing an already-prepared identity is refused
      // whole rather than partially applied.
      const existingKeys = new Set(state.value.moments.map(m => m.sourceKey));
      const duplicate = batch.moments.find(m => existingKeys.has(m.sourceKey));
      if (duplicate) {
        return {
          ok: false,
          reason: `A moment already exists for ${duplicate.recipientSnapshot.firstName} ${duplicate.recipientSnapshot.lastName} in this campaign. Nothing was created.`,
        };
      }

      const written = commit(
        {
          ...state.value,
          moments: [...state.value.moments, ...batch.moments],
          decisions: [...state.value.decisions, ...batch.decisions],
          events: [...state.value.events, ...batch.events],
        },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: batch };
    },

    updateMomentStatus(workspaceId, momentId, status, now, extra) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      const moment = state.value.moments.find(m => m.id === momentId);
      if (!moment) return { ok: false, reason: 'That moment no longer exists.' };
      if (moment.status === 'Cancelled') {
        return { ok: false, reason: 'A cancelled moment cannot change status.' };
      }

      const updated: Moment = {
        ...moment,
        status,
        updatedAt: now,
        ...(extra?.cancelledAt ? { cancelledAt: extra.cancelledAt } : {}),
      };

      const written = commit(
        { ...state.value, moments: state.value.moments.map(m => (m.id === momentId ? updated : m)) },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: updated };
    },

    appendDecision(workspaceId, decision) {
      const state = require(workspaceId);
      if (!state.ok) return state;
      if (state.value.decisions.some(d => d.id === decision.id)) {
        return { ok: false, reason: 'That decision has already been recorded.' };
      }
      const written = commit(
        { ...state.value, decisions: [...state.value.decisions, decision] },
        decision.confirmedAt,
      );
      if (!written.ok) return written;
      return { ok: true, value: decision };
    },

    appendEvent(workspaceId, event) {
      const state = require(workspaceId);
      if (!state.ok) return state;
      if (state.value.events.some(e => e.id === event.id)) {
        return { ok: false, reason: 'That event has already been recorded.' };
      }
      // Append-only: existing events are carried through untouched.
      const written = commit(
        { ...state.value, events: [...state.value.events, event] },
        event.recordedAt,
      );
      if (!written.ok) return written;
      return { ok: true, value: event };
    },

    supersedeDecision(workspaceId, decisionId, supersededByDecisionId, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      const decision = state.value.decisions.find(d => d.id === decisionId);
      if (!decision) return { ok: false, reason: 'That decision no longer exists.' };
      if (decision.status === 'Superseded') {
        return { ok: false, reason: 'That decision has already been superseded.' };
      }

      // Only supersession metadata changes. Reason, inputs and outcome are
      // never rewritten — an editable decision is not evidence.
      const superseded: Decision = {
        ...decision,
        status: 'Superseded',
        supersededAt: now,
        supersededByDecisionId,
      };

      const written = commit(
        { ...state.value, decisions: state.value.decisions.map(d => (d.id === decisionId ? superseded : d)) },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: superseded };
    },

    listBriefs(workspaceId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.executionBriefs ?? [] };
    },

    findLiveBriefForMoment(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      const found =
        state.value?.executionBriefs.find(b => b.momentId === momentId && b.status === 'Confirmed') ?? null;
      return { ok: true, value: found };
    },

    listBriefsForMoment(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      const all = (state.value?.executionBriefs ?? [])
        .filter(b => b.momentId === momentId)
        .sort((a, b) => a.revision - b.revision);
      return { ok: true, value: all };
    },

    commitBrief(workspaceId, write: BriefWrite, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      const moment = state.value.moments.find(m => m.id === write.brief.momentId);
      if (!moment) return { ok: false, reason: 'That moment no longer exists.' };

      if (state.value.executionBriefs.some(b => b.id === write.brief.id)) {
        return { ok: false, reason: 'That brief has already been recorded.' };
      }

      const live = state.value.executionBriefs.find(
        b => b.momentId === write.brief.momentId && b.status === 'Confirmed',
      );
      // A second live brief would make "the brief" ambiguous for every
      // downstream step. Correcting one is a supersession, not an addition.
      if (live && write.supersedes?.briefId !== live.id) {
        return {
          ok: false,
          reason: 'A brief has already been confirmed for this moment. Correct that one instead.',
        };
      }
      if (write.supersedes && !live) {
        return { ok: false, reason: 'There is no live brief to correct.' };
      }

      let briefs = state.value.executionBriefs;
      let decisions = state.value.decisions;

      if (write.supersedes) {
        const target = write.supersedes.briefId;
        // Only supersession metadata changes. Address, snapshots, reason and
        // timestamps on the original are never rewritten — a rewritable
        // execution record is not evidence of what was executed.
        briefs = briefs.map(b =>
          b.id === target
            ? { ...b, status: 'Superseded' as const, supersededByBriefId: write.brief.id, supersededAt: now }
            : b,
        );

        const decisionId = write.supersedes.decisionId;
        if (decisionId) {
          const prior = decisions.find(d => d.id === decisionId);
          if (!prior) return { ok: false, reason: 'The decision being superseded no longer exists.' };
          if (prior.status === 'Superseded') {
            return { ok: false, reason: 'That decision has already been superseded.' };
          }
          decisions = decisions.map(d =>
            d.id === decisionId
              ? { ...d, status: 'Superseded' as const, supersededAt: now, supersededByDecisionId: write.decision.id }
              : d,
          );
        }
      }

      if (decisions.some(d => d.id === write.decision.id)) {
        return { ok: false, reason: 'That decision has already been recorded.' };
      }
      if (state.value.events.some(e => e.id === write.event.id)) {
        return { ok: false, reason: 'That event has already been recorded.' };
      }

      // One transaction: the brief, the Decision and the Event together, over a
      // proposed state validated in full (ADR-006).
      const written = commit(
        {
          ...state.value,
          executionBriefs: [...briefs, write.brief],
          decisions: [...decisions, write.decision],
          events: [...state.value.events, write.event],
        },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: write.brief };
    },

    findLiveItemSelection(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      const found =
        state.value?.decisions.find(
          d => d.momentId === momentId && d.decisionType === 'ItemSelection' && d.status === 'Confirmed',
        ) ?? null;
      return { ok: true, value: found };
    },

    commitItemSelection(workspaceId, write: ItemSelectionWrite, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      const { decision, event } = write;

      if (decision.decisionType !== 'ItemSelection') {
        return { ok: false, reason: 'That decision is not an item selection.' };
      }
      if (event.eventType !== 'ItemSelected') {
        return { ok: false, reason: 'That event does not record an item selection.' };
      }
      if (decision.momentId !== event.momentId) {
        return { ok: false, reason: 'The decision and event refer to different moments.' };
      }

      const moment = state.value.moments.find(m => m.id === decision.momentId);
      if (!moment) return { ok: false, reason: 'That moment no longer exists.' };
      if (moment.status === 'Cancelled') {
        return { ok: false, reason: 'That moment has been cancelled. Nothing was recorded.' };
      }
      if (moment.status !== 'ReadyForExecution') {
        return { ok: false, reason: 'That moment is no longer ready for execution. Nothing was recorded.' };
      }

      // Revalidated here, not merely on the screen. A confirmation prepared
      // against a brief that has since been corrected refers to a revision
      // nobody is executing any more, and writing it would attach the choice
      // to the wrong evidence.
      const inputs = decision.inputs as { briefId?: string; briefRevision?: number };
      const live = state.value.executionBriefs.find(
        b => b.momentId === decision.momentId && b.status === 'Confirmed',
      );
      if (!live) {
        return { ok: false, reason: 'This moment has no confirmed brief. Nothing was recorded.' };
      }
      if (inputs.briefId !== live.id || inputs.briefRevision !== live.revision) {
        return {
          ok: false,
          reason: 'The brief was corrected while this was open. Review it and choose again — nothing was recorded.',
        };
      }

      // One live selection per Moment. Repeated clicks, a stale tab and a
      // reloaded page all land here, and all of them are refused.
      const existing = state.value.decisions.find(
        d => d.momentId === decision.momentId && d.decisionType === 'ItemSelection' && d.status === 'Confirmed',
      );
      if (existing) {
        return { ok: false, reason: 'An item has already been chosen for this moment.' };
      }

      if (state.value.decisions.some(d => d.id === decision.id)) {
        return { ok: false, reason: 'That decision has already been recorded.' };
      }
      if (state.value.events.some(e => e.id === event.id)) {
        return { ok: false, reason: 'That event has already been recorded.' };
      }

      // One transaction, over a proposed state validated in full (ADR-006).
      // Existing decisions and events are carried through untouched.
      const written = commit(
        {
          ...state.value,
          decisions: [...state.value.decisions, decision],
          events: [...state.value.events, event],
        },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: decision };
    },

    validate(workspaceId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      if (state.value === null) return { ok: false, reason: 'No operations state exists for this workspace yet.' };
      return { ok: true, value: true };
    },
  };
}

/** Browser-backed repository. Returns null during SSR. */
export function browserOperationsRepository(): OperationsRepository | null {
  if (typeof window === 'undefined') return null;
  return createLocalOperationsRepository(window.localStorage);
}

export type {
  OperationalEvent,
  Decision,
  ExecutionBrief,
  Moment,
  MomentStatus,
  MomentBatch,
  BriefWrite,
  ItemSelectionWrite,
};
