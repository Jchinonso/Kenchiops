/**
 * User Lifecycle Operations
 *
 * Create, update, and manage user accounts and OAuth identities.
 *
 * @module database/user/serviceLifecycle
 */

import {
  query,
  transaction,
  createLogger,
  getErrorMessage,
  ValidationError,
  validateId,
  USER_QUERIES,
  OAUTH_IDENTITY_QUERIES,
} from "../common.js";
import { AUTH_DEFAULTS } from "../../constants/index.js";
import type {
  UserRow,
  OAuthIdentityRow,
  User,
  OAuthIdentity,
  CreateUserInput,
  UpsertOAuthIdentityInput,
} from "./types.js";
import {
  rowToUser,
  rowToOAuthIdentity,
  validateCreateUserInput,
  validateUpsertOAuthIdentityInput,
} from "./helpers.js";
import { encryptValue } from "../../security/encryption.js";

const logger = createLogger("user-lifecycle");

// ==================== User Operations ====================

export const createUser = async (input: CreateUserInput): Promise<User> => {
  validateCreateUserInput(input);

  try {
    const result = await query<UserRow>(USER_QUERIES.INSERT, [
      input.email,
      input.displayName,
      input.avatarUrl,
      input.tenantId,
      input.role ?? AUTH_DEFAULTS.DEFAULT_ROLE,
      AUTH_DEFAULTS.DEFAULT_STATUS,
    ]);

    const user = rowToUser(result.rows[0]);

    logger.info("User created", {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return user;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger.error("Failed to create user", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const updateLastLogin = async (userId: string): Promise<User> => {
  validateId(userId, "userId");

  try {
    const result = await query<UserRow>(USER_QUERIES.UPDATE_LAST_LOGIN, [userId]);

    if (result.rows.length === 0) {
      throw new ValidationError("User not found", {
        operation: "updateLastLogin",
        metadata: { userId },
      });
    }

    return rowToUser(result.rows[0]);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger.error("Failed to update last login", {
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const updateUserTenant = async (userId: string, tenantId: string): Promise<User | null> => {
  validateId(userId, "userId");
  validateId(tenantId, "tenantId");

  try {
    const { rows } = await query<UserRow>(USER_QUERIES.UPDATE_TENANT, [tenantId, userId]);

    if (rows.length < 1) {
      // No row returned — user does not exist or a concurrent
      // request already linked a tenant (WHERE tenant_id IS NULL guard).
      return null;
    }

    const user = rowToUser(rows[0]);

    logger.info("User tenant updated", {
      userId,
      tenantId,
    });

    return user;
  } catch (error) {
    logger.error("Failed to update user tenant", {
      userId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Permanently delete a user and all associated data.
 * Removes OAuth identities, refresh tokens, and the user record
 * within a single transaction to ensure atomicity.
 */
export const deleteUser = async (userId: string): Promise<void> => {
  validateId(userId, "userId");

  try {
    await transaction(async (client) => {
      // Delete refresh tokens first (references user_id)
      await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
      // Delete OAuth identities (references user_id)
      await client.query("DELETE FROM oauth_identities WHERE user_id = $1", [userId]);
      // Delete the user record
      const { rowCount } = await client.query("DELETE FROM users WHERE id = $1", [userId]);

      if (rowCount === 0) {
        throw new ValidationError("User not found", {
          operation: "deleteUser",
          metadata: { userId },
        });
      }
    });

    logger.info("User permanently deleted", { userId });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger.error("Failed to delete user", {
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== OAuth Identity Operations ====================

export const upsertOAuthIdentity = async (
  input: UpsertOAuthIdentityInput
): Promise<OAuthIdentity> => {
  validateUpsertOAuthIdentityInput(input);

  try {
    // Encrypt OAuth tokens before storing in database
    const encryptedAccessToken = encryptValue(input.accessToken) ?? input.accessToken;
    const encryptedRefreshToken = encryptValue(input.refreshToken);

    const result = await query<OAuthIdentityRow>(OAUTH_IDENTITY_QUERIES.UPSERT, [
      input.userId,
      input.provider,
      input.providerUserId,
      input.providerUsername,
      input.providerEmail,
      input.providerAvatarUrl,
      input.instanceUrl,
      encryptedAccessToken,
      encryptedRefreshToken,
      input.tokenExpiresAt,
      input.scopes as string[],
      JSON.stringify(input.rawProfile),
    ]);

    const identity = rowToOAuthIdentity(result.rows[0]);

    logger.info("OAuth identity upserted", {
      identityId: identity.id,
      userId: input.userId,
      provider: input.provider,
    });

    return identity;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger.error("Failed to upsert OAuth identity", {
      userId: input.userId,
      provider: input.provider,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
