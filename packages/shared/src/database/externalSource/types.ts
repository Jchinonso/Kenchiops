/**
 * External Source Types
 *
 * Type definitions for external knowledge source operations.
 *
 * @module database/externalSource/types
 */

import type { ExternalSourceType, TechStackTag } from "../common.js";

// Re-export imported types for convenience
export type { ExternalSourceType, TechStackTag } from "../common.js";

// ==================== Database Row Types ====================

/**
 * Database row for external source.
 */
export interface ExternalSourceRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly source_type: string;
  readonly name: string;
  readonly base_url: string | null;
  readonly auth_config: Record<string, unknown> | null;
  readonly tech_stack_tags: readonly string[] | null;
  readonly is_enabled: boolean;
  readonly credibility_score: string;
  readonly last_sync_at: string | null;
  readonly sync_frequency_hours: number;
  readonly doc_count: number;
  readonly error_count: number;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// ==================== Record Types ====================

/**
 * External source record.
 */
export interface ExternalSource {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceType: ExternalSourceType;
  readonly name: string;
  readonly baseUrl?: string;
  readonly authConfig?: Record<string, unknown>;
  readonly techStackTags: readonly TechStackTag[];
  readonly isEnabled: boolean;
  readonly credibilityScore: number;
  readonly lastSyncAt?: string;
  readonly syncFrequencyHours: number;
  readonly docCount: number;
  readonly errorCount: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ==================== Input Types ====================

/**
 * Input for creating an external source.
 */
export interface CreateExternalSourceInput {
  readonly tenantId: string;
  readonly sourceType: ExternalSourceType;
  readonly name: string;
  readonly baseUrl?: string;
  readonly authConfig?: Record<string, unknown>;
  readonly techStackTags?: readonly TechStackTag[];
  readonly syncFrequencyHours?: number;
  readonly credibilityScore?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Input for updating an external source.
 */
export interface UpdateExternalSourceInput {
  readonly name?: string;
  readonly baseUrl?: string;
  readonly authConfig?: Record<string, unknown>;
  readonly techStackTags?: readonly TechStackTag[];
  readonly isEnabled?: boolean;
  readonly credibilityScore?: number;
  readonly syncFrequencyHours?: number;
  readonly metadata?: Record<string, unknown>;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateExternalSourceInput fields.
 */
export interface CreateInputValidationRule {
  readonly field: keyof CreateExternalSourceInput;
  readonly isInvalid: (input: CreateExternalSourceInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateExternalSourceInput) => unknown;
}
