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
                className="app-modal-overlay axi-scrim flex items-center justify-center"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card axi-modal mx-4 overflow-hidden"
                    style={{ '--axi-modal-width': '512px' } as React.CSSProperties}
                >
                    {/* Header */}
                    <div className="axi-modal__head justify-between">
                        <h2 className="text-lg font-bold axi-ink-plain flex items-center gap-2">
                            <Link className="w-5 h-5 axi-ink-meta" />
                            Manage Webhooks
                        </h2>
                        <button
                            onClick={onClose}
                            className="axi-btn axi-btn--icon axi-ink-dim"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="axi-modal__body max-h-[60vh] overflow-y-auto">
                        <DestinationsCard
                            webhooks={webhooks}
                            enabledWebhookIds={enabledWebhookIds}
                            onSave={onSave}
                            onSetEnabled={onSetEnabled}
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: 'var(--axi-border-control) solid var(--axi-ink-line)' }}>
                        <button
                            onClick={onClose}
                            className="axi-action px-4 py-2 text-sm font-medium axi-ink-dim"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
