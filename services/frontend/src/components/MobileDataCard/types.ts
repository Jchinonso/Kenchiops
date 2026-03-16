export interface MobileDataCardBadge {
  readonly label: string;
  readonly className: string;
}

export interface MobileDataCardField {
  readonly label: string;
  readonly value: React.ReactNode;
}

export interface MobileDataCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly timestamp?: string;
  readonly badges?: readonly MobileDataCardBadge[];
  readonly fields?: readonly MobileDataCardField[];
  readonly onClick?: () => void;
  readonly isExpanded?: boolean;
  readonly actions?: React.ReactNode;
  readonly expandedContent?: React.ReactNode;
  readonly className?: string;
}
