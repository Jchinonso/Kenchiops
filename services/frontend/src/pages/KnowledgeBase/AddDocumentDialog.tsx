/**
 * Add Document Dialog
 *
 * A dialog for manually ingesting a new knowledge document
 * into the RAG knowledge base.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatSnakeCase } from "@/lib/formatters";
import { useAddDocument } from "@/hooks/useKnowledgeBase";
import type { AddDocumentDialogProps } from "./types";

/**
 * Valid document types for the select dropdown.
 * Matches KNOWLEDGE_DOC_TYPES values from packages/shared/src/constants/ragConstants.ts.
 */
const DOC_TYPE_OPTIONS = [
  "runbook",
  "sop",
  "troubleshooting",
  "postmortem",
  "known_issues",
  "ci_cd",
  "deployment",
  "testing",
  "infrastructure",
  "documentation",
  "api_docs",
  "architecture",
  "config_guide",
  "database",
  "readme",
  "changelog",
  "onboarding",
  "external",
] as const;

const TITLE_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 50_000;

export const AddDocumentDialog = ({ open, onOpenChange }: AddDocumentDialogProps) => {
  const { addDocument, isLoading } = useAddDocument();

  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [content, setContent] = useState("");
  const [repository, setRepository] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const isTitleValid = title.trim().length > 0;
  const isDocTypeValid = docType.length > 0;
  const isContentValid = content.trim().length > 0;
  const canSubmit = isTitleValid && isDocTypeValid && isContentValid && !isLoading;

  const resetForm = () => {
    setTitle("");
    setDocType("");
    setContent("");
    setRepository("");
    setSourceUrl("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    const result = await addDocument({
      docType,
      title: title.trim(),
      content: content.trim(),
      ...(repository.trim().length > 0 ? { repository: repository.trim() } : {}),
      ...(sourceUrl.trim().length > 0 ? { sourceUrl: sourceUrl.trim() } : {}),
    });

    if (result) {
      toast.success("Document added to knowledge base");
      resetForm();
      onOpenChange(false);
    } else {
      toast.error("Failed to add document");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isLoading) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Knowledge Document</DialogTitle>
          <DialogDescription>
            Manually add a document to the RAG knowledge base for AI-powered analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="doc-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="doc-title"
              placeholder="e.g. Database connection pool exhaustion runbook"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, TITLE_MAX_LENGTH))}
              disabled={isLoading}
              maxLength={TITLE_MAX_LENGTH}
            />
          </div>

          {/* Doc Type */}
          <div className="space-y-2">
            <Label htmlFor="doc-type">
              Document Type <span className="text-red-500">*</span>
            </Label>
            <Select value={docType} onValueChange={setDocType} disabled={isLoading}>
              <SelectTrigger id="doc-type" className="w-full">
                <SelectValue placeholder="Select a document type" />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatSnakeCase(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="doc-content">
              Content <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="doc-content"
              placeholder="Paste or write the document content..."
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, CONTENT_MAX_LENGTH))}
              disabled={isLoading}
              rows={8}
              maxLength={CONTENT_MAX_LENGTH}
              className="font-mono text-sm resize-none"
            />
            <p className="text-xs text-zinc-400">
              {content.length.toLocaleString()}/{CONTENT_MAX_LENGTH.toLocaleString()} characters
            </p>
          </div>

          {/* Repository (optional) */}
          <div className="space-y-2">
            <Label htmlFor="doc-repo">Repository (optional)</Label>
            <Input
              id="doc-repo"
              placeholder="e.g. owner/repo-name"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Source URL (optional) */}
          <div className="space-y-2">
            <Label htmlFor="doc-source-url">Source URL (optional)</Label>
            <Input
              id="doc-source-url"
              placeholder="e.g. https://docs.example.com/runbook"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
