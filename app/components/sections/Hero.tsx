import Image from "next/image";
import WhatsAppButton from "../WhatsAppButton";

const trustChips = [
  "Pay in your local currency",
  "Trusted local partners",
  "Delivery updates included",
  "WhatsApp-first experience",
];

export default function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-cream px-4 sm:px-6 lg:px-8 py-24">
      {/* Monogram watermark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden="true"
      >
        <Image
          src="/brand-assets/03_Monogram/PNG/aniye-monogram-gold.png"
          alt=""
          width={400}
          height={400}
          className="opacity-[0.06] w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96"
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-ink leading-tight tracking-tight mb-6">
          Stay Present Across Africa.
        </h1>

        <p className="font-body text-stone text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-3">
          Send thoughtful gifts to the people who matter most, wherever they are
          in Africa. Pay in your local currency and let Aniy&eacute; Africa
          handle the sourcing, coordination, and delivery through trusted local
          partners.
        </p>

        <p className="font-body text-stone/80 text-sm mb-8">
          Not sure if we cover your location?{" "}
          <a
            href="https://wa.me/2348074827676"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline underline-offset-2 hover:text-gold transition-colors"
          >
            Message us
          </a>{" "}
          — we&apos;ll confirm in minutes.
        </p>

        <div className="flex flex-col items-center gap-6">
          <WhatsAppButton
            label="Send a Gift on WhatsApp"
            size="lg"
            className="w-full sm:w-auto"
          />

          <ul
            className="flex flex-wrap justify-center gap-x-6 gap-y-2"
            aria-label="Service guarantees"
          >
            {trustChips.map((chip) => (
              <li
                key={chip}
                className="flex items-center gap-1.5 text-stone text-sm font-body"
              >
                <span className="text-gold font-semibold" aria-hidden="true">
                  ✓
                </span>
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
