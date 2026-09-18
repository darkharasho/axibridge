import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Edit2, Check, Link, Zap } from 'lucide-react';

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
}

interface WebhookModalProps {
    isOpen: boolean;
    onClose: () => void;
    webhooks: Webhook[];
    /**
     * `selectId`, when present, asks the caller to also select that entry in
     * the same save — used by the link flow so a freshly linked channel
     * activates immediately rather than waiting on a separate selection
     * change (fix round 1, item 3).
     */
    onSave: (webhooks: Webhook[], selectId?: string) => void;
}

export function WebhookModal({ isOpen, onClose, webhooks, onSave }: WebhookModalProps) {
    const [localWebhooks, setLocalWebhooks] = useState<Webhook[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');

    const [isLinking, setIsLinking] = useState(false);
    const [bridgeKey, setBridgeKey] = useState('');
    const [bridgeLinking, setBridgeLinking] = useState(false);
    const [bridgeLinkError, setBridgeLinkError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLocalWebhooks([...webhooks]);
            setIsAdding(false);
            setEditingId(null);
            setIsLinking(false);
            setBridgeKey('');
            setBridgeLinkError(null);
        }
    }, [isOpen, webhooks]);

    const handleAdd = () => {
        if (!newName.trim() || !newUrl.trim()) return;

        const newWebhook: Webhook = {
            id: Date.now().toString(),
            name: newName.trim(),
            kind: 'webhook',
            url: newUrl.trim()
        };

        setLocalWebhooks([...localWebhooks, newWebhook]);
        setNewName('');
        setNewUrl('');
        setIsAdding(false);
    };

    const handleEdit = (webhook: Webhook) => {
        setEditingId(webhook.id);
        setEditName(webhook.name);
        setEditUrl(webhook.url ?? '');
    };

    const handleSaveEdit = () => {
        if (!editingId || !editName.trim() || !editUrl.trim()) return;

        setLocalWebhooks(localWebhooks.map(w =>
            w.id === editingId
                ? { ...w, name: editName.trim(), url: editUrl.trim() }
                : w
        ));
        setEditingId(null);
    };

    const handleDelete = (id: string) => {
        setLocalWebhooks(localWebhooks.filter(w => w.id !== id));
    };

    /**
     * Fix round 1, item 8: `handleDelete` only mutated local state, so
     * Unlink needed a separate "Save Changes" click while Link committed
     * instantly — closing the modal with the X after clicking Unlink left
     * the bridge entry stored and still sending. Commit the same way Link
     * does: mutate and save in one step.
     */
    const handleUnlink = (id: string) => {
        const next = localWebhooks.filter(w => w.id !== id);
        setLocalWebhooks(next);
        onSave(next);
    };

    const handleSaveAll = () => {
        onSave(localWebhooks);
        onClose();
    };

    const handleLinkSubmit = async () => {
        const key = bridgeKey.trim();
        if (!key || !window.electronAPI?.linkBridgeChannel) return;
        setBridgeLinking(true);
        setBridgeLinkError(null);
        try {
            const result = await window.electronAPI.linkBridgeChannel(key);
            if (!result.ok) {
                setBridgeLinkError(result.error);
                return;
            }
            const linked: Webhook = {
                id: crypto.randomUUID(),
                name: `${result.guildName} › #${result.channelName}`,
                kind: 'bridge',
                relayUrl: result.relayUrl,
                token: key,
                guildName: result.guildName,
                channelName: result.channelName
            };
            const next = [...localWebhooks, linked];
            setLocalWebhooks(next);
            // Linking is immediate rather than staged: it must reach the
            // store (and re-derive the active destination) right away, not
            // wait for a separate "Save Changes" click on unrelated edits.
            // Fix round 1, item 3: also select it in the same save, or
            // `applyDiscordDestination()` re-derives against whatever was
            // already selected and the newly linked channel never activates.
            onSave(next, linked.id);
            setIsLinking(false);
            setBridgeKey('');
        } catch (error: any) {
            // Fix round 1, item 10: a rejected `bridge:link` invoke (e.g. the
            // main process itself threw) was previously an unhandled
            // rejection with no visible error — a swallowed failure in the
            // one task about not swallowing failures.
            setBridgeLinkError(String(error?.message || error));
        } finally {
            setBridgeLinking(false);
        }
    };

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
                        {/* Existing Webhooks */}
                        <div className="space-y-3 mb-4">
                            {localWebhooks.length === 0 && !isAdding && !isLinking && (
                                <div className="text-center text-gray-500 py-8">
                                    <Link className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>No webhooks configured</p>
                                    <p className="text-sm">Add a webhook to get started</p>
                                </div>
                            )}

                            {localWebhooks.map(webhook => {
                                const isBridge = webhook.kind === 'bridge';
                                return (
                                    <div
                                        key={webhook.id}
                                        className="rounded-[4px] p-4 group transition-colors"
                                        style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}
                                    >
                                        {editingId === webhook.id ? (
                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    placeholder="Webhook name"
                                                    className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
                                                />
                                                <input
                                                    type="text"
                                                    value={editUrl}
                                                    onChange={(e) => setEditUrl(e.target.value)}
                                                    placeholder="https://discord.com/api/webhooks/..."
                                                    className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 font-mono text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500/20 text-green-400 rounded-[4px] hover:bg-green-500/30 transition-colors text-sm font-medium"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="flex-1 py-2 bg-white/5 text-gray-400 rounded-[4px] hover:bg-white/10 transition-colors text-sm"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-white truncate">{webhook.name}</div>
                                                        {isBridge ? (
                                                            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-wide bg-purple-500/20 text-purple-300">
                                                                <Zap className="w-3 h-3" />
                                                                Bridge
                                                            </span>
                                                        ) : (
                                                            <div className="text-xs text-gray-500 font-mono truncate">{webhook.url}</div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 ml-3">
                                                        {!isBridge && (
                                                            <button
                                                                onClick={() => handleEdit(webhook)}
                                                                className="p-2 rounded-[4px] hover:bg-white/10 text-gray-400 hover:text-blue-400 transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => (isBridge ? handleUnlink(webhook.id) : handleDelete(webhook.id))}
                                                            className="p-2 rounded-[4px] hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                                                            title={isBridge ? 'Unlink' : 'Delete'}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {isBridge && (
                                                    <>
                                                        <p className="mt-2 text-[11px] text-gray-500">
                                                            Also run <code className="rounded-[3px] border border-white/10 bg-black/40 px-1 text-purple-300">/bridge revoke</code> in Discord to invalidate the key.
                                                        </p>
                                                        {/* Fix round 1, items 6/7: this note lived only inside the
                                                            isLinking form, so it vanished the moment linking
                                                            succeeded. Keep it visible on every bridge row. */}
                                                        <p className="mt-1 text-[11px] text-amber-400/80">
                                                            Bridged reports are posted by the Axi bot, so they appear as <span className="font-semibold">Axi</span> rather than AxiBridge. If the bot is offline, bridged reports are not delivered.
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add New Webhook Form */}
                        {isAdding && (
                            <div className="rounded-[4px] p-4 space-y-3 mb-3" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}>
                                <div className="text-sm font-medium text-purple-300 mb-2">New Webhook</div>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Webhook name (e.g., My Guild)"
                                    className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
                                    autoFocus
                                />
                                <input
                                    type="text"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="https://discord.com/api/webhooks/..."
                                    className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 font-mono text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAdd}
                                        disabled={!newName.trim() || !newUrl.trim()}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-500/20 text-blue-300 rounded-[4px] hover:bg-blue-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Webhook
                                    </button>
                                    <button
                                        onClick={() => { setIsAdding(false); setNewName(''); setNewUrl(''); }}
                                        className="flex-1 py-2 bg-white/5 text-gray-400 rounded-[4px] hover:bg-white/10 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Link AxiTools Channel Form */}
                        {isLinking && (
                            <div className="rounded-[4px] p-4 space-y-3 mb-3" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}>
                                <div className="text-sm font-medium text-purple-300 mb-2">Link AxiTools channel</div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">AxiTools bridge key</label>
                                    <input
                                        type="text"
                                        value={bridgeKey}
                                        onChange={(e) => { setBridgeKey(e.target.value); setBridgeLinkError(null); }}
                                        placeholder="axb1.…"
                                        className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 font-mono text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
                                        autoFocus
                                    />
                                    <p className="mt-1.5 text-xs text-gray-500">
                                        In Discord, run <code className="rounded-[3px] border border-white/10 bg-black/40 px-1 text-purple-300">/bridge pair</code> in the channel that should receive reports, then paste the key here.
                                    </p>
                                </div>
                                <p className="text-xs text-amber-400/80">
                                    Bridged reports are posted by the Axi bot, so they appear as <span className="font-semibold">Axi</span> rather than AxiBridge. If the bot is offline, bridged reports are not delivered.
                                </p>
                                {bridgeLinkError && (
                                    <p className="text-xs text-rose-300">{bridgeLinkError}</p>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleLinkSubmit}
                                        disabled={!bridgeKey.trim() || bridgeLinking}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-500/20 text-purple-300 rounded-[4px] hover:bg-purple-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Zap className="w-4 h-4" />
                                        {bridgeLinking ? 'Linking…' : 'Link Channel'}
                                    </button>
                                    <button
                                        onClick={() => { setIsLinking(false); setBridgeKey(''); setBridgeLinkError(null); }}
                                        className="flex-1 py-2 bg-white/5 text-gray-400 rounded-[4px] hover:bg-white/10 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {!isAdding && !isLinking && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsAdding(true)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-[4px] text-gray-400 hover:text-blue-300 transition-colors" style={{ borderColor: 'var(--border-default)' }}
                                >
                                    <Plus className="w-5 h-5" />
                                    Add New Webhook
                                </button>
                                <button
                                    onClick={() => setIsLinking(true)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-[4px] text-gray-400 hover:text-purple-300 transition-colors" style={{ borderColor: 'var(--border-default)' }}
                                >
                                    <Zap className="w-5 h-5" />
                                    Link AxiTools channel
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveAll}
                            className="px-4 py-2 text-white rounded-[4px] text-sm font-medium transition-all"
                            style={{ background: 'var(--brand-primary)' }}
                        >
                            Save Changes
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
