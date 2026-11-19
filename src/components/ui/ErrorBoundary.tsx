import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          friendly = `Database ${parsed.operationType || 'operation'} error on ${
            parsed.path || 'record'
          }: ${parsed.error}`;
        }
      } catch {
        // non-JSON error message
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100">
          <div className="max-w-lg w-full rounded-xl border border-red-500/30 bg-white dark:bg-[#131317] p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-sm">
              <span>Application Error</span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors active:scale-[0.98]"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
