import { resolveFightTimestamp } from './utils/timestampUtils';
import { sanitizeWvwLabel, resolveMapName, buildFightLabel } from './utils/labelUtils';
import { PROFESSION_COLORS } from '../../shared/professionUtils';

const knownProfessionNames = new Set(Object.keys(PROFESSION_COLORS));
const knownProfessionList = Object.keys(PROFESSION_COLORS)
    .filter((name) => name && name !== 'Unknown')
    .sort((a, b) => b.length - a.length);
const baseProfessionNames = [
    'Guardian',
    'Revenant',
    'Warrior',
    'Engineer',
    'Ranger',
    'Thief',
    'Elementalist',
    'Mesmer',
    'Necromancer'
];
const resolveProfessionLabel = (name?: string) => {
    if (!name) return 'Unknown';
    const cleaned = String(name)
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\s*\[[^\]]*\]\s*$/, '')
        .replace(/\s\d+$/, '')
        .trim();
    if (knownProfessionNames.has(cleaned)) return cleaned;
    const lower = cleaned.toLowerCase();
    for (const prof of knownProfessionList) {
        if (lower.includes(prof.toLowerCase())) return prof;
    }
    const baseMatch = baseProfessionNames.find((prof) => lower.includes(prof.toLowerCase()));
    return baseMatch || cleaned || 'Unknown';
};

export function computeIncomingStrikeDamageData(validLogs: any[]) {

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
            totalDamage: number;
            skillName: string;
            buckets5s: number[];
            downIndices5s: number[];
            deathIndices5s: number[];
        }>;
        maxHit: number;
        max1s: number;
        max5s: number;
        max30s: number;
        maxTotal: number;
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
        totalDamage: number;
        peakFightLabel: string;
        peakSkillName: string;
    }>();

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
    const getHighestIncomingStrikeHit = (target: any, details: any) => {
        let bestValue = 0;
        let bestName = '';
        const readEntryPeak = (entry: any) => {
            if (!entry || typeof entry !== 'object') return;
            if (entry.indirectDamage) return;
            const candidates = [
                Number(entry.max),
                Number(entry.maxDamage),
                Number(entry.maxHit)
            ].filter((n) => Number.isFinite(n));
            const peak = candidates.length > 0 ? Math.max(...candidates) : 0;
            if (peak > bestValue) {
                bestValue = peak;
                bestName = resolveSkillMeta(entry.id, details).name;
            }
        };
        if (Array.isArray(target?.totalDamageDist)) {
            target.totalDamageDist.forEach((list: any) => {
                if (!Array.isArray(list)) return;
                list.forEach((entry: any) => readEntryPeak(entry));
            });
        }
        if (Array.isArray(target?.targetDamageDist)) {
            target.targetDamageDist.forEach((targetGroup: any) => {
                if (!Array.isArray(targetGroup)) return;
                targetGroup.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => readEntryPeak(entry));
                });
            });
        }
        return { peak: bestValue, skillName: bestName || 'Unknown Skill' };
    };
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
    const sumSeries = (seriesList: number[][]) => {
        if (!Array.isArray(seriesList) || seriesList.length === 0) return [] as number[];
        const maxLen = seriesList.reduce((len, series) => Math.max(len, Array.isArray(series) ? series.length : 0), 0);
        if (maxLen <= 0) return [] as number[];
        const out = new Array<number>(maxLen).fill(0);
        seriesList.forEach((series) => {
            if (!Array.isArray(series)) return;
            for (let i = 0; i < maxLen; i += 1) {
                out[i] += Number(series[i] || 0);
            }
        });
        return out;
    };
    const normalizeCumulativeSeries = (value: any): number[] => {
        if (!Array.isArray(value) || value.length === 0) return [];
        const first = value[0];
        if (typeof first === 'number') {
            return value.map((entry: any) => Number(entry || 0));
        }
        if (Array.isArray(first) && first.length > 0) {
            if (typeof first[0] === 'number') {
                return first.map((entry: any) => Number(entry || 0));
            }
            if (Array.isArray(first[0])) {
                // Handles nested shapes like [phase][target][time] by summing phase 0 targets.
                const phase0Targets = first
                    .map((series: any) => Array.isArray(series) ? series.map((entry: any) => Number(entry || 0)) : null)
                    .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
                if (phase0Targets.length > 0) {
                    return sumSeries(phase0Targets);
                }
            }
        }
        return [];
    };
    const getPerSecondStrikeSeries = (target: any) => {
        const cumulativePower = normalizeCumulativeSeries(target?.powerDamage1S);
        const cumulativeAny = normalizeCumulativeSeries(target?.damage1S);
        const cumulative = cumulativePower.length > 0 ? cumulativePower : cumulativeAny;
        return toPerSecond(cumulative);
    };
    const getTargetPowerCumulativeFromPlayer = (player: any, targetIndex: number) => {
        const targetPower = player?.targetPowerDamage1S;
        if (!Array.isArray(targetPower) || !Array.isArray(targetPower[targetIndex])) return [] as number[];
        const targetEntry = targetPower[targetIndex];
        if (!Array.isArray(targetEntry) || targetEntry.length === 0) return [] as number[];
        if (typeof targetEntry[0] === 'number') {
            return targetEntry.map((value: any) => Number(value || 0));
        }
        if (Array.isArray(targetEntry[0]) && !Array.isArray(targetEntry[0][0])) {
            return targetEntry[0].map((value: any) => Number(value || 0));
        }
        if (Array.isArray(targetEntry[0]) && Array.isArray(targetEntry[0][0])) {
            const phase0 = targetEntry[0];
            const flattened = phase0
                .map((series: any) => Array.isArray(series) ? series.map((value: any) => Number(value || 0)) : null)
                .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
            return sumSeries(flattened);
        }
        return [] as number[];
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
                totalDamage: number;
                skillName: string;
                buckets5s: number[];
                downIndices5s: number[];
                deathIndices5s: number[];
                skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
            }> = {};
            const allPlayers = Array.isArray(details.players) ? details.players : [];
            const squadPlayers = allPlayers.filter((entry: any) => !entry?.notInSquad);
            const allReplayStarts = squadPlayers
                .flatMap((entry: any) => {
                    const replay = entry?.combatReplayData;
                    if (Array.isArray(replay)) return replay.map((seg: any) => Number(seg?.start));
                    return [Number(replay?.start)];
                })
                .filter((value: number) => Number.isFinite(value) && value >= 0);
            const downTimes = squadPlayers.flatMap((entry: any) => {
                const replay = entry?.combatReplayData;
                const segments = Array.isArray(replay) ? replay : (replay ? [replay] : []);
                return segments.flatMap((segment: any) => toPairs(segment?.down).map(([time]) => Number(time || 0)));
            });
            const deathTimes = squadPlayers.flatMap((entry: any) => {
                const replay = entry?.combatReplayData;
                const segments = Array.isArray(replay) ? replay : (replay ? [replay] : []);
                return segments.flatMap((segment: any) => toPairs(segment?.dead).map(([time]) => Number(time || 0)));
            });

            const classSeries = new Map<string, { perSecond: number[]; hit: number; skillName: string }>();
            const classSkillRows = new Map<string, Map<string, { skillName: string; damage: number; hits: number; icon?: string }>>();
            const classCounts = new Map<string, number>();
            const targets = Array.isArray(details.targets) ? details.targets : [];
            targets.forEach((target: any, targetIndex: number) => {
                if (!target || target.isFake || !target.enemyPlayer) return;
                const profession = resolveProfessionLabel(target?.profession || target?.name || target?.id) || 'Unknown';
                classCounts.set(profession, (classCounts.get(profession) || 0) + 1);
                const skillBucket = classSkillRows.get(profession) || new Map<string, { skillName: string; damage: number; hits: number; icon?: string }>();
                if (Array.isArray(target?.totalDamageDist)) {
                    target.totalDamageDist.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            if (!entry || typeof entry !== 'object') return;
                            if (entry.indirectDamage) return;
                            const damage = Number(entry.totalDamage || 0);
                            if (!Number.isFinite(damage) || damage <= 0) return;
                            const hits = Number(entry.connectedHits || entry.hits || 0);
                            const skillMeta = resolveSkillMeta(entry.id, details);
                            const skillName = skillMeta.name;
                            const row = skillBucket.get(skillName) || { skillName, damage: 0, hits: 0, icon: skillMeta.icon };
                            row.damage += damage;
                            row.hits += Number.isFinite(hits) ? hits : 0;
                            if (!row.icon && skillMeta.icon) row.icon = skillMeta.icon;
                            skillBucket.set(skillName, row);
                        });
                    });
                }
                classSkillRows.set(profession, skillBucket);
                const squadTargetCumulative = sumSeries(squadPlayers.map((player: any) =>
                    getTargetPowerCumulativeFromPlayer(player, targetIndex)
                ));
                const strikeSeries = squadTargetCumulative.length > 0
                    ? toPerSecond(squadTargetCumulative)
                    : getPerSecondStrikeSeries(target);
                const bestHit = getHighestIncomingStrikeHit(target, details);
                let bucket = classSeries.get(profession);
                if (!bucket) {
                    bucket = { perSecond: [], hit: 0, skillName: '' };
                    classSeries.set(profession, bucket);
                }
                if (strikeSeries.length > bucket.perSecond.length) {
                    bucket.perSecond.length = strikeSeries.length;
                }
                for (let i = 0; i < strikeSeries.length; i += 1) {
                    bucket.perSecond[i] = Number(bucket.perSecond[i] || 0) + Number(strikeSeries[i] || 0);
                }
                const peakHit = Number(bestHit.peak || 0);
                if (peakHit > bucket.hit) {
                    bucket.hit = peakHit;
                    bucket.skillName = bestHit.skillName || 'Unknown Skill';
                }
            });

            // Fallback: if enemy target timelines are unavailable (or present but empty), distribute
            // squad incoming strike by enemy class counts so burst/drilldown still work.
            const hasClassTimelineData = Array.from(classSeries.values()).some((entry) =>
                Array.isArray(entry.perSecond) && entry.perSecond.some((value) => Number(value || 0) > 0)
            );
            if (classSeries.size === 0 || !hasClassTimelineData) {
                const squadIncomingSeries = sumSeries(squadPlayers.map((player: any) => {
                    const cumulative = normalizeCumulativeSeries(player?.powerDamageTaken1S);
                    return toPerSecond(cumulative);
                }));
                const totalClassCount = Array.from(classCounts.values()).reduce((sum, count) => sum + Number(count || 0), 0);
                if (squadIncomingSeries.length > 0 && totalClassCount > 0) {
                    classCounts.forEach((count, profession) => {
                        const weight = Number(count || 0) / totalClassCount;
                        const weightedSeries = squadIncomingSeries.map((value) => Number(value || 0) * weight);
                        const existing = classSeries.get(profession);
                        classSeries.set(profession, {
                            perSecond: weightedSeries,
                            hit: Number(existing?.hit || 0),
                            skillName: String(existing?.skillName || '')
                        });
                    });
                }
            }

            classSeries.forEach((entry, profession) => {
                const key = profession;
                const hit = Number(entry.hit || 0);
                const burst1s = Number(getMaxRollingDamage(entry.perSecond, 1) || 0);
                const burst5s = Number(getMaxRollingDamage(entry.perSecond, 5) || 0);
                const burst30s = Number(getMaxRollingDamage(entry.perSecond, 30) || 0);
                const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
                const damageBuckets = Math.max(0, Math.ceil(entry.perSecond.length / 5));
                const bucketCount = Math.max(durationBuckets, damageBuckets);
                const rawBuckets = getBuckets(entry.perSecond, 5);
                const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));
                const totalDamage = buckets5s.reduce((sum, value) => sum + Number(value || 0), 0);
                values[key] = {
                    hit,
                    burst1s,
                    burst5s,
                    burst30s,
                    totalDamage,
                    skillName: entry.skillName || 'Unknown Skill',
                    buckets5s,
                    downIndices5s: markerIndicesFromTimes(downTimes, [], allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                    deathIndices5s: markerIndicesFromTimes(deathTimes, [], allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                    skillRows: Array.from(classSkillRows.get(profession)?.values() || [])
                        .sort((a, b) => b.damage - a.damage)
                        .slice(0, 50)
                };

                const existing = playerMap.get(key) || {
                    key,
                    account: profession,
                    displayName: profession,
                    characterName: '',
                    profession,
                    professionList: [profession],
                    logs: 0,
                    peakHit: 0,
                    peak1s: 0,
                    peak5s: 0,
                    peak30s: 0,
                    totalDamage: 0,
                    peakFightLabel: '',
                    peakSkillName: ''
                };
                existing.totalDamage += totalDamage;
                existing.logs += 1;
                if (hit > existing.peakHit) {
                    existing.peakHit = hit;
                    existing.peakFightLabel = fullLabel;
                    existing.peakSkillName = entry.skillName || 'Unknown Skill';
                }
                if (burst1s > existing.peak1s) existing.peak1s = burst1s;
                if (burst5s > existing.peak5s) existing.peak5s = burst5s;
                if (burst30s > existing.peak30s) existing.peak30s = burst30s;
                playerMap.set(key, existing);
            });

            const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
            const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
            const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
            const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
            const maxTotal = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.totalDamage || 0)), 0);
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
                maxTotal
            });
        });

    const players = Array.from(playerMap.values()).sort((a, b) => {
        if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
        return a.displayName.localeCompare(b.displayName);
    });

    return { fights, players };
}
