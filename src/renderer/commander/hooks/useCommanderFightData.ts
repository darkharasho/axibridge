import { useCallback, useMemo, useRef, useState } from 'react';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { DPSReportJSON } from '../../../shared/dpsReportTypes';

const LRU_LIMIT = 10;

export function useCommanderFightData(logs: ILogData[]) {
  const hydrated = useMemo(
    () =>
      logs
        .filter((l) => l.details != null)
        .slice()
        .sort((a, b) => (b.uploadTime ?? 0) - (a.uploadTime ?? 0)),
    [logs],
  );

  const mostRecentId = hydrated[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = selectedId ?? mostRecentId;

  const cacheRef = useRef<Map<string, CommanderFightData>>(new Map());

  const fight = useMemo(() => {
    if (!effectiveId) return null;
    const cached = cacheRef.current.get(effectiveId);
    if (cached) return cached;
    const log = hydrated.find((l) => l.id === effectiveId);
    if (!log?.details) return null;
    const data = computeCommanderFightData(log.details as unknown as DPSReportJSON);
    cacheRef.current.set(effectiveId, data);
    if (cacheRef.current.size > LRU_LIMIT) {
      const first = cacheRef.current.keys().next().value;
      if (first) cacheRef.current.delete(first);
    }
    return data;
  }, [effectiveId, hydrated]);

  const availableFights = useMemo(
    () =>
      hydrated.map((l) => ({
        id: l.id,
        label: `${
          l.uploadTime
            ? new Date(l.uploadTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—'
        } · ${l.fightName ?? l.fightLabel ?? 'Fight'}`,
      })),
    [hydrated],
  );

  const selectFight = useCallback((id: string) => setSelectedId(id), []);

  return { fight, selectedFightId: effectiveId, availableFights, selectFight };
}
