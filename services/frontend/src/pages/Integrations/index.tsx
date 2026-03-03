/**
 * Integrations Page
 *
 * Manages all external service connections: CI/CD platforms (GitHub, GitLab)
 * and monitoring tools (PagerDuty, Datadog, Vercel, Netlify, etc.).
 */

import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { useAuth } from "@/hooks/useAuth";
import { useIntegrationHealth } from "@/hooks/useIncidentData";
import { usePlanLimitError } from "@/hooks/usePlanLimitError";
import { titleCase } from "@/lib/formatters";
import { MonitoringIntegrations } from "@/components/MonitoringIntegrations";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { FeatureGate } from "@/components/FeatureGate";
import { FeatureLocked } from "@/components/FeatureLocked";
import { PageLoader } from "@/components/PageLoader";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Github, MessageSquare, Link as LinkIcon } from "lucide-react";
import { GITHUB_APP_SLUG, ERROR_MESSAGES } from "./constants";
import { ConnectionCard } from "./ConnectionCard";
import { GitLabCICard } from "./GitLabCICard";

export const Integrations = () => {
  const { user } = useAuth();
  const loginProvider = user?.organizations.find((org) => org.isSelected)?.provider ?? "github";
  const isGitHub = loginProvider === "github";
  const { data: tenant } = useTenantInfo();
  const githubConnected = tenant?.githubConnected ?? false;
  const tenantId = tenant?.id ?? "";
  const { data: healthData } = useIntegrationHealth(tenantId);
  const { data: usageData, isLoading: isUsageLoading } = useSubscriptionUsage();
  const isAnyLimitReached = usageData
    ? Object.values(usageData.usage).some(
        (usage) => usage.limited && usage.limit !== null && usage.current >= usage.limit
      )
    : false;
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    planLimitError,
    isOpen: isLimitDialogOpen,
    checkUrlParams,
    dismiss: dismissLimitDialog,
  } = usePlanLimitError();

  const integrationHealthMap = useMemo(() => {
    if (!healthData) {
      return null;
    }
    const entries = healthData.map(
      (entry) =>
        [entry.source, { eventCount: entry.eventCount, lastReceived: entry.lastReceived }] as const
    );
    return Object.fromEntries(entries);
  }, [healthData]);

  // Show toast or UpgradePrompt for integration connect results from URL params
  useEffect(() => {
    const integration = searchParams.get("integration");
    const status = searchParams.get("status");
    const integrationError = searchParams.get("integration_error");

    if (status === "limit_exceeded") {
      checkUrlParams(searchParams);
      setSearchParams({}, { replace: true });
    } else if (integration && status === "connected") {
      toast.success(`${titleCase(integration)} connected successfully`);
      setSearchParams({}, { replace: true });
    } else if (integration && status === "error") {
      toast.error(`Failed to connect ${titleCase(integration)}. Please try again.`);
      setSearchParams({}, { replace: true });
    } else if (integrationError) {
      toast.error(ERROR_MESSAGES[integrationError] ?? "Integration connection failed");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, checkUrlParams]);

  if (isUsageLoading) {
    return <PageLoader />;
  }

  if (isAnyLimitReached && usageData) {
    return (
      <FeatureLocked
        description="You have reached your plan's usage limits. Upgrade to continue managing integrations."
        usage={usageData.usage}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Integrations
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Connect your CI/CD platforms and monitoring tools to Kenchi.
        </p>
      </div>

      {/* CI/CD Connections */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-indigo-500" />
            <CardTitle>CI/CD Platforms</CardTitle>
          </div>
          <CardDescription>Connect your deployment and CI/CD platforms.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          {isGitHub ? (
            <ConnectionCard
              name="GitHub"
              icon={<Github className="w-8 h-8 text-zinc-900 dark:text-zinc-100" />}
              connected={githubConnected}
              actionLabel={githubConnected ? "Manage" : "Install"}
              actionHref={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
              external
            />
          ) : (
            <GitLabCICard tenantId={tenantId} otherProviderConnected={false} />
          )}
          <FeatureGate feature="slackIntegration">
            <ConnectionCard
              name="Slack"
              icon={<MessageSquare className="w-8 h-8 text-purple-600" />}
              connected={false}
              actionLabel="Connect"
              actionHref="/dashboard/integrations"
            />
          </FeatureGate>
        </CardContent>
      </Card>

      <FeatureGate feature="apiAccess">
        <MonitoringIntegrations integrationHealth={integrationHealthMap} tenantId={tenantId} />
      </FeatureGate>

      {planLimitError && (
        <UpgradePrompt
          open={isLimitDialogOpen}
          onOpenChange={() => dismissLimitDialog()}
          limitKey={planLimitError.limitKey}
          currentUsage={planLimitError.currentUsage}
          limit={planLimitError.limit}
          currentPlan={planLimitError.currentPlan}
        />
      )}
    </div>
  );
};
