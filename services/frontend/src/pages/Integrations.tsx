/**
 * Integrations Page
 *
 * Manages all external service connections: CI/CD platforms (GitHub, Vercel,
 * Netlify) and monitoring tools (PagerDuty, Datadog, etc.).
 */

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIntegrationConnections } from "@/hooks/useIntegrationConnections";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { apiClient } from "@/lib/apiClient";
import { titleCase } from "@/lib/formatters";
import { VercelIcon } from "@/components/icons/VercelIcon";
import { NetlifyIcon } from "@/components/icons/NetlifyIcon";
import { MonitoringIntegrations } from "@/components/MonitoringIntegrations";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Github,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";

// ==================== Constants ====================

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";
const API_URL = import.meta.env.VITE_API_URL ?? "";

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
  readonly onDisconnect?: () => void;
  readonly disconnecting?: boolean;
}

const ConnectionCard = ({
  name,
  icon,
  connected,
  actionLabel,
  actionHref,
  external,
  onDisconnect,
  disconnecting,
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
      {connected && onDisconnect && (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
        >
          {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Disconnect"}
        </button>
      )}
      {!connected && external && (
        <a
          href={actionHref}
          target={actionHref.startsWith("http") ? "_blank" : undefined}
          rel={actionHref.startsWith("http") ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {actionLabel}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {connected && external && !onDisconnect && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {actionLabel}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {!connected && !external && <span className="text-xs text-gray-400">Coming soon</span>}
    </div>
  </div>
);

// ==================== Main Component ====================

export const Integrations = () => {
  const { data: tenant } = useTenantInfo();
  const { connections, refetch: refetchConnections } = useIntegrationConnections();
  const githubConnected = tenant?.githubConnected ?? false;
  const [searchParams, setSearchParams] = useSearchParams();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Show toast for integration connect results from URL params
  useEffect(() => {
    const integration = searchParams.get("integration");
    const status = searchParams.get("status");
    const integrationError = searchParams.get("integration_error");

    if (integration && status === "connected") {
      toast.success(`${titleCase(integration)} connected successfully`);
      setSearchParams({}, { replace: true });
    } else if (integration && status === "error") {
      toast.error(`Failed to connect ${titleCase(integration)}. Please try again.`);
      setSearchParams({}, { replace: true });
    } else if (integrationError) {
      toast.error(ERROR_MESSAGES[integrationError] ?? "Integration connection failed");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const vercelConnection = connections.find(
    ({ provider, connected }) => provider === "vercel" && connected
  );
  const netlifyConnection = connections.find(
    ({ provider, connected }) => provider === "netlify" && connected
  );

  const vercelConnectionId = vercelConnection?.connectionId ?? null;
  const netlifyConnectionId = netlifyConnection?.connectionId ?? null;

  const handleDisconnect = useCallback(
    async (connectionId: string) => {
      setDisconnectingId(connectionId);
      try {
        const response = await apiClient(`/integrations/${connectionId}`, {
          method: "DELETE",
        });
        if (response.ok) {
          toast.success("Integration disconnected");
          refetchConnections();
        } else {
          toast.error("Failed to disconnect integration");
        }
      } catch {
        toast.error("Failed to disconnect integration");
      } finally {
        setDisconnectingId(null);
      }
    },
    [refetchConnections]
  );

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
            name="Vercel"
            icon={<VercelIcon className="w-8 h-8 text-gray-900 dark:text-gray-100" />}
            connected={!!vercelConnection}
            actionLabel="Connect"
            actionHref={`${API_URL}/integrations/vercel/connect`}
            external
            onDisconnect={
              vercelConnectionId
                ? () => {
                    handleDisconnect(vercelConnectionId);
                  }
                : undefined
            }
            disconnecting={disconnectingId === vercelConnectionId}
          />
          <ConnectionCard
            name="Netlify"
            icon={<NetlifyIcon className="w-8 h-8 text-teal-600 dark:text-teal-400" />}
            connected={!!netlifyConnection}
            actionLabel="Connect"
            actionHref={`${API_URL}/integrations/netlify/connect`}
            external
            onDisconnect={
              netlifyConnectionId
                ? () => {
                    handleDisconnect(netlifyConnectionId);
                  }
                : undefined
            }
            disconnecting={disconnectingId === netlifyConnectionId}
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
      <MonitoringIntegrations />
    </div>
  );
};
