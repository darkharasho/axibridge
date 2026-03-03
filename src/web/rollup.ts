export interface RollupCommanderRow {
    account: string;
    characterNames: string[];
    profession: string;
    runs: number;
    fightsLed: number;
    kills: number;
    downs: number;
    commanderDeaths: number;
    alliesDead: number;
    wins: number;
    losses: number;
    kdr: number;
    lastSeenTs: number;
}

export interface RollupPlayerRow {
    account: string;
    characterNames: string[];
    profession: string;
    runs: number;
    combatTimeMs: number;
    squadTimeMs: number;
    lastSeenTs: number;
}

export interface RollupData {
    commanderRows: RollupCommanderRow[];
    playerRows: RollupPlayerRow[];
    sourceReports: number;
    uniqueRaids: number;
    duplicateReportsCollapsed: number;
    raidsSkippedMissingRequiredData: number;
    reportsWithCommanderDetails: number;
    reportsMissingCommanderDetails: number;
    reportsWithAttendanceDetails: number;
    reportsMissingAttendanceDetails: number;
}

type RollupReportPayload = {
    meta?: {
        id?: string;
        title?: string;
        dateStart?: string;
        dateEnd?: string;
        generatedAt?: string;
        commanders?: string[];
    };
    stats?: {
        commanderStats?: { rows?: any[] };
        attendanceData?: any[];
    };
};

type CommanderAccumulator = {
    account: string;
    characterNames: Set<string>;
    professionCounts: Record<string, number>;
    runs: number;
    fightsLed: number;
    kills: number;
    downs: number;
    commanderDeaths: number;
    alliesDead: number;
    wins: number;
    losses: number;
    lastSeenTs: number;
};

type PlayerAccumulator = {
    account: string;
    characterNames: Set<string>;
    professionTimeMs: Record<string, number>;
    runs: number;
    combatTimeMs: number;
    squadTimeMs: number;
    lastSeenTs: number;
};

const toFiniteNumber = (value: unknown): number => {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
};

const parseTimestamp = (meta?: { dateEnd?: string; dateStart?: string }): number => {
    const candidates = [meta?.dateEnd, meta?.dateStart];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const parsed = new Date(candidate).getTime();
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return 0;
};

const parseGeneratedTimestamp = (meta?: { generatedAt?: string; dateEnd?: string; dateStart?: string }): number => {
    const generated = meta?.generatedAt ? new Date(meta.generatedAt).getTime() : 0;
    if (Number.isFinite(generated) && generated > 0) {
        return generated;
    }
    return parseTimestamp(meta);
};

const buildRaidKey = (report: RollupReportPayload, fallbackIndex: number): string => {
    const dateStart = String(report?.meta?.dateStart || '').trim();
    const dateEnd = String(report?.meta?.dateEnd || '').trim();
    if (dateStart || dateEnd) {
        return `${dateStart}|${dateEnd}`;
    }
    const id = String(report?.meta?.id || '').trim();
    if (id) return id;
    return `report-${fallbackIndex}`;
};

const choosePrimaryProfession = (professionTimeMs: Record<string, number>, fallback = 'Unknown'): string => {
    const entries = Object.entries(professionTimeMs)
        .filter(([profession, timeMs]) => profession && timeMs > 0)
        .sort((a, b) => {
            const delta = b[1] - a[1];
            if (delta !== 0) return delta;
            return a[0].localeCompare(b[0]);
        });
    return entries[0]?.[0] || fallback;
};

const chooseMostCommonProfession = (professionCounts: Record<string, number>, fallback = 'Unknown'): string => {
    const entries = Object.entries(professionCounts)
        .filter(([profession, count]) => profession && count > 0)
        .sort((a, b) => {
            const delta = b[1] - a[1];
            if (delta !== 0) return delta;
            return a[0].localeCompare(b[0]);
        });
    return entries[0]?.[0] || fallback;
};

export const buildRollupData = (reports: RollupReportPayload[]): RollupData => {
    const uniqueRaidKeys = new Set<string>();
    const reportsByRaid = new Map<string, Array<{ report: RollupReportPayload; generatedTs: number; index: number }>>();
    reports.forEach((report, index) => {
        const raidKey = buildRaidKey(report, index);
        uniqueRaidKeys.add(raidKey);
        const generatedTs = parseGeneratedTimestamp(report?.meta);
        if (!reportsByRaid.has(raidKey)) {
            reportsByRaid.set(raidKey, []);
        }
        reportsByRaid.get(raidKey)!.push({ report, generatedTs, index });
    });

    const raidGroups = Array.from(reportsByRaid.values())
        .sort((a, b) => {
            const aLatest = Math.max(...a.map((entry) => entry.generatedTs || 0));
            const bLatest = Math.max(...b.map((entry) => entry.generatedTs || 0));
            if (bLatest !== aLatest) return bLatest - aLatest;
            const aIndex = Math.max(...a.map((entry) => entry.index));
            const bIndex = Math.max(...b.map((entry) => entry.index));
            return bIndex - aIndex;
        })
        .map((entries) => [...entries].sort((a, b) => {
            if (b.generatedTs !== a.generatedTs) return b.generatedTs - a.generatedTs;
            return b.index - a.index;
        }));

    const commanders = new Map<string, CommanderAccumulator>();
    const players = new Map<string, PlayerAccumulator>();
    let reportsWithCommanderDetails = 0;
    let reportsMissingCommanderDetails = 0;
    let reportsWithAttendanceDetails = 0;
    let reportsMissingAttendanceDetails = 0;
    let includedRaidGroups = 0;
    let includedSourceReports = 0;

    raidGroups.forEach((group) => {
        const attendanceSource = group.find((entry) => Array.isArray(entry.report?.stats?.attendanceData) && entry.report.stats!.attendanceData!.length > 0) || null;
        const attendanceReport = attendanceSource?.report || null;
        const attendanceTimestamp = attendanceReport ? parseTimestamp(attendanceReport.meta) : 0;
        const attendanceRows = Array.isArray(attendanceReport?.stats?.attendanceData)
            ? attendanceReport!.stats!.attendanceData!
            : [];

        if (attendanceRows.length > 0) {
            reportsWithAttendanceDetails += 1;
        } else {
            reportsMissingAttendanceDetails += 1;
        }

        const latestCommanderRowsByAccount = new Map<string, { row: any; timestamp: number; generatedTs: number; index: number }>();
        group.forEach((entry) => {
            const report = entry.report;
            const timestamp = parseTimestamp(report?.meta);
            const commanderRows = Array.isArray(report?.stats?.commanderStats?.rows)
                ? report.stats.commanderStats.rows
                : [];
            commanderRows.forEach((row: any) => {
                const account = String(row?.account || row?.key || '').trim();
                if (!account) return;
                const existing = latestCommanderRowsByAccount.get(account);
                if (!existing) {
                    latestCommanderRowsByAccount.set(account, { row, timestamp, generatedTs: entry.generatedTs, index: entry.index });
                    return;
                }
                const shouldReplace = entry.generatedTs > existing.generatedTs
                    || (entry.generatedTs === existing.generatedTs && entry.index > existing.index);
                if (shouldReplace) {
                    latestCommanderRowsByAccount.set(account, { row, timestamp, generatedTs: entry.generatedTs, index: entry.index });
                }
            });
        });

        if (latestCommanderRowsByAccount.size > 0) {
            reportsWithCommanderDetails += 1;
        } else {
            reportsMissingCommanderDetails += 1;
        }

        // Only aggregate raid windows that have the complete modern data required for
        // both tables. This keeps the headline counts aligned with the rows rendered.
        if (attendanceRows.length === 0 || latestCommanderRowsByAccount.size === 0) {
            return;
        }

        includedRaidGroups += 1;
        includedSourceReports += group.length;

        attendanceRows.forEach((row) => {
            const account = String(row?.account || '').trim();
            if (!account || account === 'Unknown') return;
            const existing = players.get(account) || {
                account,
                characterNames: new Set<string>(),
                professionTimeMs: {},
                runs: 0,
                combatTimeMs: 0,
                squadTimeMs: 0,
                lastSeenTs: 0
            };
            existing.runs += 1;
            existing.combatTimeMs += Math.max(0, toFiniteNumber(row?.combatTimeMs));
            existing.squadTimeMs += Math.max(0, toFiniteNumber(row?.squadTimeMs));
            existing.lastSeenTs = Math.max(existing.lastSeenTs, attendanceTimestamp);

            if (Array.isArray(row?.characterNames)) {
                row.characterNames.forEach((name: unknown) => {
                    const normalized = String(name || '').trim();
                    if (normalized) existing.characterNames.add(normalized);
                });
            }

            const classTimes = Array.isArray(row?.classTimes) ? row.classTimes : [];
            classTimes.forEach((classRow: any) => {
                const profession = String(classRow?.profession || '').trim();
                if (!profession || profession === 'Unknown') return;
                existing.professionTimeMs[profession] = (existing.professionTimeMs[profession] || 0)
                    + Math.max(0, toFiniteNumber(classRow?.timeMs));
            });

            players.set(account, existing);
        });

        latestCommanderRowsByAccount.forEach(({ row, timestamp }) => {
            const account = String(row?.account || row?.key || '').trim();
            if (!account) return;
            const existing = commanders.get(account) || {
                account,
                characterNames: new Set<string>(),
                professionCounts: {},
                runs: 0,
                fightsLed: 0,
                kills: 0,
                downs: 0,
                commanderDeaths: 0,
                alliesDead: 0,
                wins: 0,
                losses: 0,
                lastSeenTs: 0
            };
            existing.runs += 1;
            existing.fightsLed += Math.max(0, toFiniteNumber(row?.fights));
            existing.kills += Math.max(0, toFiniteNumber(row?.kills));
            existing.downs += Math.max(0, toFiniteNumber(row?.downs));
            existing.commanderDeaths += Math.max(0, toFiniteNumber(row?.commanderDeaths));
            existing.alliesDead += Math.max(0, toFiniteNumber(row?.alliesDead));
            existing.wins += Math.max(0, toFiniteNumber(row?.wins));
            existing.losses += Math.max(0, toFiniteNumber(row?.losses));
            existing.lastSeenTs = Math.max(existing.lastSeenTs, timestamp);

            if (Array.isArray(row?.characterNames)) {
                row.characterNames.forEach((name: unknown) => {
                    const normalized = String(name || '').trim();
                    if (normalized) existing.characterNames.add(normalized);
                });
            }
            const profession = String(row?.profession || '').trim();
            if (profession) {
                existing.professionCounts[profession] = (existing.professionCounts[profession] || 0) + 1;
            }

            commanders.set(account, existing);
        });
    });

    const commanderRows: RollupCommanderRow[] = Array.from(commanders.values())
        .map((entry) => {
            const kdr = entry.alliesDead > 0
                ? entry.kills / entry.alliesDead
                : entry.kills;
            return {
                account: entry.account,
                characterNames: Array.from(entry.characterNames.values()).sort((a, b) => a.localeCompare(b)),
                profession: chooseMostCommonProfession(entry.professionCounts),
                runs: entry.runs,
                fightsLed: entry.fightsLed,
                kills: entry.kills,
                downs: entry.downs,
                commanderDeaths: entry.commanderDeaths,
                alliesDead: entry.alliesDead,
                wins: entry.wins,
                losses: entry.losses,
                kdr,
                lastSeenTs: entry.lastSeenTs
            };
        })
        .sort((a, b) => {
            if (b.runs !== a.runs) return b.runs - a.runs;
            if (b.fightsLed !== a.fightsLed) return b.fightsLed - a.fightsLed;
            if (b.kills !== a.kills) return b.kills - a.kills;
            return a.account.localeCompare(b.account);
        });

    const playerRows: RollupPlayerRow[] = Array.from(players.values())
        .map((entry) => ({
            account: entry.account,
            characterNames: Array.from(entry.characterNames.values()).sort((a, b) => a.localeCompare(b)),
            profession: choosePrimaryProfession(entry.professionTimeMs),
            runs: entry.runs,
            combatTimeMs: entry.combatTimeMs,
            squadTimeMs: entry.squadTimeMs,
            lastSeenTs: entry.lastSeenTs
        }))
        .sort((a, b) => {
            if (b.runs !== a.runs) return b.runs - a.runs;
            if (b.lastSeenTs !== a.lastSeenTs) return b.lastSeenTs - a.lastSeenTs;
            if (b.squadTimeMs !== a.squadTimeMs) return b.squadTimeMs - a.squadTimeMs;
            return a.account.localeCompare(b.account);
        });

    return {
        commanderRows,
        playerRows,
        sourceReports: reports.length,
        uniqueRaids: includedRaidGroups,
        duplicateReportsCollapsed: Math.max(0, includedSourceReports - includedRaidGroups),
        raidsSkippedMissingRequiredData: Math.max(0, raidGroups.length - includedRaidGroups),
        reportsWithCommanderDetails,
        reportsMissingCommanderDetails,
        reportsWithAttendanceDetails,
        reportsMissingAttendanceDetails
    };
};
