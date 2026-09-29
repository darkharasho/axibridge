import { useCallback, useEffect, useState } from 'react';
import { Cloud, Check, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';

import type { CloudflareAccountOption, CloudflareStatus } from '../global.d';

// ─── "Sign in with Cloudflare" ────────────────────────────────────────────────
//
// One grant replaces the five hand-copied credential fields below it. The manual
// fields stay: they are still the only way to point R2 at a custom domain, and
// the only route if a grant cannot be made.

type Phase = 'idle' | 'connecting' | 'choosing' | 'provisioning';

interface Props {
    /** Lets the parent re-read R2 status after a connect or disconnect. */
    onChanged?: () => void;
}

// Not `.axi-notice`: that is a page-level banner at panel weight with a block,
// and its tone modifiers only tint the icon and the bold run inside it. This is a
// status strip inside a settings card, so it is a reading-scale well wearing a
// status edge — which is rule 5's own answer for saying status on an outlined
// thing. The tinted fills it replaces (`bg-emerald-400/5`, `bg-amber-400/5`) were
// rule 2 exactly: a colour at partial opacity over the ground.
const Panel = ({ children, tone }: { children: React.ReactNode; tone: 'neutral' | 'good' | 'bad' }) => (
    <div
        className={`axi-well axi-well--sm mb-4 ${
            tone === 'good' ? 'axi-edge-ok' : tone === 'bad' ? 'axi-edge-warn' : ''
        }`}
        style={{ '--axi-well-pad': '12px 14px' } as React.CSSProperties}
    >
        {children}
    </div>
);

export function CloudflareConnect({ onChanged }: Props) {
    const [status, setStatus] = useState<CloudflareStatus | null>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [accounts, setAccounts] = useState<CloudflareAccountOption[]>([]);
    const [error, setError] = useState<{ message: string; helpUrl?: string } | null>(null);
    const [adopted, setAdopted] = useState(false);

    const refresh = useCallback(() => {
        window.electronAPI?.getCloudflareStatus?.()
            .then(setStatus)
            .catch(() => setStatus(null));
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    // A sign-in waits on a browser the user may simply abandon. Leaving Settings
    // has to release the loopback listener, or the next attempt finds the port
    // taken by the previous one.
    useEffect(() => () => { window.electronAPI?.cancelCloudflareOAuth?.(); }, []);

    const applyResult = useCallback((result: Awaited<ReturnType<NonNullable<typeof window.electronAPI.startCloudflareOAuth>>>) => {
        if (!result.success) {
            // A cancellation is the user's own decision — saying "failed" would
            // be wrong, so it just returns the panel to its resting state.
            setError(result.cancelled ? null : { message: result.error, helpUrl: result.helpUrl });
            setPhase('idle');
            return;
        }
        if (result.needsAccountChoice) {
            setAccounts(result.accounts);
            setPhase('choosing');
            return;
        }
        setStatus(result.status);
        setAdopted(Boolean(result.adoptedExisting));
        setAccounts([]);
        setPhase('idle');
        onChanged?.();
    }, [onChanged]);

    const connect = useCallback(async () => {
        setError(null);
        setAdopted(false);
        setPhase('connecting');
        try {
            const result = await window.electronAPI?.startCloudflareOAuth?.();
            if (result) applyResult(result);
            else setPhase('idle');
        } catch (err) {
            setError({ message: (err as Error)?.message || 'Cloudflare sign-in failed.' });
            setPhase('idle');
        }
    }, [applyResult]);

    const chooseAccount = useCallback(async (account: CloudflareAccountOption) => {
        setError(null);
        setPhase('provisioning');
        try {
            const result = await window.electronAPI?.selectCloudflareAccount?.({
                accountId: account.id,
                accountName: account.name,
            });
            if (result) applyResult(result);
            else setPhase('idle');
        } catch (err) {
            setError({ message: (err as Error)?.message || 'Cloudflare provisioning failed.' });
            setPhase('idle');
        }
    }, [applyResult]);

    const disconnect = useCallback(async () => {
        setError(null);
        setAdopted(false);
        await window.electronAPI?.disconnectCloudflare?.();
        setPhase('idle');
        refresh();
        onChanged?.();
    }, [refresh, onChanged]);

    if (!status) return null;

    if (!status.clientConfigured) {
        // Nothing the user can do about it, so no button to press.
        return null;
    }

    const busy = phase === 'connecting' || phase === 'provisioning';

    if (status.connected) {
        return (
            <Panel tone="good">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold axi-ink-ok">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            Connected to Cloudflare
                            {status.accountName ? <span className="axi-ink-dim font-normal">— {status.accountName}</span> : null}
                        </p>
                        <p className="mt-1 text-[11px] axi-ink-dim truncate">
                            Bucket <span className="axi-ink-dim">{status.bucketName}</span> at{' '}
                            <code className="axi-code">{status.publicUrl}</code>
                        </p>
                        {adopted && (
                            <p className="mt-1 text-[11px] axi-ink-faint">
                                That bucket already existed on your account, so it was reused rather than created.
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={disconnect}
                        className="axi-btn axi-btn--xs shrink-0 axi-edge-rule axi-ink-dim"
                    >
                        Disconnect
                    </button>
                </div>
                <p className="mt-2.5 text-[11px] axi-ink-faint">
                    Disconnecting revokes AxiBridge&apos;s access. Your bucket and everything already published stay exactly as they are.
                </p>
            </Panel>
        );
    }

    // Keyed on the list, not the phase: provisioning a chosen account must keep
    // the picker on screen so the spinner sits next to what the user clicked.
    if (accounts.length > 0) {
        return (
            <Panel tone="neutral">
                <p className="text-xs font-semibold axi-ink-plain mb-2">Which Cloudflare account should AxiBridge use?</p>
                <div className="space-y-1.5">
                    {accounts.map((account) => (
                        <button
                            key={account.id}
                            type="button"
                            disabled={busy}
                            onClick={() => chooseAccount(account)}
                            className="w-full rounded-[4px] border axi-edge-rule px-3 py-1.5 text-left text-xs axi-ink-plain hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
                        >
                            {account.name}
                        </button>
                    ))}
                </div>
                {phase === 'provisioning' && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] axi-ink-dim">
                        <Loader2 className="w-3 h-3 animate-spin" /> Setting up the bucket&hellip;
                    </p>
                )}
            </Panel>
        );
    }

    return (
        <Panel tone="neutral">
            <p className="text-xs font-semibold axi-ink-plain mb-1">Connect Cloudflare and skip the setup below</p>
            <p className="text-[11px] axi-ink-dim mb-3">
                AxiBridge creates the bucket, turns on its public URL, and fills in all five fields for you. It asks
                only for permission to manage R2 — it cannot read your other Cloudflare settings.
            </p>
            <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="axi-btn axi-btn--sm axi-edge-meta axi-ink-meta disabled:opacity-60"
            >
                {busy
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for your browser&hellip;</>
                    : <><Cloud className="w-3.5 h-3.5" /> Sign in with Cloudflare</>}
            </button>
            {busy && (
                <p className="mt-2 text-[11px] axi-ink-faint">
                    A Cloudflare page opened in your browser. Approve the request there, then come back.
                </p>
            )}
            {error && (
                <div className="mt-3 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 axi-ink-warn mt-px" />
                    <p className="text-[11px] axi-ink-warn">
                        {error.message}
                        {error.helpUrl && (
                            <>
                                {' '}
                                <a
                                    href={error.helpUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 axi-ink-meta underline underline-offset-2"
                                >
                                    Open the Cloudflare dashboard <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            </>
                        )}
                    </p>
                </div>
            )}
        </Panel>
    );
}
