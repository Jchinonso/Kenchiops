/**
 * GitHub Comment Formatting Utilities
 *
 * Formats CI failure analysis into rich GitHub PR comments
 * with branded styling, structured sections, and emojis.
 */

import {
  collectCIErrors,
  getConfidenceLabel,
  truncateText,
  GIT_DISPLAY,
  UI_CONFIDENCE_THRESHOLDS,
  type CIAnnotation,
  type CITestFailure,
} from "@kenchi/shared";

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
  readonly prContext?: {
    readonly number: number;
    readonly title: string;
    readonly author: string;
    readonly branch: string;
  };
  readonly workflowContext?: {
    readonly name: string;
    readonly duration?: string;
  };
  readonly dependencyChanges?: ReadonlyArray<{
    readonly type: "added" | "removed" | "updated";
    readonly name: string;
    readonly oldVersion?: string;
    readonly newVersion?: string;
  }>;
}

/**
 * Priority emoji mapping for actions.
 */
const PRIORITY_EMOJI: Readonly<Record<string, string>> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

/**
 * Gets the priority emoji for an action.
 */
const getPriorityEmoji = (priority: string): string =>
  PRIORITY_EMOJI[priority.toLowerCase()] || "⚪";

/**
 * Gets confidence badge emoji based on score.
 * Uses UI_CONFIDENCE_THRESHOLDS for consistency.
 */
const getConfidenceBadge = (confidence: number): string => {
  if (confidence >= UI_CONFIDENCE_THRESHOLDS.VERY_HIGH) return "🟢";
  if (confidence >= UI_CONFIDENCE_THRESHOLDS.HIGH) return "🟡";
  if (confidence >= UI_CONFIDENCE_THRESHOLDS.MEDIUM) return "🟠";
  return "🔴";
};

/**
 * Builds the branded header section.
 */
const buildHeader = (): string => `## ❌ KenchiOps — CI Failure Analysis\n`;

/**
 * Builds the summary line showing what failed.
 */
const buildSummaryLine = (analysis: AnalysisData): string => {
  const repoName = analysis.repository.split("/").pop() || analysis.repository;
  const checkName = analysis.checkName || "CI";

  // Find first test failure if available
  const firstTest = analysis.testFailures?.[0]?.testName;
  const testInfo = firstTest ? ` on test \`${truncateText(firstTest, 40)}\`` : "";

  return `📦 **${repoName}** ${checkName} pipeline failed${testInfo}\n`;
};

/**
 * Builds the "Evidence" section with analysis details.
 */
const buildEvidenceSection = (analysis: AnalysisData): string => {
  const lines: string[] = ["### 🔍 Evidence\n"];

  // Main identified cause
  if (analysis.identified_cause) {
    lines.push(`> ${analysis.identified_cause}\n`);
  } else if (analysis.analysis) {
    const firstSentence = analysis.analysis.split(/[.!?]/)[0]?.trim();
    if (firstSentence) {
      lines.push(`> ${firstSentence}\n`);
    }
  }

  // Test failure details
  if (analysis.testFailures && analysis.testFailures.length > 0) {
    const failureCount = analysis.testFailures.length;
    lines.push(`\n**Test Failures:** ${failureCount} test${failureCount > 1 ? "s" : ""} failed\n`);

    // Show up to 3 test failures
    const displayFailures = analysis.testFailures.slice(0, 3);
    displayFailures.forEach((failure) => {
      const location = failure.file ? ` in \`${failure.file}\`` : "";
      lines.push(`- ❌ \`${truncateText(failure.testName, 60)}\`${location}`);
    });

    if (analysis.testFailures.length > 3) {
      lines.push(`- _...and ${analysis.testFailures.length - 3} more failures_`);
    }
    lines.push("");
  }

  // Annotation details
  const failureAnnotations = analysis.annotations?.filter((a) => a.level === "failure") || [];
  if (failureAnnotations.length > 0) {
    lines.push(`**Error Locations:**\n`);
    const displayAnnotations = failureAnnotations.slice(0, 3);
    displayAnnotations.forEach((ann) => {
      lines.push(`- 📍 \`${ann.path}:${ann.startLine}\` — ${truncateText(ann.message, 80)}`);
    });
    if (failureAnnotations.length > 3) {
      lines.push(`- _...and ${failureAnnotations.length - 3} more errors_`);
    }
    lines.push("");
  }

  // Dependency changes
  if (analysis.dependencyChanges && analysis.dependencyChanges.length > 0) {
    lines.push(`**Dependency Changes:** ${analysis.dependencyChanges.length} change(s)\n`);
    const displayDeps = analysis.dependencyChanges.slice(0, 3);
    displayDeps.forEach((dep) => {
      const icon = dep.type === "added" ? "➕" : dep.type === "removed" ? "➖" : "🔄";
      const version =
        dep.oldVersion && dep.newVersion
          ? ` (${dep.oldVersion} → ${dep.newVersion})`
          : dep.newVersion
            ? ` (${dep.newVersion})`
            : "";
      lines.push(`- ${icon} \`${dep.name}\`${version}`);
    });
    if (analysis.dependencyChanges.length > 3) {
      lines.push(`- _...and ${analysis.dependencyChanges.length - 3} more changes_`);
    }
    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Builds the "Impact" section describing the failure impact.
 */
const buildImpactSection = (analysis: AnalysisData): string => {
  const lines: string[] = ["### 💥 Impact\n"];

  const impacts: string[] = [];

  // Determine impact based on available data
  if (analysis.testFailures && analysis.testFailures.length > 0) {
    impacts.push(
      `${analysis.testFailures.length} test${analysis.testFailures.length > 1 ? "s" : ""} failing`
    );
  }

  const failureAnnotations = analysis.annotations?.filter((a) => a.level === "failure") || [];
  if (failureAnnotations.length > 0) {
    impacts.push(
      `${failureAnnotations.length} error${failureAnnotations.length > 1 ? "s" : ""} detected`
    );
  }

  if (analysis.checkName) {
    impacts.push(`\`${analysis.checkName}\` workflow blocked`);
  }

  // Add PR merge impact
  if (analysis.prContext) {
    impacts.push("PR cannot be merged until resolved");
  }

  if (impacts.length === 0) {
    impacts.push("CI pipeline blocked");
  }

  impacts.forEach((impact) => {
    lines.push(`- ⚠️ ${impact}`);
  });
  lines.push("");

  return lines.join("\n");
};

/**
 * Builds the "Recommendation" section with actionable fixes.
 */
const buildRecommendationSection = (analysis: AnalysisData): string => {
  const actions = analysis.recommended_actions || [];

  if (actions.length === 0) {
    return "";
  }

  const lines: string[] = ["### 🛠️ Recommendation\n"];

  // Take top 3 actions
  const topActions = actions.slice(0, 3);
  topActions.forEach((action, index) => {
    const emoji = getPriorityEmoji(action.priority);
    const number = index + 1;
    lines.push(`${number}. ${emoji} ${action.description}`);
  });

  if (actions.length > 3) {
    lines.push(`\n_${actions.length - 3} more recommendations available_`);
  }

  lines.push("");
  return lines.join("\n");
};

/**
 * Builds the errors section from collected CI errors.
 */
const buildErrorsSection = (analysis: AnalysisData): string => {
  const errors = collectCIErrors(analysis.annotations, analysis.testFailures, {
    includeEmoji: false,
  });

  if (errors.length === 0) return "";

  const lines: string[] = ["### 📋 Error Details\n"];
  lines.push("```");

  // Limit to 5 errors, truncate each
  const displayErrors = errors.slice(0, 5);
  displayErrors.forEach((err) => {
    lines.push(truncateText(err, 120));
  });

  lines.push("```");

  if (errors.length > 5) {
    lines.push(`\n_...and ${errors.length - 5} more errors_`);
  }

  lines.push("");
  return lines.join("\n");
};

/**
 * Builds the confidence badge section.
 */
const buildConfidenceSection = (analysis: AnalysisData): string => {
  const percentage = Math.round(analysis.confidence * 100);
  const label = getConfidenceLabel(analysis.confidence);
  const badge = getConfidenceBadge(analysis.confidence);

  return `${badge} **Analysis Confidence:** ${percentage}% (${label})\n`;
};

/**
 * Builds the metadata section with commit/PR info.
 */
const buildMetadataSection = (analysis: AnalysisData): string => {
  const parts: string[] = [];

  if (analysis.checkName) {
    parts.push(`🔧 **Workflow:** ${analysis.checkName}`);
  }

  if (analysis.headSha) {
    const shortSha = analysis.headSha.substring(0, GIT_DISPLAY.SHA_DISPLAY_LENGTH);
    parts.push(`📝 **Commit:** \`${shortSha}\``);
  }

  if (analysis.workflowContext?.duration) {
    parts.push(`⏱️ **Duration:** ${analysis.workflowContext.duration}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `\n<details>\n<summary>📊 Details</summary>\n\n${parts.join(" • ")}\n\n</details>\n`;
};

/**
 * Builds the footer section.
 */
const buildFooter = (): string =>
  `---\n*🤖 Powered by [KenchiOps](https://github.com/kenchi/devops) — AI-driven DevOps Assistant*`;

/**
 * Format analysis into a rich GitHub comment with structured sections.
 *
 * Structure:
 * ## ❌ KenchiOps — CI Failure Analysis
 * 📦 repo-name pipeline failed on test `test_name`
 *
 * ### 🔍 Evidence
 * > Main identified cause
 * - Test failures list
 * - Error locations
 *
 * ### 💥 Impact
 * - Impact items
 *
 * ### 🛠️ Recommendation
 * 1. Action 1
 * 2. Action 2
 *
 * ### 📋 Error Details
 * ```
 * Error messages
 * ```
 *
 * 🟢 Analysis Confidence: 85% (High)
 *
 * ---
 * 🤖 Powered by KenchiOps
 *
 * @param analysis - The CI failure analysis data
 * @returns Formatted markdown string for GitHub comment
 */
export const formatGitHubComment = (analysis: AnalysisData): string => {
  const sections = [
    buildHeader(),
    buildSummaryLine(analysis),
    buildEvidenceSection(analysis),
    buildImpactSection(analysis),
    buildRecommendationSection(analysis),
    buildErrorsSection(analysis),
    buildConfidenceSection(analysis),
    buildMetadataSection(analysis),
    buildFooter(),
  ];

  return sections.filter(Boolean).join("\n");
};

/**
 * Format a "low risk" / "all clear" comment for when confidence is high
 * and no critical issues are found.
 *
 * @param analysis - The CI failure analysis data
 * @returns Formatted markdown string for "all clear" scenario
 */
export const formatAllClearComment = (analysis: AnalysisData): string => {
  const repoName = analysis.repository.split("/").pop() || analysis.repository;
  const percentage = Math.round(analysis.confidence * 100);

  const sections = [
    `## ✅ KenchiOps — CI Analysis Complete\n`,
    `📦 **${repoName}** analysis completed successfully.\n`,
    `### 🔍 Summary\n`,
    `> ${analysis.identified_cause || analysis.analysis || "No critical issues detected."}\n`,
    `🟢 **Analysis Confidence:** ${percentage}%\n`,
    buildFooter(),
  ];

  return sections.join("\n");
};
