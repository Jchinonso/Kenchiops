/**
 * Failure Clustering Utilities
 *
 * Functions for clustering CI failures by service/package
 * and summarizing root causes for display.
 */

import { FORMATTER_DISPLAY_LIMITS, FILE_PATH_VALIDATION } from "../constants/index.js";
import {
  extractServiceFromPath,
  buildCanonicalPathMap,
  resolveCanonicalPath,
} from "./pathUtils.js";
import { isTestFile } from "./testFailureUtils.js";
import {
  scoreCause,
  isLowSignalCause,
  extractMeaningfulCause,
  sanitizeTestFailureMessage,
} from "./causeExtraction.js";
import { generateCheckEvidenceId, formatEvidenceLocation } from "./evidenceIds.js";
import { classifyTestFailure } from "./failureClassification.js";

// ==================== Types ====================

/**
 * Represents a cluster of failures grouped by service.
 */
export interface FailureCluster {
  readonly service: string;
  readonly causes: readonly string[];
  readonly uniqueFileCount: number;
  readonly testFailureCount: number;
  readonly annotationCount: number;
  readonly primaryError?: string;
  readonly primaryFile?: string;
  readonly primaryLine?: number;
  readonly primaryTestName?: string;
  readonly evidenceIds: readonly string[];
  readonly isInfra: boolean;
}

/**
 * Root cause summary entry for shared formatting.
 */
export interface RootCauseSummaryEntry {
  readonly service: string;
  readonly cause?: string;
  readonly location?: string | null;
  readonly evidenceIds: readonly string[];
  readonly isInfra: boolean;
  readonly fileCount: number;
  readonly primaryTestName?: string;
}

/**
 * Summary of root cause clusters used by Slack and GitHub formatters.
 */
export interface RootCauseSummary {
  readonly entries: readonly RootCauseSummaryEntry[];
  readonly lowSignalCount: number;
  readonly hiddenCount: number;
  readonly hasInfra: boolean;
  readonly totalClusters: number;
}

/**
 * Analyzed failure interface for clustering.
 * Matches the AnalyzedFailure type from core/types.
 */
export interface ClusterableFailure {
  readonly identifiedCause?: string;
  readonly analysis?: string;
  readonly testFailures?: ReadonlyArray<{
    file?: string;
    line?: number;
    error?: string;
    testName?: string;
  }>;
  readonly annotations?: ReadonlyArray<{ path: string; line?: number; message?: string }>;
}

// ==================== Internal Types ====================

/**
 * Internal accumulator state for building clusters.
 */
interface ClusterAccumulator {
  readonly service: string;
  readonly causes: Set<string>;
  readonly uniqueFiles: Set<string>;
  readonly evidenceIds: Set<string>;
  testFailureCount: number;
  annotationCount: number;
  primaryError?: string;
  primaryFile?: string;
  primaryLine?: number;
  primaryTestName?: string;
  primaryScore: number;
  isInfra: boolean;
}

// ==================== Cluster Helpers ====================

/**
 * Returns true when a cluster has evidence-backed failures (tests or annotations).
 */
export const isEvidenceBackedCluster = (cluster: FailureCluster): boolean =>
  cluster.testFailureCount > 0 || cluster.annotationCount > 0 || cluster.uniqueFileCount > 0;

/**
 * Selects the best (highest-signal) cause for a cluster.
 */
export const selectBestClusterCause = (cluster: FailureCluster): string | undefined => {
  const candidates = Array.from(
    new Set([...cluster.causes, cluster.primaryError ?? ""].filter((cause) => cause.length > 0))
  );
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates
    .sort((left, right) => {
      const scoreDiff = scoreCause(right) - scoreCause(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return right.length - left.length;
    })
    .find((candidate) => candidate.length > 0);
};

/**
 * Scores a failure cluster by its strongest cause signal.
 */
export const scoreClusterSignal = (cluster: FailureCluster): number => {
  const bestCause = selectBestClusterCause(cluster);
  return bestCause ? scoreCause(bestCause) : 0;
};

/**
 * Creates an empty cluster accumulator for a service.
 */
const createEmptyAccumulator = (service: string): ClusterAccumulator => ({
  service,
  causes: new Set(),
  uniqueFiles: new Set(),
  evidenceIds: new Set(),
  testFailureCount: 0,
  annotationCount: 0,
  primaryError: undefined,
  primaryFile: undefined,
  primaryLine: undefined,
  primaryTestName: undefined,
  primaryScore: Number.NEGATIVE_INFINITY,
  isInfra: false,
});

/**
 * Updates the primary evidence details when a higher-signal cause is found.
 */
const updatePrimaryEvidence = (
  accumulator: ClusterAccumulator,
  candidate: {
    readonly cause: string;
    readonly file?: string;
    readonly line?: number;
    readonly testName?: string;
  }
): void => {
  if (!candidate.cause) {
    return;
  }

  const candidateScore = scoreCause(candidate.cause);
  const shouldReplace =
    candidateScore > accumulator.primaryScore ||
    (candidateScore === accumulator.primaryScore &&
      !accumulator.primaryFile &&
      Boolean(candidate.file));

  if (!shouldReplace) {
    return;
  }

  accumulator.primaryScore = candidateScore;
  accumulator.primaryError = candidate.cause;
  accumulator.primaryFile = candidate.file;
  accumulator.primaryLine = candidate.line;
  accumulator.primaryTestName = candidate.testName;
};

/**
 * Converts an accumulator to a readonly FailureCluster.
 */
const accumulatorToCluster = (accumulator: ClusterAccumulator): FailureCluster => ({
  service: accumulator.service,
  causes: Array.from(accumulator.causes),
  uniqueFileCount: accumulator.uniqueFiles.size,
  testFailureCount: accumulator.testFailureCount,
  annotationCount: accumulator.annotationCount,
  primaryError: accumulator.primaryError,
  primaryFile: accumulator.primaryFile,
  primaryLine: accumulator.primaryLine,
  primaryTestName: accumulator.primaryTestName,
  evidenceIds: Array.from(accumulator.evidenceIds),
  isInfra: accumulator.isInfra,
});

// ==================== Main Clustering Functions ====================

/**
 * Clusters analyzed failures by their service/package.
 * Groups failures by EACH file's service (not by check's primary service).
 * Deduplicates files across checks to prevent double-counting.
 *
 * @param failures - Array of analyzed failures to cluster
 * @returns Map of service name to failure cluster info
 */
export const clusterFailuresByService = (
  failures: readonly ClusterableFailure[]
): Map<string, FailureCluster> => {
  const accumulators = new Map<string, ClusterAccumulator>();
  const seenFileKeys = new Set<string>();
  const allPaths = [
    ...failures.flatMap((failure) =>
      (failure.testFailures ?? [])
        .map((testFailure) => testFailure.file)
        .filter((file): file is string => Boolean(file))
    ),
    ...failures.flatMap((failure) =>
      (failure.annotations ?? [])
        .map((annotation) => annotation.path)
        .filter((path): path is string => Boolean(path))
    ),
  ];
  const pathMap = buildCanonicalPathMap(allPaths);

  failures.forEach((failure, checkIndex) => {
    const checkEvidenceId = generateCheckEvidenceId(checkIndex);
    const checkCause = failure.identifiedCause ?? failure.analysis ?? "";
    const hasEvidence =
      (failure.testFailures?.length ?? 0) > 0 || (failure.annotations?.length ?? 0) > 0;

    // Process each test failure individually
    (failure.testFailures ?? []).forEach((testFailure) => {
      if (!testFailure.file) {
        return;
      }

      const normalizedFile = resolveCanonicalPath(testFailure.file, pathMap);
      if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(normalizedFile)) {
        return;
      }
      const fileKey = `${normalizedFile}:${testFailure.line ?? 0}`;
      if (seenFileKeys.has(fileKey)) {
        return;
      }
      seenFileKeys.add(fileKey);

      const service = extractServiceFromPath(normalizedFile);
      const accumulator = accumulators.get(service) ?? createEmptyAccumulator(service);

      const failureType = classifyTestFailure(testFailure);
      const isInfraOrTimeout = failureType === "infra" || failureType === "timeout";

      const sanitizedError = testFailure.error ? sanitizeTestFailureMessage(testFailure.error) : "";
      const meaningfulCause = sanitizedError
        ? (extractMeaningfulCause(sanitizedError) ?? sanitizedError)
        : null;
      if (meaningfulCause) {
        accumulator.causes.add(meaningfulCause);
        updatePrimaryEvidence(accumulator, {
          cause: meaningfulCause,
          file: normalizedFile,
          line: testFailure.line,
          testName: testFailure.testName,
        });
      }

      accumulator.uniqueFiles.add(normalizedFile);
      accumulator.testFailureCount += 1;
      accumulator.evidenceIds.add(checkEvidenceId);
      if (
        !accumulator.primaryTestName &&
        testFailure.testName &&
        !isTestFile(testFailure.testName)
      ) {
        accumulator.primaryTestName = testFailure.testName;
      }
      if (!accumulator.primaryFile) {
        accumulator.primaryFile = normalizedFile;
        accumulator.primaryLine = testFailure.line;
      }
      accumulator.isInfra = accumulator.isInfra || isInfraOrTimeout;

      accumulators.set(service, accumulator);
    });

    // Process annotations
    (failure.annotations ?? []).forEach((annotation) => {
      if (!annotation.path) {
        return;
      }

      const normalizedPath = resolveCanonicalPath(annotation.path, pathMap);
      if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(normalizedPath)) {
        return;
      }
      const fileKey = `${normalizedPath}:${annotation.line ?? 0}`;
      if (seenFileKeys.has(fileKey)) {
        return;
      }
      seenFileKeys.add(fileKey);

      const service = extractServiceFromPath(normalizedPath);
      const accumulator = accumulators.get(service) ?? createEmptyAccumulator(service);

      const annotationCause = extractMeaningfulCause(annotation.message ?? "");
      if (annotationCause) {
        accumulator.causes.add(annotationCause);
        updatePrimaryEvidence(accumulator, {
          cause: annotationCause,
          file: normalizedPath,
          line: annotation.line,
        });
      }

      accumulator.uniqueFiles.add(normalizedPath);
      accumulator.annotationCount += 1;
      accumulator.evidenceIds.add(checkEvidenceId);

      accumulators.set(service, accumulator);
    });

    if (!hasEvidence && checkCause) {
      const meaningfulCheckCause = extractMeaningfulCause(checkCause);
      if (meaningfulCheckCause) {
        const accumulator = accumulators.get("other") ?? createEmptyAccumulator("other");
        accumulator.causes.add(meaningfulCheckCause);
        accumulator.evidenceIds.add(checkEvidenceId);
        updatePrimaryEvidence(accumulator, { cause: meaningfulCheckCause });
        accumulators.set("other", accumulator);
      }
    }
  });

  const clusters = new Map<string, FailureCluster>();
  accumulators.forEach((accumulator, service) => {
    clusters.set(service, accumulatorToCluster(accumulator));
  });

  return clusters;
};

/**
 * Summarizes root cause clusters for consistent Slack/GitHub formatting.
 */
export const summarizeRootCauses = (
  failures: readonly ClusterableFailure[],
  options?: { readonly maxEntries?: number }
): RootCauseSummary => {
  const clusters = clusterFailuresByService(failures);
  const evidenceClusters = Array.from(clusters.values()).filter((cluster) =>
    isEvidenceBackedCluster(cluster)
  );
  const clustersToUse =
    evidenceClusters.length > 0 ? evidenceClusters : Array.from(clusters.values());
  const totalClusters = clustersToUse.length;

  const entriesWithSignal = clustersToUse.map((cluster) => {
    const bestCause = selectBestClusterCause(cluster);
    const isLowSignal = !bestCause || isLowSignalCause(bestCause);
    return { cluster, bestCause, isLowSignal };
  });

  const highSignal = entriesWithSignal.filter((entry) => !entry.isLowSignal);
  const lowSignalCount = entriesWithSignal.length - highSignal.length;

  const sortedHighSignal = highSignal.sort((left, right) => {
    const scoreDiff = scoreClusterSignal(right.cluster) - scoreClusterSignal(left.cluster);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return right.cluster.uniqueFileCount - left.cluster.uniqueFileCount;
  });

  const maxEntries = options?.maxEntries ?? FORMATTER_DISPLAY_LIMITS.MAX_ROOT_CAUSES;
  const selected = sortedHighSignal.slice(0, maxEntries);
  const hiddenCount = Math.max(0, sortedHighSignal.length - selected.length);

  const entries: RootCauseSummaryEntry[] = selected.map(({ cluster, bestCause }) => ({
    service: cluster.service,
    cause: bestCause && !isLowSignalCause(bestCause) ? bestCause : undefined,
    location: formatEvidenceLocation(cluster.primaryFile, cluster.primaryLine),
    evidenceIds: cluster.evidenceIds,
    isInfra: cluster.isInfra,
    fileCount: cluster.uniqueFileCount,
    primaryTestName: cluster.primaryTestName,
  }));

  return {
    entries,
    lowSignalCount,
    hiddenCount,
    hasInfra: clustersToUse.some((cluster) => cluster.isInfra),
    totalClusters,
  };
};
