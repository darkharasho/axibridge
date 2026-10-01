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

    /* The verdict is rule 5's filled chip, and which status it is, is said by
       the modifier alone: no inline fill, no literal, nothing a theme cannot
       reach. An undecided fight has no status and takes the plain chip. */
    it('draws the outcome as a filled chip of the language, with no inline paint', () => {
        for (const [isWin, modifier] of [[true, 'axi-chip--ok'], [false, 'axi-chip--danger']] as Array<[boolean, string]>) {
            const chip = hero(isWin).querySelector('.fight-hero-outcome') as HTMLElement;
            expect(chip.classList.contains('axi-chip')).toBe(true);
            expect(chip.classList.contains(modifier)).toBe(true);
            expect(chip.getAttribute('style')).toBeNull();
        }
        const none = hero(null).querySelector('.fight-hero-outcome') as HTMLElement;
        expect(Array.from(none.classList).filter((c) => c.startsWith('axi-chip--'))).toEqual([]);
    });

    /* The strength bars are meters: the language draws the trough and the
       edge, the component says only how full each is and in which series. */
    it('draws each strength bar as a meter, tagged with its side, with no gradient', () => {
        const container = hero(true);
        const fills = Array.from(container.querySelectorAll('.fight-hero-fill')) as HTMLElement[];
        expect(fills.map((el) => el.dataset.side)).toEqual(['friendly', 'enemy']);
        for (const el of fills) {
            expect(el.classList.contains('axi-meter__fill')).toBe(true);
            expect(el.style.getPropertyValue('--axi-meter-v')).toMatch(/%$/);
            expect(el.getAttribute('style')).not.toMatch(/gradient|#[0-9a-f]{3,6}/i);
        }
        const tracks = container.querySelectorAll('.fight-hero-track');
        expect(tracks).toHaveLength(2);
        tracks.forEach((t) => expect(t.classList.contains('axi-meter')).toBe(true));
    });

    it('keeps no pastel literals on the KPI tiles', () => {
        const tiles = Array.from(hero(true).querySelectorAll('.fight-hero-kpi'));
        expect(tiles).toHaveLength(4);
        for (const tile of tiles) {
            expect(tile.innerHTML).not.toMatch(/#86efac|#fca5a5/i);
        }
    });
});
