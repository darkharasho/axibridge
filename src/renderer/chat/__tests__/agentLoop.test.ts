// src/renderer/chat/__tests__/agentLoop.test.ts
import { describe, it, expect } from 'vitest';
import { agentLoop } from '../agentLoop';
import type { ChatProvider } from '../providers/types';

function makeLog(id: string, fightName: string): ILogData {
    return { id, filePath: `/path/${id}`, fightName, detailsStatus: 'loaded', permalink: '' } as any;
}

const logs: ILogData[] = [makeLog('l1', 'Fight A')];
const details = {
    players: [{
        character_name: 'alpha', account: 'alpha.1234', profession: 'Daredevil', group: 1,
        dpsAll: [{ damage: 100_000, dps: 500, breakbarDamage: 0 }],
        defenses: [{ deadCount: 1, downCount: 1, damageTaken: 10_000 }],
        support: [{ resurrects: 0, condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0 }],
        statsAll: [{ distToCom: 100 }],
        buffUptimes: [{ id: 726, buffData: [{ uptime: 70 }] }],
    }],
};
const getDetails = (id: string) => id === 'l1' ? details : undefined;

function makeProvider(answers: string[]): ChatProvider {
    let i = 0;
    return {
        chatOnce: async () => ({
            message: { role: 'assistant' as const, content: answers[i++ % answers.length] },
        }),
        streamChat: async (_msgs: any, onToken: (t: string, d: boolean) => void) => {
            onToken(answers[i++ % answers.length], true);
        },
    };
}

describe('agentLoop', () => {
    it('fetches sections and calls onToken with synthesized answer', async () => {
        const tokens: string[] = [];
        const toolCalls: string[] = [];
        // First call: synthesis. Second call: evaluator (good).
        const provider = makeProvider([
            'beta.5678 topped damage with 300k.',
            '{"sufficient":true,"missing":[],"grade":"good"}',
        ]);
        await agentLoop(
            'who did the most damage?',
            [],
            logs,
            getDetails,
            (name, status) => { if (status === 'running') toolCalls.push(name); },
            (token, done) => { if (done) tokens.push(token); },
            provider,
        );
        expect(tokens.length).toBe(1);
        expect(toolCalls).toContain('offense');
    });

    it('re-fetches missing sections when evaluator says poor', async () => {
        const toolCalls: string[] = [];
        const provider = makeProvider([
            'Stability was around 70%.',                                          // synthesis 1
            '{"sufficient":false,"missing":["groups"],"grade":"poor"}',          // eval 1
            'G1 had 80% Stability, G2 had 60%.',                                 // synthesis 2
            '{"sufficient":true,"missing":[],"grade":"good"}',                   // eval 2
        ]);
        await agentLoop(
            'how was boon coverage by group?',
            [],
            logs,
            getDetails,
            (name, status) => { if (status === 'running') toolCalls.push(name); },
            () => {},
            provider,
        );
        expect(toolCalls).toContain('groups');
    });

    it('stops after 2 evaluator iterations even if always poor', async () => {
        const provider = makeProvider([
            'Some answer.',
            '{"sufficient":false,"missing":[],"grade":"poor"}',
        ]);
        const tokens: string[] = [];
        await agentLoop('vague question', [], logs, getDetails, () => {}, (t, d) => { if (d) tokens.push(t); }, provider);
        // Should still emit a token (the last synthesis result)
        expect(tokens.length).toBe(1);
    });

    it('short-circuits unavailable questions without fetching sections', async () => {
        const toolCalls: string[] = [];
        const provider = makeProvider(['Rotations are not in arcdps logs.']);
        await agentLoop(
            'what rotation should I use?',
            [],
            logs,
            getDetails,
            (name, status) => { if (status === 'running') toolCalls.push(name); },
            () => {},
            provider,
        );
        expect(toolCalls).toHaveLength(0);
    });

    it('short-circuits context questions without fetching sections', async () => {
        const toolCalls: string[] = [];
        const provider = makeProvider(['Fight A was a WIN.']);
        await agentLoop(
            'did we win?',
            [],
            logs,
            getDetails,
            (name, status) => { if (status === 'running') toolCalls.push(name); },
            () => {},
            provider,
        );
        expect(toolCalls).toHaveLength(0);
    });
});
