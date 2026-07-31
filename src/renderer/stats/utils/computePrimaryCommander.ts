/** Most-frequent commander across a session's logs: counted once per log in
 *  which they had the tag (EI emits duplicate players[] entries per agent
 *  instance), ties broken alphabetically. Returns '' when nobody tagged. */
export const computePrimaryCommander = (detailsList: any[]): string => {
    const counts = new Map<string, number>();
    detailsList.forEach((details) => {
        const players = (details?.players || []) as any[];
        const seenThisLog = new Set<string>();
        players.forEach((player) => {
            if (player?.notInSquad) return;
            if (!player?.hasCommanderTag) return;
            const name = player?.name || player?.account || 'Unknown';
            if (seenThisLog.has(name)) return;
            seenThisLog.add(name);
            counts.set(name, (counts.get(name) || 0) + 1);
        });
    });
    let best = '';
    let bestCount = 0;
    Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([name, count]) => {
            if (count > bestCount) {
                best = name;
                bestCount = count;
            }
        });
    return best;
};
