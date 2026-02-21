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
import { AlertTriangle, RefreshCw, Home, Copy, Check, ExternalLink, Search } from "lucide-react";

// ==================== Types ====================

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly copied: boolean;
}

// ==================== Component ====================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console as last-resort boundary — structured logging is not available here
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught rendering error:", error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    // Hard reload to fully reset React state (avoids client-side routing loops)
    window.location.reload();
  };

  private handleGoHome = (): void => {
    // Hard navigation (not React Router) to bypass any broken component tree
    window.location.href = "/";
  };

  private handleCopyDiagnostic = (): void => {
    const errorMessage = this.state.error?.message ?? "Unknown error";
    const diagnostic = [
      `Kenchi Error Report`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `Error: ${errorMessage}`,
      `UA: ${navigator.userAgent}`,
    ].join("\n");

    void navigator.clipboard.writeText(diagnostic).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950">
        {/* Minimal sidebar navigation so user isn't trapped */}
        <nav className="hidden sm:flex flex-col w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-8 px-2">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Kenchi</span>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </a>
          <a
            href="/dashboard/cicd/analyses"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors mt-1"
          >
            <Search className="w-4 h-4" />
            Analyses
          </a>
          <a
            href="/dashboard/settings"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors mt-1"
          >
            Settings
          </a>
        </nav>

        {/* Error content */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8 text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Something went wrong
            </h1>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              The application encountered an unexpected error. Try reloading the page or navigating
              to a different section using the sidebar.
            </p>

            {this.state.error && (
              <pre className="text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-lg p-3 mb-4 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            )}

            <div className="flex items-center gap-3 justify-center mb-4">
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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
              >
                <Home className="w-4 h-4" />
                Home
              </button>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
              <button
                type="button"
                onClick={this.handleCopyDiagnostic}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {this.state.copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy diagnostic info
                  </>
                )}
              </button>

              <p className="text-xs text-gray-400 dark:text-gray-500">
                Need help?{" "}
                <a
                  href="https://github.com/kenchiops/kenchi/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-indigo-500 hover:text-indigo-600 transition-colors"
                >
                  Report an issue
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
