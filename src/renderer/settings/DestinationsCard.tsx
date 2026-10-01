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
                    <div className="text-center axi-ink-faint py-8">
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
                            className="axi-well axi-well--sm group transition-colors"
                            style={{ '--axi-well-pad': '16px' } as React.CSSProperties}
                        >
                            {editingId === webhook.id ? (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="Webhook name"
                                        className="axi-input"
                                    />
                                    <input
                                        type="text"
                                        value={editUrl}
                                        onChange={(e) => setEditUrl(e.target.value)}
                                        placeholder="https://discord.com/api/webhooks/..."
                                        className="axi-input font-mono"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSaveEdit}
                                            className="axi-btn flex-1 justify-center axi-ink-ok"
                                        >
                                            <Check className="w-4 h-4" />
                                            Save
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="axi-btn flex-1 axi-ink-dim"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium axi-ink-plain truncate">{webhook.name}</div>
                                            {isBridge ? (
                                                needsRelink ? (
                                                    <span className="mt-1 axi-chip axi-chip--warn">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Re-link required
                                                    </span>
                                                ) : (
                                                    <span className="mt-1 axi-chip axi-chip--meta">
                                                        <Zap className="w-3 h-3" />
                                                        Bridge
                                                    </span>
                                                )
                                            ) : (
                                                <div className="text-xs axi-ink-faint font-mono truncate">{webhook.url}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 ml-3">
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isEnabled}
                                                aria-label={webhook.name}
                                                onClick={() => onSetEnabled(webhook.id, !isEnabled)}
                                                /* Upstream's switch, sized down for a list row. Only the three
                                                   --axi-switch-* tokens are ours; the frame, the fill and the
                                                   slug's travel all come from axi.css. */
                                                className="axi-switch"
                                                style={{ '--axi-switch-w': '36px', '--axi-switch-h': '20px', '--axi-switch-knob': '14px' } as React.CSSProperties}
                                            >
                                                <span className="axi-switch__knob" />
                                            </button>
                                            {!isBridge && (
                                                <button
                                                    onClick={() => handleEdit(webhook)}
                                                    className="axi-btn axi-btn--icon axi-ink-dim"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => (isBridge ? handleUnlink(webhook.id) : handleDelete(webhook.id))}
                                                className="axi-btn axi-btn--icon axi-ink-dim"
                                                title={isBridge ? 'Unlink' : 'Delete'}
                                                aria-label={`${isBridge ? 'Unlink' : 'Delete'} ${webhook.name}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {isBridge && needsRelink && (
                                        <p className="mt-2 text-[11px] axi-ink-warn">
                                            This link was revoked. Run <code className="axi-code">/bridge pair</code> in Discord again and paste the new key below to restore delivery.
                                        </p>
                                    )}
                                    {isBridge && !needsRelink && (
                                        <>
                                            <p className="mt-2 text-[11px] axi-ink-faint">
                                                Also run <code className="axi-code">/bridge revoke</code> in Discord to invalidate the key.
                                            </p>
                                            {/* Fix round 1, items 6/7: this note lived only inside the
                                                isLinking form, so it vanished the moment linking
                                                succeeded. Keep it visible on every bridge row. */}
                                            <p className="mt-1 text-[11px] axi-ink-warn">
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
                <div className="axi-well axi-well--sm space-y-3 mb-3" style={{ '--axi-well-pad': '16px' } as React.CSSProperties}>
                    <div className="text-sm font-medium axi-ink-meta mb-2">New Webhook</div>
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Webhook name (e.g., My Guild)"
                        className="axi-input"
                        autoFocus
                    />
                    <input
                        type="text"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className="axi-input font-mono"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleAdd}
                            disabled={!newName.trim() || !newUrl.trim()}
                            className="axi-btn flex-1 justify-center axi-ink-meta"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </button>
                        <button
                            onClick={() => { setIsAdding(false); setNewName(''); setNewUrl(''); }}
                            className="axi-btn flex-1 axi-ink-dim"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Link AxiTools Channel Form */}
            {isLinking && (
                <div className="axi-well axi-well--sm space-y-3 mb-3" style={{ '--axi-well-pad': '16px' } as React.CSSProperties}>
                    <div className="text-sm font-medium axi-ink-meta mb-2">Link AxiTools channel</div>
                    <div>
                        <label className="block text-xs axi-ink-dim mb-1">AxiTools bridge key</label>
                        <input
                            type="text"
                            value={bridgeKey}
                            onChange={(e) => { setBridgeKey(e.target.value); setBridgeLinkError(null); }}
                            placeholder="axb1.…"
                            className="axi-input font-mono"
                            autoFocus
                        />
                        <p className="mt-1.5 text-xs axi-ink-faint">
                            In Discord, run <code className="axi-code">/bridge pair</code> in the channel that should receive reports, then paste the key here.
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
                        <p className="text-xs axi-ink-danger">{bridgeLinkError}</p>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={handleLinkSubmit}
                            disabled={!bridgeKey.trim() || bridgeLinking}
                            className="axi-btn flex-1 justify-center axi-ink-meta"
                        >
                            <Zap className="w-4 h-4" />
                            {bridgeLinking ? 'Linking…' : 'Link'}
                        </button>
                        <button
                            onClick={() => { setIsLinking(false); setBridgeKey(''); setBridgeLinkError(null); }}
                            className="axi-btn flex-1 axi-ink-dim"
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
                        className="axi-btn axi-btn--dashed flex-1 justify-center axi-ink-dim"
                    >
                        <Plus className="w-5 h-5" />
                        Add Webhook
                    </button>
                    <button
                        onClick={() => setIsLinking(true)}
                        className="axi-btn axi-btn--dashed flex-1 justify-center axi-ink-dim"
                    >
                        <Zap className="w-5 h-5" />
                        Link AxiTools channel
                    </button>
                </div>
            )}
        </>
    );
}
