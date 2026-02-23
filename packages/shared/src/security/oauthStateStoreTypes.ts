/**
 * OAuth State Store Types
 *
 * Type definitions for the Redis-backed OAuth state store
 * with in-memory fallback.
 *
 * @module security/oauthStateStoreTypes
 */

/**
 * OAuth state data stored per state token.
 * Compatible with Slack OAuth's StoredState shape.
 */
export interface OAuthStoredState {
  readonly createdAt: number;
  readonly tenantId?: string;
}

/**
 * OAuth state store interface for set/get/delete operations.
 * Implementations may use Redis (with TTL) or in-memory Map (with expiry checks).
 */
export interface OAuthStateStore {
  readonly set: (token: string, data: OAuthStoredState) => Promise<void>;
  readonly get: (token: string) => Promise<OAuthStoredState | null>;
  readonly delete: (token: string) => Promise<void>;
}
