import { useEffect, useState } from 'react';
import { DEFAULT_WEB_THEME_ID, KINETIC_DARK_WEB_THEME_ID, KINETIC_WEB_THEME_ID, MATTE_WEB_THEME_ID } from '../shared/webThemes';

const resolveReportsIndexUrl = (settings: any): string | null => {
    const explicitBase = typeof settings?.githubPagesBaseUrl === 'string'
        ? settings.githubPagesBaseUrl.trim()
        : '';
    if (explicitBase) {
        return explicitBase.replace(/\/$/, '');
    }
    const owner = typeof settings?.githubRepoOwner === 'string'
        ? settings.githubRepoOwner.trim()
        : '';
    const repo = typeof settings?.githubRepoName === 'string'
        ? settings.githubRepoName.trim()
        : '';
    if (!owner || !repo) return null;
    return `https://${owner}.github.io/${repo}`;
};

const resolveForcedThemeId = (settings: any): string => {
    const requestedThemeId = typeof settings?.githubWebTheme === 'string' && settings.githubWebTheme.trim()
        ? settings.githubWebTheme.trim()
        : DEFAULT_WEB_THEME_ID;
    const uiTheme = typeof settings?.uiTheme === 'string' ? settings.uiTheme.trim() : '';
    if (uiTheme === 'crt') return 'CRT';
    if (uiTheme === 'matte') return MATTE_WEB_THEME_ID;
    if (uiTheme === 'kinetic') {
        if (requestedThemeId === KINETIC_DARK_WEB_THEME_ID) return KINETIC_DARK_WEB_THEME_ID;
        return KINETIC_WEB_THEME_ID;
    }
    return requestedThemeId;
};

const withThemeParam = (url: string, themeId: string): string => {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set('themeId', themeId);
        return parsed.toString();
    } catch {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}themeId=${encodeURIComponent(themeId)}`;
    }
};

export function FightReportHistoryView() {
    const [indexUrl, setIndexUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                if (!window.electronAPI?.getSettings) {
                    if (mounted) setError('Settings API is unavailable in this build.');
                    return;
                }
                const settings = await window.electronAPI.getSettings();
                if (!mounted) return;
                const url = resolveReportsIndexUrl(settings);
                if (!url) {
                    setError('GitHub Pages is not configured. Set your GitHub repository in Settings first.');
                    setIndexUrl(null);
                    return;
                }
                const forcedThemeId = resolveForcedThemeId(settings);
                if (window.electronAPI?.setWebReportThemeCookie) {
                    const cookieResp = await window.electronAPI.setWebReportThemeCookie({
                        baseUrl: url,
                        themeId: forcedThemeId
                    });
                    if (!cookieResp?.success) {
                        console.warn('[FightReportHistory] Failed to set web report theme cookie:', cookieResp?.error || 'Unknown error');
                    }
                }
                setIndexUrl(withThemeParam(url, forcedThemeId));
                setError(null);
            } catch (err: any) {
                if (!mounted) return;
                setError(err?.message || 'Unable to load GitHub Pages settings.');
                setIndexUrl(null);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    if (error) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            </div>
        );
    }

    if (!indexUrl) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
                Loading report index...
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 -mx-8 -mb-2">
            <iframe
                title="Fight report index"
                src={indexUrl}
                className="w-full h-full border-0"
                referrerPolicy="no-referrer"
            />
        </div>
    );
}
