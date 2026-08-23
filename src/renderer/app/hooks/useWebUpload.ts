import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WEB_UPLOAD_STATE, type IWebUploadState } from '../../global.d';
import type { SliceSidecar } from '../../stats/slice/sliceTypes';

export type LogEntry = { elapsed: string; text: string; isError: boolean; isWarn: boolean };

export function useWebUpload(opts?: {
    onLogReplayUrl?: (logPermalinks: string[], replayDataUrl: string) => void;
}) {
    const [webUploadState, setWebUploadState] = useState<IWebUploadState>(DEFAULT_WEB_UPLOAD_STATE);
    const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
    const webUploadClearTimerRef = useRef<number | null>(null);
    const startTimeRef   = useRef<number | null>(null);
    const prevMessageRef = useRef<string | null>(null);

    useEffect(() => {
        if (!window.electronAPI?.onWebUploadStatus) return;
        const cleanupWebUpload = window.electronAPI.onWebUploadStatus((data) => {
            if (!data) return;
            setWebUploadState((prev) => ({
                ...prev,
                stage: data.stage || 'Uploading',
                progress: typeof data.progress === 'number' ? data.progress : prev.progress,
                detail: prev.stage === 'Upload failed' ? prev.detail : (data.message || prev.detail)
            }));
        });
        return () => {
            cleanupWebUpload();
        };
    }, []);

    // Reset timer and log when a new upload begins; clear timer when idle
    useEffect(() => {
        if (webUploadState.uploading) {
            if (startTimeRef.current === null) {
                startTimeRef.current   = Date.now();
                prevMessageRef.current = null;
                setLogEntries([]);
            }
        }
        if (!webUploadState.uploading && !webUploadState.stage) {
            startTimeRef.current = null;
        }
    }, [webUploadState.uploading, webUploadState.stage]);

    // Accumulate a log entry whenever the visible status text changes
    useEffect(() => {
        const text = webUploadState.detail || webUploadState.message;
        if (!text || text === prevMessageRef.current) return;
        prevMessageRef.current = text;
        const elapsed = startTimeRef.current
            ? `${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s`
            : '0.0s';
        const stage   = webUploadState.stage ?? '';
        const isError = stage.toLowerCase().includes('fail');
        const isWarn  = stage.toLowerCase() === 'warning';
        setLogEntries((prev) => [...prev, { elapsed, text, isError, isWarn }]);
    }, [webUploadState.message, webUploadState.detail, webUploadState.stage]);

    useEffect(() => {
        if (webUploadState.buildStatus !== 'checking' && webUploadState.buildStatus !== 'building') return;
        if (!window.electronAPI?.getGithubPagesBuildStatus) {
            setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
            return;
        }
        let attempts = 0;
        const interval = setInterval(async () => {
            attempts += 1;
            try {
                const repoLabel = webUploadState.buildStatusRepo || '';
                const repoParts = repoLabel.split('/').map((part) => part.trim()).filter(Boolean);
                const resp = await window.electronAPI.getGithubPagesBuildStatus(
                    repoParts.length === 2
                        ? { repoFullName: repoLabel, repoOwner: repoParts[0], repoName: repoParts[1] }
                        : undefined
                );
                if (resp?.success) {
                    const status = String(resp.status || '').toLowerCase();
                    if (status === 'built' || status === 'success') {
                        setWebUploadState((prev) => ({ ...prev, buildStatus: 'built' }));
                        clearInterval(interval);
                        return;
                    }
                    if (status === 'errored' || status === 'error' || status === 'failed') {
                        setWebUploadState((prev) => ({ ...prev, buildStatus: 'errored' }));
                        clearInterval(interval);
                        return;
                    }
                    setWebUploadState((prev) => ({ ...prev, buildStatus: 'building' }));
                } else if (resp?.error) {
                    setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
                    clearInterval(interval);
                    return;
                }
            } catch {
                setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
                clearInterval(interval);
                return;
            }
            if (attempts >= 18) {
                setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
                clearInterval(interval);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [webUploadState.buildStatus, webUploadState.buildStatusRepo]);

    const scheduleWebUploadClear = useCallback(() => {
        if (webUploadClearTimerRef.current) {
            window.clearTimeout(webUploadClearTimerRef.current);
        }
        if (webUploadState.stage === 'Upload failed') {
            return;
        }
        webUploadClearTimerRef.current = window.setTimeout(() => {
            setWebUploadState((prev) => ({
                ...prev,
                stage: null,
                progress: null,
                detail: null
            }));
            webUploadClearTimerRef.current = null;
        }, 2500);
    }, [webUploadState.stage]);

    const handleWebUpload = useCallback(async (payload: { meta: any; stats: any; repoFullName?: string; repoOwner?: string; repoName?: string; logIds?: string[]; reportWebhookIds?: string[]; sliceSidecar?: SliceSidecar }) => {
        if (!window.electronAPI?.uploadWebReport) {
            setWebUploadState((prev) => ({
                ...prev,
                message: 'Web upload is not available in this build.'
            }));
            return;
        }
        if (webUploadClearTimerRef.current) {
            window.clearTimeout(webUploadClearTimerRef.current);
            webUploadClearTimerRef.current = null;
        }
        const repoLabel = (() => {
            if (typeof payload?.repoFullName === 'string' && payload.repoFullName.trim()) {
                return payload.repoFullName.trim();
            }
            const owner = typeof payload?.repoOwner === 'string' ? payload.repoOwner.trim() : '';
            const repo = typeof payload?.repoName === 'string' ? payload.repoName.trim() : '';
            return owner && repo ? `${owner}/${repo}` : '';
        })();
        setWebUploadState((prev) => ({
                ...prev,
                uploading: true,
                message: repoLabel ? `Preparing report for ${repoLabel}...` : 'Preparing report...',
                stage: 'Preparing report',
                progress: 0,
                detail: null,
                url: null,
                buildStatus: 'idle',
                buildStatusRepo: repoLabel || null
            }));
        let uploadSucceeded = false;
        try {
            const { logIds, ...ipcPayload } = payload;
            const result = await window.electronAPI.uploadWebReport(ipcPayload);
            if (result?.success) {
                uploadSucceeded = true;
                const url = result.url || '';
                if (result.replayDataUrl && logIds && logIds.length > 0) {
                    opts?.onLogReplayUrl?.(logIds, result.replayDataUrl as string);
                }
                setWebUploadState((prev) => ({
                    ...prev,
                    url,
                    message: repoLabel
                        ? `Uploaded to ${repoLabel}: ${url || 'GitHub Pages'}`
                        : `Uploaded: ${url || 'GitHub Pages'}`,
                    stage: 'Upload complete',
                    progress: 100,
                    buildStatus: 'checking',
                    buildStatusRepo: repoLabel || prev.buildStatusRepo
                }));
            } else {
                if (result?.errorDetail) {
                    console.error('[Web Upload] Failed:', result.errorDetail);
                } else if (result?.error) {
                    console.error('[Web Upload] Failed:', result.error);
                }
                setWebUploadState((prev) => ({
                    ...prev,
                    message: result?.error || 'Upload failed.',
                    detail: result?.errorDetail || null,
                    stage: 'Upload failed',
                    buildStatus: 'idle',
                    buildStatusRepo: null
                }));
            }
        } catch (err: any) {
            const errorDetail = err?.stack || String(err);
            console.error('[Web Upload] Failed:', errorDetail);
            setWebUploadState((prev) => ({
                ...prev,
                message: err?.message || 'Upload failed.',
                detail: errorDetail,
                stage: 'Upload failed',
                buildStatus: 'idle',
                buildStatusRepo: null
            }));
        } finally {
            setWebUploadState((prev) => ({ ...prev, uploading: false }));
            if (uploadSucceeded) {
                scheduleWebUploadClear();
            }
        }
    }, [scheduleWebUploadClear]);

    return {
        webUploadState,
        setWebUploadState,
        handleWebUpload,
        logEntries,
    };
}
