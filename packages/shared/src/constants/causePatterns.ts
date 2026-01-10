/**
 * Cause Extraction Pattern Constants
 *
 * Patterns and limits for extracting, scoring, and filtering
 * meaningful error causes from CI failure logs.
 */

// ==================== Extraction Limits ====================

/**
 * Constants for cause extraction and validation.
 */
export const CAUSE_EXTRACTION_LIMITS = {
  /** Maximum raw cause string length for efficient processing */
  MAX_RAW_LENGTH: 2000,
  /** Maximum display length for extracted causes */
  MAX_DISPLAY_LENGTH: 150,
  /** Truncation length (MAX_DISPLAY_LENGTH - 3 for ellipsis) */
  TRUNCATION_LENGTH: 147,
  /** Minimum length for a meaningful error line */
  MIN_MEANINGFUL_LINE_LENGTH: 10,
  /** Minimum length for a valid cause string */
  MIN_CAUSE_LENGTH: 5,
  /** Length threshold for medium cause bonus in scoring */
  MEDIUM_CAUSE_LENGTH: 60,
  /** Length threshold for long cause bonus in scoring */
  LONG_CAUSE_LENGTH: 120,
} as const;

// ==================== Useless Cause Patterns ====================

/**
 * Patterns that indicate a cause string is not useful for display.
 * These are filtered out to show only meaningful error content.
 */
export const USELESS_CAUSE_PATTERNS: readonly RegExp[] = [
  // Just a matcher name (Jest/Jasmine): toEqual, toBe, toHaveBeenCalled, toBeGreaterThan
  /^to(?:Be|Equal|Have|Throw|Match|Return|Contain|Include|Reject|Resolve)\w*$/i,
  // Jest/TS code-frame lines (e.g., "12 | const foo = bar")
  /^\s*>?\s*\d+\s*\|\s*.+$/i,
  // Multi-column code frames (e.g., "0 600 | 601 | const foo")
  /^\s*>?\s*\d+\s+\d+\s*\|\s*\d+\s*\|/i,
  // Jest matcher template: expect(received).toBeGreaterThan(expected)
  /^expect\s*\([^)]*\)\s*\.to\w+\s*\([^)]*\)\s*$/i,
  // Any expect().toXxx pattern (more lenient)
  /^expect\s*\(.*\)\.to[A-Z]/i,
  // Just a file path without error content (with or without quotes)
  /^["']?[A-Za-z0-9_./-]+\.[a-z]{2,4}(?::\d+)?["']?\s*$/i,
  // FAIL/FAILED/PASS/PASSED followed by file path
  /^(?:FAILED?|PASSED?)\s+[A-Za-z0-9_./:/-]+(?:\s*\([^)]*\))?/i,
  // FAIL marker anywhere in string followed by path
  /^FAIL\s+\S+/i,
  // Just "undefined", "null", or similar
  /^(?:undefined|null|NaN|true|false)$/i,
  // Just empty object/array representations
  /^(?:\{\}|\[\]|Object|Array)$/i,
  // Just test runner markers (FAIL, FAILED, PASS, PASSED, etc.)
  /^(?:FAILED?|PASSED?|✓|✕|●)\s*$/,
  // Just a test name (looks like "should do something" or "it does thing")
  /^(?:should|it|test|describe|when|given)\s+[\w\s]+$/i,
  // Just assertion count
  /^\d+\s+(?:passing|failing|pending|skipped)/i,
  // Just a function/method name (single word)
  /^[a-zA-Z_]\w*$/,
  // Jest/Mocha snapshot markers
  /^(?:Snapshot|Snapshots?):/i,
  // Python pytest markers (standalone)
  /^(?:PASSED|FAILED|ERROR|SKIPPED)$/i,
  // Go test markers
  /^(?:---\s*(?:PASS|FAIL)|===\s*(?:RUN|PAUSE|CONT))/i,
  // Just "Error:" or "Error" with optional whitespace
  /^Error:?\s*$/i,
  // Substring/contains patterns: substring: "anything"
  /^substring:\s*/i,
  // Number of calls pattern: number of calls: N
  /^number of calls:\s*\d+$/i,
  // Just timing info: (10.243 s) or (10.243 ms)
  /^\(\d+\.?\d*\s*(?:ms|s|m)?\s*\)$/i,
  // Just a short quoted string (less than 50 chars, likely a value not an error)
  /^["'][^"']{1,50}["']$/,
  // ObjectContaining/StringContaining patterns
  /(?:Object|String|Array)Containing\s*[{[]/i,
  // Just "Test failed:" prefix without content
  /^Test failed:?\s*$/i,
  // Function mockConstructor patterns
  /\[Function[:\s]*\w*\]/i,
  // JSON-like objects with Function references
  /\{[^}]*\[Function/i,
  // Just quoted file paths
  /^["'][A-Za-z0-9_./-]+(?:\/[A-Za-z0-9_./-]+)*\.[a-z]{2,4}["']$/i,
  // Jest received/expected without actual values
  /^(?:Received|Expected):\s*$/i,
  // Jest received/expected with just primitive value
  /^(?:Received|Expected):\s*(?:undefined|null|true|false|-?\d+\.?\d*)\s*$/i,
  // Just a file path (any directory structure)
  /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/,
  // Test identifiers with :: separator (Python, Rust, C++)
  /^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)+$/,
  // Test identifiers with > separator (Jest)
  /^[A-Za-z_][\w\s]*(?:\s*>\s*[A-Za-z_][\w\s]*)+$/,
  // Test identifiers with / separator (Go)
  /^Test[A-Za-z_]\w*(?:\/[A-Za-z_]\w*)+$/,
  // File path with any test identifier
  /^[A-Za-z0-9_./-]+\.[a-z]{2,4}(?:::|\/|>)[A-Za-z_]\w*/i,
  // CamelCase test class/method names
  /^(?:Test|test_)[A-Za-z0-9_]+$/,
  // Generic explanation messages
  /^This error indicates/i,
  // Test failed with just file path
  /^Test failed:\s*[A-Za-z0-9_./-]+\.[a-z]{2,4}/i,
  // Jest caret marker lines
  /\|\s*\^/,
  // Lines containing PASS followed by test file paths
  /PASS\s+[\w/.-]+\.(?:test|spec)\.[jt]sx?/i,
  // Quoted file path followed by pipe
  /^["'][^"']+["']\s*\|/,
  // Lines that are mostly PASS/FAIL markers with paths
  /^[|>\s]*(?:PASS|FAIL)\s+\S+/i,
  // JSON log objects (structured logging output)
  /^\s*\{["'](?:level|message|timestamp|error|status|code)["']\s*:/i,
  // JSON arrays or objects at start of line
  /^\s*[[{].*["'](?:level|message|error|status)["']/i,
  // Generic "assertion failed" without specific content
  /^assertion\s+failed\.?$/i,
  // Just "Test failed" without real error context
  /^Test\s+failed\.?\s*$/i,
  // Very long Received: strings with system prompt indicators
  /^Received:\s*["'].*(?:You are|Instructions:|system prompt|assistant)/is,
  // Received: with extremely long quoted strings
  /^Received:\s*["'][^"']{200,}/i,
  // Expected/Received blocks that just show large objects
  /^(?:Expected|Received):\s*\{[^}]{100,}/i,
  // Lines that are just stringified objects
  /^Object\s*\{/i,
  // Lines that start with Array followed by bracket
  /^Array\s*\[/i,
  // Raw stringified JSON with backslash escapes
  /^\{\\["'].*\\["']\s*:/,
] as const;

// ==================== Signal Weights ====================

/**
 * Patterns used to rank cause strings by signal strength.
 * Higher weight = more informative error message.
 */
export const CAUSE_SIGNAL_WEIGHTS: ReadonlyArray<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(typeerror|referenceerror|validationerror|syntaxerror)\b/i, weight: 6 },
  { pattern: /\bnot initialized\b/i, weight: 6 },
  { pattern: /\bnot a function\b/i, weight: 6 },
  { pattern: /\bcannot read (properties|property)\b/i, weight: 5 },
  { pattern: /\bundefined\b/i, weight: 4 },
  { pattern: /\bnull\b/i, weight: 3 },
  { pattern: /\btimeout|timed out|exceeded \d+m?s\b/i, weight: 5 },
  { pattern: /\b(out of memory|oom|no space left)\b/i, weight: 5 },
  { pattern: /\b(database|db|pool|connection|redis)\b/i, weight: 4 },
  { pattern: /\bpermission denied|unauthorized|forbidden|401|403\b/i, weight: 4 },
  { pattern: /\bmodule not found|cannot find module|importerror\b/i, weight: 4 },
] as const;

/**
 * Patterns that reduce cause signal strength.
 * These indicate generic/unhelpful error content.
 */
export const CAUSE_WEAKNESS_WEIGHTS: ReadonlyArray<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bexpected\b/i, weight: -2 },
  { pattern: /\breceived\b/i, weight: -2 },
  { pattern: /\bsubstring\b/i, weight: -2 },
  { pattern: /\btoBe|toEqual|toHave|toMatch|toContain\b/i, weight: -2 },
  { pattern: /^\s*expected:\s*$/i, weight: -4 },
  { pattern: /^\s*received:\s*$/i, weight: -4 },
  { pattern: /^(?:fail(?:ed)?|test failed)\b/i, weight: -5 },
] as const;

// ==================== Test File Detection ====================

/**
 * Patterns that identify test files across different languages and frameworks.
 * Supports Jest, pytest, Go, Rust, Ruby, Java, and more.
 */
export const TEST_FILE_PATTERNS: readonly RegExp[] = [
  // JavaScript/TypeScript: .test.ts, .spec.ts, __tests__/
  /\.(?:test|spec)\.[jt]sx?$/i,
  /[/\\]__tests__[/\\]/i,
  // Python: test_*.py, *_test.py, tests/
  /[/\\]tests?[/\\]/i,
  /(?:^|[/\\])test_[^/\\]+\.py$/i,
  /[^/\\]+_test\.py$/i,
  // Go: *_test.go
  /_test\.go$/i,
  // Rust: mod tests, tests/ directory
  /[/\\]tests[/\\][^/\\]+\.rs$/i,
  // Ruby: *_spec.rb, *_test.rb, spec/
  /\.(?:spec|test)\.rb$/i,
  /[/\\]spec[/\\]/i,
  // Java: *Test.java, *Spec.java
  /(?:Test|Spec)\.java$/i,
  // Generic patterns
  /[/\\]test[/\\]/i,
  /[/\\]e2e[/\\]/i,
  /[/\\]integration[/\\]/i,
] as const;
