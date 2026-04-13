/**
 * GitLab Setup Page
 *
 * Onboarding flow for GitLab CI monitoring.
 * Users select which GitLab projects to enable for CI failure analysis.
 * The system auto-creates webhooks on selected projects via the GitLab API.
 */

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Gitlab, Search, Loader2, XCircle } from "lucide-react";
import { ProjectRow } from "./ProjectRow";
import { SetupResults } from "./SetupResults";
import { useProjectSelection, useWebhookSetup } from "./hooks";
import type { GitLabProject, UseProjectSelectionResult } from "./types";

// ==================== State Sub-Components ====================

const LoadingState = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
    <span className="ml-2 text-sm text-zinc-500">Loading your projects...</span>
  </div>
);

interface ErrorStateProps {
  readonly message: string;
}

const ErrorState = ({ message }: ErrorStateProps) => (
  <div className="text-center py-8">
    <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
    <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
    <p className="text-xs text-zinc-500 mt-1">
      Make sure you have Maintainer access to your GitLab projects.
    </p>
  </div>
);

interface EmptyStateProps {
  readonly onNavigate: () => void;
}

const EmptyState = ({ onNavigate }: EmptyStateProps) => (
  <div className="text-center py-8">
    <Gitlab className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
    <p className="text-sm text-zinc-500">No projects found with Maintainer access.</p>
    <p className="text-xs text-zinc-400 mt-1">
      You need at least Maintainer-level access to enable CI monitoring.
    </p>
    <Button variant="ghost" size="sm" className="mt-4" onClick={onNavigate}>
      Go to Dashboard
    </Button>
  </div>
);

// ==================== Main Component ====================

export const GitLabSetup = () => {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.integrations.gitlab.availableProjects(),
    queryFn: () => fetchQuery<readonly GitLabProject[]>("/integrations/gitlab/available-projects"),
  });
  const projects = query.data ?? null;

  const selection = useProjectSelection(projects);
  const webhookSetup = useWebhookSetup();

  const goToDashboard = () => navigate("/dashboard");

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
            <Gitlab className="w-6 h-6 text-orange-500" />
          </div>
          <CardTitle className="text-xl">Enable GitLab CI Monitoring</CardTitle>
          <CardDescription>
            Select which projects to monitor for CI/CD failures. Kenchi will automatically analyze
            failed pipelines and post results as merge request comments.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {query.isPending && <LoadingState />}

          {query.error && <ErrorState message={query.error.message} />}

          {webhookSetup.setupResults && (
            <SetupResults
              results={webhookSetup.setupResults}
              onRetryFailed={webhookSetup.handleRetryFailed}
              onContinue={goToDashboard}
              isRetrying={webhookSetup.isRetrying}
            />
          )}

          {!query.isPending &&
            !query.error &&
            !webhookSetup.setupResults &&
            projects &&
            (projects.length === 0 ? (
              <EmptyState onNavigate={goToDashboard} />
            ) : (
              <ProjectSelection
                selection={selection}
                isSubmitting={webhookSetup.isSubmitting}
                onSubmit={() => webhookSetup.handleSubmit(selection.selectedIds)}
                onSkip={goToDashboard}
              />
            ))}
        </CardContent>
      </Card>
    </div>
  );
};

// ==================== Project Selection ====================

interface ProjectSelectionProps {
  readonly selection: UseProjectSelectionResult;
  readonly isSubmitting: boolean;
  readonly onSubmit: () => void;
  readonly onSkip: () => void;
}

const ProjectSelection = ({ selection, isSubmitting, onSubmit, onSkip }: ProjectSelectionProps) => (
  <>
    {/* Search + select all */}
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder="Search projects..."
          value={selection.searchQuery}
          onChange={(event) => selection.setSearchQuery(event.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
        />
      </div>
      <Button variant="outline" size="sm" onClick={selection.handleSelectAll} className="shrink-0">
        {selection.allFilteredSelected ? "Deselect All" : "Select All"}
      </Button>
    </div>

    {/* Project list */}
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {selection.filteredProjects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          selected={selection.selectedIds.has(project.id)}
          onToggle={selection.handleToggle}
          disabled={isSubmitting}
        />
      ))}
    </div>

    {selection.filteredProjects.length === 0 && selection.searchQuery && (
      <p className="text-center text-sm text-zinc-500 py-4">
        No projects match &quot;{selection.searchQuery}&quot;
      </p>
    )}

    {/* Footer */}
    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">
        {selection.selectedIds.size > 0
          ? `${String(selection.selectedIds.size)} project${selection.selectedIds.size > 1 ? "s" : ""} selected`
          : "Select projects to enable"}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip for now
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={selection.selectedIds.size === 0 || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              Enable {selection.selectedIds.size > 0 ? String(selection.selectedIds.size) : ""}{" "}
              Project
              {selection.selectedIds.size !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      </div>
    </div>
  </>
);
