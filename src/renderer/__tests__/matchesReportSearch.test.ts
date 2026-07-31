import { describe, expect, it } from 'vitest';
import { matchesReportSearch } from '../FightReportHistoryView';
import type { ReportIndexEntry } from '../../shared/reportTypes';

const entry = (over: Partial<ReportIndexEntry> = {}): ReportIndexEntry => ({
    id: 'r1',
    title: 'Axi Vale',
    commanders: ['Axi Vale'],
    dateStart: '2026-07-31T02:00:00.000Z',
    dateEnd: '2026-07-31T04:00:00.000Z',
    dateLabel: '7/30/2026, 8:00 PM - 7/30/2026, 10:00 PM',
    url: './?report=r1',
    ...over,
});

describe('matchesReportSearch', () => {
    it('matches guild tag and guild name case-insensitively', () => {
        const withGuild = entry({ guild: { id: 'g-1', name: 'Elite Warriors', tag: 'EWW' } });
        expect(matchesReportSearch(withGuild, 'eww')).toBe(true);
        expect(matchesReportSearch(withGuild, 'elite warriors')).toBe(true);
    });

    it('does not match guild terms on entries without guild data', () => {
        expect(matchesReportSearch(entry(), 'eww')).toBe(false);
        expect(matchesReportSearch(entry({ guild: null }), 'eww')).toBe(false);
    });

    it('still matches title, commanders, and date label', () => {
        expect(matchesReportSearch(entry(), 'axi vale')).toBe(true);
        expect(matchesReportSearch(entry(), '8:00 pm')).toBe(true);
    });
});
