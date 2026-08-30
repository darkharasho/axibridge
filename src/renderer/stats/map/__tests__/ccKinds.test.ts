import { describe, it, expect } from 'vitest';
import { ccMarkFamily, ccMarkColor, CC_FAMILY_COLOR, CC_UNCLASSIFIED_COLOR } from '../ccKinds';

describe('ccMarkFamily', () => {
    it.each([
        ['knockback_or_pull', 'displacement'],
        ['launch', 'displacement'],
        ['float', 'displacement'],
        ['sink', 'displacement'],
        ['float_or_sink', 'displacement'],
        ['fear', 'fear'],
        ['knockdown', 'lockdown'],
        ['stagger', 'lockdown'],
        ['stun_or_daze', 'lockdown'],
    ])('files %s under %s', (kind, family) => {
        expect(ccMarkFamily([kind])).toBe(family);
    });

    /** The nine kinds above are axilog's whole ControlKind enum. If it grows,
     *  this catches the new spelling falling through to the fallback silently. */
    it('reports no family for a kind it does not know', () => {
        expect(ccMarkFamily(['teleport'])).toBeNull();
    });

    it('reports no family for an unclassified mark', () => {
        expect(ccMarkFamily([])).toBeNull();
    });

    it('lets displacement win over lockdown in the same instant', () => {
        // A squad bomb lands stun and knockback together constantly.
        expect(ccMarkFamily(['stun_or_daze', 'knockback_or_pull'])).toBe('displacement');
        expect(ccMarkFamily(['knockback_or_pull', 'stun_or_daze'])).toBe('displacement');
    });

    it('lets fear win over lockdown but lose to displacement', () => {
        expect(ccMarkFamily(['stun_or_daze', 'fear'])).toBe('fear');
        expect(ccMarkFamily(['fear', 'launch'])).toBe('displacement');
    });

    it('ignores an unknown kind travelling alongside a known one', () => {
        expect(ccMarkFamily(['teleport', 'knockdown'])).toBe('lockdown');
    });
});

describe('ccMarkColor', () => {
    it('gives each family its own colour', () => {
        const colors = Object.values(CC_FAMILY_COLOR);
        expect(new Set(colors).size).toBe(colors.length);
    });

    /** Pre-1.10 fights and every already-published report carry `kinds: []`.
     *  They must keep the amber they have always been drawn in, not become a
     *  fourth colour the legend never explains. */
    it('falls back to the long-standing amber when nothing is classified', () => {
        expect(ccMarkColor([])).toBe('#f59e0b');
        expect(CC_UNCLASSIFIED_COLOR).toBe(CC_FAMILY_COLOR.lockdown);
    });

    it('colours a classified mark by its family', () => {
        expect(ccMarkColor(['knockback_or_pull'])).toBe(CC_FAMILY_COLOR.displacement);
        expect(ccMarkColor(['fear'])).toBe(CC_FAMILY_COLOR.fear);
    });
});
