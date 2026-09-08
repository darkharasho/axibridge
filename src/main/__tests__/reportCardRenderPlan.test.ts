import { describe, expect, it } from 'vitest';
import { planReportCardVariants } from '../reportCardRenderPlan';
import { makeDefaultReportWebhook } from '../../shared/reportWebhooks';

const h = (id: string, style?: any) => ({ ...makeDefaultReportWebhook(id), style });

describe('planReportCardVariants', () => {
    it('returns nothing when every hook is text', () => {
        expect(planReportCardVariants([h('a', 'text'), h('b')])).toEqual([]);
    });

    it('returns one entry per distinct style, not per webhook', () => {
        expect(planReportCardVariants([h('a', 'hybrid'), h('b', 'hybrid'), h('c', 'hybrid')])).toEqual(['hybrid']);
    });

    it('returns both variants when both are in use, in stable order', () => {
        expect(planReportCardVariants([h('a', 'graphic'), h('b', 'hybrid')])).toEqual(['hybrid', 'graphic']);
    });

    it('ignores unrecognized styles', () => {
        expect(planReportCardVariants([h('a', 'IMAGE'), h('b', 7 as any)])).toEqual([]);
    });

    it('handles an empty list', () => {
        expect(planReportCardVariants([])).toEqual([]);
    });
});
