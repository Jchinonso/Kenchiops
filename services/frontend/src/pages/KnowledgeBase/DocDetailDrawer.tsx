/**
 * Document Detail Drawer
 *
 * A slide-over sheet that displays the full content and metadata
 * of a knowledge base document. Includes a delete action with
 * confirmation dialog.
 */

import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatTimestamp, formatSnakeCase } from "@/lib/formatters";
import { isSafeUrl } from "@/lib/urlSafety";
import { useDeleteDocument } from "@/hooks/useKnowledgeBase";
import { cn } from "@/lib/utils";
import type { DocDetailDrawerProps } from "./types";

export const DocDetailDrawer = ({ doc, open, onOpenChange }: DocDetailDrawerProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { deleteDocument, isDeleting } = useDeleteDocument();

  const handleDelete = useCallback(async () => {
    if (!doc) {
      return;
    }
    const success = await deleteDocument(doc.id);
    if (success) {
      toast.success("Document deleted");
      setConfirmOpen(false);
      onOpenChange(false);
    } else {
      toast.error("Failed to delete document");
    }
  }, [doc, deleteDocument, onOpenChange]);

  if (!doc) {
    return null;
  }

  const safeSourceUrl = doc.sourceUrl && isSafeUrl(doc.sourceUrl) ? doc.sourceUrl : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col">
          <SheetHeader>
            <div className="flex items-start justify-between gap-2 pr-6">
              <SheetTitle className="text-lg leading-snug">{doc.title}</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                onClick={() => setConfirmOpen(true)}
                aria-label="Delete document"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <SheetDescription className="sr-only">
              Full details for knowledge document: {doc.title}
            </SheetDescription>
          </SheetHeader>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 px-4">
            <Badge variant="secondary" className="text-xs">
              {formatSnakeCase(doc.docType)}
            </Badge>
            {doc.repository && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{doc.repository}</span>
            )}
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {formatTimestamp(doc.createdAt)}
            </span>
          </div>

          {safeSourceUrl && (
            <div className="px-4">
              <a
                href={safeSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                View source
              </a>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <pre className="whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-300 font-mono bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-4 border border-zinc-200 dark:border-zinc-700">
              {doc.content}
            </pre>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
                void handleDelete();
              }}
              className={cn(
                !isDeleting
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
              )}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
