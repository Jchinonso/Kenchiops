/**
 * GitHub Comment Formatter
 *
 * Formats LLM analysis results for GitHub PR comments.
 * Rich formatting with emojis, service grouping, and actionable recommendations.
 */

import type { LLMAnalysisResult, LLMCodeAnnotation } from "../core/types.js";
import { SHORT_COMMIT_SHA_LENGTH, UI_CONSTANTS } from "../constants/index.js";
import { truncateText } from "./uiHelpers.js";
import type { OutputContext, GitHubCommentOutput } from "./outputFormatterTypes.js";

// ==================== Constants ====================

/** Maximum annotations to display per service */
const MAX_ANNOTATIONS_PER_SERVICE = 5;

/** Maximum next steps to display */
const MAX_NEXT_STEPS_DISPLAY = 5;

/** Maximum snippet length for display */
const MAX_SNIPPET_LENGTH = 150;

/** Confidence level descriptions */
const CONFIDENCE_DESCRIPTIONS: Record<string, string> = {
  high: "high certainty",
  medium: "moderate certainty",
  low: "low certainty",
  unknown: "uncertain",
};

/** Category emoji mapping */
const CATEGORY_EMOJI: Record<string, string> = {
  test: "🧪",
  build: "🔨",
  dependency: "📦",
  config: "⚙️",
  infra: "🏗️",
  runtime: "💥",
  unknown: "❓",
};

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
): Map<string, LLMCodeAnnotation[]> => {
  const groups = new Map<string, LLMCodeAnnotation[]>();

  annotations.forEach((annotation) => {
    const service = extractService(annotation.path || "");
    const existing = groups.get(service) ?? [];
    groups.set(service, [...existing, annotation]);
  });

  return groups;
};

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

  const lines = [
    "## 🤖 KenchiOps CI Failure Analysis",
    "",
    `**Commit:** \`${shortSha}\``,
    `**Check:** ${context.checkName}`,
    `**Overall Confidence:** ${confidencePercent}% (${confidenceDesc})`,
  ];

  if (context.branchName && context.baseBranch) {
    lines.push(`**Branch:** \`${context.branchName}\` → \`${context.baseBranch}\``);
  } else if (context.branchName) {
    lines.push(`**Branch:** \`${context.branchName}\``);
  }

  if (context.failedChecks?.length || context.passedChecks?.length) {
    const checkParts: string[] = [];
    context.passedChecks?.forEach((check) => checkParts.push(`✅ ${check}`));
    context.failedChecks?.forEach((check) => checkParts.push(`❌ ${check}`));
    lines.push(`**Checks:** ${checkParts.join(", ")}`);
  }

  if (annotationCount > 0 || actionCount > 0) {
    const stats: string[] = [];
    if (annotationCount > 0) {
      stats.push(`**Evidence:** ${annotationCount} items`);
    }
    if (actionCount > 0) {
      stats.push(`**Actions:** ${actionCount} recommended`);
    }
    lines.push(stats.join(" | "));
  }

  lines.push("");
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
  const truncatedMessage = truncateText(message, MAX_SNIPPET_LENGTH);

  return location ? `- ❌ ${location}\n  ${truncatedMessage}` : `- ❌ ${truncatedMessage}`;
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
  const lines = [`### 📁 Affected Files (${annotations.length})`, ""];

  grouped.forEach((serviceAnnotations, service) => {
    const fileWord = serviceAnnotations.length === 1 ? "file" : "files";
    lines.push(`**${service}** (${serviceAnnotations.length} ${fileWord})`);

    const displayAnnotations = serviceAnnotations.slice(0, MAX_ANNOTATIONS_PER_SERVICE);
    displayAnnotations.forEach((annotation) => lines.push(formatAnnotationItem(annotation)));

    if (serviceAnnotations.length > MAX_ANNOTATIONS_PER_SERVICE) {
      const remaining = serviceAnnotations.length - MAX_ANNOTATIONS_PER_SERVICE;
      lines.push(`  *...and ${remaining} more*`);
    }
    lines.push("");
  });

  return lines.join("\n");
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

  const displaySteps = steps.slice(0, MAX_NEXT_STEPS_DISPLAY);
  const lines = ["### 🛠️ Recommended Actions", ""];

  displaySteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
    lines.push("");
  });

  return lines.join("\n");
};

/**
 * Format the feedback section.
 */
const formatFeedback = (context: OutputContext): string => {
  const lines = [
    "---",
    "",
    "**Was this analysis helpful?** 👍 Yes · 👎 No",
    "",
    "> 💡 **Share your fix:** When you resolve this, reply with what worked — it helps the team learn faster.",
  ];

  if (context.prNumber) {
    const prUrl = `https://github.com/${context.repository}/pull/${context.prNumber}`;
    const logsUrl = `https://github.com/${context.repository}/commit/${context.commitSha}/checks`;
    lines.push("", `[View PR](${prUrl}) · [View Logs](${logsUrl})`);
  }

  return lines.join("\n");
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
