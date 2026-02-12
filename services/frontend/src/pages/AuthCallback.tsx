/**
 * OAuth Callback Page
 *
 * Receives tokens from the OAuth redirect, stores them in localStorage,
 * and redirects to the dashboard (or an error page).
 */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setTokens } from "@/lib/apiClient";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");

    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      navigate("/login?error=missing_tokens", { replace: true });
      return;
    }

    setTokens(accessToken, refreshToken);

    const redirectAfter = searchParams.get("redirect_after");
    navigate(redirectAfter ?? "/dashboard", { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Signing you in...</h1>
        <p className="text-sm text-gray-500">Please wait while we complete authentication.</p>
      </div>
    </div>
  );
};

export default AuthCallback;
