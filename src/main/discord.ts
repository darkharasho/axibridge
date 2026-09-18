import axios from 'axios';
import FormData from 'form-data';
import {
    getPlayerDamage,
    getPlayerDps,
    getPlayerDownsTaken,
    getPlayerBreakbarDamage,
    getPlayerCleansesArcdps,
    getPlayerDamageTaken,
    getPlayerDeaths,
    createDistanceToTagResolver,
    getPlayerDodges,
    getPlayerMissed,
    getPlayerBlocked,
    getPlayerEvaded,
    getPlayerStrips,
    getTargetStatTotal,
} from '../shared/dashboardMetrics';
import {
    applySquadStabilityGeneration as applyStabilityGeneration,
    computeDownContribution as getPlayerDownContribution,
    computeSquadHealing as getPlayerSquadHealing,
    computeSquadBarrier as getPlayerSquadBarrier,
    computeOutgoingCrowdControl as getPlayerOutgoingCrowdControl,
    computeIncomingDisruptions as getIncomingDisruptions,
} from '../shared/combatMetrics';
import { deriveReviveLogSummary, reviveePlayerKey, type ReviveLogSummary } from '@axiapps/bridge-metrics';
import { DEFAULT_DISRUPTION_METHOD, DisruptionMethod } from '../shared/metricsSettings';
import { getProfessionAbbrev, getProfessionBase, getProfessionEmoji } from '../shared/professionUtils';
import { getProfessionEmojiToken } from '@axiapps/bridge-metrics/professionUtils';
import { partitionSquadPlayers } from '../shared/playerIdentity';
import { resolveEnemyClassLabel } from '../shared/computePlayerAggregation';
import { Player } from '../shared/dpsReportTypes';
import { TIMESTAMP_MS_THRESHOLD } from '../shared/constants';
import { buildFightLabelV2, computeFightAvgPosition } from '../shared/mapUtils';
import { getWvwTeamColor, teamMapFromLog, WVW_TEAM_COLOR_META, WVW_TEAM_COLOR_ORDER, type WvwTeamMap } from '../shared/wvwTeams';
import { buildFightMitigationByAccount } from './embedMitigation';

export const DISCORD_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/darkharasho/axibridge/main/public/img/AxiBridge-glyph.png';

export type DiscordDestination =
    | { kind: 'webhook'; url: string }
    | { kind: 'bridge'; relayUrl: string; token: string };

export type SendFailureReason = 'revoked' | 'forbidden' | 'rate-limited' | 'rejected' | 'network';

export type SendResult =
    | { ok: true }
    | { ok: false; reason: SendFailureReason; message: string };

// `deriveReviveLogSummary` walks the whole roster's rotation/replay data --
// skip it entirely when the Revives column is disabled, matching the sibling
// `showDamageMitigation` gate below ("~25ms; skipped entirely when the stat
// is disabled").
const EMPTY_REVIVE_SUMMARY: ReviveLogSummary = {
    hasData: false, downs: 0, recovered: 0, died: 0,
    byKind: { hand: 0, utility: 0, self: 0, unattributed: 0 },
    players: new Map(), utilities: new Map(), iolRevives: [],
};

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
    showDamageMitigation: boolean;
    maxTopListRows: number;
    classDisplay: 'off' | 'short' | 'emoji';
    /** Attach a map slice showing where the fight happened. */
    includeMapSlice: boolean;
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
    showDamageMitigation: false,
    maxTopListRows: 10,
    classDisplay: 'off',
    includeMapSlice: true,
};

// Discord embed limits
/**
 * dps.report uploads can fail or still be in flight when an embed goes out.
 * Return the link only when it is actually usable, so callers can omit the
 * embed `url` and drop the markdown link instead of emitting `[dps.report]()`.
 */
export const toReportLink = (permalink?: string): string | undefined => {
    const trimmed = typeof permalink === 'string' ? permalink.trim() : '';
    return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : undefined;
};

const DISCORD_EMBED_CHAR_LIMIT = 6000;
const DISCORD_EMBED_FIELD_LIMIT = 25;
const DISCORD_MAX_EMBEDS = 10;

/**
 * Characters the AxiTools relay *adds* when it substitutes one `{{spec:key}}`
 * token for a real application emoji.
 *
 * `{{spec:<key>}}` is `9 + key.length`; the rendered `<:<key>:<id>>` is
 * `4 + key.length + id.length`. The key cancels, so the growth is exactly
 * `id.length - 5` for every spec — 14 for the 19-digit snowflakes every live
 * emoji currently has. We budget 15 so a future 20-digit id cannot quietly
 * push a report back over the line.
 */
const BRIDGE_TOKEN_GROWTH = 15;
const BRIDGE_TOKEN_PATTERN = /\{\{spec:[a-z0-9]+\}\}/g;

/**
 * Length of `text` as Discord will count it *after* the relay substitutes.
 *
 * Embed packing happens here, on pre-substitution text, but the character
 * limit is enforced on what the relay actually posts — and the relay's
 * overflow behaviour is to drop the offending field and every field after it
 * without telling anyone (Discord still answers 200). Budgeting for the growth
 * up front keeps that arithmetic honest: a worst-case bridged report with all
 * eight stat lists at ten rows grows by ~1,500 characters, which is the
 * difference between fitting and silently losing the last board.
 */
export const getSubstitutedLength = (text: string | undefined, isBridge: boolean): number => {
    const length = text?.length || 0;
    if (!isBridge || length === 0) return length;
    const tokens = text!.match(BRIDGE_TOKEN_PATTERN)?.length || 0;
    return length + (tokens * BRIDGE_TOKEN_GROWTH);
};

/**
 * Drop trailing newline-separated rows from `value` until its substituted
 * length fits `limit`, returning '' if nothing fits.
 *
 * Rows are never split, so a `{{spec:x}}` token can never be cut in half.
 * A fenced value is all-or-nothing: shedding rows from a ```-wrapped block
 * would take the closing fence with them and render the rest as prose.
 */
export const trimFieldValueToLength = (value: string | undefined, limit: number, isBridge: boolean): string => {
    const text = value || '';
    if (getSubstitutedLength(text, isBridge) <= limit) return text;
    if (text.startsWith('```')) return '';
    const rows = text.split('\n');
    while (rows.length > 0) {
        rows.pop();
        const candidate = rows.join('\n');
        if (getSubstitutedLength(candidate, isBridge) <= limit) return candidate;
    }
    return '';
};

const resolveFightTimestampMs = (jsonDetails: any, logData: any) => {
    const raw = jsonDetails?.timeStartStd
        ?? jsonDetails?.timeStart
        ?? jsonDetails?.uploadTime
        ?? logData?.uploadTime;
    if (raw === undefined || raw === null || raw === '') return 0;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return raw > TIMESTAMP_MS_THRESHOLD ? raw : raw * 1000;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > TIMESTAMP_MS_THRESHOLD ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(String(raw));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const formatFightTitleForDiscord = (jsonDetails: any, logData: any) => {
    const timestampMs = resolveFightTimestampMs(jsonDetails, logData);
    const fightLabel = buildFightLabelV2({
        zone: jsonDetails?.fightName || logData?.encounterName || '',
        durationMs: jsonDetails?.durationMS,
        avgPosition: computeFightAvgPosition(jsonDetails),
    });
    const dateLabel = timestampMs > 0
        ? new Date(timestampMs).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
        + ' '
        + new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : '';
    if (dateLabel && fightLabel) return `${dateLabel} - ${fightLabel}`;
    if (fightLabel) return fightLabel;
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

const computeEnemyTeamBreakdown = (players: any[], targets: any[], durationSec: number, teamMap: WvwTeamMap | null) => {
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

    return teamIds
        .map((teamId) => {
            const dmg = enemyTeamDmgMap.get(teamId) || 0;
            const classCounts = enemyTeamClassMap.get(teamId) || {};
            return {
                teamId,
                color: getWvwTeamColor(teamId, teamMap),
                count: enemyTeamCountMap.get(teamId) || 0,
                dmg,
                dps: Math.round(dmg / durationSec),
                downs: enemyTeamDownsMap.get(teamId) || 0,
                kills: enemyTeamKillsMap.get(teamId) || 0,
                classCounts
            };
        })
        .sort((a, b) => WVW_TEAM_COLOR_ORDER.indexOf(a.color) - WVW_TEAM_COLOR_ORDER.indexOf(b.color));
};

export class DiscordNotifier {
    private destination: DiscordDestination | null = null;
    private embedStatSettings: IEmbedStatSettings = DEFAULT_EMBED_STATS;
    private disruptionMethod: DisruptionMethod = DEFAULT_DISRUPTION_METHOD;

    constructor() {
    }

    public setWebhookUrl(url: string | null) {
        this.destination = url ? { kind: 'webhook', url } : null;
    }

    public setDestination(dest: DiscordDestination | null) {
        this.destination = dest;
    }

    private get isBridge(): boolean {
        return this.destination?.kind === 'bridge';
    }

    /** Post an embed/content payload to the active destination. */
    private async postPayload(payload: Record<string, unknown>): Promise<void> {
        const dest = this.destination!;
        if (dest.kind === 'webhook') {
            await axios.post(dest.url, {
                username: "AxiBridge",
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                ...payload
            });
            return;
        }
        // A bot cannot override username/avatar_url — bridged reports post as the
        // bot itself, and the relay rejects unknown keys.
        await axios.post(`${dest.relayUrl}/bridge/report`, payload, {
            headers: { Authorization: `Bearer ${dest.token}` }
        });
    }

    /** Post a multipart (PNG attachment) payload to the active destination. */
    private async postForm(form: FormData): Promise<void> {
        const dest = this.destination!;
        if (dest.kind === 'webhook') {
            await axios.post(dest.url, form, { headers: form.getHeaders() });
            return;
        }
        await axios.post(`${dest.relayUrl}/bridge/report`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${dest.token}` }
        });
    }

    /** Map a thrown axios error to a SendResult. */
    private classify(error: any): { ok: false; reason: SendFailureReason; message: string } {
        const status = error?.response?.status;
        const relayMessage = error?.response?.data?.error;
        if (status === 401) {
            return { ok: false, reason: 'revoked', message: 'This link was revoked — pair again.' };
        }
        if (status === 403) {
            return { ok: false, reason: 'forbidden', message: relayMessage || 'Axi cannot post in that channel.' };
        }
        if (status === 429) {
            return { ok: false, reason: 'rate-limited', message: 'Too many reports — try again shortly.' };
        }
        // Minor 16: a 400 is the relay's deterministic validation rejection
        // (e.g. `validate_report`'s "report is empty") -- retrying it can
        // only ever fail the same way again. Mapping it to 'network' put it
        // through the 2s-sleep-then-retry branch below, costing every
        // rejected report two round-trips instead of surfacing immediately.
        if (status === 400) {
            return { ok: false, reason: 'rejected', message: relayMessage || 'The relay rejected this report.' };
        }
        return { ok: false, reason: 'network', message: relayMessage || String(error?.message || error) };
    }

    public setEmbedStatSettings(settings: IEmbedStatSettings) {
        this.embedStatSettings = { ...DEFAULT_EMBED_STATS, ...settings };
    }

    public setDisruptionMethod(method: DisruptionMethod) {
        this.disruptionMethod = method || DEFAULT_DISRUPTION_METHOD;
    }

    public async sendLog(logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, imageBuffers?: Uint8Array[], suppressContent?: boolean, mode?: 'image' | 'embed', splitEnemiesByTeam?: boolean }, jsonDetails?: any): Promise<SendResult> {
        if (!this.destination) {
            console.log("No Discord destination configured, skipping notification.");
            return { ok: true };
        }

        try {
            await this.resend(logData, jsonDetails);
            return { ok: true };
        } catch (error) {
            const result = this.classify(error);
            if (result.reason === 'rate-limited' || result.reason === 'network') {
                const rawRetryAfter = String((error as any)?.response?.headers?.['retry-after'] ?? '').trim();
                const parsedRetryAfter = rawRetryAfter === '' ? NaN : Number(rawRetryAfter);
                const waited = Number.isFinite(parsedRetryAfter) && parsedRetryAfter >= 0 ? parsedRetryAfter : 2;
                await new Promise(resolve => setTimeout(resolve, waited * 1000));
                try {
                    await this.resend(logData, jsonDetails);
                    return { ok: true };
                } catch (retryError) {
                    return this.classify(retryError);
                }
            }
            // Never log the raw error: it carries `config.headers.Authorization`
            // with the bridge token verbatim (`util.inspect`, which
            // `console.error` uses, serializes it in full), and 401/403 —
            // the exact non-retry branch that reaches here — is the first
            // thing a revoked/forbidden bridge link hits. Match
            // index.ts:800/952's `error?.message || error` pattern instead.
            console.error("Failed to send Discord notification:", (error as any)?.message || error);
            return result;
        }
    }

    private async resend(logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, imageBuffers?: Uint8Array[], suppressContent?: boolean, mode?: 'image' | 'embed', splitEnemiesByTeam?: boolean }, jsonDetails?: any): Promise<void> {
        const mode = logData.imageBuffer ? 'image' : (logData.mode || 'embed');
        console.log(`[Discord] sending log. Mode: ${mode}`);

        {
            if (mode === 'image' && (logData.imageBuffer || logData.imageBuffers)) {
                // IMAGE MODE: Plain text with suppression + PNG attachment
                const form = new FormData();

                // User Request:
                // 1. Stats Share (id='stats-dashboard'): Image ONLY.
                // 2. Individual Logs: Image + dps.report Link.

                let content = '';
                if (logData.id !== 'stats-dashboard' && !logData.suppressContent) {
                    const reportLink = toReportLink(logData.permalink);
                    content = `**${formatFightTitleForDiscord(jsonDetails, logData)}**`;
                    if (reportLink) {
                        content += `\n[dps.report](${reportLink})`;
                    }
                }

                const payload: any = {};
                if (!this.isBridge) {
                    payload.username = "AxiBridge";
                    payload.avatar_url = DISCORD_WEBHOOK_AVATAR_URL;
                }

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

                await this.postForm(form);
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

                    const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);

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
                    });

                    squadPrimaries.forEach((p: any) => {
                        const prof = p.profession || 'Unknown';
                        squadClassCounts[prof] = (squadClassCounts[prof] || 0) + 1;
                    });

                    // Calculate Enemy (Target) Stats - how many times WE downed/killed them
                    // We aggregate from player statsTargets, which records what each player did to targets
                    const targets = jsonDetails.targets || [];
                    let enemyDowns = 0;
                    let enemyDeaths = 0;
                    let enemyCount = 0;
                    const durationSec = jsonDetails.durationMS ? jsonDetails.durationMS / 1000 : 1;
                    const enemyTeams = computeEnemyTeamBreakdown(players as any[], targets, durationSec || 1, teamMapFromLog(jsonDetails));

                    // Count non-fake targets
                    targets.forEach((t: any) => {
                        if (!t.isFake) enemyCount++;
                    });
                    if (enemyCount === 0) {
                        enemyCount = pugPrimaries.length;
                    }

                    const fromPlayers: Record<string, number> = {};
                    const enemyPlayers = pugPrimaries;
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

                            // Group by PROFESSION, never by `name` -- a WvW
                            // target's name is the player's rank title
                            // ("Gold Invader"), not a class.
                            const label = resolveEnemyClassLabel(t);
                            fromTargets[label] = (fromTargets[label] || 0) + 1;
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

                    // Squad Summary (conditionally shown)
                    if (settings.showSquadSummary) {
                        const squadSummaryLines = [
                            formatStatLine('Count:', pugPrimaries.length > 0 ? `${squadPrimaries.length} (+${pugPrimaries.length})` : squadPrimaries.length),
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
                                    name: `${WVW_TEAM_COLOR_META[team.color].label} team:`,
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
                        // An entry carries its count as a number rather than baked into
                        // its label. The overflow totals below used to recover the count
                        // by string-parsing the rendered label (`Number(entry.split(':')[1])`),
                        // which works for the webhook label `FRB: 4` but yields NaN for
                        // every bridge label -- `'{{spec:firebrand}} 4'.split(':')[1]` is
                        // `'firebrand}} 4'` -- so a bridged overflow row rendered as the
                        // literal `+ NaN`. Summing a real field cannot drift that way.
                        type ClassEntry = { label: string; count: number; overflow?: boolean };
                        const entries: ClassEntry[] = Object.entries(counts)
                            .filter(([, count]) => count > 0)
                            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
                            .map(([profession, count]) => {
                                // A webhook can never render Discord application
                                // emoji, so this stays plain-text abbrev there
                                // (byte-identical to today's output). The bridge
                                // relay substitutes real per-spec icons, so it
                                // gets a token instead regardless of classDisplay.
                                if (this.isBridge) {
                                    return { label: getProfessionEmojiToken(profession), count };
                                }
                                const labelText = useAbbrev
                                    ? getProfessionAbbrev(profession).toUpperCase().padEnd(3, ' ')
                                    : profession.toUpperCase();
                                return { label: `${labelText}:`, count };
                            });
                        if (entries.length === 0) return 'No Data';

                        let limitedEntries: ClassEntry[] = (() => {
                            if (!maxItems || entries.length <= maxItems) {
                                return entries;
                            }
                            const overflowTotal = entries
                                .slice(maxItems)
                                .reduce((sum, entry) => sum + entry.count, 0);
                            const base = entries.slice(0, maxItems);
                            if (!includeSummary || overflowTotal <= 0) return base;
                            return [...base, { label: '+', count: overflowTotal, overflow: true }];
                        })();

                        const maxRows = 5;
                        if (maxColumns && maxColumns > 0) {
                            const maxVisibleEntries = maxRows * maxColumns;
                            if (limitedEntries.length > maxVisibleEntries) {
                                const overflowStart = Math.max(0, maxVisibleEntries - 1);
                                const overflowTotal = limitedEntries
                                    .slice(overflowStart)
                                    .reduce((sum, entry) => sum + entry.count, 0);
                                limitedEntries = [
                                    ...limitedEntries.slice(0, overflowStart),
                                    { label: '+', count: overflowTotal, overflow: true }
                                ];
                            }
                        }

                        // Ruling K / option D2: on the bridge path each row is
                        // `{{spec:x}} \`N\`` -- the token sits OUTSIDE the code span so
                        // the relay's custom emoji actually renders, while the count keeps
                        // a monospace cell. There is deliberately no fence and no padded
                        // column grid here: a fence turns every custom emoji into literal
                        // `<:name:id>` text, and space padding buys nothing once the text
                        // is laid out in Discord's proportional body font. Rows are
                        // space-joined and left to wrap.
                        if (this.isBridge) {
                            return limitedEntries
                                .map(entry => (entry.overflow
                                    ? `\`+ ${entry.count}\``
                                    : `${entry.label} \`${entry.count}\``))
                                .join('  ');
                        }

                        const rendered = limitedEntries.map(entry => (entry.overflow
                            ? `+ ${entry.count}`
                            : `${entry.label} ${entry.count}`));
                        const columns: string[][] = [];
                        for (let i = 0; i < rendered.length; i += maxRows) {
                            columns.push(rendered.slice(i, i + maxRows));
                        }
                        const colWidth = Math.max(...rendered.map(entry => entry.length)) + 2;
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

                    // Bridge class rows carry custom-emoji tokens, which render as literal
                    // `<:name:id>` text inside a fence -- so they ship unfenced. The webhook
                    // path keeps the fence: its unicode emoji render fine inside one, and the
                    // padded column grid needs a monospace font to mean anything.
                    const classFieldValue = (body: string) => (this.isBridge
                        ? body
                        : `\`\`\`\n${body}\n\`\`\``);

                    if (settings.showClassSummary && (settings.showSquadSummary || settings.showEnemySummary)) {
                        embedFields.push({ name: '\u200b', value: '\u200b', inline: false });
                    }

                    if (settings.showClassSummary && settings.showSquadSummary) {
                        embedFields.push({
                            name: "Squad Classes:",
                            value: classFieldValue(formatClassLines(squadClassCounts)),
                            inline: true
                        });
                    }

                    if (settings.showClassSummary && settings.showEnemySummary) {
                        if (splitEnemiesByTeam && enemyTeams.length > 0) {
                            enemyTeams.forEach((team) => {
                                embedFields.push({
                                    name: `${WVW_TEAM_COLOR_META[team.color].label} classes:`,
                                    value: classFieldValue(formatClassLines(team.classCounts, true, undefined, true, 2)),
                                    inline: true
                                });
                            });
                        } else {
                            embedFields.push({
                                name: "Enemy Classes:",
                                value: classFieldValue(formatClassLines(enemyClassCounts, true, 14, true)),
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
                    const addTopList = (
                        title: string,
                        sortFn: (a: any, b: any) => number,
                        valFn: (p: any) => any,
                        fmtVal: (v: any) => string,
                        options?: {
                            filterFn?: (p: any) => boolean;
                            allowZero?: boolean;
                        }
                    ) => {
                        const top = [...players]
                            .filter((p: any) => !p.notInSquad)
                            .filter((p: any) => options?.filterFn ? options.filterFn(p) : true)
                            .sort(sortFn)
                            .slice(0, maxTopRows);
                        const classDisplay = settings.classDisplay ?? 'off';
                        const getClassToken = (p: any) => {
                            if (classDisplay === 'short') {
                                return getProfessionAbbrev(p.profession || 'Unknown');
                            }
                            if (classDisplay === 'emoji') {
                                const profession = p.profession || 'Unknown';
                                // On the bridge path AxiTools substitutes a real
                                // per-spec emoji, so the colour-collision hacks
                                // below are unnecessary.
                                if (this.isBridge) return getProfessionEmojiToken(profession);
                                const professionBase = getProfessionBase(profession);
                                if (professionBase === 'Ranger') return '🟩';
                                if (professionBase === 'Revenant') return '🟥';
                                return getProfessionEmoji(profession);
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

                        // Discord embed inline field max width is ~23 chars in monospace
                        // (narrower than the historical ~25 — Discord adjusted column widths)
                        // Format: "RR NAME... VALUE" where RR=rank (2 chars + 1 space)
                        const MAX_LINE_WIDTH = 23
                        const RANK_WIDTH = 3; // "10 " = 3 chars
                        const MIN_SEPARATOR = 1; // At least 1 space between name and value

                        // Ruling K / option D2. A bridged row's class cell is a
                        // `{{spec:x}}` token the relay turns into a custom application
                        // emoji, and a custom emoji inside a fence renders as literal
                        // `<:name:id>` text -- so a fully fenced row can have aligned
                        // columns or icons, never both. D2 splits the row into per-segment
                        // inline code spans with the token BETWEEN them:
                        //     `RR` {{spec:x}} `Name - Value`
                        // Each span is monospace, and because every custom emoji renders
                        // at one uniform glyph width the trailing span starts at the same
                        // offset on every row, so the name/value columns still line up.
                        // Only the bridge emoji path takes this layout: `classDisplay`
                        // 'short'/'off' emit plain text that a fence renders correctly,
                        // and the webhook path's unicode emoji render inside a fence too.
                        const useSpanLayout = this.isBridge && classDisplay === 'emoji';
                        const SPAN_TOKEN_WIDTH = 2; // one emoji glyph + separator space
                        const SPAN_VALUE_SEPARATOR = ' - ';
                        const availableWidth = useSpanLayout
                            ? MAX_LINE_WIDTH - RANK_WIDTH - SPAN_TOKEN_WIDTH - SPAN_VALUE_SEPARATOR.length
                            : MAX_LINE_WIDTH - RANK_WIDTH - MIN_SEPARATOR;
                        const nameWidth = Math.max(0, availableWidth - maxValueWidth);

                        let str = "";
                        for (let i = 0; i < maxTopRows; i += 1) {
                            const p = top[i];
                            if (!p) break;
                            const val = valFn(p);
                            const shouldRenderValue = options?.allowZero
                                ? (
                                    typeof val === 'number'
                                        ? Number.isFinite(val)
                                        : (typeof val === 'string' ? val !== '' : Boolean(val))
                                )
                                : (val > 0 || (typeof val === 'string' && val !== '0' && val !== ''));
                            if (!shouldRenderValue) continue;
                            const fullName = p.name || p.character_name || p.account || 'Unknown';
                            const classToken = getClassToken(p);
                            const vStr = formattedValues[i]?.padStart(maxValueWidth) || ''.padStart(maxValueWidth);

                            if (useSpanLayout) {
                                // The token leaves the padded text entirely, so nothing here
                                // has to model its rendered width -- the span holds only real
                                // monospace characters. A row with no resolvable spec still
                                // pads to `nameWidth`, keeping the value column aligned with
                                // its neighbours instead of sliding one glyph left.
                                const rank = (i + 1).toString().padStart(2);
                                const spanName = fullName.substring(0, nameWidth).padEnd(nameWidth);
                                const tokenCell = classToken ? `${classToken} ` : '';
                                str += `\`${rank}\` ${tokenCell}\`${spanName}${SPAN_VALUE_SEPARATOR}${vStr}\`\n`;
                                continue;
                            }

                            const rank = (i + 1).toString().padEnd(2);
                            const classCell = classToken
                                ? (classDisplay === 'emoji' ? `${classToken} ` : `[${classToken}] `)
                                : '';
                            const availableNameWidth = Math.max(0, nameWidth - classCell.length);
                            const trimmedName = fullName.substring(0, availableNameWidth).padEnd(availableNameWidth);
                            const name = `${classCell}${trimmedName}`.padEnd(nameWidth);
                            str += `${rank} ${name} ${vStr}\n`;
                        }
                        // A board whose every row was filtered out (all-zero stat, or a
                        // metric this parse cannot populate) leaves `str` empty. The fenced
                        // webhook value still has its backticks, but a span-layout value
                        // would be the empty string -- and Discord rejects an empty
                        // `field.value` with a 400 for the whole message. The relay happens
                        // to drop empty-valued fields before posting, but that is its
                        // leniency, not a contract: emit an explicit placeholder instead,
                        // matching `formatClassLines`' own empty case.
                        const spanValue = str.trimEnd() || 'No Data';
                        embedFields.push({
                            name: title + ":",
                            value: useSpanLayout ? spanValue : `\`\`\`\n${str}\`\`\``,
                            inline: true
                        });
                    };

                    // Resolves against the native replay block as well as `statsAll`:
                    // an axilog parse populates no distance scalars in `statsAll`, which
                    // made this list print 0 for the whole squad.
                    const resolveDistanceToTag = createDistanceToTagResolver(jsonDetails);
                    const getDistanceToTag = (p: any) => resolveDistanceToTag(p) ?? 0;
                    // Derived once per fight (not per player) and skipped entirely when
                    // the stat is disabled -- `deriveReviveLogSummary` walks the whole
                    // roster's rotation/replay data, the same cost `mitigationByAccount`
                    // below avoids paying when its own stat is off. `hasData` false means
                    // this fight lacks the rotation/replay data the derivation needs --
                    // the Revives column is omitted entirely then, never rendered as a
                    // fabricated 0.
                    const reviveSummary = settings.showResurrects
                        ? deriveReviveLogSummary(jsonDetails)
                        : EMPTY_REVIVE_SUMMARY;
                    // `reviveSummary.players` is keyed by identity, so a relog/build-swap
                    // duplicate `players[]` entry would otherwise re-render the SAME
                    // merged total under a second row. Credit only the first roster entry
                    // seen for each key, matching this file's other duplicate-safe totals.
                    const revivesCanonicalEntryByKey = new Map<string, any>();
                    players.forEach((entry: any) => {
                        if (entry?.notInSquad) return;
                        const key = reviveePlayerKey(entry);
                        if (!revivesCanonicalEntryByKey.has(key)) revivesCanonicalEntryByKey.set(key, entry);
                    });
                    const getRevivesCompleted = (p: any) => {
                        const key = reviveePlayerKey(p);
                        if (revivesCanonicalEntryByKey.get(key) !== p) return 0;
                        const counts = reviveSummary.players.get(key);
                        return counts ? counts.handRevives + counts.utilityRevives : 0;
                    };
                    const getBreakbarDamage = (p: any) => getPlayerBreakbarDamage(p);
                    const getDamageTaken = (p: any) => getPlayerDamageTaken(p);
                    const getDeaths = (p: any) => getPlayerDeaths(p);
                    const getDodges = (p: any) => getPlayerDodges(p);

                    // Runs the shared metrics pipeline on this one fight (~25ms);
                    // skipped entirely when the stat is disabled.
                    const mitigationByAccount = settings.showDamageMitigation
                        ? buildFightMitigationByAccount(jsonDetails)
                        : new Map<string, number>();
                    const getMitigation = (p: any) => mitigationByAccount.get(p.account && p.account !== 'Unknown' ? p.account : p.name) || 0;

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
                                sortFn: (a: any, b: any) => getPlayerCleansesArcdps(b) - getPlayerCleansesArcdps(a),
                                valFn: (p: any) => getPlayerCleansesArcdps(p),
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
                                enabled: settings.showResurrects && reviveSummary.hasData,
                                title: "Revives",
                                sortFn: (a: any, b: any) => getRevivesCompleted(b) - getRevivesCompleted(a),
                                valFn: (p: any) => getRevivesCompleted(p),
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
                            },
                            {
                                enabled: settings.showDamageMitigation,
                                title: "Damage Mitigation",
                                sortFn: (a: any, b: any) => getMitigation(b) - getMitigation(a),
                                valFn: (p: any) => getMitigation(p),
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
                            addTopList(
                                item.title,
                                item.sortFn,
                                item.valFn,
                                item.fmtVal,
                                item.title === 'Distance to Tag'
                                    ? {
                                        filterFn: (p: any) => !p?.isCommander,
                                        allowZero: true
                                    }
                                    : undefined
                            );
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
                        url: toReportLink(logData.permalink),
                        description: desc,
                        color: getEmbedColor(jsonDetails.fightName),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `AxiBridge • ${new Date().toLocaleTimeString()}`
                        }
                    };

                    const isBridge = this.isBridge;

                    const getEmbedBaseCharCount = (embed: typeof baseEmbed) => {
                        return getSubstitutedLength(embed.title, isBridge)
                            + getSubstitutedLength(embed.description, isBridge)
                            + getSubstitutedLength(embed.footer?.text, isBridge);
                    };

                    const buildEmbeds = (fields: any[]) => {
                        if (fields.length === 0) {
                            return [{ ...baseEmbed, fields: [] }];
                        }
                        const embeds: any[] = [];
                        const baseCharCount = getEmbedBaseCharCount(baseEmbed);
                        let currentFields: any[] = [];
                        // Discord's 6000-character cap is a whole-message total across
                        // every embed, not a per-embed allowance, so this budget is
                        // charged down once for the entire post and each additional
                        // embed re-pays the base cost it repeats.
                        let remaining = DISCORD_EMBED_CHAR_LIMIT - baseCharCount;

                        const flush = () => {
                            if (currentFields.length === 0) return;
                            embeds.push({ ...baseEmbed, fields: currentFields });
                            currentFields = [];
                        };

                        const pushField = (field: any) => {
                            const isBlank = field.name === '\u200b' && field.value === '\u200b';

                            if (currentFields.length >= DISCORD_EMBED_FIELD_LIMIT) {
                                flush();
                                remaining -= baseCharCount;
                            }

                            if (isBlank && currentFields.length === 0) {
                                return;
                            }

                            const nameCharCount = getSubstitutedLength(field.name, isBridge);
                            let value = field.value;

                            if (nameCharCount + getSubstitutedLength(value, isBridge) > remaining) {
                                // Trim here rather than letting the relay do it: its
                                // overflow rule drops this field and every field after
                                // it, silently, so a report one row over budget loses
                                // whole boards instead of that one row.
                                value = trimFieldValueToLength(value, Math.max(0, remaining - nameCharCount), isBridge);
                                if (!value) {
                                    console.warn(`[Discord] Dropping field "${field.name}" \u2014 no room left in the 6000-character message budget.`);
                                    return;
                                }
                                console.warn(`[Discord] Trimmed field "${field.name}" to fit the 6000-character message budget.`);
                                field = { ...field, value };
                            }

                            remaining -= nameCharCount + getSubstitutedLength(value, isBridge);
                            currentFields.push(field);
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

                    await this.postPayload({ embeds });
                    console.log("Sent complex Discord notification.");
                } else {
                    // Fallback Simple Embed
                    await this.postPayload({
                        embeds: [{
                            title: "Log Uploaded",
                            description: (() => {
                                const fileName = logData.filePath.split(/[\\\/]/).pop();
                                const reportLink = toReportLink(logData.permalink);
                                return `**Log:** ${reportLink ? `[${fileName}](${reportLink})` : fileName}`;
                            })(),
                            color: 3447003,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
            }
        }
    }
}
