/**
 * Error Boundary
 *
 * Root-level React error boundary that catches rendering crashes
 * and shows a recovery UI instead of a white screen.
 *
 * Uses a class component because React has no hook equivalent
 * for componentDidCatch / getDerivedStateFromError.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

// ==================== Types ====================

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

// ==================== Component ====================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console as last-resort boundary — structured logging is not available here
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught rendering error:", error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = "/dashboard";
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message ?? "An unexpected error occurred";
    const truncatedMessage = message.length > 200 ? `${message.slice(0, 200)}...` : message;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>

          <p className="text-sm text-gray-500 mb-2">
            The application encountered an unexpected error. You can try reloading the page or
            returning to the dashboard.
          </p>

          <p className="text-xs font-mono text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-6 break-words text-left">
            {truncatedMessage}
          </p>

          <div className="flex items-center gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>

            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-200 transition-colors"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
