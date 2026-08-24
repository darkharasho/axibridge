import { normalizeAccountName } from './playerIdentity';

/**
 * Report-level aggregation over PUBLISHED report.json payloads ({ meta, stats }).
 * Defensive by design: published schemas vary across AxiBridge versions, so every
 * field read is optional and failures surface as warnings or ReportSchemaError —
 * never silent drops.
 */

export class ReportSchemaError extends Error {}

const num = (value: unknown): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
};

export interface RunPlayerSummary {
    account: string;
    profession: string;
    professionList: string[];
    combatTimeMs: number;
    squadTimeMs: number;
    classTimes: Array<{ profession: string; timeMs: number }>;
    damage: number;
    downContribution: number;
    kills: number;
    downsCaused: number;
    strips: number;
    cleanses: number;
    resurrects: number;
    healing: number;
    barrier: number;
    hasHealAddon: boolean;
    damageTaken: number;
    downs: number;
    deaths: number;
    logsJoined: number;
}

export interface RunSummary {
    id: string;
    title: string;
    dateStart: string | null;
    dateEnd: string | null;
    fights: number;
    wins: number;
    losses: number;
    avgSquadSize: number | null;
    avgEnemies: number | null;
    squadDeaths: number;
    squadDowns: number;
    enemyDeaths: number;
    enemyDowns: number;
    commanders: string[];
    players: RunPlayerSummary[];
    warnings: string[];
}

export const extractRunSummary = (report: unknown): RunSummary => {
    const payload = report as { meta?: any; stats?: any } | null;
    const id = String(payload?.meta?.id ?? '').trim();
    if (!id) throw new ReportSchemaError('report has no meta.id — not an AxiBridge report.json');
    const stats = payload?.stats ?? {};
    const warnings: string[] = [];

    const byAccount = new Map<string, RunPlayerSummary>();
    const ensure = (row: any): RunPlayerSummary | null => {
        const account = normalizeAccountName(String(row?.account ?? '').trim());
        if (!account || account === 'Unknown') return null;
        let entry = byAccount.get(account);
        if (!entry) {
            entry = {
                account,
                profession: String(row?.profession ?? 'Unknown'),
                professionList: Array.isArray(row?.professionList) ? row.professionList.map(String) : [],
                combatTimeMs: 0, squadTimeMs: 0, classTimes: [],
                damage: 0, downContribution: 0, kills: 0, downsCaused: 0,
                strips: 0, cleanses: 0, resurrects: 0,
                healing: 0, barrier: 0, hasHealAddon: false,
                damageTaken: 0, downs: 0, deaths: 0, logsJoined: 0
            };
            byAccount.set(account, entry);
        }
        return entry;
    };

    const tables = ['offensePlayers', 'supportPlayers', 'healingPlayers', 'defensePlayers', 'generalPlayers', 'attendanceData'];
    if (!tables.some((key) => Array.isArray(stats?.[key]) && stats[key].length > 0)) {
        warnings.push('no player tables in report');
    }

    for (const row of Array.isArray(stats?.offensePlayers) ? stats.offensePlayers : []) {
        const p = ensure(row);
        if (!p) continue;
        p.damage += num(row?.offenseTotals?.damage);
        p.downContribution += num(row?.offenseTotals?.downContribution);
        p.kills += num(row?.offenseTotals?.killed);
        p.downsCaused += num(row?.offenseTotals?.downed);
        p.strips = Math.max(p.strips, num(row?.offenseTotals?.boonStrips));
    }
    for (const row of Array.isArray(stats?.supportPlayers) ? stats.supportPlayers : []) {
        const p = ensure(row);
        if (!p) continue;
        // arcdps parity, matching the desktop Support table's default scope and
        // the Discord embed: squad + self + conditions cleansed off squad
        // pets/minions. This previously read `condiCleanse` alone, which both
        // dropped self-cleanses (roughly a fifth of the total) and disagreed
        // with every other cleanse number the app reports. Older published
        // reports carry neither of the two extra keys, so they degrade to the
        // same value this line produced before.
        p.cleanses += num(row?.supportTotals?.condiCleanse)
            + num(row?.supportTotals?.condiCleanseSelf)
            + num(row?.supportTotals?.condiCleanseMinions);
        p.strips = Math.max(p.strips, num(row?.supportTotals?.boonStrips));
        p.resurrects += num(row?.supportTotals?.resurrects);
        p.logsJoined = Math.max(p.logsJoined, num(row?.logsJoined));
    }
    for (const row of Array.isArray(stats?.healingPlayers) ? stats.healingPlayers : []) {
        const p = ensure(row);
        if (!p) continue;
        p.healing += num(row?.healingTotals?.squadHealing ?? row?.healingTotals?.healing);
        p.barrier += num(row?.healingTotals?.squadBarrier ?? row?.healingTotals?.barrier);
        if (row?.hasHealAddon === true) p.hasHealAddon = true;
    }
    for (const row of Array.isArray(stats?.defensePlayers) ? stats.defensePlayers : []) {
        const p = ensure(row);
        if (!p) continue;
        p.damageTaken += num(row?.defenseTotals?.damageTaken);
        p.downs += num(row?.defenseTotals?.downCount);
        p.deaths += num(row?.defenseTotals?.deadCount);
    }
    for (const row of Array.isArray(stats?.generalPlayers) ? stats.generalPlayers : []) {
        const p = ensure(row);
        if (!p) continue;
        p.combatTimeMs = Math.max(p.combatTimeMs, num(row?.squadActiveMs ?? row?.totalFightMs));
        p.logsJoined = Math.max(p.logsJoined, num(row?.logsJoined));
    }
    for (const row of Array.isArray(stats?.attendanceData) ? stats.attendanceData : []) {
        const p = ensure(row);
        if (!p) continue;
        p.combatTimeMs = Math.max(p.combatTimeMs, num(row?.combatTimeMs));
        p.squadTimeMs = Math.max(p.squadTimeMs, num(row?.squadTimeMs));
        if (Array.isArray(row?.classTimes)) {
            p.classTimes = row.classTimes
                .map((c: any) => ({ profession: String(c?.profession ?? ''), timeMs: num(c?.timeMs) }))
                .filter((c: { profession: string; timeMs: number }) => c.profession && c.timeMs > 0);
        }
    }

    return {
        id,
        title: String(payload?.meta?.title ?? id),
        dateStart: payload?.meta?.dateStart ?? null,
        dateEnd: payload?.meta?.dateEnd ?? null,
        fights: num(stats?.total),
        wins: num(stats?.wins),
        losses: num(stats?.losses),
        avgSquadSize: typeof stats?.avgSquadSize === 'number' ? stats.avgSquadSize : null,
        avgEnemies: typeof stats?.avgEnemies === 'number' ? stats.avgEnemies : null,
        squadDeaths: num(stats?.totalSquadDeaths),
        squadDowns: num(stats?.totalSquadDowns),
        enemyDeaths: num(stats?.totalEnemyDeaths),
        enemyDowns: num(stats?.totalEnemyDowns),
        commanders: Array.isArray(payload?.meta?.commanders) ? payload.meta.commanders.map(String) : [],
        players: Array.from(byAccount.values()),
        warnings
    };
};

export interface PlayerAggregate {
    account: string;
    runsJoined: number;
    combatTimeMs: number;
    squadTimeMs: number;
    professionTimeMs: Record<string, number>;
    damage: number;
    dps: number;
    downContribution: number;
    kills: number;
    strips: number;
    cleanses: number;
    resurrects: number;
    healing: number;
    barrier: number;
    damageTaken: number;
    downs: number;
    deaths: number;
    lastSeen: string | null;
}

export const aggregatePlayers = (summaries: RunSummary[], accounts?: string[]): PlayerAggregate[] => {
    const wanted = accounts && accounts.length > 0
        ? new Set(accounts.map((a) => a.toLowerCase()))
        : null;
    const map = new Map<string, PlayerAggregate>();
    for (const run of summaries) {
        for (const p of run.players) {
            if (wanted && !wanted.has(p.account.toLowerCase())) continue;
            let agg = map.get(p.account);
            if (!agg) {
                agg = {
                    account: p.account, runsJoined: 0, combatTimeMs: 0, squadTimeMs: 0,
                    professionTimeMs: {}, damage: 0, dps: 0, downContribution: 0, kills: 0,
                    strips: 0, cleanses: 0, resurrects: 0, healing: 0, barrier: 0,
                    damageTaken: 0, downs: 0, deaths: 0, lastSeen: null
                };
                map.set(p.account, agg);
            }
            agg.runsJoined += 1;
            agg.combatTimeMs += p.combatTimeMs;
            agg.squadTimeMs += p.squadTimeMs;
            for (const c of p.classTimes) {
                agg.professionTimeMs[c.profession] = (agg.professionTimeMs[c.profession] || 0) + c.timeMs;
            }
            agg.damage += p.damage;
            agg.downContribution += p.downContribution;
            agg.kills += p.kills;
            agg.strips += p.strips;
            agg.cleanses += p.cleanses;
            agg.resurrects += p.resurrects;
            agg.healing += p.healing;
            agg.barrier += p.barrier;
            agg.damageTaken += p.damageTaken;
            agg.downs += p.downs;
            agg.deaths += p.deaths;
            const seen = run.dateEnd ?? run.dateStart;
            if (seen && (!agg.lastSeen || seen > agg.lastSeen)) agg.lastSeen = seen;
        }
    }
    const rows = Array.from(map.values());
    for (const row of rows) {
        row.dps = row.combatTimeMs > 0 ? row.damage / (row.combatTimeMs / 1000) : 0;
    }
    return rows.sort((a, b) => b.damage - a.damage);
};

const RUN_SET_METRICS = [
    'fights', 'wins', 'losses', 'squadDeaths', 'squadDowns', 'enemyDeaths', 'enemyDowns'
] as const;

export interface RunSetComparison {
    metrics: Array<{ metric: string; a: number; b: number; delta: number; deltaPct: number | null }>;
}

export const compareRunSets = (a: RunSummary[], b: RunSummary[]): RunSetComparison => {
    const total = (runs: RunSummary[], metric: (typeof RUN_SET_METRICS)[number]) =>
        runs.reduce((sum, run) => sum + num(run[metric]), 0);
    return {
        metrics: RUN_SET_METRICS.map((metric) => {
            const va = total(a, metric);
            const vb = total(b, metric);
            return { metric, a: va, b: vb, delta: vb - va, deltaPct: va !== 0 ? (vb - va) / va : null };
        })
    };
};
