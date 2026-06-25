import Image from "next/image";
import { WHATSAPP_ASSESSMENT_URL } from "@/lib/constants";

export default function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-cream px-4 sm:px-6 lg:px-8 py-24">
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
          Never miss the moments that matter.
        </h1>

        <p className="font-body text-stone text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
          Aniy&eacute; helps organizations recognize employees, clients, and
          partners across Africa through thoughtful relationship programs and
          concierge fulfillment.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/assessment"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-lg px-10 py-5 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Start Relationship Assessment
          </a>
          <a
            href={WHATSAPP_ASSESSMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body font-medium text-ink underline underline-offset-4 hover:text-gold transition-colors text-base"
          >
            Talk to Aniy&eacute;
          </a>
        </div>
      </div>
    </section>
  );
}
