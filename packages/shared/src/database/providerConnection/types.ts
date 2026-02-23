/**
 * Provider Connection Types
 *
 * Row types (snake_case) map to database columns.
 * Domain types (camelCase) are used in service/handler layers.
 *
 * @module database/providerConnection/types
 */

// ==================== Enum Types ====================

/** CI/CD source integrations — analyze pipeline failures. */
export type CIProviderType =
  | "github_actions"
  | "vercel"
  | "netlify"
  | "aws_codebuild"
  | "gitlab_ci"
  | "circleci"
  | "bitbucket_pipelines"
  | "custom";

/** Platform integrations — source code access + webhook receiver. */
export type PlatformProviderType = "github_app" | "gitlab";

/** Notification channels — deliver analysis results from ANY CI provider. */
export type NotificationProviderType = "slack";

/** All provider types stored in provider_connections. */
export type ProviderType = CIProviderType | PlatformProviderType | NotificationProviderType;

// ==================== Row Types ====================

export interface ProviderConnectionRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly provider: ProviderType;
  readonly connection_name: string;
  readonly external_org_id: string | null;
  readonly base_url: string | null;
  readonly config: Readonly<Record<string, unknown>>;
  readonly webhook_secret_enc: string | null;
  readonly access_token_enc: string | null;
  readonly token_expires_at: Date | null;
  readonly is_active: boolean;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

export interface ProviderConnection {
  readonly id: string;
  readonly tenantId: string;
  readonly provider: ProviderType;
  readonly connectionName: string;
  readonly externalOrgId: string | null;
  readonly baseUrl: string | null;
  readonly config: Readonly<Record<string, unknown>>;
  /** Decrypted webhook secret (null if not set). */
  readonly webhookSecret: string | null;
  /** Decrypted access token (null if not set). */
  readonly accessToken: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ==================== Input Types ====================

export interface CreateProviderConnectionInput {
  readonly tenantId: string;
  readonly provider: ProviderType;
  readonly connectionName: string;
  readonly externalOrgId?: string | null;
  readonly baseUrl?: string | null;
  readonly config?: Readonly<Record<string, unknown>>;
  /** Plaintext webhook secret (encrypted before storage). */
  readonly webhookSecret?: string | null;
  /** Plaintext access token (encrypted before storage). */
  readonly accessToken?: string | null;
  readonly tokenExpiresAt?: Date | null;
}

export interface UpdateProviderConnectionInput {
  readonly id: string;
  readonly connectionName?: string;
  readonly externalOrgId?: string | null;
  readonly config?: Readonly<Record<string, unknown>>;
  /** Plaintext webhook secret (encrypted before storage). */
  readonly webhookSecret?: string | null;
  /** Plaintext access token (encrypted before storage). */
  readonly accessToken?: string | null;
  readonly tokenExpiresAt?: Date | null;
}
