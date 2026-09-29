import { AnimatePresence, motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WhatsNewModalProps {
    isOpen: boolean;
    onClose: () => void;
    version: string;
    releaseNotes: string | null;
}

export function WhatsNewModal({ isOpen, onClose, version, releaseNotes }: WhatsNewModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/60"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card whats-new-modal w-full max-w-4xl mx-4 overflow-hidden rounded-[4px]"
                    style={{ background: 'var(--bg-card)', border: 'var(--panel-border-w, 1px) solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
                >
                    <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-[4px] bg-blue-500/20 border axi-edge-meta">
                                <Sparkles className="w-5 h-5 axi-ink-meta" />
                            </div>
                            <div>
                                <div className="text-lg font-bold axi-ink-plain">What’s New</div>
                                <div className="text-xs axi-ink-dim">Version {version}</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-[4px] hover:bg-white/10 axi-ink-dim hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="whats-new-modal__body p-6">
                        <div className="whats-new-modal__scroll max-h-[65vh] overflow-y-auto pr-2">
                            <div className="space-y-4 text-sm axi-ink-plain">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        h1: ({ children }) => <h1 className="text-2xl font-bold axi-ink-plain">{children}</h1>,
                                        h2: ({ children }) => <h2 className="text-xl font-semibold axi-ink-plain">{children}</h2>,
                                        h3: ({ children }) => <h3 className="text-lg font-semibold axi-ink-plain">{children}</h3>,
                                        p: ({ children }) => <p className="leading-6 axi-ink-plain">{children}</p>,
                                        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 axi-ink-plain">{children}</ul>,
                                        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 axi-ink-plain">{children}</ol>,
                                        li: ({ children }) => <li className="leading-6">{children}</li>,
                                        blockquote: ({ children }) => (
                                            <blockquote className="border-l-2 axi-edge-meta pl-4 axi-ink-dim italic">
                                                {children}
                                            </blockquote>
                                        ),
                                        a: ({ href, children }) => (
                                            <button
                                                className="axi-ink-meta hover:text-blue-200 underline underline-offset-2"
                                                onClick={() => href && window.electronAPI.openExternal(href)}
                                            >
                                                {children}
                                            </button>
                                        ),
                                        table: ({ children }) => (
                                            <div className="overflow-x-auto rounded-[4px]" style={{ border: 'var(--panel-border-w, 1px) solid var(--border-default)', background: 'var(--bg-card-inner)' }}>
                                                <table className="stats-table w-full border-collapse text-left text-sm">
                                                    {children}
                                                </table>
                                            </div>
                                        ),
                                        th: ({ children }) => (
                                            <th className="border-b axi-edge-rule bg-white/5 px-3 py-2 text-xs uppercase tracking-wide axi-ink-dim">
                                                {children}
                                            </th>
                                        ),
                                        td: ({ children }) => (
                                            <td className="border-b axi-edge-rule px-3 py-2 axi-ink-plain">
                                                {children}
                                            </td>
                                        ),
                                        pre: ({ children }) => (
                                            <pre className="overflow-x-auto rounded-[4px] p-4 text-xs axi-ink-meta" style={{ background: 'var(--bg-card-inner)' }}>
                                                {children}
                                            </pre>
                                        ),
                                        code: (props: any) => {
                                            const { inline, className, children } = props;
                                            const isInline = inline ?? !className;
                                            return isInline ? (
                                                <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] axi-ink-meta">
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className="whitespace-pre-wrap axi-ink-meta">
                                                    {children}
                                                </code>
                                            );
                                        }
                                    }}
                                >
                                    {releaseNotes || 'Release notes unavailable.'}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end px-6 py-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-[4px] bg-blue-500/20 axi-ink-meta border axi-edge-meta hover:bg-blue-500/30 transition-colors text-sm font-medium"
                        >
                            Continue
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
