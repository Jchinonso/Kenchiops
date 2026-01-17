/**
 * Artifact-Based Analysis Prompts (Chunking Pipeline Stage 4)
 *
 * Builds prompts for the final analysis stage of the chunking pipeline.
 * Uses pre-extracted artifacts rather than raw logs.
 *
 * @module integrations/promptArtifactAnalysis
 */

import type {
  AggregatedEvidence,
  BuildMetadata,
  RankedArtifact,
} from "../formatting/chunkingTypes.js";

// ==================== Artifact Formatters ====================

/**
 * Formats ranked artifacts for the final analyzer prompt.
 *
 * @param artifacts - Ranked artifacts from aggregation
 * @returns Formatted artifacts section
 */
const formatRankedArtifacts = (artifacts: readonly RankedArtifact[]): string => {
  if (artifacts.length === 0) {
    return "No artifacts were extracted from the logs.";
  }

  const formattedArtifacts = artifacts.map((artifact, index) => {
    const lines = [
      `ARTIFACT ${index + 1}`,
      `id: ${artifact.absoluteEvidenceId}`,
      `type: ${artifact.type}`,
      `severity: ${artifact.severity}`,
      `priority_score: ${artifact.priorityScore}`,
      `confidence: ${artifact.confidence}`,
      `first_chunk: ${artifact.firstOccurrenceChunk}`,
      artifact.occurrenceCount > 1 ? `occurrences: ${artifact.occurrenceCount}` : "",
      artifact.filePath ? `file: ${artifact.filePath}` : "",
      artifact.lineNumber === undefined ? "" : `line: ${artifact.lineNumber}`,
      artifact.testName ? `test: ${artifact.testName}` : "",
      artifact.testSuite ? `suite: ${artifact.testSuite}` : "",
      artifact.errorCode ? `error_code: ${artifact.errorCode}` : "",
      artifact.framework ? `framework: ${artifact.framework}` : "",
      `message: ${artifact.errorMessage}`,
      `snippet:`,
      `SNIPPET_BEGIN`,
      artifact.snippet,
      `SNIPPET_END`,
    ].filter((line) => line.length > 0);

    return lines.join("\n");
  });

  return formattedArtifacts.join("\n\n");
};

/**
 * Formats build metadata for the final analyzer prompt.
 *
 * @param metadata - Build metadata
 * @returns Formatted metadata section
 */
const formatBuildMetadata = (metadata: BuildMetadata): string => {
  const SHORT_SHA_LENGTH = 7;
  const lines = [
    `BUILD CONTEXT`,
    `repository: ${metadata.repo}`,
    `branch: ${metadata.branch}`,
    `commit: ${metadata.commitSha.substring(0, SHORT_SHA_LENGTH)}`,
    `ci_platform: ${metadata.ciPlatform}`,
    `exit_code: ${metadata.exitCode}`,
    metadata.workflowName ? `workflow: ${metadata.workflowName}` : "",
    metadata.jobName ? `job: ${metadata.jobName}` : "",
    metadata.durationSeconds === undefined ? "" : `duration_seconds: ${metadata.durationSeconds}`,
    metadata.triggeredBy ? `triggered_by: ${metadata.triggeredBy}` : "",
    metadata.runUrl ? `run_url: ${metadata.runUrl}` : "",
  ].filter((line) => line.length > 0);

  return lines.join("\n");
};

// ==================== System Prompt ====================

/**
 * Builds the system prompt for artifact-based analysis.
 */
const buildArtifactAnalyzerSystemPrompt = (): string =>
  `You are an expert CI/CD failure analyst. You analyze pre-extracted error artifacts from CI logs to determine root cause.

Your job is to:
1. Identify the ROOT CAUSE - the earliest causal error that explains subsequent failures
2. Cite ONLY the artifact id values that exist in the provided artifacts
3. Follow causal ordering: dependency > build > test > deploy > runtime
4. Infrastructure killers (OOM, SIGKILL, timeout) ALWAYS override other root causes
5. Provide SURGICAL, PRIORITIZED next_steps - not generic advice

CRITICAL RULES:
- Use artifact id values exactly as provided. Do not invent, modify, or reformat IDs.
- Infra killers are ALWAYS root cause when present
- Empty artifacts = category "unknown", confidence "low"
- Output ONLY valid JSON. No markdown, no code fences, no prose before or after the JSON.

NEXT_STEPS MUST BE SURGICAL:
- Priority 1: Fix merge gates FIRST (format, lint, build) - ONLY if corresponding artifacts exist
- Priority 2: Fix functional bugs (tests, runtime)
- Name SPECIFIC functions and patterns ONLY if they appear verbatim in artifacts
- Never give generic advice like "review the code" or "check for off-by-one"

ANTI-HALLUCINATION RULE (CRITICAL):
- Do NOT invent function names, variable names, or code expressions
- Only use identifiers that appear VERBATIM in artifact message, snippet, test_name, or file path
- If function name is unknown, use: "[file path] (around line N): inspect arithmetic functions"
- If pattern is clear but function is unknown: "Off-by-one pattern in test_add - check the function under test"

SELF-CHECK BEFORE OUTPUT:
- Verify every evidence_id in your response matches an artifact id exactly
- If any evidence_id does not match, replace it with a valid id or remove the claim`;

// ==================== Output Schema ====================

/**
 * Builds the output schema section for artifact analysis.
 */
const buildArtifactOutputSchema = (): string =>
  `OUTPUT SCHEMA

The response must be a single JSON object with this exact structure:

root_cause (required):
  summary: One sentence describing the earliest causal error
  detail: 2-3 sentences explaining why this is the root cause
  evidence_ids: Array of artifact id values that support this conclusion

confidence (required): "high" | "medium" | "low"

category (required): "dependency" | "build" | "test" | "deploy" | "runtime" | "config" | "infra" | "unknown"

phase (required): "dependency" | "build" | "test" | "deploy" | "runtime" | "config" | "unknown"

annotations (required, array - may be empty):
  file_path: string or null (only if explicitly in artifact)
  line_number: number or null (only if explicitly in artifact)
  snippet: string - ONE line, max 200 chars, copied verbatim from artifact snippet
  observed_message: string - copy artifact message verbatim (or null if none)
  explanation: string - why this matters for the failure
  evidence_id: string - must match an artifact id exactly
  severity: "error" | "warning"

next_steps (required, 1-7 items) - GLOBALLY PRIORITIZED across all failure categories:
  action: string - SPECIFIC action to take (not generic advice)
  reason: string - why this helps (cite evidence)
  safe: boolean
  priority: 1-2 (1 = merge gates, 2 = functional bugs)

NEXT_STEPS PRIORITIZATION RULES:

Priority 1 (Fix merge gates FIRST):
- Format checks: "Run cargo fmt and commit" / "Run prettier --write"
- Lint errors: "Fix clippy warnings" / "Run eslint --fix"
- Build errors: Must be fixed before tests can run

Priority 2 (Fix functional bugs):
- Test failures: Name the specific function and pattern
- Runtime errors: Identify the root cause function
- Config issues: Specify the exact setting/env var

SURGICAL RECOMMENDATIONS FOR TEST FAILURES:

When test_failures artifacts show patterns, your next_steps MUST be SPECIFIC:

Off-by-one pattern (expected N, actual N+1 or N-1):
- BAD: "Review off-by-one errors in arithmetic functions"
- GOOD: "The add function returns a+b+1 - remove the extra increment on line 15"
- GOOD: "add/subtract are +1/-1 shifted - check for spurious ++/-- operations"

Sign pattern (expected negative, actual positive):
- BAD: "Check sign handling"
- GOOD: "multiply returns abs() - it loses sign when one operand is negative"
- GOOD: "subtract shows expected 4, actual -4 - operand order is inverted (b-a vs a-b)"

Zero/boundary pattern:
- BAD: "Handle edge cases"
- GOOD: "multiply returns 0 when operand is 0, but test expects 5 - check identity case"

Multiple patterns - SYNTHESIZE:
- "12 test failures show 3 patterns: (1) off-by-one in add/subtract, (2) sign loss in multiply, (3) zero-handling in divide"

NEW FAILURES INTRODUCED:
If build metadata or artifacts indicate "new failures introduced in this PR":
- First next_step MUST be: "Review recent changes in [file] around [functions]"
- This is HIGH SIGNAL - the PR likely introduced the bug

LOCAL COMMANDS:
Include a verification block based on detected framework:
- Rust: cargo fmt, cargo clippy, cargo test
- JS/TS: npm run lint, npm test
- Python: black ., ruff check ., pytest

secondary_findings (required, array - may be empty):
  summary: string - brief description of secondary issue
  evidence_ids: array of artifact id values that support this finding
  severity: "warning" | "info"

test_failures (required, array - empty if category is not "test"):
  test_name: string - full test name including module/class path
  test_suite: string or null
  file_path: string or null
  line_number: number or null
  expected: string or null (null if not an assertion failure)
  actual: string or null (null if not an assertion failure)
  error_message: string
  evidence_id: string - must match an artifact id exactly

lint_errors (required, array - empty unless lint_error or compiler_error artifacts exist):
  file_path: string or null
  line_number: number or null
  column: number or null
  rule: string or null - lint rule or error code
  message: string
  evidence_id: string - must match an artifact id exactly

metadata:
  analysis_version: "2.0.0"
  chunks_processed: number
  artifacts_analyzed: number
  model_used: "unknown" (will be filled by system)
  processing_time_ms: 0 (will be filled by system)

ARTIFACT TYPE TO CATEGORY MAPPING

Infrastructure types:
- infra_killer → category: "infra" (ALWAYS overrides all other artifacts)
- cache_error → category: "infra" (cache corruption, tar EOF, checksum mismatch)
- fs_error → category: "infra" (EACCES, readonly filesystem, cannot create directory)
- service_unavailable → category: "infra" (ECONNREFUSED, database/redis not ready)
- network_error → category: "infra" (DNS failures, connection timeouts, rate limits)

Auth/Config types:
- auth_error → category: "config" (permission denied, 403, missing tokens)
- config_error → category: "config" (missing env vars, config validation failed)

Dependency types:
- git_error → category: "dependency" (clone/fetch failures, submodule issues)
- dependency_error → category: "dependency" (ERESOLVE, ResolutionImpossible)
- lock_error → category: "dependency" or "deploy" (Terraform state lock → deploy, npm lock → dependency)

Build types:
- toolchain_error → category: "build" (missing tools, wrong versions)
- container_error → category: "build" or "infra" (build-time image → build, registry pull → infra)
- compiler_error → category: "build"
- lint_error → category: "build"

Test/Deploy/Runtime types:
- test_failure → category: "test"
- deploy_error → category: "deploy"
- stack_trace → category: "runtime" (unless caused by build/test phase)

Low-priority fallbacks (inference needed):
- ci_boundary → infer from message; only use as root cause if no type with priority >= 7 exists
- generic_error → infer from context; prefer explicit artifact types above

FIELD RULES

- All evidence_id fields MUST match an artifact id exactly as shown
- Use null for optional fields when data is not present in the artifact
- annotations.snippet: Pick ONE line (max 200 chars) from the artifact snippet verbatim
- test_failures: One entry per test_failure artifact
- lint_errors: One entry per lint_error or compiler_error artifact
- Snippets may contain REDACTED markers - preserve them as-is
- root_cause.evidence_ids MUST include the same id as the first annotation (coherence check)
- If confidence is "medium" or "high": require at least 1 evidence_id in root_cause AND at least 1 annotation`;

// ==================== Causal Ordering ====================

/**
 * Builds causal ordering rules section.
 */
const buildCausalOrderingSection = (): string =>
  `CAUSAL ORDERING RULES

PRIMARY: Use artifact type priority to determine root cause:

1. infra_killer (priority 10): OOM, SIGKILL, timeout, disk full - ALWAYS root cause
2. auth_error (priority 9): Permission denied, 403, missing tokens - blocks everything
3. config_error (priority 9): Missing env vars, config validation failed
4. cache_error (priority 8): Cache corruption, tar EOF, checksum mismatch, restore failed
5. fs_error (priority 8): EACCES, readonly filesystem, cannot create directory
6. service_unavailable (priority 8): ECONNREFUSED, database/redis not ready
7. network_error (priority 8): DNS failures, connection timeouts, rate limits
8. git_error (priority 7): Clone/fetch failures, submodule issues, LFS auth
9. dependency_error (priority 7): Package resolution failures (ERESOLVE, ResolutionImpossible)
10. container_error (priority 7): Docker/registry failures (manifest unknown, pull denied)
11. toolchain_error (priority 7): Missing tools, wrong versions, PATH issues
12. lock_error (priority 6): Terraform state lock, npm lock, another process using
13. stack_trace (priority 6): Exceptions with frames
14. compiler_error (priority 5): Build/compile failures
15. test_failure (priority 5): Test assertions
16. lint_error (priority 4): Linter violations
17. deploy_error (priority 4): kubectl, terraform, helm, migration failures
18. ci_boundary (priority 3): Exit codes, error markers - ONLY if no specific type with priority >= 7
19. generic_error (priority 2): Unclassified errors

SECONDARY: When category is unclear, use pipeline phase as guideline:
dependency → build → test → deploy → runtime

TIE-BREAK RULES (when multiple artifacts have same type priority):
1. Earlier chunk wins (lower first_chunk value)
2. If same chunk: higher priority_score wins
3. If still tied: higher occurrences count wins
4. If still tied: pick the one with more specific file/line info

CI_BOUNDARY RULE:
ci_boundary can ONLY be root cause if there is NO more specific artifact with priority >= 7
in the same or earlier chunk. Exit codes like "exit code 1" should not override specific
errors like "ERESOLVE" or "command not found".

INFRA KILLER OVERRIDE:
If ANY artifact has type "infra_killer" OR message/snippet contains:
  OOM, "out of memory", SIGKILL, "killed", "timed out", "no space left", "disk full"
Then: category MUST be "infra" and that artifact MUST be root cause.`;

// ==================== Main Prompt Builder ====================

/**
 * Builds the analysis prompt from aggregated artifacts.
 *
 * This is the entry point for the chunking pipeline's final analysis stage.
 *
 * @param evidence - Aggregated evidence from Stage 3
 * @param metadata - Build metadata
 * @returns Complete analysis prompt string
 */
export const buildAnalysisFromArtifacts = (
  evidence: AggregatedEvidence,
  metadata: BuildMetadata
): string => {
  const systemPrompt = buildArtifactAnalyzerSystemPrompt();
  const outputSchema = buildArtifactOutputSchema();
  const artifactsSection = formatRankedArtifacts(evidence.artifacts);
  const metadataSection = formatBuildMetadata(metadata);

  const summarySection = `EXTRACTION SUMMARY

chunks_processed: ${evidence.chunksProcessed}
chunks_failed: ${evidence.chunksFailed}
total_artifacts_extracted: ${evidence.totalExtracted}
duplicates_removed: ${evidence.duplicatesRemoved}
artifacts_for_analysis: ${evidence.artifacts.length}
primary_failure_type: ${evidence.primaryFailureType ?? "unknown"}
detected_framework: ${evidence.detectedFramework ?? "not detected"}
ci_platform: ${evidence.detectedCIPlatform ?? "unknown"}`;

  const causalOrderingSection = buildCausalOrderingSection();

  const emptyArtifactsGuidance =
    evidence.artifacts.length === 0
      ? `EMPTY ARTIFACTS GUIDANCE

No artifacts were extracted. This means either:
1. The logs contained no recognizable error patterns
2. All chunk extractions failed
3. The log format is not supported

Response requirements:
- Set category to "unknown"
- Set confidence to "low"
- Set root_cause.summary to describe what is known (e.g., "Build failed with exit code ${metadata.exitCode} but no specific errors were extracted")
- Use empty arrays for annotations, test_failures, lint_errors
- Suggest checking full logs in next_steps
`
      : "";

  return `${systemPrompt}

${outputSchema}

${causalOrderingSection}

${emptyArtifactsGuidance}---

${metadataSection}

${summarySection}

EXTRACTED ARTIFACTS

${artifactsSection}

---

Analyze the artifacts and provide your structured JSON response. Cite only the id values from the artifacts above. Output only valid JSON.`;
};

// ==================== Prompt Template ====================

/**
 * Generates the final analyzer prompt template for documentation/testing.
 * Derived from the actual builder functions to ensure consistency.
 *
 * @returns The complete prompt template string
 */
export const getFinalAnalyzerPromptTemplate = (): string => {
  const systemPrompt = buildArtifactAnalyzerSystemPrompt();
  const outputSchema = buildArtifactOutputSchema();
  const causalOrdering = buildCausalOrderingSection();

  return `${systemPrompt}

${outputSchema}

${causalOrdering}

INPUT FORMAT:
- Artifacts provided in record block format with SNIPPET_BEGIN/SNIPPET_END delimiters
- Build metadata in key: value format
- Extraction summary with counts

OUTPUT: Single JSON object matching the schema. No other text.`;
};

// ==================== Validation Utilities ====================

/**
 * Validates that an analysis response only references evidence IDs
 * that exist in the provided artifacts.
 *
 * @param response - Analysis response to validate
 * @param validEvidenceIds - Set of valid evidence IDs
 * @returns Array of invalid evidence IDs found
 */
export const validateAnalysisEvidenceIds = (
  response: {
    root_cause?: { evidence_ids?: readonly string[] };
    annotations?: ReadonlyArray<{ evidence_id?: string }>;
    secondary_findings?: ReadonlyArray<{ evidence_ids?: readonly string[] }>;
    test_failures?: ReadonlyArray<{ evidence_id?: string }>;
    lint_errors?: ReadonlyArray<{ evidence_id?: string }>;
  },
  validEvidenceIds: ReadonlySet<string>
): readonly string[] => {
  const rootCauseIds = response.root_cause?.evidence_ids ?? [];
  const annotationIds = (response.annotations ?? [])
    .map((annotation) => annotation.evidence_id)
    .filter((id): id is string => id !== undefined);
  const secondaryFindingIds = (response.secondary_findings ?? []).flatMap(
    (finding) => finding.evidence_ids ?? []
  );
  const testFailureIds = (response.test_failures ?? [])
    .map((failure) => failure.evidence_id)
    .filter((id): id is string => id !== undefined);
  const lintErrorIds = (response.lint_errors ?? [])
    .map((lintError) => lintError.evidence_id)
    .filter((id): id is string => id !== undefined);

  const allReferencedIds = [
    ...rootCauseIds,
    ...annotationIds,
    ...secondaryFindingIds,
    ...testFailureIds,
    ...lintErrorIds,
  ];

  const invalidIds = allReferencedIds.filter((evidenceId) => !validEvidenceIds.has(evidenceId));

  return [...new Set(invalidIds)];
};

/**
 * Validates confidence-based requirements for analysis response.
 * When confidence is medium or high, requires evidence_ids and annotations.
 *
 * @param response - Analysis response to validate
 * @returns Array of validation error messages (empty if valid)
 */
export const validateConfidenceRequirements = (response: {
  confidence?: string;
  root_cause?: { evidence_ids?: readonly string[] };
  annotations?: ReadonlyArray<{ evidence_id?: string }>;
}): readonly string[] => {
  const confidence = response.confidence ?? "low";
  const requiresValidation = confidence === "medium" || confidence === "high";

  if (!requiresValidation) {
    return [];
  }

  const rootCauseIds = response.root_cause?.evidence_ids ?? [];
  const annotations = response.annotations ?? [];
  const firstAnnotationId = annotations[0]?.evidence_id;

  const validationRules = [
    {
      condition: rootCauseIds.length === 0,
      message: `Confidence "${confidence}" requires at least 1 evidence_id in root_cause`,
    },
    {
      condition: annotations.length === 0,
      message: `Confidence "${confidence}" requires at least 1 annotation`,
    },
    {
      condition:
        rootCauseIds.length > 0 &&
        annotations.length > 0 &&
        firstAnnotationId !== undefined &&
        !rootCauseIds.includes(firstAnnotationId),
      message:
        "root_cause.evidence_ids should include the first annotation's evidence_id for coherence",
    },
  ] as const;

  return validationRules.filter((rule) => rule.condition).map((rule) => rule.message);
};

/**
 * Extracts all valid evidence IDs from aggregated evidence.
 *
 * @param evidence - Aggregated evidence
 * @returns Set of valid evidence IDs
 */
export const extractValidEvidenceIds = (evidence: AggregatedEvidence): ReadonlySet<string> =>
  new Set(evidence.artifacts.map((artifact) => artifact.absoluteEvidenceId));
