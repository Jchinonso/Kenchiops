/**
 * User Lookup Operations
 *
 * Read-only database operations for users and OAuth identities.
 *
 * @module database/user/serviceLookup
 */

import {
  query,
  createLogger,
  getErrorMessage,
  validateId,
  validateNonEmptyString,
  USER_QUERIES,
  OAUTH_IDENTITY_QUERIES,
} from "../common.js";
import type { UserRow, OAuthIdentityRow, OAuthProvider, User, OAuthIdentity } from "./types.js";
import { extractUser, rowToOAuthIdentity, extractOAuthIdentity } from "./helpers.js";

const logger = createLogger("user-lookup");

// ==================== User Lookups ====================

export const findUserById = async (id: string): Promise<User | null> => {
  validateId(id, "id");

  try {
    const result = await query<UserRow>(USER_QUERIES.FIND_BY_ID, [id]);
    return extractUser(result.rows);
  } catch (error) {
    logger.error("Failed to find user by ID", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  validateNonEmptyString(email, "email");

  try {
    const result = await query<UserRow>(USER_QUERIES.FIND_BY_EMAIL, [email]);
    return extractUser(result.rows);
  } catch (error) {
    logger.error("Failed to find user by email", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== OAuth Identity Lookups ====================

export const findOAuthIdentity = async (
  provider: OAuthProvider,
  providerUserId: string,
  instanceUrl: string | null
): Promise<OAuthIdentity | null> => {
  validateNonEmptyString(providerUserId, "providerUserId");

  try {
    const result = await query<OAuthIdentityRow>(OAUTH_IDENTITY_QUERIES.FIND_BY_PROVIDER, [
      provider,
      providerUserId,
      instanceUrl,
    ]);
    return extractOAuthIdentity(result.rows);
  } catch (error) {
    logger.error("Failed to find OAuth identity", {
      provider,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const findOAuthIdentitiesByUser = async (
  userId: string
): Promise<readonly OAuthIdentity[]> => {
  validateId(userId, "userId");

  try {
    const result = await query<OAuthIdentityRow>(OAUTH_IDENTITY_QUERIES.FIND_BY_USER, [userId]);
    return result.rows.map(rowToOAuthIdentity);
  } catch (error) {
    logger.error("Failed to find OAuth identities for user", {
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
