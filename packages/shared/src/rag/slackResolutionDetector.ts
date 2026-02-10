/**
 * Slack Resolution Detector
 *
 * Analyzes Slack threads to detect resolution signals and extract
 * resolution content for ingestion into the RAG knowledge base.
 *
 * @module rag/slackResolutionDetector
 */

import { createLogger } from "../core/logger.js";

// Import from patterns sub-module
import {
  RESOLUTION_PATTERNS,
  CONFIDENCE_THRESHOLDS,
  findMatchingPatterns,
  hasPositiveReactions,
  hasCodeBlock,
  calculateConfidenceScore,
} from "./slackResolutionPatterns.js";
import type {
  SlackMessage,
  SlackThread,
  DetectedResolution,
  ResolutionDetectionResult,
  ResolutionCandidate,
} from "./types.js";

export type { SlackThread, DetectedResolution, ResolutionDetectionResult } from "./types.js";

// Re-export patterns for backwards compatibility
export {
  RESOLUTION_PATTERNS,
  POSITIVE_REACTIONS,
  CODE_BLOCK_PATTERN,
  CONFIDENCE_THRESHOLDS,
  findMatchingPatterns,
  hasPositiveReactions,
  hasCodeBlock,
  calculatePositionScore,
  calculateLengthScore,
  calculateConfidenceScore,
  type SlackMessage,
  type SlackReaction,
} from "./slackResolutionPatterns.js";

const logger = createLogger("slack-resolution-detector");

// ==================== Candidate Analysis ====================

/**
 * Analyzes a single message for resolution signals.
 */
const analyzeMessage = (
  message: SlackMessage,
  messageIndex: number,
  totalMessages: number
): ResolutionCandidate | null => {
  // Skip bot messages unless they contain resolution content
  if (message.isBot && message.text.length < CONFIDENCE_THRESHOLDS.LOW_LENGTH_CHARS) {
    return null;
  }

  const matchedPatterns = findMatchingPatterns(message.text);
  const positiveReactions = hasPositiveReactions(message);
  const codeBlockPresent = hasCodeBlock(message);

  // Must have at least one signal
  if (matchedPatterns.length === 0 && !positiveReactions && !codeBlockPresent) {
    return null;
  }

  const score = calculateConfidenceScore(
    matchedPatterns,
    positiveReactions,
    codeBlockPresent,
    messageIndex,
    totalMessages,
    message.text
  );

  return {
    message,
    score,
    matchedPatterns,
    hasPositiveReactions: positiveReactions,
    hasCodeBlock: codeBlockPresent,
  };
};

/**
 * Finds all resolution candidates in a thread.
 */
const findResolutionCandidates = (
  messages: readonly SlackMessage[]
): readonly ResolutionCandidate[] => {
  const totalMessages = messages.length;

  return messages
    .map((message, index) => analyzeMessage(message, index, totalMessages))
    .filter((candidate): candidate is ResolutionCandidate => candidate !== null)
    .sort((firstCandidate, secondCandidate) => secondCandidate.score - firstCandidate.score);
};

// ==================== Content Building ====================

/**
 * Builds resolution content from the best candidate.
 */
const buildResolutionContent = (candidate: ResolutionCandidate, thread: SlackThread): string => {
  const parts: string[] = [];

  // Add context about the original issue if available
  if (thread.originalIssue) {
    parts.push(`## Original Issue\n${thread.originalIssue}`);
  }

  // Add the resolution
  parts.push(`## Resolution\n${candidate.message.text}`);

  // Add metadata
  const metadata: string[] = [];
  if (candidate.matchedPatterns.length > 0) {
    metadata.push(`Patterns: ${candidate.matchedPatterns.join(", ")}`);
  }
  if (candidate.hasCodeBlock) {
    metadata.push("Contains code example");
  }
  if (candidate.hasPositiveReactions) {
    metadata.push("Confirmed by reactions");
  }

  if (metadata.length > 0) {
    parts.push(`## Metadata\n${metadata.join("\n")}`);
  }

  return parts.join("\n\n");
};

/**
 * Collects pattern match counts across all candidates.
 */
const collectPatternMatchCounts = (
  candidates: readonly ResolutionCandidate[]
): Readonly<Record<string, number>> => {
  // Collect all patterns from all candidates
  const allPatterns = candidates.flatMap((candidate) => candidate.matchedPatterns);

  // Count occurrences using reduce
  return allPatterns.reduce<Record<string, number>>((counts, pattern) => {
    counts[pattern] = (counts[pattern] ?? 0) + 1;
    return counts;
  }, {});
};

// ==================== Result Builders ====================

/**
 * Builds analysis metadata from candidates and messages.
 */
const buildAnalysisMetadata = (
  messagesAnalyzed: number,
  candidates: readonly ResolutionCandidate[],
  patternMatchCounts: Readonly<Record<string, number>>,
  topScore: number
): ResolutionDetectionResult["analysisMetadata"] => ({
  messagesAnalyzed,
  candidatesFound: candidates.length,
  topScore,
  patternMatchCounts,
});

/**
 * Builds a no-resolution result.
 */
const buildNoResolutionResult = (
  candidates: readonly ResolutionCandidate[],
  metadata: ResolutionDetectionResult["analysisMetadata"]
): ResolutionDetectionResult => ({
  hasResolution: false,
  resolution: null,
  allCandidates: candidates,
  analysisMetadata: metadata,
});

/**
 * Builds a DetectedResolution from the best candidate and thread.
 */
const buildDetectedResolution = (
  candidate: ResolutionCandidate,
  thread: SlackThread
): DetectedResolution => ({
  threadTs: thread.threadTs,
  channelId: thread.channelId,
  confidence: candidate.score,
  resolutionContent: buildResolutionContent(candidate, thread),
  resolutionMessageTs: candidate.message.ts,
  matchedPatterns: candidate.matchedPatterns,
  hasPositiveReactions: candidate.hasPositiveReactions,
  hasCodeBlock: candidate.hasCodeBlock,
  resolverUserId: candidate.message.userId,
  resolverUsername: candidate.message.username,
});

// ==================== Public API ====================

/**
 * Detects resolution in a Slack thread.
 *
 * Analyzes thread messages for resolution signals including:
 * - Pattern matching for resolution phrases
 * - Positive reaction indicators
 * - Code block presence
 * - Message position in thread
 * - Message length/substance
 *
 * @param thread - The Slack thread to analyze
 * @returns Detection result with resolution details if found
 */
export const detectResolution = (thread: SlackThread): ResolutionDetectionResult => {
  const { messages } = thread;
  const emptyMetadata = buildAnalysisMetadata(0, [], {}, 0);

  if (messages.length === 0) {
    return buildNoResolutionResult([], emptyMetadata);
  }

  const candidates = findResolutionCandidates(messages);
  const patternMatchCounts = collectPatternMatchCounts(candidates);
  const bestCandidate = candidates[0] ?? null;
  const topScore = bestCandidate?.score ?? 0;
  const meetsThreshold =
    bestCandidate !== null && bestCandidate.score >= CONFIDENCE_THRESHOLDS.MIN_RESOLUTION;

  logger.info("Resolution detection complete", {
    threadTs: thread.threadTs,
    channelId: thread.channelId,
    messagesAnalyzed: messages.length,
    candidatesFound: candidates.length,
    topScore,
    hasResolution: meetsThreshold,
  });

  const metadata = buildAnalysisMetadata(messages.length, candidates, patternMatchCounts, topScore);

  if (!meetsThreshold || bestCandidate === null) {
    return buildNoResolutionResult(candidates, metadata);
  }

  return {
    hasResolution: true,
    resolution: buildDetectedResolution(bestCandidate, thread),
    allCandidates: candidates,
    analysisMetadata: metadata,
  };
};

/**
 * Checks if a thread likely has a resolution without full analysis.
 *
 * Quick check for use cases where you just need to know if
 * further analysis is warranted.
 *
 * @param thread - The Slack thread to check
 * @returns true if thread shows resolution signals
 */
export const hasResolutionSignals = (thread: SlackThread): boolean => {
  // Quick pattern check on all message texts
  const allText = thread.messages.map((message) => message.text).join(" ");

  // Check for any resolution patterns
  const hasPatterns = RESOLUTION_PATTERNS.some((patternDef) => patternDef.pattern.test(allText));

  // Check for positive reactions on any message
  const hasReactions = thread.messages.some((message) => hasPositiveReactions(message));

  return hasPatterns || hasReactions;
};

/**
 * Extracts unique matched patterns from detection result.
 */
export const extractUniquePatterns = (result: ResolutionDetectionResult): readonly string[] => {
  const patternSet = new Set<string>();

  result.allCandidates.forEach((candidate) => {
    candidate.matchedPatterns.forEach((pattern) => {
      patternSet.add(pattern);
    });
  });

  return [...patternSet];
};
