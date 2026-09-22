import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FightHero } from '../share/FightHero';
import type { ReportMeta } from '../../shared/reportTypes';

const meta: ReportMeta = {
    id: 'r1',
    title: 'Fight',
    commanders: ['Harasho'],
    dateStart: '2026-09-19T21:42:00.000Z',
    dateEnd: '2026-09-19T21:46:12.000Z',
    dateLabel: 'Sep 19',
    generatedAt: '2026-09-19T22:00:00.000Z'
};

const statsFor = (isWin: boolean | null) => ({
    fightBreakdown: [{
        fullLabel: 'Eternal Battlegrounds',
        duration: '4m 12s',
        isWin,
        squadCount: 38,
        allyCount: 6,
        enemyCount: 31,
        alliesDown: 52,
        alliesDead: 19,
        enemyDowns: 87,
        enemyDeaths: 41,
        totalOutgoingDamage: 7_670_004,
        totalIncomingDamage: 5_120_000
    }]
});

const hero = (isWin: boolean | null) =>
    render(<FightHero meta={meta} stats={statsFor(isWin)} className="card" />).container;

describe('FightHero', () => {
    it('names the outcome and tags it for the language', () => {
        for (const [isWin, key, text] of [
            [true, 'win', 'Victory'],
            [false, 'loss', 'Defeat'],
            [null, 'none', 'Inconclusive']
        ] as Array<[boolean | null, string, string]>) {
            const chip = hero(isWin).querySelector('.fight-hero-outcome') as HTMLElement;
            expect(chip).toBeTruthy();
            expect(chip.dataset.outcome).toBe(key);
            expect(chip.textContent).toContain(text);
        }
    });

    /* The chip's classic fill is a theme token and its flat fill is handed to
       CSS as a custom property. Both were literal rgba() before, which no
       theme could reach - that is the regression this pins. */
    it('draws the outcome from tokens, not from literal colours', () => {
        const chip = hero(true).querySelector('.fight-hero-outcome') as HTMLElement;
        const style = chip.getAttribute('style') || '';
        expect(style).not.toMatch(/rgba?\(|#[0-9a-f]{3,6}/i);
        expect(chip.style.getPropertyValue('--outcome-fill')).toBe('var(--status-success)');
    });

    /* The gradients stay for every other theme; what the language needs is a
       handle on which side is which, since it cannot reach an inline fill. */
    it('tags each strength bar with its side', () => {
        const container = hero(true);
        const sides = Array.from(container.querySelectorAll('.fight-hero-fill'))
            .map((el) => (el as HTMLElement).dataset.side);
        expect(sides).toEqual(['friendly', 'enemy']);
        expect(container.querySelectorAll('.fight-hero-track')).toHaveLength(2);
    });

    it('keeps no pastel literals on the KPI tiles', () => {
        const tiles = Array.from(hero(true).querySelectorAll('.fight-hero-kpi'));
        expect(tiles).toHaveLength(4);
        for (const tile of tiles) {
            expect(tile.innerHTML).not.toMatch(/#86efac|#fca5a5/i);
        }
    });
});
