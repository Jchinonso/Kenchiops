/**
 * Onboarding Step 1 — Connect Providers
 * Shows GitHub, GitLab, and Slack provider cards.
 * GitHub/GitLab are primary CI connections; Slack is optional notifications.
 */

import { motion } from "motion/react";
import {
  Github,
  Gitlab,
  MessageSquare,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  GitBranch,
  Activity,
  Bell,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";

interface ConnectProviderStepProps {
  readonly isGitHub: boolean;
  readonly githubAppSlug: string;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/** Animated data flow pills */
const DataFlowPills = () => {
  const pills = [
    { label: "Repositories", icon: GitBranch, delay: 0.4 },
    { label: "Pipelines", icon: Activity, delay: 0.55 },
    { label: "Alerts", icon: Bell, delay: 0.7 },
  ] as const;

  return (
    <div className="flex flex-wrap justify-center gap-2 mt-6">
      {pills.map((pill) => (
        <motion.div
          key={pill.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: pill.delay, type: "spring", stiffness: 300, damping: 25 }}
        >
          <Badge
            variant="outline"
            className="text-xs gap-1.5 py-1 px-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700"
          >
            <pill.icon className="w-3 h-3 text-indigo-500" />
            {pill.label}
          </Badge>
        </motion.div>
      ))}
    </div>
  );
};

export const ConnectProviderStep = ({
  isGitHub,
  githubAppSlug,
  onNext,
  onBack,
}: ConnectProviderStepProps) => (
  <motion.div variants={containerVariants} initial="hidden" animate="visible">
    <motion.h2
      variants={itemVariants}
      className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 text-center mb-2"
    >
      Connect your tools
    </motion.h2>
    <motion.p
      variants={itemVariants}
      className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6"
    >
      Choose the integrations you want to set up.
    </motion.p>

    <div className="space-y-3">
      {/* CI/CD Provider — show only the user's login provider */}
      {isGitHub ? (
        <motion.div variants={itemVariants}>
          <a
            href={`https://github.com/apps/${githubAppSlug}/installations/new`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Install GitHub App (opens in new tab)"
            className="block group"
          >
            <Card
              className={cn(
                "transition-all",
                "ring-2 ring-indigo-500/30 border-indigo-200 dark:border-indigo-800",
                "hover:border-zinc-300 dark:hover:border-zinc-600",
                "hover:shadow-lg hover:-translate-y-0.5",
                "group-active:scale-[0.99]"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-900 dark:bg-white rounded-xl flex items-center justify-center shrink-0">
                    <Github className="w-5 h-5 text-white dark:text-zinc-900" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                        Install GitHub App
                      </h3>
                      <Badge className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-0">
                        Recommended
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Monitor GitHub Actions workflow failures
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors shrink-0" />
                </div>
              </CardContent>
            </Card>
          </a>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants}>
          <a href="/dashboard/setup/gitlab" className="block group">
            <Card
              className={cn(
                "transition-all",
                "ring-2 ring-orange-500/30 border-orange-200 dark:border-orange-800",
                "hover:border-orange-300 dark:hover:border-orange-700",
                "hover:shadow-lg hover:-translate-y-0.5",
                "group-active:scale-[0.99]"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                    <Gitlab className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                        Connect GitLab
                      </h3>
                      <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-0">
                        Recommended
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Monitor GitLab CI/CD pipeline failures
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors shrink-0" />
                </div>
              </CardContent>
            </Card>
          </a>
        </motion.div>
      )}

      {/* Slack */}
      <motion.div variants={itemVariants}>
        <a
          href="/dashboard/integrations"
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
        >
          <Card
            className={cn(
              "transition-all",
              "hover:border-purple-300 dark:hover:border-purple-700",
              "hover:shadow-lg hover:-translate-y-0.5",
              "group-active:scale-[0.99]"
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                      Add Slack Notifications
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                    >
                      Optional
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Get failure alerts in your team&apos;s Slack channels
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors shrink-0" />
              </div>
            </CardContent>
          </Card>
        </a>
      </motion.div>
    </div>

    {/* Data flow pills */}
    <DataFlowPills />

    {/* Navigation */}
    <motion.div variants={itemVariants} className="flex items-center justify-between mt-8">
      <motion.button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        whileTap={{ scale: 0.97 }}
        transition={microSpring}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </motion.button>
      <motion.button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Continue
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>
  </motion.div>
);
