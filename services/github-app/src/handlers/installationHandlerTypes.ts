/**
 * Types for Installation Handler
 *
 * @module handlers/installationHandlerTypes
 */

import type { Tenant } from "@kenchi/shared";

/**
 * Result of handling an installation webhook
 */
export interface InstallationHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly tenantId?: string;
}

/**
 * Result type for tenant lookup
 */
export type TenantLookupResult =
  | { found: true; tenant: Tenant }
  | { found: false; result: InstallationHandlerResult };
