import type { ReactNode } from "react";

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

export interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly copied: boolean;
}
