import { describe, expect, it } from 'vitest';
import { computeInitialWebhookSelection } from '../stats/utils/reportWebhookSelection';

const hooks = (...ids: string[]) => ids.map((id) => ({ id }));

describe('computeInitialWebhookSelection', () => {
    it('checks everything on first run (no persisted history)', () => {
        expect(computeInitialWebhookSelection(hooks('a', 'b'), undefined, undefined)).toEqual(['a', 'b']);
        expect(computeInitialWebhookSelection(hooks('a', 'b'), null, null)).toEqual(['a', 'b']);
    });

    it('keeps last-checked, leaves last-unchecked off, and checks new hooks', () => {
        // last time: a was checked, b was shown-but-unchecked; c is new since then.
        expect(computeInitialWebhookSelection(hooks('a', 'b', 'c'), ['a'], ['a', 'b'])).toEqual(['a', 'c']);
    });

    it('treats a hook absent from `seen` as new even when the selection is empty', () => {
        expect(computeInitialWebhookSelection(hooks('a'), [], [])).toEqual(['a']);
    });

    it('returns nothing when every enabled hook was explicitly unchecked last time', () => {
        expect(computeInitialWebhookSelection(hooks('a', 'b'), [], ['a', 'b'])).toEqual([]);
    });
});
