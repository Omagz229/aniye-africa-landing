import { WHATSAPP_URL } from "@/lib/constants";

const gifts = [
  { emoji: "🎂", label: "Cakes & Celebration Treats" },
  { emoji: "🌹", label: "Flowers & Bouquets" },
  { emoji: "🎁", label: "Gift Baskets" },
  { emoji: "🍫", label: "Treat & Snack Boxes" },
  { emoji: "👶", label: "New Baby Gifts" },
  { emoji: "🎓", label: "Graduation Gifts" },
  { emoji: "❤️", label: "Anniversary Gifts" },
  { emoji: "🙏", label: "Appreciation Gifts" },
];

export default function GiftTypes() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-3">
            We Help You Celebrate Every Occasion
          </h2>
          <p className="font-body text-stone text-lg">
            Whatever the occasion, we&apos;ll help you find something
            meaningful.
          </p>
        </div>

        <ul
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10"
          aria-label="Gift types we can source"
        >
          {gifts.map((gift) => (
            <li
              key={gift.label}
              className="flex flex-col items-center text-center gap-2 bg-white rounded-2xl py-6 px-3 border border-stone/15"
            >
              <span className="text-4xl" aria-hidden="true">
                {gift.emoji}
              </span>
              <span className="font-body text-sm text-ink font-medium leading-snug">
                {gift.label}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-center font-body text-stone">
          Don&apos;t see what you&apos;re looking for?{" "}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink font-semibold underline underline-offset-2 hover:text-gold transition-colors"
          >
            Ask us.
          </a>{" "}
          We&apos;ll do our best to source it.
        </p>
      </div>
    </section>
  );
}
