import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { useSquadDerived } from './hooks/useSquadDerived';
import type { ReplayFightPayload } from './replayTypes';

interface SquadOverlayProps {
    fight: ReplayFightPayload;
    timeMs: number;
}

const PARTY_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa'];

function sampleAtTime<T extends { timeMs: number }>(samples: T[], timeMs: number): T | null {
    if (!samples.length) return null;
    // samples must be sorted ascending by timeMs
    let lo = 0, hi = samples.length - 1, result = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (samples[mid].timeMs <= timeMs) { result = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return result === -1 ? null : samples[result];
}

export const SquadOverlay: React.FC<SquadOverlayProps> = ({ fight, timeMs }) => {
    const layers = useStatsStore(state => state.replayLayers);
    const derived = useSquadDerived(fight);
    const sample = useMemo(() => sampleAtTime(derived.samples, timeMs), [derived.samples, timeMs]);

    const commander = useMemo(
        () => fight.movementData.members.find(m => m.isCommander && m.inSquad) ?? null,
        [fight.movementData.members],
    );

    const commanderPos = useMemo(() => {
        if (!commander?.positions.length) return null;
        const idx = Math.min(commander.positions.length - 1, Math.floor(timeMs / fight.movementData.pollingRate));
        return commander.positions[idx];
    }, [commander, timeMs, fight.movementData.pollingRate]);

    const ringRadii = useMemo(() => {
        const inch = fight.movementData.inchToPixel ?? 1;
        return { near: 600 * inch, far: 1200 * inch };
    }, [fight.movementData.inchToPixel]);

    return (
        <g className="replay-squad-overlay">
            {layers.partyHulls && sample && (
                <g data-overlay="party-hulls">
                    {Object.entries(sample.partyHulls).map(([partyStr, hull]) => {
                        const party = Number(partyStr);
                        const color = PARTY_COLORS[(party - 1) % PARTY_COLORS.length];
                        const points = hull.map(p => `${p[0]},${p[1]}`).join(' ');
                        return (
                            <polygon key={party}
                                points={points}
                                fill={color}
                                fillOpacity={0.08}
                                stroke={color}
                                strokeOpacity={0.4}
                                strokeWidth={1}
                            />
                        );
                    })}
                </g>
            )}

            {layers.centroidSpread && sample && (
                <g data-overlay="centroid">
                    <circle cx={sample.centroid[0]} cy={sample.centroid[1]} r={sample.spread}
                            fill="#fbbf24" fillOpacity={0.05}
                            stroke="#fbbf24" strokeOpacity={0.5} strokeWidth={1} />
                    <circle cx={sample.centroid[0]} cy={sample.centroid[1]} r={3} fill="#fbbf24" />
                </g>
            )}

            {layers.tagRangeRings && commanderPos && (
                <g data-overlay="tag-rings">
                    <circle cx={commanderPos[0]} cy={commanderPos[1]} r={ringRadii.near}
                            fill="none" stroke="#60a5fa" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="4 2" />
                    <circle cx={commanderPos[0]} cy={commanderPos[1]} r={ringRadii.far}
                            fill="none" stroke="#60a5fa" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="4 2" />
                </g>
            )}
        </g>
    );
};

export default SquadOverlay;
