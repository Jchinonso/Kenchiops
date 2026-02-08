/**
 * Slack Resolution Pattern Constants and Scoring
 *
 * Pattern definitions and scoring utilities for resolution detection.
 *
 * @module rag/slackResolutionPatterns
 */

import type { SlackMessage } from "./types.js";
import { RESOLUTION_CONFIDENCE_THRESHOLDS as CONFIDENCE_THRESHOLDS } from "../constants/index.js";

export { CONFIDENCE_THRESHOLDS };
export type { SlackReaction, SlackMessage } from "./types.js";

// ==================== Pattern Constants ====================

/**
 * Patterns that indicate a resolution or fix.
 */
export const RESOLUTION_PATTERNS = [
  { pattern: /fixed\s+(?:it|this|the\s+issue)/i, name: "fixed_explicit" },
  { pattern: /(?:this|that)\s+(?:fixed|resolved|solved)\s+it/i, name: "fixed_confirmation" },
  { pattern: /the\s+(?:fix|solution)\s+(?:is|was)/i, name: "solution_statement" },
  { pattern: /here(?:'s| is)\s+(?:the\s+)?(?:fix|solution)/i, name: "solution_intro" },
  { pattern: /try\s+(?:this|changing|updating)/i, name: "try_suggestion" },
  { pattern: /(?:you\s+)?need\s+to\s+(?:change|update|fix)/i, name: "action_needed" },
  { pattern: /the\s+problem\s+(?:is|was)/i, name: "problem_identified" },
  { pattern: /(?:root\s+)?cause\s+(?:is|was)/i, name: "cause_identified" },
  { pattern: /(?:issue|bug)\s+(?:is|was)\s+(?:in|with|caused)/i, name: "issue_located" },
  { pattern: /(?:merged|deployed|shipped|released)/i, name: "shipped" },
  { pattern: /pr\s+(?:merged|approved)/i, name: "pr_merged" },
  { pattern: /should\s+(?:be\s+)?(?:fixed|working)\s+now/i, name: "fixed_now" },
  { pattern: /(?:this|that)\s+should\s+(?:fix|resolve|solve)/i, name: "should_fix" },
  {
    pattern: /(?:looks\s+like|seems\s+like)\s+(?:it's|this\s+is)\s+(?:a|the)\s+(?:fix|solution)/i,
    name: "looks_like_fix",
  },
] as const;

/**
 * Reactions that indicate positive confirmation.
 */
export const POSITIVE_REACTIONS = new Set([
  "white_check_mark",
  "heavy_check_mark",
  "check",
  "+1",
  "thumbsup",
  "tada",
  "raised_hands",
  "clap",
  "star",
  "rocket",
  "100",
  "pray",
  "heart",
  "green_heart",
  "ok_hand",
  "fire",
]);

/**
 * Code block detection pattern.
 */
export const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`]+`/;

// ==================== Pattern Matching ====================

/**
 * Finds all matching resolution patterns in text.
 *
 * @param text - The text to analyze
 * @returns Array of matched pattern names
 */
export const findMatchingPatterns = (text: string): readonly string[] =>
  RESOLUTION_PATTERNS.filter((patternDef) => patternDef.pattern.test(text)).map(
    (patternDef) => patternDef.name
  );

/**
 * Checks if a message has positive reactions.
 *
 * @param message - The Slack message to check
 * @returns True if message has positive reactions
 */
export const hasPositiveReactions = (message: SlackMessage): boolean => {
  if (!message.reactions || message.reactions.length === 0) {
    return false;
  }

  return message.reactions.some((reaction) => POSITIVE_REACTIONS.has(reaction.name));
};

/**
 * Checks if a message contains code blocks.
 *
 * @param message - The Slack message to check
 * @returns True if message contains code blocks
 */
export const hasCodeBlock = (message: SlackMessage): boolean =>
  CODE_BLOCK_PATTERN.test(message.text);

// ==================== Scoring ====================

/**
 * Calculates position score - later messages in thread are more likely to be resolutions.
 *
 * @param messageIndex - Zero-based index of the message
 * @param totalMessages - Total number of messages in thread
 * @returns Position score between 0 and POSITION_WEIGHT
 */
export const calculatePositionScore = (messageIndex: number, totalMessages: number): number => {
  if (totalMessages <= 1) {
    return 0.5;
  }
  // Messages in the latter half get higher scores
  const normalizedPosition = messageIndex / (totalMessages - 1);
  return normalizedPosition * CONFIDENCE_THRESHOLDS.POSITION_WEIGHT;
};

/**
 * Calculates message length score - longer substantive messages score higher.
 *
 * @param text - The message text
 * @returns Length score between 0 and MESSAGE_LENGTH_WEIGHT
 */
export const calculateLengthScore = (text: string): number => {
  const { length } = text;
  if (length < CONFIDENCE_THRESHOLDS.MIN_LENGTH_CHARS) {
    return 0;
  }
  if (length < CONFIDENCE_THRESHOLDS.LOW_LENGTH_CHARS) {
    return (
      CONFIDENCE_THRESHOLDS.LOW_LENGTH_MULTIPLIER * CONFIDENCE_THRESHOLDS.MESSAGE_LENGTH_WEIGHT
    );
  }
  if (length < CONFIDENCE_THRESHOLDS.MEDIUM_LENGTH_CHARS) {
    return (
      CONFIDENCE_THRESHOLDS.MEDIUM_LENGTH_MULTIPLIER * CONFIDENCE_THRESHOLDS.MESSAGE_LENGTH_WEIGHT
    );
  }
  return CONFIDENCE_THRESHOLDS.MESSAGE_LENGTH_WEIGHT;
};

/**
 * Calculates total confidence score for a message.
 *
 * @param matchedPatterns - Array of matched pattern names
 * @param hasPositiveReactionsFlag - Whether message has positive reactions
 * @param hasCodeBlockFlag - Whether message contains code blocks
 * @param messageIndex - Zero-based index of the message
 * @param totalMessages - Total number of messages in thread
 * @param messageText - The message text
 * @returns Confidence score between 0 and 1
 */
export const calculateConfidenceScore = (
  matchedPatterns: readonly string[],
  hasPositiveReactionsFlag: boolean,
  hasCodeBlockFlag: boolean,
  messageIndex: number,
  totalMessages: number,
  messageText: string
): number => {
  let score = 0;

  // Pattern matches - more patterns = higher score
  const patternScore = Math.min(
    matchedPatterns.length * CONFIDENCE_THRESHOLDS.PATTERN_WEIGHT,
    0.4 // Cap pattern contribution
  );
  score += patternScore;

  // Positive reactions boost
  if (hasPositiveReactionsFlag) {
    score += CONFIDENCE_THRESHOLDS.REACTION_WEIGHT;
  }

  // Code block boost - technical solutions often include code
  if (hasCodeBlockFlag) {
    score += CONFIDENCE_THRESHOLDS.CODE_BLOCK_WEIGHT;
  }

  // Position score
  score += calculatePositionScore(messageIndex, totalMessages);

  // Length score
  score += calculateLengthScore(messageText);

  return Math.min(score, 1.0);
};
