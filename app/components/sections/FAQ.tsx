const faqs = [
  {
    q: "What kinds of gifts can I send?",
    a: "We can help source cakes, flowers, gift baskets, food packages, celebration gifts, baby gifts, and more depending on location.",
  },
  {
    q: "Do I need an app?",
    a: "No. Everything happens through WhatsApp.",
  },
  {
    q: "Can you help me choose a gift?",
    a: "Yes. Tell us the occasion, recipient, and budget and we'll recommend suitable options.",
  },
  {
    q: "What currency do I pay in?",
    a: "You pay using the currency available to you. We'll guide you through the payment process during your order.",
  },
  {
    q: "How long does delivery take?",
    a: "Delivery timelines depend on destination and gift type. We'll confirm timing before payment.",
  },
  {
    q: "Which countries do you serve?",
    a: "Availability depends on our current partner network. Contact us and we'll confirm service availability for your destination.",
  },
];

export default function FAQ() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8">
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
