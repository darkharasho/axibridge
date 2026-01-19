import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';

interface UpdateErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    error: string | null;
}

export function UpdateErrorModal({ isOpen, onClose, error }: UpdateErrorModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-red-950/90 to-black border border-red-500/20 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-red-500/10 bg-red-900/10">
                        <h2 className="text-lg font-bold text-red-100 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            Update Error
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-red-300 hover:text-red-100 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <p className="text-gray-300 mb-6">
                            An error occurred while checking for updates or downloading the update.
                        </p>
                        <div className="bg-black/40 border border-red-500/20 rounded-xl p-4 font-mono text-sm text-red-200 overflow-x-auto">
                            {error || 'Unknown error'}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end px-6 py-4 border-t border-white/5 bg-black/20">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
