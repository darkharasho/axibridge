import React, { useMemo } from 'react';
import { getProfessionIconPath } from '../../classIconUtils';
import commanderTagRaw from '../../../../public/svg/commander_tag.svg?raw';
const COMMANDER_TAG_URI = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(commanderTagRaw)))}`;

import { hpAt, statusAt, activeBoons, activeSkillsAt } from './partyMemberHelpers';
import type { MemberStatus } from './partyMemberHelpers';
import type { SquadMemberMovement } from '../../../shared/movementData';

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

export const PartyMemberCard: React.FC<PartyMemberCardProps> = ({
    member, timeMs, boonIcons, skillIcons, onFollow, isFollowed,
}) => {
    const hp = useMemo(() => hpAt(member, timeMs), [member, timeMs]);
    const status = useMemo(() => statusAt(member, timeMs), [member, timeMs]);
    const boons = useMemo(() => activeBoons(member, timeMs), [member, timeMs]);
    const skillIds = useMemo(() => activeSkillsAt(member, timeMs), [member, timeMs]);

    const specLabel = member.eliteSpec
        ? String(member.eliteSpec)
        : member.profession;
    const statusSuffix = status === 'down' ? ' · DOWN' : status === 'dead' ? ' · DEAD' : '';
    const statusColor = status === 'down' ? 'var(--status-warning)' : status === 'dead' ? 'var(--status-error)' : 'var(--text-secondary)';

    return (
        <button
            type="button"
            onClick={() => onFollow?.(member.account || member.name)}
            style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 4, margin: '1px 4px',
                background: isFollowed ? 'var(--status-info-bg)' : 'var(--bg-input)',
                border: `1px solid ${isFollowed ? 'var(--status-info)' : 'transparent'}`,
                cursor: 'pointer',
            }}
        >
            {/* Row 1: icon + name + hp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ position: 'relative', flexShrink: 0, width: 24, height: 24 }}>
                    <img
                        src={getProfessionIconPath(member.profession) ?? undefined}
                        alt={member.profession}
                        width={24}
                        height={24}
                        style={{ borderRadius: '50%', display: 'block' }}
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
                        {specLabel}{statusSuffix}
                    </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: hpColor(hp, status), flexShrink: 0, width: 32, textAlign: 'right' }}>
                    {status === 'dead' ? '—' : `${Math.round(hp)}%`}
                </div>
            </div>

            {/* HP bar */}
            <div style={{ height: 3, background: 'var(--border-subtle)', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                <div style={{ width: `${status === 'dead' ? 0 : hp}%`, height: '100%', background: barColor(status), borderRadius: 2 }} />
            </div>

            {/* Row 2: active boons with stack count badge */}
            {status !== 'dead' && boons.length > 0 && (
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 3 }}>
                    {boons.map(({ id, stacks }) => {
                        const icon = boonIcons[id];
                        if (!icon?.icon) return null;
                        return (
                            <div key={id} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                                <img src={icon.icon} alt={icon.name} title={`${icon.name}${stacks > 1 ? ` ×${stacks}` : ''}`}
                                     width={22} height={22}
                                     style={{ display: 'block', borderRadius: 3, border: '1px solid var(--border-hover)' }} />
                                {stacks > 1 && (
                                    <span style={{
                                        position: 'absolute', bottom: 0, right: 0,
                                        fontSize: 7, fontWeight: 700, lineHeight: '10px',
                                        background: 'rgba(0,0,0,0.8)', color: '#fff',
                                        padding: '0 2px', borderRadius: '2px 0 3px 0',
                                        minWidth: 10, textAlign: 'center', pointerEvents: 'none',
                                    }}>
                                        {stacks}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Row 3: skill cast slot — always reserves 20px so the card height stays stable */}
            <div style={{ height: 20, display: 'flex', alignItems: 'center' }}>
                {(() => {
                    if (status === 'dead') return null;
                    const id = skillIds[0];
                    if (!id) return null;
                    const icon = skillIcons[id];
                    if (!icon?.icon) return null;
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                            <img src={icon.icon} alt={icon.name} title={icon.name}
                                 width={18} height={18}
                                 style={{ flexShrink: 0, borderRadius: 3, border: '1px solid var(--status-info-border)', background: 'var(--status-info-bg)' }} />
                            <span style={{ fontSize: 9, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {icon.name}
                            </span>
                        </div>
                    );
                })()}
            </div>
        </button>
    );
};

export default PartyMemberCard;
