/**
 * Protected Zone Detection
 *
 * Detects protected zones in CI logs that should not be split.
 * Protected zones include stack traces, test output, compiler errors, and CI groups.
 *
 * @module formatting/chunking/protectedZones
 */

import {
  PROTECTED_ZONE_CONFIG,
  PROTECTED_ZONE_PATTERNS,
  PROTECTED_ZONE_TYPES,
  type ProtectedZoneType,
} from "../../constants/index.js";

import type { ProtectedZone, ZoneAccumulatorState, ZoneDetector } from "./types.js";

// ==================== Pattern Matching ====================

/**
 * Checks if a line matches any pattern in a pattern array.
 *
 * @param line - Line to check
 * @param patterns - Patterns to match against
 * @returns Whether the line matches any pattern
 */
const matchesAnyPattern = (line: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(line));

// ==================== Zone Detection Configuration ====================

/**
 * Ordered list of zone detectors. First match wins.
 */
const ZONE_DETECTORS: readonly ZoneDetector[] = [
  { type: PROTECTED_ZONE_TYPES.STACK_TRACE, patterns: PROTECTED_ZONE_PATTERNS.STACK_TRACE },
  { type: PROTECTED_ZONE_TYPES.TEST_OUTPUT, patterns: PROTECTED_ZONE_PATTERNS.TEST_OUTPUT },
  { type: PROTECTED_ZONE_TYPES.COMPILER_ERROR, patterns: PROTECTED_ZONE_PATTERNS.COMPILER_ERROR },
  { type: PROTECTED_ZONE_TYPES.CI_GROUP, patterns: PROTECTED_ZONE_PATTERNS.CI_GROUP },
];

// ==================== Zone Start Detection ====================

/**
 * Checks if line matches "Error:/Exception:/Traceback:" followed by indented lines.
 */
const isErrorWithStackTrace = (line: string, nextLines: readonly string[]): boolean =>
  /^(?:Error|Exception|Traceback):/i.test(line) &&
  nextLines.slice(0, 3).some((nextLine) => /^\s{2,}/.test(nextLine));

/**
 * Detects if a line starts a protected zone using handler pattern.
 *
 * @param line - Line to check
 * @param nextLines - Following lines for context
 * @returns Protected zone type if detected, undefined otherwise
 */
export const detectProtectedZoneStart = (
  line: string,
  nextLines: readonly string[]
): ProtectedZoneType | undefined => {
  const errorWithStackTrace = isErrorWithStackTrace(line, nextLines)
    ? PROTECTED_ZONE_TYPES.STACK_TRACE
    : undefined;

  const patternMatch = ZONE_DETECTORS.find((detector) =>
    matchesAnyPattern(line, detector.patterns)
  )?.type;

  return errorWithStackTrace ?? patternMatch;
};

// ==================== Zone Continuation ====================

/**
 * Zone continuation handlers. Each returns true if line continues the zone.
 */
const ZONE_CONTINUATION_HANDLERS: Readonly<Record<ProtectedZoneType, (line: string) => boolean>> = {
  [PROTECTED_ZONE_TYPES.STACK_TRACE]: (line) =>
    /^\s+at\s+/.test(line) || /^\s{2,}\S/.test(line) || /^\s+File\s+"/.test(line),

  [PROTECTED_ZONE_TYPES.TEST_OUTPUT]: (line) =>
    line.trim() !== "" && !/^(?:PASS|FAIL|ok|FAILED)\s+/.test(line),

  [PROTECTED_ZONE_TYPES.COMPILER_ERROR]: (line) =>
    /^\s{2,}/.test(line) || /^\s*\^+/.test(line) || /^\s*(?:note|help|warning):/.test(line),

  [PROTECTED_ZONE_TYPES.CI_GROUP]: (line) => !/^(?:##\[endgroup\]|section_end:)/.test(line),
};

/**
 * Determines if a line continues a protected zone using lookup table.
 *
 * @param line - Line to check
 * @param zoneType - Type of zone being tracked
 * @param previousLine - Previous line for context
 * @returns Whether the line continues the zone
 */
export const continuesProtectedZone = (
  line: string,
  zoneType: ProtectedZoneType,
  previousLine: string
): boolean => {
  const isEmptyWithinZone = line.trim() === "" && previousLine.trim() !== "";
  const handler = ZONE_CONTINUATION_HANDLERS[zoneType];
  return isEmptyWithinZone || (handler ? handler(line) : false);
};

// ==================== Main Detection Function ====================

/**
 * Detects all protected zones in the log content.
 * Uses reduce for immutable accumulation.
 *
 * @param lines - Log lines to analyze
 * @returns Array of protected zones
 */
export const detectProtectedZones = (lines: readonly string[]): readonly ProtectedZone[] => {
  const initialState: ZoneAccumulatorState = {
    zones: [],
    currentZone: null,
  };

  const finalState = lines.reduce<ZoneAccumulatorState>((state, line, index) => {
    const lineNumber = index + 1;
    const nextLines = lines.slice(index + 1, index + PROTECTED_ZONE_CONFIG.LOOKAHEAD_LINES);
    const previousLine = index > 0 ? lines[index - 1] : "";

    if (state.currentZone) {
      if (continuesProtectedZone(line, state.currentZone.type, previousLine)) {
        return state;
      }

      const completedZone: ProtectedZone = {
        type: state.currentZone.type,
        startLine: state.currentZone.startLine,
        endLine: lineNumber - 1,
        description: state.currentZone.description,
      };

      const zoneType = detectProtectedZoneStart(line, nextLines);
      return {
        zones: [...state.zones, completedZone],
        currentZone: zoneType
          ? {
              type: zoneType,
              startLine: lineNumber,
              description: line.slice(0, PROTECTED_ZONE_CONFIG.MAX_DESCRIPTION_LENGTH),
            }
          : null,
      };
    }

    const zoneType = detectProtectedZoneStart(line, nextLines);
    if (zoneType) {
      return {
        ...state,
        currentZone: {
          type: zoneType,
          startLine: lineNumber,
          description: line.slice(0, PROTECTED_ZONE_CONFIG.MAX_DESCRIPTION_LENGTH),
        },
      };
    }

    return state;
  }, initialState);

  return finalState.currentZone
    ? [
        ...finalState.zones,
        {
          type: finalState.currentZone.type,
          startLine: finalState.currentZone.startLine,
          endLine: lines.length,
          description: finalState.currentZone.description,
        },
      ]
    : finalState.zones;
};
