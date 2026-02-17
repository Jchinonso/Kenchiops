/**
 * User Module
 *
 * Database operations for user authentication and OAuth identities.
 *
 * @module database/user
 */

// Types
export type {
  UserRow,
  OAuthIdentityRow,
  RefreshTokenRow,
  OAuthStateRow,
  User,
  OAuthIdentity,
  RefreshToken,
  OAuthState,
  OAuthProvider,
  UserRole,
  UserStatus,
  CreateUserInput,
  UpsertOAuthIdentityInput,
  OAuthStateInput,
  CreateRefreshTokenInput,
  RotateRefreshTokenInput,
  RotateRefreshTokenResult,
  OAuthProviderProfile,
  OAuthTokenResponse,
  JWTPayload,
  TokenPair,
  AuthenticatedUser,
  UserValidationRule,
  OAuthIdentityValidationRule,
} from "./types.js";

// Helpers (row mappers and validation)
export {
  rowToUser,
  extractUser,
  rowToOAuthIdentity,
  extractOAuthIdentity,
  rowToRefreshToken,
  extractRefreshToken,
  rowToOAuthState,
  extractOAuthState,
  validateCreateUserInput,
  validateUpsertOAuthIdentityInput,
} from "./helpers.js";

// Lookup operations
export {
  findUserById,
  findUserByEmail,
  findOAuthIdentity,
  findOAuthIdentitiesByUser,
} from "./serviceLookup.js";

// Lifecycle operations
export {
  createUser,
  updateLastLogin,
  updateUserTenant,
  deleteUser,
  upsertOAuthIdentity,
} from "./serviceLifecycle.js";

// OAuth state operations
export { createOAuthState, consumeOAuthState, cleanupExpiredStates } from "./oauthState.js";

// Refresh token operations
export {
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeTokenFamily,
  replaceRefreshToken,
  rotateRefreshTokenAtomically,
  cleanupExpiredRefreshTokens,
} from "./refreshToken.js";
