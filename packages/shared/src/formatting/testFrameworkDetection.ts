/**
 * Test Framework Detection
 *
 * Detects test frameworks from CI log content with confidence scoring.
 * Language-agnostic detection based on output patterns.
 *
 * @module formatting/testFrameworkDetection
 */

// ==================== Types ====================

/**
 * Detected test framework information with confidence.
 */
export interface TestFrameworkInfo {
  /** Framework name (e.g., "pytest", "jest", "cargo-test") */
  readonly name: string;
  /** Programming language */
  readonly language: string;
  /** How expected/actual values are labeled in this framework */
  readonly assertionHint: string;
  /** Detection confidence (0-1) based on pattern match strength */
  readonly confidence: number;
}

/**
 * Internal framework pattern definition.
 */
interface FrameworkPatternEntry {
  /** Patterns that identify this framework (ordered by specificity) */
  readonly patterns: readonly RegExp[];
  /** Base framework info (confidence added during detection) */
  readonly framework: Omit<TestFrameworkInfo, "confidence">;
  /** Base confidence score for this framework */
  readonly baseConfidence: number;
}

// ==================== Constants ====================

/**
 * Confidence score adjustments.
 */
const CONFIDENCE_ADJUSTMENTS = {
  /** Bonus for each additional pattern match */
  MULTI_MATCH_BONUS: 0.1,
  /** Maximum confidence cap */
  MAX_CONFIDENCE: 0.95,
  /** Minimum confidence threshold */
  MIN_CONFIDENCE: 0.5,
} as const;

/**
 * Test framework detection patterns with assertion hints.
 * Ordered by specificity - more specific patterns first.
 * Each entry has a base confidence reflecting pattern reliability.
 */
const TEST_FRAMEWORK_PATTERNS: readonly FrameworkPatternEntry[] = [
  // Python frameworks
  {
    patterns: [/pytest|FAILED tests\/|::test_|collected \d+ item/i],
    framework: {
      name: "pytest",
      language: "Python",
      assertionHint: "assert X == Y where X=actual, Y=expected",
    },
    baseConfidence: 0.85,
  },
  {
    patterns: [/unittest|\.py.*OK$|Ran \d+ tests/im],
    framework: {
      name: "unittest",
      language: "Python",
      assertionHint: "assertEqual(actual, expected) or assert X == Y",
    },
    baseConfidence: 0.75,
  },
  // JavaScript/TypeScript frameworks
  {
    patterns: [/jest|PASS\s+src\/|FAIL\s+src\/|expect\(.*\)\.to/i],
    framework: {
      name: "jest",
      language: "JavaScript/TypeScript",
      assertionHint: "Expected: X, Received: Y",
    },
    baseConfidence: 0.85,
  },
  {
    patterns: [/vitest|✓|✕|PASS\s|FAIL\s/],
    framework: {
      name: "vitest",
      language: "JavaScript/TypeScript",
      assertionHint: "Expected: X, Received: Y",
    },
    baseConfidence: 0.7,
  },
  {
    patterns: [/mocha|passing|failing|describe\(|it\(/i],
    framework: {
      name: "mocha",
      language: "JavaScript/TypeScript",
      assertionHint: "expected X to equal Y",
    },
    baseConfidence: 0.7,
  },
  // C/C++ (must come before Rust due to "running X tests" pattern overlap)
  {
    patterns: [/gtest|Google Test|EXPECT_EQ|ASSERT_EQ|\[==========\].*Running/i],
    framework: {
      name: "gtest",
      language: "C/C++",
      assertionHint: "Expected: X, Actual: Y (first arg=expected in EXPECT_EQ)",
    },
    baseConfidence: 0.85,
  },
  {
    patterns: [/Catch2|REQUIRE|CHECK\(/i],
    framework: {
      name: "catch2",
      language: "C/C++",
      assertionHint: "lhs == rhs comparison",
    },
    baseConfidence: 0.75,
  },
  // Rust (more specific patterns to avoid overlap with GTest)
  {
    patterns: [/test result:.*passed.*failed|thread '.*' panicked at|left:\s*`|right:\s*`/i],
    framework: {
      name: "cargo-test",
      language: "Rust",
      assertionHint: "left: X, right: Y where left=actual, right=expected",
    },
    baseConfidence: 0.85,
  },
  // Go
  {
    patterns: [/=== RUN|--- FAIL:|--- PASS:|go test|FAIL\t|PASS\t/],
    framework: {
      name: "go-test",
      language: "Go",
      assertionHint: "got: X, want: Y where got=actual, want=expected",
    },
    baseConfidence: 0.85,
  },
  // Java
  {
    patterns: [/JUnit|@Test|java\.lang\.AssertionError|expected:<.*> but was:</i],
    framework: {
      name: "junit",
      language: "Java",
      assertionHint: "expected:<X> but was:<Y> where Y=actual",
    },
    baseConfidence: 0.8,
  },
  {
    patterns: [/maven|mvn|\[ERROR\].*BUILD FAILURE/i],
    framework: {
      name: "maven",
      language: "Java",
      assertionHint: "expected:<X> but was:<Y>",
    },
    baseConfidence: 0.7,
  },
  {
    patterns: [/gradle|BUILD FAILED/i],
    framework: {
      name: "gradle",
      language: "Java/Kotlin",
      assertionHint: "expected:<X> but was:<Y>",
    },
    baseConfidence: 0.7,
  },
  // Elixir (must come before C# xUnit due to pattern overlap)
  {
    patterns: [/ExUnit|Finished in.*\d+ tests/i],
    framework: {
      name: "exunit",
      language: "Elixir",
      assertionHint: "left: X, right: Y",
    },
    baseConfidence: 0.8,
  },
  // C#/.NET
  {
    patterns: [/NUnit|Test Run.*Passed:|Assert\.AreEqual/i],
    framework: {
      name: "nunit",
      language: "C#",
      assertionHint: "Expected: X, But was: Y where Y=actual",
    },
    baseConfidence: 0.8,
  },
  {
    patterns: [/\bxUnit\b|Assert\.Equal|Xunit\.net/i],
    framework: {
      name: "xunit",
      language: "C#",
      assertionHint: "Expected: X, Actual: Y",
    },
    baseConfidence: 0.8,
  },
  // Ruby
  {
    patterns: [/rspec|examples?,\s*\d+\s*failures?|Finished in \d+/i],
    framework: {
      name: "rspec",
      language: "Ruby",
      assertionHint: "expected: X, got: Y where got=actual",
    },
    baseConfidence: 0.8,
  },
  {
    patterns: [/minitest|\d+ runs,\s*\d+ assertions/i],
    framework: {
      name: "minitest",
      language: "Ruby",
      assertionHint: "Expected: X, Actual: Y",
    },
    baseConfidence: 0.75,
  },
  // PHP
  {
    patterns: [/PHPUnit|Tests:\s*\d+|Assertions:\s*\d+/i],
    framework: {
      name: "phpunit",
      language: "PHP",
      assertionHint: "Expected X, got Y",
    },
    baseConfidence: 0.8,
  },
  // Swift
  {
    patterns: [/XCTest|Test Suite|XCTAssert/i],
    framework: {
      name: "xctest",
      language: "Swift",
      assertionHint: "expected X but got Y",
    },
    baseConfidence: 0.8,
  },
] as const;

// ==================== Detection Functions ====================

/**
 * Count how many patterns match in content for a given entry.
 *
 * @param content - The log content to analyze
 * @param patterns - Patterns to test
 * @returns Number of matching patterns
 */
const countPatternMatches = (content: string, patterns: readonly RegExp[]): number =>
  patterns.filter((pattern) => pattern.test(content)).length;

/**
 * Calculate confidence score based on match count and base confidence.
 *
 * @param baseConfidence - Base confidence for the framework
 * @param matchCount - Number of patterns that matched
 * @param totalPatterns - Total number of patterns available
 * @returns Adjusted confidence score
 */
const calculateConfidence = (
  baseConfidence: number,
  matchCount: number,
  totalPatterns: number
): number => {
  // Add bonus for multiple pattern matches
  const multiMatchBonus =
    matchCount > 1 ? CONFIDENCE_ADJUSTMENTS.MULTI_MATCH_BONUS * Math.min(matchCount - 1, 3) : 0;

  // Adjust based on pattern coverage
  const coverageBonus = matchCount === totalPatterns ? 0.05 : 0;

  const finalConfidence = baseConfidence + multiMatchBonus + coverageBonus;

  return Math.min(finalConfidence, CONFIDENCE_ADJUSTMENTS.MAX_CONFIDENCE);
};

/**
 * Detect the test framework from log content with confidence scoring.
 *
 * Uses pattern matching to identify the test framework and provides
 * a confidence score based on how many patterns matched.
 *
 * @param content - The log content to analyze
 * @returns Detected framework info with confidence, or undefined if not detected
 */
export const detectTestFramework = (content: string): TestFrameworkInfo | undefined => {
  // Find all entries with at least one matching pattern
  const matchedEntries = TEST_FRAMEWORK_PATTERNS.map((entry) => ({
    entry,
    matchCount: countPatternMatches(content, entry.patterns),
  })).filter(({ matchCount }) => matchCount > 0);

  // No matches found
  if (matchedEntries.length === 0) {
    return undefined;
  }

  // Find the best match (highest match count, then highest base confidence)
  const bestMatch = matchedEntries.reduce((best, current) =>
    current.matchCount > best.matchCount ||
    (current.matchCount === best.matchCount &&
      current.entry.baseConfidence > best.entry.baseConfidence)
      ? current
      : best
  );

  const confidence = calculateConfidence(
    bestMatch.entry.baseConfidence,
    bestMatch.matchCount,
    bestMatch.entry.patterns.length
  );

  return {
    ...bestMatch.entry.framework,
    confidence,
  };
};

/**
 * Detect test framework without confidence (backward compatible).
 *
 * @param content - The log content to analyze
 * @returns Detected framework info without confidence, or undefined
 */
export const detectTestFrameworkSimple = (
  content: string
): Omit<TestFrameworkInfo, "confidence"> | undefined => {
  const result = detectTestFramework(content);
  if (!result) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { confidence: _, ...frameworkWithoutConfidence } = result;
  return frameworkWithoutConfidence;
};
