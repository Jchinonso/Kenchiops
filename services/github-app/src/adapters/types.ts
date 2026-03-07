/**
 * Adapter types for the github-app service.
 *
 * All adapter-layer type definitions live here, imported by adapter modules.
 *
 * @module adapters/types
 */

/** Raw response shape from the GitLab OAuth token endpoint. */
export interface GitLabTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string | null;
  readonly expires_in: number | null;
  readonly token_type: string;
  readonly error?: string;
  readonly error_description?: string;
}
