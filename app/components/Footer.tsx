import Image from "next/image";
import { WHATSAPP_NUMBER, EMAIL, WHATSAPP_URL } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-ink text-stone">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col items-center text-center gap-6">
          <Image
            src="/brand-assets/02_Horizontal_Logo/PNG/aniye-horizontal-reversed.png"
            alt="Aniyé Africa"
            width={180}
            height={50}
            className="h-10 w-auto"
          />
          <div className="space-y-1">
            <p className="text-white font-body text-sm font-medium">
              Africa&apos;s Relationship Infrastructure
            </p>
            <p className="text-stone font-body text-sm">
              Helping people stay present across borders.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 text-sm">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-white transition-colors"
              aria-label="Chat on WhatsApp"
            >
              WhatsApp: {WHATSAPP_NUMBER}
            </a>
            <span
              className="hidden sm:inline text-stone/40"
              aria-hidden="true"
            >
              ·
            </span>
            <a
              href={`mailto:${EMAIL}`}
              className="text-gold hover:text-white transition-colors"
              aria-label="Send email"
            >
              {EMAIL}
            </a>
          </div>
          <p className="text-stone/60 text-xs font-body">
            &copy; {new Date().getFullYear()} Aniy&eacute; Africa. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
