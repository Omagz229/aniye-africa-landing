# ADR-010 — Operational records live outside WorkspaceState

**Status: Accepted**
**Date drafted:** 2026-07-27
**Date accepted:** 2026-07-27 — Council
**Implemented in:** H3.1 (OperationsState v1)

> ⚠️ **The local adapter accepted here is an internal prototype only. It is not production-safe.**
> See the mandatory gates below before any external exposure.

## Context

Through H2.6 every canonical object lived in one `WorkspaceState` document in `localStorage`. That worked because everything in it was *configuration* — a description of how an organization wants to recognize people, edited by one administrator on one device.

H3.1 introduces a different kind of record. Moments, Decisions and Operational Events are not configuration; they are an **operational history**. They accumulate rather than being edited, they are written by Aniyé operators rather than by the customer, and they will eventually be written by vendors and couriers too. Putting them in the customer's configuration document would be wrong on four counts:

1. **Ownership.** The customer owns their configuration. They do not own — and must not be able to edit — the record of what Aniyé did.
2. **Growth.** Configuration is bounded by the size of an organization. Operational history grows without limit, and a single `localStorage` document has a hard ceiling.
3. **Access.** ADR-005 already established that Operations is a separate surface with separate roles. Sharing a storage document undermines that boundary before it is built.
4. **Immutability.** ADR-006 requires Events to be append-only and Decisions immutable except for supersession. A document rewritten wholesale on every save cannot offer that guarantee.

## Decision

- **`WorkspaceState` remains customer configuration.** It stays at schema v6 and gains no operational collections.
- **Operational records live in a separate `OperationsState`**, belonging to exactly one `workspaceId`.
- **Access is through a repository interface**, not direct storage calls. The interface exposes named operations — create moments, append a Decision, append an Event — and deliberately offers no generic `save(anything)`.
- **The H3.1 implementation is a `localStorage` adapter behind that interface.** It exists so the operational model can be built and validated before the backend, and so replacing it is an adapter swap rather than a rewrite.

## What the local adapter is not

**It is not production-safe, and must not be described as such.**

| Property | Local adapter | Required for pilot |
|----------|--------------|-------------------|
| Persistence | One browser, one device | Server-side, durable, backed up |
| Authentication | None | Required |
| Authorization | None | Role-based, per ADR-005 |
| Tenancy | One workspace per browser | Enforced isolation across organizations |
| Concurrency | Last write wins | Transactional |
| Audit integrity | Anyone with devtools can rewrite history | Append-only, tamper-evident |
| File storage | None | Secure, access-controlled (proof of delivery) |

## Mandatory gates before external exposure

**All of the following are required before any external pilot:**

1. A **production backend** with server-side persistence.
2. **Authentication** for both customer administrators and internal operators.
3. **Multi-tenancy** with enforced isolation, since operators work across organizations.
4. **Secure file storage**, before proof of delivery exists.

> ✅ **[ADR-015](ADR-015-production-persistence-authentication-and-tenant-isolation.md) (accepted
> 2026-08-18, Accepted · Not implemented) now governs gates 1–3** — an accepted architecture exists
> for production persistence, authentication (both customer administrators and internal operators,
> as a fixed access type with no granular role model — OPS-U1 unresolved), and enforced tenant
> isolation. **All three remain operationally open** until ADR-015 is implemented and validated
> against its own invariants; this table is not satisfied by acceptance alone. **Gate 4, secure file
> storage, is untouched by ADR-015 and remains fully open**, unaffected either way.

**Until Operations uses browser-only persistence, no vendor, courier, recipient or additional internal user may be given access.** Every one of those actors implies a second party reading or writing operational records, and the local adapter has no mechanism to authenticate them, isolate them, or prevent them from rewriting the audit trail. A prototype that one internal operator uses on one machine is defensible; the same prototype shared with a courier is not.

## Consequences

- `lib/operations/` is a separate module tree from the workspace domain.
- `OperationsState` carries its own `schemaVersion`, starting at 1, independent of the workspace schema.
- An operations payload belonging to a different `workspaceId` is **refused, never silently adopted** — a stale payload from another organization must not become the current one.
- Unreadable operational data is preserved rather than overwritten, matching the workspace quarantine behaviour.
- The backend milestone moves earlier in practical terms than the H2→H3 checkpoint anticipated: it is now the gate on Execution Briefs reaching anyone outside Aniyé, not merely a scaling concern.

## Relationship to earlier decisions

Extends **ADR-005** (Workspace and Operations are separate surfaces) from a routing and access boundary to a persistence boundary. Implements the storage half of **ADR-006** (Decisions and Operational Events), which noted that both objects "belong in a backend rather than the client-side workspace document" — this ADR states what to do until that backend exists.
