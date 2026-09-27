import { Component, type ErrorInfo, type ReactNode } from 'react';
import { forgetSession } from './storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Last line of defence. If any screen throws during render, the player gets a
 * plain, honest recovery surface instead of a blank page — with a reload and a
 * "start over" that clears the stored session id.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info: info.componentStack ?? null });
    // Keep the trace visible in the console for whoever is on call.
    console.error('[veilwake] render failure', error, info);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private startOver = (): void => {
    forgetSession();
    window.location.reload();
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="shell">
        <main className="shell__inner centerstage" id="main">
          <section className="stagecard" role="alert" aria-labelledby="crash-title">
            <p className="stagecard__kicker">Instrument fault</p>
            <h1 className="stagecard__title" id="crash-title">
              The lockwork stopped turning.
            </h1>
            <p className="stagecard__body">
              Something failed while drawing this screen. Your stored run is untouched; reloading usually restores it.
              If it keeps failing, start over to clear the stored session.
            </p>

            <div className="errdetail">
              <div className="errdetail__row">
                <span className="errdetail__k">message</span>
                <span className="wrap-anywhere">{error.message || 'no message'}</span>
              </div>
              {info ? (
                <div className="errdetail__row">
                  <span className="errdetail__k">stack</span>
                  <span className="wrap-anywhere">{info.trim().split('\n').slice(0, 4).join(' / ')}</span>
                </div>
              ) : null}
            </div>

            <div className="stagecard__actions">
              <button type="button" className="btn btn--primary" onClick={this.reload}>
                Reload the page
              </button>
              <button type="button" className="btn btn--ghost" onClick={this.startOver}>
                Start over without the stored run
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
