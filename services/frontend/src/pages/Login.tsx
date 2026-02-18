import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  Github,
  Gitlab,
  Cloud,
  Server,
  ArrowLeft,
  Zap,
  Shield,
  Brain,
  BarChart3,
  Loader2,
  Lock,
} from "lucide-react";
import { getLoginUrl } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";

interface GitProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: React.ReactNode;
  readonly primary?: boolean;
  readonly comingSoon?: boolean;
}

const saasProviders: readonly GitProvider[] = [
  { id: "github", name: "GitHub", icon: <Github className="w-5 h-5" />, primary: true },
  { id: "gitlab", name: "GitLab", icon: <Gitlab className="w-5 h-5" />, comingSoon: true },
  { id: "bitbucket", name: "Bitbucket", icon: <Cloud className="w-5 h-5" />, comingSoon: true },
  {
    id: "azure_devops",
    name: "Azure DevOps",
    icon: <Server className="w-5 h-5" />,
    comingSoon: true,
  },
];

const selfHostedProviders: readonly GitProvider[] = [
  { id: "github", name: "GitHub Enterprise", icon: <Github className="w-5 h-5" />, primary: true },
  {
    id: "gitlab",
    name: "GitLab Self-Managed",
    icon: <Gitlab className="w-5 h-5" />,
    comingSoon: true,
  },
  {
    id: "bitbucket",
    name: "Bitbucket Server",
    icon: <Cloud className="w-5 h-5" />,
    comingSoon: true,
  },
];

const features = [
  { icon: <Zap className="w-4 h-4" />, text: "Instant CI/CD failure analysis" },
  { icon: <Brain className="w-4 h-4" />, text: "AI-powered root cause detection" },
  { icon: <Shield className="w-4 h-4" />, text: "PR risk assessment & scoring" },
  { icon: <BarChart3 className="w-4 h-4" />, text: "Team analytics & insights" },
] as const;

const stats = [
  { value: "93%", label: "Root cause accuracy" },
  { value: "12min", label: "Avg resolution time" },
  { value: "6hrs", label: "Saved per dev/week" },
] as const;

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  access_denied: "Access was denied. Please try again or use a different account.",
  invalid_state: "Authentication session expired. Please try again.",
  server_error: "An error occurred during authentication. Please try again.",
};

const Login = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"saas" | "selfhosted">("saas");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  // OAuth error forwarded from AuthCallback via ?error= query param
  const oauthError = searchParams.get("error");
  const oauthErrorMessage = oauthError
    ? (ERROR_MESSAGES[oauthError] ?? `Authentication failed: ${oauthError}`)
    : null;

  // Redirect authenticated users to dashboard
  if (isAuthenticated && !isLoading) {
    return <Navigate to="/dashboard" replace />;
  }

  const authChecking = isLoading;

  const validateInstanceUrl = (): boolean => {
    if (activeTab !== "selfhosted") {
      return true;
    }
    if (!instanceUrl.trim()) {
      setUrlError("Instance URL is required");
      return false;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parsed = new URL(instanceUrl);
      setUrlError(null);
      return true;
    } catch {
      setUrlError("Please enter a valid URL (e.g., https://git.yourcompany.com)");
      return false;
    }
  };

  const handleProviderClick = (providerId: string): void => {
    if (!validateInstanceUrl()) {
      return;
    }

    setLoadingProvider(providerId);
    const url =
      activeTab === "selfhosted" && instanceUrl
        ? getLoginUrl(providerId, instanceUrl)
        : getLoginUrl(providerId);
    window.location.assign(url);
  };

  const handleSelfHostedSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const primaryProvider = selfHostedProviders.find((p) => p.primary);
    if (primaryProvider) {
      handleProviderClick(primaryProvider.id);
    }
  };

  const providers = activeTab === "saas" ? saasProviders : selfHostedProviders;

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Gradient with social proof */}
      <aside
        className="hidden lg:flex lg:w-[45%] relative overflow-hidden"
        aria-label="Product highlights"
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700" />

        {/* Subtle pattern overlay */}
        {/* style: dynamic radial-gradient pattern not expressible in Tailwind */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Glow effects */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-indigo-400/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-violet-400/20 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5" aria-label="Kenchi home">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/10">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">Kenchi</span>
          </Link>

          {/* Main content */}
          <div className="space-y-10">
            <div>
              <p className="text-3xl font-bold text-white leading-tight mb-3">
                Stop debugging CI failures manually.
              </p>
              <p className="text-indigo-100/80 text-lg leading-relaxed">
                Kenchi analyzes your pipeline failures in seconds, not hours.
              </p>
            </div>

            {/* Feature list */}
            <ul className="space-y-4" aria-label="Key features">
              {features.map((feature) => (
                <li key={feature.text} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center text-white/90 border border-white/5">
                    {feature.icon}
                  </div>
                  <span className="text-white/90 text-sm font-medium">{feature.text}</span>
                </li>
              ))}
            </ul>

            {/* Stats row */}
            <div className="flex gap-8">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-indigo-200/70 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <blockquote className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <p className="text-white/90 text-sm leading-relaxed italic">
                &ldquo;Kenchi cut our CI debugging time by 80%. What used to take an hour now takes
                minutes.&rdquo;
              </p>
              <footer className="mt-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-400/30 flex items-center justify-center text-white text-xs font-bold">
                  JK
                </div>
                <div>
                  <div className="text-white text-sm font-medium">James K.</div>
                  <div className="text-indigo-200/60 text-xs">Staff Engineer, Series B Startup</div>
                </div>
              </footer>
            </blockquote>
          </div>

          {/* Trusted by */}
          <div>
            <p className="text-indigo-200/50 text-xs mb-3 uppercase tracking-wider font-medium">
              Trusted by teams at
            </p>
            <div className="flex items-center gap-6">
              {["Vercel", "CircleCI", "Buildkite", "Railway"].map((name) => (
                <span key={name} className="text-white/40 font-semibold text-sm tracking-tight">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Right Panel - Login Form */}
      <main className="w-full lg:w-[55%] flex items-center justify-center p-6 sm:p-12 bg-white dark:bg-gray-950">
        <div className="w-full max-w-[420px]">
          {/* Mobile Logo (visible only when aside is hidden) */}
          <Link
            to="/"
            className="flex lg:hidden items-center gap-2.5 mb-8"
            aria-label="Kenchi home"
          >
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Kenchi</span>
          </Link>

          {/* Back to Home */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-10 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Get started
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-[15px]">
              Start your{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                free 14-day trial
              </span>{" "}
              — no credit card required.
            </p>
          </div>

          {/* OAuth error banner (forwarded from AuthCallback) */}
          {oauthErrorMessage && (
            <div
              className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {oauthErrorMessage}
            </div>
          )}

          {/* Tabs */}
          <div
            className="flex mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1"
            role="tablist"
            aria-label="Hosting type"
          >
            <button
              type="button"
              role="tab"
              id="tab-saas"
              aria-selected={activeTab === "saas"}
              aria-controls="tabpanel-saas"
              onClick={() => {
                setActiveTab("saas");
                setUrlError(null);
              }}
              className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === "saas"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Cloud
            </button>
            <button
              type="button"
              role="tab"
              id="tab-selfhosted"
              aria-selected={activeTab === "selfhosted"}
              aria-controls="tabpanel-selfhosted"
              onClick={() => setActiveTab("selfhosted")}
              className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === "selfhosted"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Self-Hosted
            </button>
          </div>

          {/* Tab Panel */}
          <div id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
            {/* Self-hosted URL input wrapped in form */}
            {activeTab === "selfhosted" && (
              <form onSubmit={handleSelfHostedSubmit} noValidate className="mb-5">
                <label
                  htmlFor="instance-url"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Instance URL
                </label>
                <input
                  id="instance-url"
                  name="instanceUrl"
                  type="url"
                  required
                  autoComplete="url"
                  value={instanceUrl}
                  onChange={(event) => {
                    setInstanceUrl(event.target.value);
                    setUrlError(null);
                  }}
                  placeholder="https://git.yourcompany.com"
                  aria-invalid={urlError ? "true" : undefined}
                  aria-describedby={urlError ? "instance-url-error" : undefined}
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all ${
                    urlError
                      ? "border-red-400 dark:border-red-500"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                />
                {urlError && (
                  <p id="instance-url-error" className="mt-1.5 text-sm text-red-500" role="alert">
                    {urlError}
                  </p>
                )}
              </form>
            )}

            {authChecking ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Checking authentication...
                </p>
              </div>
            ) : (
              <>
                {/* Primary Provider (GitHub) */}
                <div className="space-y-2.5">
                  {providers
                    .filter((entry) => entry.primary)
                    .map((provider) => (
                      <button
                        key={provider.name}
                        type="button"
                        onClick={() => handleProviderClick(provider.id)}
                        disabled={loadingProvider !== null}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 font-medium transition-all duration-200 shadow-lg shadow-gray-900/10 dark:shadow-gray-100/10 hover:shadow-xl hover:shadow-gray-900/15 group disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {loadingProvider === provider.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <span className="group-hover:scale-110 transition-transform duration-200">
                            {provider.icon}
                          </span>
                        )}
                        <span>
                          {loadingProvider === provider.id
                            ? `Connecting to ${provider.name}...`
                            : `Continue with ${provider.name}`}
                        </span>
                      </button>
                    ))}
                </div>

                {/* Security reassurance */}
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  Secure OAuth — we never see your password
                </p>

                {/* Divider */}
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-gray-950 px-3 text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      or continue with
                    </span>
                  </div>
                </div>

                {/* Secondary Providers */}
                <div className="space-y-2.5">
                  {providers
                    .filter((entry) => !entry.primary)
                    .map((provider) => (
                      <button
                        key={provider.name}
                        type="button"
                        onClick={() => {
                          if (!provider.comingSoon) {
                            handleProviderClick(provider.id);
                          }
                        }}
                        disabled={loadingProvider !== null || provider.comingSoon}
                        aria-disabled={provider.comingSoon ? "true" : undefined}
                        aria-label={
                          provider.comingSoon ? `${provider.name} — coming soon` : provider.name
                        }
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingProvider === provider.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400 group-hover:scale-110 transition-transform duration-200">
                            {provider.icon}
                          </span>
                        )}
                        <span>
                          {loadingProvider === provider.id
                            ? `Connecting to ${provider.name}...`
                            : provider.name}
                        </span>
                        {provider.comingSoon && (
                          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                            Soon
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>

          {/* Help Link */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Need help?{" "}
              <a
                href="mailto:hello@kenchi.dev"
                className="text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
              >
                Contact us
              </a>
            </p>
          </div>

          {/* Privacy Policy */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              By continuing, you agree to Kenchi&apos;s{" "}
              <Link
                to="/terms"
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 transition-colors"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 transition-colors"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
