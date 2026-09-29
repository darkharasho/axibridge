import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

export class StatsErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[StatsErrorBoundary] Uncaught error in stats view:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-8">
                    <p className="text-sm axi-ink-danger font-semibold">Stats dashboard encountered an error.</p>
                    <p className="text-xs axi-ink-faint font-mono break-all">{this.state.error.message}</p>
                    <button
                        className="axi-btn axi-btn--sm axi-edge-rule"
                        onClick={() => this.setState({ error: null })}
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
