/**
 * API Key Repository
 *
 * Database operations for API key management.
 * Keys are stored as SHA-256 hashes; plaintext is returned only at creation time.
 *
 * @module database/apiKey/repository
 */

import { query, createLogger, generateEventId, getErrorMessage } from "../common.js";
import type { ApiKeyRow, ApiKey, ApiKeyWithSecret, CreateApiKeyInput } from "./types.js";
import { rowToApiKey, generateApiKey, hashApiKey, validateCreateApiKeyInput } from "./helpers.js";

const logger = createLogger("api-key-repository");

const API_KEY_ID_PREFIX = "ak";

// ==================== SQL Queries ====================

const QUERIES = {
  INSERT: `
    INSERT INTO api_keys (id, tenant_id, user_id, name, key_hash, key_prefix, scopes, role, status, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    RETURNING *
  `,
  FIND_BY_HASH: `
    SELECT * FROM api_keys
    WHERE key_hash = $1 AND status = 'active'
  `,
  FIND_BY_TENANT: `
    SELECT * FROM api_keys
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `,
  REVOKE: `
    UPDATE api_keys
    SET status = 'revoked', updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `,
  UPDATE_LAST_USED: `
    UPDATE api_keys
    SET last_used_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `,
} as const;

// ==================== Public API ====================

/**
 * Create a new API key. Returns the key with plaintext (shown once).
 */
export const createApiKey = async (input: CreateApiKeyInput): Promise<ApiKeyWithSecret> => {
  validateCreateApiKeyInput(input);

  const startTime = Date.now();
  const id = generateEventId(API_KEY_ID_PREFIX);
  const { plaintext, hash, prefix } = generateApiKey();
  const role = input.role ?? "member";
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
    : null;

  try {
    const result = await query<ApiKeyRow>(QUERIES.INSERT, [
      id,
      input.tenantId,
      input.userId,
      input.name.trim(),
      hash,
      prefix,
      input.scopes,
      role,
      expiresAt,
    ]);

    const apiKey = rowToApiKey(result.rows[0]);
    logger.info("API key created", {
      apiKeyId: id,
      tenantId: input.tenantId,
      userId: input.userId,
      durationMs: Date.now() - startTime,
    });
    return { apiKey, plaintext };
  } catch (error) {
    logger.error("Failed to create API key", {
      tenantId: input.tenantId,
      error: getErrorMessage(error),
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
};

/**
 * Authenticate a request by plaintext API key.
 * Returns the active, non-expired key or null.
 * Updates last_used_at on successful auth (fire-and-forget).
 */
export const authenticateApiKey = async (plaintext: string): Promise<ApiKey | null> => {
  const startTime = Date.now();
  const hash = hashApiKey(plaintext);

  try {
    const result = await query<ApiKeyRow>(QUERIES.FIND_BY_HASH, [hash]);

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = rowToApiKey(result.rows[0]);

    // Reject expired keys
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Fire-and-forget update last_used_at (non-critical)
    const updateStart = Date.now();
    (async () => {
      try {
        await query(QUERIES.UPDATE_LAST_USED, [apiKey.id]);
      } catch (updateError) {
        logger.warn("Failed to update API key last_used_at", {
          apiKeyId: apiKey.id,
          error: getErrorMessage(updateError),
          durationMs: Date.now() - updateStart,
        });
      }
    })();

    logger.info("API key authenticated", {
      apiKeyId: apiKey.id,
      tenantId: apiKey.tenantId,
      durationMs: Date.now() - startTime,
    });
    return apiKey;
  } catch (error) {
    logger.error("Failed to authenticate API key", {
      error: getErrorMessage(error),
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
};

/**
 * List all API keys for a tenant (active and revoked).
 */
export const findApiKeysByTenant = async (tenantId: string): Promise<readonly ApiKey[]> => {
  const startTime = Date.now();

  try {
    const result = await query<ApiKeyRow>(QUERIES.FIND_BY_TENANT, [tenantId]);
    return result.rows.map(rowToApiKey);
  } catch (error) {
    logger.error("Failed to list API keys", {
      tenantId,
      error: getErrorMessage(error),
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
};

/**
 * Revoke an API key. Only keys belonging to the specified tenant can be revoked.
 * Returns the revoked key, or null if not found.
 */
export const revokeApiKey = async (apiKeyId: string, tenantId: string): Promise<ApiKey | null> => {
  const startTime = Date.now();

  try {
    const result = await query<ApiKeyRow>(QUERIES.REVOKE, [apiKeyId, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = rowToApiKey(result.rows[0]);
    logger.info("API key revoked", {
      apiKeyId,
      tenantId,
      durationMs: Date.now() - startTime,
    });
    return apiKey;
  } catch (error) {
    logger.error("Failed to revoke API key", {
      apiKeyId,
      tenantId,
      error: getErrorMessage(error),
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
};
