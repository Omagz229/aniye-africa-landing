import { WHATSAPP_URL } from "@/lib/constants";

interface WhatsAppButtonProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function WhatsAppButton({
  label = "Send a Gift on WhatsApp",
  size = "md",
  className = "",
}: WhatsAppButtonProps) {
  const sizeClasses = {
    sm: "px-5 py-2.5 text-sm",
    md: "px-8 py-4 text-base",
    lg: "px-10 py-5 text-lg",
  };

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} — opens WhatsApp`}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${sizeClasses[size]} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 flex-shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.852L.057 23.5l5.797-1.522A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.887 9.887 0 01-5.031-1.373l-.361-.214-3.44.903.918-3.354-.235-.374A9.862 9.862 0 012.106 12C2.106 6.526 6.526 2.106 12 2.106c5.473 0 9.894 4.42 9.894 9.894 0 5.473-4.421 9.894-9.894 9.894z" />
      </svg>
      {label}
    </a>
  );
}
