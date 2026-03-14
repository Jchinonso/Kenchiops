import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Workflow, ExternalLink, Lock, Globe, GitBranch } from "lucide-react";
import type { GitLabProject } from "@/hooks/useDashboardData";
import { isSafeUrl } from "@/lib/urlSafety";

interface GitLabProjectCardProps {
  readonly project: GitLabProject;
}

export const GitLabProjectCard = ({ project }: GitLabProjectCardProps) => (
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
