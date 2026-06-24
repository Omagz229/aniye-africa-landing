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
