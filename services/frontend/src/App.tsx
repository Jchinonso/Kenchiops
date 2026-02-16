import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import ThemeInitializer from "./components/ThemeInitializer";

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
  <ErrorBoundary>
    <Router>
      <AuthProvider>
        <ThemeInitializer />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/oauth/callback" element={<AuthCallback />} />
          {/* Backward-compatible redirects for old URLs */}
          <Route
            path="/dashboard/failures"
            element={<Navigate to="/dashboard/cicd/failures" replace />}
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
