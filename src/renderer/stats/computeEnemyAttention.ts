import { getEntityProfession, squadEntities } from '@axiapps/bridge-metrics/nativeRoster';
import { focusFairShare, getFocusLog, isFocusMeasurable } from '@axiapps/bridge-metrics/nativeFocus';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';

/**
 * Enemy attention — which squad members the other side actually aimed at.
 *
 * Reads axilog's `blocks.focus`, the census arcdps's enemy-event filter leaves
 * behind: an enemy cast-start row survives into a log exactly when its target
 * is squad-side, so the surviving rows are a census of enemy activity pointed
 * at us, with the target attached.
 *
 * ## Two things this module refuses to do
 *
 * **It never averages a focus index across fights.** An index is a share of
 * one log's cast volume over that log's squad size; two logs' indices are not
 * commensurable and a mean of them is meaningless. What pools is the pair
 * (`castsDrawn`, `fairShare`) — both sum — so the session index is
 * `Σ castsDrawn / Σ fairShare`, taken only over the fights the player was in.
 *
 * **It never counts an unmeasurable fight as a quiet one.** Pre-2026-05 arcdps
 * builds emit no enemy cast rows at all, so those fights are excluded from
 * both halves of every ratio and reported separately as
 * {@link EnemyAttentionResult.unmeasuredFightCount}. Folding them in as zeros
 * would drag every index toward zero in proportion to how old the log folder
 * is — see `nativeFocus.isFocusMeasurable`.
 */

/** One player's enemy attention from a single fight. */
export type EnemyAttentionContribution = {
    account: string;
    profession: string;
    isCommander: boolean;
    fightId: string;
    castsDrawn: number;
    castsDrawnMinions: number;
    downs: number;
    preDownCasts: number;
    /**
     * What ONE evenly-targeted squad member would have drawn in this fight
     * (`total_casts / squad_size`). The denominator that makes indices poolable.
     */
    fairShare: number;
};

export type EnemyAttentionRow = {
    account: string;
    profession: string;
    professionList: string[];
    /** Measurable fights this player appeared in. */
    fightCount: number;
    castsDrawn: number;
    castsDrawnMinions: number;
    downs: number;
    preDownCasts: number;
    /**
     * `Σ castsDrawn / Σ fairShare`. `1` is exactly an even share of the
     * enemy's attention; `3` is three times it. `0` when the player was in no
     * measurable fight that had any aimed casts.
     */
    focusIndex: number;
    /** Aimed casts in the window before a down, per down. `0` when never downed. */
    preDownPerDown: number;
    isCommander: boolean;
};

export type EnemyAttentionResult = {
    rows: EnemyAttentionRow[];
    /** Fights whose arcdps build carries the census. */
    measuredFightCount: number;
    /** Fights too old to carry it — excluded from every number above, not zeroed into it. */
    unmeasuredFightCount: number;
    /** Aimed casts across every measured fight. */
    totalCasts: number;
    /** Casts aimed at squad minions across every measured fight. */
    totalMinionCasts: number;
    /**
     * The pre-down window axilog used, in ms — read off the document rather
     * than hardcoded, so the label cannot drift from the measurement. `0` when
     * nothing was measured.
     */
    preDownWindowMs: number;
};

export const EMPTY_ENEMY_ATTENTION: EnemyAttentionResult = {
    rows: [], measuredFightCount: 0, unmeasuredFightCount: 0,
    totalCasts: 0, totalMinionCasts: 0, preDownWindowMs: 0,
};

/** Per-fight slice, plus whether the fight could be measured at all. */
export type EnemyAttentionIngest = {
    measurable: boolean;
    preDownWindowMs: number;
    /**
     * Human fight label — `"Eternal: Bay (2:31)"` — for the per-fight Pin
     * Pressure table. Built here rather than in the section because the web
     * report has no log details left at render time, so the zone and average
     * position it derives from are gone by then. Empty when the log named no
     * zone; the section falls back to the fight id.
     */
    label: string;
    contributions: EnemyAttentionContribution[];
};

export const ingestLogEnemyAttention = (log: any, fightIndex: number): EnemyAttentionIngest => {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;
    const label = buildFightLabelV2({
        zone: details?.fightName || log?.fightName || `Fight ${fightIndex + 1}`,
        durationMs: Math.max(0, Number(details?.durationMS || 0)),
        avgPosition: computeFightAvgPosition(details),
    });

    // Asked before the block is read: on axilog 1.11.0 a pre-rework log still
    // carries a fully zeroed roster, and treating it as data would report
    // "nobody was focused" for a fight that cannot answer the question.
    if (!isFocusMeasurable(details)) {
        return { measurable: false, preDownWindowMs: 0, label, contributions: [] };
    }
    const focus = getFocusLog(details);
    if (!focus) return { measurable: false, preDownWindowMs: 0, label, contributions: [] };

    const squad = squadEntities(details?.native ?? {});
    if (squad.length === 0) {
        return { measurable: true, preDownWindowMs: focus.preDownWindowMs, label, contributions: [] };
    }

    const commander = squad.find((e: any) => {
        const c = (e as any)?.commander;
        return !!c && typeof c === 'object' && Array.isArray(c.segments) && c.segments.length > 0;
    });

    const fairShare = focusFairShare(focus);
    const contributions: EnemyAttentionContribution[] = [];
    for (const entity of squad) {
        // `by_entity` is squad-only by construction, but a squad member with no
        // row still played the fight and still shared its fair-share
        // denominator — dropping them would inflate everyone else's index.
        const row = focus.rows.get(entity.id);
        contributions.push({
            account: entity?.account || 'Unknown',
            // EI's `profession` is native's `elite_spec`, which is what the
            // icon and colour tables are keyed on.
            profession: getEntityProfession(entity) || 'Unknown',
            isCommander: entity.id === commander?.id,
            fightId,
            castsDrawn: row?.castsDrawn ?? 0,
            castsDrawnMinions: row?.castsDrawnMinions ?? 0,
            downs: row?.downs ?? 0,
            preDownCasts: row?.preDownCasts ?? 0,
            fairShare,
        });
    }
    return { measurable: true, preDownWindowMs: focus.preDownWindowMs, label, contributions };
};

export const finalizeEnemyAttention = (ingests: EnemyAttentionIngest[]): EnemyAttentionResult => {
    let measuredFightCount = 0;
    let unmeasuredFightCount = 0;
    let preDownWindowMs = 0;
    const byAccount = new Map<string, EnemyAttentionContribution[]>();

    for (const ingest of ingests) {
        if (!ingest?.measurable) { unmeasuredFightCount += 1; continue; }
        measuredFightCount += 1;
        if (ingest.preDownWindowMs > 0) preDownWindowMs = ingest.preDownWindowMs;
        for (const c of ingest.contributions || []) {
            const list = byAccount.get(c.account);
            if (list) list.push(c); else byAccount.set(c.account, [c]);
        }
    }

    let totalCasts = 0;
    let totalMinionCasts = 0;
    const rows: EnemyAttentionRow[] = [];
    for (const [account, contributions] of byAccount) {
        let castsDrawn = 0, castsDrawnMinions = 0, downs = 0, preDownCasts = 0, fairShare = 0;
        const professions = new Map<string, number>();
        let isCommander = false;
        for (const c of contributions) {
            castsDrawn += c.castsDrawn;
            castsDrawnMinions += c.castsDrawnMinions;
            downs += c.downs;
            preDownCasts += c.preDownCasts;
            fairShare += c.fairShare;
            professions.set(c.profession, (professions.get(c.profession) ?? 0) + 1);
            if (c.isCommander) isCommander = true;
        }
        totalCasts += castsDrawn;
        totalMinionCasts += castsDrawnMinions;
        const professionList = [...professions.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name]) => name);
        rows.push({
            account,
            profession: professionList[0] ?? 'Unknown',
            professionList,
            fightCount: contributions.length,
            castsDrawn,
            castsDrawnMinions,
            downs,
            preDownCasts,
            focusIndex: fairShare > 0 ? castsDrawn / fairShare : 0,
            preDownPerDown: downs > 0 ? preDownCasts / downs : 0,
            isCommander,
        });
    }

    rows.sort((a, b) => b.focusIndex - a.focusIndex || a.account.localeCompare(b.account));
    return {
        rows, measuredFightCount, unmeasuredFightCount,
        totalCasts, totalMinionCasts, preDownWindowMs,
    };
};
