/**
 * Shared types for the CICDPipelines module.
 */

import type { InstallationRepository, GitLabProject } from "@/hooks/useDashboardData";

export interface RepoCardProps {
  readonly repo: InstallationRepository;
}

export interface GitLabProjectCardProps {
  readonly project: GitLabProject;
}
