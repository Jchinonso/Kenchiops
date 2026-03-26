/**
 * Pattern Matcher
 *
 * Matches raw logs against known error signatures to produce a DiagnosticResult
 * without calling the LLM. Reduces cost and latency for common, well-understood
 * failure modes (OOM, permission denied, connection timeout, etc.).
 *
 * All functions are pure — no I/O, no side effects.
 *
 * @module diagnostics/patternMatcher
 */

import type { ProblemCategory, ProblemSubcategory, DiagnosticResult } from "./types.js";

// ==================== Types ====================

/** A known error signature with its classification and recommendation. */
export interface ErrorSignature {
  readonly name: string;
  readonly pattern: RegExp;
  readonly category: ProblemCategory;
  readonly subcategory: ProblemSubcategory;
  readonly confidence: "high" | "medium";
  readonly recommendation: string;
}

/** Result of matching a log against known patterns. */
export interface PatternMatchResult {
  readonly name: string;
  readonly category: ProblemCategory;
  readonly subcategory: ProblemSubcategory;
  readonly confidence: "high" | "medium";
  readonly recommendation: string;
  readonly matchedLine: string;
}

// ==================== Known Error Signatures ====================

/** Curated library of well-understood error patterns. */
const KNOWN_ERROR_SIGNATURES: readonly ErrorSignature[] = [
  // Infrastructure — Resource Exhaustion
  {
    name: "OOM",
    pattern:
      /out of memory|OOM|heap.*exhausted|ENOMEM|killed.*signal 9|JavaScript heap|allocation failed/i,
    category: "infrastructure",
    subcategory: "resource_exhaustion",
    confidence: "high",
    recommendation:
      "Increase memory limits or optimize memory usage. Check for memory leaks in the application.",
  },
  {
    name: "DiskFull",
    pattern: /no space left|ENOSPC|disk quota exceeded|filesystem.*full/i,
    category: "infrastructure",
    subcategory: "resource_exhaustion",
    confidence: "high",
    recommendation:
      "Free disk space or increase volume size. Check for excessive log output or build artifacts.",
  },
  {
    name: "CPUThrottle",
    pattern: /cpu.*throttl|cpu.*limit|cgroup.*cpu.*exceeded/i,
    category: "infrastructure",
    subcategory: "resource_exhaustion",
    confidence: "medium",
    recommendation: "Increase CPU limits or optimize computation-heavy steps.",
  },
  // Infrastructure — Network
  {
    name: "ConnectionTimeout",
    pattern: /ETIMEDOUT|connection timed out|connect timeout|dial tcp.*timeout/i,
    category: "infrastructure",
    subcategory: "network_failure",
    confidence: "high",
    recommendation:
      "Check network connectivity and firewall rules. Verify the target service is reachable.",
  },
  {
    name: "DNSFailure",
    pattern: /ENOTFOUND|DNS resolution failed|getaddrinfo.*ENOTFOUND|no such host/i,
    category: "infrastructure",
    subcategory: "network_failure",
    confidence: "high",
    recommendation:
      "Verify DNS configuration and hostname spelling. Check if the service endpoint has changed.",
  },
  {
    name: "ConnectionRefused",
    pattern: /ECONNREFUSED|connection refused|connect.*refused/i,
    category: "infrastructure",
    subcategory: "service_unavailable",
    confidence: "high",
    recommendation:
      "The target service is not accepting connections. Check if it is running and listening on the expected port.",
  },
  {
    name: "TLSError",
    pattern:
      /certificate.*expired|CERT_HAS_EXPIRED|SSL.*handshake|UNABLE_TO_VERIFY_LEAF_SIGNATURE|self.signed/i,
    category: "infrastructure",
    subcategory: "network_failure",
    confidence: "high",
    recommendation:
      "Renew or update the SSL/TLS certificate. Check certificate chain and CA configuration.",
  },
  // Configuration
  {
    name: "MissingEnvVar",
    pattern: /env.*not set|missing.*environment|undefined.*variable|required.*env|ERR_ENV_NOT_SET/i,
    category: "configuration",
    subcategory: "missing_environment",
    confidence: "high",
    recommendation:
      "Set the required environment variable in the deployment configuration or CI secrets.",
  },
  {
    name: "InvalidConfig",
    pattern:
      /invalid.*config|configuration.*error|malformed.*yaml|schema.*validation.*failed|invalid.*json/i,
    category: "configuration",
    subcategory: "invalid_config",
    confidence: "medium",
    recommendation: "Review the configuration file for syntax errors or missing required fields.",
  },
  {
    name: "AuthFailure",
    pattern:
      /401.*unauthorized|403.*forbidden|permission denied|EACCES|invalid.*credentials|authentication.*failed/i,
    category: "configuration",
    subcategory: "permission_auth",
    confidence: "high",
    recommendation:
      "Check credentials, API keys, and access tokens. Verify IAM roles and permissions.",
  },
  // Application — Dependencies
  {
    name: "DependencyConflict",
    pattern: /ERESOLVE|peer dependency|resolution.*impossible|version conflict|could not resolve/i,
    category: "application",
    subcategory: "version_mismatch",
    confidence: "high",
    recommendation:
      "Resolve dependency version conflicts. Try deleting lock file and reinstalling, or pin compatible versions.",
  },
  {
    name: "ModuleNotFound",
    pattern:
      /MODULE_NOT_FOUND|cannot find module|no such file or directory.*node_modules|import.*not found/i,
    category: "application",
    subcategory: "build_failure",
    confidence: "high",
    recommendation:
      "Run dependency installation (npm install / yarn). Check import paths and package.json.",
  },
  // Application — Build
  {
    name: "TypeScriptError",
    pattern: /error TS\d{4}:|Type.*is not assignable|Property.*does not exist|Cannot find name/i,
    category: "application",
    subcategory: "build_failure",
    confidence: "high",
    recommendation:
      "Fix TypeScript compilation errors. Run tsc locally to see the full error output.",
  },
  {
    name: "CompilationError",
    pattern: /compilation.*failed|error:.*undefined reference|fatal error:.*no such file/i,
    category: "application",
    subcategory: "build_failure",
    confidence: "medium",
    recommendation:
      "Fix compilation errors. Check for missing includes, undefined symbols, or syntax errors.",
  },
  // Application — Tests
  {
    name: "TestAssertion",
    pattern: /AssertionError|expect\(.*\)\.to|expected.*to equal|assert.*failed/i,
    category: "application",
    subcategory: "test_failure",
    confidence: "high",
    recommendation:
      "Fix failing test assertions. Compare expected vs actual values in the test output.",
  },
  {
    name: "TestTimeout",
    pattern: /test.*timed out|exceeded timeout|jest.*timeout|mocha.*timeout/i,
    category: "application",
    subcategory: "test_failure",
    confidence: "medium",
    recommendation:
      "Increase test timeout or investigate why the test is hanging (async operations, network calls).",
  },
  // Deployment
  {
    name: "DockerPull",
    pattern: /pull.*failed|manifest.*not found|unauthorized.*registry|image.*not found/i,
    category: "deployment",
    subcategory: "container_error",
    confidence: "high",
    recommendation:
      "Check Docker image name, tag, and registry credentials. Verify the image has been pushed.",
  },
  {
    name: "HealthCheckFailed",
    pattern: /health.*check.*fail|readiness.*probe.*fail|liveness.*probe.*fail|unhealthy/i,
    category: "deployment",
    subcategory: "rollout_failure",
    confidence: "high",
    recommendation:
      "Check application startup sequence, health endpoint implementation, and resource availability.",
  },
  {
    name: "CrashLoopBackOff",
    pattern: /CrashLoopBackOff|back-off.*restarting|container.*crash|exit code [1-9]/i,
    category: "deployment",
    subcategory: "rollout_failure",
    confidence: "high",
    recommendation:
      "Check application logs for startup errors. Verify configuration, environment variables, and dependencies.",
  },
  // External
  {
    name: "RateLimit",
    pattern: /rate limit|429.*too many requests|throttled|quota.*exceeded|API rate limit/i,
    category: "external",
    subcategory: "third_party_api",
    confidence: "high",
    recommendation:
      "Reduce request frequency or implement backoff/retry. Check API quota and upgrade plan if needed.",
  },
  {
    name: "ExternalTimeout",
    pattern: /upstream.*timeout|gateway.*timeout|504.*gateway|502.*bad gateway/i,
    category: "external",
    subcategory: "third_party_api",
    confidence: "medium",
    recommendation:
      "External service is slow or unavailable. Check provider status page and implement retry with backoff.",
  },
  {
    name: "TerraformState",
    pattern: /state.*lock|terraform.*lock|state.*already locked/i,
    category: "deployment",
    subcategory: "orchestration",
    confidence: "high",
    recommendation:
      "Release the Terraform state lock or wait for the current operation to complete.",
  },
];

// ==================== Constants ====================

/** Number of characters to scan from the start of the log. */
const SCAN_HEAD_CHARS = 5000;

/** Number of characters to scan from the end of the log. */
const SCAN_TAIL_CHARS = 2000;

// ==================== Matching Logic ====================

/**
 * Extracts the line containing the pattern match for context.
 */
const extractMatchedLine = (text: string, pattern: RegExp): string => {
  const match = pattern.exec(text);
  if (!match) {
    return "";
  }

  const matchStart = match.index;
  const lineStart = text.lastIndexOf("\n", matchStart) + 1;
  const lineEnd = text.indexOf("\n", matchStart);
  return text
    .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    .trim()
    .slice(0, 200);
};

/**
 * Builds the scan region from the log (first + last chars).
 */
const buildScanRegion = (rawLog: string): string =>
  rawLog.length <= SCAN_HEAD_CHARS + SCAN_TAIL_CHARS
    ? rawLog
    : rawLog.slice(0, SCAN_HEAD_CHARS) + rawLog.slice(-SCAN_TAIL_CHARS);

/**
 * Matches raw log against known error signatures.
 * Scans the first 5000 and last 2000 characters for efficiency.
 *
 * @returns The first high-confidence match, or first medium-confidence if no high, or null.
 */
export const matchKnownPattern = (rawLog: string): PatternMatchResult | null => {
  const scanRegion = buildScanRegion(rawLog);
  let firstMediumMatch: PatternMatchResult | null = null; // let: stores fallback if no high-confidence match found

  // for...of: early-exit on first high-confidence match
  for (const signature of KNOWN_ERROR_SIGNATURES) {
    if (!signature.pattern.test(scanRegion)) {
      continue;
    }

    const matchedLine = extractMatchedLine(scanRegion, signature.pattern);
    const result: PatternMatchResult = {
      name: signature.name,
      category: signature.category,
      subcategory: signature.subcategory,
      confidence: signature.confidence,
      recommendation: signature.recommendation,
      matchedLine,
    };

    if (signature.confidence === "high") {
      return result;
    }

    firstMediumMatch ??= result;
  }

  return firstMediumMatch;
};

/**
 * Builds a DiagnosticResult directly from a pattern match (no LLM call needed).
 */
export const buildDiagnosticFromPattern = (
  match: PatternMatchResult,
  _rawLogPreview: string
): DiagnosticResult => ({
  status: "complete",
  rootCause: {
    category: match.category,
    subcategory: match.subcategory,
    summary: `${match.name}: ${match.matchedLine}`,
    confidence: match.confidence,
    evidence: [match.matchedLine],
  },
  causalityChain: {
    primary: { type: match.name, summary: match.matchedLine },
    secondary: [],
    explanation: `Matched known error pattern: ${match.name}`,
  },
  impact: {
    severity: match.confidence === "high" ? "high" : "medium",
    scope: match.category,
    duration: "",
    usersAffected: "",
  },
  recommendations: {
    immediate: [{ description: match.recommendation, priority: "immediate" }],
    preventive: [],
    investigative: [],
  },
  relatedContext: {
    pastIncidents: [],
    runbooks: [],
    documentation: [],
  },
});
