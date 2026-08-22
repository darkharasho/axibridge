import { describe, it, expect } from 'vitest';
import { deriveStatsViewLogs } from '../../StatsView';

describe('StatsView raw-log derivations respect the slice', () => {
    const logs = [{ filePath: 'a' }, { filePath: 'b' }, { filePath: 'c' }];

    it('excludes unchecked fights in the live session', () => {
        expect(deriveStatsViewLogs(logs, new Set(['b']), false).map((l) => l.filePath))
            .toEqual(['a', 'c']);
    });

    it('ignores the slice when embedded', () => {
        expect(deriveStatsViewLogs(logs, new Set(['b']), true)).toBe(logs);
    });

    it('is identity when nothing is excluded', () => {
        expect(deriveStatsViewLogs(logs, new Set(), false)).toBe(logs);
    });
});
