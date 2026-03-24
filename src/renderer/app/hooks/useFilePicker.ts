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
}

export function useFilePicker({
    logDirectory,
    setLogs,
    setBulkUploadMode,
    bulkUploadExpectedRef,
    bulkUploadCompletedRef
}: UseFilePickerOptions) {
    const [filePickerOpen, setFilePickerOpen] = useState(false);
    const [filePickerAvailable, setFilePickerAvailable] = useState<IFilePickerEntry[]>([]);
    const [filePickerAll, setFilePickerAll] = useState<IFilePickerEntry[]>([]);
    const [filePickerMonthWindow, setFilePickerMonthWindow] = useState(1);
    const [filePickerSelected, setFilePickerSelected] = useState<Set<string>>(new Set());
    const [filePickerFilter, setFilePickerFilter] = useState('');

    // Simplified Filter Modes
    const [selectSinceOpen, setSelectSinceOpen] = useState(false);
    const [selectDayOpen, setSelectDayOpen] = useState(false);
    const [selectBetweenOpen, setSelectBetweenOpen] = useState(false);
    const [activePreset, setActivePreset] = useState<string | null>(null);

    // Date states (Custom UI states)
    const [selectDayDate, setSelectDayDate] = useState<Date | null>(null);
    const [selectSinceDate, setSelectSinceDate] = useState<Date | null>(null);
    const [selectBetweenStart, setSelectBetweenStart] = useState<string>('');
    const [selectBetweenEnd, setSelectBetweenEnd] = useState<string>('');
    const [selectSinceView, setSelectSinceView] = useState<Date>(() => new Date());
    const [selectSinceHour, setSelectSinceHour] = useState<number>(12);
    const [selectSinceMinute, setSelectSinceMinute] = useState<number>(0);
    const [selectSinceMeridiem, setSelectSinceMeridiem] = useState<'AM' | 'PM'>('AM');
    const [selectSinceMonthOpen, setSelectSinceMonthOpen] = useState(false);

    const [filePickerError, setFilePickerError] = useState<string | null>(null);
    const [filePickerLoading, setFilePickerLoading] = useState(false);
    const [filePickerAtBottom, setFilePickerAtBottom] = useState(false);

    // Keyboard navigation
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

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
                setFocusedIndex(null);
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

    const dateFilteredCount = useMemo(() => {
        if (activePreset) {
            const now = new Date();
            let startMs: number;
            let endMs = Infinity;

            switch (activePreset) {
                case 'Today':
                    startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                    break;
                case 'Yesterday': {
                    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                    startMs = yesterday.getTime();
                    endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
                    break;
                }
                case 'Last 3 days':
                    startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getTime();
                    break;
                case 'This week': {
                    const dayOfWeek = now.getDay();
                    startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
                    break;
                }
                default:
                    return 0;
            }
            return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs).length;
        }

        if (selectDayOpen && selectDayDate) {
            const dayStart = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 0, 0, 0, 0).getTime();
            const dayEnd = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 23, 59, 59, 999).getTime();
            return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= dayStart && entry.mtimeMs <= dayEnd).length;
        }

        if (selectSinceOpen && selectSinceDate) {
            const base = new Date(selectSinceDate.getFullYear(), selectSinceDate.getMonth(), selectSinceDate.getDate());
            let hour24 = selectSinceHour % 12;
            if (selectSinceMeridiem === 'PM') hour24 += 12;
            base.setHours(hour24, selectSinceMinute, 0, 0);
            const sinceMs = base.getTime();
            return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= sinceMs).length;
        }

        if (selectBetweenOpen && selectBetweenStart && selectBetweenEnd) {
            const rawStartMs = new Date(selectBetweenStart).getTime();
            const rawEndMs = new Date(selectBetweenEnd).getTime();
            const startMs = Math.min(rawStartMs, rawEndMs);
            const endMs = Math.max(rawStartMs, rawEndMs);
            return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs).length;
        }

        return 0;
    }, [activePreset, selectDayOpen, selectDayDate, selectSinceOpen, selectSinceDate, selectSinceHour, selectSinceMinute, selectSinceMeridiem, selectBetweenOpen, selectBetweenStart, selectBetweenEnd, filePickerAll]);

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

    const handleApplyPreset = (preset: string | null) => {
        if (!preset || preset === activePreset) {
            // Deactivate
            setActivePreset(null);
            setFilePickerSelected(new Set());
            return;
        }
        // Clear any active calendar filter
        setSelectDayOpen(false);
        setSelectSinceOpen(false);
        setSelectBetweenOpen(false);
        setActivePreset(preset);

        const now = new Date();
        let startMs: number;

        switch (preset) {
            case 'Today':
                startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                break;
            case 'Yesterday': {
                const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                startMs = yesterday.getTime();
                // For Yesterday, also set an end time (end of yesterday)
                const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
                ensureMonthWindowForSince(startMs);
                const matching = filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs);
                setFilePickerSelected(new Set(matching.map((entry) => entry.path)));
                return;
            }
            case 'Last 3 days':
                startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getTime();
                break;
            case 'This week': {
                const dayOfWeek = now.getDay(); // Sunday = 0
                startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
                break;
            }
            default:
                return;
        }

        ensureMonthWindowForSince(startMs);
        const matching = filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs);
        setFilePickerSelected(new Set(matching.map((entry) => entry.path)));
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
        selectDayOpen,
        setSelectDayOpen,
        selectBetweenOpen,
        setSelectBetweenOpen,
        selectDayDate,
        setSelectDayDate,
        selectSinceDate,
        setSelectSinceDate,
        selectSinceView,
        setSelectSinceView,
        selectSinceHour,
        setSelectSinceHour,
        selectSinceMinute,
        setSelectSinceMinute,
        selectSinceMeridiem,
        setSelectSinceMeridiem,
        selectSinceMonthOpen,
        setSelectSinceMonthOpen,
        selectBetweenStart,
        setSelectBetweenStart,
        selectBetweenEnd,
        setSelectBetweenEnd,
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
        handleAddSelectedFiles,
        focusedIndex,
        setFocusedIndex,
        activePreset,
        setActivePreset,
        handleApplyPreset,
        dateFilteredCount
    };
}
