import type { AssessmentData } from "@/lib/assessment";

interface Props {
  data: AssessmentData;
  update: (partial: Partial<AssessmentData>) => void;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-stone/10 last:border-0">
      <span className="font-body text-sm text-stone">{label}</span>
      <span className="font-body text-sm text-ink font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export default function StepReview({ data, onBack, onSubmit }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-stone/20 p-6">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">Organization</p>
        <ReviewRow label="Company" value={data.companyName} />
        <ReviewRow label="Industry" value={data.industry} />
        <ReviewRow label="Employees" value={data.employeeCount} />
        <ReviewRow label="Operating in" value={data.operatingCountries} />
      </div>
      <div className="bg-white rounded-2xl border border-stone/20 p-6">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">Contact</p>
        <ReviewRow label="Name" value={data.contactName} />
        <ReviewRow label="Role" value={data.role} />
        <ReviewRow label="Email" value={data.email} />
        <ReviewRow label="Phone" value={data.phone} />
      </div>
      <div className="bg-white rounded-2xl border border-stone/20 p-6">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-3">Relationships</p>
        <ReviewRow label="Who you recognize" value={data.whoRecognize.join(", ")} />
        <ReviewRow label="Key moments" value={data.whatMoments.join(", ")} />
        <ReviewRow label="Current process" value={data.currentProcess} />
        <ReviewRow label="Annual moments" value={data.annualMoments} />
        <ReviewRow label="Recipient countries" value={data.recipientCountries} />
        <ReviewRow label="Biggest challenges" value={data.biggestChallenges.join(", ")} />
      </div>
      <p className="font-body text-sm text-stone text-center">
        Your Relationship Snapshot will be ready immediately after submission.
      </p>
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="flex-1 rounded-full border border-stone/30 text-ink font-semibold text-base px-8 py-4 transition-all hover:border-stone/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2">Back</button>
        <button onClick={onSubmit} className="flex-[2] rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">Complete Your Assessment</button>
      </div>
    </div>
  );
}
