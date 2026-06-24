import WhatsAppButton from "../WhatsAppButton";

const steps = [
  {
    number: "1",
    title: "Tell Us What You Need",
    body: "Message us on WhatsApp and tell us: who the gift is for, their location, the occasion, and your budget.",
    note: null,
  },
  {
    number: "2",
    title: "We Curate Options",
    body: "We source suitable gift options through trusted local partners and share recommendations with you.",
    note: "Most orders confirmed within hours.",
  },
  {
    number: "3",
    title: "Approve & Pay",
    body: "Choose your preferred option and pay using the currency available to you.",
    note: "Bank transfer, mobile money, or payment link — we'll guide you.",
  },
  {
    number: "4",
    title: "We Deliver",
    body: "We coordinate the delivery and keep you informed until the gift arrives.",
    note: null,
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink text-center mb-12">
          How It Works
        </h2>

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
                <h3 className="font-display font-semibold text-xl text-ink mb-2">
                  {step.title}
                </h3>
                <p className="font-body text-stone leading-relaxed">
                  {step.body}
                </p>
                {step.note && (
                  <p className="font-body text-stone/70 text-sm mt-2 italic">
                    {step.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <WhatsAppButton
            label="Start Your Order on WhatsApp"
            size="lg"
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    </section>
  );
}
