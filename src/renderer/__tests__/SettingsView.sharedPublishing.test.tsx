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

    // rewritten in Task 7
    it.skip('keeps a joined site in favorites on the next save', async () => {
        const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: false, sites: [] };
        const api = renderSettings({}, {
            getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [{ id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: false }] })),
            acceptSiteInvite: vi.fn(async () => ({ success: true, target }))
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/site' }));
        await waitFor(() => {
            const saved = api.saveSettings.mock.calls.at(-1)?.[0];
            expect(saved?.githubFavoriteRepos).toContain('guild/site');
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
