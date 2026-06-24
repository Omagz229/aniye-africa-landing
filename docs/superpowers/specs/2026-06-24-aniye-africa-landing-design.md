# Aniyé Africa Landing Page — Finalized Build Specification

**Date:** 2026-06-24
**Status:** APPROVED WITH CHANGES (post council review)
**Verdict:** APPROVED FOR BUILD

---

## 1. Project Context

**Product:** Aniyé Africa — Africa's relationship infrastructure. MVP wedge: cross-border gifting across Africa.

**Page purpose:**
1. Explain the offer
2. Build trust
3. Generate WhatsApp conversations / leads

**What this page is NOT:**
- Not an app, marketplace, vendor portal, or checkout flow
- No backend, database, or authentication
- Static landing page only

**Contact:**
- WhatsApp: +234 807 482 7676
- Email: helloaniyeafrica@gmail.com
- WhatsApp CTA URL: `https://wa.me/2348074827676?text=Hi%20Aniy%C3%A9%20Africa%2C%0A%0AI%27d%20like%20to%20send%20a%20gift.%0A%0ARecipient%20Country%3A%0AOccasion%3A%0ABudget%3A%0APreferred%20Delivery%20Date%3A`

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.9 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (CSS-first, `@theme` in globals.css) |
| React | 19.2.4 (Server Components by default) |
| Fonts | `next/font/local` — Fraunces (headings) + Inter (body) |
| Images | `next/image` with PNG logo variants |
| FAQ | Native `<details>/<summary>` — zero JS |

**Tailwind v4 note:** No `tailwind.config.js`. All custom tokens defined in `@theme {}` block inside `app/globals.css`. Syntax: `--color-cream: #F3EFE6;` etc.

---

## 3. Brand Colors

| Token | Hex | Role |
|---|---|---|
| `cream` | `#F3EFE6` | Page background, card fills |
| `ink` | `#2B2622` | Headings, body text, footer/dark section bg |
| `gold` | `#C9A24B` | CTA buttons, step numbers, accent borders, é |
| `stone` | `#9A9082` | Secondary text, dividers, muted labels |
| `white` | `#FFFFFF` | Card backgrounds, reversed text on dark sections |

**CTA button:** Gold bg (`#C9A24B`) + Ink text (`#2B2622`). Gold-on-Ink fails WCAG AA; Gold bg + Ink text passes and reads as premium.

**Brand rule:** The é is always gold. Gold used at ≤5% of any layout. Never pure black — use Ink.

---

## 4. Typography

| Role | Font | Weight | Size (mobile → desktop) |
|---|---|---|---|
| H1 | Fraunces | 700 | `text-4xl` → `text-6xl` |
| H2 | Fraunces | 600 | `text-3xl` → `text-4xl` |
| H3 | Fraunces | 600 | `text-2xl` → `text-3xl` |
| Pull quotes / italic | Fraunces | 400 italic | `text-xl` → `text-2xl` |
| Body | Inter | 400 | `text-base` → `text-lg` |
| Labels / captions | Inter | 500 | `text-sm` |
| CTA button | Inter | 600 | `text-base` |

**Font files:** Copy `Fraunces.ttf` and `Inter.ttf` from `/public/brand-assets/05_Fonts/` to `app/fonts/`. Load via `next/font/local`. Do not serve from brand-assets.

---

## 5. Spacing System

- Base unit: `8px`
- Section vertical padding: `py-16 md:py-24` (128px/192px)
- Content max-width (prose): `max-w-3xl` (768px)
- Content max-width (wider): `max-w-5xl` (1024px)
- Horizontal padding: `px-4 sm:px-6 lg:px-8`

---

## 6. Logo / Asset Selections

| Use | File | Notes |
|---|---|---|
| Navbar | `02_Horizontal_Logo/PNG/aniye-horizontal-fullcolor.png` | On cream bg; PNG via `<Image>` for optimized delivery |
| Footer | `02_Horizontal_Logo/PNG/aniye-horizontal-reversed.png` | On ink bg |
| Favicon 16px | `04_App_Icon_Social/Favicon/favicon-16.png` | Via `layout.tsx` metadata |
| Favicon 32px | `04_App_Icon_Social/Favicon/favicon-32.png` | Via `layout.tsx` metadata |
| Apple Touch Icon | `04_App_Icon_Social/Favicon/favicon-180.png` | Via `layout.tsx` metadata |
| OG Image | `04_App_Icon_Social/PNG/aniye-appicon-gold.png` | Fallback — not 1200×630. Flag for post-launch. |
| Monogram watermark | `03_Monogram/SVG/aniye-monogram-gold.svg` | Hero + Final CTA sections, opacity 6%, decorative only |

**Do not modify original asset files.**

SVG logo files are ~1.6MB (embedded raster data) — use PNG versions with `<Image>` for web performance.

---

## 7. File Structure

```
app/
  layout.tsx                    ← metadata, fonts, favicon, OG
  page.tsx                      ← composes all sections in order
  globals.css                   ← @theme tokens, @font-face, base
  fonts/
    Fraunces.ttf                ← copied from brand-assets (do not modify original)
    Inter.ttf                   ← copied from brand-assets (do not modify original)
  components/
    NavBar.tsx                  ← sticky, cream bg, logo left, CTA right (md:+)
    Footer.tsx                  ← ink bg, reversed logo, links, copyright
    WhatsAppButton.tsx          ← single CTA component, imports from lib/constants
    StickyMobileCTA.tsx         ← fixed bottom, sm:hidden, gold bg, ink text
    sections/
      Hero.tsx                  ← headline, subheadline, CTA, trust chips inline
      TrustBar.tsx              ← 4 checkmark items, 2×2 mobile / 1×4 desktop
      RelationshipStatement.tsx ← distance copy, occasion list
      OurBelief.tsx             ← ink bg (dark section 1 of 2)
      HowItWorks.tsx            ← 4 steps + WhatsApp CTA at bottom
      WhyAniye.tsx              ← headline + 4 feature pills
      GiftTypes.tsx             ← cream bg, 2-col mobile / 4-col desktop emoji grid
      TrustSection.tsx          ← 5 checklist items + trust paragraph
      Coverage.tsx              ← country flags + rewritten opener + CTA
      EarlyPromise.tsx          ← ink bg (dark section 2 of 2)
      FAQ.tsx                   ← native details/summary, 6 Q&A
      FinalCTA.tsx              ← monogram watermark, headline, CTA
lib/
  constants.ts                  ← WHATSAPP_URL, WHATSAPP_NUMBER, EMAIL
public/
  robots.txt                    ← allow all
  brand-assets/                 ← untouched originals
```

---

## 8. Section Specifications

### NavBar
- Sticky (`sticky top-0 z-50`)
- Background: cream, `border-b border-stone/20`
- Logo: horizontal fullcolor PNG, height `h-8`, width auto
- CTA: `hidden md:flex` — "Send a Gift" WhatsApp button (compact, gold bg)
- Mobile: logo only, no CTA (StickyMobileCTA handles mobile conversion)

### StickyMobileCTA (NEW — council recommendation)
- `fixed bottom-0 left-0 right-0 z-50 sm:hidden`
- Full width with `px-4 pb-4 pt-2`
- Frosted/cream bg: `bg-cream/95 backdrop-blur-sm border-t border-stone/20`
- Gold bg WhatsApp button, full width, Ink text
- Text: "Send a Gift on WhatsApp"

### Hero
- Min height `min-h-screen` on mobile
- Centered text (`text-center`)
- Monogram SVG watermark: absolute positioned, centered, opacity 6%, large (300–400px), behind content
- H1: "Stay Present Across Africa." — Fraunces 700
- Subheadline: Inter body, stone color, `max-w-2xl mx-auto`
- Trust reassurance micro-copy below subheadline: *"Not sure if we cover your location? Message us — we'll confirm in minutes."* — Inter sm, stone
- WhatsApp CTA button (full width mobile, auto desktop)
- Trust chips inline row below CTA: `✓ Pay in your local currency` × 4, Inter sm, stone, `flex-wrap gap-x-6 gap-y-2 justify-center`

### TrustBar
- `grid grid-cols-2 md:grid-cols-4 gap-4`
- Cream bg, `border-y border-stone/20`, `py-8`
- Each item: gold `✓` + Inter sm label

### RelationshipStatement
- Cream bg
- H2: "Distance Shouldn't Stop You From Showing Up" — Fraunces, centered
- 5 occasion lines: Fraunces italic, centered, `text-xl`, stone color
- Closing paragraph: Inter, centered, `max-w-2xl mx-auto`

### OurBelief (DARK — section 1 of 2)
- Ink bg, white/cream text
- H2: "Africa Is Connected By Relationships, Not Borders" — Fraunces, centered, cream color
- Body: Inter, `max-w-2xl mx-auto`, centered, stone/light color

### HowItWorks
- Cream bg
- H2 centered: "How It Works"
- 4 steps: `grid grid-cols-1 md:grid-cols-2 gap-8`
- Each step: gold step number (Fraunces, large) inside thin gold circle border (`w-12 h-12 rounded-full border-2 border-gold`) + bold title + body text
- Thin connecting decorative line between steps on desktop (CSS only)
- **WhatsApp CTA button at bottom** (council addition — peak intent after steps)

### WhyAniye
- Cream bg (or very light stone wash)
- Two columns desktop: headline+paragraph left, 4 feature pills right
- Single column mobile
- Feature pills: `rounded-full border border-stone/30 px-4 py-2` — icon + label

### GiftTypes (CREAM — no longer dark section)
- Cream bg
- H2: "We Help You Celebrate Every Occasion" (reframed from council)
- Intro: *"Whatever the occasion, we'll help you find something meaningful."*
- Grid: `grid grid-cols-2 md:grid-cols-4 gap-4` (2-col mobile, 4-col desktop)
- Each cell: large emoji + label, centered, `py-4 px-2`
- Footer: *"Don't see what you're looking for? Ask us."* — stone, centered, with inline WhatsApp link

### TrustSection
- Cream bg (or light stone wash)
- H2: "Every Order Includes"
- 5 checklist items: gold `✓` + Inter label
- Trust paragraph below: Inter, stone, `max-w-2xl`

### Coverage
- Cream bg
- H2: "We Deliver Across Africa"
- Rewritten opener: *"We operate across an active network of trusted local partners."*
- 4 example country flags: 🇳🇬 🇬🇭 🇰🇪 🇿🇦 (inline, `text-3xl`, with country names)
- Note: *"Message us to confirm availability for your recipient's destination."*
- WhatsApp CTA button

### EarlyPromise (DARK — section 2 of 2)
- Ink bg, cream text
- H2: "Every Delivery Matters" — Fraunces, centered, cream
- 3 short trust sentences
- No CTA (let user breathe before FAQ)

### FAQ
- Cream bg
- H2: "Questions" — Fraunces
- 6 items: native `<details><summary>` — no JS
- `summary`: Inter 600, ink, `cursor-pointer`, gold marker/chevron
- Answer: Inter 400, stone, `pt-2 pb-4`
- Subtle `border-b border-stone/20` between items

### FinalCTA
- Cream bg
- Monogram SVG watermark (same as Hero treatment, opacity 6%)
- H2: "Someone Important Is Worth Celebrating" — Fraunces, centered
- Body paragraph: Inter, stone, centered
- Large WhatsApp CTA button (full width mobile, `min-w-64` desktop)

### Footer
- Ink bg
- Reversed horizontal logo, centered or left-aligned
- Tagline: "Africa's Relationship Infrastructure" — Inter, stone
- "Helping people stay present across borders." — Inter sm, stone
- WhatsApp link: `+234 807 482 7676`
- Email link: `helloaniyeafrica@gmail.com`
- Copyright: `© 2024 Aniyé Africa. All rights reserved.` — Inter xs, stone

---

## 9. Constants File

```typescript
// lib/constants.ts
export const WHATSAPP_URL =
  "https://wa.me/2348074827676?text=Hi%20Aniy%C3%A9%20Africa%2C%0A%0AI%27d%20like%20to%20send%20a%20gift.%0A%0ARecipient%20Country%3A%0AOccasion%3A%0ABudget%3A%0APreferred%20Delivery%20Date%3A";
export const WHATSAPP_NUMBER = "+234 807 482 7676";
export const EMAIL = "helloaniyeafrica@gmail.com";
```

---

## 10. SEO / Metadata

```typescript
// app/layout.tsx metadata
title: "Aniyé Africa — Send Gifts Across Africa"
description: "Send thoughtful gifts to loved ones across Africa. Pay in your currency. Trusted local partners. WhatsApp-first experience."
OG title: same as title
OG description: same as description
OG image: /brand-assets/04_App_Icon_Social/PNG/aniye-appicon-gold.png
twitter:card: summary_large_image
lang: "en"
```

**Post-launch recommendation:** Create a proper 1200×630 OG image using brand colors and wordmark.

---

## 11. Accessibility Checklist

- [ ] All images have `alt` text
- [ ] CTA buttons have `aria-label` including destination context
- [ ] Color contrast: Gold bg (`#C9A24B`) + Ink text (`#2B2622`) — verify WCAG AA
- [ ] FAQ: `<details>/<summary>` keyboard navigable by default
- [ ] Sticky mobile CTA: visible focus ring
- [ ] Font size minimum 16px body on mobile
- [ ] `lang="en"` on `<html>`
- [ ] Fraunces renders the é accent correctly (loaded font, not fallback)

---

## 12. Deployment Readiness Checklist

- [ ] `public/robots.txt` — allow all
- [ ] `app/sitemap.ts` — single URL
- [ ] Favicon set wired in `layout.tsx` metadata (16, 32, 180, 512)
- [ ] OG/social meta tags set
- [ ] No hardcoded localhost URLs
- [ ] `next build` passes without errors
- [ ] No `console.log` in production code
- [ ] Dark mode disabled (force light — brand colors clash with dark mode)

---

## 13. Post-Launch Recommendations

1. Create proper 1200×630 OG image with brand wordmark on cream/ink bg
2. Add testimonials section once first 3 orders complete
3. Add specific country coverage list as network grows
4. Consider adding WhatsApp click tracking (UTM or simple analytics event)
5. Add `aniyeafrica.com` canonical URL once deployed

---

## 14. Out of Scope (do not build)

- Checkout or payment flow
- Customer accounts or login
- Product catalogue with prices
- Order tracking interface
- CMS or editable content
- Database or API routes
- Vendor portal
- Mobile app or PWA shell
