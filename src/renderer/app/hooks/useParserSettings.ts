import { useCallback, useEffect, useState } from 'react';
import type { IParserSettings } from '../../global.d';

/**
 * App-level copy of the parser settings, for the dashboard Quick Settings card.
 *
 * Mirrors `SettingsView`'s own load/save pair (optimistic local update plus a
 * partial `parser:save-settings` write). The two copies do not drift:
 * SettingsView is conditionally mounted so it refetches on every open, and it
 * calls back through `onParserSettingsSaved` to refresh this one.
 */
export function useParserSettings() {
    const [parserSettings, setParserSettings] = useState<IParserSettings | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.electronAPI?.getParserSettings?.().then((settings) => {
            if (!cancelled) setParserSettings(settings);
        }).catch(() => {
            // Leave null — Quick Settings keeps parser-backed rows disabled.
        });
        return () => { cancelled = true; };
    }, []);

    const setParserSetting = useCallback((key: keyof IParserSettings, value: boolean) => {
        setParserSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
        window.electronAPI?.saveParserSettings?.({ [key]: value });
    }, []);

    return { parserSettings, setParserSettings, setParserSetting };
}
