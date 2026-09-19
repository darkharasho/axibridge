import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Fix round 3, item 1 (updated for Task 9): the activation glue (auto-select
// a newly linked bridge entry in the same settings save) now lives in
// `handleSaveWebhooks`, owned by App.tsx and threaded through `ctx`.
// AppLayout's only remaining job is to wire that handler straight onto
// `WebhookModal`'s `onSave` prop. This test observes that call site: it
// stubs `WebhookModal` to capture the `onSave` prop AppLayout actually wires
// up, invokes it directly (as the real modal would on a successful link),
// and asserts the observable outcome — `ctx.handleSaveWebhooks` is called
// with the newly linked entry's webhooks and id. If AppLayout stops wiring
// this prop through, this test goes red.
let capturedOnSave: ((webhooks: any[], selectId?: string) => void) | null = null;

vi.mock('../../WebhookModal', () => ({
    WebhookModal: (props: { onSave: (webhooks: any[], selectId?: string) => void }) => {
        capturedOnSave = props.onSave;
        return null;
    }
}));

// AppLayout always renders FilePickerModal with its own separate `ctx`
// object (a much larger, unrelated prop surface for the file-picker
// dialog). It's irrelevant to this test and gated behind its own
// `filePickerOpen` flag, but stubbing it keeps this test's `ctx` to just
// the props AppLayout itself destructures, per the brief's "minimal
// stubbed ctx" instruction.
vi.mock('../FilePickerModal', () => ({
    FilePickerModal: () => null
}));

import { AppLayout } from '../AppLayout';

const bridgeWebhook = {
    id: 'bridge-1',
    name: 'Vigil Keep › #wvw-reports',
    kind: 'bridge' as const,
    relayUrl: 'https://bot.example.com',
    token: 'axb1.secret'
};

/** Minimal stub covering exactly the fields AppLayout.tsx destructures from `ctx`. */
function makeCtx(overrides: Record<string, unknown> = {}) {
    return {
        shellClassName: '',
        isDev: false,
        axibridgeLogoStyle: {},
        updateAvailable: false,
        updateDownloaded: false,
        updateProgress: null,
        updateStatus: null,
        autoUpdateSupported: true,
        autoUpdateDisabledReason: null,
        view: 'dashboard' as const,
        settingsUpdateCheckRef: { current: false },
        versionClickTimesRef: { current: [] as number[] },
        versionClickTimeoutRef: { current: null },
        setDeveloperSettingsTrigger: vi.fn(),
        appVersion: '0.0.0',
        setView: vi.fn(),
        showTerminal: false,
        setShowTerminal: vi.fn(),
        webUploadState: { uploading: false, stage: null },
        setWebUploadState: vi.fn(),
        webUploadLogEntries: [],
        logsForStats: [],
        mvpWeights: {},
        disruptionMethod: 'count',
        statsViewSettings: {},
        computedStats: null,
        computedSkillUsageData: null,
        aggregationProgress: null,
        aggregationDiagnostics: null,
        axilogCoverage: null,
        handleLogsHealed: vi.fn(),
        statsDataProgress: null,
        setStatsViewSettings: vi.fn(),
        setColorPalette: vi.fn(),
        setGlassSurfaces: vi.fn(),
        setGlassmorphic: vi.fn(),
        particlesEnabled: false,
        setParticlesEnabled: vi.fn(),
        handleWebUpload: vi.fn(),
        selectedWebhookId: null,
        setEmbedStatSettings: vi.fn(),
        setMvpWeights: vi.fn(),
        setDisruptionMethod: vi.fn(),
        developerSettingsTrigger: 0,
        helpUpdatesFocusTrigger: 0,
        handleHelpUpdatesFocusConsumed: vi.fn(),
        parserSettingsFocusTrigger: 0,
        handleParserSettingsFocusConsumed: vi.fn(),
        howToTrigger: 0,
        handleHowToConsumed: vi.fn(),
        setWalkthroughOpen: vi.fn(),
        setWhatsNewOpen: vi.fn(),
        activityPanel: null,
        configurationPanel: null,
        filePickerCtx: {},
        webhookDropdownOpen: false,
        webhookDropdownStyle: null,
        webhookDropdownPortalRef: { current: null },
        webhooks: [],
        handleUpdateSettings: vi.fn(),
        setSelectedWebhookId: vi.fn(),
        setWebhookDropdownOpen: vi.fn(),
        webhookModalOpen: true,
        setWebhookModalOpen: vi.fn(),
        setWebhooks: vi.fn(),
        showUpdateErrorModal: false,
        setShowUpdateErrorModal: vi.fn(),
        updateError: null,
        whatsNewOpen: false,
        handleWhatsNewClose: vi.fn(),
        whatsNewVersion: '',
        whatsNewNotes: null,
        walkthroughOpen: false,
        handleWalkthroughClose: vi.fn(),
        handleWalkthroughLearnMore: vi.fn(),
        isBulkUploadActive: false,
        setAllowLocalJson: vi.fn(),
        setR2PreciseReplay: vi.fn(),
        setR2HostingEnabled: vi.fn(),
        setR2SliceEnabled: vi.fn(),
        refreshR2Status: vi.fn(),
        setParserSettings: vi.fn(),
        parserSettings: null,
        setParserSetting: vi.fn(),
        enabledWebhookIds: [],
        handleSetDestinationEnabled: vi.fn(),
        handleSaveWebhooks: vi.fn(),
        ...overrides
    };
}

describe('AppLayout — bridge activation call site', () => {
    beforeEach(() => {
        capturedOnSave = null;
    });

    it('wires WebhookModal.onSave to the shared handleSaveWebhooks handler', () => {
        const ctx = makeCtx();
        render(<AppLayout ctx={ctx} />);

        expect(capturedOnSave).not.toBeNull();

        act(() => {
            capturedOnSave!([bridgeWebhook], 'bridge-1');
        });

        expect(ctx.handleSaveWebhooks).toHaveBeenCalledWith([bridgeWebhook], 'bridge-1');
    });
});

// Task 11 / Ruling S: `AppLayout.tsx`'s dropdown portal only renders when
// BOTH `webhookDropdownOpen` is true AND `webhookDropdownStyle` is non-null
// (see the `{webhookDropdownOpen && webhookDropdownStyle && createPortal(...)}`
// gate). `renderAppLayout` below defaults `webhookDropdownStyle` to `{}` so
// every test in this describe block only has to opt into `webhookDropdownOpen`
// to get real `role="option"` rows in the DOM.
function renderAppLayout(overrides: Record<string, unknown> = {}) {
    const ctx = makeCtx({ webhookDropdownStyle: {}, ...overrides });
    render(<AppLayout ctx={ctx} />);
    return ctx;
}

describe('destination dropdown multi-select', () => {
    const webhooks = [
        { id: 'w1', name: 'Raid Channel', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/1/x' },
        { id: 'w2', name: 'Guild Channel', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/2/y' }
    ];

    it('turning one destination on leaves the other on', async () => {
        const user = userEvent.setup();
        const handleSetDestinationEnabled = vi.fn();
        renderAppLayout({ webhooks, enabledWebhookIds: ['w1'], handleSetDestinationEnabled, webhookDropdownOpen: true });
        await user.click(screen.getByRole('option', { name: /Guild Channel/i }));
        expect(handleSetDestinationEnabled).toHaveBeenCalledWith('w2', true);
        expect(handleSetDestinationEnabled).toHaveBeenCalledTimes(1);
    });

    it('marks every enabled row as selected', () => {
        renderAppLayout({ webhooks, enabledWebhookIds: ['w1', 'w2'], webhookDropdownOpen: true });
        expect(screen.getByRole('option', { name: /Raid Channel/i })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: /Guild Channel/i })).toHaveAttribute('aria-selected', 'true');
    });

    it('stays open after a toggle so several can be switched in one visit', async () => {
        const user = userEvent.setup();
        const setWebhookDropdownOpen = vi.fn();
        renderAppLayout({ webhooks, enabledWebhookIds: [], setWebhookDropdownOpen, webhookDropdownOpen: true });
        await user.click(screen.getByRole('option', { name: /Raid Channel/i }));
        expect(setWebhookDropdownOpen).not.toHaveBeenCalledWith(false);
    });

    it('Disabled clears every enabled destination and closes', async () => {
        const user = userEvent.setup();
        const handleSetDestinationEnabled = vi.fn();
        const setWebhookDropdownOpen = vi.fn();
        renderAppLayout({ webhooks, enabledWebhookIds: ['w1', 'w2'], handleSetDestinationEnabled, setWebhookDropdownOpen, webhookDropdownOpen: true });
        await user.click(screen.getByRole('option', { name: /^Disabled$/ }));
        expect(handleSetDestinationEnabled).toHaveBeenCalledWith('w1', false);
        expect(handleSetDestinationEnabled).toHaveBeenCalledWith('w2', false);
        expect(setWebhookDropdownOpen).toHaveBeenCalledWith(false);
    });
});
