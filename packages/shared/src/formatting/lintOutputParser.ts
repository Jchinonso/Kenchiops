/**
 * Lint Output Parser
 *
 * Parses lint/compile errors deterministically from CI runner output using regex.
 * No LLM involved — guaranteed consistent results for the same log input.
 *
 * Supports: ESLint (default/stylish formatter), TypeScript compiler (tsc).
 *
 * @module formatting/lintOutputParser
 */

import type { LLMLintError } from "../core/types.js";

// ==================== ESLint Parser ====================

/**
 * ESLint error line pattern (stylish formatter — the default):
 *   12:5   error  'foo' is defined but never used  no-unused-vars
 *   15:10  warning  Missing return type             @typescript-eslint/explicit-function-return-type
 *
 * Groups: [line, col, severity, message, rule]
 */
const ESLINT_ERROR_PATTERN = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/;

/**
 * File path line pattern for ESLint output.
 * ESLint prints file paths flush-left (no leading whitespace) on their own line,
 * ending with a code file extension.
 * Handles both absolute paths (/home/runner/...) and relative paths (src/...).
 */
const FILE_PATH_PATTERN =
  /^((?:\/[^\s]+|[a-zA-Z][^\s]*)\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|css|scss))$/;

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

// ==================== TypeScript Compiler Parser ====================

/**
 * TypeScript compiler error pattern:
 *   src/file.ts(12,5): error TS2304: Cannot find name 'foo'.
 *
 * Groups: [file, line, col, code, message]
 */
const TSC_ERROR_PATTERN = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+?)\s*$/;

// ==================== Main Parser ====================

/**
 * Parse lint/compile errors from raw CI log output.
 *
 * Supports ESLint (stylish formatter) and TypeScript compiler output.
 * Returns structured lint errors with file paths, line numbers, and rule codes.
 *
 * @param log - Raw CI log output (may include timestamps, ANSI codes, etc.)
 * @returns Array of parsed lint errors
 */
export const parseLintOutput = (log: string): readonly LLMLintError[] => {
  if (!log) {
    return [];
  }

  const lines = log.split("\n");
  const eslintErrors: LLMLintError[] = [];
  const tscErrors: LLMLintError[] = [];

  // let: tracks current file context as we scan ESLint output line-by-line
  let currentFile: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    // Check for ESLint error line (indented: "  12:5  error  message  rule")
    const eslintMatch = ESLINT_ERROR_PATTERN.exec(line);
    if (eslintMatch && currentFile) {
      const [, lineNum, col, , message, rule] = eslintMatch;
      eslintErrors.push({
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
      const [, filePath, lineNum, col, , code, message] = tscMatch;
      tscErrors.push({
        file: stripCIPathPrefix(filePath),
        line: Number(lineNum),
        column: Number(col),
        message,
        code,
      });
      continue;
    }

    // Check if this line is a file path (ESLint prints paths flush-left)
    const pathMatch = FILE_PATH_PATTERN.exec(trimmed);
    if (pathMatch) {
      currentFile = stripCIPathPrefix(pathMatch[1]);
    }
  }

  return [...eslintErrors, ...tscErrors];
};
