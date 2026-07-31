import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REPORT_TITLE_TEMPLATE,
    makeDefaultReportWebhook,
    renderReportTitle,
    selectReportWebhooks,
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

describe('renderReportTitle', () => {
    it('renders every placeholder', () => {
        const out = renderReportTitle('{date} | {day_of_week} | {commander} | {commanders}', ctx);
        expect(out).toBe(`${expectedDate} | ${expectedDay} | Axi Vale | Axi Vale, Red Tag`);
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
        });
    });
});
