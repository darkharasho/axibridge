import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

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
};

const MAX_LEDGER_ROWS_BEFORE_SCROLL = 10;

const formatDuration = (timeMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(Number(timeMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
};

const formatCsvDurationSeconds = (timeMs: number) => {
    const seconds = Math.max(0, Math.floor(Number(timeMs || 0) / 1000));
    return String(seconds);
};

const escapeCsvCell = (value: string) => {
    const normalized = value.replace(/\r?\n/g, ' ').trim();
    if (!/[",\n]/.test(normalized)) return normalized;
    return `"${normalized.replace(/"/g, '""')}"`;
};

export const AttendanceSection = ({
    attendanceRows,
    getProfessionIconPath
}: AttendanceSectionProps) => {
    useStatsSharedContext();
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
    const shouldScrollLedger = visibleRows.length > MAX_LEDGER_ROWS_BEFORE_SCROLL;

    const exportVisibleRowsAsCsv = () => {
        const header = [
            'Account',
            'Characters',
            'Classes Played',
            'Total Fight Time (seconds)',
            'Total Squad Time (seconds)'
        ];
        const rows = visibleRows.map((row) => {
            const classesPlayed = (row.classTimes || [])
                .map((entry) => `${entry.profession} (${formatDuration(entry.timeMs)})`)
                .join('; ');
            return [
                row.account || '',
                (row.characterNames || []).join(', '),
                classesPlayed,
                formatCsvDurationSeconds(Number(row.combatTimeMs ?? row.squadTimeMs ?? 0)),
                formatCsvDurationSeconds(row.squadTimeMs)
            ];
        });
        const csv = [header, ...rows]
            .map((line) => line.map((cell) => escapeCsvCell(String(cell ?? ''))).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        link.href = url;
        link.download = `attendance-ledger-${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-3.5">
                <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Attendance Ledger</h3>
            </div>
            <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] uppercase tracking-widest" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card-inner)', color: 'var(--text-secondary)' }}>
                            {attendanceRows.length} Joined
                        </span>
                    </div>
                    <div className="flex w-full sm:w-auto items-center gap-2">
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search account, character, or class..."
                            className="w-full sm:w-[320px] rounded-[var(--radius-md)] px-3 py-2 text-xs focus:outline-none"
                            style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                        />
                        <button
                            type="button"
                            onClick={exportVisibleRowsAsCsv}
                            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs transition-colors whitespace-nowrap"
                            style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export CSV
                        </button>
                    </div>
                </div>
                {attendanceRows.length === 0 ? (
                    <div className="text-center italic py-6" style={{ color: 'var(--text-muted)' }}>No attendance data available.</div>
                ) : (
                    <div className={`rounded-[var(--radius-md)] overflow-hidden ${shouldScrollLedger ? 'max-h-[30rem] overflow-y-auto' : ''}`} style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}>
                        <table className="w-full text-xs table-auto min-w-full border-separate border-spacing-0">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] border-b border-[color:var(--border-default)]">
                                    <th className="text-left py-2 px-4 sticky top-0 z-20 bg-[color:var(--bg-elevated)]">Account</th>
                                    <th className="text-left py-2 px-4 sticky top-0 z-20 bg-[color:var(--bg-elevated)]">Character(s)</th>
                                    <th className="text-left py-2 px-4 sticky top-0 z-20 bg-[color:var(--bg-elevated)]">Classes Played</th>
                                    <th className="text-right py-2 px-4 sticky top-0 z-20 bg-[color:var(--bg-elevated)] whitespace-nowrap">
                                        <button
                                            type="button"
                                            onClick={() => updateSort('fight')}
                                            className="transition-colors whitespace-nowrap"
                                            style={{ color: sortKey === 'fight' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                        >
                                            Total Fight Time{sortKey === 'fight' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                    </th>
                                    <th className="text-right py-2 px-4 sticky top-0 z-20 bg-[color:var(--bg-elevated)] whitespace-nowrap">
                                        <button
                                            type="button"
                                            onClick={() => updateSort('squad')}
                                            className="transition-colors whitespace-nowrap"
                                            style={{ color: sortKey === 'squad' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                        >
                                            Total Squad Time{sortKey === 'squad' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => (
                                    <tr key={row.account} className="align-top border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                        <td className="py-2 px-4 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{row.account}</td>
                                        <td className="py-2 px-4" style={{ color: 'var(--text-secondary)' }}>
                                            {row.characterNames.length > 0 ? row.characterNames.join(', ') : '-'}
                                        </td>
                                        <td className="py-2 px-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {row.classTimes.length > 0 ? row.classTimes.map((entry) => (
                                                    <span
                                                        key={`${row.account}-${entry.profession}`}
                                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]"
                                                        style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-card-inner)', color: 'var(--text-primary)' }}
                                                    >
                                                        {getProfessionIconPath(entry.profession) ? (
                                                            <img
                                                                src={getProfessionIconPath(entry.profession) as string}
                                                                alt={entry.profession}
                                                                className="w-3.5 h-3.5 object-contain"
                                                            />
                                                        ) : null}
                                                        <span>{entry.profession}</span>
                                                        <span style={{ color: 'var(--text-secondary)' }}>{formatDuration(entry.timeMs)}</span>
                                                    </span>
                                                )) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 text-right font-mono whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                            {formatDuration(Number(row.combatTimeMs ?? row.squadTimeMs ?? 0))}
                                        </td>
                                        <td className="py-2 px-4 text-right font-mono whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                            {formatDuration(row.squadTimeMs)}
                                        </td>
                                    </tr>
                                ))}
                                {visibleRows.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-6 text-center italic" style={{ color: 'var(--text-muted)' }}>No attendance rows match your search.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
