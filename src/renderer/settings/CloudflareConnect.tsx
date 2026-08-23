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

const Panel = ({ children, tone }: { children: React.ReactNode; tone: 'neutral' | 'good' | 'bad' }) => (
    <div
        className={`mb-4 rounded-[6px] border px-3.5 py-3 ${
            tone === 'good' ? 'border-emerald-400/25 bg-emerald-400/5'
                : tone === 'bad' ? 'border-amber-400/25 bg-amber-400/5'
                    : 'border-white/10 bg-black/20'
        }`}
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
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            Connected to Cloudflare
                            {status.accountName ? <span className="text-gray-400 font-normal">— {status.accountName}</span> : null}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-400 truncate">
                            Bucket <span className="text-gray-300">{status.bucketName}</span> at{' '}
                            <code className="rounded-[3px] border border-white/10 bg-black/40 px-1 text-cyan-300">{status.publicUrl}</code>
                        </p>
                        {adopted && (
                            <p className="mt-1 text-[11px] text-gray-500">
                                That bucket already existed on your account, so it was reused rather than created.
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={disconnect}
                        className="shrink-0 rounded-[4px] border border-white/10 px-2.5 py-1 text-[11px] text-gray-300 hover:border-white/25 hover:text-white"
                    >
                        Disconnect
                    </button>
                </div>
                <p className="mt-2.5 text-[11px] text-gray-500">
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
                <p className="text-xs font-semibold text-gray-200 mb-2">Which Cloudflare account should AxiBridge use?</p>
                <div className="space-y-1.5">
                    {accounts.map((account) => (
                        <button
                            key={account.id}
                            type="button"
                            disabled={busy}
                            onClick={() => chooseAccount(account)}
                            className="w-full rounded-[4px] border border-white/10 px-3 py-1.5 text-left text-xs text-gray-200 hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
                        >
                            {account.name}
                        </button>
                    ))}
                </div>
                {phase === 'provisioning' && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Setting up the bucket&hellip;
                    </p>
                )}
            </Panel>
        );
    }

    return (
        <Panel tone="neutral">
            <p className="text-xs font-semibold text-gray-200 mb-1">Connect Cloudflare and skip the setup below</p>
            <p className="text-[11px] text-gray-400 mb-3">
                AxiBridge creates the bucket, turns on its public URL, and fills in all five fields for you. It asks
                only for permission to manage R2 — it cannot read your other Cloudflare settings.
            </p>
            <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="flex items-center gap-2 rounded-[4px] border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
            >
                {busy
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for your browser&hellip;</>
                    : <><Cloud className="w-3.5 h-3.5" /> Sign in with Cloudflare</>}
            </button>
            {busy && (
                <p className="mt-2 text-[11px] text-gray-500">
                    A Cloudflare page opened in your browser. Approve the request there, then come back.
                </p>
            )}
            {error && (
                <div className="mt-3 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-px" />
                    <p className="text-[11px] text-amber-400">
                        {error.message}
                        {error.helpUrl && (
                            <>
                                {' '}
                                <a
                                    href={error.helpUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 text-cyan-300 underline underline-offset-2"
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
