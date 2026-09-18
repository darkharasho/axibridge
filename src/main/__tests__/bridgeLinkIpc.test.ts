import { describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { linkBridgeChannel } from '../bridgeLink';

const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');
const key = `axb1.${b64url('https://bot.example.com')}.${'a'.repeat(43)}`;

describe('linkBridgeChannel', () => {
    // Fix round 2, item 2a: round 1's fix (declaration order, no shared
    // reset) passed 3/3 in file order but failed 5/8 `--sequence.shuffle`
    // seeds — the file was still order-dependent, just on a different axis
    // (each test's `mock.calls[0]` implicitly meant "the first call any
    // earlier test happened to make"). Every test now calls
    // `mockReset()` FIRST, inside its own body, before establishing its own
    // complete mock state (implementation, if any). This is deliberately
    // NOT a shared `beforeEach` — round 1 root-caused the original flake to
    // a `mockReset()`/`mockClear()` landing in a lifecycle hook immediately
    // before a mock's first-ever rejecting call; putting the reset inside
    // each test body, immediately followed by that same test's own
    // implementation, does not reproduce it (verified 8/8 shuffle seeds).
    // The reset also makes `mock.calls[0]` unambiguous within each test,
    // which is what makes the trailing-slash assertion below meaningful
    // (item 2b) instead of silently inspecting a different test's call.
    it('rejects a malformed key without calling the relay', async () => {
        vi.mocked(axios.get).mockReset();
        const result = await linkBridgeChannel('nonsense');
        expect(result).toMatchObject({ ok: false });
        expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    });

    it('validates the key against the relay and returns display labels', async () => {
        vi.mocked(axios.get).mockReset();
        vi.mocked(axios.get).mockResolvedValue({
            data: { guild_name: 'Vigil Keep', channel_name: 'wvw-reports', guild_id: '111', channel_id: '222' },
        } as never);

        const result = await linkBridgeChannel(key);
        expect(result).toEqual({
            ok: true,
            relayUrl: 'https://bot.example.com',
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports',
            guildId: '111',
            channelId: '222',
        });
        expect(vi.mocked(axios.get).mock.calls[0][0]).toBe('https://bot.example.com/bridge/whoami');
    });

    it('surfaces the relay error rather than storing a destination', async () => {
        vi.mocked(axios.get).mockReset();
        vi.mocked(axios.get).mockRejectedValue({
            response: { status: 403, data: { error: 'the paired channel no longer exists' } },
        } as never);

        const result = await linkBridgeChannel(key);
        expect(result).toEqual({ ok: false, error: 'the paired channel no longer exists' });
    });

    it('reports an unreachable relay plainly', async () => {
        vi.mocked(axios.get).mockReset();
        vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED') as never);
        const result = await linkBridgeChannel(key);
        expect(result).toMatchObject({ ok: false });
        expect((result as any).error).toContain('ECONNREFUSED');
    });

    // Fix round 1, item 12 (partial); fix round 2, item 2b: the original
    // version of this assertion read `mock.calls[0][0]`, but without an
    // isolating reset, `calls[0]` in file declaration order was actually the
    // PRECEDING "validates the key" test's call (a URL with no trailing
    // slash to begin with) — so the assertion never inspected this test's
    // own request at all, and passed even when the re-reviewer injected a
    // real double-slash bug. The `mockReset()` above makes `calls[0]`
    // unambiguously refer to the single call this test itself makes.
    it('strips a trailing slash from the relay URL before calling whoami', async () => {
        vi.mocked(axios.get).mockReset();
        const trailingSlashKey = `axb1.${b64url('https://bot.example.com/')}.${'a'.repeat(43)}`;
        vi.mocked(axios.get).mockResolvedValue({
            data: { guild_name: 'Vigil Keep', channel_name: 'wvw-reports' },
        } as never);

        const result = await linkBridgeChannel(trailingSlashKey);
        expect(result).toMatchObject({ ok: true, relayUrl: 'https://bot.example.com' });
        expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(axios.get).mock.calls[0][0]).toBe('https://bot.example.com/bridge/whoami');
    });
});
