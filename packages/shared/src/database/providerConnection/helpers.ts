/**
 * Provider Connection Helpers
 *
 * Row-to-domain mapping with decryption for encrypted fields.
 *
 * @module database/providerConnection/helpers
 */

import { decryptValue } from "../../security/encryption.js";
import { ValidationError } from "../../core/errors.js";
import type {
  ProviderConnectionRow,
  ProviderConnection,
  CreateProviderConnectionInput,
} from "./types.js";

// ==================== Row Mapper ====================

/**
 * Map a database row to a domain ProviderConnection, decrypting sensitive fields.
 */
export const rowToProviderConnection = (row: ProviderConnectionRow): ProviderConnection => ({
  id: row.id,
  tenantId: row.tenant_id,
  provider: row.provider,
  connectionName: row.connection_name,
  externalOrgId: row.external_org_id,
  baseUrl: row.base_url,
  config: row.config,
  webhookSecret: (decryptValue(row.webhook_secret_enc) as string | null) ?? null,
  accessToken: (decryptValue(row.access_token_enc) as string | null) ?? null,
  tokenExpiresAt: row.token_expires_at,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Validation ====================

/**
 * Validate a CreateProviderConnectionInput.
 * Throws ValidationError if required fields are missing or invalid.
 */
export const validateCreateInput = (input: CreateProviderConnectionInput): void => {
  if (!input.tenantId) {
    throw new ValidationError("tenantId is required", {
      operation: "validateCreateProviderConnectionInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.provider) {
    throw new ValidationError("provider is required", {
      operation: "validateCreateProviderConnectionInput",
      metadata: { field: "provider" },
    });
  }

  if (!input.connectionName) {
    throw new ValidationError("connectionName is required", {
      operation: "validateCreateProviderConnectionInput",
      metadata: { field: "connectionName" },
    });
  }
};
