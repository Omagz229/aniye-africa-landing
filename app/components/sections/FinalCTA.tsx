import Image from "next/image";
import WhatsAppButton from "../WhatsAppButton";

export default function FinalCTA() {
  return (
    <section className="relative bg-cream py-20 md:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden border-t border-stone/10">
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
        <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-ink leading-tight mb-6">
          Someone Important Is Worth Celebrating
        </h2>
        <p className="font-body text-stone text-lg leading-relaxed mb-10 max-w-xl mx-auto">
          Distance shouldn&apos;t stop you from showing up for the people you
          care about. Send a thoughtful gift across Africa and let us handle the
          rest.
        </p>
        <WhatsAppButton
          label="Send a Gift on WhatsApp"
          size="lg"
          className="w-full sm:w-auto sm:min-w-64"
        />
      </div>
    </section>
  );
}
