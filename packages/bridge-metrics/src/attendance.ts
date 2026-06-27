//
// First-class per-raid attendance artifact (reports/attendance.json), published
// alongside the rollup. Mirrors rollup.ts's builder/parser pattern. Pure — no
// Electron/fs — so it stays unit-testable; the caller supplies generatedAt.
import type { RollupReportPayload } from './rollup';

export interface AttendanceAttendee {
    account: string;
    combatTimeMs: number;
    squadTimeMs: number;
}
export interface AttendanceRaid {
    id: string;
    /** Raid start (meta.dateStart). */
    date: string;
    attendees: AttendanceAttendee[];
}
export interface AttendanceFile {
    version: number;
    generatedAt: string;
    raids: AttendanceRaid[];
}

export const ATTENDANCE_VERSION = 1;

/** Project one report payload to a single raid's attendance, or null when it
 *  has no id or no attendees. */
export const buildAttendanceRaid = (payload: RollupReportPayload): AttendanceRaid | null => {
    const id = String(payload?.meta?.id || '').trim();
    if (!id) return null;
    const date = String(payload?.meta?.dateStart || '').trim();
    const rows = Array.isArray(payload?.stats?.attendanceData) ? payload.stats!.attendanceData! : [];
    const attendees: AttendanceAttendee[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        const account = String(r?.account || '').trim();
        if (!account || seen.has(account)) continue;
        seen.add(account);
        attendees.push({
            account,
            combatTimeMs: Number(r?.combatTimeMs || 0),
            squadTimeMs: Number(r?.squadTimeMs || 0)
        });
    }
    if (attendees.length === 0) return null;
    return { id, date, attendees };
};

/** Merge the just-published raid into the existing history, prune to valid
 *  (non-deleted) ids, and sort most-recent-first. */
export const updateAttendanceForPublish = (options: {
    existingRaids: AttendanceRaid[];
    currentReport: RollupReportPayload;
    validIds: string[];
    generatedAt: string;
}): AttendanceFile => {
    const { existingRaids, currentReport, validIds, generatedAt } = options;
    const byId = new Map<string, AttendanceRaid>();
    for (const raid of existingRaids) {
        const id = String(raid?.id || '').trim();
        if (id) byId.set(id, raid);
    }
    const current = buildAttendanceRaid(currentReport);
    if (current) byId.set(current.id, current);
    const validIdSet = new Set(validIds.map((id) => String(id || '').trim()).filter(Boolean));
    const raids = Array.from(byId.entries())
        .filter(([id]) => validIdSet.has(id))
        .map(([, raid]) => raid)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return { version: ATTENDANCE_VERSION, generatedAt, raids };
};

/** Parse a fetched/stored attendance.json defensively. */
export const parseAttendanceFile = (data: unknown): AttendanceFile | null => {
    const c = data as AttendanceFile | null;
    if (!c || typeof c !== 'object') return null;
    if (c.version !== ATTENDANCE_VERSION) return null;
    if (!Array.isArray(c.raids)) return null;
    return c;
};
