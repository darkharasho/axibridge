import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
    SettingsView,
    slugifyHeading,
    validateRepoName,
    formatWeight,
    extractHeadingText,
} from '../SettingsView';
import { DEFAULT_EMBED_STATS } from '../global.d';
import { DEFAULT_MVP_WEIGHT_PROFILES } from '../global.d';
// Drift guard for SHIPPED_DEFAULT_BACKEND, the renderer-side hand-kept mirror
// of the main-process default. The renderer cannot import from main at RUNTIME,
// but a test can — so an owner flip that misses the mirror fails here.

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeElectronApiMock(settingsOverrides: Record<string, unknown> = {}) {
    return {
        getSettings: vi.fn().mockResolvedValue(settingsOverrides),
        saveSettings: vi.fn(),
        onClearDpsReportCacheProgress: vi.fn(() => () => {}),
        onGithubAuthComplete: vi.fn(() => () => {}),
        openExternal: vi.fn(),
        exportSettings: vi.fn().mockResolvedValue({ success: true }),
        selectSettingsFile: vi.fn().mockResolvedValue({ canceled: true }),
        startGithubOAuth: vi.fn().mockResolvedValue({ success: false }),
        getGithubRepos: vi.fn().mockResolvedValue({ success: true, repos: [] }),
        getGithubOrgs: vi.fn().mockResolvedValue({ success: true, orgs: [] }),
        clearDpsReportCache: vi.fn().mockResolvedValue({ success: true, clearedEntries: 0 }),
        ensureGithubTemplate: vi.fn().mockResolvedValue({ success: true }),
        getParserStatus: vi.fn().mockResolvedValue({
            available: true,
            version: '1.7.1',
            eliteInsightsRemoval: null,
        }),
        ackEliteInsightsRemovalNotice: vi.fn(),
        getParserSettings: vi.fn().mockResolvedValue({
            parseCombatReplay: false, computeDamageModifiers: true, rawTimelineArrays: true,
        }),
        saveParserSettings: vi.fn(),
        onParserSettingsChanged: vi.fn(() => () => {}),
    };
}

function renderSettings(
    props: Partial<React.ComponentProps<typeof SettingsView>> = {},
    settingsOverrides: Record<string, unknown> = {},
    apiOverrides: Record<string, unknown> = {},
) {
    const mock = { ...makeElectronApiMock(settingsOverrides), ...apiOverrides };
    window.electronAPI = mock as any;

    const callbacks = {
        onBack: vi.fn(),
        onEmbedStatSettingsSaved: vi.fn(),
        onMvpWeightsSaved: vi.fn(),
        onStatsViewSettingsSaved: vi.fn(),
        onDisruptionMethodSaved: vi.fn(),
        onColorPaletteSaved: vi.fn(),
        onGlassSurfacesSaved: vi.fn(),
        onOpenWhatsNew: vi.fn(),
        onOpenWalkthrough: vi.fn(),
    };

    render(<SettingsView {...callbacks} {...props} />);
    return { mock, callbacks };
}

/** Wait until settings have been fetched and applied. */
async function waitForLoad(mock: ReturnType<typeof makeElectronApiMock>) {
    await waitFor(() => expect(mock.getSettings).toHaveBeenCalled());
}

/**
 * Wait for the 300 ms auto-save debounce to fire.
 * Expects the given function to have been called within 1 s.
 */
async function waitForSave(fn: ReturnType<typeof vi.fn>) {
    await waitFor(() => expect(fn).toHaveBeenCalled(), { timeout: 1000 });
}

// ---------------------------------------------------------------------------
// Pure helper unit tests — no rendering needed
// ---------------------------------------------------------------------------

describe('slugifyHeading', () => {
    it('lowercases and converts spaces to hyphens', () => {
        expect(slugifyHeading('Hello World')).toBe('hello-world');
    });

    it('strips special characters', () => {
        expect(slugifyHeading('CC/Strip (Count)')).toBe('ccstrip-count');
    });

    it('collapses repeated hyphens', () => {
        expect(slugifyHeading('a -- b')).toBe('a-b');
    });

    it('strips markdown link syntax, keeping label text', () => {
        expect(slugifyHeading('[label](http://x.com)')).toBe('label');
    });

    it('strips inline code backticks', () => {
        expect(slugifyHeading('Use `foo` here')).toBe('use-foo-here');
    });

    it('trims leading/trailing whitespace', () => {
        expect(slugifyHeading('  trim me  ')).toBe('trim-me');
    });
});

describe('validateRepoName', () => {
    it('returns error for empty string', () => {
        expect(validateRepoName('')).toBe('Repository name is required.');
    });

    it('returns null for a valid name', () => {
        expect(validateRepoName('my-repo')).toBeNull();
        expect(validateRepoName('MyRepo_1.0')).toBeNull();
    });

    it('rejects names with invalid characters', () => {
        expect(validateRepoName('my repo')).toMatch(/letters, numbers/);
        expect(validateRepoName('bad/name')).toMatch(/letters, numbers/);
    });

    it('rejects names starting with a dot', () => {
        expect(validateRepoName('.hidden')).toMatch(/dot/);
    });

    it('rejects names ending with a dot', () => {
        expect(validateRepoName('repo.')).toMatch(/dot/);
    });

    it('rejects names ending with .git', () => {
        expect(validateRepoName('repo.git')).toMatch(/\.git/);
    });
});

describe('formatWeight', () => {
    it('formats integer to two decimal places', () => {
        expect(formatWeight(1)).toBe('1.00');
    });

    it('formats floating point to two decimal places', () => {
        expect(formatWeight(0.7)).toBe('0.70');
    });

    it('formats zero', () => {
        expect(formatWeight(0)).toBe('0.00');
    });
});

describe('extractHeadingText', () => {
    it('extracts a plain string', () => {
        expect(extractHeadingText('hello')).toBe('hello');
    });

    it('extracts a number', () => {
        expect(extractHeadingText(42)).toBe('42');
    });

    it('joins an array of strings', () => {
        expect(extractHeadingText(['a', 'b', 'c'])).toBe('abc');
    });

    it('returns empty string for null/undefined', () => {
        expect(extractHeadingText(null)).toBe('');
        expect(extractHeadingText(undefined)).toBe('');
    });

    it('recursively extracts from a React-element-like children prop', () => {
        const node = { props: { children: 'nested text' } };
        expect(extractHeadingText(node as any)).toBe('nested text');
    });
});

// ---------------------------------------------------------------------------
// SettingsView component tests
// ---------------------------------------------------------------------------

describe('SettingsView', () => {

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    describe('initialization', () => {
        it('renders the main Settings heading', async () => {
            renderSettings();
            expect(await screen.findByRole('heading', { name: 'Settings', level: 2 })).toBeInTheDocument();
        });

        it('renders all major section headings', async () => {
            renderSettings();
            // Wait for at least one section to confirm the component mounted
            expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /dps\.report User Token/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /GitHub Pages Web Reports/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Discord Embed - Summary Sections/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Discord Embed - Top Stats Lists/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Help & Updates/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Dashboard - Top Stats & MVP/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /MVP Weighting/i })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /Window Close Behavior/i })).toBeInTheDocument();
        });

        it('calls getSettings on mount', async () => {
            const { mock } = renderSettings();
            await waitForLoad(mock);
            expect(mock.getSettings).toHaveBeenCalledOnce();
        });

        it('pre-fills the dps.report token from saved settings', async () => {
            const { mock } = renderSettings({}, { dpsReportToken: 'mytoken123' });
            await waitForLoad(mock);
            await waitFor(() => {
                expect(screen.getByPlaceholderText(/Enter your dps\.report token/i)).toHaveValue('mytoken123');
            });
        });

        it('applies saved closeBehavior=quit to the UI', async () => {
            const { mock } = renderSettings({}, { closeBehavior: 'quit' });
            await waitForLoad(mock);
            await waitFor(() => {
                const quitButton = screen.getByRole('button', { name: /Quit Application/i });
                expect(quitButton.className).toMatch(/red/);
            });
        });

        it('applies saved colorPalette to the UI', async () => {
            const { mock } = renderSettings({}, { colorPalette: 'amber-warm' });
            await waitForLoad(mock);
            await waitFor(() => {
                const amberButton = screen.getByRole('button', { name: 'Amber Warm' });
                expect(amberButton.className).toMatch(/white\/40/);
            });
        });
    });


    // -----------------------------------------------------------------------
    // Auto-save + callbacks (300 ms debounce)
    // -----------------------------------------------------------------------

    describe('auto-save', () => {
        it('debounces saveSettings after a setting changes', async () => {
            const { mock } = renderSettings();
            await waitForLoad(mock);
            mock.saveSettings.mockClear();

            // Changing the dpsReportToken triggers the debounce
            const input = screen.getByPlaceholderText(/Enter your dps\.report token/i);
            fireEvent.change(input, { target: { value: 'abc' } });

            // Should not call saveSettings immediately (it's debounced)
            expect(mock.saveSettings).not.toHaveBeenCalled();

            // After 300ms it should have fired
            await waitForSave(mock.saveSettings);
        });

        it('fires onEmbedStatSettingsSaved with updated value after toggling Squad Summary', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);

            // Click the Squad Summary toggle row
            fireEvent.click(screen.getByText('Squad Summary'));

            await waitFor(() => {
                expect(callbacks.onEmbedStatSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ showSquadSummary: false }),
                );
            }, { timeout: 1000 });
        });

        it('fires onColorPaletteSaved with the new palette', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);
            callbacks.onColorPaletteSaved.mockClear();

            fireEvent.click(screen.getByRole('button', { name: 'Emerald Mint' }));

            await waitFor(() => {
                expect(callbacks.onColorPaletteSaved).toHaveBeenCalledWith('emerald-mint');
            }, { timeout: 1000 });
        });

        it('fires onStatsViewSettingsSaved after toggling Show Top Stats', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);

            fireEvent.click(screen.getByText('Show Top Stats Section'));

            await waitFor(() => {
                expect(callbacks.onStatsViewSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ showTopStats: false }),
                );
            }, { timeout: 1000 });
        });
    });

    // -----------------------------------------------------------------------
    // Appearance section
    // -----------------------------------------------------------------------

    describe('Appearance section', () => {
        it('activates the Amber Warm palette button when clicked', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: 'Appearance' });

            const amberBtn = screen.getByRole('button', { name: 'Amber Warm' });
            fireEvent.click(amberBtn);

            expect(amberBtn.className).toMatch(/white\/40/);
        });

        it('shows the Glass Surfaces toggle', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: 'Appearance' });

            expect(screen.getByText('Glass Surfaces')).toBeInTheDocument();
        });

        it('fires onGlassSurfacesSaved after toggling glass surfaces', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);
            callbacks.onGlassSurfacesSaved.mockClear();

            fireEvent.click(screen.getByText('Glass Surfaces'));

            await waitFor(() => {
                expect(callbacks.onGlassSurfacesSaved).toHaveBeenCalledWith(true);
            }, { timeout: 1000 });
        });
    });

    // -----------------------------------------------------------------------
    // Discord Embed — Summary Sections
    // -----------------------------------------------------------------------

    describe('Discord Embed - Summary Sections', () => {
        it('toggles Squad Summary off and updates the embed settings', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Discord Embed - Summary Sections/i });

            fireEvent.click(screen.getByText('Squad Summary'));

            await waitFor(() => {
                expect(callbacks.onEmbedStatSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ showSquadSummary: false }),
                );
            }, { timeout: 1000 });
        });

        it('toggling Enemy Summary on/off updates embedStats', async () => {
            const { mock } = renderSettings({}, { embedStatSettings: { ...DEFAULT_EMBED_STATS, showEnemySummary: false } });
            await waitForLoad(mock);
            await screen.findByRole('heading', { name: /Discord Embed - Summary Sections/i });

            fireEvent.click(screen.getByText('Enemy Summary'));

            await waitFor(() => {
                const calls = mock.saveSettings.mock.calls as any[];
                const lastCall = [...calls].reverse().find((c) => c[0]?.embedStatSettings !== undefined);
                expect(lastCall?.[0]?.embedStatSettings).toMatchObject({ showEnemySummary: true });
            }, { timeout: 1000 });
        });

        it('Split Enemies by Team saves immediately (not debounced)', async () => {
            const { mock } = renderSettings();
            await waitForLoad(mock);
            await waitForSave(mock.saveSettings);
            mock.saveSettings.mockClear();

            fireEvent.click(screen.getByText('Split Enemies by Team'));

            expect(mock.saveSettings).toHaveBeenCalledWith(
                expect.objectContaining({ discordSplitEnemiesByTeam: true }),
            );
        });
    });

    // -----------------------------------------------------------------------
    // Discord Embed — Top Stats Lists
    // -----------------------------------------------------------------------

    describe('Discord Embed - Top Stats Lists', () => {
        it('"Disable All" sets all top-list embed stats to false', async () => {
            // allTopListsEnabled requires every stat (including optional ones) to be true.
            // Render with all top-list stats enabled so the button reads "Disable All".
            const { callbacks } = renderSettings({}, {
                embedStatSettings: {
                    ...DEFAULT_EMBED_STATS,
                    showResurrects: true,
                    showDistanceToTag: true,
                    showKills: true,
                    showDowns: true,
                    showBreakbarDamage: true,
                    showDamageTaken: true,
                    showDeaths: true,
                    showDodges: true,
                    showDamageMitigation: true,
                },
            });
            await screen.findByRole('heading', { name: /Discord Embed - Top Stats Lists/i });

            fireEvent.click(screen.getByRole('button', { name: 'Disable All' }));

            await waitFor(() => {
                const lastCall = callbacks.onEmbedStatSettingsSaved.mock.calls.at(-1)?.[0];
                expect(lastCall?.showDamage).toBe(false);
                expect(lastCall?.showHealing).toBe(false);
                expect(lastCall?.showCC).toBe(false);
                expect(lastCall?.showStability).toBe(false);
                expect(lastCall?.showCleanses).toBe(false);
            }, { timeout: 1000 });
        });

        it('button label flips to "Disable All" after "Enable All" is clicked', async () => {
            // Start with one stat disabled so "Enable All" appears
            renderSettings({}, { embedStatSettings: { ...DEFAULT_EMBED_STATS, showDamage: false } });
            await screen.findByRole('heading', { name: /Discord Embed - Top Stats Lists/i });

            const enableBtn = screen.getByRole('button', { name: 'Enable All' });
            fireEvent.click(enableBtn);

            await screen.findByRole('button', { name: 'Disable All' });
        });

        it('updating class display to Emoji saves the correct value', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Discord Embed - Top Stats Lists/i });

            fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));

            await waitFor(() => {
                expect(callbacks.onEmbedStatSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ classDisplay: 'emoji' }),
                );
            }, { timeout: 1000 });
        });

        it('updating class display to Short name saves the correct value', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Discord Embed - Top Stats Lists/i });

            fireEvent.click(screen.getByRole('button', { name: 'Short name' }));

            await waitFor(() => {
                expect(callbacks.onEmbedStatSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ classDisplay: 'short' }),
                );
            }, { timeout: 1000 });
        });
    });

    // -----------------------------------------------------------------------
    // Dashboard Stats section
    // -----------------------------------------------------------------------

    describe('Dashboard Stats section', () => {
        it('toggles "Show Top Stats Section" and saves the updated setting', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Dashboard - Top Stats & MVP/i });

            fireEvent.click(screen.getByText('Show Top Stats Section'));

            await waitFor(() => {
                expect(callbacks.onStatsViewSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ showTopStats: false }),
                );
            }, { timeout: 1000 });
        });

        it('switching top stats mode to Per Second fires callback with perSecond', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Dashboard - Top Stats & MVP/i });

            fireEvent.click(screen.getByRole('button', { name: 'Per Second' }));

            await waitFor(() => {
                expect(callbacks.onStatsViewSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ topStatsMode: 'perSecond' }),
                );
            }, { timeout: 1000 });
        });

        it('switching top stats mode to Per Minute fires callback with perMinute', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Dashboard - Top Stats & MVP/i });

            fireEvent.click(screen.getByRole('button', { name: 'Per Minute' }));

            await waitFor(() => {
                expect(callbacks.onStatsViewSettingsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ topStatsMode: 'perMinute' }),
                );
            }, { timeout: 1000 });
        });

        it('changing CC/Strip method fires onDisruptionMethodSaved', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Dashboard - Top Stats & MVP/i });

            // The button's accessible name includes its child "Select" text too,
            // so locate by the label text and climb to the button element.
            const durationBtn = screen.getByText('Duration (Seconds)').closest('button')!;
            fireEvent.click(durationBtn);

            await waitFor(() => {
                expect(callbacks.onDisruptionMethodSaved).toHaveBeenCalledWith('duration');
            }, { timeout: 1000 });
        });
    });

    // -----------------------------------------------------------------------
    // Top Stats Cards chip-grid picker
    // -----------------------------------------------------------------------

    describe('Top Stats Cards picker', () => {
        it('toggles a top stat card chip', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: /Dashboard - Top Stats & MVP/i });

            // Use aria-pressed attribute to distinguish chip buttons from navigation buttons
            const dpsChips = await screen.findAllByRole('button', { name: /^DPS$/i });
            const dpsChip = dpsChips.find((btn) => btn.hasAttribute('aria-pressed'))!;
            expect(dpsChip).toHaveAttribute('aria-pressed', 'false'); // DPS is default-off
            fireEvent.click(dpsChip);
            expect(dpsChip).toHaveAttribute('aria-pressed', 'true');
        });

        it('reset to defaults marks Down Contribution enabled', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: /Dashboard - Top Stats & MVP/i });

            // Two "Reset to defaults" buttons exist (dashboard-stats + MVP); scope to dashboard section
            const dashboardSection = document.getElementById('dashboard-stats')!;
            const reset = within(dashboardSection).getByRole('button', { name: /Reset to defaults/i });
            fireEvent.click(reset);
            const dcButtons = screen.getAllByRole('button', { name: /Down Contribution/i });
            const dc = dcButtons.find((btn) => btn.hasAttribute('aria-pressed'))!;
            expect(dc).toHaveAttribute('aria-pressed', 'true');
        });
    });

    // -----------------------------------------------------------------------
    // MVP Weighting
    // -----------------------------------------------------------------------

    describe('MVP Weighting', () => {
        it('Reset to defaults button restores all profiles to DEFAULT_MVP_WEIGHT_PROFILES', async () => {
            const { mock, callbacks } = renderSettings(
                {},
                { mvpWeightProfiles: { general: {}, offensive: { dps: 0.05 }, defensive: {} } },
            );
            await waitForLoad(mock);
            await screen.findByRole('heading', { name: /MVP Weighting/i });

            const mvpSection = document.getElementById('mvp-weighting')!;
            fireEvent.click(within(mvpSection).getByRole('button', { name: /Reset to defaults/i }));

            await waitFor(() => {
                expect(callbacks.onMvpWeightsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({
                        offensive: expect.objectContaining({ downContrib: DEFAULT_MVP_WEIGHT_PROFILES.offensive.downContrib }),
                    }),
                );
            }, { timeout: 1000 });
        });

        it('increments an MVP weight via the stepper', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: /MVP Weighting/i });

            const section = document.getElementById('mvp-weighting')!;
            // Kills defaults to 0 (off) in the Offensive bucket; one click → 0.05
            const inc = await within(section).findByRole('button', { name: /increase Kills/i });
            expect(within(section).queryByText('0.05')).toBeNull();
            fireEvent.click(inc);
            expect(within(section).getAllByText('0.05').length).toBeGreaterThan(0);
        });

        it('switches MVP buckets to Defensive', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: /MVP Weighting/i });

            const defensiveTab = await screen.findByRole('button', { name: /^Defensive$/i });
            fireEvent.click(defensiveTab);
            expect(await screen.findByRole('button', { name: /increase Healing/i })).toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Window Close Behavior
    // -----------------------------------------------------------------------

    describe('Window Close Behavior', () => {
        it('Quit Application button becomes active (red) when clicked', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: /Window Close Behavior/i });

            const quitBtn = screen.getByRole('button', { name: /Quit Application/i });
            fireEvent.click(quitBtn);

            expect(quitBtn.className).toMatch(/red/);
        });

        it('saves closeBehavior=quit in the next auto-save', async () => {
            const { mock } = renderSettings();
            await screen.findByRole('heading', { name: /Window Close Behavior/i });
            mock.saveSettings.mockClear();

            fireEvent.click(screen.getByRole('button', { name: /Quit Application/i }));

            await waitFor(() => {
                const call = (mock.saveSettings.mock.calls as any[]).find(
                    (c) => c[0]?.closeBehavior === 'quit',
                );
                expect(call).toBeDefined();
            }, { timeout: 1000 });
        });

        it('Minimize to Tray button is active by default', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: /Window Close Behavior/i });

            const minimizeBtn = screen.getByRole('button', { name: /Minimize to Tray/i });
            expect(minimizeBtn.className).toMatch(/blue/);
        });
    });

    // -----------------------------------------------------------------------
    // Export / Import
    // -----------------------------------------------------------------------

    describe('Export / Import', () => {
        it('Export Settings calls electronAPI.exportSettings', async () => {
            const { mock } = renderSettings();
            await screen.findByRole('heading', { name: /Export \/ Import/i });

            fireEvent.click(screen.getByRole('button', { name: /Export Settings/i }));

            await waitFor(() => expect(mock.exportSettings).toHaveBeenCalledOnce());
        });

        it('Import Settings calls electronAPI.selectSettingsFile', async () => {
            const { mock } = renderSettings();
            await screen.findByRole('heading', { name: /Export \/ Import/i });

            fireEvent.click(screen.getByRole('button', { name: /Import Settings/i }));

            await waitFor(() => expect(mock.selectSettingsFile).toHaveBeenCalledOnce());
        });

        it('does not open the import modal when the file picker is cancelled', async () => {
            const { mock } = renderSettings();
            await screen.findByRole('heading', { name: /Export \/ Import/i });

            mock.selectSettingsFile.mockResolvedValue({ canceled: true });
            fireEvent.click(screen.getByRole('button', { name: /Import Settings/i }));

            await act(async () => { await Promise.resolve(); });
            expect(screen.queryByText(/Choose what to import/i)).not.toBeInTheDocument();
        });

        it('opens the import modal when a valid settings file is returned', async () => {
            const { mock } = renderSettings();
            await screen.findByRole('heading', { name: /Export \/ Import/i });

            mock.selectSettingsFile.mockResolvedValue({
                success: true,
                settings: { closeBehavior: 'quit' },
            });
            fireEvent.click(screen.getByRole('button', { name: /Import Settings/i }));

            expect(await screen.findByText(/Choose what to import/i)).toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // GitHub section
    // -----------------------------------------------------------------------

    describe('GitHub section', () => {
        it('Connect GitHub button calls startGithubOAuth', async () => {
            const { mock } = renderSettings();
            await screen.findByRole('heading', { name: /GitHub Pages Web Reports/i });

            fireEvent.click(screen.getByRole('button', { name: /Connect GitHub/i }));

            await waitFor(() => expect(mock.startGithubOAuth).toHaveBeenCalledOnce());
        });

        it('Disconnect button shows "Not connected" status', async () => {
            const { mock } = renderSettings({}, { githubToken: 'some-token' });
            await waitForLoad(mock);

            fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }));

            await screen.findByText('Not connected');
        });

        it('shows "Connected" status when a token is already saved', async () => {
            const { mock } = renderSettings({}, { githubToken: 'existing-token' });
            await waitForLoad(mock);
            await waitFor(() => {
                expect(screen.getByText('Connected')).toBeInTheDocument();
            });
        });
    });

    // -----------------------------------------------------------------------
    // Help & Updates navigation
    // -----------------------------------------------------------------------

    describe('Help & Updates navigation', () => {
        it('Open Walkthrough button calls onOpenWalkthrough', async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Help & Updates/i });

            fireEvent.click(screen.getByRole('button', { name: /Open Walkthrough/i }));

            expect(callbacks.onOpenWalkthrough).toHaveBeenCalledOnce();
        });

        it("View What's New button calls onOpenWhatsNew", async () => {
            const { callbacks } = renderSettings();
            await screen.findByRole('heading', { name: /Help & Updates/i });

            fireEvent.click(screen.getByRole('button', { name: /View What's New/i }));

            expect(callbacks.onOpenWhatsNew).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // Parse engine (parser backend) selection
    // -----------------------------------------------------------------------
    // The Elite Insights backend is gone, so the card no longer picks an
    // engine. What is left has to say what the parser is, say so loudly when
    // there is no binding for this platform, and tell a user once that an
    // install they may never have known about was deleted.
    describe('Parser status card', () => {
        const findCard = () => screen.findByTestId('parser-status-card');

        it('names the parser and its version', async () => {
            renderSettings();
            const card = await findCard();
            expect(card.textContent).toContain('Axilog 1.7.1');
            expect(card.textContent).not.toContain('Elite Insights has been removed');
        });

        it('says so plainly when no native binding exists for this platform', async () => {
            renderSettings({}, {}, {
                getParserStatus: vi.fn().mockResolvedValue({
                    available: false, version: null, eliteInsightsRemoval: null,
                }),
            });
            const notice = await screen.findByTestId('parser-unavailable');
            expect(notice.textContent).toContain('cannot be parsed');
        });

        it('offers no way to pick an engine', async () => {
            renderSettings();
            await findCard();
            expect(screen.queryByTestId('parser-backend-axilog')).toBeNull();
            expect(screen.queryByTestId('parser-backend-elite-insights')).toBeNull();
        });
    });

    describe('Elite Insights removal notice', () => {
        const withRemoval = (removal: Record<string, unknown>) => ({
            getParserStatus: vi.fn().mockResolvedValue({
                available: true, version: '1.7.1', eliteInsightsRemoval: removal,
            }),
        });

        it('tells a user who had selected Elite Insights that it is gone', async () => {
            renderSettings({}, {}, withRemoval({ wasSelected: true, reclaimedBytes: 94 * 1024 * 1024 }));
            const notice = await screen.findByTestId('elite-insights-removal-notice');
            expect(notice.textContent).toContain('You had selected it');
            expect(notice.textContent).toContain('94 MB');
        });

        it('reassures a user who was already on Axilog that nothing changed', async () => {
            renderSettings({}, {}, withRemoval({ wasSelected: false, reclaimedBytes: 94 * 1024 * 1024 }));
            const notice = await screen.findByTestId('elite-insights-removal-notice');
            expect(notice.textContent).toContain('nothing about your parses changes');
        });

        it('omits the reclaimed size when there was no install to delete', async () => {
            renderSettings({}, {}, withRemoval({ wasSelected: true, reclaimedBytes: 0 }));
            const notice = await screen.findByTestId('elite-insights-removal-notice');
            expect(notice.textContent).not.toContain('freed');
        });

        it('stays quiet for a fresh install with nothing to report', async () => {
            renderSettings();
            await screen.findByTestId('parser-status-card');
            expect(screen.queryByTestId('elite-insights-removal-notice')).toBeNull();
        });

        it('clears the notice on both sides when acknowledged', async () => {
            const api = withRemoval({ wasSelected: true, reclaimedBytes: 0 });
            renderSettings({}, {}, api);
            const notice = await screen.findByTestId('elite-insights-removal-notice');

            fireEvent.click(within(notice).getByText('Got it'));

            await waitFor(() =>
                expect(screen.queryByTestId('elite-insights-removal-notice')).not.toBeInTheDocument());
            expect((window.electronAPI as any).ackEliteInsightsRemovalNotice).toHaveBeenCalled();
        });
    });
});
