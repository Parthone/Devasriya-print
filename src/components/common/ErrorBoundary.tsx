import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { APP_CONFIG } from '@/config/app.config';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence against a blank screen. Feature-level boundaries can be
 * nested inside this one so a single broken panel does not take down the shell.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replaced by a real error-reporting sink (e.g. Google Cloud Error
    // Reporting) when observability is set up.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {APP_CONFIG.name} hit an unexpected error. Try again, and if it keeps happening contact
            support.
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
          <div className="flex justify-center gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.assign('/');
              }}
            >
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
