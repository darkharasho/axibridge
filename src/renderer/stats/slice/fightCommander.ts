/**
 * The commander who led one fight, for the slicer's commander filter.
 *
 * Reads the per-fight squad composition the aggregator already emits
 * (`squadCompByFight[].parties[].players[].isCommander`, written by
 * `IncrementalAggregator.processSquadComp`), so this adds no new computation
 * and no new pass over log details.
 *
 * The tie-break when several players tagged up is alphabetical by character
 * name. That is not arbitrary: for a single log every tagged player gets
 * exactly one vote in `computePrimaryCommanderIdentity`, whose ties resolve
 * alphabetically by display name — so a fight's commander in the slicer tray
 * is the same one the report header names.
 */
export const resolveFightCommander = (fight: any): string | undefined => {
    const parties = Array.isArray(fight?.parties) ? fight.parties : [];
    let best: string | undefined;
    parties.forEach((party: any) => {
        const players = Array.isArray(party?.players) ? party.players : [];
        players.forEach((player: any) => {
            if (!player?.isCommander) return;
            const name = String(player?.characterName || '');
            if (!name) return;
            if (best === undefined || name.localeCompare(best) < 0) best = name;
        });
    });
    return best;
};
