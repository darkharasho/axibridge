import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SiteInviteBanner } from '../SiteInviteBanner';
import { useSiteInvites } from '../hooks/useSiteInvites';

const invite = { id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: false };
const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: true, favorites: ['guild/site'] };
const noop = () => {};

describe('SiteInviteBanner', () => {
    it('renders nothing with no invites and nothing joined', () => {
        const { container } = render(<SiteInviteBanner invites={[]} joined={null} error={null} onJoin={noop} onDismiss={noop} onClose={noop} />);
        expect(container).toBeEmptyDOMElement();
    });
    it('names the inviter and repo, and wires Join/Dismiss', async () => {
        const onJoin = vi.fn();
        const onDismiss = vi.fn();
        render(<SiteInviteBanner invites={[invite]} joined={null} error={null} onJoin={onJoin} onDismiss={onDismiss} onClose={noop} />);
        expect(screen.getByText(/boss invited you to publish to/i)).toBeInTheDocument();
        expect(screen.getByText('guild/site')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Join guild/site' }));
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss guild/site' }));
        expect(onJoin).toHaveBeenCalledWith(1);
        expect(onDismiss).toHaveBeenCalledWith(1);
    });
    it('confirms a join', () => {
        render(<SiteInviteBanner invites={[]} joined={target} error={null} onJoin={noop} onDismiss={noop} onClose={noop} />);
        expect(screen.getByText(/You can now publish to guild\/site/i)).toBeInTheDocument();
    });
    it('shows an error', () => {
        render(<SiteInviteBanner invites={[invite]} joined={null} error="nope" onJoin={noop} onDismiss={noop} onClose={noop} />);
        expect(screen.getByText('nope')).toBeInTheDocument();
    });
});

describe('useSiteInvites', () => {
    beforeEach(() => {
        (window as any).electronAPI = {
            getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [invite, { ...invite, id: 2, dismissed: true }] })),
            acceptSiteInvite: vi.fn(async () => ({ success: true, target })),
            dismissSiteInvite: vi.fn(async () => ({ success: true }))
        };
    });
    it('hides dismissed invites', async () => {
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites.map((i) => i.id)).toEqual([1]));
    });
    it('join removes the invite and exposes the target', async () => {
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.join(1));
        expect(result.current.invites).toHaveLength(0);
        expect(result.current.joined).toEqual(target);
    });
    it('a failed join keeps the invite in the list and surfaces the error', async () => {
        (window as any).electronAPI.acceptSiteInvite = vi.fn(async () => ({ success: false, error: 'That invite is no longer valid.' }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.join(1));
        expect(result.current.error).toBe('That invite is no longer valid.');
        expect(result.current.invites).toHaveLength(1);
        expect(result.current.joined).toBeNull();
    });
    it('an invalid (expired/revoked) invite is dropped from the list', async () => {
        (window as any).electronAPI.acceptSiteInvite = vi.fn(async () => ({ success: false, code: 'invalid', error: 'That invite is no longer valid.' }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.join(1));
        expect(result.current.invites).toHaveLength(0);
        expect(result.current.error).toBe('That invite is no longer valid.');
        expect(result.current.joined).toBeNull();
    });
    it('a rejected join surfaces an error and does not throw', async () => {
        (window as any).electronAPI.acceptSiteInvite = vi.fn(async () => { throw new Error('ipc boom'); });
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.join(1));
        expect(result.current.error).toBe('ipc boom');
        expect(result.current.invites).toHaveLength(1);
        // busy is released: a retry goes through
        (window as any).electronAPI.acceptSiteInvite = vi.fn(async () => ({ success: true, target }));
        await act(() => result.current.join(1));
        expect(result.current.joined).toEqual(target);
    });
    it('double-clicking Join sends a single request', async () => {
        let release: (v: unknown) => void = () => {};
        (window as any).electronAPI.acceptSiteInvite = vi.fn(() => new Promise((r) => { release = r; }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        let p1: Promise<void>, p2: Promise<void>;
        act(() => { p1 = result.current.join(1); p2 = result.current.join(1); });
        expect((window as any).electronAPI.acceptSiteInvite).toHaveBeenCalledTimes(1);
        await act(async () => { release({ success: true, target }); await p1; await p2; });
        expect(result.current.joined).toEqual(target);
    });
    it('dismiss removes the invite on success', async () => {
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.dismiss(1));
        expect(result.current.invites).toHaveLength(0);
        expect(result.current.error).toBeNull();
    });
    it('a rejected dismiss keeps the row and shows the error', async () => {
        (window as any).electronAPI.dismissSiteInvite = vi.fn(async () => { throw new Error('ipc down'); });
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.dismiss(1));
        expect(result.current.invites).toHaveLength(1);
        expect(result.current.error).toBe('ipc down');
    });
    it('a {success:false} dismiss keeps the row and shows the error', async () => {
        (window as any).electronAPI.dismissSiteInvite = vi.fn(async () => ({ success: false, error: 'cannot dismiss' }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.dismiss(1));
        expect(result.current.invites).toHaveLength(1);
        expect(result.current.error).toBe('cannot dismiss');
    });
    it('dismiss is ignored while a join is in flight', async () => {
        let release: (v: unknown) => void = () => {};
        (window as any).electronAPI.acceptSiteInvite = vi.fn(() => new Promise((r) => { release = r; }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        let p: Promise<void>;
        act(() => { p = result.current.join(1); void result.current.dismiss(1); });
        expect((window as any).electronAPI.dismissSiteInvite).not.toHaveBeenCalled();
        await act(async () => { release({ success: true, target }); await p; });
    });
    it('clear resets joined and error but keeps other invites', async () => {
        (window as any).electronAPI.getPendingSiteInvites = vi.fn(async () => ({ success: true, invites: [invite, { ...invite, id: 2, repo: 'other', fullName: 'guild/other' }] }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(2));
        await act(() => result.current.join(1));
        expect(result.current.joined).toEqual(target);
        act(() => result.current.clear());
        expect(result.current.joined).toBeNull();
        expect(result.current.error).toBeNull();
        expect(result.current.invites.map((i) => i.id)).toEqual([2]);
    });
    it('a slow initial load does not clobber a join that already happened', async () => {
        let resolveLoad: (v: unknown) => void = () => {};
        (window as any).electronAPI.getPendingSiteInvites = vi.fn(() => new Promise((r) => { resolveLoad = r; }));
        const { result } = renderHook(() => useSiteInvites());
        await act(() => result.current.join(1));
        await act(async () => { resolveLoad({ success: true, invites: [invite] }); });
        expect(result.current.invites).toHaveLength(0);
        expect(result.current.joined).toEqual(target);
    });
    it('does not update state after unmount', async () => {
        let release: (v: unknown) => void = () => {};
        (window as any).electronAPI.acceptSiteInvite = vi.fn(() => new Promise((r) => { release = r; }));
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result, unmount } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        let p: Promise<void>;
        act(() => { p = result.current.join(1); });
        unmount();
        await act(async () => { release({ success: true, target }); await p; });
        expect(err).not.toHaveBeenCalled();
        err.mockRestore();
    });
});

describe('SiteInviteBanner busy', () => {
    it('disables Join and Dismiss while a request is in flight', () => {
        render(<SiteInviteBanner invites={[invite]} joined={null} error={null} busy onJoin={noop} onDismiss={noop} onClose={noop} />);
        expect(screen.getByRole('button', { name: 'Join guild/site' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Dismiss guild/site' })).toBeDisabled();
    });
});
