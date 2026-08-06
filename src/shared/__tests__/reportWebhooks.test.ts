import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REPORT_TITLE_TEMPLATE,
    makeDefaultReportWebhook,
    renderReportTitle,
    selectReportWebhooks,
    MAX_FORUM_POST_TAGS,
    parseForumTagIds,
} from '../reportWebhooks';
import type { IReportWebhook } from '../reportWebhooks';

// 2026-07-30 is a Thursday. {date} renders as fixed zero-padded MM/DD/YY; the
// weekday is still locale-formatted with the same Intl call the renderer uses.
const sessionStart = new Date(2026, 6, 30, 20, 15, 0);
const expectedDate = '07/30/26';
const expectedDay = sessionStart.toLocaleDateString(undefined, { weekday: 'long' });

const ctx = {
    sessionStart,
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale', 'Red Tag'],
};

const fullCtx = {
    ...ctx,
    primaryCommanderAccount: 'Axi.1234',
    guildName: 'Axius Imperium',
    guildTag: 'AXI',
};

describe('renderReportTitle', () => {
    it('renders every placeholder', () => {
        const out = renderReportTitle(
            '{date} | {day_of_week} | {commander} | {commanders} | {account} | {guild} | {guild_tag}',
            fullCtx
        );
        expect(out).toBe(
            `${expectedDate} | ${expectedDay} | Axi Vale | Axi Vale, Red Tag | Axi.1234 | Axius Imperium | AXI`
        );
    });

    it('renders the default template', () => {
        const out = renderReportTitle(DEFAULT_REPORT_TITLE_TEMPLATE, ctx);
        expect(out).toBe(`${expectedDate} - ${expectedDay} - Axi Vale`);
    });

    it('leaves unknown tokens literal', () => {
        expect(renderReportTitle('{nope} {commander}', ctx)).toBe('{nope} Axi Vale');
    });

    it('falls back to the default template when blank', () => {
        expect(renderReportTitle('   ', ctx)).toBe(`${expectedDate} - ${expectedDay} - Axi Vale`);
        expect(renderReportTitle('', ctx)).toBe(`${expectedDate} - ${expectedDay} - Axi Vale`);
    });

    it('falls back to Unknown when no commanders were seen', () => {
        const empty = { sessionStart, primaryCommander: '', commanders: [] as string[] };
        expect(renderReportTitle('{commander} / {commanders}', empty)).toBe('Unknown / Unknown');
    });

    it('composes a bracketed guild tag', () => {
        expect(renderReportTitle('[{guild_tag}] {guild} — {account}', fullCtx))
            .toBe('[AXI] Axius Imperium — Axi.1234');
    });

    it('falls back to Unknown when account and guild are missing or empty', () => {
        expect(renderReportTitle('{account} / {guild} / {guild_tag}', ctx))
            .toBe('Unknown / Unknown / Unknown');
        const emptyStrings = { ...ctx, primaryCommanderAccount: '', guildName: '', guildTag: '' };
        expect(renderReportTitle('{account} / {guild} / {guild_tag}', emptyStrings))
            .toBe('Unknown / Unknown / Unknown');
    });
});

describe('selectReportWebhooks', () => {
    const hook = (over: Partial<IReportWebhook>): IReportWebhook => ({
        id: 'x', name: '', url: 'https://d/1', enabled: true, isForum: false,
        titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE, ...over,
    });
    const a = hook({ id: 'a' });
    const b = hook({ id: 'b' });
    const disabled = hook({ id: 'c', enabled: false });
    const noUrl = hook({ id: 'd', url: '' });
    const all = [a, b, disabled, noUrl];

    it('returns all enabled hooks with a url when selection is absent (back-compat)', () => {
        expect(selectReportWebhooks(all, undefined)).toEqual([a, b]);
        expect(selectReportWebhooks(all, null)).toEqual([a, b]);
    });

    it('returns only selected enabled hooks', () => {
        expect(selectReportWebhooks(all, ['a'])).toEqual([a]);
        expect(selectReportWebhooks(all, ['a', 'b'])).toEqual([a, b]);
    });

    it('returns nothing when selection is empty (report-only)', () => {
        expect(selectReportWebhooks(all, [])).toEqual([]);
    });

    it('never includes disabled or url-less hooks even when explicitly selected', () => {
        expect(selectReportWebhooks(all, ['c', 'd'])).toEqual([]);
    });
});

describe('makeDefaultReportWebhook', () => {
    it('creates an enabled non-forum entry with the default template', () => {
        expect(makeDefaultReportWebhook('123')).toEqual({
            id: '123',
            name: '',
            url: '',
            enabled: true,
            isForum: false,
            titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE,
            forumTagIds: '',
        });
    });
});

describe('parseForumTagIds', () => {
    it('parses comma, space, and newline separated ids', () => {
        expect(parseForumTagIds('111111111111111111, 222222222222222222'))
            .toEqual(['111111111111111111', '222222222222222222']);
        expect(parseForumTagIds('111111111111111111 222222222222222222\n333333333333333333'))
            .toEqual(['111111111111111111', '222222222222222222', '333333333333333333']);
    });

    it('extracts ids embedded in prose', () => {
        expect(parseForumTagIds('WvW (111111111111111111) and PvE: 222222222222222222!'))
            .toEqual(['111111111111111111', '222222222222222222']);
    });

    it('ignores short and over-long digit runs and empty input', () => {
        expect(parseForumTagIds('tag 5, id 12345678901234')).toEqual([]); // 14 digits: too short
        expect(parseForumTagIds('123456789012345678901234567890')).toEqual([]); // 30 digits: not split into bogus ids
        expect(parseForumTagIds('')).toEqual([]);
        expect(parseForumTagIds('   ')).toEqual([]);
        expect(parseForumTagIds(undefined)).toEqual([]);
    });

    it('accepts 15- and 21-digit boundaries', () => {
        expect(parseForumTagIds('123456789012345')).toEqual(['123456789012345']); // 15
        expect(parseForumTagIds('123456789012345678901')).toEqual(['123456789012345678901']); // 21
    });

    it('dedupes preserving order and does not cap', () => {
        const six = ['111111111111111111', '222222222222222222', '333333333333333333',
            '444444444444444444', '555555555555555555', '666666666666666666'];
        expect(parseForumTagIds([six[0], six[1], six[0], ...six.slice(2)].join(',')))
            .toEqual(six);
        expect(MAX_FORUM_POST_TAGS).toBe(5);
    });
});
