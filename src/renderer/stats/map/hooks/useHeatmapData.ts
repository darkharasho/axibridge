import { useMemo } from 'react';
import type { ReplayFightPayload } from '../replayTypes';
import { positionAtTime } from '../../../../shared/movementData';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const GRID = 128;

export interface HeatmapRaster {
    buffer: Float32Array;
    size: [number, number];
    max: number;
}

type Mode = 'off' | 'deaths' | 'time' | 'damage-taken';

const cache = new Map<string, HeatmapRaster>();

function hpAt(member: SquadMemberMovement, timeMs: number): number {
    const series = member.healthPercents;
    if (!series?.length) return 100;
    let hp = 100;
    for (const [t, v] of series) {
        if (t > timeMs) break;
        hp = v;
    }
    return hp;
}

function bucket(x: number, y: number, width: number, height: number): number | null {
    if (width <= 0 || height <= 0) return null;
    const bx = Math.floor((x / width) * GRID);
    const by = Math.floor((y / height) * GRID);
    if (bx < 0 || bx >= GRID || by < 0 || by >= GRID) return null;
    return by * GRID + bx;
}

function buildRaster(fight: ReplayFightPayload, mode: Exclude<Mode, 'off'>): HeatmapRaster {
    const buffer = new Float32Array(GRID * GRID);
    const width = fight.mapSize?.[0] ?? 600;
    const height = fight.mapSize?.[1] ?? 600;
    const { pollingRate } = fight.movementData;
    const allies = fight.movementData.members.filter(m => !m.isEnemy && m.inSquad);

    if (mode === 'deaths') {
        for (const m of allies) {
            for (const [deadAt] of m.deadRanges) {
                const pos = positionAtTime(m, deadAt, pollingRate);
                if (!pos) continue;
                const b = bucket(pos[0], pos[1], width, height);
                if (b !== null) buffer[b] += 1;
            }
        }
    } else if (mode === 'time') {
        const weight = pollingRate / 1000;
        for (const m of allies) {
            for (const pos of m.positions) {
                const b = bucket(pos[0], pos[1], width, height);
                if (b !== null) buffer[b] += weight;
            }
        }
    } else {
        for (const m of allies) {
            if (m.damageTaken1SPerSec?.length) {
                // Preferred path: per-second damage deltas from EI.
                // Each bucket i covers [i*1000, (i+1)*1000) ms — look up the
                // player position at the midpoint of that second.
                for (let i = 0; i < m.damageTaken1SPerSec.length; i++) {
                    const dmg = m.damageTaken1SPerSec[i];
                    if (dmg <= 0) continue;
                    const tMs = (i + 0.5) * 1000;
                    const pos = positionAtTime(m, tMs, pollingRate);
                    if (!pos) continue;
                    const b = bucket(pos[0], pos[1], width, height);
                    if (b !== null) buffer[b] += dmg;
                }
            } else {
                // Fallback: infer damage from HP percentage drops.
                let prevHp = hpAt(m, 0);
                for (let i = 0; i < m.positions.length; i++) {
                    // absolute time of sample i — the track starts at the
                    // member's own firstPoll, not at t=0
                    const t = (i + (m.firstPoll || 0)) * pollingRate;
                    const hp = hpAt(m, t);
                    const drop = Math.max(0, prevHp - hp);
                    prevHp = hp;
                    if (drop <= 0) continue;
                    const pos = m.positions[i];
                    const b = bucket(pos[0], pos[1], width, height);
                    if (b !== null) buffer[b] += drop;
                }
            }
        }
    }

    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] > max) max = buffer[i];
    }
    return { buffer, size: [GRID, GRID], max };
}

export function useHeatmapData(fight: ReplayFightPayload | null, mode: Mode): HeatmapRaster | null {
    return useMemo(() => {
        if (!fight || mode === 'off') return null;
        const key = `${fight.fightId}|${mode}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const raster = buildRaster(fight, mode);
        cache.set(key, raster);
        return raster;
    }, [fight, mode]);
}

export function __clearHeatmapCache() {
    cache.clear();
}
