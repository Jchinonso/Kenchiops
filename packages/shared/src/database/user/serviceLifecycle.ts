/**
 * User Lifecycle Operations
 *
 * Create, update, and manage user accounts and OAuth identities.
 *
 * @module database/user/serviceLifecycle
 */

import {
  query,
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

export const updateUserTenant = async (userId: string, tenantId: string): Promise<User> => {
  validateId(userId, "userId");
  validateId(tenantId, "tenantId");

  try {
    const result = await query<UserRow>(USER_QUERIES.UPDATE_TENANT, [tenantId, userId]);

    if (result.rows.length === 0) {
      throw new ValidationError("User not found", {
        operation: "updateUserTenant",
        metadata: { userId, tenantId },
      });
    }

    const user = rowToUser(result.rows[0]);

    logger.info("User tenant updated", {
      userId,
      tenantId,
    });

    return user;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    logger.error("Failed to update user tenant", {
      userId,
      tenantId,
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
    const result = await query<OAuthIdentityRow>(OAUTH_IDENTITY_QUERIES.UPSERT, [
      input.userId,
      input.provider,
      input.providerUserId,
      input.providerUsername,
      input.providerEmail,
      input.providerAvatarUrl,
      input.instanceUrl,
      input.accessToken,
      input.refreshToken,
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
