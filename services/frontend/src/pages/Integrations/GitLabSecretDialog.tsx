/**
 * Dialog shown once after connecting GitLab CI, displaying the webhook URL
 * and secret for the user to copy. The secret cannot be retrieved again.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Copy, Check, AlertTriangle } from "lucide-react";
import type { GitLabSecretDialogProps } from "./types";

export const GitLabSecretDialog = ({
  open,
  onOpenChange,
  webhookUrl,
  webhookSecret,
}: GitLabSecretDialogProps) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleCopyUrl = useCallback(async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [webhookUrl]);

  const handleCopySecret = useCallback(async () => {
    await navigator.clipboard.writeText(webhookSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }, [webhookSecret]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>GitLab CI Connected</DialogTitle>
          <DialogDescription>
            Save these credentials now. The webhook secret cannot be retrieved after you close this
            dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning */}
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Copy the webhook secret below. It is encrypted at rest and cannot be shown again.
            </p>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1.5">
              Webhook URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 truncate select-all">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedUrl ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1.5">
              Webhook Secret
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 truncate select-all">
                {webhookSecret}
              </code>
              <button
                type="button"
                onClick={handleCopySecret}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {copiedSecret ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedSecret ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Setup Instructions */}
          <div className="rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Setup Instructions
            </p>
            <ol className="space-y-1.5 list-decimal ml-4">
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                In your GitLab project, go to Settings &rarr; Webhooks
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                Paste the Webhook URL above
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                Enter the Webhook Secret in the "Secret token" field
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">
                Select "Pipeline events" and "Job events" triggers
              </li>
              <li className="text-xs text-zinc-600 dark:text-zinc-400">Click "Add webhook"</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
