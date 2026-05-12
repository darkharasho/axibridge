import { useContext, useMemo, useRef } from 'react';
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

/** The minimal slice of CommanderFightData the rollup actually needs.
 *  Computed once per log id and cached so repeated parent re-renders
 *  don't re-run computeCommanderFightData on every cached log. */
interface RollupContribution {
  kills: number;
  squadDeaths: number;
  alivePct: number;
  duration: number;
  outnumbered: boolean;
  startedAt: number;
}

function computeRollupContribution(details: DPSReportJSON): RollupContribution {
  // We still go through computeCommanderFightData to keep parity with the
  // per-fight view (same kills/deaths/alive accounting). The narrow return
  // type documents what the rollup actually consumes; the per-second series
  // and detector outputs are discarded.
  const d = computeCommanderFightData(details);
  return {
    kills: d.outcome.kills,
    squadDeaths: d.outcome.squadDeaths,
    alivePct: d.survival.squadAliveAtEnd / Math.max(1, d.survival.squadTotal),
    duration: d.duration,
    outnumbered: d.matchup.effectiveRatio < 1,
    startedAt: d.startedAt,
  };
}

export function useCommanderRollup(logs: ILogData[]): CommanderRollup | null {
  const cache = useContext(DetailsCacheContext);
  const contribCache = useRef<Map<string, RollupContribution>>(new Map());

  return useMemo(() => {
    const contributions: RollupContribution[] = [];
    for (const log of logs) {
      const inline = log.details;
      const cached = inline ?? cache?.peek(log.id);
      if (!cached) continue;

      let contrib = contribCache.current.get(log.id);
      if (!contrib) {
        contrib = computeRollupContribution(cached as unknown as DPSReportJSON);
        contribCache.current.set(log.id, contrib);
      }
      contributions.push(contrib);
    }
    if (contributions.length === 0) return null;

    const kills = contributions.reduce((a, c) => a + c.kills, 0);
    const squadDeaths = contributions.reduce((a, c) => a + c.squadDeaths, 0);
    const totalAlivePct = contributions.reduce((a, c) => a + c.alivePct, 0);
    const totalDuration = contributions.reduce((a, c) => a + c.duration, 0);
    const outnumbered = contributions.filter((c) => c.outnumbered).length;
    const alivePctSeries = contributions.map((c) => c.alivePct);
    const spanMs =
      contributions.length >= 2
        ? contributions[contributions.length - 1].startedAt - contributions[0].startedAt
        : 0;

    return {
      fightCount: contributions.length,
      spanMs,
      kills,
      squadDeaths,
      ratio: kills / Math.max(1, squadDeaths),
      squadAliveAvgPct: totalAlivePct / contributions.length,
      avgDurationSec: totalDuration / contributions.length,
      outnumberedCount: outnumbered,
      alivePctSeries,
    };
  }, [logs, cache]);
}
