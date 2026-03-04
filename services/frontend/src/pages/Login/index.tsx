import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { getLoginUrl } from "@/lib/apiClient";
import { initPkceFlow } from "@/lib/pkce";
import { useAuth } from "@/hooks/useAuth";
import { LoginShowcase } from "./LoginShowcase";
import { LoginForm } from "./LoginForm";
import { saasProviders, ERROR_MESSAGES } from "./constants";

const Login = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

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

  const handleProviderClick = async (providerId: string): Promise<void> => {
    setLoadingProvider(providerId);

    // Generate PKCE challenge and include in the login URL.
    // The verifier is stored in sessionStorage for the callback exchange.
    const { codeChallenge, codeChallengeMethod } = await initPkceFlow();
    const baseUrl = getLoginUrl(providerId);
    const url = new URL(baseUrl);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", codeChallengeMethod);
    window.location.assign(url.toString());
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 min-h-screen flex">
      <LoginShowcase />
      <LoginForm
        providers={saasProviders}
        loadingProvider={loadingProvider}
        authChecking={authChecking}
        oauthErrorMessage={oauthErrorMessage}
        onProviderClick={(providerId) => {
          void handleProviderClick(providerId);
        }}
      />
    </div>
  );
};

export default Login;
