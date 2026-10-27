/**
 * The last completed assessment, held on this device only — PRIV-001.
 *
 * `/report` and `/verify` used to receive the whole assessment, contact details
 * included, base64-encoded in a `?d=` query string. That put personal data in
 * request lines, browser history and any copied link. Both pages now read this
 * local record instead, and no URL carries assessment data.
 *
 * **This is containment, not intake.** The record lives in the visitor's own
 * `localStorage`. Nothing is sent to Aniyé, and nothing here is secure or
 * durable persistence. Secure intake is a separate, unbuilt decision.
 *
 * Read through `useSyncExternalStore`, as `assessment-draft.ts` does. The server
 * snapshot is `undefined` — *not yet known* — so a page can tell "still
 * hydrating" apart from "no record on this device" (`null`).
 */

import type { AssessmentData } from './assessment';
import { EMPTY_ASSESSMENT } from './assessment';

export const LAST_SUBMISSION_KEY = 'aniye_last_submission';

/** The `?d=` parameter older builds wrote. Its value is never read. */
export const LEGACY_PAYLOAD_PARAM = 'd';

const CHANGE_EVENT = 'aniye:last-submission';

// ─── Store ───────────────────────────────────────────────────────────────────

export function subscribeLastSubmission(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The raw string, so `Object.is` snapshot comparison stays stable. */
export function getLastSubmissionSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_SUBMISSION_KEY);
  } catch {
    return null;
  }
}

/** Not yet known on the server or during hydration. */
export function getLastSubmissionServerSnapshot(): undefined {
  return undefined;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Turn a raw record into assessment answers, or `null`.
 *
 * Merged onto `EMPTY_ASSESSMENT` so a record from an older build still renders.
 * The stored `submittedAt` is dropped: it is bookkeeping, not an answer.
 */
export function parseLastSubmission(raw: string | null | undefined): AssessmentData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AssessmentData> & { submittedAt?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const data: AssessmentData = { ...EMPTY_ASSESSMENT };
    for (const key of Object.keys(EMPTY_ASSESSMENT) as (keyof AssessmentData)[]) {
      if (key in parsed) (data as unknown as Record<string, unknown>)[key] = parsed[key];
    }
    return data;
  } catch {
    return null;
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export function writeLastSubmission(data: AssessmentData, submittedAt: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SUBMISSION_KEY, JSON.stringify({ ...data, submittedAt }));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // localStorage unavailable in some environments
  }
}

// ─── Legacy links ────────────────────────────────────────────────────────────

/**
 * Remove a legacy `?d=` payload from the address bar, **without reading it**.
 *
 * Only the parameter's presence is tested; its value is never decoded, parsed
 * or stored. This hides the payload from the visible URL and from further
 * history entries. It cannot recall the original request, which already reached
 * the server, and it does not erase browser history or any log.
 */
export function stripLegacyPayloadFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(LEGACY_PAYLOAD_PARAM)) return;
  url.searchParams.delete(LEGACY_PAYLOAD_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
