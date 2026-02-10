/**
 * Artifact Ranking
 *
 * Handles artifact ranking, deduplication, sorting, and framework detection.
 * Pure algorithmic processing with no LLM calls.
 *
 * @module formatting/aggregation/ranking
 */

import {
  ARTIFACT_PRIORITY_WEIGHTS,
  ARTIFACT_TYPES,
  type ArtifactType,
} from "../../constants/index.js";
import { createLogger } from "../../core/logger.js";
import type { ExtractedArtifact, ExtractionResult } from "../extraction/types.js";
import type {
  RankedArtifact,
  ArtifactTracker,
  ArtifactWithContext,
  DeduplicationResult,
  FrameworkCount,
} from "./types.js";
import { computeArtifactSignatureSync, computeAbsoluteEvidenceId } from "./signature.js";

const logger = createLogger("artifact-ranking");

// ==================== Ranking ====================

/**
 * Computes the priority score for an artifact based on its type.
 *
 * @param type - Artifact type
 * @returns Priority score
 */
export const computePriorityScore = (type: ArtifactType): number =>
  ARTIFACT_PRIORITY_WEIGHTS[type] ?? 0;

/**
 * Converts an extracted artifact to a ranked artifact.
 *
 * @param artifact - Extracted artifact
 * @param chunkId - Chunk ID where artifact was found
 * @param chunkLineOffset - Line offset of the chunk
 * @param occurrenceCount - Number of occurrences
 * @returns Ranked artifact
 */
export const createRankedArtifact = (
  artifact: ExtractedArtifact,
  chunkId: number,
  chunkLineOffset: number,
  occurrenceCount: number
): RankedArtifact => {
  const signature = computeArtifactSignatureSync(artifact);
  const absoluteEvidenceId = computeAbsoluteEvidenceId(artifact, chunkLineOffset);
  const priorityScore = computePriorityScore(artifact.type);

  return {
    ...artifact,
    priorityScore,
    firstOccurrenceChunk: chunkId,
    occurrenceCount,
    signature,
    absoluteEvidenceId,
  };
};

// ==================== Deduplication ====================

/**
 * Deduplicates artifacts by signature hash.
 * Keeps the first occurrence and tracks count.
 *
 * @param extractionResults - Results from all chunk extractions
 * @param chunkLineOffsets - Map of chunk ID to line offset
 * @returns Deduplication result with ranked artifacts
 */
export const deduplicateArtifacts = (
  extractionResults: readonly ExtractionResult[],
  chunkLineOffsets: ReadonlyMap<number, number>
): DeduplicationResult => {
  const sortedResults = [...extractionResults].sort(
    (resultA, resultB) => resultA.chunkId - resultB.chunkId
  );

  // Flatten all artifacts with their context
  const artifactsWithContext: readonly ArtifactWithContext[] = sortedResults
    .filter((result) => result.success)
    .flatMap((result) => {
      const chunkLineOffset = chunkLineOffsets.get(result.chunkId) ?? 1;
      return result.artifacts.map((artifact) => ({
        artifact,
        chunkId: result.chunkId,
        chunkLineOffset,
      }));
    });

  const totalExtracted = artifactsWithContext.length;

  // Count test_failure artifacts before deduplication
  const testFailuresBefore = artifactsWithContext.filter(
    (ctx) => ctx.artifact.type === ARTIFACT_TYPES.TEST_FAILURE
  ).length;

  // Deduplicate by signature hash, keeping first occurrence
  // EXCEPTION: test_failure artifacts without testName are never deduplicated
  // to prevent collapsing distinct test failures that share error messages
  let uniqueTestFailureCounter = 0;
  const artifactMap = artifactsWithContext.reduce<ReadonlyMap<string, ArtifactTracker>>(
    (accumulator, { artifact, chunkId, chunkLineOffset }) => {
      const signature = computeArtifactSignatureSync(artifact);

      // For test_failure without testName, make each unique to prevent collapsing
      const isTestFailureWithoutName =
        artifact.type === ARTIFACT_TYPES.TEST_FAILURE && !artifact.testName;
      const dedupeKey = isTestFailureWithoutName
        ? `${signature.hash}_unique_${uniqueTestFailureCounter++}`
        : signature.hash;

      const existing = accumulator.get(dedupeKey);

      if (existing) {
        return new Map(accumulator).set(dedupeKey, {
          ...existing,
          count: existing.count + 1,
        });
      }

      return new Map(accumulator).set(dedupeKey, {
        artifact,
        chunkId,
        chunkLineOffset,
        count: 1,
      });
    },
    new Map<string, ArtifactTracker>()
  );

  const rankedArtifacts = Array.from(artifactMap.values()).map((tracker) =>
    createRankedArtifact(tracker.artifact, tracker.chunkId, tracker.chunkLineOffset, tracker.count)
  );

  // Count test_failure artifacts after deduplication
  const testFailuresAfter = rankedArtifacts.filter(
    (artifact) => artifact.type === ARTIFACT_TYPES.TEST_FAILURE
  ).length;

  logger.info("Deduplication complete", {
    totalExtracted,
    afterDedup: rankedArtifacts.length,
    duplicatesRemoved: totalExtracted - rankedArtifacts.length,
    testFailuresBefore,
    testFailuresAfter,
    testFailuresCollapsed: testFailuresBefore - testFailuresAfter,
  });

  return {
    artifacts: rankedArtifacts,
    totalExtracted,
    duplicatesRemoved: totalExtracted - rankedArtifacts.length,
  };
};

// ==================== Sorting ====================

/**
 * Sorts artifacts by priority score (descending) then by first occurrence chunk (ascending).
 *
 * @param artifacts - Artifacts to sort
 * @returns Sorted artifacts (new array)
 */
export const sortArtifactsByPriority = (
  artifacts: readonly RankedArtifact[]
): readonly RankedArtifact[] =>
  [...artifacts].sort((artifactA, artifactB) => {
    const priorityDiff = artifactB.priorityScore - artifactA.priorityScore;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return artifactA.firstOccurrenceChunk - artifactB.firstOccurrenceChunk;
  });

// ==================== Framework Detection ====================

/**
 * Detects the most common framework across all artifacts.
 *
 * @param artifacts - Artifacts to analyze
 * @returns Most common framework or undefined
 */
export const detectCommonFramework = (
  artifacts: readonly ExtractedArtifact[]
): string | undefined => {
  const frameworks = artifacts
    .filter(
      (artifact): artifact is ExtractedArtifact & { framework: string } =>
        artifact.framework !== undefined
    )
    .map((artifact) => artifact.framework);

  if (frameworks.length === 0) {
    return undefined;
  }

  const countMap = frameworks.reduce<Map<string, number>>(
    (counts, framework) => new Map(counts).set(framework, (counts.get(framework) ?? 0) + 1),
    new Map()
  );

  const frameworkCounts: readonly FrameworkCount[] = Array.from(countMap.entries()).map(
    ([framework, count]) => ({ framework, count })
  );

  const mostCommon = frameworkCounts.reduce<FrameworkCount>(
    (maxSoFar, current) => (current.count > maxSoFar.count ? current : maxSoFar),
    frameworkCounts[0]
  );

  return mostCommon.framework;
};
