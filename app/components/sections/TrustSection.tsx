const items = [
  "Delivery coordination",
  "Delivery updates",
  "Delivery confirmation",
  "Recipient confirmation",
  "Human support",
];

export default function TrustSection() {
  return (
    <section className="bg-white py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink text-center mb-10">
          Every Order Includes
        </h2>

        <ul className="space-y-4 mb-10" aria-label="What every order includes">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center gap-3 text-ink font-body text-lg"
            >
              <span
                className="text-gold font-bold text-xl flex-shrink-0"
                aria-hidden="true"
              >
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>

        <p className="font-body text-stone text-lg leading-relaxed text-center italic">
          We know that sending a gift across borders requires trust. That&apos;s
          why we stay involved from the moment you place your order until the
          moment it arrives.
        </p>
      </div>
    </section>
  );
}
