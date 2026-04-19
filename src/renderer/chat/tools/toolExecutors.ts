import { computeStatsSync } from '../../stats/incrementalAggregation';

const METRIC_MAP: Record<string, (p: any) => number> = {
    dps:             p => p.offense?.totalFightMs > 0 ? Math.round((p.offense?.offenseTotals?.damage ?? 0) / (p.offense.totalFightMs / 1000)) : 0,
    damage:          p => p.offense?.offenseTotals?.damage ?? 0,
    deaths:          p => p.defense?.defenseTotals?.deadCount ?? 0,
    downs:           p => p.defense?.defenseTotals?.downCount ?? 0,
    damage_taken:    p => p.defense?.defenseTotals?.damageTaken ?? 0,
    cleanses:        p => (p.support?.supportTotals?.condiCleanse ?? 0) + (p.support?.supportTotals?.condiCleanseSelf ?? 0),
    strips:          p => p.support?.supportTotals?.boonStrips ?? 0,
    rezzes:          p => p.support?.supportTotals?.resurrects ?? 0,
    breakbar_damage: p => p.offense?.offenseTotals?.breakbarDamage ?? 0,
    dist_to_tag:     p => p.general?.distCount > 0 ? Math.round((p.general?.totalDist ?? 0) / p.general.distCount) : 0,
    // Boon uptimes: not in computed stats rows — return 0 until a better source is available
    stability_uptime:  () => 0,
    quickness_uptime:  () => 0,
    alacrity_uptime:   () => 0,
    might_uptime:      () => 0,
};

const METRIC_LABELS: Record<string, string> = {
    damage: 'Damage',
    dps: 'DPS',
    deaths: 'Deaths',
    downs: 'Downs',
    damage_taken: 'Dmg Taken',
    cleanses: 'Cleanses',
    strips: 'Strips',
    rezzes: 'Rezzes',
    breakbar_damage: 'CC',
    dist_to_tag: 'Dist to Tag',
};

const BOON_IDS: Record<string, number> = {
    stability: 726, quickness: 1187, alacrity: 30328, might: 1,
    fury: 5, swiftness: 725, protection: 743, aegis: 717,
    regeneration: 718, vigor: 719, resolution: 873, resistance: 26980,
};
const BOON_ID_TO_NAME = new Map(Object.entries(BOON_IDS).map(([k, v]) => [v, k]));
BOON_ID_TO_NAME.set(1122, 'stability'); // stability rework alt ID

const BOON_ORDER = ['stability', 'quickness', 'alacrity', 'might', 'fury', 'aegis', 'protection', 'regeneration', 'resistance', 'resolution', 'swiftness', 'vigor'];

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmt(n: number): string {
    return n.toLocaleString('en-US');
}

function mdTable(headers: string[], rows: (string | number)[][], rightAlignCols: number[] = []): string {
    const rightSet = new Set(rightAlignCols);
    const sep = headers.map((_, i) => rightSet.has(i) ? '---:' : '---');
    return [
        `| ${headers.join(' | ')} |`,
        `| ${sep.join(' | ')} |`,
        ...rows.map(row => `| ${row.join(' | ')} |`),
    ].join('\n');
}

function chartBlock(spec: object): string {
    return '\n```chart\n' + JSON.stringify(spec) + '\n```';
}

function buildPlayerMap(stats: any): Map<string, { account: string; profession: string; professionList?: string[]; offense?: any; defense?: any; support?: any; general?: any }> {
    const map = new Map<string, any>();
    const merge = (rows: any[] = [], key: string) => {
        for (const r of rows) {
            if (!map.has(r.account)) map.set(r.account, { account: r.account, profession: r.profession, professionList: r.professionList });
            map.get(r.account)[key] = r;
        }
    };
    merge(stats?.offensePlayers, 'offense');
    merge(stats?.defensePlayers, 'defense');
    merge(stats?.supportPlayers, 'support');
    merge(stats?.generalPlayers, 'general');
    return map;
}

type Executor = (args: Record<string, any>, logs: ILogData[], getDetails: (id: string) => any, computedStats: any) => string;

function loadedFights(logs: ILogData[], fightIndex?: number): ILogData[] {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');
    if (fightIndex != null) return loaded[fightIndex] ? [loaded[fightIndex]] : [];
    return loaded;
}

function statsForIndex(
    fight_index: number | undefined,
    logs: ILogData[],
    getDetails: (id: string) => any,
    computedStats: any,
): { stats: any; error?: string } {
    if (fight_index == null) return { stats: computedStats };
    const fights = loadedFights(logs, fight_index);
    const fight = fights[0];
    if (!fight) return { stats: null, error: `Fight index ${fight_index} out of range.` };
    const details = (fight as any).details ?? getDetails(fight.id) ?? getDetails(fight.filePath);
    if (!details) return { stats: null, error: `Fight details not available for fight ${fight_index}.` };
    const { stats } = computeStatsSync({ logs: [{ ...fight, details }] });
    return { stats };
}

const executors: Record<string, Executor> = {
    rank_players(args, logs, getDetails, computedStats) {
        const { metric, fight_index } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return `Unknown metric '${metric}'. Valid metrics: ${Object.keys(METRIC_MAP).join(', ')}`;

        let statsToUse = computedStats;
        if (fight_index != null) {
            const fights = loadedFights(logs, fight_index);
            const fight = fights[0];
            if (!fight) return `Fight index ${fight_index} out of range.`;
            const details = (fight as any).details ?? getDetails(fight.id) ?? getDetails(fight.filePath);
            if (!details) return `Fight details not available for fight ${fight_index}.`;
            const { stats } = computeStatsSync({ logs: [{ ...fight, details }] });
            statsToUse = stats;
        }

        const playerMap = buildPlayerMap(statsToUse);
        const ranked = Array.from(playerMap.values())
            .map(p => ({ name: p.account, profession: p.profession ?? '?', value: extractor(p) }))
            .filter(p => p.value > 0 || metric === 'deaths' || metric === 'downs')
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);

        const scope = fight_index != null ? `Fight ${fight_index + 1}` : 'all fights combined';
        if (ranked.length === 0) return `No data found for metric '${metric}'.`;

        const metricLabel = METRIC_LABELS[metric] ?? metric;
        const heading = `**${metricLabel} ranking — ${scope}**`;

        const tableRows = ranked.map((p, i) => [i + 1, p.name, p.profession, fmt(p.value)]);
        const table = mdTable(['#', 'Player', 'Profession', metricLabel], tableRows, [0, 3]);

        // Chart: top 10 only
        const top10 = ranked.slice(0, 10);
        const chart = chartBlock({
            type: 'bar',
            horizontal: true,
            data: top10.map(p => ({ name: p.name, value: p.value })),
            xKey: 'name',
            series: [{ key: 'value', label: metricLabel, color: '#3b82f6' }],
        });

        return `${heading}\n\n${table}${chart}`;
    },

    player_deep_dive(args, logs, getDetails, computedStats) {
        const { character_name, fight_index } = args;
        const query = String(character_name).toLowerCase();

        let statsToUse = computedStats;
        if (fight_index != null) {
            const fights = loadedFights(logs, fight_index);
            const fight = fights[0];
            if (!fight) return `Fight index ${fight_index} out of range.`;
            const details = (fight as any).details ?? getDetails(fight.id) ?? getDetails(fight.filePath);
            if (!details) return `Fight details not available for fight ${fight_index}.`;
            const { stats } = computeStatsSync({ logs: [{ ...fight, details }] });
            statsToUse = stats;
        }

        const playerMap = buildPlayerMap(statsToUse);
        const matches = Array.from(playerMap.entries())
            .filter(([account]) => account.toLowerCase().includes(query))
            .map(([account, p]) => ({
                account,
                profession: p.profession ?? '?',
                damage: p.offense?.offenseTotals?.damage ?? 0,
                dps: p.offense?.totalFightMs > 0 ? Math.round((p.offense?.offenseTotals?.damage ?? 0) / (p.offense.totalFightMs / 1000)) : 0,
                deaths: p.defense?.defenseTotals?.deadCount ?? 0,
                downs: p.defense?.defenseTotals?.downCount ?? 0,
                damageTaken: p.defense?.defenseTotals?.damageTaken ?? 0,
                cleanses: (p.support?.supportTotals?.condiCleanse ?? 0) + (p.support?.supportTotals?.condiCleanseSelf ?? 0),
                strips: p.support?.supportTotals?.boonStrips ?? 0,
                rezzes: p.support?.supportTotals?.resurrects ?? 0,
                breakbarDamage: p.offense?.offenseTotals?.breakbarDamage ?? 0,
                avgDistToTag: p.general?.distCount > 0 ? Math.round((p.general?.totalDist ?? 0) / p.general.distCount) : null,
                logsJoined: p.defense?.logsJoined ?? p.support?.logsJoined ?? 1,
            }));

        if (matches.length === 0) {
            const available = Array.from(playerMap.keys()).slice(0, 20).join(', ');
            return `Player '${character_name}' not found. Available players: ${available}`;
        }

        const parts: string[] = [];
        for (const m of matches) {
            const fightNote = m.logsJoined > 1 ? ` *(aggregated across ${m.logsJoined} fights)*` : '';
            const heading = `**${m.account} (${m.profession})**${fightNote}`;

            const rows: [string, string][] = [
                ['Damage', fmt(m.damage)],
                ['DPS', fmt(m.dps)],
                ['Deaths / Downs', `${m.deaths} / ${m.downs}`],
                ['Damage Taken', fmt(m.damageTaken)],
            ];
            if (m.cleanses > 0) rows.push(['Cleanses', String(m.cleanses)]);
            if (m.strips > 0) rows.push(['Strips', String(m.strips)]);
            if (m.rezzes > 0) rows.push(['Rezzes', String(m.rezzes)]);
            if (m.breakbarDamage > 0) rows.push(['CC', fmt(m.breakbarDamage)]);
            if (m.avgDistToTag != null) rows.push(['Avg Dist to Tag', String(m.avgDistToTag)]);

            const table = mdTable(['Stat', 'Value'], rows);
            parts.push(`${heading}\n\n${table}`);
        }
        return parts.join('\n\n');
    },

    boon_analysis(args, logs, getDetails) {
        const { fight_index, boon_name } = args;
        const targetIds = boon_name
            ? (() => {
                const id = BOON_IDS[String(boon_name).toLowerCase()];
                if (!id) return [];
                return id === 726 ? [726, 1122] : [id]; // stability has two IDs
            })()
            : Array.from(BOON_ID_TO_NAME.keys());

        const fights = loadedFights(logs, fight_index);
        const parts: string[] = [];

        // Track cross-fight boon averages for the chart
        const allBoonValues: Record<string, number[]> = {};

        for (const log of fights) {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            const players = (details?.players ?? [])
                .map((p: any) => {
                    const boons: Record<string, number> = {};
                    for (const b of p.buffUptimes ?? []) {
                        if (targetIds.includes(b.id)) {
                            const name = BOON_ID_TO_NAME.get(b.id) ?? String(b.id);
                            boons[name] = Math.round(b.buffData?.[0]?.uptime ?? 0);
                        }
                    }
                    return { name: p.character_name || p.display_name, boons };
                })
                .filter((p: any) => Object.keys(p.boons).length > 0);

            const fightLabel = log.fightName ?? log.id;

            if (players.length === 0) {
                parts.push(`**${fightLabel}**\n\nNo boon data available.`);
                continue;
            }

            // Aggregate per boon
            const boonAggs: Record<string, number[]> = {};
            for (const p of players) {
                for (const [boon, pct] of Object.entries(p.boons)) {
                    if (!boonAggs[boon]) boonAggs[boon] = [];
                    boonAggs[boon].push(pct as number);
                    // Also accumulate cross-fight
                    if (!allBoonValues[boon]) allBoonValues[boon] = [];
                    allBoonValues[boon].push(pct as number);
                }
            }

            const orderedBoons = [
                ...BOON_ORDER.filter(b => boonAggs[b]),
                ...Object.keys(boonAggs).filter(b => !BOON_ORDER.includes(b)),
            ];

            const rows = orderedBoons.map(boon => {
                const values = boonAggs[boon];
                const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
                const min = Math.min(...values);
                const max = Math.max(...values);
                return [cap(boon), `${avg}%`, `${min}%`, `${max}%`, values.length];
            });

            const table = mdTable(['Boon', 'Avg', 'Min', 'Max', 'Players'], rows, [1, 2, 3, 4]);
            parts.push(`**${fightLabel}**\n\n${table}`);
        }

        if (parts.length === 0) return 'No boon data found.';

        // Append chart if there's data
        const boonsWithData = Object.keys(allBoonValues);
        if (boonsWithData.length > 0) {
            const orderedForChart = [
                ...BOON_ORDER.filter(b => allBoonValues[b]),
                ...boonsWithData.filter(b => !BOON_ORDER.includes(b)),
            ];
            const chartData = orderedForChart.map(boon => {
                const values = allBoonValues[boon];
                const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
                return { name: cap(boon), value: avg };
            });
            const chart = chartBlock({
                type: 'bar',
                horizontal: true,
                unit: '%',
                data: chartData,
                xKey: 'name',
                series: [{ key: 'value', label: 'Avg Uptime', color: '#8b5cf6' }],
            });
            parts.push(chart.trimStart());
        }

        return parts.join('\n\n');
    },

    group_breakdown(args, logs, getDetails) {
        const { fight_index } = args;
        const fights = loadedFights(logs, fight_index);
        const parts: string[] = [];

        for (const log of fights) {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            const byGroup = new Map<number, any[]>();
            for (const p of details?.players ?? []) {
                const g = p.group ?? 0;
                if (!byGroup.has(g)) byGroup.set(g, []);
                byGroup.get(g)!.push(p);
            }

            const fightLabel = log.fightName ?? log.id;
            const groups = Array.from(byGroup.entries()).sort(([a], [b]) => a - b);

            const rows = groups.map(([g, players]) => {
                const totalDamage = players.reduce((s: number, p: any) => s + (p.dpsAll?.[0]?.damage ?? 0), 0);
                const totalDeaths = players.reduce((s: number, p: any) => s + (p.defenses?.[0]?.deadCount ?? 0), 0);
                const totalCleanses = players.reduce((s: number, p: any) => s + (p.support?.[0]?.condiCleanse ?? 0) + (p.support?.[0]?.condiCleanseSelf ?? 0), 0);
                const totalRezzes = players.reduce((s: number, p: any) => s + (p.support?.[0]?.resurrects ?? 0), 0);
                return [`Group ${g}`, players.length, fmt(totalDamage), totalDeaths, totalCleanses, totalRezzes];
            });

            const table = mdTable(['Group', 'Players', 'Damage', 'Deaths', 'Cleanses', 'Rezzes'], rows, [1, 2, 3, 4, 5]);
            parts.push(`**${fightLabel}**\n\n${table}`);
        }

        return parts.join('\n\n') || 'No group data found.';
    },

    squad_skill_damage(args, logs, getDetails, computedStats) {
        const { fight_index, metric = 'damage', top_n = 15 } = args;
        const { stats, error } = statsForIndex(fight_index, logs, getDetails, computedStats);
        if (error) return error;

        const skillKey = metric === 'down_contribution' ? 'downContribution' : 'damage';
        const skills = ((stats?.topSkillsByDamage ?? []) as any[])
            .sort((a, b) => (b[skillKey] ?? 0) - (a[skillKey] ?? 0))
            .slice(0, top_n);

        if (skills.length === 0) return 'No skill damage data found.';
        const scope = fight_index != null ? `Fight ${fight_index + 1}` : 'all fights';
        const heading = `**Top squad skills by ${metric} — ${scope}**`;

        const rows = skills.map((s, i) => [
            i + 1,
            s.name,
            fmt(s.damage ?? 0),
            fmt(s.downContribution ?? 0),
            s.hits ?? 0,
        ]);
        const table = mdTable(['#', 'Skill', 'Damage', 'Down Contrib', 'Hits'], rows, [0, 2, 3, 4]);

        // Chart top 10
        const top10 = skills.slice(0, 10);
        const chart = chartBlock({
            type: 'bar',
            horizontal: true,
            data: top10.map(s => ({ name: s.name, value: s[skillKey] ?? 0 })),
            xKey: 'name',
            series: [{ key: 'value', label: 'Damage', color: '#f97316' }],
        });

        return `${heading}\n\n${table}${chart}`;
    },

    healing_stats(args, logs, getDetails, computedStats) {
        const { fight_index } = args;
        const { stats, error } = statsForIndex(fight_index, logs, getDetails, computedStats);
        if (error) return error;

        const healers = ((stats?.healingPlayers ?? []) as any[])
            .filter(p => (p.healingTotals?.healing ?? 0) > 0)
            .sort((a, b) => (b.healingTotals?.healing ?? 0) - (a.healingTotals?.healing ?? 0))
            .slice(0, 20);

        if (healers.length === 0) return 'No healing data found — this fight may not have dedicated healers or healing was not logged.';
        const scope = fight_index != null ? `Fight ${fight_index + 1}` : 'all fights';
        const heading = `**Healing output — ${scope}**`;

        const hasBarrier = healers.some(p => (p.healingTotals?.barrier ?? 0) > 0);
        const hasDownedHeal = healers.some(p => (p.healingTotals?.downedHealing ?? 0) > 0);

        const headers = ['#', 'Player', 'Profession', 'Healing', 'HPS'];
        const rightAlignCols = [0, 3, 4];
        if (hasBarrier) { headers.push('Barrier'); rightAlignCols.push(headers.length - 1); }
        if (hasDownedHeal) { headers.push('Downed Heal'); rightAlignCols.push(headers.length - 1); }

        const rows = healers.map((p, i) => {
            const healing = p.healingTotals?.healing ?? 0;
            const hps = p.activeMs > 0 ? Math.round(healing / (p.activeMs / 1000)) : 0;
            const row: (string | number)[] = [i + 1, p.account, p.profession, fmt(healing), fmt(hps)];
            if (hasBarrier) row.push(fmt(p.healingTotals?.barrier ?? 0));
            if (hasDownedHeal) row.push(fmt(p.healingTotals?.downedHealing ?? 0));
            return row;
        });

        const table = mdTable(headers, rows, rightAlignCols);

        let chart = '';
        if (healers.length >= 2) {
            chart = chartBlock({
                type: 'bar',
                horizontal: true,
                data: healers.map(p => ({ name: p.account, value: p.healingTotals?.healing ?? 0 })),
                xKey: 'name',
                series: [{ key: 'value', label: 'Healing', color: '#22c55e' }],
            });
        }

        return `${heading}\n\n${table}${chart}`;
    },

    conditions_applied(args, logs, getDetails, computedStats) {
        const { fight_index, condition_name } = args;
        const { stats, error } = statsForIndex(fight_index, logs, getDetails, computedStats);
        if (error) return error;

        let summary = (stats?.outgoingConditionSummary ?? []) as any[];
        if (condition_name) {
            const target = String(condition_name).toLowerCase();
            summary = summary.filter(c => (c.name ?? '').toLowerCase().includes(target));
        }

        if (summary.length === 0) return condition_name
            ? `No data found for condition '${condition_name}'.`
            : 'No condition data found.';
        const scope = fight_index != null ? `Fight ${fight_index + 1}` : 'all fights';
        const heading = `**Conditions applied to enemies — ${scope}**`;

        const topConditions = summary.slice(0, 20);
        const rows = topConditions.map((c, i) => [i + 1, c.name, fmt(c.damage ?? 0), c.applications ?? 0]);
        const table = mdTable(['#', 'Condition', 'Damage', 'Applications'], rows, [0, 2, 3]);

        let chart = '';
        if (topConditions.length >= 3) {
            chart = chartBlock({
                type: 'bar',
                horizontal: true,
                data: topConditions.slice(0, 10).map(c => ({ name: c.name, value: c.damage ?? 0 })),
                xKey: 'name',
                series: [{ key: 'value', label: 'Damage', color: '#ec4899' }],
            });
        }

        return `${heading}\n\n${table}${chart}`;
    },

    damage_mitigation(args, logs, getDetails, computedStats) {
        const { fight_index } = args;
        const { stats, error } = statsForIndex(fight_index, logs, getDetails, computedStats);
        if (error) return error;

        const players = ((stats?.damageMitigationPlayers ?? []) as any[])
            .sort((a, b) => (b.mitigationTotals?.totalMitigation ?? 0) - (a.mitigationTotals?.totalMitigation ?? 0))
            .slice(0, 20);

        if (players.length === 0) return 'No mitigation data found.';
        const scope = fight_index != null ? `Fight ${fight_index + 1}` : 'all fights';
        const heading = `**Damage mitigation — ${scope}**`;

        const hasEvades = players.some(p => (p.mitigationTotals?.evaded ?? 0) > 0);
        const hasBlocks = players.some(p => (p.mitigationTotals?.blocked ?? 0) > 0);
        const hasMisses = players.some(p => (p.mitigationTotals?.missed ?? 0) > 0);
        const hasInvulns = players.some(p => (p.mitigationTotals?.invulned ?? 0) > 0);
        const hasTotal = players.some(p => (p.mitigationTotals?.totalMitigation ?? 0) > 0);

        const headers = ['#', 'Player', 'Profession'];
        const rightAlignCols: number[] = [0];
        if (hasEvades) { headers.push('Evades'); rightAlignCols.push(headers.length - 1); }
        if (hasBlocks) { headers.push('Blocks'); rightAlignCols.push(headers.length - 1); }
        if (hasMisses) { headers.push('Misses'); rightAlignCols.push(headers.length - 1); }
        if (hasInvulns) { headers.push('Invulns'); rightAlignCols.push(headers.length - 1); }
        if (hasTotal) { headers.push('Total Mitigated'); rightAlignCols.push(headers.length - 1); }

        const rows = players.map((p, i) => {
            const m = p.mitigationTotals ?? {};
            const row: (string | number)[] = [i + 1, p.account, p.profession];
            if (hasEvades) row.push(m.evaded ?? 0);
            if (hasBlocks) row.push(m.blocked ?? 0);
            if (hasMisses) row.push(m.missed ?? 0);
            if (hasInvulns) row.push(m.invulned ?? 0);
            if (hasTotal) row.push(fmt(m.totalMitigation ?? 0));
            return row;
        });

        const table = mdTable(headers, rows, rightAlignCols);
        return `${heading}\n\n${table}`;
    },

    spike_damage(args, logs, getDetails, computedStats) {
        const { fight_index } = args;
        const { stats, error } = statsForIndex(fight_index, logs, getDetails, computedStats);
        if (error) return error;

        const players = ((stats?.spikeDamage?.players ?? []) as any[])
            .sort((a, b) => (b.peakHit ?? 0) - (a.peakHit ?? 0))
            .slice(0, 15);

        if (players.length === 0) return 'No spike damage data found.';
        const scope = fight_index != null ? `Fight ${fight_index + 1}` : 'all fights';
        const heading = `**Spike/burst damage — ${scope}**`;

        const rows = players.map((p, i) => [
            i + 1,
            p.account,
            p.profession,
            fmt(p.peakHit ?? 0),
            p.peakSkillName || '—',
            (p.peak1s ?? 0) > 0 ? fmt(p.peak1s) : '—',
            (p.peakHitDown ?? 0) > 0 ? fmt(p.peakHitDown) : '—',
        ]);

        const table = mdTable(['#', 'Player', 'Profession', 'Peak Hit', 'Skill', '1s Burst', 'Down Spike'], rows, [0, 3, 5, 6]);
        return `${heading}\n\n${table}`;
    },

    incoming_skill_damage(args, logs, getDetails) {
        const { fight_index, top_n = 10 } = args;
        const fights = loadedFights(logs, fight_index);
        const parts: string[] = [];
        let firstFightWithData: { sorted: Array<{ name: string; damage: number; hits: number }> } | null = null;

        for (const log of fights) {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) continue;

            const skillMap: Record<string, any> = details.skillMap ?? {};
            const buffMap: Record<string, any> = details.buffMap ?? {};
            const players: any[] = details.players ?? [];

            const bySkill = new Map<string, { name: string; damage: number; hits: number }>();

            for (const p of players) {
                const rows: any[] = [];
                if (Array.isArray(p.totalDamageTaken)) {
                    for (const group of p.totalDamageTaken) {
                        if (Array.isArray(group)) rows.push(...group);
                    }
                }
                for (const entry of rows) {
                    if (!entry?.id) continue;
                    const key = `s${entry.id}`;
                    const mapped = skillMap[key] || skillMap[String(entry.id)];
                    const buffed = buffMap[`b${entry.id}`];
                    const name = mapped?.name || buffed?.name || `Skill ${entry.id}`;
                    const existing = bySkill.get(key) ?? { name, damage: 0, hits: 0 };
                    existing.damage += Math.max(0, Number(entry.totalDamage ?? 0));
                    existing.hits += Math.max(0, Number(entry.hits ?? entry.connectedHits ?? 0));
                    bySkill.set(key, existing);
                }
            }

            const sorted = Array.from(bySkill.values())
                .sort((a, b) => b.damage - a.damage)
                .slice(0, top_n);

            const fightLabel = log.fightName ?? log.id;
            const heading = `**${fightLabel} — Top enemy skills hitting your squad**`;

            if (sorted.length === 0) {
                parts.push(`${heading}\n\nNo incoming skill data available.`);
            } else {
                const tableRows = sorted.map((s, i) => [i + 1, s.name, fmt(s.damage), s.hits]);
                const table = mdTable(['#', 'Skill', 'Damage', 'Hits'], tableRows, [0, 2, 3]);
                parts.push(`${heading}\n\n${table}`);
                if (!firstFightWithData) firstFightWithData = { sorted };
            }
        }

        if (parts.length === 0) return 'No incoming skill damage data found.';

        // Append chart for first fight with data if 3+ skills
        if (firstFightWithData && firstFightWithData.sorted.length >= 3) {
            const chartData = firstFightWithData.sorted.slice(0, 10).map(s => ({ name: s.name, value: s.damage }));
            const chart = chartBlock({
                type: 'bar',
                horizontal: true,
                data: chartData,
                xKey: 'name',
                series: [{ key: 'value', label: 'Damage dealt to squad', color: '#ef4444' }],
            });
            parts.push(chart.trimStart());
        }

        return parts.join('\n\n');
    },

    performance_analysis(args, logs, getDetails, computedStats) {
        const { fight_index } = args;
        const fights = loadedFights(logs, fight_index);
        if (fights.length === 0) return 'No loaded fights found for performance analysis.';

        const scope = fight_index != null ? `Fight ${fight_index + 1}` : `all ${fights.length} fight${fights.length !== 1 ? 's' : ''}`;

        const { stats, error } = statsForIndex(fight_index, logs, getDetails, computedStats);
        if (error) return error;

        // K/D
        let totalKills = 0;
        let totalDeaths = 0;
        let squadCount = 0;
        for (const log of fights) {
            const s = log.dashboardSummary;
            if (s) {
                totalKills += s.enemyDeaths ?? 0;
                totalDeaths += s.squadDeaths ?? 0;
                squadCount = Math.max(squadCount, s.squadCount ?? 0);
            }
        }
        const kdRatio = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
        let kdLabel = 'Losing';
        if (kdRatio > 3) kdLabel = 'Dominant';
        else if (kdRatio >= 2) kdLabel = 'Winning';
        else if (kdRatio >= 1) kdLabel = 'Competitive';

        const offensePlayers = (stats?.offensePlayers ?? []) as any[];
        const topDamagePlayer = [...offensePlayers].sort((a, b) =>
            (b.offenseTotals?.damage ?? 0) - (a.offenseTotals?.damage ?? 0)
        )[0];

        // Boon averages
        const PERF_BOONS: Array<{ ids: number[]; label: string; goodPct: number; okPct: number }> = [
            { ids: [726, 1122], label: 'Stability',  goodPct: 80, okPct: 65 },
            { ids: [1187],      label: 'Quickness',  goodPct: 75, okPct: 55 },
            { ids: [30328],     label: 'Alacrity',   goodPct: 70, okPct: 50 },
            { ids: [1],         label: 'Might',      goodPct: 85, okPct: 70 },
            { ids: [5],         label: 'Fury',       goodPct: 70, okPct: 50 },
        ];

        const boonValues: Record<string, number[]> = {};
        for (const log of fights) {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            const players: any[] = details?.players ?? [];
            for (const { ids, label } of PERF_BOONS) {
                for (const p of players) {
                    if (!Array.isArray(p.buffUptimes)) continue;
                    for (const b of p.buffUptimes) {
                        if (ids.includes(b.id as number)) {
                            const uptime = b.buffData?.[0]?.uptime ?? b.uptime ?? null;
                            if (uptime != null) {
                                if (!boonValues[label]) boonValues[label] = [];
                                boonValues[label].push(uptime as number);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Deaths
        const defensePlayers = (stats?.defensePlayers ?? []) as any[];
        const sortedByDeaths = [...defensePlayers].sort((a, b) =>
            (b.defenseTotals?.deadCount ?? 0) - (a.defenseTotals?.deadCount ?? 0)
        );
        const mostDeadPlayer = sortedByDeaths[0];
        const totalSquadDeaths = defensePlayers.reduce((s, p) => s + (p.defenseTotals?.deadCount ?? 0), 0);
        const avgSquadSize = fights.reduce((s, l) => s + (l.dashboardSummary?.squadCount ?? 0), 0) / fights.length || 1;
        const deathRate = (totalSquadDeaths / avgSquadSize) / fights.length * 100;
        let deathRateLabel = 'normal';
        if (deathRate < 5) deathRateLabel = 'low';
        else if (deathRate > 15) deathRateLabel = 'high';

        // Healing
        const healers = ((stats?.healingPlayers ?? []) as any[])
            .filter(p => (p.healingTotals?.healing ?? 0) > 0)
            .slice(0, 3);

        // Build recommendations — always at least 2
        const recommendations: string[] = [];
        const boonIssues: string[] = [];
        for (const { label, goodPct, okPct } of PERF_BOONS) {
            const values = boonValues[label];
            if (!values || values.length === 0) continue;
            const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
            if (avg < okPct) {
                const suggestion = label === 'Quickness'
                    ? 'consider adding Firebrand support'
                    : label === 'Alacrity'
                        ? 'a Mechanist or Specter would help'
                        : label === 'Stability'
                            ? 'ensure Guardians are maintaining Stability during engagements'
                            : label === 'Might'
                                ? 'more Might stacking support needed'
                                : 'check boon support coverage';
                boonIssues.push(label);
                recommendations.push(`**${label}** is at ${avg}% — well below the ${goodPct}% target. ${suggestion}`);
            } else if (avg < goodPct) {
                boonIssues.push(label);
                recommendations.push(`**${label}** is at ${avg}% — close but not quite at the ${goodPct}% target. A bit more consistency from supports would push this over`);
            }
        }

        if (deathRate > 15) {
            const deathCount = mostDeadPlayer?.defenseTotals?.deadCount ?? 0;
            if (deathCount >= 3) {
                recommendations.push(`${mostDeadPlayer.account} died ${deathCount} times — review their positioning or consider a tankier build`);
            } else {
                recommendations.push(`Death rate is ${deathRate.toFixed(1)}% — focus on not engaging when out of position`);
            }
        }

        if (kdRatio < 1) {
            recommendations.push(`K/D of ${kdRatio.toFixed(1)}:1 shows the squad is taking more losses than it deals — prioritize target calling and disengaging when outnumbered`);
        }

        // Always ensure at least 2 recommendations
        if (recommendations.length === 0) {
            recommendations.push('Maintain Stability discipline especially during pushes — consistent uptime is harder to achieve as squad size grows');
            recommendations.push('Focus on tightening up positioning — closer to tag means more boon coverage and faster rally after downs');
        } else if (recommendations.length === 1) {
            recommendations.push('Work on faster rally after downs to reduce the window enemies can secure kills — quick rezzes keep the fight even');
        }

        // Opening sentence
        const kdStr = totalDeaths > 0 ? `${totalKills}:${totalDeaths}` : `${totalKills}:0`;
        const fightCount = fights.length;
        const scopeLabel = fight_index != null ? `Fight ${fight_index + 1}` : `${fightCount} fight${fightCount !== 1 ? 's' : ''}`;
        let openingSentence: string;
        if (kdRatio >= 2) {
            openingSentence = `Over ${scopeLabel} your squad went ${kdStr} kills to deaths — a strong ${kdStr} K/D (${kdLabel}).`;
        } else if (kdRatio >= 1) {
            openingSentence = `Over ${scopeLabel} your squad went ${kdStr} kills to deaths — a ${kdStr} K/D (${kdLabel}).`;
        } else {
            openingSentence = `Tough session (${scopeLabel}) — ${totalKills} kills against ${totalDeaths} deaths puts you at a ${kdStr} K/D (${kdLabel}).`;
        }

        // Offense table
        const kdDisplay = totalDeaths > 0 ? `${kdRatio.toFixed(1)}:1 (${kdLabel})` : `${totalKills}:0 (${kdLabel})`;
        const offenseRows: [string, string][] = [
            ['K/D', kdDisplay],
            ['Enemy kills', String(totalKills)],
            ['Squad deaths', String(totalDeaths)],
        ];
        if (topDamagePlayer) {
            const dmg = fmt(topDamagePlayer.offenseTotals?.damage ?? 0);
            offenseRows.push(['Top damage', `${topDamagePlayer.account} (${topDamagePlayer.profession ?? '?'}) — ${dmg}`]);
        }
        const offenseTable = mdTable(['Metric', 'Value'], offenseRows);

        // Boon coverage table + chart
        const boonRows: string[][] = [];
        const boonChartData: Array<{ boon: string; actual: number; target: number }> = [];
        for (const { label, goodPct } of PERF_BOONS) {
            const values = boonValues[label];
            if (!values || values.length === 0) continue;
            const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
            const status = avg >= goodPct ? '✓' : '⚠';
            boonRows.push([label, `${avg}%`, `≥${goodPct}%`, status]);
            boonChartData.push({ boon: label, actual: avg, target: goodPct });
        }

        // Survivability table
        const survivabilityRows: [string, string][] = [
            ['Death rate', `${deathRate.toFixed(1)}% (${deathRateLabel})`],
        ];
        if (mostDeadPlayer && (mostDeadPlayer.defenseTotals?.deadCount ?? 0) > 0) {
            const deathCount = mostDeadPlayer.defenseTotals?.deadCount ?? 0;
            survivabilityRows.push(['Most deaths', `${mostDeadPlayer.account} — ${deathCount} death${deathCount !== 1 ? 's' : ''}`]);
        }

        // Assemble output
        const lines: string[] = [];
        lines.push(openingSentence);
        lines.push('');
        lines.push('**Offense**');
        lines.push('');
        lines.push(offenseTable);
        lines.push('');
        lines.push('**Boon Coverage**');
        lines.push('');

        if (boonRows.length > 0) {
            const boonTable = mdTable(['Boon', 'Squad Avg', 'Target', ''], boonRows, [1, 2]);
            lines.push(boonTable);
            if (boonChartData.length > 0) {
                lines.push(chartBlock({
                    type: 'bar',
                    unit: '%',
                    title: 'Boon coverage vs targets',
                    data: boonChartData,
                    xKey: 'boon',
                    series: [
                        { key: 'actual', label: 'Actual', color: '#3b82f6' },
                        { key: 'target', label: 'Target', color: '#374151' },
                    ],
                }));
            }
        } else {
            lines.push('(no boon data available)');
        }

        lines.push('');
        lines.push('**Survivability**');
        lines.push('');
        lines.push(mdTable(['Metric', 'Value'], survivabilityRows));
        lines.push('');
        lines.push('**Healing**');
        lines.push('');

        if (healers.length === 0) {
            lines.push('(none recorded)');
        } else {
            const healerRows = healers.map(h => [
                h.account,
                fmt(h.healingTotals?.healing ?? 0),
                h.activeMs > 0 ? fmt(Math.round((h.healingTotals?.healing ?? 0) / (h.activeMs / 1000))) : '?',
            ]);
            lines.push(mdTable(['Player', 'Healing', 'HPS'], healerRows, [1, 2]));
        }

        lines.push('');
        lines.push('**What to work on**');
        lines.push('');
        recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

        return lines.join('\n');
    },

    compare_fights(args, logs, getDetails) {
        const { metric, player_name } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return `Unknown metric '${metric}'. Valid metrics: ${Object.keys(METRIC_MAP).join(', ')}`;

        const loaded = loadedFights(logs);
        const metricLabel = METRIC_LABELS[metric] ?? metric;

        if (player_name) {
            const heading = `**${metricLabel} for ${player_name} across all fights**`;
            const tableRows: (string | number)[][] = [];
            const chartData: Array<{ name: string; value: number }> = [];

            for (const [i, log] of loaded.entries()) {
                const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
                const fightLabel = log.fightName ?? log.id;
                if (!details) {
                    tableRows.push([`Fight ${i + 1}`, fightLabel, '(no data)']);
                    continue;
                }
                const { stats } = computeStatsSync({ logs: [{ ...log, details }] });
                const playerMap = buildPlayerMap(stats);
                const query = String(player_name).toLowerCase();
                const match = Array.from(playerMap.entries()).find(([acc]) => acc.toLowerCase().includes(query));
                const val = match ? extractor(match[1]) : null;
                tableRows.push([`Fight ${i + 1}`, fightLabel, val != null ? fmt(val) : 'not found']);
                if (val != null) chartData.push({ name: `Fight ${i + 1}`, value: val });
            }

            const table = mdTable(['Fight', 'Name', 'Value'], tableRows, [2]);
            let chart = '';
            if (chartData.length > 0) {
                chart = chartBlock({
                    type: 'bar',
                    data: chartData,
                    xKey: 'name',
                    series: [{ key: 'value', label: metricLabel, color: '#3b82f6' }],
                });
            }
            return `${heading}\n\n${table}${chart}`;
        } else {
            const heading = `**${metricLabel} across all fights**`;
            const tableRows: (string | number)[][] = [];
            const chartData: Array<{ name: string; value: number }> = [];

            for (const [i, log] of loaded.entries()) {
                const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
                const fightLabel = log.fightName ?? log.id;
                if (!details) {
                    tableRows.push([`Fight ${i + 1}`, fightLabel, '(no data)', '(no data)']);
                    continue;
                }
                const { stats } = computeStatsSync({ logs: [{ ...log, details }] });
                const playerMap = buildPlayerMap(stats);
                const values = Array.from(playerMap.values()).map(extractor).filter(v => v > 0);
                const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
                const total = values.reduce((a, b) => a + b, 0);
                tableRows.push([`Fight ${i + 1}`, fightLabel, fmt(avg), fmt(total)]);
                chartData.push({ name: `Fight ${i + 1}`, value: avg });
            }

            const table = mdTable(['Fight', 'Name', 'Avg', 'Total'], tableRows, [2, 3]);
            const chart = chartBlock({
                type: 'bar',
                data: chartData,
                xKey: 'name',
                series: [{ key: 'value', label: `Avg ${metricLabel}`, color: '#3b82f6' }],
            });
            return `${heading}\n\n${table}${chart}`;
        }
    },
};

export function executeToolCall(
    name: string,
    args: Record<string, any>,
    logs: ILogData[],
    getDetails: (id: string) => any,
    computedStats: any,
): string {
    const executor = executors[name];
    if (!executor) return `Unknown tool '${name}'. Valid tools: ${Object.keys(executors).join(', ')}`;
    try {
        return executor(args, logs, getDetails, computedStats);
    } catch (err: any) {
        return `Tool execution failed: ${err?.message ?? 'unknown error'}`;
    }
}
