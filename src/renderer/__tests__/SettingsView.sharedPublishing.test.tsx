import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SettingsView } from '../SettingsView';

function renderSettings(settings: Record<string, unknown>, apiOverrides: Record<string, unknown> = {}) {
    const api: any = {
        getSettings: vi.fn().mockResolvedValue(settings),
        saveSettings: vi.fn(),
        onClearDpsReportCacheProgress: vi.fn(() => () => {}),
        onGithubAuthComplete: vi.fn(() => () => {}),
        openExternal: vi.fn(),
        getGithubRepos: vi.fn().mockResolvedValue({ success: true, repos: [] }),
        getGithubOrgs: vi.fn().mockResolvedValue({ success: true, orgs: [] }),
        ensureGithubTemplate: vi.fn().mockResolvedValue({ success: true }),
        getParserStatus: vi.fn().mockResolvedValue({ available: true, version: '1.7.1', eliteInsightsRemoval: null }),
        ackEliteInsightsRemovalNotice: vi.fn(),
        getParserSettings: vi.fn().mockResolvedValue({ parseCombatReplay: false, keepCombatReplayLocally: true, computeDamageModifiers: true, rawTimelineArrays: true }),
        saveParserSettings: vi.fn(),
        onParserSettingsChanged: vi.fn(() => () => {}),
        getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [] })),
        getGithubSiteDetails: vi.fn(async () => ({ success: true, details: {} })),
        getGithubSites: vi.fn(async () => ({ success: true, sites: [], defaultKey: null })),
        getGithubViewerLogin: vi.fn(async () => ({ success: true, login: 'me' })),
        applyGithubLogo: vi.fn(async () => ({ success: true })),
        ...apiOverrides
    };
    window.electronAPI = api;
    render(
        <SettingsView
            onBack={vi.fn()} onEmbedStatSettingsSaved={vi.fn()} onMvpWeightsSaved={vi.fn()} onStatsViewSettingsSaved={vi.fn()}
            onDisruptionMethodSaved={vi.fn()} onColorPaletteSaved={vi.fn()} onAxiThemeSaved={vi.fn()} onOpenWhatsNew={vi.fn()}
            onOpenWalkthrough={vi.fn()} webhooks={[]} enabledWebhookIds={[]} onSaveWebhooks={vi.fn()} onSetDestinationEnabled={vi.fn()}
            logDirectory={null} onChangeLogDirectory={vi.fn()}
        />
    );
    return api;
}

describe('SettingsView shared publishing', () => {
    it('does not sync the logo for a non-admin', async () => {
        const api = renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubLogoPath: '/x/logo.png' },
            { getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [], invites: [] })) }
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        expect(await screen.findByText(/Set by guild/)).toBeInTheDocument();
        await waitFor(() => expect(api.getRepoPublishers).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 600)); // outlast the 400ms sync debounce
        expect(api.applyGithubLogo).not.toHaveBeenCalled();
    });

    it('shows the default site in the Publishing to card with its role', async () => {
        renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubSites: [{ owner: 'guild', repo: 'site', addedVia: 'default', addedAt: '' }] },
            {
                getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'Organization', collaborators: [], invites: [] })),
                getGithubSiteDetails: vi.fn(async () => ({ success: true, details: { 'guild/site': { role: 'admin', ownerType: 'Organization', ownerAvatarUrl: null, pagesUrl: 'https://reports.example/', memberCount: null } } }))
            }
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        const card = await screen.findByTestId('publishing-site-card');
        expect(card).toHaveTextContent('guild/site');
        expect(await screen.findByText('you: admin')).toBeInTheDocument();
        expect(screen.getByText('https://reports.example/')).toBeInTheDocument();
        expect(screen.getByTestId('publishers-card')).toBeInTheDocument();
    });

    it('switching site saves the new default and never writes favourites', async () => {
        const sites = [{ owner: 'guild', repo: 'site', addedVia: 'default', addedAt: '' }, { owner: 'x', repo: 'other', addedVia: 'manual', addedAt: '' }];
        const api = renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubSites: sites, githubFavoriteRepos: ['x/other'] },
            {
                getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'User', collaborators: [], invites: [] })),
                setDefaultGithubSite: vi.fn(async () => ({ success: true, sites, defaultKey: 'x/other', pagesUrl: 'https://x.github.io/other' }))
            }
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Switch site' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Use x/other' }));
        await waitFor(() => {
            const saved = api.saveSettings.mock.calls.at(-1)?.[0];
            expect(saved).toMatchObject({ githubRepoOwner: 'x', githubRepoName: 'other' });
        }, { timeout: 2000 });
        for (const [payload] of api.saveSettings.mock.calls) {
            expect(payload).not.toHaveProperty('githubFavoriteRepos');
            expect(payload).not.toHaveProperty('githubPagesBaseUrl');
        }
    });

    it('a join that becomes the default survives the next save', async () => {
        const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: true, sites: [{ owner: 'guild', repo: 'site', addedVia: 'joined', addedAt: '' }] };
        const api = renderSettings({ githubToken: 'tok' }, {
            getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [{ id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: false }] })),
            acceptSiteInvite: vi.fn(async () => ({ success: true, target })),
            getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: false, ownerType: 'User', collaborators: [], invites: [] }))
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        fireEvent.click(await screen.findByRole('button', { name: /site invite/ }));
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/site' }));
        await waitFor(() => {
            expect(api.saveSettings.mock.calls.at(-1)?.[0]).toMatchObject({ githubRepoOwner: 'guild', githubRepoName: 'site' });
        }, { timeout: 2000 });
    });

    it('does not auto-sync the logo while admin status is unknown', async () => {
        const api = renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubLogoPath: '/x/logo.png' },
            { getRepoPublishers: vi.fn(() => new Promise(() => {})) }
        );
        await waitFor(() => expect(api.getRepoPublishers).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 600));
        expect(api.applyGithubLogo).not.toHaveBeenCalled();
    });

    it('syncs the logo once the user is a confirmed admin', async () => {
        const api = renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubLogoPath: '/x/logo.png' },
            { getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'User', collaborators: [], invites: [] })) }
        );
        await waitFor(() => expect(api.applyGithubLogo).toHaveBeenCalled(), { timeout: 2000 });
    });
});
