/**
 * Assessment draft persistence — EX-H1.
 *
 * The assessment is fifteen fields across four steps, and it was the only long
 * form in the product held purely in `useState`: a refresh, a back button or a
 * closed tab lost everything. It is also the *first* thing a stranger fills in,
 * which made it the worst place in the product to lose work.
 *
 * Deliberately its own key and its own module, matching `aniye_person_draft`:
 * an unfinished assessment is not a submission, and nothing here is ever read
 * as one. `aniye_last_submission` remains the record of what was actually sent.
 *
 * **Read through `useSyncExternalStore`**, not an effect and not a lazy
 * `useState` initializer. The server has no `localStorage`, so a lazy
 * initializer would render nothing on the server and a resume prompt on the
 * client — a hydration mismatch. `getServerSnapshot` returns `null` so both
 * renders agree, and React swaps in the client value after hydration.
 */

import type { AssessmentData } from './assessment';
import { EMPTY_ASSESSMENT } from './assessment';

export const ASSESSMENT_DRAFT_KEY = 'aniye_assessment_draft';

/**
 * Same-window writes do not fire `storage` — that event only reaches *other*
 * tabs. This is how a save or a clear tells its own window to re-read.
 */
const CHANGE_EVENT = 'aniye:assessment-draft';

export interface AssessmentDraft {
  data: AssessmentData;
  step: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export function subscribeAssessmentDraft(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * The **raw string**, deliberately.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`. Strings compare
 * by value, so an unchanged draft returns an equal snapshot and React does not
 * re-render. Returning a freshly parsed object here would produce a new
 * reference on every call and loop forever.
 */
export function getAssessmentDraftSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ASSESSMENT_DRAFT_KEY);
  } catch {
    return null;
  }
}

/** Server and first client render agree: no draft. */
export function getAssessmentDraftServerSnapshot(): string | null {
  return null;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Has the visitor actually typed anything?
 *
 * Autosaving an untouched form would offer every passer-by a resume prompt on
 * their next visit, which is noise rather than help.
 */
export function isAssessmentStarted(data: AssessmentData): boolean {
  return Object.values(data).some(value =>
    Array.isArray(value) ? value.length > 0 : String(value ?? '').trim().length > 0,
  );
}

/**
 * Turn a raw snapshot into a resumable draft, or `null`.
 *
 * Merged onto `EMPTY_ASSESSMENT` so a draft written by an older build, missing
 * fields this one expects, still resumes instead of crashing the form. The step
 * is clamped rather than trusted — an index outside the wizard renders nothing.
 */
export function parseAssessmentDraft(raw: string | null): AssessmentDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AssessmentDraft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;

    const data: AssessmentData = { ...EMPTY_ASSESSMENT, ...parsed.data };
    if (!isAssessmentStarted(data)) return null;

    const rawStep = typeof parsed.step === 'number' ? parsed.step : 0;
    const step = Math.min(Math.max(Math.trunc(rawStep), 0), 3);

    return { data, step };
  } catch {
    return null;
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

function announce(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function writeAssessmentDraft(data: AssessmentData, step: number): void {
  if (typeof window === 'undefined') return;
  const next = JSON.stringify({ data, step });
  try {
    // Skip no-op writes so the subscription does not fire on every keystroke
    // that changed nothing.
    if (window.localStorage.getItem(ASSESSMENT_DRAFT_KEY) === next) return;
    window.localStorage.setItem(ASSESSMENT_DRAFT_KEY, next);
    announce();
  } catch {
    // Storage full or unavailable — autosave is a convenience, not a contract.
  }
}

export function clearAssessmentDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(ASSESSMENT_DRAFT_KEY) === null) return;
    window.localStorage.removeItem(ASSESSMENT_DRAFT_KEY);
    announce();
  } catch {
    // Nothing to do — a stale draft is offered back, never forced.
  }
}
