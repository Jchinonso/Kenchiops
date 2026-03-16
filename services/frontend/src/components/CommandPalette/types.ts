export interface PaletteItem {
  readonly label: string;
  readonly href: string;
  readonly icon: React.ReactNode;
  readonly comingSoon?: boolean;
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly resolvedTheme: "light" | "dark";
  readonly onToggleTheme: () => void;
  readonly onOpenShortcuts: () => void;
}
