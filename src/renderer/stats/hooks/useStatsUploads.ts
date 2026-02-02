import { useState } from 'react';

interface UseStatsUploadsProps {
    logs: any[];
    stats: any;
    skillUsageData: any;
    activeStatsViewSettings: any;
    uiTheme: string;
    embedded: boolean;
    onWebUpload?: (payload: { meta: any; stats: any }) => Promise<void> | void;
}

export const useStatsUploads = ({
    logs,
    stats,
    skillUsageData,
    activeStatsViewSettings,
    uiTheme,
    embedded,
    onWebUpload
}: UseStatsUploadsProps) => {
    const [devMockUploadState, setDevMockUploadState] = useState<{
        uploading: boolean;
        message: string | null;
        url: string | null;
    }>({ uploading: false, message: null, url: null });

    const [webCopyStatus, setWebCopyStatus] = useState<'idle' | 'copied'>('idle');

    const buildReportMeta = () => {
        const commanderSet = new Set<string>();
        let firstStart: Date | null = null;
        let lastEnd: Date | null = null;

        logs.forEach((log) => {
            const details = log.details;
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

    const handleWebUpload = async () => {
        if (embedded) return;
        if (!onWebUpload) return;
        try {
            const meta = buildReportMeta();
            await onWebUpload({
                meta,
                stats: {
                    ...stats,
                    skillUsageData,
                    statsViewSettings: activeStatsViewSettings,
                    uiTheme: uiTheme || 'classic'
                }
            });
        } catch (err) {
            console.error('[StatsView] Web upload failed:', err);
        }
    };

    const handleDevMockUpload = async () => {
        // @ts-ignore
        if (embedded || !window.electronAPI?.mockWebReport) return;
        setDevMockUploadState({ uploading: true, message: 'Preparing local report...', url: null });
        try {
            const meta = buildReportMeta();
            // @ts-ignore
            const result = await window.electronAPI.mockWebReport({
                meta,
                stats: {
                    ...stats,
                    skillUsageData,
                    statsViewSettings: activeStatsViewSettings,
                    uiTheme: uiTheme || 'classic'
                }
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
        handleWebUpload,
        handleDevMockUpload
    };
};
