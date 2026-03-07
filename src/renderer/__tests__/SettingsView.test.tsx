import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
    SettingsView,
    slugifyHeading,
    validateRepoName,
    formatWeight,
    normalizeKineticThemeVariant,
    getKineticThemeIdForVariant,
    inferKineticThemeVariantFromThemeId,
    isKineticWebThemeId,
    extractHeadingText,
} from '../SettingsView';
import { DEFAULT_EMBED_STATS, DEFAULT_MVP_WEIGHTS } from '../global.d';
import { KINETIC_WEB_THEME_ID, KINETIC_DARK_WEB_THEME_ID, KINETIC_SLATE_WEB_THEME_ID } from '../../shared/webThemes';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeElectronApiMock(settingsOverrides: Record<string, unknown> = {}) {
    return {
        getSettings: vi.fn().mockResolvedValue(settingsOverrides),
        saveSettings: vi.fn(),
        onClearDpsReportCacheProgress: vi.fn(() => () => {}),
        onGithubAuthComplete: vi.fn(() => () => {}),
        onGithubThemeStatus: vi.fn(() => () => {}),
        openExternal: vi.fn(),
        exportSettings: vi.fn().mockResolvedValue({ success: true }),
        selectSettingsFile: vi.fn().mockResolvedValue({ canceled: true }),
        startGithubOAuth: vi.fn().mockResolvedValue({ success: false }),
        getGithubRepos: vi.fn().mockResolvedValue({ success: true, repos: [] }),
        getGithubOrgs: vi.fn().mockResolvedValue({ success: true, orgs: [] }),
        clearDpsReportCache: vi.fn().mockResolvedValue({ success: true, clearedEntries: 0 }),
        ensureGithubTemplate: vi.fn().mockResolvedValue({ success: true }),
    };
}

function renderSettings(
    props: Partial<React.ComponentProps<typeof SettingsView>> = {},
    settingsOverrides: Record<string, unknown> = {},
) {
    const mock = makeElectronApiMock(settingsOverrides);
    window.electronAPI = mock as any;

    const callbacks = {
        onBack: vi.fn(),
        onEmbedStatSettingsSaved: vi.fn(),
        onMvpWeightsSaved: vi.fn(),
        onStatsViewSettingsSaved: vi.fn(),
        onDisruptionMethodSaved: vi.fn(),
        onUiThemeSaved: vi.fn(),
        onKineticFontStyleSaved: vi.fn(),
        onKineticThemeVariantSaved: vi.fn(),
        onDashboardLayoutSaved: vi.fn(),
        onGithubWebThemeSaved: vi.fn(),
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

describe('normalizeKineticThemeVariant', () => {
    it('returns "midnight" for "midnight"', () => {
        expect(normalizeKineticThemeVariant('midnight')).toBe('midnight');
    });

    it('returns "slate" for "slate"', () => {
        expect(normalizeKineticThemeVariant('slate')).toBe('slate');
    });

    it('returns the default (light) for unknown values', () => {
        expect(normalizeKineticThemeVariant('dark')).toBe('light');
        expect(normalizeKineticThemeVariant(null)).toBe('light');
        expect(normalizeKineticThemeVariant(undefined)).toBe('light');
    });
});

describe('getKineticThemeIdForVariant', () => {
    it('maps midnight to the dark theme id', () => {
        expect(getKineticThemeIdForVariant('midnight')).toBe(KINETIC_DARK_WEB_THEME_ID);
    });

    it('maps slate to the slate theme id', () => {
        expect(getKineticThemeIdForVariant('slate')).toBe(KINETIC_SLATE_WEB_THEME_ID);
    });

    it('maps light to the base kinetic theme id', () => {
        expect(getKineticThemeIdForVariant('light')).toBe(KINETIC_WEB_THEME_ID);
    });
});

describe('inferKineticThemeVariantFromThemeId', () => {
    it('maps dark theme id to midnight', () => {
        expect(inferKineticThemeVariantFromThemeId(KINETIC_DARK_WEB_THEME_ID)).toBe('midnight');
    });

    it('maps slate theme id to slate', () => {
        expect(inferKineticThemeVariantFromThemeId(KINETIC_SLATE_WEB_THEME_ID)).toBe('slate');
    });

    it('maps unknown ids to light', () => {
        expect(inferKineticThemeVariantFromThemeId(KINETIC_WEB_THEME_ID)).toBe('light');
        expect(inferKineticThemeVariantFromThemeId('classic')).toBe('light');
    });
});

describe('isKineticWebThemeId', () => {
    it('returns true for all three kinetic theme ids', () => {
        expect(isKineticWebThemeId(KINETIC_WEB_THEME_ID)).toBe(true);
        expect(isKineticWebThemeId(KINETIC_DARK_WEB_THEME_ID)).toBe(true);
        expect(isKineticWebThemeId(KINETIC_SLATE_WEB_THEME_ID)).toBe(true);
    });

    it('returns false for non-kinetic ids', () => {
        expect(isKineticWebThemeId('classic')).toBe(false);
        expect(isKineticWebThemeId('arcane')).toBe(false);
        expect(isKineticWebThemeId(null)).toBe(false);
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

        it('applies saved uiTheme=modern to the UI', async () => {
            const { mock } = renderSettings({}, { uiTheme: 'modern' });
            await waitForLoad(mock);
            await waitFor(() => {
                const modernButton = screen.getByRole('button', { name: 'Modern Slate' });
                expect(modernButton.className).toMatch(/purple/);
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

        it('fires onUiThemeSaved with the new theme', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);
            callbacks.onUiThemeSaved.mockClear();

            fireEvent.click(screen.getByRole('button', { name: 'CRT Hacker' }));

            await waitFor(() => {
                expect(callbacks.onUiThemeSaved).toHaveBeenCalledWith('crt');
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
        it('activates the Matte Slate button when clicked', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: 'Appearance' });

            // Two "Matte Slate" buttons exist: the UI theme pill and the web theme card.
            // The UI theme pill is rendered first in the DOM.
            const [uiThemeBtn] = screen.getAllByRole('button', { name: 'Matte Slate' });
            fireEvent.click(uiThemeBtn);

            expect(screen.getAllByRole('button', { name: 'Matte Slate' })[0].className).toMatch(/cyan/);
        });

        it('shows Kinetic variant sub-options after selecting Kinetic Paper', async () => {
            renderSettings();
            await screen.findByRole('heading', { name: 'Appearance' });

            expect(screen.queryByText('Kinetic Variant')).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Kinetic Paper' }));

            await screen.findByText('Kinetic Variant');
        });

        it('saves dashboard layout immediately (not debounced)', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);
            // Flush the initial auto-save before asserting on synchronous call counts
            await waitForSave(mock.saveSettings);
            mock.saveSettings.mockClear();
            callbacks.onDashboardLayoutSaved.mockClear();

            fireEvent.click(screen.getByRole('button', { name: /Upload Stats: Top/i }));

            // updateDashboardLayout calls saveSettings directly, no debounce
            expect(mock.saveSettings).toHaveBeenCalledWith({ dashboardLayout: 'top' });
            expect(callbacks.onDashboardLayoutSaved).toHaveBeenCalledWith('top');
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
    // MVP Weighting
    // -----------------------------------------------------------------------

    describe('MVP Weighting', () => {
        it('Reset button restores all weights to DEFAULT_MVP_WEIGHTS', async () => {
            const { mock, callbacks } = renderSettings(
                {},
                { mvpWeights: { ...DEFAULT_MVP_WEIGHTS, offensiveDps: 0.05 } },
            );
            await waitForLoad(mock);
            await screen.findByRole('heading', { name: /MVP Weighting/i });

            fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

            await waitFor(() => {
                expect(callbacks.onMvpWeightsSaved).toHaveBeenCalledWith(
                    expect.objectContaining({ offensiveDps: DEFAULT_MVP_WEIGHTS.offensiveDps }),
                );
            }, { timeout: 1000 });
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
});
