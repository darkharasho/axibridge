import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';

interface IFilePickerEntry {
    path: string;
    name: string;
    mtimeMs: number;
    size: number;
}

interface UseFilePickerOptions {
    logDirectory: string | null;
    setLogs: Dispatch<SetStateAction<ILogData[]>>;
    setBulkUploadMode: Dispatch<SetStateAction<boolean>>;
    bulkUploadExpectedRef: MutableRefObject<number | null>;
    bulkUploadCompletedRef: MutableRefObject<number>;
    onBulkUploadStart?: (expected: number) => void;
}

export function useFilePicker({
    logDirectory,
    setLogs,
    setBulkUploadMode,
    bulkUploadExpectedRef,
    bulkUploadCompletedRef,
    onBulkUploadStart
}: UseFilePickerOptions) {
    const [filePickerOpen, setFilePickerOpen] = useState(false);
    const [filePickerAvailable, setFilePickerAvailable] = useState<IFilePickerEntry[]>([]);
    const [filePickerAll, setFilePickerAll] = useState<IFilePickerEntry[]>([]);
    const [filePickerMonthWindow, setFilePickerMonthWindow] = useState(1);
    const [filePickerSelected, setFilePickerSelected] = useState<Set<string>>(new Set());
    const [filePickerFilter, setFilePickerFilter] = useState('');
    const [selectSinceOpen, setSelectSinceOpen] = useState(false);
    const [selectSinceDate, setSelectSinceDate] = useState<Date | null>(null);
    const [selectSinceView, setSelectSinceView] = useState<Date>(() => new Date());
    const [selectSinceHour, setSelectSinceHour] = useState<number>(12);
    const [selectSinceMinute, setSelectSinceMinute] = useState<number>(0);
    const [selectSinceMeridiem, setSelectSinceMeridiem] = useState<'AM' | 'PM'>('AM');
    const [selectSinceMonthOpen, setSelectSinceMonthOpen] = useState(false);
    const [filePickerError, setFilePickerError] = useState<string | null>(null);
    const [filePickerLoading, setFilePickerLoading] = useState(false);
    const [filePickerAtBottom, setFilePickerAtBottom] = useState(false);

    const lastPickedIndexRef = useRef<number | null>(null);
    const filePickerListRef = useRef<HTMLDivElement | null>(null);

    const loadLogFiles = async (dir: string | null) => {
        if (!dir) {
            setFilePickerAvailable([]);
            setFilePickerAll([]);
            return;
        }
        if (!window.electronAPI.listLogFiles) {
            setFilePickerError('Log listing is unavailable in this build.');
            return;
        }
        setFilePickerLoading(true);
        setFilePickerError(null);
        try {
            const result = await window.electronAPI.listLogFiles({ dir });
            if (result?.success) {
                const files = (result.files || []).slice().sort((a, b) => {
                    const aTime = Number.isFinite(a.mtimeMs) ? a.mtimeMs : 0;
                    const bTime = Number.isFinite(b.mtimeMs) ? b.mtimeMs : 0;
                    return bTime - aTime;
                });
                setFilePickerAll(files);
                setFilePickerMonthWindow(1);
                setFilePickerAvailable([]);
                setFilePickerAtBottom(false);
            } else {
                setFilePickerError(result?.error || 'Failed to load logs.');
            }
        } catch (err: any) {
            setFilePickerError(err?.message || 'Failed to load logs.');
        } finally {
            setFilePickerLoading(false);
        }
    };

    useEffect(() => {
        if (!filePickerOpen) return;
        loadLogFiles(logDirectory);
    }, [filePickerOpen, logDirectory]);

    useEffect(() => {
        if (!filePickerOpen) return;
        const node = filePickerListRef.current;
        if (!node) return;
        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
        setFilePickerAtBottom(atBottom);
    }, [filePickerOpen, filePickerAvailable.length, filePickerFilter]);

    const filePickerVisible = useMemo(() => {
        if (filePickerAll.length === 0) return [];
        const cutoffMs = Date.now() - (Math.max(1, filePickerMonthWindow) * 30 * 24 * 60 * 60 * 1000);
        return filePickerAll.filter((entry) => {
            if (!Number.isFinite(entry.mtimeMs)) return true;
            return entry.mtimeMs >= cutoffMs;
        });
    }, [filePickerAll, filePickerMonthWindow]);

    useEffect(() => {
        setFilePickerAvailable(filePickerVisible);
    }, [filePickerVisible]);

    const filePickerHasMore = useMemo(() => {
        if (filePickerAll.length === 0) return false;
        const cutoffMs = Date.now() - (Math.max(1, filePickerMonthWindow) * 30 * 24 * 60 * 60 * 1000);
        return filePickerAll.some((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs < cutoffMs);
    }, [filePickerAll, filePickerMonthWindow]);

    const ensureMonthWindowForSince = (sinceMs: number) => {
        if (!Number.isFinite(sinceMs)) return;
        let monthsBack = Math.max(1, filePickerMonthWindow);
        const cutoffFor = (months: number) => Date.now() - (months * 30 * 24 * 60 * 60 * 1000);
        while (sinceMs < cutoffFor(monthsBack)) {
            monthsBack += 1;
        }
        if (monthsBack !== filePickerMonthWindow) {
            setFilePickerMonthWindow(monthsBack);
        }
    };

    const handleAddSelectedFiles = () => {
        const files = Array.from(filePickerSelected);
        if (!files.length) {
            setFilePickerError('Select at least one log file.');
            return;
        }
        const optimisticLogs: ILogData[] = [];
        files.forEach((filePath) => {
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            optimisticLogs.push({
                id: fileName,
                filePath,
                status: 'queued',
                fightName: fileName,
                uploadTime: Date.now() / 1000,
                permalink: ''
            });
        });

        setLogs((currentLogs) => {
            const newLogs = [...currentLogs];
            optimisticLogs.forEach((optLog) => {
                if (!newLogs.some((l) => l.filePath === optLog.filePath)) {
                    newLogs.unshift(optLog);
                }
            });
            return newLogs;
        });

        if (files.length > 1) {
            setBulkUploadMode(true);
            bulkUploadExpectedRef.current = files.length;
            bulkUploadCompletedRef.current = 0;
            onBulkUploadStart?.(files.length);
        }
        window.electronAPI.manualUploadBatch(files);
        setFilePickerOpen(false);
        setFilePickerSelected(new Set());
        setFilePickerError(null);
    };

    return {
        filePickerOpen,
        setFilePickerOpen,
        filePickerError,
        setFilePickerError,
        filePickerSelected,
        setFilePickerSelected,
        loadLogFiles,
        selectSinceOpen,
        setSelectSinceOpen,
        setSelectSinceView,
        setSelectSinceDate,
        setSelectSinceHour,
        setSelectSinceMinute,
        setSelectSinceMeridiem,
        setSelectSinceMonthOpen,
        selectSinceDate,
        selectSinceHour,
        selectSinceMinute,
        selectSinceMeridiem,
        selectSinceView,
        selectSinceMonthOpen,
        filePickerFilter,
        setFilePickerFilter,
        filePickerLoading,
        filePickerAvailable,
        filePickerAll,
        filePickerListRef,
        setFilePickerAtBottom,
        lastPickedIndexRef,
        filePickerHasMore,
        filePickerAtBottom,
        setFilePickerMonthWindow,
        ensureMonthWindowForSince,
        handleAddSelectedFiles
    };
}
