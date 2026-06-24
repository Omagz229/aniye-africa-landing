import WhatsAppButton from "../WhatsAppButton";

const countries = [
  { flag: "🇳🇬", name: "Nigeria" },
  { flag: "🇬🇭", name: "Ghana" },
  { flag: "🇰🇪", name: "Kenya" },
  { flag: "🇿🇦", name: "South Africa" },
];

export default function Coverage() {
  return (
    <section className="bg-cream border-t border-stone/10 py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-6">
          We Deliver Across Africa
        </h2>

        <p className="font-body text-stone text-lg leading-relaxed mb-8">
          We operate across an active network of trusted local partners.
        </p>

        <ul
          className="flex flex-wrap justify-center gap-6 mb-8"
          aria-label="Countries we currently serve"
        >
          {countries.map((c) => (
            <li key={c.name} className="flex flex-col items-center gap-1">
              <span className="text-4xl" aria-label={c.name}>
                {c.flag}
              </span>
              <span className="font-body text-sm text-stone">{c.name}</span>
            </li>
          ))}
        </ul>

        <p className="font-body text-stone text-base mb-8 italic">
          Message us to confirm availability for your recipient&apos;s
          destination.
        </p>

        <WhatsAppButton
          label="Check Coverage on WhatsApp"
          size="md"
          className="w-full sm:w-auto"
        />
      </div>
    </section>
  );
}
