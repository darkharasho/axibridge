import axios from 'axios';
import FormData from 'form-data';
import {
    applyStabilityGeneration,
    getPlayerDamage,
    getPlayerDps,
    getPlayerDownsTaken,
    getPlayerDownContribution,
    getPlayerBreakbarDamage,
    getPlayerCleanses,
    getPlayerDamageTaken,
    getPlayerDeaths,
    getPlayerDistanceToTag,
    getPlayerDodges,
    getPlayerMissed,
    getPlayerBlocked,
    getPlayerEvaded,
    getPlayerResurrects,
    getPlayerSquadHealing,
    getPlayerSquadBarrier,
    getPlayerOutgoingCrowdControl,
    getPlayerStrips,
    getIncomingDisruptions,
    getTargetStatTotal,
} from '../shared/dashboardMetrics';
import { DEFAULT_DISRUPTION_METHOD, DisruptionMethod } from '../shared/metricsSettings';
import { getProfessionAbbrev, getProfessionEmoji } from '../shared/professionUtils';
import { Player } from '../shared/dpsReportTypes';

const DISCORD_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/darkharasho/ArcBridge/main/public/img/ArcBridgeDiscord.png';

// Embed stat settings interface
export interface IEmbedStatSettings {
    showSquadSummary: boolean;
    showEnemySummary: boolean;
    showIncomingStats: boolean;
    showClassSummary: boolean;
    showDamage: boolean;
    showDownContribution: boolean;
    showHealing: boolean;
    showBarrier: boolean;
    showCleanses: boolean;
    showBoonStrips: boolean;
    showCC: boolean;
    showStability: boolean;
    showResurrects: boolean;
    showDistanceToTag: boolean;
    showKills: boolean;
    showDowns: boolean;
    showBreakbarDamage: boolean;
    showDamageTaken: boolean;
    showDeaths: boolean;
    showDodges: boolean;
    maxTopListRows: number;
    classDisplay: 'off' | 'short' | 'emoji';
}

// Default settings - all enabled except additional stats
const DEFAULT_EMBED_STATS: IEmbedStatSettings = {
    showSquadSummary: true,
    showEnemySummary: true,
    showIncomingStats: true,
    showClassSummary: true,
    showDamage: true,
    showDownContribution: true,
    showHealing: true,
    showBarrier: true,
    showCleanses: true,
    showBoonStrips: true,
    showCC: true,
    showStability: true,
    showResurrects: false,
    showDistanceToTag: false,
    showKills: false,
    showDowns: false,
    showBreakbarDamage: false,
    showDamageTaken: false,
    showDeaths: false,
    showDodges: false,
    maxTopListRows: 10,
    classDisplay: 'off',
};

// Discord embed limits
const DISCORD_EMBED_CHAR_LIMIT = 6000;
const DISCORD_EMBED_FIELD_LIMIT = 25;
const DISCORD_MAX_EMBEDS = 10;

const resolveFightTimestampMs = (jsonDetails: any, logData: any) => {
    const raw = jsonDetails?.timeStartStd
        ?? jsonDetails?.timeStart
        ?? jsonDetails?.uploadTime
        ?? logData?.uploadTime;
    if (raw === undefined || raw === null || raw === '') return 0;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return raw > 1e12 ? raw : raw * 1000;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(String(raw));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const cleanFightMapLabel = (rawFightName: any) => {
    return String(rawFightName || 'Unknown Map')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();
};

const formatFightTitleForDiscord = (jsonDetails: any, logData: any) => {
    const timestampMs = resolveFightTimestampMs(jsonDetails, logData);
    const mapLabel = cleanFightMapLabel(jsonDetails?.fightName);
    const dateLabel = timestampMs > 0
        ? new Date(timestampMs).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
        + ' '
        + new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : '';
    if (dateLabel && mapLabel) return `${dateLabel} - ${mapLabel}`;
    if (mapLabel) return mapLabel;
    return jsonDetails?.fightName || 'Log Uploaded';
};

const normalizeTeamId = (raw: any): number | null => {
    const value = raw?.teamID ?? raw?.teamId ?? raw?.team;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const resolveTargetProfession = (target: any): string => {
    const direct = String(target?.profession || '').trim();
    if (direct) return direct;
    const name = String(target?.name || '').trim();
    if (!name) return '';
    const match = name.match(/^(.+?)\s+pl-\d+$/i);
    if (match?.[1]) return match[1].trim();
    return '';
};

const computeEnemyTeamBreakdown = (players: any[], targets: any[], durationSec: number) => {
    const allyTeamIds = new Set<number>();
    players.forEach((player: any) => {
        if (player?.notInSquad) return;
        const teamId = normalizeTeamId(player);
        if (teamId !== null) allyTeamIds.add(teamId);
    });

    const targetIndexTeamId = new Map<number, number>();
    const enemyTeamCountMap = new Map<number, number>();
    const enemyTeamDmgMap = new Map<number, number>();
    const enemyTeamDmgFallbackMap = new Map<number, number>();
    const enemyTeamClassMap = new Map<number, Record<string, number>>();
    const seenEnemyIdsByTeam = new Map<number, Set<string>>();
    targets.forEach((target: any, index: number) => {
        if (target?.isFake) return;
        if (target?.enemyPlayer === false) return;
        const teamId = normalizeTeamId(target);
        if (teamId === null || allyTeamIds.has(teamId)) return;
        targetIndexTeamId.set(index, teamId);
        if (!seenEnemyIdsByTeam.has(teamId)) {
            seenEnemyIdsByTeam.set(teamId, new Set());
        }
        const seen = seenEnemyIdsByTeam.get(teamId)!;
        const rawName = String(target?.name || `target-${index}`);
        const rawId = target?.instanceID ?? target?.instid ?? target?.id ?? rawName;
        const uniqueKey = String(rawId ?? rawName);
        if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            enemyTeamCountMap.set(teamId, (enemyTeamCountMap.get(teamId) || 0) + 1);
        }
        const targetDamage = Number(target?.dpsAll?.[0]?.damage || 0);
        if (targetDamage > 0) {
            enemyTeamDmgMap.set(teamId, (enemyTeamDmgMap.get(teamId) || 0) + targetDamage);
        }

        const profession = resolveTargetProfession(target);
        if (profession) {
            if (!enemyTeamClassMap.has(teamId)) enemyTeamClassMap.set(teamId, {});
            const classCounts = enemyTeamClassMap.get(teamId)!;
            classCounts[profession] = (classCounts[profession] || 0) + 1;
        }
    });

    players.forEach((player: any) => {
        if (!player?.notInSquad) return;
        const teamId = normalizeTeamId(player);
        if (teamId === null || allyTeamIds.has(teamId)) return;
        enemyTeamCountMap.set(teamId, (enemyTeamCountMap.get(teamId) || 0) + 1);
        const playerDamage = getPlayerDamage(player);
        if (playerDamage > 0) {
            enemyTeamDmgFallbackMap.set(teamId, (enemyTeamDmgFallbackMap.get(teamId) || 0) + playerDamage);
        }
        const profession = String(player?.profession || '').trim();
        if (profession) {
            if (!enemyTeamClassMap.has(teamId)) enemyTeamClassMap.set(teamId, {});
            const classCounts = enemyTeamClassMap.get(teamId)!;
            if (classCounts[profession] === undefined) {
                classCounts[profession] = 1;
            }
        }
    });
    enemyTeamDmgFallbackMap.forEach((fallbackDamage, teamId) => {
        const targetDamage = enemyTeamDmgMap.get(teamId) || 0;
        if (targetDamage <= 0 && fallbackDamage > 0) {
            enemyTeamDmgMap.set(teamId, fallbackDamage);
        }
    });

    const enemyTeamDownsMap = new Map<number, number>();
    const enemyTeamKillsMap = new Map<number, number>();
    players.forEach((player: any) => {
        if (player?.notInSquad) return;
        if (!Array.isArray(player?.statsTargets)) return;
        player.statsTargets.forEach((targetStats: any, index: number) => {
            if (!Array.isArray(targetStats) || targetStats.length === 0) return;
            const teamId = targetIndexTeamId.get(index);
            if (teamId === undefined) return;
            const phase = targetStats[0] || {};
            enemyTeamDownsMap.set(teamId, (enemyTeamDownsMap.get(teamId) || 0) + (phase.downed || 0));
            enemyTeamKillsMap.set(teamId, (enemyTeamKillsMap.get(teamId) || 0) + (phase.killed || 0));
        });
    });

    const teamIds = Array.from(new Set<number>([
        ...enemyTeamCountMap.keys(),
        ...enemyTeamDmgMap.keys(),
        ...enemyTeamDownsMap.keys(),
        ...enemyTeamKillsMap.keys()
    ])).sort((a, b) => a - b);

    return teamIds.map((teamId) => {
        const dmg = enemyTeamDmgMap.get(teamId) || 0;
        const classCounts = enemyTeamClassMap.get(teamId) || {};
        return {
            teamId,
            count: enemyTeamCountMap.get(teamId) || 0,
            dmg,
            dps: Math.round(dmg / durationSec),
            downs: enemyTeamDownsMap.get(teamId) || 0,
            kills: enemyTeamKillsMap.get(teamId) || 0,
            classCounts
        };
    });
};

export class DiscordNotifier {
    private webhookUrl: string | null = null;
    private embedStatSettings: IEmbedStatSettings = DEFAULT_EMBED_STATS;
    private disruptionMethod: DisruptionMethod = DEFAULT_DISRUPTION_METHOD;

    constructor() {
    }

    public setWebhookUrl(url: string | null) {
        this.webhookUrl = url;
    }

    public setEmbedStatSettings(settings: IEmbedStatSettings) {
        this.embedStatSettings = { ...DEFAULT_EMBED_STATS, ...settings };
    }

    public setDisruptionMethod(method: DisruptionMethod) {
        this.disruptionMethod = method || DEFAULT_DISRUPTION_METHOD;
    }

    public async sendLog(logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, imageBuffers?: Uint8Array[], suppressContent?: boolean, mode?: 'image' | 'embed', splitEnemiesByTeam?: boolean }, jsonDetails?: any) {
        if (!this.webhookUrl) {
            console.log("No webhook URL configured, skipping Discord notification.");
            return;
        }

        const mode = logData.imageBuffer ? 'image' : (logData.mode || 'embed');
        console.log(`[Discord] sending log. Mode: ${mode}`);

        try {
            if (mode === 'image' && (logData.imageBuffer || logData.imageBuffers)) {
                // IMAGE MODE: Plain text with suppression + PNG attachment
                const form = new FormData();

                // User Request:
                // 1. Stats Share (id='stats-dashboard'): Image ONLY.
                // 2. Individual Logs: Image + dps.report Link.

                let content = '';
                if (logData.id !== 'stats-dashboard' && !logData.suppressContent) {
                    content = `**${formatFightTitleForDiscord(jsonDetails, logData)}**\n[dps.report](${logData.permalink})`;
                }

                const payload: any = {
                    username: "ArcBridge",
                    avatar_url: DISCORD_WEBHOOK_AVATAR_URL
                };

                if (content) {
                    payload.content = content;
                }

                form.append('payload_json', JSON.stringify(payload));

                if (logData.imageBuffers && logData.imageBuffers.length > 0) {
                    logData.imageBuffers.forEach((buffer, index) => {
                        form.append(`file${index + 1}`, Buffer.from(buffer), {
                            filename: `log_summary_${index + 1}.png`,
                            contentType: 'image/png'
                        });
                    });
                } else if (logData.imageBuffer) {
                    form.append('file', Buffer.from(logData.imageBuffer), {
                        filename: 'log_summary.png',
                        contentType: 'image/png'
                    });
                }

                await axios.post(this.webhookUrl, form, {
                    headers: form.getHeaders()
                });
                console.log("Sent Discord notification with image.");
            } else {
                // EMBED MODE: Complex Rich Embed based on GitHub reference
                if (jsonDetails && (jsonDetails.evtc || jsonDetails.players)) {
                    console.log('[Discord] Building Complex Rich Embed...');
                    const players: Player[] = jsonDetails.players || [];
                    const settings = this.embedStatSettings;
                    const splitEnemiesByTeam = Boolean(logData.splitEnemiesByTeam);

                    // Pre-calculate stability
                    applyStabilityGeneration(players, { durationMS: jsonDetails.durationMS, buffMap: jsonDetails.buffMap });

                    let embedFields: any[] = [];

                    const clampTopRows = (value: number) => Math.min(10, Math.max(1, Math.floor(value)));
                    const maxTopRows = clampTopRows(settings.maxTopListRows ?? 10);

                    // --- Helpers ---
                    const fmtInt = (n: number) => Math.round(n).toLocaleString();

                    let totalDps = 0;
                    let totalDmg = 0;
                    let totalDowns = 0;
                    let totalDeaths = 0;
                    let totalDmgTaken = 0;

                    let totalMiss = 0;
                    let totalBlock = 0;
                    let totalEvade = 0;
                    let totalDodge = 0;

                    let squadDps = 0;
                    let squadDmg = 0;
                    let squadDowns = 0;
                    let squadDeaths = 0;

                    let totalCCTaken = 0;
                    let totalCCMissed = 0;
                    let totalCCBlocked = 0;

                    let totalStripsTaken = 0;
                    let totalStripsMissed = 0;
                    let totalStripsBlocked = 0;

                    const squadClassCounts: { [key: string]: number } = {};
                    const enemyClassCounts: { [key: string]: number } = {};

                    players.forEach((p: any) => {
                        const isSquad = !p.notInSquad;

                        const dps = getPlayerDps(p);
                        const dmg = getPlayerDamage(p);
                        totalDps += dps;
                        totalDmg += dmg;
                        if (isSquad) {
                            squadDps += dps;
                            squadDmg += dmg;
                        }
                        if (p.defenses && p.defenses.length > 0) {
                            const d = p.defenses[0];
                            totalDowns += getPlayerDownsTaken(p);
                            totalDeaths += getPlayerDeaths(p);
                            totalDmgTaken += getPlayerDamageTaken(p);

                            if (isSquad) {
                                squadDowns += getPlayerDownsTaken(p);
                                squadDeaths += getPlayerDeaths(p);
                            }

                            totalMiss += getPlayerMissed(p);
                            totalBlock += getPlayerBlocked(p);
                            totalEvade += getPlayerEvaded(p);
                            totalDodge += getPlayerDodges(p);
                            // Uses per-skill weighting for CC/Strips instead of raw summary fields
                        }
                        const pStats = getIncomingDisruptions(p, this.disruptionMethod);
                        totalCCTaken += pStats.cc.total;
                        totalCCMissed += pStats.cc.missed;
                        totalCCBlocked += pStats.cc.blocked;

                        totalStripsTaken += pStats.strips.total;
                        totalStripsMissed += pStats.strips.missed;
                        totalStripsBlocked += pStats.strips.blocked;

                        if (isSquad) {
                            const prof = p.profession || 'Unknown';
                            squadClassCounts[prof] = (squadClassCounts[prof] || 0) + 1;
                        }
                    });

                    // Calculate Enemy (Target) Stats - how many times WE downed/killed them
                    // We aggregate from player statsTargets, which records what each player did to targets
                    const targets = jsonDetails.targets || [];
                    let enemyDowns = 0;
                    let enemyDeaths = 0;
                    let enemyCount = 0;
                    const durationSec = jsonDetails.durationMS ? jsonDetails.durationMS / 1000 : 1;
                    const enemyTeams = computeEnemyTeamBreakdown(players as any[], targets, durationSec || 1);

                    // Count non-fake targets
                    targets.forEach((t: any) => {
                        if (!t.isFake) enemyCount++;
                    });
                    if (enemyCount === 0) {
                        enemyCount = players.filter((p: any) => p.notInSquad).length;
                    }

                    const fromPlayers: Record<string, number> = {};
                    const enemyPlayers = players.filter((p: any) => p.notInSquad);
                    enemyPlayers.forEach((p: any) => {
                        const prof = String(p?.profession || '').trim();
                        if (!prof) return;
                        fromPlayers[prof] = (fromPlayers[prof] || 0) + 1;
                    });

                    const fromTargets: Record<string, number> = {};
                    if (targets && Array.isArray(targets)) {
                        const seenEnemyIdsInFight = new Set<string>();
                        targets.forEach((t: any) => {
                            if (t?.isFake) return;
                            if (t?.enemyPlayer === false) return;
                            const rawName = t?.name || 'Unknown';
                            const rawId = t?.instanceID ?? t?.instid ?? t?.id ?? rawName;
                            const idKey = rawId !== undefined && rawId !== null ? String(rawId) : rawName;
                            if (seenEnemyIdsInFight.has(idKey)) return;
                            seenEnemyIdsInFight.add(idKey);

                            const cleanName = String(rawName)
                                .replace(/\s+pl-\d+$/i, '')
                                .replace(/\s*\([^)]*\)/, '')
                                .trim();
                            fromTargets[cleanName] = (fromTargets[cleanName] || 0) + 1;
                        });
                    }
                    const playerTotal = Object.values(fromPlayers).reduce((sum, count) => sum + count, 0);
                    const targetTotal = Object.values(fromTargets).reduce((sum, count) => sum + count, 0);
                    const minExpectedFromPlayers = Math.max(3, Math.floor(enemyCount * 0.6));
                    const usePlayerCounts = playerTotal > 0 && (enemyCount === 0 || playerTotal >= minExpectedFromPlayers || targetTotal === 0);
                    Object.assign(enemyClassCounts, usePlayerCounts ? fromPlayers : fromTargets);

                    // Aggregate downed/killed from statsTargets
                    players.forEach((p: any) => {
                        if (p.notInSquad) return; // Only count squad contributions
                        if (p.statsTargets && p.statsTargets.length > 0) {
                            p.statsTargets.forEach((targetStats: any) => {
                                if (targetStats && targetStats.length > 0) {
                                    const st = targetStats[0]; // Phase 0
                                    enemyDowns += st.downed || 0;
                                    enemyDeaths += st.killed || 0;
                                }
                            });
                        }
                    });

                    // Parse Duration
                    const totalIncomingDps = Math.round(totalDmgTaken / durationSec);

                    // Build Description
                    let desc = `**Recorded by:** ${jsonDetails.recordedBy || 'Unknown'}\n`;
                    desc += `**Duration:** ${jsonDetails.duration || jsonDetails.encounterDuration || 'Unknown'}\n`;

                    // Line 1: Squad Summary | Team Summary (Enemy)
                    const formatStatLine = (label: string, value: string | number) => {
                        const paddedLabel = label.padEnd(8);
                        return `${paddedLabel}${value}`;
                    };

                    const squadPlayers = players.filter((p: any) => !p.notInSquad);
                    const nonSquadPlayers = players.filter((p: any) => p.notInSquad);

                    // Squad Summary (conditionally shown)
                    if (settings.showSquadSummary) {
                        const squadSummaryLines = [
                            formatStatLine('Count:', nonSquadPlayers.length > 0 ? `${squadPlayers.length} (+${nonSquadPlayers.length})` : squadPlayers.length),
                            formatStatLine('DMG:', fmtInt(squadDmg)),
                            formatStatLine('DPS:', fmtInt(squadDps)),
                            formatStatLine('Downs:', squadDowns),
                            formatStatLine('Deaths:', squadDeaths)
                        ].join('\n');

                        embedFields.push({
                            name: "Squad Summary:",
                            value: `\`\`\`\n${squadSummaryLines}\n\`\`\``,
                            inline: true
                        });
                    }

                    // Enemy Summary (conditionally shown)
                    if (settings.showEnemySummary) {
                        if (splitEnemiesByTeam && enemyTeams.length > 0) {
                            enemyTeams.forEach((team) => {
                                const teamSummaryLines = [
                                    formatStatLine('Count:', team.count),
                                    formatStatLine('DMG:', fmtInt(team.dmg)),
                                    formatStatLine('DPS:', fmtInt(team.dps)),
                                    formatStatLine('Downs:', team.downs),
                                    formatStatLine('Kills:', team.kills)
                                ].join('\n');
                                embedFields.push({
                                    name: `Team ${team.teamId}:`,
                                    value: `\`\`\`\n${teamSummaryLines}\n\`\`\``,
                                    inline: true
                                });
                            });
                        } else {
                            const enemySummaryLines = [
                                formatStatLine('Count:', enemyCount),
                                formatStatLine('DMG:', fmtInt(totalDmgTaken)),
                                formatStatLine('DPS:', fmtInt(totalIncomingDps)),
                                formatStatLine('Downs:', enemyDowns),
                                formatStatLine('Kills:', enemyDeaths)
                            ].join('\n');

                            embedFields.push({
                                name: "Enemy Summary:",
                                value: `\`\`\`\n${enemySummaryLines}\n\`\`\``,
                                inline: true
                            });
                        }
                    }

                    const formatClassLines = (counts: Record<string, number>, useAbbrev = true, maxItems?: number, includeSummary?: boolean, maxColumns?: number) => {
                        const entries = Object.entries(counts)
                            .filter(([, count]) => count > 0)
                            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
                            .map(([profession, count]) => {
                                const labelText = useAbbrev
                                    ? getProfessionAbbrev(profession).toUpperCase().padEnd(3, ' ')
                                    : profession.toUpperCase();
                                const label = `${labelText}:`;
                                return `${label} ${count}`;
                            });
                        if (entries.length === 0) return 'No Data';

                        let limitedEntries = (() => {
                            if (!maxItems || entries.length <= maxItems) {
                                return entries;
                            }
                            const overflowTotal = entries
                                .slice(maxItems)
                                .reduce((sum, entry) => sum + Number(entry.split(':')[1] || 0), 0);
                            const base = entries.slice(0, maxItems);
                            if (!includeSummary || overflowTotal <= 0) return base;
                            return [...base, `+ ${overflowTotal}`];
                        })();

                        const maxRows = 5;
                        if (maxColumns && maxColumns > 0) {
                            const maxVisibleEntries = maxRows * maxColumns;
                            if (limitedEntries.length > maxVisibleEntries) {
                                const overflowStart = Math.max(0, maxVisibleEntries - 1);
                                const overflowTotal = limitedEntries
                                    .slice(overflowStart)
                                    .reduce((sum, entry) => {
                                        if (entry.startsWith('+')) {
                                            return sum + Number(entry.replace('+', '').trim() || 0);
                                        }
                                        return sum + Number(entry.split(':')[1] || 0);
                                    }, 0);
                                limitedEntries = [
                                    ...limitedEntries.slice(0, overflowStart),
                                    `+ ${overflowTotal}`
                                ];
                            }
                        }
                        const columns: string[][] = [];
                        for (let i = 0; i < limitedEntries.length; i += maxRows) {
                            columns.push(limitedEntries.slice(i, i + maxRows));
                        }
                        const colWidth = Math.max(...limitedEntries.map(entry => entry.length)) + 2;
                        const lines: string[] = [];
                        for (let row = 0; row < maxRows; row += 1) {
                            const line = columns
                                .map(col => (col[row] || '').padEnd(colWidth))
                                .join('')
                                .trimEnd();
                            lines.push(line);
                        }
                        return lines.join('\n').trimEnd();
                    };

                    if (settings.showClassSummary && (settings.showSquadSummary || settings.showEnemySummary)) {
                        embedFields.push({ name: '\u200b', value: '\u200b', inline: false });
                    }

                    if (settings.showClassSummary && settings.showSquadSummary) {
                        embedFields.push({
                            name: "Squad Classes:",
                            value: `\`\`\`\n${formatClassLines(squadClassCounts)}\n\`\`\``,
                            inline: true
                        });
                    }

                    if (settings.showClassSummary && settings.showEnemySummary) {
                        if (splitEnemiesByTeam && enemyTeams.length > 0) {
                            enemyTeams.forEach((team) => {
                                embedFields.push({
                                    name: `Team ${team.teamId} Classes:`,
                                    value: `\`\`\`\n${formatClassLines(team.classCounts, true, undefined, true, 2)}\n\`\`\``,
                                    inline: true
                                });
                            });
                        } else {
                            embedFields.push({
                                name: "Enemy Classes:",
                                value: `\`\`\`\n${formatClassLines(enemyClassCounts, true, 14, true)}\n\`\`\``,
                                inline: true
                            });
                        }
                    }

                    // Add spacer if we showed summary sections
                    if (settings.showSquadSummary || settings.showEnemySummary) {
                        embedFields.push({ name: '\u200b', value: '\u200b', inline: false });
                    }

                    // Line 2: Incoming Attacks | Incoming CC | Incoming Strips (conditionally shown)
                    if (settings.showIncomingStats) {
                        const formatIncoming = (val1: number, val2: number, total: number) => {
                            const missBlock = Math.round(val1 + val2);
                            const totalRounded = Math.round(total);
                            return [
                                `Miss/Blk:  ${missBlock.toString().padStart(6)}`,
                                `Total:     ${totalRounded.toString().padStart(6)}`
                            ].join('\n');
                        };

                        embedFields.push({
                            name: "Incoming Attacks:",
                            value: `\`\`\`\n${formatIncoming(totalMiss, totalBlock, totalMiss + totalBlock + totalEvade + totalDodge)}\n\`\`\``,
                            inline: true
                        });
                        embedFields.push({
                            name: "Incoming CC:",
                            value: `\`\`\`\n${formatIncoming(totalCCMissed, totalCCBlocked, totalCCTaken)}\n\`\`\``,
                            inline: true
                        });
                        embedFields.push({
                            name: "Incoming Strips:",
                            value: `\`\`\`\n${formatIncoming(totalStripsMissed, totalStripsBlocked, totalStripsTaken)}\n\`\`\``,
                            inline: true
                        });
                    }

                    // --- Top Lists Helper ---
                    const addTopList = (title: string, sortFn: (a: any, b: any) => number, valFn: (p: any) => any, fmtVal: (v: any) => string) => {
                        const top = [...players].filter((p: any) => !p.notInSquad).sort(sortFn).slice(0, maxTopRows);
                        const classDisplay = settings.classDisplay ?? 'off';
                        const getClassToken = (p: any) => {
                            if (classDisplay === 'short') {
                                return getProfessionAbbrev(p.profession || 'Unknown');
                            }
                            if (classDisplay === 'emoji') {
                                return getProfessionEmoji(p.profession || 'Unknown');
                            }
                            return '';
                        };

                        // Calculate the maximum value width for this specific list
                        let maxValueWidth = 0;
                        const formattedValues: string[] = [];
                        top.forEach(p => {
                            const val = valFn(p);
                            const formatted = fmtVal(val);
                            formattedValues.push(formatted);
                            maxValueWidth = Math.max(maxValueWidth, formatted.length);
                        });
                        maxValueWidth = Math.max(1, maxValueWidth);

                        // Discord embed inline field max width is ~25 chars in monospace
                        // Format: "RR NAME... VALUE" where RR=rank (2 chars + 1 space)
                        const MAX_LINE_WIDTH = 26
                        const RANK_WIDTH = 3; // "10 " = 3 chars
                        const MIN_SEPARATOR = 1; // At least 1 space between name and value
                        const availableWidth = MAX_LINE_WIDTH - RANK_WIDTH - MIN_SEPARATOR;
                        const nameWidth = Math.max(0, availableWidth - maxValueWidth);

                        let str = "";
                        for (let i = 0; i < maxTopRows; i += 1) {
                            const p = top[i];
                            if (p) {
                                const val = valFn(p);
                                if (val > 0 || (typeof val === 'string' && val !== '0' && val !== '')) {
                                    const rank = (i + 1).toString().padEnd(2);
                                    const fullName = p.name || p.character_name || p.account || 'Unknown';
                                    const classToken = getClassToken(p);
                                    const classCell = classToken
                                        ? (classDisplay === 'emoji' ? `${classToken} ` : `[${classToken}] `)
                                        : '';
                                    const availableNameWidth = Math.max(0, nameWidth - classCell.length);
                                    const trimmedName = fullName.substring(0, availableNameWidth).padEnd(availableNameWidth);
                                    const name = `${classCell}${trimmedName}`.padEnd(nameWidth);
                                    const vStr = formattedValues[i]?.padStart(maxValueWidth) || ''.padStart(maxValueWidth);
                                    str += `${rank} ${name} ${vStr}\n`;
                                    continue;
                                }
                            }
                            const rank = '  ';
                            const name = ''.padEnd(nameWidth);
                            const vStr = ''.padStart(maxValueWidth);
                            str += `${rank} ${name} ${vStr}\n`;
                        }
                        embedFields.push({
                            name: title + ":",
                            value: `\`\`\`\n${str}\`\`\``,
                            inline: true
                        });
                    };

                    const getDistanceToTag = (p: any) => getPlayerDistanceToTag(p);
                    const getResurrects = (p: any) => getPlayerResurrects(p);
                    const getBreakbarDamage = (p: any) => getPlayerBreakbarDamage(p);
                    const getDamageTaken = (p: any) => getPlayerDamageTaken(p);
                    const getDeaths = (p: any) => getPlayerDeaths(p);
                    const getDodges = (p: any) => getPlayerDodges(p);

                    const topListItems: Array<{
                        enabled: boolean;
                        title: string;
                        sortFn: (a: any, b: any) => number;
                        valFn: (p: any) => any;
                        fmtVal: (v: any) => string;
                    }> = [
                            {
                                enabled: settings.showDamage,
                                title: "Damage",
                                sortFn: (a: any, b: any) => getPlayerDamage(b) - getPlayerDamage(a),
                                valFn: (p: any) => getPlayerDamage(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showDownContribution,
                                title: "Down Contribution",
                                sortFn: (a: any, b: any) => getPlayerDownContribution(b) - getPlayerDownContribution(a),
                                valFn: (p: any) => getPlayerDownContribution(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showHealing,
                                title: "Healing",
                                sortFn: (a: any, b: any) => getPlayerSquadHealing(b) - getPlayerSquadHealing(a),
                                valFn: (p: any) => getPlayerSquadHealing(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showBarrier,
                                title: "Barrier",
                                sortFn: (a: any, b: any) => getPlayerSquadBarrier(b) - getPlayerSquadBarrier(a),
                                valFn: (p: any) => getPlayerSquadBarrier(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showCleanses,
                                title: "Cleanses",
                                sortFn: (a: any, b: any) => getPlayerCleanses(b) - getPlayerCleanses(a),
                                valFn: (p: any) => getPlayerCleanses(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showBoonStrips,
                                title: "Boon Strips",
                                sortFn: (a: any, b: any) => getPlayerStrips(b, this.disruptionMethod) - getPlayerStrips(a, this.disruptionMethod),
                                valFn: (p: any) => getPlayerStrips(p, this.disruptionMethod),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showCC,
                                title: "CC",
                                sortFn: (a: any, b: any) => getPlayerOutgoingCrowdControl(b, this.disruptionMethod) - getPlayerOutgoingCrowdControl(a, this.disruptionMethod),
                                valFn: (p: any) => getPlayerOutgoingCrowdControl(p, this.disruptionMethod),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showStability,
                                title: "Stability",
                                sortFn: (a: any, b: any) => (b.stabGeneration || 0) - (a.stabGeneration || 0),
                                valFn: (p: any) => p.stabGeneration || 0,
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showResurrects,
                                title: "Resurrects",
                                sortFn: (a: any, b: any) => getResurrects(b) - getResurrects(a),
                                valFn: (p: any) => getResurrects(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showDistanceToTag,
                                title: "Distance to Tag",
                                sortFn: (a: any, b: any) => getDistanceToTag(a) - getDistanceToTag(b),
                                valFn: (p: any) => getDistanceToTag(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showKills,
                                title: "Kills",
                                sortFn: (a: any, b: any) => getTargetStatTotal(b, 'killed') - getTargetStatTotal(a, 'killed'),
                                valFn: (p: any) => getTargetStatTotal(p, 'killed'),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showDowns,
                                title: "Downs",
                                sortFn: (a: any, b: any) => getTargetStatTotal(b, 'downed') - getTargetStatTotal(a, 'downed'),
                                valFn: (p: any) => getTargetStatTotal(p, 'downed'),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showBreakbarDamage,
                                title: "Breakbar Damage",
                                sortFn: (a: any, b: any) => getBreakbarDamage(b) - getBreakbarDamage(a),
                                valFn: (p: any) => getBreakbarDamage(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showDamageTaken,
                                title: "Damage Taken",
                                sortFn: (a: any, b: any) => getDamageTaken(b) - getDamageTaken(a),
                                valFn: (p: any) => getDamageTaken(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showDeaths,
                                title: "Deaths",
                                sortFn: (a: any, b: any) => getDeaths(b) - getDeaths(a),
                                valFn: (p: any) => getDeaths(p),
                        fmtVal: (v: any) => fmtInt(v)
                            },
                            {
                                enabled: settings.showDodges,
                                title: "Dodges",
                                sortFn: (a: any, b: any) => getDodges(b) - getDodges(a),
                                valFn: (p: any) => getDodges(p),
                        fmtVal: (v: any) => fmtInt(v)
                            }
                        ];

                    const enabledTopLists = topListItems.filter(item => item.enabled);
                    if (enabledTopLists.length > 0) {
                        const lastField = embedFields[embedFields.length - 1];
                        if (lastField?.inline) {
                            embedFields.push({ name: '\u200b', value: '\u200b', inline: false });
                        }

                        let rowCount = 0;
                        enabledTopLists.forEach((item, index) => {
                            addTopList(item.title, item.sortFn, item.valFn, item.fmtVal);
                            rowCount += 1;
                            const isRowEnd = rowCount === 2;
                            const isLast = index === enabledTopLists.length - 1;
                            if (isRowEnd && !isLast) {
                                embedFields.push({ name: '\u200b', value: '\u200b', inline: false });
                                rowCount = 0;
                            }
                        });

                    }

                    // Determine embed color based on borderland
                    // WvW map names: "Detailed WvW - Red Desert Borderlands", "Detailed WvW - Blue Alpine Borderlands", etc.
                    const getEmbedColor = (fightName: string): number => {
                        const name = (fightName || '').toLowerCase();

                        // Check specific borderland patterns
                        if (name.includes('red desert') || name.includes('red borderland') || name.includes('desert borderlands')) {
                            return 0xE74C3C; // Red
                        } else if (name.includes('blue alpine') || name.includes('blue borderland')) {
                            return 0x3498DB; // Blue
                        } else if (name.includes('green alpine') || name.includes('green borderland')) {
                            return 0x2ECC71; // Green
                        } else if (name.includes('eternal battleground') || name.includes('ebg') || name.includes('stonemist')) {
                            return 0xFFFFFF; // White for EBG
                        }

                        // Default: success = green, failure = red
                        return jsonDetails.success ? 0x2ECC71 : 0xE74C3C;
                    };

                    const baseEmbed = {
                        title: formatFightTitleForDiscord(jsonDetails, logData),
                        url: logData.permalink,
                        description: desc,
                        color: getEmbedColor(jsonDetails.fightName),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `ArcBridge • ${new Date().toLocaleTimeString()}`
                        }
                    };

                    const getEmbedBaseCharCount = (embed: typeof baseEmbed) => {
                        return (embed.title?.length || 0)
                            + (embed.description?.length || 0)
                            + (embed.footer?.text?.length || 0);
                    };

                    const getFieldCharCount = (field: { name?: string; value?: string }) => {
                        return (field.name?.length || 0) + (field.value?.length || 0);
                    };

                    const buildEmbeds = (fields: any[]) => {
                        if (fields.length === 0) {
                            return [{ ...baseEmbed, fields: [] }];
                        }
                        const embeds: any[] = [];
                        const baseCharCount = getEmbedBaseCharCount(baseEmbed);
                        let currentFields: any[] = [];
                        let currentCharCount = baseCharCount;

                        const flush = () => {
                            if (currentFields.length === 0) return;
                            embeds.push({ ...baseEmbed, fields: currentFields });
                            currentFields = [];
                            currentCharCount = baseCharCount;
                        };

                        const pushField = (field: any) => {
                            const isBlank = field.name === '\u200b' && field.value === '\u200b';
                            const fieldCharCount = getFieldCharCount(field);
                            const wouldExceedFieldLimit = currentFields.length >= DISCORD_EMBED_FIELD_LIMIT;
                            const wouldExceedCharLimit = currentCharCount + fieldCharCount > DISCORD_EMBED_CHAR_LIMIT;

                            if ((wouldExceedFieldLimit || wouldExceedCharLimit) && currentFields.length > 0) {
                                flush();
                            }

                            if (isBlank && currentFields.length === 0) {
                                return;
                            }

                            currentFields.push(field);
                            currentCharCount += fieldCharCount;
                        };

                        for (const field of fields) {
                            pushField(field);
                        }

                        flush();

                        if (embeds.length > DISCORD_MAX_EMBEDS) {
                            console.warn(`[Discord] Truncating embeds from ${embeds.length} to ${DISCORD_MAX_EMBEDS} due to Discord limits.`);
                            return embeds.slice(0, DISCORD_MAX_EMBEDS);
                        }

                        return embeds;
                    };

                    const embeds = buildEmbeds(embedFields);

                    await axios.post(this.webhookUrl, {
                        username: "ArcBridge",
                        avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                        embeds
                    });
                    console.log("Sent complex Discord notification.");
                } else {
                    // Fallback Simple Embed
                    await axios.post(this.webhookUrl, {
                        username: "ArcBridge",
                        avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                        embeds: [{
                            title: "Log Uploaded",
                            description: `**Log:** [${logData.filePath.split(/[\\\/]/).pop()}](${logData.permalink})`,
                            color: 3447003,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
            }
        } catch (error) {
            console.error("Failed to send Discord notification:", error);
        }
    }
}
