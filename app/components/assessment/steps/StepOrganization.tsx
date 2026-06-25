import type { AssessmentData } from "@/lib/assessment";
import { INDUSTRIES, EMPLOYEE_COUNTS } from "@/lib/assessment";

interface Props {
  data: AssessmentData;
  update: (partial: Partial<AssessmentData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const inputCls = "w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";
const labelCls = "block font-body text-sm font-medium text-ink mb-1.5";

export default function StepOrganization({ data, update, onNext }: Props) {
  const valid = data.companyName.trim() && data.industry && data.employeeCount && data.operatingCountries.trim();

  return (
    <div className="space-y-6">
      <div>
        <label className={labelCls} htmlFor="companyName">
          Company name <span className="text-gold">*</span>
        </label>
        <input id="companyName" type="text" value={data.companyName} onChange={(e) => update({ companyName: e.target.value })} placeholder="Acme Corporation" className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor="website">
          Website <span className="font-normal text-stone/60">(optional)</span>
        </label>
        <input id="website" type="text" value={data.website} onChange={(e) => update({ website: e.target.value })} placeholder="acmecorp.com" className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor="industry">
          Industry <span className="text-gold">*</span>
        </label>
        <select id="industry" value={data.industry} onChange={(e) => update({ industry: e.target.value })} className={inputCls}>
          <option value="">Select industry</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="employeeCount">
          Number of employees <span className="text-gold">*</span>
        </label>
        <select id="employeeCount" value={data.employeeCount} onChange={(e) => update({ employeeCount: e.target.value })} className={inputCls}>
          <option value="">Select range</option>
          {EMPLOYEE_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="operatingCountries">
          Countries of operation <span className="text-gold">*</span>
        </label>
        <input id="operatingCountries" type="text" value={data.operatingCountries} onChange={(e) => update({ operatingCountries: e.target.value })} placeholder="Nigeria, Ghana, Kenya" className={inputCls} />
        <p className="font-body text-xs text-stone mt-1">Separate multiple countries with commas</p>
      </div>

      <div className="pt-2">
        <button onClick={onNext} disabled={!valid} className="w-full rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed">
          Continue
        </button>
      </div>
    </div>
  );
}
