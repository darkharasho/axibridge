import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_COMMANDER_THRESHOLDS,
  type CommanderThresholds,
} from '../../../shared/commanderThresholds';

export function useCommanderThresholds() {
  const [thresholds, setThresholds] = useState<CommanderThresholds>(DEFAULT_COMMANDER_THRESHOLDS);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      ?.getSettings?.()
      .then((s: any) => {
        if (cancelled || !s?.commanderThresholds) return;
        setThresholds({ ...DEFAULT_COMMANDER_THRESHOLDS, ...s.commanderThresholds });
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<CommanderThresholds>) => {
    setThresholds((prev) => {
      const next: CommanderThresholds = { ...prev, ...patch };
      try {
        (window.electronAPI as any)?.saveSettings?.({ commanderThresholds: next });
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setThresholds(DEFAULT_COMMANDER_THRESHOLDS);
    try {
      (window.electronAPI as any)?.saveSettings?.({
        commanderThresholds: DEFAULT_COMMANDER_THRESHOLDS,
      });
    } catch {
      /* ignore */
    }
  }, []);

  return { thresholds, update, reset };
}
