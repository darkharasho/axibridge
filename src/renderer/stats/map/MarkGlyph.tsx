import React from 'react';
import { recolorCommanderTag } from '../../../shared/squadMarkers';
import commanderTagRaw from '../../../../public/svg/commander_tag.svg?raw';
import { markDef, type ReplayMarkKind } from './replayMarks';

const svgDataUri = (svg: string) =>
    `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

/** Built once: the glyph renders per marked member per frame. */
let tagUri: string | null = null;
const markTagUri = () => {
    if (!tagUri) tagUri = svgDataUri(recolorCommanderTag(commanderTagRaw, markDef('tag').color));
    return tagUri;
};

const starPoints = (r: number) => Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
}).join(' ');

/**
 * A manual mark, centred on 0,0 with radius `r`, in whatever units the parent
 * draws in. `tag` reuses the commander tag art (in the mark colour) so a marked
 * enemy tag reads as a tag at a glance; the shapes are outlined in near-black
 * so they hold up over both light and dark map tiles.
 */
export const MarkGlyph: React.FC<{ kind: ReplayMarkKind; r: number }> = ({ kind, r }) => {
    const { color } = markDef(kind);
    const stroke = { stroke: '#0b0f1a', strokeWidth: r * 0.18, strokeLinejoin: 'round' as const };
    switch (kind) {
        case 'tag':
            return <image href={markTagUri()} x={-r} y={-r} width={r * 2} height={r * 2} />;
        case 'circle':
            return <circle cx={0} cy={0} r={r * 0.8} fill={color} {...stroke} />;
        case 'square':
            return <rect x={-r * 0.72} y={-r * 0.72} width={r * 1.44} height={r * 1.44} fill={color} {...stroke} />;
        case 'triangle':
            return <polygon points={`0,${-r * 0.9} ${r * 0.9},${r * 0.7} ${-r * 0.9},${r * 0.7}`} fill={color} {...stroke} />;
        case 'star':
            return <polygon points={starPoints(r)} fill={color} {...stroke} />;
    }
};

export default MarkGlyph;
