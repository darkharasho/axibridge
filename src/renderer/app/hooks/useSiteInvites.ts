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

    useEffect(() => {
        mountedRef.current = true;
        void window.electronAPI?.getPendingSiteInvites?.()
            .then((res) => {
                if (mountedRef.current && res?.success) setInvites((res.invites ?? []).filter((i) => !i.dismissed));
            })
            .catch(() => { /* the banner is optional; Settings still lists invites */ });
        return () => { mountedRef.current = false; };
    }, []);

    const join = useCallback(async (id: number) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        try {
            const res = await window.electronAPI.acceptSiteInvite({ invitationId: id });
            if (!mountedRef.current) return;
            if (res?.success && res.target) {
                setInvites((prev) => prev.filter((i) => i.id !== id));
                setJoined(res.target);
            } else {
                setError(res?.error || 'Failed to join site.');
            }
        } catch (err) {
            if (mountedRef.current) setError(err instanceof Error && err.message ? err.message : 'Failed to join site.');
        } finally {
            busyRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    }, []);

    const dismiss = useCallback(async (id: number) => {
        setInvites((prev) => prev.filter((i) => i.id !== id));
        try {
            await window.electronAPI.dismissSiteInvite({ invitationId: id });
        } catch {
            // Hidden for this session either way; the next load re-lists it.
        }
    }, []);

    const clear = useCallback(() => { setJoined(null); setError(null); }, []);

    return { invites, joined, error, busy, join, dismiss, clear };
};
