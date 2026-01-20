/**
 * GitHub Comment Formatter
 *
 * Formats LLM analysis results for GitHub PR comments.
 * Rich formatting with emojis, service grouping, and actionable recommendations.
 *
 * @module formatting/output/githubFormatter
 */

import type { LLMAnalysisResult, LLMCodeAnnotation } from "../../core/types.js";
import {
  SHORT_COMMIT_SHA_LENGTH,
  UI_CONSTANTS,
  FORMATTER_DISPLAY_LIMITS,
  CONFIDENCE_DESCRIPTIONS,
  CATEGORY_EMOJI,
} from "../../constants/index.js";
import type { OutputContext, GitHubCommentOutput } from "./types.js";

// ==================== Helper Functions ====================

/**
 * Extract service name from file path.
 */
const extractService = (path: string): string => {
  const serviceMatch = path.match(/^(services\/[^/]+|packages\/[^/]+)/);
  return serviceMatch ? serviceMatch[1] : "root";
};

/**
 * Group annotations by service.
 */
const groupByService = (
  annotations: readonly LLMCodeAnnotation[]
): Map<string, LLMCodeAnnotation[]> =>
  annotations.reduce<Map<string, LLMCodeAnnotation[]>>((groups, annotation) => {
    const service = extractService(annotation.path || "");
    const existing = groups.get(service) ?? [];
    return new Map(groups).set(service, [...existing, annotation]);
  }, new Map<string, LLMCodeAnnotation[]>());

/**
 * Get confidence description.
 */
const getConfidenceDescription = (confidence: string): string =>
  CONFIDENCE_DESCRIPTIONS[confidence] ?? CONFIDENCE_DESCRIPTIONS.unknown;

/**
 * Get category emoji.
 */
const getCategoryEmoji = (category: string): string =>
  CATEGORY_EMOJI[category] ?? CATEGORY_EMOJI.unknown;

// ==================== Section Formatters ====================

/**
 * Format the header section for GitHub comment.
 */
const formatHeader = (context: OutputContext, analysis: LLMAnalysisResult): string => {
  const shortSha = context.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);
  const confidenceScore = analysis.confidenceScore ?? 0;
  const confidencePercent = Math.round(confidenceScore * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
  const confidenceLevel = analysis.confidence ?? "unknown";
  const confidenceDesc = getConfidenceDescription(confidenceLevel);

  const annotationCount = analysis.codeAnnotations?.length ?? 0;
  const actionCount = analysis.nextSteps?.length ?? analysis.recommendedActions?.length ?? 0;

  const baseLines = [
    "## 🤖 KenchiOps CI Failure Analysis",
    "",
    `**Commit:** \`${shortSha}\``,
    `**Check:** ${context.checkName}`,
    `**Overall Confidence:** ${confidencePercent}% (${confidenceDesc})`,
  ];

  const branchLine =
    context.branchName && context.baseBranch
      ? `**Branch:** \`${context.branchName}\` → \`${context.baseBranch}\``
      : context.branchName
        ? `**Branch:** \`${context.branchName}\``
        : null;

  const checkParts = [
    ...(context.passedChecks?.map((check) => `✅ ${check}`) ?? []),
    ...(context.failedChecks?.map((check) => `❌ ${check}`) ?? []),
  ];
  const checksLine = checkParts.length > 0 ? `**Checks:** ${checkParts.join(", ")}` : null;

  const stats = [
    annotationCount > 0 ? `**Evidence:** ${annotationCount} items` : null,
    actionCount > 0 ? `**Actions:** ${actionCount} recommended` : null,
  ].filter((stat): stat is string => stat !== null);
  const statsLine = stats.length > 0 ? stats.join(" | ") : null;

  const lines = [...baseLines, branchLine, checksLine, statsLine, ""].filter(
    (line): line is string => line !== null
  );

  return lines.join("\n");
};

/**
 * Format the root cause section.
 */
const formatRootCause = (analysis: LLMAnalysisResult): string => {
  const cause = analysis.identifiedCause ?? analysis.summary;
  if (!cause) {
    return "";
  }

  const category = analysis.category ?? "unknown";
  const phase = analysis.phase ?? "unknown";
  const categoryEmoji = getCategoryEmoji(category);

  return [
    "### 🔍 Root Cause",
    "",
    `${categoryEmoji} **Category:** ${category} | **Phase:** ${phase}`,
    "",
    cause,
    "",
  ].join("\n");
};

/**
 * Format a single annotation item.
 */
const formatAnnotationItem = (annotation: LLMCodeAnnotation): string => {
  const path = annotation.path || "";
  const line = annotation.line ? `:${annotation.line}` : "";
  const location = path ? `\`${path}${line}\`` : "";

  const message = annotation.message || annotation.title || "";

  return location ? `- ❌ ${location}\n  ${message}` : `- ❌ ${message}`;
};

/**
 * Format the affected files section grouped by service.
 */
const formatAffectedFiles = (analysis: LLMAnalysisResult): string => {
  const annotations = analysis.codeAnnotations ?? [];
  if (annotations.length === 0) {
    return "";
  }

  const grouped = groupByService(annotations);
  const headerLines = [`### 📁 Affected Files (${annotations.length})`, ""];

  const serviceLines = Array.from(grouped.entries()).flatMap(([service, serviceAnnotations]) => {
    const fileWord = serviceAnnotations.length === 1 ? "file" : "files";
    const serviceHeader = `**${service}** (${serviceAnnotations.length} ${fileWord})`;

    const maxPerService = FORMATTER_DISPLAY_LIMITS.MAX_ANNOTATIONS_PER_SERVICE;
    const displayAnnotations = serviceAnnotations.slice(0, maxPerService);
    const annotationLines = displayAnnotations.map(formatAnnotationItem);

    const overflowLine =
      serviceAnnotations.length > maxPerService
        ? [`  *...and ${serviceAnnotations.length - maxPerService} more*`]
        : [];

    return [serviceHeader, ...annotationLines, ...overflowLine, ""];
  });

  return [...headerLines, ...serviceLines].join("\n");
};

/**
 * Format the recommended actions section.
 */
const formatRecommendations = (analysis: LLMAnalysisResult): string => {
  const steps =
    analysis.nextSteps ?? analysis.recommendedActions?.map((action) => action.description) ?? [];
  if (steps.length === 0) {
    return "";
  }

  const displaySteps = steps.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_NEXT_STEPS_DISPLAY);
  const stepLines = displaySteps.flatMap((step, index) => [`${index + 1}. ${step}`, ""]);

  return ["### 🛠️ Recommended Actions", "", ...stepLines].join("\n");
};

/**
 * Format the feedback section.
 */
const formatFeedback = (context: OutputContext): string => {
  const baseLines = [
    "---",
    "",
    "**Was this analysis helpful?** 👍 Yes · 👎 No",
    "",
    "> 💡 **Share your fix:** When you resolve this, reply with what worked — it helps the team learn faster.",
  ];

  const prLines = context.prNumber
    ? [
        "",
        `[View PR](https://github.com/${context.repository}/pull/${context.prNumber}) · [View Logs](https://github.com/${context.repository}/commit/${context.commitSha}/checks)`,
      ]
    : [];

  return [...baseLines, ...prLines].join("\n");
};

/**
 * Format the footer.
 */
const formatFooter = (): string =>
  ["", "---", "*Generated by KenchiOps DevOps Assistant*"].join("\n");

// ==================== Main Formatter ====================

/**
 * Format LLM analysis result as GitHub PR comment.
 *
 * @param analysis - The LLM analysis result
 * @param context - Output context with repository info
 * @returns GitHub comment output
 */
export const formatGitHubComment = (
  analysis: LLMAnalysisResult,
  context: OutputContext
): GitHubCommentOutput => {
  const sections = [
    formatHeader(context, analysis),
    formatRootCause(analysis),
    formatAffectedFiles(analysis),
    formatRecommendations(analysis),
    formatFeedback(context),
    formatFooter(),
  ].filter((section) => section.length > 0);

  return { body: sections.join("\n") };
};
