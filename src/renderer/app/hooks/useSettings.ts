import { useCallback, useEffect, useRef, useState } from 'react';
import {
    DashboardLayout, DEFAULT_DASHBOARD_LAYOUT, DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS,
    DEFAULT_KINETIC_FONT_STYLE, DEFAULT_KINETIC_THEME_VARIANT, DEFAULT_MVP_WEIGHTS,
    DEFAULT_STATS_VIEW_SETTINGS, DisruptionMethod, IEmbedStatSettings, IMvpWeights,
    IStatsViewSettings, KineticFontStyle, KineticThemeVariant,
} from '../../global.d';
import { Webhook } from '../../WebhookModal';
import { DEFAULT_WEB_THEME_ID, KINETIC_DARK_WEB_THEME_ID, KINETIC_SLATE_WEB_THEME_ID } from '../../../shared/webThemes';

interface UseSettingsOptions {
    onAutoUpdateSettings?: (supported: boolean, reason: string | null) => void;
}

const normalizeKineticThemeVariant = (value: unknown): KineticThemeVariant => {
    if (value === 'midnight' || value === 'slate') return value;
    return DEFAULT_KINETIC_THEME_VARIANT;
};

const inferKineticThemeVariantFromThemeId = (themeId: unknown): KineticThemeVariant => {
    if (themeId === KINETIC_DARK_WEB_THEME_ID) return 'midnight';
    if (themeId === KINETIC_SLATE_WEB_THEME_ID) return 'slate';
    return 'light';
};

export function useSettings({ onAutoUpdateSettings }: UseSettingsOptions = {}) {
    const [logDirectory, setLogDirectory] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'image' | 'image-beta' | 'embed'>('image');
    const [embedStatSettings, setEmbedStatSettings] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS);
    const [statsViewSettings, setStatsViewSettings] = useState<IStatsViewSettings>(DEFAULT_STATS_VIEW_SETTINGS);
    const [disruptionMethod, setDisruptionMethod] = useState<DisruptionMethod>(DEFAULT_DISRUPTION_METHOD);
    const [uiTheme, setUiTheme] = useState<'classic' | 'modern' | 'crt' | 'matte' | 'kinetic'>('classic');
    const [kineticFontStyle, setKineticFontStyle] = useState<KineticFontStyle>(DEFAULT_KINETIC_FONT_STYLE);
    const [kineticThemeVariant, setKineticThemeVariant] = useState<KineticThemeVariant>(DEFAULT_KINETIC_THEME_VARIANT);
    const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>(DEFAULT_DASHBOARD_LAYOUT);
    const [, setGithubWebTheme] = useState<string>(DEFAULT_WEB_THEME_ID);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

    // Init-time values consumed by useAppNavigation
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [walkthroughSeen, setWalkthroughSeen] = useState<boolean | null>(null);
    const [shouldOpenWhatsNew, setShouldOpenWhatsNew] = useState(false);
    const [whatsNewVersion, setWhatsNewVersion] = useState('');
    const [whatsNewNotes, setWhatsNewNotes] = useState<string | null>(null);

    // Refs needed by screenshot/embed handlers in App.tsx
    const embedStatSettingsRef = useRef(embedStatSettings);
    const enabledTopListCountRef = useRef(0);

    // Keep embedStatSettingsRef in sync
    useEffect(() => {
        embedStatSettingsRef.current = embedStatSettings;
    }, [embedStatSettings]);

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
            if (settings.discordNotificationType) {
                setNotificationType(settings.discordNotificationType);
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
                setMvpWeights({ ...DEFAULT_MVP_WEIGHTS, ...settings.mvpWeights });
            }
            if (settings.statsViewSettings) {
                setStatsViewSettings({ ...DEFAULT_STATS_VIEW_SETTINGS, ...settings.statsViewSettings });
            }
            if (settings.uiTheme) {
                setUiTheme(settings.uiTheme);
            }
            setKineticFontStyle((settings.kineticFontStyle as KineticFontStyle) || DEFAULT_KINETIC_FONT_STYLE);
            setKineticThemeVariant(
                normalizeKineticThemeVariant(
                    settings.kineticThemeVariant
                    ?? inferKineticThemeVariantFromThemeId(settings.githubWebTheme)
                )
            );
            if (settings.dashboardLayout === 'top' || settings.dashboardLayout === 'side') {
                setDashboardLayout(settings.dashboardLayout);
            } else {
                setDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
            }
            if (typeof settings.githubWebTheme === 'string' && settings.githubWebTheme) {
                setGithubWebTheme(settings.githubWebTheme);
            } else {
                setGithubWebTheme(DEFAULT_WEB_THEME_ID);
            }
            if (settings.disruptionMethod) {
                setDisruptionMethod(settings.disruptionMethod);
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
        if (!settingsLoaded) return;
        window.electronAPI?.saveSettings?.({ dashboardLayout });
    }, [dashboardLayout, settingsLoaded]);

    useEffect(() => {
        const body = document.body;
        body.classList.remove('theme-classic', 'theme-modern', 'theme-crt', 'theme-matte', 'theme-kinetic', 'theme-kinetic-dark', 'theme-kinetic-slate', 'theme-kinetic-font-original');
        if (uiTheme === 'modern') body.classList.add('theme-modern');
        else if (uiTheme === 'crt') body.classList.add('theme-crt');
        else if (uiTheme === 'matte') body.classList.add('theme-matte');
        else if (uiTheme === 'kinetic') {
            body.classList.add('theme-kinetic');
            if (kineticFontStyle === 'original') body.classList.add('theme-kinetic-font-original');
            if (kineticThemeVariant === 'midnight' || kineticThemeVariant === 'slate') body.classList.add('theme-kinetic-dark');
            if (kineticThemeVariant === 'slate') body.classList.add('theme-kinetic-slate');
        }
        else body.classList.add('theme-classic');
    }, [uiTheme, kineticThemeVariant, kineticFontStyle]);

    return {
        logDirectory, setLogDirectory,
        notificationType, setNotificationType,
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        uiTheme, setUiTheme,
        kineticFontStyle, setKineticFontStyle,
        kineticThemeVariant, setKineticThemeVariant,
        dashboardLayout, setDashboardLayout,
        setGithubWebTheme,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        settingsLoaded,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        shouldOpenWhatsNew,
        embedStatSettingsRef,
        enabledTopListCountRef,
    };
}
