import { useContext, useEffect, useState } from 'react';
import { computeStatsSync } from '../incrementalAggregation';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';
import { isReplayElided } from '../../workers/replayTransfer';
import { computePrimaryCommanderIdentity } from '../utils/computePrimaryCommander';
import { computeDominantGuildId } from '../utils/computeDominantGuildId';
import { computeInitialWebhookSelection } from '../utils/reportWebhookSelection';

export interface PublishWebhookOption {
    id: string;
    name: string;
    isForum: boolean;
}

interface UseStatsUploadsProps {
    logs: any[];
    stats: any;
    skillUsageData: any;
    activeStatsViewSettings: any;
    embedded: boolean;
    onWebUpload?: (payload: { meta: any; stats: any; logIds?: string[]; repoFullName?: string; repoOwner?: string; repoName?: string; reportWebhookIds?: string[] }) => Promise<void> | void;
}

export const useStatsUploads = ({
    logs,
    stats,
    skillUsageData,
    activeStatsViewSettings,
    embedded,
    onWebUpload
}: UseStatsUploadsProps) => {
    const detailsCache = useContext(DetailsCacheContext);

    const [devMockUploadState, setDevMockUploadState] = useState<{
        uploading: boolean;
        message: string | null;
        url: string | null;
    }>({ uploading: false, message: null, url: null });

    const [webCopyStatus, setWebCopyStatus] = useState<'idle' | 'copied'>('idle');
    const [webUploadTargets, setWebUploadTargets] = useState<Array<{ fullName: string; label: string; isDefault: boolean }>>([]);
    const [reportWebhooks, setReportWebhooks] = useState<PublishWebhookOption[]>([]);
    const [initialWebhookSelection, setInitialWebhookSelection] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        const loadTargets = async () => {
            if (!window.electronAPI?.getSettings) {
                if (!cancelled) setWebUploadTargets([]);
                return;
            }
            try {
                const settings = await window.electronAPI.getSettings();
                if (cancelled) return;
                const enabledHooks: PublishWebhookOption[] = (Array.isArray(settings?.reportWebhooks) ? settings.reportWebhooks : [])
                    .filter((hook) => hook && hook.enabled && hook.url)
                    .map((hook) => ({ id: String(hook.id), name: String(hook.name || ''), isForum: !!hook.isForum }));
                setReportWebhooks(enabledHooks);
                setInitialWebhookSelection(
                    computeInitialWebhookSelection(enabledHooks, settings?.reportWebhookSelection ?? null, settings?.reportWebhookSeen ?? null)
                );
                const defaultFullName = settings?.githubRepoOwner && settings?.githubRepoName
                    ? `${settings.githubRepoOwner}/${settings.githubRepoName}`
                    : '';
                const favoriteRepos = Array.isArray(settings?.githubFavoriteRepos)
                    ? settings.githubFavoriteRepos.filter((entry) => typeof entry === 'string')
                    : [];
                const seen = new Set<string>();
                const nextTargets: Array<{ fullName: string; label: string; isDefault: boolean }> = [];
                const pushTarget = (fullName: string, isDefault: boolean) => {
                    const normalized = String(fullName || '').trim();
                    if (!normalized || !/^[^/]+\/[^/]+$/.test(normalized) || seen.has(normalized)) return;
                    seen.add(normalized);
                    nextTargets.push({
                        fullName: normalized,
                        label: isDefault ? `${normalized} (Default)` : normalized,
                        isDefault
                    });
                };
                if (defaultFullName) pushTarget(defaultFullName, true);
                favoriteRepos.forEach((fullName) => pushTarget(fullName, fullName === defaultFullName));
                setWebUploadTargets(nextTargets);
            } catch {
                if (!cancelled) setWebUploadTargets([]);
            }
        };
        void loadTargets();
        return () => {
            cancelled = true;
        };
    }, []);

    const buildReportMeta = () => {
        const commanderSet = new Set<string>();
        let firstStart: Date | null = null;
        let lastEnd: Date | null = null;

        const detailsList: any[] = [];
        logs.forEach((log) => {
            const details = (detailsCache && log?.id ? detailsCache.peek(log.id) : null) || log.details;
            if (!details) return;
            detailsList.push(details);
            const timeStart = details.timeStartStd || details.timeStart || details.uploadTime || log.uploadTime;
            const timeEnd = details.timeEndStd || details.timeEnd || details.uploadTime || log.uploadTime;
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
                    const name = player?.name || player?.account || 'Unknown';
                    commanderSet.add(name);
                }
            });
        });

        const commanders = Array.from(commanderSet).sort((a, b) => a.localeCompare(b));
        const safeStart = firstStart || new Date();
        const safeEnd = lastEnd || safeStart;
        const dateStart = safeStart.toISOString();
        const dateEnd = safeEnd.toISOString();
        const dateLabel = `${safeStart.toLocaleString()} - ${safeEnd.toLocaleString()}`;

        const pad = (value: number) => String(value).padStart(2, '0');
        const reportId = `${safeStart.getFullYear()}${pad(safeStart.getMonth() + 1)}${pad(safeStart.getDate())}-${pad(safeStart.getHours())}${pad(safeStart.getMinutes())}${pad(safeStart.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;

        const commanderIdentity = computePrimaryCommanderIdentity(detailsList);

        return {
            id: reportId,
            title: commanders.length ? commanders.join(', ') : 'Unknown Commander',
            commanders,
            primaryCommander: commanderIdentity.name,
            primaryCommanderAccount: commanderIdentity.account,
            // TODO(unit 2): detailsList is still EI-shaped until the parse seam
            // returns ReportV1. computeDominantGuildId now reads native
            // entities[], so this call yields '' until then. Guild detection is
            // degraded, not wrong, in the interim.
            guildId: computeDominantGuildId(detailsList),
            dateStart,
            dateEnd,
            dateLabel,
            generatedAt: new Date().toISOString()
        };
    };

    const buildReportStats = () => {
        const baseStats = {
            ...stats,
            skillUsageData,
            statsViewSettings: activeStatsViewSettings,
        };
        // Never publish the transient elision marker as report content.
        delete (baseStats as any).replayFightsElided;
        if (Array.isArray(baseStats.fightDiffMode) && baseStats.fightDiffMode.length > 0) {
            return baseStats;
        }
        if (!Array.isArray(logs) || logs.length === 0) {
            return baseStats;
        }
        try {
            const computed = computeStatsSync({
                logs,
                statsViewSettings: activeStatsViewSettings
            });
            const fightDiffMode = computed?.stats?.fightDiffMode;
            if (Array.isArray(fightDiffMode) && fightDiffMode.length > 0) {
                return {
                    ...baseStats,
                    fightDiffMode
                };
            }
        } catch {
            // Keep upload non-blocking if fallback computation fails.
        }
        return baseStats;
    };

    const runWebUpload = async (repoFullName?: string, reportWebhookIds?: string[]) => {
        if (embedded) return;
        if (!onWebUpload) return;
        // Replay data is dropped from in-flight worker results and only settles on
        // the final flush. Uploading before then publishes a report with no combat
        // replay (replay.json 404). Defer until the aggregation settles. The web
        // upload action is also disabled in the UI while this is true, so this is a
        // belt-and-suspenders guard.
        if (isReplayElided(stats)) {
            console.warn('[StatsView] Web upload deferred: combat replay data is still computing. Wait for stats to finish, then upload again.');
            return;
        }
        try {
            const meta = buildReportMeta();
            const uploadStats = buildReportStats();
            const normalizedRepoFullName = typeof repoFullName === 'string' ? repoFullName.trim() : '';
            const repoParts = normalizedRepoFullName.split('/').map((part) => part.trim()).filter(Boolean);
            // Persist the picker choice so the next publish pre-checks it; `seen`
            // records which enabled hooks were offered, so newly-added ones default on.
            if (Array.isArray(reportWebhookIds) && window.electronAPI?.saveSettings) {
                window.electronAPI.saveSettings({
                    reportWebhookSelection: reportWebhookIds,
                    reportWebhookSeen: reportWebhooks.map((hook) => hook.id)
                });
            }
            await onWebUpload({
                meta,
                stats: uploadStats,
                logIds: logs.map((l) => l.permalink).filter(Boolean),
                ...(normalizedRepoFullName ? { repoFullName: normalizedRepoFullName } : {}),
                ...(repoParts.length === 2 ? { repoOwner: repoParts[0], repoName: repoParts[1] } : {}),
                ...(Array.isArray(reportWebhookIds) ? { reportWebhookIds } : {})
            });
        } catch (err) {
            console.error('[StatsView] Web upload failed:', err);
        }
    };

    const handleWebUpload = async (reportWebhookIds?: string[]) => {
        await runWebUpload(undefined, reportWebhookIds);
    };

    const handleWebUploadToTarget = async (repoFullName: string, reportWebhookIds?: string[]) => {
        await runWebUpload(repoFullName, reportWebhookIds);
    };

    const handleDevMockUpload = async () => {
        // @ts-ignore
        if (embedded || !window.electronAPI?.mockWebReport) return;
        setDevMockUploadState({ uploading: true, message: 'Preparing local report...', url: null });
        try {
            const meta = buildReportMeta();
            const uploadStats = buildReportStats();
            // @ts-ignore
            const result = await window.electronAPI.mockWebReport({
                meta,
                stats: uploadStats
            });
            if (result?.success) {
                setDevMockUploadState({
                    uploading: false,
                    message: 'Local report ready.',
                    url: result.url || null
                });
            } else {
                setDevMockUploadState({
                    uploading: false,
                    message: result?.error || 'Local report failed.',
                    url: null
                });
            }
        } catch (err: any) {
            setDevMockUploadState({
                uploading: false,
                message: err?.message || 'Local report failed.',
                url: null
            });
        }
    };

    return {
        devMockUploadState,
        setDevMockUploadState,
        webCopyStatus,
        setWebCopyStatus,
        webUploadTargets,
        reportWebhooks,
        initialWebhookSelection,
        handleWebUpload,
        handleWebUploadToTarget,
        handleDevMockUpload
    };
};
