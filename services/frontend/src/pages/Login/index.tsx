import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { getLoginUrl } from "@/lib/apiClient";
import { initPkceFlow } from "@/lib/pkce";
import { useAuth } from "@/hooks/useAuth";
import { LoginShowcase } from "./LoginShowcase";
import { LoginForm } from "./LoginForm";
import { saasProviders, selfHostedProviders, ERROR_MESSAGES } from "./constants";

const Login = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"saas" | "selfhosted">("saas");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  // OAuth error forwarded from AuthCallback via ?error= query param.
  // Only display messages from the known ERROR_MESSAGES map to prevent
  // reflected content injection (social engineering via crafted URLs).
  const oauthError = searchParams.get("error");
  const oauthErrorMessage = oauthError
    ? (ERROR_MESSAGES[oauthError] ?? "Authentication failed. Please try again.")
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
      const parsed = new URL(instanceUrl);
      // Defense-in-depth: only allow HTTPS to prevent SSRF via internal
      // HTTP endpoints and to ensure cookies are never sent over plaintext.
      if (parsed.protocol !== "https:") {
        setUrlError("Instance URL must use HTTPS (e.g., https://git.yourcompany.com)");
        return false;
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError("Please enter a valid URL (e.g., https://git.yourcompany.com)");
      return false;
    }
  };

  const handleProviderClick = async (providerId: string): Promise<void> => {
    if (!validateInstanceUrl()) {
      return;
    }

    setLoadingProvider(providerId);

    // Generate PKCE challenge and include in the login URL.
    // The verifier is stored in sessionStorage for the callback exchange.
    const { codeChallenge, codeChallengeMethod } = await initPkceFlow();
    const baseUrl =
      activeTab === "selfhosted" && instanceUrl
        ? getLoginUrl(providerId, instanceUrl)
        : getLoginUrl(providerId);
    const url = new URL(baseUrl);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", codeChallengeMethod);
    window.location.assign(url.toString());
  };

  const handleSelfHostedSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const primaryProvider = selfHostedProviders.find((provider) => provider.primary);
    if (primaryProvider) {
      void handleProviderClick(primaryProvider.id);
    }
  };

  const handleTabChange = (tab: "saas" | "selfhosted"): void => {
    setActiveTab(tab);
    if (tab === "saas") {
      setUrlError(null);
    }
  };

  const handleInstanceUrlChange = (value: string): void => {
    setInstanceUrl(value);
    setUrlError(null);
  };

  const providers = activeTab === "saas" ? saasProviders : selfHostedProviders;

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 min-h-screen flex">
      <LoginShowcase />
      <LoginForm
        activeTab={activeTab}
        onTabChange={handleTabChange}
        providers={providers}
        loadingProvider={loadingProvider}
        authChecking={authChecking}
        oauthErrorMessage={oauthErrorMessage}
        instanceUrl={instanceUrl}
        onInstanceUrlChange={handleInstanceUrlChange}
        urlError={urlError}
        onSelfHostedSubmit={handleSelfHostedSubmit}
        onProviderClick={(providerId) => {
          void handleProviderClick(providerId);
        }}
      />
    </div>
  );
};

export default Login;
