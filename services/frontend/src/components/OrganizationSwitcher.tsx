/**
 * Organization Switcher
 *
 * Compact sidebar widget that displays the current organization
 * and allows switching between organizations the user belongs to.
 * Uses Popover + Command pattern from shadcn/ui primitives.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type AuthOrganization } from "@/hooks/useAuth";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Github, Gitlab, Check, ChevronsUpDown, Building2, Loader2 } from "lucide-react";

// ==================== Sub-components ====================

interface ProviderIconProps {
  readonly provider: string;
  readonly className?: string;
}

const ProviderIcon = ({ provider, className }: ProviderIconProps) => {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider === "github") {
    return <Github className={cn("w-4 h-4", className)} />;
  }

  if (normalizedProvider === "gitlab") {
    return <Gitlab className={cn("w-4 h-4", className)} />;
  }

  return <Building2 className={cn("w-4 h-4", className)} />;
};

interface OrgItemProps {
  readonly org: AuthOrganization;
  readonly onSelect: (orgId: string) => void;
  readonly disabled: boolean;
}

const OrgItem = ({ org, onSelect, disabled }: OrgItemProps) => (
  <CommandItem
    value={org.orgName}
    onSelect={() => {
      if (!org.isSelected) {
        onSelect(org.tenantId);
      }
    }}
    disabled={disabled}
    className="flex items-center gap-2 px-2 py-2 cursor-pointer"
  >
    <ProviderIcon provider={org.provider} className="text-muted-foreground shrink-0" />
    <span className="flex-1 truncate">{org.orgName}</span>
    {org.tenantType === "personal" && (
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide shrink-0">
        Personal
      </span>
    )}
    {org.isSelected && <Check className="w-4 h-4 text-indigo-500 shrink-0" />}
  </CommandItem>
);

// ==================== Main Component ====================

export const OrganizationSwitcher = () => {
  const { user, isSwitchingOrg, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const organizations = user?.organizations ?? [];
  const selectedOrg = organizations.find((org) => org.isSelected);
  const hasMultipleOrgs = organizations.length > 1;

  const handleSelect = useCallback(
    async (orgId: string) => {
      setOpen(false);
      const { hasProviderConnection } = await switchOrganization(orgId);
      // Navigate to onboarding when no provider installed, overview otherwise.
      // Sub-route data is stale after tenant switch, so always leave the current route.
      navigate(hasProviderConnection ? "/dashboard" : "/dashboard/onboarding");
    },
    [switchOrganization, navigate]
  );

  // Guard: no organizations at all (shouldn't happen, but defensive)
  if (organizations.length === 0) {
    return null;
  }

  const displayName = selectedOrg?.orgName ?? organizations[0]?.orgName ?? "Organization";
  const displayProvider = selectedOrg?.provider ?? organizations[0]?.provider ?? "";

  // Single org: just display, no dropdown
  if (!hasMultipleOrgs) {
    return (
      <div className="px-4 py-3 md:px-2 md:py-2 lg:px-4 lg:py-3">
        <div className="flex items-center gap-2 md:justify-center lg:justify-start">
          <ProviderIcon
            provider={displayProvider}
            className="text-zinc-500 dark:text-zinc-400 shrink-0"
          />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate hidden md:hidden lg:inline">
            {displayName}
          </span>
        </div>
      </div>
    );
  }

  // Multiple orgs: show switcher with popover
  return (
    <div className="px-4 py-3 md:px-2 md:py-2 lg:px-4 lg:py-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Switch organization"
            className={cn(
              "flex items-center gap-2 w-full rounded-lg px-3 py-2 md:justify-center md:px-2 lg:justify-start lg:px-3",
              "text-sm font-medium text-zinc-700 dark:text-zinc-300",
              "hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
              "border border-zinc-200 dark:border-zinc-700"
            )}
            disabled={isSwitchingOrg}
          >
            {isSwitchingOrg ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <ProviderIcon provider={displayProvider} className="shrink-0" />
            )}
            <span className="flex-1 text-left truncate hidden md:hidden lg:inline">
              {isSwitchingOrg ? "Switching..." : displayName}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 hidden md:hidden lg:block" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" sideOffset={4} className="w-56 p-0">
          <Command>
            <CommandList>
              <CommandEmpty>No organizations found.</CommandEmpty>
              <CommandGroup heading="Organizations">
                {organizations.map((org) => (
                  <OrgItem
                    key={org.id}
                    org={org}
                    onSelect={handleSelect}
                    disabled={isSwitchingOrg}
                  />
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
