import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS,
    DEFAULT_AXI_DESIGN, DEFAULT_GLASS_SURFACES, DEFAULT_GLASSMORPHIC, DEFAULT_PARTICLES_ENABLED, DEFAULT_MVP_WEIGHT_PROFILES,
    DEFAULT_STATS_VIEW_SETTINGS, DisruptionMethod, IEmbedStatSettings, IMvpWeightProfiles,
    IStatsViewSettings,
} from '../../global.d';
import { normalizeMvpWeightProfiles } from '../../stats/mvpWeightProfiles';
import { Webhook } from '../../WebhookModal';
import { PALETTES, type ColorPalette } from '../../../shared/webThemes';

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
    const [glassSurfaces, setGlassSurfaces] = useState(DEFAULT_GLASS_SURFACES);
    const [glassmorphic, setGlassmorphic] = useState(DEFAULT_GLASSMORPHIC);
    const [axiDesign, setAxiDesign] = useState(DEFAULT_AXI_DESIGN);
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
            if (typeof settings.glassSurfaces === 'boolean') {
                setGlassSurfaces(settings.glassSurfaces);
            }
            if (typeof settings.glassmorphic === 'boolean') {
                setGlassmorphic(settings.glassmorphic);
            }
            if (typeof settings.axiDesign === 'boolean') {
                setAxiDesign(settings.axiDesign);
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
        const body = document.body;
        for (const id of Object.keys(PALETTES)) body.classList.remove(`palette-${id}`);
        if (colorPalette !== 'electric-blue') {
            body.classList.add(`palette-${colorPalette}`);
        }
        body.classList.toggle('glass-surfaces', glassSurfaces);
        body.classList.toggle('glassmorphic', glassmorphic);
        body.classList.toggle('axi-design', axiDesign);
        body.classList.toggle('particles-disabled', !particlesEnabled);
    }, [colorPalette, glassSurfaces, glassmorphic, axiDesign, particlesEnabled]);

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
        glassSurfaces, setGlassSurfaces,
        glassmorphic, setGlassmorphic,
        axiDesign, setAxiDesign,
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
        statsViewSettings, disruptionMethod, allowLocalJson, r2PreciseReplay, r2HostingEnabled, r2SliceEnabled, colorPalette, glassSurfaces, glassmorphic, axiDesign, particlesEnabled,
        webhooks, selectedWebhookId, enabledWebhookIds, discordDestinationStatus, handleUpdateSettings, handleSelectDirectory,
        settingsLoaded, whatsNewVersion, whatsNewNotes, walkthroughSeen,
        shouldOpenWhatsNew,
    ]);
}
