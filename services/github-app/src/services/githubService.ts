/**
 * GitHub Service
 *
 * Barrel export that re-exports from focused modules.
 * Octokit client management and GitHub API calls live in adapters/githubAdapter.ts.
 *
 * Re-exports:
 * - adapters/githubAdapter.ts: Octokit client, repository, and check run operations
 * - services/githubAnalysis.ts: Event creation and LLM analysis
 * - services/githubComments.ts: Comment management and PR interactions
 */

// Adapter functions (Octokit client management, GitHub API calls)
export {
  getOctokit,
  getInstallationRepositories,
  createCheckRunWithAnnotations,
  type RepositoryInfo,
  type CheckAnnotation,
  type CreateCheckRunOptions,
} from "../adapters/githubAdapter.js";

// Analysis functions
export {
  getLLMClient,
  type AnalysisResult,
  createEventFromPR,
  createEventFromCheckRun,
  createMinimalEvidence,
  performAnalysis,
} from "./githubAnalysis.js";

// Comment functions
export { deleteKenchiOpsComments, postPRComment } from "./githubComments.js";
