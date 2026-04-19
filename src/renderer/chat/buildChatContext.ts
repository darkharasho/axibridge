// Known boon IDs → display names for prompt context
const BOON_NAMES: Record<number, string> = {
    1: 'Might',
    5: 'Fury',
    717: 'Aegis',
    718: 'Regeneration',
    719: 'Vigor',
    725: 'Swiftness',
    726: 'Stability',
    743: 'Protection',
    873: 'Resolution',
    1122: 'Stability',
    1187: 'Quickness',
    26980: 'Resistance',
    30328: 'Alacrity',
};

function fmt(n: number): string {
    return n.toLocaleString('en-US');
}

function pct(v: number): string {
    return `${Math.round(v)}%`;
}

function playerLine(p: any): string {
    const name = p.character_name || p.display_name || p.name || '?';
    const account = p.account ? ` [${p.account}]` : '';
    const prof = p.profession ?? p.professionName ?? 'Unknown';
    const group = p.group != null ? ` G${p.group}` : '';

    const dmg = (p.dpsAll?.[0]?.damage ?? p.totalDamageCount ?? 0) as number;
    const dps = (p.dpsAll?.[0]?.dps ?? 0) as number;
    const deaths = (p.defenses?.[0]?.deadCount ?? 0) as number;
    const downs = (p.defenses?.[0]?.downCount ?? 0) as number;
    const dmgTaken = (p.defenses?.[0]?.damageTaken ?? 0) as number;
    const cleanses = ((p.support?.[0]?.condiCleanse ?? 0) + (p.support?.[0]?.condiCleanseSelf ?? 0)) as number;
    const strips = (p.support?.[0]?.boonStrips ?? 0) as number;
    const rezzes = (p.support?.[0]?.resurrects ?? 0) as number;
    const brkbar = (p.dpsAll?.[0]?.breakbarDamage ?? 0) as number;
    const dist = (p.statsAll?.[0]?.distToCom ?? p.statsAll?.[0]?.stackDist ?? null) as number | null;

    const parts: string[] = [
        `${name}${account} (${prof}${group})`,
        `DMG: ${fmt(dmg)} (${dps} DPS)`,
    ];
    if (deaths > 0 || downs > 0) parts.push(`D/D: ${deaths}/${downs}`);
    else parts.push('D/D: 0/0');
    parts.push(`TakenDMG: ${fmt(dmgTaken)}`);
    if (cleanses > 0) parts.push(`Cleanses: ${cleanses}`);
    if (strips > 0) parts.push(`Strips: ${strips}`);
    if (rezzes > 0) parts.push(`Rezzes: ${rezzes}`);
    if (brkbar > 0) parts.push(`CC: ${fmt(brkbar)}`);
    if (dist != null) parts.push(`DistToTag: ${Math.round(dist)}`);

    return `    ${parts.join(' | ')}`;
}

function boonLines(p: any): string[] {
    const uptimes: Array<{ name: string; pct: number }> = [];
    if (Array.isArray(p.buffUptimes)) {
        for (const b of p.buffUptimes) {
            const id = b.id as number;
            const name = BOON_NAMES[id] ?? null;
            if (!name) continue;
            const uptime = b.buffData?.[0]?.uptime ?? b.uptime ?? null;
            if (uptime != null) uptimes.push({ name, pct: uptime * 100 });
        }
    }
    if (uptimes.length === 0) return [];
    const line = uptimes.map(u => `${u.name}: ${pct(u.pct)}`).join(', ');
    return [`      Boons: ${line}`];
}

/**
 * Builds a rich system prompt from the loaded fight logs.
 * Details live in DetailsCache, so the caller passes a synchronous peek function.
 */
export function buildChatContext(logs: ILogData[], getDetails: (id: string) => any | undefined): string {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');

    if (loaded.length === 0) {
        return [
            'You are an expert Guild Wars 2 World vs World (WvW) analyst embedded in AxiBridge, a desktop app that processes arcdps combat logs.',
            '',
            'No fight data is currently loaded. You can still help with:',
            '- General GW2 WvW mechanics, meta builds, and strategy',
            '- Explaining how combat stats like DPS, boon uptime, CC, and cleansing work',
            '- Advice on squad composition, role assignments, and commander decisions',
            '',
            'Be concise and specific. If the user asks about their performance, remind them to load some fights first.',
        ].join('\n');
    }

    const lines: string[] = [
        'You are an expert Guild Wars 2 World vs World (WvW) analyst embedded in AxiBridge.',
        'You have access to real arcdps combat log data for the fights listed below.',
        'Use the data to give specific, actionable analysis. Reference player names and numbers directly.',
        'Keep answers concise. Use bullet points for comparisons. Do not speculate beyond what the data shows.',
        '',
        '## GW2 WvW Context',
        '- Deaths and downs matter: dying removes a player from the fight and gives the enemy rally potential.',
        '- Boon uptime (especially Stability, Quickness, Alacrity, Might) indicates how well supports performed.',
        '- Distance to tag (DistToTag) measures how far players were from the commander — lower is better in most comps.',
        '- Cleanses remove conditions, Strips remove enemy boons, Rezzes recover downed allies.',
        '- CC (breakbar damage) disrupts enemy movement and skills.',
        '',
        `## Loaded Fights (${loaded.length} total)`,
        '',
    ];

    loaded.forEach((log, i) => {
        const details = getDetails(log.id) ?? getDetails(log.filePath);
        const name = log.fightName ?? details?.fightName ?? 'Unknown';
        const duration = log.encounterDuration ?? details?.encounterDuration ?? '?';
        const isWin = log.dashboardSummary?.isWin ?? (details?.success as boolean | undefined);
        const outcome = isWin === true ? 'WIN' : isWin === false ? 'LOSS' : 'Unknown';
        const s = log.dashboardSummary;

        lines.push(`### Fight ${i + 1}: ${name}`);
        lines.push(`Duration: ${duration} | Outcome: ${outcome}`);
        if (s) {
            const kd = s.enemyDeaths > 0
                ? ` (K/D ratio: ${(s.enemyDeaths / Math.max(s.squadDeaths, 1)).toFixed(1)})`
                : '';
            lines.push(`Squad: ${s.squadCount} players, ${s.squadDeaths} deaths | Enemy: ${s.enemyCount}, ${s.enemyDeaths} deaths${kd}`);
        }

        const players: any[] = details?.players;
        if (players?.length > 0) {
            lines.push(`Players (${players.length}):`);
            // Sort by damage desc for the prompt
            const sorted = [...players].sort((a, b) => {
                const da = (a.dpsAll?.[0]?.damage ?? a.totalDamageCount ?? 0) as number;
                const db = (b.dpsAll?.[0]?.damage ?? b.totalDamageCount ?? 0) as number;
                return db - da;
            });
            for (const p of sorted.slice(0, 25)) {
                lines.push(playerLine(p));
                const bl = boonLines(p);
                lines.push(...bl);
            }
            if (players.length > 25) {
                lines.push(`    ... and ${players.length - 25} more players`);
            }
        }
        lines.push('');
    });

    lines.push('## Instructions');
    lines.push('- Answer directly from the fight data above. It is your primary source of truth.');
    lines.push('- For ranking questions ("who topped X"), read the Players list above and sort by that stat — do NOT call a tool.');
    lines.push('- For outcome questions ("did we wipe?", "how did fight 2 go?"), use the Duration/Outcome/K/D fields above.');
    lines.push('- For specific player lookups, find them by name in the Players list above.');
    lines.push('- If a metric is not in the data above, say so — do not invent numbers.');
    lines.push('');
    lines.push('## When to call tools (rare — only when context above is insufficient)');
    lines.push('- incoming_skill_damage: user asks which enemy skills/attacks dealt the most damage to the squad ("top incoming skill", "what hit us", "what killed us", "top attack against us")');
    lines.push('- boon_analysis: user asks for per-player boon uptime breakdown across the squad');
    lines.push('- group_breakdown: user asks specifically about subgroup (G1/G2/etc.) performance');
    lines.push('- compare_fights: user asks how a stat changed across multiple fights over time');
    lines.push('- rank_players: user explicitly asks which PLAYER had the most/best/worst of a metric (a person ranking, not a skill ranking)');
    lines.push('- player_deep_dive: user asks for full detail on one specific named player');
    lines.push('- Do NOT call rank_players for questions about skills, attacks, or abilities — use incoming_skill_damage instead.');
    lines.push('- Do NOT call any tool if the answer is already visible in the context above.');

    return lines.join('\n');
}
