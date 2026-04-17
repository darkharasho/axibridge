import { useEffect, useRef } from 'react';
import { useStatsStore } from '../../statsStore';

interface UseReplayPlaybackArgs {
    durationMs: number;
}

export function useReplayPlayback({ durationMs }: UseReplayPlaybackArgs) {
    const lastTimestampRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const tick = (timestamp: number) => {
            const { replayPlayhead, setReplayPlayhead } = useStatsStore.getState();
            if (!replayPlayhead.playing) {
                lastTimestampRef.current = null;
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            const last = lastTimestampRef.current;
            lastTimestampRef.current = timestamp;
            if (last === null) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            const delta = (timestamp - last) * replayPlayhead.speed;
            const next = replayPlayhead.timeMs + delta;
            if (next >= durationMs) {
                setReplayPlayhead({ timeMs: durationMs, playing: false });
            } else {
                setReplayPlayhead({ timeMs: next });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            lastTimestampRef.current = null;
        };
    }, [durationMs]);
}
