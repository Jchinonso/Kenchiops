/**
 * GitHub Status and Annotation Constants
 *
 * Status values, conclusions, annotation levels, and text sanitization patterns.
 *
 * @module constants/githubStatus
 */

// ==================== Check Run Status ====================

/**
 * GitHub check run and workflow status values.
 */
export const GITHUB_STATUS = {
  COMPLETED: "completed",
  IN_PROGRESS: "in_progress",
  QUEUED: "queued",
} as const;

/**
 * GitHub check run conclusion values.
 */
export const GITHUB_CONCLUSION = {
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
  TIMED_OUT: "timed_out",
  STALE: "stale",
  NEUTRAL: "neutral",
  ACTION_REQUIRED: "action_required",
} as const;

// ==================== Annotation Levels ====================

/**
 * GitHub annotation severity levels.
 */
export const GITHUB_ANNOTATION_LEVEL = {
  FAILURE: "failure",
  WARNING: "warning",
  NOTICE: "notice",
} as const;

// ==================== Text Sanitization ====================

/**
 * Text sanitization patterns for annotation messages and log preprocessing.
 * Supports multiple CI platforms: GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps.
 */
export const TEXT_SANITIZATION_PATTERNS = {
  /**
   * Comprehensive pattern to match ANSI escape codes for terminal colors/formatting.
   * Matches SGR (Select Graphic Rendition) sequences and other control codes.
   * Use this for thorough ANSI removal.
   */
  ANSI_ESCAPE_CODES:
    // eslint-disable-next-line no-control-regex -- Intentional: matching ANSI escape sequences
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
  /**
   * Simple ANSI escape pattern for basic log preprocessing.
   * Matches ESC[...m sequences commonly used for colors.
   * @deprecated Use ANSI_ESCAPE_CODES for more thorough removal.
   */
  // eslint-disable-next-line no-control-regex -- Intentional: matching ANSI escape sequences
  ANSI_SIMPLE: /\x1b\[[0-9;]*m/g,

  // =========================================================================
  // CI Timestamp Patterns (Multi-Platform)
  // =========================================================================

  /**
   * GitHub Actions timestamp pattern.
   * Format: 2025-12-28T17:31:34.1659529Z
   * ISO 8601 with optional high-precision fractional seconds.
   */
  CI_TIMESTAMP_GITHUB: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm,

  /**
   * GitLab CI timestamp patterns.
   * Formats:
   * - [2025-01-16 10:30:45] (bracketed datetime)
   * - 2025-01-16 10:30:45.123 (space-separated datetime)
   */
  CI_TIMESTAMP_GITLAB:
    /^(?:\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*/gm,

  /**
   * CircleCI timestamp pattern.
   * Format: HH:MM:SS (time-only prefix at line start)
   */
  CI_TIMESTAMP_CIRCLECI: /^\d{2}:\d{2}:\d{2}\s+/gm,

  /**
   * Jenkins timestamp patterns.
   * Formats:
   * - [2025-01-16T10:30:45.123Z] (bracketed ISO 8601)
   * - [Pipeline] prefix markers
   * - Timestamper plugin: [2025-01-16 10:30:45]
   */
  CI_TIMESTAMP_JENKINS: /^(?:\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\])\s*/gm,

  /**
   * Azure DevOps timestamp pattern.
   * Format: 2025-01-16T10:30:45.1234567Z (ISO 8601 with nanosecond precision)
   */
  CI_TIMESTAMP_AZURE: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/gm,

  /**
   * Combined CI timestamp pattern for all platforms.
   * Use this for universal timestamp stripping.
   */
  CI_TIMESTAMP_ALL:
    /^(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z|\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\]|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?|\d{2}:\d{2}:\d{2})\s*/gm,

  // =========================================================================
  // CI Grouping/Section Markers (Multi-Platform)
  // =========================================================================

  /**
   * GitHub Actions group markers.
   * Format: ##[group]name, ##[endgroup]
   */
  CI_GROUP_GITHUB: /^##\[(?:group|endgroup)\].*$/gm,

  /**
   * GitLab CI section markers.
   * Format: section_start:timestamp:name[collapsed=true]\r\e[0K
   *         section_end:timestamp:name\r\e[0K
   * Strips entire line including the marker.
   */
  CI_GROUP_GITLAB: /^section_(?:start|end):\d+:[^\r\n]*$/gm,

  /**
   * CircleCI step/command markers.
   * Formats:
   * - #!/bin/bash -eo pipefail (shell invocation lines)
   * Note: Step names like "Spin up environment" are kept as they may contain useful context.
   */
  CI_GROUP_CIRCLECI: /^#!\/bin\/bash[^\n]*$/gm,

  /**
   * Jenkins pipeline markers.
   * Format: [Pipeline] Stage, [Pipeline] node, [Pipeline] Start/End of Pipeline
   * Only matches explicit [Pipeline] prefix lines, not error messages.
   */
  CI_GROUP_JENKINS:
    /^\[Pipeline\]\s+(?:Stage|node|Start of Pipeline|End of Pipeline|echo|sh|script|withEnv|stage|step|dir|timeout).*$/gm,

  /**
   * Azure DevOps command markers.
   * Formats:
   * - ##[section]Starting: task_name
   * - ##[command]command_text
   * Note: ##[debug/warning/error] are kept as they contain diagnostic info.
   */
  CI_GROUP_AZURE: /^##\[(?:section|command)\].*$/gm,

  /**
   * Combined CI group/section markers for all platforms.
   * Use this for universal marker stripping.
   * Conservative: keeps log level markers (debug/warning/error) as they contain useful info.
   */
  CI_GROUP_ALL:
    /^(?:##\[(?:group|endgroup|section|command)\].*|section_(?:start|end):\d+:[^\r\n]*|\[Pipeline\]\s+(?:Stage|node|Start of Pipeline|End of Pipeline|echo|sh|script|withEnv|stage|step|dir|timeout).*|#!\/bin\/bash[^\n]*)$/gm,

  // =========================================================================
  // Legacy Aliases (Backward Compatibility)
  // =========================================================================

  /**
   * @deprecated Use CI_TIMESTAMP_GITHUB or CI_TIMESTAMP_ALL instead.
   */
  CI_TIMESTAMP: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm,

  /**
   * @deprecated Use CI_GROUP_GITHUB or CI_GROUP_ALL instead.
   */
  CI_GROUP_MARKERS: /^##\[(?:group|endgroup)\].*$/gm,
} as const;
