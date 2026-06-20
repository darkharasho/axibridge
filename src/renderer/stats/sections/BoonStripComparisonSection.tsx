import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { Eraser, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

export type BoonStripMode = 'strips' | 'generation';

export type BoonStripPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    outgoing: number;
    incoming: number;
};

export const buildBoonStripChartData = (fights: any[], mode: BoonStripMode): BoonStripPoint[] => {
    const list = Array.isArray(fights) ? fights : [];
    return list.map((fight: any, idx: number) => {
        const outgoing = mode === 'generation'
            ? Number(fight?.totalBoonsGenerated || 0)
            : Number(fight?.totalOutgoingStrips || 0);
        return {
            index: idx,
            fightId: fight?.id || `fight-${idx}`,
            shortLabel: `F${idx + 1}`,
            fullLabel: `${fight?.mapName || fight?.label || 'Unknown'} • ${fight?.duration || '--:--'}`,
            isWin: typeof fight?.isWin === 'boolean' ? fight.isWin : null,
            outgoing,
            incoming: -Math.abs(Number(fight?.totalIncomingStrips || 0)),
        };
    });
};
