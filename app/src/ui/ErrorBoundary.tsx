import { Component, type ReactNode } from 'react'

type Props = { onSkip: () => void; children: ReactNode }

/** Fängt Renderfehler einer einzelnen Karte ab, damit der Rest der App bedienbar bleibt. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section role="alert" className="feedback wrong">
        <p>Diese Karte kann nicht angezeigt werden.</p>
        <button type="button" className="primary" onClick={this.props.onSkip}>
          Karte überspringen
        </button>
      </section>
    )
  }
}
