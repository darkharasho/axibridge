import { describe, expect, it } from 'vitest';
import { buildDeleteConfirmText, othersPublishedBy, publishedByLogin } from '../publishedBy';

describe('othersPublishedBy', () => {
    it('ignores own (case-insensitive) and legacy entries', () => {
        expect(othersPublishedBy([{ publishedBy: 'Me' }, {}, { publishedBy: null }], 'me')).toEqual({ count: 0, logins: [] });
    });
    it('counts others and lists each login once', () => {
        expect(othersPublishedBy([{ publishedBy: 'kyra' }, { publishedBy: 'kyra' }, { publishedBy: 'zed' }, { publishedBy: 'me' }], 'me'))
            .toEqual({ count: 3, logins: ['kyra', 'zed'] });
    });
    it('treats every attributed entry as someone else when the viewer is unknown', () => {
        expect(othersPublishedBy([{ publishedBy: 'me' }], null)).toEqual({ count: 1, logins: ['me'] });
    });
});

describe('buildDeleteConfirmText', () => {
    it('returns the base text when nothing belongs to others', () => {
        expect(buildDeleteConfirmText('Delete 1 report?', [{ publishedBy: 'me' }], 'me')).toBe('Delete 1 report?');
    });
    it('appends who else published', () => {
        expect(buildDeleteConfirmText('Delete 3 reports?', [{ publishedBy: 'kyra' }, { publishedBy: 'kyra' }, {}], 'me'))
            .toBe('Delete 3 reports?\n\n2 of these were published by kyra. Delete anyway?');
        expect(buildDeleteConfirmText('Delete "X"?', [{ publishedBy: 'kyra' }], 'me'))
            .toBe('Delete "X"?\n\nThis was published by kyra. Delete anyway?');
    });
});

describe('publishedByLogin', () => {
    it('returns a trimmed login only for non-empty strings', () => {
        expect(publishedByLogin({ publishedBy: ' kyra ' })).toBe('kyra');
        expect(publishedByLogin({ publishedBy: '  ' })).toBeNull();
        expect(publishedByLogin({ publishedBy: null })).toBeNull();
        expect(publishedByLogin({ publishedBy: { login: 'x' } as any })).toBeNull();
        expect(publishedByLogin({ publishedBy: 42 as any })).toBeNull();
        expect(publishedByLogin(undefined)).toBeNull();
    });
});
