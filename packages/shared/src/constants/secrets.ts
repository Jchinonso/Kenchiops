/**
 * Secret detection and redaction constants.
 */

/**
 * Placeholder text used to replace redacted secrets.
 */
export const REDACTION_PLACEHOLDER = "[REDACTED]" as const;

/**
 * Secret pattern configuration type.
 */
export type SecretPattern = {
  readonly name: string;
  readonly pattern: RegExp;
};

/**
 * Compiled regex patterns for detecting secrets in text.
 * These patterns are designed to catch common secret formats
 * with high precision to avoid false positives.
 */
export const SECRET_PATTERNS: Readonly<SecretPattern[]> = [
  // AWS Keys
  {
    name: "AWS Access Key ID",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  {
    name: "AWS Secret Access Key",
    pattern: /\b([A-Za-z0-9/+=]{40})(?=\s|$|"|')/g,
  },
  // GitHub Tokens
  {
    name: "GitHub Personal Access Token",
    pattern: /\b(ghp_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub OAuth Token",
    pattern: /\b(gho_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub App Token",
    pattern: /\b(ghu_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub Server Token",
    pattern: /\b(ghs_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub Refresh Token",
    pattern: /\b(ghr_[A-Za-z0-9]{36})\b/g,
  },
  // Slack Tokens
  {
    name: "Slack Bot Token",
    pattern: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
  },
  {
    name: "Slack User Token",
    pattern: /\b(xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
  },
  {
    name: "Slack App Token",
    pattern: /\b(xapp-[0-9]-[A-Z0-9]{10,13}-[0-9]{13}-[a-f0-9]{64})\b/g,
  },
  // API Keys (generic patterns)
  {
    name: "Generic API Key",
    pattern: /\b(api[_-]?key|apikey)[=:]["']?([A-Za-z0-9_-]{20,})["']?/gi,
  },
  {
    name: "Generic Secret Key",
    pattern: /\b(secret[_-]?key|secretkey)[=:]["']?([A-Za-z0-9_-]{20,})["']?/gi,
  },
  {
    name: "Generic Access Token",
    pattern: /\b(access[_-]?token|accesstoken)[=:]["']?([A-Za-z0-9_-]{20,})["']?/gi,
  },
  // Private Keys
  {
    name: "RSA Private Key",
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
  },
  {
    name: "Private Key",
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
  },
  {
    name: "EC Private Key",
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
  },
  {
    name: "OpenSSH Private Key",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
  },
  // Database Connection Strings
  {
    name: "PostgreSQL Connection String",
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "MySQL Connection String",
    pattern: /mysql:\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "MongoDB Connection String",
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "Redis Connection String",
    pattern: /redis:\/\/[^:]*:[^@]+@[^\s]+/gi,
  },
  // OpenAI / Anthropic API Keys
  {
    name: "OpenAI API Key",
    pattern: /\b(sk-[A-Za-z0-9]{20,})\b/g,
  },
  {
    name: "OpenAI Project Key",
    pattern: /\b(sk-proj-[A-Za-z0-9]{20,})\b/g,
  },
  {
    name: "Anthropic API Key",
    pattern: /\b(sk-ant-[A-Za-z0-9-]{80,})\b/g,
  },
  // JWT Tokens
  {
    name: "JWT Token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  // NPM Tokens
  {
    name: "NPM Token",
    pattern: /\b(npm_[A-Za-z0-9]{36})\b/g,
  },
  // Stripe Keys
  {
    name: "Stripe Secret Key",
    pattern: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,
  },
  {
    name: "Stripe Test Key",
    pattern: /\b(sk_test_[A-Za-z0-9]{24,})\b/g,
  },
  // SendGrid
  {
    name: "SendGrid API Key",
    pattern: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,
  },
  // Twilio
  {
    name: "Twilio Auth Token",
    pattern: /\b(SK[a-f0-9]{32})\b/g,
  },
  // Password patterns in config/env files
  {
    name: "Password Assignment",
    pattern: /\b(password|passwd|pwd)[=:]["']?([^\s"']{8,})["']?/gi,
  },
  // Bearer tokens in headers
  {
    name: "Bearer Token",
    pattern: /\bBearer\s+([A-Za-z0-9_\-.]{20,})\b/g,
  },
  // Basic Auth
  {
    name: "Basic Auth",
    pattern: /\bBasic\s+([A-Za-z0-9+/=]{20,})\b/g,
  },
] as const;

/**
 * Field names that should be completely excluded from any output.
 * These fields often contain sensitive data regardless of pattern matching.
 */
export const FORBIDDEN_FIELDS: Readonly<Set<string>> = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "accesstoken",
  "access-token",
  "auth_token",
  "authtoken",
  "auth-token",
  "private_key",
  "privatekey",
  "private-key",
  "secret_key",
  "secretkey",
  "secret-key",
  "encryption_key",
  "encryptionkey",
  "signing_key",
  "signingkey",
  "bearer",
  "authorization",
  // Note: "credentials" and "token" removed - too aggressive, often used for nested objects
]);
