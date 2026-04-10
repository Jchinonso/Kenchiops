/**
 * Shared types for the GitLab Setup flow.
 */

export interface GitLabProject {
  readonly id: number;
  readonly name: string;
  readonly fullPath: string;
  readonly webUrl: string;
  readonly defaultBranch: string | null;
  readonly visibility: string;
  readonly lastActivity: string;
}

export interface ProjectSetupResult {
  readonly projectId: number;
  readonly projectName: string;
  readonly success: boolean;
  readonly webhookId?: number;
  readonly error?: string;
}

export interface SetupResponse {
  readonly connectionId: string;
  readonly webhookUrl: string;
  readonly results: readonly ProjectSetupResult[];
}

export interface ProjectRowProps {
  readonly project: GitLabProject;
  readonly selected: boolean;
  readonly onToggle: (id: number) => void;
  readonly disabled: boolean;
}

export interface SetupResultsProps {
  readonly results: readonly ProjectSetupResult[];
  readonly onRetryFailed: () => void;
  readonly onContinue: () => void;
  readonly isRetrying: boolean;
}

export interface VisibilityBadgeProps {
  readonly visibility: string;
}

// ==================== Hook Return Types ====================

export interface UseProjectSelectionResult {
  readonly selectedIds: ReadonlySet<number>;
  readonly searchQuery: string;
  readonly setSearchQuery: (query: string) => void;
  readonly filteredProjects: readonly GitLabProject[];
  readonly allFilteredSelected: boolean;
  readonly handleToggle: (projectId: number) => void;
  readonly handleSelectAll: () => void;
}

export interface UseWebhookSetupResult {
  readonly setupResults: readonly ProjectSetupResult[] | null;
  readonly isSubmitting: boolean;
  readonly isRetrying: boolean;
  readonly handleSubmit: (projectIds: ReadonlySet<number>) => void;
  readonly handleRetryFailed: () => void;
}
