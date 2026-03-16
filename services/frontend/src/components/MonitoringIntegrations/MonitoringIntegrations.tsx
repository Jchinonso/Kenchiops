/**
 * Monitoring Integrations Section
 *
 * Displays webhook URLs and setup instructions for connecting
 * monitoring tools (PagerDuty, Datadog, etc.) to the incident triage service.
 * Rendered as a Card section inside the Settings page.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Copy, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceHealthInfo, MonitoringProvider } from "./types";
import { MONITORING_PROVIDERS } from "./constants";
import {
  computeHealthStatus,
  healthDotColor,
  healthLabel,
  healthTextColor,
  formatRelativeTime,
} from "./helpers";

// ==================== Types ====================

interface MonitoringIntegrationsProps {
  readonly integrationHealth?: Readonly<Record<string, SourceHealthInfo>> | null;
  readonly tenantId?: string;
}

// ==================== Sub-Components ====================

interface ProviderCardProps {
  readonly provider: MonitoringProvider;
  readonly health?: SourceHealthInfo;
  readonly tenantId?: string;
}

/** Public base URL for webhook endpoints. Uses VITE_PUBLIC_URL when deployed, falls back to browser origin for local dev. */
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_URL || window.location.origin;

const ProviderCard = ({ provider, health, tenantId }: ProviderCardProps) => {
  const [copied, setCopied] = useState(false);
  const Icon = provider.icon;
  const tenantSuffix = tenantId ? `/${tenantId}` : "";
  const webhookUrl = provider.webhookPath
    ? `${PUBLIC_BASE_URL}${provider.webhookPath}${tenantSuffix}`
    : null;

  const handleCopy = useCallback(async () => {
    if (!webhookUrl) {
      return;
    }
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [webhookUrl]);

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        provider.active
          ? "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50"
          : "border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg",
              provider.active
                ? "bg-indigo-50 dark:bg-indigo-900/30"
                : "bg-zinc-100 dark:bg-zinc-800"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5",
                provider.active
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-zinc-400 dark:text-zinc-500"
              )}
            />
          </div>
          <div>
            <p
              className={cn(
                "font-medium text-sm",
                provider.active
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400"
              )}
            >
              {provider.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {provider.description}
            </p>
          </div>
        </div>
        {provider.active ? (
          <div className="flex flex-col items-end gap-1 shrink-0">
            {(() => {
              const status = computeHealthStatus(health);
              return (
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full", healthDotColor(status))} />
                  <span className={cn("text-xs font-medium", healthTextColor(status))}>
                    {healthLabel(status)}
                  </span>
                </div>
              );
            })()}
            {health && health.eventCount > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                <span>{health.eventCount} events</span>
                {health.lastReceived && <span>Last {formatRelativeTime(health.lastReceived)}</span>}
              </div>
            )}
          </div>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-xs">
            Coming Soon
          </Badge>
        )}
      </div>

      {provider.active && webhookUrl && (
        <div className="mt-4 space-y-3">
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
                onClick={handleCopy}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors",
                  copied
                    ? "border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Required Headers */}
          {provider.requiredHeaders && provider.requiredHeaders.length > 0 && (
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1.5">
                Required Headers
              </label>
              <div className="flex flex-wrap gap-1.5">
                {provider.requiredHeaders.map((header) => (
                  <code
                    key={header}
                    className="text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700"
                  >
                    {header}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Setup Instructions */}
          {provider.setupSteps && provider.setupSteps.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors select-none">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                Setup Instructions
              </summary>
              <ol className="mt-2 ml-5 space-y-1.5 list-decimal">
                {provider.setupSteps.map((step) => (
                  <li
                    key={step}
                    className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed"
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== Main Component ====================

export const MonitoringIntegrations = ({
  integrationHealth,
  tenantId,
}: MonitoringIntegrationsProps) => {
  const healthMap = integrationHealth ?? {};

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-indigo-500" />
          <CardTitle>Monitoring Integrations</CardTitle>
        </div>
        <CardDescription>
          Connect your monitoring tools to receive AI-triaged incident alerts.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-3">
        {!tenantId && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
            Connect your GitHub organization to generate tenant-specific webhook URLs.
          </p>
        )}
        {MONITORING_PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            health={healthMap[provider.id]}
            tenantId={tenantId}
          />
        ))}
      </CardContent>
    </Card>
  );
};
