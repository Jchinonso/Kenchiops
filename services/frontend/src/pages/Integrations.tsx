/**
 * Integrations Page
 *
 * Manages all external service connections: CI/CD platforms (GitHub, GitLab)
 * and monitoring tools (PagerDuty, Datadog, Vercel, Netlify, etc.).
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { useFetch, parseErrorBody } from "@/hooks/useFetch";
import { useIntegrationHealth } from "@/hooks/useIncidentData";
import { usePlanLimitError } from "@/hooks/usePlanLimitError";
import { apiClient } from "@/lib/apiClient";
import { titleCase } from "@/lib/formatters";
import { MonitoringIntegrations } from "@/components/MonitoringIntegrations";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { FeatureGate } from "@/components/FeatureGate";
import { FeatureLocked } from "@/components/FeatureLocked";
import { PageLoader } from "@/components/PageLoader";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Github,
  Gitlab,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
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
  <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {connected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Not connected</span>
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          {actionLabel}
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        !connected && <span className="text-xs text-zinc-400">Coming soon</span>
      )}
    </div>
  </div>
);

// ==================== GitLab Connection Types ====================

interface GitLabConnectionStatus {
  readonly connected: boolean;
  readonly connectionId: string | null;
  readonly webhookUrl: string | null;
  readonly connectedAt: string | null;
  readonly instanceUrl: string | null;
}

interface GitLabConnectResponse {
  readonly connectionId: string;
  readonly webhookUrl: string;
  readonly webhookSecret: string;
  readonly status: "connected";
}

// ==================== GitLab Secret Dialog ====================

interface GitLabSecretDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly webhookUrl: string;
  readonly webhookSecret: string;
}

const GitLabSecretDialog = ({
  open,
  onOpenChange,
  webhookUrl,
  webhookSecret,
}: GitLabSecretDialogProps) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleCopyUrl = useCallback(async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [webhookUrl]);

  const handleCopySecret = useCallback(async () => {
    await navigator.clipboard.writeText(webhookSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }, [webhookSecret]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>GitLab CI Connected</DialogTitle>
          <DialogDescription>
            Save these credentials now. The webhook secret cannot be retrieved after you close this
            dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning */}
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Copy the webhook secret below. It is encrypted at rest and cannot be shown again.
            </p>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1.5">
              Webhook URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 truncate select-all">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedUrl ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1.5">
              Webhook Secret
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 truncate select-all">
                {webhookSecret}
              </code>
              <button
                type="button"
                onClick={handleCopySecret}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {copiedSecret ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedSecret ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Setup Instructions */}
          <div className="rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Setup Instructions
            </p>
            <ol className="space-y-1.5 list-decimal ml-4">
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                In your GitLab project, go to Settings &rarr; Webhooks
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                Paste the Webhook URL above
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                Enter the Webhook Secret in the "Secret token" field
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                Select "Pipeline events" and "Job events" triggers
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">Click "Add webhook"</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ==================== GitLab CI Connection Card ====================

interface GitLabCardProps {
  readonly tenantId: string;
  readonly otherProviderConnected: boolean;
}

const GitLabCICard = ({ tenantId, otherProviderConnected }: GitLabCardProps) => {
  const {
    data: connectionStatus,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useFetch<GitLabConnectionStatus>(tenantId ? "/integrations/gitlab/connection" : "");

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [connectResult, setConnectResult] = useState<GitLabConnectResponse | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const connected = connectionStatus?.connected ?? false;

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const response = await apiClient("/integrations/gitlab/connect", { method: "POST" });

      if (!response.ok) {
        const errorMsg = await parseErrorBody(response, "Failed to connect GitLab CI");
        toast.error(errorMsg);
        return;
      }

      const json: { readonly data: GitLabConnectResponse } = await response.json();
      setConnectResult(json.data);
      setSecretDialogOpen(true);
      toast.success("GitLab CI connected successfully");
      refetchStatus();
    } catch {
      toast.error("Failed to connect GitLab CI. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  }, [refetchStatus]);

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      const response = await apiClient("/integrations/gitlab/connection", { method: "DELETE" });

      if (!response.ok) {
        const errorMsg = await parseErrorBody(response, "Failed to disconnect GitLab CI");
        toast.error(errorMsg);
        return;
      }

      toast.success("GitLab CI disconnected");
      refetchStatus();
    } catch {
      toast.error("Failed to disconnect GitLab CI. Please try again.");
    } finally {
      setIsDisconnecting(false);
    }
  }, [refetchStatus]);

  const handleCopyUrl = useCallback(async () => {
    if (!connectionStatus?.webhookUrl) {
      return;
    }
    await navigator.clipboard.writeText(connectionStatus.webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [connectionStatus?.webhookUrl]);

  return (
    <>
      <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gitlab className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">GitLab CI/CD</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isLoadingStatus ? (
                  <span className="text-xs text-zinc-400">Checking...</span>
                ) : connected ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Not connected</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting && <Loader2 className="w-3 h-3 animate-spin" />}
                Disconnect
              </Button>
            ) : otherProviderConnected ? (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">GitHub is active</span>
            ) : (
              <Button variant="outline" size="sm" onClick={handleConnect} disabled={isConnecting}>
                {isConnecting && <Loader2 className="w-3 h-3 animate-spin" />}
                Connect
              </Button>
            )}
          </div>
        </div>

        {/* Show webhook URL and instructions when connected */}
        {connected && connectionStatus?.webhookUrl && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1.5">
                Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 truncate select-all">
                  {connectionStatus.webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Add this webhook URL to your GitLab project &rarr; Settings &rarr; Webhooks. Select
              "Pipeline events" and "Job events".
            </p>
          </div>
        )}
      </div>

      {/* Secret dialog (shown once after connecting) */}
      {connectResult && (
        <GitLabSecretDialog
          open={secretDialogOpen}
          onOpenChange={setSecretDialogOpen}
          webhookUrl={connectResult.webhookUrl}
          webhookSecret={connectResult.webhookSecret}
        />
      )}
    </>
  );
};

// ==================== Main Component ====================

export const Integrations = () => {
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
          <ConnectionCard
            name="GitHub"
            icon={<Github className="w-8 h-8 text-zinc-900 dark:text-zinc-100" />}
            connected={githubConnected}
            actionLabel={githubConnected ? "Manage" : "Install"}
            actionHref={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
            external
          />
          <GitLabCICard tenantId={tenantId} otherProviderConnected={githubConnected} />
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

      {/* Monitoring Integrations (paid feature) */}
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
