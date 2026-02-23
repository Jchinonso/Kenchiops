/**
 * Integration Service Types
 *
 * Result types for integration OAuth service operations.
 * These are domain types returned by the service layer.
 *
 * @module services/integrationServiceTypes
 */

import type { IntegrationProvider, RequestContext } from "@kenchi/shared";

import type { IntegrationOAuthPort } from "../ports/integrationOAuthPort.js";

// ==================== Internal Types ====================

/** Options for attempting to create a webhook on a provider. */
export interface TryCreateWebhookOptions {
  readonly adapter: IntegrationOAuthPort;
  readonly accessValue: string;
  readonly webhookUrl: string;
  readonly webhookCredential: string;
  readonly teamId: string | null;
  readonly provider: IntegrationProvider;
  readonly context: RequestContext;
}

/** Result of a webhook creation attempt. */
export interface WebhookCreationResult {
  readonly webhookCreated: boolean;
  readonly webhookId: string | null;
}

// ==================== Result Types ====================

export interface ConnectIntegrationResult {
  readonly connectionId: string;
  readonly provider: IntegrationProvider;
  readonly teamName: string | null;
  readonly webhookCreated: boolean;
}

export interface DisconnectIntegrationResult {
  readonly connectionId: string;
  readonly webhookDeleted: boolean;
}

export interface IntegrationConnectionStatus {
  readonly provider: string;
  readonly connected: boolean;
  readonly connectionId: string;
  readonly connectionName: string | null;
  readonly connectedAt: string;
}
