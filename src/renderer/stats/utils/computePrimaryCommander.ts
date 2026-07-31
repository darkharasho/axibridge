/** Most-frequent commander across a session's logs: votes keyed by account (name fallback),
 *  one per log per account; ties broken alphabetically by first-seen display name.
 *  Returns '' when nobody tagged. */
export const computePrimaryCommander = (detailsList: any[]): string => {
    const votes = new Map<string, number>(); // voteKey -> vote count
    const displayNames = new Map<string, string>(); // voteKey -> first-seen display name

    detailsList.forEach((details) => {
        const players = (details?.players || []) as any[];
        const seenThisLog = new Set<string>(); // track vote keys seen in this log

        players.forEach((player) => {
            if (player?.notInSquad) return;
            if (!player?.hasCommanderTag) return;

            // Vote key is account first, then name; skip if neither
            const voteKey = player?.account || player?.name;
            if (!voteKey) return;

            // Track first-seen display name for this vote key
            if (!displayNames.has(voteKey)) {
                const displayName = player?.name || player?.account || 'Unknown';
                displayNames.set(voteKey, displayName);
            }

            // One vote per key per log
            if (seenThisLog.has(voteKey)) return;
            seenThisLog.add(voteKey);
            votes.set(voteKey, (votes.get(voteKey) || 0) + 1);
        });
    });

    let best = '';
    let bestCount = 0;

    Array.from(votes.entries())
        .sort((a, b) => {
            const displayA = displayNames.get(a[0]) || 'Unknown';
            const displayB = displayNames.get(b[0]) || 'Unknown';
            return displayA.localeCompare(displayB);
        })
        .forEach(([key, count]) => {
            if (count > bestCount) {
                best = displayNames.get(key) || 'Unknown';
                bestCount = count;
            }
        });

    return best;
};
