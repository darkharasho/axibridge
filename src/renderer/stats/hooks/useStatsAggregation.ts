import { useMemo } from 'react';
import { computeStatsAggregation } from '../computeStatsAggregation';
import type { DisruptionMethod, IMvpWeights, IStatsViewSettings } from '../../global.d';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
}

export const useStatsAggregation = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }: UseStatsAggregationProps) => {
    return useMemo(
        () => computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }),
        [logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod]
    );
};
