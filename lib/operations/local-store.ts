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

import type { CatalogItem } from '../catalog';
import { CATALOG_ITEMS } from '../catalog';
import { verifyItemSelection } from './selection';
import { verifyVendorSelection } from './vendor-selection';
import { canonicalVendor } from './vendors';
import { canonicalCourier } from './couriers';
import { verifyCourierSelection } from './courier-selection';
import type {
  BriefWrite,
  ItemSelectionWrite,
  MomentBatch,
  CourierSelectionWrite,
  OperationsRepository,
  StoreResult,
  VendorSelectionWrite,
} from './store';
import type {
  Decision,
  ExecutionBrief,
  Moment,
  MomentStatus,
  OperationalEvent,
  OperationsState,
  Courier,
  Vendor,
  VendorOffer,
} from './types';
import {
  OPERATIONS_KEY,
  OPERATIONS_QUARANTINE_KEY,
  emptyOperationsState,
  isPlainRecord,
  migrateOperationsState,
  validateOperationsState,
} from './types';

export interface OperationsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OperationsRepositoryOptions {
  /**
   * The catalog the repository recomputes item eligibility against.
   *
   * Injected for the same reason storage is: a trust boundary that can only be
   * exercised against the production seed cannot be tested for **staleness**.
   * Building a second repository over the *same* storage with a changed catalog
   * is exactly the scenario the boundary exists for — an item withdrawn,
   * repriced or newly excluded while an operator's screen sat open.
   *
   * Defaults to the shipped seed. Production passes nothing.
   */
  catalog?: readonly CatalogItem[];
}

export function createLocalOperationsRepository(
  storage: OperationsStorage,
  options: OperationsRepositoryOptions = {},
): OperationsRepository {
  const catalog = options.catalog ?? CATALOG_ITEMS;

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

      if (decision.momentId !== event.momentId) {
        return {
          ok: false,
          reason: 'The decision and event refer to different moments. Review the moment and choose again — nothing was recorded.',
        };
      }

      const moment = state.value.moments.find(m => m.id === decision.momentId);
      if (!moment) {
        return {
          ok: false,
          reason: 'That moment no longer exists. Review the queue — nothing was recorded.',
        };
      }

      /**
       * **The trust boundary.**
       *
       * Everything the submission asserts is recomputed here from re-read state
       * and the current catalog, and compared. Before this call existed, the
       * commit checked the brief id and revision and then believed the rest —
       * so a bundle could keep the right brief reference while carrying a
       * different budget, different exclusions, a truncated candidate set or a
       * mispriced item snapshot, and still be written. An audit trail that is
       * internally consistent and wrong is worse than none.
       *
       * The **brief's** immutable snapshot is authoritative for constraints; the
       * Workspace policy is deliberately not read. The **catalog** is read live,
       * so an item withdrawn, repriced or newly excluded while the screen sat
       * open stops the write.
       */
      const verified = verifyItemSelection({
        workspaceId,
        moment,
        briefs: state.value.executionBriefs,
        decisions: state.value.decisions,
        write,
        items: catalog,
      });
      if (!verified.ok) return verified;

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

    // ── Vendor directory (H3.4) ──

    listVendors(workspaceId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.vendors ?? [] };
    },

    findVendor(workspaceId, vendorId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.vendors.find(v => v.id === vendorId) ?? null };
    },

    createVendor(workspaceId, vendor, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      /**
       * **Rebuilt, not spread.** `canonicalVendor` validates the exact H3.4
       * field list and constructs a fresh record from it, so a caller cannot
       * store a `reliabilityScore`, `rating`, `capacity`, `sla` or
       * `onboardingStatus` by handing us an object that satisfies the `Vendor`
       * interface at compile time — TypeScript checks no excess property on a
       * widened value, and nothing at all at runtime. Vendor *Intelligence* is
       * H4.4, and this is what keeps it there.
       */
      const canonical = canonicalVendor(vendor, workspaceId);
      if (!canonical.ok) return canonical;

      if (state.value.vendors.some(v => v.id === canonical.value.id)) {
        return { ok: false, reason: 'That vendor has already been added.' };
      }
      const written = commit({ ...state.value, vendors: [...state.value.vendors, canonical.value] }, now);
      if (!written.ok) return written;
      return { ok: true, value: canonical.value };
    },

    updateVendor(workspaceId, vendor, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;
      const existing = state.value.vendors.find(v => v.id === (vendor as { id?: string }).id);
      if (!existing) return { ok: false, reason: 'That vendor is no longer in the directory.' };

      /**
       * Identity, ownership, creation time and active state are taken from the
       * **stored** record, never from the submission — an edit form must not be
       * able to reassign a vendor, rewrite when it was added, or resurrect a
       * deactivated one. Only `setVendorActive` changes active state.
       *
       * The result is then rebuilt through `canonicalVendor`, so an edit cannot
       * smuggle undeclared fields in either.
       */
      const proposed = {
        ...(vendor as unknown as Record<string, unknown>),
        id: existing.id,
        workspaceId: existing.workspaceId,
        isActive: existing.isActive,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      const canonical = canonicalVendor(proposed, workspaceId);
      if (!canonical.ok) return canonical;
      const updated: Vendor = canonical.value;

      const written = commit(
        { ...state.value, vendors: state.value.vendors.map(v => (v.id === updated.id ? updated : v)) },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: updated };
    },

    setVendorActive(workspaceId, vendorId, isActive, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;
      const existing = state.value.vendors.find(v => v.id === vendorId);
      if (!existing) return { ok: false, reason: 'That vendor is no longer in the directory.' };
      if (existing.isActive === isActive) {
        return { ok: true, value: existing };
      }
      const canonical = canonicalVendor({ ...existing, isActive, updatedAt: now }, workspaceId);
      if (!canonical.ok) return canonical;
      const updated: Vendor = canonical.value;
      const written = commit(
        { ...state.value, vendors: state.value.vendors.map(v => (v.id === vendorId ? updated : v)) },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: updated };
    },

    // ── Vendor selection (H3.4) ──

    listVendorOffers(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: (state.value?.vendorOffers ?? []).filter(o => o.momentId === momentId) };
    },

    findLiveVendorSelection(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      const found =
        state.value?.decisions.find(
          d => d.momentId === momentId && d.decisionType === 'VendorSelection' && d.status === 'Confirmed',
        ) ?? null;
      return { ok: true, value: found };
    },

    commitVendorSelection(workspaceId, write: VendorSelectionWrite, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      const { offers, decision, event } = write;

      if (decision.momentId !== event.momentId) {
        return {
          ok: false,
          reason: 'The decision and event refer to different moments. Review the moment and record the quotes again — nothing was recorded.',
        };
      }

      const moment = state.value.moments.find(m => m.id === decision.momentId);
      if (!moment) {
        return {
          ok: false,
          reason: 'That moment no longer exists. Review the queue — nothing was recorded.',
        };
      }

      /**
       * **The trust boundary.** Everything the submission asserts is recomputed
       * from re-read state — the Moment, the live brief, the live
       * `ItemSelection` Decision and every vendor record — and compared.
       *
       * The item is taken from the item-selection Decision, **not** re-read from
       * the catalog: that Decision is the immutable record of what was chosen
       * and at what price, and a later repricing must not silently replace it.
       */
      const verified = verifyVendorSelection({
        workspaceId,
        moment,
        briefs: state.value.executionBriefs,
        decisions: state.value.decisions,
        vendors: state.value.vendors,
        write,
      });
      if (!verified.ok) return verified;

      // Idempotency: a replayed bundle collides on every identifier it carries.
      for (const offer of offers) {
        if (state.value.vendorOffers.some(o => o.id === offer.id)) {
          return { ok: false, reason: 'Those quotes have already been recorded.' };
        }
      }
      if (state.value.decisions.some(d => d.id === decision.id)) {
        return { ok: false, reason: 'That decision has already been recorded.' };
      }
      if (state.value.events.some(e => e.id === event.id)) {
        return { ok: false, reason: 'That event has already been recorded.' };
      }

      // One transaction: every considered offer, the Decision and the Event
      // together, over a proposed state validated in full (ADR-006). Existing
      // records are carried through untouched.
      const written = commit(
        {
          ...state.value,
          vendorOffers: [...state.value.vendorOffers, ...offers],
          decisions: [...state.value.decisions, decision],
          events: [...state.value.events, event],
        },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: decision };
    },

    // ── Courier directory (H3.5) ──

    listCouriers(workspaceId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.couriers ?? [] };
    },

    findCourier(workspaceId, courierId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      return { ok: true, value: state.value?.couriers.find(c => c.id === courierId) ?? null };
    },

    createCourier(workspaceId, courier, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      // Rebuilt, not spread — the same discipline vendors landed on at H3.4-D1,
      // applied here from the first line rather than retrofitted.
      const canonical = canonicalCourier(courier, workspaceId);
      if (!canonical.ok) return canonical;

      if (state.value.couriers.some(c => c.id === canonical.value.id)) {
        return { ok: false, reason: 'That courier has already been added.' };
      }
      const written = commit({ ...state.value, couriers: [...state.value.couriers, canonical.value] }, now);
      if (!written.ok) return written;
      return { ok: true, value: canonical.value };
    },

    updateCourier(workspaceId, courier, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;
      const existing = state.value.couriers.find(c => c.id === (courier as { id?: string }).id);
      if (!existing) return { ok: false, reason: 'That courier is no longer in the directory.' };

      const proposed = {
        ...(courier as unknown as Record<string, unknown>),
        id: existing.id,
        workspaceId: existing.workspaceId,
        isActive: existing.isActive,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      const canonical = canonicalCourier(proposed, workspaceId);
      if (!canonical.ok) return canonical;
      const updated: Courier = canonical.value;

      const written = commit(
        { ...state.value, couriers: state.value.couriers.map(c => (c.id === updated.id ? updated : c)) },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: updated };
    },

    setCourierActive(workspaceId, courierId, isActive, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;
      const existing = state.value.couriers.find(c => c.id === courierId);
      if (!existing) return { ok: false, reason: 'That courier is no longer in the directory.' };
      if (existing.isActive === isActive) return { ok: true, value: existing };

      const canonical = canonicalCourier({ ...existing, isActive, updatedAt: now }, workspaceId);
      if (!canonical.ok) return canonical;
      const updated: Courier = canonical.value;

      const written = commit(
        { ...state.value, couriers: state.value.couriers.map(c => (c.id === courierId ? updated : c)) },
        now,
      );
      if (!written.ok) return written;
      return { ok: true, value: updated };
    },

    // ── Courier selection (H3.5) ──

    findLiveCourierSelection(workspaceId, momentId) {
      const state = read(workspaceId);
      if (!state.ok) return state;
      const found =
        state.value?.decisions.find(
          d => d.momentId === momentId && d.decisionType === 'CourierSelection' && d.status === 'Confirmed',
        ) ?? null;
      return { ok: true, value: found };
    },

    commitCourierSelection(workspaceId, write: CourierSelectionWrite, now) {
      const state = require(workspaceId);
      if (!state.ok) return state;

      /**
       * **Shape before contents.** The interface says this is a
       * `CourierSelectionWrite`; the compiler is gone by the time a caller hands
       * us `null`, an array or a bundle with no decision. Destructuring or
       * reading `.momentId` first turns a bad submission into a thrown
       * exception — which is not a refusal. It tells the operator nothing and
       * leaves them unable to say whether anything was written.
       */
      if (!isPlainRecord(write)) {
        return {
          ok: false,
          reason: 'That submission is not a record. Review the moment and arrange carriage again — nothing was recorded.',
        };
      }
      const { decision, event } = write as Partial<CourierSelectionWrite>;
      if (!isPlainRecord(decision)) {
        return {
          ok: false,
          reason: 'That submission carries no readable decision. Review the moment and arrange carriage again — nothing was recorded.',
        };
      }
      if (!isPlainRecord(event)) {
        return {
          ok: false,
          reason: 'That submission carries no readable event. Review the moment and arrange carriage again — nothing was recorded.',
        };
      }

      if (decision.momentId !== event.momentId) {
        return {
          ok: false,
          reason: 'The decision and event refer to different moments. Review the moment and arrange carriage again — nothing was recorded.',
        };
      }

      const moment = state.value.moments.find(m => m.id === decision.momentId);
      if (!moment) {
        return { ok: false, reason: 'That moment no longer exists. Review the queue — nothing was recorded.' };
      }

      /**
       * **The trust boundary.** The Moment, the live brief, the live item and
       * vendor Decisions, the delivery country and the couriers serving it are
       * recomputed from re-read state and compared — nested shapes included.
       */
      const verified = verifyCourierSelection({
        workspaceId,
        moment,
        briefs: state.value.executionBriefs,
        decisions: state.value.decisions,
        couriers: state.value.couriers,
        write,
      });
      if (!verified.ok) return verified;

      if (state.value.decisions.some(d => d.id === decision.id)) {
        return { ok: false, reason: 'That decision has already been recorded.' };
      }
      if (state.value.events.some(e => e.id === event.id)) {
        return { ok: false, reason: 'That event has already been recorded.' };
      }

      // One transaction, over a proposed state validated in full (ADR-006).
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
  VendorSelectionWrite,
  CourierSelectionWrite,
  Vendor,
  VendorOffer,
  Courier,
};
