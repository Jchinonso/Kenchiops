import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Hero from "./sections/Hero";
import Features from "./sections/Features";
import Integrations from "./sections/Integrations";
import CaseStudies from "./sections/CaseStudies";
import IntegrationPoints from "./sections/IntegrationPoints";
import Stats from "./sections/Stats";
import Testimonials from "./sections/Testimonials";
import BuiltForTeams from "./sections/BuiltForTeams";
import GetStarted from "./sections/GetStarted";
import Pricing from "./sections/Pricing";
import FAQ from "./sections/FAQ";
import CTA from "./sections/CTA";
import Login from "./pages/Login";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Dashboard from "./pages/Dashboard";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./hooks/useAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ThemeInitializer from "./components/ThemeInitializer";
import { StickyCTA } from "./components/StickyCTA";
import { BackToTop } from "./components/BackToTop";
import { SocialProofToast } from "./components/SocialProofToast";

const HomePage = () => (
  <>
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-indigo-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
    >
      Skip to main content
    </a>
    <StickyCTA />
    <Navbar />
    <main id="main-content">
      <Hero />
      <Features />
      <Integrations />
      <CaseStudies />
      <GetStarted />
      <IntegrationPoints />
      <Stats />
      <Testimonials />
      <BuiltForTeams />
      <Pricing />
      <FAQ />
      <CTA />
    </main>
    <Footer />
    <BackToTop />
    <SocialProofToast />
  </>
);

const App = () => (
  <ErrorBoundary>
    <Router>
      <AuthProvider>
        <ThemeInitializer />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/oauth/callback" element={<AuthCallback />} />
          {/* Backward-compatible redirects for old URLs */}
          <Route
            path="/dashboard/failures"
            element={<Navigate to="/dashboard/cicd/analyses" replace />}
          />
          <Route
            path="/dashboard/analyses"
            element={<Navigate to="/dashboard/cicd/analyses" replace />}
          />
          <Route
            path="/dashboard/repos"
            element={<Navigate to="/dashboard/cicd/pipelines" replace />}
          />
          <Route
            path="/dashboard/patterns"
            element={<Navigate to="/dashboard/analytics" replace />}
          />
          {/* Dashboard shell handles all sub-routes */}
          <Route path="/dashboard/*" element={<Dashboard />} />
        </Routes>
      </AuthProvider>
    </Router>
  </ErrorBoundary>
);

export default App;
