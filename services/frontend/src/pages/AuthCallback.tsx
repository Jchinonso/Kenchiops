/**
 * OAuth Callback Page
 *
 * Handles the redirect from the OAuth provider after login.
 * Tokens are delivered via httpOnly cookies (set by the API on redirect),
 * so this page only handles error params and redirect_after navigation.
 */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");

    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    const redirectAfter = searchParams.get("redirect_after");

    // Tokens are in httpOnly cookies (set by the API during redirect).
    // Navigate to the target page — apiClient sends cookies automatically.
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
