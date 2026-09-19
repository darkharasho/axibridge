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

const mockedPost = vi.mocked(axios.post);

const webhookDest = { id: 'w1', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/1/x' };
const secondWebhookDest = { id: 'w2', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/2/y' };

const fanoutLogData = { permalink: 'https://dps.report/abc', id: 'log-1', filePath: '/tmp/a.zevtc' };

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
        notifier.setDestinations([{ id: 'w4', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' }]);
        await notifier.sendLog(logData, details);

        const [url, body] = vi.mocked(axios.post).mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/1/x');
        expect((body as any).username).toBe('AxiBridge');
    });

    it('posts to the relay report route with a bearer token for a bridge destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([{
            id: 'b15', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);
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

        notifier.setDestinations([{ id: 'w3', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' }]);
        await notifier.sendLog(logData, details);
        const webhookBody = JSON.stringify(vi.mocked(axios.post).mock.calls[0][1]);

        vi.mocked(axios.post).mockClear();
        notifier.setDestinations([{
            id: 'b14', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);
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

        notifier.setDestinations([{ id: 'w2', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' }]);
        await notifier.sendLog(logData, detailsWithDamage);
        const webhookDamageField = findDamageField();

        vi.mocked(axios.post).mockClear();
        notifier.setDestinations([{
            id: 'b13', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);
        await notifier.sendLog(logData, detailsWithDamage);
        const bridgeDamageField = findDamageField();

        // Webhook keeps today's Ranger colour-collision hack (plain circle).
        expect(webhookDamageField).toContain('🟩');
        expect(webhookDamageField).not.toContain('{{spec:');
        // Bridge substitutes the real per-spec token in the same row, not just
        // in the always-rendered class summary.
        expect(bridgeDamageField).toContain('{{spec:ranger}}');
    });

    // C2 fix: the bridge `classCell` is `"{{spec:ranger}} "` -- 17 source
    // chars -- but renders as a single emoji glyph. Measuring it at source
    // length starved `availableNameWidth` to 0 and silently dropped the
    // player name from every bridged top-list row. Assert the name substring
    // survives, not merely that the row is non-empty.
    it('keeps the player name in a bridged top-list row despite the wide emoji token', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);
        notifier.setDestinations([{
            id: 'b12', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);

        await notifier.sendLog(logData, detailsWithDamage);

        const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds;
        const fields = embeds[0].fields as Array<{ name: string; value: string }>;
        const field = fields.find(f => f.name === 'Damage:');
        if (!field) throw new Error('Damage: field not found in embed');

        expect(field.value).toContain('Bob');
    });

    // Ruling K / option D2. A custom application emoji renders as literal
    // `<:name:id>` text inside a code fence, so the bridge path cannot ship a
    // fenced row and a rendered icon at the same time. Bridged rows are split
    // into per-segment inline code spans with the token BETWEEN them. Assert
    // the shape, not merely the absence of a fence: a row that lost its spans
    // would still pass a bare `not.toContain('```')`.
    it('renders bridged top-list rows as per-segment code spans with the token outside them', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);
        notifier.setDestinations([{
            id: 'b11', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);

        await notifier.sendLog(logData, detailsWithDamage);

        const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds;
        const fields = embeds[0].fields as Array<{ name: string; value: string }>;
        const field = fields.find(f => f.name === 'Damage:');
        if (!field) throw new Error('Damage: field not found in embed');

        expect(field.value).not.toContain('```');
        // `RR` {{spec:ranger}} `Name - Value` -- the token sits between the spans,
        // never inside one, which is the whole point of the layout.
        expect(field.value).toMatch(/^` 1` \{\{spec:ranger\}\} `Bob\s+-\s+[\d,]+`$/m);
    });

    // The webhook path keeps the fence: unicode emoji render inside one, and the
    // padded columns are meaningless without a monospace font. D2 must not leak
    // across destinations.
    it('keeps webhook top-list rows fenced', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);
        notifier.setDestinations([{ id: 'w1', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' }]);

        await notifier.sendLog(logData, detailsWithDamage);

        const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds;
        const fields = embeds[0].fields as Array<{ name: string; value: string }>;
        const field = fields.find(f => f.name === 'Damage:');
        if (!field) throw new Error('Damage: field not found in embed');

        expect(field.value.startsWith('```')).toBe(true);
        // No span layout leaked in: a D2 row would open with a backtick-wrapped rank.
        expect(field.value).not.toMatch(/^` *\d+` /m);
    });

    it('renders the bridged class summary unfenced with the count in its own span', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);
        notifier.setDestinations([{
            id: 'b10', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);

        await notifier.sendLog(logData, details);

        const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds;
        const fields = embeds[0].fields as Array<{ name: string; value: string }>;
        const field = fields.find(f => f.name === 'Squad Classes:');
        if (!field) throw new Error('Squad Classes: field not found in embed');

        expect(field.value).not.toContain('```');
        expect(field.value).toBe('{{spec:firebrand}} `1`');
    });

    // The overflow row used to recover its count by string-parsing the rendered
    // label: `Number(entry.split(':')[1])`. That reads `4` out of the webhook
    // label `FRB: 4`, but out of the bridge label `{{spec:firebrand}} 4` it reads
    // `firebrand}} 4` -- NaN -- and `NaN <= 0` is false, so the guard let it
    // through and the field rendered a literal `+ NaN`. Needs >14 distinct enemy
    // professions to reach the overflow branch at all.
    it('sums a bridged class-summary overflow row instead of rendering + NaN', async () => {
        const professions = [
            'Firebrand', 'Scourge', 'Spellbreaker', 'Herald', 'Tempest',
            'Chronomancer', 'Druid', 'Vindicator', 'Reaper', 'Weaver',
            'Berserker', 'Dragonhunter', 'Mirage', 'Harbinger', 'Willbender',
            'Catalyst',
        ];
        const detailsWithManyEnemies = {
            players: [
                { account: 'Alice.1234', name: 'Alice', profession: 'Firebrand', notInSquad: false },
                ...professions.map((profession, i) => ({
                    account: `Enemy${i}.0001`,
                    name: `Enemy${i}`,
                    profession,
                    notInSquad: true,
                })),
            ],
        };

        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);
        notifier.setDestinations([{
            id: 'b9', kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        }]);

        await notifier.sendLog(logData, detailsWithManyEnemies);

        const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds;
        const fields = embeds[0].fields as Array<{ name: string; value: string }>;
        const field = fields.find(f => f.name === 'Enemy Classes:');
        if (!field) throw new Error('Enemy Classes: field not found in embed');

        expect(field.value).not.toContain('NaN');
        // 16 professions, 14 shown, so the overflow row carries the last 2.
        expect(field.value).toContain('`+ 2`');
    });

    it('classifies a 401 as revoked and does not retry', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 401 } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestinations([{ id: 'b8', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

        const result = await notifier.sendLog(logData, details);
        expect(result[0]).toMatchObject({ ok: false, reason: 'revoked' });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    });

    // Minor 16: a 400 is a deterministic validation rejection (e.g. an empty
    // report) -- retrying it cannot change the outcome. It must NOT go
    // through the rate-limited/network retry branch, which slept 2s and
    // retried once before this fix, costing every rejected report two
    // round-trips for a failure that was already final on the first one.
    it('classifies a 400 as rejected and does not retry', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 400, data: { error: 'report is empty' } } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestinations([{ id: 'b7', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result[0]).toMatchObject({ ok: false, reason: 'rejected' });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        expect(elapsed).toBeLessThan(500);
    });

    it('classifies a 403 as forbidden and surfaces the relay message', async () => {
        vi.mocked(axios.post).mockRejectedValue({
            response: { status: 403, data: { error: "the paired channel no longer exists" } },
        } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestinations([{ id: 'b6', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

        const result = await notifier.sendLog(logData, details);
        expect(result[0]).toMatchObject({ ok: false, reason: 'forbidden' });
        expect((result[0] as any).message).toContain('paired channel');
    });

    it('retries a 429 once, waiting ~0ms when Retry-After is 0', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '0' } } } as never)
            .mockResolvedValueOnce({ status: 202, data: { queued: true } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestinations([{ id: 'b5', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toEqual([{ ok: true, destinationId: 'b5' }]);
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
        notifier.setDestinations([{ id: 'b4', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toEqual([{ ok: true, destinationId: 'b4' }]);
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
        notifier.setDestinations([{ id: 'b3', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toEqual([{ ok: true, destinationId: 'b3' }]);
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
        // `Number('')` is `0`, which is finite and >= 0 — an empty header
        // must NOT be read as "retry immediately"; it must fall back to the
        // 2s default like a missing/unparsable header would.
        expect(elapsed).toBeGreaterThanOrEqual(1800);
    });

    it('never falls back to another destination after a bridge failure', async () => {
        vi.mocked(axios.post).mockRejectedValue({ response: { status: 500 } } as never);
        const notifier = new DiscordNotifier();
        notifier.setDestinations([{ id: 'b2', kind: 'bridge', relayUrl: 'https://b', token: 't' }]);

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
        notifier.setDestinations([{ id: 'b1', kind: 'bridge', relayUrl: 'https://b', token: secretToken }]);
        await notifier.sendLog(logData, details);

        for (const call of consoleErrorSpy.mock.calls) {
            const serialized = call.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 6 }))).join(' ');
            expect(serialized).not.toContain(secretToken);
        }

        consoleErrorSpy.mockRestore();
    });
});

describe('sendLog fan-out', () => {
    beforeEach(() => {
        mockedPost.mockReset();
        mockedPost.mockResolvedValue({ status: 204, data: {} } as any);
    });

    it('posts once per enabled destination and returns one result each', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);

        const results = await notifier.sendLog(fanoutLogData);

        expect(results).toEqual([
            { ok: true, destinationId: 'w1' },
            { ok: true, destinationId: 'w2' }
        ]);
        expect(mockedPost).toHaveBeenCalledTimes(2);
        expect(mockedPost.mock.calls[0][0]).toBe(webhookDest.url);
        expect(mockedPost.mock.calls[1][0]).toBe(secondWebhookDest.url);
    });

    it('posts sequentially — the second call starts only after the first settles', async () => {
        const order: string[] = [];
        mockedPost.mockImplementation(async (url: any) => {
            order.push(`start:${url}`);
            await new Promise((resolve) => setTimeout(resolve, 0));
            order.push(`end:${url}`);
            return { status: 204, data: {} } as any;
        });
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);

        await notifier.sendLog(fanoutLogData);

        expect(order).toEqual([
            `start:${webhookDest.url}`, `end:${webhookDest.url}`,
            `start:${secondWebhookDest.url}`, `end:${secondWebhookDest.url}`
        ]);
    });

    it('keeps sending to the second destination when the first fails unrecoverably', async () => {
        mockedPost.mockImplementation(async (url: any) => {
            if (url === webhookDest.url) {
                const error: any = new Error('revoked');
                error.response = { status: 401 };
                throw error;
            }
            return { status: 204, data: {} } as any;
        });
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);

        const results = await notifier.sendLog(fanoutLogData);

        expect(results).toEqual([
            { ok: false, destinationId: 'w1', reason: 'revoked', message: 'This link was revoked — pair again.' },
            { ok: true, destinationId: 'w2' }
        ]);
    });

    it('returns an empty result list when nothing is enabled', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([]);

        expect(await notifier.sendLog(fanoutLogData)).toEqual([]);
        expect(mockedPost).not.toHaveBeenCalled();
    });

    it('reuses the caller-supplied map slice PNG for every destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);
        const mapSlicePng = new Uint8Array([1, 2, 3]);

        await notifier.sendLog({ ...fanoutLogData, mapSlicePng }, { players: [], durationMS: 1000 });

        // The PNG is an input, not something sendLog builds: two posts, one buffer.
        expect(mockedPost).toHaveBeenCalledTimes(2);
    });
});
