import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import FormData from 'form-data';
import { DiscordNotifier, buildSlicePayloadJson } from '../discord';

describe('map slice embed payload', () => {
    it('puts the attachment reference on the last embed only', () => {
        const payload = buildSlicePayloadJson([{ title: 'a' }, { title: 'b' }], false);
        const embeds = payload.embeds as any[];
        expect(embeds[0].image).toBeUndefined();
        expect(embeds[1].image).toEqual({ url: 'attachment://slice.png' });
    });

    it('uses the attachment:// scheme, never a remote URL', () => {
        const payload = buildSlicePayloadJson([{ title: 'a' }], true);
        const embeds = payload.embeds as any[];
        expect(embeds[0].image.url).toBe('attachment://slice.png');
        expect(embeds[0].image.url.startsWith('http')).toBe(false);
    });

    it('omits username for a bridged destination', () => {
        const bridged = buildSlicePayloadJson([{ title: 'a' }], true);
        expect(bridged.username).toBeUndefined();
        const hooked = buildSlicePayloadJson([{ title: 'a' }], false);
        expect(hooked.username).toBe('AxiBridge');
    });
});

// A minimal roster that trips the complex-embed path (`jsonDetails.players`
// truthy) without pulling in a full fixture.
const minimalDetails = {
    players: [{
        account: 'Player.1234',
        name: 'Player',
        profession: 'Firebrand',
        notInSquad: false,
        dpsAll: [{ damage: 1000, dps: 100 }],
        totalDamageDist: [[]],
    }],
    targets: [],
    phases: [{ start: 0, end: 10000 }],
    durationMS: 10000,
};

/**
 * Assert an `axios.post` call is the slice-bearing multipart request that
 * `postEmbedsWithImage` builds: a `form-data` FormData carrying a `file` part
 * named `slice.png` plus a `payload_json` part whose last embed references it.
 */
function expectSliceMultipart(call: any[]): void {
    const body = call[1];
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    // `getHeaders()` is what postForm hands axios; multipart or it isn't one.
    expect(form.getHeaders()['content-type']).toMatch(/^multipart\/form-data; boundary=/);

    const raw = form.getBuffer().toString('latin1');
    expect(raw).toContain('name="file"');
    expect(raw).toContain('filename="slice.png"');
    expect(raw).toContain('Content-Type: image/png');
    expect(raw).toContain('name="payload_json"');

    const json = raw.match(/name="payload_json"\r\n\r\n([\s\S]*?)\r\n--/);
    expect(json).not.toBeNull();
    const payload = JSON.parse(json![1]);
    const embeds = payload.embeds as any[];
    expect(embeds.length).toBeGreaterThan(0);
    expect(embeds[embeds.length - 1].image).toEqual({ url: 'attachment://slice.png' });
}

const logDataWithSlice = {
    permalink: 'https://dps.report/abcd',
    id: 'log-1',
    filePath: '/tmp/fight.zevtc',
    mode: 'embed' as const,
    mapSlicePng: new Uint8Array([1, 2, 3]),
};

describe('map slice send failure never blocks the report', () => {
    beforeEach(() => {
        vi.mocked(axios.post).mockReset();
    });

    it('falls back to the plain payload on a non-400 error from the multipart post', async () => {
        // First call: postEmbedsWithImage's multipart post, rejected with a
        // non-400 error (a bare network error, e.g. "socket hang up").
        // Second call: the plain-payload fallback, which must still succeed.
        vi.mocked(axios.post)
            .mockRejectedValueOnce(new Error('socket hang up'))
            .mockResolvedValueOnce({ status: 204, data: {} } as never);

        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'webhook', url: 'https://discord.example.com/webhook' });

        const result = await notifier.sendLog(logDataWithSlice, minimalDetails);

        expect(result.ok).toBe(true);
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);

        // Call 1 MUST be the image-bearing multipart request. Without this the
        // test passes even when the attach path is dead: the bare Error would
        // classify as 'network', sendLog would sleep and resend the plain
        // payload, and every remaining assertion would still hold.
        expectSliceMultipart(vi.mocked(axios.post).mock.calls[0]);

        // The successful fallback call carries no `image`/attachment payload.
        const fallbackArgs = vi.mocked(axios.post).mock.calls[1];
        const fallbackBody = fallbackArgs[1] as any;
        expect(fallbackBody).not.toBeInstanceOf(FormData);
        expect(fallbackBody.embeds.some((e: any) => e.image)).toBe(false);
    });

    it('posts the slice as one multipart request when the destination accepts it', async () => {
        vi.mocked(axios.post).mockResolvedValueOnce({ status: 204, data: {} } as never);

        const notifier = new DiscordNotifier();
        notifier.setDestination({ kind: 'webhook', url: 'https://discord.example.com/webhook' });

        const result = await notifier.sendLog(logDataWithSlice, minimalDetails);

        expect(result.ok).toBe(true);
        // Exactly one post: no plain-payload fallback, no duplicate report.
        expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
        expectSliceMultipart(vi.mocked(axios.post).mock.calls[0]);
    });
});
