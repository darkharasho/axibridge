import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal as TerminalIcon, Trash2, ChevronDown } from 'lucide-react';

interface LogEntry {
    type: 'info' | 'error';
    message: string;
    timestamp: string;
}

interface TerminalProps {
    isOpen: boolean;
    onClose: () => void;
}

/* ── Syntax highlighting ──────────────────────────────────────────────── */

/** Matches tokens in log messages and wraps them in colored spans. */
const TOKEN_RULES: { pattern: RegExp; className: string }[] = [
    // Bracketed tags like [UPLOAD], [WATCHER], [IPC], [CACHE] etc.
    { pattern: /\[([A-Z][A-Z0-9_-]+)\]/g, className: 'term-tag' },
    // Quoted strings (single or double)
    { pattern: /"[^"]*"|'[^']*'/g, className: 'term-string' },
    // URLs
    { pattern: /https?:\/\/[^\s,)]+/g, className: 'term-url' },
    // File paths (unix-style with extension, or windows-style)
    { pattern: /(?:\/[\w.-]+){2,}(?:\.\w+)?|[A-Z]:\\[\w\\.-]+/g, className: 'term-path' },
    // Numbers (integers, decimals, percentages, durations like 1.5s or 200ms)
    { pattern: /\b\d+(?:\.\d+)?(?:%|ms|s|m|MB|KB|GB)?\b/g, className: 'term-number' },
    // Key=value or key: value tokens (the key part only)
    { pattern: /\b[\w-]+(?==)/g, className: 'term-key' },
];

interface Segment { text: string; className?: string; start: number; end: number }

function highlightMessage(message: string): ReactNode[] {
    // Collect all matches across all rules
    const segments: Segment[] = [];
    for (const rule of TOKEN_RULES) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = rule.pattern.exec(message)) !== null) {
            segments.push({ text: match[0], className: rule.className, start: match.index, end: match.index + match[0].length });
        }
    }
    // Sort by start position, dedupe overlapping (first match wins)
    segments.sort((a, b) => a.start - b.start);
    const merged: Segment[] = [];
    let cursor = 0;
    for (const seg of segments) {
        if (seg.start < cursor) continue; // overlap — skip
        merged.push(seg);
        cursor = seg.end;
    }
    // Build output nodes
    const nodes: ReactNode[] = [];
    let pos = 0;
    for (let i = 0; i < merged.length; i++) {
        const seg = merged[i];
        if (seg.start > pos) nodes.push(message.slice(pos, seg.start));
        nodes.push(<span key={i} className={seg.className}>{seg.text}</span>);
        pos = seg.end;
    }
    if (pos < message.length) nodes.push(message.slice(pos));
    return nodes;
}

/* ── Component ────────────────────────────────────────────────────────── */

export function Terminal({ isOpen, onClose }: TerminalProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);

    const scrollToBottom = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
    };

    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            scrollToBottom();
        }
    }, [logs, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            window.electronAPI.setConsoleLogForwarding?.(false);
            return;
        }
        const cleanupHistory = window.electronAPI.onConsoleLogHistory?.((history: LogEntry[]) => {
            if (!Array.isArray(history)) return;
            setLogs(history.slice(-500));
        });
        const cleanup = window.electronAPI.onConsoleLog((log: LogEntry) => {
            setLogs(prev => {
                const next = [...prev, log];
                if (next.length > 500) {
                    return next.slice(next.length - 500);
                }
                return next;
            });
        });
        window.electronAPI.setConsoleLogForwarding?.(true);

        return () => {
            cleanup();
            cleanupHistory?.();
            window.electronAPI.setConsoleLogForwarding?.(false);
        };
    }, [isOpen]);

    const clearLogs = () => {
        setLogs([]);
    };

    // Memoize highlighted log output so we only re-highlight when logs change
    const renderedLogs = useMemo(() => logs.map((log, index) => (
        <div
            key={`${log.timestamp}-${index}`}
            className={`term-row flex gap-3 text-xs group rounded-[2px] px-2 py-0.5 -mx-1 ${log.type === 'error' ? 'term-row-error' : ''}`}
        >
            <span className="term-timestamp shrink-0 select-none w-[4.5rem] whitespace-nowrap tabular-nums">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <div className={`flex-1 break-all whitespace-pre-wrap ${log.type === 'error' ? 'term-error' : 'term-info'}`}>
                {log.type === 'error' && <span className="term-error-badge">[ERROR]</span>}
                {highlightMessage(log.message)}
            </div>
        </div>
    )), [logs]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="terminal-window"
                >
                    {/* Header */}
                    <div className="terminal-header">
                        <div className="flex items-center gap-2">
                            <TerminalIcon className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary)' }} />
                            <span className="terminal-title">Terminal</span>
                            <span className="terminal-divider" />
                            <span className="terminal-meta">{logs.length} events</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={clearLogs}
                                className="terminal-btn"
                                title="Clear Terminal"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <span className="terminal-divider" />
                            <button
                                onClick={onClose}
                                className="terminal-btn"
                                title="Close Terminal"
                            >
                                <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div
                        ref={scrollContainerRef}
                        className="terminal-content"
                        onWheel={(event) => event.stopPropagation()}
                        onScroll={(event) => {
                            event.stopPropagation();
                            const container = event.currentTarget;
                            const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20;
                            shouldAutoScrollRef.current = atBottom;
                        }}
                    >
                        {logs.length === 0 ? (
                            <div className="terminal-empty">
                                <TerminalIcon className="w-10 h-10 mb-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                                <span>No logs recorded</span>
                            </div>
                        ) : renderedLogs}
                        <div ref={messagesEndRef} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
