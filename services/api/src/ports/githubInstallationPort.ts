/**
 * GitHub Installation Port
 *
 * Port interface for fetching data from GitHub App installations.
 * Uses Kenchi-defined types only -- no vendor types cross this boundary.
 *
 * @module ports/githubInstallationPort
 */

import type { RequestContext } from "@kenchi/shared";

export interface InstallationRepository {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly isPrivate: boolean;
  readonly defaultBranch: string;
}

export interface GitHubInstallationPort {
  readonly getRepositories: (
    installationId: number,
    context: RequestContext
  ) => Promise<readonly InstallationRepository[]>;
}
