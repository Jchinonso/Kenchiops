/**
 * Page Error Boundary
 *
 * Lightweight error boundary for individual dashboard sub-pages.
 * Unlike the root ErrorBoundary, this renders an inline error card
 * within the existing dashboard layout (sidebar + header remain usable).
 *
 * Usage: wrap with `key={pathname}` so the boundary resets on navigation.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// ==================== Types ====================

interface PageErrorBoundaryProps {
  readonly children: ReactNode;
}

interface PageErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

// ==================== Component ====================

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<PageErrorBoundaryState> {
    return { hasError: true, error };
  }

  // componentDidCatch is intentionally a no-op here. The root-level ErrorBoundary
  // already logs to console as the last-resort boundary. This page-level boundary
  // only provides a recovery UI — duplicate logging would be noise.
  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Logged by root ErrorBoundary
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="py-10 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              This page encountered an error
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Something went wrong rendering this section. You can try again or navigate to a
              different page using the sidebar.
            </p>
          </div>
          {this.state.error && (
            <pre className="text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-lg p-3 max-w-lg mx-auto overflow-auto max-h-32 whitespace-pre-wrap break-words">
              {this.state.error.message.length > 300
                ? `${this.state.error.message.slice(0, 300)}...`
                : this.state.error.message}
            </pre>
          )}
          <div className="flex items-center gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
