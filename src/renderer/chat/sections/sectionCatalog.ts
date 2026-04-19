// src/renderer/chat/sections/sectionCatalog.ts
import { computeStatsSync } from '../../stats/incrementalAggregation';

export type SectionName =
    | 'fight_overview'
    | 'offense'
    | 'defense'
    | 'support'
    | 'boons'
    | 'healing'
    | 'skills_outgoing'
    | 'skills_incoming'
    | 'mitigation'
    | 'conditions'
    | 'groups';

export interface SectionDef {
    name: SectionName;
    description: string;
    keywords: string[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('en-US'); }
function pct(n: number): string { return `${Math.round(n)}%`; }

function mdTable(headers: string[], rows: (string | number)[][], rightAlignCols: number[] = []): string {
    const rightSet = new Set(rightAlignCols);
    const sep = headers.map((_, i) => rightSet.has(i) ? '---:' : '---');
    return [
        `| ${headers.join(' | ')} |`,
        `| ${sep.join(' | ')} |`,
        ...rows.map(row => `| ${row.join(' | ')} |`),
    ].join('\n');
}

function fightLabel(log: ILogData, index: number): string {
    return log.fightName ? `${log.fightName} (#${index + 1})` : `Fight ${index + 1}`;
}

function loadedFights(logs: ILogData[], fightIndex?: number): ILogData[] {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');
    if (fightIndex != null) return loaded[fightIndex] ? [loaded[fightIndex]] : [];
    return loaded;
}

function hydratedStats(
    logs: ILogData[],
    getDetails: (id: string) => any,
    fightIndex?: number,
): any {
    const fights = loadedFights(logs, fightIndex);
    if (fights.length === 0) return null;
    const hydrated = fights.map(log => {
        const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
        return details ? { ...log, details } : log;
    });
    const { stats } = computeStatsSync({ logs: hydrated });
    return stats;
}

const BOON_IDS: Record<string, number[]> = {
    Stability: [726, 1122],
    Quickness: [1187],
    Alacrity: [30328],
    Might: [1],
    Fury: [5],
    Swiftness: [725],
    Protection: [743],
    Aegis: [717],
    Regeneration: [718],
    Vigor: [719],
    Resolution: [873],
    Resistance: [26980],
};
const BOON_ORDER = ['Stability', 'Quickness', 'Alacrity', 'Might', 'Fury', 'Aegis', 'Protection', 'Regeneration', 'Resistance', 'Resolution', 'Swiftness', 'Vigor'];

function boonUptimesForPlayers(players: any[]): Record<string, number[]> {
    const agg: Record<string, number[]> = {};
    for (const p of players) {
        for (const [boonName, ids] of Object.entries(BOON_IDS)) {
            for (const b of p.buffUptimes ?? []) {
                if ((ids as number[]).includes(b.id as number)) {
                    const uptime = b.buffData?.[0]?.uptime ?? b.uptime ?? null;
                    if (uptime != null) {
                        if (!agg[boonName]) agg[boonName] = [];
                        agg[boonName].push(uptime as number);
                        break;
                    }
                }
            }
        }
    }
    return agg;
}

function boonSummaryLine(boons: Record<string, number[]>): string {
    return BOON_ORDER
        .filter(b => boons[b]?.length)
        .map(b => {
            const vals = boons[b];
            const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
            return `${b} ${pct(avg)}`;
        })
        .join(' | ');
}

// ── extractors ───────────────────────────────────────────────────────────────

type ExtractFn = (
    logs: ILogData[],
    getDetails: (id: string) => any,
    computedStats: any,
    fightIndex?: number,
) => string;

const extractFightOverview: ExtractFn = (logs) => {
    const fights = loadedFights(logs);
    if (fights.length === 0) return 'No fights loaded.';
    const rows = fights.map((log, i) => {
        const s = log.dashboardSummary;
        const outcome = s?.isWin === true ? 'WIN' : s?.isWin === false ? 'LOSS' : '?';
        const kd = s?.squadDeaths > 0
            ? (s.enemyDeaths / s.squadDeaths).toFixed(1)
            : s?.enemyDeaths > 0 ? `${s.enemyDeaths}:0` : '—';
        const duration = log.encounterDuration ?? '?';
        return [fightLabel(log, i), outcome, duration, s?.squadCount ?? '?', s?.squadDeaths ?? '?', s?.enemyDeaths ?? '?', kd];
    });
    return `**Fight Overview (${fights.length} fights)**\n\n${mdTable(
        ['Fight', 'Outcome', 'Duration', 'Squad', 'Squad Deaths', 'Enemy Deaths', 'K/D'],
        rows,
        [3, 4, 5],
    )}`;
};

const extractOffense: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const players = ((stats?.offensePlayers ?? []) as any[])
        .sort((a, b) => (b.offenseTotals?.damage ?? 0) - (a.offenseTotals?.damage ?? 0))
        .slice(0, 20);
    if (players.length === 0) return 'No offense data.';
    const rows = players.map((p, i) => {
        const dmg = p.offenseTotals?.damage ?? 0;
        const dps = p.totalFightMs > 0 ? Math.round(dmg / (p.totalFightMs / 1000)) : 0;
        const cc = p.offenseTotals?.breakbarDamage ?? 0;
        return [i + 1, p.account, p.profession ?? '?', fmt(dmg), fmt(dps), cc > 0 ? fmt(cc) : '—'];
    });
    return `**Offense — ${scope}**\n\n${mdTable(['#', 'Player', 'Profession', 'Damage', 'DPS', 'CC'], rows, [0, 3, 4])}`;
};

const extractDefense: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const players = ((stats?.defensePlayers ?? []) as any[])
        .sort((a, b) => (b.defenseTotals?.deadCount ?? 0) - (a.defenseTotals?.deadCount ?? 0))
        .slice(0, 20);
    if (players.length === 0) return 'No defense data.';
    const rows = players.map((p, i) => [
        i + 1,
        p.account,
        p.profession ?? '?',
        p.defenseTotals?.deadCount ?? 0,
        p.defenseTotals?.downCount ?? 0,
        fmt(p.defenseTotals?.damageTaken ?? 0),
    ]);
    return `**Defense — ${scope}**\n\n${mdTable(['#', 'Player', 'Profession', 'Deaths', 'Downs', 'Dmg Taken'], rows, [0, 3, 4, 5])}`;
};

const extractSupport: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const players = ((stats?.supportPlayers ?? []) as any[])
        .filter(p => (p.supportTotals?.condiCleanse ?? 0) + (p.supportTotals?.boonStrips ?? 0) + (p.supportTotals?.resurrects ?? 0) > 0)
        .sort((a, b) => ((b.supportTotals?.condiCleanse ?? 0) + (b.supportTotals?.condiCleanseSelf ?? 0)) -
            ((a.supportTotals?.condiCleanse ?? 0) + (a.supportTotals?.condiCleanseSelf ?? 0)))
        .slice(0, 20);
    if (players.length === 0) return 'No support data.';
    const rows = players.map((p, i) => [
        i + 1,
        p.account,
        p.profession ?? '?',
        (p.supportTotals?.condiCleanse ?? 0) + (p.supportTotals?.condiCleanseSelf ?? 0),
        p.supportTotals?.boonStrips ?? 0,
        p.supportTotals?.resurrects ?? 0,
    ]);
    return `**Support — ${scope}**\n\n${mdTable(['#', 'Player', 'Profession', 'Cleanses', 'Strips', 'Rezzes'], rows, [0, 3, 4, 5])}`;
};

const extractBoons: ExtractFn = (logs, getDetails, _computedStats, fightIndex) => {
    const fights = loadedFights(logs, fightIndex);
    const parts: string[] = [];
    for (const [fi, log] of fights.entries()) {
        const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
        const players: any[] = details?.players ?? [];
        if (players.length === 0) continue;
        const label = fightLabel(log, fightIndex != null ? fightIndex : fi);
        const allBoons = boonUptimesForPlayers(players);
        const summaryRows = BOON_ORDER
            .filter(b => allBoons[b]?.length)
            .map(b => {
                const vals = allBoons[b];
                const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                return [b, pct(avg), pct(min), pct(max), vals.length];
            });
        if (summaryRows.length === 0) continue;
        // Per-group boon summary
        const byGroup = new Map<number, any[]>();
        for (const p of players) {
            const g = p.group ?? 0;
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g)!.push(p);
        }
        const groupRows = Array.from(byGroup.entries())
            .sort(([a], [b]) => a - b)
            .map(([g, gPlayers]) => {
                const boons = boonUptimesForPlayers(gPlayers);
                const summary = boonSummaryLine(boons) || '—';
                return [`G${g}`, gPlayers.length, summary];
            });
        const squadTable = mdTable(['Boon', 'Squad Avg', 'Min', 'Max', 'Players'], summaryRows, [1, 2, 3, 4]);
        const groupTable = mdTable(['Group', 'Players', 'Key Boons (avg)'], groupRows, [1]);
        parts.push(`**${label} — Boon Uptime**\n\n${squadTable}\n\n**${label} — Boons by Group**\n\n${groupTable}`);
    }
    return parts.join('\n\n') || 'No boon data.';
};

const extractGroups: ExtractFn = (logs, getDetails, _computedStats, fightIndex) => {
    const fights = loadedFights(logs, fightIndex);
    const parts: string[] = [];
    for (const [fi, log] of fights.entries()) {
        const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
        const players: any[] = details?.players ?? [];
        if (players.length === 0) continue;
        const label = fightLabel(log, fightIndex != null ? fightIndex : fi);
        const byGroup = new Map<number, any[]>();
        for (const p of players) {
            const g = p.group ?? 0;
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g)!.push(p);
        }
        const rows = Array.from(byGroup.entries())
            .sort(([a], [b]) => a - b)
            .map(([g, gPlayers]) => {
                const deaths = gPlayers.reduce((s: number, p: any) => s + (p.defenses?.[0]?.deadCount ?? 0), 0);
                const dmg = gPlayers.reduce((s: number, p: any) => s + (p.dpsAll?.[0]?.damage ?? 0), 0);
                const boons = boonUptimesForPlayers(gPlayers);
                const boonSummary = boonSummaryLine(boons) || '—';
                return [`G${g}`, gPlayers.length, fmt(dmg), deaths, boonSummary];
            });
        const table = mdTable(['Group', 'Players', 'Damage', 'Deaths', 'Key Boons (avg)'], rows, [1, 2, 3]);
        parts.push(`**${label} — Group Breakdown**\n\n${table}`);
    }
    return parts.join('\n\n') || 'No group data.';
};

const extractHealing: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const healers = ((stats?.healingPlayers ?? []) as any[])
        .filter(p => (p.healingTotals?.healing ?? 0) > 0)
        .sort((a, b) => (b.healingTotals?.healing ?? 0) - (a.healingTotals?.healing ?? 0))
        .slice(0, 15);
    if (healers.length === 0) return 'No healing data — healing stats may not be available in these logs.';
    const rows = healers.map((p, i) => {
        const healing = p.healingTotals?.healing ?? 0;
        const hps = p.activeMs > 0 ? Math.round(healing / (p.activeMs / 1000)) : 0;
        return [i + 1, p.account, p.profession ?? '?', fmt(healing), fmt(hps)];
    });
    return `**Healing — ${scope}**\n\n${mdTable(['#', 'Player', 'Profession', 'Healing', 'HPS'], rows, [0, 3, 4])}`;
};

const extractSkillsOutgoing: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const skills = ((stats?.topSkillsByDamage ?? []) as any[])
        .sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))
        .slice(0, 15);
    if (skills.length === 0) return 'No outgoing skill data.';
    const rows = skills.map((s, i) => [i + 1, s.name, fmt(s.damage ?? 0), fmt(s.downContribution ?? 0), s.hits ?? 0]);
    return `**Top Outgoing Skills — ${scope}**\n\n${mdTable(['#', 'Skill', 'Damage', 'Down Contrib', 'Hits'], rows, [0, 2, 3, 4])}`;
};

const extractSkillsIncoming: ExtractFn = (logs, getDetails, _computedStats, fightIndex) => {
    const fights = loadedFights(logs, fightIndex);
    const bySkill = new Map<string, { name: string; damage: number; hits: number }>();
    for (const log of fights) {
        const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
        if (!details) continue;
        const skillMap: Record<string, any> = details.skillMap ?? {};
        const buffMap: Record<string, any> = details.buffMap ?? {};
        for (const p of details.players ?? []) {
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
    }
    const sorted = Array.from(bySkill.values()).sort((a, b) => b.damage - a.damage).slice(0, 15);
    if (sorted.length === 0) return 'No incoming skill data.';
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const rows = sorted.map((s, i) => [i + 1, s.name, fmt(s.damage), s.hits]);
    return `**Top Incoming Enemy Skills — ${scope}**\n\n${mdTable(['#', 'Skill', 'Damage to Squad', 'Hits'], rows, [0, 2, 3])}`;
};

const extractMitigation: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const players = ((stats?.damageMitigationPlayers ?? []) as any[])
        .sort((a, b) => (b.mitigationTotals?.totalMitigation ?? 0) - (a.mitigationTotals?.totalMitigation ?? 0))
        .slice(0, 15);
    if (players.length === 0) return 'No mitigation data.';
    const rows = players.map((p, i) => {
        const m = p.mitigationTotals ?? {};
        return [i + 1, p.account, p.profession ?? '?', m.evaded ?? 0, m.blocked ?? 0, m.missed ?? 0, fmt(m.totalMitigation ?? 0)];
    });
    return `**Damage Mitigation — ${scope}**\n\n${mdTable(['#', 'Player', 'Profession', 'Evades', 'Blocks', 'Misses', 'Total Mitigated'], rows, [0, 3, 4, 5, 6])}`;
};

const extractConditions: ExtractFn = (logs, getDetails, computedStats, fightIndex) => {
    const stats = hydratedStats(logs, getDetails, fightIndex) ?? computedStats;
    const scope = fightIndex != null
        ? fightLabel(loadedFights(logs, fightIndex)[0] ?? logs[0], fightIndex)
        : 'all fights combined';
    const summary = ((stats?.outgoingConditionSummary ?? []) as any[]).slice(0, 15);
    if (summary.length === 0) return 'No condition data.';
    const rows = summary.map((c, i) => [i + 1, c.name, fmt(c.damage ?? 0), c.applications ?? 0]);
    return `**Conditions Applied to Enemies — ${scope}**\n\n${mdTable(['#', 'Condition', 'Damage', 'Applications'], rows, [0, 2, 3])}`;
};

// ── catalog ───────────────────────────────────────────────────────────────────

export const SECTION_CATALOG: (SectionDef & { extract: ExtractFn })[] = [
    {
        name: 'fight_overview',
        description: 'Per-fight outcome (WIN/LOSS), duration, squad size, squad deaths, enemy deaths, and K/D ratio.',
        keywords: ['win', 'loss', 'outcome', 'k/d', 'kd', 'kill', 'wipe', 'duration', 'how long', 'fight', 'overview', 'summary', 'tonight'],
        extract: extractFightOverview,
    },
    {
        name: 'offense',
        description: 'Per-player damage output, DPS, and CC (breakbar damage), sorted by damage.',
        keywords: ['damage', 'dps', 'offense', 'offensive', 'output', 'cc', 'breakbar', 'crowd control', 'hit', 'deal', 'top damage', 'most damage'],
        extract: extractOffense,
    },
    {
        name: 'defense',
        description: 'Per-player deaths, downs, and damage taken, sorted by death count.',
        keywords: ['death', 'die', 'died', 'down', 'downed', 'damage taken', 'defensive', 'survived', 'survive', 'dead', 'tanky'],
        extract: extractDefense,
    },
    {
        name: 'support',
        description: 'Per-player cleanse count, boon strip count, and resurrect count.',
        keywords: ['cleanse', 'strip', 'rez', 'resurrect', 'support', 'revive', 'condition removal', 'boon removal'],
        extract: extractSupport,
    },
    {
        name: 'boons',
        description: 'Per-fight squad-average boon uptime (Stability, Quickness, Alacrity, Might, Fury, etc.) with min/max/player-count and per-group breakdown.',
        keywords: ['boon', 'stability', 'quickness', 'alacrity', 'might', 'fury', 'aegis', 'protection', 'swiftness', 'uptime', 'coverage', 'buff'],
        extract: extractBoons,
    },
    {
        name: 'groups',
        description: 'Per-subgroup (G1–G5) aggregate: player count, total damage, deaths, and average boon uptime per group.',
        keywords: ['group', 'subgroup', 'g1', 'g2', 'g3', 'g4', 'g5', 'party', 'per group', 'each group', 'squad breakdown'],
        extract: extractGroups,
    },
    {
        name: 'healing',
        description: 'Per-player healing output (total healing, HPS) for fights with healing stats enabled.',
        keywords: ['heal', 'healer', 'hps', 'healing', 'barrier', 'regeneration', 'restore'],
        extract: extractHealing,
    },
    {
        name: 'skills_outgoing',
        description: 'Top squad skills ranked by outgoing damage or down contribution.',
        keywords: ['skill', 'ability', 'outgoing skill', 'our skill', 'what skill', 'most damage skill', 'down contribution', 'top skill'],
        extract: extractSkillsOutgoing,
    },
    {
        name: 'skills_incoming',
        description: 'Top enemy skills by total damage dealt to the squad.',
        keywords: ['incoming', 'enemy skill', 'hit us', 'hurt us', 'what killed', 'what hit', 'enemy attack', 'took damage from'],
        extract: extractSkillsIncoming,
    },
    {
        name: 'mitigation',
        description: 'Per-player evade count, block count, and total damage mitigated.',
        keywords: ['evade', 'dodge', 'block', 'mitigation', 'mitigate', 'defensive skill', 'avoid', 'miss'],
        extract: extractMitigation,
    },
    {
        name: 'conditions',
        description: 'Conditions applied to enemies sorted by total damage, with application counts.',
        keywords: ['condition', 'condi', 'burning', 'bleeding', 'torment', 'confusion', 'poison', 'chill', 'cripple', 'fear', 'immobilize', 'vulnerability'],
        extract: extractConditions,
    },
];

export function extractSection(
    name: SectionName,
    logs: ILogData[],
    getDetails: (id: string) => any,
    computedStats: any,
    fightIndex?: number,
): string {
    const def = SECTION_CATALOG.find(s => s.name === name);
    if (!def) return `Unknown section: ${name}`;
    return def.extract(logs, getDetails, computedStats, fightIndex);
}
