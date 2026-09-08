/** The card's view of a published session. Built once from the raw `stats`
 *  blob and consumed by both the text embed and the PNG template, so the two
 *  cannot drift apart. Pure — no Electron, no Discord, no I/O. */

export type CardValueFormat = 'compact' | 'int' | 'dist';

export interface CardLeader {
    rank: number;
    account: string;
    profession: string;
    value: string;
}

export interface CardBoard {
    key: string;
    label: string;
    leaders: CardLeader[];
}

export interface CardMapSlice { name: string; value: number; color: string }

export interface CardFight { label: string; isWin: boolean }

export interface ReportCardModel {
    headline: string;
    guildTag: string;
    guildName: string;
    dateLabel: string;
    fightCount: number;
    wins: number;
    losses: number;
    recordLabel: string;
    squad: { kills: number; downs: number; deaths: number; kdr: string };
    enemy: { kills: number; downs: number; deaths: number; kdr: string };
    size: { squad: number; enemy: number };
    maps: CardMapSlice[];
    fights: CardFight[];
    boards: CardBoard[];
}

/** Fixed board set. `stability` is a summed stability-generation value, not a
 *  percentage — it formats as a compact number with no unit. `closestToTag` is
 *  an average distance in inches, already sorted ascending upstream. */
export const REPORT_CARD_BOARDS: ReadonlyArray<{ key: string; label: string; format: CardValueFormat }> = [
    { key: 'damage', label: 'Damage', format: 'compact' },
    { key: 'healing', label: 'Healing', format: 'compact' },
    { key: 'barrier', label: 'Barrier', format: 'compact' },
    { key: 'cleanses', label: 'Cleanses', format: 'int' },
    { key: 'strips', label: 'Strips', format: 'int' },
    { key: 'stability', label: 'Stability', format: 'compact' },
    { key: 'ccAndInterrupts', label: 'CC + Interrupts', format: 'int' },
    { key: 'downContrib', label: 'Down Contribution', format: 'compact' },
    { key: 'closestToTag', label: 'Closest to Tag', format: 'dist' },
];

const DEFAULT_TOP_N = 3;

export function formatCardValue(value: number, format: CardValueFormat): string {
    if (!Number.isFinite(value)) return '—';
    if (format === 'dist') return String(Math.round(value));
    if (format === 'int') return Math.round(value).toLocaleString('en-US');
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) {
        const k = value / 1_000;
        // 988.4k reads as noise at card size; 38.4k does not.
        return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
    }
    return String(Math.round(value));
}

const num = (raw: unknown): number => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
};

const str = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw));

/** KDR arrives pre-formatted as a string; an absent one is a dash, not "0". */
const kdr = (raw: unknown): string => {
    const s = str(raw).trim();
    return s.length > 0 ? s : '—';
};

export function buildReportCardModel(meta: any, stats: any, opts?: { topN?: number }): ReportCardModel {
    const topN = Math.max(1, opts?.topN ?? DEFAULT_TOP_N);
    const leaderboards = (stats?.leaderboards ?? {}) as Record<string, any>;

    const boards: CardBoard[] = REPORT_CARD_BOARDS.map(({ key, label, format }) => {
        const raw = Array.isArray(leaderboards[key]) ? leaderboards[key] : [];
        const leaders = raw.slice(0, topN).map((entry: any, index: number) => ({
            rank: num(entry?.rank) || index + 1,
            account: str(entry?.account),
            profession: str(entry?.profession),
            value: formatCardValue(Number(entry?.value), format),
        }));
        return { key, label, leaders };
    });

    const maps: CardMapSlice[] = (Array.isArray(stats?.mapData) ? stats.mapData : []).map((slice: any) => ({
        name: str(slice?.name),
        value: num(slice?.value),
        color: str(slice?.color) || '#64748b',
    }));

    const fights: CardFight[] = (Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : []).map(
        (fight: any, index: number) => ({
            label: str(fight?.shortLabel) || `F${index + 1}`,
            isWin: Boolean(fight?.isWin),
        })
    );

    const wins = num(stats?.wins);
    const losses = num(stats?.losses);

    return {
        headline: 'WvW Raid Report',
        guildTag: str(meta?.guild?.tag),
        guildName: str(meta?.guild?.name),
        dateLabel: str(meta?.dateLabel),
        fightCount: num(stats?.total),
        wins,
        losses,
        recordLabel: `${wins}W – ${losses}L`,
        squad: {
            kills: num(stats?.totalSquadKills),
            downs: num(stats?.totalSquadDowns),
            deaths: num(stats?.totalSquadDeaths),
            kdr: kdr(stats?.squadKDR),
        },
        enemy: {
            kills: num(stats?.totalEnemyKills),
            downs: num(stats?.totalEnemyDowns),
            deaths: num(stats?.totalEnemyDeaths),
            kdr: kdr(stats?.enemyKDR),
        },
        size: {
            squad: Math.round(num(stats?.avgSquadSize)),
            enemy: Math.round(num(stats?.avgEnemies)),
        },
        maps,
        fights,
        boards,
    };
}
