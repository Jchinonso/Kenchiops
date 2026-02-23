/**
 * Onboarding Page
 *
 * Full-page onboarding experience for new users who haven't connected
 * any CI provider yet. Guides them to install the GitHub App or
 * connect GitLab to start monitoring their pipelines.
 */

import {
  Github,
  Gitlab,
  Rocket,
  ArrowRight,
  ExternalLink,
  Zap,
  Shield,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";

interface OnboardingProps {
  readonly displayName: string;
  readonly onSkip: () => void;
}

interface FeatureCardProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
}

const FeatureCard = ({ icon, title, description }: FeatureCardProps) => (
  <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
    <div className="flex-shrink-0 mt-0.5">{icon}</div>
    <div>
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
    </div>
  </div>
);

export const Onboarding = ({ displayName, onSkip }: OnboardingProps) => {
  const firstName = displayName.split(" ")[0] ?? "there";

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-16">
      {/* Welcome Header */}
      <div className="text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 dark:bg-indigo-950 rounded-2xl mb-5">
          <Rocket className="w-8 h-8 text-indigo-500" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Welcome, {firstName}!
        </h1>
        <p className="text-base text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Connect your CI/CD provider to start getting AI-powered failure analysis and incident
          triage on every pipeline run.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* GitHub Card */}
        <a
          href={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
        >
          <Card
            className={cn(
              "h-full transition-all",
              "hover:border-gray-300 dark:hover:border-gray-600",
              "hover:shadow-lg hover:-translate-y-1",
              "group-active:scale-[0.98]"
            )}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-900 dark:bg-white rounded-xl flex items-center justify-center">
                  <Github className="w-5 h-5 text-white dark:text-gray-900" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Connect GitHub</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">GitHub Actions</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Install the Kenchi GitHub App on your organization to automatically analyze GitHub
                Actions failures.
              </p>
            </CardContent>
          </Card>
        </a>

        {/* GitLab Card */}
        <a href="/auth/gitlab/login" className="block group">
          <Card
            className={cn(
              "h-full transition-all",
              "hover:border-orange-300 dark:hover:border-orange-700",
              "hover:shadow-lg hover:-translate-y-1",
              "group-active:scale-[0.98]"
            )}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                  <Gitlab className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Connect GitLab</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">GitLab CI/CD</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sign in with GitLab to connect your groups and set up pipeline webhook monitoring.
              </p>
            </CardContent>
          </Card>
        </a>
      </div>

      {/* What Kenchi Does */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            What you get with Kenchi
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FeatureCard
              icon={<Zap className="w-4 h-4 text-amber-500" />}
              title="AI Failure Analysis"
              description="Automatic root cause diagnosis for every CI/CD failure."
            />
            <FeatureCard
              icon={<Shield className="w-4 h-4 text-indigo-500" />}
              title="Incident Triage"
              description="Alert deduplication, severity scoring, and correlation."
            />
            <FeatureCard
              icon={<MessageSquare className="w-4 h-4 text-purple-500" />}
              title="Slack Notifications"
              description="Get analysis results delivered to your team channels."
            />
          </div>
        </CardContent>
      </Card>

      {/* Skip */}
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Skip for now &rarr;
        </button>
      </div>
    </div>
  );
};
