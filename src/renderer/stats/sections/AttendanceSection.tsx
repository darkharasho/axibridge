import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';

type AttendanceClassTime = {
    profession: string;
    timeMs: number;
};

type AttendanceRow = {
    account: string;
    characterNames: string[];
    classTimes: AttendanceClassTime[];
    combatTimeMs?: number;
    squadTimeMs: number;
};

type AttendanceSectionProps = {
    attendanceRows: AttendanceRow[];
    getProfessionIconPath: (profession: string) => string | null;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

const formatDuration = (timeMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(Number(timeMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
};

export const AttendanceSection = ({
    attendanceRows,
    getProfessionIconPath,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: AttendanceSectionProps) => {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<'fight' | 'squad'>('squad');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const normalizedSearch = search.trim().toLowerCase();

    const visibleRows = useMemo(() => {
        const filtered = attendanceRows.filter((row) => {
            if (!normalizedSearch) return true;
            const account = String(row.account || '').toLowerCase();
            const characters = (row.characterNames || []).join(' ').toLowerCase();
            const classes = (row.classTimes || []).map((entry) => String(entry.profession || '').toLowerCase()).join(' ');
            return account.includes(normalizedSearch) || characters.includes(normalizedSearch) || classes.includes(normalizedSearch);
        });
        const readSortValue = (row: AttendanceRow) =>
            sortKey === 'fight'
                ? Number(row.combatTimeMs ?? row.squadTimeMs ?? 0)
                : Number(row.squadTimeMs ?? 0);
        return [...filtered].sort((a, b) => {
            const delta = readSortValue(b) - readSortValue(a);
            if (delta !== 0) return sortDir === 'desc' ? delta : -delta;
            return String(a.account || '').localeCompare(String(b.account || ''));
        });
    }, [attendanceRows, normalizedSearch, sortDir, sortKey]);

    const updateSort = (nextKey: 'fight' | 'squad') => {
        if (sortKey === nextKey) {
            setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
            return;
        }
        setSortKey(nextKey);
        setSortDir('desc');
    };

    return (
        <section
            id="attendance-ledger"
            data-section-visible={isSectionVisible('attendance-ledger')}
            data-section-first={isFirstVisibleSection('attendance-ledger')}
            className={sectionClass('attendance-ledger', 'mb-8 page-break-avoid')}
        >
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-amber-300" />
                            Attendance Ledger
                        </h3>
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] uppercase tracking-widest text-gray-300">
                            {attendanceRows.length} Joined
                        </span>
                    </div>
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search account, character, or class..."
                        className="w-full sm:w-[320px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none"
                    />
                </div>
                {attendanceRows.length === 0 ? (
                    <div className="text-center text-gray-500 italic py-6">No attendance data available.</div>
                ) : (
                    <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden">
                        <table className="w-full text-xs table-auto min-w-[900px]">
                            <thead>
                                <tr className="text-gray-400 uppercase tracking-widest text-[10px] bg-white/5">
                                    <th className="text-left py-2 px-4">Account</th>
                                    <th className="text-left py-2 px-4">Character(s)</th>
                                    <th className="text-left py-2 px-4">Classes Played</th>
                                    <th className="text-right py-2 px-4">
                                        <button
                                            type="button"
                                            onClick={() => updateSort('fight')}
                                            className={`transition-colors ${sortKey === 'fight' ? 'text-amber-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Total Fight Time{sortKey === 'fight' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                    </th>
                                    <th className="text-right py-2 px-4">
                                        <button
                                            type="button"
                                            onClick={() => updateSort('squad')}
                                            className={`transition-colors ${sortKey === 'squad' ? 'text-amber-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Total Squad Time{sortKey === 'squad' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => (
                                    <tr key={row.account} className="border-t border-white/5 align-top hover:bg-white/5">
                                        <td className="py-2 px-4 text-gray-100 font-medium whitespace-nowrap">{row.account}</td>
                                        <td className="py-2 px-4 text-gray-300">
                                            {row.characterNames.length > 0 ? row.characterNames.join(', ') : '-'}
                                        </td>
                                        <td className="py-2 px-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {row.classTimes.length > 0 ? row.classTimes.map((entry) => (
                                                    <span
                                                        key={`${row.account}-${entry.profession}`}
                                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-200"
                                                    >
                                                        {getProfessionIconPath(entry.profession) ? (
                                                            <img
                                                                src={getProfessionIconPath(entry.profession) as string}
                                                                alt={entry.profession}
                                                                className="w-3.5 h-3.5 object-contain"
                                                            />
                                                        ) : null}
                                                        <span>{entry.profession}</span>
                                                        <span className="text-gray-400">{formatDuration(entry.timeMs)}</span>
                                                    </span>
                                                )) : <span className="text-gray-500">-</span>}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 text-right text-gray-200 font-mono whitespace-nowrap">
                                            {formatDuration(Number(row.combatTimeMs ?? row.squadTimeMs ?? 0))}
                                        </td>
                                        <td className="py-2 px-4 text-right text-gray-200 font-mono whitespace-nowrap">
                                            {formatDuration(row.squadTimeMs)}
                                        </td>
                                    </tr>
                                ))}
                                {visibleRows.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-6 text-center text-gray-500 italic">No attendance rows match your search.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
};
