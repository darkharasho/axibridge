import axios from 'axios';
import FormData from 'form-data';
import { calculateAllStability, calculateDownContribution, calculateIncomingStats, calculateOutCC, calculateSquadBarrier, calculateSquadHealing } from '../shared/plenbot';
import { Player } from '../shared/dpsReportTypes';

// Embed stat settings interface
export interface IEmbedStatSettings {
    showSquadSummary: boolean;
    showEnemySummary: boolean;
    showIncomingStats: boolean;
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
}

// Default settings - all enabled except additional stats
const DEFAULT_EMBED_STATS: IEmbedStatSettings = {
    showSquadSummary: true,
    showEnemySummary: true,
    showIncomingStats: true,
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
};

// Discord embed limits
const DISCORD_EMBED_CHAR_LIMIT = 6000;
const DISCORD_EMBED_FIELD_LIMIT = 25;
const DISCORD_MAX_EMBEDS = 10;

export class DiscordNotifier {
    private webhookUrl: string | null = null;
    private embedStatSettings: IEmbedStatSettings = DEFAULT_EMBED_STATS;

    constructor() {
    }

    public setWebhookUrl(url: string | null) {
        this.webhookUrl = url;
    }

    public setEmbedStatSettings(settings: IEmbedStatSettings) {
        this.embedStatSettings = { ...DEFAULT_EMBED_STATS, ...settings };
    }

    public async sendLog(logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, imageBuffers?: Uint8Array[], suppressContent?: boolean, mode?: 'image' | 'embed' }, jsonDetails?: any) {
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
                    content = `**${jsonDetails?.fightName || 'Log Uploaded'}**\n[dps.report](${logData.permalink})`;
                }

                const payload: any = {
                    username: "GW2 Arc Log Uploader"
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

                    // Pre-calculate stability
                    calculateAllStability(players);

                    let embedFields: any[] = [];

                    const clampTopRows = (value: number) => Math.min(10, Math.max(1, Math.floor(value)));
                    const maxTopRows = clampTopRows(settings.maxTopListRows ?? 10);

                    // --- Helpers ---
                    const fmtNum = (n: number) => n.toLocaleString();

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

                    const profCounts: { [key: string]: number } = {};

                    players.forEach((p: any) => {
                        const isSquad = !p.notInSquad;

                        if (p.dpsAll && p.dpsAll.length > 0) {
                            const dps = p.dpsAll[0].dps;
                            const dmg = p.dpsAll[0].damage;
                            totalDps += dps;
                            totalDmg += dmg;
                            if (isSquad) {
                                squadDps += dps;
                                squadDmg += dmg;
                            }
                        }
                        if (p.defenses && p.defenses.length > 0) {
                            const d = p.defenses[0];
                            totalDowns += d.downCount;
                            totalDeaths += d.deadCount;
                            totalDmgTaken += d.damageTaken || 0;

                            if (isSquad) {
                                squadDowns += d.downCount;
                                squadDeaths += d.deadCount;
                            }

                            totalMiss += d.missedCount || 0;
                            totalBlock += d.blockedCount || 0;
                            totalEvade += d.evadedCount || 0;
                            totalDodge += d.dodgeCount || 0;
                            // Uses PlenBot logic below instead of simple fields for CC/Strips
                        }
                        const pStats = calculateIncomingStats(p);
                        totalCCTaken += pStats.cc.total;
                        totalCCMissed += pStats.cc.missed;
                        totalCCBlocked += pStats.cc.blocked;

                        totalStripsTaken += pStats.strips.total;
                        totalStripsMissed += pStats.strips.missed;
                        totalStripsBlocked += pStats.strips.blocked;

                        const prof = p.profession;
                        profCounts[prof] = (profCounts[prof] || 0) + 1;
                    });

                    // Calculate Enemy (Target) Stats - how many times WE downed/killed them
                    // We aggregate from player statsTargets, which records what each player did to targets
                    const targets = jsonDetails.targets || [];
                    let enemyDowns = 0;
                    let enemyDeaths = 0;
                    let enemyCount = 0;

                    // Count non-fake targets
                    targets.forEach((t: any) => {
                        if (!t.isFake) enemyCount++;
                    });

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
                    const durationSec = jsonDetails.durationMS ? jsonDetails.durationMS / 1000 : 1;
                    const totalIncomingDps = Math.round(totalDmgTaken / durationSec);

                    // Build Description
                    let desc = `**Recorded by:** ${jsonDetails.recordedBy || 'Unknown'}\n`;
                    desc += `**Duration:** ${jsonDetails.duration || jsonDetails.encounterDuration || 'Unknown'}\n`;
                    desc += `**Elite Insights version:** ${jsonDetails.eliteInsightsVersion || 'Unknown'}\n`;
                    desc += `**arcdps version:** ${jsonDetails.arcVersion || 'Unknown'}\n`;

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
                            formatStatLine('DMG:', fmtNum(squadDmg)),
                            formatStatLine('DPS:', fmtNum(squadDps)),
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
                        const enemySummaryLines = [
                            formatStatLine('Count:', enemyCount),
                            formatStatLine('DMG:', fmtNum(totalDmgTaken)),
                            formatStatLine('DPS:', fmtNum(totalIncomingDps)),
                            formatStatLine('Downs:', enemyDowns),
                            formatStatLine('Kills:', enemyDeaths)
                        ].join('\n');

                        embedFields.push({
                            name: "Enemy Summary:",
                            value: `\`\`\`\n${enemySummaryLines}\n\`\`\``,
                            inline: true
                        });
                    }

                    // Add spacer if we showed summary sections
                    if (settings.showSquadSummary || settings.showEnemySummary) {
                        embedFields.push({ name: '\u200b', value: '\u200b', inline: false });
                    }

                    // Line 2: Incoming Attacks | Incoming CC | Incoming Strips (conditionally shown)
                    if (settings.showIncomingStats) {
                        const formatIncoming = (val1: number, val2: number, total: number) => {
                            return [
                                `Miss/Blk:  ${(val1 + val2).toString().padStart(6)}`,
                                `Total:     ${total.toString().padStart(6)}`
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
                        const top = [...players].sort(sortFn).slice(0, maxTopRows);

                        // Calculate the maximum value width for this specific list
                        let maxValueWidth = 0;
                        const formattedValues: string[] = [];
                        top.forEach(p => {
                            const val = valFn(p);
                            const formatted = fmtVal(val);
                            formattedValues.push(formatted);
                            maxValueWidth = Math.max(maxValueWidth, formatted.length);
                        });

                        // Discord embed inline field max width is ~25 chars in monospace
                        // Format: "RR NAME... VALUE" where RR=rank (2 chars + 1 space)
                        const MAX_LINE_WIDTH = 26
                        const RANK_WIDTH = 3; // "10 " = 3 chars
                        const MIN_SEPARATOR = 1; // At least 1 space between name and value
                        const availableWidth = MAX_LINE_WIDTH - RANK_WIDTH - MIN_SEPARATOR;
                        const nameWidth = availableWidth - maxValueWidth;

                        let str = "";
                        top.forEach((p, i) => {
                            const val = valFn(p);
                            if (val > 0 || (typeof val === 'string' && val !== '0' && val !== '')) {
                                const rank = (i + 1).toString().padEnd(2);
                                const fullName = p.name || p.character_name || p.account || 'Unknown';
                                const name = fullName.substring(0, nameWidth).padEnd(nameWidth);
                                const vStr = formattedValues[i].padStart(maxValueWidth);
                                str += `${rank} ${name} ${vStr}\n`;
                            }
                        });
                        if (!str) str = "No Data\n";
                        embedFields.push({
                            name: title + ":",
                            value: `\`\`\`\n${str}\`\`\``,
                            inline: true
                        });
                    };

                    const getTargetStatTotal = (p: any, key: 'killed' | 'downed') => {
                        if (!p.statsTargets) return 0;
                        return p.statsTargets.reduce((sum: number, targetStats: any) => {
                            if (!targetStats || targetStats.length === 0) return sum;
                            const st = targetStats[0];
                            return sum + (st?.[key] || 0);
                        }, 0);
                    };

                    const getDistanceToTag = (p: any) => {
                        const stats = p.statsAll?.[0];
                        const distToCom = stats?.distToCom;
                        if (distToCom !== undefined && distToCom !== null) {
                            return distToCom;
                        }
                        const stackDist = stats?.stackDist;
                        return stackDist || 0;
                    };
                    const getResurrects = (p: any) => p.support?.[0]?.resurrects || 0;
                    const getBreakbarDamage = (p: any) => p.dpsAll?.[0]?.breakbarDamage || 0;
                    const getDamageTaken = (p: any) => p.defenses?.[0]?.damageTaken || 0;
                    const getDeaths = (p: any) => p.defenses?.[0]?.deadCount || 0;
                    const getDodges = (p: any) => p.defenses?.[0]?.dodgeCount || 0;

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
                                sortFn: (a: any, b: any) => (b.dpsAll?.[0]?.damage || 0) - (a.dpsAll?.[0]?.damage || 0),
                                valFn: (p: any) => p.dpsAll?.[0]?.damage || 0,
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showDownContribution,
                                title: "Down Contribution",
                                sortFn: (a: any, b: any) => calculateDownContribution(b) - calculateDownContribution(a),
                                valFn: (p: any) => calculateDownContribution(p),
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showHealing,
                                title: "Healing",
                                sortFn: (a: any, b: any) => calculateSquadHealing(b) - calculateSquadHealing(a),
                                valFn: (p: any) => calculateSquadHealing(p),
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showBarrier,
                                title: "Barrier",
                                sortFn: (a: any, b: any) => calculateSquadBarrier(b) - calculateSquadBarrier(a),
                                valFn: (p: any) => calculateSquadBarrier(p),
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showCleanses,
                                title: "Cleanses",
                                sortFn: (a: any, b: any) => ((b.support?.[0]?.condiCleanse || 0) + (b.support?.[0]?.condiCleanseSelf || 0)) - ((a.support?.[0]?.condiCleanse || 0) + (a.support?.[0]?.condiCleanseSelf || 0)),
                                valFn: (p: any) => (p.support?.[0]?.condiCleanse || 0) + (p.support?.[0]?.condiCleanseSelf || 0),
                                fmtVal: (v: any) => v.toString()
                            },
                            {
                                enabled: settings.showBoonStrips,
                                title: "Boon Strips",
                                sortFn: (a: any, b: any) => (b.support?.[0]?.boonStrips || 0) - (a.support?.[0]?.boonStrips || 0),
                                valFn: (p: any) => p.support?.[0]?.boonStrips || 0,
                                fmtVal: (v: any) => v.toString()
                            },
                            {
                                enabled: settings.showCC,
                                title: "CC",
                                sortFn: (a: any, b: any) => calculateOutCC(b) - calculateOutCC(a),
                                valFn: (p: any) => calculateOutCC(p),
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showStability,
                                title: "Stability",
                                sortFn: (a: any, b: any) => (b.stabGeneration || 0) - (a.stabGeneration || 0),
                                valFn: (p: any) => p.stabGeneration || 0,
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showResurrects,
                                title: "Resurrects",
                                sortFn: (a: any, b: any) => getResurrects(b) - getResurrects(a),
                                valFn: (p: any) => getResurrects(p),
                                fmtVal: (v: any) => v.toString()
                            },
                            {
                                enabled: settings.showDistanceToTag,
                                title: "Distance to Tag",
                                sortFn: (a: any, b: any) => getDistanceToTag(a) - getDistanceToTag(b),
                                valFn: (p: any) => getDistanceToTag(p),
                                fmtVal: (v: any) => v.toFixed(1)
                            },
                            {
                                enabled: settings.showKills,
                                title: "Kills",
                                sortFn: (a: any, b: any) => getTargetStatTotal(b, 'killed') - getTargetStatTotal(a, 'killed'),
                                valFn: (p: any) => getTargetStatTotal(p, 'killed'),
                                fmtVal: (v: any) => v.toString()
                            },
                            {
                                enabled: settings.showDowns,
                                title: "Downs",
                                sortFn: (a: any, b: any) => getTargetStatTotal(b, 'downed') - getTargetStatTotal(a, 'downed'),
                                valFn: (p: any) => getTargetStatTotal(p, 'downed'),
                                fmtVal: (v: any) => v.toString()
                            },
                            {
                                enabled: settings.showBreakbarDamage,
                                title: "Breakbar Damage",
                                sortFn: (a: any, b: any) => getBreakbarDamage(b) - getBreakbarDamage(a),
                                valFn: (p: any) => getBreakbarDamage(p),
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showDamageTaken,
                                title: "Damage Taken",
                                sortFn: (a: any, b: any) => getDamageTaken(b) - getDamageTaken(a),
                                valFn: (p: any) => getDamageTaken(p),
                                fmtVal: (v: any) => v.toLocaleString()
                            },
                            {
                                enabled: settings.showDeaths,
                                title: "Deaths",
                                sortFn: (a: any, b: any) => getDeaths(b) - getDeaths(a),
                                valFn: (p: any) => getDeaths(p),
                                fmtVal: (v: any) => v.toString()
                            },
                            {
                                enabled: settings.showDodges,
                                title: "Dodges",
                                sortFn: (a: any, b: any) => getDodges(b) - getDodges(a),
                                valFn: (p: any) => getDodges(p),
                                fmtVal: (v: any) => v.toString()
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
                        title: `${jsonDetails.fightName || 'Log Uploaded'}`,
                        url: logData.permalink,
                        description: desc,
                        color: getEmbedColor(jsonDetails.fightName),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `GW2 Arc Log Uploader • ${new Date().toLocaleTimeString()}`
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
                        username: "GW2 Arc Log Uploader",
                        embeds
                    });
                    console.log("Sent complex Discord notification.");
                } else {
                    // Fallback Simple Embed
                    await axios.post(this.webhookUrl, {
                        username: "GW2 Arc Log Uploader",
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
