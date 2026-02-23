/**
 * Provider Connection Repository
 *
 * CRUD operations for the provider_connections table.
 * All token fields are encrypted before storage and decrypted on read.
 *
 * @module database/providerConnection/repository
 */

import { query } from "../client/index.js";
import { encryptValue } from "../../security/encryption.js";
import { rowToProviderConnection, validateCreateInput } from "./helpers.js";
import { rowToTenant } from "../tenant/helpers.js";
import type {
  ProviderConnectionRow,
  ProviderConnection,
  ProviderType,
  CreateProviderConnectionInput,
  UpdateProviderConnectionInput,
} from "./types.js";
import type { TenantRow } from "../tenant/types.js";
import type { Tenant } from "../../core/types.js";

// ==================== SQL Queries ====================

const QUERIES = {
  FIND_BY_TENANT: `
    SELECT * FROM provider_connections
    WHERE tenant_id = $1 AND is_active = true
    ORDER BY created_at ASC
  `,
  FIND_BY_TENANT_AND_PROVIDER: `
    SELECT * FROM provider_connections
    WHERE tenant_id = $1 AND provider = $2 AND is_active = true
    LIMIT 1
  `,
  FIND_BY_ID: `
    SELECT * FROM provider_connections WHERE id = $1
  `,
  FIND_BY_EXTERNAL_ORG: `
    SELECT * FROM provider_connections
    WHERE provider = $1 AND external_org_id = $2 AND is_active = true
    LIMIT 1
  `,
  INSERT: `
    INSERT INTO provider_connections (
      tenant_id, provider, connection_name, external_org_id,
      base_url, config, webhook_secret_enc, access_token_enc, token_expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `,
  FIND_ACTIVE_BY_PROVIDER: `
    SELECT * FROM provider_connections
    WHERE provider = $1 AND is_active = true
    ORDER BY created_at ASC
  `,
  DEACTIVATE: `
    UPDATE provider_connections
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,
  DEACTIVATE_BY_TENANT_AND_PROVIDER: `
    UPDATE provider_connections
    SET is_active = false, updated_at = NOW()
    WHERE tenant_id = $1 AND provider = $2 AND is_active = true
    RETURNING *
  `,
  UPDATE_ACCESS_TOKEN: `
    UPDATE provider_connections
    SET access_token_enc = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `,
  FIND_TENANT_BY_EXTERNAL_ORG: `
    SELECT t.* FROM tenants t
    INNER JOIN provider_connections pc ON pc.tenant_id = t.id
    WHERE pc.provider = $1 AND pc.external_org_id = $2 AND pc.is_active = true
    AND t.status != 'deleted'
    LIMIT 1
  `,
} as const;

// ==================== Query Functions ====================

/**
 * Find all active connections for a tenant.
 */
export const findByTenant = async (tenantId: string): Promise<readonly ProviderConnection[]> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_BY_TENANT, [tenantId]);
  return result.rows.map(rowToProviderConnection);
};

/**
 * Find an active connection for a specific tenant and provider.
 */
export const findByTenantAndProvider = async (
  tenantId: string,
  provider: ProviderType
): Promise<ProviderConnection | null> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_BY_TENANT_AND_PROVIDER, [
    tenantId,
    provider,
  ]);
  const row = result.rows[0];
  return row ? rowToProviderConnection(row) : null;
};

/**
 * Find a connection by ID (active or inactive).
 */
export const findConnectionById = async (id: string): Promise<ProviderConnection | null> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_BY_ID, [id]);
  const row = result.rows[0];
  return row ? rowToProviderConnection(row) : null;
};

/**
 * Find an active connection by provider and external org ID.
 * Used for webhook tenant resolution.
 */
export const findByExternalOrgId = async (
  provider: ProviderType,
  externalOrgId: string
): Promise<ProviderConnection | null> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_BY_EXTERNAL_ORG, [
    provider,
    externalOrgId,
  ]);
  const row = result.rows[0];
  return row ? rowToProviderConnection(row) : null;
};

/**
 * Find all active connections for a specific provider (across all tenants).
 * Used for per-tenant webhook signature verification: iterate connections
 * to find the matching secret when the static secret fails.
 */
export const findActiveByProvider = async (
  provider: ProviderType
): Promise<readonly ProviderConnection[]> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_ACTIVE_BY_PROVIDER, [provider]);
  return result.rows.map(rowToProviderConnection);
};

/**
 * Create a new provider connection.
 * Token values are encrypted before storage.
 */
export const createProviderConnection = async (
  input: CreateProviderConnectionInput
): Promise<ProviderConnection> => {
  validateCreateInput(input);

  const result = await query<ProviderConnectionRow>(QUERIES.INSERT, [
    input.tenantId,
    input.provider,
    input.connectionName,
    input.externalOrgId ?? null,
    input.baseUrl ?? null,
    JSON.stringify(input.config ?? {}),
    encryptValue(input.webhookSecret ?? null),
    encryptValue(input.accessToken ?? null),
    input.tokenExpiresAt ?? null,
  ]);

  return rowToProviderConnection(result.rows[0]);
};

/**
 * Update a provider connection's mutable fields.
 * Only the fields present in the input are updated.
 * Token values are encrypted before storage.
 */
export const updateProviderConnection = async (
  input: UpdateProviderConnectionInput
): Promise<ProviderConnection | null> => {
  // Build dynamic SET clause from provided fields
  const updateFields = {
    name: "connectionName" in input,
    org: "externalOrgId" in input,
    cfg: "config" in input,
    whEnc: "webhookSecret" in input,
    atEnc: "accessToken" in input,
    expiry: "tokenExpiresAt" in input,
  };

  const setClauses: readonly string[] = [
    ...(updateFields.name ? ["connection_name = $2"] : []),
    ...(updateFields.org ? ["external_org_id = $3"] : []),
    ...(updateFields.cfg ? ["config = $4"] : []),
    ...(updateFields.whEnc ? ["webhook_secret_enc = $5"] : []),
    ...(updateFields.atEnc ? ["access_token_enc = $6"] : []),
    ...(updateFields.expiry ? ["token_expires_at = $7"] : []),
    "updated_at = NOW()",
  ];

  const updateQuery = [
    "UPDATE provider_connections SET",
    setClauses.join(", "),
    "WHERE id = $1 RETURNING *",
  ].join(" ");

  const result = await query<ProviderConnectionRow>(updateQuery, [
    input.id,
    input.connectionName ?? null,
    input.externalOrgId ?? null,
    input.config ? JSON.stringify(input.config) : null,
    updateFields.whEnc ? encryptValue(input.webhookSecret ?? null) : null,
    updateFields.atEnc ? encryptValue(input.accessToken ?? null) : null,
    input.tokenExpiresAt ?? null,
  ]);

  const row = result.rows[0];
  return row ? rowToProviderConnection(row) : null;
};

/**
 * Soft-delete a connection by setting is_active to false.
 */
export const deactivateConnection = async (id: string): Promise<ProviderConnection | null> => {
  const result = await query<ProviderConnectionRow>(QUERIES.DEACTIVATE, [id]);
  const row = result.rows[0];
  return row ? rowToProviderConnection(row) : null;
};

/**
 * Deactivate all active connections for a tenant + provider pair.
 * Used when a platform integration is uninstalled.
 */
export const deactivateByTenantAndProvider = async (
  tenantId: string,
  provider: ProviderType
): Promise<readonly ProviderConnection[]> => {
  const result = await query<ProviderConnectionRow>(QUERIES.DEACTIVATE_BY_TENANT_AND_PROVIDER, [
    tenantId,
    provider,
  ]);
  return result.rows.map(rowToProviderConnection);
};

/**
 * Update the encrypted access token for a connection.
 */
export const updateConnectionToken = async (
  connectionId: string,
  plainToken: string
): Promise<ProviderConnection | null> => {
  const result = await query<ProviderConnectionRow>(QUERIES.UPDATE_ACCESS_TOKEN, [
    encryptValue(plainToken),
    connectionId,
  ]);
  const row = result.rows[0];
  return row ? rowToProviderConnection(row) : null;
};

// ==================== Platform-Specific Lookups ====================

/**
 * Find the GitHub App connection for a tenant.
 */
export const findGitHubAppConnection = async (
  tenantId: string
): Promise<ProviderConnection | null> => findByTenantAndProvider(tenantId, "github_app");

/**
 * Find the Slack connection for a tenant.
 */
export const findSlackConnection = async (tenantId: string): Promise<ProviderConnection | null> =>
  findByTenantAndProvider(tenantId, "slack");

/**
 * Find the GitLab platform connection for a tenant.
 */
export const findGitLabConnection = async (tenantId: string): Promise<ProviderConnection | null> =>
  findByTenantAndProvider(tenantId, "gitlab");

/**
 * Find a tenant by GitHub App installation ID.
 * Joins provider_connections → tenants, returns domain Tenant.
 */
export const findTenantByGitHubInstallation = async (
  installationId: number
): Promise<Tenant | null> => {
  const result = await query<TenantRow>(QUERIES.FIND_TENANT_BY_EXTERNAL_ORG, [
    "github_app",
    String(installationId),
  ]);
  return result.rows[0] ? rowToTenant(result.rows[0]) : null;
};

/**
 * Find a tenant by Slack workspace ID.
 * Joins provider_connections → tenants, returns domain Tenant.
 */
export const findTenantBySlackWorkspace = async (workspaceId: string): Promise<Tenant | null> => {
  const result = await query<TenantRow>(QUERIES.FIND_TENANT_BY_EXTERNAL_ORG, [
    "slack",
    workspaceId,
  ]);
  return result.rows[0] ? rowToTenant(result.rows[0]) : null;
};
