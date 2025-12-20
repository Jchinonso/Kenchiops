/**
 * GitHub Comment Formatting Utilities
 *
 * Formats CI failure analysis into GitHub PR comments.
 */

import { collectCIErrors, type CIAnnotation, type CITestFailure } from "@kenchi/shared";

/**
 * Analysis data structure for GitHub comments.
 */
export interface AnalysisData {
  readonly summary?: string;
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence: number;
  readonly recommended_actions?: ReadonlyArray<{
    readonly priority: string;
    readonly description: string;
  }>;
  readonly repository: string;
  readonly checkName?: string;
  readonly headSha?: string;
  readonly annotations?: ReadonlyArray<CIAnnotation>;
  readonly testFailures?: ReadonlyArray<CITestFailure>;
}

/**
 * Builds the header section of the comment.
 */
const buildHeader = (): string => `## 🔍 CI Failure Analysis\n`;

/**
 * Builds the main message section from analysis.
 */
const buildMainMessage = (analysis: AnalysisData): string => {
  const message = analysis.identified_cause || analysis.summary || analysis.analysis;
  return message ? `${message}\n` : "";
};

/**
 * Builds the errors section from annotations and test failures.
 */
const buildErrorsSection = (analysis: AnalysisData): string => {
  const errors = collectCIErrors(analysis.annotations, analysis.testFailures, {
    includeEmoji: true,
  });

  if (errors.length === 0) return "";

  const errorLines = errors.map((err) => `- ${err}`).join("\n");
  return `**Errors:**\n${errorLines}\n`;
};

/**
 * Builds the fix recommendation section.
 */
const buildFixSection = (analysis: AnalysisData): string => {
  const topAction = analysis.recommended_actions?.[0];
  return topAction ? `**Fix:** ${topAction.description}\n` : "";
};

/**
 * Builds the footer section.
 */
const buildFooter = (): string => `---\n*🤖 Kenchi DevOps Assistant*`;

/**
 * Format analysis into a concise GitHub comment.
 * Focused on: What broke? How to fix it?
 *
 * @param analysis - The CI failure analysis data
 * @returns Formatted markdown string for GitHub comment
 */
export const formatGitHubComment = (analysis: AnalysisData): string => {
  const sections = [
    buildHeader(),
    buildMainMessage(analysis),
    buildErrorsSection(analysis),
    buildFixSection(analysis),
    buildFooter(),
  ];

  return sections.filter(Boolean).join("\n");
};
