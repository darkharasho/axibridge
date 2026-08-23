import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QuickSettingsCard } from '../QuickSettingsCard';
import { QUICK_SETTINGS, type QuickSettingsContext } from '../quickSettings';
import { DEFAULT_STATS_VIEW_SETTINGS, type IEiParserSettings } from '../../global.d';

const EI_SETTINGS: IEiParserSettings = {
    detailledWvW: true,
    computeDamageModifiers: true,
    parsePhases: true,
    skipFailedTries: false,
    anonymous: false,
    customTooShort: 2200,
    saveOutHTML: false,
    parseCombatReplay: true,
    lightTheme: false,
    rawTimelineArrays: false,
    singleThreaded: false,
    memoryLimit: 0,
};

const makeContext = (overrides?: Partial<QuickSettingsContext>): QuickSettingsContext => ({
    eiSettings: { ...EI_SETTINGS },
    setEiSetting: vi.fn(),
    statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS },
    setStatsViewSettings: vi.fn(),
    r2Hosting: null,
    setR2ReplayEnabled: vi.fn(),
    setR2SliceEnabled: vi.fn(),
    ...overrides,
});

describe('QuickSettingsCard', () => {
    it('renders one switch per relevant registry entry', () => {
        const context = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: true, sliceEnabled: true } });
        const relevant = QUICK_SETTINGS.filter((s) => s.isRelevant?.(context) ?? true);
        render(<QuickSettingsCard context={context} />);
        expect(screen.getAllByRole('switch')).toHaveLength(relevant.length);
        for (const setting of relevant) {
            expect(screen.getByRole('switch', { name: setting.label })).toBeInTheDocument();
        }
    });

    it('omits a setting that does not apply rather than showing a dead switch', () => {
        // Nothing is connected to R2, so both hosting rows would be permanently
        // unusable — a dead switch reads as a broken feature, not an absent one.
        render(<QuickSettingsCard context={makeContext()} />);
        expect(screen.queryByRole('switch', { name: /Host Replay on R2/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: /Host Fight Slices on R2/i })).not.toBeInTheDocument();
        expect(screen.getAllByRole('switch')).toHaveLength(QUICK_SETTINGS.length - 2);
    });

    it('shows both hosting rows once R2 is connected', () => {
        const context = makeContext({
            r2Hosting: { credentialsPresent: true, replayEnabled: true, sliceEnabled: false },
        });
        render(<QuickSettingsCard context={context} />);
        expect(screen.getByRole('switch', { name: /Host Replay on R2/i })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('switch', { name: /Host Fight Slices on R2/i })).toHaveAttribute('aria-checked', 'false');
    });

    it('reflects each setting current value as aria-checked', () => {
        const context = makeContext({
            eiSettings: { ...EI_SETTINGS, parseCombatReplay: false },
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, noEgoMode: true },
        });
        render(<QuickSettingsCard context={context} />);
        expect(screen.getByRole('switch', { name: /Combat Replay/i })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('switch', { name: /No Ego/i })).toHaveAttribute('aria-checked', 'true');
    });

    it('writes the negated value through the matching descriptor on click', async () => {
        const user = userEvent.setup();
        const context = makeContext();
        render(<QuickSettingsCard context={context} />);

        await user.click(screen.getByRole('switch', { name: /Combat Replay/i }));
        expect(context.setEiSetting).toHaveBeenCalledWith('parseCombatReplay', false);

        await user.click(screen.getByRole('switch', { name: /No Ego/i }));
        expect(context.setStatsViewSettings).toHaveBeenCalledWith({
            ...DEFAULT_STATS_VIEW_SETTINGS,
            noEgoMode: true,
        });
    });

    it('disables EI-backed rows until EI settings load, leaving others usable', async () => {
        const user = userEvent.setup();
        const context = makeContext({ eiSettings: null });
        render(<QuickSettingsCard context={context} />);

        const combatReplay = screen.getByRole('switch', { name: /Combat Replay/i });
        expect(combatReplay).toBeDisabled();
        await user.click(combatReplay);
        expect(context.setEiSetting).not.toHaveBeenCalled();

        expect(screen.getByRole('switch', { name: /No Ego/i })).not.toBeDisabled();
    });
});
