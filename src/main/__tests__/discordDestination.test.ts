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

    // C2 fix: the bridge `classCell` is `"{{spec:ranger}} "` -- 17 source
    // chars -- but renders as a single emoji glyph. Measuring it at source
    // length starved `availableNameWidth` to 0 and silently dropped the
    // player name from every bridged top-list row. Assert the name substring
    // survives, not merely that the row is non-empty.
    it('keeps the player name in a bridged top-list row despite the wide emoji token', async () => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings({ classDisplay: 'emoji' } as never);
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });

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
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });

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
        notifier.setDestination({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });

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
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });

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
        notifier.setDestination({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.x.y',
        });

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
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const result = await notifier.sendLog(logData, details);
        expect(result).toMatchObject({ ok: false, reason: 'revoked' });
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
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://b', token: 't' });

        const start = Date.now();
        const result = await notifier.sendLog(logData, details);
        const elapsed = Date.now() - start;

        expect(result).toMatchObject({ ok: false, reason: 'rejected' });
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        expect(elapsed).toBeLessThan(500);
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
