import type { Metadata } from "next";
import NavBar from "@/app/components/NavBar";
import Footer from "@/app/components/Footer";
import RelationshipSnapshot from "@/app/components/report/RelationshipSnapshot";
import type { AssessmentData } from "@/lib/assessment";
import { EMPTY_ASSESSMENT } from "@/lib/assessment";

export const metadata: Metadata = {
  title: "Your Relationship Snapshot — Aniyé Africa",
  description: "Your organization's Relationship Snapshot from Aniyé Africa.",
  robots: { index: false },
};

interface Props {
  searchParams: Promise<{ d?: string }>;
}

function decodeData(encoded: string | undefined): AssessmentData {
  if (!encoded) return EMPTY_ASSESSMENT;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return EMPTY_ASSESSMENT;
  }
}

export default async function ReportPage({ searchParams }: Props) {
  const params = await searchParams;
  const data = decodeData(params.d);
  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-cream">
        <RelationshipSnapshot data={data} encoded={params.d} />
      </main>
      <Footer />
    </>
  );
}
