import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';

interface UpdateErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRetry: () => void;
    error: string | null;
}

export function UpdateErrorModal({ isOpen, onClose, onRetry, error }: UpdateErrorModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card rounded-[4px] w-full max-w-md mx-4 overflow-hidden"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <h2 className="text-lg font-bold text-red-100 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            Update Error
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-[4px] hover:bg-white/10 text-red-300 hover:text-red-100 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <p className="text-gray-300 mb-6">
                            An error occurred while checking for updates or downloading the update.
                        </p>
                        <div className="rounded-[4px] p-4 font-mono text-sm text-red-200 overflow-x-auto" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}>
                            {error || 'Unknown error'}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                            onClick={onRetry}
                            className="px-4 py-2 bg-red-500/15 text-red-100 rounded-[4px] text-sm font-medium border border-red-400/25 hover:bg-red-500/25 transition-colors"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-white/10 text-white rounded-[4px] text-sm font-medium hover:bg-white/20 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
