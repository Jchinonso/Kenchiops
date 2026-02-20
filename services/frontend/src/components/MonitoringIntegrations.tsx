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
import {
  Siren,
  Activity,
  Cloud,
  BarChart3,
  Gauge,
  Radio,
  Copy,
  Check,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== Types ====================

interface MonitoringProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: LucideIcon;
  readonly active: boolean;
  readonly description: string;
  readonly webhookPath?: string;
  readonly setupSteps?: readonly string[];
  readonly requiredHeaders?: readonly string[];
}

// ==================== Provider Config ====================

const MONITORING_PROVIDERS: readonly MonitoringProvider[] = [
  {
    id: "pagerduty",
    name: "PagerDuty",
    icon: Siren,
    active: true,
    webhookPath: "/webhooks/pagerduty",
    description:
      "Receive PagerDuty incident alerts with automatic severity classification and AI triage.",
    setupSteps: [
      "In PagerDuty, go to Integrations > Generic Webhooks (v3)",
      'Click "New Webhook"',
      "Paste the webhook URL shown above as the Endpoint URL",
      'Set the Scope to "Account" or select specific services',
      'Subscribe to "incident.triggered" events (at minimum)',
      "Copy the signing secret PagerDuty generates and set it as PAGERDUTY_WEBHOOK_SECRET in your Kenchi environment",
      "Save the webhook and trigger a test incident to verify alerts appear in Kenchi",
    ],
    requiredHeaders: ["x-webhook-id", "x-pagerduty-signature"],
  },
  {
    id: "datadog",
    name: "Datadog",
    icon: Activity,
    active: true,
    webhookPath: "/webhooks/datadog",
    description: "Datadog webhook integration for monitor alerts and event streams.",
    setupSteps: [
      "In Datadog, go to Integrations > Webhooks",
      'Click "New Webhook" and paste the webhook URL shown above',
      "Use the default JSON payload template with $ALERT_ID, $ALERT_TITLE, $ALERT_STATUS, $PRIORITY, $HOSTNAME, $TAGS",
      "Generate a shared secret and set it as DATADOG_WEBHOOK_SECRET in your Kenchi environment",
      "Configure monitors to include the header x-kenchi-webhook-secret with the same secret value",
      "Save and trigger a test monitor alert to verify",
    ],
    requiredHeaders: ["x-kenchi-webhook-secret"],
  },
  {
    id: "grafana",
    name: "Grafana",
    icon: Gauge,
    active: true,
    webhookPath: "/webhooks/grafana",
    description: "Grafana unified alerting webhook receiver with HMAC signature verification.",
    setupSteps: [
      "In Grafana, go to Alerting > Contact Points",
      'Create a new contact point with type "Webhook"',
      "Paste the webhook URL shown above",
      "Enable the Authorization header and set a shared secret",
      "Set the secret as GRAFANA_WEBHOOK_SECRET in your Kenchi environment",
      "Configure alert rules to use this contact point",
      "Trigger a test alert to verify",
    ],
    requiredHeaders: ["x-grafana-alerting-signature", "x-grafana-alerting-timestamp"],
  },
  {
    id: "prometheus",
    name: "Prometheus",
    icon: BarChart3,
    active: true,
    webhookPath: "/webhooks/prometheus",
    description: "Prometheus Alertmanager webhook receiver for firing alerts.",
    setupSteps: [
      "In your Alertmanager configuration (alertmanager.yml), add a webhook_configs entry",
      "Set the URL to the webhook URL shown above",
      "Add http_config headers with x-kenchi-webhook-secret set to your chosen secret",
      "Set the same secret as PROMETHEUS_WEBHOOK_SECRET in your Kenchi environment",
      "Reload Alertmanager configuration",
      "Trigger a test alert to verify",
    ],
    requiredHeaders: ["x-kenchi-webhook-secret"],
  },
  {
    id: "cloudwatch",
    name: "CloudWatch",
    icon: Cloud,
    active: false,
    description: "AWS CloudWatch alarms via SNS subscription notifications.",
  },
];

// ==================== Sub-Components ====================

interface ProviderCardProps {
  readonly provider: MonitoringProvider;
}

/** Public base URL for webhook endpoints. Uses VITE_PUBLIC_URL when deployed, falls back to browser origin for local dev. */
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_URL || window.location.origin;

const ProviderCard = ({ provider }: ProviderCardProps) => {
  const [copied, setCopied] = useState(false);
  const Icon = provider.icon;
  const webhookUrl = provider.webhookPath ? `${PUBLIC_BASE_URL}${provider.webhookPath}` : null;

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
          ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50"
          : "border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg",
              provider.active
                ? "bg-indigo-50 dark:bg-indigo-900/30"
                : "bg-gray-100 dark:bg-gray-800"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5",
                provider.active
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-400 dark:text-gray-500"
              )}
            />
          </div>
          <div>
            <p
              className={cn(
                "font-medium text-sm",
                provider.active
                  ? "text-gray-900 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              {provider.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {provider.description}
            </p>
          </div>
        </div>
        <Badge
          variant={provider.active ? "default" : "secondary"}
          className={cn(
            "shrink-0 text-xs",
            provider.active
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
              : ""
          )}
        >
          {provider.active ? "Active" : "Coming Soon"}
        </Badge>
      </div>

      {provider.active && webhookUrl && (
        <div className="mt-4 space-y-3">
          {/* Webhook URL */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1.5">
              Webhook URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 truncate select-all">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors",
                  copied
                    ? "border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
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
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1.5">
                Required Headers
              </label>
              <div className="flex flex-wrap gap-1.5">
                {provider.requiredHeaders.map((header) => (
                  <code
                    key={header}
                    className="text-xs font-mono bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700"
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
                    className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed"
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

export const MonitoringIntegrations = () => (
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
      {MONITORING_PROVIDERS.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} />
      ))}
    </CardContent>
  </Card>
);
