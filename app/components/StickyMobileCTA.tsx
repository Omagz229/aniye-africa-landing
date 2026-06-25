export default function StickyMobileCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-cream/95 backdrop-blur-sm border-t border-stone/20 px-4 pb-4 pt-2">
      <a
        href="/assessment"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-base px-8 py-4 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        Start Relationship Assessment
      </a>
    </div>
  );
}
