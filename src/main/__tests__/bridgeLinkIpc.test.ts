import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { linkBridgeChannel } from '../bridgeLink';

const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');
const key = `axb1.${b64url('https://bot.example.com')}.${'a'.repeat(43)}`;

describe('linkBridgeChannel', () => {
    beforeEach(() => {
        vi.mocked(axios.get).mockReset();
        // Seed a resolved default before any rejecting test runs. Without
        // this, the very first call to the mock rejecting with a non-Error
        // value trips a Vitest/jsdom unhandled-rejection false positive (see
        // discordDestination.test.ts, which seeds the same way for axios.post).
        vi.mocked(axios.get).mockResolvedValue({ status: 200, data: {} } as never);
    });

    it('validates the key against the relay and returns display labels', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: { guild_name: 'Vigil Keep', channel_name: 'wvw-reports' },
        } as never);

        const result = await linkBridgeChannel(key);
        expect(result).toEqual({
            ok: true,
            relayUrl: 'https://bot.example.com',
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports',
        });
        expect(vi.mocked(axios.get).mock.calls[0][0]).toBe('https://bot.example.com/bridge/whoami');
    });

    it('rejects a malformed key without calling the relay', async () => {
        const result = await linkBridgeChannel('nonsense');
        expect(result).toMatchObject({ ok: false });
        expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    });

    it('surfaces the relay error rather than storing a destination', async () => {
        vi.mocked(axios.get).mockRejectedValue({
            response: { status: 403, data: { error: 'the paired channel no longer exists' } },
        } as never);

        const result = await linkBridgeChannel(key);
        expect(result).toEqual({ ok: false, error: 'the paired channel no longer exists' });
    });

    it('reports an unreachable relay plainly', async () => {
        vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED') as never);
        const result = await linkBridgeChannel(key);
        expect(result).toMatchObject({ ok: false });
        expect((result as any).error).toContain('ECONNREFUSED');
    });
});
