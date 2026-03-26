import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[AppErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    gap: '16px',
                    padding: '32px',
                    background: '#0a0a0a',
                    color: '#e0e0e0',
                    fontFamily: 'system-ui, sans-serif',
                    textAlign: 'center',
                }}>
                    <h1 style={{ fontSize: '18px', color: '#f87171', margin: 0 }}>
                        AxiBridge failed to start
                    </h1>
                    <p style={{
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        maxWidth: '600px',
                    }}>
                        {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                        <pre style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.3)',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxWidth: '600px',
                            maxHeight: '200px',
                            overflow: 'auto',
                            textAlign: 'left',
                        }}>
                            {this.state.error.stack}
                        </pre>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            fontSize: '13px',
                            padding: '6px 16px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'transparent',
                            color: '#e0e0e0',
                            cursor: 'pointer',
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
