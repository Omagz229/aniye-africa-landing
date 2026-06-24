import WhatsAppButton from "./WhatsAppButton";

export default function StickyMobileCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-cream/95 backdrop-blur-sm border-t border-stone/20 px-4 pb-4 pt-2">
      <WhatsAppButton
        label="Send a Gift on WhatsApp"
        size="md"
        className="w-full"
      />
    </div>
  );
}
