/**
 * Lint Output Parser
 *
 * Parses lint/compile errors deterministically from CI runner output using regex.
 * No LLM involved — guaranteed consistent results for the same log input.
 *
 * Supports any linter using the stylish output format (ESLint, Biome, stylelint,
 * golangci-lint, etc.), colon-delimited format (Pylint, Flake8, Rubocop, Clippy),
 * and TypeScript compiler (tsc).
 *
 * @module formatting/lintOutputParser
 */

import type { LLMLintError } from "../core/types.js";
import { TEXT_SANITIZATION_PATTERNS } from "../constants/githubStatus.js";
import { stripAnsiEscapes } from "./ansiStripper.js";

// ==================== Stylish Format Parser ====================

/**
 * Stylish-format error line pattern (used by ESLint, Biome, stylelint, etc.):
 *   12:5   error  'foo' is defined but never used  no-unused-vars
 *   15:10  warning  Missing return type             @typescript-eslint/explicit-function-return-type
 *
 * Groups: [line, col, severity, message, rule]
 */
const STYLISH_ERROR_PATTERN = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/;

/**
 * File path line pattern for stylish linter output (language-agnostic).
 * Linters print file paths flush-left (no leading whitespace) on their own line.
 * Matches any path containing a dot-extension (e.g., .ts, .py, .go, .rs, .rb).
 * Handles both absolute paths (/home/runner/...) and relative paths (src/...).
 */
const FILE_PATH_PATTERN = /^((?:\/[^\s]+|[a-zA-Z][^\s]*)\.\w+)$/;

/**
 * Common CI runner path prefixes to strip for cleaner file paths.
 */
const CI_PATH_PREFIXES = [
  /^\/home\/runner\/work\/[^/]+\/[^/]+\//,
  /^\/github\/workspace\//,
  /^\/opt\/buildhome\/repo\//,
] as const;

/**
 * Strip CI runner path prefix to get relative file path.
 */
const stripCIPathPrefix = (filePath: string): string => {
  // let: iterative reduction — each prefix is checked in order
  let result = filePath;
  for (const prefix of CI_PATH_PREFIXES) {
    result = result.replace(prefix, "");
  }
  return result;
};

// ==================== Colon-Delimited Format Parser ====================

/**
 * Colon-delimited error pattern (used by Pylint, Flake8, Rubocop, Clippy, golangci-lint, etc.):
 *   src/file.py:12:5: E302 expected 2 blank lines, got 1
 *   src/file.rb:12:5: C: Style/StringLiterals: Prefer single-quoted strings
 *   src/file.go:12:5: error message (rule)
 *   src/file.rs:12:5: error[E0425]: cannot find value `x`
 *
 * Groups: [file, line, col, rest (includes code + message)]
 */
const COLON_DELIMITED_PATTERN = /^([^\s:]+\.\w+):(\d+):(\d+):\s*(.+)$/;

/**
 * Extract error code and message from the tail of a colon-delimited lint line.
 * Handles formats like:
 *   "E302 expected 2 blank lines"        → code: "E302", message: "expected 2 blank lines"
 *   "error[E0425]: cannot find value"     → code: "E0425", message: "cannot find value"
 *   "C: Style/StringLiterals: Prefer..." → code: "Style/StringLiterals", message: "Prefer..."
 *   "some message (rule-name)"            → code: "rule-name", message: "some message"
 */
const parseCodeAndMessage = (tail: string): { readonly code: string; readonly message: string } => {
  // Rust: error[E0425]: message
  const rustMatch = /^(?:error|warning)\[(\w+)]:\s*(.+)$/.exec(tail);
  if (rustMatch) {
    return { code: rustMatch[1], message: rustMatch[2] };
  }

  // Rubocop: C: Style/Rule: message
  const rubocopMatch = /^[A-Z]:\s*(\S+):\s*(.+)$/.exec(tail);
  if (rubocopMatch) {
    return { code: rubocopMatch[1], message: rubocopMatch[2] };
  }

  // Flake8/Pylint: E302 message
  const codeFirstMatch = /^([A-Z]\w*\d+)\s+(.+)$/.exec(tail);
  if (codeFirstMatch) {
    return { code: codeFirstMatch[1], message: codeFirstMatch[2] };
  }

  // Go: message (linter-name)
  const goMatch = /^(.+?)\s+\((\S+)\)\s*$/.exec(tail);
  if (goMatch) {
    return { code: goMatch[2], message: goMatch[1] };
  }

  return { code: "lint-error", message: tail };
};

// ==================== TypeScript Compiler Parser ====================

/**
 * TypeScript compiler error pattern:
 *   src/file.ts(12,5): error TS2304: Cannot find name 'foo'.
 *
 * Groups: [file, line, col, code, message]
 */
const TSC_ERROR_PATTERN = /^(.+?)\((\d+),(\d+)\):\s+(?:error|warning)\s+(TS\d+):\s+(.+?)\s*$/;

// ==================== Main Parser ====================

/**
 * Parse lint/compile errors from raw CI log output.
 *
 * Supports:
 * - Stylish format (ESLint, Biome, stylelint) — file path on its own line, errors indented
 * - Colon-delimited format (Pylint, Flake8, Rubocop, Clippy, golangci-lint) — file:line:col: message
 * - TypeScript compiler (tsc) — file(line,col): error TSxxxx: message
 *
 * @param log - Raw CI log output (may include timestamps, ANSI codes, etc.)
 * @returns Array of parsed lint errors
 */
export const parseLintOutput = (log: string): readonly LLMLintError[] => {
  if (!log) {
    return [];
  }

  // Strip CI timestamps and ANSI codes that break regex patterns.
  // GitHub Actions prepends `2024-01-15T10:30:45.1234567Z ` to every line,
  // which prevents FILE_PATH_PATTERN, TSC_ERROR_PATTERN, etc. from matching.
  const cleaned = stripAnsiEscapes(log).replace(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_ALL, "");

  const lines = cleaned.split("\n");
  const errors: LLMLintError[] = [];

  // let: tracks current file context as we scan stylish output line-by-line
  let currentFile: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    // Check for stylish error line (indented: "  12:5  error  message  rule")
    const stylishMatch = STYLISH_ERROR_PATTERN.exec(line);
    if (stylishMatch && currentFile) {
      const [, lineNum, col, , message, rule] = stylishMatch;
      errors.push({
        file: currentFile,
        line: Number(lineNum),
        column: Number(col),
        message,
        code: rule,
      });
      continue;
    }

    // Check for TypeScript compiler error (file(line,col): error TSxxxx: message)
    const tscMatch = TSC_ERROR_PATTERN.exec(trimmed);
    if (tscMatch) {
      const [, filePath, lineNum, col, code, message] = tscMatch;
      errors.push({
        file: stripCIPathPrefix(filePath),
        line: Number(lineNum),
        column: Number(col),
        message,
        code,
      });
      continue;
    }

    // Check for colon-delimited format (file.py:12:5: E302 message)
    const colonMatch = COLON_DELIMITED_PATTERN.exec(trimmed);
    if (colonMatch) {
      const [, filePath, lineNum, col, tail] = colonMatch;
      const { code, message } = parseCodeAndMessage(tail);
      errors.push({
        file: stripCIPathPrefix(filePath),
        line: Number(lineNum),
        column: Number(col),
        message,
        code,
      });
      continue;
    }

    // Check if this line is a file path (stylish format prints paths flush-left)
    const pathMatch = FILE_PATH_PATTERN.exec(trimmed);
    if (pathMatch) {
      currentFile = stripCIPathPrefix(pathMatch[1]);
    }
  }

  return errors;
};
