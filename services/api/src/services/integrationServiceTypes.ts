/**
 * Integration Service Types
 *
 * Result types for integration OAuth service operations.
 * These are domain types returned by the service layer.
 *
 * @module services/integrationServiceTypes
 */

import type { IntegrationProvider } from "@kenchi/shared";

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
