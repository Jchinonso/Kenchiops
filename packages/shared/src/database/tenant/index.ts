/**
 * Tenant Module
 *
 * Database operations for tenant management.
 *
 * @module database/tenant
 */

// Types
export type {
  TenantRow,
  TenantStatistics,
  AuditRow,
  UpdateRAGBudgetInput,
  TenantRAGBudgetConfig,
  FieldMapping,
  UpdateQueryResult,
} from "./types.js";

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  rowToTenant,
  extractTenant,
  getStatusAfterGitHubInstall,
  getStatusAfterSlackInstall,
  mapRowToAuditEntry,
  mapTenantToRAGBudgetConfig,
  // Validation
  validateId,
  validateInstallationId,
  validateGitHubInstallInput,
  validateSlackLinkInput,
  validateSlackInstallInput,
  validateUpdateRAGBudgetInput,
  // Query building
  buildUpdateQuery,
} from "./helpers.js";

// Lookup operations
export {
  findByGitHubInstallation,
  findByGitHubOrg,
  findByGitLabGroup,
  findBySlackWorkspace,
  findById,
  findPendingSlackTenants,
  getActiveTenants,
  getTenantStatistics,
  getSlackCredentials,
  countTenantMembers,
} from "./serviceLookup.js";

// Lifecycle operations
export {
  createFromGitHubInstall,
  createFromGitLabGroup,
  linkSlackWorkspace,
  createFromSlackInstall,
  activate,
  suspend,
  deleteTenant,
  hardDeleteTenant,
  handleGitHubUninstall,
  updateSlackToken,
} from "./serviceLifecycle.js";

// Audit operations
export { insertAuditLog, logAuditEvent, getAuditLog } from "./audit.js";

// RAG budget configuration
export { getRAGBudgetConfig, updateRAGBudgetConfig } from "./ragConfig.js";
