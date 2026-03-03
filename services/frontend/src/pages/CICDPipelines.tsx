/**
 * CI/CD Pipelines Page
 *
 * Shows repositories/projects accessible to the tenant's provider connection.
 * GitHub users see GitHub App repos; GitLab users see GitLab projects.
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Workflow, ExternalLink, Lock, Globe, GitBranch } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import {
  useRepositories,
  useGitLabProjects,
  type InstallationRepository,
  type GitLabProject,
} from "@/hooks/useDashboardData";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { isSafeUrl } from "@/lib/urlSafety";
import { FeatureLocked } from "@/components/FeatureLocked";
import { PageLoader } from "@/components/PageLoader";

// ==================== Sub-components ====================

const GridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }, (_, idx) => (
      <Skeleton key={idx} className="h-32 w-full rounded-lg" />
    ))}
  </div>
);

interface RepoCardProps {
  readonly repo: InstallationRepository;
}

const RepoCard = ({ repo }: RepoCardProps) => (
  <Link
    to={`/dashboard/cicd/pipelines/${encodeURIComponent(repo.fullName)}`}
    className="group block"
  >
    <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 group-hover:border-indigo-200 dark:group-hover:border-indigo-800">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-sm">
              {repo.name}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-indigo-500 transition-colors flex-shrink-0"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open on GitHub</TooltipContent>
          </Tooltip>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 truncate">{repo.fullName}</p>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              repo.isPrivate
                ? "text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                : "text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
            }
          >
            {repo.isPrivate ? (
              <Lock className="w-3 h-3 mr-1" />
            ) : (
              <Globe className="w-3 h-3 mr-1" />
            )}
            {repo.isPrivate ? "Private" : "Public"}
          </Badge>

          <Badge
            variant="outline"
            className="text-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
          >
            <GitBranch className="w-3 h-3 mr-1" />
            {repo.defaultBranch}
          </Badge>
        </div>
      </CardContent>
    </Card>
  </Link>
);

interface GitLabProjectCardProps {
  readonly project: GitLabProject;
}

const GitLabProjectCard = ({ project }: GitLabProjectCardProps) => (
  <Link
    to={`/dashboard/cicd/pipelines/${encodeURIComponent(project.fullPath)}`}
    className="group block"
  >
    <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 group-hover:border-indigo-200 dark:group-hover:border-indigo-800">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-sm">
              {project.name}
            </span>
          </div>
          {isSafeUrl(project.webUrl) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={project.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-orange-500 transition-colors flex-shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open on GitLab</TooltipContent>
            </Tooltip>
          )}
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 truncate">{project.fullPath}</p>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              project.visibility === "private"
                ? "text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                : "text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
            }
          >
            {project.visibility === "private" ? (
              <Lock className="w-3 h-3 mr-1" />
            ) : (
              <Globe className="w-3 h-3 mr-1" />
            )}
            {project.visibility === "private" ? "Private" : "Public"}
          </Badge>

          {project.defaultBranch && (
            <Badge
              variant="outline"
              className="text-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
            >
              <GitBranch className="w-3 h-3 mr-1" />
              {project.defaultBranch}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  </Link>
);

// ==================== Main Component ====================

export const CICDPipelines = () => {
  const { user } = useAuth();
  const loginProvider = user?.organizations.find((org) => org.isSelected)?.provider ?? "github";
  const isGitHub = loginProvider === "github";

  const { data: repos, isLoading: isGitHubLoading, error: ghError } = useRepositories();
  const { data: gitlabProjects, isLoading: isGitLabLoading, error: glError } = useGitLabProjects();
  const { data: usageData, isLoading: isUsageLoading } = useSubscriptionUsage();

  const isAnyLimitReached = usageData
    ? Object.values(usageData.usage).some(
        (usage) => usage.limited && usage.limit !== null && usage.current >= usage.limit
      )
    : false;

  const isLoading = isGitHub ? isGitHubLoading : isGitLabLoading;
  const error = isGitHub ? ghError : glError;

  const repoList = repos ?? [];
  const projectList = gitlabProjects ?? [];
  const itemCount = isGitHub ? repoList.length : projectList.length;
  const hasItems = itemCount > 0;

  if (isUsageLoading) {
    return <PageLoader />;
  }

  if (isAnyLimitReached && usageData) {
    return (
      <FeatureLocked
        description="You have reached your plan's usage limits. Upgrade to continue viewing pipelines."
        usage={usageData.usage}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Pipelines & Repositories
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {isGitHub
            ? "Repositories connected through your GitHub App installation."
            : "Projects connected through your GitLab integration."}
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-500" />
            <CardTitle>Connected {isGitHub ? "Repositories" : "Projects"}</CardTitle>
          </div>
          <CardDescription>
            {hasItems
              ? `${itemCount} ${isGitHub ? "repositor" : "project"}${itemCount > 1 ? (isGitHub ? "ies" : "s") : isGitHub ? "y" : ""} connected`
              : `No ${isGitHub ? "repositories" : "projects"} connected yet`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <GridSkeleton />
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : !hasItems ? (
            <Empty className="py-12 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Workflow className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No {isGitHub ? "repositories" : "projects"} connected</EmptyTitle>
                <EmptyDescription>
                  {isGitHub
                    ? "Install the Kenchi GitHub App on your organization to connect repositories and start monitoring CI/CD pipelines."
                    : "Set up your GitLab projects from the Integrations page to start monitoring CI/CD pipelines."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : isGitHub ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {repoList.map((repo) => (
                <RepoCard key={repo.id} repo={repo} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projectList.map((project) => (
                <GitLabProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
