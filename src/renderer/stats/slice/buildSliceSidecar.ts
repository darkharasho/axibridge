import { IncrementalAggregator } from '../incrementalAggregation';
import { hashAggregationSettings, type FightRosterEntry } from '../statsStore';
import { statsLogKey } from '../utils/statsLogKey';
import { SLICE_SIDECAR_VERSION, type SliceSidecar, type SliceFrame } from './sliceTypes';

/**
 * Build the published report's slice sidecar: one pre-finalize frame per fight.
 *
 * Frames are ordered to match `roster`, not `logs` — the roster is the frozen
 * publish order the viewer's ordinals address, and `mergeFightRoster` sorts it
 * oldest-first while `logs` arrives in whatever order the session produced.
 * `frames[i]` therefore corresponds to `fights[i]` (== `roster[i]` restricted to
 * entries with a matching log), which is what lets the viewer address a fight
 * purely by its position in the array.
 *
 * A roster entry with no matching log (e.g. a log that was pruned after the
 * roster was built) is skipped rather than emitting a hole — `fights` and
 * `frames` always stay in lockstep and index-aligned.
 *
 * Cost is one fresh single-log aggregation per fight (~23ms each), which is
 * noise next to the upload it precedes.
 */
export function buildSliceSidecar({ logs, roster, mvpWeights, statsViewSettings, disruptionMethod }: {
    logs: any[];
    roster: FightRosterEntry[];
    mvpWeights: any;
    statsViewSettings: any;
    disruptionMethod: any;
}): SliceSidecar {
    const logsByKey = new Map<string, any>();
    logs.forEach((log, index) => logsByKey.set(statsLogKey(log, index), log));

    const fights: FightRosterEntry[] = [];
    const frames: SliceFrame[] = [];
    roster.forEach((entry) => {
        const log = logsByKey.get(entry.id);
        if (!log) return;
        const solo = new IncrementalAggregator({ mvpWeights, statsViewSettings, disruptionMethod });
        solo.ingestLog(log);
        fights.push(entry);
        frames.push(solo.exportFrame());
    });

    return {
        version: SLICE_SIDECAR_VERSION,
        settingsHash: hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod),
        fights,
        frames,
    };
}
