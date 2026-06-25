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
  title: "Aniyé Africa — Relationship Programs Across Africa",
  description:
    "Aniyé helps organizations recognize employees, clients, and partners across Africa. Never miss the moments that matter.",
  metadataBase: new URL("https://aniyeafrica.com"),
  openGraph: {
    title: "Aniyé Africa — Relationship Programs Across Africa",
    description:
      "Aniyé helps organizations recognize employees, clients, and partners across Africa. Never miss the moments that matter.",
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
    title: "Aniyé Africa — Relationship Programs Across Africa",
    description:
      "Aniyé helps organizations recognize employees, clients, and partners across Africa. Never miss the moments that matter.",
    images: ["/brand-assets/04_App_Icon_Social/PNG/aniye-appicon-gold.png"],
  },
  icons: {
    icon: [
      {
        url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/brand-assets/04_App_Icon_Social/Favicon/favicon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
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
