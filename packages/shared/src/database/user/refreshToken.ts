/**
 * Refresh Token Operations
 *
 * JWT refresh token storage with rotation and family-based revocation.
 *
 * @module database/user/refreshToken
 */

import {
  query,
  transaction,
  createLogger,
  getErrorMessage,
  validateId,
  validateNonEmptyString,
  REFRESH_TOKEN_QUERIES,
} from "../common.js";
import type {
  RefreshTokenRow,
  RefreshToken,
  CreateRefreshTokenInput,
  RotateRefreshTokenInput,
  RotateRefreshTokenResult,
} from "./types.js";
import { extractRefreshToken, rowToRefreshToken } from "./helpers.js";

const logger = createLogger("refresh-token");

export const createRefreshToken = async (input: CreateRefreshTokenInput): Promise<RefreshToken> => {
  validateId(input.userId, "userId");
  validateNonEmptyString(input.tokenHash, "tokenHash");
  validateNonEmptyString(input.familyId, "familyId");

  try {
    const result = await query<RefreshTokenRow>(REFRESH_TOKEN_QUERIES.INSERT, [
      input.userId,
      input.tokenHash,
      input.familyId,
      input.userAgent,
      input.ipAddress,
    ]);

    return rowToRefreshToken(result.rows[0]);
  } catch (error) {
    logger.error("Failed to create refresh token", {
      userId: input.userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const findRefreshTokenByHash = async (tokenHash: string): Promise<RefreshToken | null> => {
  validateNonEmptyString(tokenHash, "tokenHash");

  try {
    const result = await query<RefreshTokenRow>(REFRESH_TOKEN_QUERIES.FIND_BY_HASH, [tokenHash]);
    return extractRefreshToken(result.rows);
  } catch (error) {
    logger.error("Failed to find refresh token", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const revokeRefreshToken = async (tokenId: string): Promise<void> => {
  validateId(tokenId, "tokenId");

  try {
    await query(REFRESH_TOKEN_QUERIES.REVOKE, [tokenId]);

    logger.debug("Refresh token revoked", { tokenId });
  } catch (error) {
    logger.error("Failed to revoke refresh token", {
      tokenId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const revokeTokenFamily = async (familyId: string): Promise<number> => {
  validateNonEmptyString(familyId, "familyId");

  try {
    const result = await query(REFRESH_TOKEN_QUERIES.REVOKE_FAMILY, [familyId]);
    const count = result.rowCount ?? 0;

    logger.info("Token family revoked", { familyId, count });

    return count;
  } catch (error) {
    logger.error("Failed to revoke token family", {
      familyId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const replaceRefreshToken = async (oldId: string, newId: string): Promise<void> => {
  validateId(oldId, "oldId");
  validateId(newId, "newId");

  try {
    await query(REFRESH_TOKEN_QUERIES.REPLACE, [oldId, newId]);

    logger.debug("Refresh token replaced", { oldId, newId });
  } catch (error) {
    logger.error("Failed to replace refresh token", {
      oldId,
      newId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Atomically rotate a refresh token within a single database transaction.
 *
 * Uses SELECT ... FOR UPDATE to lock the token row, preventing concurrent
 * rotation attempts from creating a race condition (false reuse detection).
 *
 * Returns null if the token is not found. Throws if the token was already
 * revoked (reuse detected) — the caller should revoke the entire family.
 */
export const rotateRefreshTokenAtomically = async (
  input: RotateRefreshTokenInput
): Promise<RotateRefreshTokenResult | null> => {
  validateNonEmptyString(input.tokenHash, "tokenHash");
  validateNonEmptyString(input.newTokenHash, "newTokenHash");

  return transaction(async (client) => {
    // Lock the row to prevent concurrent rotation
    const findResult = await client.query<RefreshTokenRow>(
      REFRESH_TOKEN_QUERIES.FIND_BY_HASH_FOR_UPDATE,
      [input.tokenHash]
    );

    const oldToken = extractRefreshToken(findResult.rows);

    if (!oldToken) {
      return null;
    }

    if (oldToken.revokedAt !== null) {
      // Revoke entire family within the same transaction
      await client.query(REFRESH_TOKEN_QUERIES.REVOKE_FAMILY, [oldToken.familyId]);

      logger.warn("Refresh token reuse detected in atomic rotation", {
        familyId: oldToken.familyId,
        userId: oldToken.userId,
      });

      return { status: "reused", oldToken };
    }

    // Create the replacement token
    const insertResult = await client.query<RefreshTokenRow>(REFRESH_TOKEN_QUERIES.INSERT, [
      oldToken.userId,
      input.newTokenHash,
      oldToken.familyId,
      input.userAgent,
      input.ipAddress,
    ]);

    const newToken = rowToRefreshToken(insertResult.rows[0]);

    // Revoke the old token and link to replacement
    await client.query(REFRESH_TOKEN_QUERIES.REPLACE, [oldToken.id, newToken.id]);

    logger.debug("Refresh token rotated atomically", {
      oldId: oldToken.id,
      newId: newToken.id,
      familyId: oldToken.familyId,
    });

    return { status: "rotated", oldToken, newToken };
  });
};

export const cleanupExpiredRefreshTokens = async (): Promise<number> => {
  try {
    const result = await query(REFRESH_TOKEN_QUERIES.CLEANUP_EXPIRED, []);
    const count = result.rowCount ?? 0;

    if (count > 0) {
      logger.info("Cleaned up expired refresh tokens", { count });
    }

    return count;
  } catch (error) {
    logger.error("Failed to cleanup expired refresh tokens", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};
