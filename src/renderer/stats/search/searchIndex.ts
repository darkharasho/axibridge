import { STATS_CATEGORIES, SECTION_TO_CATEGORY } from '../statsTaxonomy';
import {
    OFFENSE_METRICS, DEFENSE_METRICS, DAMAGE_MITIGATION_METRICS,
    SUPPORT_METRICS, HEALING_METRICS,
} from '../statsMetrics';

export type SearchEntryType = 'section' | 'metric' | 'player';

export interface SearchEntry {
    type: SearchEntryType;
    label: string;
    sublabel: string;
    categoryId: string;
    sectionId: string;
    metricId?: string;
    account?: string;
    /** lowercase strings this entry is findable by */
    haystack: string[];
}

export interface SearchIndexInput {
    players?: Array<{ account: string; displayName?: string; profession?: string }>;
    isSectionAllowed?: (sectionId: string) => boolean;
}

const METRIC_HOMES: Array<{ metrics: Array<{ id: string; label: string }>; sectionId: string }> = [
    { metrics: OFFENSE_METRICS, sectionId: 'offense-detailed' },
    { metrics: DEFENSE_METRICS, sectionId: 'defense-detailed' },
    { metrics: DAMAGE_MITIGATION_METRICS, sectionId: 'defense-mitigation' },
    { metrics: SUPPORT_METRICS, sectionId: 'support-detailed' },
    { metrics: HEALING_METRICS, sectionId: 'healing-stats' },
];

export function buildSearchIndex(input: SearchIndexInput = {}): SearchEntry[] {
    const allowed = input.isSectionAllowed ?? (() => true);
    const entries: SearchEntry[] = [];

    for (const category of STATS_CATEGORIES) {
        for (const section of category.sections) {
            if (section.id === 'data-map') continue; // the data map is chrome, not content
            if (!allowed(section.id)) continue;
            entries.push({
                type: 'section',
                label: section.label,
                sublabel: category.label,
                categoryId: category.id,
                sectionId: section.id,
                haystack: [section.label, ...section.keywords, category.label, ...category.keywords]
                    .map((s) => s.toLowerCase()),
            });
        }
    }

    for (const { metrics, sectionId } of METRIC_HOMES) {
        if (!allowed(sectionId)) continue;
        const categoryId = SECTION_TO_CATEGORY.get(sectionId)!;
        const home = STATS_CATEGORIES.find((c) => c.id === categoryId)!
            .sections.find((s) => s.id === sectionId)!;
        for (const metric of metrics) {
            entries.push({
                type: 'metric',
                label: metric.label,
                sublabel: home.label,
                categoryId,
                sectionId,
                metricId: metric.id,
                haystack: [metric.label.toLowerCase(), metric.id.toLowerCase()],
            });
        }
    }

    if (input.players?.length && allowed('player-breakdown')) {
        const categoryId = SECTION_TO_CATEGORY.get('player-breakdown')!;
        const seen = new Set<string>();
        for (const p of input.players) {
            if (!p.account || seen.has(p.account)) continue;
            seen.add(p.account);
            const name = p.displayName || p.account;
            entries.push({
                type: 'player',
                label: name,
                sublabel: [p.account, p.profession].filter(Boolean).join(' · '),
                categoryId,
                sectionId: 'player-breakdown',
                account: p.account,
                haystack: [name.toLowerCase(), p.account.toLowerCase(), (p.profession || '').toLowerCase()].filter(Boolean),
            });
        }
    }

    return entries;
}

const TYPE_ORDER: Record<SearchEntryType, number> = { section: 0, metric: 1, player: 2 };

export function matchSearchIndex(index: SearchEntry[], query: string, limit = 12): SearchEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: Array<{ entry: SearchEntry; score: number }> = [];
    for (const entry of index) {
        let score = Infinity;
        if (entry.label.toLowerCase().startsWith(q)) score = 0;
        else if (entry.haystack.some((h) => h.startsWith(q))) score = 1;
        else if (entry.haystack.some((h) => h.includes(q))) score = 2;
        if (score !== Infinity) scored.push({ entry, score });
    }
    scored.sort((a, b) =>
        a.score - b.score
        || TYPE_ORDER[a.entry.type] - TYPE_ORDER[b.entry.type]
        || a.entry.label.localeCompare(b.entry.label)
    );
    return scored.slice(0, limit).map((s) => s.entry);
}
