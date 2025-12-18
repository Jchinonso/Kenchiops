import dotenv from "dotenv";

// Load environment variables once, at process start.
dotenv.config();

/**
 * Application configuration interface.
 * All services should import from this module instead of reading process.env directly.
 */
export interface Config {
  // OpenAI Configuration
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  OPENAI_MAX_TOKENS?: number;
  OPENAI_TEMPERATURE?: number;
  OPENAI_TIMEOUT_MS?: number;

  // Slack Configuration
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_APP_LEVEL_TOKEN: string;

  // GitHub Configuration
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_WEBHOOK_SECRET: string;

  // Database Configuration
  DATABASE_URL: string;
  VECTOR_DB_URL: string;

  // General Configuration
  NODE_ENV: string;
  PORT: number;
}

/**
 * Centralized configuration loader.
 */
export const config: Config = {
  // OpenAI Configuration
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS, 10) : undefined,
  OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
  OPENAI_TIMEOUT_MS: process.env.OPENAI_TIMEOUT_MS ? parseInt(process.env.OPENAI_TIMEOUT_MS, 10) : undefined,

  // Slack Configuration
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || "",
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || "",
  SLACK_APP_LEVEL_TOKEN: process.env.SLACK_APP_LEVEL_TOKEN || "",

  // GitHub Configuration
  GITHUB_APP_ID: process.env.GITHUB_APP_ID || "",
  GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY || "",
  GITHUB_INSTALLATION_ID: process.env.GITHUB_INSTALLATION_ID || "",
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || "",

  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL || "",
  VECTOR_DB_URL: process.env.VECTOR_DB_URL || "",

  // General Configuration
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
};

