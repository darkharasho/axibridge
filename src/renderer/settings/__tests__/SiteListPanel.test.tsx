import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteListPanel } from '../SiteListPanel';
import type { IGithubSite } from '../../../shared/githubSites';

const s = (owner: string, repo: string): IGithubSite => ({ owner, repo, addedVia: 'manual', addedAt: '' });
const SITES = [s('x', 'other'), s('guild', 'site'), s('old', 'gone')];
const DETAILS = {
    'guild/site': { role: 'admin' as const, ownerType: 'Organization' as const, ownerAvatarUrl: null, pagesUrl: 'u', memberCount: null },
    'x/other': { role: 'publisher' as const, ownerType: 'User' as const, ownerAvatarUrl: null, pagesUrl: 'u', memberCount: null },
    'old/gone': { role: 'none' as const, ownerType: null, ownerAvatarUrl: null, pagesUrl: 'u', memberCount: null }
};

let api: any;
const renderPanel = (over: Partial<Parameters<typeof SiteListPanel>[0]> = {}) => {
    const props = {
        mode: 'list' as const, sites: SITES, defaultKey: 'guild/site', details: DETAILS,
        onModeChange: vi.fn(), onClose: vi.fn(), onSitesChanged: vi.fn(), onDefaultChanged: vi.fn(), onInvitesChanged: vi.fn(), ...over
    };
    render(<SiteListPanel {...props} />);
    return props;
};

beforeEach(() => {
    api = {
        getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [] })),
        setDefaultGithubSite: vi.fn(async (p: any) => ({ success: true, sites: SITES, defaultKey: `${p.owner}/${p.repo}` })),
        removeGithubSite: vi.fn(async () => ({ success: true, sites: [s('guild', 'site')] })),
        addGithubSite: vi.fn(async (p: any) => ({ success: true, sites: [...SITES, s(p.owner, p.repo)] })),
        findGithubSites: vi.fn(async () => ({ success: true, found: [{ owner: 'me', repo: 'found' }] })),
        getGithubRepos: vi.fn(async () => ({ success: true, repos: [{ full_name: 'me/repo', name: 'repo', owner: 'me' }, { full_name: 'x/other', name: 'other', owner: 'x' }] })),
        getGithubOrgs: vi.fn(async () => ({ success: true, orgs: [] })),
        createGithubRepo: vi.fn(async () => ({ success: true, repo: { full_name: 'me/new', owner: 'me', name: 'new', pagesUrl: 'u' } })),
        getGithubSites: vi.fn(async () => ({ success: true, sites: [...SITES, s('me', 'new')], defaultKey: 'me/new' })),
        acceptSiteInvite: vi.fn()
    };
    window.electronAPI = api;
});

describe('SiteListPanel — your sites', () => {
    it('lists the default first with ✓ current and no remove button', () => {
        renderPanel();
        const rows = screen.getAllByTestId('site-row');
        expect(rows[0]).toHaveTextContent('guild/site');
        expect(rows[0]).toHaveTextContent('✓ current');
        expect(screen.queryByRole('button', { name: 'Remove guild/site' })).toBeNull();
    });
    it('switches the default on click', async () => {
        const props = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Use x/other' }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('x', 'other'));
        expect(api.setDefaultGithubSite).toHaveBeenCalledWith({ owner: 'x', repo: 'other' });
        expect(props.onSitesChanged).toHaveBeenCalledWith(SITES);
    });
    it('greys a no-access site and does not switch to it, but can remove it', async () => {
        const props = renderPanel();
        expect(screen.getByText('no access')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Use old/gone' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Remove old/gone' }));
        await waitFor(() => expect(props.onSitesChanged).toHaveBeenCalledWith([s('guild', 'site')]));
    });
    it('shows a switch failure inline', async () => {
        api.setDefaultGithubSite.mockResolvedValueOnce({ success: false, error: 'GitHub not connected.', sites: SITES });
        const props = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Use x/other' }));
        expect(await screen.findByText('GitHub not connected.')).toBeInTheDocument();
        expect(props.onDefaultChanged).not.toHaveBeenCalled();
    });
});

describe('SiteListPanel — invites', () => {
    const invite = { id: 1, owner: 'guild', repo: 'new', fullName: 'guild/new', inviter: 'boss', createdAt: '', dismissed: true };
    it('joins an invite and reports the new list', async () => {
        api.getPendingSiteInvites.mockResolvedValue({ success: true, invites: [invite] });
        const target = { owner: 'guild', repo: 'new', fullName: 'guild/new', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: false, sites: [...SITES, s('guild', 'new')] };
        api.acceptSiteInvite.mockResolvedValue({ success: true, target });
        const props = renderPanel();
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/new' }));
        await waitFor(() => expect(props.onSitesChanged).toHaveBeenCalledWith(target.sites));
        expect(props.onDefaultChanged).not.toHaveBeenCalled();
        expect(screen.getByText('You can now publish to guild/new.')).toBeInTheDocument();
        expect(props.onInvitesChanged).toHaveBeenLastCalledWith(0);
    });
    it('drops an invalid invite and keeps others on generic failure', async () => {
        api.getPendingSiteInvites.mockResolvedValue({ success: true, invites: [invite, { ...invite, id: 2, fullName: 'guild/two', repo: 'two' }] });
        api.acceptSiteInvite
            .mockResolvedValueOnce({ success: false, code: 'invalid', error: 'That invite is no longer valid.' })
            .mockResolvedValueOnce({ success: false, error: 'boom' });
        renderPanel();
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/new' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Join guild/new' })).toBeNull());
        await userEvent.click(screen.getByRole('button', { name: 'Join guild/two' }));
        expect(await screen.findByText('boom')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Join guild/two' })).toBeInTheDocument();
    });
});

describe('SiteListPanel — footer modes', () => {
    it('find adds a found site', async () => {
        const props = renderPanel({ mode: 'find' });
        fireEvent.click(await screen.findByRole('button', { name: 'Add me/found' }));
        await waitFor(() => expect(api.addGithubSite).toHaveBeenCalledWith({ owner: 'me', repo: 'found', addedVia: 'found' }));
        expect(props.onSitesChanged).toHaveBeenCalled();
    });
    it('find shows the empty state and errors', async () => {
        api.findGithubSites.mockResolvedValueOnce({ success: true, found: [] });
        renderPanel({ mode: 'find' });
        expect(await screen.findByText('No other AxiBridge sites found.')).toBeInTheDocument();
    });
    it('find shows an error inline', async () => {
        api.findGithubSites.mockResolvedValueOnce({ success: false, error: 'GitHub API error (500) loading repos' });
        const props = renderPanel({ mode: 'find' });
        expect(await screen.findByText('GitHub API error (500) loading repos')).toBeInTheDocument();
        expect(props.onSitesChanged).not.toHaveBeenCalled();
    });
    it('use existing adds a repo, and marks listed ones', async () => {
        const props = renderPanel({ mode: 'existing' });
        expect(await screen.findByRole('button', { name: /x\/other/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /me\/repo/ }));
        await waitFor(() => expect(api.addGithubSite).toHaveBeenCalledWith({ owner: 'me', repo: 'repo', addedVia: 'manual' }));
        expect(props.onModeChange).toHaveBeenCalledWith('list');
    });
    it('use existing with no default makes the pick the default', async () => {
        const props = renderPanel({ mode: 'existing', sites: [], defaultKey: null, details: {} });
        fireEvent.click(await screen.findByRole('button', { name: /me\/repo/ }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('me', 'repo'));
        expect(api.addGithubSite).not.toHaveBeenCalled();
    });
    it('create makes the new repo the default', async () => {
        const props = renderPanel({ mode: 'create' });
        await userEvent.type(screen.getByPlaceholderText('New repository name'), 'new');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('me', 'new'));
        expect(api.createGithubRepo).toHaveBeenCalledWith({ name: 'new', branch: 'main', owner: undefined });
        expect(props.onSitesChanged).toHaveBeenCalledWith([...SITES, s('me', 'new')]);
    });
    it('create validates the name', async () => {
        renderPanel({ mode: 'create' });
        await userEvent.type(screen.getByPlaceholderText('New repository name'), 'bad name');
        expect(screen.getByText(/letters, numbers/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    });
});

describe('SiteListPanel — fix round 1', () => {
    it('Back returns to list mode only outside list mode', () => {
        const props = renderPanel({ mode: 'find' });
        fireEvent.click(screen.getByRole('button', { name: 'Back to site list' }));
        expect(props.onModeChange).toHaveBeenCalledWith('list');
    });
    it('no Back button in list mode', () => {
        renderPanel();
        expect(screen.queryByRole('button', { name: 'Back to site list' })).toBeNull();
    });
    it('shows a repo load error and clears Loading', async () => {
        api.getGithubRepos.mockResolvedValueOnce({ success: false, error: 'nope' });
        renderPanel({ mode: 'existing' });
        expect(await screen.findByText('nope')).toBeInTheDocument();
        expect(screen.queryByText('Loading…')).toBeNull();
    });
    it('handles repo load and orgs rejections', async () => {
        api.getGithubRepos.mockRejectedValueOnce(new Error('boom'));
        api.getGithubOrgs.mockRejectedValue(new Error('x'));
        renderPanel({ mode: 'existing' });
        expect(await screen.findByText('boom')).toBeInTheDocument();
    });
    it('stays in existing mode when add fails', async () => {
        api.addGithubSite.mockResolvedValueOnce({ success: false, error: 'bad' });
        const props = renderPanel({ mode: 'existing' });
        fireEvent.click(await screen.findByRole('button', { name: /me\/repo/ }));
        expect(await screen.findByText('bad')).toBeInTheDocument();
        expect(props.onModeChange).not.toHaveBeenCalled();
    });
    it('create still sets default when the list refresh fails', async () => {
        api.getGithubSites.mockRejectedValueOnce(new Error('x'));
        const props = renderPanel({ mode: 'create' });
        await userEvent.type(screen.getByPlaceholderText('New repository name'), 'new');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('me', 'new'));
        expect(props.onSitesChanged).not.toHaveBeenCalled();
        expect(await screen.findByText(/Created me\/new/)).toBeInTheDocument();
    });
    it('remove passes only owner and repo', async () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Remove x/other' }));
        await waitFor(() => expect(api.removeGithubSite).toHaveBeenCalledWith({ owner: 'x', repo: 'other' }));
    });
    it('clears the note when the mode changes', async () => {
        api.setDefaultGithubSite.mockResolvedValueOnce({ success: false, error: 'fail1', sites: SITES });
        const props = {
            mode: 'list' as const, sites: SITES, defaultKey: 'guild/site', details: DETAILS,
            onModeChange: vi.fn(), onClose: vi.fn(), onSitesChanged: vi.fn(), onDefaultChanged: vi.fn()
        };
        const view = render(<SiteListPanel {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Use x/other' }));
        expect(await screen.findByText('fail1')).toBeInTheDocument();
        view.rerender(<SiteListPanel {...props} mode="find" />);
        await waitFor(() => expect(screen.queryByText('fail1')).toBeNull());
    });
});
