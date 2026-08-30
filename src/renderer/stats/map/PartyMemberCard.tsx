import React, { useMemo } from 'react';
import { getProfessionIconPath } from '../../classIconUtils';
import commanderTagRaw from '../../../../public/svg/commander_tag.svg?raw';
const COMMANDER_TAG_URI = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(commanderTagRaw)))}`;

import { hpAt, statusAt, activeBoons, activeSkillsAt, memberSpec } from './partyMemberHelpers';
import type { MemberStatus } from './partyMemberHelpers';
import type { SquadMemberMovement } from '../../../shared/movementData';
import { isReplayCondition } from '../../../shared/replayBuffs';

interface PartyMemberCardProps {
    member: SquadMemberMovement;
    timeMs: number;
    boonIcons: Record<number, { name: string; icon: string }>;
    skillIcons: Record<number, { name: string; icon: string }>;
    onFollow?: (key: string) => void;
    isFollowed?: boolean;
}

function hpColor(hp: number, status: MemberStatus): string {
    if (status === 'dead') return '#64748b';
    if (status === 'down') return '#f97316';
    if (hp >= 60) return '#4ade80';
    if (hp >= 30) return '#fbbf24';
    return '#f87171';
}

function barColor(status: MemberStatus): string {
    if (status === 'dead') return '#7f1d1d';
    if (status === 'down') return '#9a3412';
    return '#22c55e';
}

const BuffIcon: React.FC<{
    id: number;
    stacks: number;
    icons: Record<number, { name: string; icon: string }>;
    borderColor: string;
}> = ({ id, stacks, icons, borderColor }) => {
    const icon = icons[id];
    if (!icon?.icon) return null;
    return (
        <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
            <img src={icon.icon} alt={icon.name} title={`${icon.name}${stacks > 1 ? ` ×${stacks}` : ''}`}
                 width={18} height={18}
                 style={{ display: 'block', width: 18, height: 18, objectFit: 'contain', borderRadius: 3, border: `1px solid ${borderColor}` }} />
            {stacks > 1 && (
                <span style={{
                    position: 'absolute', bottom: 0, right: 0,
                    fontSize: 7, fontWeight: 700, lineHeight: '9px',
                    background: 'rgba(0,0,0,0.8)', color: '#fff',
                    padding: '0 2px', borderRadius: '2px 0 3px 0',
                    minWidth: 9, textAlign: 'center', pointerEvents: 'none',
                }}>
                    {stacks}
                </span>
            )}
        </div>
    );
};

export const PartyMemberCard: React.FC<PartyMemberCardProps> = ({
    member, timeMs, boonIcons, skillIcons, onFollow, isFollowed,
}) => {
    const hp = useMemo(() => hpAt(member, timeMs), [member, timeMs]);
    const status = useMemo(() => statusAt(member, timeMs), [member, timeMs]);
    const buffs = useMemo(() => activeBoons(member, timeMs), [member, timeMs]);
    const boons = useMemo(() => buffs.filter(b => !isReplayCondition(b.id)), [buffs]);
    const condis = useMemo(() => buffs.filter(b => isReplayCondition(b.id)), [buffs]);
    const skillIds = useMemo(() => activeSkillsAt(member, timeMs), [member, timeMs]);

    const spec = memberSpec(member);
    // Same catalog lookup the cast icon does, so the two can never disagree
    // about which skill is being shown.
    const castName = isFollowed && status !== 'dead'
        ? skillIcons[skillIds[0]]?.name || null
        : null;
    const statusSuffix = status === 'down' ? ' · DOWN' : status === 'dead' ? ' · DEAD' : '';
    const statusColor = status === 'down' ? 'var(--status-warning)' : status === 'dead' ? 'var(--status-error)' : 'var(--text-secondary)';

    return (
        <button
            type="button"
            onClick={() => onFollow?.(member.account || member.name)}
            style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '4px 7px', borderRadius: 4, margin: '1px 0',
                background: isFollowed ? 'var(--status-info-bg)' : 'var(--bg-input)',
                border: `1px solid ${isFollowed ? 'var(--status-info)' : 'transparent'}`,
                cursor: 'pointer',
            }}
        >
            {/* Row 1: icon + name + hp + cast icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ position: 'relative', flexShrink: 0, width: 20, height: 20 }}>
                    <img
                        src={getProfessionIconPath(spec) ?? undefined}
                        alt={spec}
                        width={20}
                        height={20}
                        // The class SVGs are not square (Elementalist is 46×76mm)
                        // and only the HTML width/height attributes do not pin an
                        // <img>'s box: a portrait icon renders ~39px tall and
                        // spills out of this 24px slot onto the HP bar below.
                        style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: '50%', display: 'block' }}
                    />
                    {member.isCommander && (
                        <img
                            data-cmd-tag
                            src={COMMANDER_TAG_URI}
                            alt="Commander"
                            width={13}
                            height={13}
                            style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', display: 'block' }}
                        />
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name}
                    </div>
                    <div style={{ fontSize: 9, color: statusColor }}>
                        {spec}{statusSuffix}
                    </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: hpColor(hp, status), flexShrink: 0, width: 32, textAlign: 'right' }}>
                    {status === 'dead' ? '—' : `${Math.round(hp)}%`}
                </div>
                <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                    {(() => {
                        if (status === 'dead') return null;
                        const icon = skillIcons[skillIds[0]];
                        if (!icon?.icon) return null;
                        return (
                            <img src={icon.icon} alt={icon.name} title={icon.name}
                                 width={20} height={20}
                                 style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 3, border: '1px solid var(--status-info-border)', background: 'var(--status-info-bg)' }} />
                        );
                    })()}
                </div>
            </div>

            {/* HP bar */}
            <div style={{ height: 3, background: 'var(--border-subtle)', borderRadius: 2, marginBottom: 3, overflow: 'hidden' }}>
                <div style={{ width: `${status === 'dead' ? 0 : hp}%`, height: '100%', background: barColor(status), borderRadius: 2 }} />
            </div>

            {/* The cast icon above carries its name only in a title tooltip, which
                costs a hover to read. The followed card spells it out instead —
                and only the followed card: one player is followed at a time, so
                this adds a line to one card rather than to all fifty. No
                placeholder when idle, or a followed player's card would twitch
                a row taller and shorter between every cast. */}
            {castName && (
                <div data-cast-name style={{
                    fontSize: 9, lineHeight: '11px', marginBottom: 3,
                    color: 'var(--status-info)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {castName}
                </div>
            )}

            {/* Buff row: boons, a hairline divider, then conditions */}
            <div data-buff-row style={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: 18, flexWrap: 'wrap' }}>
                {status !== 'dead' && (
                    <>
                        <span data-cluster="boons" style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {boons.map(b => (
                                <BuffIcon key={b.id} id={b.id} stacks={b.stacks} icons={boonIcons} borderColor="var(--border-hover)" />
                            ))}
                        </span>
                        {boons.length > 0 && condis.length > 0 && (
                            <span data-buff-divider style={{ width: 1, height: 14, background: 'var(--border-default)', flexShrink: 0, margin: '0 1px' }} />
                        )}
                        <span data-cluster="condis" style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {condis.map(c => (
                                <BuffIcon key={c.id} id={c.id} stacks={c.stacks} icons={boonIcons} borderColor="rgba(248,113,113,0.55)" />
                            ))}
                        </span>
                    </>
                )}
            </div>
        </button>
    );
};

export default PartyMemberCard;
