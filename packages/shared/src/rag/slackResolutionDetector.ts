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
  type SlackMessage,
} from "./slackResolutionPatterns.js";

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

// ==================== Types ====================

/**
 * A Slack thread with its messages.
 */
export interface SlackThread {
  readonly channelId: string;
  readonly channelName?: string;
  readonly threadTs: string;
  readonly messages: readonly SlackMessage[];
  readonly originalIssue?: string;
  readonly repository?: string;
}

/**
 * Detected resolution from a Slack thread.
 */
export interface DetectedResolution {
  readonly threadTs: string;
  readonly channelId: string;
  readonly confidence: number;
  readonly resolutionContent: string;
  readonly resolutionMessageTs: string;
  readonly matchedPatterns: readonly string[];
  readonly hasPositiveReactions: boolean;
  readonly hasCodeBlock: boolean;
  readonly resolverUserId: string;
  readonly resolverUsername?: string;
}

/**
 * Result of resolution detection.
 */
export interface ResolutionDetectionResult {
  readonly hasResolution: boolean;
  readonly resolution: DetectedResolution | null;
  readonly allCandidates: readonly ResolutionCandidate[];
  readonly analysisMetadata: ResolutionAnalysisMetadata;
}

/**
 * A candidate message that may contain a resolution.
 */
interface ResolutionCandidate {
  readonly message: SlackMessage;
  readonly score: number;
  readonly matchedPatterns: readonly string[];
  readonly hasPositiveReactions: boolean;
  readonly hasCodeBlock: boolean;
}

/**
 * Metadata about the resolution analysis.
 */
interface ResolutionAnalysisMetadata {
  readonly messagesAnalyzed: number;
  readonly candidatesFound: number;
  readonly topScore: number;
  readonly patternMatchCounts: Readonly<Record<string, number>>;
}

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

  if (messages.length === 0) {
    return {
      hasResolution: false,
      resolution: null,
      allCandidates: [],
      analysisMetadata: {
        messagesAnalyzed: 0,
        candidatesFound: 0,
        topScore: 0,
        patternMatchCounts: {},
      },
    };
  }

  // Find all resolution candidates
  const candidates = findResolutionCandidates(messages);

  // Collect pattern match statistics
  const patternMatchCounts = collectPatternMatchCounts(candidates);

  // Check if best candidate meets threshold
  const bestCandidate = candidates[0] ?? null;
  const meetsThreshold =
    bestCandidate !== null && bestCandidate.score >= CONFIDENCE_THRESHOLDS.MIN_RESOLUTION;

  logger.info("Resolution detection complete", {
    threadTs: thread.threadTs,
    channelId: thread.channelId,
    messagesAnalyzed: messages.length,
    candidatesFound: candidates.length,
    topScore: bestCandidate?.score ?? 0,
    hasResolution: meetsThreshold,
  });

  if (!meetsThreshold || bestCandidate === null) {
    return {
      hasResolution: false,
      resolution: null,
      allCandidates: candidates,
      analysisMetadata: {
        messagesAnalyzed: messages.length,
        candidatesFound: candidates.length,
        topScore: bestCandidate?.score ?? 0,
        patternMatchCounts,
      },
    };
  }

  // Build resolution from best candidate
  const resolution: DetectedResolution = {
    threadTs: thread.threadTs,
    channelId: thread.channelId,
    confidence: bestCandidate.score,
    resolutionContent: buildResolutionContent(bestCandidate, thread),
    resolutionMessageTs: bestCandidate.message.ts,
    matchedPatterns: bestCandidate.matchedPatterns,
    hasPositiveReactions: bestCandidate.hasPositiveReactions,
    hasCodeBlock: bestCandidate.hasCodeBlock,
    resolverUserId: bestCandidate.message.userId,
    resolverUsername: bestCandidate.message.username,
  };

  return {
    hasResolution: true,
    resolution,
    allCandidates: candidates,
    analysisMetadata: {
      messagesAnalyzed: messages.length,
      candidatesFound: candidates.length,
      topScore: bestCandidate.score,
      patternMatchCounts,
    },
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
