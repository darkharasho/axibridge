import React, { useCallback, useMemo } from 'react';
import { MapIcon } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import type { ReplayFightPayload } from './replayTypes';

interface FightPickerProps {
    fights: ReplayFightPayload[];
    onSelect?: () => void;
}

function formatShortTime(timestampMs: number): string {
    if (!timestampMs) return '';
    try {
        return new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function Thumbnail({ fight }: { fight: ReplayFightPayload }) {
    const size = fight.mapSize ?? [600, 600];
    const pos = fight.avgPosition ?? [size[0] / 2, size[1] / 2];
    const cropW = size[0] * 0.4;
    const cropH = size[1] * 0.4;
    const viewBox = `${pos[0] - cropW / 2} ${pos[1] - cropH / 2} ${cropW} ${cropH}`;
    return (
        <svg viewBox={viewBox} width={120} height={80} preserveAspectRatio="xMidYMid slice" style={{ borderRadius: 4, background: '#0c1224' }}>
            {fight.mapImageUrl && (
                <image href={fight.mapImageUrl} x={0} y={0} width={size[0]} height={size[1]} preserveAspectRatio="none" />
            )}
            <circle cx={pos[0]} cy={pos[1]} r={Math.max(cropW, cropH) * 0.02} fill="#fbbf24" opacity={0.9} />
            <circle cx={pos[0]} cy={pos[1]} r={Math.max(cropW, cropH) * 0.05} fill="none" stroke="#fbbf24" strokeOpacity={0.4} strokeWidth={Math.max(cropW, cropH) * 0.01} />
        </svg>
    );
}

export const FightPicker: React.FC<FightPickerProps> = ({ fights, onSelect }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);

    const indexById = useMemo(() => {
        const map = new Map<string, number>();
        fights.forEach((f, i) => map.set(f.fightId, i));
        return map;
    }, [fights]);

    const step = useCallback((direction: -1 | 1) => {
        if (!fights.length) return;
        const currentIdx = selectedId && indexById.has(selectedId)
            ? indexById.get(selectedId)!
            : 0;
        const nextIdx = Math.max(0, Math.min(fights.length - 1, currentIdx + direction));
        const next = fights[nextIdx];
        if (next && next.fightId !== selectedId) {
            setSelectedReplayFight(next.fightId);
        }
    }, [fights, indexById, selectedId, setSelectedReplayFight]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    }, [step]);

    if (!fights.length) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 32,
                color: 'var(--text-secondary, #94a3b8)',
                textAlign: 'center',
            }}>
                <MapIcon size={36} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>
                    No replay data available
                </div>
                <div style={{ fontSize: 12, maxWidth: 340, lineHeight: 1.6 }}>
                    Enable <strong style={{ color: 'var(--text-primary, #e2e8f0)' }}>Combat Replay</strong> in{' '}
                    <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>Settings</code>
                    {' › '}
                    <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>EI Parser</code>
                    , then re-upload your logs to generate position data.
                </div>
            </div>
        );
    }

    return (
        <div role="listbox" tabIndex={0} className="replay-picker" onKeyDown={onKeyDown}
             style={{ display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 8, padding: 12, overflowY: 'auto', outline: 'none' }}>
            {fights.map(fight => {
                const active = fight.fightId === selectedId;
                return (
                    <button
                        key={fight.fightId}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => { setSelectedReplayFight(fight.fightId); onSelect?.(); }}
                        className={`replay-picker-card${active ? ' is-active' : ''}`}
                        style={{
                            width: 180, flexShrink: 0, padding: 8, borderRadius: 8,
                            background: active ? 'rgba(96, 165, 250, 0.2)' : 'rgba(255,255,255,0.04)',
                            border: active ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                            textAlign: 'left', cursor: 'pointer',
                        }}
                    >
                        <Thumbnail fight={fight} />
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>{fight.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                            {formatShortTime(fight.timestampMs)} · {fight.squadSize} squad · {fight.kills}K/{fight.deaths}D
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default FightPicker;
