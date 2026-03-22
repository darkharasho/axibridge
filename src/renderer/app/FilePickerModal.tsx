import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState, useRef, useMemo, memo } from 'react';
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, FileText, RefreshCw, Search, X } from 'lucide-react';

// Helper to format file sizes
function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Simple helper to try and extract a clean "boss" or encounter name from standard ArcDPS log names
function parseLogName(fileName: string) {
    // Example: 20240302-123456_vg.zevtc -> vg
    const match = fileName.match(/_([a-zA-Z0-9]+)\.(z?evtc)$/i);
    if (match && match[1]) {
        return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    return null;
}

interface FilePickerItemProps {
    entry: any;
    index: number;
    isSelected: boolean;
    isFocused: boolean;
    toggleSelection: (path: string, index: number, shift: boolean) => void;
    setFocusedIndex: (index: number) => void;
}

const FilePickerItem = memo(({ entry, index, isSelected, isFocused, toggleSelection, setFocusedIndex }: FilePickerItemProps) => {
    const timestamp = Number.isFinite(entry.mtimeMs)
        ? new Date(entry.mtimeMs).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        })
        : '-';

    const encounterName = useMemo(() => parseLogName(entry.name), [entry.name]);

    return (
        <div
            onClick={(e) => toggleSelection(entry.path, index, e.shiftKey)}
            onMouseEnter={() => setFocusedIndex(index)}
            className={`grid grid-cols-[minmax(0,3.2fr)_minmax(140px,1.1fr)_86px] gap-3 items-center px-2.5 py-1.5 rounded-2xl border select-none transition-all cursor-pointer ${isSelected
                ? 'bg-cyan-500/12 border-cyan-400/40 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.08)]'
                : isFocused
                    ? 'bg-white/10 border-white/15'
                    : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10'
                }`}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                <div className={`shrink-0 w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'border-cyan-300 bg-cyan-300/90' : 'border-white/15 bg-black/40'}`}>
                    {isSelected && <svg className="w-2.5 h-2.5 text-[var(--tw-colors-cyan-950)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-medium truncate leading-tight ${isSelected ? 'text-cyan-50' : 'text-gray-200'}`}>
                            {entry.name}
                        </span>
                        {encounterName && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none bg-white/8 border border-white/10 text-gray-300">
                                {encounterName}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="text-[10px] text-gray-400 truncate leading-tight">
                {timestamp}
            </div>
            <div className="text-[10px] text-gray-500 font-mono text-right leading-tight">
                {formatBytes(entry.size)}
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.isSelected === next.isSelected &&
        prev.isFocused === next.isFocused &&
        prev.entry.path === next.entry.path;
});

export function FilePickerModal({ ctx, isBulkUploadActive }: { ctx: any; isBulkUploadActive?: boolean }) {
    const {
        filePickerOpen,
        setFilePickerOpen,
        setFilePickerError,
        setFilePickerSelected,
        filePickerError,
        filePickerSelected,
        loadLogFiles,
        logDirectory,
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
        setFocusedIndex
    } = ctx;

    const [selectModeMenuOpen, setSelectModeMenuOpen] = useState(false);
    const activeSelectMode = selectBetweenOpen ? 'Between' : selectSinceOpen ? 'Since' : selectDayOpen ? 'Day' : 'Select';

    // Keyboard navigation ref for container
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter down the items
    const filteredAvailable = useMemo(() => {
        const query = filePickerFilter.trim().toLowerCase();
        if (!query) return filePickerAvailable;
        return filePickerAvailable.filter((entry: any) =>
            entry.name.toLowerCase().includes(query)
        );
    }, [filePickerAvailable, filePickerFilter]);

    useEffect(() => {
        if (filePickerOpen && containerRef.current) {
            containerRef.current.focus();
        }
    }, [filePickerOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!filePickerOpen) return;

        // Don't intercept if they are actively typing in the search box or date inputs
        if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.key !== 'Enter' && e.key !== 'Escape') {
            return;
        }

        if (e.key === 'Escape') {
            handleClose();
            return;
        }

        if (filteredAvailable.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex((prev: number | null) => {
                if (prev === null) return 0;
                const next = Math.min(prev + 1, filteredAvailable.length - 1);
                ensureVisible(next);
                return next;
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex((prev: number | null) => {
                if (prev === null) return filteredAvailable.length - 1;
                const next = Math.max(prev - 1, 0);
                ensureVisible(next);
                return next;
            });
        } else if (e.key === ' ') {
            if (focusedIndex !== null && filteredAvailable[focusedIndex]) {
                e.preventDefault();
                toggleSelection(filteredAvailable[focusedIndex].path, focusedIndex, e.shiftKey);
            }
        } else if (e.key === 'Enter') {
            if (filePickerSelected.size > 0) {
                e.preventDefault();
                handleAddSelectedFiles();
            }
        }
    };

    const ensureVisible = (index: number) => {
        if (!filePickerListRef.current) return;
        const list = filePickerListRef.current;
        const element = list.children[index] as HTMLElement;
        if (!element) return;

        const top = element.offsetTop;
        const bottom = top + element.offsetHeight;
        const viewTop = list.scrollTop;
        const viewBottom = viewTop + list.clientHeight;

        if (top < viewTop) {
            list.scrollTop = top;
        } else if (bottom > viewBottom) {
            list.scrollTop = bottom - list.clientHeight;
        }
    };

    const toggleSelection = (path: string, index: number, isShiftKey: boolean) => {
        if (isShiftKey && lastPickedIndexRef.current !== null) {
            const start = Math.min(lastPickedIndexRef.current, index);
            const end = Math.max(lastPickedIndexRef.current, index);
            setFilePickerSelected((prev: Set<string>) => {
                const next = new Set(prev);
                const rangePaths = filteredAvailable.slice(start, end + 1).map((entry: any) => entry.path);
                const shouldDeselectRange = rangePaths.every((rangePath: string) => next.has(rangePath));

                for (const rangePath of rangePaths) {
                    if (shouldDeselectRange) {
                        next.delete(rangePath);
                    } else {
                        next.add(rangePath);
                    }
                }

                return next;
            });
        } else {
            setFilePickerSelected((prev: Set<string>) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path); else next.add(path);
                return next;
            });
        }
        lastPickedIndexRef.current = index;
    };

    const handleApplyDateFilters = () => {
        if (selectDayOpen && selectDayDate) {
            const dayStart = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 0, 0, 0, 0).getTime();
            const dayEnd = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 23, 59, 59, 999).getTime();
            if (Number.isFinite(dayStart) && Number.isFinite(dayEnd)) {
                ensureMonthWindowForSince(dayStart);
                const matching = filePickerAll.filter((entry: any) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= dayStart && entry.mtimeMs <= dayEnd);
                setFilePickerSelected(new Set(matching.map((entry: any) => entry.path)));
            }
        } else if (selectSinceOpen && selectSinceDate) {
            const base = new Date(selectSinceDate.getFullYear(), selectSinceDate.getMonth(), selectSinceDate.getDate());
            let hour24 = selectSinceHour % 12;
            if (selectSinceMeridiem === 'PM') hour24 += 12;
            base.setHours(hour24, selectSinceMinute, 0, 0);
            const sinceMs = base.getTime();
            if (Number.isFinite(sinceMs)) {
                ensureMonthWindowForSince(sinceMs);
                const matching = filePickerAll.filter((entry: any) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= sinceMs);
                setFilePickerSelected(new Set(matching.map((entry: any) => entry.path)));
            }
        } else if (selectBetweenOpen && selectBetweenStart && selectBetweenEnd) {
            const rawStartMs = new Date(selectBetweenStart).getTime();
            const rawEndMs = new Date(selectBetweenEnd).getTime();
            if (Number.isFinite(rawStartMs) && Number.isFinite(rawEndMs)) {
                const startMs = Math.min(rawStartMs, rawEndMs);
                const endMs = Math.max(rawStartMs, rawEndMs);
                ensureMonthWindowForSince(startMs);
                const matching = filePickerAll.filter((entry: any) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs);
                setFilePickerSelected(new Set(matching.map((entry: any) => entry.path)));
            }
        }
    };

    const handleClose = () => {
        setFilePickerOpen(false);
        setFilePickerError(null);
        setFilePickerSelected(new Set());
        setSelectModeMenuOpen(false);
        setSelectDayOpen(false);
        setSelectSinceOpen(false);
        setSelectBetweenOpen(false);
        setFocusedIndex(null);
    };

    return (
        <AnimatePresence initial={false}>
            {filePickerOpen && (
                <motion.div
                    className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg file-picker-modal focus:outline-none"
                    initial={isBulkUploadActive ? undefined : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={isBulkUploadActive ? undefined : { opacity: 0 }}
                    tabIndex={-1}
                    onClick={(event) => event.target === event.currentTarget && handleClose()}
                    onKeyDown={handleKeyDown}
                    ref={containerRef}
                >
                    <motion.div
                        className="app-modal-card file-picker-card relative isolate w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#0f141a]/95 border border-white/10 rounded-[24px] shadow-2xl overflow-hidden"
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.98 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                    >
                        <div className="pointer-events-none absolute inset-0 z-0 opacity-70" aria-hidden="true">
                            <div className="absolute -top-20 right-8 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
                            <div className="absolute top-28 -left-10 h-56 w-56 rounded-full bg-slate-500/10 blur-3xl" />
                            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.035] to-transparent" />
                        </div>
                        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                        {/* Header */}
                        <div className="flex-none px-6 pt-6 pb-5 border-b border-white/5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">Recent Activity</div>
                                    <h3 className="mt-2 text-xl font-semibold text-white flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-cyan-400" />
                                        Add Logs
                                    </h3>
                                    <div className="text-sm tracking-wide text-gray-400 mt-1">Pull existing ArcDPS logs into the recent activity queue.</div>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="file-picker-close p-2.5 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                    aria-label="Close log picker"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-none border-b border-white/5 bg-white/[0.02]">
                            {/* Toolbar (Search & Filter toggles) */}
                            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                                <div className="relative flex-1 min-w-[240px] max-w-md">
                                    <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={filePickerFilter}
                                        onChange={(event) => setFilePickerFilter(event.target.value)}
                                        placeholder="Search by file name..."
                                        className="file-picker-panel w-full bg-black/30 border border-white/10 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                    />
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={() => loadLogFiles(logDirectory)}
                                        className="px-4 py-2.5 rounded-2xl text-sm font-medium border bg-white/5 text-gray-300 border-white/10 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Refresh
                                    </button>
                                    {filePickerSelected.size > 0 && (
                                        <button
                                            onClick={() => setFilePickerSelected(new Set())}
                                            className="px-4 py-2.5 rounded-2xl text-sm font-medium border bg-white/5 text-gray-300 border-white/10 hover:text-white hover:bg-white/10 transition-colors"
                                        >
                                            Clear Selection
                                        </button>
                                    )}

                                    <div className="relative">
                                        <button
                                            onClick={() => setSelectModeMenuOpen((prev) => !prev)}
                                            className={`px-4 py-2.5 rounded-2xl text-sm font-medium border inline-flex items-center gap-2 transition-colors ${selectDayOpen || selectSinceOpen || selectBetweenOpen
                                                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
                                                }`}
                                        >
                                            <CalendarRange className="w-4 h-4" />
                                            Filter: <span className={selectDayOpen || selectSinceOpen || selectBetweenOpen ? 'font-bold text-cyan-100' : 'font-semibold text-gray-200'}>{activeSelectMode}</span>
                                            <ChevronDown className={`w-4 h-4 transition-transform ${selectModeMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        <AnimatePresence>
                                            {selectModeMenuOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 4, scale: 0.98 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="file-picker-popover absolute right-0 top-full mt-2 w-40 rounded-2xl border border-white/10 bg-[#161c24] shadow-2xl p-1.5 z-30"
                                                >
                                                    {[
                                                        { id: 'Select', label: 'None' },
                                                        { id: 'Day', label: 'Specific Day' },
                                                        { id: 'Since', label: 'Since Time' },
                                                        { id: 'Between', label: 'Time Range' }
                                                    ].map((mode) => (
                                                        <button
                                                            key={mode.id}
                                                            onClick={() => {
                                                                setSelectModeMenuOpen(false);
                                                                setSelectDayOpen(mode.id === 'Day');
                                                                setSelectSinceOpen(mode.id === 'Since');
                                                                setSelectBetweenOpen(mode.id === 'Between');
                                                                // Set default dates if empty
                                                                const now = new Date();
                                                                const isoLocal = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

                                                                if (mode.id === 'Day' && !selectDayDate) setSelectDayDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
                                                                if (mode.id === 'Since' && !selectSinceDate) {
                                                                    setSelectSinceDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
                                                                    const hour24 = now.getHours();
                                                                    setSelectSinceMeridiem(hour24 >= 12 ? 'PM' : 'AM');
                                                                    setSelectSinceHour(hour24 % 12 || 12);
                                                                    setSelectSinceMinute(now.getMinutes());
                                                                }
                                                                if (mode.id === 'Between' && !selectBetweenEnd) {
                                                                    setSelectBetweenEnd(isoLocal);
                                                                    const start = new Date(now.getTime() - (2 * 60 * 60 * 1000));
                                                                    const startIsoLocal = new Date(start.getTime() - (start.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                                                                    setSelectBetweenStart(startIsoLocal);
                                                                }
                                                            }}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none ${(mode.id === 'Select' && !selectBetweenOpen && !selectSinceOpen && !selectDayOpen) ||
                                                                (mode.id === 'Day' && selectDayOpen) ||
                                                                (mode.id === 'Since' && selectSinceOpen) ||
                                                                (mode.id === 'Between' && selectBetweenOpen)
                                                                ? 'bg-cyan-500/30 text-cyan-100 font-medium'
                                                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                                                                }`}
                                                        >
                                                            {mode.label}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>

                            {/* Inline Expandable Date Filter Panel */}
                            <AnimatePresence>
                                {(selectDayOpen || selectSinceOpen || selectBetweenOpen) && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{
                                            height: 'auto',
                                            opacity: 1,
                                            transition: {
                                                height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                                                opacity: { duration: 0.16, delay: 0.04 }
                                            }
                                        }}
                                        exit={{
                                            height: 0,
                                            opacity: 0,
                                            transition: {
                                                height: { duration: 0.18, ease: [0.4, 0, 1, 1] },
                                                opacity: { duration: 0.12 }
                                            }
                                        }}
                                        className="overflow-hidden"
                                    >
                                        <motion.div
                                            initial={{ y: -8, opacity: 0.7 }}
                                            animate={{ y: 0, opacity: 1, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
                                            exit={{ y: -6, opacity: 0, transition: { duration: 0.12 } }}
                                            className="px-6 pb-4"
                                        >
                                        {selectDayOpen && (
                                            <div className="flex flex-col gap-4">
                                                <div className="file-picker-panel flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 max-w-sm mx-auto w-full">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <button
                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                            className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                        >
                                                            <ChevronLeft className="w-3.5 h-3.5" />
                                                        </button>
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setSelectSinceMonthOpen((prev: boolean) => !prev)}
                                                                className="text-sm font-semibold text-gray-200 hover:text-white"
                                                            >
                                                                {selectSinceView.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                                                            </button>
                                                            {selectSinceMonthOpen && (
                                                                <div className="file-picker-popover absolute z-10 top-full justify-center -left-8 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-2xl p-2">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <button
                                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
                                                                            className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                                        >
                                                                            <ChevronLeft className="w-3 h-3" />
                                                                        </button>
                                                                        <div className="text-[11px] text-gray-300">
                                                                            {selectSinceView.getFullYear()}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
                                                                            className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                                        >
                                                                            <ChevronRight className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-1">
                                                                        {Array.from({ length: 12 }, (_, i) => (
                                                                            <button
                                                                                key={`month-${i}`}
                                                                                onClick={() => {
                                                                                    setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), i, 1));
                                                                                    setSelectSinceMonthOpen(false);
                                                                                }}
                                                                                className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selectSinceView.getMonth() === i
                                                                                    ? 'file-picker-selected-cell font-semibold'
                                                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                                    }`}
                                                                            >
                                                                                {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                            className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                        >
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-2">
                                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                                            <div key={`weekday-${idx}-${day}`} className="text-center">{day}</div>
                                                        ))}
                                                    </div>
                                                    {(() => {
                                                        const year = selectSinceView.getFullYear();
                                                        const month = selectSinceView.getMonth();
                                                        const firstDay = new Date(year, month, 1).getDay();
                                                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                        const cells = Array.from({ length: firstDay + daysInMonth }, (_, idx) => idx);
                                                        return (
                                                            <div className="grid grid-cols-7 gap-1 text-xs">
                                                                {cells.map((idx) => {
                                                                    if (idx < firstDay) {
                                                                        return <div key={`pad-${idx}`} />;
                                                                    }
                                                                    const day = idx - firstDay + 1;
                                                                    const isSelected = selectDayDate
                                                                        && selectDayDate.getFullYear() === year
                                                                        && selectDayDate.getMonth() === month
                                                                        && selectDayDate.getDate() === day;
                                                                    return (
                                                                        <button
                                                                            key={`day-${day}`}
                                                                            onClick={() => setSelectDayDate(new Date(year, month, day))}
                                                                            className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center transition-colors border ${isSelected
                                                                                ? 'file-picker-selected-cell font-semibold'
                                                                                : 'border-transparent text-gray-200 hover:bg-white/10 hover:border-white/10'
                                                                                }`}
                                                                        >
                                                                            {day}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex justify-end pt-2 border-t border-white/5">
                                                    <button
                                                        onClick={handleApplyDateFilters}
                                                        className="px-6 py-2 rounded-xl text-sm font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white hover:bg-white/10 transition-colors"
                                                    >
                                                        Select Matching Files
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {selectSinceOpen && (
                                            <div className="flex flex-col gap-4">
                                                <div className="flex items-stretch gap-4 flex-wrap">
                                                    <div className="file-picker-panel flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 min-w-[280px]">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <button
                                                                onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                                className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                            >
                                                                <ChevronLeft className="w-3.5 h-3.5" />
                                                            </button>
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setSelectSinceMonthOpen((prev: boolean) => !prev)}
                                                                    className="text-sm font-semibold text-gray-200 hover:text-white"
                                                                >
                                                                    {selectSinceView.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                                                                </button>
                                                                {selectSinceMonthOpen && (
                                                                    <div className="file-picker-popover absolute z-10 top-full justify-center -left-8 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-2xl p-2">
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <button
                                                                                onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
                                                                                className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                                            >
                                                                                <ChevronLeft className="w-3 h-3" />
                                                                            </button>
                                                                            <div className="text-[11px] text-gray-300">
                                                                                {selectSinceView.getFullYear()}
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
                                                                                className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                                            >
                                                                                <ChevronRight className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                        <div className="grid grid-cols-3 gap-1">
                                                                            {Array.from({ length: 12 }, (_, i) => (
                                                                                <button
                                                                                    key={`month-${i}`}
                                                                                    onClick={() => {
                                                                                        setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), i, 1));
                                                                                        setSelectSinceMonthOpen(false);
                                                                                    }}
                                                                                    className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selectSinceView.getMonth() === i
                                                                                        ? 'file-picker-selected-cell font-semibold'
                                                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                                        }`}
                                                                                >
                                                                                    {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                                className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
                                                            >
                                                                <ChevronRight className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-2">
                                                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                                                <div key={`weekday-${idx}-${day}`} className="text-center">{day}</div>
                                                            ))}
                                                        </div>
                                                        {(() => {
                                                            const year = selectSinceView.getFullYear();
                                                            const month = selectSinceView.getMonth();
                                                            const firstDay = new Date(year, month, 1).getDay();
                                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                            const cells = Array.from({ length: firstDay + daysInMonth }, (_, idx) => idx);
                                                            return (
                                                                <div className="grid grid-cols-7 gap-1 text-xs">
                                                                    {cells.map((idx) => {
                                                                        if (idx < firstDay) {
                                                                            return <div key={`pad-${idx}`} />;
                                                                        }
                                                                        const day = idx - firstDay + 1;
                                                                        const isSelected = selectSinceDate
                                                                            && selectSinceDate.getFullYear() === year
                                                                            && selectSinceDate.getMonth() === month
                                                                            && selectSinceDate.getDate() === day;
                                                                        return (
                                                                            <button
                                                                                key={`day-${day}`}
                                                                                onClick={() => setSelectSinceDate(new Date(year, month, day))}
                                                                                className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center transition-colors border ${isSelected
                                                                                    ? 'file-picker-selected-cell font-semibold'
                                                                                    : 'border-transparent text-gray-200 hover:bg-white/10 hover:border-white/10'
                                                                                    }`}
                                                                            >
                                                                                {day}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="file-picker-panel flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 min-w-[280px]">
                                                        <div className="text-xs uppercase tracking-widest text-cyan-200/70 mb-2">Time</div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">Hour</div>
                                                                <div className="file-picker-time-list h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5 file-picker-scroll-container">
                                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                                                        <button
                                                                            key={`hour-${hour}`}
                                                                            onClick={() => setSelectSinceHour(hour)}
                                                                            className={`file-picker-time-option w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-all ${selectSinceHour === hour
                                                                                ? 'file-picker-selected-item file-picker-time-option--active font-semibold'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {hour.toString().padStart(2, '0')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">Minute</div>
                                                                <div className="file-picker-time-list h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5 file-picker-scroll-container">
                                                                    {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                                                                        <button
                                                                            key={`minute-${minute}`}
                                                                            onClick={() => setSelectSinceMinute(minute)}
                                                                            className={`file-picker-time-option w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-all ${selectSinceMinute === minute
                                                                                ? 'file-picker-selected-item file-picker-time-option--active font-semibold'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {minute.toString().padStart(2, '0')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">AM/PM</div>
                                                                <div className="file-picker-time-list h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5 file-picker-scroll-container">
                                                                    {(['AM', 'PM'] as const).map((period) => (
                                                                        <button
                                                                            key={period}
                                                                            onClick={() => setSelectSinceMeridiem(period)}
                                                                            className={`file-picker-time-option w-full py-2 text-[10px] border-b border-white/5 last:border-0 transition-all ${selectSinceMeridiem === period
                                                                                ? 'file-picker-selected-item file-picker-time-option--active font-semibold'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {period}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-end pt-2 border-t border-white/5">
                                                    <button
                                                        onClick={handleApplyDateFilters}
                                                        className="px-6 py-2 rounded-xl text-sm font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white hover:bg-white/10 transition-colors"
                                                    >
                                                        Select Matching Files
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {selectBetweenOpen && (
                                            <div className="flex flex-col gap-4">
                                                <div className="flex items-stretch gap-4 flex-wrap w-full max-w-2xl mx-auto">
                                                    <div className="file-picker-panel flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 min-w-[200px]">
                                                        <div className="text-[10px] text-gray-400 mb-1">Start</div>
                                                        <input
                                                            type="datetime-local"
                                                            value={selectBetweenStart}
                                                            onChange={e => setSelectBetweenStart(e.target.value)}
                                                            onClick={e => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                                            style={{ colorScheme: 'dark' }}
                                                            className="w-full bg-black/40 border border-cyan-500/30 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-400 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                                                        />
                                                    </div>
                                                    <div className="file-picker-panel flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 min-w-[200px]">
                                                        <div className="text-[10px] text-gray-400 mb-1">End</div>
                                                        <input
                                                            type="datetime-local"
                                                            value={selectBetweenEnd}
                                                            onChange={e => setSelectBetweenEnd(e.target.value)}
                                                            onClick={e => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                                            style={{ colorScheme: 'dark' }}
                                                            className="w-full bg-black/40 border border-cyan-500/30 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-cyan-400 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end pt-2 border-t border-white/5">
                                                    <button
                                                        onClick={handleApplyDateFilters}
                                                        className="px-6 py-2 rounded-xl text-sm font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white hover:bg-white/10 transition-colors"
                                                    >
                                                        Select Matching Files
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* File List Header */}
                        {!filePickerLoading && filteredAvailable.length > 0 && (
                            <div className="flex-none px-6 py-3 bg-black/40 border-b border-white/5 grid grid-cols-[minmax(0,3.2fr)_minmax(140px,1.1fr)_86px] gap-4 text-[11px] uppercase tracking-[0.24em] text-gray-500 font-semibold">
                                <div>Name</div>
                                <div>Modified</div>
                                <div className="text-right">Size</div>
                            </div>
                        )}

                        {/* Main File List area */}
                        <div className="file-picker-panel min-h-[140px] flex-1 overflow-hidden flex flex-col relative bg-black/20 mx-4 my-4 rounded-2xl border border-white/5">
                            {filePickerLoading ? (
                                <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                        className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full mr-3"
                                    />
                                    Loading logs...
                                </div>
                            ) : filteredAvailable.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
                                    <span>{filePickerAvailable.length > 0 || filePickerAll.length > 0 ? 'No logs matching your current filters.' : 'No logs found in this folder.'}</span>
                                    {filePickerHasMore && (
                                        <button onClick={() => setFilePickerMonthWindow((prev: number) => prev + 1)} className="px-4 py-2 rounded-xl text-xs font-semibold border bg-white/5 text-gray-400 border-white/10 hover:text-white transition-colors">
                                            Load older logs
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div
                                    ref={filePickerListRef}
                                    onScroll={(event) => {
                                        const target = event.currentTarget;
                                        const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 4;
                                        setFilePickerAtBottom(atBottom);
                                    }}
                                    className="flex-1 overflow-y-auto px-2.5 py-2.5 file-picker-scroll-container focus:outline-none"
                                >
                                    <div className="space-y-0.5">
                                        {filteredAvailable.map((entry: any, index: number) => (
                                            <FilePickerItem
                                                key={entry.path}
                                                entry={entry}
                                                index={index}
                                                isSelected={filePickerSelected.has(entry.path)}
                                                isFocused={focusedIndex === index}
                                                toggleSelection={toggleSelection}
                                                setFocusedIndex={setFocusedIndex}
                                            />
                                        ))}
                                    </div>
                                    {!filePickerLoading && filePickerHasMore && filePickerAtBottom && (
                                        <div className="mt-4 pb-4 flex justify-center">
                                            <button onClick={() => setFilePickerMonthWindow((prev: number) => prev + 1)} className="px-4 py-2 rounded-xl text-xs font-semibold border bg-white/5 text-gray-400 border-white/10 hover:text-white transition-colors">
                                                Load older logs
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex-none p-6 border-t border-white/5 bg-black/30">
                            {filePickerError && <div className="text-sm text-rose-400 mb-4 font-medium px-3 py-2 bg-rose-500/10 rounded-xl border border-rose-500/20">{filePickerError}</div>}

                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm text-gray-300">
                                        {filePickerSelected.size > 0
                                            ? `${filePickerSelected.size} log${filePickerSelected.size === 1 ? '' : 's'} selected`
                                            : `${filteredAvailable.length} log${filteredAvailable.length === 1 ? '' : 's'} available`}
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500 flex flex-wrap items-center gap-4">
                                        <span className="flex items-center gap-1.5"><code className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">↑/↓</code> Navigate</span>
                                        <span className="flex items-center gap-1.5"><code className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">Space</code> Select</span>
                                        <span className="flex items-center gap-1.5"><code className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">Enter</code> Confirm</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleClose}
                                        className="px-5 py-2.5 rounded-2xl text-sm font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (filePickerSelected.size > 0) {
                                                handleAddSelectedFiles();
                                            }
                                        }}
                                        disabled={filePickerSelected.size === 0}
                                        className="px-5 py-2.5 rounded-2xl text-sm font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        Add to Recent Activity
                                        {filePickerSelected.size > 0 && (
                                            <span className="bg-emerald-500/30 text-emerald-100 px-2 py-0.5 rounded-lg text-xs">
                                                {filePickerSelected.size}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
