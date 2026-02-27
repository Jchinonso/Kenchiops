/**
 * OAuth Callback Page
 *
 * Handles the redirect from the OAuth provider after login.
 * Tokens are delivered via httpOnly cookies (set by the API on redirect),
 * so this page only handles error params and redirect_after navigation.
 */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { heroVariants, sectionContainerVariants } from "@/lib/animations";

/**
 * Validate redirect_after to prevent open redirect attacks (defense-in-depth).
 * The backend already validates this, but we re-validate on the client
 * in case the URL was tampered with after the backend set it.
 *
 * Only allows paths starting with "/" that are not protocol-relative ("//")
 * and do not contain backslashes or authority components.
 */
const isSafeRedirectPath = (path: string): boolean =>
  path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && !path.includes(":");

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
    <div className="bg-zinc-50 dark:bg-zinc-950 min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Ambient amber glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-500/[0.05] rounded-full blur-[120px] pointer-events-none" />

      {/* Dot grid */}
      <div className="absolute inset-0 dot-grid opacity-20" />

      {/* Noise overlay */}
      <div className="absolute inset-0 noise-overlay" />

      <motion.div
        className="text-center relative z-10"
        variants={sectionContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={heroVariants}>
          {/* Amber spinner */}
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </motion.div>
        <motion.h1
          variants={heroVariants}
          className="font-display text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2"
        >
          Signing you in...
        </motion.h1>
        <motion.p variants={heroVariants} className="text-sm text-zinc-500">
          Please wait while we complete authentication.
        </motion.p>
      </motion.div>
    </div>
  );
};

export default AuthCallback;
