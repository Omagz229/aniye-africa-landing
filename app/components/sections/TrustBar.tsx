const items = [
  "Pay in your local currency",
  "Trusted local partners",
  "Delivery updates included",
  "WhatsApp-first experience",
];

export default function TrustBar() {
  return (
    <section
      className="bg-cream border-y border-stone/20 py-8"
      aria-label="Service highlights"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm font-body text-ink"
            >
              <span
                className="text-gold font-bold mt-0.5 flex-shrink-0"
                aria-hidden="true"
              >
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
