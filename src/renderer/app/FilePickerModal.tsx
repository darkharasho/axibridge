import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

export function FilePickerModal({ ctx }: { ctx: any }) {
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
        setSelectSinceView,
        setSelectSinceDate,
        setSelectSinceHour,
        setSelectSinceMinute,
        setSelectSinceMeridiem,
        setSelectSinceMonthOpen,
        selectBetweenStart,
        setSelectBetweenStart,
        selectBetweenEnd,
        setSelectBetweenEnd,
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
        handleAddSelectedFiles,
        uiTheme
    } = ctx;

    const [selectModeMenuOpen, setSelectModeMenuOpen] = useState(false);
    const activeSelectMode = selectBetweenOpen ? 'Between' : selectSinceOpen ? 'Since' : selectDayOpen ? 'Day' : 'Select';

    const initSelectSince = () => {
        const now = new Date();
        setSelectSinceView(new Date(now.getFullYear(), now.getMonth(), 1));
        setSelectSinceDate((current: Date | null) => current ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()));
        const hour24 = now.getHours();
        const meridiem = hour24 >= 12 ? 'PM' : 'AM';
        const hour12 = hour24 % 12 || 12;
        setSelectSinceHour(hour12);
        setSelectSinceMinute(now.getMinutes());
        setSelectSinceMeridiem(meridiem);
        setSelectSinceMonthOpen(false);
    };

    const initSelectDay = () => {
        const now = new Date();
        const resolvedDate = selectDayDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
        setSelectDayDate(resolvedDate);
        setSelectSinceView(new Date(resolvedDate.getFullYear(), resolvedDate.getMonth(), 1));
        setSelectSinceMonthOpen(false);
    };

    const initSelectBetween = () => {
        const now = new Date();
        const end = new Date(now);
        const start = new Date(now.getTime() - (2 * 60 * 60 * 1000));
        const toLocalInput = (value: Date) => {
            const yyyy = value.getFullYear();
            const mm = String(value.getMonth() + 1).padStart(2, '0');
            const dd = String(value.getDate()).padStart(2, '0');
            const hh = String(value.getHours()).padStart(2, '0');
            const min = String(value.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        };
        setSelectBetweenStart((current: string) => current || toLocalInput(start));
        setSelectBetweenEnd((current: string) => current || toLocalInput(end));
    };

    return (
        <AnimatePresence>
            {filePickerOpen && (
                <motion.div
                    className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg file-picker-modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="app-modal-card w-full max-w-2xl bg-[#161c24]/95 border border-white/10 rounded-2xl shadow-2xl p-6 file-picker-card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-xs uppercase tracking-widest text-cyan-200/70">Log Import</div>
                                <h3 className="text-xl font-semibold text-white">Select Logs to Upload</h3>
                            </div>
                            <button
                                onClick={() => {
                                    setFilePickerOpen(false);
                                    setFilePickerError(null);
                                    setFilePickerSelected(new Set());
                                    setSelectModeMenuOpen(false);
                                    setSelectDayOpen(false);
                                    setSelectSinceOpen(false);
                                    setSelectBetweenOpen(false);
                                }}
                                className="p-2 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/30 file-picker-close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative file-picker-panel">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs uppercase tracking-widest text-gray-500">Available Logs</div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => loadLogFiles(logDirectory)}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                        >
                                            Refresh
                                        </button>
                                        {filePickerSelected.size > 0 && (
                                            <button
                                                onClick={() => setFilePickerSelected(new Set())}
                                                className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                            >
                                                Clear Selection
                                            </button>
                                        )}
                                        <div className="relative">
                                            <button
                                                onClick={() => setSelectModeMenuOpen((prev) => !prev)}
                                                className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30 inline-flex items-center gap-1.5"
                                            >
                                                {activeSelectMode}
                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${selectModeMenuOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            <AnimatePresence>
                                                {selectModeMenuOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                        transition={{ duration: 0.14, ease: 'easeOut' }}
                                                        className="absolute right-0 z-30 mt-2 w-32 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-2xl p-1.5 file-picker-popover"
                                                    >
                                                        <button
                                                            onClick={() => {
                                                                setSelectModeMenuOpen(false);
                                                                setSelectSinceOpen(false);
                                                                setSelectBetweenOpen(false);
                                                                setSelectDayOpen((prev: boolean) => {
                                                                    const next = !prev;
                                                                    if (next) initSelectDay();
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-blue-200 hover:bg-white/10"
                                                        >
                                                            Day
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSelectModeMenuOpen(false);
                                                                setSelectDayOpen(false);
                                                                setSelectBetweenOpen(false);
                                                                setSelectSinceOpen((prev: boolean) => {
                                                                    const next = !prev;
                                                                    if (next) initSelectSince();
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-cyan-200 hover:bg-white/10"
                                                        >
                                                            Since
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSelectModeMenuOpen(false);
                                                                setSelectDayOpen(false);
                                                                setSelectSinceOpen(false);
                                                                setSelectBetweenOpen((prev: boolean) => {
                                                                    const next = !prev;
                                                                    if (next) initSelectBetween();
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-emerald-200 hover:bg-white/10"
                                                        >
                                                            Between
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>
                                <AnimatePresence>
                                    {selectDayOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.18, ease: 'easeOut' }}
                                            className="absolute z-20 left-4 right-4 top-[56px] rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-2xl shadow-black/40 file-picker-popover"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-xs uppercase tracking-widest text-gray-400">Select Day</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {selectDayDate ? selectDayDate.toLocaleDateString() : 'Pick a date'}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <button
                                                        onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                        className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                        aria-label="Previous month"
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
                                                        <AnimatePresence>
                                                            {selectSinceMonthOpen && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                    transition={{ duration: 0.14, ease: 'easeOut' }}
                                                                    className="absolute z-10 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-2xl p-2 file-picker-popover"
                                                                >
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <button
                                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
                                                                            className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                            aria-label="Previous year"
                                                                        >
                                                                            <ChevronLeft className="w-3 h-3" />
                                                                        </button>
                                                                        <div className="text-[11px] text-gray-300">
                                                                            {selectSinceView.getFullYear()}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
                                                                            className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                            aria-label="Next year"
                                                                        >
                                                                            <ChevronRight className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-1">
                                                                        {Array.from({ length: 12 }, (_, i) => (
                                                                            <button
                                                                                key={`day-picker-month-${i}`}
                                                                                onClick={() => {
                                                                                    setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), i, 1));
                                                                                    setSelectSinceMonthOpen(false);
                                                                                }}
                                                                                className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selectSinceView.getMonth() === i
                                                                                    ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50'
                                                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                                    }`}
                                                                            >
                                                                                {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                    <button
                                                        onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                        className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                        aria-label="Next month"
                                                    >
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-2">
                                                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                                        <div key={`day-picker-weekday-${idx}-${day}`} className="text-center">{day}</div>
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
                                                                    return <div key={`day-picker-pad-${idx}`} />;
                                                                }
                                                                const day = idx - firstDay + 1;
                                                                const isSelected = selectDayDate
                                                                    && selectDayDate.getFullYear() === year
                                                                    && selectDayDate.getMonth() === month
                                                                    && selectDayDate.getDate() === day;
                                                                return (
                                                                    <button
                                                                        key={`day-picker-day-${day}`}
                                                                        onClick={() => setSelectDayDate(new Date(year, month, day))}
                                                                        className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center transition-colors ${isSelected
                                                                            ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/50'
                                                                            : 'text-gray-200 hover:bg-white/10'
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
                                            <div className="mt-3 flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (!selectDayDate) return;
                                                        const dayStart = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 0, 0, 0, 0).getTime();
                                                        const dayEnd = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 23, 59, 59, 999).getTime();
                                                        if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return;
                                                        ensureMonthWindowForSince(dayStart);
                                                        const matching = filePickerAll.filter(
                                                            (entry: any) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= dayStart && entry.mtimeMs <= dayEnd
                                                        );
                                                        setFilePickerSelected(new Set(matching.map((entry: any) => entry.path)));
                                                        setSelectDayOpen(false);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${uiTheme === 'matte'
                                                        ? 'bg-[#222629] text-cyan-200 border-transparent shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-cyan-100 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                                        : 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30'
                                                        }`}
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    onClick={() => setSelectDayOpen(false)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${uiTheme === 'matte'
                                                        ? 'bg-[#222629] text-gray-400 border-transparent shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-gray-200 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                        }`}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {selectSinceOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.18, ease: 'easeOut' }}
                                            className="absolute z-20 left-4 right-4 top-[56px] rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-2xl shadow-black/40 file-picker-popover"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-xs uppercase tracking-widest text-gray-400">Select Since</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {selectSinceDate
                                                        ? `${selectSinceDate.toLocaleDateString()} • ${selectSinceHour.toString().padStart(2, '0')}:${selectSinceMinute.toString().padStart(2, '0')} ${selectSinceMeridiem}`
                                                        : 'Pick a date'}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <button
                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                            className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                            aria-label="Previous month"
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
                                                            <AnimatePresence>
                                                                {selectSinceMonthOpen && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                        transition={{ duration: 0.14, ease: 'easeOut' }}
                                                                        className="absolute z-10 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-2xl p-2 file-picker-popover"
                                                                    >
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <button
                                                                                onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
                                                                                className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                                aria-label="Previous year"
                                                                            >
                                                                                <ChevronLeft className="w-3 h-3" />
                                                                            </button>
                                                                            <div className="text-[11px] text-gray-300">
                                                                                {selectSinceView.getFullYear()}
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
                                                                                className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                                aria-label="Next year"
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
                                                                                        ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50'
                                                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                                        }`}
                                                                                >
                                                                                    {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectSinceView((prev: Date) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                            className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                            aria-label="Next month"
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
                                                                            className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center transition-colors ${isSelected
                                                                                ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/50'
                                                                                : 'text-gray-200 hover:bg-white/10'
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
                                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Time</div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <div className="text-[10px] text-gray-400 mb-1">Hour</div>
                                                            <div className="file-picker-time-list h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                                                    <button
                                                                        key={`hour-${hour}`}
                                                                        onClick={() => setSelectSinceHour(hour)}
                                                                        className={`file-picker-time-option w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-all ${selectSinceHour === hour
                                                                            ? 'file-picker-time-option--active bg-cyan-500/30 text-cyan-100'
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
                                                            <div className="file-picker-time-list h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                                                                    <button
                                                                        key={`minute-${minute}`}
                                                                        onClick={() => setSelectSinceMinute(minute)}
                                                                        className={`file-picker-time-option w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-all ${selectSinceMinute === minute
                                                                            ? 'file-picker-time-option--active bg-cyan-500/30 text-cyan-100'
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
                                                            <div className="file-picker-time-list h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                {(['AM', 'PM'] as const).map((period) => (
                                                                    <button
                                                                        key={period}
                                                                        onClick={() => setSelectSinceMeridiem(period)}
                                                                        className={`file-picker-time-option w-full py-2 text-[10px] border-b border-white/5 last:border-0 transition-all ${selectSinceMeridiem === period
                                                                            ? 'file-picker-time-option--active bg-cyan-500/30 text-cyan-100'
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
                                            <div className="mt-3 flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (!selectSinceDate) return;
                                                        const base = new Date(selectSinceDate.getFullYear(), selectSinceDate.getMonth(), selectSinceDate.getDate());
                                                        let hour24 = selectSinceHour % 12;
                                                        if (selectSinceMeridiem === 'PM') hour24 += 12;
                                                        base.setHours(hour24, selectSinceMinute, 0, 0);
                                                        const sinceMs = base.getTime();
                                                        if (!Number.isFinite(sinceMs)) return;
                                                        ensureMonthWindowForSince(sinceMs);
                                                        const matching = filePickerAll.filter((entry: any) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= sinceMs);
                                                        setFilePickerSelected((prev: Set<string>) => {
                                                            const next = new Set(prev);
                                                            matching.forEach((entry: any) => next.add(entry.path));
                                                            return next;
                                                        });
                                                        setSelectSinceOpen(false);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${uiTheme === 'matte'
                                                        ? 'bg-[#222629] text-cyan-200 border-transparent shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-cyan-100 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                                        : 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30'
                                                        }`}
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    onClick={() => setSelectSinceOpen(false)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${uiTheme === 'matte'
                                                        ? 'bg-[#222629] text-gray-400 border-transparent shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-gray-200 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                        }`}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {selectBetweenOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.18, ease: 'easeOut' }}
                                            className="absolute z-20 left-4 right-4 top-[56px] rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-2xl shadow-black/40 file-picker-popover"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-xs uppercase tracking-widest text-gray-400">Select Between</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {selectBetweenStart && selectBetweenEnd ? 'Pick start and end date/time' : 'Choose a range'}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                    <div className="text-[10px] text-gray-400 mb-1">Start</div>
                                                    <input
                                                        type="datetime-local"
                                                        value={selectBetweenStart}
                                                        onChange={(event) => setSelectBetweenStart(event.target.value)}
                                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none"
                                                    />
                                                </div>
                                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                    <div className="text-[10px] text-gray-400 mb-1">End</div>
                                                    <input
                                                        type="datetime-local"
                                                        value={selectBetweenEnd}
                                                        onChange={(event) => setSelectBetweenEnd(event.target.value)}
                                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (!selectBetweenStart || !selectBetweenEnd) return;
                                                        const rawStartMs = new Date(selectBetweenStart).getTime();
                                                        const rawEndMs = new Date(selectBetweenEnd).getTime();
                                                        if (!Number.isFinite(rawStartMs) || !Number.isFinite(rawEndMs)) return;
                                                        const startMs = Math.min(rawStartMs, rawEndMs);
                                                        const endMs = Math.max(rawStartMs, rawEndMs);
                                                        ensureMonthWindowForSince(startMs);
                                                        const matching = filePickerAll.filter(
                                                            (entry: any) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs
                                                        );
                                                        setFilePickerSelected(new Set(matching.map((entry: any) => entry.path)));
                                                        setSelectBetweenOpen(false);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${uiTheme === 'matte'
                                                        ? 'bg-[#222629] text-emerald-200 border-transparent shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-emerald-100 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                                        : 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-600/30'
                                                        }`}
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    onClick={() => setSelectBetweenOpen(false)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${uiTheme === 'matte'
                                                        ? 'bg-[#222629] text-gray-400 border-transparent shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-gray-200 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                        }`}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <input type="search" value={filePickerFilter} onChange={(event) => setFilePickerFilter(event.target.value)} placeholder="Filter logs..." className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2" />
                                {filePickerLoading ? (
                                    <div className="text-xs text-gray-500">Loading logs...</div>
                                ) : filePickerAvailable.length === 0 ? (
                                    <div className="text-xs text-gray-500">
                                        {filePickerAll.length > 0 ? 'No logs in the last 30 days.' : 'No logs found in this folder.'}
                                    </div>
                                ) : (
                                    <div
                                        ref={filePickerListRef}
                                        onScroll={(event) => {
                                            const target = event.currentTarget;
                                            const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 4;
                                            setFilePickerAtBottom(atBottom);
                                        }}
                                        className="max-h-56 overflow-y-auto space-y-1 pr-1 text-xs text-gray-300"
                                    >
                                        {filePickerAvailable
                                            .filter((entry: any) => entry.name.toLowerCase().includes(filePickerFilter.trim().toLowerCase()))
                                            .map((entry: any, index: number, filtered: any[]) => {
                                                const timestamp = Number.isFinite(entry.mtimeMs)
                                                    ? new Date(entry.mtimeMs).toLocaleString(undefined, {
                                                        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                                    })
                                                    : null;
                                                return (
                                                    <div
                                                        key={entry.path}
                                                        className={`flex items-center gap-2 px-2 py-1 rounded-lg border cursor-pointer select-none ${filePickerSelected.has(entry.path)
                                                            ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-100'
                                                            : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                                                            }`}
                                                        onClick={(event) => {
                                                            if (event.shiftKey && lastPickedIndexRef.current !== null) {
                                                                const start = Math.min(lastPickedIndexRef.current, index);
                                                                const end = Math.max(lastPickedIndexRef.current, index);
                                                                setFilePickerSelected((prev: Set<string>) => {
                                                                    const next = new Set(prev);
                                                                    for (let i = start; i <= end; i += 1) next.add(filtered[i].path);
                                                                    return next;
                                                                });
                                                            } else {
                                                                setFilePickerSelected((prev: Set<string>) => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
                                                                    return next;
                                                                });
                                                            }
                                                            lastPickedIndexRef.current = index;
                                                        }}
                                                    >
                                                        <div className="h-3.5 w-3.5 rounded border border-white/20 flex items-center justify-center">
                                                            {filePickerSelected.has(entry.path) && <div className="h-2 w-2 rounded-sm bg-cyan-300" />}
                                                        </div>
                                                        <span className="truncate flex-1">{entry.name}</span>
                                                        {timestamp && <span className="text-[10px] text-gray-500/80 font-medium whitespace-nowrap">{timestamp}</span>}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                                {!filePickerLoading && filePickerHasMore && filePickerAtBottom && (
                                    <div className="mt-3 flex justify-center">
                                        <button onClick={() => setFilePickerMonthWindow((prev: number) => prev + 1)} className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white">
                                            Load more
                                        </button>
                                    </div>
                                )}
                            </div>

                            {filePickerError && <div className="text-xs text-rose-300">{filePickerError}</div>}

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    onClick={() => {
                                        setFilePickerOpen(false);
                                        setFilePickerError(null);
                                        setFilePickerSelected(new Set());
                                        setSelectModeMenuOpen(false);
                                        setSelectDayOpen(false);
                                        setSelectSinceOpen(false);
                                        setSelectBetweenOpen(false);
                                    }}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectModeMenuOpen(false);
                                        setSelectDayOpen(false);
                                        setSelectSinceOpen(false);
                                        setSelectBetweenOpen(false);
                                        handleAddSelectedFiles();
                                    }}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30"
                                >
                                    Add to Recent Activity ({filePickerSelected.size})
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )
            }
        </AnimatePresence >
    );
}
