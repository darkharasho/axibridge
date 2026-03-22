import { resolveFightTimestamp } from './utils/timestampUtils';
import { sanitizeWvwLabel, resolveMapName, buildFightLabel } from './utils/labelUtils';

const getHighestSingleHit = (player: any, details: any) => {
    const skillMap = details?.skillMap || {};
    const buffMap = details?.buffMap || {};
    let bestValue = 0;
    let bestDownContribution = 0;
    let bestName = '';
    const resolveSkillName = (rawId: any) => {
        const idNum = Number(rawId);
        if (!Number.isFinite(idNum)) return String(rawId || 'Unknown Skill');
        const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
        if (mapped?.name) return String(mapped.name);
        const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
        if (buffMapped?.name) return String(buffMapped.name);
        return `Skill ${idNum}`;
    };
    const readEntryPeak = (entry: any) => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.indirectDamage) return;
        const totalDamage = Number(entry.totalDamage || 0);
        const candidates = [
            Number(entry.max),
            Number(entry.maxDamage),
            Number(entry.maxHit)
        ].filter((n) => Number.isFinite(n) && n > 0);
        let peak = candidates.length > 0 ? Math.max(...candidates) : 0;
        // Guard: max should never exceed totalDamage (corrupted totalDamageDist entries)
        if (peak > 0 && Number.isFinite(totalDamage) && totalDamage > 0 && peak > totalDamage) {
            peak = totalDamage;
        }
        if (peak > bestValue) {
            bestValue = peak;
            bestName = resolveSkillName(entry.id);
        }
        const downContribution = Number(entry.downContribution || 0);
        if (downContribution > bestDownContribution) {
            bestDownContribution = downContribution;
        }
    };
    let sawTargetEntry = false;
    if (Array.isArray(player?.targetDamageDist)) {
        player.targetDamageDist.forEach((targetGroup: any) => {
            if (!Array.isArray(targetGroup)) return;
            targetGroup.forEach((list: any) => {
                if (!Array.isArray(list)) return;
                list.forEach((entry: any) => {
                    sawTargetEntry = true;
                    readEntryPeak(entry);
                });
            });
        });
    }
    if ((!sawTargetEntry || bestValue <= 0) && Array.isArray(player?.totalDamageDist)) {
        player.totalDamageDist.forEach((list: any) => {
            if (!Array.isArray(list)) return;
            list.forEach((entry: any) => readEntryPeak(entry));
        });
    }
    return { peak: bestValue, peakDownContribution: bestDownContribution, skillName: bestName || 'Unknown Skill' };
};

export function computeSpikeDamageData(validLogs: any[]) {
    const fights: Array<{
        id: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        values: Record<string, {
            hit: number;
            burst1s: number;
            burst5s: number;
            burst30s: number;
            hitDown: number;
            burst1sDown: number;
            burst5sDown: number;
            burst30sDown: number;
            skillName: string;
            buckets5s: number[];
            buckets5sDown: number[];
            downIndices5s: number[];
            deathIndices5s: number[];
            skillRows?: Array<{ skillName: string; damage: number; downContribution?: number; hits: number; icon?: string }>;
        }>;
        maxHit: number;
        max1s: number;
        max5s: number;
        max30s: number;
        maxHitDown: number;
        max1sDown: number;
        max5sDown: number;
        max30sDown: number;
    }> = [];
    const playerMap = new Map<string, {
        key: string;
        account: string;
        displayName: string;
        characterName: string;
        profession: string;
        professionList: string[];
        logs: number;
        peakHit: number;
        peak1s: number;
        peak5s: number;
        peak30s: number;
        peakHitDown: number;
        peak1sDown: number;
        peak5sDown: number;
        peak30sDown: number;
        peakFightLabel: string;
        peakSkillName: string;
    }>();

    const getPerSecondDamageSeries = (player: any): { perSecond: number[]; usedFallback: boolean } => {
        const toPerSecond = (series: number[]) => {
            if (!Array.isArray(series) || series.length === 0) return [] as number[];
            const deltas: number[] = [];
            for (let i = 0; i < series.length; i += 1) {
                const current = Number(series[i] || 0);
                const prev = i > 0 ? Number(series[i - 1] || 0) : 0;
                deltas.push(Math.max(0, current - prev));
            }
            return deltas;
        };
        const sumCumulativeTargets = (targetSeries: any[]) => {
            if (!Array.isArray(targetSeries)) return [] as number[];
            const maxLen = targetSeries.reduce((len, series) => Math.max(len, Array.isArray(series) ? series.length : 0), 0);
            if (maxLen <= 0) return [] as number[];
            const summed = new Array<number>(maxLen).fill(0);
            targetSeries.forEach((series) => {
                if (!Array.isArray(series)) return;
                for (let i = 0; i < maxLen; i += 1) {
                    summed[i] += Number(series[i] || 0);
                }
            });
            return summed;
        };
        const normalizeNumberSeries = (series: any) =>
            Array.isArray(series) ? series.map((value: any) => Number(value || 0)) : null;
        const extractTargetPhase0 = (targetDamage1S: any) => {
            if (!Array.isArray(targetDamage1S) || targetDamage1S.length === 0) return null;
            const first = targetDamage1S[0];
            if (!Array.isArray(first)) return null;

            // Shape A: [phase][target][time]
            if (Array.isArray(first[0]) && Array.isArray(first[0][0])) {
                return sumCumulativeTargets(first);
            }

            // Shape B: [target][phase][time]
            if (Array.isArray(first[0]) && !Array.isArray(first[0][0])) {
                const phaseSeries = targetDamage1S
                    .map((target: any) => normalizeNumberSeries(Array.isArray(target) ? target[0] : null))
                    .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
                if (phaseSeries.length > 0) return sumCumulativeTargets(phaseSeries);
            }

            return null;
        };
        const targetPhase0 = extractTargetPhase0(player?.targetDamage1S);
        const totalPhase0 = Array.isArray(player?.damage1S) && Array.isArray(player.damage1S[0])
            ? player.damage1S[0]
            : null;
        const usedFallback = !targetPhase0;
        const cumulative = targetPhase0
            ? targetPhase0
            : (Array.isArray(totalPhase0) ? totalPhase0.map((v: any) => Number(v || 0)) : []);
        return { perSecond: toPerSecond(cumulative), usedFallback };
    };

    const getMaxRollingDamage = (values: number[], window: number) => {
        if (!Array.isArray(values) || values.length === 0 || window <= 0) return 0;
        let sum = 0;
        let best = 0;
        for (let i = 0; i < values.length; i += 1) {
            sum += Number(values[i] || 0);
            if (i >= window) {
                sum -= Number(values[i - window] || 0);
            }
            if (i >= window - 1 && sum > best) best = sum;
        }
        return Math.max(0, best);
    };

    const getBuckets = (values: number[], bucketSizeSeconds: number) => {
        if (!Array.isArray(values) || values.length === 0 || bucketSizeSeconds <= 0) return [] as number[];
        const out: number[] = [];
        for (let i = 0; i < values.length; i += bucketSizeSeconds) {
            const end = Math.min(i + bucketSizeSeconds, values.length);
            const bucket = values.slice(i, end).reduce((sum, value) => sum + Number(value || 0), 0);
            out.push(bucket);
        }
        return out;
    };
    const getDamageAndDownContributionTotals = (player: any, details: any) => {
        let damageTotal = 0;
        let downContributionTotal = 0;
        const totalsBySkill = new Map<number, { damage: number; downContribution: number }>();
        const consume = (entry: any) => {
            if (!entry || typeof entry !== 'object') return;
            if (entry.indirectDamage) return;
            const damage = Number(entry.totalDamage || 0);
            const downContribution = Number(entry.downContribution || 0);
            if (!Number.isFinite(damage) && !Number.isFinite(downContribution)) return;
            damageTotal += Number.isFinite(damage) ? damage : 0;
            downContributionTotal += Number.isFinite(downContribution) ? downContribution : 0;
        };
        if (Array.isArray(player?.targetDamageDist)) {
            player.targetDamageDist.forEach((targetGroup: any) => {
                if (!Array.isArray(targetGroup)) return;
                targetGroup.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => {
                        const skillId = Number(entry?.id);
                        if (Number.isFinite(skillId)) {
                            const existing = totalsBySkill.get(skillId) || { damage: 0, downContribution: 0 };
                            existing.damage += Number(entry?.totalDamage || 0);
                            existing.downContribution += Number(entry?.downContribution || 0);
                            totalsBySkill.set(skillId, existing);
                        }
                        consume(entry);
                    });
                });
            });
        }
        const allowTotalSupplement = !details?.detailedWvW;
        if (allowTotalSupplement && Array.isArray(player?.totalDamageDist)) {
            player.totalDamageDist.forEach((list: any) => {
                if (!Array.isArray(list)) return;
                list.forEach((entry: any) => {
                    const skillId = Number(entry?.id);
                    if (!Number.isFinite(skillId)) {
                        consume(entry);
                        return;
                    }
                    const existing = totalsBySkill.get(skillId);
                    if (!existing) {
                        consume(entry);
                        return;
                    }
                    const deltaDamage = Number(entry?.totalDamage || 0) - Number(existing.damage || 0);
                    const deltaDown = Number(entry?.downContribution || 0) - Number(existing.downContribution || 0);
                    if (deltaDamage <= 0 && deltaDown <= 0) return;
                    consume({
                        ...entry,
                        totalDamage: Math.max(0, deltaDamage),
                        downContribution: Math.max(0, deltaDown)
                    });
                });
            });
        }
        return {
            damageTotal: Math.max(0, damageTotal),
            downContributionTotal: Math.max(0, downContributionTotal)
        };
    };
    const resolveSkillMeta = (rawId: any, details: any) => {
        const idNum = Number(rawId);
        if (!Number.isFinite(idNum)) return { name: String(rawId || 'Unknown Skill'), icon: undefined as string | undefined };
        const skillMap = details?.skillMap || {};
        const buffMap = details?.buffMap || {};
        const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
        if (mapped?.name) return { name: String(mapped.name), icon: mapped?.icon };
        const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
        if (buffMapped?.name) return { name: String(buffMapped.name), icon: buffMapped?.icon };
        return { name: `Skill ${idNum}`, icon: undefined as string | undefined };
    };
    const toPairs = (value: any): Array<[number, number]> => {
        if (!Array.isArray(value)) return [];
        return value
            .map((entry: any) => {
                if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])] as [number, number];
                if (entry && typeof entry === 'object') return [Number(entry.time), Number(entry.value)] as [number, number];
                return null;
            })
            .filter((entry: any): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && entry[0] >= 0);
    };
    const normalizeEventTimes = (times: number[], replayStarts: number[], allReplayStarts: number[], bucketCount: number, durationMs: number) => {
        if (!times.length || bucketCount <= 0) return [] as number[];
        const maxMs = Math.max(bucketCount * 5000, durationMs || 0);
        const validRangeScore = (values: number[]) => values.reduce((count, value) => (
            value >= 0 && value <= (maxMs + 2000) ? count + 1 : count
        ), 0);
        const raw = times.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value) && value >= 0);
        if (!raw.length) return [] as number[];
        const variants: number[][] = [raw];
        const maxRaw = raw.reduce((max, value) => Math.max(max, value), 0);
        const minRaw = raw.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
        if (maxRaw > (maxMs * 20)) variants.push(raw.map((value) => value / 1000));
        if (maxRaw <= (maxMs * 2) && minRaw >= 0 && maxRaw > 0 && maxRaw < Math.max(120, bucketCount * 5 + 10)) {
            variants.push(raw.map((value) => value * 1000));
        }
        let best = raw;
        let bestOffset = 0;
        let bestScore = -1;
        variants.forEach((variant) => {
            const minTime = variant.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
            const offsets = new Set<number>([0, ...replayStarts, ...allReplayStarts]);
            if (Number.isFinite(minTime) && maxMs > 0 && minTime > maxMs) {
                const approx = Math.floor(minTime / maxMs) * maxMs;
                offsets.add(approx);
                offsets.add(Math.max(0, approx - maxMs));
            }
            offsets.forEach((offset) => {
                const shifted = variant.map((value) => value - offset);
                const score = validRangeScore(shifted);
                if (score > bestScore) {
                    bestScore = score;
                    bestOffset = offset;
                    best = variant;
                }
            });
        });
        return best.map((value) => value - bestOffset).filter((value) => Number.isFinite(value) && value >= 0);
    };
    const markerIndicesFromTimes = (times: number[], replayStarts: number[], allReplayStarts: number[], bucketCount: number, durationMs: number) => {
        const normalized = normalizeEventTimes(times, replayStarts, allReplayStarts, bucketCount, durationMs);
        return Array.from(new Set(normalized
            .map((value) => Math.floor(value / 5000))
            .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < bucketCount)));
    };

    validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .forEach(({ log }, index) => {
            const details = log?.details;
            if (!details) return;
            const fightName = sanitizeWvwLabel(details.fightName || log.fightName || `Fight ${index + 1}`);
            const mapName = resolveMapName(details, log);
            const fullLabel = buildFightLabel(fightName, String(mapName || ''));
            const values: Record<string, {
                hit: number;
                burst1s: number;
                burst5s: number;
                burst30s: number;
                hitDown: number;
                burst1sDown: number;
                burst5sDown: number;
                burst30sDown: number;
                skillName: string;
                buckets5s: number[];
                buckets5sDown: number[];
                downIndices5s: number[];
                deathIndices5s: number[];
                skillRows?: Array<{ skillName: string; damage: number; downContribution?: number; hits: number; icon?: string }>;
            }> = {};
            const players = Array.isArray(details.players) ? details.players : [];
            const allReplayStarts = players
                .flatMap((entry: any) => {
                    const replay = entry?.combatReplayData;
                    if (Array.isArray(replay)) return replay.map((seg: any) => Number(seg?.start));
                    return [Number(replay?.start)];
                })
                .filter((value: number) => Number.isFinite(value) && value >= 0);
            players.forEach((player: any) => {
                if (player?.notInSquad) return;
                const account = String(player?.account || player?.name || 'Unknown');
                const characterName = String(player?.character_name || player?.display_name || player?.name || '');
                const profession = String(player?.profession || 'Unknown');
                const key = `${account}|${profession}`;
                const spike = getHighestSingleHit(player, details);
                const hit = Number(spike.peak || 0);
                const hitDown = Number(spike.peakDownContribution || 0);
                const { perSecond: perSecondRaw, usedFallback } = getPerSecondDamageSeries(player);
                const { damageTotal, downContributionTotal } = getDamageAndDownContributionTotals(player, details);
                // When damage1S fallback was used, it includes pet/minion damage.
                // Scale down to personal-only damage using targetDamageDist totals.
                const perSecondTotal = usedFallback ? perSecondRaw.reduce((sum, v) => sum + v, 0) : 0;
                const personalRatio = usedFallback && perSecondTotal > 0 && damageTotal > 0 && damageTotal < perSecondTotal
                    ? Math.min(1, damageTotal / perSecondTotal)
                    : 1;
                const perSecond = personalRatio < 1
                    ? perSecondRaw.map((v) => Math.round(v * personalRatio))
                    : perSecondRaw;
                const downRatio = damageTotal > 0 ? Math.min(1, Math.max(0, downContributionTotal / damageTotal)) : 0;
                const perSecondDown = perSecond.map((value) => Number(value || 0) * downRatio);
                const burst1s = Number(getMaxRollingDamage(perSecond, 1) || 0);
                const burst5s = Number(getMaxRollingDamage(perSecond, 5) || 0);
                const burst30s = Number(getMaxRollingDamage(perSecond, 30) || 0);
                const burst1sDown = Number(getMaxRollingDamage(perSecondDown, 1) || 0);
                const burst5sDown = Number(getMaxRollingDamage(perSecondDown, 5) || 0);
                const burst30sDown = Number(getMaxRollingDamage(perSecondDown, 30) || 0);
                const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
                const damageBuckets = Math.max(0, Math.ceil(perSecond.length / 5));
                const downBuckets = Math.max(0, Math.ceil(perSecondDown.length / 5));
                const bucketCount = Math.max(durationBuckets, damageBuckets, downBuckets);
                const rawBuckets = getBuckets(perSecond, 5);
                const rawBucketsDown = getBuckets(perSecondDown, 5);
                const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));
                const buckets5sDown = Array.from({ length: bucketCount }, (_, idx) => Number(rawBucketsDown[idx] || 0));
                const skillRowsMap = new Map<string, { skillName: string; damage: number; downContribution: number; hits: number; icon?: string }>();
                const consumeDamageEntry = (entry: any) => {
                    if (!entry || typeof entry !== 'object') return;
                    if (entry.indirectDamage) return;
                    const damage = Number(entry.totalDamage || 0);
                    const downContribution = Number(entry.downContribution || 0);
                    if ((!Number.isFinite(damage) || damage <= 0) && (!Number.isFinite(downContribution) || downContribution <= 0)) return;
                    const hits = Number(entry.connectedHits || entry.hits || 0);
                    const skillMeta = resolveSkillMeta(entry.id, details);
                    const skillName = skillMeta.name;
                    const row = skillRowsMap.get(skillName) || { skillName, damage: 0, downContribution: 0, hits: 0, icon: skillMeta.icon };
                    row.damage += Number.isFinite(damage) ? damage : 0;
                    row.downContribution += Number.isFinite(downContribution) ? downContribution : 0;
                    row.hits += Number.isFinite(hits) ? hits : 0;
                    if (!row.icon && skillMeta.icon) row.icon = skillMeta.icon;
                    skillRowsMap.set(skillName, row);
                };
                const targetSkillTotals = new Map<number, { damage: number; downContribution: number; hits: number }>();
                if (Array.isArray(player?.targetDamageDist)) {
                    player.targetDamageDist.forEach((targetGroup: any) => {
                        if (!Array.isArray(targetGroup)) return;
                        targetGroup.forEach((list: any) => {
                            if (!Array.isArray(list)) return;
                            list.forEach((entry: any) => {
                                const skillId = Number(entry?.id);
                                const damage = Number(entry?.totalDamage || 0);
                                const downContribution = Number(entry?.downContribution || 0);
                                if (Number.isFinite(skillId)) {
                                    const existing = targetSkillTotals.get(skillId) || { damage: 0, downContribution: 0, hits: 0 };
                                    existing.damage += Number.isFinite(damage) ? damage : 0;
                                    existing.downContribution += Number.isFinite(downContribution) ? downContribution : 0;
                                    existing.hits += Number(entry?.connectedHits || entry?.hits || 0);
                                    targetSkillTotals.set(skillId, existing);
                                }
                                consumeDamageEntry(entry);
                            });
                        });
                    });
                }
                const allowTotalSupplement = !details?.detailedWvW;
                if (allowTotalSupplement && Array.isArray(player?.totalDamageDist)) {
                    player.totalDamageDist.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            const skillId = Number(entry?.id);
                            if (!Number.isFinite(skillId)) {
                                consumeDamageEntry(entry);
                                return;
                            }
                            const target = targetSkillTotals.get(skillId);
                            if (!target) {
                                consumeDamageEntry(entry);
                                return;
                            }
                            const totalDamage = Number(entry?.totalDamage || 0);
                            const totalDownContribution = Number(entry?.downContribution || 0);
                            const totalHits = Number(entry?.connectedHits || entry?.hits || 0);
                            const deltaDamage = totalDamage - Number(target.damage || 0);
                            const deltaDownContribution = totalDownContribution - Number(target.downContribution || 0);
                            const deltaHits = totalHits - Number(target.hits || 0);
                            if (deltaDamage <= 0 && deltaDownContribution <= 0 && deltaHits <= 0) return;
                            consumeDamageEntry({
                                ...entry,
                                totalDamage: Math.max(0, deltaDamage),
                                downContribution: Math.max(0, deltaDownContribution),
                                connectedHits: Math.max(0, deltaHits),
                                hits: Math.max(0, deltaHits)
                            });
                        });
                    });
                }
                const replayEntries = (() => {
                    const replay = player?.combatReplayData;
                    if (Array.isArray(replay)) return replay.filter((entry: any) => entry && typeof entry === 'object');
                    return replay && typeof replay === 'object' ? [replay] : [];
                })();
                const replayStarts = replayEntries
                    .map((entry: any) => Number(entry?.start))
                    .filter((value: number) => Number.isFinite(value) && value >= 0);
                const downTimes = replayEntries.flatMap((entry: any) => toPairs(entry?.down).map(([time]) => Number(time || 0)));
                const deathTimes = replayEntries.flatMap((entry: any) => toPairs(entry?.dead).map(([time]) => Number(time || 0)));
                values[key] = {
                    hit,
                    burst1s,
                    burst5s,
                    burst30s,
                    hitDown,
                    burst1sDown,
                    burst5sDown,
                    burst30sDown,
                    skillName: spike.skillName || 'Unknown Skill',
                    buckets5s,
                    buckets5sDown,
                    downIndices5s: markerIndicesFromTimes(downTimes, replayStarts, allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                    deathIndices5s: markerIndicesFromTimes(deathTimes, replayStarts, allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                    skillRows: Array.from(skillRowsMap.values())
                        .sort((a, b) => b.damage - a.damage)
                        .slice(0, 50)
                };

                const existing = playerMap.get(key) || {
                    key,
                    account,
                    displayName: account,
                    characterName,
                    profession,
                    professionList: [profession],
                    logs: 0,
                    peakHit: 0,
                    peak1s: 0,
                    peak5s: 0,
                    peak30s: 0,
                    peakHitDown: 0,
                    peak1sDown: 0,
                    peak5sDown: 0,
                    peak30sDown: 0,
                    peakFightLabel: '',
                    peakSkillName: ''
                };
                existing.logs += 1;
                if (!existing.professionList.includes(profession)) {
                    existing.professionList.push(profession);
                }
                if (!existing.characterName && characterName) {
                    existing.characterName = characterName;
                }
                if (hit > existing.peakHit) {
                    existing.peakHit = hit;
                    existing.peakFightLabel = fullLabel;
                    existing.peakSkillName = spike.skillName || 'Unknown Skill';
                }
                if (burst1s > existing.peak1s) existing.peak1s = burst1s;
                if (burst5s > existing.peak5s) existing.peak5s = burst5s;
                if (burst30s > existing.peak30s) existing.peak30s = burst30s;
                if (hitDown > existing.peakHitDown) existing.peakHitDown = hitDown;
                if (burst1sDown > existing.peak1sDown) existing.peak1sDown = burst1sDown;
                if (burst5sDown > existing.peak5sDown) existing.peak5sDown = burst5sDown;
                if (burst30sDown > existing.peak30sDown) existing.peak30sDown = burst30sDown;
                playerMap.set(key, existing);
            });

            const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
            const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
            const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
            const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
            const maxHitDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hitDown || 0)), 0);
            const max1sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1sDown || 0)), 0);
            const max5sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5sDown || 0)), 0);
            const max30sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30sDown || 0)), 0);
            fights.push({
                id: log.filePath || log.id || `fight-${index + 1}`,
                shortLabel: `F${index + 1}`,
                fullLabel,
                timestamp: resolveFightTimestamp(details, log),
                values,
                maxHit,
                max1s,
                max5s,
                max30s,
                maxHitDown,
                max1sDown,
                max5sDown,
                max30sDown
            });
        });

    const players = Array.from(playerMap.values()).sort((a, b) => {
        if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
        return a.displayName.localeCompare(b.displayName);
    });

    return { fights, players };
}
