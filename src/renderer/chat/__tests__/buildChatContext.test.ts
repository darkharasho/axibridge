// src/renderer/chat/__tests__/buildChatContext.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../buildChatContext';

function makeLog(id: string, fightName: string, isWin: boolean): ILogData {
    return {
        id,
        filePath: `/path/${id}`,
        fightName,
        detailsStatus: 'loaded',
        permalink: '',
        dashboardSummary: { squadCount: 40, squadDeaths: 5, enemyDeaths: 20, isWin, enemyCount: 50 },
    } as any;
}

describe('buildSystemPrompt', () => {
    it('includes analyst persona', () => {
        const p = buildSystemPrompt([]);
        expect(p).toContain('GW2');
        expect(p).toContain('WvW');
    });

    it('includes fight names when loaded', () => {
        const logs = [makeLog('l1', 'Skritt Burglar', true), makeLog('l2', 'Golem', false)];
        const p = buildSystemPrompt(logs);
        expect(p).toContain('Skritt Burglar');
        expect(p).toContain('Golem');
    });

    it('includes WIN/LOSS outcomes', () => {
        const logs = [makeLog('l1', 'Skritt', true), makeLog('l2', 'Golem', false)];
        const p = buildSystemPrompt(logs);
        expect(p).toContain('WIN');
        expect(p).toContain('LOSS');
    });

    it('works with no loaded fights', () => {
        const p = buildSystemPrompt([]);
        expect(p).toContain('No fights loaded');
    });
});
