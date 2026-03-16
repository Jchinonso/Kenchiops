/**
 * Copy Link Button
 *
 * Small inline button that copies a URL to clipboard with visual feedback.
 * Used by detail panels (IncidentDetailPanel, AnalysisDetailPanel) to share
 * direct links to specific items.
 */

import { useState, useCallback } from "react";
import { Link2, Check } from "lucide-react";
import { COPY_FEEDBACK_MS } from "./constants";
import type { CopyLinkButtonProps } from "./types";

export const CopyLinkButton = ({ url }: CopyLinkButtonProps) => {
  const [copied, setCopied] = useState(false);

  // Reset copied state when url changes (render-time state adjustment)
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setCopied(false);
  }

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [url]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 transition-colors mt-1 self-start"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
};
