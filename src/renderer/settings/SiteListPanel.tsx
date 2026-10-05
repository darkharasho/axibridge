import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { ISiteInvite } from '../global.d';
import {
    normalizeSiteKey, sortSitesDefaultFirst, hasSite, type IGithubSite, type ISiteDetails, type SiteRef
} from '../../shared/githubSites';
import { roleLabel, type SitePanelMode } from './PublishingSiteCard';
import { validateRepoName } from './validateRepoName';

type Props = {
    mode: SitePanelMode;
    sites: IGithubSite[];
    defaultKey: string | null;
    details: Record<string, ISiteDetails>;
    onModeChange: (mode: SitePanelMode) => void;
    onClose: () => void;
    onSitesChanged: (sites: IGithubSite[]) => void;
    onDefaultChanged: (owner: string, repo: string) => void;
    onInvitesChanged?: (count: number) => void;
};
type Note = { kind: 'ok' | 'error'; text: string } | null;
type RepoRow = { full_name: string; name: string; owner: string };

const WELL = { '--axi-well-pad': '16px' } as CSSProperties;
const BTN = 'axi-btn axi-btn--sm axi-ink-dim axi-edge-rule';

/** Every site you publish to, invites to new ones, and the ways to add one. Inline, never floating. */
export const SiteListPanel = ({ mode, sites, defaultKey, details, onModeChange, onClose, onSitesChanged, onDefaultChanged, onInvitesChanged }: Props) => {
    const api = window.electronAPI;
    const [note, setNote] = useState<Note>(null);
    const [busy, setBusy] = useState(false);
    const [invites, setInvites] = useState<ISiteInvite[]>([]);
    const [invitesLoaded, setInvitesLoaded] = useState(false);

    const [found, setFound] = useState<SiteRef[] | null>(null);
    const [findError, setFindError] = useState<string | null>(null);
    const [repos, setRepos] = useState<RepoRow[] | null>(null);
    const [reposError, setReposError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [orgs, setOrgs] = useState<Array<{ login: string }>>([]);
    const [createOwner, setCreateOwner] = useState('');
    const [createName, setCreateName] = useState('');
    const createError = createName ? validateRepoName(createName) : null;

    const ordered = useMemo(() => sortSitesDefaultFirst(sites, defaultKey), [sites, defaultKey]);

    useEffect(() => {
        void api?.getPendingSiteInvites?.({ force: true }).then((res) => {
            if (res?.success) setInvites(res.invites ?? []);
        }).catch(() => { /* invites are optional here */ }).finally(() => setInvitesLoaded(true));
    }, []);
    useEffect(() => { if (invitesLoaded) onInvitesChanged?.(invites.length); }, [invites, invitesLoaded, onInvitesChanged]);

    const keepNote = useRef(false);
    useEffect(() => {
        if (keepNote.current) keepNote.current = false;
        else setNote(null);
        let ignore = false;
        const errText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
        if (mode === 'find') {
            setFound(null);
            setFindError(null);
            void Promise.resolve().then(() => api.findGithubSites()).then((res) => {
                if (ignore) return;
                if (res?.success) setFound(res.found ?? []);
                else setFindError(res?.error || 'Failed to search your repos.');
            }).catch((err: unknown) => { if (!ignore) setFindError(errText(err, 'Failed to search your repos.')); });
        }
        if (mode === 'existing' && repos === null) {
            setReposError(null);
            void Promise.resolve().then(() => api.getGithubRepos()).then((res) => {
                if (ignore) return;
                if (res?.success) setRepos(res.repos ?? []);
                else { setReposError(res?.error || 'Failed to load your repositories.'); setRepos([]); }
            }).catch((err: unknown) => {
                if (ignore) return;
                setReposError(errText(err, 'Failed to load your repositories.'));
                setRepos([]);
            });
        }
        if (mode === 'create') {
            void Promise.resolve().then(() => api.getGithubOrgs?.()).then((res) => {
                if (!ignore) setOrgs(res?.success ? res.orgs ?? [] : []);
            }).catch(() => { if (!ignore) setOrgs([]); });
        }
        return () => { ignore = true; };
    }, [mode]);

    const run = async (fn: () => Promise<boolean | void>): Promise<boolean> => {
        if (busy) return false;
        setBusy(true);
        setNote(null);
        try {
            return (await fn()) !== false;
        } catch (err) {
            setNote({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
            return false;
        } finally {
            setBusy(false);
        }
    };

    const makeDefault = (ref: SiteRef) => run(async () => {
        const res = await api.setDefaultGithubSite(ref);
        if (!res?.success) { setNote({ kind: 'error', text: res?.error || 'Failed to switch site.' }); return false; }
        onSitesChanged(res.sites);
        onDefaultChanged(ref.owner, ref.repo);
        return true;
    });

    const remove = (ref: SiteRef) => run(async () => {
        const res = await api.removeGithubSite({ owner: ref.owner, repo: ref.repo });
        if (!res?.success) { setNote({ kind: 'error', text: res?.error || 'Failed to remove site.' }); return false; }
        onSitesChanged(res.sites);
    });

    const add = (ref: SiteRef, addedVia: 'manual' | 'found') => run(async () => {
        const res = await api.addGithubSite({ owner: ref.owner, repo: ref.repo, addedVia });
        if (!res?.success) { setNote({ kind: 'error', text: res?.error || 'Failed to add site.' }); return false; }
        onSitesChanged(res.sites);
        if (addedVia === 'found') setFound((prev) => (prev ?? []).filter((f) => normalizeSiteKey(f.owner, f.repo) !== normalizeSiteKey(ref.owner, ref.repo)));
    });

    // With no default yet, a found site becomes the default, like "Use existing".
    const addFound = async (ref: SiteRef) => {
        if (defaultKey) { await add(ref, 'found'); return; }
        if (await makeDefault(ref)) setFound((prev) => (prev ?? []).filter((f) => normalizeSiteKey(f.owner, f.repo) !== normalizeSiteKey(ref.owner, ref.repo)));
    };

    const pickExisting = async (repo: RepoRow) => {
        const ref = { owner: repo.owner, repo: repo.name };
        const ok = !defaultKey ? await makeDefault(ref) : await add(ref, 'manual');
        if (ok) onModeChange('list');
    };

    const create = () => run(async () => {
        const res = await api.createGithubRepo({ name: createName, branch: 'main', owner: createOwner || undefined });
        if (!res?.success || !res.repo) { setNote({ kind: 'error', text: res?.error || 'Failed to create repository.' }); return; }
        let listed = false;
        try {
            const list = await api.getGithubSites();
            if (list?.success) { onSitesChanged(list.sites); listed = true; }
        } catch { /* repo exists; the list refresh is best-effort */ }
        onDefaultChanged(res.repo.owner, res.repo.name);
        setCreateName('');
        keepNote.current = true;
        onModeChange('list');
        setNote({ kind: 'ok', text: listed ? `Created ${res.repo.full_name}.` : `Created ${res.repo.full_name}, but the site list could not be refreshed.` });
        return true;
    });

    const join = (invite: ISiteInvite) => run(async () => {
        const res = await api.acceptSiteInvite({ invitationId: invite.id });
        if (res?.success && res.target) {
            setInvites((prev) => prev.filter((i) => i.id !== invite.id));
            onSitesChanged(res.target.sites);
            if (res.target.madeDefault) onDefaultChanged(res.target.owner, res.target.repo);
            setNote({ kind: 'ok', text: `You can now publish to ${res.target.fullName}.` });
            return;
        }
        // An expired/revoked invite can never succeed; other failures keep the row for a retry.
        if (res?.code === 'invalid') setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        setNote({ kind: 'error', text: res?.error || 'Failed to join site.' });
    });

    return (
        <div className="axi-well axi-well--sm mb-4" style={WELL} data-testid="site-list-panel">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-widest axi-ink-faint">Your sites</div>
                <button onClick={onClose} aria-label="Close site list" className="axi-action axi-action--glyph p-1 axi-ink-faint">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <ul className="space-y-1">
                {ordered.length === 0 && <li className="text-xs axi-ink-faint">No sites yet.</li>}
                {ordered.map((site) => {
                    const key = normalizeSiteKey(site.owner, site.repo);
                    const full = `${site.owner}/${site.repo}`;
                    const d = details[key];
                    const isDefault = key === defaultKey;
                    const noAccess = d?.role === 'none';
                    const role = roleLabel(d?.role);
                    const ownerKind = d?.ownerType === 'Organization' ? 'org' : d?.ownerType === 'User' ? 'personal' : null;
                    const label = (
                        <span className="flex items-center gap-2 min-w-0">
                            {d?.ownerAvatarUrl
                                ? <img src={d.ownerAvatarUrl} alt="" className="w-5 h-5 rounded shrink-0" />
                                : <span className="w-5 h-5 rounded shrink-0 axi-edge-rule" aria-hidden="true" />}
                            <span className="truncate axi-ink-plain">{full}</span>
                            {ownerKind && <span className="text-[10px] axi-ink-faint">{ownerKind}</span>}
                            {role && <span className={`text-[10px] ${noAccess ? 'axi-ink-danger' : 'axi-ink-meta'}`}>{role}</span>}
                            {isDefault && <span className="text-[10px] axi-ink-ok">✓ current</span>}
                        </span>
                    );
                    return (
                        <li key={key} data-testid="site-row" className={`flex items-center justify-between gap-2 text-sm ${noAccess ? 'opacity-50' : ''}`}>
                            {isDefault || noAccess || mode !== 'list'
                                ? <div className="flex-1 min-w-0 px-2 py-1">{label}</div>
                                : (
                                    <button type="button" disabled={busy} onClick={() => void makeDefault({ owner: site.owner, repo: site.repo })} aria-label={`Use ${full}`} className="axi-pill axi-pill--xs flex-1 min-w-0 text-left">
                                        {label}
                                    </button>
                                )}
                            {!isDefault && mode === 'list' && (
                                <button type="button" disabled={busy} onClick={() => void remove(site)} aria-label={`Remove ${full}`} className="axi-action axi-action--glyph p-1 axi-ink-faint">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            {invites.length > 0 && (
                <>
                    <div className="text-xs uppercase tracking-widest axi-ink-faint mt-4 mb-2">Invites</div>
                    <ul className="space-y-1">
                        {invites.map((i) => (
                            <li key={i.id} className="flex items-center justify-between text-sm">
                                <span><span className="axi-ink-plain">{i.fullName}</span> <span className="text-xs axi-ink-faint">from {i.inviter}</span></span>
                                <button onClick={() => void join(i)} disabled={busy} aria-label={`Join ${i.fullName}`} className={BTN}>Join</button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {mode === 'create' && (
                <div className="mt-4">
                    <div className="flex items-center gap-2">
                        {orgs.length > 0 && (
                            <select value={createOwner} onChange={(e) => setCreateOwner(e.target.value)} className="axi-select w-44" aria-label="Repository owner">
                                <option value="">Personal account</option>
                                {orgs.map((o) => <option key={o.login} value={o.login}>{o.login}</option>)}
                            </select>
                        )}
                        <input
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="New repository name"
                            className={`axi-input flex-1 ${createError ? 'axi-edge-danger' : ''}`}
                        />
                        <button onClick={() => void create()} disabled={busy || !createName || !!createError} className="axi-btn axi-btn--sm axi-ink-meta axi-edge-meta">
                            {busy ? 'Creating…' : 'Create'}
                        </button>
                    </div>
                    {createError && <div className="text-xs axi-ink-danger mt-2">{createError}</div>}
                </div>
            )}

            {mode === 'existing' && (
                <div className="mt-4">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search repositories..." className="axi-input w-full mb-2" />
                    {repos === null && <div className="text-xs axi-ink-meta">Loading…</div>}
                    {reposError && <div className="text-xs axi-ink-danger mb-2">{reposError}</div>}
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {(repos ?? [])
                            .filter((r) => r.full_name.toLowerCase().includes(search.trim().toLowerCase()))
                            .map((r) => {
                                const listed = hasSite(sites, { owner: r.owner, repo: r.name });
                                return (
                                    <button key={r.full_name} type="button" disabled={busy || listed} onClick={() => void pickExisting(r)} className="axi-pill axi-pill--xs w-full text-left flex items-center justify-between">
                                        <span className="truncate">{r.full_name}</span>
                                        {listed && <span className="text-[10px] axi-ink-faint">added</span>}
                                    </button>
                                );
                            })}
                    </div>
                </div>
            )}

            {mode === 'find' && (
                <div className="mt-4">
                    {found === null && !findError && <div className="text-xs axi-ink-meta">Searching…</div>}
                    {findError && <div className="text-xs axi-ink-danger">{findError}</div>}
                    {found?.length === 0 && <div className="text-xs axi-ink-faint">No other AxiBridge sites found.</div>}
                    <ul className="space-y-1">
                        {(found ?? []).map((f) => (
                            <li key={`${f.owner}/${f.repo}`} className="flex items-center justify-between text-sm">
                                <span className="axi-ink-plain">{f.owner}/{f.repo}</span>
                                <button onClick={() => void addFound(f)} disabled={busy} aria-label={`Add ${f.owner}/${f.repo}`} className={BTN}>Add</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
                {mode !== 'list' && <button onClick={() => onModeChange('list')} aria-label="Back to site list" className={BTN}>Back</button>}
                <button onClick={() => onModeChange('create')} aria-pressed={mode === 'create'} className={BTN}>+ Create new site</button>
                <button onClick={() => onModeChange('existing')} aria-pressed={mode === 'existing'} className={BTN}>Use existing repo…</button>
                <button onClick={() => onModeChange('find')} aria-pressed={mode === 'find'} className={BTN}>Find my sites</button>
            </div>
            {note && <div className={`mt-3 text-xs ${note.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>{note.text}</div>}
        </div>
    );
};
