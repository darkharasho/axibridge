import { useState, useEffect, useRef, useContext } from 'react';
import { DetailsCacheContext } from './DetailsCacheContext';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

export function useLogDetails(logId: string | undefined): {
    details: any | null;
    status: Status;
} {
    const cache = useContext(DetailsCacheContext);
    const [state, setState] = useState<{ details: any | null; status: Status }>(() => {
        if (!logId || !cache) return { details: null, status: 'idle' };
        const mem = cache.peek(logId);
        if (mem !== undefined) return { details: mem, status: 'loaded' };
        return { details: null, status: 'loading' };
    });
    const activeLogIdRef = useRef(logId);

    useEffect(() => {
        activeLogIdRef.current = logId;

        if (!logId || !cache) {
            setState({ details: null, status: 'idle' });
            return;
        }

        const mem = cache.peek(logId);
        if (mem !== undefined) {
            setState({ details: mem, status: 'loaded' });
            return;
        }

        setState({ details: null, status: 'loading' });
        let cancelled = false;

        cache.get(logId).then((details) => {
            if (cancelled || activeLogIdRef.current !== logId) return;
            if (details) {
                setState({ details, status: 'loaded' });
            } else {
                setState({ details: null, status: 'error' });
            }
        }).catch(() => {
            if (cancelled || activeLogIdRef.current !== logId) return;
            setState({ details: null, status: 'error' });
        });

        return () => { cancelled = true; };
    }, [logId, cache]);

    return state;
}
