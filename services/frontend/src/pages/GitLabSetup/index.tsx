/**
 * GitLab Setup Page
 *
 * Onboarding flow for GitLab CI monitoring.
 * Users select which GitLab projects to enable for CI failure analysis.
 * The system auto-creates webhooks on selected projects via the GitLab API.
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fetchQuery, parseErrorBody } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Gitlab, Search, Loader2, XCircle } from "lucide-react";
import { ProjectRow } from "./ProjectRow";
import { SetupResults } from "./SetupResults";
import type { GitLabProject, ProjectSetupResult, SetupResponse } from "./types";

export const GitLabSetup = () => {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.integrations.gitlab.availableProjects(),
    queryFn: () => fetchQuery<readonly GitLabProject[]>("/integrations/gitlab/available-projects"),
  });
  const projects = query.data ?? null;
  const isLoading = query.isPending;
  const error = query.error?.message ?? null;

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupResults, setSetupResults] = useState<readonly ProjectSetupResult[] | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const filteredProjects = useMemo(() => {
    if (!projects) {
      return [];
    }
    const lowerSearch = searchQuery.toLowerCase();
    return lowerSearch
      ? projects.filter(
          (project) =>
            project.fullPath.toLowerCase().includes(lowerSearch) ||
            project.name.toLowerCase().includes(lowerSearch)
        )
      : [...projects];
  }, [projects, searchQuery]);

  const handleToggle = useCallback((projectId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allFilteredIds = filteredProjects.map((project) => project.id);
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...allFilteredIds]));
    }
  }, [filteredProjects, selectedIds]);

  const submitWebhooks = useCallback(
    async (projectIds: readonly number[]): Promise<SetupResponse> => {
      const response = await apiClient("/integrations/gitlab/setup-webhooks", {
        method: "POST",
        body: { projectIds },
      });

      if (!response.ok) {
        const errorMsg = await parseErrorBody(response, "Failed to set up webhooks");
        // Re-throw with the parsed message for the caller to handle
        return Promise.reject(errorMsg);
      }

      const json: { readonly data: SetupResponse } = await response.json();
      return json.data;
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitWebhooks([...selectedIds]);
      setSetupResults(result.results);

      const successCount = result.results.filter((entry) => entry.success).length;
      if (successCount > 0) {
        toast.success(
          `Enabled CI monitoring for ${String(successCount)} project${successCount > 1 ? "s" : ""}`
        );
      }
    } catch {
      toast.error("Failed to set up webhooks. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedIds, submitWebhooks]);

  const handleRetryFailed = useCallback(async () => {
    if (!setupResults) {
      return;
    }

    const failedIds = setupResults
      .filter((entry) => !entry.success)
      .map((entry) => entry.projectId);

    if (failedIds.length === 0) {
      return;
    }

    setIsRetrying(true);
    try {
      const retryResult = await submitWebhooks(failedIds);

      // Merge: keep old successes, replace old failures with new results
      const retryResultMap = new Map(retryResult.results.map((entry) => [entry.projectId, entry]));
      const merged = setupResults.map((entry) => retryResultMap.get(entry.projectId) ?? entry);
      setSetupResults(merged);

      const newSuccesses = retryResult.results.filter((entry) => entry.success).length;
      if (newSuccesses > 0) {
        toast.success(`${String(newSuccesses)} more project${newSuccesses > 1 ? "s" : ""} enabled`);
      }
    } catch {
      toast.error("Retry failed. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  }, [setupResults, submitWebhooks]);

  const handleSkip = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const handleContinue = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const allFilteredSelected =
    filteredProjects.length > 0 && filteredProjects.every((project) => selectedIds.has(project.id));

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
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              <span className="ml-2 text-sm text-zinc-500">Loading your projects...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="text-center py-8">
              <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Make sure you have Maintainer access to your GitLab projects.
              </p>
            </div>
          )}

          {/* Setup results */}
          {setupResults && (
            <SetupResults
              results={setupResults}
              onRetryFailed={handleRetryFailed}
              onContinue={handleContinue}
              isRetrying={isRetrying}
            />
          )}

          {/* Project selection */}
          {!isLoading && !error && !setupResults && projects && (
            <>
              {projects.length === 0 ? (
                <div className="text-center py-8">
                  <Gitlab className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No projects found with Maintainer access.</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    You need at least Maintainer-level access to enable CI monitoring.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-4" onClick={handleSkip}>
                    Go to Dashboard
                  </Button>
                </div>
              ) : (
                <>
                  {/* Search + select all */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      className="shrink-0"
                    >
                      {allFilteredSelected ? "Deselect All" : "Select All"}
                    </Button>
                  </div>

                  {/* Project list */}
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {filteredProjects.map((project) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        selected={selectedIds.has(project.id)}
                        onToggle={handleToggle}
                        disabled={isSubmitting}
                      />
                    ))}
                  </div>

                  {filteredProjects.length === 0 && searchQuery && (
                    <p className="text-center text-sm text-zinc-500 py-4">
                      No projects match &quot;{searchQuery}&quot;
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500">
                      {selectedIds.size > 0
                        ? `${String(selectedIds.size)} project${selectedIds.size > 1 ? "s" : ""} selected`
                        : "Select projects to enable"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={handleSkip}>
                        Skip for now
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={selectedIds.size === 0 || isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Setting up...
                          </>
                        ) : (
                          <>
                            Enable {selectedIds.size > 0 ? String(selectedIds.size) : ""} Project
                            {selectedIds.size !== 1 ? "s" : ""}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
