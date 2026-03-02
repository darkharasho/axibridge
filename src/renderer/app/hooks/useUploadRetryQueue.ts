import { useCallback, useEffect, useState } from 'react';
import { IUploadRetryQueueState } from '../../global.d';

const EMPTY_RETRY_QUEUE: IUploadRetryQueueState = {
    failed: 0,
    retrying: 0,
    resolved: 0,
    paused: false,
    pauseReason: null,
    pausedAt: null,
    entries: []
};

export function useUploadRetryQueue() {
    const [uploadRetryQueue, setUploadRetryQueue] = useState<IUploadRetryQueueState>(EMPTY_RETRY_QUEUE);
    const [retryQueueBusy, setRetryQueueBusy] = useState(false);

    useEffect(() => {
        const loadUploadRetryQueue = async () => {
            if (!window.electronAPI?.getUploadRetryQueue) return;
            const result = await window.electronAPI.getUploadRetryQueue();
            if (result?.success && result.queue) {
                setUploadRetryQueue(result.queue);
            }
        };
        loadUploadRetryQueue();
        const cleanup = window.electronAPI?.onUploadRetryQueueUpdated
            ? window.electronAPI.onUploadRetryQueueUpdated((queue) => {
                if (!queue) return;
                setUploadRetryQueue(queue);
            })
            : null;
        return () => {
            cleanup?.();
        };
    }, []);

    const handleRetryFailedUploads = useCallback(async () => {
        if (!window.electronAPI?.retryFailedUploads) return;
        if (retryQueueBusy) return;
        setRetryQueueBusy(true);
        try {
            const result = await window.electronAPI.retryFailedUploads();
            if (result?.success && result.queue) {
                setUploadRetryQueue(result.queue);
            }
        } finally {
            setRetryQueueBusy(false);
        }
    }, [retryQueueBusy]);

    const handleResumeUploadRetries = useCallback(async () => {
        if (!window.electronAPI?.resumeUploadRetries) return;
        if (retryQueueBusy) return;
        setRetryQueueBusy(true);
        try {
            const result = await window.electronAPI.resumeUploadRetries();
            if (result?.success && result.queue) {
                setUploadRetryQueue(result.queue);
            }
        } finally {
            setRetryQueueBusy(false);
        }
    }, [retryQueueBusy]);

    return {
        uploadRetryQueue,
        retryQueueBusy,
        handleRetryFailedUploads,
        handleResumeUploadRetries,
    };
}
