/**
 * Error Boundary Component
 * Catches React component errors and displays fallback UI
 */

import React from 'react'
import { getErrorLogger } from './error-logger'
import { showError } from './toast-service'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: false,
    }

    this.errorLogger = getErrorLogger()
    this.resetTimeout = null
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log error
    this.setState({ errorInfo })

    // Log to error logger
    this.errorLogger.logError(error, {
      component: 'ErrorBoundary',
      errorInfo: errorInfo.componentStack,
      action: 'Caught React Error',
    })

    // Show toast notification
    showError('Something went wrong. Please refresh the page or try again.', {
      duration: 0,
      dismissible: true,
    })

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: false,
    })

    // Clear the reset timeout if it exists
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  componentWillUnmount() {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container" style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <div style={styles.icon}>⚠️</div>
            </div>

            <h1 style={styles.title}>Oops! Something went wrong</h1>

            <p style={styles.message}>
              We encountered an unexpected error. Please try one of the options below to get back on track.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div style={styles.errorDetails}>
                <details>
                  <summary style={styles.summary}>Error Details (Development Only)</summary>
                  <pre style={styles.errorStack}>{this.state.error.toString()}</pre>
                  {this.state.errorInfo && (
                    <pre style={styles.errorStack}>{this.state.errorInfo.componentStack}</pre>
                  )}
                </details>
              </div>
            )}

            <div style={styles.buttonGroup}>
              <button onClick={this.handleReset} style={{ ...styles.button, ...styles.primaryButton }}>
                Try Again
              </button>

              <button onClick={this.handleReload} style={{ ...styles.button, ...styles.secondaryButton }}>
                Reload Page
              </button>
            </div>

            <div style={styles.helpText}>
              <p>If the problem persists, please contact support with error ID: {this.state.error?.message}</p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '40px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
  },
  iconContainer: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  icon: {
    fontSize: '48px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 12px 0',
    textAlign: 'center',
  },
  message: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
    margin: '0 0 20px 0',
    textAlign: 'center',
  },
  errorDetails: {
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '4px',
    border: '1px solid #e0e0e0',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#666',
    fontSize: '12px',
  },
  errorStack: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    fontSize: '11px',
    overflow: 'auto',
    maxHeight: '200px',
    color: '#333',
    fontFamily: 'monospace',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  },
  button: {
    flex: 1,
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  primaryButton: {
    backgroundColor: '#007bff',
    color: 'white',
  },
  primaryButtonHover: {
    backgroundColor: '#0056b3',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    color: '#333',
    border: '1px solid #d0d0d0',
  },
  secondaryButtonHover: {
    backgroundColor: '#e0e0e0',
  },
  helpText: {
    fontSize: '12px',
    color: '#999',
    textAlign: 'center',
    borderTop: '1px solid #e0e0e0',
    paddingTop: '15px',
  },
}

export default ErrorBoundary
