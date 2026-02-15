/**
 * CI/CD Pipelines Page
 *
 * Shows repositories accessible to the tenant's GitHub App installation.
 * Each repo card links to GitHub and shows visibility + default branch.
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
import { useRepositories, type InstallationRepository } from "@/hooks/useDashboardData";

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
  <a
    href={`https://github.com/${repo.fullName}`}
    target="_blank"
    rel="noopener noreferrer"
    className="group block"
  >
    <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-indigo-200 group-hover:border-indigo-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="font-medium text-gray-900 truncate text-sm">{repo.name}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
        </div>

        <p className="text-xs text-gray-500 mb-3 truncate">{repo.fullName}</p>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              repo.isPrivate
                ? "text-xs bg-amber-50 text-amber-700 border-amber-200"
                : "text-xs bg-green-50 text-green-700 border-green-200"
            }
          >
            {repo.isPrivate ? (
              <Lock className="w-3 h-3 mr-1" />
            ) : (
              <Globe className="w-3 h-3 mr-1" />
            )}
            {repo.isPrivate ? "Private" : "Public"}
          </Badge>

          <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
            <GitBranch className="w-3 h-3 mr-1" />
            {repo.defaultBranch}
          </Badge>
        </div>
      </CardContent>
    </Card>
  </a>
);

// ==================== Main Component ====================

export const CICDPipelines = () => {
  const { data: repos, isLoading, error } = useRepositories();

  const repoList = repos ?? [];
  const hasRepos = Boolean(repoList.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Pipelines & Repositories</h1>
        <p className="text-sm text-gray-500 mt-1">
          Repositories connected through your GitHub App installation.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-500" />
            <CardTitle>Connected Repositories</CardTitle>
          </div>
          <CardDescription>
            {hasRepos
              ? `${repoList.length} repositor${repoList.length > 1 ? "ies" : "y"} connected`
              : "No repositories connected yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <GridSkeleton />
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !hasRepos ? (
            <Empty className="py-12 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Workflow className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No repositories connected</EmptyTitle>
                <EmptyDescription>
                  Install the Kenchi GitHub App on your organization to connect repositories and
                  start monitoring CI/CD pipelines.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {repoList.map((repo) => (
                <RepoCard key={repo.id} repo={repo} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
