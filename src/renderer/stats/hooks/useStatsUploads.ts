import { useContext, useEffect, useState } from 'react';
import { computeStatsSync } from '../incrementalAggregation';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';
import { isReplayElided } from '../../workers/replayTransfer';
import { buildReportMeta as buildReportMetaFromDetails } from '../utils/buildReportMeta';
import { computeInitialWebhookSelection } from '../utils/reportWebhookSelection';
import { useStatsStore } from '../statsStore';

export interface PublishWebhookOption {
    id: string;
    name: string;
    isForum: boolean;
}

/**
 * Publish always publishes every fight. The aggregation result handed to this hook
 * is the SLICED result, so while a slice is active there is no unsliced stats body
 * to publish — Phase A has only one live aggregation. Publish is therefore refused
 * until the user clears the slice.
 */
export const canPublishWithSlice = (excludedFightKeys: Set<string>): boolean =>
    excludedFightKeys.size === 0;

export const PUBLISH_BLOCKED_BY_SLICE_REASON =
    'Clear the fight slice to publish. Reports always contain every fight.';

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
    const excludedFightKeys = useStatsStore((s) => s.excludedFightKeys);
    const publishBlockedReason = canPublishWithSlice(excludedFightKeys)
        ? null
        : PUBLISH_BLOCKED_BY_SLICE_REASON;

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

    const collectDetails = (): any[] => {
        const detailsList: any[] = [];
        logs.forEach((log) => {
            const details = (detailsCache && log?.id ? detailsCache.peek(log.id) : null) || log.details;
            if (!details) return;
            // `uploadTime` lives on the log, not the details; carry it across so
            // the pure builder keeps the same last-resort fallback it had here.
            detailsList.push(
                details.uploadTime === undefined && log.uploadTime !== undefined
                    ? { ...details, uploadTime: log.uploadTime }
                    : details,
            );
        });
        return detailsList;
    };

    const buildReportMeta = () => buildReportMetaFromDetails(collectDetails());

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
        // Publish always publishes every fight; while a slice is active the live
        // aggregation result is the sliced one, so there is no unsliced stats body
        // to send. The UI disables the button and surfaces publishBlockedReason as
        // its tooltip; this is the belt-and-suspenders guard for any other caller.
        if (publishBlockedReason) {
            console.warn('[StatsView] Web upload blocked: a fight slice is active.');
            return;
        }
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
        handleDevMockUpload,
        publishBlockedReason
    };
};
