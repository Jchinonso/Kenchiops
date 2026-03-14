/**
 * OAuth Callback Page
 *
 * Handles the redirect from the OAuth provider after login.
 * Tokens are delivered via httpOnly cookies (set by the API on redirect),
 * so this page only handles error params and redirect_after navigation.
 */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLoader } from "@/components/PageLoader";
import { isSafeRedirectPath } from "./helpers";

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
    // Defense-in-depth: re-validate the redirect path on the client side.
    const safeRedirect =
      redirectAfter && isSafeRedirectPath(redirectAfter) ? redirectAfter : "/dashboard";
    navigate(safeRedirect, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PageLoader className="min-h-screen" />
    </div>
  );
};

export default AuthCallback;
