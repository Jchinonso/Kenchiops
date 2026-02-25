/**
 * User PII Constants
 *
 * SQL queries and configuration for PII access and GDPR erasure operations.
 *
 * @module constants/userPii
 */

// ==================== Redacted Values ====================

export const PII_REDACTED = {
  /** Replacement for erased email addresses. */
  EMAIL: "[REDACTED]",
  /** Replacement for erased display names. */
  DISPLAY_NAME: "[REDACTED]",
  /** Replacement for erased usernames. */
  USERNAME: "deleted_user",
} as const;

// ==================== SQL Queries ====================

export const USER_PII_QUERIES = {
  GET_USER_PII: `
    SELECT u.id, u.email, u.display_name, u.github_username,
           u.created_at, u.last_login_at,
           COALESCE(
             json_agg(
               json_build_object('provider', oi.provider, 'provider_user_id', oi.provider_user_id)
             ) FILTER (WHERE oi.id IS NOT NULL),
             '[]'
           ) AS oauth_identities
    FROM users u
    LEFT JOIN oauth_identities oi ON oi.user_id = u.id
    WHERE u.id = $1
    GROUP BY u.id
  `,

  /** GDPR Article 17 erasure: replace PII with redacted values. */
  ERASE_USER_PII: `
    UPDATE users
    SET email = $2, display_name = $3, github_username = $4,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, updated_at
  `,

  /** Remove OAuth identities for a user (part of erasure). */
  DELETE_OAUTH_IDENTITIES: `
    DELETE FROM oauth_identities WHERE user_id = $1
  `,
} as const;
