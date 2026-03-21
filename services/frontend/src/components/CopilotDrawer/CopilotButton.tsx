/**
 * CopilotButton
 *
 * Floating action button to open the Copilot Drawer.
 * Fixed to the bottom-right of the dashboard viewport.
 * Includes a text label so users know what it does.
 */

import { Sparkles } from "lucide-react";

interface CopilotButtonProps {
  readonly onClick: () => void;
}

export const CopilotButton = ({ onClick }: CopilotButtonProps) => (
  <div className="fixed bottom-6 right-6 z-40">
    <button
      type="button"
      onClick={onClick}
      aria-label="Open Kenchi Copilot"
      className="group flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-100"
    >
      <Sparkles className="size-4" />
      <span className="text-sm font-medium">Ask Copilot</span>
    </button>
  </div>
);
