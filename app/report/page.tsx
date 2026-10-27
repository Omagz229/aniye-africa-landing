import type { Metadata } from "next";
import NavBar from "@/app/components/NavBar";
import Footer from "@/app/components/Footer";
import ReportFromLocal from "@/app/components/report/ReportFromLocal";

export const metadata: Metadata = {
  title: "Your Relationship Snapshot — Aniyé Africa",
  description: "Your organization's Relationship Snapshot from Aniyé Africa.",
  robots: { index: false },
};

// PRIV-001: no searchParams. The answers come from this device, not the URL.
export default function ReportPage() {
  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-cream">
        <ReportFromLocal />
      </main>
      <Footer />
    </>
  );
}
