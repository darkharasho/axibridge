import { useCallback, useEffect, useRef, useState } from 'react';
import type { ISiteInvite, ISiteJoinTarget } from '../../global.d';

/** Pending invites to AxiBridge sites, minus ones dismissed from the banner. */
export const useSiteInvites = () => {
    const [invites, setInvites] = useState<ISiteInvite[]>([]);
    const [joined, setJoined] = useState<ISiteJoinTarget | null>(null);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    /** Bumped by every join/dismiss so a slow initial load can't clobber them. */
    const mutationRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;
        const startedAt = mutationRef.current;
        void window.electronAPI?.getPendingSiteInvites?.()
            .then((res) => {
                if (mountedRef.current && mutationRef.current === startedAt && res?.success) setInvites((res.invites ?? []).filter((i) => !i.dismissed));
            })
            .catch(() => { /* the banner is optional; Settings still lists invites */ });
        return () => { mountedRef.current = false; };
    }, []);

    const mutate = useCallback(async (
        id: number,
        call: () => Promise<{ success: boolean; error?: string; target?: ISiteJoinTarget; code?: 'invalid' }>,
        fallback: string,
        onSuccess?: (target?: ISiteJoinTarget) => void
    ) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        try {
            const res = await call();
            mutationRef.current += 1;
            if (!mountedRef.current) return;
            if (res?.success) {
                setInvites((prev) => prev.filter((i) => i.id !== id));
                onSuccess?.(res.target);
            } else {
                // An expired/revoked invite can never succeed; other failures keep the row for a retry.
                if (res?.code === 'invalid') setInvites((prev) => prev.filter((i) => i.id !== id));
                setError(res?.error || fallback);
            }
        } catch (err) {
            if (mountedRef.current) setError(err instanceof Error && err.message ? err.message : fallback);
        } finally {
            busyRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    }, []);

    const join = useCallback(
        (id: number) =>
            mutate(
                id,
                async () => {
                    const res = await window.electronAPI.acceptSiteInvite({ invitationId: id });
                    // A "success" without a target can't be confirmed to the user.
                    return res?.success && !res.target ? { ...res, success: false } : res;
                },
                'Failed to join site.',
                (target) => { if (target) setJoined(target); }
            ),
        [mutate]
    );

    const dismiss = useCallback(
        (id: number) => mutate(id, () => window.electronAPI.dismissSiteInvite({ invitationId: id }), 'Failed to dismiss invite.'),
        [mutate]
    );

    const clear = useCallback(() => { setJoined(null); setError(null); }, []);

    return { invites, joined, error, busy, join, dismiss, clear };
};
