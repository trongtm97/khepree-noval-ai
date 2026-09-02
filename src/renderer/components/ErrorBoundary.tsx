import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error boundary caught:', error, info.componentStack);
    try {
      // Best-effort: main may log via future IPC; keep renderer safe if preload missing
      void (window as unknown as { khepreeNovelAI?: { ping?: () => Promise<unknown> } })
        .khepreeNovelAI?.ping?.();
    } catch {
      // ignore
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>{t('app.errorTitle')}</h2>
          <p>{this.state.message || t('app.errorUnexpected')}</p>
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
