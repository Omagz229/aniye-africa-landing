"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentData } from "@/lib/assessment";
import { EMPTY_ASSESSMENT } from "@/lib/assessment";
import {
  clearAssessmentDraft,
  getAssessmentDraftServerSnapshot,
  getAssessmentDraftSnapshot,
  isAssessmentStarted,
  parseAssessmentDraft,
  subscribeAssessmentDraft,
  writeAssessmentDraft,
} from "@/lib/assessment-draft";
import StepOrganization from "./steps/StepOrganization";
import StepContact from "./steps/StepContact";
import StepScope from "./steps/StepScope";
import StepReview from "./steps/StepReview";

const STEP_LABELS = [
  "Tell us about your organization",
  "Who should we work with?",
  "Help us understand your relationships",
  "You're almost there",
];

export default function AssessmentWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<AssessmentData>(EMPTY_ASSESSMENT);
  /**
   * EX-H1 — the longest unsaved form in the product was also the first thing a
   * stranger fills in. Fifteen fields across four steps lived only in `useState`,
   * so a refresh, a back button or a closed tab lost all of it.
   *
   * Read through `useSyncExternalStore`: the server has no draft, so the server
   * snapshot is `null` and the first client render matches it exactly. No
   * effect, no lazy initializer, no hydration mismatch.
   */
  const rawDraft = useSyncExternalStore(
    subscribeAssessmentDraft,
    getAssessmentDraftSnapshot,
    getAssessmentDraftServerSnapshot,
  );
  const storedDraft = useMemo(() => parseAssessmentDraft(rawDraft), [rawDraft]);

  // Offered back rather than silently restored — a surprise prefill is worse
  // than a restart. Dismissed once the visitor answers either way.
  const [dismissedResume, setDismissedResume] = useState(false);

  /**
   * Has *this* session touched the wizard?
   *
   * Without this the prompt reappeared mid-typing: the first keystroke
   * autosaves, the store notifies, `useSyncExternalStore` returns the new
   * draft, and the resume prompt replaced the wizard the visitor was actively
   * filling in. A draft is only worth offering back if it was already there
   * when they arrived.
   *
   * Set from event handlers rather than derived from `data`, so clearing every
   * field again does not resurrect the prompt, and monotonic so it can never
   * flip back.
   */
  const [touched, setTouched] = useState(false);

  const resumed = dismissedResume || touched ? null : storedDraft;

  // Autosave every change once anything has actually been typed. Suspended
  // while a resume prompt is showing, so declining it cannot be overwritten
  // before the visitor has chosen.
  useEffect(() => {
    if (resumed) return;
    if (!isAssessmentStarted(data)) return;
    writeAssessmentDraft(data, step);
  }, [data, step, resumed]);

  function update(partial: Partial<AssessmentData>) {
    setTouched(true);
    setData((prev) => ({ ...prev, ...partial }));
  }

  function next() { setTouched(true); setStep((s) => Math.min(s + 1, 3)); }
  function back() { setTouched(true); setStep((s) => Math.max(s - 1, 0)); }

  function submit() {
    try {
      localStorage.setItem(
        "aniye_last_submission",
        JSON.stringify({ ...data, submittedAt: new Date().toISOString() })
      );
    } catch {
      // localStorage unavailable in some environments
    }
    // The draft has served its purpose once the answers are submitted.
    clearAssessmentDraft();
    // TODO: POST to process.env.NEXT_PUBLIC_SUBMISSION_WEBHOOK_URL (Airtable / Sheets / Notion)
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    router.push(`/report?d=${encoded}`);
  }

  // ─── Resume prompt ─────────────────────────────────────────────────────────

  if (resumed) {
    return (
      <div className="space-y-6">
        <div>
          <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">Assessment</p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-2">
            Pick up where you left off?
          </h2>
          <p className="font-body text-stone">
            You started this assessment
            {resumed.data.companyName ? (
              <> for <span className="font-semibold text-ink">{resumed.data.companyName}</span></>
            ) : null}{" "}
            and didn&apos;t finish. Nothing has been sent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { setData(resumed.data); setStep(resumed.step); setDismissedResume(true); }}
            className="rounded-full bg-gold text-ink font-semibold text-sm px-6 py-3 hover:brightness-105 hover:shadow-md transition-all"
          >
            Continue &#8594;
          </button>
          <button
            type="button"
            onClick={() => { clearAssessmentDraft(); setData(EMPTY_ASSESSMENT); setStep(0); setDismissedResume(true); }}
            className="font-body text-sm text-stone hover:text-ink transition-colors inline-flex items-center min-h-[44px] py-2"
          >
            Start fresh
          </button>
        </div>
      </div>
    );
  }

  const stepProps = { data, update, onNext: next, onBack: back };

  return (
    <div>
      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <p className="font-body text-sm font-medium text-stone">
            Step {step + 1} of {STEP_LABELS.length}
          </p>
          <p className="font-body text-sm text-stone/70">
            {STEP_LABELS.length - step - 1 > 0
              ? `${STEP_LABELS.length - step - 1} step${STEP_LABELS.length - step - 1 > 1 ? "s" : ""} remaining`
              : "Final step"}
          </p>
        </div>
        <div className="h-1.5 bg-stone/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
          />
        </div>
        <p className="font-display font-semibold text-xl text-ink mt-4">
          {STEP_LABELS[step]}
        </p>
      </div>

      {step === 0 && <StepOrganization {...stepProps} />}
      {step === 1 && <StepContact {...stepProps} />}
      {step === 2 && <StepScope {...stepProps} />}
      {step === 3 && <StepReview {...stepProps} onSubmit={submit} />}
    </div>
  );
}
