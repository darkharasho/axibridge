import { describe, expect, it, vi } from 'vitest';
import { buildReportSummaryLine, postReportToWebhooks } from '../reportWebhooks';
import { makeDefaultReportWebhook } from '../../shared/reportWebhooks';

const hook = (over: Partial<ReturnType<typeof makeDefaultReportWebhook>> = {}) => ({
    ...makeDefaultReportWebhook('h1'),
    name: 'Guild',
    url: 'https://discord.com/api/webhooks/1/abc',
    titleTemplate: '{commander}',
    ...over,
});

const meta = {
    dateStart: new Date(2026, 6, 30, 20, 0, 0).toISOString(),
    dateLabel: '7/30/2026, 8:00 PM - 7/30/2026, 9:31 PM',
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale'],
};

const stats = { total: 19, wins: 16, losses: 3, squadKDR: '5.56' };

const okResponse = { ok: true, status: 204, text: async () => '' } as Response;
const errorResponse = (status: number, body: string) =>
    ({ ok: false, status, text: async () => body }) as Response;

describe('buildReportSummaryLine', () => {
    it('joins fights, record, and KDR', () => {
        expect(buildReportSummaryLine(stats)).toBe('19 fights • 16W – 3L • Squad KDR 5.56');
    });

    it('omits missing pieces gracefully', () => {
        expect(buildReportSummaryLine({ total: 1 })).toBe('1 fight');
        expect(buildReportSummaryLine({})).toBe('');
    });
});

describe('postReportToWebhooks', () => {
    it('posts a plain embed for a regular channel', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const results = await postReportToWebhooks({
            webhooks: [hook()], meta, stats, url: 'https://example.com/r/1', fetchImpl,
        });
        expect(results).toEqual([{ id: 'h1', name: 'Guild', ok: true }]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.thread_name).toBeUndefined();
        expect(body.username).toBe('AxiBridge');
        expect(body.embeds[0].title).toBe('Axi Vale');
        expect(body.embeds[0].url).toBe('https://example.com/r/1');
        expect(body.embeds[0].description).toBe('19 fights • 16W – 3L • Squad KDR 5.56');
        expect(body.embeds[0].footer.text).toBe(meta.dateLabel);
    });

    it('sends thread_name truncated to 100 chars for forum webhooks', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const longTemplate = 'X'.repeat(120);
        await postReportToWebhooks({
            webhooks: [hook({ isForum: true, titleTemplate: longTemplate })],
            meta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.thread_name).toBe('X'.repeat(100));
    });

    it('self-heals a forum channel mislabeled as regular', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"message": "Webhooks posted to forum channels must have a thread_name or thread_id"}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: false })], meta, stats, url: 'u', fetchImpl, persistForumFlag,
        });
        expect(results[0].ok).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const callArgs = fetchImpl.mock.calls[1] as any[];
        const retryBody = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBe('Axi Vale');
        expect(persistForumFlag).toHaveBeenCalledWith('h1', true);
    });

    it('self-heals a regular channel mislabeled as forum', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"thread_name": ["Thread name is not allowed in this channel"]}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: true })], meta, stats, url: 'u', fetchImpl, persistForumFlag,
        });
        expect(results[0].ok).toBe(true);
        const callArgs = fetchImpl.mock.calls[1] as any[];
        const retryBody = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBeUndefined();
        expect(persistForumFlag).toHaveBeenCalledWith('h1', false);
    });

    it('isolates failures per webhook and never throws', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(500, 'boom'))
            .mockResolvedValueOnce(okResponse);
        const onStatus = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook(), { ...hook(), id: 'h2', name: 'Second' }],
            meta, stats, url: 'u', fetchImpl, onStatus,
        });
        expect(results[0]).toMatchObject({ id: 'h1', ok: false });
        expect(results[0].error).toContain('500');
        expect(results[1]).toEqual({ id: 'h2', name: 'Second', ok: true });
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Failed'), true);
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Second'));
    });

    it('isolates a non-string titleTemplate without throwing and still posts the next webhook', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const onStatus = vi.fn();
        const badHook = hook({ id: 'bad', name: 'Bad', titleTemplate: 42 as unknown as string });
        const goodHook = hook({ id: 'h2', name: 'Second' });
        const results = await postReportToWebhooks({
            webhooks: [badHook, goodHook], meta, stats, url: 'u', fetchImpl, onStatus,
        });
        expect(results[0]).toMatchObject({ id: 'bad', name: 'Bad', ok: false });
        expect(results[0].error).toBeTruthy();
        expect(results[1]).toEqual({ id: 'h2', name: 'Second', ok: true });
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Bad'), true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const callArgs = fetchImpl.mock.calls[0] as any[];
        expect(callArgs[0]).toBe(goodHook.url);
    });

    it('survives a rejecting fetch', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const results = await postReportToWebhooks({
            webhooks: [hook()], meta, stats, url: 'u', fetchImpl,
        });
        expect(results[0]).toMatchObject({ id: 'h1', ok: false, error: 'offline' });
    });

    it('renders account and guild tokens from meta', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const richMeta = {
            ...meta,
            primaryCommanderAccount: 'Axi.1234',
            guild: { id: 'G1', name: 'Axius Imperium', tag: 'AXI' },
        };
        await postReportToWebhooks({
            webhooks: [hook({ titleTemplate: '[{guild_tag}] {guild} — {account}' })],
            meta: richMeta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.embeds[0].title).toBe('[AXI] Axius Imperium — Axi.1234');
    });

    it('renders Unknown guild tokens when resolution failed (null name/tag)', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const failedMeta = { ...meta, guild: { id: 'G1', name: null, tag: null } };
        await postReportToWebhooks({
            webhooks: [hook({ titleTemplate: '{guild}/{guild_tag}' })],
            meta: failedMeta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.embeds[0].title).toBe('Unknown/Unknown');
    });

    it('renders Unknown for account and guild when meta lacks them entirely', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ titleTemplate: '{account} {guild} {guild_tag}' })],
            meta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.embeds[0].title).toBe('Unknown Unknown Unknown');
    });

    const TAG_A = '111111111111111111';
    const TAG_B = '222222222222222222';

    it('sends applied_tags for a forum hook with tag ids', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: `${TAG_A}, ${TAG_B}` })],
            meta, stats, url: 'u', fetchImpl,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const body = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(body.thread_name).toBe('Axi Vale');
        expect(body.applied_tags).toEqual([TAG_A, TAG_B]);
    });

    it('never sends applied_tags for a non-forum hook even when the field is set', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ isForum: false, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl,
        });
        const body = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(body.thread_name).toBeUndefined();
        expect(body.applied_tags).toBeUndefined();
    });

    it('omits the applied_tags key for legacy hooks and garbage-only text', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const legacy = hook({ isForum: true });
        delete (legacy as any).forumTagIds;
        await postReportToWebhooks({
            webhooks: [legacy, { ...hook({ isForum: true, forumTagIds: 'raid night 123' }), id: 'h2' }],
            meta, stats, url: 'u', fetchImpl,
        });
        const first = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        const second = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect('applied_tags' in first).toBe(false);
        expect('applied_tags' in second).toBe(false);
    });

    it('dedupes and caps applied_tags at 5', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const six = ['111111111111111111', '222222222222222222', '333333333333333333',
            '444444444444444444', '555555555555555555', '666666666666666666'];
        const withDupe = [six[0], six[1], six[0], ...six.slice(2)].join(', ');
        await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: withDupe })],
            meta, stats, url: 'u', fetchImpl,
        });
        const body = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(body.applied_tags).toEqual(six.slice(0, 5));
    });

    it('retries without tags when Discord rejects applied_tags', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"applied_tags": ["Unknown tag"]}'))
            .mockResolvedValueOnce(okResponse);
        const onStatus = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl, onStatus,
        });
        expect(results[0]).toEqual({ id: 'h1', name: 'Guild', ok: true });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const retryBody = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBe('Axi Vale');
        expect(retryBody.applied_tags).toBeUndefined();
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('without tags'), true);
    });

    it('flip-to-forum self-heal carries tags, then drops them on a tag 400', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"message": "Webhooks posted to forum channels must have a thread_name or thread_id"}'))
            .mockResolvedValueOnce(errorResponse(400, '{"applied_tags": ["Unknown tag"]}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const onStatus = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: false, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl, persistForumFlag, onStatus,
        });
        expect(results[0].ok).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        const first = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(first.thread_name).toBeUndefined();
        expect(first.applied_tags).toBeUndefined();
        const flipped = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect(flipped.thread_name).toBe('Axi Vale');
        expect(flipped.applied_tags).toEqual([TAG_A]);
        const third = JSON.parse(((fetchImpl.mock.calls[2] as any[])[1] as RequestInit).body as string);
        expect(third.thread_name).toBe('Axi Vale');
        expect(third.applied_tags).toBeUndefined();
        expect(persistForumFlag).toHaveBeenCalledWith('h1', true);
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('without tags'), true);
    });

    it('flip-to-regular drops thread_name and tags together', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"thread_name": ["Thread name is not allowed in this channel"]}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl, persistForumFlag,
        });
        expect(results[0].ok).toBe(true);
        const retryBody = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBeUndefined();
        expect(retryBody.applied_tags).toBeUndefined();
        expect(persistForumFlag).toHaveBeenCalledWith('h1', false);
    });
});
