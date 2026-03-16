import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Workflow, ExternalLink, Lock, Globe, GitBranch } from "lucide-react";
import { buildSafeGitHubUrl } from "@/lib/urlSafety";
import type { RepoCardProps } from "./types";

export const RepoCard = ({ repo }: RepoCardProps) => (
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
          {(() => {
            const repoUrl = buildSafeGitHubUrl(repo.fullName);
            return repoUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={repoUrl}
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
            ) : null;
          })()}
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
