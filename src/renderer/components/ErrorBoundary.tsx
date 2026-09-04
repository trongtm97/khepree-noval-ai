import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  componentStack: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '', componentStack: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack ?? '';
    console.error('Renderer error boundary caught:', error, stack);
    this.setState({ componentStack: stack });
    try {
      (window as unknown as { __v51LastRenderError?: unknown }).__v51LastRenderError = {
        message: error.message,
        stack: error.stack,
        componentStack: stack,
      };
      void (window as unknown as { khepreeNovelAI?: { ping?: () => Promise<unknown> } })
        .khepreeNovelAI?.ping?.();
    } catch {
      // ignore
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, message: '', componentStack: '' });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" data-testid="error-boundary">
          <h2>{t('app.errorTitle')}</h2>
          <p>{this.state.message || t('app.errorUnexpected')}</p>
          {this.state.componentStack ? (
            <pre className="error-boundary__stack" style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
              {this.state.componentStack}
            </pre>
          ) : null}
          <div className="btn-row">
            <button type="button" onClick={this.handleRetry}>
              {t('app.tryAgain')}
            </button>
            <button type="button" onClick={this.handleReload}>
              {t('app.reloadApp')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
