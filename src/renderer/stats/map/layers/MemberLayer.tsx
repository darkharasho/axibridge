import React from 'react';
import { getProfessionIconPath } from '../../../classIconUtils';
import { memberSpec } from '../partyMemberHelpers';
import { orderMembersForRender } from '../replaySelectors';
import { recolorCommanderTag } from '../../../../shared/squadMarkers';
import commanderTagRaw from '../../../../../public/svg/commander_tag.svg?raw';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const svgDataUri = (svg: string) =>
    `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
const COMMANDER_TAG_URI = svgDataUri(commanderTagRaw);

/**
 * One data URI per tag colour, built once. Recolouring inside the render loop
 * would re-base64 the whole SVG for every commander on every frame.
 */
const tagUriCache = new Map<string, string>();
const commanderTagUri = (color?: string) => {
    if (!color) return COMMANDER_TAG_URI;
    let uri = tagUriCache.get(color);
    if (!uri) {
        uri = svgDataUri(recolorCommanderTag(commanderTagRaw, color));
        tagUriCache.set(color, uri);
    }
    return uri;
};

/** Return true if timeMs falls within any of the given [startMs, endMs] ranges. */
function inAnyRange(ranges: [number, number][], timeMs: number): boolean {
    return ranges.some(([start, end]) => timeMs >= start && timeMs < end);
}

/** Linearly interpolate between the two bracketing position samples for smooth movement. */
export function sampleAt(member: SquadMemberMovement, pollFrac: number): [number, number] | null {
    const { positions } = member;
    if (!positions.length) return null;
    const lo = Math.max(0, Math.min(Math.floor(pollFrac), positions.length - 1));
    const t = pollFrac - Math.floor(pollFrac);
    if (t === 0 || lo >= positions.length - 1) return positions[lo];
    const a = positions[lo];
    const b = positions[lo + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export interface MemberHoverInfo {
    name: string;
    account: string;
    status: 'down' | 'dead' | null;
    clientX: number;
    clientY: number;
}

export interface MemberLayerProps {
    members: SquadMemberMovement[];
    pollFrac: number;
    pollIndex: number;
    timeMs: number;
    scale: number;
    spotlightParty: number | null;
    /** `account || name` of the followed member, or null. */
    followKey: string | null;
    onHover: (info: MemberHoverInfo) => void;
    onLeave: () => void;
}

export const MemberLayer: React.FC<MemberLayerProps> = ({
    members, pollFrac, pollIndex, timeMs, scale, spotlightParty, followKey, onHover, onLeave,
}) => (
    <>
        <defs>
            {/* Tints the icon toward red by boosting the red channel and suppressing green/blue */}
            <filter id="enemy-tint" colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values="
                    1.2  0.1  0.1  0  0.15
                    0    0.1  0    0  0
                    0    0    0.1  0  0
                    0    0    0    1  0
                " />
            </filter>
        </defs>
        {orderMembersForRender(members.filter(m => m.inSquad || m.isEnemy)).map(member => {
            const pos = sampleAt(member, pollFrac);
            if (!pos) return null;
            const isDead = inAnyRange(member.deadRanges, timeMs);
            const isDown = !isDead && inAnyRange(member.downRanges, timeMs);
            const dim = spotlightParty !== null && !member.isEnemy && member.group !== spotlightParty;
            const trail = isDead ? [] : member.positions.slice(Math.max(0, pollIndex - 20), pollIndex + 1);
            const recent = isDead ? [] : member.positions.slice(Math.max(0, pollIndex - 5), pollIndex + 1);
            const trailStr = trail.map(p => `${p[0]},${p[1]}`).join(' ');
            const recentStr = recent.map(p => `${p[0]},${p[1]}`).join(' ');
            const color = member.isEnemy ? '#ef4444' : member.isCommander ? '#fbbf24' : '#60a5fa';
            const isFollow = !!followKey && (member.account || member.name) === followKey;
            // All sizes are divided by `scale` so they stay a constant pixel
            // size on screen regardless of zoom level.
            const s = scale;
            const sw = 1 / s;           // 1px stroke
            const sw15 = 1.5 / s;       // 1.5px stroke
            // iconR is in screen-pixel units (the scale(1/s) counter-transform
            // on the icon group makes it render at exactly iconR*2 px).
            // We shrink it slightly as zoom increases so icons don't crowd
            // the map when zoomed in — from 20px at s=1 to ~14px at s=50.
            const iconR = Math.max(7, 10 - Math.log2(Math.max(1, s)) * 0.5);
            const ringR = 16 / s;        // follow ring radius

            // Base opacity: dead = very dim, down = half, enemies dim slightly, spotlight dim = faint
            const baseOpacity = isDead ? 0.12 : isDown ? 0.45 : dim ? 0.2 : member.isEnemy ? 0.75 : 1;

            return (
                <g
                    key={member.id}
                    data-member-id={member.id}
                    opacity={baseOpacity}
                    onMouseEnter={(e) => onHover({
                        name: member.name,
                        account: member.account,
                        status: isDead ? 'dead' : isDown ? 'down' : null,
                        clientX: e.clientX,
                        clientY: e.clientY,
                    })}
                    onMouseLeave={onLeave}
                >
                    {/* Movement trail — hidden while dead */}
                    {trail.length > 1 && <polyline points={trailStr} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={sw} strokeDasharray={`${2 / s} ${2 / s}`} />}
                    {recent.length > 1 && <polyline points={recentStr} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={sw15} />}
                    {/* Follow ring */}
                    {isFollow && <circle cx={pos[0]} cy={pos[1]} r={ringR} fill="none" stroke="#fbbf24" strokeWidth={sw15} strokeOpacity={0.8} />}
                    {/* Member icon — rendered in a counter-scaled group so the
                        <image> element always has fixed 20×20 local dimensions.
                        Without this, sub-pixel dimensions at high zoom cause
                        browsers to silently skip rendering the image. */}
                    <g data-member-icon transform={`translate(${pos[0]} ${pos[1]}) scale(${1 / s})`}>
                        {member.isCommander ? (
                            // Commanders: just the commander tag SVG, no profession icon,
                            // recoloured to the tag colour they actually ran.
                            <image
                                href={commanderTagUri(member.tagColor)}
                                x={-iconR} y={-iconR}
                                width={iconR * 2} height={iconR * 2}
                            />
                        ) : member.isEnemy ? (
                            (() => {
                                const iconSrc = getProfessionIconPath(memberSpec(member));
                                const er = iconR * 0.75; // enemies 25% smaller than allies
                                return iconSrc
                                    ? <image href={iconSrc} x={-er} y={-er} width={er * 2} height={er * 2} filter="url(#enemy-tint)" />
                                    : <circle cx={0} cy={0} r={er} fill="#ef4444" opacity={0.8} />;
                            })()
                        ) : (
                            (() => {
                                const iconSrc = getProfessionIconPath(memberSpec(member));
                                return iconSrc
                                    ? <image href={iconSrc} x={-iconR} y={-iconR} width={iconR * 2} height={iconR * 2} />
                                    : <circle cx={0} cy={0} r={iconR} fill="#60a5fa" opacity={0.9} />;
                            })()
                        )}
                        {/* Overhead squad marker (Arrow, Circle, ...), above the
                            icon so it reads as an overhead marker does in game and
                            never covers the profession art or the downed cross.
                            Drawn for commanders too: a tag says who leads, a marker
                            is a separate assignment they can also carry. */}
                        {member.squadMarker && (
                            <image
                                href={member.squadMarker.icon}
                                x={-iconR * 0.6}
                                y={-iconR * 2.2}
                                width={iconR * 1.2}
                                height={iconR * 1.2}
                            >
                                <title>{member.squadMarker.label}</title>
                            </image>
                        )}
                        {/* Downed indicator: orange cross over the icon */}
                        {isDown && !member.isEnemy && (
                            <>
                                <line x1={-iconR * 0.55} y1={0} x2={iconR * 0.55} y2={0} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                                <line x1={0} y1={-iconR * 0.55} x2={0} y2={iconR * 0.55} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                            </>
                        )}
                    </g>
                </g>
            );
        })}
    </>
);

export default MemberLayer;
