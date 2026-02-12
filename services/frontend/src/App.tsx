import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Hero from "./sections/Hero";
import Features from "./sections/Features";
import Integrations from "./sections/Integrations";
import CaseStudies from "./sections/CaseStudies";
import IntegrationPoints from "./sections/IntegrationPoints";
import Stats from "./sections/Stats";
import BuiltForTeams from "./sections/BuiltForTeams";
import CTA from "./sections/CTA";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./hooks/useAuth";

const HomePage = () => (
  <>
    <Navbar />
    <main>
      <Hero />
      <Features />
      <Integrations />
      <CaseStudies />
      <IntegrationPoints />
      <Stats />
      <BuiltForTeams />
      <CTA />
    </main>
    <Footer />
  </>
);

const App = () => (
  <Router>
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/failures" element={<Dashboard />} />
        <Route path="/dashboard/analyses" element={<Dashboard />} />
        <Route path="/dashboard/patterns" element={<Dashboard />} />
        <Route path="/dashboard/analytics" element={<Dashboard />} />
        <Route path="/dashboard/settings" element={<Dashboard />} />
      </Routes>
    </AuthProvider>
  </Router>
);

export default App;
