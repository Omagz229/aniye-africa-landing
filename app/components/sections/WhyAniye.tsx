const features = [
  { icon: "🤝", label: "Trusted Local Partners" },
  { icon: "💳", label: "Local Currency Payments" },
  { icon: "💬", label: "Human Support" },
  { icon: "✉️", label: "One Simple Conversation" },
];

export default function WhyAniye() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink leading-tight mb-6">
              Cross-Border Gifting Without The Complexity
            </h2>
            <p className="font-body text-stone text-lg leading-relaxed">
              Instead of spending hours searching for local vendors, comparing
              options, handling payments, and coordinating delivery in another
              country, simply tell us what you need.
            </p>
            <p className="font-body text-ink font-medium mt-4">
              We&apos;ll take care of the rest.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-3" aria-label="Key features">
            {features.map((f) => (
              <li
                key={f.label}
                className="flex items-center gap-3 rounded-full border border-stone/30 px-5 py-3 font-body text-ink"
              >
                <span aria-hidden="true" className="text-xl">
                  {f.icon}
                </span>
                <span className="font-medium">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
