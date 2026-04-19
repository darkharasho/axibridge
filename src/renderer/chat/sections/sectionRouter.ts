// src/renderer/chat/sections/sectionRouter.ts
import { SECTION_CATALOG, type SectionName } from './sectionCatalog';

export interface RouteResult {
    sections: SectionName[];
    fightIndex?: number;
}

// Broad coaching/improvement questions should surface all key dimensions
const COACHING_PATTERN = /improve|coaching|weakness|struggle|better|focus|performance|overall|review|analysis|recommend/;
const FIGHT_INDEX_PATTERN = /\bfight\s+(\d+)\b/i;

export function routeSections(question: string): RouteResult {
    const q = question.toLowerCase();

    // Extract fight_index (user says "fight 1" → index 0)
    const fiMatch = FIGHT_INDEX_PATTERN.exec(q);
    const fightIndex = fiMatch ? parseInt(fiMatch[1], 10) - 1 : undefined;

    // Score each section
    const scores = SECTION_CATALOG.map(s => ({
        name: s.name,
        score: s.keywords.filter(kw => q.includes(kw)).length,
    }));

    let picked: SectionName[];

    if (COACHING_PATTERN.test(q)) {
        // Broad question — always fetch core dimensions
        const coreSet = new Set<SectionName>(['fight_overview', 'offense', 'defense', 'boons', 'support']);
        // Add any additional high-scoring sections
        scores
            .filter(s => s.score > 0 && !coreSet.has(s.name))
            .sort((a, b) => b.score - a.score)
            .slice(0, 1)
            .forEach(s => coreSet.add(s.name));
        picked = Array.from(coreSet);
    } else {
        // Specific question — take top 3 scoring (non-overview) + fight_overview
        const topN = scores
            .filter(s => s.score > 0 && s.name !== 'fight_overview')
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.name);
        picked = ['fight_overview', ...topN];
    }

    return { sections: picked, fightIndex };
}
