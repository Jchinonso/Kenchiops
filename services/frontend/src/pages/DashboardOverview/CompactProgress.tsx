import { Link } from "react-router-dom";
import { Rocket, X } from "lucide-react";
import type { CompactProgressProps } from "./types";

export const CompactProgress = ({ steps, completedCount, onDismiss }: CompactProgressProps) => (
  <div className="mb-6 sm:mb-8 flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur-sm">
    <Rocket className="w-4 h-4 text-indigo-500 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-shrink-0">
          Setup {completedCount}/{steps.length}
        </span>
        <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>
      {steps
        .filter((step) => !step.completed)
        .map((step) => (
          <div key={step.title} className="mt-1.5 flex items-center gap-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Next:</span>
            {step.external ? (
              <a
                href={step.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                {step.title} &rarr;
              </a>
            ) : (
              <Link
                to={step.href}
                className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                {step.title} &rarr;
              </Link>
            )}
          </div>
        ))}
    </div>
    <button
      onClick={onDismiss}
      className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
      aria-label="Dismiss setup checklist"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);
