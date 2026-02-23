/**
 * Provider Connection Module
 *
 * Barrel exports for provider connection types, helpers, and repository.
 */

// Types
export type {
  CIProviderType,
  PlatformProviderType,
  NotificationProviderType,
  ProviderType,
  ProviderConnectionRow,
  ProviderConnection,
  CreateProviderConnectionInput,
  UpdateProviderConnectionInput,
} from "./types.js";

// Helpers
export { rowToProviderConnection, validateCreateInput } from "./helpers.js";

// Repository
export {
  findByTenant,
  findByTenantAndProvider,
  findConnectionById,
  findByExternalOrgId,
  findActiveByProvider,
  createProviderConnection,
  updateProviderConnection,
  deactivateConnection,
  // Platform-specific lookups
  deactivateByTenantAndProvider,
  updateConnectionToken,
  findGitHubAppConnection,
  findSlackConnection,
  findGitLabConnection,
  findTenantByGitHubInstallation,
  findTenantBySlackWorkspace,
} from "./repository.js";
