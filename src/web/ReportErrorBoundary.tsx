import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

const wrapperStyle: CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#0b1120',
    color: '#e2e8f0',
    fontFamily: 'system-ui, -apple-system, sans-serif'
};

const cardStyle: CSSProperties = {
    maxWidth: 640,
    padding: 32,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(15,23,42,0.92)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
};

/**
 * Catches render-time throws in the published report and the share-link
 * viewer.
 *
 * Neither web entry point runs inside Electron, so unlike
 * `renderer/AppErrorBoundary` there is no `electronAPI` to report through and
 * no devtools the reader is likely to open — without this, a throw anywhere in
 * `ReportApp` unmounts the tree and leaves a literally blank white page with no
 * indication that anything went wrong. The error text is shown inline because
 * it is the only diagnostic a reader can copy back to the publisher.
 *
 * The "published by a newer version" hint is not a guess: a report site keeps
 * the viewer bundle from its last publish, so a `report.json` written by a
 * newer app against an older bundle is a real and recurring way to get here.
 */
export class ReportErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ReportErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div style={wrapperStyle}>
                <div style={cardStyle}>
                    <h1 style={{ fontSize: 20, marginTop: 0, marginBottom: 12, fontWeight: 600, color: '#f87171' }}>
                        This report failed to render
                    </h1>
                    <p style={{ color: '#94a3b8', lineHeight: 1.5, marginTop: 0 }}>
                        Something in the report data could not be displayed. If this report was published
                        by a newer version of AxiBridge, re-publishing it will also refresh the viewer and
                        may fix this.
                    </p>
                    <p
                        style={{
                            fontSize: 13,
                            fontFamily: 'monospace',
                            color: '#e2e8f0',
                            wordBreak: 'break-word'
                        }}
                    >
                        {error.message || String(error)}
                    </p>
                    {error.stack && (
                        <pre
                            style={{
                                fontSize: 11,
                                color: 'rgba(226,232,240,0.45)',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 200,
                                overflow: 'auto',
                                margin: '0 0 16px'
                            }}
                        >
                            {error.stack}
                        </pre>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            fontSize: 13,
                            padding: '6px 16px',
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'transparent',
                            color: '#e2e8f0',
                            cursor: 'pointer'
                        }}
                    >
                        Reload
                    </button>
                </div>
            </div>
        );
    }
}
