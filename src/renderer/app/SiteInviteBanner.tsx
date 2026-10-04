import { UserPlus } from 'lucide-react';
import type { ISiteInvite, ISiteJoinTarget } from '../global.d';

type Props = {
    invites: ISiteInvite[];
    joined: ISiteJoinTarget | null;
    error: string | null;
    /** A join is in flight; disables the buttons. */
    busy?: boolean;
    onJoin: (id: number) => void;
    onDismiss: (id: number) => void;
    onClose: () => void;
};

/**
 * "{inviter} invited you to publish to {owner/repo}" — the invitee's half of
 * shared publishing. Join accepts the GitHub invite and adds the site as a
 * publish target; Dismiss only hides it here (Settings still lists it).
 */
export const SiteInviteBanner = ({ invites, joined, error, busy = false, onJoin, onDismiss, onClose }: Props) => {
    if (invites.length === 0 && !joined && !error) return null;
    return (
        <div className="mb-3 axi-well axi-well--sm flex items-start gap-3" data-testid="site-invite-banner">
            <UserPlus className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--axi-accent)' }} />
            <div className="flex-1 space-y-2">
                {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-3">
                        <p className="text-[11px]" style={{ color: 'var(--axi-text)' }}>
                            {invite.inviter} invited you to publish to <span className="font-semibold">{invite.fullName}</span>
                        </p>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => onJoin(invite.id)} disabled={busy} aria-label={`Join ${invite.fullName}`} className="axi-btn axi-btn--sm axi-ink-plain axi-edge-rule">Join</button>
                            <button onClick={() => onDismiss(invite.id)} disabled={busy} aria-label={`Dismiss ${invite.fullName}`} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">Dismiss</button>
                        </div>
                    </div>
                ))}
                {joined && (
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] axi-ink-ok">
                            You can now publish to {joined.fullName}.{joined.madeDefault ? ' It is your default site.' : ' Pick it from the publish menu.'}
                        </p>
                        <button onClick={onClose} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">OK</button>
                    </div>
                )}
                {error && (
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] axi-ink-danger">{error}</p>
                        <button onClick={onClose} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">OK</button>
                    </div>
                )}
            </div>
        </div>
    );
};
