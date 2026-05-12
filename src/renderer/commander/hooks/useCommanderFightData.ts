import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { DPSReportJSON } from '../../../shared/dpsReportTypes';
import { useLogDetails } from '../../cache/useLogDetails';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';
import { buildFightLabelV2, computeFightAvgPosition } from '../../stats/utils/labelUtils';

const LRU_LIMIT = 10;

type Status = 'idle' | 'loading' | 'loaded' | 'error';

interface UseCommanderFightDataResult {
  fight: CommanderFightData | null;
  fightLabel: string;
  status: Status;
  selectedFightId: string | null;
  availableFights: Array<{ id: string; label: string }>;
  selectFight: (id: string) => void;
}

const HYDRATABLE: ReadonlySet<string> = new Set(['available', 'loaded']);

function fightLabelForDetails(details: unknown, fallbackZone: string): string {
  return buildFightLabelV2({
    zone: fallbackZone,
    avgPosition: details ? computeFightAvgPosition(details) : null,
  });
}

export function useCommanderFightData(logs: ILogData[]): UseCommanderFightDataResult {
  const cache = useContext(DetailsCacheContext);

  const candidates = useMemo(
    () =>
      logs
        .filter((l) => l.details != null || HYDRATABLE.has(l.detailsStatus))
        .slice()
        .sort((a, b) => (b.uploadTime ?? 0) - (a.uploadTime ?? 0)),
    [logs],
  );

  const mostRecentId = candidates[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = selectedId ?? mostRecentId;

  const selectedLog = useMemo(
    () => (effectiveId ? candidates.find((l) => l.id === effectiveId) ?? null : null),
    [candidates, effectiveId],
  );

  const needsCacheFetch = effectiveId != null && (selectedLog?.details == null);
  const { details: cachedDetails, status: cacheStatus } = useLogDetails(
    needsCacheFetch ? effectiveId ?? undefined : undefined,
  );

  const resolvedDetails = selectedLog?.details ?? cachedDetails ?? null;

  const cacheRef = useRef<Map<string, CommanderFightData>>(new Map());

  const fight = useMemo(() => {
    if (!effectiveId || !resolvedDetails) return null;
    const cached = cacheRef.current.get(effectiveId);
    if (cached) return cached;
    const data = computeCommanderFightData(resolvedDetails as unknown as DPSReportJSON);
    cacheRef.current.set(effectiveId, data);
    if (cacheRef.current.size > LRU_LIMIT) {
      const first = cacheRef.current.keys().next().value;
      if (first) cacheRef.current.delete(first);
    }
    return data;
  }, [effectiveId, resolvedDetails]);

  const fightLabel = useMemo(() => {
    if (!fight) return '';
    return fightLabelForDetails(resolvedDetails, fight.map);
  }, [fight, resolvedDetails]);

  const status: Status = !effectiveId
    ? 'idle'
    : fight
      ? 'loaded'
      : needsCacheFetch
        ? cacheStatus
        : 'loading';

  const availableFights = useMemo(
    () =>
      candidates.map((l) => {
        const inline = l.details;
        const cached = inline ?? cache?.peek(l.id);
        const label = fightLabelForDetails(cached, l.fightName ?? l.fightLabel ?? 'Fight');
        return {
          id: l.id,
          label: `${
            l.uploadTime
              ? new Date(l.uploadTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'
          } · ${label}`,
        };
      }),
    [candidates, cache],
  );

  const selectFight = useCallback((id: string) => setSelectedId(id), []);

  return { fight, fightLabel, status, selectedFightId: effectiveId, availableFights, selectFight };
}
