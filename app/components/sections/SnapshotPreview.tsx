export default function SnapshotPreview() {
  return (
    <section className="bg-ink py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display font-semibold text-3xl sm:text-4xl text-cream leading-tight mb-6">
              Your Relationship Snapshot
            </h2>
            <p className="font-body text-stone text-lg leading-relaxed mb-6">
              Complete the assessment and receive your organization&apos;s
              Relationship Snapshot — an executive summary of your relationship
              landscape, maturity level, and 90-day action plan.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Executive insight based on your organization",
                "Relationship maturity level (1 of 4)",
                "People, countries, and moments mapped",
                "Personalized 90-day action plan",
                "Recommended first relationship program",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 font-body text-stone text-sm">
                  <span className="text-gold font-bold mt-0.5 flex-shrink-0" aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="/assessment"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 w-full sm:w-auto"
            >
              Start Your Assessment
            </a>
          </div>

          {/* Preview card */}
          <div className="bg-cream rounded-2xl p-6 border border-stone/20">
            <div className="mb-4 pb-4 border-b border-stone/20">
              <p className="font-body text-xs text-stone uppercase tracking-widest mb-1">
                Relationship Snapshot
              </p>
              <p className="font-display font-semibold text-xl text-ink">
                Acme Corporation
              </p>
              <p className="font-body text-sm text-stone">Financial Services · 201–1,000 employees</p>
            </div>

            <div className="space-y-2 mb-4 pb-4 border-b border-stone/20 text-sm font-body">
              <div className="flex justify-between">
                <span className="text-stone">People who matter</span>
                <span className="text-ink font-medium">Employees, Clients, Partners</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone">Countries</span>
                <span className="text-ink font-medium">4 countries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone">Annual moments</span>
                <span className="text-ink font-medium">~120</span>
              </div>
            </div>

            <div className="mb-4 pb-4 border-b border-stone/20">
              <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">
                Relationship Maturity
              </p>
              <p className="font-display font-semibold text-ink mb-1">
                Level 2 of 4 — Developing
              </p>
              <div className="h-2 bg-stone/20 rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full" style={{ width: "45%" }} />
              </div>
            </div>

            <div>
              <p className="font-body text-xs text-stone uppercase tracking-widest mb-2">
                90-Day Action Plan
              </p>
              <p className="font-body text-sm text-ink">
                Start with employee birthday recognition across Nigeria and Ghana...
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
