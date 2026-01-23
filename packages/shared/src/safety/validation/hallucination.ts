/**
 * Hallucination Detection Module
 *
 * Detects fabricated or unsupported claims in LLM outputs by checking
 * against provided evidence and known patterns of hallucination.
 *
 * @module safety/validation/hallucination
 */

import type {
  HallucinationCheckResult,
  HallucinationIndicator,
  HallucinationIndicatorType,
} from "../types.js";

// ==================== Constants ====================

/**
 * Default threshold for marking content as likely hallucinated.
 */
const DEFAULT_HALLUCINATION_THRESHOLD = 0.6;

/**
 * Patterns that indicate potential hallucinations.
 */
const HALLUCINATION_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly type: HallucinationIndicatorType;
  readonly weight: number;
}> = [
  // Fabricated statistics with suspiciously precise numbers
  {
    pattern: /\b(?:exactly|precisely)\s+\d+(?:\.\d+)?%/gi,
    type: "overly_precise",
    weight: 0.3,
  },
  {
    pattern: /\b\d+\.\d{3,}%/g,
    type: "overly_precise",
    weight: 0.25,
  },

  // Specific claims without attribution
  {
    pattern: /(?:studies?\s+(?:show|prove|confirm)|research\s+(?:indicates|suggests))\s+that/gi,
    type: "specific_claim_without_source",
    weight: 0.2,
  },
  {
    pattern: /according\s+to\s+(?:experts?|scientists?|researchers?)\b/gi,
    type: "specific_claim_without_source",
    weight: 0.15,
  },

  // Invented quotes
  {
    pattern: /(?:said|stated|wrote|noted)\s*[,:]?\s*[""][^""]{50,}[""]/gi,
    type: "invented_quote",
    weight: 0.35,
  },

  // Confident statements about uncertain topics
  {
    pattern: /\b(?:definitely|certainly|absolutely|undoubtedly)\s+(?:will|would|is|are)\b/gi,
    type: "confident_uncertainty",
    weight: 0.2,
  },

  // Nonexistent references (common fabrication patterns)
  {
    pattern:
      /(?:published\s+in|appeared\s+in)\s+(?:the\s+)?[A-Z][a-z]+\s+(?:Journal|Review|Quarterly)/gi,
    type: "nonexistent_reference",
    weight: 0.25,
  },

  // Temporal impossibilities (future events stated as past)
  {
    pattern: /in\s+20(?:2[5-9]|[3-9]\d)\s+(?:it\s+)?(?:was|had|became)/gi,
    type: "temporal_impossibility",
    weight: 0.4,
  },
] as const;

/**
 * Weight factors for risk score calculation.
 */
const RISK_WEIGHTS = {
  /** Weight for pattern-based indicators */
  PATTERN_INDICATORS: 0.4,
  /** Weight for unverified claims */
  UNVERIFIED_CLAIMS: 0.35,
  /** Weight for text characteristics */
  TEXT_CHARACTERISTICS: 0.25,
} as const;

// ==================== Core Functions ====================

/**
 * Detects hallucination indicators in text using pattern matching.
 *
 * @param text - Text to analyze
 * @returns Array of detected indicators
 */
const detectPatternIndicators = (text: string): HallucinationIndicator[] => {
  const indicators: HallucinationIndicator[] = [];

  for (const { pattern, type, weight } of HALLUCINATION_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    const matches = text.match(pattern);

    if (matches) {
      for (const match of matches) {
        indicators.push({
          type,
          matchedText: match.slice(0, 100), // Truncate long matches
          weight,
        });
      }
    }
  }

  return indicators;
};

/**
 * Extracts claims from text that should be verified against evidence.
 *
 * @param text - Text to extract claims from
 * @returns Array of claim strings
 */
const extractClaims = (text: string): string[] => {
  const claims: string[] = [];

  // Extract sentences that make factual claims
  const claimPatterns = [
    /[^.!?]*\b(?:is|are|was|were|has|have|had)\s+(?:a|an|the)?\s*[^.!?]+[.!?]/gi,
    /[^.!?]*\b(?:shows?|proves?|indicates?|suggests?|demonstrates?)\s+[^.!?]+[.!?]/gi,
    /[^.!?]*\b(?:caused?|results?\s+in|leads?\s+to)\s+[^.!?]+[.!?]/gi,
  ];

  for (const pattern of claimPatterns) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const trimmed = match.trim();
        if (trimmed.length > 20 && trimmed.length < 500) {
          claims.push(trimmed);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(claims)];
};

/**
 * Checks if a claim is supported by provided evidence.
 *
 * @param claim - Claim to verify
 * @param evidence - Evidence strings to check against
 * @returns True if claim appears supported
 */
const isClaimSupported = (claim: string, evidence: readonly string[]): boolean => {
  if (evidence.length === 0) {
    return false;
  }

  const claimWords = claim
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4);

  // Check if significant words from claim appear in evidence
  const significantWordThreshold = Math.min(3, Math.ceil(claimWords.length * 0.3));

  for (const evidenceItem of evidence) {
    const evidenceLower = evidenceItem.toLowerCase();
    let matchedWords = 0;

    for (const word of claimWords) {
      if (evidenceLower.includes(word)) {
        matchedWords++;
        if (matchedWords >= significantWordThreshold) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Calculates text characteristic score for hallucination risk.
 *
 * @param text - Text to analyze
 * @returns Score between 0-1
 */
const calculateTextCharacteristicScore = (text: string): number => {
  let score = 0;

  // Very long text without breaks is suspicious
  const avgSentenceLength = text.length / (text.split(/[.!?]/).length || 1);
  if (avgSentenceLength > 150) {
    score += 0.1;
  }

  // High density of numbers can indicate fabrication
  const numberDensity = (text.match(/\d+/g)?.length ?? 0) / (text.length / 100);
  if (numberDensity > 2) {
    score += 0.15;
  }

  // Multiple specific dates/years
  const dateMatches = text.match(/\b(?:19|20)\d{2}\b/g);
  if (dateMatches && dateMatches.length > 3) {
    score += 0.1;
  }

  return Math.min(1, score);
};

/**
 * Determines detection confidence based on analysis quality.
 *
 * @param indicatorCount - Number of indicators found
 * @param evidenceProvided - Whether evidence was provided
 * @param textLength - Length of analyzed text
 * @returns Confidence level
 */
const determineConfidence = (
  indicatorCount: number,
  evidenceProvided: boolean,
  textLength: number
): "high" | "medium" | "low" => {
  // Short text is harder to analyze reliably
  if (textLength < 100) {
    return "low";
  }

  // Multiple indicators and evidence = high confidence
  if (indicatorCount >= 2 && evidenceProvided) {
    return "high";
  }

  // Some indicators or evidence = medium
  if (indicatorCount >= 1 || evidenceProvided) {
    return "medium";
  }

  return "low";
};

// ==================== Exports ====================

/**
 * Checks text for potential hallucinations.
 *
 * @param text - LLM output text to check
 * @param options - Check options
 * @returns Hallucination check result
 */
export const checkForHallucinations = (
  text: string,
  options: {
    /** Evidence strings to verify claims against */
    evidence?: readonly string[];
    /** Risk threshold for marking as likely hallucinated (default: 0.6) */
    threshold?: number;
  } = {}
): HallucinationCheckResult => {
  const { evidence = [], threshold = DEFAULT_HALLUCINATION_THRESHOLD } = options;

  if (!text || text.trim().length === 0) {
    return {
      riskScore: 0,
      isLikelyHallucinated: false,
      indicators: [],
      unverifiedClaims: [],
      detectionConfidence: "low",
    };
  }

  // Detect pattern-based indicators
  const indicators = detectPatternIndicators(text);

  // Extract and verify claims
  const claims = extractClaims(text);
  const unverifiedClaims = claims.filter((claim) => !isClaimSupported(claim, evidence));

  // Calculate component scores
  const indicatorScore =
    indicators.length > 0
      ? Math.min(
          1,
          indicators.reduce((sum, ind) => sum + ind.weight, 0)
        )
      : 0;

  const unverifiedScore =
    claims.length > 0 ? unverifiedClaims.length / claims.length : evidence.length > 0 ? 0 : 0.3;

  const textScore = calculateTextCharacteristicScore(text);

  // Calculate weighted risk score
  const riskScore = Math.min(
    1,
    indicatorScore * RISK_WEIGHTS.PATTERN_INDICATORS +
      unverifiedScore * RISK_WEIGHTS.UNVERIFIED_CLAIMS +
      textScore * RISK_WEIGHTS.TEXT_CHARACTERISTICS
  );

  return {
    riskScore,
    isLikelyHallucinated: riskScore >= threshold,
    indicators,
    unverifiedClaims,
    detectionConfidence: determineConfidence(indicators.length, evidence.length > 0, text.length),
  };
};

/**
 * Quick check if text is likely hallucinated (above default threshold).
 *
 * @param text - Text to check
 * @param evidence - Optional evidence to verify against
 * @returns True if likely hallucinated
 */
export const isLikelyHallucinated = (text: string, evidence?: readonly string[]): boolean =>
  checkForHallucinations(text, { evidence }).isLikelyHallucinated;

/**
 * Gets hallucination risk level as a simple category.
 *
 * @param text - Text to analyze
 * @param evidence - Optional evidence to verify against
 * @returns Risk level category
 */
export const getHallucinationRiskLevel = (
  text: string,
  evidence?: readonly string[]
): "low" | "medium" | "high" => {
  const { riskScore } = checkForHallucinations(text, { evidence });

  if (riskScore < 0.3) {
    return "low";
  }
  if (riskScore < 0.6) {
    return "medium";
  }
  return "high";
};
