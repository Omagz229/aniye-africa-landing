import type { AssessmentData } from "@/lib/assessment";
import { ROLES } from "@/lib/assessment";

interface Props {
  data: AssessmentData;
  update: (partial: Partial<AssessmentData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const inputCls = "w-full rounded-xl border border-stone/30 bg-white px-4 py-3 font-body text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";
const labelCls = "block font-body text-sm font-medium text-ink mb-1.5";
const backBtn = "flex-1 rounded-full border border-stone/30 text-ink font-semibold text-base px-8 py-4 transition-all hover:border-stone/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone focus-visible:ring-offset-2";
const nextBtn = "flex-[2] rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";

export default function StepContact({ data, update, onNext, onBack }: Props) {
  const valid = data.contactName.trim() && data.role && data.email.trim();
  return (
    <div className="space-y-6">
      <div>
        <label className={labelCls} htmlFor="contactName">Your name <span className="text-gold">*</span></label>
        <input id="contactName" type="text" value={data.contactName} onChange={(e) => update({ contactName: e.target.value })} placeholder="Amara Osei" className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="role">Your role <span className="text-gold">*</span></label>
        <select id="role" value={data.role} onChange={(e) => update({ role: e.target.value })} className={inputCls}>
          <option value="">Select your role</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="email">Email address <span className="text-gold">*</span></label>
        <input id="email" type="email" value={data.email} onChange={(e) => update({ email: e.target.value })} placeholder="amara@acmecorp.com" className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="phone">Phone / WhatsApp <span className="font-normal text-stone/60">(optional)</span></label>
        <input id="phone" type="tel" value={data.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+234 800 000 0000" className={inputCls} />
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className={backBtn}>Back</button>
        <button onClick={onNext} disabled={!valid} className={nextBtn}>Continue</button>
      </div>
    </div>
  );
}
