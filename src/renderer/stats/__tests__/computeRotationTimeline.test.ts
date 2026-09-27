import { describe, it, expect } from 'vitest';
import { createRotationTimelineAccumulator } from '../computeRotationTimeline';

describe('createRotationTimelineAccumulator', () => {
    it('starts empty and unrecorded', () => {
        const acc = createRotationTimelineAccumulator();
        expect(acc.fights).toEqual([]);
        expect(acc.recorded).toBe(false);
    });
});
