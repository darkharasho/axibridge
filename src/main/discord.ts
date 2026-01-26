import axios from 'axios';
import FormData from 'form-data';
import { calculateAllStability, calculateDownContribution, calculateIncomingStats, calculateOutCC, calculateSquadBarrier, calculateSquadHealing } from '../shared/plenbot';
import { Player } from '../shared/dpsReportTypes';

export class DiscordNotifier {
    private webhookUrl: string | null = null;

    constructor() {
    }

    public setWebhookUrl(url: string | null) {
        this.webhookUrl = url;
    }

    public async sendLog(logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, mode?: 'image' | 'embed' }, jsonDetails?: any) {
        if (!this.webhookUrl) {
            console.log("No webhook URL configured, skipping Discord notification.");
            return;
        }

        const mode = logData.imageBuffer ? 'image' : (logData.mode || 'embed');
        console.log(`[Discord] sending log. Mode: ${mode}`);

        try {
            if (mode === 'image' && logData.imageBuffer) {
                // IMAGE MODE: Plain text with suppression + PNG attachment
                const form = new FormData();

                // User Request: 
                // 1. Stats Share (id='stats-dashboard'): Image ONLY.
                // 2. Individual Logs: Image + dps.report Link.

                let content = '';
                if (logData.id !== 'stats-dashboard') {
                    content = `**${jsonDetails?.fightName || 'Log Uploaded'}**\n[dps.report](${logData.permalink})`;
                }

                const payload: any = {
                    username: "GW2 Arc Log Uploader"
                };

                if (content) {
                    payload.content = content;
                }

                form.append('payload_json', JSON.stringify(payload));

                form.append('file', Buffer.from(logData.imageBuffer), {
                    filename: 'log_summary.png',
                    contentType: 'image/png'
                });

                await axios.post(this.webhookUrl, form, {
                    headers: form.getHeaders()
                });
                console.log("Sent Discord notification with image.");
            } else {
                // EMBED MODE: Complex Rich Embed based on GitHub reference
                if (jsonDetails && (jsonDetails.evtc || jsonDetails.players)) {
                    console.log('[Discord] Building Complex Rich Embed...');
                    const players: Player[] = jsonDetails.players || [];

                    // Pre-calculate stability
                    calculateAllStability(players);

                    let embedFields: any[] = [];

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

                    const squadSummaryLines = [
                        formatStatLine('Count:', nonSquadPlayers.length > 0 ? `${squadPlayers.length} (+${nonSquadPlayers.length})` : squadPlayers.length),
                        formatStatLine('DMG:', fmtNum(squadDmg)),
                        formatStatLine('DPS:', fmtNum(squadDps)),
                        formatStatLine('Downs:', squadDowns),
                        formatStatLine('Deaths:', squadDeaths)
                    ].join('\n');

                    const enemySummaryLines = [
                        formatStatLine('Count:', enemyCount),
                        formatStatLine('DMG:', fmtNum(totalDmgTaken)),
                        formatStatLine('DPS:', fmtNum(totalIncomingDps)),
                        formatStatLine('Downs:', enemyDowns),
                        formatStatLine('Kills:', enemyDeaths)
                    ].join('\n');

                    embedFields.push({
                        name: "Squad Summary:",
                        value: `\`\`\`\n${squadSummaryLines}\n\`\`\``,
                        inline: true
                    });
                    embedFields.push({
                        name: "Enemy Summary:",
                        value: `\`\`\`\n${enemySummaryLines}\n\`\`\``,
                        inline: true
                    });
                    embedFields.push({ name: '\u200b', value: '\u200b', inline: false });

                    // Line 2: Incoming Attacks | Incoming CC | Incoming Strips
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

                    // --- Top Lists Helper ---
                    const addTopList = (title: string, sortFn: (a: any, b: any) => number, valFn: (p: any) => any, fmtVal: (v: any) => string) => {
                        const top = [...players].sort(sortFn).slice(0, 10);

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

                    // Line 3: Damage | Down Contribution
                    addTopList("Damage",
                        (a, b) => (b.dpsAll?.[0]?.damage || 0) - (a.dpsAll?.[0]?.damage || 0),
                        p => p.dpsAll?.[0]?.damage || 0,
                        v => v.toLocaleString()
                    );
                    addTopList("Down Contribution",
                        (a, b) => calculateDownContribution(b) - calculateDownContribution(a),
                        p => calculateDownContribution(p),
                        v => v.toLocaleString()
                    );
                    embedFields.push({ name: '\u200b', value: '\u200b', inline: false });

                    // Line 4: Healing | Barrier
                    addTopList("Healing",
                        (a, b) => calculateSquadHealing(b) - calculateSquadHealing(a),
                        p => calculateSquadHealing(p),
                        v => v.toLocaleString()
                    );
                    addTopList("Barrier",
                        (a, b) => calculateSquadBarrier(b) - calculateSquadBarrier(a),
                        p => calculateSquadBarrier(p),
                        v => v.toLocaleString()
                    );
                    embedFields.push({ name: '\u200b', value: '\u200b', inline: false });

                    // Line 5: Cleanses | Boon Strips (PlenBot uses condiCleanse + condiCleanseSelf)
                    addTopList("Cleanses",
                        (a, b) => ((b.support?.[0]?.condiCleanse || 0) + (b.support?.[0]?.condiCleanseSelf || 0)) - ((a.support?.[0]?.condiCleanse || 0) + (a.support?.[0]?.condiCleanseSelf || 0)),
                        p => (p.support?.[0]?.condiCleanse || 0) + (p.support?.[0]?.condiCleanseSelf || 0),
                        v => v.toString()
                    );
                    addTopList("Boon Strips",
                        (a, b) => (b.support?.[0]?.boonStrips || 0) - (a.support?.[0]?.boonStrips || 0),
                        p => p.support?.[0]?.boonStrips || 0,
                        v => v.toString()
                    );
                    embedFields.push({ name: '\u200b', value: '\u200b', inline: false });

                    // Line 6: CC
                    addTopList("CC",
                        (a, b) => calculateOutCC(b) - calculateOutCC(a),
                        p => calculateOutCC(p),
                        v => v.toLocaleString()
                    );
                    addTopList("Stability",
                        (a, b) => (b.stabGeneration || 0) - (a.stabGeneration || 0),
                        p => p.stabGeneration || 0,
                        v => v.toLocaleString()
                    );

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

                    await axios.post(this.webhookUrl, {
                        username: "GW2 Arc Log Uploader",
                        embeds: [{
                            title: `${jsonDetails.fightName || 'Log Uploaded'}`,
                            url: logData.permalink,
                            description: desc,
                            color: getEmbedColor(jsonDetails.fightName),
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: `GW2 Arc Log Uploader • ${new Date().toLocaleTimeString()}`
                            },
                            fields: embedFields
                        }]
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
