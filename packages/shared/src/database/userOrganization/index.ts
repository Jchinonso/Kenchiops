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
  TeamMemberRow,
  TeamMember,
} from "./types.js";

// Helpers
export {
  rowToUserOrganization,
  rowToUserOrganizationWithTenant,
  rowToTeamMember,
} from "./helpers.js";

// Repository
export {
  findOrganizationsByUser,
  addUserOrganization,
  setDefaultOrganization,
  countMembersByTenant,
  findMembersByTenant,
  updateMemberRole,
  removeMemberFromTenant,
  countOwnersByTenant,
} from "./repository.js";
