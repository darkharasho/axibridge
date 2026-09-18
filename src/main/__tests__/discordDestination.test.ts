import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { DiscordNotifier } from '../discord';

const logData = {
    permalink: 'https://dps.report/abcd',
    id: 'log-1',
    filePath: '/tmp/fight.zevtc',
    mode: 'embed' as const,
};

const details = {
    players: [
        { account: 'Alice.1234', name: 'Alice', profession: 'Firebrand', notInSquad: false },
    ],
};

describe('DiscordNotifier destination dispatch', () => {
    beforeEach(() => {
        vi.mocked(axios.post).mockReset();
        vi.mocked(axios.post).mockResolvedValue({ status: 204, data: {} } as never);
    });

    it('posts to the webhook URL for a webhook destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });
        await notifier.sendLog(logData, details);

        const [url, body] = vi.mocked(axios.post).mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/1/x');
        expect((body as any).username).toBe('AxiBridge');
    });

    it('posts to the relay report route with a bearer token for a bridge destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });
        await notifier.sendLog(logData, details);

        const [url, body, config] = vi.mocked(axios.post).mock.calls[0];
        expect(url).toBe('https://bot.example.com/bridge/report');
        expect((config as any).headers.Authorization).toBe('Bearer axb1.x.y');
        // A bot cannot set these; sending them would be rejected by validation.
        expect((body as any).username).toBeUndefined();
        expect((body as any).avatar_url).toBeUndefined();
    });

    it('emits emoji tokens on the bridge path and unicode on the webhook path', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);

        notifier.setDestination({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });
        await notifier.sendLog(logData, details);
        const webhookBody = JSON.stringify(vi.mocked(axios.post).mock.calls[0][1]);

        vi.mocked(axios.post).mockClear();
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });
        await notifier.sendLog(logData, details);
        const bridgeBody = JSON.stringify(vi.mocked(axios.post).mock.calls[0][1]);

        expect(bridgeBody).toContain('{{spec:firebrand}}');
        expect(webhookBody).not.toContain('{{spec:');
    });

    it('classifies a 401 as revoked and does not retry', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 401 } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toMatchObject({ ok: false, reason: 'revoked' });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    });

    it('classifies a 403 as forbidden and surfaces the relay message', async () => {
        vi.mocked(axios.post).mockRejectedValue({
            response: { status: 403, data: { error: "the paired channel no longer exists" } },
        } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toMatchObject({ ok: false, reason: 'forbidden' });
        expect((result as any).message).toContain('paired channel');
    });

    it('retries a 429 once honouring Retry-After', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } } as never)
            .mockResolvedValueOnce({ status: 202, data: { queued: true } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toEqual({ ok: true });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
    });

    it('never falls back to another destination after a bridge failure', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 500 } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        await notifier.sendLog(logData, details);
        for (const call of vi.mocked(axios.post).mock.calls) {
            expect(call[0]).toBe('https://b/bridge/report');
        }
    });
});
