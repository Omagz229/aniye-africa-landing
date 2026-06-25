import Image from "next/image";
import type { AssessmentData } from "@/lib/assessment";
import { computeScore, getMaturityLevel, generateExecutiveInsight, generate90DayPlan } from "@/lib/scoring";
import { WHATSAPP_ASSESSMENT_URL } from "@/lib/constants";

interface Props { data: AssessmentData; encoded?: string; }

function parseCountries(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

export default function RelationshipSnapshot({ data, encoded }: Props) {
  const score = computeScore(data);
  const maturity = getMaturityLevel(score);
  const insight = generateExecutiveInsight(data);
  const plan = generate90DayPlan(data);
  const opCountries = parseCountries(data.operatingCountries);
  const rcpCountries = parseCountries(data.recipientCountries);
  const allCountries = [...new Set([...opCountries, ...rcpCountries])];
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">

      {/* Header */}
      <div className="text-center pb-8 border-b border-stone/20">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">Relationship Snapshot</p>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-2">
          {data.companyName || "Your Organization"}
        </h1>
        {data.industry && (
          <p className="font-body text-stone">{data.industry}{data.employeeCount ? ` · ${data.employeeCount} employees` : ""}</p>
        )}
        <p className="font-body text-xs text-stone/60 mt-3">Prepared by Aniy&eacute; Africa · {today}</p>
      </div>

      {/* Executive Insight */}
      <div className="bg-ink rounded-2xl p-8">
        <p className="font-body text-xs text-gold uppercase tracking-widest mb-4">Executive Insight</p>
        <p className="font-display font-medium text-cream text-lg sm:text-xl leading-relaxed">{insight}</p>
      </div>

      {/* Executive Summary */}
      <div className="bg-white rounded-2xl border border-stone/20 p-8">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-6">Overview</p>
        <div className="divide-y divide-stone/10">
          {[
            { label: "People who matter", value: data.whoRecognize.join(", ") || "—" },
            { label: "Countries represented", value: allCountries.length > 0 ? `${allCountries.length} — ${allCountries.join(", ")}` : "—" },
            { label: "Relationship groups", value: data.whoRecognize.length > 0 ? `${data.whoRecognize.length} identified` : "—" },
            { label: "Key moment types", value: data.whatMoments.slice(0, 3).join(", ") || "—" },
            { label: "Estimated annual moments", value: data.annualMoments ? `~${data.annualMoments}` : "Not specified" },
            { label: "Current process", value: data.currentProcess || "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 py-3">
              <span className="font-body text-sm text-stone">{label}</span>
              <span className="font-body text-sm text-ink font-medium text-right max-w-[55%]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Maturity Model */}
      <div className="bg-cream rounded-2xl border border-stone/20 p-8">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-4">Relationship Maturity</p>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="font-display font-bold text-3xl text-ink">Level {maturity.level}</span>
          <span className="font-body text-stone text-sm">of 4</span>
          <span className="font-display font-semibold text-xl text-gold">{maturity.label}</span>
        </div>
        <div className="h-2 bg-stone/20 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-gold rounded-full" style={{ width: `${(maturity.level / 4) * 100}%` }} />
        </div>
        <p className="font-body text-stone leading-relaxed">{maturity.description}</p>
      </div>

      {/* What We Found */}
      <div>
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-6">What We Found</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Relationship Groups", value: `${data.whoRecognize.length}` },
            { label: "Moment Types", value: `${data.whatMoments.length}` },
            { label: "Countries", value: allCountries.length > 0 ? `${allCountries.length}` : "—" },
            { label: "Process Maturity", value: maturity.label },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-stone/20 p-5">
              <p className="font-display font-bold text-3xl text-ink mb-1">{value}</p>
              <p className="font-body text-sm text-stone">{label}</p>
            </div>
          ))}
        </div>
        {data.biggestChallenges.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl border border-stone/20 p-5">
            <p className="font-body text-sm text-stone mb-2">Primary Challenges</p>
            <div className="flex flex-wrap gap-2">
              {data.biggestChallenges.map((c) => (
                <span key={c} className="font-body text-xs text-ink border border-stone/30 rounded-full px-3 py-1">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 90-Day Action Plan */}
      <div className="bg-white rounded-2xl border border-stone/20 p-8">
        <p className="font-body text-xs text-stone uppercase tracking-widest mb-6">90-Day Action Plan</p>
        <div className="space-y-6">
          <div>
            <p className="font-body text-sm font-semibold text-ink mb-3">Immediate Priorities</p>
            <ul className="space-y-2">
              {plan.immediatePriorities.map((item) => (
                <li key={item} className="flex items-start gap-2 font-body text-sm text-stone">
                  <span className="text-gold font-bold mt-0.5 flex-shrink-0">→</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-body text-sm font-semibold text-ink mb-2">Suggested First Relationship Program</p>
            <p className="font-body text-sm text-stone">{plan.firstProgram}</p>
          </div>
          {plan.priorityCountries.length > 0 && (
            <div>
              <p className="font-body text-sm font-semibold text-ink mb-2">Priority Countries</p>
              <div className="flex flex-wrap gap-2">
                {plan.priorityCountries.map((c) => (
                  <span key={c} className="font-body text-xs font-medium text-ink bg-cream border border-stone/20 rounded-full px-3 py-1">{c}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="font-body text-sm font-semibold text-ink mb-2">Operational Improvements</p>
            <ul className="space-y-2">
              {plan.operationalImprovements.map((item) => (
                <li key={item} className="flex items-start gap-2 font-body text-sm text-stone">
                  <span className="text-gold font-bold mt-0.5 flex-shrink-0">→</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="relative bg-cream rounded-2xl border border-stone/20 p-8 text-center overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
          <Image src="/brand-assets/03_Monogram/PNG/aniye-monogram-gold.png" alt="" width={300} height={300} className="opacity-[0.06] w-48 h-48" />
        </div>
        <div className="relative z-10">
          <h2 className="font-display font-semibold text-2xl sm:text-3xl text-ink mb-3">
            Let&apos;s Build Your First Relationship Program
          </h2>
          <p className="font-body text-stone mb-6 max-w-md mx-auto">
            Your Relationship Snapshot is the starting point. Set up your workspace to turn insight into execution.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {encoded ? (
              <a href={`/verify?d=${encoded}`}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
                Set Up Your Workspace
              </a>
            ) : (
              <a href="/assessment"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
                Start Your Assessment
              </a>
            )}
            <a href={WHATSAPP_ASSESSMENT_URL} target="_blank" rel="noopener noreferrer"
              className="font-body font-medium text-ink underline underline-offset-4 hover:text-gold transition-colors text-sm">
              Schedule a Consultation
            </a>
          </div>
          <p className="font-body text-xs text-stone/50 mt-6">
            This Snapshot is Version 0 of {data.companyName ? `${data.companyName}&apos;s` : "your organization&apos;s"} Relationship Profile.
          </p>
        </div>
      </div>

    </div>
  );
}
