/**
 * No Ego Mode rollup tests.
 *
 * The full behavioral suite lives in packages/bridge-metrics/src/__tests__/rollup.noego.test.ts
 * where it can import the TypeScript source directly.  This file validates that the
 * re-export in src/web/rollup.ts exposes the noEgoMode field on RollupData so that
 * reportApp can read rollupData.noEgoMode for display gating.
 */
import { describe, expect, it } from 'vitest';
import { buildRollupData } from '../rollup';

describe('rollup.noego – re-export surface', () => {
    it('buildRollupData returns a noEgoMode boolean field', () => {
        const result = buildRollupData([]);
        // noEgoMode must be a boolean (false for empty list) – not undefined
        expect(typeof result.noEgoMode).toBe('boolean');
    });
});
