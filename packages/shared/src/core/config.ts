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
import {
  CONFIG_DEFAULTS,
  VALID_NODE_ENVS,
  PARSE_INT_RADIX,
  LLM_CONCURRENCY_DEFAULTS,
} from "../constants/index.js";
import type { Config, NodeEnvironment } from "./types.js";

dotenv.config();

export type { Config, NodeEnvironment };

// ==================== Helpers ====================

const isEmpty = (value: string | undefined): value is undefined | "" =>
  value === undefined || value === "";

const parseIntSafe = (value: string): number | undefined => {
  const parsed = parseInt(value, PARSE_INT_RADIX);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseFloatSafe = (value: string): number | undefined => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new ValidationError(`Required environment variable ${key} is not set`);
  }
  return value;
};

const optionalString = (key: string, defaultValue: string): string => {
  const value = process.env[key];
  return isEmpty(value) ? defaultValue : value;
};

const optionalInt = (key: string, fallbackOnInvalid?: number): number | undefined => {
  const value = process.env[key];
  if (isEmpty(value)) {
    return undefined;
  }
  return parseIntSafe(value) ?? fallbackOnInvalid;
};

const requiredInt = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (isEmpty(value)) {
    return defaultValue;
  }
  return parseIntSafe(value) ?? defaultValue;
};

const optionalFloat = (key: string): number | undefined => {
  const value = process.env[key];
  if (isEmpty(value)) {
    return undefined;
  }
  return parseFloatSafe(value);
};

const optionalBool = (key: string): boolean => process.env[key] === "true";

const validateNodeEnv = (): NodeEnvironment => {
  const value = process.env.NODE_ENV;
  const defaultEnv = CONFIG_DEFAULTS.NODE_ENV as NodeEnvironment;
  if (isEmpty(value)) {
    return defaultEnv;
  }
  return VALID_NODE_ENVS.includes(value as NodeEnvironment)
    ? (value as NodeEnvironment)
    : defaultEnv;
};

// ==================== Configuration ====================

export const config: Config = {
  // OpenAI
  OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_MAX_TOKENS: optionalInt("OPENAI_MAX_TOKENS", CONFIG_DEFAULTS.OPENAI_MAX_TOKENS),
  OPENAI_TEMPERATURE: optionalFloat("OPENAI_TEMPERATURE"),
  OPENAI_TIMEOUT_MS: optionalInt("OPENAI_TIMEOUT_MS", CONFIG_DEFAULTS.OPENAI_TIMEOUT_MS),

  // Slack (single-tenant)
  SLACK_BOT_TOKEN: requireEnv("SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: requireEnv("SLACK_SIGNING_SECRET"),
  SLACK_APP_LEVEL_TOKEN: requireEnv("SLACK_APP_LEVEL_TOKEN"),

  // Slack OAuth (multi-tenant)
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI,

  // GitHub
  GITHUB_APP_ID: requireEnv("GITHUB_APP_ID"),
  GITHUB_APP_PRIVATE_KEY: requireEnv("GITHUB_APP_PRIVATE_KEY"),
  GITHUB_INSTALLATION_ID: requireEnv("GITHUB_INSTALLATION_ID"),
  GITHUB_WEBHOOK_SECRET: requireEnv("GITHUB_WEBHOOK_SECRET"),
  GITHUB_APP_SLUG: optionalString("GITHUB_APP_SLUG", CONFIG_DEFAULTS.GITHUB_APP_SLUG),

  // Database
  DATABASE_URL: requireEnv("DATABASE_URL"),
  VECTOR_DB_URL: requireEnv("VECTOR_DB_URL"),

  // General
  NODE_ENV: validateNodeEnv(),
  PORT: requiredInt("PORT", CONFIG_DEFAULTS.PORT),

  // Multi-tenant
  MULTI_TENANT_MODE: optionalBool("MULTI_TENANT_MODE"),

  // Feature Flags
  SIMPLIFIED_PIPELINE_ENABLED: optionalBool("SIMPLIFIED_PIPELINE_ENABLED"),

  // Service URLs
  API_URL: optionalString("API_URL", CONFIG_DEFAULTS.API_URL),
  SLACK_BOT_URL: optionalString("SLACK_BOT_URL", CONFIG_DEFAULTS.SLACK_BOT_URL),
  GITHUB_APP_URL: optionalString("GITHUB_APP_URL", CONFIG_DEFAULTS.GITHUB_APP_URL),

  // Redis
  REDIS_URL: optionalString("REDIS_URL", CONFIG_DEFAULTS.REDIS_URL),

  // LLM Concurrency
  LLM_MAX_CONCURRENT_ANALYSIS: optionalInt(
    "LLM_MAX_CONCURRENT_ANALYSIS",
    LLM_CONCURRENCY_DEFAULTS.MAX_CONCURRENT_ANALYSIS
  ),
  LLM_QUEUE_TIMEOUT_MS: optionalInt(
    "LLM_QUEUE_TIMEOUT_MS",
    LLM_CONCURRENCY_DEFAULTS.QUEUE_TIMEOUT_MS
  ),
} as const;
