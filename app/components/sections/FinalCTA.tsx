import Image from "next/image";
import { WHATSAPP_ASSESSMENT_URL } from "@/lib/constants";

export default function FinalCTA() {
  return (
    <section className="relative bg-cream py-20 md:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden border-t border-stone/10">
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
        <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-ink leading-tight mb-6">
          Let&apos;s Build Your First Relationship Program
        </h2>
        <p className="font-body text-stone text-lg leading-relaxed mb-10 max-w-xl mx-auto">
          Start with your Relationship Assessment. We&apos;ll show you where
          your organization stands and exactly what to do next.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/assessment"
            className="inline-flex w-full sm:w-auto sm:min-w-64 items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-lg px-10 py-5 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
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
