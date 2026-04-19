// src/renderer/chat/sections/__tests__/evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateResponse } from '../evaluator';
import type { ChatProvider } from '../../providers/types';

function mockProvider(content: string): ChatProvider {
    return {
        chatOnce: async () => ({ message: { role: 'assistant', content } }),
        streamChat: async () => {},
    };
}

describe('evaluateResponse', () => {
    it('parses a good JSON response', async () => {
        const result = await evaluateResponse(
            'who did the most damage?',
            'beta.5678 topped damage with 300,000.',
            ['offense'],
            mockProvider('{"sufficient":true,"missing":[],"grade":"good"}'),
        );
        expect(result.sufficient).toBe(true);
        expect(result.grade).toBe('good');
        expect(result.missing).toEqual([]);
    });

    it('parses a poor response requesting missing sections', async () => {
        const result = await evaluateResponse(
            'how was boon coverage by group?',
            'Squad stability averaged 70%.',
            ['boons'],
            mockProvider('{"sufficient":false,"missing":["groups"],"grade":"poor"}'),
        );
        expect(result.sufficient).toBe(false);
        expect(result.grade).toBe('poor');
        expect(result.missing).toContain('groups');
    });

    it('fails open when provider returns invalid JSON', async () => {
        const result = await evaluateResponse(
            'how was our damage?',
            'Some answer.',
            ['offense'],
            mockProvider('I cannot evaluate this right now.'),
        );
        expect(result.sufficient).toBe(true);
        expect(result.grade).toBe('ok');
    });

    it('fails open when provider throws', async () => {
        const badProvider: ChatProvider = {
            chatOnce: async () => { throw new Error('network error'); },
            streamChat: async () => {},
        };
        const result = await evaluateResponse('q', 'a', [], badProvider);
        expect(result.sufficient).toBe(true);
    });
});
