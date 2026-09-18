import { beforeEach, describe, expect, it, vi } from 'vitest';
import util from 'node:util';

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

// `addTopList` only renders a player row when its metric is > 0 (see
// `discordDestination.test.ts` history: the all-zero `details` fixture above
// never renders any top-list row, so it can't exercise `getClassToken` —
// only `formatClassLines`, which is a separate code path). Ranger is
// deliberate: the webhook path has a Ranger-specific collision hack
// (`professionBase === 'Ranger'` returns the plain circle emoji) that sits
// AFTER the `isBridge` check in source order. Using Ranger here means a
// regression that reordered `isBridge` behind that hack would make this test
// fail on the bridge assertion.
const detailsWithDamage = {
    players: [
        {
            account: 'Bob.5678',
            name: 'Bob',
            profession: 'Ranger',
            notInSquad: false,
            dpsAll: [{ damage: 5000, dps: 500 }],
        },
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

    it('renders a getClassToken bridge token in an actual top-list row, not just the class summary', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);

        const findDamageField = () => {
            const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds;
            const fields = embeds[0].fields as Array<{ name: string; value: string }>;
            const field = fields.find(f => f.name === 'Damage:');
            if (!field) throw new Error('Damage: field not found in embed');
            return field.value as string;
        };

        notifier.setDestination({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });
        await notifier.sendLog(logData, detailsWithDamage);
        const webhookDamageField = findDamageField();

        vi.mocked(axios.post).mockClear();
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });
        await notifier.sendLog(logData, detailsWithDamage);
        const bridgeDamageField = findDamageField();

        // Webhook keeps today's Ranger colour-collision hack (plain circle).
        expect(webhookDamageField).toContain('🟩');
        expect(webhookDamageField).not.toContain('{{spec:');
        // Bridge substitutes the real per-spec token in the same row, not just
        // in the always-rendered class summary.
        expect(bridgeDamageField).toContain('{{spec:ranger}}');
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

    it('retries a 429 once, waiting ~0ms when Retry-After is 0', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } } as never)
            .mockResolvedValueOnce({ status: 202, data: { queued: true } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toEqual({ ok: true });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
        // `Retry-After: 0` means "retry immediately". The 2s constant fallback
        // is only for a missing/unparsable header, so this must be nowhere
        // near it — pins the fix for `Number('0') || 2` swallowing a real 0.
        expect(elapsed).toBeLessThan(500);
    });

    it('retries a 429 once, waiting for the Retry-After duration when non-zero', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '1' } } } as never)
            .mockResolvedValueOnce({ status: 202, data: { queued: true } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toEqual({ ok: true });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
        // Must track the header (~1000ms), not the 2000ms fallback constant.
        expect(elapsed).toBeGreaterThanOrEqual(900);
        expect(elapsed).toBeLessThan(1800);
    });

    it('retries a 429 once, falling back to the 2s default when Retry-After is empty', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '' } } } as never)
            .mockResolvedValueOnce({ status: 202, data: { queued: true } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toEqual({ ok: true });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
        // `Number('')` is `0`, which is finite and >= 0 — an empty header
        // must NOT be read as "retry immediately"; it must fall back to the
        // 2s default like a missing/unparsable header would.
        expect(elapsed).toBeGreaterThanOrEqual(1800);
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

    // Fix round 1, item 4: a 401/403 from the relay is exactly the
    // non-retry branch that reaches `console.error(..., error)` with the raw
    // axios error object. That error's `config.headers.Authorization`
    // carries the bridge key verbatim, and `console.error` serializes
    // objects with `util.inspect` — so the first bridged post to a revoked
    // relay would print the secret to stdout. The global constraint is
    // "keys are persisted as-is client-side but NEVER logged".
    it('never logs the bridge token when a send fails with a classified (401/403) error', async () => {
        const secretToken = 'axb1.aGVsbG8.SECRETSECRETSECRETSECRETSECRETSECRETSECRET';
        vi.mocked(axios.post).mockRejectedValue({
            response: { status: 401, data: {} },
            config: { headers: { Authorization: `Bearer ${secretToken}` } },
            message: 'Request failed with status code 401'
        } as never);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: secretToken });
        await notifier.sendLog(logData, details);

        for (const call of consoleErrorSpy.mock.calls) {
            const serialized = call.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 6 }))).join(' ');
            expect(serialized).not.toContain(secretToken);
        }

        consoleErrorSpy.mockRestore();
    });
});
