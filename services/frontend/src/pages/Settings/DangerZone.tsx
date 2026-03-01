/**
 * Collapsible Danger Zone — collapsed by default, expands to show delete account.
 * Uses AnimatePresence for smooth expand/collapse animation.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { itemVariants } from "@/lib/animations";
import type { DeletionImpact } from "@/hooks/useDeletionImpact";
import { DELETE_CONFIRMATION } from "./constants";

interface DangerZoneProps {
  readonly impact: DeletionImpact | null;
  readonly impactLoading: boolean;
  readonly impactError: string | null;
  readonly fetchImpact: () => Promise<void>;
  readonly onDeleteAccount: () => Promise<void>;
  readonly deleteLoading: boolean;
}

export const DangerZone = ({
  impact,
  impactLoading,
  impactError,
  fetchImpact,
  onDeleteAccount,
  deleteLoading,
}: DangerZoneProps) => {
  const [expanded, setExpanded] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const isDeleteConfirmed = deleteConfirmation === DELETE_CONFIRMATION;

  const handleDialogChange = useCallback(
    (open: boolean) => {
      setDeleteDialogOpen(open);
      if (open) {
        void fetchImpact();
      }
      if (!open) {
        setDeleteConfirmation("");
      }
    },
    [fetchImpact]
  );

  return (
    <motion.div variants={itemVariants}>
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="danger-zone-content"
        className="w-full flex items-center justify-between py-4 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-red-200 dark:hover:border-red-800/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Danger Zone</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Irreversible account actions</p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-zinc-400 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            id="danger-zone-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Delete Account
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Permanently delete your account and all associated data. This cannot be undone.
                  </p>
                </div>
                <AlertDialog open={deleteDialogOpen} onOpenChange={handleDialogChange}>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >
                      Delete Account
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          {impactLoading ? (
                            <p>Checking account impact...</p>
                          ) : impactError ? (
                            <p className="mb-2 text-amber-600 dark:text-amber-400">
                              Could not check account impact. You may still proceed with deletion.
                            </p>
                          ) : impact?.willDeleteTenant ? (
                            <>
                              <p className="mb-2 text-red-600 dark:text-red-400 font-medium">
                                You are the last member of{" "}
                                {impact.tenantName ?? "your organization"}.
                              </p>
                              <p className="mb-2">
                                Deleting your account will also permanently delete your organization
                                and all associated data, including CI provider connections
                                {impact.affectedResources.gitlabWebhooks > 0
                                  ? `, ${String(impact.affectedResources.gitlabWebhooks)} GitLab webhook${impact.affectedResources.gitlabWebhooks > 1 ? "s" : ""}`
                                  : ""}
                                {impact.affectedResources.hasSlackIntegration
                                  ? ", Slack integration"
                                  : ""}
                                , repository mappings, and analysis history. This cannot be undone.
                              </p>
                            </>
                          ) : (
                            <p className="mb-2">
                              This action cannot be undone. All your data, settings, and linked
                              accounts will be permanently deleted.
                            </p>
                          )}
                          <p>
                            Type{" "}
                            <strong className="text-zinc-900 dark:text-zinc-100">DELETE</strong>{" "}
                            below to confirm.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      placeholder='Type "DELETE" to confirm'
                      className="font-mono"
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={!isDeleteConfirmed || deleteLoading}
                        onClick={(event) => {
                          event.preventDefault();
                          void onDeleteAccount();
                        }}
                        className={cn(
                          isDeleteConfirmed && !deleteLoading
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
                        )}
                      >
                        {deleteLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            Deleting...
                          </>
                        ) : (
                          "Delete Account"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
