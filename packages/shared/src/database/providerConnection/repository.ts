/**
 * Provider Connection Repository
 *
 * CRUD operations for the provider_connections table.
 * All token fields are encrypted with per-tenant HKDF keys before storage
 * and decrypted on read (with automatic legacy format fallback).
 *
 * @module database/providerConnection/repository
 */

import { query } from "../client/index.js";
import { encryptForTenant } from "../../security/tenantEncryption.js";
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
    SELECT * FROM provider_connections WHERE id = $1 AND tenant_id = $2
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
    ON CONFLICT (tenant_id, provider, connection_name)
    DO UPDATE SET
      external_org_id = EXCLUDED.external_org_id,
      config = EXCLUDED.config,
      is_active = true,
      updated_at = NOW()
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

// ==================== Helpers ====================

/**
 * Encrypt a nullable string value for a tenant.
 * Returns null if the value is null/undefined.
 */
const encryptNullable = async (
  tenantId: string,
  value: string | null | undefined
): Promise<string | null> => (value ? encryptForTenant(tenantId, value) : null);

// ==================== Query Functions ====================

/**
 * Find all active connections for a tenant.
 */
export const findByTenant = async (tenantId: string): Promise<readonly ProviderConnection[]> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_BY_TENANT, [tenantId]);
  return Promise.all(result.rows.map(rowToProviderConnection));
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
 * Find a connection by ID (active or inactive), scoped to a tenant.
 * SECURITY: Always requires tenantId to prevent cross-tenant data access.
 */
export const findConnectionById = async (
  id: string,
  tenantId: string
): Promise<ProviderConnection | null> => {
  const result = await query<ProviderConnectionRow>(QUERIES.FIND_BY_ID, [id, tenantId]);
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
  return Promise.all(result.rows.map(rowToProviderConnection));
};

/**
 * Create a new provider connection.
 * Token values are encrypted with per-tenant HKDF keys before storage.
 */
export const createProviderConnection = async (
  input: CreateProviderConnectionInput
): Promise<ProviderConnection> => {
  validateCreateInput(input);

  const [webhookSecretEnc, accessTokenEnc] = await Promise.all([
    encryptNullable(input.tenantId, input.webhookSecret),
    encryptNullable(input.tenantId, input.accessToken),
  ]);

  const result = await query<ProviderConnectionRow>(QUERIES.INSERT, [
    input.tenantId,
    input.provider,
    input.connectionName,
    input.externalOrgId ?? null,
    input.baseUrl ?? null,
    JSON.stringify(input.config ?? {}),
    webhookSecretEnc,
    accessTokenEnc,
    input.tokenExpiresAt ?? null,
  ]);

  return rowToProviderConnection(result.rows[0]);
};

/**
 * Update a provider connection's mutable fields.
 * Only the fields present in the input are updated.
 * Token values are encrypted with per-tenant HKDF keys before storage.
 */
export const updateProviderConnection = async (
  input: UpdateProviderConnectionInput
): Promise<ProviderConnection | null> => {
  const [webhookSecretEnc, accessTokenEnc] = await Promise.all([
    "webhookSecret" in input ? encryptNullable(input.tenantId, input.webhookSecret) : null,
    "accessToken" in input ? encryptNullable(input.tenantId, input.accessToken) : null,
  ]);

  // Build dynamic SET clause with sequential parameter numbering.
  // Parameter $1 is always the connection id (WHERE clause).
  const fieldEntries: ReadonlyArray<{ readonly column: string; readonly value: unknown }> = [
    ...("connectionName" in input
      ? [{ column: "connection_name", value: input.connectionName ?? null }]
      : []),
    ...("externalOrgId" in input
      ? [{ column: "external_org_id", value: input.externalOrgId ?? null }]
      : []),
    ...("config" in input
      ? [{ column: "config", value: input.config ? JSON.stringify(input.config) : null }]
      : []),
    ...("webhookSecret" in input
      ? [{ column: "webhook_secret_enc", value: webhookSecretEnc }]
      : []),
    ...("accessToken" in input ? [{ column: "access_token_enc", value: accessTokenEnc }] : []),
    ...("tokenExpiresAt" in input
      ? [{ column: "token_expires_at", value: input.tokenExpiresAt ?? null }]
      : []),
  ];

  const setClauses = [
    ...fieldEntries.map((entry, i) => `${entry.column} = $${i + 2}`),
    "updated_at = NOW()",
  ].join(", ");

  const updateQuery = `UPDATE provider_connections SET ${setClauses} WHERE id = $1 RETURNING *`;
  const params = [input.id, ...fieldEntries.map((entry) => entry.value)];

  const result = await query<ProviderConnectionRow>(updateQuery, params);

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
  return Promise.all(result.rows.map(rowToProviderConnection));
};

/**
 * Update the encrypted access token for a connection.
 */
export const updateConnectionToken = async (
  connectionId: string,
  tenantId: string,
  plainToken: string
): Promise<ProviderConnection | null> => {
  const encrypted = await encryptForTenant(tenantId, plainToken);
  const result = await query<ProviderConnectionRow>(QUERIES.UPDATE_ACCESS_TOKEN, [
    encrypted,
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
