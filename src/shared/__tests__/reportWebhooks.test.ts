import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REPORT_TITLE_TEMPLATE,
    makeDefaultReportWebhook,
    renderReportTitle,
} from '../reportWebhooks';

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
