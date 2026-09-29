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
                className="app-modal-overlay axi-scrim flex items-center justify-center"
                style={{ zIndex: 60 }}
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card axi-modal mx-4 overflow-hidden"
                    style={{ '--axi-modal-width': '448px' } as React.CSSProperties}
                >
                    {/* Header */}
                    <div className="axi-modal__head justify-between">
                        <h2 className="text-lg font-bold axi-ink-danger flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 axi-ink-danger" />
                            Update Error
                        </h2>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-btn--icon axi-ink-danger"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="axi-modal__body">
                        <p className="axi-ink-dim mb-6">
                            An error occurred while checking for updates or downloading the update.
                        </p>
                        <div className="axi-well axi-well--sm font-mono text-sm axi-ink-danger overflow-x-auto" style={{ '--axi-well-pad': '16px' } as React.CSSProperties}>
                            {error || 'Unknown error'}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="axi-modal__foot">
                        <button
                            onClick={onRetry}
                            className="axi-btn axi-ink-danger axi-edge-danger"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-ink-plain"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
