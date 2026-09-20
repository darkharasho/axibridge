import { pruneCombatReplayData } from './detailsProcessing';

/**
 * The demote step: remove replay payloads from an already-shared report.
 *
 * This is the byte-stripping half of budget-driven retention. `shareRetention`
 * decides WHICH reports to demote; this decides what "demoted" physically means
 * to the bytes, and `shareReclaim` re-uploads the result.
 *
 * Deliberately NOT `pruneDetailsForStats(details, { keepReplayPositions: false })`,
 * even though that function drops exactly the same replay payloads. It also
 * applies `TOP_LEVEL_DENY`/`PLAYER_DENY`, denylists tuned for what the in-app
 * stats pipeline reads — a strictly smaller surface than the share viewer, which
 * renders every section. Reusing it would silently blank sections of an already
 * published report the first time retention touched it, and the user would have
 * no way back: the full bytes are gone by then.
 *
 * What goes, and why it is the right two-thirds:
 * - `native.blocks.replay.tracks` — the per-sample position tracks, the single
 *   largest block in a native report.
 * - `players[]`/`targets[]` `combatReplayData.positions` — EI's shape of the
 *   same measurement. Dropping one while keeping the other would reclaim almost
 *   nothing, since they restate each other (see `PruneDetailsOptions`).
 *
 * What stays: the `start`/`down`/`dead` intervals on every actor. They are three
 * numbers each, not a payload, and revive tracking plus the down/death timeline
 * read them — deleting the container outright is what once marked logs as having
 * no revive data at all.
 *
 * Pure: returns a new object, never mutates `details`, because the caller's copy
 * is the live in-app one.
 */
export const stripShareReplay = (details: any): any => {
    if (!details || typeof details !== 'object') return details;

    const out: any = { ...details };

    const nativeReplay = out.native?.blocks?.replay;
    if (nativeReplay?.tracks) {
        const { tracks: _dropped, ...rest } = nativeReplay;
        out.native = {
            ...out.native,
            blocks: { ...out.native.blocks, replay: rest }
        };
    }

    if (Array.isArray(out.players)) {
        out.players = out.players.map((player: any) => {
            if (!player?.combatReplayData) return player;
            return { ...player, combatReplayData: pruneCombatReplayData(player.combatReplayData, false) };
        });
    }

    if (Array.isArray(out.targets)) {
        out.targets = out.targets.map((target: any) => {
            if (!target?.combatReplayData) return target;
            return { ...target, combatReplayData: pruneCombatReplayData(target.combatReplayData, false) };
        });
    }

    return out;
};
