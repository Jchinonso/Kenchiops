import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Rocket, ExternalLink, X, CheckCircle2 } from "lucide-react";
import type { FullChecklistProps } from "./types";

export const FullChecklist = ({ steps, allStepsComplete, onDismiss }: FullChecklistProps) => (
  <Card className="mb-6 sm:mb-8">
    <CardHeader className="border-b">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-500" />
          <CardTitle>
            <h2>Get Set Up</h2>
          </CardTitle>
        </div>
        <button
          onClick={onDismiss}
          className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
          aria-label="Dismiss setup checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <CardDescription>
        {allStepsComplete
          ? "You're all set! Kenchi is monitoring your CI/CD pipelines."
          : "Complete these steps to start analyzing your CI/CD failures."}
      </CardDescription>
    </CardHeader>
    <CardContent className="pt-6">
      <div className="space-y-4">
        {steps.map((step, stepIndex) => (
          <div
            key={step.title}
            className={cn(
              "flex items-start gap-4 p-4 rounded-lg border transition-colors",
              step.completed
                ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30"
                : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
            )}
          >
            <div className="flex-shrink-0 mt-1">
              {step.completed ? (
                <div className="ring-2 ring-green-500/20 rounded-full">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              ) : (
                step.icon
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4
                className={cn(
                  "font-medium text-sm mb-1",
                  step.completed
                    ? "text-green-800 dark:text-green-300"
                    : "text-zinc-900 dark:text-zinc-100"
                )}
              >
                {stepIndex + 1}. {step.title}
              </h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                {step.completed ? step.completedDescription : step.description}
              </p>
              {step.external ? (
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    step.completed
                      ? "text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/20"
                  )}
                >
                  {step.ctaLabel}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <Link
                  to={step.href}
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                >
                  {step.ctaLabel}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
