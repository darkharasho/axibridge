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

    /** The divider is always in the DOM, only shown when it separates two
     *  populated clusters. Adding and removing it changes the row's item
     *  count, which is enough on its own to tip a wrap. */
    it('hides the divider rather than removing it when a cluster is empty', () => {
        const onlyBoons = mkMember({ boonStates: { 743: [[0, 1]] } });
        const { container, unmount } = render(<PartyMemberCard member={onlyBoons} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        const hidden = container.querySelector('[data-buff-divider]') as HTMLElement;
        expect(hidden).not.toBeNull();
        expect(hidden.style.visibility).toBe('hidden');
        unmount();
        const both = mkMember({ boonStates: { 743: [[0, 1]], 727: [[0, 1]] } });
        const { container: c2 } = render(<PartyMemberCard member={both} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        const shown = c2.querySelector('[data-buff-divider]') as HTMLElement;
        expect(shown.style.visibility).not.toBe('hidden');
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

    it('renders the cast as both an icon and a name', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 1000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        expect(document.querySelectorAll('img[alt="Heal by Light"]').length).toBe(1);
        expect(screen.getByText('Heal by Light')).toBeTruthy();
    });

    it('hides conditions for a dead member', () => {
        const m = mkMember({ deadRanges: [[0, 0]], boonStates: { 738: [[0, 12]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(document.querySelectorAll('img[alt="Vulnerability"]').length).toBe(0);
    });
    /** The cast name rides the sub-label that otherwise shows the spec, so it
     *  costs no height and can therefore go on every card rather than only the
     *  followed one. The class icon still carries the spec while a cast shows. */
    describe('cast name on every card', () => {
        const casting = (o = {}) => mkMember({ eliteSpec: 'Firebrand', skillCasts: [{ id: 5536, time: 1000, duration: 500 }], ...o });

        it('spells out the current cast on a card that is not followed', () => {
            const { container } = render(<PartyMemberCard member={casting()} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(container.querySelector('[data-cast-name]')).not.toBeNull();
            expect(screen.getByText('Heal by Light')).toBeTruthy();
        });

        it('replaces the spec label rather than adding a line', () => {
            render(<PartyMemberCard member={casting()} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(screen.queryByText('Firebrand')).toBeNull();
        });

        it('falls back to the spec between casts', () => {
            const m = casting({ skillCasts: [{ id: 5536, time: 9000, duration: 500 }] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
            expect(screen.getByText('Firebrand')).toBeTruthy();
        });

        it('keeps the status suffix visible instead of a cast for a dead member', () => {
            const m = casting({ deadRanges: [[0, 0]] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
            expect(screen.getByText(/DEAD/i)).toBeTruthy();
        });

        it('keeps the status suffix visible instead of a cast for a downed member', () => {
            const m = casting({ downRanges: [[0, 0]] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
            expect(screen.getByText(/DOWN/i)).toBeTruthy();
        });

        it('falls back to the spec when the cast id has no entry in the icon catalog', () => {
            const m = casting({ skillCasts: [{ id: 99999, time: 1000, duration: 500 }] });
            const { container } = render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            expect(container.querySelector('[data-cast-name]')).toBeNull();
            expect(screen.getByText('Firebrand')).toBeTruthy();
        });

        it('truncates rather than wrapping — the panel cannot widen', () => {
            const { container } = render(<PartyMemberCard member={casting()} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
            const line = container.querySelector('[data-cast-name]') as HTMLElement;
            expect(line.style.whiteSpace).toBe('nowrap');
            expect(line.style.textOverflow).toBe('ellipsis');
        });
    });
});

/** The panel is 216px wide, which fits eight 18px icons on a line. A member
 *  who peaks above that wraps to two lines — and if the row is sized to the
 *  live count, it wraps and unwraps as boons tick, resizing the card and
 *  shunting every card below it several times a second. */
describe('PartyMemberCard reserved buff slots', () => {
    const slots = (c: Element | Document, cluster: string) =>
        c.querySelectorAll(`[data-cluster="${cluster}"] [data-buff-slot]`).length;

    /** Aegis and Protection are boons; Vulnerability and Immobile conditions. */
    const nine = (t: number) => ({
        743: [[0, 1]] as [number, number][],
        725: [[0, 1]] as [number, number][],
        // Two more boons that are only up in the second half of the fight.
        717: [[t, 1]] as [number, number][],
        1122: [[t, 1]] as [number, number][],
    });

    it('holds the same number of slots open at every instant of the fight', () => {
        const m = mkMember({ boonStates: nine(5000) });
        const { container, unmount } = render(<PartyMemberCard member={m} timeMs={0} boonIcons={richBuffIcons} skillIcons={{}} />);
        const atStart = slots(container, 'boons');
        unmount();
        const { container: c2 } = render(<PartyMemberCard member={m} timeMs={9000} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(slots(c2, 'boons')).toBe(atStart);
        expect(atStart).toBe(4);
    });

    it('draws every active buff — nothing is truncated to fit', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]], 725: [[0, 1]], 738: [[0, 3]], 727: [[0, 1]] } });
        const { container } = render(<PartyMemberCard member={m} timeMs={0} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(container.querySelectorAll('[data-buff-slot] img').length).toBe(4);
    });

    it('keeps a dead member\'s slots open so death does not resize the card', () => {
        const states = { 743: [[0, 1]] as [number, number][], 738: [[0, 5]] as [number, number][] };
        const alive = mkMember({ boonStates: states });
        const { container, unmount } = render(<PartyMemberCard member={alive} timeMs={0} boonIcons={richBuffIcons} skillIcons={{}} />);
        const aliveSlots = slots(container, 'boons') + slots(container, 'condis');
        unmount();
        const dead = mkMember({ boonStates: states, deadRanges: [[0, 0]] });
        const { container: c2 } = render(<PartyMemberCard member={dead} timeMs={500} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(slots(c2, 'boons') + slots(c2, 'condis')).toBe(aliveSlots);
        expect(c2.querySelectorAll('[data-buff-slot] img').length).toBe(0);
    });

    it('reserves nothing for a member who never holds a buff', () => {
        const { container } = render(<PartyMemberCard member={mkMember()} timeMs={0} boonIcons={richBuffIcons} skillIcons={{}} />);
        expect(slots(container, 'boons') + slots(container, 'condis')).toBe(0);
    });
});
