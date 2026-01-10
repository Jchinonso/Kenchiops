/**
 * Formatter Utilities
 *
 * Shared utility functions and constants for formatting
 * consolidated CI failure messages.
 */

import {
  UI_EMOJI,
  PRIORITY_EMOJI_MAP,
  PRIORITY_ORDER,
  PRIORITY_ORDER_DEFAULT,
  GITHUB_COMMENT_TEMPLATES,
  CONTEXT_CONFIDENCE_ADJUSTMENTS,
  FILE_PATH_VALIDATION,
  config,
  generateFeedbackUrl,
  createLogger,
  getErrorMessage,
  extractServiceFromPath,
  canonicalizeEvidencePaths,
  clusterFailuresByService,
  formatWithEvidenceId,
  selectBestClusterCause,
  formatEvidenceLocation,
  isLowSignalCause,
  isEvidenceBackedCluster,
  isTestFile,
  truncateText,
  classifyTestFailure,
  type AnalyzedFailure,
  type RecommendedAction,
  type FailureCluster,
} from "@kenchi/shared";

/**
 * Maximum items to display per section.
 * Increased to show comprehensive context for AI analysis.
 */
export const DISPLAY_LIMITS = {
  annotationsPerCheck: 100,
  totalAnnotations: 150,
  recommendedActions: 5,
  checksToShow: 20,
  slackAnnotationsPerCheck: 50,
  slackMaxChecks: 10,
} as const;

const logger = createLogger("github-app");

export interface FeedbackLinks {
  readonly correctUrl: string;
  readonly incorrectUrl: string;
}

// ==================== Utility Functions ====================

/**
 * Numeric priority to emoji lookup.
 */
const NUMERIC_PRIORITY_EMOJI: ReadonlyArray<{ max: number; emoji: string }> = [
  { max: 1, emoji: UI_EMOJI.priorityCritical },
  { max: 2, emoji: UI_EMOJI.priorityMedium },
] as const;

/**
 * Get priority emoji from priority value.
 */
export const getPriorityEmoji = (priority: string | number): string => {
  if (typeof priority === "number") {
    const matchingThreshold = NUMERIC_PRIORITY_EMOJI.find((threshold) => priority <= threshold.max);
    return matchingThreshold?.emoji ?? UI_EMOJI.priorityLow;
  }
  return PRIORITY_EMOJI_MAP[priority.toLowerCase()] ?? UI_EMOJI.priorityDefault;
};

/**
 * Get numeric priority for sorting.
 */
export const getNumericPriority = (priority: string | number): number =>
  typeof priority === "string"
    ? (PRIORITY_ORDER[priority.toLowerCase()] ?? PRIORITY_ORDER_DEFAULT)
    : priority;

/**
 * Result of confidence calculation with optional uncertainty message.
 */
export interface ConfidenceResult {
  readonly confidence: number;
  readonly uncertainty?: string;
}

/** Minimum services threshold from shared constants */
const { MULTI_SERVICE_THRESHOLD } = CONTEXT_CONFIDENCE_ADJUSTMENTS;

/**
 * Minimum confidence floor after adjustments.
 */
const CONFIDENCE_FLOOR = 0.15;

const GENERIC_ACTION_PATTERNS: readonly RegExp[] = [
  /^review (the )?failing tests?/i,
  /^review \d+ failing tests?/i,
  /^review the failing test and fix the assertion/i,
  /^review the failing test$/i,
  /^review the failing test output/i,
  /^fix the assertion/i,
  /^start with:\s*fail(?:ed)?\b/i,
  /^start with:\s*test failed\b/i,
  /\b\d+\s*\|\s*\d+\s*\|/i,
  /\b\d+\s*\|/i,
];

const isGenericActionDescription = (description: string): boolean =>
  GENERIC_ACTION_PATTERNS.some((pattern) => pattern.test(description.trim()));

const isUnscopedService = (service: string): boolean =>
  service === "other" || service === "root" || service === "unlocated";

const buildServicePrefix = (service: string): string =>
  isUnscopedService(service) ? "" : `[${service}] `;

const buildClusterLocation = (cluster: FailureCluster): string | null =>
  formatEvidenceLocation(cluster.primaryFile, cluster.primaryLine);

const containsFilePath = (description: string): boolean =>
  description
    .split(/\s+/)
    .map((token) => token.replace(/[`(),.]/g, ""))
    .some((token) => FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(token));

const containsTestName = (description: string, testName?: string): boolean => {
  if (!testName) {
    return false;
  }
  return description.toLowerCase().includes(testName.toLowerCase());
};

const appendActionContext = (description: string, cluster?: FailureCluster): string => {
  if (!cluster) {
    return description;
  }

  const location = buildClusterLocation(cluster);
  const hasLocationHint =
    containsFilePath(description) || containsTestName(description, cluster.primaryTestName);
  if (hasLocationHint) {
    return description;
  }

  if (location) {
    return `${description} (${location})`;
  }

  if (cluster.primaryTestName && !isTestFile(cluster.primaryTestName)) {
    const testName = truncateText(cluster.primaryTestName, 80);
    return `${description} (test: ${testName})`;
  }

  return description;
};

/**
 * Extracts unique services from failures for multi-module detection.
 */
const extractAffectedServices = (failures: readonly AnalyzedFailure[]): Set<string> => {
  const clusters = clusterFailuresByService(failures);
  const evidenceClusters = Array.from(clusters.entries()).filter(([, cluster]) =>
    isEvidenceBackedCluster(cluster)
  );
  const clustersToCount = evidenceClusters.length > 0 ? evidenceClusters : Array.from(clusters);
  return new Set(clustersToCount.map(([service]) => service));
};

/**
 * Calculate average confidence from failures.
 * Returns simple number for backward compatibility.
 */
export const calculateAverageConfidence = (failures: readonly AnalyzedFailure[]): number => {
  if (failures.length === 0) {
    return 0;
  }
  const sum = failures.reduce((accumulator, failure) => accumulator + failure.confidence, 0);
  return sum / failures.length;
};

/**
 * Checks if failures have adequate file/line information.
 */
const hasAdequateFileInfo = (failures: readonly AnalyzedFailure[]): boolean => {
  const allTestFailures = failures.flatMap((failure) => failure.testFailures ?? []);
  if (allTestFailures.length === 0) {
    return true; // No test failures to check
  }
  const withFileInfo = allTestFailures.filter(
    (testFailure) => testFailure.file && testFailure.line
  );
  return withFileInfo.length >= allTestFailures.length / 2;
};

/**
 * Checks if failures contain only generic error messages.
 */
const hasOnlyGenericErrors = (failures: readonly AnalyzedFailure[]): boolean => {
  const allCauses = failures
    .map((failure) => failure.identifiedCause)
    .filter((cause): cause is string => Boolean(cause));
  if (allCauses.length === 0) {
    return true;
  }
  const genericIndicators = ["failed", "error occurred", "test failed", "assertion failed"];
  return allCauses.every((cause) => {
    const lowerCause = cause.toLowerCase();
    return genericIndicators.some((indicator) => lowerCause.includes(indicator));
  });
};

/**
 * Checks if failures mix infrastructure issues with assertion failures.
 */
const hasInfraMixedWithAssertions = (failures: readonly AnalyzedFailure[]): boolean => {
  const allTestFailures = failures.flatMap((failure) => failure.testFailures ?? []);
  if (allTestFailures.length < 2) {
    return false;
  }
  const classifications = allTestFailures.map((testFailure) => classifyTestFailure(testFailure));
  const hasInfra = classifications.some(
    (classification) => classification === "infra" || classification === "timeout"
  );
  const hasAssertions = classifications.some((classification) => classification === "assertion");
  return hasInfra && hasAssertions;
};

/**
 * Calculate confidence with context-based adjustments.
 * Reduces confidence when failures span multiple services, lack file info,
 * contain generic errors, or mix infrastructure with assertion failures.
 *
 * @param failures - Array of analyzed failures
 * @returns Confidence result with optional uncertainty message
 */
export const calculateConfidenceWithUncertainty = (
  failures: readonly AnalyzedFailure[]
): ConfidenceResult => {
  if (failures.length === 0) {
    return { confidence: 0 };
  }

  const baseConfidence = calculateAverageConfidence(failures);
  const affectedServices = extractAffectedServices(failures);
  const uncertaintyReasons: string[] = [];
  let adjustment = 0;

  // Positive: Single service affected
  if (affectedServices.size === 1) {
    adjustment += CONTEXT_CONFIDENCE_ADJUSTMENTS.SINGLE_SERVICE_AFFECTED;
  }

  // Positive: Clear primary blocker (high confidence root cause identified)
  const hasPrimaryBlocker = failures.some((failure) => failure.confidence >= 0.7);
  if (hasPrimaryBlocker) {
    adjustment += CONTEXT_CONFIDENCE_ADJUSTMENTS.PRIMARY_BLOCKER_IDENTIFIED;
  }

  // Negative: Multi-service spread adjustment
  if (affectedServices.size >= MULTI_SERVICE_THRESHOLD) {
    adjustment += CONTEXT_CONFIDENCE_ADJUSTMENTS.MULTI_SERVICE_SPREAD;
    uncertaintyReasons.push(`${affectedServices.size} services affected`);
  }

  // Missing file/line information adjustment
  if (!hasAdequateFileInfo(failures)) {
    adjustment += CONTEXT_CONFIDENCE_ADJUSTMENTS.MISSING_FILE_LINE;
    uncertaintyReasons.push("missing file locations");
  }

  // Generic error only adjustment
  if (hasOnlyGenericErrors(failures)) {
    adjustment += CONTEXT_CONFIDENCE_ADJUSTMENTS.GENERIC_ERROR_ONLY;
    uncertaintyReasons.push("generic errors");
  }

  // Infrastructure mixed with assertions adjustment
  if (hasInfraMixedWithAssertions(failures)) {
    adjustment += CONTEXT_CONFIDENCE_ADJUSTMENTS.INFRA_MIXED_WITH_ASSERTIONS;
    uncertaintyReasons.push("mixed infra/assertion failures");
  }

  // Apply adjustments with floor
  const adjustedConfidence = Math.max(CONFIDENCE_FLOOR, baseConfidence + adjustment);

  if (uncertaintyReasons.length > 0) {
    return {
      confidence: adjustedConfidence,
      uncertainty: uncertaintyReasons.join(", "),
    };
  }

  return { confidence: baseConfidence };
};

/**
 * Confidence percentage thresholds for emoji selection.
 * Using percentage scale (0-100) vs the badge thresholds which use decimal (0-1).
 */
const CONFIDENCE_PERCENT_THRESHOLDS: ReadonlyArray<{ min: number; emoji: string }> = [
  { min: 70, emoji: UI_EMOJI.confidenceHigh },
  { min: 40, emoji: UI_EMOJI.confidenceMedium },
] as const;

/**
 * Get confidence emoji based on percentage.
 */
export const getConfidenceEmoji = (percent: number): string => {
  const matchingThreshold = CONFIDENCE_PERCENT_THRESHOLDS.find(
    (threshold) => percent >= threshold.min
  );
  return matchingThreshold?.emoji ?? UI_EMOJI.confidenceVeryLow;
};

/**
 * Extracts primary service from an analyzed failure based on test files and annotations.
 */
const extractPrimaryService = (failure: AnalyzedFailure): string => {
  const { testFailures, annotations } = canonicalizeEvidencePaths(
    failure.testFailures ?? [],
    failure.annotations ?? []
  );
  const testFiles = testFailures
    .map((testFailure) => testFailure.file)
    .filter((file): file is string => Boolean(file));

  if (testFiles.length > 0) {
    return extractServiceFromPath(testFiles[0]);
  }

  // Fall back to annotations
  const annotationPaths = annotations.map((annotation) => annotation.path).filter(Boolean);

  if (annotationPaths.length > 0) {
    return extractServiceFromPath(annotationPaths[0]);
  }

  return "other";
};

/**
 * Generates a contextual fallback action for a service with no LLM-provided actions.
 * Creates actionable recommendations based on available cluster data.
 */
const generateFallbackAction = (cluster: FailureCluster): RecommendedAction => {
  const servicePrefix = buildServicePrefix(cluster.service);
  const evidenceId = cluster.evidenceIds[0];
  const bestCause = selectBestClusterCause(cluster);
  const location = buildClusterLocation(cluster);
  const locationSuffix = location ? ` (${location})` : "";

  // Infrastructure issues get specific fallback
  if (cluster.isInfra) {
    const infraCause =
      bestCause && !isLowSignalCause(bestCause)
        ? `Start with: ${truncateText(bestCause, 140)}${locationSuffix}`
        : `Review infrastructure issues (timeouts, resource limits)${locationSuffix}`;
    return {
      description: formatWithEvidenceId(`${servicePrefix}${infraCause}`, evidenceId),
      priority: "high",
      actionType: "investigate",
    };
  }

  if (bestCause && !isLowSignalCause(bestCause)) {
    return {
      description: formatWithEvidenceId(
        `${servicePrefix}Start with: ${truncateText(bestCause, 140)}${locationSuffix}`,
        evidenceId
      ),
      priority: "medium",
      actionType: "review",
    };
  }

  if (cluster.primaryTestName && !isTestFile(cluster.primaryTestName)) {
    const testName = truncateText(cluster.primaryTestName, 80);
    return {
      description: formatWithEvidenceId(
        `${servicePrefix}Review failing test ${testName}${locationSuffix}`,
        evidenceId
      ),
      priority: "medium",
      actionType: "review",
    };
  }

  if (location) {
    return {
      description: formatWithEvidenceId(
        `${servicePrefix}Inspect failures in ${location}`,
        evidenceId
      ),
      priority: "medium",
      actionType: "review",
    };
  }

  return {
    description: formatWithEvidenceId(
      `${servicePrefix}Inspect the failing checks for this service`,
      evidenceId
    ),
    priority: "medium",
    actionType: "review",
  };
};

/**
 * Deduplicate and merge recommended actions from all failures.
 * Groups actions by service to provide per-cluster recommendations.
 * Takes the top action from each service (up to display limit).
 * Generates fallback actions for services without LLM-provided actions.
 */
export const mergeRecommendedActions = (
  failures: readonly AnalyzedFailure[]
): RecommendedAction[] => {
  // Group actions by service
  const actionsByService = new Map<string, RecommendedAction[]>();

  failures.forEach((failure) => {
    const service = extractPrimaryService(failure);
    const existing = actionsByService.get(service) ?? [];
    // Deduplicate within service by actionType
    const newActions = failure.recommendedActions.filter((action) => {
      const key = action.actionType ?? action.description.toLowerCase().trim();
      return !existing.some(
        (existingAction) =>
          (existingAction.actionType ?? existingAction.description.toLowerCase().trim()) === key
      );
    });
    actionsByService.set(service, [...existing, ...newActions]);
  });

  // Get cluster info for fallback generation
  const clusters = clusterFailuresByService(failures);
  const evidenceClusters = new Set(
    Array.from(clusters.entries())
      .filter(([, cluster]) => isEvidenceBackedCluster(cluster))
      .map(([service]) => service)
  );
  const hasEvidenceClusters = evidenceClusters.size > 0;

  // Take top action from each service, prefixed with service name
  // Generate fallback actions for services without LLM-provided actions
  const mergedActions: RecommendedAction[] = [];

  // First, collect services that have LLM actions
  const servicesWithActions = new Set<string>();
  actionsByService.forEach((actions, service) => {
    if (actions.length > 0) {
      servicesWithActions.add(service);
      // Sort by priority and take the most important
      const sortedActions = actions.sort(
        (firstAction, secondAction) =>
          getNumericPriority(firstAction.priority) - getNumericPriority(secondAction.priority)
      );

      const topAction = sortedActions[0];
      if (topAction) {
        const cluster = clusters.get(service);
        if (cluster && isGenericActionDescription(topAction.description)) {
          mergedActions.push(generateFallbackAction(cluster));
          return;
        }

        // Prefix with service name for clarity
        const servicePrefix = buildServicePrefix(service);
        const contextualDescription = appendActionContext(topAction.description, cluster);
        mergedActions.push({
          ...topAction,
          description: `${servicePrefix}${contextualDescription}`,
        });
      }
    }
  });

  // Add fallback actions for services without LLM actions
  clusters.forEach((cluster, service) => {
    if (servicesWithActions.has(service)) {
      return;
    }
    if (hasEvidenceClusters && !evidenceClusters.has(service)) {
      return;
    }
    const fallbackAction = generateFallbackAction(cluster);
    mergedActions.push(fallbackAction);
  });

  // Sort merged actions by priority and limit
  return mergedActions
    .sort(
      (firstAction, secondAction) =>
        getNumericPriority(firstAction.priority) - getNumericPriority(secondAction.priority)
    )
    .slice(0, DISPLAY_LIMITS.recommendedActions);
};

/**
 * Generate signed feedback URLs for analysis comments.
 */
export const createFeedbackLinks = async (analysisId: string): Promise<FeedbackLinks | null> => {
  const webhookSecret = config.GITHUB_WEBHOOK_SECRET;
  if (webhookSecret) {
    const baseUrl = `${config.GITHUB_APP_URL}/api/feedback`;

    try {
      const [correctUrl, incorrectUrl] = await Promise.all([
        generateFeedbackUrl(baseUrl, analysisId, "correct", webhookSecret),
        generateFeedbackUrl(baseUrl, analysisId, "incorrect", webhookSecret),
      ]);

      return { correctUrl, incorrectUrl };
    } catch (error) {
      logger.warn("Failed to generate feedback links", {
        analysisId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  logger.warn("Feedback links skipped - missing webhook secret", { analysisId });
  return null;
};

/**
 * Format feedback prompt lines for GitHub comments.
 */
export const formatFeedbackLinksContent = (links: FeedbackLinks): string[] => {
  const tip = GITHUB_COMMENT_TEMPLATES.RESOLUTION_TIP.trim();
  const lines = [
    `**Was this analysis helpful?** [👍 Yes](${links.correctUrl}) · [👎 No](${links.incorrectUrl})`,
  ];

  return tip ? [...lines, tip] : lines;
};
