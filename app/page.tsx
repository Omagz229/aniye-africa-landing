import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import StickyMobileCTA from "./components/StickyMobileCTA";
import Hero from "./components/sections/Hero";
import OurBelief from "./components/sections/OurBelief";
import HowItWorks from "./components/sections/HowItWorks";
import ForCompanies from "./components/sections/ForCompanies";
import SnapshotPreview from "./components/sections/SnapshotPreview";
import Coverage from "./components/sections/Coverage";
import FAQ from "./components/sections/FAQ";
import FinalCTA from "./components/sections/FinalCTA";

export default function Home() {
  return (
    <>
      <NavBar />
      <main className="pb-20 sm:pb-0">
        <Hero />
        <OurBelief />
        <HowItWorks />
        <ForCompanies />
        <SnapshotPreview />
        <Coverage />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <StickyMobileCTA />
    </>
  );
}
