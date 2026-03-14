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

interface ShortcutGroup {
  readonly label: string;
  readonly shortcuts: ReadonlyArray<{ readonly key: string; readonly description: string }>;
}

const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    label: "General",
    shortcuts: [
      { key: "Ctrl+K", description: "Open command palette" },
      { key: "?", description: "Show keyboard shortcuts" },
      { key: "Esc", description: "Close dialogs and menus" },
      { key: "t", description: "Toggle light / dark theme" },
      { key: "r", description: "Refresh dashboard data" },
    ],
  },
  {
    label: "Navigation",
    shortcuts: [
      { key: "g then o", description: "Go to Overview" },
      { key: "g then f", description: "Go to Failures" },
      { key: "g then a", description: "Go to Analyses" },
    ],
  },
  {
    label: "Tables",
    shortcuts: [{ key: "/", description: "Focus repository filter" }],
  },
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
      <div className="space-y-5 pt-2">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label}>
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              {group.label}
            </h4>
            <div className="space-y-2">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between py-1">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {shortcut.description}
                  </span>
                  <Kbd>{shortcut.key}</Kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
