import { useEffect, useState, type CSSProperties } from 'react';
import type { ISiteInvite, ISiteJoinTarget } from '../global.d';

/**
 * Every pending invite to an AxiBridge site — including ones dismissed from
 * the dashboard banner — so a dismissal is never a dead end.
 */
export const PendingSiteInvites = ({ onJoined }: { onJoined: (target: ISiteJoinTarget) => void }) => {
    const [invites, setInvites] = useState<ISiteInvite[]>([]);
    const [joiningId, setJoiningId] = useState<number | null>(null);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    useEffect(() => {
        void window.electronAPI?.getPendingSiteInvites?.({ force: true }).then((res) => {
            if (res?.success) setInvites(res.invites ?? []);
        });
    }, []);

    if (invites.length === 0 && !message) return null;

    const join = async (invite: ISiteInvite) => {
        if (joiningId !== null) return;
        setJoiningId(invite.id);
        let res;
        try {
            res = await window.electronAPI.acceptSiteInvite({ invitationId: invite.id });
        } catch (err) {
            res = { success: false, error: err instanceof Error ? err.message : undefined } as const;
        } finally {
            setJoiningId(null);
        }
        if (res?.success && res.target) {
            setInvites((prev) => prev.filter((i) => i.id !== invite.id));
            onJoined(res.target);
            setMessage({ kind: 'ok', text: `You can now publish to ${res.target.fullName}.` });
        } else {
            setMessage({ kind: 'error', text: res?.error || 'Failed to join site.' });
        }
    };

    return (
        <div className="axi-well axi-well--sm mb-4" style={{ '--axi-well-pad': '16px' } as CSSProperties} data-testid="pending-site-invites">
            <div className="text-xs uppercase tracking-widest axi-ink-faint mb-3">Site invites</div>
            <ul className="space-y-1">
                {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm">
                        <span><span className="axi-ink-plain">{i.fullName}</span> <span className="text-xs axi-ink-faint">from {i.inviter}</span></span>
                        <button onClick={() => void join(i)} disabled={joiningId !== null} aria-label={`Join ${i.fullName}`} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">
                            Join
                        </button>
                    </li>
                ))}
            </ul>
            {message && <div className={`mt-3 text-xs ${message.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>{message.text}</div>}
        </div>
    );
};
