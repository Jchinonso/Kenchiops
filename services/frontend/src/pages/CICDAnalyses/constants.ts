/**
 * CICDAnalyses page constants.
 */

import { Github, Gitlab } from "lucide-react";
import { createElement } from "react";

export const PAGE_SIZE = 20;

export const PROVIDER_BADGE_CONFIG: Readonly<
  Record<string, { readonly label: string; readonly icon: React.ReactNode }>
> = {
  github_actions: {
    label: "GitHub",
    icon: createElement(Github, { className: "w-3 h-3" }),
  },
  gitlab_ci: {
    label: "GitLab",
    icon: createElement(Gitlab, { className: "w-3 h-3" }),
  },
};
