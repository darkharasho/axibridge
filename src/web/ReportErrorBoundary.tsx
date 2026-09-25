import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

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
 *
 * Drawn entirely through `reportShell.css`, so it follows whichever design
 * language the report turned on rather than the slate-blue literals it used to
 * hardcode. See the note at the top of that file.
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

        const message = error.message || String(error);

        return (
            <div className="report-shell">
                <div className="report-shell-card">
                    <div className="report-shell-cap report-shell-cap--error" />
                    <div className="report-shell-body">
                        <p className="report-shell-eyebrow report-shell-eyebrow--error">Render failed</p>
                        <h1 className="report-shell-title">This report failed to render</h1>
                        <p className="report-shell-text">
                            Something in the report data could not be displayed. If this report was published
                            by a newer version of AxiBridge, re-publishing it will also refresh the viewer and
                            may fix this.
                        </p>
                        <div className="report-shell-well">
                            <p className="report-shell-message">{message}</p>
                            {error.stack && <pre className="report-shell-stack">{error.stack}</pre>}
                        </div>
                        <div className="report-shell-actions">
                            <button
                                type="button"
                                className="report-shell-btn"
                                onClick={() => window.location.reload()}
                            >
                                Reload
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
