/**
 * Serializes currently loaded ILogData[] into a compact system prompt.
 * Details live in DetailsCache (not on log.details), so the caller
 * passes a peek function that does a synchronous cache lookup.
 * This runs in the renderer — raw log data never crosses the IPC boundary.
 */
export function buildChatContext(logs: ILogData[], getDetails: (id: string) => any | undefined): string {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');
    if (loaded.length === 0) {
        return [
            'You are an AI assistant for Guild Wars 2 players using AxiBridge.',
            'No fight data is currently loaded — the user may ask general GW2/WvW questions.',
        ].join('\n');
    }

    const lines: string[] = [
        'You are an AI assistant helping Guild Wars 2 players analyze their World vs World fight data.',
        `The user has ${loaded.length} fight(s) currently loaded in AxiBridge. You have real data — use it.`,
        '',
    ];

    loaded.forEach((log, i) => {
        const details = getDetails(log.id) ?? getDetails(log.filePath);
        const name = log.fightName ?? details?.fightName ?? 'Unknown fight';
        const duration = log.encounterDuration ?? details?.encounterDuration ?? '?';
        const isWin = log.dashboardSummary?.isWin ?? (details?.success as boolean | undefined);
        const outcome = isWin === true ? 'Win' : isWin === false ? 'Loss' : 'Unknown';

        lines.push(`Fight ${i + 1}: ${name} | Duration: ${duration} | Outcome: ${outcome}`);

        if (log.dashboardSummary) {
            const s = log.dashboardSummary;
            lines.push(`  Squad: ${s.squadCount} players, ${s.squadDeaths} deaths | Enemy: ${s.enemyCount}, ${s.enemyDeaths} deaths`);
        }

        const players: any[] = details?.players;
        if (players?.length > 0) {
            lines.push('  Players:');
            for (const p of players.slice(0, 20)) {
                const playerName = p.character_name || p.display_name || p.name || '?';
                const prof = p.profession ?? p.professionName ?? 'Unknown';
                const dmg = p.totalDamageCount ?? p.dpsTargets?.[0]?.[0]?.dps ?? 0;
                const deaths = p.defenses?.[0]?.deadCount ?? 0;
                lines.push(`    ${playerName} (${prof}) — DMG: ${(dmg as number).toLocaleString()}, Deaths: ${deaths}`);
            }
        }
        lines.push('');
    });

    lines.push('Answer concisely. Reference specific players and numbers from the data above.');
    return lines.join('\n');
}
