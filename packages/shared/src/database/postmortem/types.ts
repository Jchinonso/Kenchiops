/**
 * Postmortem Types
 *
 * Type definitions for postmortem storage and retrieval.
 *
 * @module database/postmortem/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for postmortems table.
 */
export interface PostmortemRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly alert_id: string | null;
  readonly title: string;
  readonly status: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly published_at: Date | null;
}

// ==================== Domain Types ====================

/**
 * Status of a postmortem document.
 */
export type PostmortemStatus = "draft" | "published";

/**
 * A single action item within a postmortem.
 */
export interface PostmortemActionItem {
  readonly action: string;
  readonly owner: string;
  readonly dueDate: string | null;
  readonly status: string;
}

/**
 * Structured content of a postmortem document.
 */
export interface PostmortemContent {
  readonly summary: string;
  readonly timeline: string;
  readonly rootCause: string;
  readonly impact: string;
  readonly actionItems: readonly PostmortemActionItem[];
  readonly lessonsLearned: string;
  readonly additionalNotes: string;
}

/**
 * Domain record for a postmortem entry.
 */
export interface PostmortemRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly alertId: string | null;
  readonly title: string;
  readonly status: PostmortemStatus;
  readonly content: PostmortemContent;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
}

// ==================== Input Types ====================

/**
 * Input for creating a new postmortem record.
 */
export interface CreatePostmortemInput {
  readonly tenantId: string;
  readonly alertId?: string | null;
  readonly title: string;
  readonly status?: PostmortemStatus;
  readonly content: PostmortemContent;
  readonly createdBy?: string | null;
}

/**
 * Input for updating a postmortem record.
 */
export interface UpdatePostmortemInput {
  readonly title?: string;
  readonly content?: PostmortemContent;
  readonly status?: PostmortemStatus;
}

// ==================== Query Types ====================

/**
 * Filters for listing postmortems.
 */
export interface ListPostmortemFilters {
  readonly tenantId: string;
  readonly status?: string | null;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Paginated list result for postmortems.
 */
export interface PaginatedPostmortems {
  readonly items: readonly PostmortemRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
