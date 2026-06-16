/**
 * Onboarding Step 1 — Connect Providers.
 *
 * Shows the user's login CI provider (GitHub or GitLab) as the recommended
 * connection, plus Slack as optional. Once a CI provider is detected as
 * connected, the parent auto-advances the wizard.
 *
 * Continue is gated on an actual connection — Kenchi is useless without
 * one. Users who want to defer use the global Skip (top-right + Esc),
 * which is signposted inline below the provider cards.
 */

import { motion } from "motion/react";
import {
  Github,
  Gitlab,
  MessageSquare,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";

interface ConnectProviderStepProps {
  readonly isGitHub: boolean;
  readonly githubAppSlug: string;
  readonly isProviderConnected: boolean;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onRefreshConnection: () => void;
}

interface ProviderCardProps {
  readonly href: string;
  readonly external: boolean;
  readonly icon: typeof Github;
  readonly iconBg: string;
  readonly title: string;
  readonly description: string;
  readonly accentRing: string;
  readonly badge?: { readonly label: string; readonly className: string };
  readonly connected: boolean;
}

const ProviderCard = ({
  href,
  external,
  icon: Icon,
  iconBg,
  title,
  description,
  accentRing,
  badge,
  connected,
}: ProviderCardProps) => {
  const anchorProps = external
    ? {
        target: "_blank" as const,
        rel: "noopener noreferrer",
        "aria-label": `${title} (opens in new tab)`,
      }
    : { "aria-label": title };

  return (
    <motion.div variants={itemVariants}>
      <a href={href} {...anchorProps} className="block group focus-visible:outline-none">
        <Card
          className={cn(
            "transition-all border",
            connected
              ? "border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
              : `${accentRing} hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md hover:-translate-y-0.5`,
            "group-active:scale-[0.995] group-focus-visible:ring-2 group-focus-visible:ring-indigo-500/40"
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  iconBg
                )}
              >
                <Icon className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                    {title}
                  </h3>
                  {connected ? (
                    <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-0">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" />
                      Connected
                    </Badge>
                  ) : (
                    badge && (
                      <Badge className={cn("text-[10px] border-0", badge.className)}>
                        {badge.label}
                      </Badge>
                    )
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
              </div>
              {external && !connected && (
                <ExternalLink
                  className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors shrink-0"
                  aria-hidden="true"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </a>
    </motion.div>
  );
};

export const ConnectProviderStep = ({
  isGitHub,
  githubAppSlug,
  isProviderConnected,
  onNext,
  onBack,
  onRefreshConnection,
}: ConnectProviderStepProps) => (
  <motion.div variants={containerVariants} initial="hidden" animate="visible">
    <motion.h2
      variants={itemVariants}
      className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 text-center mb-2"
    >
      Connect your CI
    </motion.h2>
    <motion.p
      variants={itemVariants}
      className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-6"
    >
      Install the app for your provider. Slack is optional and can wait.
    </motion.p>

    <div className="space-y-3">
      {isGitHub ? (
        <ProviderCard
          href={`https://github.com/apps/${githubAppSlug}/installations/new`}
          external
          icon={Github}
          iconBg="bg-zinc-900 dark:bg-zinc-100 [&_svg]:dark:text-zinc-900"
          title="Install the GitHub App"
          description="Watch GitHub Actions and analyze every failure"
          accentRing="ring-2 ring-indigo-500/30 border-indigo-200 dark:border-indigo-800"
          badge={{
            label: "Recommended",
            className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
          }}
          connected={isProviderConnected}
        />
      ) : (
        <ProviderCard
          href="/dashboard/setup/gitlab"
          external={false}
          icon={Gitlab}
          iconBg="bg-orange-500"
          title="Connect GitLab"
          description="Watch GitLab CI/CD and analyze every failure"
          accentRing="ring-2 ring-orange-500/30 border-orange-200 dark:border-orange-800"
          badge={{
            label: "Recommended",
            className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
          }}
          connected={isProviderConnected}
        />
      )}

      <ProviderCard
        href="/dashboard/integrations"
        external
        icon={MessageSquare}
        iconBg="bg-purple-500"
        title="Add Slack notifications"
        description="Send failure alerts to your team's Slack channels"
        accentRing="border-zinc-200 dark:border-zinc-700 hover:border-purple-300 dark:hover:border-purple-700"
        badge={{
          label: "Optional",
          className:
            "bg-transparent text-zinc-500 dark:text-zinc-400 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700",
        }}
        connected={false}
      />
    </div>

    {/* Connection status row */}
    <motion.div variants={itemVariants} className="mt-5">
      {isProviderConnected ? (
        <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
          <span>Connection detected — taking you to the next step.</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">
            Installed in another tab? Force a re-check.
          </span>
          <button
            type="button"
            onClick={onRefreshConnection}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 transition-colors font-medium shrink-0"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Check now
          </button>
        </div>
      )}
    </motion.div>

    {/* Navigation */}
    <motion.div variants={itemVariants} className="flex items-center justify-between mt-8">
      <motion.button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-md transition-colors"
        whileTap={{ scale: 0.97 }}
        transition={microSpring}
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back
      </motion.button>
      <motion.button
        type="button"
        onClick={onNext}
        disabled={!isProviderConnected}
        aria-disabled={!isProviderConnected}
        className={cn(
          "inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-zinc-950 transition-colors",
          isProviderConnected
            ? "text-white bg-indigo-500 hover:bg-indigo-600 shadow-md shadow-indigo-500/20"
            : "text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed"
        )}
        whileHover={isProviderConnected ? { scale: 1.02 } : undefined}
        whileTap={isProviderConnected ? { scale: 0.98 } : undefined}
        transition={microSpring}
      >
        Continue
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </motion.button>
    </motion.div>

    {/* Skip hint when disconnected */}
    {!isProviderConnected && (
      <motion.p
        variants={itemVariants}
        className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-4"
      >
        Want to set this up later? Use{" "}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
          Skip
        </span>{" "}
        in the top-right or press{" "}
        <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]">
          Esc
        </kbd>
        .
      </motion.p>
    )}
  </motion.div>
);
