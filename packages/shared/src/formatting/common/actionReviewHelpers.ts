/**
 * Action Review Helpers
 *
 * Helpers for turning recommended actions into clear "areas to review"
 * with a short title and a supporting detail line.
 *
 * @module formatting/common/actionReviewHelpers
 */

import { ACTION_REVIEW_PATTERNS } from "../../constants/index.js";
import { truncateText } from "./uiHelpers.js";
import type { ReviewActionOptions, ReviewActionText } from "./types.js";

// ==================== Internal Helpers ====================

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

const stripEvidenceTags = (text: string): string =>
  text
    .replace(ACTION_REVIEW_PATTERNS.EVIDENCE_TAG, " ")
    .replace(ACTION_REVIEW_PATTERNS.EVIDENCE_PAREN, " ");

const capitalizeFirst = (text: string): string =>
  text.length > 0 ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;

const extractEvidenceIds = (text: string): string[] =>
  Array.from(text.matchAll(ACTION_REVIEW_PATTERNS.EVIDENCE_ID), (match) => match[0]).filter(
    (id, index, ids) => ids.indexOf(id) === index
  );

const buildEvidenceNote = (evidenceIds: readonly string[], detailText: string): string => {
  if (evidenceIds.length === 0) {
    return "";
  }

  const hasEvidenceAlready = evidenceIds.some((id) => detailText.includes(id));
  if (hasEvidenceAlready) {
    return "";
  }

  const evidenceList = evidenceIds.map((id) => `[${id}]`).join(" ");
  return `Evidence: ${evidenceList}`;
};

const splitServicePrefix = (description: string): { servicePrefix: string; rest: string } => {
  const match = description.match(ACTION_REVIEW_PATTERNS.SERVICE_PREFIX);
  if (!match) {
    return { servicePrefix: "", rest: description };
  }

  const service = match[1]?.trim() ?? "";
  const rest = description.replace(ACTION_REVIEW_PATTERNS.SERVICE_PREFIX, "").trim();
  return {
    servicePrefix: service.length > 0 ? `[${service}] ` : "",
    rest,
  };
};

const normalizeReviewDetail = (description: string): string => {
  const trimmed = normalizeWhitespace(description);
  if (!trimmed) {
    return "Review the failing area referenced in the report.";
  }
  if (ACTION_REVIEW_PATTERNS.REVIEW_PREFIX.test(trimmed)) {
    return trimmed;
  }
  return `Review ${trimmed}`;
};

// ==================== Public API ====================

/**
 * Builds formatted review action text from a description and optional reasoning.
 *
 * @param description - The action description
 * @param reasoning - Optional reasoning for the action
 * @param options - Formatting options (title/detail max lengths)
 * @returns Formatted review action text
 */
export const buildReviewActionText = (
  description: string,
  reasoning?: string,
  options: ReviewActionOptions = {}
): ReviewActionText => {
  const { titleMaxLength, detailMaxLength } = options;
  const { servicePrefix, rest } = splitServicePrefix(description);
  const evidenceIds = [
    ...extractEvidenceIds(description),
    ...(reasoning ? extractEvidenceIds(reasoning) : []),
  ];
  const cleaned = normalizeWhitespace(stripEvidenceTags(rest));

  const strippedTitle = normalizeWhitespace(
    cleaned.replace(ACTION_REVIEW_PATTERNS.TITLE_PREFIX, "").replace(/^(and|then)\s+/i, "")
  );
  const titleSource = strippedTitle.length > 0 ? strippedTitle : cleaned;
  const titleText = capitalizeFirst(titleSource || "Review area");
  const title =
    typeof titleMaxLength === "number" && titleMaxLength > 0
      ? truncateText(titleText, titleMaxLength)
      : titleText;

  const detailBase = normalizeReviewDetail(cleaned);
  const cleanedReasoning = reasoning ? normalizeWhitespace(stripEvidenceTags(reasoning)) : "";
  const detailParts = [detailBase, cleanedReasoning].filter(Boolean);
  const detailWithReason = detailParts.join(" ");
  const evidenceNote = buildEvidenceNote(evidenceIds, detailWithReason);
  const detailWithEvidence = evidenceNote
    ? `${detailWithReason}${detailWithReason ? " " : ""}${evidenceNote}`
    : detailWithReason;
  const detail =
    typeof detailMaxLength === "number" && detailMaxLength > 0
      ? truncateText(detailWithEvidence, detailMaxLength)
      : detailWithEvidence;

  return {
    servicePrefix,
    title,
    detail,
  };
};
