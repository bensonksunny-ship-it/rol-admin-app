import { Component } from 'react'

/**
 * Global error boundary to prevent a blank white screen.
 * Shows the actual error message on-page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    // Keep console logging for debugging.
    console.error('App crashed:', error)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 18, marginBottom: 12, color: '#b91c1c' }}>Application Error</h1>
          <p style={{ marginBottom: 8, color: '#7f1d1d' }}>
            {error?.message || String(error)}
          </p>
          <details style={{ whiteSpace: 'pre-wrap', maxWidth: 920 }}>
            <summary style={{ cursor: 'pointer', color: '#334155' }}>Details</summary>
            <pre style={{ marginTop: 10, overflow: 'auto' }}>{error?.stack || ''}</pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

