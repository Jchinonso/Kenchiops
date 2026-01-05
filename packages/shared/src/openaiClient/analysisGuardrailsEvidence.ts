/**
 * Evidence extraction helpers for analysis guardrails.
 *
 * Parses structured CI/CD evidence into analyzable sections
 * for LLM-based failure analysis.
 *
 * @module openaiClient/analysisGuardrailsEvidence
 */

import type { Evidence, FailureCategory, PipelinePhase } from "../core/types.js";
import { truncateText } from "../formatting/uiHelpers.js";

// Import from patterns sub-module
import {
  DEPENDENCY_NAME_PATTERN,
  VERSION_PATTERN,
  DEPENDENCY_EXCLUSIONS,
  FILE_PATH_IDENTIFIER,
  classifyFailureLine,
  isGenericErrorLine,
  getFirstMeaningfulLine,
  findFirstInfraLine,
  formatEvidenceId,
  appendEvidenceTag,
  escapeRegExp,
  isBlockHeaderLine,
} from "./evidencePatterns.js";

// Re-export patterns for backwards compatibility
export {
  GENERIC_ERROR_LINE_PATTERNS,
  ERROR_INDICATOR_PATTERNS,
  INFRA_PATTERNS,
  CATEGORY_HINTS,
  FILE_PATH_IDENTIFIER,
  DEPENDENCY_NAME_PATTERN,
  VERSION_PATTERN,
  DEPENDENCY_EXCLUSIONS,
  classifyFailureLine,
  isGenericErrorLine,
  getFirstMeaningfulLine,
  findFirstInfraLine,
  formatEvidenceId,
  appendEvidenceTag,
  escapeRegExp,
  isBlockHeaderLine,
  type FailureClassification,
} from "./evidencePatterns.js";

// ==================== Types ====================

export interface ParsedTestFailure {
  readonly id: string;
  readonly testName: string;
  readonly file?: string;
  readonly errorLines: readonly string[];
}

export interface ParsedAnnotation {
  readonly id: string;
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
}

export interface ParsedTextBlock {
  readonly id: string;
  readonly title?: string;
  readonly lines: readonly string[];
}

export interface EvidenceSectionBlock {
  readonly heading: string;
  readonly content: string;
  readonly fullText: string;
}

export interface EvidenceSections {
  readonly hasTests: boolean;
  readonly hasAnnotations: boolean;
  readonly hasCheckOutput: boolean;
  readonly hasWorkflowLogs: boolean;
  readonly hasDependencyChanges: boolean;
  readonly hasBuildConfigChanges: boolean;
}

export interface EvidenceHighlights {
  readonly evidenceText: string;
  readonly testFailures: readonly ParsedTestFailure[];
  readonly annotations: readonly ParsedAnnotation[];
  readonly checkOutputs: readonly ParsedTextBlock[];
  readonly workflowLogs: readonly ParsedTextBlock[];
  readonly dependencyChanges: readonly ParsedTextBlock[];
  readonly buildConfigChanges: readonly ParsedTextBlock[];
  readonly dependencyNames: readonly string[];
  readonly configFiles: readonly string[];
  readonly secondaryFindings: readonly string[];
  readonly sections: EvidenceSections;
  readonly primaryErrorLine?: string;
  readonly primaryTestName?: string;
  readonly primaryFile?: string;
  readonly primaryLine?: number;
  readonly primaryEvidenceId?: string;
  readonly source?: "test" | "annotation" | "check" | "workflow" | "infra";
  readonly detectedCategory?: FailureCategory;
  readonly detectedPhase?: PipelinePhase;
}

// ==================== Section Parsing ====================

/**
 * Extracts a section from evidence content by heading.
 */
const extractSection = (content: string, heading: string): string | null => {
  const pattern = new RegExp(`## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].replace(/^\s*-{3,}\s*$/gm, "").trim();
};

/**
 * Splits evidence text into heading-based sections (e.g., "## Failed Tests").
 */
export const splitEvidenceSections = (content: string): EvidenceSectionBlock[] => {
  const sectionPattern = /^##\s+(.+)$/gm;
  const matches = [...content.matchAll(sectionPattern)];
  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((match, index) => {
      const startIndex = match.index ?? 0;
      const nextIndex = matches[index + 1]?.index ?? content.length;
      const fullText = content.slice(startIndex, nextIndex).trim();
      const heading = match[1]?.trim() || "Section";
      const contentBody = fullText.replace(/^##\s+.*\n?/, "").trim();
      return {
        heading,
        content: contentBody,
        fullText,
      };
    })
    .filter((section) => section.fullText.length > 0);
};

/**
 * Parses text blocks with ID headers.
 */
const parseTextBlocks = (section: string, prefix: string): ParsedTextBlock[] => {
  const splitPattern = new RegExp(`\\n\\n(?=\\s*(?:[-*]\\s*)?\\[${prefix}#)`);
  const blocks = section.split(splitPattern);
  return blocks
    .map((block) => {
      const headerMatch = block.match(
        new RegExp(`^\\s*(?:[-*]\\s*)?\\[${prefix}#([^\\]]+)\\]\\s*(.*)$`, "m")
      );
      if (!headerMatch) {
        return null;
      }
      const lines = block
        .split("\n")
        .filter((line) => !isBlockHeaderLine(line, prefix))
        .map((line) => line.replace(/^\s+/, ""))
        .filter((line) => line.length > 0);
      const parsed: ParsedTextBlock = {
        id: headerMatch[1].trim(),
        title: headerMatch[2]?.trim() || undefined,
        lines,
      };
      return parsed;
    })
    .filter((entry): entry is ParsedTextBlock => entry !== null);
};

/**
 * Parses test failure blocks from a section.
 */
const parseTestFailures = (section: string): ParsedTestFailure[] => {
  const blocks = section.split(/\n\n(?=\s*(?:[-*]\s*)?\[test#)/);
  return blocks
    .map((block) => {
      const headerMatch = block.match(/^\s*(?:[-*]\s*)?\[test#([^\]]+)\]\s*(.+)$/m);
      if (!headerMatch) {
        return null;
      }
      const fileMatch = block.match(/^\s*File:\s*(.+)$/m);
      const errorMatch = block.match(/TEST_ERROR_BEGIN\n([\s\S]*?)\nTEST_ERROR_END/);
      const errorLines =
        errorMatch?.[1]
          ?.split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0) ?? [];
      const parsed: ParsedTestFailure = {
        id: headerMatch[1].trim(),
        testName: headerMatch[2].trim(),
        file: fileMatch?.[1]?.trim(),
        errorLines,
      };
      return parsed;
    })
    .filter((entry): entry is ParsedTestFailure => entry !== null);
};

/**
 * Parses annotation blocks from a section.
 */
const parseAnnotations = (section: string): ParsedAnnotation[] => {
  const blocks = section.split(/\n\n(?=\s*(?:[-*]\s*)?\[anno#)/);
  return blocks
    .map((block) => {
      const headerMatch = block.match(/^\s*(?:[-*]\s*)?\[anno#([^\]]+)\]\s*(.*)$/m);
      if (!headerMatch) {
        return null;
      }
      const pathLineMatch = block.match(/^\s*Path:\s*(.+)$/m);
      const pathLine = pathLineMatch?.[1]?.trim();
      const pathMatch = pathLine ? pathLine.match(/^(.*?):(\d+)\s*$/) : null;
      const messageLines = block
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return (
            !trimmed.startsWith("[anno#") &&
            !trimmed.startsWith("- [anno#") &&
            !trimmed.startsWith("* [anno#") &&
            !trimmed.startsWith("Path:")
          );
        })
        .map((line) => line.replace(/^\s+/, ""))
        .filter((line) => line.length > 0);
      const message = messageLines.join("\n").trim();
      const parsed: ParsedAnnotation = {
        id: headerMatch[1].trim(),
        path: pathMatch ? pathMatch[1] : pathLine,
        line: pathMatch ? parseInt(pathMatch[2], 10) : undefined,
        message,
      };
      return parsed;
    })
    .filter((entry): entry is ParsedAnnotation => entry !== null);
};

// ==================== Extraction Helpers ====================

/**
 * Extracts dependency names from parsed blocks.
 */
const extractDependencyNames = (blocks: readonly ParsedTextBlock[]): string[] => {
  const rawTokens = blocks.flatMap((block) => {
    const content = [block.title ?? "", ...block.lines].join(" ");
    return content.match(DEPENDENCY_NAME_PATTERN) ?? [];
  });
  const uniqueTokens = Array.from(new Set(rawTokens.map((token) => token.trim()))).filter(
    (token) => token.length >= 3 && /[A-Za-z]/.test(token) && !VERSION_PATTERN.test(token)
  );
  return uniqueTokens.filter((token) => !DEPENDENCY_EXCLUSIONS.has(token.toLowerCase()));
};

const hasMeaningfulErrorLine = (lines: readonly string[]): boolean =>
  lines.some((line) => line.trim().length > 0 && !isGenericErrorLine(line));

/**
 * Extracts config file paths from parsed blocks.
 */
const extractConfigFiles = (blocks: readonly ParsedTextBlock[]): string[] => {
  const rawPaths = blocks.flatMap((block) => {
    const content = [block.id, block.title ?? "", ...block.lines].join(" ");
    return content.match(FILE_PATH_IDENTIFIER) ?? [];
  });
  return Array.from(new Set(rawPaths.map((path) => path.trim()))).filter((path) => path.length > 3);
};

/**
 * Builds secondary findings from additional test failures and annotations.
 */
const buildSecondaryFindings = (
  testFailures: readonly ParsedTestFailure[],
  annotations: readonly ParsedAnnotation[],
  primaryEvidenceId?: string
): string[] => {
  const findings: string[] = [];
  const primaryTestId = primaryEvidenceId?.startsWith("test#") ? primaryEvidenceId : undefined;
  const primaryAnnoId = primaryEvidenceId?.startsWith("anno#") ? primaryEvidenceId : undefined;

  const extraTests = testFailures
    .filter((testFailure) => formatEvidenceId("test", testFailure.id) !== primaryTestId)
    .slice(0, 2);
  extraTests.forEach((testFailure) => {
    findings.push(
      appendEvidenceTag(
        `Additional failing test: ${truncateText(testFailure.testName, 80)}`,
        formatEvidenceId("test", testFailure.id)
      )
    );
  });

  const extraAnnotations = annotations
    .filter((annotation) => formatEvidenceId("anno", annotation.id) !== primaryAnnoId)
    .slice(0, 2);
  extraAnnotations.forEach((annotation) => {
    const location = annotation.path
      ? annotation.line
        ? `${annotation.path}:${annotation.line}`
        : annotation.path
      : "annotation";
    findings.push(
      appendEvidenceTag(
        `Additional annotation at ${location}`,
        formatEvidenceId("anno", annotation.id)
      )
    );
  });

  return findings;
};

// ==================== Main Extraction ====================

/**
 * Extracts structured highlights from evidence for LLM analysis.
 *
 * @param evidence - The evidence object containing logs
 * @returns Extracted highlights with parsed sections and primary error info
 */
export const extractEvidenceHighlights = (evidence: Evidence): EvidenceHighlights => {
  const evidenceText = (evidence.logs ?? []).map((log) => log.message).join("\n");
  const testSection = extractSection(evidenceText, "Failed Tests");
  const annotationSection = extractSection(evidenceText, "CI Annotations (Errors & Warnings)");
  const checkSection = extractSection(evidenceText, "CI Check Output");
  const workflowSection = extractSection(evidenceText, "Workflow Logs");
  const dependencySection = extractSection(evidenceText, "Dependency Changes");
  const configSection = extractSection(evidenceText, "Build Config Changes");

  const testFailures = testSection ? parseTestFailures(testSection) : [];
  const annotations = annotationSection ? parseAnnotations(annotationSection) : [];
  const checkOutputs = checkSection ? parseTextBlocks(checkSection, "check") : [];
  const workflowLogs = workflowSection ? parseTextBlocks(workflowSection, "wflog") : [];
  const dependencyChanges = dependencySection ? parseTextBlocks(dependencySection, "dep") : [];
  const buildConfigChanges = configSection ? parseTextBlocks(configSection, "cfg") : [];

  const dependencyNames = extractDependencyNames(dependencyChanges);
  const configFiles = extractConfigFiles(buildConfigChanges);

  const sections: EvidenceSections = {
    hasTests: testFailures.length > 0,
    hasAnnotations: annotations.length > 0,
    hasCheckOutput: checkOutputs.length > 0,
    hasWorkflowLogs: workflowLogs.length > 0,
    hasDependencyChanges: dependencyChanges.length > 0,
    hasBuildConfigChanges: buildConfigChanges.length > 0,
  };

  let primaryErrorLine: string | undefined;
  let primaryTestName: string | undefined;
  let primaryFile: string | undefined;
  let primaryLine: number | undefined;
  let primaryEvidenceId: string | undefined;
  let source: EvidenceHighlights["source"];

  const primaryTest = testFailures.find((failure) => hasMeaningfulErrorLine(failure.errorLines));
  const fallbackTest = primaryTest ?? testFailures[0];
  const shouldUseTest =
    Boolean(fallbackTest) &&
    (hasMeaningfulErrorLine(fallbackTest.errorLines) ||
      (annotations.length === 0 && checkOutputs.length === 0 && workflowLogs.length === 0));

  if (shouldUseTest && fallbackTest) {
    primaryErrorLine = getFirstMeaningfulLine(fallbackTest.errorLines);
    primaryTestName = fallbackTest.testName;
    primaryFile = fallbackTest.file;
    primaryEvidenceId = formatEvidenceId("test", fallbackTest.id);
    source = "test";
  } else if (annotations.length > 0) {
    const primaryAnnotation = annotations[0];
    primaryErrorLine = getFirstMeaningfulLine(primaryAnnotation.message.split("\n"));
    primaryFile = primaryAnnotation.path;
    primaryLine = primaryAnnotation.line;
    primaryEvidenceId = formatEvidenceId("anno", primaryAnnotation.id);
    source = "annotation";
  } else if (checkOutputs.length > 0) {
    const primaryCheck = checkOutputs[0];
    primaryErrorLine = getFirstMeaningfulLine(primaryCheck.lines);
    primaryEvidenceId = formatEvidenceId("check", primaryCheck.id);
    source = "check";
  } else if (workflowLogs.length > 0) {
    const primaryWorkflow = workflowLogs[0];
    primaryErrorLine = getFirstMeaningfulLine(primaryWorkflow.lines);
    primaryEvidenceId = formatEvidenceId("wflog", primaryWorkflow.id);
    source = "workflow";
  } else {
    const infraLine = findFirstInfraLine(evidenceText);
    if (infraLine) {
      primaryErrorLine = infraLine;
      source = "infra";
    }
  }

  const classification = primaryErrorLine ? classifyFailureLine(primaryErrorLine) : null;
  const detectedCategory =
    source === "test" ? "test" : source === "infra" ? "infra" : classification?.category;
  const detectedPhase =
    source === "test" ? "test" : source === "infra" ? "build" : classification?.phase;

  const secondaryFindings = buildSecondaryFindings(testFailures, annotations, primaryEvidenceId);

  return {
    evidenceText,
    testFailures,
    annotations,
    checkOutputs,
    workflowLogs,
    dependencyChanges,
    buildConfigChanges,
    dependencyNames,
    configFiles,
    secondaryFindings,
    sections,
    primaryErrorLine,
    primaryTestName,
    primaryFile,
    primaryLine,
    primaryEvidenceId,
    source,
    detectedCategory,
    detectedPhase,
  };
};
