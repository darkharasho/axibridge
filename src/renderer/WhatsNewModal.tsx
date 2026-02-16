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
                className="app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card whats-new-modal w-full max-w-4xl mx-4 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-500/30">
                                <Sparkles className="w-5 h-5 text-blue-300" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-white">What’s New</div>
                                <div className="text-xs text-gray-400">Version {version}</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="whats-new-modal__body p-6">
                        <div className="whats-new-modal__scroll max-h-[65vh] overflow-y-auto pr-2">
                            <div className="space-y-4 text-sm text-gray-200">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        h1: ({ children }) => <h1 className="text-2xl font-bold text-white">{children}</h1>,
                                        h2: ({ children }) => <h2 className="text-xl font-semibold text-white">{children}</h2>,
                                        h3: ({ children }) => <h3 className="text-lg font-semibold text-white">{children}</h3>,
                                        p: ({ children }) => <p className="leading-6 text-gray-200">{children}</p>,
                                        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-gray-200">{children}</ul>,
                                        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-gray-200">{children}</ol>,
                                        li: ({ children }) => <li className="leading-6">{children}</li>,
                                        blockquote: ({ children }) => (
                                            <blockquote className="border-l-2 border-blue-400/40 pl-4 text-gray-300 italic">
                                                {children}
                                            </blockquote>
                                        ),
                                        a: ({ href, children }) => (
                                            <button
                                                className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                                                onClick={() => href && window.electronAPI.openExternal(href)}
                                            >
                                                {children}
                                            </button>
                                        ),
                                        table: ({ children }) => (
                                            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
                                                <table className="w-full border-collapse text-left text-sm">
                                                    {children}
                                                </table>
                                            </div>
                                        ),
                                        th: ({ children }) => (
                                            <th className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-gray-300">
                                                {children}
                                            </th>
                                        ),
                                        td: ({ children }) => (
                                            <td className="border-b border-white/10 px-3 py-2 text-gray-200">
                                                {children}
                                            </td>
                                        ),
                                        pre: ({ children }) => (
                                            <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-blue-100">
                                                {children}
                                            </pre>
                                        ),
                                        code: (props: any) => {
                                            const { inline, className, children } = props;
                                            const isInline = inline ?? !className;
                                            return isInline ? (
                                                <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-blue-200">
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className="whitespace-pre-wrap text-blue-100">
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
                    <div className="flex justify-end px-6 py-4 border-t border-white/10 bg-white/5">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-200 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm font-medium"
                        >
                            Continue
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
