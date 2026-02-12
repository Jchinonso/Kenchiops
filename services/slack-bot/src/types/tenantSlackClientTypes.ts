/**
 * Tenant Slack Client Types
 *
 * Type definitions for multi-tenant Slack client management.
 * Located in types/ directory because it references vendor SDK types.
 */

import type { WebClient } from "@slack/web-api";

/**
 * Client cache to avoid creating new clients for every request.
 * Key: installation_id, Value: { client, createdAt }
 */
export interface CachedClient {
  readonly client: WebClient;
  readonly createdAt: number;
  readonly workspaceId: string;
}
