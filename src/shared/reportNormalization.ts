import type { ReportPayload } from './reportTypes';

/**
 * Zero out closest-to-tag values for commanders (they are always at tag distance 0).
 */
export const normalizeCommanderDistance = (payload: ReportPayload): ReportPayload => {
    const commanders = new Set((payload?.meta?.commanders || []).map((name) => String(name)));
    if (commanders.size === 0) return payload;
    const stats: any = payload.stats;
    if (stats?.leaderboards?.closestToTag) {
        stats.leaderboards.closestToTag = stats.leaderboards.closestToTag.map((entry: any) => {
            if (commanders.has(String(entry?.account))) {
                return { ...entry, value: 0 };
            }
            return entry;
        });
    }
    if (stats?.closestToTag?.player && commanders.has(String(stats.closestToTag.player))) {
        stats.closestToTag = { ...stats.closestToTag, value: 0 };
    }
    return payload;
};

/**
 * Re-sort and reconcile down contribution leaderboard for legacy reports.
 */
export const normalizeTopDownContribution = (payload: ReportPayload): ReportPayload => {
    const stats: any = payload?.stats;
    if (!stats || typeof stats !== 'object') return payload;
    const rows = Array.isArray(stats?.leaderboards?.downContrib) ? stats.leaderboards.downContrib : [];
    if (!rows.length) return payload;
    const sorted = rows
        .map((row: any) => ({ ...row, value: Number(row?.value ?? 0) }))
        .filter((row: any) => Number.isFinite(row.value))
        .sort((a: any, b: any) => (b.value - a.value) || String(a?.account || '').localeCompare(String(b?.account || '')));
    const top = sorted[0];
    if (!top) return payload;
    stats.maxDownContrib = {
        ...(stats.maxDownContrib || {}),
        value: Number(top.value || 0),
        player: String(top.account || stats.maxDownContrib?.player || '-'),
        count: Number(top.count || stats.maxDownContrib?.count || 0),
        profession: String(top.profession || stats.maxDownContrib?.profession || 'Unknown'),
        professionList: Array.isArray(top.professionList) ? top.professionList : (stats.maxDownContrib?.professionList || [])
    };
    return payload;
};

/**
 * Apply all normalization passes to a report payload.
 */
export const normalizeReportPayload = (payload: ReportPayload): ReportPayload => {
    return normalizeTopDownContribution(normalizeCommanderDistance(payload));
};
