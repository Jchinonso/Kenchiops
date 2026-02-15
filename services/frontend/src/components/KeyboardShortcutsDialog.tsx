/**
 * Keyboard Shortcuts Dialog
 *
 * Displays available keyboard shortcuts in a modal dialog.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const SHORTCUTS: ReadonlyArray<{ readonly key: string; readonly description: string }> = [
  { key: "?", description: "Show keyboard shortcuts" },
  { key: "/", description: "Focus search (CI/CD pages)" },
  { key: "Esc", description: "Close dialogs and menus" },
];

interface KeyboardShortcutsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const KeyboardShortcutsDialog = ({ open, onOpenChange }: KeyboardShortcutsDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogDescription>Quick actions to navigate the dashboard.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 pt-2">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.key} className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
            <Kbd>{shortcut.key}</Kbd>
          </div>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
