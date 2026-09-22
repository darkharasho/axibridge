import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../reportWebhooks', () => ({ postReportToWebhooks: vi.fn() }));
vi.mock('../reportCardRenderer', () => ({ renderReportCard: vi.fn() }));
vi.mock('../reportCardRenderPlan', () => ({ planReportCardVariants: vi.fn() }));
vi.mock('../../shared/reportCardModel', () => ({ buildReportCardModel: vi.fn(() => ({})) }));

import { startReportPost } from '../reportPostRunner';
import { postReportToWebhooks } from '../reportWebhooks';
import { renderReportCard } from '../reportCardRenderer';
import { planReportCardVariants } from '../reportCardRenderPlan';
import type { IReportWebhook } from '../../shared/reportWebhooks';

const hook = { id: 'h1', name: 'EWW', url: 'https://discord.test/x', enabled: true } as IReportWebhook;

const run = (webhooks: IReportWebhook[]) => {
    const stages: string[] = [];
    const promise = startReportPost({
        webhooks,
        meta: {},
        stats: {},
        url: 'https://pages.test/report',
        onStatus: (stage) => { stages.push(stage); },
        persistForumFlag: vi.fn(),
    });
    return { stages, promise };
};

describe('startReportPost', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(planReportCardVariants).mockReturnValue(['graphic']);
        vi.mocked(renderReportCard).mockResolvedValue(Buffer.alloc(8192));
        vi.mocked(postReportToWebhooks).mockResolvedValue([]);
    });

    it('opens the trailing step synchronously', () => {
        // The upload handler returns right after this call, so the renderer must
        // already know a Discord step is pending by the time its promise settles.
        vi.mocked(renderReportCard).mockReturnValue(new Promise(() => {}));
        const { stages } = run([hook]);
        expect(stages[0]).toBe('Posting');
        expect(stages).not.toContain('Complete');
    });

    it('does not settle until the card render and the post have finished', async () => {
        let releaseRender: (v: Buffer) => void = () => {};
        vi.mocked(renderReportCard).mockReturnValue(new Promise((r) => { releaseRender = r; }));
        const { stages, promise } = run([hook]);

        await Promise.resolve();
        expect(stages).not.toContain('Complete');
        expect(postReportToWebhooks).not.toHaveBeenCalled();

        releaseRender(Buffer.alloc(8192));
        await promise;
        expect(postReportToWebhooks).toHaveBeenCalledOnce();
        expect(stages.at(-1)).toBe('Complete');
    });

    it('completes immediately with no webhooks configured, skipping the card', async () => {
        const { stages, promise } = run([]);
        expect(stages).toEqual(['Complete']);
        await promise;
        expect(renderReportCard).not.toHaveBeenCalled();
        expect(postReportToWebhooks).not.toHaveBeenCalled();
    });

    it('warns but still posts text when the card render times out', async () => {
        vi.mocked(renderReportCard).mockRejectedValue(new Error('Card render timed out'));
        const { stages, promise } = run([hook]);
        await promise;
        expect(stages).toContain('Warning');
        expect(postReportToWebhooks).toHaveBeenCalledOnce();
        expect(vi.mocked(postReportToWebhooks).mock.calls[0][0].images?.graphic).toBeFalsy();
        expect(stages.at(-1)).toBe('Complete');
    });

    it('settles rather than rejecting when the post itself throws', async () => {
        vi.mocked(postReportToWebhooks).mockRejectedValue(new Error('429'));
        const { stages, promise } = run([hook]);
        await expect(promise).resolves.toBeUndefined();
        expect(stages).toContain('Warning');
        expect(stages.at(-1)).toBe('Complete');
    });
});
