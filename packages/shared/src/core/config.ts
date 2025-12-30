/**
 * Application Configuration
 *
 * Centralized configuration loader with validation.
 * All services should import from this module instead of reading process.env directly.
 */

import dotenv from "dotenv";
import { ValidationError } from "./errors.js";
import { CONFIG_DEFAULTS, VALID_NODE_ENVS, PARSE_INT_RADIX } from "../constants/index.js";

// Load environment variables once, at process start.
dotenv.config();

// ==================== Types ====================

/**
 * Application configuration interface.
 */
export interface Config {
  // OpenAI Configuration
  readonly OPENAI_API_KEY: string;
  readonly OPENAI_MODEL?: string;
  readonly OPENAI_MAX_TOKENS?: number;
  readonly OPENAI_TEMPERATURE?: number;
  readonly OPENAI_TIMEOUT_MS?: number;

  // Slack Configuration (single-tenant mode - tokens in env vars)
  readonly SLACK_BOT_TOKEN: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly SLACK_APP_LEVEL_TOKEN: string;

  // Slack OAuth Configuration (multi-tenant mode - tokens in database)
  readonly SLACK_CLIENT_ID?: string;
  readonly SLACK_CLIENT_SECRET?: string;
  readonly SLACK_REDIRECT_URI?: string;

  // GitHub Configuration
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY: string;
  readonly GITHUB_INSTALLATION_ID: string;
  readonly GITHUB_WEBHOOK_SECRET: string;
  readonly GITHUB_APP_SLUG?: string;

  // Database Configuration
  readonly DATABASE_URL: string;
  readonly VECTOR_DB_URL: string;

  // General Configuration
  readonly NODE_ENV: "development" | "production" | "test";
  readonly PORT: number;

  // Multi-tenant Configuration
  readonly MULTI_TENANT_MODE?: boolean;

  // Service URLs (for inter-service communication)
  readonly API_URL: string;
  readonly SLACK_BOT_URL: string;
  readonly GITHUB_APP_URL: string;

  // Redis Configuration
  readonly REDIS_URL: string;
}

// ==================== Parser Helpers ====================

/**
 * Parses integer from environment variable with validation.
 */
const parseIntEnv = (value: string | undefined, defaultValue: number): number => {
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, PARSE_INT_RADIX);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Parses float from environment variable with validation.
 */
const parseFloatEnv = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/**
 * Validates required environment variable.
 */
const requireEnv = (key: string, value: string | undefined): string => {
  if (!value || value.trim() === "") {
    throw new ValidationError(`Required environment variable ${key} is not set`);
  }
  return value;
};

/**
 * Validates NODE_ENV value.
 */
const validateNodeEnv = (value: string | undefined): Config["NODE_ENV"] => {
  const env = (value || CONFIG_DEFAULTS.NODE_ENV) as Config["NODE_ENV"];
  return VALID_NODE_ENVS.includes(env) ? env : CONFIG_DEFAULTS.NODE_ENV;
};

/**
 * Parse optional integer with default if undefined.
 */
const parseOptionalInt = (value: string | undefined, defaultValue: number): number | undefined =>
  value ? parseIntEnv(value, defaultValue) : undefined;

// ==================== Configuration ====================

/**
 * Centralized configuration loader with validation.
 * Throws error if required variables are missing.
 */
export const config: Config = {
  // OpenAI Configuration
  OPENAI_API_KEY: requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_MAX_TOKENS: parseOptionalInt(
    process.env.OPENAI_MAX_TOKENS,
    CONFIG_DEFAULTS.OPENAI_MAX_TOKENS
  ),
  OPENAI_TEMPERATURE: parseFloatEnv(process.env.OPENAI_TEMPERATURE),
  OPENAI_TIMEOUT_MS: parseOptionalInt(
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
  GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG || CONFIG_DEFAULTS.GITHUB_APP_SLUG,

  // Database Configuration
  DATABASE_URL: requireEnv("DATABASE_URL", process.env.DATABASE_URL),
  VECTOR_DB_URL: requireEnv("VECTOR_DB_URL", process.env.VECTOR_DB_URL),

  // General Configuration
  NODE_ENV: validateNodeEnv(process.env.NODE_ENV),
  PORT: parseIntEnv(process.env.PORT, CONFIG_DEFAULTS.PORT),

  // Multi-tenant Configuration
  MULTI_TENANT_MODE: process.env.MULTI_TENANT_MODE === "true",

  // Service URLs (for inter-service communication)
  API_URL: process.env.API_URL || CONFIG_DEFAULTS.API_URL,
  SLACK_BOT_URL: process.env.SLACK_BOT_URL || CONFIG_DEFAULTS.SLACK_BOT_URL,
  GITHUB_APP_URL: process.env.GITHUB_APP_URL || CONFIG_DEFAULTS.GITHUB_APP_URL,

  // Redis Configuration
  REDIS_URL: process.env.REDIS_URL || CONFIG_DEFAULTS.REDIS_URL,
} as const;
