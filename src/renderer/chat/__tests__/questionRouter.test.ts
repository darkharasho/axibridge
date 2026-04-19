import { describe, it, expect } from 'vitest';
import { classifyQuestion } from '../questionRouter';

describe('context', () => {
    const cases = [
        'did we win?',
        'did we wipe?',
        'what was the outcome of the fight?',
        'how many deaths did we have?',
        'how long was the fight?',
        'what is our K/D?',
        'how many fights do we have loaded?',
    ];
    it.each(cases)('routes "%s" to context', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('context');
    });
});

describe('unavailable', () => {
    const cases = [
        ['what rotation should I use?', 'rotation'],
        ['what build should I play?', 'build'],
        ['how many rallies did we get?', 'rally'],
    ];
    it.each(cases)('routes "%s" to unavailable', (q, _reason) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('unavailable');
    });
});

describe('unknown', () => {
    const cases = [
        'summarize tonight\'s fights',
        'what should we improve on?',
        'give me a general analysis',
        'how was tonight overall?',
        'what can we improve?',
        'who had the most damage?',
        'how was our boon coverage?',
        'who healed the most?',
        'spike damage breakdown',
    ];
    it.each(cases)('routes "%s" to unknown', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('unknown');
    });
});
