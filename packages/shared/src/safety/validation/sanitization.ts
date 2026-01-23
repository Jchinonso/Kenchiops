/**
 * Output Sanitization Module
 *
 * Sanitizes LLM outputs before display or execution.
 * Prevents injection attacks, removes sensitive data, and ensures safe output.
 *
 * @module safety/validation/sanitization
 */

import type { SanitizationResult, CommandValidationResult } from "../types.js";

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
  { pattern: /\bcurl\s+.*\|\s*(?:ba)?sh/, name: "curl_pipe_shell", severity: "high" },
  { pattern: /\bwget\s+.*\|\s*(?:ba)?sh/, name: "wget_pipe_shell", severity: "high" },
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

/**
 * Redacts sensitive data from text.
 *
 * @param text - Text to redact
 * @returns Object with redacted text and applied rules
 */
const redactSensitiveData = (text: string): { text: string; appliedRules: string[] } => {
  const appliedRules: string[] = [];
  let result = text;

  for (const { pattern, replacement, name } of SENSITIVE_DATA_PATTERNS) {
    if (pattern.test(result)) {
      appliedRules.push(name);
      result = result.replace(pattern, replacement);
    }
  }

  return { text: result, appliedRules };
};

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
): SanitizationResult => {
  const { escapeHtml: shouldEscapeHtml = true, redactSecrets = true } = options;

  const appliedRules: string[] = [];
  const warnings: string[] = [];
  let sanitized = output;

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
  const risks: string[] = [];

  for (const { pattern, name, severity } of DANGEROUS_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      risks.push(`${name} (${severity})`);
    }
  }

  const highRisks = risks.filter((risk) => risk.includes("(high)"));

  return {
    isSafe: highRisks.length === 0,
    risks,
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
  const injectionPatterns = [
    /\$\{.*\}/, // Template literals
    /\$\(.*\)/, // Command substitution
    /`[^`]+`/, // Backtick execution
    /;\s*(?:rm|dd|mkfs|chmod|chown|curl|wget)\s/, // Dangerous command chaining
    /\beval\s*\(/, // eval()
    /\bnew\s+Function\s*\(/, // new Function()
    /\bexec\s*\(/, // exec()
  ];

  return injectionPatterns.some((pattern) => pattern.test(input));
};

/**
 * Sanitizes a file path to prevent path traversal.
 *
 * @param path - File path to sanitize
 * @returns Sanitized path or null if unsafe
 */
export const sanitizeFilePath = (path: string): string | null => {
  // Remove null bytes
  const clean = path.replace(/\0/g, "");

  // Check for path traversal
  if (clean.includes("..") || clean.startsWith("/") || /^[a-zA-Z]:/.test(clean)) {
    return null;
  }

  // Remove potentially dangerous characters
  const sanitized = clean.replace(/[<>:"|?*]/g, "");

  return sanitized.length > 0 ? sanitized : null;
};

/**
 * Redacts secrets from text without full sanitization.
 * Useful for logging.
 *
 * @param text - Text containing potential secrets
 * @returns Text with secrets redacted
 */
export const redactSecrets = (text: string): string => redactSensitiveData(text).text;
