import { useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import type { IEmbedStatSettings } from '../../global.d';

const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
        throw new Error('Invalid data URL');
    }
    const base64 = dataUrl.slice(commaIndex + 1);
    if (typeof globalThis.atob !== 'function') {
        throw new Error('Base64 decoder is not available');
    }
    const binaryString = globalThis.atob(base64);
    const buffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
        buffer[i] = binaryString.charCodeAt(i);
    }
    return buffer;
};

export function useUploadListeners({
    queueLogUpdate,
    endBulkUpload,
    setScreenshotData,
    embedStatSettingsRef,
    enabledTopListCountRef,
    bulkUploadModeRef,
    canceledLogsRef,
    lastUploadCompleteAtRef,
    bulkUploadExpectedRef,
    bulkUploadCompletedRef,
    pendingLogFlushTimerRef,
    pendingLogUpdatesRef,
}: {
    queueLogUpdate: (incoming: ILogData) => void;
    endBulkUpload: () => void;
    setScreenshotData: React.Dispatch<React.SetStateAction<ILogData | null>>;
    embedStatSettingsRef: React.MutableRefObject<IEmbedStatSettings>;
    enabledTopListCountRef: React.MutableRefObject<number>;
    bulkUploadModeRef: React.MutableRefObject<boolean>;
    canceledLogsRef: React.MutableRefObject<Set<string>>;
    lastUploadCompleteAtRef: React.MutableRefObject<number>;
    bulkUploadExpectedRef: React.MutableRefObject<number | null>;
    bulkUploadCompletedRef: React.MutableRefObject<number>;
    pendingLogFlushTimerRef: React.MutableRefObject<number | null>;
    pendingLogUpdatesRef: React.MutableRefObject<Map<string, ILogData>>;
}) {
    const screenshotCaptureChainRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        // Listen for status updates during upload process
        const cleanupStatus = window.electronAPI.onUploadStatus((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            queueLogUpdate(data);
        });

        const cleanupUpload = window.electronAPI.onUploadComplete((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            lastUploadCompleteAtRef.current = Date.now();
            console.log('[App] Upload Complete Data:', {
                path: data.filePath,
                status: data.status,
                hasDetails: !!data.details,
                playerCount: data.details?.players?.length
            });
            if (bulkUploadModeRef.current) {
                queueLogUpdate(data);
                bulkUploadCompletedRef.current += 1;
                if (bulkUploadExpectedRef.current !== null && bulkUploadCompletedRef.current >= bulkUploadExpectedRef.current) {
                    endBulkUpload();
                }
                return;
            }
            queueLogUpdate(data);
        });

        let screenshotSubscriptionDisposed = false;
        const waitMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
        const waitFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const escapeSelector = (value: string) => {
            if (typeof window !== 'undefined' && (window as any).CSS?.escape) {
                return (window as any).CSS.escape(value);
            }
            return value.replace(/"/g, '\\"');
        };
        const waitForNodes = async (selector: string, expectedCount: number, timeoutMs: number) => {
            const start = performance.now();
            while (!screenshotSubscriptionDisposed && performance.now() - start < timeoutMs) {
                const nodes = Array.from(document.querySelectorAll(selector));
                if (nodes.length >= expectedCount) {
                    return nodes;
                }
                await waitMs(90);
            }
            return screenshotSubscriptionDisposed ? [] : Array.from(document.querySelectorAll(selector));
        };
        const waitForNode = async (nodeId: string, timeoutMs: number) => {
            const start = performance.now();
            while (!screenshotSubscriptionDisposed && performance.now() - start < timeoutMs) {
                const node = document.getElementById(nodeId);
                if (node) return node as HTMLElement;
                await waitMs(90);
            }
            if (screenshotSubscriptionDisposed) return null;
            return document.getElementById(nodeId) as HTMLElement | null;
        };
        const safeToPng = async (node: HTMLElement, options: any) => {
            return Promise.race([
                toPng(node, { ...options, cacheBust: false, skipAutoScale: true }),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Screenshot generation timed out')), 5000))
            ]);
        };
        const captureScreenshotForLog = async (incoming: ILogData) => {
            const logKey = incoming.id || incoming.filePath;
            if (!logKey || screenshotSubscriptionDisposed) {
                if (!logKey) {
                    console.error('Screenshot request missing log identifier.');
                }
                return;
            }
            console.log('Screenshot requested for:', logKey);
            const payload = {
                ...incoming,
                id: logKey,
                splitEnemiesByTeam: Boolean((incoming as any)?.splitEnemiesByTeam)
            };
            setScreenshotData(payload);
            await waitFrame();
            await waitMs(bulkUploadModeRef.current ? 240 : 120);
            if (screenshotSubscriptionDisposed) return;
            const mode = (incoming as any)?.mode || 'image';
            try {
                if (mode === 'image-beta') {
                    const selector = `[data-screenshot-id="${escapeSelector(logKey)}"]`;
                    const details: any = (incoming as any)?.details || {};
                    const players = Array.isArray(details.players) ? details.players : [];
                    const targets = Array.isArray(details.targets) ? details.targets : [];
                    const normalizeTeamId = (raw: any): number | null => {
                        const value = raw?.teamID ?? raw?.teamId ?? raw?.team;
                        const num = Number(value);
                        return Number.isFinite(num) && num > 0 ? num : null;
                    };
                    const allyTeamIds = new Set<number>();
                    players.forEach((player: any) => {
                        if (player?.notInSquad) return;
                        const teamId = normalizeTeamId(player);
                        if (teamId !== null) allyTeamIds.add(teamId);
                    });
                    const enemyTeamIds = new Set<number>();
                    targets.forEach((target: any) => {
                        if (target?.isFake) return;
                        if (target?.enemyPlayer === false) return;
                        const teamId = normalizeTeamId(target);
                        if (teamId === null || allyTeamIds.has(teamId)) return;
                        enemyTeamIds.add(teamId);
                    });
                    players.forEach((player: any) => {
                        if (!player?.notInSquad) return;
                        const teamId = normalizeTeamId(player);
                        if (teamId === null || allyTeamIds.has(teamId)) return;
                        enemyTeamIds.add(teamId);
                    });
                    const resolvedEnemyTeamIds = Array.from(enemyTeamIds).sort((a, b) => a - b);
                    const activeEmbedStatSettings = embedStatSettingsRef.current;
                    const enemySummaryTileCount = activeEmbedStatSettings.showEnemySummary
                        ? ((incoming as any)?.splitEnemiesByTeam ? resolvedEnemyTeamIds.length : 1)
                        : 0;
                    const summaryTileCount = (activeEmbedStatSettings.showSquadSummary ? 1 : 0) + enemySummaryTileCount;
                    const expectedCount = summaryTileCount
                        + (activeEmbedStatSettings.showClassSummary ? (
                            (activeEmbedStatSettings.showSquadSummary ? 1 : 0)
                            + (activeEmbedStatSettings.showEnemySummary
                                ? (((incoming as any)?.splitEnemiesByTeam ? resolvedEnemyTeamIds.length : 1))
                                : 0)
                        ) : 0)
                        + (activeEmbedStatSettings.showIncomingStats ? 4 : 0)
                        + enabledTopListCountRef.current;
                    const nodes = await waitForNodes(selector, Math.max(1, expectedCount), 5000);
                    if (nodes.length === 0) {
                        const fallbackNode = await waitForNode(`log-screenshot-${logKey}`, 1500);
                        if (!fallbackNode) {
                            console.error('Screenshot nodes not found.');
                            return;
                        }
                        const fallbackDataUrl = await safeToPng(fallbackNode, {
                            backgroundColor: '#10141b',
                            quality: 0.95,
                            pixelRatio: 3
                        });
                        const fallbackBuffer = dataUrlToUint8Array(fallbackDataUrl);
                        window.electronAPI.sendScreenshot(logKey, fallbackBuffer);
                        return;
                    }
                    const buffers: { group: string; buffer: Uint8Array }[] = [];
                    for (const node of nodes) {
                        if (screenshotSubscriptionDisposed) return;
                        const transparent = (node as HTMLElement).dataset.screenshotTransparent === 'true';
                        try {
                            const dataUrl = await safeToPng(node as HTMLElement, {
                                backgroundColor: transparent ? 'rgba(0,0,0,0)' : '#10141b',
                                quality: 0.95,
                                pixelRatio: 3,
                                width: (node as HTMLElement).offsetWidth,
                                height: (node as HTMLElement).offsetHeight
                            });
                            const buffer = dataUrlToUint8Array(dataUrl);
                            const group = (node as HTMLElement).dataset.screenshotGroup || 'default';
                            buffers.push({ group, buffer });
                        } catch (innerErr) {
                            console.error('Failed to screenshot a specific tile:', innerErr);
                        }
                    }
                    if (buffers.length === 0) {
                        throw new Error('No tiles were successfully captured');
                    }
                    const groups: Uint8Array[][] = [];
                    const incomingBuffers: Uint8Array[] = [];
                    let currentPair: Uint8Array[] = [];
                    let i = 0;
                    while (i < buffers.length) {
                        const entry = buffers[i];
                        if (entry.group === 'incoming') {
                            while (i < buffers.length && buffers[i].group === 'incoming') {
                                incomingBuffers.push(buffers[i].buffer);
                                i += 1;
                            }
                            if (currentPair.length > 0) {
                                groups.push(currentPair);
                                currentPair = [];
                            }
                            if (incomingBuffers.length > 0) {
                                groups.push([...incomingBuffers]);
                                incomingBuffers.length = 0;
                            }
                            continue;
                        }
                        currentPair.push(entry.buffer);
                        if (currentPair.length === 2) {
                            groups.push(currentPair);
                            currentPair = [];
                        }
                        i += 1;
                    }
                    if (currentPair.length > 0) {
                        groups.push(currentPair);
                    }
                    window.electronAPI.sendScreenshotsGroups(logKey, groups);
                    return;
                }
                const node = await waitForNode(`log-screenshot-${logKey}`, 2000);
                if (!node) {
                    console.error('Screenshot node not found');
                    return;
                }
                const dataUrl = await safeToPng(node, {
                    backgroundColor: '#10141b',
                    quality: 0.95,
                    pixelRatio: 3
                });
                const buffer = dataUrlToUint8Array(dataUrl);
                window.electronAPI.sendScreenshot(logKey, buffer);
            } catch (err) {
                console.error('Screenshot failed:', err);
            } finally {
                if (!screenshotSubscriptionDisposed) {
                    setScreenshotData(null);
                }
            }
        };
        const cleanupScreenshot = window.electronAPI.onRequestScreenshot((data: ILogData) => {
            screenshotCaptureChainRef.current = screenshotCaptureChainRef.current
                .catch(() => undefined)
                .then(async () => {
                    if (screenshotSubscriptionDisposed) return;
                    await captureScreenshotForLog(data);
                    if (bulkUploadModeRef.current) {
                        await waitMs(80);
                    }
                });
        });

        return () => {
            screenshotSubscriptionDisposed = true;
            if (pendingLogFlushTimerRef.current !== null) {
                window.clearTimeout(pendingLogFlushTimerRef.current);
                pendingLogFlushTimerRef.current = null;
            }
            pendingLogUpdatesRef.current.clear();
            setScreenshotData(null);
            cleanupStatus();
            cleanupUpload();
            cleanupScreenshot();
        };
    }, []);
}
