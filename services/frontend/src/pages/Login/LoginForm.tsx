import { Link } from "react-router-dom";
import { ArrowLeft, Lock, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { containerVariants, itemVariants } from "@/lib/animations";
import { ProviderButton } from "./ProviderButton";
import { KenchiLogo } from "./KenchiLogo";
import type { LoginFormProps } from "./types";

export const LoginForm = ({
  providers,
  loadingProvider,
  authChecking,
  oauthErrorMessage,
  onProviderClick,
}: LoginFormProps) => (
  <main className="w-full lg:w-[55%] flex items-center justify-center p-6 sm:p-12 bg-white dark:bg-zinc-950 relative overflow-hidden">
    {/* Ambient amber glow behind form */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/[0.05] rounded-full blur-[100px] pointer-events-none" />

    <motion.div
      className="w-full max-w-[440px] relative z-10"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Mobile Logo (visible only when aside is hidden) */}
      <motion.div variants={itemVariants}>
        <Link
          to="/"
          className="flex lg:hidden items-center gap-2.5 mb-8 group"
          aria-label="Kenchi home"
        >
          <KenchiLogo />
          <span className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Kenchi
          </span>
        </Link>
      </motion.div>

      {/* Back to Home */}
      <motion.div variants={itemVariants}>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 mb-8 transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to home
        </Link>
      </motion.div>

      {/* Glass Card Container */}
      <motion.div
        variants={itemVariants}
        className="bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-8 shadow-2xl"
      >
        {/* Heading */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Get started
          </h1>
          <p className="text-zinc-600 dark:text-zinc-500 text-[15px]">
            Start your <span className="font-semibold text-amber-500">free 14-day trial</span> — no
            credit card required.
          </p>
        </div>

        {/* OAuth error banner */}
        <AnimatePresence>
          {oauthErrorMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {oauthErrorMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {authChecking ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-zinc-500">Checking authentication...</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {/* Primary Provider */}
            <motion.div className="space-y-2.5" variants={itemVariants}>
              {providers
                .filter((entry) => entry.primary)
                .map((provider) => (
                  <ProviderButton
                    key={provider.name}
                    provider={provider}
                    variant="primary"
                    isLoading={loadingProvider === provider.id}
                    disabled={loadingProvider !== null}
                    onClick={() => onProviderClick(provider.id)}
                  />
                ))}
            </motion.div>

            {/* Security reassurance */}
            <motion.p
              className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-600"
              variants={itemVariants}
            >
              <Lock className="w-3 h-3" aria-hidden="true" />
              Secure OAuth — we never see your password
            </motion.p>

            {/* Divider */}
            <motion.div className="relative my-5" variants={itemVariants}>
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/80 dark:bg-zinc-900/60 px-3 font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">
                  or continue with
                </span>
              </div>
            </motion.div>

            {/* Secondary Providers */}
            <motion.div className="space-y-2.5" variants={itemVariants}>
              {providers
                .filter((entry) => !entry.primary)
                .map((provider) => (
                  <ProviderButton
                    key={provider.name}
                    provider={provider}
                    variant="secondary"
                    isLoading={loadingProvider === provider.id}
                    disabled={loadingProvider !== null}
                    onClick={() => onProviderClick(provider.id)}
                  />
                ))}
            </motion.div>
          </motion.div>
        )}
      </motion.div>

      {/* Help Link */}
      <motion.div className="mt-6 text-center" variants={itemVariants}>
        <p className="text-sm text-zinc-500">
          Need help?{" "}
          <a
            href="mailto:hello@kenchi.dev"
            className="text-amber-500 hover:text-amber-400 font-medium transition-colors"
          >
            Contact us
          </a>
        </p>
      </motion.div>

      {/* Privacy Policy */}
      <motion.div className="mt-3 text-center" variants={itemVariants}>
        <p className="text-xs text-zinc-400 dark:text-zinc-600 leading-relaxed">
          By continuing, you agree to Kenchi&apos;s{" "}
          <Link
            to="/terms"
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            to="/privacy"
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            Privacy Policy
          </Link>
        </p>
      </motion.div>
    </motion.div>
  </main>
);
