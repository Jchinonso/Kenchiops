/**
 * Refresh Token Operations
 *
 * JWT refresh token storage with rotation and family-based revocation.
 *
 * @module database/user/refreshToken
 */

import {
  query,
  createLogger,
  getErrorMessage,
  validateId,
  validateNonEmptyString,
  REFRESH_TOKEN_QUERIES,
} from "../common.js";
import type { RefreshTokenRow, RefreshToken, CreateRefreshTokenInput } from "./types.js";
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
