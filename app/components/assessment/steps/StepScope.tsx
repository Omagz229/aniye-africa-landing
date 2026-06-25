import type { AssessmentData } from "@/lib/assessment";
import { WHO_OPTIONS, MOMENT_OPTIONS, PROCESS_OPTIONS, CHALLENGE_OPTIONS } from "@/lib/assessment";

interface Props {
  data: AssessmentData;
  update: (partial: Partial<AssessmentData>) => void;
  onNext: () => void;
  onBack: () => void;
}

function MultiSelect({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => toggle(opt)}
          className={`rounded-full border px-4 py-2 font-body text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 ${selected.includes(opt) ? "border-gold bg-gold text-ink font-semibold" : "border-stone/30 text-ink hover:border-stone/60"}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";

export default function StepScope({ data, update, onNext, onBack }: Props) {
  const valid = data.whoRecognize.length > 0 && data.whatMoments.length > 0 && data.currentProcess;
  return (
    <div className="space-y-8">
      <div>
        <p className="font-body text-sm font-medium text-ink mb-3">Who do you recognize? <span className="text-gold">*</span></p>
        <MultiSelect options={WHO_OPTIONS} selected={data.whoRecognize} onChange={(v) => update({ whoRecognize: v })} />
      </div>
      <div>
        <p className="font-body text-sm font-medium text-ink mb-3">What moments matter? <span className="text-gold">*</span></p>
        <MultiSelect options={MOMENT_OPTIONS} selected={data.whatMoments} onChange={(v) => update({ whatMoments: v })} />
      </div>
      <div>
        <p className="font-body text-sm font-medium text-ink mb-3">How do you manage this today? <span className="text-gold">*</span></p>
        <div className="space-y-2">
          {PROCESS_OPTIONS.map((opt) => (
            <label key={opt} className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${data.currentProcess === opt ? "border-gold bg-gold/10" : "border-stone/30 hover:border-stone/60"}`}>
              <input type="radio" name="currentProcess" value={opt} checked={data.currentProcess === opt} onChange={() => update({ currentProcess: opt })} className="accent-gold" />
              <span className="font-body text-sm text-ink">{opt}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="annualMoments">
          Approximate annual moments <span className="font-normal text-stone/60">(optional)</span>
        </label>
        <input id="annualMoments" type="number" min="0" value={data.annualMoments} onChange={(e) => update({ annualMoments: e.target.value })} placeholder="120" className={inputCls} />
      </div>
      <div>
        <label className="block font-body text-sm font-medium text-ink mb-1.5" htmlFor="recipientCountries">
          Countries where recipients are located <span className="font-normal text-stone/60">(optional)</span>
        </label>
        <input id="recipientCountries" type="text" value={data.recipientCountries} onChange={(e) => update({ recipientCountries: e.target.value })} placeholder="Nigeria, Kenya, South Africa" className={inputCls} />
      </div>
      <div>
        <p className="font-body text-sm font-medium text-ink mb-1.5">
          What is your biggest challenge in recognizing the people who matter?{" "}
          <span className="font-normal text-stone/60">(optional)</span>
        </p>
        <MultiSelect options={CHALLENGE_OPTIONS} selected={data.biggestChallenges} onChange={(v) => update({ biggestChallenges: v })} />
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="flex-1 rounded-full border border-stone/30 text-ink font-semibold text-base px-8 py-4 transition-all hover:border-stone/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2">Back</button>
        <button onClick={onNext} disabled={!valid} className="flex-[2] rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed">Continue</button>
      </div>
    </div>
  );
}
