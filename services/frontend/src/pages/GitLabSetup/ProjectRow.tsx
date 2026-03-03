import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatters";
import { Checkbox } from "@/components/ui/checkbox";
import { VisibilityBadge } from "./VisibilityBadge";
import type { ProjectRowProps } from "./types";

export const ProjectRow = ({ project, selected, onToggle, disabled }: ProjectRowProps) => (
  <label
    className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
      selected
        ? "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/20"
        : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600",
      disabled && "opacity-60 cursor-not-allowed"
    )}
  >
    <Checkbox checked={selected} onCheckedChange={() => onToggle(project.id)} disabled={disabled} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
          {project.fullPath}
        </p>
        <VisibilityBadge visibility={project.visibility} />
      </div>
      {project.defaultBranch && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Default: {project.defaultBranch}
        </p>
      )}
    </div>
    <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
      {formatRelativeTime(project.lastActivity)}
    </span>
  </label>
);
