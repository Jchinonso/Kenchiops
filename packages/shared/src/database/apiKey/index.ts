/**
 * API Key Module
 *
 * @module database/apiKey
 */

// Types
export type {
  ApiKeyStatus,
  ApiKeyScope,
  ApiKeyRow,
  ApiKey,
  ApiKeyWithSecret,
  CreateApiKeyInput,
} from "./types.js";

// Helpers
export { rowToApiKey, generateApiKey, hashApiKey, validateCreateApiKeyInput } from "./helpers.js";

// Repository
export {
  createApiKey,
  authenticateApiKey,
  findApiKeysByTenant,
  revokeApiKey,
} from "./repository.js";
