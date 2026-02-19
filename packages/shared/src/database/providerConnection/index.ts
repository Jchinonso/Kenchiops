/**
 * Provider Connection Module
 *
 * Barrel exports for provider connection types, helpers, and repository.
 */

// Types
export type {
  CIProviderType,
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
  createProviderConnection,
  updateProviderConnection,
  deactivateConnection,
} from "./repository.js";
