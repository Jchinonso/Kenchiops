/**
 * CopilotButton
 *
 * Floating action button to open the Copilot Drawer.
 * Fixed to the bottom-right of the dashboard viewport.
 */

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MessageSquare } from "lucide-react";

interface CopilotButtonProps {
  readonly onClick: () => void;
}

export const CopilotButton = ({ onClick }: CopilotButtonProps) => (
  <div className="fixed bottom-6 right-6 z-40">
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-lg"
          onClick={onClick}
          aria-label="Open Kenchi Copilot"
          className="rounded-full shadow-lg"
        >
          <MessageSquare className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Kenchi Copilot</TooltipContent>
    </Tooltip>
  </div>
);
