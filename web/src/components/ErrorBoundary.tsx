import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Bez tejto poistky skončí každá výnimka v React strome bielou obrazovkou. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crash", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="card crash-screen__card">
          <div className="card__title">Aplikácia narazila na chybu</div>
          <div className="card__sub">Skús obnoviť stránku. Ak sa to opakuje, pošli tento text:</div>
          <pre className="crash-screen__detail">{error.message}</pre>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Obnoviť
          </button>
        </div>
      </div>
    );
  }
}
