/**
 * Chunking Helpers
 *
 * Utility functions for log chunking including token estimation,
 * platform detection, and boundary detection.
 *
 * @module formatting/chunking/helpers
 */

import {
  TOKEN_ESTIMATION,
  CHUNKING_DEFAULTS,
  NATURAL_BOUNDARY_PATTERNS,
  CI_PLATFORM_DETECTION_PATTERNS,
  CI_PLATFORMS,
  type CIPlatformType,
} from "../../constants/index.js";

import type { ChunkingOptions } from "./types.js";

// ==================== Token Estimation ====================

/**
 * Estimates token count for a string using character-based heuristic.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / TOKEN_ESTIMATION.CHARS_PER_TOKEN);

/**
 * Estimates tokens for an array of lines.
 *
 * @param lines - Lines to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokensForLines = (lines: readonly string[]): number =>
  estimateTokens(lines.join("\n"));

// ==================== CI Platform Detection ====================

/**
 * Detects the CI platform from log content.
 *
 * @param content - Log content to analyze
 * @returns Detected CI platform or "unknown"
 */
export const detectCIPlatform = (content: string): CIPlatformType => {
  const platformEntries = Object.entries(CI_PLATFORM_DETECTION_PATTERNS);
  const detected = platformEntries.find(([, pattern]) => pattern.test(content));
  return detected ? (detected[0] as CIPlatformType) : CI_PLATFORMS.UNKNOWN;
};

// ==================== Natural Boundary Detection ====================

/**
 * Gets platform-specific boundary patterns.
 *
 * @param platform - Detected CI platform
 * @returns Combined array of patterns
 */
const getPlatformPatterns = (platform: CIPlatformType): readonly RegExp[] => {
  const platformPatterns =
    platform === CI_PLATFORMS.GITHUB_ACTIONS
      ? NATURAL_BOUNDARY_PATTERNS.GITHUB_ACTIONS
      : platform === CI_PLATFORMS.GITLAB_CI
        ? NATURAL_BOUNDARY_PATTERNS.GITLAB_CI
        : NATURAL_BOUNDARY_PATTERNS.GENERIC;

  return [...platformPatterns, ...NATURAL_BOUNDARY_PATTERNS.GENERIC];
};

/**
 * Finds natural boundary points in the log content.
 *
 * @param lines - Log lines to analyze
 * @param platform - Detected CI platform
 * @returns Array of line numbers (1-indexed) that are natural boundaries
 */
export const findNaturalBoundaries = (
  lines: readonly string[],
  platform: CIPlatformType
): readonly number[] => {
  const allPatterns = getPlatformPatterns(platform);

  return lines.flatMap((line, index) => {
    const lineNumber = index + 1;
    const isBoundary = allPatterns.some((pattern) => pattern.test(line));
    const isBlankFollowedByContent =
      line.trim() === "" && index < lines.length - 1 && lines[index + 1].trim() !== "";

    return isBoundary || isBlankFollowedByContent ? [lineNumber] : [];
  });
};

// ==================== Options Normalization ====================

/**
 * Validates chunking options and returns normalized values.
 *
 * @param options - User-provided options
 * @returns Normalized options with defaults applied
 */
export const normalizeChunkingOptions = (
  options: ChunkingOptions = {}
): Required<ChunkingOptions> => ({
  targetTokens: options.targetTokens ?? CHUNKING_DEFAULTS.TARGET_TOKENS,
  maxTokens: options.maxTokens ?? CHUNKING_DEFAULTS.MAX_TOKENS,
  overlapLines: options.overlapLines ?? CHUNKING_DEFAULTS.OVERLAP_LINES,
  maxChunks: options.maxChunks ?? CHUNKING_DEFAULTS.MAX_CHUNKS,
  smallLogThreshold: options.smallLogThreshold ?? CHUNKING_DEFAULTS.SMALL_LOG_THRESHOLD,
});

// ==================== Chunk Size Calculation ====================

/**
 * Calculates target lines per chunk based on content and token targets.
 *
 * @param content - Full log content
 * @param totalLines - Total number of lines
 * @param targetTokens - Target tokens per chunk
 * @returns Target lines per chunk
 */
export const calculateTargetLinesPerChunk = (
  content: string,
  totalLines: number,
  targetTokens: number
): number => {
  const avgCharsPerLine = content.length / totalLines;
  const avgTokensPerLine = avgCharsPerLine / TOKEN_ESTIMATION.CHARS_PER_TOKEN;
  return Math.floor(targetTokens / avgTokensPerLine);
};

/**
 * Calculates max lines per chunk based on content and max tokens.
 *
 * @param content - Full log content
 * @param totalLines - Total number of lines
 * @param maxTokens - Max tokens per chunk
 * @returns Max lines per chunk
 */
export const calculateMaxLinesPerChunk = (
  content: string,
  totalLines: number,
  maxTokens: number
): number => {
  const avgCharsPerLine = content.length / totalLines;
  const avgTokensPerLine = avgCharsPerLine / TOKEN_ESTIMATION.CHARS_PER_TOKEN;
  return Math.floor(maxTokens / avgTokensPerLine);
};
