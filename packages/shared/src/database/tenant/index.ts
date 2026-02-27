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
  findByOrgNameAndProvider,
  findByOrgName,
  findByGitLabGroup,
  findById,
  getActiveTenants,
  getTenantStatistics,
  countTenantMembers,
} from "./serviceLookup.js";

// Lifecycle operations
export {
  createFromGitHubInstall,
  createFromGitHubLogin,
  createFromGitLabGroup,
  createFromBitbucketWorkspace,
  createFromAzureDevOpsAccount,
  linkSlackWorkspace,
  createFromSlackInstall,
  activate,
  suspend,
  deleteTenant,
  softDeleteTenant,
  hardDeleteTenant,
  handleGitHubUninstall,
  updateTenantOrgName,
  markTenantAsPersonal,
} from "./serviceLifecycle.js";

// Audit operations
export { insertAuditLog, logAuditEvent, getAuditLog } from "./audit.js";

// Reactivation validation
export type {
  ReactivationWarningType,
  ReactivationWarning,
  ReactivationReport,
} from "./reactivationValidatorTypes.js";

export { validateReactivation } from "./reactivationValidator.js";

// RAG budget configuration
export { getRAGBudgetConfig, updateRAGBudgetConfig } from "./ragConfig.js";
