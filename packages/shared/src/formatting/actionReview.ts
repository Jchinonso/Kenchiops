/**
 * Action Review Formatting
 *
 * Helpers for turning recommended actions into clear "areas to review"
 * with a short title and a supporting detail line.
 */

import { truncateText } from "./uiHelpers.js";

export interface ReviewActionOptions {
  readonly titleMaxLength?: number;
  readonly detailMaxLength?: number;
}

export interface ReviewActionText {
  readonly servicePrefix: string;
  readonly title: string;
  readonly detail: string;
}

const SERVICE_PREFIX_PATTERN = /^\[([^\]]+)\]\s*/;
const EVIDENCE_TAG_PATTERN =
  /\s*\[(?:test|anno|check|log|diff|dep|cfg|wflog|src|comment)#[^\]]+\]\s*/gi;
const EVIDENCE_PAREN_PATTERN = /\s*\(evidence:\s*[a-z]+#[^)]+\)\s*/gi;
const REVIEW_PREFIX_PATTERN =
  /^(review|inspect|check|verify|investigate|address|start with|confirm|ensure|re-?run|run|align|compare|consider|look into|fix|correct|update|change|set|add|remove|replace|adjust|rename)\b/i;
const TITLE_PREFIX_PATTERN =
  /^(review|inspect|check|verify|investigate|address|start with|confirm|ensure|re-?run|run|align|compare|consider|look into|fix|correct|update|change|set|add|remove|replace|adjust|rename)\b/i;

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

const stripEvidenceTags = (text: string): string =>
  text.replace(EVIDENCE_TAG_PATTERN, " ").replace(EVIDENCE_PAREN_PATTERN, " ");

const capitalizeFirst = (text: string): string =>
  text.length > 0 ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;

const splitServicePrefix = (description: string): { servicePrefix: string; rest: string } => {
  const match = description.match(SERVICE_PREFIX_PATTERN);
  if (!match) {
    return { servicePrefix: "", rest: description };
  }

  const service = match[1]?.trim() ?? "";
  const rest = description.replace(SERVICE_PREFIX_PATTERN, "").trim();
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
  if (REVIEW_PREFIX_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return `Review ${trimmed}`;
};

export const buildReviewActionText = (
  description: string,
  reasoning?: string,
  options: ReviewActionOptions = {}
): ReviewActionText => {
  const { titleMaxLength, detailMaxLength } = options;
  const { servicePrefix, rest } = splitServicePrefix(description);
  const cleaned = normalizeWhitespace(stripEvidenceTags(rest));

  const strippedTitle = normalizeWhitespace(cleaned.replace(TITLE_PREFIX_PATTERN, ""));
  const titleSource = strippedTitle.length > 0 ? strippedTitle : cleaned;
  const titleText = capitalizeFirst(titleSource || "Review area");
  const title =
    typeof titleMaxLength === "number" && titleMaxLength > 0
      ? truncateText(titleText, titleMaxLength)
      : titleText;

  const detailBase = normalizeReviewDetail(cleaned);
  const detailWithReason = reasoning
    ? `${detailBase} ${normalizeWhitespace(reasoning)}`
    : detailBase;
  const detail =
    typeof detailMaxLength === "number" && detailMaxLength > 0
      ? truncateText(detailWithReason, detailMaxLength)
      : detailWithReason;

  return {
    servicePrefix,
    title,
    detail,
  };
};
