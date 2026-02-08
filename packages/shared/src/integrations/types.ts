/**
 * Integrations Module Types
 *
 * Type definitions for the integrations module, including
 * prompt structures and analysis interfaces.
 *
 * @module integrations/types
 */

// ==================== Artifact Analysis Types ====================

/**
 * Structured prompt for artifact-based analysis.
 * Callers should send `system` as the system role and `user` as the user role.
 */
export interface ArtifactAnalysisPrompt {
  /** System message: role definition, rules, schema, causal ordering */
  readonly system: string;
  /** User message: build context, artifacts (untrusted data), output instruction */
  readonly user: string;
}

// ==================== Tenant Prompt Configuration Types ====================

/**
 * CI/CD system types.
 */
export type CISystem =
  | "github_actions"
  | "gitlab_ci"
  | "jenkins"
  | "circleci"
  | "azure_devops"
  | "other";

/**
 * Analysis depth preference.
 */
export type AnalysisDepth = "brief" | "standard" | "detailed";

/**
 * Areas to focus analysis on.
 */
export type FocusArea =
  | "root_cause"
  | "dependencies"
  | "configuration"
  | "testing"
  | "security"
  | "performance";

/**
 * Verbosity level for responses.
 */
export type VerbosityLevel = "minimal" | "normal" | "verbose";

/**
 * Technology stack configuration for context-aware prompts.
 */
export interface TechStackConfig {
  readonly primaryLanguages?: readonly string[];
  readonly frameworks?: readonly string[];
  readonly ciSystem?: CISystem;
  readonly testingFrameworks?: readonly string[];
  readonly deploymentPlatform?: string;
}

/**
 * Prompt behavior preferences.
 */
export interface PromptPreferences {
  readonly prioritizeSpeed?: boolean;
  readonly includeCodeSnippets?: boolean;
  readonly maxRecommendations?: number;
  readonly focusAreas?: readonly FocusArea[];
  readonly verbosityLevel?: VerbosityLevel;
}

/**
 * Tenant-specific prompt configuration.
 */
export interface TenantPromptConfig {
  readonly tenantId: string;
  readonly techStack?: TechStackConfig;
  readonly preferences?: PromptPreferences;
  readonly customInstructions?: string;
  readonly analysisDepth?: AnalysisDepth;
  readonly languagePreference?: string;
}

// ==================== GitHub App Client Types ====================

/**
 * API response for installation repositories.
 */
export interface RepositoriesResponse {
  readonly installationId: number;
  readonly repositories: ReadonlyArray<{
    readonly id: number;
    readonly name: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly defaultBranch: string;
  }>;
  readonly total: number;
}
