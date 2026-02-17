/**
 * Command Palette
 *
 * Global search / command palette (Ctrl+K / Cmd+K).
 * Lists navigation items and quick actions.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  AlertTriangle,
  Search,
  Workflow,
  Webhook,
  BarChart3,
  Puzzle,
  Settings,
  Moon,
  Sun,
  Keyboard,
} from "lucide-react";

// ==================== Navigation Items ====================

interface PaletteItem {
  readonly label: string;
  readonly href: string;
  readonly icon: React.ReactNode;
  readonly comingSoon?: boolean;
}

const NAV_ITEMS: readonly PaletteItem[] = [
  { label: "Overview", href: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  {
    label: "CI/CD Failures",
    href: "/dashboard/cicd/failures",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  {
    label: "CI/CD Analyses",
    href: "/dashboard/cicd/analyses",
    icon: <Search className="w-4 h-4" />,
  },
  {
    label: "CI/CD Pipelines",
    href: "/dashboard/cicd/pipelines",
    icon: <Workflow className="w-4 h-4" />,
  },
  {
    label: "Webhook Activity",
    href: "/dashboard/cicd/webhooks",
    icon: <Webhook className="w-4 h-4" />,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <BarChart3 className="w-4 h-4" />,
    comingSoon: true,
  },
  {
    label: "Integrations",
    href: "/dashboard/integrations",
    icon: <Puzzle className="w-4 h-4" />,
    comingSoon: true,
  },
  { label: "Settings", href: "/dashboard/settings", icon: <Settings className="w-4 h-4" /> },
] as const;

// ==================== Props ====================

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly resolvedTheme: "light" | "dark";
  readonly onToggleTheme: () => void;
  readonly onOpenShortcuts: () => void;
}

// ==================== Component ====================

export const CommandPalette = ({
  open,
  onOpenChange,
  resolvedTheme,
  onToggleTheme,
  onOpenShortcuts,
}: CommandPaletteProps) => {
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false);
      navigate(href);
    },
    [navigate, onOpenChange]
  );

  const handleAction = useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search..."
        aria-label="Search commands and pages"
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} onSelect={() => handleSelect(item.href)}>
              {item.icon}
              <span>{item.label}</span>
              {item.comingSoon && (
                <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                  Soon
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleAction(onToggleTheme)}>
            {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>Toggle theme</span>
          </CommandItem>
          <CommandItem onSelect={() => handleAction(onOpenShortcuts)}>
            <Keyboard className="w-4 h-4" />
            <span>Keyboard shortcuts</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
