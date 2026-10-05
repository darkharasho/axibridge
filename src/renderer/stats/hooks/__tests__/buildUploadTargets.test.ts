import { describe, expect, it } from 'vitest';
import { buildUploadTargets } from '../useStatsUploads';

const s = (owner: string, repo: string) => ({ owner, repo, addedVia: 'manual' as const, addedAt: '' });
const d = (role: 'admin' | 'publisher' | 'none' | null, extra = {}) => ({ role, ownerType: null, ownerAvatarUrl: null, pagesUrl: 'https://p/', memberCount: null, ...extra });

describe('buildUploadTargets', () => {
    it('puts the default first and labels it', () => {
        const t = buildUploadTargets([s('x', 'y'), s('Guild', 'Site')], 'guild/site', null);
        expect(t.map((x) => [x.fullName, x.isDefault, x.label])).toEqual([['Guild/Site', true, 'Guild/Site (Default)'], ['x/y', false, 'x/y']]);
        expect(t[1].pagesUrl).toBe('https://x.github.io/y');
    });
    it('drops sites with no access once details are known, but never the default', () => {
        const t = buildUploadTargets([s('g', 's'), s('x', 'y'), s('o', 'gone')], 'g/s', { 'g/s': d('none'), 'x/y': d('publisher', { memberCount: 3 }), 'o/gone': d('none') });
        expect(t.map((x) => x.fullName)).toEqual(['g/s', 'x/y']);
        expect(t[1]).toMatchObject({ pagesUrl: 'https://p/', memberCount: 3 });
    });
    it('keeps everything when details are missing or unknown (fail open)', () => {
        expect(buildUploadTargets([s('g', 's'), s('x', 'y')], 'g/s', null)).toHaveLength(2);
        expect(buildUploadTargets([s('g', 's'), s('x', 'y')], 'g/s', { 'x/y': d(null) })).toHaveLength(2);
    });
});
