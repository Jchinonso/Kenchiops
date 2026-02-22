/**
 * Integrations Page
 *
 * Manages all external service connections: CI/CD platforms (GitHub)
 * and monitoring tools (PagerDuty, Datadog, Vercel, Netlify, etc.).
 */

import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { useIntegrationHealth } from "@/hooks/useIncidentData";
import { usePlanLimitError } from "@/hooks/usePlanLimitError";
import { titleCase } from "@/lib/formatters";
import { MonitoringIntegrations } from "@/components/MonitoringIntegrations";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Github,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
} from "lucide-react";

// ==================== Constants ====================

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  oauth_denied: "OAuth authorization was denied",
  missing_params: "Missing OAuth parameters",
  invalid_state: "Invalid or expired OAuth state",
  provider_mismatch: "Provider mismatch in OAuth flow",
  invalid_params: "Invalid OAuth parameters",
};

// ==================== Sub-components ====================

interface ConnectionCardProps {
  readonly name: string;
  readonly icon: React.ReactNode;
  readonly connected: boolean;
  readonly actionLabel: string;
  readonly actionHref: string;
  readonly external?: boolean;
}

const ConnectionCard = ({
  name,
  icon,
  connected,
  actionLabel,
  actionHref,
  external,
}: ConnectionCardProps) => (
  <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {connected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Not connected</span>
            </>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {external ? (
        <a
          href={actionHref}
          target={actionHref.startsWith("http") ? "_blank" : undefined}
          rel={actionHref.startsWith("http") ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {actionLabel}
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        !connected && <span className="text-xs text-gray-400">Coming soon</span>
      )}
    </div>
  </div>
);

// ==================== Main Component ====================

export const Integrations = () => {
  const { data: tenant } = useTenantInfo();
  const githubConnected = tenant?.githubConnected ?? false;
  const tenantId = tenant?.id ?? "";
  const { data: healthData } = useIntegrationHealth(tenantId);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          Integrations
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
          <ConnectionCard
            name="GitHub"
            icon={<Github className="w-8 h-8 text-gray-900 dark:text-gray-100" />}
            connected={githubConnected}
            actionLabel={githubConnected ? "Manage" : "Install"}
            actionHref={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
            external
          />
          <ConnectionCard
            name="Slack"
            icon={<MessageSquare className="w-8 h-8 text-purple-600" />}
            connected={false}
            actionLabel="Connect"
            actionHref="/dashboard/integrations"
          />
        </CardContent>
      </Card>

      {/* Monitoring Integrations */}
      <MonitoringIntegrations integrationHealth={integrationHealthMap} tenantId={tenantId} />

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
