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
 */

import type {
  Event,
  Evidence,
  LLMAnalysisResult,
  ValidationResult,
  EvidenceReference,
} from '../types.js';

/**
 * Validates LLM response against anti-hallucination checks.
 */
export const validateResponse = (
  response: LLMAnalysisResult,
  providedContext: { event: Event; evidence: Evidence }
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Pre-compute lookup structures for O(1) access
  const providedCommitsSet = buildCommitPrefixSet(
    providedContext.evidence.gitHistory
  );
  const providedIncidentsSet = new Set(
    providedContext.evidence.relatedDocs?.map((d) => d.id) || []
  );
  const providedLogsLower = buildLogLookupMap(
    providedContext.evidence.logs
  );

  // 1. Check for dangerous keywords in recommendations (optimized with regex)
  validateDangerousKeywords(response.recommendedActions, errors);

  // 2. Validate evidence references (pass log map for optimization)
  if (response.evidenceUsed) {
    for (const evidence of response.evidenceUsed) {
      const isValid = validateEvidenceReference(
        evidence,
        providedContext,
        providedCommitsSet,
        providedIncidentsSet,
        providedLogsLower
      );
      if (!isValid) {
        warnings.push(
          `LLM cited evidence that was not provided: ${evidence.reference}`
        );
      }
    }
  }

  // 3. Check for cited commit SHAs that don't exist (optimized with Set)
  if (response.reasoning || response.identifiedCause) {
    const text = `${response.reasoning} ${response.identifiedCause}`;
    const citedCommits = extractCommitSHAs(text);

    for (const cited of citedCommits) {
      if (!isCommitValid(cited, providedCommitsSet)) {
        errors.push(`LLM cited non-existent commit: ${cited}`);
      }
    }
  }

  // 4. Check for cited incident IDs that weren't provided (optimized with Set)
  if (response.relatedIncidents) {
    for (const cited of response.relatedIncidents) {
      if (!providedIncidentsSet.has(cited)) {
        errors.push(`LLM cited non-existent incident: ${cited}`);
      }
    }
  }

  // 5. Check for invented log messages (optimized with pre-computed lookup)
  if (response.identifiedCause || response.reasoning) {
    const analysisText = `${response.identifiedCause} ${response.reasoning}`;
    const quotedMessages = extractQuotedText(analysisText);

    for (const quoted of quotedMessages) {
      if (quoted.length > 10 && !isQuotedTextValid(quoted, providedLogsLower)) {
        warnings.push(`LLM may have invented quoted text: "${quoted}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validates a single evidence reference against provided context.
 * Optimized with pre-computed lookup structures.
 */
const validateEvidenceReference = (
  evidence: EvidenceReference,
  context: { event: Event; evidence: Evidence },
  providedCommitsSet: Set<string>,
  providedIncidentsSet: Set<string>,
  providedLogsMap?: Map<string, string>
): boolean => {
  switch (evidence.type) {
    case 'log': {
      if (!providedLogsMap) {
        // Fallback if log map not provided
        const logPrefix = evidence.reference.substring(0, 30).toLowerCase();
        return (
          context.evidence.logs?.some((log) =>
            log.message.toLowerCase().startsWith(logPrefix)
          ) || false
        );
      }
      
      // Use pre-computed log map for O(1) lookup
      const logPrefix = evidence.reference.substring(0, 50).toLowerCase();
      return providedLogsMap.has(logPrefix) ||
        Array.from(providedLogsMap.values()).some((log) =>
          log.startsWith(logPrefix) || logPrefix.startsWith(log.substring(0, 30))
        );
    }

    case 'commit': {
      const sha = extractSHA(evidence.reference);
      return isCommitValid(sha, providedCommitsSet);
    }

    case 'related_incident': {
      // Check Set first (O(1)), then fallback to includes check
      if (providedIncidentsSet.has(evidence.reference)) {
        return true;
      }
      // Only check includes if Set lookup failed
      return context.evidence.relatedDocs?.some((d) =>
        evidence.reference.includes(d.id)
      ) || false;
    }

    case 'metric':
      return context.evidence.metrics !== undefined;

    case 'document': {
      // Could be optimized further with a pre-computed title map if needed
      return (
        context.evidence.relatedDocs?.some((d) =>
          evidence.reference.includes(d.title)
        ) || false
      );
    }

    default:
      return true;
  }
};

/**
 * Extracts commit SHAs from text (matches 6-40 char hex strings).
 */
const extractCommitSHAs = (text: string): string[] => {
  const shaPattern = /\b[0-9a-f]{6,40}\b/gi;
  return text.match(shaPattern) || [];
};

/**
 * Extracts quoted text from analysis.
 */
const extractQuotedText = (text: string): string[] => {
  const quoted: string[] = [];

  // Match text in double quotes
  const doubleQuoted = text.match(/"([^"]+)"/g);
  if (doubleQuoted) {
    quoted.push(...doubleQuoted.map((q) => q.slice(1, -1)));
  }

  // Match text in single quotes
  const singleQuoted = text.match(/'([^']+)'/g);
  if (singleQuoted) {
    quoted.push(...singleQuoted.map((q) => q.slice(1, -1)));
  }

  return quoted;
};

// Constants for dangerous keyword validation (compiled once)
const DANGEROUS_KEYWORDS = [
  'delete',
  'drop',
  'truncate',
  'force',
  'disable',
  'remove all',
  'destroy',
  '--force',
  'rm -rf',
] as const;

// Memoized regex pattern for dangerous keywords
const DANGEROUS_KEYWORDS_PATTERN = ((): RegExp => {
  const escapedKeywords = DANGEROUS_KEYWORDS.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(
    `\\b(${escapedKeywords.join('|')})\\b`,
    'i'
  );
})();

/**
 * Validates dangerous keywords in recommended actions using compiled regex pattern.
 * Optimized: O(n) instead of O(n*m) with single-pass regex matching.
 * Uses memoized regex pattern compiled once at module level.
 */
const validateDangerousKeywords = (
  actions: LLMAnalysisResult['recommendedActions'],
  errors: string[]
): void => {
  if (!actions || actions.length === 0) {
    return;
  }

  // Use pre-compiled regex pattern (memoized at module level)
  // Single pass through actions
  for (const action of actions) {
    const match = action.description.match(DANGEROUS_KEYWORDS_PATTERN);
    if (match) {
      errors.push(
        `Action contains dangerous keyword "${match[1]}": ${action.description}`
      );
    }
  }
};

/**
 * Builds a Set of commit SHA prefixes for O(1) lookup.
 * Handles both full SHAs and short prefixes (6-40 chars).
 */
const buildCommitPrefixSet = (
  gitHistory: Evidence['gitHistory']
): Set<string> => {
  const commitSet = new Set<string>();
  if (!gitHistory) {
    return commitSet;
  }

  for (const commit of gitHistory) {
    const sha = commit.sha.toLowerCase();
    // Add full SHA
    commitSet.add(sha);
    // Add common prefix lengths for partial matches
    for (let len = 6; len <= Math.min(sha.length, 12); len++) {
      commitSet.add(sha.substring(0, len));
    }
  }

  return commitSet;
};

/**
 * Checks if a commit SHA (or prefix) exists in the provided commits.
 * Optimized: Uses Set lookup with prefix checking only when needed.
 */
const isCommitValid = (citedSha: string, providedCommitsSet: Set<string>): boolean => {
  const normalized = citedSha.toLowerCase();
  
  // Check exact match first (O(1))
  if (providedCommitsSet.has(normalized)) {
    return true;
  }
  
  // Check if any provided commit starts with the cited SHA (for partial matches)
  // Only iterate if exact match failed
  for (const provided of providedCommitsSet) {
    if (provided.startsWith(normalized) || normalized.startsWith(provided)) {
      return true;
    }
  }
  
  return false;
};

/**
 * Builds a lookup map of log messages (lowercased) for efficient matching.
 * Returns a Map with normalized keys for O(1) lookups.
 * Keys are prefixes (first 50 chars), values are full normalized messages.
 */
const buildLogLookupMap = (logs: Evidence['logs']): Map<string, string> => {
  const logMap = new Map<string, string>();
  if (!logs) {
    return logMap;
  }

  for (const log of logs) {
    const normalized = log.message.toLowerCase();
    // Store first 50 chars as key for prefix matching
    const key = normalized.substring(0, 50);
    if (!logMap.has(key)) {
      logMap.set(key, normalized);
    }
  }

  return logMap;
};

/**
 * Checks if quoted text matches any provided log message.
 * Optimized with pre-computed lookup map and early exit.
 */
const isQuotedTextValid = (
  quoted: string,
  providedLogsMap: Map<string, string>
): boolean => {
  if (providedLogsMap.size === 0) {
    return false;
  }

  const quotedLower = quoted.toLowerCase();
  const quotedPrefix = quotedLower.substring(0, 50);

  // Check exact prefix match (O(1))
  const matchedLog = providedLogsMap.get(quotedPrefix);
  if (matchedLog) {
    // Verify it's actually a match (prefix might be same but full message different)
    if (matchedLog.includes(quotedLower) || quotedLower.includes(matchedLog.substring(0, 30))) {
      return true;
    }
  }

  // Check if any log contains the quoted text or vice versa
  // Early exit on first match
  for (const logMessage of providedLogsMap.values()) {
    if (
      logMessage.includes(quotedLower) ||
      quotedLower.includes(logMessage.substring(0, 30))
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Extracts SHA from evidence reference string.
 */
const extractSHA = (reference: string): string => {
  const shaMatch = reference.match(/\b[0-9a-f]{6,40}\b/i);
  return shaMatch ? shaMatch[0] : '';
};

