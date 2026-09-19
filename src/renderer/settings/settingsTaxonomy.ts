import type { ComponentType } from 'react';
import { MessageSquare, Globe, BarChart3, FolderOpen, Settings as SettingsIcon2 } from 'lucide-react';

export type SettingsIcon = ComponentType<{ className?: string }>;

export interface SettingsSectionMeta {
    id: string;
    label: string;
}

export interface SettingsCategory {
    id: string;
    label: string;
    icon: SettingsIcon;
    sections: readonly SettingsSectionMeta[];
}

/**
 * The five Settings categories and their subsections, in rail order.
 *
 * Section `id`s are the DOM ids SettingsView already renders
 * (`data-settings-section` anchors) and the ids every deep link passes to
 * `scrollToSettingsSection`. They are NOT renamed here even where the label
 * is: `embed-summary` stays `embed-summary` so existing callers keep working,
 * while its label becomes "Summary Sections" because "embed" names a Discord
 * API object, not anything a user is deciding about.
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
    {
        id: 'discord', label: 'Discord', icon: MessageSquare,
        sections: [
            { id: 'destinations', label: 'Destinations' },
            { id: 'embed-summary', label: 'Summary Sections' },
            { id: 'embed-top', label: 'Top Stats Lists' },
            { id: 'report-links', label: 'Report Links' },
        ],
    },
    {
        id: 'web-report', label: 'Web Report', icon: Globe,
        sections: [
            { id: 'github-pages', label: 'GitHub Pages' },
            { id: 'r2-storage', label: 'Cloudflare R2' },
            { id: 'parser-settings', label: 'Report Data' },
        ],
    },
    {
        id: 'stats', label: 'Stats', icon: BarChart3,
        sections: [
            { id: 'dashboard-stats', label: 'Top Stats & MVP' },
            { id: 'mvp-weighting', label: 'MVP Weighting' },
            { id: 'boon-uptime-resolution', label: 'Boon Uptime Resolution' },
            { id: 'commander-thresholds', label: 'Commander Thresholds' },
        ],
    },
    {
        id: 'logs', label: 'Logs', icon: FolderOpen,
        sections: [
            { id: 'log-directory', label: 'Log Directory' },
            { id: 'dps-token', label: 'dps.report Token' },
        ],
    },
    {
        id: 'application', label: 'Application', icon: SettingsIcon2,
        sections: [
            { id: 'appearance', label: 'Appearance' },
            { id: 'close-behavior', label: 'Window & Close Behavior' },
            { id: 'export-import', label: 'Export / Import Settings' },
            { id: 'help-updates', label: 'Help & Updates' },
            { id: 'legal', label: 'Legal' },
        ],
    },
];

/** Every section in rail order — what `stepSectionId` walks. */
export const FLATTENED_SECTIONS: readonly SettingsSectionMeta[] =
    SETTINGS_CATEGORIES.flatMap((category) => category.sections);

const CATEGORY_BY_SECTION = new Map<string, string>(
    SETTINGS_CATEGORIES.flatMap((category) => category.sections.map((s) => [s.id, category.id] as const))
);

/** Which category pane a section lives in, or null when the id is unknown. */
export function categoryIdForSection(sectionId: string): string | null {
    return CATEGORY_BY_SECTION.get(sectionId) ?? null;
}

/** A section's display label, or null when the id is unknown. */
export function labelForSection(sectionId: string): string | null {
    return FLATTENED_SECTIONS.find((s) => s.id === sectionId)?.label ?? null;
}

/**
 * The next/previous section in flattened order, crossing category
 * boundaries, or null at either end. Null (rather than clamping to the same
 * id) lets the caller disable its arrow instead of re-scrolling in place.
 */
export function stepSectionId(currentSectionId: string, direction: -1 | 1): string | null {
    const index = FLATTENED_SECTIONS.findIndex((s) => s.id === currentSectionId);
    if (index === -1) return null;
    return FLATTENED_SECTIONS[index + direction]?.id ?? null;
}
