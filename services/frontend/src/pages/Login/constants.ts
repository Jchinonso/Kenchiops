import { Github, Gitlab, Cloud } from "lucide-react";

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
];

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  access_denied: "Access was denied. Please try again or use a different account.",
  access_revoked:
    "Your access to this organization has been revoked. Please contact your admin or switch organizations.",
  session_expired: "Your session has expired. Please log in again.",
  invalid_state: "Authentication session expired. Please try again.",
  server_error: "An error occurred during authentication. Please try again.",
};

export type { GitProvider };
