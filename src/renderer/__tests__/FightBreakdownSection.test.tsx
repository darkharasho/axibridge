import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FightBreakdownSection } from '../stats/sections/FightBreakdownSection';

describe('FightBreakdownSection', () => {
    it('renders map label inside report link', () => {
        const stats = {
            fightBreakdown: [
                {
                    id: 'fight-1',
                    label: 'Fight 1',
                    permalink: 'https://dps.report/abc',
                    timestamp: 1700000000,
                    mapName: 'Green Alpine Borderlands',
                    duration: '01:00',
                    isWin: true,
                    squadCount: 5,
                    allyCount: 0,
                    enemyCount: 3,
                    teamCounts: { red: 1, green: 1, blue: 1 }
                }
            ]
        };

        render(
            <FightBreakdownSection
                stats={stats}
                fightBreakdownTab="sizes"
                setFightBreakdownTab={() => {}}
                isSectionVisible={() => true}
                isFirstVisibleSection={() => false}
                sectionClass={(_id, base) => base}
            />
        );

        expect(screen.getByText(/Green Alpine Borderlands/i)).toBeInTheDocument();
    });
});
