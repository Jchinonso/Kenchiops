/**
 * Artifact Ranking Module
 *
 * Handles artifact ranking, deduplication, sorting, and framework detection.
 * Pure algorithmic processing with no LLM calls.
 *
 * @module formatting/artifactRanking
 */

import { ARTIFACT_PRIORITY_WEIGHTS, type ArtifactType } from "../constants/index.js";

import type { ExtractedArtifact, ExtractionResult, RankedArtifact } from "./chunkingTypes.js";

import { computeArtifactSignatureSync, computeAbsoluteEvidenceId } from "./artifactSignature.js";

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
 * Internal type for tracking artifacts during deduplication.
 */
interface ArtifactTracker {
  readonly artifact: ExtractedArtifact;
  readonly chunkId: number;
  readonly chunkLineOffset: number;
  count: number;
}

/**
 * Result of artifact deduplication.
 */
interface DeduplicationResult {
  readonly artifacts: readonly RankedArtifact[];
  readonly totalExtracted: number;
  readonly duplicatesRemoved: number;
}

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
  // Track artifacts by signature hash
  const artifactMap = new Map<string, ArtifactTracker>();
  let totalExtracted = 0;

  // Process each result in chunk order for determinism
  const sortedResults = [...extractionResults].sort(
    (resultA, resultB) => resultA.chunkId - resultB.chunkId
  );

  sortedResults.forEach((result) => {
    if (!result.success) {
      return;
    }

    const chunkLineOffset = chunkLineOffsets.get(result.chunkId) ?? 1;

    result.artifacts.forEach((artifact) => {
      totalExtracted++;

      const signature = computeArtifactSignatureSync(artifact);
      const existing = artifactMap.get(signature.hash);

      if (existing) {
        // Duplicate found - increment count
        artifactMap.set(signature.hash, {
          ...existing,
          count: existing.count + 1,
        });
      } else {
        // First occurrence
        artifactMap.set(signature.hash, {
          artifact,
          chunkId: result.chunkId,
          chunkLineOffset,
          count: 1,
        });
      }
    });
  });

  // Convert to ranked artifacts
  const rankedArtifacts = Array.from(artifactMap.values()).map((tracker) =>
    createRankedArtifact(tracker.artifact, tracker.chunkId, tracker.chunkLineOffset, tracker.count)
  );

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
    // Primary: priority score descending
    const priorityDiff = artifactB.priorityScore - artifactA.priorityScore;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    // Secondary: first occurrence chunk ascending (earlier is more likely causal)
    return artifactA.firstOccurrenceChunk - artifactB.firstOccurrenceChunk;
  });

// ==================== Framework Detection ====================

/**
 * Framework count entry for tracking occurrences.
 */
interface FrameworkCount {
  readonly framework: string;
  readonly count: number;
}

/**
 * Detects the most common framework across all artifacts.
 * Uses functional reduce pattern for counting and finding maximum.
 *
 * @param artifacts - Artifacts to analyze
 * @returns Most common framework or undefined
 */
export const detectCommonFramework = (
  artifacts: readonly ExtractedArtifact[]
): string | undefined => {
  // Extract frameworks from artifacts that have one
  const frameworks = artifacts
    .filter((artifact) => artifact.framework !== undefined)
    .map((artifact) => artifact.framework as string);

  // No frameworks found
  if (frameworks.length === 0) {
    return undefined;
  }

  // Count occurrences and convert to typed objects
  const countMap = frameworks.reduce<Map<string, number>>(
    (counts, framework) => new Map(counts).set(framework, (counts.get(framework) ?? 0) + 1),
    new Map()
  );

  // Convert to array of typed objects for clarity
  const frameworkCounts: readonly FrameworkCount[] = Array.from(countMap.entries()).map(
    ([framework, count]) => ({ framework, count })
  );

  // Find the framework with highest count
  const mostCommon = frameworkCounts.reduce<FrameworkCount>(
    (maxSoFar, current) => (current.count > maxSoFar.count ? current : maxSoFar),
    frameworkCounts[0]
  );

  return mostCommon.framework;
};
