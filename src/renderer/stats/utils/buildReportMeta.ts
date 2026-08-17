import {
    getEncounterStartMs,
    getEncounterEndMs,
    getNativeReport,
} from '@axiapps/bridge-metrics';
import { computePrimaryCommanderIdentity } from './computePrimaryCommander';
import { computeDominantGuildId } from './computeDominantGuildId';

export interface ReportMeta {
    id: string;
    title: string;
    commanders: string[];
    primaryCommander: string;
    primaryCommanderAccount: string;
    guildId: string;
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    generatedAt: string;
}

/**
 * Build the published report's metadata header from the session's logs.
 *
 * Extracted from `useStatsUploads` so it can be tested without driving the
 * hook. Its output keys are the published `report.json`'s, which keep their
 * current shape for the duration of the migration.
 */
export const buildReportMeta = (detailsList: any[]): ReportMeta => {
    const commanderSet = new Set<string>();
    let firstStart: Date | null = null;
    let lastEnd: Date | null = null;

    detailsList.forEach((details) => {
        if (!details) return;
        // Native reports the real fight start; the EI chain behind it reaches
        // that number only through the `.zevtc` mtime, which is unrelated to the
        // fight for any log that has been copied, restored or synced.
        const timeStart = getEncounterStartMs(details)
            ?? details.timeStartStd ?? details.timeStart ?? details.uploadTime;
        const timeEnd = getEncounterEndMs(details)
            ?? details.timeEndStd ?? details.timeEnd ?? details.uploadTime;
        const startDate = timeStart ? new Date(timeStart) : null;
        const endDate = timeEnd ? new Date(timeEnd) : null;
        if (startDate && !Number.isNaN(startDate.getTime())) {
            if (!firstStart || startDate < firstStart) firstStart = startDate;
        }
        if (endDate && !Number.isNaN(endDate.getTime())) {
            if (!lastEnd || endDate > lastEnd) lastEnd = endDate;
        }
        const players = (details.players || []) as any[];
        players.forEach((player) => {
            if (player?.notInSquad) return;
            if (player?.hasCommanderTag) {
                commanderSet.add(player?.name || player?.account || 'Unknown');
            }
        });
    });

    const commanders = Array.from(commanderSet).sort((a, b) => a.localeCompare(b));
    const safeStart: Date = firstStart || new Date();
    const safeEnd: Date = lastEnd || safeStart;
    const pad = (value: number) => String(value).padStart(2, '0');
    const reportId = `${safeStart.getFullYear()}${pad(safeStart.getMonth() + 1)}${pad(safeStart.getDate())}`
        + `-${pad(safeStart.getHours())}${pad(safeStart.getMinutes())}${pad(safeStart.getSeconds())}`
        + `-${Math.random().toString(36).slice(2, 6)}`;

    const commanderIdentity = computePrimaryCommanderIdentity(detailsList);
    // Native reports only — a legacy EI-shaped log carries no `.native` and
    // simply does not vote, rather than voting with a shape this cannot read.
    const nativeReports = detailsList.map(getNativeReport).filter(Boolean) as any[];

    return {
        id: reportId,
        title: commanders.length ? commanders.join(', ') : 'Unknown Commander',
        commanders,
        primaryCommander: commanderIdentity.name,
        primaryCommanderAccount: commanderIdentity.account,
        guildId: computeDominantGuildId(nativeReports),
        dateStart: safeStart.toISOString(),
        dateEnd: safeEnd.toISOString(),
        dateLabel: `${safeStart.toLocaleString()} - ${safeEnd.toLocaleString()}`,
        generatedAt: new Date().toISOString(),
    };
};
