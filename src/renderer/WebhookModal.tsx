import { motion, AnimatePresence } from 'framer-motion';
import { X, Link } from 'lucide-react';
import { DestinationsCard } from './settings/DestinationsCard';

export interface Webhook {
    id: string;
    name: string;
    /** Webhook destinations only. */
    url?: string;
    /** Absent means 'webhook', so plain webhook entries need no migration. */
    kind?: 'webhook' | 'bridge';
    /** Bridge destinations: decoded from the axb1 key at link time. */
    relayUrl?: string;
    token?: string;
    guildName?: string;
    channelName?: string;
    /**
     * N3: stable identity for re-link matching. Not secrets -- fine to
     * persist and display. Absent on entries persisted before this field
     * existed; see the fallback in `handleLinkSubmit`.
     */
    guildId?: string;
    channelId?: string;
}

interface WebhookModalProps {
    isOpen: boolean;
    onClose: () => void;
    webhooks: Webhook[];
    enabledWebhookIds: string[];
    /**
     * `selectId`, when present, asks the caller to also select that entry in
     * the same save — used by the link flow so a freshly linked channel
     * activates immediately rather than waiting on a separate selection
     * change (fix round 1, item 3).
     */
    onSave: (webhooks: Webhook[], selectId?: string) => void;
    /** Switches one destination on or off. */
    onSetEnabled: (id: string, enabled: boolean) => void;
}

export function WebhookModal({ isOpen, onClose, webhooks, enabledWebhookIds, onSave, onSetEnabled }: WebhookModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card rounded-[4px] w-full max-w-lg mx-4 overflow-hidden"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Link className="w-5 h-5 text-purple-400" />
                            Manage Webhooks
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-[4px] hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        <DestinationsCard
                            webhooks={webhooks}
                            enabledWebhookIds={enabledWebhookIds}
                            onSave={onSave}
                            onSetEnabled={onSetEnabled}
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
