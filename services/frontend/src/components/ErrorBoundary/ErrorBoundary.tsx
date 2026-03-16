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
import type { ErrorBoundaryProps, ErrorBoundaryState } from "./types";

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
    // Strip query params from the URL to avoid leaking tokens or session data
    const safeUrl = `${window.location.origin}${window.location.pathname}`;
    const truncatedError =
      errorMessage.length > 300 ? `${errorMessage.slice(0, 300)}...` : errorMessage;
    const diagnostic = [
      `Kenchi Error Report`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${safeUrl}`,
      `Error: ${truncatedError}`,
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
      <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
        {/* Minimal sidebar navigation so user isn't trapped */}
        <nav className="hidden sm:flex flex-col w-56 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-8 px-2">
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Kenchi</span>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </a>
          <a
            href="/dashboard/cicd/analyses"
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors mt-1"
          >
            <Search className="w-4 h-4" />
            Analyses
          </a>
          <a
            href="/dashboard/settings"
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors mt-1"
          >
            Settings
          </a>
        </nav>

        {/* Error content */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Something went wrong
            </h1>

            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
              The application encountered an unexpected error. Try reloading the page or navigating
              to a different section using the sidebar.
            </p>

            {this.state.error && (
              <pre className="text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-lg p-3 mb-4 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                {this.state.error.message.length > 300
                  ? `${this.state.error.message.slice(0, 300)}...`
                  : this.state.error.message}
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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                <Home className="w-4 h-4" />
                Home
              </button>
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3">
              <button
                type="button"
                onClick={this.handleCopyDiagnostic}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
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

              <p className="text-xs text-zinc-400 dark:text-zinc-500">
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
