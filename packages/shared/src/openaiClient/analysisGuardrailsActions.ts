/**
 * Action filtering and cause building for analysis guardrails.
 */

import type {
  FailureCategory,
  LLMAnalysisResult,
  LLMRecommendedAction,
  PipelinePhase,
} from "../core/types.js";
import { truncateText } from "../formatting/uiHelpers.js";
import {
  FILE_PATH_IDENTIFIER,
  formatEvidenceId,
  type EvidenceHighlights,
} from "./analysisGuardrailsEvidence.js";

interface ActionEvidenceHint {
  readonly action: RegExp;
  readonly evidence: RegExp;
}

interface SectionActionMatcher {
  readonly key: keyof EvidenceHighlights["sections"];
  readonly pattern: RegExp;
}

/**
 * Patterns for generic causes that should be replaced with evidence-based causes.
 * Only exact/nearly-exact matches - avoid replacing legitimate detailed causes.
 */
const GENERIC_CAUSE_PATTERNS: readonly RegExp[] = [
  /^test execution failed\.?$/i,
  /^tests? failed\.?$/i,
  /^ci (build|check|pipeline) failed\.?$/i,
  /^build failed\.?$/i,
  /^workflow failed\.?$/i,
  /^multiple tests? failed\.?$/i,
];

const ACTION_EVIDENCE_HINTS: readonly ActionEvidenceHint[] = [
  { action: /timeout|timed out/i, evidence: /timeout|timed out/i },
  { action: /database|db|pool|connection/i, evidence: /database|db|pool|connection/i },
  { action: /mock|stub|fixture/i, evidence: /mock|stub|fixture/i },
  {
    action: /dependency|package|lockfile|version/i,
    evidence: /dependency|package|lockfile|version/i,
  },
  {
    action: /config|configuration|env|environment|variable|secret|yaml|yml|toml|json/i,
    evidence: /config|configuration|env|environment|variable|secret|yaml|yml|toml|json/i,
  },
  { action: /workflow|job|step|runner|github action/i, evidence: /workflow|job|step|runner/i },
  { action: /test|spec|assert/i, evidence: /test|assert|spec|failed tests|test error/i },
];

/**
 * Action types that should pass through without strict evidence matching.
 * These are common investigative actions that are always relevant to failures.
 */
const ACTION_TYPE_WHITELIST = new Set([
  "review_test",
  "check_assertion",
  "verify_expected",
  "run_locally",
  "add_logging",
  "check_fixture",
  "debug",
  "review_logs",
  "check_test",
]);

const SECTION_ACTION_MATCHERS: readonly SectionActionMatcher[] = [
  { key: "hasTests", pattern: /test|spec|assert/i },
  { key: "hasAnnotations", pattern: /annotation|stack trace|line/i },
  { key: "hasCheckOutput", pattern: /check output|check run|ci check|check logs?/i },
  { key: "hasWorkflowLogs", pattern: /workflow|job|step|runner/i },
  { key: "hasDependencyChanges", pattern: /dependency|package|lockfile/i },
  { key: "hasBuildConfigChanges", pattern: /config|configuration|build/i },
];

const TOKEN_MATCHERS: ReadonlyArray<(highlights: EvidenceHighlights) => readonly string[]> = [
  (highlights) => highlights.dependencyNames,
  (highlights) => highlights.configFiles,
];

const SIGNAL_ACTION_RULES: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly description: string;
}> = [
  {
    pattern: /timeout|timed out/,
    description: "Address the timeout shown in the logs (increase timeout or reduce setup time).",
  },
  {
    pattern: /database|db|pool|connection/,
    description:
      "Verify database setup referenced in the logs (initialize connections/pool before tests).",
  },
  {
    pattern: /mock|stub|fixture/,
    description: "Verify mock/fixture setup mentioned in the logs before the failing test runs.",
  },
  {
    pattern: /out of memory|oom|no space left on device/,
    description: "Check CI runner resources and quotas (memory/disk) referenced in the logs.",
  },
];

const CAMEL_CASE_IDENTIFIER = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g;
const SNAKE_CASE_IDENTIFIER = /\b[a-z0-9]+_[a-z0-9_]+\b/g;
const KEBAB_CASE_IDENTIFIER = /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g;
const CONTEXTUAL_IDENTIFIER_PATTERNS: readonly RegExp[] = [
  /\b([A-Za-z_][A-Za-z0-9_-]{2,})\s+(?:function|method|handler|service|module|class)\b/gi,
  /\b(?:function|method|handler|service|module|class)\s+([A-Za-z_][A-Za-z0-9_-]{2,})\b/gi,
];

const appendEvidenceId = (text: string, evidenceId?: string): string =>
  evidenceId ? `${text} (evidence: ${evidenceId})` : text;

const extractEvidenceIdentifiers = (text: string): string[] => {
  const contextualIdentifiers = CONTEXTUAL_IDENTIFIER_PATTERNS.flatMap((pattern) =>
    Array.from(text.matchAll(pattern))
      .map((match) => match[1])
      .filter((identifier): identifier is string => Boolean(identifier))
  );
  const rawIdentifiers = [
    ...(text.match(CAMEL_CASE_IDENTIFIER) ?? []),
    ...(text.match(SNAKE_CASE_IDENTIFIER) ?? []),
    ...(text.match(KEBAB_CASE_IDENTIFIER) ?? []),
    ...(text.match(FILE_PATH_IDENTIFIER) ?? []),
    ...contextualIdentifiers,
  ];
  const uniqueIdentifiers = Array.from(new Set(rawIdentifiers.map((id) => id.trim())));
  return uniqueIdentifiers.filter((identifier) => identifier.length >= 4);
};

const mentionsAnyToken = (text: string, tokens: readonly string[]): boolean => {
  const lowerText = text.toLowerCase();
  return tokens.some((token) => token.length > 2 && lowerText.includes(token.toLowerCase()));
};

const hasSectionMatch = (description: string, highlights: EvidenceHighlights): boolean =>
  SECTION_ACTION_MATCHERS.some(
    ({ key, pattern }) => highlights.sections[key] && pattern.test(description)
  );

const hasTokenMatch = (description: string, highlights: EvidenceHighlights): boolean =>
  TOKEN_MATCHERS.some((getTokens) => mentionsAnyToken(description, getTokens(highlights)));

const isActionEvidenceBacked = (
  action: LLMRecommendedAction,
  evidenceText: string,
  highlights: EvidenceHighlights
): boolean => {
  // Whitelisted action types always pass
  if (action.actionType && ACTION_TYPE_WHITELIST.has(action.actionType.toLowerCase())) {
    return true;
  }

  // Check for identifier matches in evidence
  const identifiers = extractEvidenceIdentifiers(action.description);
  if (identifiers.length > 0) {
    // Require at least one identifier to match (less strict than all)
    const lowerEvidenceText = evidenceText.toLowerCase();
    const hasAnyMatch = identifiers.some((identifier) =>
      lowerEvidenceText.includes(identifier.toLowerCase())
    );
    if (hasAnyMatch) {
      return true;
    }
  }

  // Check hint patterns
  const hasHintMatch = ACTION_EVIDENCE_HINTS.some(
    (hint) => hint.action.test(action.description) && hint.evidence.test(evidenceText)
  );
  if (hasHintMatch || hasSectionMatch(action.description, highlights)) {
    return true;
  }

  return hasTokenMatch(action.description, highlights);
};

export const filterActionsByEvidence = (
  actions: readonly LLMRecommendedAction[],
  evidenceText: string,
  highlights: EvidenceHighlights
): LLMRecommendedAction[] =>
  actions.filter((action) => isActionEvidenceBacked(action, evidenceText, highlights));

export const isGenericCause = (cause: string): boolean =>
  GENERIC_CAUSE_PATTERNS.some((pattern) => pattern.test(cause));

const buildAnnotationLocation = (highlights: EvidenceHighlights): string =>
  highlights.primaryFile
    ? highlights.primaryLine
      ? `${highlights.primaryFile}:${highlights.primaryLine}`
      : highlights.primaryFile
    : "annotation";

type EvidenceSource = NonNullable<EvidenceHighlights["source"]>;

const CAUSE_BUILDERS: Record<
  EvidenceSource,
  (highlights: EvidenceHighlights, errorLine: string) => string
> = {
  test: (highlights, errorLine) => {
    const testName = truncateText(highlights.primaryTestName ?? "failing test", 60);
    const fileTag = highlights.primaryFile ? ` (${highlights.primaryFile})` : "";
    // Prefer extracted error snippet over generic errorLine
    const errorDetail = highlights.primaryErrorSnippet
      ? truncateText(highlights.primaryErrorSnippet, 120)
      : errorLine;
    return appendEvidenceId(
      `Test failure in ${testName}${fileTag}: ${errorDetail}`,
      highlights.primaryEvidenceId
    );
  },
  annotation: (highlights, errorLine) => {
    // Prefer extracted error snippet over generic errorLine
    const errorDetail = highlights.primaryErrorSnippet
      ? truncateText(highlights.primaryErrorSnippet, 120)
      : errorLine;
    return appendEvidenceId(
      `CI annotation at ${buildAnnotationLocation(highlights)}: ${errorDetail}`,
      highlights.primaryEvidenceId
    );
  },
  check: (highlights, errorLine) =>
    appendEvidenceId(`CI check output shows: ${errorLine}`, highlights.primaryEvidenceId),
  workflow: (highlights, errorLine) =>
    appendEvidenceId(`Workflow log shows: ${errorLine}`, highlights.primaryEvidenceId),
  infra: (_highlights, errorLine) => `Infrastructure issue detected in CI logs: ${errorLine}`,
};

export const buildEvidenceBasedCause = (highlights: EvidenceHighlights): string | null => {
  const errorLine = highlights.primaryErrorLine
    ? truncateText(highlights.primaryErrorLine, 160)
    : "";
  if (!errorLine || !highlights.source) {
    return null;
  }

  const builder = CAUSE_BUILDERS[highlights.source];
  return builder ? builder(highlights, errorLine) : null;
};

const createAction = (
  description: string,
  priority: "high" | "medium",
  actionType: string = "manual_investigation"
): LLMRecommendedAction => ({
  actionType,
  description,
  priority,
});

/**
 * Builds fallback actions when LLM-generated actions are insufficient.
 * Uses evidence highlights to generate failure-specific recommendations.
 * Each action type is unique to prevent over-aggressive deduplication.
 *
 * @param highlights - Extracted evidence highlights from analysis
 * @returns Array of recommended actions (max 5)
 */
export const buildFallbackActions = (highlights: EvidenceHighlights): LLMRecommendedAction[] => {
  // Prefer error snippet over generic error line
  const errorDetail = highlights.primaryErrorSnippet
    ? truncateText(highlights.primaryErrorSnippet, 100)
    : highlights.primaryErrorLine
      ? truncateText(highlights.primaryErrorLine, 100)
      : "";

  const primaryAction = errorDetail
    ? createAction(
        appendEvidenceId(
          highlights.primaryTestName
            ? `Fix assertion failure in "${truncateText(highlights.primaryTestName, 50)}": ${errorDetail}`
            : `Review the error: ${errorDetail}`,
          highlights.primaryEvidenceId
        ),
        "high",
        `fix_primary_${highlights.primaryFile ?? "test"}`
      )
    : null;

  // Build actions for secondary test failures with unique action types
  const secondaryActions = (highlights.secondaryTestFailures ?? [])
    .slice(0, 3)
    .map((failure, index) =>
      createAction(
        appendEvidenceId(
          `Review test failure in ${truncateText(failure.testName, 40)}: ${truncateText(failure.errorSnippet, 80)}`,
          failure.evidenceId
        ),
        "medium",
        `review_secondary_${index}_${failure.file ?? "test"}`
      )
    );

  const locationAction = highlights.primaryFile
    ? createAction(
        appendEvidenceId(
          `Inspect ${buildAnnotationLocation(highlights)} referenced by the failure output.`,
          highlights.primaryEvidenceId
        ),
        "medium",
        `inspect_location_${highlights.primaryFile}`
      )
    : null;

  const signalAction = SIGNAL_ACTION_RULES.find((rule) =>
    rule.pattern.test(highlights.evidenceText.toLowerCase())
  );
  const signalActions = signalAction
    ? [createAction(signalAction.description, "medium", "fix_signal_issue")]
    : [];

  const dependencyAction =
    highlights.dependencyNames.length > 0
      ? createAction(
          appendEvidenceId(
            `Review dependency changes for ${highlights.dependencyNames.slice(0, 3).join(", ")}.`,
            formatEvidenceId("dep", highlights.dependencyChanges[0]?.id)
          ),
          "medium",
          "review_dependencies"
        )
      : null;

  const configAction =
    highlights.configFiles.length > 0
      ? createAction(
          appendEvidenceId(
            `Review build/config changes in ${highlights.configFiles.slice(0, 2).join(", ")}.`,
            formatEvidenceId("cfg", highlights.buildConfigChanges[0]?.id)
          ),
          "medium",
          "review_config"
        )
      : null;

  return [
    primaryAction,
    ...secondaryActions,
    locationAction,
    ...signalActions,
    dependencyAction,
    configAction,
  ]
    .filter((action): action is LLMRecommendedAction => action !== null)
    .slice(0, 5);
};

export const buildSummaryFromCause = (cause: string): string => {
  const match = cause.match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0] : cause;
};

export const buildReasoningFromCause = (
  cause: string,
  category?: FailureCategory,
  phase?: PipelinePhase
): string => `[${category ?? "unknown"}/${phase ?? "unknown"}] ${cause}`;

export const mergeUncertainties = (
  existing: readonly string[] | undefined,
  additions: readonly string[]
): string[] => {
  const combined = [...(existing ?? []), ...additions];
  return Array.from(new Set(combined));
};

export const downgradeConfidence = (
  confidence: LLMAnalysisResult["confidence"] | undefined
): LLMAnalysisResult["confidence"] => {
  if (confidence === "very_low") {
    return "very_low";
  }
  return "low";
};
