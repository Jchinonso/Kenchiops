/**
 * Combined Analysis Annotation Processing
 *
 * Handles annotation enrichment for CI analysis:
 * - Fetching and formatting check run annotations
 * - Converting annotations to structured lint errors
 * - Merging lint errors from multiple sources (parsed, annotations, LLM)
 * - Enriching job logs with annotation context
 *
 * @module handlers/combinedAnalysisAnnotations
 */

import { createLogger, CI_INFRASTRUCTURE_MESSAGE, type LLMLintError } from "@kenchi/shared";
import { fetchCheckRunAnnotations } from "../services/context/annotationFetcher.js";
import type { CheckRunAnnotation } from "../services/context/types.js";
import type { JobAnalysisResult } from "./combinedAnalysisTypes.js";

const logger = createLogger("github-app");

// ==================== Annotation Formatting ====================

/**
 * Formats check run annotations as text to append to job logs.
 * Provides structured lint/type error context that the LLM can analyze.
 */
const formatAnnotationsAsText = (annotations: readonly CheckRunAnnotation[]): string => {
  const header = `${"=".repeat(60)}\nCHECK RUN ANNOTATIONS (file-level errors/warnings)\n${"=".repeat(60)}`;

  const lines = annotations.map((annotation) => {
    const level = annotation.level.toUpperCase();
    const location = `${annotation.path}:${annotation.startLine}`;
    const title = annotation.title ? ` [${annotation.title}]` : "";
    return `${level}: ${location}${title}\n  ${annotation.message}`;
  });

  return `${header}\n${lines.join("\n\n")}`;
};

// ==================== Annotation Enrichment ====================

/**
 * Enriches job logs with check run annotations from GitHub.
 *
 * For lint/format checks, job logs are often minimal (1-3 lines like "5 errors found").
 * Annotations contain the actual file-level errors (path, line, message) that the
 * LLM needs for meaningful analysis.
 */
export const enrichJobLogsWithAnnotations = async (
  jobs: ReadonlyArray<{ readonly jobName: string; readonly jobId: number; readonly logs: string }>,
  pendingChecks: ReadonlyArray<{ readonly checkRunId: number; readonly checkName: string }>,
  installationId: number,
  owner: string,
  repo: string
): Promise<
  ReadonlyArray<{ readonly jobName: string; readonly jobId: number; readonly logs: string }>
> => {
  // Fetch annotations for all pending checks in parallel (bounded -- typically 2-5 checks)
  const annotationResults = await Promise.all(
    pendingChecks.map(async (check) => {
      const annotations = await fetchCheckRunAnnotations(
        installationId,
        owner,
        repo,
        check.checkRunId
      );
      return { checkName: check.checkName.toLowerCase(), annotations };
    })
  );

  // Build lookup map: lowercased check name -> annotation text
  const annotationsMap = new Map<string, string>();
  annotationResults
    .filter((result) => result.annotations.length > 0)
    .forEach((result) => {
      annotationsMap.set(result.checkName, formatAnnotationsAsText(result.annotations));
    });

  if (annotationsMap.size === 0) {
    return jobs;
  }

  logger.info("Enriching job logs with annotations", {
    checksWithAnnotations: [...annotationsMap.keys()],
    totalAnnotationChecks: annotationsMap.size,
  });

  // Enrich matching jobs by appending annotations to their logs
  return jobs.map((job) => {
    const jobNameLower = job.jobName.toLowerCase();

    // Try exact match, then partial match (e.g., check "Lint & Format" matches job "lint")
    const annotationText =
      annotationsMap.get(jobNameLower) ??
      [...annotationsMap.entries()].find(
        ([checkName]) => jobNameLower.includes(checkName) || checkName.includes(jobNameLower)
      )?.[1];

    if (!annotationText) {
      return job;
    }

    return {
      ...job,
      logs: `${job.logs}\n\n${annotationText}`,
    };
  });
};

/**
 * Fetch annotations for all pending checks and return as a lookup map.
 * Uses the cached annotation fetcher -- safe to call even if enrichJobLogsWithAnnotations
 * already fetched them (cache hit will be instant).
 */
export const fetchAnnotationsForChecks = async (
  pendingChecks: ReadonlyArray<{ readonly checkRunId: number; readonly checkName: string }>,
  installationId: number,
  owner: string,
  repo: string
): Promise<ReadonlyMap<string, readonly CheckRunAnnotation[]>> => {
  const results = await Promise.all(
    pendingChecks.map(async (check) => {
      const annotations = await fetchCheckRunAnnotations(
        installationId,
        owner,
        repo,
        check.checkRunId
      );
      return { checkName: check.checkName.toLowerCase(), annotations } as const;
    })
  );
  return new Map(results.map((result) => [result.checkName, result.annotations]));
};

// ==================== Lint Error Processing ====================

/**
 * Check if an annotation path looks like a real source file.
 * Rejects bare hidden directories (`.github`) and paths without file extensions.
 * Accepts: `src/file.ts`, `.github/workflows/ci.yml`, `file.py`
 */
const isAnnotationSourceFile = (path: string): boolean => {
  // Last path segment must contain a file extension (dot preceded by a non-dot char)
  const lastSegment = path.split("/").pop() ?? path;
  return /[^.]\.\w{1,10}$/.test(lastSegment);
};

/**
 * Convert GitHub check run annotations directly to structured lint errors.
 * Bypasses LLM extraction for annotations where we already have structured data
 * (path, line, message) from the GitHub API.
 *
 * Filters out:
 * - Annotations without real source file paths (e.g., `.github` directory)
 * - CI infrastructure messages (e.g., `Process completed with exit code 101`)
 */
const convertAnnotationsToLintErrors = (
  annotations: readonly CheckRunAnnotation[]
): readonly LLMLintError[] =>
  annotations
    .filter(
      (annotation) =>
        (annotation.level === "warning" || annotation.level === "failure") &&
        isAnnotationSourceFile(annotation.path) &&
        !CI_INFRASTRUCTURE_MESSAGE.test(annotation.message)
    )
    .map((annotation) => ({
      file: annotation.path,
      line: annotation.startLine,
      message: annotation.message,
      code: annotation.title ?? "lint-error",
    }));

/**
 * Merge lint errors from multiple sources, deduplicating by file + line.
 *
 * Priority order (first source wins for same file:line):
 * 1. Deterministic parser errors (regex-extracted from raw CI log -- most complete)
 * 2. Annotation-derived errors (from GitHub API -- accurate file paths)
 * 3. LLM-extracted errors with real file paths
 *
 * LLM errors with "unknown" file paths are dropped since they're already
 * captured with proper file paths by the higher-priority sources.
 */
const mergeLintErrors = (
  ...sources: ReadonlyArray<readonly LLMLintError[]>
): readonly LLMLintError[] => {
  const seen = new Set<string>();
  const merged: LLMLintError[] = [];

  for (const source of sources) {
    for (const lintError of source) {
      // Skip errors with unknown/missing file paths
      if (!lintError.file || lintError.file.toLowerCase().includes("unknown")) {
        continue;
      }

      const dedupeKey = `${lintError.file}:${lintError.line}:${lintError.code ?? lintError.message}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        merged.push(lintError);
      }
    }
  }

  return merged;
};

/**
 * Enrich a job analysis result with lint errors from deterministic parsing
 * and GitHub annotations. Merges all sources, deduplicating by file + line.
 *
 * Priority: parsed (regex) > annotations (GitHub API) > LLM-extracted
 */
export const enrichResultWithParsedLintErrors = (
  result: JobAnalysisResult,
  parsedLintErrors: readonly LLMLintError[],
  annotations: readonly CheckRunAnnotation[]
): JobAnalysisResult => {
  const annotationLintErrors = convertAnnotationsToLintErrors(annotations);

  // If no additional sources, return as-is
  if (parsedLintErrors.length === 0 && annotationLintErrors.length === 0) {
    return result;
  }

  const mergedLintErrors = mergeLintErrors(
    parsedLintErrors,
    annotationLintErrors,
    result.lintErrors
  );

  // If enriched sources found lint errors but LLM found 0, override the
  // LLM's summary and confidence -- the LLM clearly missed the errors.
  const llmFoundZero = result.lintErrors.length === 0;
  const enrichedFound = mergedLintErrors.length > 0;

  if (llmFoundZero && enrichedFound) {
    const uniqueFiles = [...new Set(mergedLintErrors.map((lintError) => lintError.file))];
    const overriddenCause = `Lint check failed with ${mergedLintErrors.length} error${mergedLintErrors.length > 1 ? "s" : ""} across ${uniqueFiles.length} file${uniqueFiles.length > 1 ? "s" : ""}`;

    return {
      ...result,
      lintErrors: mergedLintErrors,
      response: {
        ...result.response,
        identified_cause: overriddenCause,
        analysis: overriddenCause,
        confidence: Math.max(
          typeof result.response.confidence === "number" ? result.response.confidence : 0,
          0.7
        ),
      },
    };
  }

  return { ...result, lintErrors: mergedLintErrors };
};
