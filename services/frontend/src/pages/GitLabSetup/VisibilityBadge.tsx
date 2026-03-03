import { Eye, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisibilityBadgeProps } from "./types";

const VISIBILITY_LABELS: Readonly<Record<string, string>> = {
  private: "Private",
  internal: "Internal",
  public: "Public",
};

export const VisibilityBadge = ({ visibility }: VisibilityBadgeProps) => {
  const isPrivate = visibility === "private";
  const Icon = isPrivate ? Lock : Eye;
  const label = VISIBILITY_LABELS[visibility] ?? "Public";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
        isPrivate
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          : "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
};
