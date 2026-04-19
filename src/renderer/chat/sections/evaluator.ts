// src/renderer/chat/sections/evaluator.ts
import type { ChatMessage } from '../../global';
import type { ChatProvider } from '../providers/types';
import { SECTION_CATALOG, type SectionName } from './sectionCatalog';

export interface EvalResult {
    sufficient: boolean;
    missing: SectionName[];
    grade: 'good' | 'ok' | 'poor';
}

const failOpen = (): EvalResult => ({ sufficient: true, missing: [], grade: 'ok' });

export async function evaluateResponse(
    question: string,
    response: string,
    fetchedSections: SectionName[],
    provider: ChatProvider,
): Promise<EvalResult> {
    const unfetched = SECTION_CATALOG
        .filter(s => !fetchedSections.includes(s.name))
        .map(s => `${s.name}: ${s.description}`)
        .join('\n');

    const prompt = `You are evaluating a GW2 WvW analysis response for quality and completeness.

User question: ${question}

Response given: ${response.slice(0, 800)}

Unfetched data sections available:
${unfetched || '(none)'}

Reply with ONLY valid JSON on one line — no markdown, no explanation:
{"sufficient":bool,"missing":[],"grade":"good|ok|poor"}

Grading:
- good: directly answers the question with specific numbers or names
- ok: mostly answers but could cite more specific data
- poor: vague, speculative, or clearly missing key data

If grade is "poor", list up to 2 section names in "missing" that would improve the answer (pick from the unfetched list above).`;

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    try {
        const resp = await provider.chatOnce(messages, []);
        const raw = (resp.message.content ?? '').trim();
        // Extract JSON even if wrapped in markdown
        const jsonMatch = raw.match(/\{[^}]+\}/);
        if (!jsonMatch) return failOpen();
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            sufficient: Boolean(parsed.sufficient),
            missing: Array.isArray(parsed.missing) ? parsed.missing.filter(
                (s: unknown): s is SectionName =>
                    typeof s === 'string' && SECTION_CATALOG.some(c => c.name === s)
            ) : [],
            grade: ['good', 'ok', 'poor'].includes(parsed.grade) ? parsed.grade : 'ok',
        };
    } catch {
        return failOpen();
    }
}
