import { useContext, useMemo } from 'react';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import type { DPSReportJSON } from '../../../shared/dpsReportTypes';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';

export interface CommanderRollup {
  fightCount: number;
  spanMs: number;
  kills: number;
  squadDeaths: number;
  ratio: number;
  squadAliveAvgPct: number;
  avgDurationSec: number;
  outnumberedCount: number;
  alivePctSeries: number[];
}

export function useCommanderRollup(logs: ILogData[]): CommanderRollup | null {
  const cache = useContext(DetailsCacheContext);

  return useMemo(() => {
    const hydrated: DPSReportJSON[] = [];
    for (const log of logs) {
      const inline = log.details;
      const cached = inline ?? cache?.peek(log.id);
      if (cached) hydrated.push(cached as unknown as DPSReportJSON);
    }
    if (hydrated.length === 0) return null;

    const datas = hydrated.map((d) => computeCommanderFightData(d));

    const kills = datas.reduce((a, d) => a + d.outcome.kills, 0);
    const squadDeaths = datas.reduce((a, d) => a + d.outcome.squadDeaths, 0);
    const totalAlivePct = datas.reduce(
      (a, d) => a + d.survival.squadAliveAtEnd / Math.max(1, d.survival.squadTotal),
      0,
    );
    const totalDuration = datas.reduce((a, d) => a + d.duration, 0);
    const outnumbered = datas.filter((d) => d.matchup.effectiveRatio < 1).length;
    const alivePctSeries = datas.map(
      (d) => d.survival.squadAliveAtEnd / Math.max(1, d.survival.squadTotal),
    );
    const spanMs =
      datas.length >= 2 ? datas[datas.length - 1].startedAt - datas[0].startedAt : 0;

    return {
      fightCount: datas.length,
      spanMs,
      kills,
      squadDeaths,
      ratio: kills / Math.max(1, squadDeaths),
      squadAliveAvgPct: totalAlivePct / datas.length,
      avgDurationSec: totalDuration / datas.length,
      outnumberedCount: outnumbered,
      alivePctSeries,
    };
  }, [logs, cache]);
}
