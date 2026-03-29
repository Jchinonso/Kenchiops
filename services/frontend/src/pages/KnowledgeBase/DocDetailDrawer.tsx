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
import { useDeleteDocument, useFullDocumentContent } from "@/hooks/useKnowledgeBase";
import { cn } from "@/lib/utils";
import type { DocDetailDrawerProps } from "./types";

/**
 * Renders markdown-like content with headings, code blocks, lists, and bold.
 * Lightweight — no external markdown library needed.
 */
const renderDocContent = (content: string): React.ReactNode => {
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return blocks.map((block, blockIdx) => {
    const blockKey = `blk-${String(blockIdx)}`;

    if (block.startsWith("```") && block.endsWith("```")) {
      const inner = block.slice(3, -3);
      const newlineIdx = inner.indexOf("\n");
      const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
      return (
        <pre
          key={blockKey}
          className="my-3 overflow-x-auto rounded-md bg-zinc-100 dark:bg-zinc-800 p-3 text-xs font-mono border border-zinc-200 dark:border-zinc-700"
        >
          <code>{code}</code>
        </pre>
      );
    }

    const lines = block.split("\n");
    return (
      <div key={blockKey}>
        {lines.map((line, lineIdx) => {
          const lineKey = `${blockKey}-${String(lineIdx)}`;
          const trimmed = line.trim();

          if (trimmed === "") {
            return <div key={lineKey} className="h-2" />;
          }

          if (trimmed.startsWith("## ")) {
            return (
              <h3
                key={lineKey}
                className="mt-4 mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {trimmed.slice(3)}
              </h3>
            );
          }

          if (trimmed.startsWith("# ")) {
            return (
              <h2
                key={lineKey}
                className="mt-5 mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100"
              >
                {trimmed.slice(2)}
              </h2>
            );
          }

          if (trimmed.startsWith("- **") || trimmed.startsWith("* **")) {
            const rest = trimmed.slice(2);
            return (
              <div
                key={lineKey}
                className="flex gap-2 ml-2 my-0.5 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="text-zinc-400 select-none">•</span>
                <span>{renderInline(rest)}</span>
              </div>
            );
          }

          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            return (
              <div
                key={lineKey}
                className="flex gap-2 ml-2 my-0.5 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="text-zinc-400 select-none">•</span>
                <span>{renderInline(trimmed.slice(2))}</span>
              </div>
            );
          }

          return (
            <p key={lineKey} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {renderInline(trimmed)}
            </p>
          );
        })}
      </div>
    );
  });
};

/** Renders bold and inline code within a text line. */
const renderInline = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, partIdx) => {
    const partKey = `inline-${String(partIdx)}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={partKey} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={partKey}
          className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-indigo-600 dark:text-indigo-400"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={partKey}>{part}</span>;
  });
};

export const DocDetailDrawer = ({ doc, open, onOpenChange }: DocDetailDrawerProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { deleteDocument, isDeleting } = useDeleteDocument();
  const fullContent = useFullDocumentContent(
    open ? doc?.title : undefined,
    open ? doc?.docType : undefined
  );
  const displayContent = fullContent.data?.content ?? doc?.content ?? "";

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
            {fullContent.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-sm text-zinc-400">Loading full content...</span>
              </div>
            ) : (
              renderDocContent(displayContent)
            )}
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
