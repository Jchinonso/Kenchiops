/**
 * Application Configuration
 *
 * Centralized configuration loader with validation.
 * All services should import from this module instead of reading process.env directly.
 *
 * @module core/config
 */

import dotenv from "dotenv";
import { ValidationError } from "./errors.js";
import { CONFIG_DEFAULTS, VALID_NODE_ENVS, PARSE_INT_RADIX } from "../constants/index.js";
import type { Config, NodeEnvironment } from "./types.js";

// Load environment variables once, at process start.
dotenv.config();

/** Re-export Config type for backward compatibility. */
export type { Config, NodeEnvironment };

// ==================== Constants ====================

/** String value representing boolean true in environment variables. */
const ENV_BOOLEAN_TRUE = "true";

// ==================== Parsing Result Types ====================

/** Result of parsing a numeric value from environment variable. */
type ParseNumericResult =
  | { readonly success: true; readonly value: number }
  | { readonly success: false };

// ==================== Parser Helpers ====================

/**
 * Parses an integer from a string value.
 * Returns a discriminated union for explicit success/failure handling.
 */
const parseInteger = (value: string): ParseNumericResult => {
  const parsed = parseInt(value, PARSE_INT_RADIX);
  return Number.isNaN(parsed) ? { success: false } : { success: true, value: parsed };
};

/**
 * Parses a float from a string value.
 * Returns a discriminated union for explicit success/failure handling.
 */
const parseFloating = (value: string): ParseNumericResult => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? { success: false } : { success: true, value: parsed };
};

/**
 * Checks if an environment variable value is empty or undefined.
 */
const isEmptyEnvValue = (value: string | undefined): value is undefined | "" =>
  value === undefined || value === "";

/**
 * Parses an integer environment variable with a default fallback.
 */
const parseIntegerEnv = (value: string | undefined, defaultValue: number): number => {
  if (isEmptyEnvValue(value)) {
    return defaultValue;
  }
  const result = parseInteger(value);
  return result.success ? result.value : defaultValue;
};

/**
 * Parses an optional integer environment variable.
 * Returns undefined if not set, default value if set but invalid.
 */
const parseOptionalIntegerEnv = (
  value: string | undefined,
  defaultValue: number
): number | undefined => {
  if (isEmptyEnvValue(value)) {
    return undefined;
  }
  const result = parseInteger(value);
  return result.success ? result.value : defaultValue;
};

/**
 * Parses an optional float environment variable.
 * Returns undefined if not set or invalid.
 */
const parseOptionalFloatEnv = (value: string | undefined): number | undefined => {
  if (isEmptyEnvValue(value)) {
    return undefined;
  }
  const result = parseFloating(value);
  return result.success ? result.value : undefined;
};

/**
 * Parses a boolean environment variable.
 * Only "true" (case-sensitive) is considered true.
 */
const parseBooleanEnv = (value: string | undefined): boolean => value === ENV_BOOLEAN_TRUE;

/**
 * Retrieves an optional string environment variable with a default fallback.
 */
const getOptionalEnv = (value: string | undefined, defaultValue: string): string =>
  isEmptyEnvValue(value) ? defaultValue : value;

// ==================== Validation Helpers ====================

/**
 * Validates and retrieves a required environment variable.
 * Throws ValidationError if the variable is not set or empty.
 */
const requireEnv = (key: string, value: string | undefined): string => {
  if (value === undefined || value.trim() === "") {
    throw new ValidationError(`Required environment variable ${key} is not set`);
  }
  return value;
};

/**
 * Validates NODE_ENV value against allowed values.
 * Returns default if invalid or not set.
 */
const validateNodeEnv = (value: string | undefined): NodeEnvironment => {
  const defaultEnv = CONFIG_DEFAULTS.NODE_ENV as NodeEnvironment;

  if (isEmptyEnvValue(value)) {
    return defaultEnv;
  }

  const isValidEnv = VALID_NODE_ENVS.includes(value as NodeEnvironment);
  return isValidEnv ? (value as NodeEnvironment) : defaultEnv;
};

// ==================== Configuration ====================

/**
 * Centralized application configuration with validation.
 * Throws ValidationError if required variables are missing.
 */
export const config: Config = {
  // OpenAI Configuration
  OPENAI_API_KEY: requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_MAX_TOKENS: parseOptionalIntegerEnv(
    process.env.OPENAI_MAX_TOKENS,
    CONFIG_DEFAULTS.OPENAI_MAX_TOKENS
  ),
  OPENAI_TEMPERATURE: parseOptionalFloatEnv(process.env.OPENAI_TEMPERATURE),
  OPENAI_TIMEOUT_MS: parseOptionalIntegerEnv(
    process.env.OPENAI_TIMEOUT_MS,
    CONFIG_DEFAULTS.OPENAI_TIMEOUT_MS
  ),

  // Slack Configuration (single-tenant mode)
  SLACK_BOT_TOKEN: requireEnv("SLACK_BOT_TOKEN", process.env.SLACK_BOT_TOKEN),
  SLACK_SIGNING_SECRET: requireEnv("SLACK_SIGNING_SECRET", process.env.SLACK_SIGNING_SECRET),
  SLACK_APP_LEVEL_TOKEN: requireEnv("SLACK_APP_LEVEL_TOKEN", process.env.SLACK_APP_LEVEL_TOKEN),

  // Slack OAuth Configuration (multi-tenant mode)
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI,

  // GitHub Configuration
  GITHUB_APP_ID: requireEnv("GITHUB_APP_ID", process.env.GITHUB_APP_ID),
  GITHUB_APP_PRIVATE_KEY: requireEnv("GITHUB_APP_PRIVATE_KEY", process.env.GITHUB_APP_PRIVATE_KEY),
  GITHUB_INSTALLATION_ID: requireEnv("GITHUB_INSTALLATION_ID", process.env.GITHUB_INSTALLATION_ID),
  GITHUB_WEBHOOK_SECRET: requireEnv("GITHUB_WEBHOOK_SECRET", process.env.GITHUB_WEBHOOK_SECRET),
  GITHUB_APP_SLUG: getOptionalEnv(process.env.GITHUB_APP_SLUG, CONFIG_DEFAULTS.GITHUB_APP_SLUG),

  // Database Configuration
  DATABASE_URL: requireEnv("DATABASE_URL", process.env.DATABASE_URL),
  VECTOR_DB_URL: requireEnv("VECTOR_DB_URL", process.env.VECTOR_DB_URL),

  // General Configuration
  NODE_ENV: validateNodeEnv(process.env.NODE_ENV),
  PORT: parseIntegerEnv(process.env.PORT, CONFIG_DEFAULTS.PORT),

  // Multi-tenant Configuration
  MULTI_TENANT_MODE: parseBooleanEnv(process.env.MULTI_TENANT_MODE),

  // Feature Flags
  SIMPLIFIED_PIPELINE_ENABLED: parseBooleanEnv(process.env.SIMPLIFIED_PIPELINE_ENABLED),

  // Service URLs (for inter-service communication)
  API_URL: getOptionalEnv(process.env.API_URL, CONFIG_DEFAULTS.API_URL),
  SLACK_BOT_URL: getOptionalEnv(process.env.SLACK_BOT_URL, CONFIG_DEFAULTS.SLACK_BOT_URL),
  GITHUB_APP_URL: getOptionalEnv(process.env.GITHUB_APP_URL, CONFIG_DEFAULTS.GITHUB_APP_URL),

  // Redis Configuration
  REDIS_URL: getOptionalEnv(process.env.REDIS_URL, CONFIG_DEFAULTS.REDIS_URL),
} as const;
