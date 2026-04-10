/**
 * GitLab Setup Hooks
 *
 * Custom hooks for the GitLab setup flow:
 * - useProjectSelection: manages selected project IDs, search, and toggle logic
 * - useWebhookSetup: TanStack Query mutations for submitting/retrying webhook setup
 */

import { useState, useMemo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import type {
  GitLabProject,
  ProjectSetupResult,
  SetupResponse,
  UseProjectSelectionResult,
  UseWebhookSetupResult,
} from "./types";

// ==================== Project Selection ====================

export const useProjectSelection = (
  projects: readonly GitLabProject[] | null
): UseProjectSelectionResult => {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

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

  const allFilteredSelected = useMemo(
    () =>
      filteredProjects.length > 0 &&
      filteredProjects.every((project) => selectedIds.has(project.id)),
    [filteredProjects, selectedIds]
  );

  const handleSelectAll = useCallback(() => {
    const allFilteredIds = filteredProjects.map((project) => project.id);

    setSelectedIds((prev) =>
      allFilteredIds.every((id) => prev.has(id))
        ? new Set([...prev].filter((id) => !allFilteredIds.includes(id)))
        : new Set([...prev, ...allFilteredIds])
    );
  }, [filteredProjects]);

  return useMemo(
    () => ({
      selectedIds,
      searchQuery,
      setSearchQuery,
      filteredProjects,
      allFilteredSelected,
      handleToggle,
      handleSelectAll,
    }),
    [selectedIds, searchQuery, filteredProjects, allFilteredSelected, handleToggle, handleSelectAll]
  );
};

// ==================== Webhook Setup Mutations ====================

export const useWebhookSetup = (): UseWebhookSetupResult => {
  const queryClient = useQueryClient();
  const [setupResults, setSetupResults] = useState<readonly ProjectSetupResult[] | null>(null);

  const submitMutation = useMutation({
    mutationFn: (projectIds: readonly number[]) =>
      fetchMutation<SetupResponse>("/integrations/gitlab/setup-webhooks", {
        method: "POST",
        body: { projectIds },
      }),
    onSuccess: (data) => {
      setSetupResults(data.results);

      const successCount = data.results.filter((entry) => entry.success).length;
      if (successCount > 0) {
        toast.success(
          `Enabled CI monitoring for ${String(successCount)} project${successCount > 1 ? "s" : ""}`
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.tenant() });
      }
    },
    onError: () => {
      toast.error("Failed to set up webhooks. Please try again.");
    },
  });

  const retryMutation = useMutation({
    mutationFn: (failedIds: readonly number[]) =>
      fetchMutation<SetupResponse>("/integrations/gitlab/setup-webhooks", {
        method: "POST",
        body: { projectIds: failedIds },
      }),
    onSuccess: (retryResult) => {
      setSetupResults((prev) => {
        if (!prev) {
          return retryResult.results;
        }
        const retryResultMap = new Map(
          retryResult.results.map((entry) => [entry.projectId, entry])
        );
        return prev.map((entry) => retryResultMap.get(entry.projectId) ?? entry);
      });

      const newSuccesses = retryResult.results.filter((entry) => entry.success).length;
      if (newSuccesses > 0) {
        toast.success(`${String(newSuccesses)} more project${newSuccesses > 1 ? "s" : ""} enabled`);
      }
    },
    onError: () => {
      toast.error("Retry failed. Please try again.");
    },
  });

  const handleSubmit = useCallback(
    (projectIds: ReadonlySet<number>) => {
      if (projectIds.size === 0) {
        return;
      }
      submitMutation.mutate([...projectIds]);
    },
    [submitMutation]
  );

  const handleRetryFailed = useCallback(() => {
    if (!setupResults) {
      return;
    }

    const failedIds = setupResults
      .filter((entry) => !entry.success)
      .map((entry) => entry.projectId);

    if (failedIds.length === 0) {
      return;
    }

    retryMutation.mutate(failedIds);
  }, [setupResults, retryMutation]);

  return useMemo(
    () => ({
      setupResults,
      isSubmitting: submitMutation.isPending,
      isRetrying: retryMutation.isPending,
      handleSubmit,
      handleRetryFailed,
    }),
    [
      setupResults,
      submitMutation.isPending,
      retryMutation.isPending,
      handleSubmit,
      handleRetryFailed,
    ]
  );
};
