import { useMemo } from 'react';
import { CommanderHeader } from './CommanderHeader';
import { CommanderRollup } from './CommanderRollup';
import { CommanderInsights } from './CommanderInsights';
import { CommanderGrid } from './CommanderGrid';
import { CommanderEmptyState } from './CommanderEmptyState';
import { CommanderProcessingBanner } from './CommanderProcessingBanner';
import { useCommanderFightData } from './hooks/useCommanderFightData';
import { useCommanderRollup } from './hooks/useCommanderRollup';
import { useCommanderThresholds } from './hooks/useCommanderThresholds';
import { runAllDetectors } from './detectors';

export function CommanderView({ logs }: { logs: ILogData[] }) {
  const { fight, status, selectedFightId, availableFights, selectFight } = useCommanderFightData(logs);
  const rollup = useCommanderRollup(logs);
  const { thresholds } = useCommanderThresholds();

  const findings = useMemo(
    () => (fight ? runAllDetectors(fight, thresholds) : []),
    [fight, thresholds],
  );

  if (!fight) {
    return (
      <div className="flex flex-col p-4 overflow-auto">
        <CommanderProcessingBanner logs={logs} />
        <CommanderEmptyState status={status} />
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 overflow-auto">
      <CommanderProcessingBanner logs={logs} />
      <CommanderRollup rollup={rollup} />
      <CommanderHeader
        fight={fight}
        availableFights={availableFights}
        selectedFightId={selectedFightId ?? ''}
        onSelectFight={selectFight}
      />
      <CommanderInsights findings={findings} />
      <CommanderGrid fight={fight} thresholds={thresholds} />
    </div>
  );
}
