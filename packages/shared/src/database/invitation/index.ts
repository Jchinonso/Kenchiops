/**
 * Team Invitation Module
 *
 * @module database/invitation
 */

// Types
export type {
  InvitationRow,
  Invitation,
  InvitationStatus,
  InvitationRole,
  CreateInvitationInput,
} from "./types.js";

// Helpers
export {
  rowToInvitation,
  generateInvitationToken,
  calculateExpiresAt,
  validateCreateInvitationInput,
} from "./helpers.js";

// Repository
export {
  createInvitation,
  findInvitationByToken,
  findPendingInvitationsByTenant,
  findPendingInvitationsByEmail,
  acceptInvitation,
  declineInvitation,
  revokeInvitation,
  expireStaleInvitations,
} from "./repository.js";
