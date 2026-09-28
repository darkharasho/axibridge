import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS,
    DEFAULT_GLASS, DEFAULT_PARTICLES_ENABLED, DEFAULT_MVP_WEIGHT_PROFILES,
    DEFAULT_STATS_VIEW_SETTINGS, DisruptionMethod, IEmbedStatSettings, IMvpWeightProfiles,
    IStatsViewSettings,
} from '../../global.d';
import { normalizeMvpWeightProfiles } from '../../stats/mvpWeightProfiles';
import { Webhook } from '../../WebhookModal';
import { type ColorPalette } from '../../../shared/webThemes';
import { applyAxiTheme } from '../../../shared/applyAxiTheme';

interface UseSettingsOptions {
    onAutoUpdateSettings?: (supported: boolean, reason: string | null) => void;
}

export function useSettings({ onAutoUpdateSettings }: UseSettingsOptions = {}) {
    const [logDirectory, setLogDirectory] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'embed'>('embed');
    const [embedStatSettings, setEmbedStatSettings] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeightProfiles>(DEFAULT_MVP_WEIGHT_PROFILES);
    const [statsViewSettings, setStatsViewSettings] = useState<IStatsViewSettings>(DEFAULT_STATS_VIEW_SETTINGS);
    const [disruptionMethod, setDisruptionMethod] = useState<DisruptionMethod>(DEFAULT_DISRUPTION_METHOD);
    const [allowLocalJson, setAllowLocalJson] = useState(false);
    const [r2PreciseReplay, setR2PreciseReplay] = useState(false);
    const [r2HostingEnabled, setR2HostingEnabled] = useState(true);
    const [r2SliceEnabled, setR2SliceEnabled] = useState(true);
    const [colorPalette, setColorPalette] = useState<ColorPalette>('electric-blue');
    const [glass, setGlass] = useState(DEFAULT_GLASS);
    const [particlesEnabled, setParticlesEnabled] = useState(DEFAULT_PARTICLES_ENABLED);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
    const [enabledWebhookIds, setEnabledWebhookIds] = useState<string[]>([]);
    const [discordDestinationStatus, setDiscordDestinationStatus] = useState<{ webhookId: string | null; reason: string; message: string } | null>(null);

    // Init-time values consumed by useAppNavigation
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [walkthroughSeen, setWalkthroughSeen] = useState<boolean | null>(null);
    const [shouldOpenWhatsNew, setShouldOpenWhatsNew] = useState(false);
    const [whatsNewVersion, setWhatsNewVersion] = useState('');
    const [whatsNewNotes, setWhatsNewNotes] = useState<string | null>(null);

    const walkthroughSeenMarkedRef = useRef(false);
    const onAutoUpdateSettingsRef = useRef(onAutoUpdateSettings);
    onAutoUpdateSettingsRef.current = onAutoUpdateSettings;

    const handleUpdateSettings = useCallback((updates: any) => {
        window.electronAPI.saveSettings(updates);
    }, []);

    const handleSelectDirectory = useCallback(async () => {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
            setLogDirectory(path);
            window.electronAPI.startWatching(path);
        }
    }, []);

    useEffect(() => {
        const loadSettings = async () => {
            const settings = await window.electronAPI.getSettings();
            if (settings.logDirectory) {
                setLogDirectory(settings.logDirectory);
                window.electronAPI.startWatching(settings.logDirectory);
            }
            if (settings.webhooks) {
                setWebhooks(settings.webhooks.map(w => ({
                    id: w.id,
                    name: w.name,
                    kind: w.kind,
                    url: w.url,
                    relayUrl: w.relayUrl,
                    token: w.token,
                    guildName: w.guildName,
                    channelName: w.channelName,
                    guildId: w.guildId,
                    channelId: w.channelId,
                })));
            }
            if (settings.selectedWebhookId) {
                setSelectedWebhookId(settings.selectedWebhookId);
            }
            if (Array.isArray(settings.enabledWebhookIds)) {
                setEnabledWebhookIds(settings.enabledWebhookIds);
            }
            if (settings.embedStatSettings) {
                setEmbedStatSettings({ ...DEFAULT_EMBED_STATS, ...settings.embedStatSettings });
            }
            if (settings.mvpWeightProfiles || settings.mvpWeights) {
                setMvpWeights(normalizeMvpWeightProfiles(settings.mvpWeightProfiles ?? settings.mvpWeights));
            }
            if (settings.statsViewSettings) {
                setStatsViewSettings({ ...DEFAULT_STATS_VIEW_SETTINGS, ...settings.statsViewSettings });
            }
            if (settings.colorPalette) {
                setColorPalette(settings.colorPalette);
            }
            if (typeof settings.glass === 'boolean') {
                setGlass(settings.glass);
            }
            if (typeof settings.particlesEnabled === 'boolean') {
                setParticlesEnabled(settings.particlesEnabled);
            }
            if (settings.disruptionMethod) {
                setDisruptionMethod(settings.disruptionMethod);
            }
            if (typeof settings.allowLocalJson === 'boolean') {
                setAllowLocalJson(settings.allowLocalJson);
            }
            if (typeof settings.r2HostingEnabled === 'boolean') {
                setR2HostingEnabled(settings.r2HostingEnabled);
            }
            if (typeof settings.r2SliceEnabled === 'boolean') {
                setR2SliceEnabled(settings.r2SliceEnabled);
            }
            if (typeof settings.r2PreciseReplay === 'boolean') {
                setR2PreciseReplay(settings.r2PreciseReplay);
            }
            if (typeof settings.autoUpdateSupported === 'boolean') {
                onAutoUpdateSettingsRef.current?.(settings.autoUpdateSupported, settings.autoUpdateDisabledReason || null);
            }


            const whatsNew = await window.electronAPI.getWhatsNew();
            setWhatsNewVersion(whatsNew.version);
            setWhatsNewNotes(whatsNew.releaseNotes);

            const walkthroughNotSeen = settings.walkthroughSeen !== true;
            if (walkthroughNotSeen) {
                setWalkthroughSeen(false);
                if (!walkthroughSeenMarkedRef.current) {
                    walkthroughSeenMarkedRef.current = true;
                    window.electronAPI?.saveSettings?.({ walkthroughSeen: true });
                }
            } else {
                setWalkthroughSeen(true);
                if (whatsNew.version && whatsNew.version !== whatsNew.lastSeenVersion) {
                    setShouldOpenWhatsNew(true);
                }
            }
            setSettingsLoaded(true);
        };
        loadSettings();
    }, []);

    useEffect(() => {
        if (!window.electronAPI?.onDiscordDestinationStatus) return;
        const cleanup = window.electronAPI.onDiscordDestinationStatus((payload) => {
            setDiscordDestinationStatus(payload);
            // Fix round 1, item 5: main clears the revoked token in the
            // store but the event carries no webhook list, so the renderer's
            // in-memory copy would still hold the live token — opening
            // Manage Webhooks and clicking "Save Changes" would write it
            // straight back and re-arm the dead credential (and re-log it,
            // per item 4). Null it out locally for the affected entry too.
            if (payload.reason === 'revoked' && payload.webhookId) {
                setWebhooks((prev) => prev.map((w) => (w.id === payload.webhookId ? { ...w, token: undefined } : w)));
            }
        });
        return cleanup;
    }, []);

    useEffect(() => {
        // Two data attributes on <html> are the whole appearance API — see
        // applyAxiTheme for why the document element rather than the body.
        applyAxiTheme(document.documentElement, { accent: colorPalette, glass });
        // TRANSITIONAL, removed in the CSS switchover: axi is unconditional from
        // here on, but the stylesheets are still keyed on this class. Glass is
        // inert for now, which is what it already was under axi.
        document.body.classList.add('axi-design');
        // Not part of the design language — app behaviour, so it stays a body class.
        document.body.classList.toggle('particles-disabled', !particlesEnabled);
    }, [colorPalette, glass, particlesEnabled]);

    return useMemo(() => ({
        logDirectory, setLogDirectory,
        notificationType, setNotificationType,
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        allowLocalJson, setAllowLocalJson,
        r2PreciseReplay, setR2PreciseReplay,
        r2HostingEnabled, setR2HostingEnabled,
        r2SliceEnabled, setR2SliceEnabled,
        colorPalette, setColorPalette,
        glass, setGlass,
        particlesEnabled, setParticlesEnabled,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        enabledWebhookIds, setEnabledWebhookIds,
        discordDestinationStatus, setDiscordDestinationStatus,
        handleUpdateSettings,
        handleSelectDirectory,
        settingsLoaded,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        shouldOpenWhatsNew,
    }), [
        logDirectory, notificationType, embedStatSettings, mvpWeights,
        statsViewSettings, disruptionMethod, allowLocalJson, r2PreciseReplay, r2HostingEnabled, r2SliceEnabled, colorPalette, glass, particlesEnabled,
        webhooks, selectedWebhookId, enabledWebhookIds, discordDestinationStatus, handleUpdateSettings, handleSelectDirectory,
        settingsLoaded, whatsNewVersion, whatsNewNotes, walkthroughSeen,
        shouldOpenWhatsNew,
    ]);
}
