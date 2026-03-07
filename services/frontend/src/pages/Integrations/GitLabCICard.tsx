/**
 * GitLab CI/CD connection card with full connect/disconnect API logic.
 * Shows webhook URL and setup instructions when connected.
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fetchQuery, parseErrorBody } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Gitlab, CheckCircle2, XCircle, Copy, Check, Loader2 } from "lucide-react";
import { GitLabSecretDialog } from "./GitLabSecretDialog";
import type { GitLabConnectionStatus, GitLabConnectResponse, GitLabCardProps } from "./types";

export const GitLabCICard = ({ tenantId, otherProviderConnected }: GitLabCardProps) => {
  const connectionQuery = useQuery({
    queryKey: queryKeys.integrations.gitlab.connection(),
    queryFn: () => fetchQuery<GitLabConnectionStatus>("/integrations/gitlab/connection"),
    enabled: !!tenantId,
  });
  const connectionStatus = connectionQuery.data ?? null;
  const isLoadingStatus = connectionQuery.isPending && !!tenantId;
  const refetchStatus = connectionQuery.refetch;

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

      {/* Secret dialog (shown once after connecting).
          Clear connectResult on close to remove the webhook secret from React state. */}
      {connectResult && (
        <GitLabSecretDialog
          open={secretDialogOpen}
          onOpenChange={(open) => {
            setSecretDialogOpen(open);
            if (!open) {
              setConnectResult(null);
            }
          }}
          webhookUrl={connectResult.webhookUrl}
          webhookSecret={connectResult.webhookSecret}
        />
      )}
    </>
  );
};
