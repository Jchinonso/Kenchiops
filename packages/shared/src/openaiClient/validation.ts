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
  const errors: string[] = [];
  const warnings: string[] = [];

  // Pre-compute all lookup structures once
  const lookups = buildLookups(providedContext.evidence);

  // 1. Check for dangerous keywords in recommendations
  validateDangerousKeywords(response.recommendedActions, errors);

  // 2. Validate evidence references
  validateEvidenceReferences(response.evidenceUsed, providedContext, lookups, warnings);

  // 3. Validate cited incidents (simple Set lookup)
  validateCitedIncidents(response.relatedIncidents, lookups.incidents, errors);

  // 4. Single-pass text analysis for commits and quoted text
  const analysisText = buildAnalysisText(response.reasoning, response.identifiedCause);
  analysisText &&
    (validateCitedCommits(analysisText, lookups.commits, errors),
    validateQuotedText(analysisText, lookups, warnings));

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
 * Validates all evidence references.
 */
const validateEvidenceReferences = (
  evidenceUsed: LLMAnalysisResult["evidenceUsed"],
  context: { event: Event; evidence: Evidence },
  lookups: ValidationLookups,
  warnings: string[]
): void => {
  evidenceUsed?.forEach((evidence) => {
    !isEvidenceValid(evidence, context, lookups) &&
      warnings.push(`LLM cited evidence that was not provided: ${evidence.reference}`);
  });
};

/**
 * Validates cited incidents against known incidents.
 */
const validateCitedIncidents = (
  relatedIncidents: string[] | undefined,
  incidentsSet: Set<string>,
  errors: string[]
): void => {
  relatedIncidents?.forEach((cited) => {
    !incidentsSet.has(cited) && errors.push(`LLM cited non-existent incident: ${cited}`);
  });
};

/**
 * Validates cited commits in analysis text.
 */
const validateCitedCommits = (text: string, commitsSet: Set<string>, errors: string[]): void => {
  extractCommitSHAs(text).forEach((cited) => {
    !isCommitValid(cited, commitsSet) && errors.push(`LLM cited non-existent commit: ${cited}`);
  });
};

/**
 * Validates quoted text in analysis.
 */
const validateQuotedText = (text: string, lookups: ValidationLookups, warnings: string[]): void => {
  const minLength = MATCHING_CONFIG.QUOTED_TEXT_MIN_LENGTH;
  extractQuotedText(text).forEach((quoted) => {
    quoted.length > minLength &&
      !isQuotedTextValid(quoted, lookups.logValues) &&
      warnings.push(`LLM may have invented quoted text: "${quoted}"`);
  });
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
 * Validates dangerous keywords in recommended actions.
 * Uses pre-compiled regex pattern for O(n) matching.
 */
const validateDangerousKeywords = (
  actions: LLMAnalysisResult["recommendedActions"],
  errors: string[]
): void => {
  actions?.forEach((action) => {
    const match = action.description.match(DANGEROUS_KEYWORDS_PATTERN);
    match && errors.push(`Action contains dangerous keyword "${match[1]}": ${action.description}`);
  });
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
 * Builds a Set of commit SHA prefixes for O(1) lookup.
 * Handles both full SHAs and short prefixes.
 */
const buildCommitPrefixSet = (gitHistory: Evidence["gitHistory"]): Set<string> => {
  const commitSet = new Set<string>();
  if (!gitHistory?.length) {
    return commitSet;
  }

  const { SHA_PREFIX_MIN_LENGTH, SHA_PREFIX_MAX_LENGTH } = MATCHING_CONFIG;

  gitHistory.forEach((commit) => {
    const sha = commit.sha.toLowerCase();
    commitSet.add(sha);
    generatePrefixLengths(sha.length, SHA_PREFIX_MIN_LENGTH, SHA_PREFIX_MAX_LENGTH).forEach(
      (len) => {
        commitSet.add(sha.substring(0, len));
      }
    );
  });

  return commitSet;
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
  const logMap = new Map<string, string>();
  if (!logs?.length) {
    return logMap;
  }

  const prefixLength = MATCHING_CONFIG.LOG_PREFIX_LENGTH;
  logs.forEach((log) => {
    const normalized = log.message.toLowerCase();
    const key = normalized.substring(0, prefixLength);
    !logMap.has(key) && logMap.set(key, normalized);
  });

  return logMap;
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
