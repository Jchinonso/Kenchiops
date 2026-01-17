/**
 * Chunking Pipeline Constants
 *
 * Configuration for the multi-stage CI log analysis pipeline.
 * All values are tuned for balancing cost, accuracy, and performance.
 *
 * @module constants/chunkingPipeline
 */

// ==================== Line Number Convention ====================

/**
 * Line numbering convention for the pipeline.
 * All line numbers in the pipeline are 1-indexed (human-readable).
 */
export const LINE_NUMBER_CONFIG = {
  /** Offset to convert 0-indexed array position to 1-indexed line number */
  ARRAY_TO_LINE_OFFSET: 1,
} as const;

/**
 * Percentage calculation constants.
 * Used for computing reduction percentages in preprocessing.
 */
export const PERCENTAGE_CONFIG = {
  /** Multiplier to convert decimal fraction to percentage (0.5 -> 50) */
  DECIMAL_TO_PERCENT: 100,
} as const;

// ==================== Token Estimation ====================

/**
 * Token estimation configuration.
 * Characters per token varies by content type but 3.5 is a safe heuristic.
 */
export const TOKEN_ESTIMATION = {
  /** Characters per token (conservative heuristic) */
  CHARS_PER_TOKEN: 3.5,
  /** Tiktoken encoding for OpenAI models */
  TIKTOKEN_ENCODING: "cl100k_base",
} as const;

// ==================== Chunking Configuration ====================

/**
 * Smart chunking configuration.
 * Balances chunk size for parallel extraction with context preservation.
 */
export const CHUNKING_DEFAULTS = {
  /** Target chunk size in tokens (~3000 tokens) */
  TARGET_TOKENS: 3000,
  /** Hard maximum chunk size in tokens */
  MAX_TOKENS: 4000,
  /** Number of overlap lines between chunks */
  OVERLAP_LINES: 40,
  /** Maximum chunks to prevent runaway processing */
  MAX_CHUNKS: 100,
  /** Skip chunking for logs below this token count */
  SMALL_LOG_THRESHOLD: 3500,
} as const;

// ==================== Protected Zone Detection ====================

/**
 * Patterns for detecting protected zones that should not be split.
 * These represent logical units that lose meaning when broken apart.
 */
export const PROTECTED_ZONE_PATTERNS = {
  /** Stack trace patterns - lines that indicate stack frame continuation */
  STACK_TRACE: [
    /** JavaScript/TypeScript/Java "at" frames */
    /^\s+at\s+/,
    /** Python traceback header */
    /^Traceback \(most recent call last\):/,
    /** Python traceback frame */
    /^\s+File\s+"[^"]+",\s+line\s+\d+/,
    /** Rust/Go panic continuation */
    /^\s+\d+:\s+0x[0-9a-f]+\s+-\s+/,
    /** Generic indented continuation after Error: */
    /^(?:\s{2,}|\t+)\S/,
  ] as readonly RegExp[],

  /** Test output block markers */
  TEST_OUTPUT: [
    /** Jest/Vitest FAIL marker */
    /^FAIL\s+/,
    /** pytest failure marker */
    /^FAILED\s+/,
    /** Test suite boundary */
    /^={3,}\s*(?:FAILURES|ERRORS|test session starts)/,
    /** Go test failure */
    /^---\s+FAIL:/,
    /** Rust test failure */
    /^failures:/,
  ] as readonly RegExp[],

  /** Compiler error block patterns */
  COMPILER_ERROR: [
    /** Generic file:line:column error */
    /^[^\s:]+:\d+:\d+:\s*(?:error|warning):/,
    /** Rust compiler error */
    /^error\[E\d+\]:/,
    /** TypeScript error */
    /^[^\s]+\.tsx?:\d+:\d+\s*-\s*error\s+TS\d+:/,
    /** Go compiler error */
    /^\.\/[^\s]+:\d+:\d+:/,
  ] as readonly RegExp[],

  /** CI group markers that define logical sections */
  CI_GROUP: [
    /** GitHub Actions group */
    /^##\[group\]/,
    /** GitLab CI section */
    /^section_start:\d+:/,
    /** Azure DevOps section */
    /^##\[section\]/,
  ] as readonly RegExp[],
} as const;

// ==================== Natural Boundary Detection ====================

/**
 * Patterns for detecting natural split points.
 * These are preferred over arbitrary splits to preserve context.
 */
export const NATURAL_BOUNDARY_PATTERNS = {
  /** GitHub Actions step markers */
  GITHUB_ACTIONS: [/^##\[group\]/, /^##\[endgroup\]/, /^Run\s+/, /^>\s+/] as readonly RegExp[],

  /** GitLab CI markers */
  GITLAB_CI: [/^section_start:\d+:/, /^section_end:\d+:/, /^\$\s+/] as readonly RegExp[],

  /** Generic separators */
  GENERIC: [
    /** Blank line followed by content */
    /^$/,
    /** Separator lines */
    /^[=\-*]{3,}\s*$/,
    /** Step/phase markers */
    /^(?:Step|Phase|Stage)\s+\d+/i,
    /** Command prompts */
    /^[$>#]\s+/,
  ] as readonly RegExp[],
} as const;

// ==================== Extraction Configuration ====================

/**
 * Chunk extraction configuration for Stage 2.
 */
export const EXTRACTION_DEFAULTS = {
  /** Maximum parallel extraction requests */
  CONCURRENCY: 5,
  /** Timeout per extraction request in milliseconds */
  TIMEOUT_MS: 10000,
  /** Retry delay after timeout in milliseconds */
  RETRY_DELAY_MS: 5000,
  /** Maximum artifacts to extract per chunk */
  MAX_ARTIFACTS_PER_CHUNK: 20,
  /** Abort threshold - fail if this fraction of chunks fail */
  CHUNK_FAILURE_THRESHOLD: 0.5,
} as const;

// ==================== Artifact Types & Priorities ====================

/**
 * Artifact types that can be extracted from log chunks.
 * Ordered by diagnostic value.
 *
 * Extended set covers common CI error classes:
 * - Infrastructure: infra_killer, network_error, cache_error, fs_error, service_unavailable
 * - Dependencies: dependency_error, lock_error
 * - Auth/Permissions: auth_error
 * - Configuration: config_error
 * - VCS/Checkout: git_error
 * - Containers: container_error
 * - Build/Compile: compiler_error, lint_error, toolchain_error
 * - Test: test_failure
 * - Deploy: deploy_error
 * - Boundaries: ci_boundary
 * - Fallback: stack_trace, generic_error
 */
export const ARTIFACT_TYPES = {
  /** OOM, SIGKILL, timeout, disk full - always root cause */
  INFRA_KILLER: "infra_killer",
  /** Cache corruption: tar EOF, checksum mismatch, restore failed */
  CACHE_ERROR: "cache_error",
  /** Filesystem permissions: EACCES, readonly fs, cannot create directory */
  FS_ERROR: "fs_error",
  /** Service dependency unavailable: ECONNREFUSED, database not ready */
  SERVICE_UNAVAILABLE: "service_unavailable",
  /** DNS failures, connection timeouts, rate limits (non-fatal infra) */
  NETWORK_ERROR: "network_error",
  /** Permission denied, 403, missing tokens, invalid credentials */
  AUTH_ERROR: "auth_error",
  /** Missing env vars, config validation failed, .env not found */
  CONFIG_ERROR: "config_error",
  /** Git clone/fetch failures, submodule issues, LFS auth */
  GIT_ERROR: "git_error",
  /** Package resolution failures: npm ERESOLVE, pip ResolutionImpossible, etc. */
  DEPENDENCY_ERROR: "dependency_error",
  /** Lock contention: Terraform state lock, npm lock, another process using */
  LOCK_ERROR: "lock_error",
  /** Docker/registry failures: manifest unknown, pull denied, wrong arch */
  CONTAINER_ERROR: "container_error",
  /** Missing tools, wrong versions, PATH issues */
  TOOLCHAIN_ERROR: "toolchain_error",
  /** CI step exit codes, error markers (low priority - use only if no specific type) */
  CI_BOUNDARY: "ci_boundary",
  /** Exceptions with stack frames */
  STACK_TRACE: "stack_trace",
  /** Test assertion failures */
  TEST_FAILURE: "test_failure",
  /** Compilation/transpilation errors */
  COMPILER_ERROR: "compiler_error",
  /** Linter violations (eslint, clippy, pylint) */
  LINT_ERROR: "lint_error",
  /** Formatter policy failures (cargo fmt, prettier, black) */
  FORMAT_ERROR: "format_error",
  /** kubectl, terraform, helm, migration failures */
  DEPLOY_ERROR: "deploy_error",
  /** Unclassified errors */
  GENERIC_ERROR: "generic_error",
} as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[keyof typeof ARTIFACT_TYPES];

/**
 * Priority weights for artifact ranking.
 * Higher weight = more likely to be root cause.
 *
 * Tiers:
 * - 10: Fatal infrastructure (always root cause)
 * - 9: Auth/config (blocks everything downstream)
 * - 8: Cache/FS/service/network (infra issues that block pipeline)
 * - 7: Git/dependencies/containers/toolchain (early pipeline setup)
 * - 6: Lock contention, stack traces
 * - 5: Compiler, test failures (build/test phase)
 * - 4: Lint, deploy errors
 * - 3: CI boundary (only root cause if no specific type with priority >= 7)
 * - 2: Generic fallback
 *
 * CI_BOUNDARY RULE: ci_boundary can only be root cause if there is no
 * more specific artifact with priority >= 7 in the same or earlier chunk.
 */
export const ARTIFACT_PRIORITY_WEIGHTS: Readonly<Record<ArtifactType, number>> = {
  [ARTIFACT_TYPES.INFRA_KILLER]: 10,
  [ARTIFACT_TYPES.AUTH_ERROR]: 9,
  [ARTIFACT_TYPES.CONFIG_ERROR]: 9,
  [ARTIFACT_TYPES.CACHE_ERROR]: 8,
  [ARTIFACT_TYPES.FS_ERROR]: 8,
  [ARTIFACT_TYPES.SERVICE_UNAVAILABLE]: 8,
  [ARTIFACT_TYPES.NETWORK_ERROR]: 8,
  [ARTIFACT_TYPES.GIT_ERROR]: 7,
  [ARTIFACT_TYPES.DEPENDENCY_ERROR]: 7,
  [ARTIFACT_TYPES.CONTAINER_ERROR]: 7,
  [ARTIFACT_TYPES.TOOLCHAIN_ERROR]: 7,
  [ARTIFACT_TYPES.LOCK_ERROR]: 6,
  [ARTIFACT_TYPES.STACK_TRACE]: 6,
  [ARTIFACT_TYPES.COMPILER_ERROR]: 5,
  [ARTIFACT_TYPES.TEST_FAILURE]: 5,
  [ARTIFACT_TYPES.LINT_ERROR]: 4,
  [ARTIFACT_TYPES.FORMAT_ERROR]: 3,
  [ARTIFACT_TYPES.DEPLOY_ERROR]: 4,
  [ARTIFACT_TYPES.CI_BOUNDARY]: 3,
  [ARTIFACT_TYPES.GENERIC_ERROR]: 2,
};

/**
 * Artifact severity levels.
 */
export const ARTIFACT_SEVERITY = {
  FATAL: "fatal",
  ERROR: "error",
  WARNING: "warning",
} as const;

export type ArtifactSeverity = (typeof ARTIFACT_SEVERITY)[keyof typeof ARTIFACT_SEVERITY];

/**
 * Confidence levels for extracted artifacts.
 */
export const ARTIFACT_CONFIDENCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type ArtifactConfidence = (typeof ARTIFACT_CONFIDENCE)[keyof typeof ARTIFACT_CONFIDENCE];

// ==================== Aggregation Configuration ====================

/**
 * Aggregation configuration for Stage 3 (chunking pipeline).
 * Named distinctly to avoid collision with Redis AGGREGATION_DEFAULTS.
 */
export const CHUNKING_AGGREGATION_DEFAULTS = {
  /** Maximum artifacts to pass to final analysis */
  MAX_FINAL_ARTIFACTS: 25,
  /** Length of signature hash to use (first N chars of hash) */
  SIGNATURE_HASH_LENGTH: 16,
  /** Bit shift for simple hash function (standard djb2 variant) */
  HASH_SHIFT_BITS: 5,
  /** Hash algorithm for Web Crypto API */
  HASH_ALGORITHM: "SHA-256",
} as const;

// ==================== Primary Failure Determination ====================

/**
 * Configuration for primary failure determination algorithm.
 * Used in causality-aware root cause analysis.
 */
export const PRIMARY_FAILURE_CONFIG = {
  /** Weight for artifacts appearing early in the log */
  POSITION_EARLY_WEIGHT: 3,
  /** Weight for artifacts containing stack traces */
  STACKTRACE_WEIGHT: 2,
  /** Maximum possible score gap for confidence calculation */
  MAX_SCORE_GAP: 10,
  /** Maximum confidence value (cap) */
  MAX_CONFIDENCE: 0.95,
  /** Base confidence before gap adjustment */
  BASE_CONFIDENCE: 0.5,
  /** Confidence multiplier for score gap */
  GAP_CONFIDENCE_FACTOR: 0.45,
  /** Threshold for high confidence level */
  HIGH_CONFIDENCE_THRESHOLD: 0.8,
  /** Threshold for medium confidence level */
  MEDIUM_CONFIDENCE_THRESHOLD: 0.5,
} as const;

/**
 * Artifact types ordered by causality likelihood.
 * Earlier types are more likely to be root causes that cascade to others.
 * Uses ARTIFACT_TYPES values for type safety.
 *
 * Order reflects typical CI pipeline flow:
 * 1. Infrastructure killers (OOM, SIGKILL, timeout)
 * 2. Cache corruption (can't restore dependencies/build artifacts)
 * 3. Filesystem issues (EACCES, readonly)
 * 4. Auth/config (blocks all authenticated operations)
 * 5. Network/services (can't reach external deps)
 * 6. Git/checkout (can't get code)
 * 7. Dependencies/locks (can't install packages)
 * 8. Toolchain/containers (can't run build tools)
 * 9. Build/compile (code doesn't compile)
 * 10. Lint (code quality gates)
 * 11. Test (functionality failures)
 * 12. Deploy (deployment phase)
 * 13. Runtime exceptions
 * 14. CI boundary (exit codes - only if no specific type)
 * 15. Generic/unknown
 */
export const CAUSALITY_TYPE_ORDER: readonly ArtifactType[] = [
  ARTIFACT_TYPES.INFRA_KILLER,
  ARTIFACT_TYPES.CACHE_ERROR,
  ARTIFACT_TYPES.FS_ERROR,
  ARTIFACT_TYPES.AUTH_ERROR,
  ARTIFACT_TYPES.CONFIG_ERROR,
  ARTIFACT_TYPES.SERVICE_UNAVAILABLE,
  ARTIFACT_TYPES.NETWORK_ERROR,
  ARTIFACT_TYPES.GIT_ERROR,
  ARTIFACT_TYPES.DEPENDENCY_ERROR,
  ARTIFACT_TYPES.LOCK_ERROR,
  ARTIFACT_TYPES.TOOLCHAIN_ERROR,
  ARTIFACT_TYPES.CONTAINER_ERROR,
  ARTIFACT_TYPES.COMPILER_ERROR,
  ARTIFACT_TYPES.LINT_ERROR,
  ARTIFACT_TYPES.TEST_FAILURE,
  ARTIFACT_TYPES.FORMAT_ERROR,
  ARTIFACT_TYPES.DEPLOY_ERROR,
  ARTIFACT_TYPES.STACK_TRACE,
  ARTIFACT_TYPES.CI_BOUNDARY,
  ARTIFACT_TYPES.GENERIC_ERROR,
] as const;

/**
 * Patterns that indicate stack trace content in artifact snippets.
 */
export const STACKTRACE_INDICATORS: readonly string[] = ["at ", "Traceback"] as const;

// ==================== Degraded Mode Configuration ====================

/**
 * Configuration for degraded mode fallback.
 * Used when extraction or aggregation fails.
 */
export const DEGRADED_MODE_CONFIG = {
  /** Maximum characters to include in raw log preview */
  RAW_LOG_PREVIEW_LENGTH: 2000,
  /** Number of lines to sample from top of log in degraded mode */
  SAMPLE_TOP_LINES: 250,
  /** Number of lines to sample from bottom of log in degraded mode */
  SAMPLE_BOTTOM_LINES: 250,
} as const;

/**
 * Prompt for degraded mode analysis when chunking pipeline fails.
 * Used as fallback to provide basic analysis from sampled log content.
 */
export const DEGRADED_MODE_PROMPT =
  `You are a CI log analyzer operating in DEGRADED MODE due to extraction failures.

You are receiving a SAMPLE of the log (first and last portions) because normal extraction failed.

IMPORTANT LIMITATIONS:
- You only have partial log content
- Normal structured extraction was not possible
- Your analysis confidence should be LOW unless you find clear explicit errors
- Set degraded_mode: true in your response

TASK:
Analyze the sampled log content and identify any visible errors or failures.

OUTPUT (JSON only, no markdown):
{
  "root_cause": {
    "summary": "Brief summary of visible errors (or 'Unable to determine from partial log')",
    "detail": "What you can see in the sample",
    "evidence_ids": []
  },
  "confidence": "low",
  "category": "unknown",
  "phase": "unknown",
  "annotations": [],
  "next_steps": [
    {"action": "Review full CI logs manually", "reason": "Automated extraction failed", "safe": true, "priority": 1},
    {"action": "Check CI runner health", "reason": "Extraction failures may indicate infrastructure issues", "safe": true, "priority": 2}
  ],
  "secondary_findings": [],
  "metadata": {
    "degraded_mode": true,
    "analysis_version": "1.1"
  },
  "degraded_mode": true
}

LOG SAMPLE:
` as const;

// ==================== CI Platform Detection ====================

/**
 * CI platform identifiers.
 */
export const CI_PLATFORMS = {
  GITHUB_ACTIONS: "github_actions",
  GITLAB_CI: "gitlab_ci",
  JENKINS: "jenkins",
  CIRCLECI: "circleci",
  AZURE_DEVOPS: "azure_devops",
  UNKNOWN: "unknown",
} as const;

export type CIPlatformType = (typeof CI_PLATFORMS)[keyof typeof CI_PLATFORMS];

/**
 * Patterns for detecting CI platform from log content.
 */
export const CI_PLATFORM_DETECTION_PATTERNS: Readonly<Record<string, RegExp>> = {
  [CI_PLATFORMS.GITHUB_ACTIONS]: /##\[(?:group|error|warning|notice)\]|Run\s+actions\//,
  [CI_PLATFORMS.GITLAB_CI]: /section_(?:start|end):\d+:|Job succeeded|Job failed/,
  [CI_PLATFORMS.JENKINS]: /\[Pipeline\]|\[INFO\]\s+Building/,
  [CI_PLATFORMS.CIRCLECI]: /circleci|Spin up environment/i,
  [CI_PLATFORMS.AZURE_DEVOPS]: /##vso\[|azure-pipelines/i,
};

// ==================== Preprocessing Enhancements ====================

/**
 * Configuration for line collapse preprocessing.
 */
export const LINE_COLLAPSE_CONFIG = {
  /** Maximum identical consecutive lines to keep */
  MAX_REPEATS: 3,
  /** Marker format for collapsed lines */
  COLLAPSE_MARKER: "[repeated %d more times]",
} as const;

/**
 * Patterns for progress indicators to remove.
 */
export const PROGRESS_INDICATOR_PATTERNS = [
  /** Download progress bars */
  /^\s*(?:Downloading|Fetching|Installing).*\d+%/,
  /** Spinner characters */
  /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|\\/-]+\s/,
  /** npm/yarn progress */
  /^\s*\[\s*[-=>#]+\s*\]\s*\d+/,
  /** Generic percentage progress */
  /^\s*(?:\d+\/\d+|\d+%)\s*(?:complete|done|finished)?/i,
  /** Cargo/pip download indicators */
  /^\s*(?:Downloaded|Collecting)\s+.*\s+\(\d+.*\)/,
  /** Build progress counters */
  /^\[\s*\d+\/\d+\s*\]/,
] as readonly RegExp[];

// ==================== Boundary Types ====================

/**
 * Types of chunk boundaries.
 */
export const BOUNDARY_TYPES = {
  NATURAL: "natural",
  FORCED: "forced",
  OVERLAP: "overlap",
} as const;

export type BoundaryType = (typeof BOUNDARY_TYPES)[keyof typeof BOUNDARY_TYPES];

// ==================== Protected Zone Types ====================

/**
 * Types of protected zones.
 */
export const PROTECTED_ZONE_TYPES = {
  STACK_TRACE: "stack_trace",
  TEST_OUTPUT: "test_output",
  COMPILER_ERROR: "compiler_error",
  CI_GROUP: "ci_group",
} as const;

export type ProtectedZoneType = (typeof PROTECTED_ZONE_TYPES)[keyof typeof PROTECTED_ZONE_TYPES];
