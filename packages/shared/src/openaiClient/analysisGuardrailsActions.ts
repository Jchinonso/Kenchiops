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

const GENERIC_CAUSE_PATTERNS: readonly RegExp[] = [
  /\btest execution failed\b/i,
  /\btests? (failed|failing)\b/i,
  /\bassertion errors?\b/i,
  /\bunmet expectations?\b/i,
  /\bci (build|check|pipeline) failed\b/i,
  /\bmultiple test cases\b/i,
  /\bbuild failed\b/i,
  /\bworkflow failed\b/i,
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

const SECTION_ACTION_MATCHERS: readonly SectionActionMatcher[] = [
  { key: "hasTests", pattern: /test|spec|assert/i },
  { key: "hasAnnotations", pattern: /annotation|stack trace|line/i },
  { key: "hasCheckOutput", pattern: /check|ci/i },
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

const appendEvidenceId = (text: string, evidenceId?: string): string =>
  evidenceId ? `${text} (evidence: ${evidenceId})` : text;

const extractEvidenceIdentifiers = (text: string): string[] => {
  const rawIdentifiers = [
    ...(text.match(CAMEL_CASE_IDENTIFIER) ?? []),
    ...(text.match(SNAKE_CASE_IDENTIFIER) ?? []),
    ...(text.match(KEBAB_CASE_IDENTIFIER) ?? []),
    ...(text.match(FILE_PATH_IDENTIFIER) ?? []),
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
  const identifiers = extractEvidenceIdentifiers(action.description);
  if (identifiers.length > 0) {
    return identifiers.every((identifier) => evidenceText.includes(identifier.toLowerCase()));
  }

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
    const testName = truncateText(highlights.primaryTestName ?? "failing test", 80);
    const fileTag = highlights.primaryFile ? ` (${highlights.primaryFile})` : "";
    return appendEvidenceId(
      `Test failure in ${testName}${fileTag}: ${errorLine}`,
      highlights.primaryEvidenceId
    );
  },
  annotation: (highlights, errorLine) =>
    appendEvidenceId(
      `CI annotation at ${buildAnnotationLocation(highlights)}: ${errorLine}`,
      highlights.primaryEvidenceId
    ),
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

const createAction = (description: string, priority: "high" | "medium"): LLMRecommendedAction => ({
  actionType: "manual_investigation",
  description,
  priority,
});

export const buildFallbackActions = (highlights: EvidenceHighlights): LLMRecommendedAction[] => {
  const errorLine = highlights.primaryErrorLine
    ? truncateText(highlights.primaryErrorLine, 140)
    : "";
  const primaryAction = errorLine
    ? createAction(
        appendEvidenceId(
          highlights.primaryTestName
            ? `Review the failing test output for "${truncateText(
                highlights.primaryTestName,
                60
              )}" and start with: ${errorLine}`
            : `Review the first error line in the logs: ${errorLine}`,
          highlights.primaryEvidenceId
        ),
        "high"
      )
    : null;

  const locationAction = highlights.primaryFile
    ? createAction(
        appendEvidenceId(
          `Inspect ${buildAnnotationLocation(highlights)} referenced by the failure output.`,
          highlights.primaryEvidenceId
        ),
        "medium"
      )
    : null;

  const signalAction = SIGNAL_ACTION_RULES.find((rule) =>
    rule.pattern.test(highlights.evidenceText.toLowerCase())
  );
  const signalActions = signalAction ? [createAction(signalAction.description, "medium")] : [];

  const dependencyAction =
    highlights.dependencyNames.length > 0
      ? createAction(
          appendEvidenceId(
            `Review dependency changes for ${highlights.dependencyNames.slice(0, 3).join(", ")}.`,
            formatEvidenceId("dep", highlights.dependencyChanges[0]?.id)
          ),
          "medium"
        )
      : null;

  const configAction =
    highlights.configFiles.length > 0
      ? createAction(
          appendEvidenceId(
            `Review build/config changes in ${highlights.configFiles.slice(0, 2).join(", ")}.`,
            formatEvidenceId("cfg", highlights.buildConfigChanges[0]?.id)
          ),
          "medium"
        )
      : null;

  return [primaryAction, locationAction, ...signalActions, dependencyAction, configAction]
    .filter((action): action is LLMRecommendedAction => action !== null)
    .slice(0, 3);
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
