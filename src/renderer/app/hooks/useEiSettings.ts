import { useCallback, useEffect, useState } from 'react';
import type { IEiParserSettings } from '../../global.d';

/**
 * App-level copy of the EI parser settings, for the dashboard Quick Settings card.
 *
 * Mirrors `SettingsView`'s own load/save pair (optimistic local update plus a
 * partial `ei:save-settings` write). The two copies do not drift: SettingsView
 * is conditionally mounted so it refetches on every open, and it calls back
 * through `onEiSettingsSaved` to refresh this one.
 */
export function useEiSettings() {
    const [eiSettings, setEiSettings] = useState<IEiParserSettings | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.electronAPI?.getEiSettings?.().then((settings) => {
            if (!cancelled) setEiSettings(settings);
        }).catch(() => {
            // Leave null — Quick Settings keeps EI-backed rows disabled.
        });
        return () => { cancelled = true; };
    }, []);

    const setEiSetting = useCallback((key: keyof IEiParserSettings, value: boolean) => {
        setEiSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
        window.electronAPI?.saveEiSettings?.({ [key]: value });
    }, []);

    return { eiSettings, setEiSettings, setEiSetting };
}
