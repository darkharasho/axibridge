import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { IRepoCollaborator, IRepoInvite } from '../global.d';

type Props = { repoOwner: string; repoName: string; onAdminKnown?: (canAdmin: boolean) => void };

/**
 * Lets the site admin add other AxiBridge users as publishers. Access is a
 * plain GitHub collaborator invite with push permission; the invitee sees a
 * Join prompt in their own AxiBridge.
 */
export const PublishersCard = ({ repoOwner, repoName, onAdminKnown }: Props) => {
    const [loading, setLoading] = useState(true);
    const [canAdmin, setCanAdmin] = useState(false);
    const [ownerType, setOwnerType] = useState<'User' | 'Organization' | null>(null);
    const [collaborators, setCollaborators] = useState<IRepoCollaborator[]>([]);
    const [invites, setInvites] = useState<IRepoInvite[]>([]);
    const [viewer, setViewer] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.getRepoPublishers) return;
        setLoading(true);
        const res = await api.getRepoPublishers({ owner: repoOwner, repo: repoName });
        setLoading(false);
        if (!res?.success) {
            setMessage({ kind: 'error', text: res?.error || 'Failed to load publishers.' });
            return;
        }
        setCanAdmin(!!res.canAdmin);
        setOwnerType(res.ownerType ?? null);
        setCollaborators(res.collaborators ?? []);
        setInvites(res.invites ?? []);
        onAdminKnown?.(!!res.canAdmin);
    }, [repoOwner, repoName, onAdminKnown]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        void window.electronAPI?.getGithubViewerLogin?.().then((r) => setViewer(r?.success ? r.login ?? null : null));
    }, []);

    const handleAdd = async () => {
        const name = username.trim();
        if (!name) return;
        setBusy(true);
        setMessage(null);
        const res = await window.electronAPI.addRepoPublisher({ owner: repoOwner, repo: repoName, username: name });
        setBusy(false);
        if (!res?.success) {
            setMessage({ kind: 'error', text: res?.error || 'Failed to add publisher.' });
            return;
        }
        setUsername('');
        setMessage({
            kind: 'ok',
            text: res.status === 'already-has-access'
                ? `${name} already has access.`
                : `Invited ${name}. They'll see a Join prompt next time they open AxiBridge.`
        });
        await load();
    };

    const handleRemove = async (login: string) => {
        if (!window.confirm(`Remove ${login}'s access to ${repoOwner}/${repoName}?`)) return;
        const res = await window.electronAPI.removeRepoPublisher({ owner: repoOwner, repo: repoName, username: login });
        setMessage(res?.success ? null : { kind: 'error', text: res?.error || 'Failed to remove publisher.' });
        await load();
    };

    const handleCancel = async (invite: IRepoInvite) => {
        if (!window.confirm(`Cancel the invite for ${invite.login}?`)) return;
        const res = await window.electronAPI.cancelRepoInvite({ owner: repoOwner, repo: repoName, invitationId: invite.id });
        setMessage(res?.success ? null : { kind: 'error', text: res?.error || 'Failed to cancel invite.' });
        await load();
    };

    return (
        <div className="axi-well axi-well--sm mb-4" style={{ '--axi-well-pad': '16px' } as CSSProperties} data-testid="publishers-card">
            <div className="text-xs uppercase tracking-widest axi-ink-faint mb-3">Publishers</div>
            {loading && <div className="text-xs axi-ink-meta">Loading…</div>}
            {!loading && !canAdmin && (
                <p className="text-xs axi-ink-dim">
                    Only a repo admin can add publishers. Ask {repoOwner}, or{' '}
                    <a href={`https://github.com/${repoOwner}/${repoName}/settings/access`} target="_blank" rel="noreferrer" className="axi-ink-accent underline">
                        manage access on GitHub
                    </a>.
                </p>
            )}
            {!loading && canAdmin && (
                <>
                    <p className="text-xs axi-ink-dim mb-3">
                        Publishers can post their own raids to this site. They need a GitHub account and AxiBridge.
                    </p>
                    <div className="flex items-center gap-2 mb-3">
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                            placeholder="GitHub username"
                            className="axi-input flex-1 text-sm"
                        />
                        <button onClick={() => void handleAdd()} disabled={busy || !username.trim()} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">
                            Add
                        </button>
                    </div>
                    <ul className="space-y-1">
                        {collaborators.map((c) => (
                            <li key={c.login} className="flex items-center justify-between text-sm">
                                <span className="axi-ink-plain">{c.login}</span>
                                {viewer?.toLowerCase() !== c.login.toLowerCase() && (
                                    <button onClick={() => void handleRemove(c.login)} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Remove ${c.login}`}>
                                        Remove
                                    </button>
                                )}
                            </li>
                        ))}
                        {invites.map((i) => (
                            <li key={i.id} className="flex items-center justify-between text-sm">
                                <span><span className="axi-ink-plain">{i.login}</span> <span className="text-xs axi-ink-faint">invited</span></span>
                                <button onClick={() => void handleCancel(i)} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Cancel invite for ${i.login}`}>
                                    Cancel
                                </button>
                            </li>
                        ))}
                    </ul>
                    {ownerType === 'Organization' && (
                        <p className="mt-3 text-xs axi-ink-faint">Org members with access through teams aren't listed here.</p>
                    )}
                </>
            )}
            {message && (
                <div className={`mt-3 text-xs ${message.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>{message.text}</div>
            )}
        </div>
    );
};
