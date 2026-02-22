/**
 * GitLab Projects Port
 *
 * Port interface for fetching projects from a user's GitLab account.
 * Uses Kenchi-defined types only -- no vendor types cross this boundary.
 *
 * @module ports/gitlabProjectsPort
 */

import type { RequestContext } from "@kenchi/shared";

export interface GitLabProject {
  readonly id: number;
  readonly name: string;
  readonly fullPath: string;
  readonly webUrl: string;
  readonly defaultBranch: string | null;
  readonly visibility: string;
  readonly lastActivity: string;
}

export interface GitLabProjectsPort {
  readonly getProjects: (
    accessToken: string,
    baseUrl: string | null,
    context: RequestContext
  ) => Promise<readonly GitLabProject[]>;
}
