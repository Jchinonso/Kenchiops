/**
 * Confirmation dialogs for the Knowledge Base page:
 * single delete, bulk delete, and purge all.
 */

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type {
  DeleteConfirmDialogProps,
  BulkDeleteConfirmDialogProps,
  PurgeConfirmDialogProps,
} from "./types";

const destructiveClass = "bg-red-600 text-white hover:bg-red-700";
const disabledClass =
  "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none";

export const DeleteConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Document</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete this document? This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isDeleting}
          onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}
          className={cn(!isDeleting ? destructiveClass : disabledClass)}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const BulkDeleteConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  selectionCount,
  isDeleting,
}: BulkDeleteConfirmDialogProps) => {
  const plural = selectionCount > 1 ? "s" : "";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {selectionCount} Document{plural}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {selectionCount} selected document{plural}? This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className={cn(!isDeleting ? destructiveClass : disabledClass)}
          >
            {isDeleting ? "Deleting..." : `Delete ${selectionCount} Document${plural}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const PurgeConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  totalDocuments,
  isPurging,
}: PurgeConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Purge All Documents</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete all {totalDocuments} knowledge documents for your
          organization. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isPurging}
          onClick={(event) => {
            event.preventDefault();
            void onConfirm();
          }}
          className={cn(!isPurging ? destructiveClass : disabledClass)}
        >
          {isPurging ? "Purging..." : "Purge All"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
