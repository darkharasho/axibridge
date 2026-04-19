/**
 * Serializes currently loaded ILogData[] into a compact system prompt.
 * This runs in the renderer — raw log data never crosses the IPC boundary.
 */
export function buildChatContext(logs: ILogData[]): string {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded' && l.details);
    if (loaded.length === 0) {
        return 'No fight data is currently loaded. The user may ask general GW2 questions.';
    }

    const lines: string[] = [
        'You are an AI assistant helping Guild Wars 2 players analyze their World vs World fight data.',
        `The user has ${loaded.length} fight(s) currently loaded in AxiBridge:`,
        '',
    ];

    loaded.forEach((log, i) => {
        const d = log.details!;
        const outcome = d.success ? 'Win' : 'Loss';
        lines.push(`Fight ${i + 1}: ${d.fightName} | Duration: ${d.encounterDuration} | Outcome: ${outcome}`);
        if (log.dashboardSummary) {
            const s = log.dashboardSummary;
            lines.push(`  Squad: ${s.squadCount} players, ${s.squadDeaths} deaths | Enemy: ${s.enemyCount}, ${s.enemyDeaths} deaths`);
        }
        if (d.players && d.players.length > 0) {
            const players = d.players.slice(0, 20); // cap to avoid token bloat
            const playerSummary = players.map(p => {
                const prof = (p as any).profession ?? (p as any).professionName ?? 'Unknown';
                const dmg = (p as any).totalDamageCount ?? (p as any).dpsTargets?.[0]?.[0]?.dps ?? 0;
                const deaths = (p as any).defenses?.[0]?.deadCount ?? 0;
                const playerName = p.character_name || p.display_name;
                return `    ${playerName} (${prof}) — DMG: ${dmg.toLocaleString()}, Deaths: ${deaths}`;
            });
            lines.push('  Players:');
            lines.push(...playerSummary);
        }
        lines.push('');
    });

    lines.push('Answer questions concisely. Use player names and specific numbers when possible.');
    return lines.join('\n');
}
