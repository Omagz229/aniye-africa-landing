"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentData } from "@/lib/assessment";
import { EMPTY_ASSESSMENT } from "@/lib/assessment";
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

  function update(partial: Partial<AssessmentData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function next() { setStep((s) => Math.min(s + 1, 3)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  function submit() {
    console.log("[Aniyé Assessment Submission]", data);
    try {
      localStorage.setItem(
        "aniye_last_submission",
        JSON.stringify({ ...data, submittedAt: new Date().toISOString() })
      );
    } catch {
      // localStorage unavailable in some environments
    }
    // TODO: POST to process.env.NEXT_PUBLIC_SUBMISSION_WEBHOOK_URL (Airtable / Sheets / Notion)
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    router.push(`/report?d=${encoded}`);
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
