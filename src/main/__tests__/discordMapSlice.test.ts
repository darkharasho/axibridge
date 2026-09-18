import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
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
        // The successful fallback call carries no `image`/attachment payload.
        const fallbackArgs = vi.mocked(axios.post).mock.calls[1];
        const fallbackBody = fallbackArgs[1] as any;
        expect(fallbackBody.embeds.some((e: any) => e.image)).toBe(false);
    });
});
