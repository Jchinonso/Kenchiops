/**
 * Auth Service Types
 *
 * Type definitions for the authentication service.
 * Token metadata, result shapes, and internal contracts.
 *
 * @module services/authServiceTypes
 */

import type { User } from "@kenchi/shared";

// ==================== Token Metadata ====================

/** Metadata captured with token operations for audit and security. */
export interface TokenMeta {
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

// ==================== Service Results ====================

/** Result from findOrCreateUser indicating whether the user was newly created. */
export interface FindOrCreateUserResult {
  readonly user: User;
  readonly isNew: boolean;
}
