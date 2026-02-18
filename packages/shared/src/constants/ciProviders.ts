/**
 * CI/CD provider identifiers for webhook routing and configuration.
 *
 * Distinct from CI_PLATFORMS in chunkingPipeline.ts which detects
 * CI platforms from log content. These identifiers are used for
 * provider adapter routing, webhook validation, and tenant configuration.
 *
 * @module constants/ciProviders
 */

export const CI_PROVIDERS = {
  GITHUB_ACTIONS: "github_actions",
  VERCEL: "vercel",
  NETLIFY: "netlify",
  AWS_CODEBUILD: "aws_codebuild",
  GITLAB_CI: "gitlab_ci",
  CIRCLECI: "circleci",
  BITBUCKET_PIPELINES: "bitbucket_pipelines",
  CUSTOM: "custom",
} as const;

export type CIProvider = (typeof CI_PROVIDERS)[keyof typeof CI_PROVIDERS];
