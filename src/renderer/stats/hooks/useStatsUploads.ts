import { useContext, useEffect, useState } from 'react';
import { computeStatsAggregation } from '../computeStatsAggregation';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';

interface UseStatsUploadsProps {
    logs: any[];
    stats: any;
    skillUsageData: any;
    activeStatsViewSettings: any;
    embedded: boolean;
    onWebUpload?: (payload: { meta: any; stats: any }) => Promise<void> | void;
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

        logs.forEach((log) => {
            const details = (detailsCache && log?.id ? detailsCache.peek(log.id) : null) || log.details;
            if (!details) return;
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

        return {
            id: reportId,
            title: commanders.length ? commanders.join(', ') : 'Unknown Commander',
            commanders,
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
        if (Array.isArray(baseStats.fightDiffMode) && baseStats.fightDiffMode.length > 0) {
            return baseStats;
        }
        if (!Array.isArray(logs) || logs.length === 0) {
            return baseStats;
        }
        try {
            const computed = computeStatsAggregation({
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

    const runWebUpload = async (repoFullName?: string) => {
        if (embedded) return;
        if (!onWebUpload) return;
        try {
            const meta = buildReportMeta();
            const uploadStats = buildReportStats();
            const normalizedRepoFullName = typeof repoFullName === 'string' ? repoFullName.trim() : '';
            const repoParts = normalizedRepoFullName.split('/').map((part) => part.trim()).filter(Boolean);
            await onWebUpload({
                meta,
                stats: uploadStats,
                ...(normalizedRepoFullName ? { repoFullName: normalizedRepoFullName } : {}),
                ...(repoParts.length === 2 ? { repoOwner: repoParts[0], repoName: repoParts[1] } : {})
            });
        } catch (err) {
            console.error('[StatsView] Web upload failed:', err);
        }
    };

    const handleWebUpload = async () => {
        await runWebUpload();
    };

    const handleWebUploadToTarget = async (repoFullName: string) => {
        await runWebUpload(repoFullName);
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
        handleWebUpload,
        handleWebUploadToTarget,
        handleDevMockUpload
    };
};
