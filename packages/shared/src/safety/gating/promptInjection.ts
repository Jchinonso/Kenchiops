/**
 * Prompt Injection Detection Module
 *
 * Detects potential prompt injection attacks in user inputs before
 * they are sent to LLMs. Prevents jailbreaks and unauthorized instructions.
 *
 * @module safety/gating/promptInjection
 */

// ==================== Types ====================

/**
 * Result of prompt injection detection.
 */
export interface InjectionDetectionResult {
  /** Whether injection was detected */
  readonly isInjection: boolean;
  /** Risk score (0-1, higher = more likely injection) */
  readonly riskScore: number;
  /** Types of injection patterns detected */
  readonly detectedPatterns: readonly InjectionPatternType[];
  /** Specific matches found */
  readonly matches: readonly InjectionMatch[];
  /** Recommended action */
  readonly recommendation: InjectionRecommendation;
}

/**
 * A specific injection pattern match.
 */
export interface InjectionMatch {
  /** Type of pattern */
  readonly type: InjectionPatternType;
  /** Matched text (truncated for safety) */
  readonly matchedText: string;
  /** Severity of this match */
  readonly severity: "low" | "medium" | "high" | "critical";
}

/**
 * Types of prompt injection patterns.
 */
export type InjectionPatternType =
  | "instruction_override"
  | "role_hijacking"
  | "delimiter_escape"
  | "encoded_payload"
  | "jailbreak_attempt"
  | "system_prompt_leak"
  | "recursive_injection"
  | "context_manipulation";

/**
 * Recommended action after detection.
 */
export type InjectionRecommendation = "allow" | "sanitize" | "block" | "review";

// ==================== Constants ====================

/**
 * Prompt injection detection patterns with severity levels.
 */
const INJECTION_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly type: InjectionPatternType;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly weight: number;
}> = [
  // Instruction override attempts
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/gi,
    type: "instruction_override",
    severity: "critical",
    weight: 0.9,
  },
  {
    pattern: /disregard\s+(?:the\s+)?(?:system|original|initial)\s+(?:prompt|instructions?)/gi,
    type: "instruction_override",
    severity: "critical",
    weight: 0.9,
  },
  {
    pattern: /forget\s+(?:everything|all)\s+(?:you\s+)?(?:know|learned|were\s+told)/gi,
    type: "instruction_override",
    severity: "high",
    weight: 0.7,
  },

  // Role hijacking
  {
    pattern: /you\s+are\s+(?:now|actually)\s+(?:a|an)\s+(?!assistant|helpful)/gi,
    type: "role_hijacking",
    severity: "high",
    weight: 0.7,
  },
  {
    pattern:
      /(?:pretend|act|behave)\s+(?:like\s+)?(?:as\s+if\s+)?you(?:'re|\s+are)\s+(?!an?\s+(?:assistant|AI))/gi,
    type: "role_hijacking",
    severity: "high",
    weight: 0.7,
  },
  {
    pattern: /your\s+(?:new|real)\s+(?:name|identity|role)\s+is/gi,
    type: "role_hijacking",
    severity: "high",
    weight: 0.65,
  },

  // Delimiter escape attempts
  {
    pattern: /```\s*(?:system|admin|root)\b/gi,
    type: "delimiter_escape",
    severity: "high",
    weight: 0.7,
  },
  {
    pattern: /<\/?(?:system|admin|instruction|prompt)>/gi,
    type: "delimiter_escape",
    severity: "medium",
    weight: 0.5,
  },
  {
    pattern: /\[(?:SYSTEM|ADMIN|INSTRUCTION)\]/gi,
    type: "delimiter_escape",
    severity: "medium",
    weight: 0.5,
  },

  // Jailbreak attempts
  {
    pattern: /(?:DAN|DUDE|STAN|KEVIN)\s*(?:mode|prompt)?:?/gi,
    type: "jailbreak_attempt",
    severity: "critical",
    weight: 0.85,
  },
  {
    pattern: /(?:do\s+)?anything\s+now\s+(?:mode)?/gi,
    type: "jailbreak_attempt",
    severity: "critical",
    weight: 0.85,
  },
  {
    pattern: /(?:evil|chaos|unrestricted|unfiltered)\s+(?:mode|version)/gi,
    type: "jailbreak_attempt",
    severity: "high",
    weight: 0.75,
  },
  {
    pattern:
      /bypass\s+(?:your\s+)?(?:safety|ethical|content)\s+(?:filters?|guidelines?|restrictions?)/gi,
    type: "jailbreak_attempt",
    severity: "critical",
    weight: 0.9,
  },

  // System prompt leak attempts
  {
    pattern:
      /(?:show|reveal|print|display|output)\s+(?:your\s+)?(?:system|initial|original)\s+prompt/gi,
    type: "system_prompt_leak",
    severity: "high",
    weight: 0.7,
  },
  {
    pattern: /what\s+(?:is|are)\s+your\s+(?:system\s+)?(?:instructions?|prompt|rules?)/gi,
    type: "system_prompt_leak",
    severity: "medium",
    weight: 0.5,
  },
  {
    pattern:
      /repeat\s+(?:back\s+)?(?:your\s+)?(?:initial|system|original)\s+(?:instructions?|prompt)/gi,
    type: "system_prompt_leak",
    severity: "high",
    weight: 0.7,
  },

  // Encoded payloads (base64 with suspicious content markers)
  {
    pattern: /(?:base64|b64|decode)\s*[:=]\s*[A-Za-z0-9+/=]{20,}/gi,
    type: "encoded_payload",
    severity: "medium",
    weight: 0.5,
  },
  {
    pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){3,}/gi,
    type: "encoded_payload",
    severity: "medium",
    weight: 0.5,
  },

  // Recursive injection
  {
    pattern:
      /when\s+(?:you\s+)?(?:see|encounter|receive)\s+(?:this|the\s+following)\s*,?\s*(?:do|execute|run)/gi,
    type: "recursive_injection",
    severity: "high",
    weight: 0.65,
  },
  {
    pattern: /inject\s+(?:this\s+)?(?:into|as)\s+(?:the\s+)?(?:context|prompt|instructions?)/gi,
    type: "recursive_injection",
    severity: "high",
    weight: 0.7,
  },

  // Context manipulation
  {
    pattern:
      /(?:from\s+now\s+on|henceforth|going\s+forward)\s*,?\s*(?:you\s+)?(?:will|must|should)/gi,
    type: "context_manipulation",
    severity: "medium",
    weight: 0.5,
  },
  {
    pattern: /(?:new\s+)?(?:rule|instruction|directive)\s*[:=]/gi,
    type: "context_manipulation",
    severity: "medium",
    weight: 0.45,
  },
] as const;

/**
 * Risk thresholds for recommendations.
 */
const RISK_THRESHOLDS = {
  ALLOW: 0.2,
  SANITIZE: 0.5,
  BLOCK: 0.75,
} as const;

// ==================== Core Functions ====================

/**
 * Detects injection patterns in text.
 *
 * @param text - Text to analyze
 * @returns Array of matches found
 */
const detectPatterns = (text: string): InjectionMatch[] => {
  const matches: InjectionMatch[] = [];

  for (const { pattern, type, severity } of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);

    if (found) {
      for (const match of found) {
        matches.push({
          type,
          matchedText: match.slice(0, 50), // Truncate for safety
          severity,
        });
      }
    }
  }

  return matches;
};

/**
 * Calculates risk score from matches.
 *
 * @param matches - Detected matches
 * @returns Risk score (0-1)
 */
const calculateRiskScore = (matches: readonly InjectionMatch[]): number => {
  if (matches.length === 0) {
    return 0;
  }

  // Find corresponding weights
  let totalWeight = 0;
  for (const match of matches) {
    const patternDef = INJECTION_PATTERNS.find(
      (patternEntry) => patternEntry.type === match.type && patternEntry.severity === match.severity
    );
    totalWeight += patternDef?.weight ?? 0.5;
  }

  // Apply diminishing returns for multiple matches
  const diminishingFactor = 1 - 0.8 ** matches.length;
  const baseScore = Math.min(1, totalWeight * diminishingFactor);

  // Boost if critical severity present
  const hasCritical = matches.some((match) => match.severity === "critical");
  const criticalBoost = hasCritical ? 0.2 : 0;

  return Math.min(1, baseScore + criticalBoost);
};

/**
 * Determines recommendation based on risk score and severity.
 *
 * @param riskScore - Calculated risk score
 * @param matches - Detected matches
 * @returns Recommended action
 */
const determineRecommendation = (
  riskScore: number,
  matches: readonly InjectionMatch[]
): InjectionRecommendation => {
  // Critical severity always blocks
  if (matches.some((match) => match.severity === "critical")) {
    return "block";
  }

  if (riskScore >= RISK_THRESHOLDS.BLOCK) {
    return "block";
  }

  if (riskScore >= RISK_THRESHOLDS.SANITIZE) {
    // Multiple high severity = block
    const highCount = matches.filter((match) => match.severity === "high").length;
    return highCount >= 2 ? "block" : "review";
  }

  if (riskScore >= RISK_THRESHOLDS.ALLOW) {
    return "sanitize";
  }

  return "allow";
};

// ==================== Exports ====================

/**
 * Detects potential prompt injection in input text.
 *
 * @param input - User input to analyze
 * @returns Detection result with risk assessment
 */
export const detectPromptInjection = (input: string): InjectionDetectionResult => {
  if (!input || input.trim().length === 0) {
    return {
      isInjection: false,
      riskScore: 0,
      detectedPatterns: [],
      matches: [],
      recommendation: "allow",
    };
  }

  const matches = detectPatterns(input);
  const riskScore = calculateRiskScore(matches);
  const detectedPatterns = [...new Set(matches.map((match) => match.type))];
  const recommendation = determineRecommendation(riskScore, matches);

  return {
    isInjection: riskScore >= RISK_THRESHOLDS.SANITIZE,
    riskScore,
    detectedPatterns,
    matches,
    recommendation,
  };
};

/**
 * Quick check if input contains injection attempt.
 *
 * @param input - User input to check
 * @returns True if injection detected
 */
export const hasInjectionAttempt = (input: string): boolean =>
  detectPromptInjection(input).isInjection;

/**
 * Checks if input should be blocked.
 *
 * @param input - User input to check
 * @returns True if input should be blocked
 */
export const shouldBlockInput = (input: string): boolean =>
  detectPromptInjection(input).recommendation === "block";

/**
 * Sanitizes input by removing detected injection patterns.
 * Only removes patterns, does not guarantee safety.
 *
 * @param input - User input to sanitize
 * @returns Sanitized input
 */
export const sanitizeInjectionAttempts = (input: string): string => {
  if (!input) {
    return "";
  }

  let sanitized = input;

  for (const { pattern } of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  return sanitized;
};

/**
 * Gets severity level for an input.
 *
 * @param input - User input to analyze
 * @returns Highest severity found or "none"
 */
export const getInjectionSeverity = (
  input: string
): "none" | "low" | "medium" | "high" | "critical" => {
  const { matches } = detectPromptInjection(input);

  if (matches.length === 0) {
    return "none";
  }

  const severityOrder: Array<"critical" | "high" | "medium" | "low"> = [
    "critical",
    "high",
    "medium",
    "low",
  ];

  for (const severity of severityOrder) {
    if (matches.some((match) => match.severity === severity)) {
      return severity;
    }
  }

  return "low";
};
