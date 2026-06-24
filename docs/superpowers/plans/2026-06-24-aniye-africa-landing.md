# Aniyé Africa Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, production-ready static landing page for Aniyé Africa — a cross-border gifting MVP — that explains the offer, builds trust, and drives WhatsApp conversations.

**Architecture:** Single Next.js App Router page composed of 13 section components, 2 shared layout components (NavBar + Footer), 2 shared UI components (WhatsAppButton + StickyMobileCTA), and a constants file. All styling via Tailwind v4 utility classes with brand tokens defined in globals.css `@theme`.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, Tailwind CSS v4, `next/font/local` (Fraunces + Inter TTFs), `next/image` (PNG logos).

## Global Constraints

- Tailwind v4: `@import "tailwindcss"` + `@theme {}` in globals.css — NO tailwind.config.js
- Brand colors: Cream `#F3EFE6`, Ink `#2B2622`, Gold `#C9A24B`, Stone `#9A9082`
- Fonts: Fraunces (headings/display), Inter (body/UI) — both loaded via `next/font/local`
- Font files live at `app/fonts/Fraunces.ttf` and `app/fonts/Inter.ttf` (copied from brand-assets)
- Logo: PNG versions via `next/image` — NOT SVG (SVGs are 1.6MB each)
- WhatsApp URL: `https://wa.me/2348074827676?text=Hi%20Aniy%C3%A9%20Africa%2C%0A%0AI%27d%20like%20to%20send%20a%20gift.%0A%0ARecipient%20Country%3A%0AOccasion%3A%0ABudget%3A%0APreferred%20Delivery%20Date%3A`
- Email: `helloaniyeafrica@gmail.com`, Phone: `+234 807 482 7676`
- No "use client" unless component requires browser event handlers
- No animations beyond `transition-colors` hover
- Dark mode disabled (`color-scheme: light` forced)
- Static page only — no API routes, no DB, no auth

---

### Task 1: Foundation — fonts, CSS tokens, constants, robots

**Files:**
- Create: `app/fonts/Fraunces.ttf` (copy from brand-assets)
- Create: `app/fonts/Inter.ttf` (copy from brand-assets)
- Modify: `app/globals.css`
- Create: `lib/constants.ts`
- Create: `public/robots.txt`

**Interfaces:**
- Produces: `WHATSAPP_URL`, `WHATSAPP_NUMBER`, `EMAIL` exported from `lib/constants.ts`
- Produces: Tailwind tokens `bg-cream`, `bg-ink`, `bg-gold`, `bg-stone`, `text-cream`, `text-ink`, `text-gold`, `text-stone`, `font-display`, `font-body`

- [ ] **Step 1: Copy font files**

```bash
cp public/brand-assets/05_Fonts/Fraunces.ttf app/fonts/Fraunces.ttf
cp public/brand-assets/05_Fonts/Inter.ttf app/fonts/Inter.ttf
```

- [ ] **Step 2: Replace globals.css**

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-cream: #F3EFE6;
  --color-ink: #2B2622;
  --color-gold: #C9A24B;
  --color-stone: #9A9082;
  --color-white: #FFFFFF;

  --font-display: var(--font-fraunces), Georgia, serif;
  --font-body: var(--font-inter), system-ui, sans-serif;
}

*, *::before, *::after {
  color-scheme: light;
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: #F3EFE6;
  color: #2B2622;
  font-family: var(--font-inter), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

details summary {
  list-style: none;
}
details summary::-webkit-details-marker {
  display: none;
}
```

- [ ] **Step 3: Create lib/constants.ts**

```typescript
// lib/constants.ts
export const WHATSAPP_URL =
  "https://wa.me/2348074827676?text=Hi%20Aniy%C3%A9%20Africa%2C%0A%0AI%27d%20like%20to%20send%20a%20gift.%0A%0ARecipient%20Country%3A%0AOccasion%3A%0ABudget%3A%0APreferred%20Delivery%20Date%3A";

export const WHATSAPP_NUMBER = "+234 807 482 7676";
export const EMAIL = "helloaniyeafrica@gmail.com";
```

- [ ] **Step 4: Create public/robots.txt**

```
User-agent: *
Allow: /
```

- [ ] **Step 5: Commit**

```bash
git add app/fonts/ app/globals.css lib/constants.ts public/robots.txt
git commit -m "feat: add brand tokens, fonts, constants, robots"
```

---

### Task 2: Layout — metadata, favicons, font loading, sitemap

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/sitemap.ts`

**Interfaces:**
- Consumes: `app/fonts/Fraunces.ttf`, `app/fonts/Inter.ttf`
- Produces: `--font-fraunces` and `--font-inter` CSS custom properties on `<html>`; full SEO metadata; favicon set

- [ ] **Step 1: Replace app/layout.tsx**

```typescript
// app/layout.tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fraunces = localFont({
  src: "./fonts/Fraunces.ttf",
  variable: "--font-fraunces",
  display: "swap",
  preload: true,
});

const inter = localFont({
  src: "./fonts/Inter.ttf",
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Aniyé Africa — Send Gifts Across Africa",
  description:
    "Send thoughtful gifts to loved ones across Africa. Pay in your local currency. Trusted local partners. WhatsApp-first experience.",
  metadataBase: new URL("https://aniyeafrica.com"),
  openGraph: {
    title: "Aniyé Africa — Send Gifts Across Africa",
    description:
      "Send thoughtful gifts to loved ones across Africa. Pay in your local currency. Trusted local partners. WhatsApp-first experience.",
    images: [
      {
        url: "/brand-assets/04_App_Icon_Social/PNG/aniye-appicon-gold.png",
        width: 1024,
        height: 1024,
        alt: "Aniyé Africa",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aniyé Africa — Send Gifts Across Africa",
    description:
      "Send thoughtful gifts to loved ones across Africa. Pay in your local currency. Trusted local partners.",
    images: ["/brand-assets/04_App_Icon_Social/PNG/aniye-appicon-gold.png"],
  },
  icons: {
    icon: [
      { url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable}`}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full bg-cream font-body antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create app/sitemap.ts**

```typescript
// app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://aniyeafrica.com",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/sitemap.ts
git commit -m "feat: wire metadata, favicons, fonts, sitemap"
```

---

### Task 3: Shared UI — WhatsAppButton + StickyMobileCTA

**Files:**
- Create: `app/components/WhatsAppButton.tsx`
- Create: `app/components/StickyMobileCTA.tsx`

**Interfaces:**
- Consumes: `WHATSAPP_URL` from `lib/constants`
- Produces: `<WhatsAppButton label? size? />` — anchor tag, gold bg, ink text
- Produces: `<StickyMobileCTA />` — fixed bottom bar, `sm:hidden`

- [ ] **Step 1: Create app/components/WhatsAppButton.tsx**

```typescript
// app/components/WhatsAppButton.tsx
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
```

- [ ] **Step 2: Create app/components/StickyMobileCTA.tsx**

```typescript
// app/components/StickyMobileCTA.tsx
import WhatsAppButton from "./WhatsAppButton";

export default function StickyMobileCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-cream/95 backdrop-blur-sm border-t border-stone/20 px-4 pb-safe pt-2 pb-4">
      <WhatsAppButton
        label="Send a Gift on WhatsApp"
        size="md"
        className="w-full"
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/WhatsAppButton.tsx app/components/StickyMobileCTA.tsx
git commit -m "feat: add WhatsAppButton and StickyMobileCTA shared components"
```

---

### Task 4: NavBar + Footer

**Files:**
- Create: `app/components/NavBar.tsx`
- Create: `app/components/Footer.tsx`

**Interfaces:**
- Consumes: `WhatsAppButton`, `WHATSAPP_NUMBER`, `EMAIL` from constants
- Produces: `<NavBar />`, `<Footer />`

- [ ] **Step 1: Create app/components/NavBar.tsx**

```typescript
// app/components/NavBar.tsx
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
```

- [ ] **Step 2: Create app/components/Footer.tsx**

```typescript
// app/components/Footer.tsx
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
            <p className="text-white font-body text-sm font-medium">Africa&apos;s Relationship Infrastructure</p>
            <p className="text-stone font-body text-sm">Helping people stay present across borders.</p>
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
            <span className="hidden sm:inline text-stone/40" aria-hidden="true">·</span>
            <a
              href={`mailto:${EMAIL}`}
              className="text-gold hover:text-white transition-colors"
              aria-label="Send email"
            >
              {EMAIL}
            </a>
          </div>
          <p className="text-stone/60 text-xs font-body">
            &copy; {new Date().getFullYear()} Aniy&eacute; Africa. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/NavBar.tsx app/components/Footer.tsx
git commit -m "feat: add NavBar and Footer layout components"
```

---

### Task 5: Hero section

**Files:**
- Create: `app/components/sections/Hero.tsx`

**Interfaces:**
- Consumes: `WhatsAppButton`
- Produces: `<Hero />`

- [ ] **Step 1: Create app/components/sections/Hero.tsx**

```typescript
// app/components/sections/Hero.tsx
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
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
        <Image
          src="/brand-assets/03_Monogram/PNG/aniye-monogram-gold.png"
          alt=""
          width={400}
          height={400}
          className="opacity-[0.06] w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96"
          aria-hidden="true"
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
          <WhatsAppButton label="Send a Gift on WhatsApp" size="lg" className="w-full sm:w-auto" />

          <ul
            className="flex flex-wrap justify-center gap-x-6 gap-y-2"
            aria-label="Service guarantees"
          >
            {trustChips.map((chip) => (
              <li key={chip} className="flex items-center gap-1.5 text-stone text-sm font-body">
                <span className="text-gold font-semibold" aria-hidden="true">✓</span>
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/sections/Hero.tsx
git commit -m "feat: add Hero section"
```

---

### Task 6: TrustBar section

**Files:**
- Create: `app/components/sections/TrustBar.tsx`

**Interfaces:**
- Produces: `<TrustBar />`

- [ ] **Step 1: Create app/components/sections/TrustBar.tsx**

```typescript
// app/components/sections/TrustBar.tsx
const items = [
  "Pay in your local currency",
  "Trusted local partners",
  "Delivery updates included",
  "WhatsApp-first experience",
];

export default function TrustBar() {
  return (
    <section className="bg-cream border-y border-stone/20 py-8" aria-label="Service highlights">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-sm font-body text-ink"
            >
              <span className="text-gold font-bold mt-0.5 flex-shrink-0" aria-hidden="true">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/sections/TrustBar.tsx
git commit -m "feat: add TrustBar section"
```

---

### Task 7: RelationshipStatement + OurBelief sections

**Files:**
- Create: `app/components/sections/RelationshipStatement.tsx`
- Create: `app/components/sections/OurBelief.tsx`

- [ ] **Step 1: Create RelationshipStatement.tsx**

```typescript
// app/components/sections/RelationshipStatement.tsx
const occasions = [
  "A birthday.",
  "A graduation.",
  "A new baby.",
  "An anniversary.",
  "A simple act of appreciation.",
];

export default function RelationshipStatement() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink leading-tight mb-10">
          Distance Shouldn&apos;t Stop You From Showing Up
        </h2>

        <ul className="space-y-3 mb-10" aria-label="Life occasions">
          {occasions.map((occasion) => (
            <li key={occasion} className="font-display italic text-xl sm:text-2xl text-stone">
              {occasion}
            </li>
          ))}
        </ul>

        <div className="space-y-4 font-body text-stone text-lg leading-relaxed">
          <p>
            The people we care about don&apos;t always live in the same city,
            country, or region.
          </p>
          <p>
            But meaningful relationships are built through showing up for
            life&apos;s important moments.
          </p>
          <p className="text-ink font-medium">
            Aniy&eacute; Africa helps you do exactly that.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create OurBelief.tsx**

```typescript
// app/components/sections/OurBelief.tsx
export default function OurBelief() {
  return (
    <section className="bg-ink py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-cream leading-tight mb-6">
          Africa Is Connected By Relationships, Not Borders
        </h2>
        <p className="font-body text-stone text-lg leading-relaxed">
          We believe distance should never weaken meaningful relationships.
          Whether you&apos;re sending love, congratulations, encouragement, or
          appreciation, we help you celebrate important moments across Africa
          without worrying about vendors, payments, or delivery logistics.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/sections/RelationshipStatement.tsx app/components/sections/OurBelief.tsx
git commit -m "feat: add RelationshipStatement and OurBelief sections"
```

---

### Task 8: HowItWorks + WhyAniye sections

**Files:**
- Create: `app/components/sections/HowItWorks.tsx`
- Create: `app/components/sections/WhyAniye.tsx`

- [ ] **Step 1: Create HowItWorks.tsx**

```typescript
// app/components/sections/HowItWorks.tsx
import WhatsAppButton from "../WhatsAppButton";

const steps = [
  {
    number: "1",
    title: "Tell Us What You Need",
    body: "Message us on WhatsApp and tell us: who the gift is for, their location, the occasion, and your budget.",
    note: null,
  },
  {
    number: "2",
    title: "We Curate Options",
    body: "We source suitable gift options through trusted local partners and share recommendations with you.",
    note: "Most orders confirmed within hours.",
  },
  {
    number: "3",
    title: "Approve & Pay",
    body: "Choose your preferred option and pay using the currency available to you.",
    note: "Bank transfer, mobile money, or payment link — we'll guide you.",
  },
  {
    number: "4",
    title: "We Deliver",
    body: "We coordinate the delivery and keep you informed until the gift arrives.",
    note: null,
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink text-center mb-12">
          How It Works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-5">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-gold flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="font-display font-bold text-lg text-gold">{step.number}</span>
              </div>
              <div>
                <h3 className="font-display font-semibold text-xl text-ink mb-2">{step.title}</h3>
                <p className="font-body text-stone leading-relaxed">{step.body}</p>
                {step.note && (
                  <p className="font-body text-stone/70 text-sm mt-2 italic">{step.note}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <WhatsAppButton label="Start Your Order on WhatsApp" size="lg" className="w-full sm:w-auto" />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create WhyAniye.tsx**

```typescript
// app/components/sections/WhyAniye.tsx
const features = [
  { icon: "🤝", label: "Trusted Local Partners" },
  { icon: "💳", label: "Local Currency Payments" },
  { icon: "💬", label: "Human Support" },
  { icon: "✉️", label: "One Simple Conversation" },
];

export default function WhyAniye() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink leading-tight mb-6">
              Cross-Border Gifting Without The Complexity
            </h2>
            <p className="font-body text-stone text-lg leading-relaxed">
              Instead of spending hours searching for local vendors, comparing
              options, handling payments, and coordinating delivery in another
              country, simply tell us what you need.
            </p>
            <p className="font-body text-ink font-medium mt-4">We&apos;ll take care of the rest.</p>
          </div>

          <ul className="grid grid-cols-1 gap-3" aria-label="Key features">
            {features.map((f) => (
              <li
                key={f.label}
                className="flex items-center gap-3 rounded-full border border-stone/30 px-5 py-3 font-body text-ink"
              >
                <span aria-hidden="true" className="text-xl">{f.icon}</span>
                <span className="font-medium">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/sections/HowItWorks.tsx app/components/sections/WhyAniye.tsx
git commit -m "feat: add HowItWorks and WhyAniye sections"
```

---

### Task 9: GiftTypes + TrustSection sections

**Files:**
- Create: `app/components/sections/GiftTypes.tsx`
- Create: `app/components/sections/TrustSection.tsx`

- [ ] **Step 1: Create GiftTypes.tsx**

```typescript
// app/components/sections/GiftTypes.tsx
import { WHATSAPP_URL } from "@/lib/constants";

const gifts = [
  { emoji: "🎂", label: "Cakes & Celebration Treats" },
  { emoji: "🌹", label: "Flowers & Bouquets" },
  { emoji: "🎁", label: "Gift Baskets" },
  { emoji: "🍫", label: "Treat & Snack Boxes" },
  { emoji: "👶", label: "New Baby Gifts" },
  { emoji: "🎓", label: "Graduation Gifts" },
  { emoji: "❤️", label: "Anniversary Gifts" },
  { emoji: "🙏", label: "Appreciation Gifts" },
];

export default function GiftTypes() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-stone/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4">
          <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-3">
            We Help You Celebrate Every Occasion
          </h2>
          <p className="font-body text-stone text-lg">
            Whatever the occasion, we&apos;ll help you find something meaningful.
          </p>
        </div>

        <ul
          className="grid grid-cols-2 md:grid-cols-4 gap-3 my-10"
          aria-label="Gift types we can source"
        >
          {gifts.map((gift) => (
            <li
              key={gift.label}
              className="flex flex-col items-center text-center gap-2 bg-white rounded-2xl py-6 px-3 border border-stone/15"
            >
              <span className="text-4xl" aria-hidden="true">{gift.emoji}</span>
              <span className="font-body text-sm text-ink font-medium leading-snug">{gift.label}</span>
            </li>
          ))}
        </ul>

        <p className="text-center font-body text-stone">
          Don&apos;t see what you&apos;re looking for?{" "}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink font-semibold underline underline-offset-2 hover:text-gold transition-colors"
          >
            Ask us.
          </a>{" "}
          We&apos;ll do our best to source it.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create TrustSection.tsx**

```typescript
// app/components/sections/TrustSection.tsx
const items = [
  "Delivery coordination",
  "Delivery updates",
  "Delivery confirmation",
  "Recipient confirmation",
  "Human support",
];

export default function TrustSection() {
  return (
    <section className="bg-white py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink text-center mb-10">
          Every Order Includes
        </h2>

        <ul className="space-y-4 mb-10" aria-label="What every order includes">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-3 text-ink font-body text-lg">
              <span className="text-gold font-bold text-xl flex-shrink-0" aria-hidden="true">✓</span>
              {item}
            </li>
          ))}
        </ul>

        <p className="font-body text-stone text-lg leading-relaxed text-center italic">
          We know that sending a gift across borders requires trust. That&apos;s
          why we stay involved from the moment you place your order until the
          moment it arrives.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/sections/GiftTypes.tsx app/components/sections/TrustSection.tsx
git commit -m "feat: add GiftTypes and TrustSection sections"
```

---

### Task 10: Coverage + EarlyPromise sections

**Files:**
- Create: `app/components/sections/Coverage.tsx`
- Create: `app/components/sections/EarlyPromise.tsx`

- [ ] **Step 1: Create Coverage.tsx**

```typescript
// app/components/sections/Coverage.tsx
import WhatsAppButton from "../WhatsAppButton";

const countries = [
  { flag: "🇳🇬", name: "Nigeria" },
  { flag: "🇬🇭", name: "Ghana" },
  { flag: "🇰🇪", name: "Kenya" },
  { flag: "🇿🇦", name: "South Africa" },
];

export default function Coverage() {
  return (
    <section className="bg-cream border-t border-stone/10 py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-6">
          We Deliver Across Africa
        </h2>

        <p className="font-body text-stone text-lg leading-relaxed mb-8">
          We operate across an active network of trusted local partners.
        </p>

        <ul
          className="flex flex-wrap justify-center gap-6 mb-8"
          aria-label="Countries we currently serve"
        >
          {countries.map((c) => (
            <li key={c.name} className="flex flex-col items-center gap-1">
              <span className="text-4xl" aria-label={c.name}>{c.flag}</span>
              <span className="font-body text-sm text-stone">{c.name}</span>
            </li>
          ))}
        </ul>

        <p className="font-body text-stone text-base mb-8 italic">
          Message us to confirm availability for your recipient&apos;s destination.
        </p>

        <WhatsAppButton label="Check Coverage on WhatsApp" size="md" className="w-full sm:w-auto" />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create EarlyPromise.tsx**

```typescript
// app/components/sections/EarlyPromise.tsx
export default function EarlyPromise() {
  return (
    <section className="bg-ink py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-cream mb-8">
          Every Delivery Matters
        </h2>

        <div className="space-y-4 font-body text-stone text-lg leading-relaxed">
          <p>
            We&apos;re currently focused on creating exceptional experiences for
            our first customers.
          </p>
          <p>Every order receives personal attention.</p>
          <p className="text-cream/90">
            Because relationships deserve more than a transaction.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/sections/Coverage.tsx app/components/sections/EarlyPromise.tsx
git commit -m "feat: add Coverage and EarlyPromise sections"
```

---

### Task 11: FAQ + FinalCTA sections

**Files:**
- Create: `app/components/sections/FAQ.tsx`
- Create: `app/components/sections/FinalCTA.tsx`

- [ ] **Step 1: Create FAQ.tsx**

```typescript
// app/components/sections/FAQ.tsx
const faqs = [
  {
    q: "What kinds of gifts can I send?",
    a: "We can help source cakes, flowers, gift baskets, food packages, celebration gifts, baby gifts, and more depending on location.",
  },
  {
    q: "Do I need an app?",
    a: "No. Everything happens through WhatsApp.",
  },
  {
    q: "Can you help me choose a gift?",
    a: "Yes. Tell us the occasion, recipient, and budget and we'll recommend suitable options.",
  },
  {
    q: "What currency do I pay in?",
    a: "You pay using the currency available to you. We'll guide you through the payment process during your order.",
  },
  {
    q: "How long does delivery take?",
    a: "Delivery timelines depend on destination and gift type. We'll confirm timing before payment.",
  },
  {
    q: "Which countries do you serve?",
    a: "Availability depends on our current partner network. Contact us and we'll confirm service availability for your destination.",
  },
];

export default function FAQ() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink mb-10">
          Questions
        </h2>

        <dl className="divide-y divide-stone/20">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <dt className="font-body font-semibold text-ink text-base sm:text-lg">{q}</dt>
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full border border-stone/40 flex items-center justify-center text-stone group-open:rotate-45 transition-transform duration-200"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <dd className="font-body text-stone leading-relaxed pt-3 pb-1">{a}</dd>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create FinalCTA.tsx**

```typescript
// app/components/sections/FinalCTA.tsx
import Image from "next/image";
import WhatsAppButton from "../WhatsAppButton";

export default function FinalCTA() {
  return (
    <section className="relative bg-cream py-20 md:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden border-t border-stone/10">
      {/* Monogram watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
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
```

- [ ] **Step 3: Commit**

```bash
git add app/components/sections/FAQ.tsx app/components/sections/FinalCTA.tsx
git commit -m "feat: add FAQ and FinalCTA sections"
```

---

### Task 12: Compose page.tsx + add bottom padding for sticky mobile CTA

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: all section components, NavBar, Footer, StickyMobileCTA

- [ ] **Step 1: Replace app/page.tsx**

```typescript
// app/page.tsx
import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import StickyMobileCTA from "./components/StickyMobileCTA";
import Hero from "./components/sections/Hero";
import TrustBar from "./components/sections/TrustBar";
import RelationshipStatement from "./components/sections/RelationshipStatement";
import OurBelief from "./components/sections/OurBelief";
import HowItWorks from "./components/sections/HowItWorks";
import WhyAniye from "./components/sections/WhyAniye";
import GiftTypes from "./components/sections/GiftTypes";
import TrustSection from "./components/sections/TrustSection";
import Coverage from "./components/sections/Coverage";
import EarlyPromise from "./components/sections/EarlyPromise";
import FAQ from "./components/sections/FAQ";
import FinalCTA from "./components/sections/FinalCTA";

export default function Home() {
  return (
    <>
      <NavBar />
      <main className="pb-20 sm:pb-0">
        <Hero />
        <TrustBar />
        <RelationshipStatement />
        <OurBelief />
        <HowItWorks />
        <WhyAniye />
        <GiftTypes />
        <TrustSection />
        <Coverage />
        <EarlyPromise />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <StickyMobileCTA />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: compose full landing page in page.tsx"
```

---

### Task 13: Build validation + audit

**Files:** none created — verification only

- [ ] **Step 1: Run build**

```bash
npm run build
```
Expected: no errors, no type errors, successful `.next` output.

- [ ] **Step 2: Verify favicon paths exist**

```bash
ls public/brand-assets/04_App_Icon_Social/Favicon/
```
Expected: `favicon-16.png`, `favicon-32.png`, `favicon-180.png`, `favicon-512.png`

- [ ] **Step 3: Verify logo paths exist**

```bash
ls public/brand-assets/02_Horizontal_Logo/PNG/ && ls public/brand-assets/03_Monogram/PNG/
```

- [ ] **Step 4: Verify font files exist**

```bash
ls app/fonts/
```
Expected: `Fraunces.ttf`, `Inter.ttf`

- [ ] **Step 5: Verify constants are correct**

```bash
grep -n "WHATSAPP_URL\|EMAIL\|WHATSAPP_NUMBER" lib/constants.ts
```

- [ ] **Step 6: Commit plan**

```bash
git add docs/superpowers/plans/2026-06-24-aniye-africa-landing.md
git commit -m "docs: add landing page implementation plan"
```
