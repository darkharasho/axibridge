import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, Link, Zap, AlertTriangle } from 'lucide-react';
import type { Webhook } from '../WebhookModal';

export interface DestinationsCardProps {
    webhooks: Webhook[];
    enabledWebhookIds: string[];
    /**
     * Commits a webhooks-list change. `selectId`, when present, asks the
     * caller to also enable that entry in the same save — used by the link
     * flow so a freshly linked channel activates immediately rather than
     * waiting on a separate toggle.
     */
    onSave: (webhooks: Webhook[], selectId?: string) => void;
    /** Switches one destination on or off. */
    onSetEnabled: (id: string, enabled: boolean) => void;
}

/**
 * The Discord destinations editor, mounted by both `WebhookModal` (reachable
 * mid-workflow from the header) and Settings › Discord › Destinations.
 *
 * Deliberately controlled and commit-on-every-edit. The modal used to stage
 * edits in a local draft committed by a "Save Changes" button — except Link
 * and Unlink, which committed immediately, a split that once left a deleted
 * bridge entry stored and still sending when the modal was closed with the X.
 * A card mounted inline in Settings has no "Save Changes" moment at all, so
 * running two commit models in one component was never an option. One model,
 * both mounts, nothing half-committed.
 */
export function DestinationsCard({ webhooks, enabledWebhookIds, onSave, onSetEnabled }: DestinationsCardProps) {
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

    const handleAdd = () => {
        if (!newName.trim() || !newUrl.trim()) return;

        const newWebhook: Webhook = {
            id: Date.now().toString(),
            name: newName.trim(),
            kind: 'webhook',
            url: newUrl.trim()
        };

        onSave([...webhooks, newWebhook]);
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

        onSave(webhooks.map(w =>
            w.id === editingId
                ? { ...w, name: editName.trim(), url: editUrl.trim() }
                : w
        ));
        setEditingId(null);
    };

    const handleDelete = (id: string) => {
        onSave(webhooks.filter(w => w.id !== id));
    };

    /**
     * Fix round 1, item 8: `handleDelete` only mutated local state, so
     * Unlink needed a separate "Save Changes" click while Link committed
     * instantly — closing the modal with the X after clicking Unlink left
     * the bridge entry stored and still sending. Commit the same way Link
     * does: mutate and save in one step.
     */
    const handleUnlink = (id: string) => {
        const next = webhooks.filter(w => w.id !== id);
        onSave(next);
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
            // I5, second half: re-linking the SAME guild+channel (the common
            // recovery path after a revoke) should replace the token on the
            // existing row, not append a second entry for the same
            // destination.
            //
            // N3: match on `guild_id`/`channel_id` -- the identity
            // `/bridge/whoami` scopes a key to -- rather than on display
            // names. Names can be renamed between link attempts, and two
            // guilds can share a display name, either of which mis-targets a
            // name-based match (append a dead duplicate, or overwrite a
            // different guild's row).
            //
            // Fallback: entries persisted before this field existed have no
            // stored `guildId`/`channelId` at all. For those, and ONLY those,
            // fall back to the old name comparison so a legacy row can still
            // be re-linked in place instead of permanently duplicating on
            // every user's first re-link after the upgrade.
            const existing = webhooks.find((w) => {
                if (w.kind !== 'bridge') return false;
                if (w.guildId && w.channelId) {
                    return w.guildId === result.guildId && w.channelId === result.channelId;
                }
                return w.guildName === result.guildName && w.channelName === result.channelName;
            });
            const linked: Webhook = existing
                ? { ...existing, relayUrl: result.relayUrl, token: key, guildId: result.guildId, channelId: result.channelId }
                : {
                    id: crypto.randomUUID(),
                    name: `${result.guildName} › #${result.channelName}`,
                    kind: 'bridge',
                    relayUrl: result.relayUrl,
                    token: key,
                    guildName: result.guildName,
                    channelName: result.channelName,
                    guildId: result.guildId,
                    channelId: result.channelId
                };
            const next = existing
                ? webhooks.map((w) => (w.id === existing.id ? linked : w))
                : [...webhooks, linked];
            // Linking is immediate rather than staged: it must reach the
            // store (and re-derive the active destination) right away, not
            // wait for a separate "Save Changes" click on unrelated edits.
            // Fix round 1, item 3: also select it in the same save, or
            // `applyDiscordDestinations()` re-derives against whatever was
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

    return (
        <>
            {/* Existing Webhooks */}
            <div className="space-y-3 mb-4">
                {webhooks.length === 0 && !isAdding && !isLinking && (
                    <div className="text-center text-gray-500 py-8">
                        <Link className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No webhooks configured</p>
                        <p className="text-sm">Add a webhook to get started</p>
                    </div>
                )}

                {webhooks.map(webhook => {
                    const isBridge = webhook.kind === 'bridge';
                    // A revoked bridge token clears `token` but leaves the row
                    // in place (see `handleDiscordSendResults` in
                    // `discordDestinationResolver.ts`). Derive the re-link state
                    // purely from the persisted entry -- not from any in-memory
                    // send-status -- so it survives a restart.
                    const needsRelink = isBridge && !webhook.token;
                    const isEnabled = enabledWebhookIds.includes(webhook.id);
                    return (
                        <div
                            key={webhook.id}
                            className="rounded-[4px] p-4 group transition-colors"
                            style={{ background: 'var(--bg-card-inner)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
                        >
                            {editingId === webhook.id ? (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="Webhook name"
                                        className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" style={{ background: 'var(--bg-input)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
                                    />
                                    <input
                                        type="text"
                                        value={editUrl}
                                        onChange={(e) => setEditUrl(e.target.value)}
                                        placeholder="https://discord.com/api/webhooks/..."
                                        className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 font-mono text-xs" style={{ background: 'var(--bg-input)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
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
                                                needsRelink ? (
                                                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-300">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Re-link required
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-wide bg-purple-500/20 text-purple-300">
                                                        <Zap className="w-3 h-3" />
                                                        Bridge
                                                    </span>
                                                )
                                            ) : (
                                                <div className="text-xs text-gray-500 font-mono truncate">{webhook.url}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 ml-3">
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isEnabled}
                                                aria-label={webhook.name}
                                                onClick={() => onSetEnabled(webhook.id, !isEnabled)}
                                                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
                                                style={{ background: isEnabled ? 'var(--brand-primary)' : 'var(--bg-input)' }}
                                            >
                                                <span
                                                    className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                                                    style={{ transform: isEnabled ? 'translateX(1.25rem)' : 'translateX(0.25rem)' }}
                                                />
                                            </button>
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
                                                aria-label={`${isBridge ? 'Unlink' : 'Delete'} ${webhook.name}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {isBridge && needsRelink && (
                                        <p className="mt-2 text-[11px] text-amber-300">
                                            This link was revoked. Run <code className="rounded-[3px] border border-white/10 bg-black/40 px-1 text-purple-300">/bridge pair</code> in Discord again and paste the new key below to restore delivery.
                                        </p>
                                    )}
                                    {isBridge && !needsRelink && (
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
                <div className="rounded-[4px] p-4 space-y-3 mb-3" style={{ background: 'var(--bg-card-inner)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}>
                    <div className="text-sm font-medium text-purple-300 mb-2">New Webhook</div>
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Webhook name (e.g., My Guild)"
                        className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" style={{ background: 'var(--bg-input)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
                        autoFocus
                    />
                    <input
                        type="text"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 font-mono text-xs" style={{ background: 'var(--bg-input)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            disabled={!newName.trim() || !newUrl.trim()}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-500/20 text-blue-300 rounded-[4px] hover:bg-blue-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus className="w-4 h-4" />
                            Add
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
                <div className="rounded-[4px] p-4 space-y-3 mb-3" style={{ background: 'var(--bg-card-inner)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}>
                    <div className="text-sm font-medium text-purple-300 mb-2">Link AxiTools channel</div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">AxiTools bridge key</label>
                        <input
                            type="text"
                            value={bridgeKey}
                            onChange={(e) => { setBridgeKey(e.target.value); setBridgeLinkError(null); }}
                            placeholder="axb1.…"
                            className="w-full rounded-[4px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 font-mono text-xs" style={{ background: 'var(--bg-input)', border: 'var(--panel-border-w, 1px) solid var(--border-default)' }}
                            autoFocus
                        />
                        <p className="mt-1.5 text-xs text-gray-500">
                            In Discord, run <code className="rounded-[3px] border border-white/10 bg-black/40 px-1 text-purple-300">/bridge pair</code> in the channel that should receive reports, then paste the key here.
                        </p>
                    </div>
                    {/* Fix round 1 (task 8 review): the "posted by the Axi bot" note used
                        to be duplicated here AND on every already-linked row below (Fix
                        round 1, items 6/7 made the row copy persistent but never removed
                        this one). With both mounted in the same card, linking a second
                        channel while an existing bridge row is visible showed the identical
                        sentence twice on one screen. The persistent per-row copy already
                        covers the disclaimer -- it reappears the instant this form closes
                        and the newly linked row renders -- so this transient copy is dropped
                        rather than duplicated. */}
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
                            {bridgeLinking ? 'Linking…' : 'Link'}
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
                        Add Webhook
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
        </>
    );
}
