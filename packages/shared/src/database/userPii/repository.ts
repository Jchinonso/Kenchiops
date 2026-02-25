/**
 * User PII Repository
 *
 * Database operations for PII access and GDPR erasure.
 *
 * @module database/userPii/repository
 */

import { query, transaction, createLogger, getErrorMessage, validateId } from "../common.js";
import { USER_PII_QUERIES, PII_REDACTED } from "../../constants/userPii.js";
import type {
  UserPii,
  UserPiiRow,
  OAuthIdentityRowEntry,
  OAuthIdentitySummary,
  PiiErasureResult,
} from "./types.js";

const logger = createLogger("user-pii-repository");

// ==================== Row Mapper ====================

const parseOAuthIdentities = (
  raw: string | readonly OAuthIdentityRowEntry[]
): readonly OAuthIdentitySummary[] => {
  const entries: readonly OAuthIdentityRowEntry[] = typeof raw === "string" ? JSON.parse(raw) : raw;

  return Object.freeze(
    entries.map((entry) => ({
      provider: entry.provider,
      providerUserId: entry.provider_user_id,
    }))
  );
};

const mapRowToUserPii = (row: UserPiiRow): UserPii => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  githubUsername: row.github_username,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
  oauthIdentities: parseOAuthIdentities(row.oauth_identities),
});

// ==================== Public API ====================

/**
 * Get PII data for a specific user.
 * Used for GDPR Subject Access Requests (SAR / Article 15).
 *
 * @param userId - User ID
 * @returns User PII or null if user not found
 */
export const getUserPii = async (userId: string): Promise<UserPii | null> => {
  validateId(userId, "userId");

  try {
    const result = await query<UserPiiRow>(USER_PII_QUERIES.GET_USER_PII, [userId]);
    return result.rows.length > 0 ? mapRowToUserPii(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get user PII", {
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Erase PII for a user (GDPR Article 17 - Right to Erasure).
 * Replaces PII fields with redacted placeholders and removes OAuth identities.
 *
 * This operation is irreversible.
 *
 * @param userId - User ID to erase
 * @returns Erasure result with timestamp
 */
export const erasePii = async (userId: string): Promise<PiiErasureResult> => {
  validateId(userId, "userId");

  try {
    const result = await transaction(async (client) => {
      // Replace PII with redacted values
      const eraseResult = await client.query<{ readonly id: string; readonly updated_at: Date }>(
        USER_PII_QUERIES.ERASE_USER_PII,
        [userId, PII_REDACTED.EMAIL, PII_REDACTED.DISPLAY_NAME, PII_REDACTED.USERNAME]
      );

      if (eraseResult.rows.length === 0) {
        return null;
      }

      // Remove OAuth identities
      await client.query(USER_PII_QUERIES.DELETE_OAUTH_IDENTITIES, [userId]);

      return eraseResult.rows[0];
    });

    if (result === null) {
      logger.warn("User not found for PII erasure", { userId });
      return { userId, erasedAt: new Date(), oauthIdentitiesRemoved: false };
    }

    logger.info("PII erased for user", { userId });

    return {
      userId,
      erasedAt: result.updated_at,
      oauthIdentitiesRemoved: true,
    };
  } catch (error) {
    logger.error("Failed to erase PII", {
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
