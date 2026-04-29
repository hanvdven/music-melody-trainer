import React from 'react';
import './ErrorBoundary.css';

/**
 * ErrorFallback component
 * Displays a user-friendly error message when an error boundary catches an error
 */
const ErrorFallback = ({ error, resetError }) => {
    return (
        <div className="error-boundary-container">
            <h2 className="error-boundary-title">⚠️ Something went wrong</h2>
            <p className="error-boundary-message">
                The application encountered an error. This has been logged for investigation.
            </p>
            {error && (
                <details className="error-boundary-details">
                    <summary className="error-boundary-summary">Error details</summary>
                    <pre className="error-boundary-stack">
                        {error.toString()}
                        {error.stack && `\n\n${error.stack}`}
                    </pre>
                </details>
            )}
            {resetError && (
                <button className="error-boundary-reset-btn" onClick={resetError}>
                    Try Again
                </button>
            )}
        </div>
    );
};

/**
 * ErrorBoundary component
 * Catches JavaScript errors anywhere in the child component tree
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by ErrorBoundary:', error, errorInfo);
        this.setState({ error, errorInfo });
        // TODO: Log to error tracking service (e.g., Sentry)
        // logErrorToService(error, errorInfo);
    }

    resetError = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <ErrorFallback
                    error={this.state.error}
                    errorInfo={this.state.errorInfo}
                    resetError={this.resetError}
                />
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
export { ErrorFallback };
