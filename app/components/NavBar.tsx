import Image from "next/image";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur-sm border-b border-stone/20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <a href="/" aria-label="Aniyé Africa — home">
            <Image
              src="/brand-assets/02_Horizontal_Logo/PNG/aniye-horizontal-fullcolor.png"
              alt="Aniyé Africa"
              width={160}
              height={45}
              priority
              className="h-8 w-auto"
            />
          </a>

          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            <a href="/#how-it-works" className="font-body text-sm text-stone hover:text-ink transition-colors">
              How It Works
            </a>
            <a href="/#for-companies" className="font-body text-sm text-stone hover:text-ink transition-colors">
              For Companies
            </a>
            <a
              href="/assessment"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gold text-ink font-semibold text-sm px-5 py-2.5 transition-all hover:brightness-105 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              Start Assessment
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
