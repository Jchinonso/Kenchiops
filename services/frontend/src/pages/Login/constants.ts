import { Github, Gitlab, Cloud, Server } from "lucide-react";

interface GitProvider {
  readonly id: string;
  readonly name: string;
  readonly iconComponent: typeof Github;
  readonly primary?: boolean;
}

export const saasProviders: readonly GitProvider[] = [
  { id: "github", name: "GitHub", iconComponent: Github, primary: true },
  { id: "gitlab", name: "GitLab", iconComponent: Gitlab },
  { id: "bitbucket", name: "Bitbucket", iconComponent: Cloud },
  { id: "azure_devops", name: "Azure DevOps", iconComponent: Server },
];

export const selfHostedProviders: readonly GitProvider[] = [
  { id: "github", name: "GitHub Enterprise", iconComponent: Github, primary: true },
  { id: "gitlab", name: "GitLab Self-Managed", iconComponent: Gitlab },
  { id: "bitbucket", name: "Bitbucket Server", iconComponent: Cloud },
];

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  access_denied: "Access was denied. Please try again or use a different account.",
  invalid_state: "Authentication session expired. Please try again.",
  server_error: "An error occurred during authentication. Please try again.",
};

export type { GitProvider };
