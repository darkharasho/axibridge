import type { FightRosterEntry } from '../statsStore';
import { resolveFightCommander } from './fightCommander';

/**
 * Project the aggregator's per-fight squad composition onto the slicer's roster
 * shape.
 *
 * Extracted from `StatsView` so the projection is testable on its own — the
 * roster is what the tray renders, what ordinals address, and (via
 * `buildSliceSidecar`) what the published report ships, so a silent change here
 * is felt in three places at once.
 *
 * `fullLabel` wins over `mapName` and `label` on purpose: the aggregator
 * overwrites `label` with an "F1" ordinal, which the tray's "filter by map or
 * landmark" box could never match.
 */
export const toFightRosterEntries = (fights: any[]): FightRosterEntry[] =>
    (Array.isArray(fights) ? fights : []).map((fight: any) => ({
        id: String(fight.id),
        label: String(fight.fullLabel || fight.mapName || fight.label || ''),
        timestamp: Number(fight.timestamp || 0),
        duration: String(fight.duration || ''),
        isWin: fight.isWin,
        enemyClassCounts: fight.enemyClassCounts,
        commander: resolveFightCommander(fight),
    }));
