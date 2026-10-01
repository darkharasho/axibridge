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
                className="app-modal-overlay axi-scrim flex items-center justify-center"
                style={{ zIndex: 70 }}
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card whats-new-modal axi-modal mx-4 overflow-hidden"
                    style={{ '--axi-modal-width': '896px' } as React.CSSProperties}
                >
                    <div className="axi-modal__head justify-between">
                        <div className="flex items-center gap-3">
                            <div className="axi-well axi-well--sm axi-edge-meta [--axi-well-pad:8px]">
                                <Sparkles className="w-5 h-5 axi-ink-meta" />
                            </div>
                            <div>
                                <div className="text-lg font-bold axi-ink-plain">What’s New</div>
                                <div className="text-xs axi-ink-dim">Version {version}</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-btn--icon axi-ink-dim"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="whats-new-modal__body axi-modal__body">
                        <div className="whats-new-modal__scroll max-h-[65vh] overflow-y-auto pr-2">
                            {/* `.axi-prose` owns every element this map used to spell out:
                                h1-h3, p, ul, ol, li, blockquote, table, th, td, pre and the
                                inline code span. What is left are the two things it cannot
                                know. `a` must be a <button> calling openExternal, because an
                                <a href> inside Electron navigates the renderer rather than
                                opening a browser. `table` keeps a wrapper with nothing on it
                                but a scroll: prose styles the table itself, but a release note
                                can carry a table wider than this modal and prose has no
                                opinion about overflow on one. */}
                            <div className="axi-prose">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: ({ href, children }) => (
                                            <button
                                                className="axi-link"
                                                onClick={() => href && window.electronAPI.openExternal(href)}
                                            >
                                                {children}
                                            </button>
                                        ),
                                        table: ({ children }) => (
                                            <div className="overflow-x-auto">
                                                <table>{children}</table>
                                            </div>
                                        ),
                                    }}
                                >
                                    {releaseNotes || 'Release notes unavailable.'}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end px-6 py-4" style={{ borderTop: 'var(--axi-border-control) solid var(--axi-ink-line)' }}>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-ink-meta axi-edge-meta"
                        >
                            Continue
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
