/**
 * Analysis Evidence Builder
 *
 * Handles evidence section splitting and log entry building for CI failure analysis.
 *
 * @module services/analysisEvidence
 */

import {
  LOG_LEVELS,
  EVIDENCE_SOURCES,
  ERROR_SECTION_HEADINGS,
  SECTION_SOURCE_OVERRIDES,
  EVIDENCE_LOG_TIMING,
  sanitizeIdPart,
  type LogEntry,
} from "@kenchi/shared";
import type { EvidenceSection, SectionAccumulator } from "../types/apiTypes.js";

// Re-export for backwards compatibility
export type { EvidenceSection } from "../types/apiTypes.js";

// ==================== Section Splitting ====================

/**
 * Splits evidence log content into sections by markdown headings.
 * Uses reduce for immutable accumulation.
 */
export const splitEvidenceSections = (content: string): readonly EvidenceSection[] => {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split("\n");
  const initialState: SectionAccumulator = {
    sections: [],
    currentHeading: "Overview",
    currentLines: [],
  };

  const finalState = lines.reduce<SectionAccumulator>((accumulator, line) => {
    const headingMatch = line.match(/^##\s+(.+)$/);

    if (headingMatch) {
      // Save previous section if it has content
      const newSection: EvidenceSection = {
        heading: accumulator.currentHeading,
        content: accumulator.currentLines.join("\n").trim(),
      };
      const updatedSections =
        accumulator.currentLines.length > 0 || accumulator.sections.length === 0
          ? [...accumulator.sections, newSection]
          : accumulator.sections;

      return {
        sections: updatedSections,
        currentHeading: headingMatch[1].trim(),
        currentLines: [],
      };
    }

    return {
      ...accumulator,
      currentLines: [...accumulator.currentLines, line],
    };
  }, initialState);

  // Save final section
  const allSections =
    finalState.currentLines.length > 0
      ? [
          ...finalState.sections,
          {
            heading: finalState.currentHeading,
            content: finalState.currentLines.join("\n").trim(),
          },
        ]
      : finalState.sections;

  return allSections.filter((section) => section.content.length > 0);
};

// ==================== Evidence Log Building ====================

/**
 * Builds evidence log entries from raw failure log content.
 * Splits into sections and maps each to a log entry.
 */
export const buildEvidenceLogs = (failureLog: string, collectedAt: string): readonly LogEntry[] => {
  const sections = splitEvidenceSections(failureLog);
  if (sections.length === 0) {
    return [
      {
        id: "raw_log",
        level: LOG_LEVELS.ERROR,
        message: failureLog,
        timestamp: collectedAt,
        source: EVIDENCE_SOURCES.CI,
      },
    ];
  }

  const baseTime = new Date(collectedAt).getTime();
  return sections.map((section, sectionIndex) => {
    const { heading } = section;
    const logLevel = ERROR_SECTION_HEADINGS.has(heading) ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO;
    const logId = sanitizeIdPart(heading);
    const logSource = SECTION_SOURCE_OVERRIDES[heading] ?? EVIDENCE_SOURCES.CI;
    const timestamp = new Date(
      baseTime + sectionIndex * EVIDENCE_LOG_TIMING.TIMESTAMP_OFFSET_MS
    ).toISOString();
    const message = section.content ? `## ${heading}\n${section.content}` : `## ${heading}`;

    return {
      id: logId,
      level: logLevel,
      message,
      timestamp,
      source: logSource,
    };
  });
};
