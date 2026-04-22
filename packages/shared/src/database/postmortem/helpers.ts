/**
 * Postmortem Helpers
 *
 * Validation functions and row mappers for postmortem repository operations.
 *
 * @module database/postmortem/helpers
 */

import { ValidationError } from "../common.js";
import type {
  PostmortemRow,
  PostmortemRecord,
  PostmortemContent,
  PostmortemStatus,
  CreatePostmortemInput,
} from "./types.js";

// ==================== Constants ====================

const VALID_STATUSES: ReadonlySet<string> = new Set(["draft", "published"]);

const DEFAULT_CONTENT: PostmortemContent = {
  summary: "",
  timeline: "",
  rootCause: "",
  impact: "",
  actionItems: [],
  lessonsLearned: "",
  additionalNotes: "",
};

// ==================== Row Mappers ====================

/**
 * Parses raw JSONB content into a typed PostmortemContent, applying safe defaults.
 */
const parseContent = (raw: Readonly<Record<string, unknown>>): PostmortemContent => ({
  summary: typeof raw.summary === "string" ? raw.summary : DEFAULT_CONTENT.summary,
  timeline: typeof raw.timeline === "string" ? raw.timeline : DEFAULT_CONTENT.timeline,
  rootCause: typeof raw.rootCause === "string" ? raw.rootCause : DEFAULT_CONTENT.rootCause,
  impact: typeof raw.impact === "string" ? raw.impact : DEFAULT_CONTENT.impact,
  actionItems: Array.isArray(raw.actionItems) ? raw.actionItems : DEFAULT_CONTENT.actionItems,
  lessonsLearned:
    typeof raw.lessonsLearned === "string" ? raw.lessonsLearned : DEFAULT_CONTENT.lessonsLearned,
  additionalNotes:
    typeof raw.additionalNotes === "string" ? raw.additionalNotes : DEFAULT_CONTENT.additionalNotes,
});

/**
 * Maps a database row to a PostmortemRecord domain object.
 */
export const mapRowToPostmortem = (row: PostmortemRow): PostmortemRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  alertId: row.alert_id,
  title: row.title,
  status: VALID_STATUSES.has(row.status) ? (row.status as PostmortemStatus) : "draft",
  content: parseContent(row.content),
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
});

// ==================== Validation ====================

/**
 * Validates input for creating a new postmortem record.
 *
 * @throws ValidationError if required fields are missing
 */
export const validateCreatePostmortemInput = (input: CreatePostmortemInput): void => {
  if (!input.tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "validateCreatePostmortemInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.title?.trim()) {
    throw new ValidationError("title is required", {
      operation: "validateCreatePostmortemInput",
      metadata: { field: "title" },
    });
  }

  if (input.status && !VALID_STATUSES.has(input.status)) {
    throw new ValidationError("status must be 'draft' or 'published'", {
      operation: "validateCreatePostmortemInput",
      metadata: { field: "status" },
    });
  }
};

/**
 * Validates a postmortem ID.
 *
 * @throws ValidationError if ID is empty
 */
export const validatePostmortemId = (id: string): void => {
  if (!id?.trim()) {
    throw new ValidationError("Postmortem ID is required", {
      operation: "validatePostmortemId",
      metadata: { field: "id" },
    });
  }
};
