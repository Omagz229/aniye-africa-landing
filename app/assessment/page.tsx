import type { Metadata } from "next";
import NavBar from "@/app/components/NavBar";
import Footer from "@/app/components/Footer";
import AssessmentWizard from "@/app/components/assessment/AssessmentWizard";

export const metadata: Metadata = {
  title: "Relationship Assessment — Aniyé Africa",
  description:
    "Complete your Relationship Assessment and receive your organization's Relationship Snapshot.",
};

export default function AssessmentPage() {
  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-cream px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-3">
              Relationship Assessment
            </h1>
            <p className="font-body text-stone text-lg">
              Help us understand your organization. Your Relationship Snapshot
              will be ready immediately.
            </p>
          </div>
          <AssessmentWizard />
        </div>
      </main>
      <Footer />
    </>
  );
}
