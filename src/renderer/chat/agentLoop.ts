// src/renderer/chat/agentLoop.ts
import type { ChatMessage } from '../global';
import { buildSystemPrompt } from './buildChatContext';
import { routeSections, type RouteResult } from './sections/sectionRouter';
import { extractSection, type SectionName } from './sections/sectionCatalog';
import { evaluateResponse } from './sections/evaluator';
import { computeStatsSync } from '../stats/incrementalAggregation';
import { classifyQuestion } from './questionRouter';
import type { ChatProvider } from './providers/types';

const MAX_EVAL_ITERATIONS = 2;

export async function agentLoop(
    userText: string,
    history: ChatMessage[],
    logs: ILogData[],
    getDetails: (id: string) => any,
    onToolCall: (name: string, status: 'running' | 'done') => void,
    onToken: (token: string, done: boolean) => void,
    provider: ChatProvider,
): Promise<void> {
    // Hydrate logs and compute aggregate stats once
    const hydratedLogs = logs
        .filter(l => l.detailsStatus === 'loaded')
        .map(log => {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            return details ? { ...log, details } : log;
        });
    const { stats: computedStats } = computeStatsSync({ logs: hydratedLogs });

    // Re-use only the context/unavailable branches from the old router
    const route = classifyQuestion(userText);
    const historyWithoutSystem = history.filter(m => m.role !== 'system');

    if (route.kind === 'unavailable') {
        const msgs: ChatMessage[] = [
            ...history,
            { role: 'user', content: `[Data not available in arcdps logs: ${route.reason}. Tell the user briefly and suggest what IS available.]\n\n${userText}` },
        ];
        const resp = await provider.chatOnce(msgs, []);
        onToken(resp.message.content ?? '', true);
        return;
    }

    if (route.kind === 'context') {
        const msgs: ChatMessage[] = [
            ...history,
            { role: 'user', content: `[${route.directive}]\n\n${userText}` },
        ];
        const resp = await provider.chatOnce(msgs, []);
        onToken(resp.message.content ?? '', true);
        return;
    }

    // Section-based fetch → synthesize → evaluate loop
    const systemPrompt = buildSystemPrompt(logs);
    const { sections: initialSections, fightIndex }: RouteResult = routeSections(userText);

    const fetchedSections = new Set<SectionName>();
    let sectionContext = '';
    let pendingSections = initialSections;
    let lastAnswer = '';

    for (let iter = 0; iter <= MAX_EVAL_ITERATIONS; iter++) {
        // Fetch any sections not yet loaded
        for (const name of pendingSections) {
            if (fetchedSections.has(name)) continue;
            onToolCall(name, 'running');
            const data = extractSection(name, logs, getDetails, computedStats, fightIndex);
            sectionContext += `\n\n### ${name}\n${data}`;
            fetchedSections.add(name);
            onToolCall(name, 'done');
        }

        // Synthesize
        const userMsgContent = `${userText}\n\n---\n**Fight data:**\n${sectionContext.trim()}`;
        const synthMsgs: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...historyWithoutSystem,
            { role: 'user', content: userMsgContent },
        ];
        const resp = await provider.chatOnce(synthMsgs, []);
        lastAnswer = resp.message.content ?? '';

        // On last iteration always emit and stop
        if (iter === MAX_EVAL_ITERATIONS) break;

        // Evaluate
        const evalResult = await evaluateResponse(
            userText,
            lastAnswer,
            Array.from(fetchedSections),
            provider,
        );

        if (evalResult.grade !== 'poor' || evalResult.missing.length === 0) break;

        // Queue missing sections for next iteration
        pendingSections = evalResult.missing;
    }

    onToken(lastAnswer, true);
}
