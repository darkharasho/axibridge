import { describe, it, expect } from 'vitest';
import { buildSlicePayloadJson } from '../discord';

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
