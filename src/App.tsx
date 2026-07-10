import Header from "./components/Header";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import GiveToGet from "./components/GiveToGet";
import TrustCalculation from "./components/TrustCalculation";
import CtaBanner from "./components/CtaBanner";
import Footer from "./components/Footer";

function App() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <GiveToGet />
        <TrustCalculation />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}

export default App;
