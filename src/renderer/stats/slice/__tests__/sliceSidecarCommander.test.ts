import { describe, it, expect } from 'vitest';
import { buildSliceSidecar } from '../buildSliceSidecar';
import type { FightRosterEntry } from '../../statsStore';

/**
 * The commander filter works in the published report only because
 * `SliceFightEntry` IS `FightRosterEntry` and `buildSliceSidecar` copies roster
 * entries into `sidecar.fights` — which `reportApp` hands straight to
 * `mergeFightRoster`. That is the whole web-report plumbing, so it needs a test
 * that fails if a future trim step drops the field to save bytes.
 */
describe('buildSliceSidecar commander passthrough', () => {
    const roster: FightRosterEntry[] = [
        { id: 'test-0.zevtc', label: 'Fight 1', timestamp: 1, duration: '1:00', commander: 'Axi Vale' },
        { id: 'test-1.zevtc', label: 'Fight 2', timestamp: 2, duration: '1:00' },
    ];
    const logs = roster.map((entry) => ({
        id: entry.id,
        filePath: entry.id,
        details: { players: [], targets: [], durationMS: 60_000 },
    }));

    it('carries each fight commander through to the published sidecar', () => {
        const sidecar = buildSliceSidecar({
            logs,
            roster,
            mvpWeights: {},
            statsViewSettings: {},
            disruptionMethod: 'default',
        });
        expect(sidecar.fights.map((f) => f.commander)).toEqual(['Axi Vale', undefined]);
    });
});
