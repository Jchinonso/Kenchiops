/**
 * PR Fix Comment Detector
 *
 * Detects and scores fix explanations in PR comments for passive knowledge capture.
 * Analyzes comment content to identify valuable fix knowledge that can be stored
 * for future similar failures.
 *
 * @module rag/prFixCommentDetector
 */

import { createLogger } from "../core/logger.js";
import {
  FIX_COMMENT_PATTERNS,
  FIX_COMMENT_EXCLUSIONS,
  PR_FIX_COMMENT_CONFIG,
  PASSIVE_LEARNING_TIME,
} from "../constants/index.js";

import type {
  PRComment,
  PRFixFailureContext,
  FixCommentAnalysis,
  ExtractedFixKnowledge,
} from "./types.js";

export type {
  PRComment,
  PRFixFailureContext,
  FixCommentAnalysis,
  ExtractedFixKnowledge,
} from "./types.js";

const logger = createLogger("pr-fix-comment-detector");

// ==================== Pattern Matching ====================

/**
 * Tests if a string matches any pattern in a list.
 */
const matchesAnyPattern = (text: string, patterns: readonly RegExp[]): readonly string[] => {
  const matches: string[] = [];
  patterns.forEach((pattern) => {
    const match = text.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  });
  return Object.freeze(matches);
};

/**
 * Checks if comment is from a bot.
 */
const isBotComment = (author: string): boolean =>
  FIX_COMMENT_EXCLUSIONS.BOT_PATTERNS.some((pattern) => pattern.test(author));

/**
 * Checks if comment is trivial (too short or boilerplate).
 */
const isTrivialComment = (body: string): boolean => {
  const trimmed = body.trim();

  // Check minimum length
  if (trimmed.length < PR_FIX_COMMENT_CONFIG.MIN_COMMENT_LENGTH) {
    return true;
  }

  // Check trivial patterns
  return FIX_COMMENT_EXCLUSIONS.TRIVIAL_PATTERNS.some((pattern) => pattern.test(trimmed));
};

/**
 * Detects if comment contains code blocks.
 */
const hasCodeBlock = (body: string): boolean => /```[\s\S]*?```|`[^`]+`/.test(body);

/**
 * Detects if comment references specific files.
 */
const hasFileReference = (body: string): boolean =>
  /\b[\w-]+\.(ts|js|tsx|jsx|py|go|rs|java|rb|php|yml|yaml|json|md)\b/.test(body) ||
  /`[^`]*\/[^`]+`/.test(body) ||
  /(?:in|at|file|path)\s+[`"]?[\w/.-]+[`"]?/i.test(body);

/**
 * Counts words in text, excluding code blocks.
 */
const countWords = (body: string): number => {
  // Remove code blocks for word counting
  const textOnly = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  const words = textOnly.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
};

// ==================== Confidence Scoring ====================

/**
 * Calculates confidence score for a fix comment.
 */
const calculateConfidence = (
  highMatches: readonly string[],
  mediumMatches: readonly string[],
  lowMatches: readonly string[],
  hasCode: boolean,
  hasFile: boolean,
  wordCount: number
): number => {
  const weights = PR_FIX_COMMENT_CONFIG.CONFIDENCE_WEIGHTS;
  let score = 0;

  // Pattern match contributions
  if (highMatches.length > 0) {
    score += weights.HIGH_PATTERN_MATCH;
  }
  if (mediumMatches.length > 0) {
    score += weights.MEDIUM_PATTERN_MATCH;
  }
  if (lowMatches.length > 0) {
    score += weights.LOW_PATTERN_MATCH;
  }

  // Content quality contributions
  if (hasCode) {
    score += weights.HAS_CODE_BLOCK;
  }
  if (hasFile) {
    score += weights.HAS_FILE_REFERENCE;
  }
  if (wordCount >= PR_FIX_COMMENT_CONFIG.LONGER_EXPLANATION_WORD_COUNT) {
    score += weights.LONGER_EXPLANATION;
  }

  // Normalize to 0-1 range (max possible score is 1.1)
  return Math.min(score, 1.0);
};

/**
 * Converts hours to milliseconds using constants.
 */
const hoursToMs = (hours: number): number =>
  hours *
  PASSIVE_LEARNING_TIME.MINUTES_PER_HOUR *
  PASSIVE_LEARNING_TIME.SECONDS_PER_MINUTE *
  PASSIVE_LEARNING_TIME.MS_PER_SECOND;

// ==================== Public API ====================

/**
 * Analyzes a PR comment to determine if it contains fix knowledge.
 *
 * @param comment - The PR comment to analyze
 * @returns Analysis result with confidence score
 */
export const analyzeComment = (comment: PRComment): FixCommentAnalysis => {
  const { body } = comment;

  // Quick exclusion checks
  if (isBotComment(comment.author)) {
    return {
      isFixComment: false,
      confidence: 0,
      comment,
      matchedPatterns: [],
      hasCodeBlock: false,
      hasFileReference: false,
      wordCount: 0,
    };
  }

  if (isTrivialComment(body)) {
    return {
      isFixComment: false,
      confidence: 0,
      comment,
      matchedPatterns: [],
      hasCodeBlock: false,
      hasFileReference: false,
      wordCount: countWords(body),
    };
  }

  // Pattern matching
  const highMatches = matchesAnyPattern(body, FIX_COMMENT_PATTERNS.HIGH_CONFIDENCE);
  const mediumMatches = matchesAnyPattern(body, FIX_COMMENT_PATTERNS.MEDIUM_CONFIDENCE);
  const lowMatches = matchesAnyPattern(body, FIX_COMMENT_PATTERNS.LOW_CONFIDENCE);

  const allMatches = [...highMatches, ...mediumMatches, ...lowMatches];

  // Content analysis
  const hasCode = hasCodeBlock(body);
  const hasFile = hasFileReference(body);
  const wordCount = countWords(body);

  // Calculate confidence
  const confidence = calculateConfidence(
    highMatches,
    mediumMatches,
    lowMatches,
    hasCode,
    hasFile,
    wordCount
  );

  const isFixComment = confidence >= PR_FIX_COMMENT_CONFIG.MIN_CONFIDENCE_THRESHOLD;

  return Object.freeze({
    isFixComment,
    confidence,
    comment,
    matchedPatterns: Object.freeze(allMatches),
    hasCodeBlock: hasCode,
    hasFileReference: hasFile,
    wordCount,
  });
};

/**
 * Filters and ranks comments to find the best fix explanations.
 *
 * @param comments - Array of PR comments to analyze
 * @param failedAt - Timestamp of the failure (only consider comments after this)
 * @returns Ranked array of fix comment analyses
 */
export const findFixComments = (
  comments: readonly PRComment[],
  failedAt: string
): readonly FixCommentAnalysis[] => {
  const failureTime = new Date(failedAt).getTime();
  const maxTime = failureTime + hoursToMs(PR_FIX_COMMENT_CONFIG.FIX_COMMENT_WINDOW_HOURS);
  const now = Date.now();

  // Filter comments within the time window
  const relevantComments = comments.filter((comment) => {
    const commentTime = new Date(comment.createdAt).getTime();
    return commentTime > failureTime && commentTime <= Math.min(maxTime, now);
  });

  // Limit number of comments to process
  const limitedComments = relevantComments.slice(0, PR_FIX_COMMENT_CONFIG.MAX_COMMENTS_PER_PR);

  // Analyze each comment
  const analyses = limitedComments.map(analyzeComment);

  // Filter to only fix comments and sort by confidence
  const fixComments = analyses
    .filter((analysis) => analysis.isFixComment)
    .sort((analysisA, analysisB) => analysisB.confidence - analysisA.confidence);

  logger.info("Found fix comments in PR", {
    totalComments: comments.length,
    relevantComments: relevantComments.length,
    fixComments: fixComments.length,
  });

  return Object.freeze(fixComments);
};

/**
 * Extracts knowledge from a fix comment analysis.
 *
 * @param analysis - The analyzed fix comment
 * @param failureContext - Context about the original failure
 * @returns Extracted knowledge ready for ingestion
 */
export const extractFixKnowledge = (
  analysis: FixCommentAnalysis,
  failureContext: PRFixFailureContext
): ExtractedFixKnowledge => {
  const { comment, confidence, matchedPatterns } = analysis;

  // Generate title from error summary
  const titlePrefix =
    confidence >= PR_FIX_COMMENT_CONFIG.HIGH_CONFIDENCE_THRESHOLD ? "Fix" : "Potential Fix";
  const errorSummaryShort = failureContext.errorSummary.slice(
    0,
    PASSIVE_LEARNING_TIME.TITLE_PREFIX_MAX_LENGTH
  );
  const title = `${titlePrefix}: ${errorSummaryShort}`;

  // Build content with failure context and fix explanation
  const content = buildKnowledgeContent(analysis, failureContext);

  // Build PR URL
  const prUrl = `https://github.com/${failureContext.repository}/pull/${failureContext.prNumber}`;

  return Object.freeze({
    title,
    content,
    confidence,
    sourceComment: comment,
    failureContext,
    metadata: Object.freeze({
      prUrl,
      commentId: comment.id,
      filesChanged: failureContext.filesChanged ?? [],
      matchedPatterns: Object.freeze([...matchedPatterns]),
      extractedAt: new Date().toISOString(),
    }),
  });
};

/**
 * Builds the knowledge document content.
 */
const buildKnowledgeContent = (
  analysis: FixCommentAnalysis,
  failureContext: PRFixFailureContext
): string => {
  const sections: string[] = [];

  // Failure Pattern section
  sections.push("## Failure Pattern");
  sections.push(`**Check:** ${failureContext.checkName}`);
  sections.push(`**Repository:** ${failureContext.repository}`);
  sections.push(`**Error:** ${failureContext.errorSummary}`);

  // Files Changed section (if available)
  if (failureContext.filesChanged && failureContext.filesChanged.length > 0) {
    sections.push("");
    sections.push("## Files Changed");
    failureContext.filesChanged.forEach((file) => {
      sections.push(`- \`${file}\``);
    });
  }

  // Fix Explanation section
  sections.push("");
  sections.push("## Fix Explanation");
  sections.push(analysis.comment.body);

  // Metadata section
  sections.push("");
  sections.push("## Metadata");
  sections.push(`- **Author:** ${analysis.comment.author}`);
  sections.push(`- **Date:** ${analysis.comment.createdAt}`);
  const percentageScore = analysis.confidence * PASSIVE_LEARNING_TIME.PERCENTAGE_MULTIPLIER;
  sections.push(`- **Confidence:** ${percentageScore.toFixed(0)}%`);

  return sections.join("\n");
};

/**
 * Checks if a new fix knowledge is a duplicate of existing knowledge.
 *
 * @param newKnowledge - The new knowledge to check
 * @param existingContent - Content of existing knowledge document
 * @returns True if the new knowledge is a duplicate
 */
export const isDuplicateKnowledge = (
  newKnowledge: ExtractedFixKnowledge,
  existingContent: string
): boolean => {
  // Simple heuristic: check if the core fix explanation is very similar
  const newBody = newKnowledge.sourceComment.body.toLowerCase().trim();
  const existingLower = existingContent.toLowerCase();

  // Check if the comment body is substantially contained in existing content
  const words = newBody
    .split(/\s+/)
    .filter((word) => word.length > PASSIVE_LEARNING_TIME.MIN_WORD_LENGTH);
  const matchingWords = words.filter((word) => existingLower.includes(word));
  const matchRatio = words.length > 0 ? matchingWords.length / words.length : 0;

  return matchRatio >= PR_FIX_COMMENT_CONFIG.DEDUP_SIMILARITY_THRESHOLD;
};
