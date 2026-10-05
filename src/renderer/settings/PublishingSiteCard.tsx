import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { inferredPagesUrl, type ISiteDetails, type SiteRole } from '../../shared/githubSites';

export type SitePanelMode = 'list' | 'create' | 'existing' | 'find';

export const roleLabel = (role: SiteRole | null | undefined): string | null =>
    role === 'admin' ? 'you: admin' : role === 'publisher' ? 'you: publisher' : role === 'none' ? 'no access' : null;

type Props = {
    owner: string | null;
    repo: string | null;
    details: ISiteDetails | null;
    inviteCount: number;
    /** The site list is showing; the Switch site bar then closes it. */
    panelOpen?: boolean;
    onOpenPanel: (mode: SitePanelMode) => void;
    onClosePanel?: () => void;
    children?: ReactNode;
};

const WELL = { '--axi-well-pad': '16px' } as CSSProperties;

/** The owner's GitHub avatar, or their initial in a ruled box until it loads. */
export const SiteAvatar = ({ owner, url, size }: { owner: string; url?: string | null; size: 'sm' | 'md' }) => {
    const box = size === 'md' ? 'w-9 h-9 rounded-md text-sm' : 'w-5 h-5 rounded text-[10px]';
    return url
        ? <img src={url} alt="" className={`${box} shrink-0`} style={{ objectFit: 'cover' }} />
        : <span className={`${box} shrink-0 border axi-edge-rule axi-ink-faint flex items-center justify-center uppercase`} aria-hidden="true">{owner.charAt(0)}</span>;
};

/** Where reports publish, who you are there, and (as children) who publishes with you. */
export const PublishingSiteCard = ({ owner, repo, details, inviteCount, panelOpen = false, onOpenPanel, onClosePanel, children }: Props) => {
    const [copied, setCopied] = useState(false);

    if (!owner || !repo) {
        return (
            <div className="axi-well axi-well--sm mb-4" style={WELL} data-testid="publishing-site-card">
                <div className="text-xs uppercase tracking-widest axi-ink-faint mb-2">Publishing to</div>
                <p className="text-sm axi-ink-dim mb-3">No site yet. Reports publish to a GitHub Pages site you own or were invited to.</p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => onOpenPanel('create')} className="axi-btn axi-btn--sm axi-ink-meta axi-edge-meta">Create new site</button>
                    <button onClick={() => onOpenPanel('existing')} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">Use existing repo…</button>
                    <button onClick={() => onOpenPanel('find')} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">Find my sites</button>
                </div>
                {inviteCount > 0 && (
                    <button onClick={() => onOpenPanel('list')} className="mt-3 text-xs axi-ink-accent underline">
                        {inviteCount === 1 ? '1 site invite' : `${inviteCount} site invites`}
                    </button>
                )}
            </div>
        );
    }

    const fullName = `${owner}/${repo}`;
    const pagesUrl = details?.pagesUrl || inferredPagesUrl({ owner, repo });
    const ownerBadge = details?.ownerType === 'Organization' ? `org · ${owner}` : details?.ownerType === 'User' ? 'personal' : null;
    const role = roleLabel(details?.role);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(pagesUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="axi-well axi-well--sm mb-4" style={WELL} data-testid="publishing-site-card">
            <div className="text-xs uppercase tracking-widest axi-ink-faint mb-3">Publishing to</div>
            <div className="flex items-center gap-3">
                <SiteAvatar owner={owner} url={details?.ownerAvatarUrl} size="md" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm axi-ink-plain truncate">{fullName}</div>
                    {(ownerBadge || role) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {ownerBadge && <span className="axi-chip axi-chip--meta">{ownerBadge}</span>}
                            {role && <span className={`axi-chip ${details?.role === 'none' ? '' : 'axi-chip--ok'}`}>{role}</span>}
                        </div>
                    )}
                </div>
            </div>
            <div className="github-pages-url-card flex items-center gap-3 mt-3">
                <span className="github-pages-url-value flex-1 min-w-0 truncate text-xs axi-ink-dim">{pagesUrl}</span>
                <button onClick={() => void copy()} className="axi-btn axi-btn--sm github-pages-url-copy axi-ink-plain axi-edge-rule">
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            {children && <div className="mt-4">{children}</div>}
            <button
                onClick={() => (panelOpen ? onClosePanel?.() : onOpenPanel('list'))}
                aria-expanded={panelOpen}
                aria-label={inviteCount > 0 ? `Switch site (${inviteCount} invites)` : 'Switch site'}
                className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule w-full justify-center mt-4"
            >
                Switch site{inviteCount > 0 ? ` · ${inviteCount}` : ''}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
            </button>
        </div>
    );
};
