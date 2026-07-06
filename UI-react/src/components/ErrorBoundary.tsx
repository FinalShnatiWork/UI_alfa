import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React ErrorBoundary component that catches runtime rendering errors in its children tree.
 * Prevents application crashes and renders an elegant fallback UI detailing the exception.
 */
export class ErrorBoundary extends Component<Props, State> {
  /**
   * Initializes the ErrorBoundary component state.
   *
   * @param props component properties containing children
   */
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /**
   * Derives error state updates dynamically when a child throws an exception.
   *
   * @param error caught runtime Error object
   * @returns updated state object
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Lifecycle hook to log caught exception details.
   *
   * @param error caught error
   * @param info error metadata (component stack trace info)
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  /**
   * Renders fallback UI if an error is caught, otherwise renders child elements.
   *
   * @returns fallback view or children elements
   */
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: 20,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 480, margin: 0 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn btn-outline-dark"
              onClick={() => { window.location.href = '/dashboard'; }}
            >
              Go to Dashboard
            </button>
          </div>
          <details style={{ marginTop: 16, maxWidth: 600, textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Technical details
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: 'var(--bg-alt)',
                borderRadius: 8,
                fontSize: '0.75rem',
                overflowX: 'auto',
                color: 'var(--text-secondary)',
              }}
            >
              {this.state.error?.stack ?? 'No stack trace available.'}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
