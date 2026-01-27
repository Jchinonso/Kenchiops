/**
 * Output Sanitization Module
 *
 * Sanitizes LLM outputs before display or execution.
 * Prevents injection attacks, removes sensitive data, and ensures safe output.
 *
 * @module safety/validation/sanitization
 */

import type { OutputSanitizationResult, CommandValidationResult } from "../types.js";
import { SANITIZATION_CONFIG, COMMAND_RISK_THRESHOLDS } from "../../constants/validation.js";

// ==================== Constants ====================

/**
 * Patterns for dangerous shell metacharacters and operators.
 */
const DANGEROUS_SHELL_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly name: string;
  readonly severity: "high" | "medium" | "low";
}> = [
  // Command chaining/injection
  { pattern: /;\s*(?!$)/, name: "command_chaining", severity: "high" },
  { pattern: /\|\s*(?!$)/, name: "pipe_operator", severity: "medium" },
  { pattern: /&&/, name: "and_operator", severity: "medium" },
  { pattern: /\|\|/, name: "or_operator", severity: "medium" },

  // Dangerous redirections
  { pattern: />\s*\//, name: "root_redirect", severity: "high" },
  { pattern: />\s*~/, name: "home_redirect", severity: "high" },
  { pattern: /2>&1/, name: "stderr_redirect", severity: "low" },

  // Command substitution
  { pattern: /\$\(/, name: "command_substitution", severity: "high" },
  { pattern: /`[^`]+`/, name: "backtick_substitution", severity: "high" },

  // Variable expansion (potential for injection)
  { pattern: /\$\{[^}]+\}/, name: "variable_expansion", severity: "medium" },

  // Dangerous commands
  { pattern: /\brm\s+-rf?\s/, name: "recursive_delete", severity: "high" },
  { pattern: /\bdd\s+if=/, name: "disk_write", severity: "high" },
  { pattern: /\bmkfs/, name: "filesystem_format", severity: "high" },
  { pattern: /\bchmod\s+777/, name: "open_permissions", severity: "high" },
  { pattern: /\bchown\s+-R/, name: "recursive_chown", severity: "medium" },
  { pattern: /\bcurl\s+.{1,500}\|\s*(?:ba)?sh/, name: "curl_pipe_shell", severity: "high" },
  { pattern: /\bwget\s+.{1,500}\|\s*(?:ba)?sh/, name: "wget_pipe_shell", severity: "high" },
  { pattern: /\beval\s/, name: "eval_command", severity: "high" },
  { pattern: /\bexec\s/, name: "exec_command", severity: "high" },
] as const;

/**
 * Patterns for sensitive data that should be redacted.
 */
const SENSITIVE_DATA_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly name: string;
}> = [
  // API keys and tokens
  {
    pattern:
      /(?:api[_-]?key|apikey|token|secret|password|pwd|auth)\s*[:=]\s*['"]?[\w-]{20,}['"]?/gi,
    replacement: "[REDACTED_CREDENTIAL]",
    name: "credential",
  },
  // AWS keys
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: "[REDACTED_AWS_KEY]",
    name: "aws_key",
  },
  // GitHub tokens (ghp_, ghu_, gho_, ghs_, ghr_)
  {
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
    name: "github_token",
  },
  // Slack tokens (xoxb-, xoxa-, xoxp-, xoxr-)
  {
    pattern: /xox[barp]-[A-Za-z0-9-]{24,}/g,
    replacement: "[REDACTED_SLACK_TOKEN]",
    name: "slack_token",
  },
  // Google API keys
  {
    pattern: /AIza[A-Za-z0-9_-]{35}/g,
    replacement: "[REDACTED_GOOGLE_KEY]",
    name: "google_key",
  },
  // Stripe keys
  {
    pattern: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g,
    replacement: "[REDACTED_STRIPE_KEY]",
    name: "stripe_key",
  },
  // Private keys
  {
    pattern:
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
    name: "private_key",
  },
  // JWT tokens
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "[REDACTED_JWT]",
    name: "jwt",
  },
  // Connection strings
  {
    pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/gi,
    replacement: "[REDACTED_CONNECTION_STRING]",
    name: "connection_string",
  },
  // Email addresses (optional, configurable)
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[REDACTED_EMAIL]",
    name: "email",
  },
] as const;

/**
 * HTML/XSS dangerous patterns.
 */
const XSS_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly name: string;
}> = [
  { pattern: /<script[\s>]/i, name: "script_tag" },
  { pattern: /javascript:/i, name: "javascript_protocol" },
  { pattern: /on\w+\s*=/i, name: "event_handler" },
  { pattern: /<iframe/i, name: "iframe_tag" },
  { pattern: /<object/i, name: "object_tag" },
  { pattern: /<embed/i, name: "embed_tag" },
  { pattern: /<link\s+.*href/i, name: "link_tag" },
] as const;

// ==================== Core Functions ====================

/**
 * Escapes HTML entities to prevent XSS.
 *
 * @param text - Text to escape
 * @returns HTML-escaped text
 */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * Detects XSS patterns in text.
 *
 * @param text - Text to check
 * @returns Array of detected XSS pattern names
 */
const detectXssPatterns = (text: string): string[] =>
  XSS_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);

/** Result of redacting sensitive data */
interface RedactSensitiveResult {
  readonly text: string;
  readonly appliedRules: readonly string[];
}

/**
 * Redacts sensitive data from text.
 *
 * @param text - Text to redact
 * @returns Object with redacted text and applied rules
 */
const redactSensitiveData = (text: string): RedactSensitiveResult =>
  SENSITIVE_DATA_PATTERNS.reduce<RedactSensitiveResult>(
    (accumulator, { pattern, replacement, name }) => {
      // Reset regex state for global patterns to avoid state bugs across calls
      pattern.lastIndex = 0;
      if (!pattern.test(accumulator.text)) {
        return accumulator;
      }
      // Reset again before replace since test() advanced lastIndex
      pattern.lastIndex = 0;
      return {
        text: accumulator.text.replace(pattern, replacement),
        appliedRules: [...accumulator.appliedRules, name],
      };
    },
    { text, appliedRules: [] }
  );

// ==================== Exports ====================

/**
 * Sanitizes LLM output for safe display.
 * Removes XSS vectors and redacts sensitive data.
 *
 * @param output - Raw LLM output
 * @param options - Sanitization options
 * @returns Sanitization result
 */
export const sanitizeLLMOutput = (
  output: string,
  options: {
    escapeHtml?: boolean;
    redactSecrets?: boolean;
  } = {}
): OutputSanitizationResult => {
  // Handle empty or invalid input
  if (!output || output.length === 0) {
    return {
      sanitized: "",
      wasModified: false,
      appliedRules: [],
      warnings: [],
    };
  }

  const { escapeHtml: shouldEscapeHtml = true, redactSecrets = true } = options;

  // Truncate input to prevent DoS from very large inputs
  const truncatedOutput =
    output.length > SANITIZATION_CONFIG.MAX_INPUT_LENGTH
      ? output.slice(0, SANITIZATION_CONFIG.MAX_INPUT_LENGTH)
      : output;

  const appliedRules: string[] = [];
  const warnings: string[] = [];

  if (truncatedOutput.length < output.length) {
    warnings.push(
      `Input truncated from ${output.length} to ${SANITIZATION_CONFIG.MAX_INPUT_LENGTH} characters`
    );
  }

  let sanitized = truncatedOutput;

  // Detect XSS patterns
  const xssPatterns = detectXssPatterns(sanitized);
  if (xssPatterns.length > 0) {
    warnings.push(`Detected potentially dangerous patterns: ${xssPatterns.join(", ")}`);
  }

  // Escape HTML if requested
  if (shouldEscapeHtml) {
    const escaped = escapeHtml(sanitized);
    if (escaped !== sanitized) {
      appliedRules.push("html_escape");
      sanitized = escaped;
    }
  }

  // Redact sensitive data if requested
  if (redactSecrets) {
    const redacted = redactSensitiveData(sanitized);
    if (redacted.appliedRules.length > 0) {
      appliedRules.push(...redacted.appliedRules.map((rule) => `redact_${rule}`));
      sanitized = redacted.text;
    }
  }

  return {
    sanitized,
    wasModified: appliedRules.length > 0,
    appliedRules,
    warnings,
  };
};

/**
 * Validates a command string for dangerous patterns.
 * Does NOT execute the command - only analyzes it.
 *
 * @param command - Command string to validate
 * @returns Validation result
 */
export const validateCommand = (command: string): CommandValidationResult => {
  // Handle empty or invalid input
  if (!command || command.trim().length === 0) {
    return {
      isSafe: false,
      risks: ["empty_command"],
      riskLevel: "low",
      alternative: "Provide a non-empty command",
    };
  }

  // Truncate command to prevent DoS
  const truncatedCommand =
    command.length > SANITIZATION_CONFIG.MAX_COMMAND_LENGTH
      ? command.slice(0, SANITIZATION_CONFIG.MAX_COMMAND_LENGTH)
      : command;

  const truncationRisks: readonly string[] =
    truncatedCommand.length < command.length ? ["command_truncated"] : [];

  const patternRisks = DANGEROUS_SHELL_PATTERNS.filter(({ pattern }) => {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    return pattern.test(truncatedCommand);
  }).map(({ name, severity }) => `${name} (${severity})`);

  const risks = [...truncationRisks, ...patternRisks];

  const highRisks = risks.filter((risk) => risk.includes("(high)"));
  const mediumRisks = risks.filter((risk) => risk.includes("(medium)"));

  // Risk level lookup table - first match wins
  const getRiskLevel = (): "low" | "medium" | "high" | "critical" => {
    if (highRisks.length >= COMMAND_RISK_THRESHOLDS.CRITICAL_HIGH_RISK_COUNT) {
      return "critical";
    }
    if (highRisks.length === 1) {
      return "high";
    }
    if (mediumRisks.length > 0) {
      return "medium";
    }
    return "low";
  };

  const riskLevel = getRiskLevel();

  return {
    isSafe: highRisks.length === 0,
    risks,
    riskLevel,
    alternative:
      highRisks.length > 0 ? "Consider breaking this into separate, simpler commands" : undefined,
  };
};

/**
 * Checks if a string contains potential code injection.
 *
 * @param input - Input string to check
 * @returns True if injection detected
 */
export const hasCodeInjection = (input: string): boolean => {
  // Handle empty or invalid input
  if (!input || input.length === 0) {
    return false;
  }

  // Truncate input to prevent DoS
  const truncatedInput =
    input.length > SANITIZATION_CONFIG.MAX_INPUT_LENGTH
      ? input.slice(0, SANITIZATION_CONFIG.MAX_INPUT_LENGTH)
      : input;

  // Bounded patterns to prevent excessive backtracking on hostile input
  const injectionPatterns = [
    /\$\{.{1,200}\}/, // Template literals (bounded)
    /\$\(.{1,200}\)/, // Command substitution (bounded)
    /`[^`]{1,200}`/, // Backtick execution (bounded)
    /;\s*(?:rm|dd|mkfs|chmod|chown|curl|wget)\s/, // Dangerous command chaining
    /\beval\s*\(/, // eval()
    /\bnew\s+Function\s*\(/, // new Function()
    /\bexec\s*\(/, // exec()
  ];

  return injectionPatterns.some((pattern) => pattern.test(truncatedInput));
};

/**
 * Sanitizes a file path to prevent path traversal.
 * Uses segment-based detection to catch traversal attempts.
 *
 * @param path - File path to sanitize (relative paths only)
 * @returns Sanitized path or null if unsafe
 */
export const sanitizeFilePath = (path: string): string | null => {
  // Handle empty or invalid input
  if (!path || path.length === 0) {
    return null;
  }

  // Reject paths that exceed maximum length
  if (path.length > SANITIZATION_CONFIG.MAX_PATH_LENGTH) {
    return null;
  }

  // Remove null bytes
  const clean = path.replace(/\0/g, "");

  // Reject absolute paths (Unix or Windows)
  if (clean.startsWith("/") || /^[a-zA-Z]:/.test(clean)) {
    return null;
  }

  // Split into segments and check each one for traversal
  const segments = clean.split(/[/\\]/);
  const hasTraversal = segments.some((segment) => segment === ".." || segment === ".");

  if (hasTraversal) {
    return null;
  }

  // Remove potentially dangerous characters from the path
  const sanitized = clean.replace(/[<>:"|?*]/g, "");

  // Reject empty paths or paths that become empty after sanitization
  if (sanitized.length === 0) {
    return null;
  }

  // Re-check segments after sanitization to ensure no empty segments
  const sanitizedSegments = sanitized.split(/[/\\]/).filter((segment) => segment.length > 0);
  if (sanitizedSegments.length === 0) {
    return null;
  }

  return sanitizedSegments.join("/");
};

/**
 * Redacts secrets from text without full sanitization.
 * Useful for logging.
 *
 * @param text - Text containing potential secrets
 * @returns Text with secrets redacted
 */
export const redactSecrets = (text: string): string => {
  // Handle empty or invalid input
  if (!text || text.length === 0) {
    return "";
  }

  // Truncate input to prevent DoS
  const truncatedText =
    text.length > SANITIZATION_CONFIG.MAX_INPUT_LENGTH
      ? text.slice(0, SANITIZATION_CONFIG.MAX_INPUT_LENGTH)
      : text;

  return redactSensitiveData(truncatedText).text;
};
