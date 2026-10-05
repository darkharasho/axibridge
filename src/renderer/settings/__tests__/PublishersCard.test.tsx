import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishersCard } from '../PublishersCard';

const api: any = {};
beforeEach(() => {
    Object.assign(api, {
        getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'kyra', avatarUrl: null }], invites: [{ id: 7, login: 'newbie', avatarUrl: null, createdAt: '2026-10-01T00:00:00Z' }] })),
        addRepoPublisher: vi.fn(async () => ({ success: true, status: 'invited' })),
        removeRepoPublisher: vi.fn(async () => ({ success: true })),
        cancelRepoInvite: vi.fn(async () => ({ success: true })),
        getGithubViewerLogin: vi.fn(async () => ({ success: true, login: 'boss' })),
        openExternal: vi.fn(async () => ({ success: true }))
    });
    (window as any).electronAPI = api;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PublishersCard', () => {
    it('lists publishers and pending invites for an admin', async () => {
        const onAdminKnown = vi.fn();
        render(<PublishersCard repoOwner="guild" repoName="site" onAdminKnown={onAdminKnown} />);
        expect(await screen.findByText('kyra')).toBeInTheDocument();
        expect(screen.getByText('newbie')).toBeInTheDocument();
        expect(onAdminKnown).toHaveBeenCalledWith(true);
    });

    it('explains and links to GitHub for a non-admin', async () => {
        api.getRepoPublishers.mockResolvedValueOnce({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [], invites: [] });
        const onAdminKnown = vi.fn();
        render(<PublishersCard repoOwner="guild" repoName="site" onAdminKnown={onAdminKnown} />);
        expect(await screen.findByText('Only a repo admin can add or remove members.')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /manage access on GitHub/i }));
        expect(api.openExternal).toHaveBeenCalledWith('https://github.com/guild/site/settings/access');
        expect(onAdminKnown).toHaveBeenCalledWith(false);
    });

    it('shows the message when the add IPC call rejects', async () => {
        api.addRepoPublisher.mockRejectedValueOnce(new Error('IPC channel closed'));
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByPlaceholderText(/GitHub username/i), 'raider');
        await userEvent.click(screen.getByRole('button', { name: /^Add$/ }));
        expect(await screen.findByText('IPC channel closed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Add$/ })).not.toBeDisabled();
    });

    it('invites a username and reloads', async () => {
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByPlaceholderText(/GitHub username/i), 'raider');
        await userEvent.click(screen.getByRole('button', { name: /^Add$/ }));
        expect(api.addRepoPublisher).toHaveBeenCalledWith({ owner: 'guild', repo: 'site', username: 'raider' });
        expect(await screen.findByText(/They'll see a Join prompt/i)).toBeInTheDocument();
        await waitFor(() => expect(api.getRepoPublishers).toHaveBeenCalledTimes(2));
    });

    it('says when the user already has access', async () => {
        api.addRepoPublisher.mockResolvedValueOnce({ success: true, status: 'already-has-access' });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByPlaceholderText(/GitHub username/i), 'kyra');
        await userEvent.click(screen.getByRole('button', { name: /^Add$/ }));
        expect(await screen.findByText(/kyra already has access/i)).toBeInTheDocument();
    });

    it('does not offer Remove on the signed-in user', async () => {
        api.getRepoPublishers.mockResolvedValueOnce({ success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'boss', avatarUrl: null }, { login: 'kyra', avatarUrl: null }], invites: [] });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(1);
    });

    it('shows the error when a removal is refused', async () => {
        api.removeRepoPublisher.mockResolvedValueOnce({ success: false, error: "The repo owner can't be removed." });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.click(screen.getByRole('button', { name: /^Remove kyra/ }));
        expect(await screen.findByText("The repo owner can't be removed.")).toBeInTheDocument();
    });

    it('only shows the latest repo when responses arrive out of order', async () => {
        let resolveA: (v: any) => void = () => {};
        let resolveB: (v: any) => void = () => {};
        api.getRepoPublishers = vi.fn(({ repo }: any) => new Promise((r) => { (repo === 'a' ? (resolveA = r) : (resolveB = r)); }));
        const onAdminKnown = vi.fn();
        const { rerender } = render(<PublishersCard repoOwner="guild" repoName="a" onAdminKnown={onAdminKnown} />);
        rerender(<PublishersCard repoOwner="guild" repoName="b" onAdminKnown={onAdminKnown} />);
        resolveB({ success: true, canAdmin: false, ownerType: 'User', collaborators: [], invites: [] });
        expect(await screen.findByText('Only a repo admin can add or remove members.')).toBeInTheDocument();
        resolveA({ success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'fromA', avatarUrl: null }], invites: [] });
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByText('fromA')).not.toBeInTheDocument();
        expect(screen.getByText('Only a repo admin can add or remove members.')).toBeInTheDocument();
        expect(onAdminKnown).toHaveBeenCalledTimes(1);
        expect(onAdminKnown).toHaveBeenLastCalledWith(false);
    });

    it('clears the previous repo data while the next one loads or fails', async () => {
        const { rerender } = render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        api.getRepoPublishers = vi.fn(async () => ({ success: false, error: 'boom' }));
        rerender(<PublishersCard repoOwner="guild" repoName="other" />);
        expect(await screen.findByText('boom')).toBeInTheDocument();
        expect(screen.queryByText('kyra')).not.toBeInTheDocument();
    });

    it('submits once on two quick Enter presses', async () => {
        let release: (v: any) => void = () => {};
        api.addRepoPublisher = vi.fn(() => new Promise((r) => { release = r; }));
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByRole('textbox', { name: 'GitHub username' }), 'raider{Enter}{Enter}');
        expect(api.addRepoPublisher).toHaveBeenCalledTimes(1);
        release({ success: true, status: 'invited' });
        await screen.findByText(/They'll see a Join prompt/i);
    });

    it('titles the card Members with a count and links to GitHub access settings', async () => {
        api.getRepoPublishers.mockResolvedValueOnce({ success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'a', avatarUrl: null }, { login: 'b', avatarUrl: null }], invites: [] });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        expect(await screen.findByText('Members · 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Manage access on GitHub ↗' }));
        expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://github.com/guild/site/settings/access');
        expect(screen.getByText(/Anyone with write access to/)).toHaveTextContent('Anyone with write access to guild/site can publish here.');
    });
    it('shows publishers the list read-only', async () => {
        api.getRepoPublishers.mockResolvedValueOnce({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [{ login: 'kyra', avatarUrl: null }], invites: [] });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        expect(await screen.findByText('kyra')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove kyra' })).toBeNull();
        expect(screen.queryByLabelText('GitHub username')).toBeNull();
        expect(screen.getByText('Only a repo admin can add or remove members.')).toBeInTheDocument();
    });
    it('links to the org setting when GitHub blocks the invite', async () => {
        api.addRepoPublisher.mockResolvedValueOnce({ success: false, error: "Couldn't invite kyra: blocked", helpUrl: 'https://github.com/organizations/guild/settings/member_privileges' });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByLabelText('GitHub username'), 'kyra');
        await userEvent.click(screen.getByRole('button', { name: /^Add$/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Org settings ↗' }));
        expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://github.com/organizations/guild/settings/member_privileges');
    });
});
