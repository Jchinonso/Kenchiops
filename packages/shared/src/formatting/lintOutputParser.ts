/**
 * Lint Output Parser
 *
 * Parses lint/compile errors deterministically from CI runner output using regex.
 * No LLM involved — guaranteed consistent results for the same log input.
 *
 * Supports any linter using the stylish output format (ESLint, Biome, stylelint,
 * golangci-lint, etc.), colon-delimited format (Pylint, Flake8, Rubocop, Clippy),
 * TypeScript compiler (tsc), and format checkers (any language — detected via
 * structural output shapes: diff headers, tagged prefixes, formatting keywords).
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

// ==================== Path Validation ====================

/**
 * Check if a parsed path is a plausible source file (not a CI artifact or hidden dir).
 *
 * Rejects:
 * - Hidden directories used as bare paths (`.github`, `.eslintrc`) — dot at start with no `/`
 * - Paths where the "extension" is actually a directory name (e.g., `.github` has "extension" `github`)
 *
 * Language-agnostic: accepts any path with a real structure (contains `/`) or
 * has a dot-extension that's NOT at the start of the name.
 */
const isPlausibleSourceFile = (filePath: string): boolean => {
  // Paths with directory separators are almost always real file references
  if (filePath.includes("/")) {
    return true;
  }

  // Bare names starting with `.` (like `.github`, `.eslintrc`) are hidden dirs/dotfiles,
  // not lint error source files. Real source files start with alphanumeric characters.
  if (filePath.startsWith(".")) {
    return false;
  }

  return true;
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

// ==================== Format Checker Parser ====================
//
// TWO-TIER STRATEGY for language-agnostic format checker detection:
//
// Tier 1: Structural patterns (high confidence, matches output shapes)
//   Pattern A: "Diff in <file> at line <N>:" — diff with location info
//   Pattern B: "--- [a/]<file>" — unified diff header
//   Pattern C: "[tag] <file>" or "TAG: <file>" — tagged prefix
//   Pattern D: Context-aware extractor — lines with formatting keywords + file path
//
// Tier 2: Bare file path fallback (used ONLY when no other parser found anything)
//   Catches formatters that print file-per-line output (e.g., gofmt -l, shfmt -l).
//   Safe because parseLintOutput is only called on lint/format CI jobs.

// ---- Pattern A: Diff with location info ----

/**
 * Diff output with file path and line number:
 *   Diff in src/main.rs at line 15:
 *
 * Checked first because it provides line numbers (highest value).
 * Groups: [filePath, lineNumber]
 */
const DIFF_LOCATION_PATTERN = /^Diff in\s+(\S+\.\w+)\s+at line\s+(\d+):/;

// ---- Pattern B: Unified diff header ----

/**
 * Unified diff "before" file header. Covers ANY formatter in `--diff` mode:
 *   --- a/src/file.go
 *   --- src/file.py
 *
 * Only matches `---` (not `+++`) to avoid duplicates for the same file.
 * Groups: [filePath]
 */
const DIFF_HEADER_PATTERN = /^---\s+(?:[ab]\/)?(\S+\.\w+)\s*$/;

// ---- Pattern C: Tagged prefix ----

/**
 * Matches lines with a bracketed tag or uppercase label prefix followed by a file path:
 *   [warn] src/file.ts
 *   [error] src/file.py
 *   ERROR: src/file.py Imports are incorrectly sorted
 *   WARNING: src/file.rb
 *
 * No `$` anchor — allows trailing text after the file path.
 * Groups: [filePath]
 */
const TAGGED_PREFIX_PATTERN = /^(?:\[[\w-]+\]|[A-Z]{2,}:)\s+(\S+\.\w+)/;

// ---- Pattern D: Context-aware extractor ----

/**
 * Structural keywords indicating formatting-related output.
 * Matches verb forms: reformat, reformatted, reformatting, format, formatted, formatting,
 * changed, fixed, corrected, beautified, not formatted.
 */
const FORMAT_CONTEXT_KEYWORDS =
  /\b(?:(?:re)?format(?:t(?:ed|ing))?|changed|fixed|corrected|beautified|not formatted)\b/i;

/**
 * Extracts a file path (non-whitespace token with a dot-extension) from a line.
 * Requires whitespace or start/end boundaries around the path.
 * Groups: [filePath]
 */
const FILE_PATH_IN_LINE = /(?:^|\s)(\S+\.\w+)(?:\s|$)/;

/**
 * Guard: rejects lines where the first non-whitespace token is a number.
 * Prevents summary lines like "2 files would be reformatted" from matching.
 */
const STARTS_WITH_DIGIT = /^\d/;

/**
 * Try to extract a file path from a context-aware line.
 * The line must contain a formatting keyword AND a plausible file path.
 * Returns the file path or null.
 */
const extractContextAwarePath = (line: string): string | null => {
  if (!FORMAT_CONTEXT_KEYWORDS.test(line)) {
    return null;
  }

  // Reject summary lines that start with a digit (e.g., "2 files would be reformatted")
  if (STARTS_WITH_DIGIT.test(line)) {
    return null;
  }

  const pathMatch = FILE_PATH_IN_LINE.exec(line);
  if (!pathMatch) {
    return null;
  }

  const candidate = pathMatch[1];
  return isPlausibleSourceFile(candidate) ? candidate : null;
};

/**
 * Try to match a line against format checker structural patterns (A through D).
 * Returns the extracted file path, line number, and message if matched, or null.
 */
const matchFormatChecker = (
  line: string
): { readonly filePath: string; readonly line: number; readonly message: string } | null => {
  // Pattern A: diff with location (checked first — provides line numbers)
  const diffLocMatch = DIFF_LOCATION_PATTERN.exec(line);
  if (diffLocMatch) {
    return {
      filePath: diffLocMatch[1],
      line: Number(diffLocMatch[2]),
      message: "File requires formatting",
    };
  }

  // Pattern B: unified diff header
  const diffHeaderMatch = DIFF_HEADER_PATTERN.exec(line);
  if (diffHeaderMatch) {
    return { filePath: diffHeaderMatch[1], line: 0, message: "File requires formatting" };
  }

  // Pattern C: tagged prefix — [tag] or TAG: followed by a file path
  const taggedMatch = TAGGED_PREFIX_PATTERN.exec(line);
  if (taggedMatch) {
    return { filePath: taggedMatch[1], line: 0, message: "File requires formatting" };
  }

  // Pattern D: context-aware extractor — formatting keyword + file path
  const contextPath = extractContextAwarePath(line);
  if (contextPath !== null) {
    return { filePath: contextPath, line: 0, message: "File requires formatting" };
  }

  return null;
};

// ==================== Main Parser ====================

/**
 * Parse lint/compile errors from raw CI log output.
 *
 * Supports:
 * - Stylish format (ESLint, Biome, stylelint) — file path on its own line, errors indented
 * - Colon-delimited format (Pylint, Flake8, Rubocop, Clippy, golangci-lint) — file:line:col: message
 * - TypeScript compiler (tsc) — file(line,col): error TSxxxx: message
 * - Format checkers (any language) — structural patterns (diff headers, tagged
 *   prefixes, formatting keywords), and bare file path fallback
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
  const cleaned = stripAnsiEscapes(log)
    .replace(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_ALL, "")
    .replace(TEXT_SANITIZATION_PATTERNS.CI_GROUP_ALL, "");

  const lines = cleaned.split("\n");
  const errors: LLMLintError[] = [];
  const formatErrorFiles = new Set<string>();

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
      const cleanedPath = stripCIPathPrefix(filePath);
      if (isPlausibleSourceFile(cleanedPath)) {
        errors.push({
          file: cleanedPath,
          line: Number(lineNum),
          column: Number(col),
          message,
          code,
        });
        continue;
      }
    }

    // Check for colon-delimited format (file.py:12:5: E302 message)
    const colonMatch = COLON_DELIMITED_PATTERN.exec(trimmed);
    if (colonMatch) {
      const [, filePath, lineNum, col, tail] = colonMatch;
      const cleanedPath = stripCIPathPrefix(filePath);
      if (isPlausibleSourceFile(cleanedPath)) {
        const { code, message } = parseCodeAndMessage(tail);
        errors.push({
          file: cleanedPath,
          line: Number(lineNum),
          column: Number(col),
          message,
          code,
        });
        continue;
      }
    }

    // Check for format checker output (structural pattern matching)
    const formatMatch = matchFormatChecker(trimmed);
    if (formatMatch) {
      const cleanedPath = stripCIPathPrefix(formatMatch.filePath);
      if (isPlausibleSourceFile(cleanedPath) && !formatErrorFiles.has(cleanedPath)) {
        formatErrorFiles.add(cleanedPath);
        errors.push({
          file: cleanedPath,
          line: formatMatch.line,
          code: "format",
          message: formatMatch.message,
        });
      }
      continue;
    }

    // Check if this line is a file path (stylish format prints paths flush-left)
    const pathMatch = FILE_PATH_PATTERN.exec(trimmed);
    if (pathMatch) {
      currentFile = stripCIPathPrefix(pathMatch[1]);
    }
  }

  // Tier 3 fallback: if no errors found by ANY parser, treat bare file paths as format errors.
  // Safe because parseLintOutput is only called on lint/format CI jobs (filtered by LINT_JOB_KEYWORDS).
  // Catches: gofmt -l, shfmt -l, terraform fmt -check, swift-format, nixfmt, etc.
  if (errors.length === 0) {
    const fallbackErrors = lines
      .map((fileLine) => fileLine.trim())
      .filter((fileLine) => fileLine.length > 0)
      .reduce<readonly LLMLintError[]>((acc, fileLine) => {
        const bareMatch = FILE_PATH_PATTERN.exec(fileLine);
        if (!bareMatch) {
          return acc;
        }
        const cleanedPath = stripCIPathPrefix(bareMatch[1]);
        if (!isPlausibleSourceFile(cleanedPath) || formatErrorFiles.has(cleanedPath)) {
          return acc;
        }
        formatErrorFiles.add(cleanedPath);
        return [
          ...acc,
          { file: cleanedPath, line: 0, code: "format", message: "File requires formatting" },
        ];
      }, []);

    return [...errors, ...fallbackErrors];
  }

  return errors;
};
