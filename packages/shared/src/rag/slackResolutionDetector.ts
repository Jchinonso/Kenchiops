/**
 * Slack Resolution Detector
 *
 * Analyzes Slack threads to detect resolution signals and extract
 * resolution content for ingestion into the RAG knowledge base.
 *
 * @module rag/slackResolutionDetector
 */

import { createLogger } from "../core/logger.js";

const logger = createLogger("slack-resolution-detector");

// ==================== Types ====================

/**
 * A single message in a Slack thread.
 */
export interface SlackMessage {
  readonly ts: string;
  readonly userId: string;
  readonly username?: string;
  readonly text: string;
  readonly reactions?: readonly SlackReaction[];
  readonly isBot?: boolean;
  readonly threadTs?: string;
}

/**
 * A reaction on a Slack message.
 */
export interface SlackReaction {
  readonly name: string;
  readonly count: number;
  readonly users?: readonly string[];
}

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

// ==================== Constants ====================

/**
 * Patterns that indicate a resolution or fix.
 */
const RESOLUTION_PATTERNS = [
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
const POSITIVE_REACTIONS = new Set([
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
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`]+`/;

/**
 * Confidence thresholds.
 */
const CONFIDENCE_THRESHOLDS = {
  MIN_RESOLUTION: 0.2,
  HIGH_CONFIDENCE: 0.6,
  PATTERN_WEIGHT: 0.2,
  REACTION_WEIGHT: 0.2,
  CODE_BLOCK_WEIGHT: 0.15,
  MESSAGE_LENGTH_WEIGHT: 0.1,
  POSITION_WEIGHT: 0.15,
} as const;

// ==================== Pattern Matching ====================

/**
 * Finds all matching resolution patterns in text.
 */
const findMatchingPatterns = (text: string): readonly string[] =>
  RESOLUTION_PATTERNS.filter((patternDef) => patternDef.pattern.test(text)).map(
    (patternDef) => patternDef.name
  );

/**
 * Checks if a message has positive reactions.
 */
const hasPositiveReactions = (message: SlackMessage): boolean => {
  if (!message.reactions || message.reactions.length === 0) {
    return false;
  }

  return message.reactions.some((reaction) => POSITIVE_REACTIONS.has(reaction.name));
};

/**
 * Checks if a message contains code blocks.
 */
const hasCodeBlock = (message: SlackMessage): boolean => CODE_BLOCK_PATTERN.test(message.text);

// ==================== Scoring ====================

/**
 * Calculates position score - later messages in thread are more likely to be resolutions.
 */
const calculatePositionScore = (messageIndex: number, totalMessages: number): number => {
  if (totalMessages <= 1) {
    return 0.5;
  }
  // Messages in the latter half get higher scores
  const normalizedPosition = messageIndex / (totalMessages - 1);
  return normalizedPosition * CONFIDENCE_THRESHOLDS.POSITION_WEIGHT;
};

/**
 * Calculates message length score - longer substantive messages score higher.
 */
const calculateLengthScore = (text: string): number => {
  const { length } = text;
  if (length < 50) {
    return 0;
  }
  if (length < 100) {
    return 0.3 * CONFIDENCE_THRESHOLDS.MESSAGE_LENGTH_WEIGHT;
  }
  if (length < 300) {
    return 0.7 * CONFIDENCE_THRESHOLDS.MESSAGE_LENGTH_WEIGHT;
  }
  return CONFIDENCE_THRESHOLDS.MESSAGE_LENGTH_WEIGHT;
};

/**
 * Calculates total confidence score for a message.
 */
const calculateConfidenceScore = (
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
  if (message.isBot && message.text.length < 100) {
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
