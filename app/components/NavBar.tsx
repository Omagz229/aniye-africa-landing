import Image from "next/image";
import WhatsAppButton from "./WhatsAppButton";

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
          <div className="hidden md:flex">
            <WhatsAppButton label="Send a Gift" size="sm" />
          </div>
        </div>
      </div>
    </header>
  );
}
