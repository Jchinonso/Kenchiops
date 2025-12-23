/**
 * OpenAI Response Validation Module
 *
 * Handles all validation logic for LLM responses, including:
 * - Anti-hallucination checks
 * - Evidence reference validation
 * - Dangerous keyword detection
 * - Commit SHA validation
 * - Log message validation
 *
 * IMPORTANT: This module treats LLM outputs as untrusted and validates
 * all references against provided evidence.
 *
 * @module openaiClient/validation
 */

import type {
  Event,
  Evidence,
  LLMAnalysisResult,
  ValidationResult,
  EvidenceReference,
} from "../types.js";
import {
  DANGEROUS_KEYWORDS_PATTERN,
  MATCHING_CONFIG,
  SHA_PATTERN,
  SHA_PATTERN_SINGLE,
  QUOTED_TEXT_PATTERN,
} from "../constants.js";

/**
 * Pre-computed lookup structures for validation.
 */
interface ValidationLookups {
  readonly commits: Set<string>;
  readonly incidents: Set<string>;
  readonly documentTitles: Set<string>;
  readonly logs: Map<string, string>;
  readonly logValues: string[];
}

/**
 * Builds all lookup structures in a single pass.
 */
const buildLookups = (evidence: Evidence): ValidationLookups => {
  const relatedDocs = evidence.relatedDocs || [];

  return {
    commits: buildCommitPrefixSet(evidence.gitHistory),
    incidents: new Set(relatedDocs.map((d) => d.id)),
    documentTitles: new Set(relatedDocs.map((d) => d.title.toLowerCase())),
    logs: buildLogLookupMap(evidence.logs),
    logValues: evidence.logs?.map((l) => l.message.toLowerCase()) || [],
  };
};

/**
 * Validates LLM response against anti-hallucination checks.
 * Optimized with pre-computed lookups and single-pass text analysis.
 */
export const validateResponse = (
  response: LLMAnalysisResult,
  providedContext: { event: Event; evidence: Evidence }
): ValidationResult => {
  // Pre-compute all lookup structures once
  const lookups = buildLookups(providedContext.evidence);
  const analysisText = buildAnalysisText(response.reasoning, response.identifiedCause);

  // Collect all errors using functional composition
  const errors = [
    ...getDangerousKeywordErrors(response.recommendedActions),
    ...getCitedIncidentErrors(response.relatedIncidents, lookups.incidents),
    ...(analysisText ? getCitedCommitErrors(analysisText, lookups.commits) : []),
  ];

  // Collect all warnings using functional composition
  const warnings = [
    ...getEvidenceReferenceWarnings(response.evidenceUsed, providedContext, lookups),
    ...(analysisText ? getQuotedTextWarnings(analysisText, lookups) : []),
  ];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Builds analysis text once for reuse.
 */
const buildAnalysisText = (reasoning?: string, identifiedCause?: string): string => {
  return reasoning || identifiedCause ? `${reasoning ?? ""} ${identifiedCause ?? ""}`.trim() : "";
};

/**
 * Validates all evidence references and returns invalid reference warnings.
 */
const getEvidenceReferenceWarnings = (
  evidenceUsed: LLMAnalysisResult["evidenceUsed"],
  context: { event: Event; evidence: Evidence },
  lookups: ValidationLookups
): string[] => {
  return (evidenceUsed ?? [])
    .filter((evidence) => !isEvidenceValid(evidence, context, lookups))
    .map((evidence) => `LLM cited evidence that was not provided: ${evidence.reference}`);
};

/**
 * Gets errors for cited incidents not found in known incidents.
 */
const getCitedIncidentErrors = (
  relatedIncidents: string[] | undefined,
  incidentsSet: Set<string>
): string[] => {
  return (relatedIncidents ?? [])
    .filter((cited) => !incidentsSet.has(cited))
    .map((cited) => `LLM cited non-existent incident: ${cited}`);
};

/**
 * Gets errors for cited commits not found in known commits.
 */
const getCitedCommitErrors = (text: string, commitsSet: Set<string>): string[] => {
  return extractCommitSHAs(text)
    .filter((cited) => !isCommitValid(cited, commitsSet))
    .map((cited) => `LLM cited non-existent commit: ${cited}`);
};

/**
 * Gets warnings for quoted text not found in logs.
 */
const getQuotedTextWarnings = (text: string, lookups: ValidationLookups): string[] => {
  const minLength = MATCHING_CONFIG.QUOTED_TEXT_MIN_LENGTH;
  return extractQuotedText(text)
    .filter((quoted) => quoted.length > minLength && !isQuotedTextValid(quoted, lookups.logValues))
    .map((quoted) => `LLM may have invented quoted text: "${quoted}"`);
};

/**
 * Evidence type validators - dispatch table for O(1) type lookup.
 */
type EvidenceValidator = (
  ref: string,
  context: { event: Event; evidence: Evidence },
  lookups: ValidationLookups
) => boolean;

const EVIDENCE_VALIDATORS: Readonly<Record<string, EvidenceValidator>> = {
  log: (ref, _context, lookups) => {
    const refLower = ref.toLowerCase();
    const prefix = refLower.substring(0, MATCHING_CONFIG.LOG_PREFIX_LENGTH);

    // O(1) prefix lookup
    if (lookups.logs.has(prefix)) return true;

    // Check if any log contains the reference
    return lookups.logValues.some(
      (log) =>
        log.includes(refLower) ||
        refLower.includes(log.substring(0, MATCHING_CONFIG.LOG_COMPARISON_PREFIX_LENGTH))
    );
  },

  commit: (ref, _context, lookups) => {
    const sha = extractSHA(ref);
    return sha ? isCommitValid(sha, lookups.commits) : false;
  },

  related_incident: (ref, context, lookups) => {
    // O(1) Set lookup first
    if (lookups.incidents.has(ref)) return true;
    // Fallback: check if reference contains any incident ID
    return context.evidence.relatedDocs?.some((d) => ref.includes(d.id)) ?? false;
  },

  metric: (_ref, context) => context.evidence.metrics !== undefined,

  document: (ref, _context, lookups) => {
    const refLower = ref.toLowerCase();
    // O(1) Set lookup using pre-computed titles
    return Array.from(lookups.documentTitles).some((title) => refLower.includes(title));
  },
};

/**
 * Validates a single evidence reference using dispatch table.
 */
const isEvidenceValid = (
  evidence: EvidenceReference,
  context: { event: Event; evidence: Evidence },
  lookups: ValidationLookups
): boolean => {
  const validator = EVIDENCE_VALIDATORS[evidence.type];
  return validator ? validator(evidence.reference, context, lookups) : true;
};

/**
 * Extracts commit SHAs from text (matches 6-40 char hex strings).
 * Uses pre-compiled pattern from constants.
 */
const extractCommitSHAs = (text: string): string[] => {
  // Reset lastIndex for global regex reuse
  SHA_PATTERN.lastIndex = 0;
  return text.match(SHA_PATTERN) || [];
};

/**
 * Extracts quoted text from analysis.
 * Uses pre-compiled combined pattern for single and double quotes.
 */
const extractQuotedText = (text: string): string[] => {
  const quoted: string[] = [];
  // Reset lastIndex for global regex reuse
  QUOTED_TEXT_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = QUOTED_TEXT_PATTERN.exec(text)) !== null) {
    quoted.push(match[1]);
  }

  return quoted;
};

/**
 * Gets errors for actions containing dangerous keywords.
 * Uses pre-compiled regex pattern for O(n) matching.
 */
const getDangerousKeywordErrors = (
  actions: LLMAnalysisResult["recommendedActions"]
): string[] => {
  return (actions ?? [])
    .map((action) => {
      const match = action.description.match(DANGEROUS_KEYWORDS_PATTERN);
      return match ? `Action contains dangerous keyword "${match[1]}": ${action.description}` : null;
    })
    .filter((error): error is string => error !== null);
};

/**
 * Generates all prefix lengths for a SHA.
 */
const generatePrefixLengths = (
  shaLength: number,
  minLength: number,
  maxLength: number
): readonly number[] => {
  const maxLen = Math.min(shaLength, maxLength);
  return Array.from({ length: maxLen - minLength + 1 }, (_, i) => minLength + i);
};

/**
 * Generates all prefixes for a single SHA.
 */
const generateSHAPrefixes = (sha: string, minLength: number, maxLength: number): string[] => {
  const lowerSha = sha.toLowerCase();
  const prefixes = generatePrefixLengths(lowerSha.length, minLength, maxLength)
    .map((len) => lowerSha.substring(0, len));
  return [lowerSha, ...prefixes];
};

/**
 * Builds a Set of commit SHA prefixes for O(1) lookup.
 * Handles both full SHAs and short prefixes.
 */
const buildCommitPrefixSet = (gitHistory: Evidence["gitHistory"]): Set<string> => {
  if (!gitHistory?.length) {
    return new Set<string>();
  }

  const { SHA_PREFIX_MIN_LENGTH, SHA_PREFIX_MAX_LENGTH } = MATCHING_CONFIG;

  const allPrefixes = gitHistory.flatMap((commit) =>
    generateSHAPrefixes(commit.sha, SHA_PREFIX_MIN_LENGTH, SHA_PREFIX_MAX_LENGTH)
  );

  return new Set(allPrefixes);
};

/**
 * Checks if a commit SHA (or prefix) exists in the provided commits.
 * Optimized: O(1) lookups using prefix lengths already in Set.
 */
const isCommitValid = (citedSha: string, providedCommitsSet: Set<string>): boolean => {
  if (providedCommitsSet.size === 0) {
    return false;
  }

  const normalized = citedSha.toLowerCase();
  const { SHA_PREFIX_MIN_LENGTH, SHA_PREFIX_MAX_LENGTH } = MATCHING_CONFIG;

  // Check exact match first (O(1))
  if (providedCommitsSet.has(normalized)) {
    return true;
  }

  // Check prefix lengths that are stored in Set (O(1) per check)
  const maxCheck = Math.min(normalized.length, SHA_PREFIX_MAX_LENGTH);
  return generatePrefixLengths(normalized.length, SHA_PREFIX_MIN_LENGTH, maxCheck).some((len) =>
    providedCommitsSet.has(normalized.substring(0, len))
  );
};

/**
 * Builds a lookup map of log messages (lowercased) for efficient matching.
 * Returns a Map with normalized keys for O(1) lookups.
 * Keys are prefixes, values are full normalized messages.
 */
const buildLogLookupMap = (logs: Evidence["logs"]): Map<string, string> => {
  if (!logs?.length) {
    return new Map<string, string>();
  }

  const prefixLength = MATCHING_CONFIG.LOG_PREFIX_LENGTH;

  // Use reduce to build map, keeping first occurrence for each prefix
  return logs.reduce((map, log) => {
    const normalized = log.message.toLowerCase();
    const key = normalized.substring(0, prefixLength);
    return map.has(key) ? map : map.set(key, normalized);
  }, new Map<string, string>());
};

/**
 * Checks if quoted text matches any provided log message.
 * Uses pre-computed lowercased log array for efficient matching.
 */
const isQuotedTextValid = (quoted: string, logValues: string[]): boolean => {
  return (
    logValues.length > 0 &&
    logValues.some((log) => {
      const quotedLower = quoted.toLowerCase();
      const comparisonLen = MATCHING_CONFIG.LOG_COMPARISON_PREFIX_LENGTH;
      return log.includes(quotedLower) || quotedLower.includes(log.substring(0, comparisonLen));
    })
  );
};

/**
 * Extracts SHA from evidence reference string.
 * Uses pre-compiled pattern from constants.
 */
const extractSHA = (reference: string): string => {
  const shaMatch = reference.match(SHA_PATTERN_SINGLE);
  return shaMatch ? shaMatch[0] : "";
};
