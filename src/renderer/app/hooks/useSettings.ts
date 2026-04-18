import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS,
    DEFAULT_GLASS_SURFACES, DEFAULT_PARTICLES_ENABLED, DEFAULT_MVP_WEIGHTS,
    DEFAULT_STATS_VIEW_SETTINGS, DisruptionMethod, IEmbedStatSettings, IMvpWeights, normalizeMvpWeights,
    IStatsViewSettings,
} from '../../global.d';
import { Webhook } from '../../WebhookModal';
import { PALETTES, type ColorPalette } from '../../../shared/webThemes';

interface UseSettingsOptions {
    onAutoUpdateSettings?: (supported: boolean, reason: string | null) => void;
}

export function useSettings({ onAutoUpdateSettings }: UseSettingsOptions = {}) {
    const [logDirectory, setLogDirectory] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'embed'>('embed');
    const [embedStatSettings, setEmbedStatSettings] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS);
    const [statsViewSettings, setStatsViewSettings] = useState<IStatsViewSettings>(DEFAULT_STATS_VIEW_SETTINGS);
    const [disruptionMethod, setDisruptionMethod] = useState<DisruptionMethod>(DEFAULT_DISRUPTION_METHOD);
    const [allowLocalJson, setAllowLocalJson] = useState(false);
    const [r2PreciseReplay, setR2PreciseReplay] = useState(false);
    const [colorPalette, setColorPalette] = useState<ColorPalette>('electric-blue');
    const [glassSurfaces, setGlassSurfaces] = useState(DEFAULT_GLASS_SURFACES);
    const [particlesEnabled, setParticlesEnabled] = useState(DEFAULT_PARTICLES_ENABLED);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

    // Init-time values consumed by useAppNavigation
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [walkthroughSeen, setWalkthroughSeen] = useState<boolean | null>(null);
    const [eiAnnouncementDismissed, setEiAnnouncementDismissed] = useState(false);
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
                setWebhooks(settings.webhooks);
            }
            if (settings.selectedWebhookId) {
                setSelectedWebhookId(settings.selectedWebhookId);
            }
            if (settings.embedStatSettings) {
                setEmbedStatSettings({ ...DEFAULT_EMBED_STATS, ...settings.embedStatSettings });
            }
            if (settings.mvpWeights) {
                setMvpWeights(normalizeMvpWeights(settings.mvpWeights));
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
            if (typeof settings.particlesEnabled === 'boolean') {
                setParticlesEnabled(settings.particlesEnabled);
            }
            if (settings.disruptionMethod) {
                setDisruptionMethod(settings.disruptionMethod);
            }
            if (typeof settings.allowLocalJson === 'boolean') {
                setAllowLocalJson(settings.allowLocalJson);
            }
            if (typeof settings.r2PreciseReplay === 'boolean') {
                setR2PreciseReplay(settings.r2PreciseReplay);
            }
            if (typeof settings.autoUpdateSupported === 'boolean') {
                onAutoUpdateSettingsRef.current?.(settings.autoUpdateSupported, settings.autoUpdateDisabledReason || null);
            }

            if (settings.eiAnnouncementDismissed === true) {
                setEiAnnouncementDismissed(true);
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
        const body = document.body;
        for (const id of Object.keys(PALETTES)) body.classList.remove(`palette-${id}`);
        if (colorPalette !== 'electric-blue') {
            body.classList.add(`palette-${colorPalette}`);
        }
        body.classList.toggle('glass-surfaces', glassSurfaces);
        body.classList.toggle('particles-disabled', !particlesEnabled);
    }, [colorPalette, glassSurfaces, particlesEnabled]);

    return useMemo(() => ({
        logDirectory, setLogDirectory,
        notificationType, setNotificationType,
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        allowLocalJson, setAllowLocalJson,
        r2PreciseReplay, setR2PreciseReplay,
        colorPalette, setColorPalette,
        glassSurfaces, setGlassSurfaces,
        particlesEnabled, setParticlesEnabled,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        settingsLoaded,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        eiAnnouncementDismissed, setEiAnnouncementDismissed,
        shouldOpenWhatsNew,
    }), [
        logDirectory, notificationType, embedStatSettings, mvpWeights,
        statsViewSettings, disruptionMethod, allowLocalJson, r2PreciseReplay, colorPalette, glassSurfaces, particlesEnabled,
        webhooks, selectedWebhookId, handleUpdateSettings, handleSelectDirectory,
        settingsLoaded, whatsNewVersion, whatsNewNotes, walkthroughSeen,
        eiAnnouncementDismissed, setEiAnnouncementDismissed,
        shouldOpenWhatsNew,
    ]);
}
