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

/**
 * Linearly interpolate between the two bracketing position samples for smooth
 * movement.
 *
 * `pollFrac` is ABSOLUTE (polls since the fight started); `positions[0]` sits
 * at the member's own `firstPoll`, so that offset has to come off first — see
 * `SquadMemberMovement.firstPoll`, and `replaySelectors.sampleAt`, which
 * already does this for hit-testing. Without it a member who joined 128 polls
 * in was drawn wherever they stood ~38s later, while the down/death circles
 * (which go through `positionAtTime`, and do subtract it) stayed correct — so
 * icon and circle disagreed, which reads as the marks lagging the players.
 */
export function sampleAt(member: SquadMemberMovement, pollFrac: number): [number, number] | null {
    const { positions } = member;
    if (!positions.length) return null;
    const rel = pollFrac - (member.firstPoll || 0);
    // Before the member's own track starts there is nothing to draw. Clamping
    // to `positions[0]` instead is what produced a permanent interpolate/reset
    // twitch on every not-yet-spawned enemy: `lo` pinned to 0, but `t` stayed a
    // valid fraction that swept 0 -> 1 once per poll, so the icon lerped
    // positions[0] -> positions[1] and snapped back forever, ~3x a second.
    if (rel < 0) return null;
    const lo = Math.max(0, Math.min(Math.floor(rel), positions.length - 1));
    const t = rel - Math.floor(rel);
    if (t <= 0 || lo >= positions.length - 1) return positions[lo];
    const a = positions[lo];
    const b = positions[lo + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * End of the most recent absence (death or despawn) that has already finished
 * by `timeMs`, or null if the member has been present continuously.
 *
 * Trails are clipped at this instant. arcdps emits no position events at all
 * while a player is dead or gone and resumes at the respawn point, so the
 * samples either side of an absence are not a path the player walked — drawing
 * a trail across the gap streaks a line from where the body fell to wherever
 * they waypointed to, which is the "ran back over the desert" artifact.
 */
export function lastAbsenceEnd(member: SquadMemberMovement, timeMs: number): number | null {
    let best: number | null = null;
    for (const ranges of [member.deadRanges, member.dcRanges]) {
        for (const [, end] of ranges ?? []) {
            if (end <= timeMs && (best === null || end > best)) best = end;
        }
    }
    return best;
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
    /** Draw members who are currently dead. When false they are omitted
     *  entirely and counted by the graveyard tally instead. */
    showDead: boolean;
    /** Fight poll interval in ms, for converting an absence end back to a
     *  track index when clipping trails. */
    pollingRate: number;
    /** `account || name` of the followed member, or null. */
    followKey: string | null;
    onHover: (info: MemberHoverInfo) => void;
    onLeave: () => void;
}

export const MemberLayer: React.FC<MemberLayerProps> = ({
    members, pollFrac, pollIndex, timeMs, scale, spotlightParty, showDead, pollingRate, followKey, onHover, onLeave,
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
            // A despawned member is not in the instance; nothing to draw, and
            // no toggle brings them back because there is no body to look at.
            if (inAnyRange(member.dcRanges ?? [], timeMs)) return null;
            const isDead = inAnyRange(member.deadRanges, timeMs);
            if (isDead && !showDead) return null;
            const isDown = !isDead && inAnyRange(member.downRanges, timeMs);
            const dim = spotlightParty !== null && !member.isEnemy && member.group !== spotlightParty;
            // `pollIndex` is absolute; slice the member's own array relative
            // to their `firstPoll`, the same correction `sampleAt` makes.
            const relIndex = pollIndex - (member.firstPoll || 0);
            // Never let a trail reach back across a death or a despawn — see
            // `lastAbsenceEnd`. `ceil` so the floor lands on the first poll at
            // or after the member was back, never on the last sample before.
            const resumedAt = lastAbsenceEnd(member, timeMs);
            const trailFloor = resumedAt === null || pollingRate <= 0
                ? 0
                : Math.max(0, Math.ceil(resumedAt / pollingRate) - (member.firstPoll || 0));
            const slice = (back: number) => (isDead || relIndex < 0
                ? []
                : member.positions.slice(Math.max(0, trailFloor, relIndex - back), relIndex + 1));
            const trail = slice(20);
            const recent = slice(5);
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
            // The radius the icon is ACTUALLY drawn at — enemies render 25%
            // smaller. Hoisted out of the enemy branch because the downed
            // cross has to match the art beneath it; sized off `iconR` it
            // overhangs an enemy icon by a third and reads as a marker of its
            // own rather than a state on that player.
            const drawnR = member.isEnemy && !member.isCommander ? iconR * 0.75 : iconR;
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
                                const er = drawnR; // enemies 25% smaller than allies
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
                        {/* Downed indicator: orange cross over the icon.
                            Drawn for enemies too — a downed enemy is the single
                            most actionable state on the map, and leaving it to
                            the hover tooltip alone meant you had to already
                            suspect it to find it. Sized off `drawnR` so it fits
                            the smaller enemy icon. */}
                        {isDown && (
                            <>
                                <line x1={-drawnR * 0.55} y1={0} x2={drawnR * 0.55} y2={0} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                                <line x1={0} y1={-drawnR * 0.55} x2={0} y2={drawnR * 0.55} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                            </>
                        )}
                    </g>
                </g>
            );
        })}
    </>
);

export default MemberLayer;
