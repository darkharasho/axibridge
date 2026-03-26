import { useEffect } from 'react';

export function useUploadListeners({
    queueLogUpdate,
    endBulkUpload,
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
    bulkUploadModeRef: React.MutableRefObject<boolean>;
    canceledLogsRef: React.MutableRefObject<Set<string>>;
    lastUploadCompleteAtRef: React.MutableRefObject<number>;
    bulkUploadExpectedRef: React.MutableRefObject<number | null>;
    bulkUploadCompletedRef: React.MutableRefObject<number>;
    pendingLogFlushTimerRef: React.MutableRefObject<number | null>;
    pendingLogUpdatesRef: React.MutableRefObject<Map<string, ILogData>>;
}) {
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

        return () => {
            if (pendingLogFlushTimerRef.current !== null) {
                window.clearTimeout(pendingLogFlushTimerRef.current);
                pendingLogFlushTimerRef.current = null;
            }
            pendingLogUpdatesRef.current.clear();
            cleanupStatus();
            cleanupUpload();
        };
    }, []);
}
