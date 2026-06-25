const steps = [
  {
    number: "1",
    word: "Understand",
    title: "We learn your organization",
    body: "We map your relationship groups, the moments that matter to them, and the countries where they are located.",
  },
  {
    number: "2",
    word: "Prepare",
    title: "We build your relationship calendar",
    body: "We identify upcoming moments, source trusted local partners, and prepare fulfillment across every country.",
  },
  {
    number: "3",
    word: "Execute",
    title: "We coordinate every moment",
    body: "From sourcing to delivery, we manage the process so nothing is missed and every moment lands with impact.",
  },
  {
    number: "4",
    word: "Learn",
    title: "We feed your relationship intelligence",
    body: "Every completed moment becomes part of your organization's relationship history — a growing asset over time.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink text-center mb-4">
          How Aniy&eacute; Works
        </h2>
        <p className="font-body text-stone text-lg text-center mb-12 max-w-2xl mx-auto">
          A repeatable system for organizations that want to show up for every important moment.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-5">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-gold flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="font-display font-bold text-lg text-gold">
                  {step.number}
                </span>
              </div>
              <div>
                <p className="font-body text-xs font-semibold text-gold uppercase tracking-widest mb-1">
                  {step.word}
                </p>
                <h3 className="font-display font-semibold text-xl text-ink mb-2">
                  {step.title}
                </h3>
                <p className="font-body text-stone leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <a
            href="/assessment"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-lg px-10 py-5 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 w-full sm:w-auto"
          >
            See How It Works For Your Team
          </a>
        </div>
      </div>
    </section>
  );
}
