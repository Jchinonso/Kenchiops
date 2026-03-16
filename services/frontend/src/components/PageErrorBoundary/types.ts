import type { ReactNode } from "react";

export interface PageErrorBoundaryProps {
  readonly children: ReactNode;
}

export interface PageErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}
