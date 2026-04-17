import { useMemo } from 'react';
import type { ReplayFightPayload } from '../replayTypes';

const LRU_LIMIT = 3;
const lru: string[] = [];

function bumpLru(fightId: string) {
    const idx = lru.indexOf(fightId);
    if (idx >= 0) lru.splice(idx, 1);
    lru.push(fightId);
    while (lru.length > LRU_LIMIT) lru.shift();
}

export function useMovementData(
    fights: ReplayFightPayload[] | undefined,
    selectedFightId: string | null,
): ReplayFightPayload | null {
    return useMemo(() => {
        if (!fights?.length || !selectedFightId) return null;
        const hit = fights.find(f => f.fightId === selectedFightId) ?? null;
        if (hit) bumpLru(hit.fightId);
        return hit;
    }, [fights, selectedFightId]);
}
