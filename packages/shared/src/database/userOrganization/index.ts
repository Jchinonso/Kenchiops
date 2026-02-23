/**
 * User Organization Module
 *
 * Many-to-many relationship between users and tenant organizations.
 *
 * @module database/userOrganization
 */

// Types
export type {
  UserOrganizationRow,
  UserOrganization,
  UserOrganizationWithTenantRow,
  UserOrganizationWithTenant,
  AddUserOrganizationInput,
} from "./types.js";

// Helpers
export { rowToUserOrganization, rowToUserOrganizationWithTenant } from "./helpers.js";

// Repository
export {
  findOrganizationsByUser,
  addUserOrganization,
  setDefaultOrganization,
  countMembersByTenant,
} from "./repository.js";
