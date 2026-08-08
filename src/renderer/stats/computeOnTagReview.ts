/**
 * "On Tag Review" — classifies every squad death by distance to the commander
 * tag, mirroring GW2_EI_log_combiner's table (On_Tag = 600, Run_Back = 5000):
 *   On-Tag ≤ 600 · Off-Tag ≤ 5000 (range recorded) · Run-Back > 5000.
 * After-Tag is an overlay count (subset of Total) for downs that started after
 * the tag's first death in that fight.
 */
export const ON_TAG_RANGE = 600;
export const RUN_BACK_RANGE = 5000;

export type OnTagDeath = {
    range: number;
    afterTag: boolean;
};

/** One player's contribution from a single fight. */
export type OnTagReviewContribution = {
    account: string;
    profession: string;
    isCommander: boolean;
    fightId: string;
    /** Mean distance to tag while alive and before the tag died; null if unknown. */
    avgDist: number | null;
    deaths: OnTagDeath[];
};

export type OnTagReviewRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    avgDist: number | null;
    onTag: number;
    offTag: number;
    afterTag: number;
    runBack: number;
    total: number;
    offTagRanges: number[];
    isCommander: boolean;
};

export type OnTagReviewResult = {
    rows: OnTagReviewRow[];
    usableFightCount: number;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const getDistToCom = (player: any): number | null => {
    const v = player?.statsAll?.[0]?.distToCom;
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= RUN_BACK_RANGE ? v : null;
};

export const ingestLogOnTagReview = (log: any, fightIndex: number): OnTagReviewContribution[] => {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;
    const players = Array.isArray(details?.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return [];

    const replayMeta = details?.combatReplayMetaData || {};
    const pollingRate = replayMeta?.pollingRate > 0 ? replayMeta.pollingRate : 0;
    const inchToPixel = replayMeta?.inchToPixel > 0 ? replayMeta.inchToPixel : 0;

    const commander = squadPlayers.find((p: any) => p?.hasCommanderTag);
    const tagPositions: Array<[number, number]> = commander?.combatReplayData?.positions || [];
    if (!commander || tagPositions.length === 0 || pollingRate <= 0 || inchToPixel <= 0) return [];

    // Tag death = first dead interval starting after fight start.
    let tagDied = false;
    let tagDeathMs = Infinity;
    for (const entry of commander?.combatReplayData?.dead ?? []) {
        if (Array.isArray(entry) && Number.isFinite(entry[0]) && entry[0] > 0) {
            tagDied = true;
            tagDeathMs = entry[0];
            break;
        }
    }
    const tagDeathPoll = tagDied ? Math.floor(tagDeathMs / pollingRate) : Infinity;

    const out: OnTagReviewContribution[] = [];

    for (const player of squadPlayers) {
        const account = player?.account || 'Unknown';
        const profession = player?.profession || 'Unknown';
        const isCommanderPlayer = !!player?.hasCommanderTag;

        const replay = player?.combatReplayData;
        const positions: Array<[number, number]> = Array.isArray(replay?.positions) ? replay.positions : [];
        const playerOffset = Math.floor(Number(replay?.start || 0) / pollingRate);

        const deaths: OnTagDeath[] = [];
        let firstDeathPoll = Infinity;

        if (positions.length > 0 && Array.isArray(replay?.dead) && Array.isArray(replay?.down)) {
            const deadSet = new Set<number>();
            for (const entry of replay.dead) {
                if (Array.isArray(entry) && Number.isFinite(entry[0]) && entry[0] > 0) {
                    deadSet.add(entry[0]);
                }
            }

            for (const entry of replay.down) {
                if (!Array.isArray(entry)) continue;
                const downStartMs = Number(entry[0]);
                const linkedDeathMs = Number(entry[1]);
                if (!Number.isFinite(downStartMs) || downStartMs < 0) continue;
                if (!deadSet.has(linkedDeathMs)) continue;

                const pollIndex = Math.floor(downStartMs / pollingRate);
                const playerIdx = clamp(pollIndex - playerOffset, 0, positions.length - 1);
                const tagIdx = clamp(pollIndex, 0, tagPositions.length - 1);

                const [px, py] = positions[playerIdx];
                const [tx, ty] = tagPositions[tagIdx];
                const range = isCommanderPlayer ? 0 : Math.round(Math.hypot(px - tx, py - ty) / inchToPixel);

                deaths.push({ range, afterTag: tagDied && downStartMs > tagDeathMs });
                firstDeathPoll = Math.min(firstDeathPoll, pollIndex);
            }
        }

        // Avg distance to tag over polls before the player's first death and the
        // tag's death — "how far from tag while it mattered".
        let avgDist: number | null = null;
        if (positions.length > 0) {
            const limitPoll = Math.min(firstDeathPoll, tagDeathPoll);
            let sum = 0;
            let count = 0;
            for (let i = 0; i < positions.length; i++) {
                const absPoll = i + playerOffset;
                if (absPoll >= limitPoll) break;
                const tagIdx = clamp(absPoll, 0, tagPositions.length - 1);
                const [px, py] = positions[i];
                const [tx, ty] = tagPositions[tagIdx];
                sum += isCommanderPlayer ? 0 : Math.hypot(px - tx, py - ty) / inchToPixel;
                count++;
            }
            if (count > 0) {
                const mean = sum / count;
                if (mean <= RUN_BACK_RANGE) avgDist = mean;
            }
        }
        if (avgDist === null) avgDist = getDistToCom(player);

        // Nothing measurable this fight — skip so the player doesn't get a hollow row.
        if (deaths.length === 0 && avgDist === null) continue;

        out.push({ account, profession, isCommander: isCommanderPlayer, fightId, avgDist, deaths });
    }

    return out;
};

export const finalizeOnTagReview = (contributions: OnTagReviewContribution[]): OnTagReviewResult => {
    if (contributions.length === 0) return { rows: [], usableFightCount: 0 };

    const byAccount = new Map<string, OnTagReviewContribution[]>();
    const allFightIds = new Set<string>();
    for (const c of contributions) {
        allFightIds.add(c.fightId);
        const list = byAccount.get(c.account);
        if (list) list.push(c);
        else byAccount.set(c.account, [c]);
    }

    const rows: OnTagReviewRow[] = [];

    for (const [account, list] of byAccount) {
        const fightIds = new Set<string>();
        let onTag = 0;
        let offTag = 0;
        let afterTag = 0;
        let runBack = 0;
        const offTagRanges: number[] = [];
        const avgValues: number[] = [];

        for (const c of list) {
            fightIds.add(c.fightId);
            if (c.avgDist !== null) avgValues.push(c.avgDist);
            for (const d of c.deaths) {
                if (d.afterTag) afterTag++;
                if (d.range <= ON_TAG_RANGE) onTag++;
                else if (d.range <= RUN_BACK_RANGE) {
                    offTag++;
                    offTagRanges.push(d.range);
                } else runBack++;
            }
        }

        const professionList = Array.from(new Set(list.map(c => c.profession).filter(p => p && p !== 'Unknown')));
        const avgDist = avgValues.length > 0
            ? Math.round(avgValues.reduce((s, v) => s + v, 0) / avgValues.length)
            : null;

        rows.push({
            account,
            profession: list[list.length - 1].profession,
            professionList,
            fightCount: fightIds.size,
            avgDist,
            onTag,
            offTag,
            afterTag,
            runBack,
            total: onTag + offTag + runBack,
            offTagRanges: offTagRanges.sort((a, b) => b - a),
            isCommander: list.some(c => c.isCommander),
        });
    }

    rows.sort((a, b) => (b.total - a.total) || a.account.localeCompare(b.account));

    return { rows, usableFightCount: allFightIds.size };
};

export const computeOnTagReview = (sortedFightLogs: Array<{ log: any }>): OnTagReviewResult => {
    const all: OnTagReviewContribution[] = [];
    sortedFightLogs.forEach(({ log }, idx) => {
        all.push(...ingestLogOnTagReview(log, idx));
    });
    return finalizeOnTagReview(all);
};
