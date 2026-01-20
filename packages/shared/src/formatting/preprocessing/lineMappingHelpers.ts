/**
 * Line Mapping Helpers
 *
 * Utilities for tracking and converting between sanitized and original line numbers.
 * Enables accurate line number references in PR annotations after log preprocessing.
 *
 * @module formatting/preprocessing/lineMappingHelpers
 */

import { redactSecretsWithStats } from "../../security/redaction.js";
import {
  PROGRESS_INDICATOR_PATTERNS,
  LINE_NUMBER_CONFIG,
  PERCENTAGE_CONFIG,
} from "../../constants/index.js";
import type { LineMapping } from "../chunking/types.js";

import {
  stripAnsiCodes,
  stripCITimestamps,
  stripCIGroupMarkers,
  collapseRepeatedLines,
} from "./preprocessor.js";
import type { SanitizationResultWithMapping, LineMappingAccumulator } from "./types.js";

// ==================== Line Mapping Helpers ====================

/**
 * Check if a line should be removed during preprocessing.
 */
const shouldRemoveLine = (line: string, progressPatterns: readonly RegExp[]): boolean => {
  if (line.trim() === "") {
    return false;
  }
  return progressPatterns.some((pattern) => pattern.test(line));
};

/**
 * Apply text transformations that don't change line count.
 */
const transformLine = (
  line: string
): { readonly transformed: string; readonly wasModified: boolean } => {
  const noAnsi = stripAnsiCodes(line);
  const noTimestamps = stripCITimestamps(noAnsi);
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);
  const wasModified = noGroupMarkers !== line;
  return { transformed: noGroupMarkers, wasModified };
};

/**
 * Full sanitization pipeline with line mapping tracking.
 * Enables recovery of original line numbers for extracted artifacts.
 *
 * @param rawLogs - The raw CI log content
 * @returns SanitizationResultWithMapping with line mappings
 */
export const sanitizeForChunkingWithMapping = (rawLogs: string): SanitizationResultWithMapping => {
  const originalSize = rawLogs.length;
  const originalLines = rawLogs.split("\n");
  const progressPatterns = [...PROGRESS_INDICATOR_PATTERNS];

  const initial: LineMappingAccumulator = {
    sanitizedLines: [],
    lineMappings: [],
    sanitizedLineNumber: 0,
  };

  const mappedResult = originalLines.reduce<LineMappingAccumulator>(
    (accumulator, originalLine, originalIndex) => {
      const originalLineNumber = originalIndex + LINE_NUMBER_CONFIG.ARRAY_TO_LINE_OFFSET;

      if (shouldRemoveLine(originalLine, progressPatterns)) {
        return accumulator;
      }

      const { transformed, wasModified } = transformLine(originalLine);
      const newSanitizedLineNumber =
        accumulator.sanitizedLineNumber + LINE_NUMBER_CONFIG.ARRAY_TO_LINE_OFFSET;
      const newMapping: LineMapping = {
        sanitizedLine: newSanitizedLineNumber,
        originalLine: originalLineNumber,
        wasModified,
      };

      return {
        sanitizedLines: [...accumulator.sanitizedLines, transformed],
        lineMappings: [...accumulator.lineMappings, newMapping],
        sanitizedLineNumber: newSanitizedLineNumber,
      };
    },
    initial
  );

  const joinedText = mappedResult.sanitizedLines.join("\n");
  const collapseResult = collapseRepeatedLines(joinedText);
  const redactionResult = redactSecretsWithStats(collapseResult.text);

  const finalSize = redactionResult.text.length;
  const reductionPercent =
    originalSize > 0
      ? Math.round(
          ((originalSize - finalSize) / originalSize) * PERCENTAGE_CONFIG.DECIMAL_TO_PERCENT
        )
      : 0;

  const progressLinesRemoved = originalLines.length - mappedResult.sanitizedLines.length;

  return {
    text: redactionResult.text,
    originalSize,
    finalSize,
    reductionPercent,
    secretsRedacted: redactionResult.redactedCount,
    linesCollapsed: collapseResult.linesRemoved,
    progressLinesRemoved,
    lineMappings: mappedResult.lineMappings,
  };
};

// ==================== Line Number Conversion ====================

/**
 * Converts a sanitized line number back to original line number.
 *
 * @param lineMappings - The line mappings from sanitization
 * @param sanitizedLine - The sanitized line number (1-indexed)
 * @returns Original line number, or null if not found
 */
export const getOriginalLineNumber = (
  lineMappings: readonly LineMapping[],
  sanitizedLine: number
): number | null => {
  const mapping = lineMappings.find((lineMapping) => lineMapping.sanitizedLine === sanitizedLine);
  return mapping?.originalLine ?? null;
};

/**
 * Converts an original line number to sanitized line number.
 *
 * @param lineMappings - The line mappings from sanitization
 * @param originalLine - The original line number (1-indexed)
 * @returns Sanitized line number, or null if line was removed
 */
export const getSanitizedLineNumber = (
  lineMappings: readonly LineMapping[],
  originalLine: number
): number | null => {
  const mapping = lineMappings.find((lineMapping) => lineMapping.originalLine === originalLine);
  return mapping?.sanitizedLine ?? null;
};

/**
 * Composes multiple line mappings into a single combined mapping.
 *
 * @param mappings - Array of line mappings to compose (in order of application)
 * @returns Combined LineMapping array mapping from original to final sanitized
 */
export const composeLineMappings = (
  mappings: ReadonlyArray<readonly LineMapping[]>
): readonly LineMapping[] => {
  if (mappings.length === 0) {
    return [];
  }

  if (mappings.length === 1) {
    return mappings[0];
  }

  // Compose mappings sequentially using reduce
  return mappings.slice(1).reduce<readonly LineMapping[]>(
    (currentMappings, nextMappingSet) => {
      // Build lookup map from next mapping set
      const nextMappingLookup = new Map(
        nextMappingSet.map((mapping) => [mapping.originalLine, mapping] as const)
      );

      // Compose current mappings with next mappings
      return currentMappings.flatMap((currentMapping) => {
        const nextMapping = nextMappingLookup.get(currentMapping.sanitizedLine);
        if (!nextMapping) {
          return [];
        }
        return [
          {
            originalLine: currentMapping.originalLine,
            sanitizedLine: nextMapping.sanitizedLine,
            wasModified: currentMapping.wasModified || nextMapping.wasModified,
          },
        ];
      });
    },
    [...mappings[0]]
  );
};
