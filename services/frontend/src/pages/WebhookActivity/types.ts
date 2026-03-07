/**
 * Shared types for Webhook Activity page components.
 */

import type { WebhookActivityRecord } from "@/hooks/useDashboardData";

export interface WebhookRowProps {
  readonly activity: WebhookActivityRecord;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

export interface ExpandedWebhookRowProps {
  readonly activity: WebhookActivityRecord;
}

export type WebhookActivityProps = Record<string, never>;
