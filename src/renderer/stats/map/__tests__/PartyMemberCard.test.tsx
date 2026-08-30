import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyMemberCard } from '../PartyMemberCard';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/** Auto-incrementing so no two fixture members ever share a React key. */
let nextMemberId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextMemberId++,
    name: 'TestPlayer', account: 'Test.1234', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [], downRanges: [], deadRanges: [], ...o,
});

const boonIcons: Record<number, { name: string; icon: string }> = {
    743: { name: 'Aegis', icon: 'aegis.png' },
    725: { name: 'Protection', icon: 'protection.png' },
};
const skillIcons: Record<number, { name: string; icon: string }> = {
    5536: { name: 'Heal by Light', icon: 'heal.png' },
};

describe('PartyMemberCard', () => {
    it('renders member name', () => {
        render(<PartyMemberCard member={mkMember()} timeMs={0} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText('TestPlayer')).toBeTruthy();
    });

    it('renders HP percentage when alive', () => {
        const m = mkMember({ healthPercents: [[0, 72]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText('72%')).toBeTruthy();
    });

    it('renders — for dead member HP', () => {
        const m = mkMember({ deadRanges: [[0, 0]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText('—')).toBeTruthy();
    });

    it('renders active boon icons', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={boonIcons} skillIcons={{}} />);
        const imgs = document.querySelectorAll('img[alt="Aegis"]');
        expect(imgs.length).toBeGreaterThan(0);
    });

    it('renders skill icons for casts in current second', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 1000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        const imgs = document.querySelectorAll('img[alt="Heal by Light"]');
        expect(imgs.length).toBeGreaterThan(0);
    });

    it('does not render skill if cast is outside the 1s window', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 3000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        const imgs = document.querySelectorAll('img[alt="Heal by Light"]');
        expect(imgs.length).toBe(0);
    });

    it('shows commander diamond when isCommander', () => {
        const m = mkMember({ isCommander: true });
        const { container } = render(<PartyMemberCard member={m} timeMs={0} boonIcons={{}} skillIcons={{}} />);
        expect(container.querySelector('[data-cmd-tag]')).toBeTruthy();
    });

    it('shows DOWN status label when member is downed', () => {
        const m = mkMember({ downRanges: [[0, 0]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText(/DOWN/i)).toBeTruthy();
    });

    it('shows DEAD status label when member is dead', () => {
        const m = mkMember({ deadRanges: [[0, 0]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText(/DEAD/i)).toBeTruthy();
    });

    it('calls onFollow with the member account key on click', () => {
        const onFollow = vi.fn();
        const m = mkMember({ account: 'Test.1234' });
        render(<PartyMemberCard member={m} timeMs={0} boonIcons={{}} skillIcons={{}} onFollow={onFollow} />);
        fireEvent.click(screen.getByRole('button'));
        expect(onFollow).toHaveBeenCalledWith('Test.1234');
    });

    it('hides boons and skills for dead member', () => {
        const m = mkMember({
            deadRanges: [[0, 0]],
            boonStates: { 743: [[0, 1]] },
            skillCasts: [{ id: 5536, time: 0, duration: 500 }],
        });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={boonIcons} skillIcons={skillIcons} />);
        expect(document.querySelectorAll('img[alt="Aegis"]').length).toBe(0);
        expect(document.querySelectorAll('img[alt="Heal by Light"]').length).toBe(0);
    });
});

const richBuffIcons: Record<number, { name: string; icon: string }> = {
    743: { name: 'Aegis', icon: 'aegis.png' },
    725: { name: 'Fury', icon: 'fury.png' },
    738: { name: 'Vulnerability', icon: 'vuln.png' },
    727: { name: 'Immobile', icon: 'immob.png' },
};

describe('PartyMemberCard conditions', () => {
    it('renders condition icons alongside boons', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]], 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(document.querySelectorAll('img[alt="Aegis"]').length).toBe(1);
        expect(document.querySelectorAll('img[alt="Vulnerability"]').length).toBe(1);
    });

    it('puts boons before the divider and conditions after it', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]], 738: [[0, 12]] } });
        const { container } = render(<PartyMemberCard member={m} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        const boonCluster = container.querySelector('[data-cluster="boons"]')!;
        const condiCluster = container.querySelector('[data-cluster="condis"]')!;
        expect(boonCluster.querySelector('img[alt="Aegis"]')).not.toBeNull();
        expect(condiCluster.querySelector('img[alt="Vulnerability"]')).not.toBeNull();
        expect(boonCluster.compareDocumentPosition(condiCluster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows the divider only when both clusters have content', () => {
        const onlyBoons = mkMember({ boonStates: { 743: [[0, 1]] } });
        const { container, unmount } = render(<PartyMemberCard member={onlyBoons} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(container.querySelector('[data-buff-divider]')).toBeNull();
        unmount();
        const both = mkMember({ boonStates: { 743: [[0, 1]], 727: [[0, 1]] } });
        const { container: c2 } = render(<PartyMemberCard member={both} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(c2.querySelector('[data-buff-divider]')).not.toBeNull();
    });

    it('shows stack counts on conditions', () => {
        const m = mkMember({ boonStates: { 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(screen.getByText('12')).toBeTruthy();
    });

    it('reserves a stable buff row height with no boons and no conditions', () => {
        const { container } = render(<PartyMemberCard member={mkMember()} timeMs={0} boonIcons={richBuffIcons} skillIcons={{}} />);
        const row = container.querySelector('[data-buff-row]') as HTMLElement;
        expect(row).not.toBeNull();
        expect(row.style.minHeight).toBe('18px');
    });

    it('renders the cast as a bare icon with no name string when not followed', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 1000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        expect(document.querySelectorAll('img[alt="Heal by Light"]').length).toBe(1);
        expect(screen.queryByText('Heal by Light')).toBeNull();
    });

    it('hides conditions for a dead member', () => {
        const m = mkMember({ deadRanges: [[0, 0]], boonStates: { 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(document.querySelectorAll('img[alt="Vulnerability"]').length).toBe(0);
    });
    /** The followed card is the one the user is reading, so it is the only one
     *  that can afford a line of prose. Every other card keeps the bare icon —
     *  50 name lines would double the roster's height. */
    describe('cast name on the followed card', () => {
        const casting = (o = {}) => mkMember({ skillCasts: [{ id: 5536, time: 1000, duration: 500 }], ...o });

        it('spells out the current cast when the card is followed', () => {
            render(<PartyMemberCard member={casting()} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} isFollowed />);
            expect(screen.getByText('Heal by Light')).toBeTruthy();
        });

        it('keeps the name off every card that is not followed', () => {
            const { container } = render(<PartyMemberCard member={casting()} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
        });

        it('shows nothing while the followed player is between casts', () => {
            const m = casting({ skillCasts: [{ id: 5536, time: 9000, duration: 500 }] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} isFollowed />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
        });

        it('shows nothing for a followed player who is dead', () => {
            const m = casting({ deadRanges: [[0, 0]] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} isFollowed />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
        });

        it('shows nothing when the cast id has no entry in the icon catalog', () => {
            const m = casting({ skillCasts: [{ id: 99999, time: 1000, duration: 500 }] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} isFollowed />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
        });

        it('truncates rather than wrapping — the panel cannot widen', () => {
            const { container } = render(<PartyMemberCard member={casting()} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} isFollowed />);
            const line = container.querySelector('[data-cast-name]') as HTMLElement;
            expect(line.style.whiteSpace).toBe('nowrap');
            expect(line.style.textOverflow).toBe('ellipsis');
        });
    });
});
