/**
 * API Key Types
 *
 * Type definitions for the API key system.
 *
 * @module database/apiKey/types
 */

// ==================== Enum Types ====================

export type ApiKeyStatus = "active" | "revoked";

export type ApiKeyScope =
  | "analysis:read"
  | "analysis:write"
  | "team:read"
  | "team:write"
  | "webhook:write"
  | "rag:read"
  | "rag:write";

// ==================== Row Types (snake_case, matches DB) ====================

export interface ApiKeyRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly name: string;
  readonly key_hash: string;
  readonly key_prefix: string;
  readonly scopes: readonly string[];
  readonly role: string;
  readonly status: string;
  readonly last_used_at: Date | null;
  readonly expires_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types (camelCase) ====================

export interface ApiKey {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly role: string;
  readonly status: ApiKeyStatus;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Returned only at creation time — includes the plaintext key. */
export interface ApiKeyWithSecret {
  readonly apiKey: ApiKey;
  readonly plaintext: string;
}

// ==================== Input Types ====================

export interface CreateApiKeyInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly name: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly role?: string;
  readonly expiresInDays?: number;
}
