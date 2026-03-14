/**
 * CI/CD Pipelines Page
 *
 * Shows repositories/projects accessible to the tenant's provider connection.
 * GitHub users see GitHub App repos; GitLab users see GitLab projects.
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Workflow } from "lucide-react";
import { useRepositories, useGitLabProjects } from "@/hooks/useDashboardData";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { FeatureLocked } from "@/components/FeatureLocked";
import { PageLoader } from "@/components/PageLoader";
import { GridSkeleton } from "./GridSkeleton";
import { RepoCard } from "./RepoCard";
import { GitLabProjectCard } from "./GitLabProjectCard";

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
              ? `${itemCount} ${isGitHub ? (itemCount === 1 ? "repository" : "repositories") : itemCount === 1 ? "project" : "projects"} connected`
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
