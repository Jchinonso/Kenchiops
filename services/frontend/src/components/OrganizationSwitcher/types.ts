import type { AuthOrganization } from "@/hooks/useAuth";

export interface ProviderIconProps {
  readonly provider: string;
  readonly className?: string;
}

export interface OrgItemProps {
  readonly org: AuthOrganization;
  readonly onSelect: (orgId: string) => void;
  readonly disabled: boolean;
}
