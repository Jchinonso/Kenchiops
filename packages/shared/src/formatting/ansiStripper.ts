/**
 * ANSI Stripper & GitLab Log Cleaner
 *
 * Utilities for cleaning raw CI log output:
 * - stripAnsiCodes: removes all ANSI escape sequences (re-exported from preprocessing)
 * - stripOscSequences: removes Operating System Command sequences
 * - stripCharsetSelection: removes character set selection sequences
 * - stripCarriageReturns: removes carriage return characters
 * - stripGitLabSections: removes GitLab CI section_start/section_end markers
 * - cleanGitLabLog: composes all strippers for complete GitLab log cleanup
 *
 * @module formatting/ansiStripper
 */

import { TEXT_SANITIZATION_PATTERNS } from "../constants/githubStatus.js";

// ==================== ANSI & Terminal Sequence Strippers ====================

/**
 * Remove ANSI escape codes from text.
 * Handles color codes, cursor movement, SGR, and other CSI sequences.
 * Uses the shared comprehensive ANSI pattern.
 */
export const stripAnsiEscapes = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.ANSI_ESCAPE_CODES, "");

/**
 * Remove Operating System Command (OSC) sequences.
 * Format: ESC ] ... BEL  (used for terminal title setting, hyperlinks, etc.)
 */
// eslint-disable-next-line no-control-regex -- Intentional: matching OSC escape sequences
const OSC_PATTERN = /\x1b\].*?\x07/g;
export const stripOscSequences = (text: string): string => text.replace(OSC_PATTERN, "");

/**
 * Remove character set selection sequences.
 * Format: ESC ( B, ESC ) 0, etc. (used by terminals for charset switching)
 */
// eslint-disable-next-line no-control-regex -- Intentional: matching charset selection sequences
const CHARSET_PATTERN = /\x1b[()][AB012]/g;
export const stripCharsetSelection = (text: string): string => text.replace(CHARSET_PATTERN, "");

/**
 * Remove carriage return characters that appear in CI logs
 * (often paired with line feeds for Windows-style line endings,
 * or used for overwriting lines in progress indicators).
 */
export const stripCarriageReturns = (text: string): string => text.replace(/\r/g, "");

// ==================== GitLab Section Markers ====================

/**
 * Remove GitLab CI section markers from log output.
 * GitLab uses section_start/section_end markers for collapsible sections.
 * Format: section_start:timestamp:name[collapsed=true]\r\e[0K
 *         section_end:timestamp:name\r\e[0K
 *
 * Uses the shared CI_GROUP_GITLAB pattern for consistency.
 */
export const stripGitLabSections = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_GROUP_GITLAB, "");

// ==================== Composed Cleaner ====================

/**
 * Clean GitLab CI job log output by removing all terminal artifacts.
 *
 * Applies in order:
 * 1. ANSI escape codes (colors, cursor, SGR)
 * 2. OSC sequences (terminal title, hyperlinks)
 * 3. Character set selection sequences
 * 4. GitLab section markers (collapsible sections)
 * 5. Carriage returns (Windows-style line endings, overwrite indicators)
 */
export const cleanGitLabLog = (rawLog: string): string => {
  const withoutAnsi = stripAnsiEscapes(rawLog);
  const withoutOsc = stripOscSequences(withoutAnsi);
  const withoutCharset = stripCharsetSelection(withoutOsc);
  const withoutSections = stripGitLabSections(withoutCharset);
  return stripCarriageReturns(withoutSections);
};
