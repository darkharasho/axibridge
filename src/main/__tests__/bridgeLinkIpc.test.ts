import { describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { linkBridgeChannel } from '../bridgeLink';

const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');
const key = `axb1.${b64url('https://bot.example.com')}.${'a'.repeat(43)}`;

describe('linkBridgeChannel', () => {
    // Ordered deliberately, and with no `beforeEach` reset: this one runs
    // first, before the mock has ever been called, so `not.toHaveBeenCalled`
    // needs no explicit clearing. Every later test sets its own
    // `mockResolvedValue`/`mockRejectedValue` before use, so there's nothing
    // left for a reset to do (fix round 1, item 11 — a `mockReset()`/
    // `mockClear()` immediately before a rejecting call's first-ever use
    // reproduced a spurious Vitest unhandled-rejection failure here; simply
    // not calling either avoids it without a workaround).
    it('rejects a malformed key without calling the relay', async () => {
        const result = await linkBridgeChannel('nonsense');
        expect(result).toMatchObject({ ok: false });
        expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
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

    // Fix round 1, item 12 (partial): a relay URL with a trailing slash
    // (e.g. from a key minted by a relay whose configured base URL has one)
    // must not produce a double slash in the whoami request.
    it('strips a trailing slash from the relay URL before calling whoami', async () => {
        const trailingSlashKey = `axb1.${b64url('https://bot.example.com/')}.${'a'.repeat(43)}`;
        vi.mocked(axios.get).mockResolvedValue({
            data: { guild_name: 'Vigil Keep', channel_name: 'wvw-reports' },
        } as never);

        const result = await linkBridgeChannel(trailingSlashKey);
        expect(result).toMatchObject({ ok: true, relayUrl: 'https://bot.example.com' });
        expect(vi.mocked(axios.get).mock.calls[0][0]).toBe('https://bot.example.com/bridge/whoami');
    });
});
