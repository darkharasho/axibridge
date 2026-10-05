import { useCallback, useEffect, useRef, useState } from 'react';
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
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; helpUrl?: string } | null>(null);

    const busyRef = useRef(false);
    const requestIdRef = useRef(0);

    const load = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.getRepoPublishers) return;
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            const res = await api.getRepoPublishers({ owner: repoOwner, repo: repoName });
            if (requestId !== requestIdRef.current) return;
            if (!res?.success) {
                setMessage({ kind: 'error', text: res?.error || 'Failed to load publishers.' });
                return;
            }
            setCanAdmin(!!res.canAdmin);
            setOwnerType(res.ownerType ?? null);
            setCollaborators(res.collaborators ?? []);
            setInvites(res.invites ?? []);
            onAdminKnown?.(!!res.canAdmin);
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to load publishers.' });
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [repoOwner, repoName, onAdminKnown]);

    // A different repo must never show the previous repo's data.
    useEffect(() => {
        setCanAdmin(false);
        setOwnerType(null);
        setCollaborators([]);
        setInvites([]);
        setMessage(null);
    }, [repoOwner, repoName]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => () => { requestIdRef.current += 1; }, []);
    useEffect(() => {
        void window.electronAPI?.getGithubViewerLogin?.().then((r) => setViewer(r?.success ? r.login ?? null : null));
    }, []);

    const handleAdd = async () => {
        const name = username.trim();
        if (!name || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setMessage(null);
        let res;
        try {
            res = await window.electronAPI.addRepoPublisher({ owner: repoOwner, repo: repoName, username: name });
        } catch (err) {
            setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to add publisher.' });
            return;
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
        if (!res?.success) {
            setMessage({ kind: 'error', text: res?.error || 'Failed to add publisher.', helpUrl: res?.helpUrl });
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
        if (busyRef.current) return;
        if (!window.confirm(`Remove ${login}'s access to ${repoOwner}/${repoName}?`)) return;
        busyRef.current = true;
        setBusy(true);
        try {
            const res = await window.electronAPI.removeRepoPublisher({ owner: repoOwner, repo: repoName, username: login });
            setMessage(res?.success ? null : { kind: 'error', text: res?.error || 'Failed to remove publisher.' });
            await load();
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const handleCancel = async (invite: IRepoInvite) => {
        if (busyRef.current) return;
        if (!window.confirm(`Cancel the invite for ${invite.login}?`)) return;
        busyRef.current = true;
        setBusy(true);
        try {
            const res = await window.electronAPI.cancelRepoInvite({ owner: repoOwner, repo: repoName, invitationId: invite.id });
            setMessage(res?.success ? null : { kind: 'error', text: res?.error || 'Failed to cancel invite.' });
            await load();
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const manageUrl = `https://github.com/${repoOwner}/${repoName}/settings/access`;
    const openExternal = (url: string) => void window.electronAPI?.openExternal?.(url);

    return (
        <div data-testid="publishers-card">
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-widest axi-ink-faint">
                    {collaborators.length > 0 ? `Members · ${collaborators.length}` : 'Members'}
                </div>
                <button type="button" onClick={() => openExternal(manageUrl)} className="text-xs axi-ink-accent underline">
                    Manage access on GitHub ↗
                </button>
            </div>
            <p className="text-xs axi-ink-dim mb-3">
                Anyone with write access to <span className="axi-ink-plain">{repoOwner}/{repoName}</span> can publish here.
                {canAdmin && ' Adding someone sends them a GitHub invite; they join from AxiBridge.'}
            </p>
            {loading && <div className="text-xs axi-ink-meta">Loading…</div>}
            {!loading && canAdmin && (
                <div className="flex items-center gap-2 mb-3">
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                        placeholder="GitHub username"
                        aria-label="GitHub username"
                        className="axi-input flex-1 text-sm"
                    />
                    <button onClick={() => void handleAdd()} disabled={busy || !username.trim()} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">
                        Add
                    </button>
                </div>
            )}
            {!loading && (
                <ul className="space-y-1">
                    {collaborators.map((c) => (
                        <li key={c.login} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                                {c.avatarUrl && <img src={c.avatarUrl} alt="" className="w-5 h-5 rounded-full" />}
                                <span className="axi-ink-plain">{c.login}</span>
                            </span>
                            {canAdmin && viewer?.toLowerCase() !== c.login.toLowerCase() && (
                                <button onClick={() => void handleRemove(c.login)} disabled={busy} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Remove ${c.login}`}>
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                    {invites.map((i) => (
                        <li key={i.id} className="flex items-center justify-between text-sm">
                            <span><span className="axi-ink-plain">{i.login}</span> <span className="text-xs axi-ink-faint">invited</span></span>
                            <button onClick={() => void handleCancel(i)} disabled={busy} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Cancel invite for ${i.login}`}>
                                Cancel
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {!loading && !canAdmin && (
                <p className="mt-3 text-xs axi-ink-faint">Only a repo admin can add or remove members.</p>
            )}
            {!loading && ownerType === 'Organization' && (
                <p className="mt-3 text-xs axi-ink-faint">Org members with access through teams aren't listed here.</p>
            )}
            {message && (
                <div className={`mt-3 text-xs ${message.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>
                    {message.text}
                    {message.helpUrl && (
                        <>
                            {' '}
                            <button type="button" onClick={() => openExternal(message.helpUrl!)} className="axi-ink-accent underline">
                                {message.helpUrl.includes('/settings/member_privileges') ? 'Org settings ↗' : 'Open settings ↗'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
