const faqs = [
  {
    q: "What is a Relationship Snapshot?",
    a: "It is an executive summary of your organization's relationship landscape — the people you recognize, the moments that matter, your current process maturity, and a practical 90-day action plan. You receive it immediately after completing the assessment.",
  },
  {
    q: "How long does the assessment take?",
    a: "Most organizations complete it in under 5 minutes. There are four short sections covering your organization, your contact details, and your relationship scope.",
  },
  {
    q: "What happens after I submit?",
    a: "Your Relationship Snapshot is generated immediately. It includes a personalized executive insight, your maturity level, and a 90-day action plan. From there, you can schedule a consultation to build your first relationship program.",
  },
  {
    q: "Which countries do you operate in?",
    a: "We support relationship programs across Africa through a network of trusted local partners. Contact us to confirm availability for your specific countries.",
  },
  {
    q: "What does concierge fulfillment mean?",
    a: "Aniyé manages the entire fulfillment process — sourcing, coordination, delivery, and confirmation — so your team never has to manage vendors, track shipments, or chase down confirmation across borders.",
  },
  {
    q: "Do we need to sign a contract to start?",
    a: "No. The assessment and Relationship Snapshot are free. We begin the relationship conversation first. Formal agreements come only when you are ready to launch your first program.",
  },
];

export default function FAQ() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-10">
          Questions
        </h2>

        <dl className="divide-y divide-stone/20">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <dt className="font-body font-semibold text-ink text-base sm:text-lg">
                  {q}
                </dt>
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full border border-stone/40 flex items-center justify-center text-stone group-open:rotate-45 transition-transform duration-200"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <dd className="font-body text-stone leading-relaxed pt-3 pb-1">
                {a}
              </dd>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}
