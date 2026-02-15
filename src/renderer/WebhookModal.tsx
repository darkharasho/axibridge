import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Edit2, Check, Link } from 'lucide-react';

export interface Webhook {
    id: string;
    name: string;
    url: string;
}

interface WebhookModalProps {
    isOpen: boolean;
    onClose: () => void;
    webhooks: Webhook[];
    onSave: (webhooks: Webhook[]) => void;
}

export function WebhookModal({ isOpen, onClose, webhooks, onSave }: WebhookModalProps) {
    const [localWebhooks, setLocalWebhooks] = useState<Webhook[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLocalWebhooks([...webhooks]);
            setIsAdding(false);
            setEditingId(null);
        }
    }, [isOpen, webhooks]);

    const handleAdd = () => {
        if (!newName.trim() || !newUrl.trim()) return;

        const newWebhook: Webhook = {
            id: Date.now().toString(),
            name: newName.trim(),
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
        setEditUrl(webhook.url);
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

    const handleSaveAll = () => {
        onSave(localWebhooks);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="app-modal-card bg-gradient-to-br from-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Link className="w-5 h-5 text-purple-400" />
                            Manage Webhooks
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        {/* Existing Webhooks */}
                        <div className="space-y-3 mb-4">
                            {localWebhooks.length === 0 && !isAdding && (
                                <div className="text-center text-gray-500 py-8">
                                    <Link className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>No webhooks configured</p>
                                    <p className="text-sm">Add a webhook to get started</p>
                                </div>
                            )}

                            {localWebhooks.map(webhook => (
                                <div
                                    key={webhook.id}
                                    className="bg-white/5 border border-white/10 rounded-xl p-4 group hover:bg-white/10 transition-colors"
                                >
                                    {editingId === webhook.id ? (
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                placeholder="Webhook name"
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                                            />
                                            <input
                                                type="text"
                                                value={editUrl}
                                                onChange={(e) => setEditUrl(e.target.value)}
                                                placeholder="https://discord.com/api/webhooks/..."
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 font-mono text-xs"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveEdit}
                                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium"
                                                >
                                                    <Check className="w-4 h-4" />
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="flex-1 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 transition-colors text-sm"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-white truncate">{webhook.name}</div>
                                                <div className="text-xs text-gray-500 font-mono truncate">{webhook.url}</div>
                                            </div>
                                            <div className="flex items-center gap-1 ml-3">
                                                <button
                                                    onClick={() => handleEdit(webhook)}
                                                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-blue-400 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(webhook.id)}
                                                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add New Webhook Form */}
                        {isAdding ? (
                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-3">
                                <div className="text-sm font-medium text-purple-300 mb-2">New Webhook</div>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Webhook name (e.g., My Guild)"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                                    autoFocus
                                />
                                <input
                                    type="text"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="https://discord.com/api/webhooks/..."
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 font-mono text-xs"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAdd}
                                        disabled={!newName.trim() || !newUrl.trim()}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Webhook
                                    </button>
                                    <button
                                        onClick={() => { setIsAdding(false); setNewName(''); setNewUrl(''); }}
                                        className="flex-1 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/10 rounded-xl text-gray-400 hover:border-purple-500/50 hover:text-purple-400 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                                Add New Webhook
                            </button>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10 bg-black/20">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveAll}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-purple-500 hover:to-blue-500 transition-all shadow-lg shadow-purple-500/20"
                        >
                            Save Changes
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
