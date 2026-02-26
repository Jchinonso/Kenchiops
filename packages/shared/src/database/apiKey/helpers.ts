/**
 * API Key Helpers
 *
 * Pure functions for API key generation, hashing, and validation.
 *
 * @module database/apiKey/helpers
 */

import crypto from "node:crypto";
import { ValidationError } from "../../core/errors.js";
import type { ApiKeyRow, ApiKey, ApiKeyScope, CreateApiKeyInput } from "./types.js";

// ==================== Constants ====================

/** API key prefix for visual identification. */
const KEY_PREFIX = "kak_";

/** Length of the random portion of the key (32 bytes = 64 hex chars). */
const KEY_RANDOM_BYTES = 32;

/** Number of prefix characters stored for identification (e.g., "kak_a1b2c3"). */
const STORED_PREFIX_LENGTH = 10;

const VALID_SCOPES: ReadonlySet<string> = new Set<ApiKeyScope>([
  "analysis:read",
  "analysis:write",
  "team:read",
  "team:write",
  "webhook:write",
  "rag:read",
  "rag:write",
]);

const VALID_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "member", "viewer"]);

// ==================== Row Mapper ====================

export const rowToApiKey = (row: ApiKeyRow): ApiKey => ({
  id: row.id,
  tenantId: row.tenant_id,
  userId: row.user_id,
  name: row.name,
  keyPrefix: row.key_prefix,
  scopes: row.scopes as readonly ApiKeyScope[],
  role: row.role,
  status: row.status as ApiKey["status"],
  lastUsedAt: row.last_used_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Key Generation ====================

/**
 * Generate a new API key plaintext and its SHA-256 hash.
 * The plaintext is formatted as: kak_{random_hex}
 */
export const generateApiKey = (): {
  readonly plaintext: string;
  readonly hash: string;
  readonly prefix: string;
} => {
  const randomPart = crypto.randomBytes(KEY_RANDOM_BYTES).toString("hex");
  const plaintext = `${KEY_PREFIX}${randomPart}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, STORED_PREFIX_LENGTH);

  return { plaintext, hash, prefix };
};

/**
 * Hash a plaintext API key for lookup.
 */
export const hashApiKey = (plaintext: string): string =>
  crypto.createHash("sha256").update(plaintext).digest("hex");

// ==================== Validation ====================

export const validateCreateApiKeyInput = (input: CreateApiKeyInput): void => {
  if (!input.tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "validateCreateApiKeyInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.userId?.trim()) {
    throw new ValidationError("userId is required", {
      operation: "validateCreateApiKeyInput",
      metadata: { field: "userId" },
    });
  }

  if (!input.name?.trim() || input.name.length > 255) {
    throw new ValidationError("name is required and must be 255 characters or fewer", {
      operation: "validateCreateApiKeyInput",
      metadata: { field: "name" },
    });
  }

  if (!input.scopes || input.scopes.length === 0) {
    throw new ValidationError("At least one scope is required", {
      operation: "validateCreateApiKeyInput",
      metadata: { field: "scopes" },
    });
  }

  const invalidScopes = input.scopes.filter((scope) => !VALID_SCOPES.has(scope));
  if (invalidScopes.length > 0) {
    throw new ValidationError(`Invalid scopes: ${invalidScopes.join(", ")}`, {
      operation: "validateCreateApiKeyInput",
      metadata: { field: "scopes", invalidScopes },
    });
  }

  if (input.role && !VALID_ROLES.has(input.role)) {
    throw new ValidationError(`Invalid role: ${input.role}`, {
      operation: "validateCreateApiKeyInput",
      metadata: { field: "role", value: input.role },
    });
  }
};
